// api/generate.js — Vercel Serverless Function
// Proxies Gemini text generation so the API key never reaches the client.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { location, qualities } = req.body || {};
  if (!location || typeof location !== 'string' || location.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or invalid location parameter.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  const qualitiesClause = qualities && qualities.trim()
    ? `\nDesired landscape qualities and attributes: "${qualities.trim()}"`
    : '';

  const prompt = `You are an expert landscape botanist and horticulturist with deep knowledge of regional flora.

Location / Region: "${location.trim()}"${qualitiesClause}

Generate exactly 15 plant species that are:
1. Native to or highly appropriate for the given location and climate
2. Consistent with any stated qualities or attributes
3. Regionally authentic — avoid generic or widely-available nursery plants unless they are genuinely the best fit

Divide them into three groups of exactly 5:
- Small plants and ornamental grasses (groundcovers, perennials, ornamental grasses)
- Shrubs and bushes (flowering shrubs, structural hedges, or multi-season shrubs)
- Trees (canopy shade trees or ornamental trees suited to this biome)

Return ONLY a valid JSON object with NO markdown, NO explanation, NO commentary — just raw JSON in this exact schema:
{
  "smallPlantsAndGrasses": [
    {
      "commonName": "string",
      "latinName": "string",
      "waterNeeds": "Low | Moderate | High",
      "sunExposure": "Full Sun | Part Shade | Full Shade | Full Sun to Part Shade",
      "hardinessZones": "e.g. 5–9",
      "matureHeight": "e.g. 12–18 in",
      "growthRate": "Slow | Moderate | Fast",
      "climate": "e.g. Mediterranean",
      "landscapeNote": "One sentence on its standout quality or best landscape use."
    },
    ... (exactly 5)
  ],
  "shrubsAndBushes": [ ... (exactly 5, same fields) ],
  "trees": [ ... (exactly 5, same fields) ]
}

Rules:
- All species must be real, scientifically accurate plants.
- latinName must be correct binomial nomenclature (Genus species or Genus species 'Cultivar').
- commonName should be the most widely recognized English common name.
- Species must genuinely suit the stated location's climate, soil, and rainfall patterns.
- If qualities are specified, each plant should reflect at least one of those qualities.
- Do not repeat any species.`;

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
      const msg = errBody?.error?.message || `Gemini HTTP ${geminiRes.status}`;
      return res.status(502).json({ error: msg });
    }

    const data    = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: 'Empty response from Gemini.' });
    }

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    for (const key of ['smallPlantsAndGrasses', 'shrubsAndBushes', 'trees']) {
      if (!Array.isArray(parsed[key]) || parsed[key].length !== 5) {
        return res.status(502).json({ error: 'Unexpected plant list structure from Gemini.' });
      }
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('generate handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}
