/* ====================================================
   PlantFoundry — Application Logic
   app.js
   ==================================================== */

'use strict';

// ──────────────────────────────────────────────────────────
//  CONFIG
// ──────────────────────────────────────────────────────────

const API_KEY    = 'YOUR_GEMINI_API_KEY_HERE'; // Replace with your Gemini API key
const TEXT_MODEL = 'gemini-2.5-flash';
const API_BASE   = 'https://generativelanguage.googleapis.com/v1beta';

// Free image sources — no API key needed, CORS supported
const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const INAT_API = 'https://api.inaturalist.org/v1/taxa';

const CATEGORY_KEYS = {
  small:  'smallPlantsAndGrasses',
  shrubs: 'shrubsAndBushes',
  trees:  'trees',
};

const CATEGORY_EMOJI = {
  small:  '🌾',
  shrubs: '🌿',
  trees:  '🌳',
};

// ──────────────────────────────────────────────────────────
//  STATE
// ──────────────────────────────────────────────────────────

let appState = 'IDLE'; // IDLE | GENERATING_TEXT | FETCHING_IMAGES | COMPLETE

// ──────────────────────────────────────────────────────────
//  DOM REFS
// ──────────────────────────────────────────────────────────

const el = {
  vibeInput:       document.getElementById('vibe-input'),
  generateBtn:     document.getElementById('generate-btn'),
  generateBtnText: document.querySelector('.generate-btn-text'),
  generateBtnIcon: document.querySelector('.generate-btn-icon'),

  progressWrap:    document.getElementById('progress-bar-wrap'),
  progressBar:     document.getElementById('progress-bar'),
  statusLabel:     document.getElementById('status-label'),
  gridShell:       document.getElementById('grid-shell'),

  rowSmall:        document.getElementById('row-small'),
  rowShrubs:       document.getElementById('row-shrubs'),
  rowTrees:        document.getElementById('row-trees'),

  toastContainer:  document.getElementById('toast-container'),
};

el.vibeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') el.generateBtn.click();
});

// ──────────────────────────────────────────────────────────
//  PROGRESS HELPERS
// ──────────────────────────────────────────────────────────

function setProgress(pct, statusText = '') {
  el.progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  el.statusLabel.textContent = statusText;
}

function showProgress(show) {
  el.progressWrap.hidden = !show;
}

// ──────────────────────────────────────────────────────────
//  TOAST
// ──────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 4500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.25s ease forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ──────────────────────────────────────────────────────────
//  CARD BUILDING
// ──────────────────────────────────────────────────────────

function createPlantCard(plant, rowKey, index) {
  const card = document.createElement('article');
  card.className = `plant-card enter`;
  card.style.animationDelay = `${index * 0.06}s`;
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${plant.commonName}, ${plant.latinName}`);
  card.id = `card-${rowKey}-${index}`;

  card.innerHTML = `
    <div class="card-inner">

      <!-- FRONT: photo + name overlay -->
      <div class="card-front">
        <div class="card-img-wrap">
          <div class="card-skeleton" id="skeleton-${rowKey}-${index}" aria-hidden="true"></div>
          <img
            class="card-img"
            id="img-${rowKey}-${index}"
            alt="${escapeHtml(plant.commonName)} botanical photograph"
            loading="lazy"
            crossorigin="anonymous"
          />
        </div>
        <div class="card-overlay">
          <h2 class="card-common-name">${escapeHtml(plant.commonName)}</h2>
          <p class="card-latin-name">${escapeHtml(plant.latinName)}</p>
        </div>
      </div>

      <!-- BACK: plant specs -->
      <div class="card-back" aria-hidden="true">
        <div class="card-back-header">
          <div class="card-back-name">${escapeHtml(plant.commonName)}</div>
          <div class="card-back-latin">${escapeHtml(plant.latinName)}</div>
        </div>
        <div class="card-back-specs">
          <div class="spec-item">
            <span class="spec-label">Water</span>
            <span class="spec-value">${escapeHtml(plant.waterNeeds || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Sun</span>
            <span class="spec-value">${escapeHtml(plant.sunExposure || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Zones</span>
            <span class="spec-value">${escapeHtml(plant.hardinessZones || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Height</span>
            <span class="spec-value">${escapeHtml(plant.matureHeight || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Growth</span>
            <span class="spec-value">${escapeHtml(plant.growthRate || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Climate</span>
            <span class="spec-value">${escapeHtml(plant.climate || '—')}</span>
          </div>
        </div>
        ${plant.landscapeNote ? `<p class="card-back-desc">${escapeHtml(plant.landscapeNote)}</p>` : ''}
        <p class="card-back-hint">Click to flip back</p>
      </div>

    </div>
  `;
  return card;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Injects an image URL into the card, or shows fallback emoji.
 * @param {string}      rowKey
 * @param {number}      index
 * @param {string|null} imageUrl  A direct URL string, or null for fallback
 */
function injectCardImage(rowKey, index, imageUrl) {
  const skeleton = document.getElementById(`skeleton-${rowKey}-${index}`);
  const img      = document.getElementById(`img-${rowKey}-${index}`);
  const card     = document.getElementById(`card-${rowKey}-${index}`);

  if (!skeleton || !img || !card) return;

  if (!imageUrl) {
    skeleton.classList.add('hidden');
    const fail = document.createElement('div');
    fail.className = 'card-img-fail';
    fail.setAttribute('aria-hidden', 'true');
    fail.textContent = CATEGORY_EMOJI[rowKey] || '🌿';
    card.querySelector('.card-img-wrap').appendChild(fail);
    return;
  }

  img.src = imageUrl;
  img.onload = () => {
    img.classList.add('loaded');
    skeleton.classList.add('hidden');
  };
  img.onerror = () => {
    // Show fallback if image URL fails to load
    injectCardImage(rowKey, index, null);
  };
}

// ──────────────────────────────────────────────────────────
//  GEMINI TEXT API
// ──────────────────────────────────────────────────────────

async function fetchPlantList(vibe) {
  const prompt = `You are an expert landscape botanist and horticulturist.
Given the following landscape style, region, or vibe: "${vibe}"

Generate exactly 15 plant species perfectly suited for this landscape.
Divide them into three groups of 5:
1. Small plants and ornamental grasses (groundcovers, perennials, grasses)
2. Shrubs and bushes (flowering or structural shrubs, hedges)
3. Trees (canopy or ornamental trees suited to this biome)

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
      "landscapeNote": "One sentence on landscape use or standout quality."
    },
    ... (exactly 5)
  ],
  "shrubsAndBushes": [ ... (exactly 5, same fields) ],
  "trees": [ ... (exactly 5, same fields) ]
}

Rules:
- All species must be real, scientifically accurate plants.
- latinName must be the correct binomial nomenclature (Genus species).
- commonName should be the most widely used English common name.
- Plants must be appropriate and authentic to the stated landscape style/region.
- Do not repeat any species.`;

  const response = await fetch(
    `${API_BASE}/models/${TEXT_MODEL}:generateContent?key=${API_KEY}`,
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

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `HTTP ${response.status}`);
  }

  const data    = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini.');

  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const parsed  = JSON.parse(cleaned);

  for (const key of Object.values(CATEGORY_KEYS)) {
    if (!Array.isArray(parsed[key]) || parsed[key].length !== 5) {
      throw new Error(`Unexpected plant list structure.`);
    }
  }

  return parsed;
}

// ──────────────────────────────────────────────────────────
//  IMAGE FETCHING — Wikipedia + iNaturalist fallback
// ──────────────────────────────────────────────────────────

/**
 * Try Wikipedia REST API first (best quality, exact species match).
 * Returns an image URL string or null.
 */
async function fetchFromWikipedia(plant) {
  try {
    // Wikipedia pages for plant species are typically under the latin name
    const url = `${WIKI_API}/${encodeURIComponent(plant.latinName)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    // Prefer originalimage for higher resolution, fall back to thumbnail
    return data.originalimage?.source || data.thumbnail?.source || null;
  } catch {
    return null;
  }
}

/**
 * Fallback: iNaturalist taxa API — searches by latin name, returns a photo URL.
 * Returns an image URL string or null.
 */
async function fetchFromINaturalist(plant) {
  try {
    const url = `${INAT_API}?q=${encodeURIComponent(plant.latinName)}&limit=1&locale=en`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const taxon = data.results?.[0];
    return (
      taxon?.default_photo?.medium_url ||
      taxon?.default_photo?.url ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Fetch the best available image URL for a plant.
 * Tries Wikipedia first, then iNaturalist, then returns null (emoji fallback).
 */
async function fetchPlantImageUrl(plant) {
  const wikiUrl = await fetchFromWikipedia(plant);
  if (wikiUrl) return wikiUrl;
  const inatUrl = await fetchFromINaturalist(plant);
  return inatUrl || null;
}

// ──────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────

const delay = (ms) => new Promise(r => setTimeout(r, ms));

function renderSkeletonCards(plantList) {
  const rowMap = {
    small:  { container: el.rowSmall,  plants: plantList[CATEGORY_KEYS.small]  },
    shrubs: { container: el.rowShrubs, plants: plantList[CATEGORY_KEYS.shrubs] },
    trees:  { container: el.rowTrees,  plants: plantList[CATEGORY_KEYS.trees]  },
  };
  for (const [key, { container, plants }] of Object.entries(rowMap)) {
    container.innerHTML = '';
    plants.forEach((plant, idx) => container.appendChild(createPlantCard(plant, key, idx)));
  }
}

function clearGrid() {
  el.rowSmall.innerHTML = el.rowShrubs.innerHTML = el.rowTrees.innerHTML = '';
}

function setGeneratingUI(isGenerating) {
  el.generateBtn.disabled = isGenerating;
  el.vibeInput.disabled   = isGenerating;
  el.generateBtnText.textContent = isGenerating ? 'Generating' : 'Generate';
  el.generateBtnIcon.textContent = isGenerating ? '⦿' : '↗';
  el.generateBtn.classList.toggle('loading', isGenerating);
}

// ──────────────────────────────────────────────────────────
//  MAIN GENERATE FLOW
// ──────────────────────────────────────────────────────────

async function generate() {
  const vibe = el.vibeInput.value.trim();

  if (!vibe) {
    el.vibeInput.focus();
    el.vibeInput.classList.add('shake');
    el.vibeInput.addEventListener('animationend', () => el.vibeInput.classList.remove('shake'), { once: true });
    return;
  }

  if (appState !== 'IDLE' && appState !== 'COMPLETE') return;

  appState = 'GENERATING_TEXT';
  setGeneratingUI(true);
  clearGrid();
  el.gridShell.hidden  = true;
  showProgress(true);
  setProgress(5, 'Consulting Gemini…');

  try {
    // ── Phase 1: Plant List (Gemini text) ────────────────
    setProgress(10, `Building palette for "${vibe}"…`);
    const plantList = await fetchPlantList(vibe);
    setProgress(22, 'Populating cards…');

    renderSkeletonCards(plantList);
    el.gridShell.hidden = false;

    // ── Phase 2: Images (Wikipedia + iNaturalist) ────────
    // All 15 fired in parallel — they're just simple GET requests
    appState = 'FETCHING_IMAGES';
    const rows = [
      { key: 'small',  plants: plantList[CATEGORY_KEYS.small]  },
      { key: 'shrubs', plants: plantList[CATEGORY_KEYS.shrubs] },
      { key: 'trees',  plants: plantList[CATEGORY_KEYS.trees]  },
    ];

    let done = 0;
    const allImageTasks = rows.flatMap(row =>
      row.plants.map(async (plant, idx) => {
        const imageUrl = await fetchPlantImageUrl(plant);
        done++;
        setProgress(22 + Math.round((done / 15) * 74), `Loading images… ${done} / 15`);
        injectCardImage(row.key, idx, imageUrl);
      })
    );

    await Promise.all(allImageTasks);

    // ── Complete ─────────────────────────────────────────
    appState = 'COMPLETE';
    setProgress(100, `Done — ${vibe}`);
    setGeneratingUI(false);

    setTimeout(() => {
      showProgress(false);
      setProgress(0, '');
    }, 2000);

  } catch (err) {
    console.error(err);
    appState = 'IDLE';
    setGeneratingUI(false);
    showProgress(false);
    setProgress(0, '');
    showToast(err.message || 'Something went wrong. Please try again.', 'error', 7000);
  }
}

// ──────────────────────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────────────────────

el.generateBtn.addEventListener('click', generate);

// Card flip — delegate clicks on the grid shell
el.gridShell.addEventListener('click', (e) => {
  const card = e.target.closest('.plant-card');
  if (!card) return;
  card.classList.toggle('flipped');
  // Update aria for accessibility
  const isFlipped = card.classList.contains('flipped');
  card.setAttribute('aria-pressed', String(isFlipped));
  const back = card.querySelector('.card-back');
  if (back) back.setAttribute('aria-hidden', String(!isFlipped));
});
