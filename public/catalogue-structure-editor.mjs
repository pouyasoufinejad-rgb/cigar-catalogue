import {
  registerCatalogueStateTransform,
  registerCatalogueStateResponseListener
} from './catalogue-save-pipeline.mjs';
import {
  normaliseCatalogueType,
  validateRecommendationSubsectionsShape,
  recommendationLocation,
  addRecommendationSubsection,
  updateRecommendationSubsection,
  reorderRecommendationSubsections,
  deleteRecommendationSubsection,
  assertRecommendationInventory,
  applyCatalogueStructuralChange
} from './catalogue-structure.mjs';
import { adminWriteFetch } from './catalogue-admin-unified-v139.mjs';

const STATE_API = '/api/catalogue-overrides';
const TYPE_ID = 'catalogue-v139-type';
const RANK_ID = 'catalogue-admin-rank';
const CARD_SELECT_ID = 'catalogue-admin-card';
const KEY_ID = 'catalogue-v139-key';
const SECTION_STATE_ID = 'catalogue-admin-section';
const SUBSECTION_SELECT_ID = 'catalogue-admin-recommendation-subsection';
const SUBSECTION_MANAGER_ID = 'catalogue-admin-subsection-manager';
const STRUCTURE_TRANSFORM = 'catalogue-v4-structure';
const ARM_WINDOW_MS = 30000;

let persistedState = { version: 3, cards: {}, entries: {}, sections: {} };
let draftSubsections = [];
let armedSave = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function q(id, root = document) {
  return root?.getElementById?.(id) || root?.querySelector?.(`#${id}`) || null;
}

function setStatus(message, error = false, root = document) {
  const node = q('catalogue-admin-status', root);
  if (!node) return;
  node.textContent = String(message || '');
  node.classList?.toggle?.('error', Boolean(error));
}

function structuralPatch(card) {
  const type = normaliseCatalogueType(card?.catalogueType, Boolean(card?.taster));
  const patch = {
    catalogueType: type,
    taster: type === 'taster',
    archived: Boolean(card?.archived),
    archivedAt: card?.archived ? String(card?.archivedAt || '') : ''
  };
  if (!patch.archived && (type === 'half' || type === 'taster')) patch.rank = Number(card?.rank) || 1;
  return patch;
}

function mergeStructuralPatch(existing, card, { removeMainRank = false } = {}) {
  const output = { ...record(existing), ...structuralPatch(card) };
  const type = normaliseCatalogueType(card?.catalogueType, Boolean(card?.taster));
  if (output.archived || (removeMainRank && type === 'main')) delete output.rank;
  return output;
}

export function preserveExplicitStructure(payloadInput, persistedInput) {
  const payload = record(payloadInput);
  const persisted = record(persistedInput);
  const explicit = Array.isArray(payload.recommendationSubsections)
    ? payload.recommendationSubsections
    : Array.isArray(persisted.recommendationSubsections)
      ? persisted.recommendationSubsections
      : null;
  if (!explicit) return payload;
  return {
    ...payload,
    version: 4,
    recommendationSubsections: validateRecommendationSubsectionsShape(explicit)
  };
}

function effectiveCardsFromRows(rows, persistedStateInput, payloadCards) {
  const persisted = record(persistedStateInput);
  const cards = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key || '').trim();
    if (!key) continue;
    const entry = record(persisted.entries?.[key]);
    const saved = record(persisted.cards?.[key]);
    const outgoing = record(payloadCards?.[key]);
    const combined = { ...entry, ...saved, ...outgoing, ...row };
    const type = normaliseCatalogueType(combined.catalogueType, Boolean(combined.taster));
    cards[key] = {
      ...combined,
      catalogueType: type,
      taster: type === 'taster',
      archived: Boolean(combined.archived)
    };
  }
  return cards;
}

export function prepareV4StructuralPayload({
  payload: payloadInput,
  persistedState: persistedInput,
  rows,
  key: keyInput,
  targetType,
  targetSubsectionId = '',
  targetPosition,
  wantsArchived = false,
  now = new Date().toISOString()
} = {}) {
  const persisted = record(persistedInput);
  if (!Array.isArray(persisted.recommendationSubsections)) {
    throw new Error('Explicit Recommendation subsection state is not available.');
  }
  const payload = preserveExplicitStructure(record(payloadInput), persisted);
  const key = String(keyInput || '').trim();
  if (!key) throw new Error('Catalogue entry key is required for a structural save.');

  const cards = effectiveCardsFromRows(rows, persisted, payload.cards);
  if (!cards[key]) {
    const entry = record(persisted.entries?.[key]);
    const saved = record(persisted.cards?.[key]);
    const outgoing = record(payload.cards?.[key]);
    cards[key] = {
      ...entry,
      ...saved,
      ...outgoing,
      catalogueType: normaliseCatalogueType(targetType),
      taster: normaliseCatalogueType(targetType) === 'taster',
      archived: false
    };
  }

  const result = applyCatalogueStructuralChange({
    cards,
    recommendationSubsections: payload.recommendationSubsections,
    key,
    targetType,
    targetSubsectionId,
    targetPosition,
    wantsArchived,
    now
  });

  const outputCards = { ...record(payload.cards) };
  for (const [rowKey, card] of Object.entries(result.cards)) {
    const type = normaliseCatalogueType(card.catalogueType, Boolean(card.taster));
    if (type === 'half' || type === 'taster' || rowKey === key) {
      outputCards[rowKey] = mergeStructuralPatch(outputCards[rowKey], card, {
        removeMainRank: rowKey === key && type === 'main'
      });
    }
  }

  const structuralRows = Object.entries(result.cards).map(([rowKey, card]) => ({
    key: rowKey,
    catalogueType: normaliseCatalogueType(card.catalogueType, Boolean(card.taster)),
    archived: Boolean(card.archived)
  }));
  assertRecommendationInventory({
    subsections: result.recommendationSubsections,
    activeRecommendationKeys: structuralRows
      .filter(row => !row.archived && row.catalogueType === 'main')
      .map(row => row.key),
    forbiddenKeys: structuralRows
      .filter(row => row.archived || row.catalogueType !== 'main')
      .map(row => row.key)
  });

  return {
    ...payload,
    version: 4,
    cards: outputCards,
    recommendationSubsections: result.recommendationSubsections
  };
}

export function generatedSubsectionId(name, existingIdsInput = new Set()) {
  const existingIds = existingIdsInput instanceof Set ? existingIdsInput : new Set(existingIdsInput || []);
  const base = String(name || 'subsection').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'subsection';
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function sourceForKey(key) {
  return {
    ...record(persistedState.entries?.[key]),
    ...record(persistedState.cards?.[key])
  };
}

function domRows(root = document, payloadCards = {}) {
  const rows = [];
  const seen = new Set();
  Array.from(root?.querySelectorAll?.('article.card[data-key]') || []).forEach(card => {
    const key = String(card?.dataset?.key || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const source = { ...sourceForKey(key), ...record(payloadCards?.[key]) };
    const type = normaliseCatalogueType(source.catalogueType || card.dataset.catalogueType, source.taster === true || card.dataset.taster === '1');
    rows.push({
      key,
      catalogueType: type,
      taster: type === 'taster',
      archived: source.archived === true || card.dataset.archived === '1',
      archivedAt: source.archivedAt || card.dataset.archivedAt || '',
      rank: Number(source.rank ?? card.dataset.rank) || 1
    });
  });

  const extraKeys = new Set([
    ...Object.keys(record(persistedState.cards)),
    ...Object.keys(record(persistedState.entries)),
    ...(Array.isArray(persistedState.recommendationSubsections)
      ? persistedState.recommendationSubsections.flatMap(section => section.entryKeys)
      : [])
  ]);
  for (const key of extraKeys) {
    if (seen.has(key)) continue;
    const source = { ...sourceForKey(key), ...record(payloadCards?.[key]) };
    const type = normaliseCatalogueType(source.catalogueType, Boolean(source.taster));
    rows.push({
      key,
      catalogueType: type,
      taster: type === 'taster',
      archived: Boolean(source.archived),
      archivedAt: source.archivedAt || '',
      rank: Number(source.rank) || 1
    });
  }
  return rows;
}

function selectedKey(root = document) {
  const selected = String(q(CARD_SELECT_ID, root)?.value || '').trim();
  if (selected && !selected.startsWith('__')) return selected;
  return String(q(KEY_ID, root)?.value || '').trim();
}

function ensureHalfOption(root = document) {
  const select = q(TYPE_ID, root);
  if (!select) return null;
  if (!Array.from(select.options || []).some(option => option.value === 'half')) {
    const option = root.createElement?.('option') || root.ownerDocument?.createElement?.('option');
    if (option) {
      option.value = 'half';
      option.textContent = 'Half-Cigar';
      const taster = Array.from(select.options || []).find(item => item.value === 'taster');
      if (taster) select.insertBefore(option, taster);
      else select.appendChild(option);
    }
  }
  return select;
}

function ensureSubsectionControls(root = document) {
  ensureHalfOption(root);
  const grid = q('catalogue-v139-structure-grid', root);
  if (grid && !q(SUBSECTION_SELECT_ID, root)) {
    const doc = root.createElement ? root : root.ownerDocument;
    const field = doc.createElement('div');
    field.className = 'catalogue-admin-field';
    field.id = 'catalogue-admin-recommendation-subsection-field';
    const label = doc.createElement('label');
    label.htmlFor = SUBSECTION_SELECT_ID;
    label.textContent = 'Recommendation subsection';
    const select = doc.createElement('select');
    select.id = SUBSECTION_SELECT_ID;
    const hint = doc.createElement('small');
    hint.className = 'catalogue-admin-derived';
    hint.textContent = 'Recommendation position is ranked only inside this subsection.';
    field.append(label, select, hint);
    grid.appendChild(field);
  }

  const modal = q('catalogue-admin', root);
  if (modal && !q(SUBSECTION_MANAGER_ID, root)) {
    const doc = root.createElement ? root : root.ownerDocument;
    const manager = doc.createElement('div');
    manager.id = SUBSECTION_MANAGER_ID;
    manager.className = 'catalogue-admin-subsection-manager';
    manager.innerHTML = `
      <div class="catalogue-admin-divider"></div>
      <div class="catalogue-admin-subhead">Recommendation subsections</div>
      <div data-subsection-manager-status class="catalogue-admin-derived"></div>
      <div data-subsection-list></div>
      <div class="catalogue-admin-grid" data-subsection-create>
        <div class="catalogue-admin-field"><label>New subsection name</label><input data-new-subsection-name type="text"></div>
        <div class="catalogue-admin-field"><label>Description</label><input data-new-subsection-description type="text"></div>
      </div>
      <div class="catalogue-admin-actions" data-subsection-actions>
        <button type="button" data-subsection-action="add">Add subsection</button>
        <button type="button" data-subsection-action="save">Save subsection changes</button>
      </div>`;
    const actions = modal.querySelector?.('.catalogue-admin-actions');
    if (actions?.parentElement) actions.parentElement.insertBefore(manager, actions);
    else modal.appendChild(manager);
  }

  if (!q('catalogue-v4-structure-style', root)) {
    const doc = root.createElement ? root : root.ownerDocument;
    const style = doc.createElement('style');
    style.id = 'catalogue-v4-structure-style';
    style.textContent = `
      #${SUBSECTION_MANAGER_ID}{margin-top:14px}
      #${SUBSECTION_MANAGER_ID} [data-subsection-row]{display:grid;grid-template-columns:minmax(120px,1fr) minmax(180px,2fr) auto;gap:8px;align-items:center;margin:8px 0}
      #${SUBSECTION_MANAGER_ID} [data-subsection-row] .subsection-buttons{display:flex;gap:5px;flex-wrap:wrap}
      #${SUBSECTION_MANAGER_ID}.v4-unavailable [data-subsection-create],
      #${SUBSECTION_MANAGER_ID}.v4-unavailable [data-subsection-actions],
      #${SUBSECTION_MANAGER_ID}.v4-unavailable [data-subsection-list]{display:none}
    `;
    doc.head?.appendChild(style);
  }
}

function subsectionSelect(root = document) {
  return q(SUBSECTION_SELECT_ID, root);
}

function renderSubsectionSelect(root = document, preferred = '') {
  const select = subsectionSelect(root);
  if (!select) return;
  const previous = preferred || select.value;
  select.innerHTML = '';
  const doc = root.createElement ? root : root.ownerDocument;
  const placeholder = doc.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose subsection…';
  select.appendChild(placeholder);
  for (const section of draftSubsections) {
    const option = doc.createElement('option');
    option.value = section.id;
    option.textContent = section.name;
    select.appendChild(option);
  }
  select.value = Array.from(select.options || []).some(option => option.value === previous) ? previous : '';
}

function managerMessage(message, root = document) {
  const node = q(SUBSECTION_MANAGER_ID, root)?.querySelector?.('[data-subsection-manager-status]');
  if (node) node.textContent = String(message || '');
}

function renderSubsectionManager(root = document) {
  ensureSubsectionControls(root);
  const manager = q(SUBSECTION_MANAGER_ID, root);
  if (!manager) return;
  const explicit = Array.isArray(persistedState.recommendationSubsections);
  manager.classList.toggle('v4-unavailable', !explicit);
  managerMessage(explicit ? 'Names, descriptions and order are saved independently from cigar prose.' : 'Subsection editing activates after the v4 catalogue migration.', root);
  if (!explicit) return;

  const list = manager.querySelector('[data-subsection-list]');
  if (!list) return;
  list.innerHTML = '';
  const doc = root.createElement ? root : root.ownerDocument;
  draftSubsections.forEach((section, index) => {
    const row = doc.createElement('div');
    row.dataset.subsectionRow = section.id;
    const name = doc.createElement('input');
    name.type = 'text';
    name.value = section.name;
    name.setAttribute('aria-label', `${section.name} subsection name`);
    const description = doc.createElement('input');
    description.type = 'text';
    description.value = section.description;
    description.setAttribute('aria-label', `${section.name} subsection description`);
    const buttons = doc.createElement('div');
    buttons.className = 'subsection-buttons';
    for (const [action, label, disabled] of [
      ['up', '↑', index === 0],
      ['down', '↓', index === draftSubsections.length - 1],
      ['delete', 'Delete', false]
    ]) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset.subsectionRowAction = action;
      button.textContent = label;
      button.disabled = disabled;
      buttons.appendChild(button);
    }
    name.addEventListener('input', () => {
      try {
        draftSubsections = updateRecommendationSubsection(draftSubsections, { id: section.id, name: name.value, description: description.value });
        renderSubsectionSelect(root, subsectionSelect(root)?.value || '');
      } catch (error) { managerMessage(error.message, root); }
    });
    description.addEventListener('input', () => {
      try {
        draftSubsections = updateRecommendationSubsection(draftSubsections, { id: section.id, name: name.value, description: description.value });
      } catch (error) { managerMessage(error.message, root); }
    });
    row.append(name, description, buttons);
    list.appendChild(row);
  });
  renderSubsectionSelect(root, subsectionSelect(root)?.value || '');
}

function structuralRowForSelected(root = document) {
  const key = selectedKey(root);
  if (!key) return null;
  return domRows(root).find(row => row.key === key) || null;
}

function syncRankBounds(root = document) {
  const type = normaliseCatalogueType(q(TYPE_ID, root)?.value);
  const rank = q(RANK_ID, root);
  if (!rank) return;
  const key = selectedKey(root);
  const row = structuralRowForSelected(root);
  // Rank means "position within a subsection" only while the v4 subsection
  // pipeline owns Recommendation ranking (see transformStatePayload, which bails
  // out unless persistedState carries recommendationSubsections, and
  // rankingUpdatesForSave, which only defers for v4 state). On legacy v3 state
  // rank means "rank within the cohort"; pinning the field to the subsection
  // model there set max=1 and forced value=1, so no Recommendation could be
  // reordered at all.
  const subsectionsOwnRanking = Number(persistedState.version) >= 4
    && Array.isArray(persistedState.recommendationSubsections);
  if (type === 'main' && subsectionsOwnRanking) {
    const subsectionId = subsectionSelect(root)?.value || '';
    const section = draftSubsections.find(item => item.id === subsectionId);
    const location = key ? recommendationLocation(draftSubsections, key) : null;
    const currentlyHere = location?.subsectionId === subsectionId;
    const max = section ? section.entryKeys.length + (currentlyHere ? 0 : 1) : 1;
    rank.max = String(Math.max(1, max));
    if (!subsectionId) rank.value = '1';
    else if (currentlyHere) rank.value = String(location.position);
    else if (!Number(rank.value) || Number(rank.value) > max) rank.value = String(max);
    return;
  }
  const sameType = domRows(root).filter(item => !item.archived && item.catalogueType === type && item.key !== key).length;
  rank.max = String(Math.max(1, sameType + 1));
  if (row && !row.archived && row.catalogueType === type) rank.value = String(row.rank || 1);
  else if (!Number(rank.value) || Number(rank.value) > sameType + 1) rank.value = String(sameType + 1);
}

function syncSelectedControls(root = document) {
  ensureSubsectionControls(root);
  const typeSelect = ensureHalfOption(root);
  const key = selectedKey(root);
  if (!typeSelect || !key) return;
  const row = structuralRowForSelected(root);
  const source = sourceForKey(key);
  const type = normaliseCatalogueType(source.catalogueType || row?.catalogueType, source.taster === true || row?.taster === true);
  typeSelect.value = type;
  const field = q('catalogue-admin-recommendation-subsection-field', root);
  if (field) field.hidden = type !== 'main';

  renderSubsectionSelect(root);
  const select = subsectionSelect(root);
  const archived = source.archived === true || row?.archived === true || q(SECTION_STATE_ID, root)?.value === 'archived';
  if (type === 'main' && select) {
    const location = recommendationLocation(draftSubsections, key);
    if (!archived && location) select.value = location.subsectionId;
    else select.value = '';
  }
  syncRankBounds(root);
}

async function persistSubsectionDraft(root = document) {
  if (!Array.isArray(persistedState.recommendationSubsections)) throw new Error('The live catalogue is not yet using v4 subsection state.');
  const subsections = validateRecommendationSubsectionsShape(draftSubsections);
  const rows = domRows(root);
  assertRecommendationInventory({
    subsections,
    activeRecommendationKeys: rows.filter(row => !row.archived && row.catalogueType === 'main').map(row => row.key),
    forbiddenKeys: rows.filter(row => row.archived || row.catalogueType !== 'main').map(row => row.key)
  });
  const payload = {
    version: 4,
    cards: { ...record(persistedState.cards) },
    sections: { ...record(persistedState.sections) },
    recommendationSubsections: subsections
  };
  const response = await adminWriteFetch(STATE_API, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Subsection save failed with HTTP ${response.status}`);
  managerMessage('Subsection changes saved.', root);
}

function handleManagerClick(event, root = document) {
  const rowButton = event.target?.closest?.('[data-subsection-row-action]');
  if (rowButton) {
    const row = rowButton.closest('[data-subsection-row]');
    const id = row?.dataset?.subsectionRow || '';
    const index = draftSubsections.findIndex(section => section.id === id);
    try {
      if (rowButton.dataset.subsectionRowAction === 'up' && index > 0) {
        draftSubsections = reorderRecommendationSubsections(draftSubsections, { id, targetIndex: index - 1 });
      } else if (rowButton.dataset.subsectionRowAction === 'down' && index >= 0 && index < draftSubsections.length - 1) {
        draftSubsections = reorderRecommendationSubsections(draftSubsections, { id, targetIndex: index + 1 });
      } else if (rowButton.dataset.subsectionRowAction === 'delete') {
        draftSubsections = deleteRecommendationSubsection(draftSubsections, id);
      }
      renderSubsectionManager(root);
      syncSelectedControls(root);
    } catch (error) {
      managerMessage(error.message || error, root);
    }
    return;
  }

  const action = event.target?.closest?.('[data-subsection-action]')?.dataset?.subsectionAction;
  if (!action) return;
  if (action === 'add') {
    const manager = q(SUBSECTION_MANAGER_ID, root);
    const nameInput = manager?.querySelector?.('[data-new-subsection-name]');
    const descriptionInput = manager?.querySelector?.('[data-new-subsection-description]');
    const name = String(nameInput?.value || '').trim();
    try {
      const id = generatedSubsectionId(name, new Set(draftSubsections.map(section => section.id)));
      draftSubsections = addRecommendationSubsection(draftSubsections, {
        id,
        name,
        description: String(descriptionInput?.value || '').trim(),
        index: draftSubsections.length
      });
      if (nameInput) nameInput.value = '';
      if (descriptionInput) descriptionInput.value = '';
      renderSubsectionManager(root);
      syncSelectedControls(root);
    } catch (error) {
      managerMessage(error.message || error, root);
    }
  } else if (action === 'save') {
    persistSubsectionDraft(root).catch(error => managerMessage(error.message || error, root));
  }
}

function acceptState(state, root = document) {
  if (!state || typeof state !== 'object') return;
  persistedState = {
    version: Number(state.version) || 3,
    cards: record(state.cards),
    entries: record(state.entries),
    sections: record(state.sections),
    ...(Array.isArray(state.recommendationSubsections)
      ? { recommendationSubsections: validateRecommendationSubsectionsShape(state.recommendationSubsections) }
      : {})
  };
  draftSubsections = Array.isArray(persistedState.recommendationSubsections)
    ? clone(persistedState.recommendationSubsections)
    : [];
  if (typeof document !== 'undefined') {
    renderSubsectionManager(root);
    setTimeout(() => syncSelectedControls(root), 0);
  }
}

function armEditorSave(root = document) {
  const key = selectedKey(root);
  armedSave = key ? { key, at: Date.now() } : null;
}

function currentArm() {
  if (!armedSave) return null;
  if (Date.now() - armedSave.at > ARM_WINDOW_MS) {
    armedSave = null;
    return null;
  }
  return armedSave;
}

function transformStatePayload(payload, root = document) {
  if (!Array.isArray(persistedState.recommendationSubsections)) return payload;
  const arm = currentArm();
  if (!arm) return preserveExplicitStructure(payload, persistedState);
  armedSave = null;

  const type = normaliseCatalogueType(q(TYPE_ID, root)?.value);
  const subsectionId = type === 'main' ? String(subsectionSelect(root)?.value || '') : '';
  const position = Number(q(RANK_ID, root)?.value);
  const wantsArchived = q(SECTION_STATE_ID, root)?.value === 'archived';
  const rows = domRows(root, payload?.cards);
  if (!rows.some(row => row.key === arm.key)) {
    rows.push({ key: arm.key, catalogueType: type, taster: type === 'taster', archived: false, rank: position || 1 });
  }
  return prepareV4StructuralPayload({
    payload: { ...payload, recommendationSubsections: draftSubsections },
    persistedState,
    rows,
    key: arm.key,
    targetType: type,
    targetSubsectionId: subsectionId,
    targetPosition: position,
    wantsArchived,
    now: new Date().toISOString()
  });
}

function installUiHooks(root = document) {
  ensureSubsectionControls(root);
  renderSubsectionManager(root);
  const type = ensureHalfOption(root);
  if (type && type.dataset.v4StructureBound !== '1') {
    type.dataset.v4StructureBound = '1';
    type.addEventListener('change', () => {
      const field = q('catalogue-admin-recommendation-subsection-field', root);
      if (field) field.hidden = normaliseCatalogueType(type.value) !== 'main';
      const select = subsectionSelect(root);
      if (select && normaliseCatalogueType(type.value) === 'main' && !select.value) select.value = '';
      syncRankBounds(root);
    });
  }
  const subsection = subsectionSelect(root);
  if (subsection && subsection.dataset.v4StructureBound !== '1') {
    subsection.dataset.v4StructureBound = '1';
    subsection.addEventListener('change', () => syncRankBounds(root));
  }
  const manager = q(SUBSECTION_MANAGER_ID, root);
  if (manager && manager.dataset.v4StructureBound !== '1') {
    manager.dataset.v4StructureBound = '1';
    manager.addEventListener('click', event => handleManagerClick(event, root));
  }

  const save = q('catalogue-admin-save', root);
  if (save && save.dataset.v4StructureBound !== '1') {
    save.dataset.v4StructureBound = '1';
    save.addEventListener('click', () => armEditorSave(root), true);
  }
  q(CARD_SELECT_ID, root)?.addEventListener('change', () => setTimeout(() => syncSelectedControls(root), 0));
  q('catalogue-admin-toggle', root)?.addEventListener('click', () => setTimeout(() => syncSelectedControls(root), 0));
  q(SECTION_STATE_ID, root)?.addEventListener('change', () => setTimeout(() => syncSelectedControls(root), 0));
}

export function installCatalogueStructureEditor(root = document) {
  if (typeof document === 'undefined') return;
  registerCatalogueStateTransform(STRUCTURE_TRANSFORM, 90, payload => transformStatePayload(payload, root));
  registerCatalogueStateResponseListener(STRUCTURE_TRANSFORM, event => acceptState(event?.state, root));
  const start = () => {
    installUiHooks(root);
    fetch(`${STATE_API}?catalogue_structure=1`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(state => acceptState(state, root))
      .catch(() => {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

if (typeof document !== 'undefined') installCatalogueStructureEditor(document);
