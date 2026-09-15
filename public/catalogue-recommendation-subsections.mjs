import {
  registerCatalogueStateTransform,
  registerCatalogueStateResponseListener
} from './catalogue-save-pipeline.mjs';

export const DEFAULT_RECOMMENDATION_SUBSECTIONS = Object.freeze([
  Object.freeze({
    id: 'coronets-cigarillos',
    title: 'Coronets & Cigarillos',
    note: 'Ring gauge 34 and under.'
  }),
  Object.freeze({
    id: 'petit-panatelas',
    title: 'Petit Panatelas',
    note: 'Ring gauge 35 and over.'
  }),
  Object.freeze({
    id: 'flavoured-infused',
    title: 'Flavoured & Infused Cigars',
    note: 'Sweetened, aromatic and infused profiles.'
  })
]);

const STATE_API = '/api/catalogue-overrides';
const SUBSECTION_SELECT_ID = 'catalogue-admin-subsection';
const SUBSECTION_EDITOR_ID = 'catalogue-admin-subsection-editor';
let runtimeState = null;
let refreshTimer = 0;
let renderingSubsectionBlocks = false;
export let recommendationSubsectionRenderCount = 0;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneDefaults() {
  return DEFAULT_RECOMMENDATION_SUBSECTIONS.map(section => ({ ...section, entryKeys: [] }));
}

function cleanKey(value) {
  return String(value || '').trim();
}

function cleanId(value) {
  const id = String(value || '').trim();
  return /^[a-z0-9][a-z0-9_-]*$/i.test(id) ? id : '';
}

function validSubsection(value) {
  return isRecord(value)
    && Boolean(cleanId(value.id))
    && typeof value.title === 'string'
    && typeof value.note === 'string'
    && Array.isArray(value.entryKeys);
}

export function normaliseSubsections(value) {
  if (!Array.isArray(value) || !value.length || !value.every(validSubsection)) return cloneDefaults();
  const seenIds = new Set();
  const output = [];
  for (const raw of value) {
    const id = cleanId(raw.id);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    output.push({
      id,
      title: String(raw.title),
      note: String(raw.note),
      entryKeys: Array.from(raw.entryKeys || []).map(cleanKey).filter(Boolean)
    });
  }
  return output.length ? output : cloneDefaults();
}

function elementDataset(card) {
  return card?.dataset && typeof card.dataset === 'object' ? card.dataset : {};
}

function cardKey(card) {
  return cleanKey(elementDataset(card).key || card?.key);
}

function stateCard(state, key) {
  return isRecord(state?.cards?.[key]) ? state.cards[key] : {};
}

function stateEntry(state, key) {
  return isRecord(state?.entries?.[key]) ? state.entries[key] : {};
}

function catalogueType(card, state = null) {
  const key = cardKey(card);
  const saved = stateCard(state, key);
  const explicit = String(
    elementDataset(card).catalogueType
    || card?.catalogueType
    || saved.catalogueType
    || stateEntry(state, key).catalogueType
    || ''
  ).trim().toLowerCase();
  const taster = elementDataset(card).taster === '1' || Boolean(card?.taster ?? saved.taster ?? stateEntry(state, key).taster);
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || taster) return 'taster';
  return 'main';
}

function isArchived(card, state = null) {
  const key = cardKey(card);
  const saved = stateCard(state, key);
  return elementDataset(card).archived === '1' || Boolean(card?.archived ?? saved.archived ?? stateEntry(state, key).archived);
}

function priorRank(card, state = null) {
  const key = cardKey(card);
  const candidates = [
    elementDataset(card).rank,
    card?.rank,
    stateCard(state, key).rank,
    stateEntry(state, key).rank
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 1) return number;
  }
  return Number.MAX_SAFE_INTEGER;
}

function productionLines(card, state = null) {
  if (Array.isArray(card?.productionLines)) return card.productionLines.map(value => String(value));
  const key = cardKey(card);
  if (Array.isArray(stateEntry(state, key).productionLines)) return stateEntry(state, key).productionLines.map(value => String(value));
  const node = card?.querySelector?.('.artmeta-left');
  if (!node) return [];
  const children = Array.from(node.querySelectorAll?.('.artmeta-line') || []);
  if (children.length) return children.map(child => String(child.textContent || ''));
  return Array.from(node.children || [])
    .filter(child => !child.classList?.contains?.('artmeta-title'))
    .map(child => String(child.textContent || ''));
}

function exactFlavoured(card, state = null) {
  return productionLines(card, state).some(line => String(line).trim().toLowerCase() === 'flavoured');
}

function sizeDimensionsText(card) {
  if (typeof card?.sizeText === 'string' && card.sizeText.trim()) return card.sizeText;
  const facts = Array.from(card?.querySelectorAll?.('.facts > div') || []);
  const dimensions = facts.find(node => /[×x]/i.test(String(node?.querySelector?.('b')?.textContent || node?.textContent || '')));
  return String(dimensions?.querySelector?.('b')?.textContent || dimensions?.textContent || '');
}

function ringFromDimensions(text) {
  const source = String(text || '');
  if (!source) return null;
  // Catalogue dimensions are length × ring gauge. Ring gauge is the two-digit value.
  const after = source.match(/[×x]\s*(\d{2})(?!\d)/i);
  if (after) return Number(after[1]);
  const before = source.match(/(?:^|\D)(\d{2})\s*[×x]/i);
  return before ? Number(before[1]) : null;
}

export function resolveRingGauge(card, state = {}) {
  const key = cardKey(card);
  const art = card?.querySelector?.('.artframe');
  const visualCandidates = [
    art?.dataset?.visualRing,
    elementDataset(card).visualRing,
    card?.visualRing,
    card?.ring
  ];
  for (const value of visualCandidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 10 && number <= 99) return Math.round(number);
  }
  const entryRing = Number(stateEntry(state, key).ring);
  if (Number.isFinite(entryRing) && entryRing >= 10 && entryRing <= 99) return Math.round(entryRing);
  return ringFromDimensions(sizeDimensionsText(card));
}

export function seedSubsectionForCard(card, state = {}) {
  if (exactFlavoured(card, state)) return 'flavoured-infused';
  const ring = resolveRingGauge(card, state);
  if (ring !== null && ring >= 35) return 'petit-panatelas';
  return 'coronets-cigarillos';
}

function cardMap(cards) {
  const map = new Map();
  for (const card of Array.from(cards || [])) {
    const key = cardKey(card);
    if (key && !map.has(key)) map.set(key, card);
  }
  return map;
}

function ensureStateShape(state) {
  const target = isRecord(state) ? state : {};
  if (!isRecord(target.cards)) target.cards = {};
  if (!isRecord(target.sections)) target.sections = {};
  if (!isRecord(target.entries)) target.entries = {};
  return target;
}

export function syncRecommendationRanks(state) {
  const target = ensureStateShape(state);
  const subsections = normaliseSubsections(target.sections.recommendationSubsections);
  target.sections.recommendationSubsections = subsections;
  const members = new Set();

  subsections.forEach(section => {
    section.entryKeys.forEach((key, index) => {
      members.add(key);
      const existing = isRecord(target.cards[key]) ? target.cards[key] : {};
      target.cards[key] = { ...existing, rank: index + 1, subsection: section.id };
    });
  });

  for (const [key, raw] of Object.entries(target.cards)) {
    if (!isRecord(raw) || members.has(key) || !Object.prototype.hasOwnProperty.call(raw, 'subsection')) continue;
    const next = { ...raw };
    delete next.subsection;
    const type = String(next.catalogueType || '').trim().toLowerCase();
    const isHalfOrTaster = type === 'half' || type === 'half-cigar' || type === 'halfcigar' || type === 'taster' || Boolean(next.taster);
    if (!isHalfOrTaster) delete next.rank;
    target.cards[key] = next;
  }
  return target;
}

export function reconcileRecommendationSubsections(state, cards = []) {
  const target = ensureStateShape(state);
  const subsections = normaliseSubsections(target.sections.recommendationSubsections);
  target.sections.recommendationSubsections = subsections;
  const byKey = cardMap(cards);
  const seen = new Set();

  for (const section of subsections) {
    const kept = [];
    for (const rawKey of section.entryKeys) {
      const key = cleanKey(rawKey);
      const card = byKey.get(key);
      if (!key || !card || seen.has(key) || isArchived(card, target) || catalogueType(card, target) !== 'main') continue;
      seen.add(key);
      kept.push(key);
    }
    section.entryKeys = kept;
  }

  const missing = Array.from(byKey.values())
    .filter(card => {
      const key = cardKey(card);
      return key && !seen.has(key) && !isArchived(card, target) && catalogueType(card, target) === 'main';
    })
    .sort((a, b) => priorRank(a, target) - priorRank(b, target));

  for (const card of missing) {
    const key = cardKey(card);
    let destinationId = seedSubsectionForCard(card, target);
    let destination = subsections.find(section => section.id === destinationId);
    if (!destination) destination = subsections[0];
    destination.entryKeys.push(key);
    seen.add(key);
  }

  syncRecommendationRanks(target);
  return target;
}

export function moveEntryToSubsection(state, keyInput, subsectionId, position = 1) {
  const target = ensureStateShape(state);
  const key = cleanKey(keyInput);
  const subsections = normaliseSubsections(target.sections.recommendationSubsections);
  target.sections.recommendationSubsections = subsections;
  if (!key) return target;
  subsections.forEach(section => {
    section.entryKeys = section.entryKeys.filter(item => item !== key);
  });
  const destination = subsections.find(section => section.id === subsectionId) || subsections[0];
  const number = Number(position);
  const index = Math.max(0, Math.min(destination.entryKeys.length, (Number.isFinite(number) ? Math.round(number) : 1) - 1));
  destination.entryKeys.splice(index, 0, key);
  syncRecommendationRanks(target);
  return target;
}

export function removeEntryFromRecommendationSubsections(state, keyInput) {
  const target = ensureStateShape(state);
  const key = cleanKey(keyInput);
  target.sections.recommendationSubsections = normaliseSubsections(target.sections.recommendationSubsections);
  target.sections.recommendationSubsections.forEach(section => {
    section.entryKeys = section.entryKeys.filter(item => item !== key);
  });
  syncRecommendationRanks(target);
  return target;
}

function effectiveStock(card) {
  const pin = String(elementDataset(card).stockPin || '').trim().toLowerCase();
  if (pin === 'in' || pin === 'out' || pin === 'hold') return pin;
  return String(elementDataset(card).stock || '').trim().toLowerCase();
}

function unavailable(card) {
  return Boolean(card?.classList?.contains?.('is-unavailable'))
    || Boolean(card?.closest?.('.unavailable-grid'))
    || ['out', 'delisted'].includes(effectiveStock(card));
}

function documentFor(root) {
  if (root?.createElement) return root;
  if (root?.ownerDocument?.createElement) return root.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

function cardsForRoot(root) {
  return Array.from(root?.querySelectorAll?.('article.card[data-key]') || []);
}

function refreshRankVisual(card) {
  const rank = Math.max(1, Number(card?.dataset?.rank) || 1);
  const flag = card?.querySelector?.('.rankflag');
  const label = flag?.querySelector?.('span');
  const value = flag?.querySelector?.('b');
  if (label && label.textContent !== 'No.') label.textContent = 'No.';
  if (value && value.textContent !== String(rank)) value.textContent = String(rank);
}

function blockVisibility(block) {
  if (!block?.querySelectorAll) return false;
  const visible = Array.from(block.querySelectorAll('article.card')).some(card => !card.classList?.contains?.('hidden'));
  const shouldHide = !visible;
  const wasHidden = Boolean(block.classList?.contains?.('hidden'));
  if (wasHidden === shouldHide) return false;
  block.classList?.toggle?.('hidden', shouldHide);
  return true;
}

function renderSubsectionBlocksInternal(root, state) {
  const target = ensureStateShape(state || {});
  const container = root.getElementById?.('cards') || root.querySelector('#cards');
  if (!container) return 0;
  const doc = documentFor(root);
  if (!doc) return 0;
  const subsections = normaliseSubsections(target.sections.recommendationSubsections);
  target.sections.recommendationSubsections = subsections;
  const flatMain = root.getElementById?.('flat-main') || root.querySelector('#flat-main');
  const sort = root.getElementById?.('sort') || root.querySelector('#sort');
  const rankSortActive = !sort?.value || sort.value === 'rank';
  let visibilityRelevantChange = false;

  const existingBlocks = new Map(Array.from(container.querySelectorAll?.(':scope > [data-recommendation-subsection]') || [])
    .map(block => [block.dataset.recommendationSubsection, block]));
  const orderedBlocks = [];

  for (const section of subsections) {
    let block = existingBlocks.get(section.id);
    if (!block) {
      block = doc.createElement('div');
      block.className = 'tier-block';
      block.dataset.recommendationSubsection = section.id;
      const heading = doc.createElement('h3');
      heading.className = 'tier-heading';
      const note = doc.createElement('p');
      note.className = 'subtier-note';
      const grid = doc.createElement('div');
      grid.className = 'grid tier-grid';
      block.append(heading, note, grid);
    }
    if (block.dataset.recommendationSubsection !== section.id) block.dataset.recommendationSubsection = section.id;
    const heading = block.querySelector('.tier-heading');
    const note = block.querySelector('.subtier-note');
    const grid = block.querySelector('.tier-grid') || block.querySelector('.grid');
    if (heading && heading.textContent !== section.title) {
      heading.textContent = section.title;
      visibilityRelevantChange = true;
    }
    if (note && note.textContent !== section.note) {
      note.textContent = section.note;
      visibilityRelevantChange = true;
    }
    if (grid && grid.id !== `recommendation-${section.id}`) grid.id = `recommendation-${section.id}`;
    orderedBlocks.push(block);
  }

  Array.from(container.querySelectorAll?.(':scope > [data-recommendation-subsection]') || []).forEach(block => {
    if (!subsections.some(section => section.id === block.dataset.recommendationSubsection)) block.remove();
  });

  let anchor = flatMain || null;
  for (const block of orderedBlocks) {
    if (anchor?.nextSibling !== block) container.insertBefore(block, anchor?.nextSibling || container.firstChild || null);
    anchor = block;
  }

  const byKey = new Map(cardsForRoot(root).map(card => [cardKey(card), card]));
  for (const section of subsections) {
    const grid = root.getElementById?.(`recommendation-${section.id}`) || container.querySelector(`#recommendation-${section.id}`);
    if (!grid) continue;
    if (rankSortActive) {
      let visibleIndex = 0;
      for (const [index, key] of section.entryKeys.entries()) {
        const card = byKey.get(key);
        if (!card || isArchived(card, target) || catalogueType(card, target) !== 'main' || unavailable(card)) continue;
        const rank = String(index + 1);
        if (card.dataset.rank !== rank) card.dataset.rank = rank;
        if (card.dataset.subsection !== section.id) card.dataset.subsection = section.id;
        refreshRankVisual(card);
        const expected = grid.children?.[visibleIndex] || null;
        if (expected !== card) {
          grid.insertBefore(card, expected);
          visibilityRelevantChange = true;
        }
        visibleIndex += 1;
      }
    }
    if (blockVisibility(grid.parentElement)) visibilityRelevantChange = true;
  }
  if (rankSortActive) flatMain?.classList?.add?.('hidden');
  if (visibilityRelevantChange) globalThis?.window?.refreshGroupVisibility?.();
  return subsections.length;
}

export function renderSubsectionBlocks(root = document, state = runtimeState) {
  if (!root?.querySelector) return 0;
  renderingSubsectionBlocks = true;
  recommendationSubsectionRenderCount += 1;
  try {
    return renderSubsectionBlocksInternal(root, state);
  } finally {
    renderingSubsectionBlocks = false;
  }
}

function currentSubsections() {
  if (!runtimeState) return cloneDefaults();
  runtimeState.sections = isRecord(runtimeState.sections) ? runtimeState.sections : {};
  runtimeState.sections.recommendationSubsections = normaliseSubsections(runtimeState.sections.recommendationSubsections);
  return runtimeState.sections.recommendationSubsections;
}

function ensureSubsectionSelect(root = document) {
  const existing = root.getElementById?.(SUBSECTION_SELECT_ID);
  if (existing) return existing;
  const sectionSelect = root.getElementById?.('catalogue-admin-section');
  if (!sectionSelect?.parentElement) return null;
  const doc = documentFor(root);
  const field = doc.createElement('div');
  field.className = 'catalogue-admin-field';
  field.innerHTML = `<label for="${SUBSECTION_SELECT_ID}">Recommendation subsection</label><select id="${SUBSECTION_SELECT_ID}"></select>`;
  sectionSelect.parentElement.insertAdjacentElement?.('afterend', field);
  return field.querySelector('select');
}

function populateSubsectionSelect(root = document) {
  const select = ensureSubsectionSelect(root);
  if (!select) return null;
  const previous = select.value;
  select.innerHTML = '';
  for (const section of currentSubsections()) {
    const option = documentFor(root).createElement('option');
    option.value = section.id;
    option.textContent = section.title;
    select.appendChild(option);
  }
  if (Array.from(select.options || []).some(option => option.value === previous)) select.value = previous;
  return select;
}

function selectedAdminKey(root = document) {
  const direct = root.getElementById?.('catalogue-v139-key')?.value || '';
  if (direct && !direct.startsWith('__')) return direct;
  const select = root.getElementById?.('catalogue-admin-card');
  return select?.value && !select.value.startsWith('__') ? select.value : '';
}

function cardForKey(root, key) {
  if (!key) return null;
  return cardsForRoot(root).find(card => cardKey(card) === key) || null;
}

function subsectionForKey(key) {
  return currentSubsections().find(section => section.entryKeys.includes(key)) || currentSubsections()[0] || null;
}

function syncAdminSelection(root = document) {
  const select = populateSubsectionSelect(root);
  const rank = root.getElementById?.('catalogue-admin-rank');
  const type = root.getElementById?.('catalogue-v139-type');
  const sectionState = root.getElementById?.('catalogue-admin-section');
  if (!select) return;
  const key = selectedAdminKey(root);
  const member = subsectionForKey(key);
  if (member) select.value = member.id;
  const card = cardForKey(root, key);
  const isMain = !type || String(type.value || card?.dataset?.catalogueType || 'main') === 'main';
  const archived = sectionState?.value === 'archived' || card?.dataset?.archived === '1';
  select.disabled = !isMain || archived;
  if (rank && isMain && !archived && member) {
    const position = member.entryKeys.indexOf(key);
    if (position >= 0) rank.value = String(position + 1);
    const movingIn = position < 0;
    rank.max = String(Math.max(1, member.entryKeys.length + (movingIn ? 1 : 0)));
  }
}

function ensureSubsectionEditor(root = document) {
  let panel = root.getElementById?.(SUBSECTION_EDITOR_ID);
  if (panel) return panel;
  const actions = root.querySelector?.('.catalogue-admin-actions');
  if (!actions?.parentElement) return null;
  const doc = documentFor(root);
  panel = doc.createElement('div');
  panel.id = SUBSECTION_EDITOR_ID;
  panel.className = 'catalogue-admin-subsection-editor';
  actions.parentElement.insertBefore(panel, actions);
  return panel;
}

export function renderSubsectionEditor(root = document) {
  const panel = ensureSubsectionEditor(root);
  if (!panel) return null;
  const doc = documentFor(root);
  panel.innerHTML = '';
  const heading = doc.createElement('div');
  heading.className = 'catalogue-admin-subhead';
  heading.textContent = 'Recommendation subsections';
  panel.appendChild(heading);
  currentSubsections().forEach((section, index, sections) => {
    const row = doc.createElement('div');
    row.className = 'catalogue-admin-subsection-row';
    row.dataset.subsectionId = section.id;
    row.innerHTML = `<div class="catalogue-admin-field"><label>Title</label><input data-subsection-field="title" value=""></div><div class="catalogue-admin-field"><label>Note</label><input data-subsection-field="note" value=""></div><div class="catalogue-admin-actions"><button type="button" data-subsection-move="up">Move up</button><button type="button" data-subsection-move="down">Move down</button></div>`;
    row.querySelector('[data-subsection-field="title"]').value = section.title;
    row.querySelector('[data-subsection-field="note"]').value = section.note;
    row.querySelector('[data-subsection-move="up"]').disabled = index === 0;
    row.querySelector('[data-subsection-move="down"]').disabled = index === sections.length - 1;
    panel.appendChild(row);
  });
  return panel;
}

function commitSubsectionEditor(root = document) {
  const panel = root.getElementById?.(SUBSECTION_EDITOR_ID);
  if (!panel) return;
  const byId = new Map(currentSubsections().map(section => [section.id, section]));
  panel.querySelectorAll?.('[data-subsection-id]').forEach(row => {
    const section = byId.get(row.dataset.subsectionId);
    if (!section) return;
    section.title = String(row.querySelector('[data-subsection-field="title"]')?.value ?? section.title);
    section.note = String(row.querySelector('[data-subsection-field="note"]')?.value ?? section.note);
  });
}

function moveSubsection(root, id, direction) {
  commitSubsectionEditor(root);
  const sections = currentSubsections();
  const index = sections.findIndex(section => section.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= sections.length) return;
  const [section] = sections.splice(index, 1);
  sections.splice(target, 0, section);
  renderSubsectionEditor(root);
  populateSubsectionSelect(root);
  renderSubsectionBlocks(root, runtimeState);
}

function editorTarget(root = document) {
  const key = selectedAdminKey(root);
  const type = root.getElementById?.('catalogue-v139-type')?.value || 'main';
  const archived = root.getElementById?.('catalogue-admin-section')?.value === 'archived';
  const subsectionId = root.getElementById?.(SUBSECTION_SELECT_ID)?.value || '';
  const position = Math.max(1, Math.round(Number(root.getElementById?.('catalogue-admin-rank')?.value) || 1));
  return { key, type, archived, subsectionId, position };
}

function collectLiveCards(root = document) {
  return cardsForRoot(root);
}

function preparePayload(payload, root = document) {
  if (!isRecord(payload)) return payload;
  const next = {
    ...payload,
    cards: { ...(isRecord(payload.cards) ? payload.cards : {}) },
    sections: { ...(isRecord(payload.sections) ? payload.sections : {}) },
    entries: isRecord(payload.entries) ? payload.entries : (runtimeState?.entries || {})
  };
  const base = runtimeState
    ? { ...runtimeState, cards: next.cards, sections: { ...runtimeState.sections, ...next.sections }, entries: next.entries }
    : { version: 3, cards: next.cards, sections: next.sections, entries: next.entries };
  commitSubsectionEditor(root);
  if (runtimeState?.sections?.recommendationSubsections) {
    base.sections.recommendationSubsections = normaliseSubsections(runtimeState.sections.recommendationSubsections);
  }
  reconcileRecommendationSubsections(base, collectLiveCards(root));
  const target = editorTarget(root);
  if (target.key) {
    if (target.archived || target.type !== 'main') removeEntryFromRecommendationSubsections(base, target.key);
    else moveEntryToSubsection(base, target.key, target.subsectionId || seedSubsectionForCard(cardForKey(root, target.key), base), target.position);
  }
  syncRecommendationRanks(base);
  runtimeState = base;
  return { ...next, cards: base.cards, sections: base.sections };
}

function bindAdmin(root = document) {
  const select = populateSubsectionSelect(root);
  renderSubsectionEditor(root);
  if (select && select.dataset.recommendationSubsectionsBound !== '1') {
    select.dataset.recommendationSubsectionsBound = '1';
    select.addEventListener('change', () => {
      const key = selectedAdminKey(root);
      const destination = currentSubsections().find(section => section.id === select.value);
      const rank = root.getElementById?.('catalogue-admin-rank');
      const alreadyThere = destination?.entryKeys.includes(key);
      if (rank && destination) {
        rank.max = String(Math.max(1, destination.entryKeys.length + (alreadyThere ? 0 : 1)));
        if (Number(rank.value) > Number(rank.max)) rank.value = rank.max;
      }
    });
  }
  const panel = root.getElementById?.(SUBSECTION_EDITOR_ID);
  if (panel && panel.dataset.recommendationSubsectionsBound !== '1') {
    panel.dataset.recommendationSubsectionsBound = '1';
    panel.addEventListener('input', event => {
      if (!event.target?.matches?.('[data-subsection-field]')) return;
      commitSubsectionEditor(root);
      populateSubsectionSelect(root);
      renderSubsectionBlocks(root, runtimeState);
    });
    panel.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-subsection-move]');
      if (!button) return;
      const row = button.closest('[data-subsection-id]');
      if (row) moveSubsection(root, row.dataset.subsectionId, button.dataset.subsectionMove);
    });
  }
  for (const id of ['catalogue-admin-card', 'catalogue-v139-type', 'catalogue-admin-section']) {
    const control = root.getElementById?.(id);
    if (control && control.dataset.recommendationSubsectionsBound !== '1') {
      control.dataset.recommendationSubsectionsBound = '1';
      control.addEventListener('change', () => setTimeout(() => syncAdminSelection(root), 0));
    }
  }
  syncAdminSelection(root);
}

function hydrateRuntimeState(state, root = document) {
  if (!isRecord(state)) return null;
  runtimeState = {
    version: 3,
    cards: { ...(isRecord(state.cards) ? state.cards : {}) },
    sections: { ...(isRecord(state.sections) ? state.sections : {}) },
    entries: { ...(isRecord(state.entries) ? state.entries : {}) }
  };
  reconcileRecommendationSubsections(runtimeState, collectLiveCards(root));
  for (const card of collectLiveCards(root)) {
    const saved = runtimeState.cards[cardKey(card)];
    if (!saved) continue;
    if (saved.rank != null) card.dataset.rank = String(saved.rank);
    if (saved.subsection) card.dataset.subsection = saved.subsection;
  }
  renderSubsectionBlocks(root, runtimeState);
  bindAdmin(root);
  return runtimeState;
}

function scheduleRefresh(root = document) {
  if (renderingSubsectionBlocks || refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    if (!runtimeState) return;
    reconcileRecommendationSubsections(runtimeState, collectLiveCards(root));
    renderSubsectionBlocks(root, runtimeState);
    syncAdminSelection(root);
  }, 0);
}

async function initialRead(root = document) {
  try {
    const response = await fetch(STATE_API, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    return hydrateRuntimeState(await response.json(), root);
  } catch (_) {
    return null;
  }
}

export function installRecommendationSubsections(root = document) {
  if (typeof document === 'undefined' || !root) return;
  registerCatalogueStateTransform('recommendation-subsections', 90, payload => preparePayload(payload, root));
  registerCatalogueStateResponseListener('recommendation-subsections', event => {
    if (event?.state) hydrateRuntimeState(event.state, root);
  });
  initialRead(root);
  root.getElementById?.('sort')?.addEventListener('change', () => scheduleRefresh(root));
  root.addEventListener?.('catalogue:cards-refreshed', () => scheduleRefresh(root));
  root.querySelectorAll?.('.toggle button').forEach(button => {
    button.addEventListener('click', () => scheduleRefresh(root));
  });
  const observationRoot = root.getElementById?.('cards') || root.querySelector?.('#cards');
  if (typeof MutationObserver !== 'undefined' && observationRoot) {
    const observer = new MutationObserver(() => scheduleRefresh(root));
    observer.observe(observationRoot, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-key', 'data-rank', 'data-subsection', 'data-archived', 'data-catalogue-type', 'data-taster', 'data-stock', 'data-stock-pin']
    });
  }
}

if (typeof document !== 'undefined') installRecommendationSubsections(document);
