/* ====================================================
   PlantFoundry — Application Logic
   app.js
   ==================================================== */

'use strict';

// ──────────────────────────────────────────────────────────
//  CONFIG
// ──────────────────────────────────────────────────────────

// Image sources — free, no key needed, CORS supported
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

let appState  = 'IDLE'; // IDLE | GENERATING_TEXT | FETCHING_IMAGES | COMPLETE
let viewMode  = 'grid'; // 'grid' | 'table'
let currentVibe    = { location: '', qualities: '' };
let currentPalette = {}; // { trees: [], shrubs: [], small: [] }

// ──────────────────────────────────────────────────────────
//  DOM REFS
// ──────────────────────────────────────────────────────────

const el = {
  locationInput:   document.getElementById('location-input'),
  qualitiesInput:  document.getElementById('qualities-input'),
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

  tableShell:      document.getElementById('table-shell'),
  tableBody:       document.getElementById('plant-table-body'),

  btnGridView:     document.getElementById('btn-grid-view'),
  btnTableView:    document.getElementById('btn-table-view'),

  toastContainer:  document.getElementById('toast-container'),
};

// Enter key submits from either field
const submitOnEnter = (e) => { if (e.key === 'Enter') el.generateBtn.click(); };
el.locationInput.addEventListener('keydown', submitOnEnter);
el.qualitiesInput.addEventListener('keydown', submitOnEnter);

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

      <!-- FRONT: photo + name footer -->
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
        <div class="card-footer">
          <h2 class="card-common-name">${escapeHtml(plant.commonName)}</h2>
          <p class="card-latin-name">${escapeHtml(plant.latinName)}</p>
        </div>
        <!-- Refresh button: swap this species -->
        <button
          class="card-refresh-btn"
          aria-label="Replace ${escapeHtml(plant.commonName)} with an alternative species"
          title="Replace species"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12.5 2.5A6 6 0 1 0 13 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="12.5,0.5 12.5,2.5 10.5,2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
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
 * Injects an image URL into the card AND the matching table thumbnail.
 * @param {string}      rowKey
 * @param {number}      index
 * @param {string|null} imageUrl
 */
function injectCardImage(rowKey, index, imageUrl) {
  // ── Card front image ──
  const skeleton = document.getElementById(`skeleton-${rowKey}-${index}`);
  const img      = document.getElementById(`img-${rowKey}-${index}`);
  const card     = document.getElementById(`card-${rowKey}-${index}`);

  if (skeleton && img && card) {
    if (!imageUrl) {
      skeleton.classList.add('hidden');
      const fail = document.createElement('div');
      fail.className = 'card-img-fail';
      fail.setAttribute('aria-hidden', 'true');
      fail.textContent = CATEGORY_EMOJI[rowKey] || '🌿';
      card.querySelector('.card-img-wrap').appendChild(fail);
    } else {
      img.src = imageUrl;
      img.onload = () => {
        img.classList.add('loaded');
        skeleton.classList.add('hidden');
      };
      img.onerror = () => injectCardImage(rowKey, index, null);
    }
  }

  // ── Table thumbnail ──
  const thumbSkeleton = document.getElementById(`tsk-${rowKey}-${index}`);
  const thumb         = document.getElementById(`tth-${rowKey}-${index}`);
  if (thumb) {
    if (imageUrl) {
      thumb.src = imageUrl;
      thumb.onload = () => {
        thumb.classList.add('loaded');
        if (thumbSkeleton) thumbSkeleton.remove();
      };
      thumb.onerror = () => { if (thumbSkeleton) thumbSkeleton.remove(); };
    } else {
      if (thumbSkeleton) thumbSkeleton.remove();
    }
  }
}

// ──────────────────────────────────────────────────────────
//  PLANT LIST — via /api/generate (Vercel serverless proxy)
// ──────────────────────────────────────────────────────────

async function fetchPlantList(location, qualities) {
  const response = await fetch('/api/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ location, qualities }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || `Server error ${response.status}`);
  }

  return data;
}


// ──────────────────────────────────────────────────────────
//  IMAGE FETCHING — 5-source waterfall
//  Wikipedia (latin) → Wikipedia (common) →
//  Wikimedia Commons → iNaturalist → GBIF
// ──────────────────────────────────────────────────────────

/**
 * Source 1 & 2: Wikipedia REST API.
 * Tries the latin name first, then the common name.
 */
async function fetchFromWikipedia(plant) {
  const attempts = [plant.latinName, plant.commonName];
  for (const title of attempts) {
    try {
      const url = `${WIKI_API}/${encodeURIComponent(title)}`;
      const res  = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const img  = data.originalimage?.source || data.thumbnail?.source;
      if (img) return img;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Source 3: Wikimedia Commons image search.
 * Searches for a freely-licensed photo matching the latin name.
 */
async function fetchFromWikimediaCommons(plant) {
  try {
    const url = [
      'https://commons.wikimedia.org/w/api.php',
      '?action=query',
      '&generator=search',
      `&gsrsearch=${encodeURIComponent(plant.latinName)}`,
      '&gsrnamespace=6',   // File namespace only
      '&gsrlimit=3',
      '&prop=imageinfo',
      '&iiprop=url',
      '&iiurlwidth=800',
      '&format=json',
      '&origin=*',
    ].join('');
    const res  = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data  = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    // Pick first result that has an image URL
    for (const page of Object.values(pages)) {
      const src = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
      if (src) return src;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Source 4: iNaturalist taxa API.
 */
async function fetchFromINaturalist(plant) {
  try {
    const url = `${INAT_API}?q=${encodeURIComponent(plant.latinName)}&limit=1&locale=en`;
    const res  = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data  = await res.json();
    const taxon = data.results?.[0];
    return taxon?.default_photo?.medium_url || taxon?.default_photo?.url || null;
  } catch {
    return null;
  }
}

/**
 * Source 5: GBIF (Global Biodiversity Information Facility).
 * Two-step: get taxon key → find an occurrence with a photo.
 */
async function fetchFromGBIF(plant) {
  try {
    // Step 1 — resolve species key
    const speciesRes = await fetch(
      `https://api.gbif.org/v1/species?name=${encodeURIComponent(plant.latinName)}&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    if (!speciesRes.ok) return null;
    const speciesData = await speciesRes.json();
    const key = speciesData.results?.[0]?.key ?? speciesData.results?.[0]?.nubKey;
    if (!key) return null;

    // Step 2 — find an occurrence with a StillImage
    const occRes = await fetch(
      `https://api.gbif.org/v1/occurrence/search?taxon_key=${key}&mediaType=StillImage&limit=5`,
      { headers: { Accept: 'application/json' } }
    );
    if (!occRes.ok) return null;
    const occData = await occRes.json();
    for (const occ of occData.results ?? []) {
      const media = occ.media?.find(m => m.type === 'StillImage' && m.identifier);
      if (media?.identifier) return media.identifier;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Main image resolver — walks the waterfall until a URL is found.
 * Wikipedia (latin) → Wikipedia (common) → Wikimedia Commons →
 * iNaturalist → GBIF → null (emoji fallback)
 */
async function fetchPlantImageUrl(plant) {
  const sources = [
    () => fetchFromWikipedia(plant),
    () => fetchFromWikimediaCommons(plant),
    () => fetchFromINaturalist(plant),
    () => fetchFromGBIF(plant),
  ];
  for (const source of sources) {
    const url = await source();
    if (url) return url;
  }
  return null;
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
  el.tableBody.innerHTML = '';
}

// ──────────────────────────────────────────────────────────
//  TABLE RENDERING
// ──────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  trees:  'Trees',
  shrubs: 'Shrubs & Bushes',
  small:  'Small Plants & Grasses',
};

function createTableRow(plant, rowKey, idx) {
  const tr = document.createElement('tr');
  tr.className = 'plant-row';
  tr.id = `trow-${rowKey}-${idx}`;
  tr.innerHTML = `
    <td class="td-thumb">
      <div class="td-thumb-wrap">
        <div class="table-thumb-skeleton" id="tsk-${rowKey}-${idx}"></div>
        <img class="table-thumb" id="tth-${rowKey}-${idx}"
             alt="${escapeHtml(plant.commonName)} thumbnail"
             crossorigin="anonymous" />
      </div>
    </td>
    <td class="td-name"><span class="t-common">${escapeHtml(plant.commonName)}</span></td>
    <td class="td-latin">${escapeHtml(plant.latinName)}</td>
    <td class="td-cat">${escapeHtml(CATEGORY_LABELS[rowKey] || '')}</td>
    <td class="td-spec">${escapeHtml(plant.waterNeeds     || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.sunExposure    || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.hardinessZones || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.matureHeight   || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.growthRate     || '—')}</td>
  `;
  return tr;
}

function renderTableRows(plantList) {
  el.tableBody.innerHTML = '';
  const groups = [
    { key: 'trees',  plants: plantList[CATEGORY_KEYS.trees]  },
    { key: 'shrubs', plants: plantList[CATEGORY_KEYS.shrubs] },
    { key: 'small',  plants: plantList[CATEGORY_KEYS.small]  },
  ];
  for (const { key, plants } of groups) {
    const sep = document.createElement('tr');
    sep.className = 'table-group-row';
    sep.innerHTML = `<td colspan="9">${CATEGORY_LABELS[key]}</td>`;
    el.tableBody.appendChild(sep);
    plants.forEach((plant, idx) => el.tableBody.appendChild(createTableRow(plant, key, idx)));
  }
}

// ──────────────────────────────────────────────────────────
//  VIEW TOGGLE
// ──────────────────────────────────────────────────────────

function switchView(mode) {
  if (mode === viewMode) return;
  viewMode = mode;

  const hasData = appState === 'COMPLETE' || appState === 'FETCHING_IMAGES';

  el.btnGridView.classList.toggle('active',  mode === 'grid');
  el.btnGridView.setAttribute('aria-pressed', String(mode === 'grid'));
  el.btnTableView.classList.toggle('active', mode === 'table');
  el.btnTableView.setAttribute('aria-pressed', String(mode === 'table'));

  if (mode === 'grid') {
    el.gridShell.hidden  = !hasData;
    el.tableShell.hidden = true;
  } else {
    el.gridShell.hidden  = true;
    el.tableShell.hidden = !hasData;
  }
}



// ──────────────────────────────────────────────────────────
//  REPLACE SPECIES
// ──────────────────────────────────────────────────────────

async function replacePlant(rowKey, idx) {
  if (appState !== 'COMPLETE' && appState !== 'FETCHING_IMAGES') return;

  const card       = document.getElementById(`card-${rowKey}-${idx}`);
  const refreshBtn = card?.querySelector('.card-refresh-btn');
  if (!card || !refreshBtn || refreshBtn.disabled) return;

  // Show loading state on the card
  refreshBtn.disabled = true;
  refreshBtn.classList.add('spinning');
  card.classList.add('refreshing');
  card.classList.remove('flipped');

  // All current latin names except the one being replaced
  const beingReplaced = currentPalette[rowKey]?.[idx];
  const existing = Object.values(currentPalette)
    .flat()
    .filter(p => p.latinName !== beingReplaced?.latinName)
    .map(p => p.latinName);

  try {
    const res = await fetch('/api/replace', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        location:  currentVibe.location,
        qualities: currentVibe.qualities,
        category:  rowKey,
        existing,
      }),
    });

    const newPlant = await res.json();
    if (!res.ok) throw new Error(newPlant.error);

    // Update palette state
    currentPalette[rowKey][idx] = newPlant;

    // Swap card in grid (creates a fresh card element)
    const newCard = createPlantCard(newPlant, rowKey, idx);
    newCard.classList.add('replacing');
    newCard.classList.remove('enter');
    card.replaceWith(newCard);

    // Swap matching row in table
    const oldRow = document.getElementById(`trow-${rowKey}-${idx}`);
    if (oldRow) oldRow.replaceWith(createTableRow(newPlant, rowKey, idx));

    // Fetch image for the new species and inject into both views
    const imageUrl = await fetchPlantImageUrl(newPlant);
    injectCardImage(rowKey, idx, imageUrl);

  } catch (err) {
    console.error('replacePlant error:', err);
    showToast(err.message || 'Could not find a replacement. Try again.', 'error', 5000);
    // Restore the original card's state
    refreshBtn.disabled = false;
    refreshBtn.classList.remove('spinning');
    card.classList.remove('refreshing');
  }
}

function setGeneratingUI(isGenerating) {
  el.generateBtn.disabled = isGenerating;
  el.locationInput.disabled  = isGenerating;
  el.qualitiesInput.disabled = isGenerating;
  el.generateBtnText.textContent = isGenerating ? 'Generating' : 'Generate';
  el.generateBtnIcon.textContent = isGenerating ? '⦿' : '↗';
  el.generateBtn.classList.toggle('loading', isGenerating);
  // Disable view buttons while generating
  el.btnGridView.disabled  = isGenerating;
  el.btnTableView.disabled = isGenerating;
}

// ──────────────────────────────────────────────────────────
//  MAIN GENERATE FLOW
// ──────────────────────────────────────────────────────────

async function generate() {
  const location  = el.locationInput.value.trim();
  const qualities = el.qualitiesInput.value.trim();

  if (!location) {
    el.locationInput.focus();
    el.locationInput.classList.add('shake');
    el.locationInput.addEventListener('animationend', () => el.locationInput.classList.remove('shake'), { once: true });
    return;
  }

  if (appState !== 'IDLE' && appState !== 'COMPLETE') return;

  appState = 'GENERATING_TEXT';
  setGeneratingUI(true);
  clearGrid();
  el.gridShell.hidden  = true;
  el.tableShell.hidden = true;
  showProgress(true);
  setProgress(5, 'Consulting Gemini…');

  try {
    // ── Phase 1: Plant List ──────────────────────────────
    setProgress(10, `Building palette for “${location}”…`);
    const plantList = await fetchPlantList(location, qualities);
    setProgress(22, 'Populating cards…');

    // Build both views
    renderSkeletonCards(plantList);
    renderTableRows(plantList);

    // Save state for replace feature
    currentVibe    = { location, qualities };
    currentPalette = {
      trees:  [...plantList[CATEGORY_KEYS.trees]],
      shrubs: [...plantList[CATEGORY_KEYS.shrubs]],
      small:  [...plantList[CATEGORY_KEYS.small]],
    };

    // Show whichever view is active
    if (viewMode === 'grid') { el.gridShell.hidden = false; }
    else                     { el.tableShell.hidden = false; }

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
    const vibeLabel = currentVibe.qualities
      ? `${currentVibe.location} · ${currentVibe.qualities}`
      : currentVibe.location;
    setProgress(100, `Done — ${vibeLabel}`);
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

// View toggle buttons
el.btnGridView.addEventListener('click',  () => switchView('grid'));
el.btnTableView.addEventListener('click', () => switchView('table'));

// Grid interactions — refresh button and card flip (single delegated listener)
el.gridShell.addEventListener('click', (e) => {

  // ── Refresh button: replace this species ──
  const refreshBtn = e.target.closest('.card-refresh-btn');
  if (refreshBtn) {
    const card = refreshBtn.closest('.plant-card');
    if (!card) return;
    const [, rowKey, idx] = card.id.split('-');
    replacePlant(rowKey, parseInt(idx));
    return; // don't flip
  }

  // ── Card body: flip front/back ──
  const card = e.target.closest('.plant-card');
  if (!card || card.classList.contains('refreshing')) return;
  card.classList.toggle('flipped');
  const isFlipped = card.classList.contains('flipped');
  card.setAttribute('aria-pressed', String(isFlipped));
  const back = card.querySelector('.card-back');
  if (back) back.setAttribute('aria-hidden', String(!isFlipped));
});
