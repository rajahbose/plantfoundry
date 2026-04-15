// api/generate.js — Vercel Serverless Function
// Proxies Gemini text generation so the API key never reaches the client.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { location, qualities, gridConfig } = req.body || {};

  if (!location || typeof location !== 'string' || location.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or invalid location parameter.' });
  }

  if (!Array.isArray(gridConfig) || gridConfig.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid gridConfig parameter.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  const qualitiesClause = qualities && qualities.trim()
    ? `\nDesired landscape qualities and attributes: "${qualities.trim()}"`
    : '';

  const totalPlants = gridConfig.reduce((s, r) => s + (r.count || 0), 0);

  // Build the grid description for the prompt
  const gridDescription = gridConfig
    .map(row => `  - ${row.label}: exactly ${row.count} plant${row.count !== 1 ? 's' : ''}`)
    .join('\n');

  // Build the expected JSON schema shape
  const schemaRows = gridConfig.map(row => `    {
      "key": "${row.key}",
      "label": "${row.label}",
      "plants": [
        {
          "commonName": "string",
          "latinName": "string",
          "waterNeeds": "Low | Moderate | High",
          "sunExposure": "Full Sun | Part Shade | Full Shade | Full Sun to Part Shade",
          "hardinessZones": "e.g. 5\u20139",
          "matureHeight": "e.g. 4\u20136 ft",
          "growthRate": "Slow | Moderate | Fast",
          "climate": "e.g. Mediterranean",
          "minTemp": "e.g. 20\u00b0F (-7\u00b0C)",
          "predominantColors": "e.g. Silver-green foliage, purple flowers",
          "landscapeNote": "One sentence on standout quality or best landscape use."
        },
        ... (exactly ${row.count})
      ]
    }`).join(',\n');

  const prompt = `You are an expert landscape botanist and horticulturist with deep regional knowledge.

Location / Region: "${location.trim()}"${qualitiesClause}

The user has configured a plant palette grid with the following structure. You MUST follow it exactly:
${gridDescription}
Total plants: ${totalPlants}

Guidelines:
- Each plant must be native to or genuinely appropriate for the stated location and climate.
- If qualities are specified, each plant should reflect at least one of those qualities.
- IMPORTANT: If the user named any specific plant species (by common name or Latin name) in the Location or Qualities fields, those species MUST appear in the palette. Place each named species in the most botanically appropriate row. Fill remaining slots with complementary species.
- All species must be real, scientifically accurate plants.
- latinName must be correct binomial nomenclature (Genus species or Genus species 'Cultivar').
- Do not repeat any species across any row.
- minTemp: lowest survivable temperature in both °F and °C.
- predominantColors: main foliage, flower, and seasonal colors in plain English.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "rows": [
${schemaRows}
  ]
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: errBody?.error?.message || `Gemini HTTP ${geminiRes.status}` });
    }

    const data    = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return res.status(502).json({ error: 'Empty response from Gemini.' });

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (!Array.isArray(parsed.rows) || parsed.rows.length !== gridConfig.length) {
      return res.status(502).json({ error: 'Gemini returned wrong row count — please try again.' });
    }

    for (let i = 0; i < gridConfig.length; i++) {
      const expected = gridConfig[i].count;
      const got      = parsed.rows[i]?.plants?.length;
      if (got !== expected) {
        return res.status(502).json({
          error: `Row "${gridConfig[i].label}" has ${got} plants but expected ${expected}. Please try again.`
        });
      }
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('generate handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}
