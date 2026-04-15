/* ====================================================
   PlantFoundry — Application Logic
   app.js
   ==================================================== */

'use strict';

// ──────────────────────────────────────────────────────────
//  CONFIG
// ──────────────────────────────────────────────────────────

const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const INAT_API = 'https://api.inaturalist.org/v1/taxa';

const MIN_COUNT = 1;
const MAX_COUNT = 8;
const MIN_ROWS  = 1;
const MAX_ROWS  = 6;

// ──────────────────────────────────────────────────────────
//  STATE
// ──────────────────────────────────────────────────────────

let appState  = 'IDLE'; // IDLE | GENERATING_TEXT | FETCHING_IMAGES | COMPLETE
let viewMode  = 'grid'; // 'grid' | 'table'

let currentVibe    = { location: '', qualities: '' };
let currentPalette = []; // Array<{ key, label, plants: [] }>

// Live grid configuration — drives placeholder layout and prompt
let gridConfig = [
  { key: 'row_0', label: 'Trees',                    count: 5 },
  { key: 'row_1', label: 'Shrubs & Bushes',          count: 5 },
  { key: 'row_2', label: 'Small Plants & Grasses',   count: 5 },
];
let _nextRowKey = 3;

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

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
//  UTILITIES
// ──────────────────────────────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

// ──────────────────────────────────────────────────────────
//  CARD BUILDING
// ──────────────────────────────────────────────────────────

function createPlantCard(plant, rowKey, index) {
  const card = document.createElement('article');
  card.className = 'plant-card enter';
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
          <div class="spec-item">
            <span class="spec-label">Min Temp</span>
            <span class="spec-value">${escapeHtml(plant.minTemp || '—')}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Colors</span>
            <span class="spec-value">${escapeHtml(plant.predominantColors || '—')}</span>
          </div>
        </div>
        ${plant.landscapeNote ? `<p class="card-back-desc">${escapeHtml(plant.landscapeNote)}</p>` : ''}
        <p class="card-back-hint">Click to flip back</p>
      </div>

    </div>
  `;
  return card;
}

function buildPlaceholderCard(rowKey, idx) {
  const card = document.createElement('article');
  card.className = 'plant-card placeholder-card';
  card.id = `card-${rowKey}-${idx}`;
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', 'Empty plant slot');
  card.innerHTML = `
    <div class="card-front placeholder-front">
      <div class="placeholder-body">
        <svg class="placeholder-leaf" width="22" height="22" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
        </svg>
      </div>
    </div>
  `;
  return card;
}

// ──────────────────────────────────────────────────────────
//  GRID CONFIG BUILDER  (always-visible interactive grid)
// ──────────────────────────────────────────────────────────

function initConfigGrid() {
  el.gridShell.innerHTML = '';
  for (const row of gridConfig) {
    el.gridShell.appendChild(buildRowContainer(row, true));
  }
  el.gridShell.appendChild(buildAddRowButton());
}

function buildRowContainer(rowConfig, withPlaceholders = true) {
  const container = document.createElement('div');
  container.className = 'row-container';
  container.id = `row-container-${rowConfig.key}`;

  container.appendChild(buildRowHeader(rowConfig));

  const grid = document.createElement('div');
  grid.className = 'plant-grid';
  grid.id = `row-${rowConfig.key}`;
  grid.setAttribute('role', 'list');

  if (withPlaceholders) {
    for (let i = 0; i < rowConfig.count; i++) {
      grid.appendChild(buildPlaceholderCard(rowConfig.key, i));
    }
  }

  container.appendChild(grid);
  return container;
}

function buildRowHeader(rowConfig) {
  const header = document.createElement('div');
  header.className = 'row-header';

  const canDelete = gridConfig.length > MIN_ROWS;

  header.innerHTML = `
    <div class="row-header-left">
      <span
        class="row-label row-label-editable"
        id="label-${rowConfig.key}"
        contenteditable="true"
        data-key="${rowConfig.key}"
        spellcheck="false"
        role="textbox"
        aria-label="Category name"
      >${escapeHtml(rowConfig.label)}</span>
    </div>
    <div class="row-header-right">
      <div class="row-count-controls" aria-label="Number of plants in this row">
        <button class="row-count-btn" data-key="${rowConfig.key}" data-delta="-1"
                aria-label="Fewer plants" type="button" title="Remove column">−</button>
        <span class="row-count-display" id="count-${rowConfig.key}">${rowConfig.count}</span>
        <button class="row-count-btn" data-key="${rowConfig.key}" data-delta="1"
                aria-label="More plants" type="button" title="Add column">+</button>
      </div>
      ${canDelete ? `
        <button class="row-delete-btn" data-key="${rowConfig.key}"
                aria-label="Remove ${escapeHtml(rowConfig.label)} row" title="Remove row" type="button">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      ` : ''}
    </div>
  `;
  return header;
}

function buildAddRowButton() {
  const wrap = document.createElement('div');
  wrap.className = 'add-row-wrap';
  wrap.id = 'add-row-wrap';
  const disabled = gridConfig.length >= MAX_ROWS;
  wrap.innerHTML = `
    <button class="add-row-btn" id="add-row-btn" type="button"
            aria-label="Add a new plant category"
            ${disabled ? 'disabled aria-disabled="true"' : ''}>
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <line x1="5.5" y1="1" x2="5.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Add Category
    </button>
  `;
  return wrap;
}

// ── Row count stepper ─────────────────────────────────────

function handleRowCountChange(key, delta) {
  if (appState === 'GENERATING_TEXT') return;
  const row = gridConfig.find(r => r.key === key);
  if (!row) return;

  const newCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, row.count + delta));
  if (newCount === row.count) return;
  row.count = newCount;

  const countDisplay = document.getElementById(`count-${key}`);
  if (countDisplay) countDisplay.textContent = newCount;

  const grid = document.getElementById(`row-${key}`);
  if (!grid) return;

  const currentCount = grid.children.length;
  if (newCount > currentCount) {
    for (let i = currentCount; i < newCount; i++) {
      // If card exists (real card from prior gen), add placeholder; else placeholder too
      grid.appendChild(buildPlaceholderCard(key, i));
    }
  } else {
    while (grid.children.length > newCount) grid.lastChild.remove();
  }
}

// ── Row delete ────────────────────────────────────────────

function handleRowDelete(key) {
  if (appState === 'GENERATING_TEXT') return;
  if (gridConfig.length <= MIN_ROWS) return;

  gridConfig = gridConfig.filter(r => r.key !== key);
  document.getElementById(`row-container-${key}`)?.remove();

  // If we're down to 1, re-render all to hide the delete buttons
  if (gridConfig.length === MIN_ROWS) initConfigGrid();
}

// ── Add row ───────────────────────────────────────────────

function handleAddRow() {
  if (appState === 'GENERATING_TEXT') return;
  if (gridConfig.length >= MAX_ROWS) return;

  const key    = `row_${_nextRowKey++}`;
  const newRow = { key, label: 'New Category', count: 3 };
  gridConfig.push(newRow);

  const addWrap = document.getElementById('add-row-wrap');
  el.gridShell.insertBefore(buildRowContainer(newRow, true), addWrap);

  // If just hit max, disable the Add button
  if (gridConfig.length >= MAX_ROWS) {
    const btn = document.getElementById('add-row-btn');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
  }

  // If went from 1→2, re-render all to show delete buttons
  if (gridConfig.length === 2) initConfigGrid();

  // Focus + select-all the new label for immediate rename
  const labelEl = document.getElementById(`label-${key}`);
  if (labelEl) {
    labelEl.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(labelEl);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// ── Row label contenteditable sync ────────────────────────

el.gridShell.addEventListener('input', (e) => {
  const label = e.target.closest('.row-label-editable');
  if (!label) return;
  const key = label.dataset.key;
  const row = gridConfig.find(r => r.key === key);
  if (row) row.label = label.textContent.trim() || row.label;
});

el.gridShell.addEventListener('blur', (e) => {
  const label = e.target.closest('.row-label-editable');
  if (!label) return;
  const key = label.dataset.key;
  const row = gridConfig.find(r => r.key === key);
  if (!row) return;
  const text = label.textContent.trim();
  label.textContent = text || row.label; // revert if empty
  if (text) row.label = text;
}, true); // use capture for blur

// Prevent Enter from inserting newlines in labels
el.gridShell.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest('.row-label-editable')) {
    e.preventDefault();
    e.target.blur();
  }
});

// ──────────────────────────────────────────────────────────
//  IMAGE INJECTION
// ──────────────────────────────────────────────────────────

function injectCardImage(rowKey, index, imageUrl) {
  // Card image
  const skeleton = document.getElementById(`skeleton-${rowKey}-${index}`);
  const img      = document.getElementById(`img-${rowKey}-${index}`);
  const card     = document.getElementById(`card-${rowKey}-${index}`);

  if (skeleton && img && card) {
    if (!imageUrl) {
      skeleton.classList.add('hidden');
      const fail = document.createElement('div');
      fail.className = 'card-img-fail';
      fail.setAttribute('aria-hidden', 'true');
      fail.textContent = '🌿';
      card.querySelector('.card-img-wrap')?.appendChild(fail);
    } else {
      img.src = imageUrl;
      img.onload  = () => { img.classList.add('loaded'); skeleton.classList.add('hidden'); };
      img.onerror = () => injectCardImage(rowKey, index, null);
    }
  }

  // Table thumbnail
  const thumbSkeleton = document.getElementById(`tsk-${rowKey}-${index}`);
  const thumb         = document.getElementById(`tth-${rowKey}-${index}`);
  if (thumb) {
    if (imageUrl) {
      thumb.src = imageUrl;
      thumb.onload  = () => { thumb.classList.add('loaded'); thumbSkeleton?.remove(); };
      thumb.onerror = () => thumbSkeleton?.remove();
    } else {
      thumbSkeleton?.remove();
    }
  }
}

// ──────────────────────────────────────────────────────────
//  PLANT LIST — /api/generate
// ──────────────────────────────────────────────────────────

async function fetchPlantList(location, qualities, config) {
  const response = await fetch('/api/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ location, qualities, gridConfig: config }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Server error ${response.status}`);
  return data; // { rows: [{ key, label, plants: [] }] }
}

// ──────────────────────────────────────────────────────────
//  IMAGE FETCHING — 5-source waterfall
// ──────────────────────────────────────────────────────────

async function fetchFromWikipedia(plant) {
  const attempts = [plant.latinName, plant.commonName];
  for (const title of attempts) {
    try {
      const res  = await fetch(`${WIKI_API}/${encodeURIComponent(title)}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const img  = data.originalimage?.source || data.thumbnail?.source;
      if (img) return img;
    } catch { /* try next */ }
  }
  return null;
}

async function fetchFromWikimediaCommons(plant) {
  try {
    const url = [
      'https://commons.wikimedia.org/w/api.php',
      '?action=query&generator=search',
      `&gsrsearch=${encodeURIComponent(plant.latinName)}`,
      '&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*',
    ].join('');
    const res   = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data  = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    for (const page of Object.values(pages)) {
      const src = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
      if (src) return src;
    }
    return null;
  } catch { return null; }
}

async function fetchFromINaturalist(plant) {
  try {
    const res   = await fetch(`${INAT_API}?q=${encodeURIComponent(plant.latinName)}&limit=1&locale=en`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data  = await res.json();
    const taxon = data.results?.[0];
    return taxon?.default_photo?.medium_url || taxon?.default_photo?.url || null;
  } catch { return null; }
}

async function fetchFromGBIF(plant) {
  try {
    const speciesRes  = await fetch(`https://api.gbif.org/v1/species?name=${encodeURIComponent(plant.latinName)}&limit=1`, { headers: { Accept: 'application/json' } });
    if (!speciesRes.ok) return null;
    const speciesData = await speciesRes.json();
    const key = speciesData.results?.[0]?.key ?? speciesData.results?.[0]?.nubKey;
    if (!key) return null;
    const occRes  = await fetch(`https://api.gbif.org/v1/occurrence/search?taxon_key=${key}&mediaType=StillImage&limit=5`, { headers: { Accept: 'application/json' } });
    if (!occRes.ok) return null;
    const occData = await occRes.json();
    for (const occ of occData.results ?? []) {
      const media = occ.media?.find(m => m.type === 'StillImage' && m.identifier);
      if (media?.identifier) return media.identifier;
    }
    return null;
  } catch { return null; }
}

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
//  RENDER — cards and table
// ──────────────────────────────────────────────────────────

function renderPlantCards(apiRows) {
  for (const row of apiRows) {
    const grid = document.getElementById(`row-${row.key}`);
    if (!grid) continue;
    grid.innerHTML = '';
    row.plants.forEach((plant, idx) => grid.appendChild(createPlantCard(plant, row.key, idx)));
  }
}

function createTableRow(plant, rowKey, rowLabel, idx) {
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
    <td class="td-cat">${escapeHtml(rowLabel)}</td>
    <td class="td-spec">${escapeHtml(plant.waterNeeds     || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.sunExposure    || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.hardinessZones || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.matureHeight   || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.growthRate     || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.minTemp        || '—')}</td>
    <td class="td-spec">${escapeHtml(plant.predominantColors || '—')}</td>
  `;
  return tr;
}

function renderTableRows(apiRows) {
  el.tableBody.innerHTML = '';
  for (const row of apiRows) {
    const sep = document.createElement('tr');
    sep.className = 'table-group-row';
    sep.innerHTML = `<td colspan="11">${escapeHtml(row.label)}</td>`;
    el.tableBody.appendChild(sep);
    row.plants.forEach((plant, idx) => el.tableBody.appendChild(createTableRow(plant, row.key, row.label, idx)));
  }
}

// ──────────────────────────────────────────────────────────
//  VIEW TOGGLE
// ──────────────────────────────────────────────────────────

function switchView(mode) {
  if (isMobile()) {
    scrollToMobilePage(mode === 'grid' ? 1 : 2);
    return;
  }
  if (mode === viewMode) return;
  viewMode = mode;

  el.btnGridView.classList.toggle('active',  mode === 'grid');
  el.btnGridView.setAttribute('aria-pressed', String(mode === 'grid'));
  el.btnTableView.classList.toggle('active', mode === 'table');
  el.btnTableView.setAttribute('aria-pressed', String(mode === 'table'));

  const hasData = appState === 'COMPLETE' || appState === 'FETCHING_IMAGES';
  if (mode === 'grid') {
    el.tableShell.hidden = true;
    // Grid is always shown; no toggle needed
  } else {
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

  refreshBtn.disabled = true;
  refreshBtn.classList.add('spinning');
  card.classList.add('refreshing');
  card.classList.remove('flipped');

  // Find the row config and current plant
  const rowConfig     = gridConfig.find(r => r.key === rowKey);
  const paletteRow    = currentPalette.find(r => r.key === rowKey);
  const beingReplaced = paletteRow?.plants?.[idx];

  // All current latin names except the one being replaced
  const existing = currentPalette
    .flatMap(r => r.plants)
    .filter(p => p.latinName !== beingReplaced?.latinName)
    .map(p => p.latinName);

  try {
    const res = await fetch('/api/replace', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        location:  currentVibe.location,
        qualities: currentVibe.qualities,
        rowLabel:  rowConfig?.label || 'Plants',
        existing,
      }),
    });

    const newPlant = await res.json();
    if (!res.ok) throw new Error(newPlant.error);

    // Update palette state
    if (paletteRow) paletteRow.plants[idx] = newPlant;

    // Swap card in grid
    const newCard = createPlantCard(newPlant, rowKey, idx);
    newCard.classList.add('replacing');
    newCard.classList.remove('enter');
    card.replaceWith(newCard);

    // Swap matching row in table
    const oldRow = document.getElementById(`trow-${rowKey}-${idx}`);
    if (oldRow) oldRow.replaceWith(createTableRow(newPlant, rowKey, rowConfig?.label || '', idx));

    // Fetch image
    const imageUrl = await fetchPlantImageUrl(newPlant);
    injectCardImage(rowKey, idx, imageUrl);

  } catch (err) {
    console.error('replacePlant error:', err);
    showToast(err.message || 'Could not find a replacement. Try again.', 'error', 5000);
    refreshBtn.disabled = false;
    refreshBtn.classList.remove('spinning');
    card.classList.remove('refreshing');
  }
}

// ──────────────────────────────────────────────────────────
//  UI STATE HELPER
// ──────────────────────────────────────────────────────────

function setGeneratingUI(isGenerating) {
  el.generateBtn.disabled    = isGenerating;
  el.locationInput.disabled  = isGenerating;
  el.qualitiesInput.disabled = isGenerating;
  el.generateBtnText.textContent = isGenerating ? 'Generating' : 'Generate';
  el.generateBtnIcon.textContent = isGenerating ? '⦿' : '↗';
  el.generateBtn.classList.toggle('loading', isGenerating);
  if (el.btnGridView)  el.btnGridView.disabled  = isGenerating;
  if (el.btnTableView) el.btnTableView.disabled = isGenerating;

  // Disable row controls while generating
  el.gridShell.querySelectorAll('.row-count-btn, .row-delete-btn, #add-row-btn').forEach(btn => {
    btn.disabled = isGenerating;
  });
  el.gridShell.querySelectorAll('.row-label-editable').forEach(label => {
    label.contentEditable = isGenerating ? 'false' : 'true';
  });
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

  const totalPlants = gridConfig.reduce((sum, r) => sum + r.count, 0);
  if (totalPlants === 0) { showToast('Add at least one plant slot to the grid.', 'error'); return; }

  if (appState !== 'IDLE' && appState !== 'COMPLETE') return;

  appState = 'GENERATING_TEXT';
  setGeneratingUI(true);

  // Reset grid cards to placeholder state
  for (const row of gridConfig) {
    const grid = document.getElementById(`row-${row.key}`);
    if (grid) {
      grid.innerHTML = '';
      for (let i = 0; i < row.count; i++) grid.appendChild(buildPlaceholderCard(row.key, i));
    }
  }
  el.tableBody.innerHTML = '';
  el.tableShell.hidden = true;

  if (isMobile()) scrollToMobilePage(0);

  showProgress(true);
  setProgress(5, 'Consulting Gemini…');

  try {
    setProgress(10, `Building palette for "${location}"…`);
    const apiResponse = await fetchPlantList(location, qualities, gridConfig);
    setProgress(22, 'Populating cards…');

    // Validate response rows match gridConfig
    const rows = apiResponse.rows;
    if (!Array.isArray(rows)) throw new Error('Unexpected response format from AI.');

    // Render
    renderPlantCards(rows);
    renderTableRows(rows);

    // Save state
    currentVibe    = { location, qualities };
    currentPalette = rows;

    // Show table view if needed
    if (isMobile()) {
      el.tableShell.hidden = false;
      setTimeout(() => scrollToMobilePage(1), 80);
    } else if (viewMode === 'table') {
      el.tableShell.hidden = false;
    }

    // Phase 2: Images
    appState = 'FETCHING_IMAGES';
    let done = 0;
    const total = rows.reduce((s, r) => s + (r.plants?.length || 0), 0);

    const allImageTasks = rows.flatMap(row =>
      (row.plants || []).map(async (plant, idx) => {
        const imageUrl = await fetchPlantImageUrl(plant);
        done++;
        setProgress(22 + Math.round((done / total) * 74), `Loading images… ${done} / ${total}`);
        injectCardImage(row.key, idx, imageUrl);
      })
    );

    await Promise.all(allImageTasks);

    appState = 'COMPLETE';
    const vibeLabel = currentVibe.qualities
      ? `${currentVibe.location} · ${currentVibe.qualities}`
      : currentVibe.location;
    setProgress(100, `Done — ${vibeLabel}`);
    setGeneratingUI(false);

    setTimeout(() => { showProgress(false); setProgress(0, ''); }, 2000);

  } catch (err) {
    console.error(err);
    appState = 'IDLE';
    setGeneratingUI(false);
    showProgress(false);
    setProgress(0, '');
    showToast(err.message || 'Something went wrong. Please try again.', 'error', 7000);
    // Revert grid to placeholder state
    initConfigGrid();
  }
}

// ──────────────────────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────────────────────

el.generateBtn.addEventListener('click', generate);
el.btnGridView.addEventListener('click',  () => switchView('grid'));
el.btnTableView.addEventListener('click', () => switchView('table'));

// Grid interactions — delegated to grid-shell
el.gridShell.addEventListener('click', (e) => {

  // ── Row count stepper ──
  const countBtn = e.target.closest('.row-count-btn');
  if (countBtn) {
    handleRowCountChange(countBtn.dataset.key, parseInt(countBtn.dataset.delta));
    return;
  }

  // ── Row delete ──
  const deleteBtn = e.target.closest('.row-delete-btn');
  if (deleteBtn) {
    handleRowDelete(deleteBtn.dataset.key);
    return;
  }

  // ── Add row ──
  if (e.target.closest('#add-row-btn')) {
    handleAddRow();
    return;
  }

  // ── Card refresh (replace species) ──
  const refreshBtn = e.target.closest('.card-refresh-btn');
  if (refreshBtn) {
    const card = refreshBtn.closest('.plant-card');
    if (!card) return;
    const [, rowKey, idx] = card.id.split('-');
    replacePlant(rowKey, parseInt(idx));
    return;
  }

  // ── Card flip ──
  const card = e.target.closest('.plant-card');
  if (!card || card.classList.contains('placeholder-card') || card.classList.contains('refreshing')) return;
  card.classList.toggle('flipped');
  const isFlipped = card.classList.contains('flipped');
  card.setAttribute('aria-pressed', String(isFlipped));
  const back = card.querySelector('.card-back');
  if (back) back.setAttribute('aria-hidden', String(!isFlipped));
});

// ──────────────────────────────────────────────────────────
//  MOBILE SWIPE INIT
// ──────────────────────────────────────────────────────────

function scrollToMobilePage(idx) {
  const swiper = document.getElementById('mob-swiper');
  if (swiper) swiper.scrollTo({ left: idx * window.innerWidth, behavior: 'smooth' });
}

function updateMobileDots(idx) {
  document.querySelectorAll('.page-dots .dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === idx);
  });
}

function initMobileSwipe() {
  if (!isMobile()) return;

  const body     = document.body;
  const topbar   = document.querySelector('.topbar');
  const mainEl   = document.getElementById('main-content');
  const pageDots = document.getElementById('page-dots');

  const swiper = document.createElement('div');
  swiper.id = 'mob-swiper';
  swiper.className = 'mob-swiper';

  swiper.appendChild(topbar);    // PAGE 1: input home
  swiper.appendChild(el.gridShell);  // PAGE 2: grid
  swiper.appendChild(el.tableShell); // PAGE 3: table

  body.prepend(swiper);
  mainEl?.remove();

  // Grid is always shown on mobile
  el.gridShell.removeAttribute('hidden');
  el.tableShell.removeAttribute('hidden');

  if (pageDots) pageDots.removeAttribute('hidden');

  swiper.addEventListener('scroll', () => {
    const idx = Math.round(swiper.scrollLeft / window.innerWidth);
    updateMobileDots(idx);
  }, { passive: true });

  document.querySelectorAll('.page-dots .dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.idx);
      scrollToMobilePage(idx);
      if (idx === 1) switchView('grid');
      if (idx === 2) switchView('table');
    });
  });
}

// ── Bootstrap ─────────────────────────────────────────────
initConfigGrid();      // Render placeholder grid on load
initMobileSwipe();     // Restructure DOM for mobile if needed
