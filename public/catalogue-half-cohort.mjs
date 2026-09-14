import { registerCatalogueStateResponseListener } from './catalogue-save-pipeline.mjs';

const STATE_API = '/api/catalogue-overrides';
const HALF_TYPE = 'half';
const TASTER_TYPE = 'taster';
const MAIN_TYPE = 'main';
const SECTION_ID = 'half-cigar-section';
const GRID_ID = 'half-cigar-cards';
const EDITOR_TYPE_ID = 'catalogue-v139-type';
const STYLE_ID = 'catalogue-half-cohort-v3';

export const __sourceContract = Object.freeze({
  sectionId: SECTION_ID,
  gridId: GRID_ID,
  editorValue: HALF_TYPE,
  filterValue: HALF_TYPE
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mergeOverride(existing, patch) {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(patch && typeof patch === 'object' ? patch : {})
  };
}

export function normaliseCatalogueType(value, legacyTaster = false) {
  const type = String(value || '').trim().toLowerCase();
  if (type === HALF_TYPE || type === 'half-cigar' || type === 'halfcigar') return HALF_TYPE;
  if (type === TASTER_TYPE || legacyTaster) return TASTER_TYPE;
  return MAIN_TYPE;
}

export function catalogueTypeFromFields({ catalogueType = '', taster = false, text = '' } = {}) {
  const explicit = String(catalogueType || '').trim();
  if (explicit) return normaliseCatalogueType(explicit, Boolean(taster));
  if (taster) return TASTER_TYPE;
  return /half|halv/i.test(String(text || '')) ? HALF_TYPE : MAIN_TYPE;
}

export function catalogueTypeForRow(row = {}) {
  return catalogueTypeFromFields(row);
}

export function rankDisplayForType(type, rank) {
  const normalised = normaliseCatalogueType(type);
  const number = Math.max(1, Math.round(finiteNumber(rank, 1)));
  if (normalised === HALF_TYPE) return { label: 'Half-Cigar', value: `H${number}`, eyebrow: `H${number}` };
  if (normalised === TASTER_TYPE) return { label: 'Taster', value: `T${number}`, eyebrow: `T${number}` };
  return { label: 'No.', value: String(number), eyebrow: `No. ${number}` };
}

export function compactCatalogueCohorts(rows = []) {
  const source = Array.isArray(rows) ? rows.map(row => ({ ...row, catalogueType: catalogueTypeForRow(row) })) : [];
  const rankByKey = new Map();
  for (const type of [MAIN_TYPE, HALF_TYPE, TASTER_TYPE]) {
    source
      .filter(row => !row.archived && row.catalogueType === type)
      .sort((a, b) => finiteNumber(a.rank, Number.MAX_SAFE_INTEGER) - finiteNumber(b.rank, Number.MAX_SAFE_INTEGER))
      .forEach((row, index) => rankByKey.set(row.key, index + 1));
  }
  return source.map(row => row.archived ? row : { ...row, rank: rankByKey.get(row.key) || 1 });
}

export function reorderCatalogueCohorts(rows, existingCards, options = {}) {
  const key = String(options.key || '');
  const targetType = normaliseCatalogueType(options.targetType);
  const wantsArchived = Boolean(options.wantsArchived);
  const targetRank = Math.max(1, Math.round(finiteNumber(options.targetRank, 1)));
  const now = String(options.now || new Date().toISOString());
  const sourceRows = compactCatalogueCohorts(Array.isArray(rows) ? rows : []);
  const selected = sourceRows.find(row => row.key === key);
  const updates = {};
  if (!selected) return updates;

  const originalRank = Math.max(1, Math.round(finiteNumber(selected.rank, 1)));
  const oldType = catalogueTypeForRow(selected);
  const existing = existingCards && existingCards[key] && typeof existingCards[key] === 'object'
    ? existingCards[key]
    : {};

  if (!selected.archived && (wantsArchived || oldType !== targetType)) {
    const oldCohort = sourceRows
      .filter(row => row.key !== key && !row.archived && catalogueTypeForRow(row) === oldType)
      .sort((a, b) => finiteNumber(a.rank) - finiteNumber(b.rank));
    oldCohort.forEach((row, index) => {
      updates[row.key] = mergeOverride(existingCards?.[row.key], {
        rank: index + 1,
        catalogueType: oldType,
        taster: oldType === TASTER_TYPE
      });
    });
  }

  if (wantsArchived) {
    updates[key] = mergeOverride(existing, {
      archived: true,
      archivedAt: existing.archivedAt || now,
      archivedRank: existing.archivedRank || originalRank,
      catalogueType: targetType,
      taster: targetType === TASTER_TYPE
    });
    return updates;
  }

  const targetCohort = sourceRows
    .filter(row => row.key !== key && !row.archived && catalogueTypeForRow(row) === targetType)
    .sort((a, b) => finiteNumber(a.rank) - finiteNumber(b.rank));
  const insertionIndex = Math.max(0, Math.min(targetCohort.length, targetRank - 1));
  targetCohort.splice(insertionIndex, 0, {
    ...selected,
    key,
    catalogueType: targetType,
    taster: targetType === TASTER_TYPE,
    archived: false
  });
  targetCohort.forEach((row, index) => {
    const rowType = row.key === key ? targetType : catalogueTypeForRow(row);
    updates[row.key] = mergeOverride(existingCards?.[row.key], {
      rank: index + 1,
      catalogueType: rowType,
      taster: rowType === TASTER_TYPE,
      ...(row.key === key ? { archived: false, archivedAt: '' } : {})
    });
  });
  return updates;
}

function cardText(card) {
  return [
    card?.textContent || '',
    card?.querySelector?.('h3')?.textContent || '',
    card?.querySelector?.('.artmeta-right')?.textContent || '',
    card?.querySelector?.('.mog-note')?.textContent || '',
    card?.querySelector?.('.summary')?.textContent || ''
  ].filter(Boolean).join(' ');
}

function cardCatalogueType(card) {
  return catalogueTypeFromFields({
    catalogueType: card?.dataset?.catalogueType || '',
    taster: card?.dataset?.taster === '1',
    text: cardText(card)
  });
}

function documentFor(root) {
  if (root?.createElement) return root;
  if (root?.ownerDocument?.createElement) return root.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

function ensureStyle(root = document) {
  const doc = documentFor(root);
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `#${SECTION_ID}.hidden{display:none!important}#${SECTION_ID} .grid{margin-top:18px}`;
  doc.head?.appendChild(style);
}

export function ensureHalfCigarSection(root = document) {
  if (!root?.querySelector) return null;
  let section = root.getElementById?.(SECTION_ID) || root.querySelector(`#${SECTION_ID}`);
  if (section) return section;
  const tasters = root.getElementById?.('tasters-section') || root.querySelector('#tasters-section');
  if (!tasters?.parentElement) return null;
  const doc = documentFor(root);
  if (!doc) return null;
  section = doc.createElement('section');
  section.className = 'section half-cigar-section';
  section.id = SECTION_ID;
  section.innerHTML = `<div class="section-head"><span class="num">II</span><h2>The Half-Cigar</h2><p>Cigars catalogued as separate half-session formats. Ranked independently from recommendations and tasters.</p></div><div class="grid" id="${GRID_ID}"></div>`;
  tasters.parentElement.insertBefore(section, tasters);
  const tasterNumber = tasters.querySelector?.('.section-head .num');
  if (tasterNumber) tasterNumber.textContent = 'III';
  return section;
}

export function updateCardRankVisual(card) {
  if (!card || card.dataset?.archived === '1') return;
  const type = cardCatalogueType(card);
  if (type === MAIN_TYPE) return;
  const display = rankDisplayForType(type, card.dataset?.rank);
  const rankflag = card.querySelector?.('.rankflag');
  const label = rankflag?.querySelector?.('span');
  const value = rankflag?.querySelector?.('b');
  if (label && label.textContent !== display.label) label.textContent = display.label;
  if (value && value.textContent !== display.value) value.textContent = display.value;
}

function applyStateMembership(state, root = document) {
  const cards = state && typeof state.cards === 'object' ? state.cards : {};
  const entries = state && typeof state.entries === 'object' ? state.entries : {};
  root.querySelectorAll?.('article.card[data-key]').forEach(card => {
    const key = card.dataset.key;
    const saved = { ...(entries[key] || {}), ...(cards[key] || {}) };
    if (!Object.keys(saved).length) return;
    const type = normaliseCatalogueType(saved.catalogueType || card.dataset.catalogueType, saved.taster === true || card.dataset.taster === '1');
    card.dataset.catalogueType = type;
    if (type === TASTER_TYPE) card.dataset.taster = '1';
    else delete card.dataset.taster;
    if (saved.rank != null && (type === HALF_TYPE || type === TASTER_TYPE)) {
      card.dataset.rank = String(Math.max(1, Math.round(finiteNumber(saved.rank, 1))));
    }
    updateCardRankVisual(card);
  });
}

function orderedHalfCards(cards) {
  return [...cards].sort((a, b) => finiteNumber(a.dataset?.rank, 9999) - finiteNumber(b.dataset?.rank, 9999));
}

export function syncHalfCigarSection(root = document) {
  if (!root?.querySelectorAll) return 0;
  const section = ensureHalfCigarSection(root);
  const grid = section?.querySelector?.(`#${GRID_ID}`);
  if (!grid) return 0;
  const cards = Array.from(root.querySelectorAll('article.card[data-key]'))
    .filter(card => card.dataset.archived !== '1' && cardCatalogueType(card) === HALF_TYPE);
  orderedHalfCards(cards).forEach(card => {
    updateCardRankVisual(card);
    if (card.parentElement !== grid) grid.appendChild(card);
  });
  section.classList.toggle('hidden', cards.length === 0);
  return cards.length;
}

function ensureEditorTypeOption(root = document) {
  const select = root.getElementById?.(EDITOR_TYPE_ID) || root.querySelector?.(`#${EDITOR_TYPE_ID}`);
  if (!select) return null;
  let option = Array.from(select.options || []).find(item => item.value === HALF_TYPE);
  if (!option) {
    const doc = documentFor(root);
    option = doc.createElement('option');
    option.value = 'half';
    option.textContent = 'Half-Cigar';
    const taster = Array.from(select.options || []).find(item => item.value === TASTER_TYPE);
    if (taster) select.insertBefore(option, taster);
    else select.appendChild(option);
  }
  return select;
}

function ensureHalfFilter(root = document) {
  if (!root?.querySelector) return null;
  let button = root.querySelector('.toggle button[data-filter="half"]');
  if (button) return button;
  const taster = root.querySelector('.toggle button[data-filter="tasters"]');
  if (!taster?.parentElement) return null;
  const doc = documentFor(root);
  button = doc.createElement('button');
  button.type = 'button';
  button.dataset.filter = 'half';
  button.textContent = 'Half Cigars';
  taster.parentElement.insertBefore(button, taster.nextSibling);
  button.addEventListener('click', () => {
    root.querySelectorAll('.toggle button').forEach(control => control.classList.remove('active'));
    button.classList.add('active');
    root.querySelectorAll('article.card[data-key]').forEach(card => {
      const show = card.dataset.archived !== '1' && cardCatalogueType(card) === HALF_TYPE;
      card.classList.toggle('hidden', !show);
    });
    root.getElementById?.('tasters-section')?.classList.add('hidden');
    root.getElementById?.('archived-section')?.classList.add('hidden');
    ensureHalfCigarSection(root)?.classList.remove('hidden');
    globalThis.window?.refreshGroupVisibility?.();
  });
  return button;
}

let refreshTimer = 0;
function scheduleRefresh(root = document) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    ensureStyle(root);
    ensureHalfCigarSection(root);
    ensureEditorTypeOption(root);
    ensureHalfFilter(root);
    syncHalfCigarSection(root);
  }, 0);
}

function acceptState(state, root = document) {
  if (!state || typeof state !== 'object') return;
  applyStateMembership(state, root);
  scheduleRefresh(root);
}

export function installHalfCigarCohort(root = document) {
  if (typeof document === 'undefined' || !root) return;
  ensureStyle(root);
  ensureHalfCigarSection(root);
  ensureEditorTypeOption(root);
  ensureHalfFilter(root);
  registerCatalogueStateResponseListener('half-cohort-display', event => acceptState(event?.state, root));
  fetch(`${STATE_API}?half_cohort=display`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(state => acceptState(state, root))
    .catch(() => scheduleRefresh(root));
  root.getElementById?.('sort')?.addEventListener('change', () => scheduleRefresh(root));
  root.getElementById?.('sort-secondary')?.addEventListener('change', () => scheduleRefresh(root));
  if (typeof MutationObserver !== 'undefined' && root.body) {
    const observer = new MutationObserver(() => scheduleRefresh(root));
    observer.observe(root.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-rank', 'data-taster', 'data-catalogue-type', 'data-archived']
    });
  }
}

if (typeof document !== 'undefined') installHalfCigarCohort(document);
