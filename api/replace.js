// api/replace.js — Vercel Serverless Function
// Generates a single replacement plant species for a specific card.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { vibe, category, existing } = req.body || {};

  if (!vibe || !category || !Array.isArray(existing)) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const categoryLabel = {
    trees:  'Trees (canopy or ornamental trees suited to the biome)',
    shrubs: 'Shrubs and bushes (flowering or structural shrubs, hedges)',
    small:  'Small plants and ornamental grasses (groundcovers, perennials, grasses)',
  }[category];

  if (!categoryLabel) {
    return res.status(400).json({ error: 'Invalid category.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  const prompt = `You are an expert landscape botanist and horticulturist.
The user is designing a "${vibe}" landscape and wants to swap out one plant.

Suggest exactly ONE new plant species from this category: ${categoryLabel}.

The following species are ALREADY in the palette — do NOT repeat any of them:
${existing.map(n => `- ${n}`).join('\n')}

Return ONLY a valid JSON object (no markdown, no explanation, no code fences):
{
  "commonName": "string",
  "latinName": "string",
  "waterNeeds": "Low | Moderate | High",
  "sunExposure": "Full Sun | Part Shade | Full Shade | Full Sun to Part Shade",
  "hardinessZones": "e.g. 5–9",
  "matureHeight": "e.g. 4–6 ft",
  "growthRate": "Slow | Moderate | Fast",
  "climate": "e.g. Mediterranean",
  "landscapeNote": "One sentence on landscape use or standout quality."
}

Rules:
- The plant must be appropriate and authentic to the "${vibe}" style/region.
- latinName must be correct binomial nomenclature (Genus species).
- Do NOT suggest any species from the exclusion list above.`;

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
