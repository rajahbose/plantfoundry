// api/replace.js — Vercel Serverless Function
// Generates a single replacement plant species for a specific card.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { location, qualities, rowLabel, existing } = req.body || {};

  if (!location || !rowLabel || !Array.isArray(existing)) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  const qualitiesClause = qualities && qualities.trim()
    ? `\nDesired landscape qualities and attributes: "${qualities.trim()}"`
    : '';

  const prompt = `You are an expert landscape botanist and horticulturist with deep regional knowledge.

The user is designing a landscape palette with these parameters:
Location / Region: "${location}"${qualitiesClause}

They want to replace one plant in the "${rowLabel}" category with a fresh alternative.

The following species are ALREADY in the palette — do NOT suggest any of them:
${existing.map(n => `- ${n}`).join('\n')}

Return ONLY a valid JSON object (no markdown, no explanation, no code fences) for a single plant in the "${rowLabel}" category:
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
  "landscapeNote": "One sentence on its standout quality or best landscape use."
}

Rules:
- The plant must be native to or genuinely appropriate for the stated location and climate.
- It must belong naturally in a "${rowLabel}" category (respect the plant type).
- If qualities are stated, the plant should reflect at least one of them.
- IMPORTANT: If the Qualities field names a specific plant species, use that exact species as the replacement. Otherwise choose the best complementary fit.
- latinName must be correct binomial nomenclature (Genus species or Genus species 'Cultivar').
- minTemp: lowest survivable temperature in both °F and °C.
- predominantColors: main foliage, flower, and seasonal colors in plain English.
- Do NOT suggest any species already listed in the exclusion list above.`;

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
            temperature: 0.9,
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
    const plant   = JSON.parse(cleaned);

    if (!plant.commonName || !plant.latinName) {
      return res.status(502).json({ error: 'Gemini returned an incomplete plant object.' });
    }

    return res.status(200).json(plant);

  } catch (err) {
    console.error('replace handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}
