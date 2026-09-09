const STATE_API = '/api/catalogue-overrides';
const HALF_TYPE = 'half';
const TASTER_TYPE = 'taster';
const MAIN_TYPE = 'main';
const SECTION_ID = 'half-cigar-section';
const GRID_ID = 'half-cigar-cards';
const EDITOR_TYPE_ID = 'catalogue-v139-type';
const EDITOR_KEY_ID = 'catalogue-v139-key';
const EDITOR_RANK_ID = 'catalogue-admin-rank';
const STYLE_ID = 'catalogue-half-cohort-v2';

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

export function normaliseAllCohortRanks(rows, existingCards, selectedKey = '', selectedType = MAIN_TYPE, selectedRank = 1) {
  const targetType = normaliseCatalogueType(selectedType);
  const activeRows = compactCatalogueCohorts((Array.isArray(rows) ? rows : [])
    .filter(row => !row.archived)
    .map(row => row.key === selectedKey
      ? { ...row, catalogueType: targetType, taster: targetType === TASTER_TYPE }
      : { ...row }));
  const output = {};

  for (const type of [MAIN_TYPE, HALF_TYPE, TASTER_TYPE]) {
    const cohort = activeRows
      .filter(row => catalogueTypeForRow(row) === type)
      .sort((a, b) => finiteNumber(a.rank) - finiteNumber(b.rank));

    if (selectedKey && targetType === type) {
      const selectedIndex = cohort.findIndex(row => row.key === selectedKey);
      if (selectedIndex >= 0) {
        const [selected] = cohort.splice(selectedIndex, 1);
        const insertionIndex = Math.max(0, Math.min(cohort.length, Math.round(finiteNumber(selectedRank, 1)) - 1));
        cohort.splice(insertionIndex, 0, selected);
      }
    }

    cohort.forEach((row, index) => {
      output[row.key] = mergeOverride(existingCards?.[row.key], {
        rank: index + 1,
        catalogueType: type,
        taster: type === TASTER_TYPE
      });
    });
  }
  return output;
}

function cardText(card) {
  if (!card) return '';
  return [
    card.textContent || '',
    card.querySelector?.('h3')?.textContent || '',
    card.querySelector?.('.artmeta-right')?.textContent || '',
    card.querySelector?.('.mog-note')?.textContent || '',
    card.querySelector?.('.summary')?.textContent || ''
  ].filter(Boolean).join(' ');
}

function cardCatalogueType(card) {
  if (!card) return MAIN_TYPE;
  return catalogueTypeFromFields({
    catalogueType: card.dataset?.catalogueType || '',
    taster: card.dataset?.taster === '1',
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
  style.textContent = `
#${SECTION_ID}.hidden{display:none!important}
#${SECTION_ID} .grid{margin-top:18px}
`;
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
  const display = rankDisplayForType(type, card.dataset?.rank);
  const rankflag = card.querySelector?.('.rankflag');
  const label = rankflag?.querySelector?.('span');
  const value = rankflag?.querySelector?.('b');
  if (label && label.textContent !== display.label) label.textContent = display.label;
  if (value && value.textContent !== display.value) value.textContent = display.value;
}

function compactDomCohortRanks(root = document) {
  if (!root?.querySelectorAll) return 0;
  const cards = Array.from(root.querySelectorAll('article.card[data-key]'));
  const rows = cards.map(card => ({
    key: card.dataset.key,
    rank: Math.max(1, Math.round(finiteNumber(card.dataset.rank, 1))),
    catalogueType: cardCatalogueType(card),
    taster: card.dataset.taster === '1',
    archived: card.dataset.archived === '1'
  }));
  const compacted = compactCatalogueCohorts(rows);
  const byKey = new Map(compacted.map(row => [row.key, row]));
  let changed = 0;
  cards.forEach(card => {
    const row = byKey.get(card.dataset.key);
    if (!row || row.archived) return;
    const nextRank = String(row.rank);
    if (card.dataset.rank !== nextRank) {
      card.dataset.rank = nextRank;
      changed += 1;
    }
    if (card.dataset.catalogueType !== row.catalogueType) {
      card.dataset.catalogueType = row.catalogueType;
      changed += 1;
    }
    if (row.catalogueType === TASTER_TYPE) card.dataset.taster = '1';
    else delete card.dataset.taster;
    updateCardRankVisual(card);
  });
  return changed;
}

function scoreForSort(card, key) {
  if (key === 'rank' || key === 'price' || key === 'risk' || key === 'format') {
    return finiteNumber(card?.dataset?.[key], 0);
  }
  const label = { strength: 'Strength', quality: 'Quality', value: 'Value' }[key];
  if (!label) return 0;
  const rating = Array.from(card?.querySelectorAll?.('.rating') || []).find(node =>
    node.querySelector?.(':scope > span')?.textContent?.trim() === label
  );
  const match = rating?.querySelector?.('.subscore')?.textContent?.match(/(\d+)\s*\/\s*10/);
  return match ? Number(match[1]) : 0;
}

function compareCards(a, b, key) {
  const av = scoreForSort(a, key);
  const bv = scoreForSort(b, key);
  if (key === 'rank' || key === 'price' || key === 'risk') return av - bv;
  return bv - av;
}

function orderedHalfCards(cards, root) {
  const primary = root.getElementById?.('sort')?.value || 'rank';
  const secondary = root.getElementById?.('sort-secondary')?.value || '';
  return [...cards].sort((a, b) => {
    const first = compareCards(a, b, primary);
    if (first) return first;
    if (secondary && secondary !== primary) {
      const second = compareCards(a, b, secondary);
      if (second) return second;
    }
    return finiteNumber(a.dataset?.rank, 9999) - finiteNumber(b.dataset?.rank, 9999);
  });
}

export function syncHalfCigarSection(root = document) {
  if (!root?.querySelectorAll) return 0;
  const section = ensureHalfCigarSection(root);
  const grid = section?.querySelector?.(`#${GRID_ID}`);
  if (!grid) return 0;

  compactDomCohortRanks(root);
  const cards = Array.from(root.querySelectorAll('article.card[data-key]'))
    .filter(card => card.dataset.archived !== '1' && cardCatalogueType(card) === HALF_TYPE);
  orderedHalfCards(cards, root).forEach(card => {
    updateCardRankVisual(card);
    if (card.parentElement !== grid) grid.appendChild(card);
  });
  section.classList.toggle('hidden', cards.length === 0);
  return cards.length;
}

function collectRows(root = document) {
  return Array.from(root.querySelectorAll?.('article.card[data-key]') || []).map(card => ({
    key: card.dataset.key,
    rank: Math.max(1, Math.round(finiteNumber(card.dataset.rank, 1))),
    catalogueType: cardCatalogueType(card),
    taster: card.dataset.taster === '1',
    archived: card.dataset.archived === '1'
  }));
}

function applyStateMembership(state, root = document) {
  const cards = state && typeof state.cards === 'object' ? state.cards : {};
  root.querySelectorAll?.('article.card[data-key]').forEach(card => {
    const saved = cards[card.dataset.key];
    if (!saved) return;
    if (Object.prototype.hasOwnProperty.call(saved, 'catalogueType')) {
      const type = normaliseCatalogueType(saved.catalogueType, saved.taster);
      card.dataset.catalogueType = type;
      if (type === TASTER_TYPE) card.dataset.taster = '1';
      else delete card.dataset.taster;
    }
    if (saved.rank != null) card.dataset.rank = String(Math.max(1, Math.round(finiteNumber(saved.rank, 1))));
  });
  compactDomCohortRanks(root);
}

async function hydrateMembership(root = document) {
  try {
    const response = await fetch(`${STATE_API}?half_cohort=1`, { cache: 'no-store' });
    if (!response.ok) return false;
    const state = await response.json();
    applyStateMembership(state, root);
    syncHalfCigarSection(root);
    syncEditorType(root);
    return true;
  } catch (_) {
    compactDomCohortRanks(root);
    syncHalfCigarSection(root);
    return false;
  }
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
    select.appendChild(option);
  }
  return select;
}

function selectedEditorCard(root = document) {
  const key = root.getElementById?.(EDITOR_KEY_ID)?.value
    || root.getElementById?.('catalogue-admin-card')?.value
    || '';
  if (!key || key.startsWith('__')) return null;
  try {
    return root.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);
  } catch (_) {
    return Array.from(root.querySelectorAll?.('article.card[data-key]') || []).find(card => card.dataset.key === key) || null;
  }
}

function syncEditorRankBounds(root = document) {
  const typeSelect = ensureEditorTypeOption(root);
  const rankInput = root.getElementById?.(EDITOR_RANK_ID);
  if (!typeSelect || !rankInput) return;
  const type = normaliseCatalogueType(typeSelect.value);
  const selected = selectedEditorCard(root);
  const rows = collectRows(root).filter(row => !row.archived && catalogueTypeForRow(row) === type);
  const selectedInType = selected && cardCatalogueType(selected) === type && selected.dataset.archived !== '1';
  rankInput.max = String(Math.max(1, rows.length + (selectedInType ? 0 : 1)));
  const current = Math.max(1, Math.round(finiteNumber(rankInput.value, 1)));
  if (current > Number(rankInput.max)) rankInput.value = rankInput.max;
}

function syncEditorType(root = document) {
  const select = ensureEditorTypeOption(root);
  const card = selectedEditorCard(root);
  if (!select || !card) return;
  select.value = cardCatalogueType(card);
  const rankInput = root.getElementById?.(EDITOR_RANK_ID);
  if (rankInput) rankInput.value = card.dataset.rank || '1';
  syncEditorRankBounds(root);
}

function installEditorHooks(root = document) {
  const select = ensureEditorTypeOption(root);
  if (!select || select.dataset.halfCohortBound === '1') return;
  select.dataset.halfCohortBound = '1';
  select.addEventListener('change', () => {
    const type = normaliseCatalogueType(select.value);
    const card = selectedEditorCard(root);
    if (!card || card.dataset.archived === '1') {
      const count = collectRows(root).filter(row => !row.archived && catalogueTypeForRow(row) === type).length;
      const rankInput = root.getElementById?.(EDITOR_RANK_ID);
      if (rankInput) rankInput.value = String(count + 1);
    }
    syncEditorRankBounds(root);
  });

  root.getElementById?.('catalogue-admin-card')?.addEventListener('change', () => setTimeout(() => syncEditorType(root), 0));
  root.getElementById?.('catalogue-admin-toggle')?.addEventListener('click', () => setTimeout(() => syncEditorType(root), 0));
}

function editorTarget(root = document) {
  const typeSelect = root.getElementById?.(EDITOR_TYPE_ID);
  const key = root.getElementById?.(EDITOR_KEY_ID)?.value || '';
  const rank = root.getElementById?.(EDITOR_RANK_ID)?.value || 1;
  if (!typeSelect || !key || key.startsWith('__')) return null;
  return {
    key,
    targetType: normaliseCatalogueType(typeSelect.value),
    targetRank: Math.max(1, Math.round(finiteNumber(rank, 1)))
  };
}

function patchStatePayloadForEditor(payload, root = document) {
  const target = editorTarget(root);
  if (!target || !payload || typeof payload !== 'object') return payload;
  const rows = collectRows(root);
  const cards = payload.cards && typeof payload.cards === 'object' ? payload.cards : {};
  const rankUpdates = normaliseAllCohortRanks(rows, cards, target.key, target.targetType, target.targetRank);
  return { ...payload, cards: { ...cards, ...rankUpdates } };
}

function installSaveInterceptor(root = document) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || window.__catalogueHalfCohortFetchWrapped) return;
  window.__catalogueHalfCohortFetchWrapped = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || 'GET').toUpperCase();
    let nextInit = init;
    let patchedState = false;
    if (method === 'PUT' && href.split('?')[0] === STATE_API && typeof init.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        const patched = patchStatePayloadForEditor(payload, root);
        nextInit = { ...init, body: JSON.stringify(patched) };
        patchedState = true;
      } catch (_) {}
    }
    const response = await originalFetch(input, nextInit);
    if (patchedState && response.ok) setTimeout(() => hydrateMembership(root), 0);
    return response;
  };
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

  if (taster.parentElement.dataset.halfCohortDelegated !== '1') {
    taster.parentElement.dataset.halfCohortDelegated = '1';
    taster.parentElement.addEventListener('click', event => {
      const control = event.target?.closest?.('button[data-filter]');
      if (!control || control.dataset.filter === HALF_TYPE) return;
      setTimeout(() => {
        root.getElementById?.('tasters-section')?.classList.remove('hidden');
        root.getElementById?.('archived-section')?.classList.remove('hidden');
        const section = ensureHalfCigarSection(root);
        const visibleHalf = Array.from(section?.querySelectorAll?.('article.card') || []).some(card => !card.classList.contains('hidden'));
        section?.classList.toggle('hidden', !visibleHalf);
      }, 0);
    });
  }
  return button;
}

let refreshTimer = 0;
function scheduleRefresh(root = document) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    ensureStyle(root);
    ensureHalfCigarSection(root);
    ensureHalfFilter(root);
    installEditorHooks(root);
    syncHalfCigarSection(root);
  }, 0);
}

export function installHalfCigarCohort(root = document) {
  if (typeof document === 'undefined' || !root) return;
  ensureStyle(root);
  ensureHalfCigarSection(root);
  ensureHalfFilter(root);
  installEditorHooks(root);
  installSaveInterceptor(root);
  compactDomCohortRanks(root);
  hydrateMembership(root);

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
