# Recommendation Subsections Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inferred Recommendation ranking overlay with first-class editable Recommendation subsections whose ordered entry lists are authoritative, while preserving independent Half-Cigar/Taster cohorts and safe archive restoration.

**Architecture:** One shared pure structural state engine owns Recommendation subsection schema, membership, ordering, and cross-type moves. The Worker, unified editor, Recommendation renderer, and GitHub catalogue publisher all consume that model. Production code remains backward-compatible with v3 until a separately audited follow-up migration writes v4 `recommendationSubsections`; once v4 exists, runtime Recommendation membership/order never falls back to ring gauge, flavour text, or global `rank`.

**Tech Stack:** Vanilla ES modules, Node.js 22 `node:test`, Cloudflare Workers/KV, Wrangler, browser DOM APIs, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-recommendation-subsections-design.md`

## Global Constraints

- Explicit Recommendation subsection storage uses state version `4`.
- Internal catalogue type `main` remains Recommendation. Do not create a fourth top-level type.
- `recommendationSubsections` array order is subsection display order.
- Each subsection `entryKeys` order is authoritative local Recommendation order. Rank is `index + 1`, never separately persisted.
- Every non-archived Recommendation entry belongs to exactly one subsection after migration.
- Half-Cigar and Taster remain independent `H1…` and `T1…` cohorts.
- Recommendation edits never renumber Half/Taster unless the edited entry explicitly moves into/out of that cohort.
- Subsection IDs remain stable across rename/description edits.
- Non-empty subsections cannot be deleted.
- Stock changes never mutate stored Recommendation membership/order.
- Preserve unrelated cigar prose, ratings, prices, images, retailer data, eyebrow copy, Value logic, and catalogue exceptions.
- Deploy compatible code before publishing the v4 migration.
- Git merge is not deployment proof. Verify Cloudflare code, KV read-back, and production rendering separately.
- PR #76 is superseded and must not be merged.

## File Structure

**Create**
- `public/catalogue-structure.mjs`: pure v4 structure engine.
- `public/catalogue-recommendation-legacy.mjs`: side-effect-free v3 compatibility classification only.
- `public/catalogue-recommendation-subsections.mjs`: explicit-state Recommendation renderer/controller.
- `scripts/build-recommendation-subsections-migration.mjs`: read-only migration-request builder.
- `test/catalogue-structure.test.mjs`
- `test/catalogue-state-v4.test.mjs`
- `test/catalogue-recommendation-subsections.test.mjs`
- `test/recommendation-subsection-migration.test.mjs`

**Modify**
- `src/index.js`
- `public/catalogue-admin-unified-v139.mjs`
- `public/catalogue-half-cohort.mjs`
- `public/catalogue-runtime.mjs`
- `scripts/publish-catalogue-request.mjs`
- `.github/workflows/publish-catalogue.yml`
- affected tests: `catalogue-recommendation-cohorts`, `catalogue-recommendation-subsection-regressions`, `catalogue-editor-regressions`, `half-cigar-cohort`, `half-cigar-ui-regression`, `catalogue-save-pipeline`, `publish-catalogue-request`, `publisher-half-cohort`, `publisher-live-ranking-source`, `full-catalogue-rank-normalisation`, `eyebrow-rank-regression`.

**Reference only**
- `public/catalogue-save-pipeline.mjs`: retain generic plumbing unless tests prove a concrete change is necessary; do not add structural ownership here.
- `scripts/publish-live-catalogue-request.mjs`: existing wrapper already delegates to `publish-catalogue-request.mjs`; no new structural logic belongs here.

**Delete after replacement coverage passes**
- `public/catalogue-recommendation-cohorts.mjs`

---

### Task 1: Shared structural state engine

**Files:**
- Create: `public/catalogue-structure.mjs`
- Create: `test/catalogue-structure.test.mjs`

**Produces**

```js
export const CATALOGUE_STATE_VERSION = 4;
export function normaliseCatalogueType(value, taster = false) {}
export function validateRecommendationSubsectionsShape(input) {}
export function recommendationMembership(subsections) {}
export function recommendationLocation(subsections, key) {}
export function addRecommendationSubsection(subsections, input) {}
export function updateRecommendationSubsection(subsections, input) {}
export function reorderRecommendationSubsections(subsections, input) {}
export function deleteRecommendationSubsection(subsections, id) {}
export function moveRecommendationEntry(subsections, input) {}
export function removeRecommendationEntry(subsections, key) {}
export function assertRecommendationInventory(input) {}
export function applyCatalogueStructuralChange(input) {}
```

- [ ] **Step 1: Write failing shape/list tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecommendationSubsectionsShape,
  recommendationMembership,
  updateRecommendationSubsection,
  deleteRecommendationSubsection,
  moveRecommendationEntry
} from '../public/catalogue-structure.mjs';

const base = [
  { id: 'coronets', name: 'Coronets', description: '34 ring gauge or lower.', entryKeys: ['a', 'b'] },
  { id: 'petit-panatelas', name: 'Petit Panatelas', description: '35 ring gauge or higher.', entryKeys: ['c'] }
];

test('entry order is authoritative', () => {
  const moved = moveRecommendationEntry(base, {
    key: 'b', targetSubsectionId: 'petit-panatelas', targetPosition: 1
  });
  assert.deepEqual(moved[0].entryKeys, ['a']);
  assert.deepEqual(moved[1].entryKeys, ['b', 'c']);
  assert.deepEqual(recommendationMembership(moved).b, {
    subsectionId: 'petit-panatelas', position: 1
  });
});

test('rename preserves id and members', () => {
  const next = updateRecommendationSubsection(base, {
    id: 'coronets', name: 'Small Formats', description: 'Edited'
  });
  assert.equal(next[0].id, 'coronets');
  assert.deepEqual(next[0].entryKeys, ['a', 'b']);
});

test('duplicate membership is rejected', () => {
  assert.throws(() => validateRecommendationSubsectionsShape([
    { id: 'one', name: 'One', description: '', entryKeys: ['a'] },
    { id: 'two', name: 'Two', description: '', entryKeys: ['a'] }
  ]), /duplicate.*a/i);
});

test('non-empty section cannot be deleted', () => {
  assert.throws(() => deleteRecommendationSubsection(base, 'coronets'), /not empty/i);
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test test/catalogue-structure.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict shape/list functions**

Use this ID/key validation and immutable cloning:

```js
const SUBSECTION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ENTRY_KEY = /^[a-z0-9][a-z0-9_-]{0,95}$/;

export function validateRecommendationSubsectionsShape(input) {
  if (!Array.isArray(input)) throw new Error('recommendationSubsections must be an array.');
  const ids = new Set();
  const members = new Set();
  return input.map(raw => {
    const id = String(raw?.id || '').trim().toLowerCase();
    const name = String(raw?.name || '').trim();
    const description = String(raw?.description || '').trim();
    if (!SUBSECTION_ID.test(id)) throw new Error(`Invalid Recommendation subsection id: ${id || '(missing)'}.`);
    if (!name) throw new Error(`Recommendation subsection "${id}" requires a name.`);
    if (ids.has(id)) throw new Error(`Duplicate Recommendation subsection id: ${id}.`);
    ids.add(id);
    if (!Array.isArray(raw?.entryKeys)) throw new Error(`Recommendation subsection "${id}" requires entryKeys.`);
    const entryKeys = raw.entryKeys.map(value => String(value || '').trim().toLowerCase());
    for (const key of entryKeys) {
      if (!ENTRY_KEY.test(key)) throw new Error(`Invalid Recommendation entry key: ${key || '(missing)'}.`);
      if (members.has(key)) throw new Error(`Duplicate Recommendation entry membership: ${key}.`);
      members.add(key);
    }
    return { id, name, description, entryKeys };
  });
}
```

`moveRecommendationEntry` must require integer `targetPosition` in `1..destinationLength + 1`; reject out-of-range input instead of silently clamping.

- [ ] **Step 4: Write failing cross-type/archive tests**

```js
test('Recommendation -> Half removes Recommendation membership only', () => {
  const result = applyCatalogueStructuralChange({
    cards: {
      rec: { catalogueType: 'main', archived: false, rank: 99 },
      h1: { catalogueType: 'half', archived: false, rank: 1 },
      t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
    },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['rec'] }
    ],
    key: 'rec', targetType: 'half', targetPosition: 2,
    targetSubsectionId: '', wantsArchived: false,
    now: '2026-09-14T12:00:00Z'
  });
  assert.deepEqual(result.recommendationSubsections[0].entryKeys, []);
  assert.equal(result.cards.rec.catalogueType, 'half');
  assert.equal(result.cards.rec.rank, 2);
  assert.equal(result.cards.t1.rank, 1);
});

test('archive -> Recommendation requires subsection destination', () => {
  assert.throws(() => applyCatalogueStructuralChange({
    cards: { rec: { catalogueType: 'main', archived: true } },
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: [] }
    ],
    key: 'rec', targetType: 'main', targetSubsectionId: '',
    targetPosition: 1, wantsArchived: false
  }), /subsection/i);
});
```

- [ ] **Step 5: Implement atomic structural moves**

Use this exact control flow:

```js
export function applyCatalogueStructuralChange(input) {
  const cards = Object.fromEntries(
    Object.entries(input.cards || {}).map(([key, value]) => [key, { ...(value || {}) }])
  );
  let subsections = validateRecommendationSubsectionsShape(input.recommendationSubsections || []);
  const key = String(input.key || '').trim();
  const current = { ...(cards[key] || {}) };
  const sourceType = normaliseCatalogueType(current.catalogueType, current.taster);
  const targetType = normaliseCatalogueType(input.targetType, input.targetType === 'taster');

  subsections = removeRecommendationEntry(subsections, key);
  if (sourceType === 'half' || sourceType === 'taster') {
    compactNumberedCohort(cards, sourceType, key);
  }

  if (input.wantsArchived) {
    cards[key] = {
      ...current,
      catalogueType: targetType,
      taster: targetType === 'taster',
      archived: true,
      archivedAt: current.archivedAt || input.now || new Date().toISOString()
    };
    delete cards[key].rank;
    return { cards, recommendationSubsections: subsections };
  }

  if (targetType === 'main') {
    subsections = moveRecommendationEntry(subsections, {
      key,
      targetSubsectionId: input.targetSubsectionId,
      targetPosition: input.targetPosition
    });
    cards[key] = { ...current, catalogueType: 'main', taster: false, archived: false, archivedAt: '' };
    return { cards, recommendationSubsections: subsections };
  }

  insertIntoNumberedCohort(cards, {
    key,
    type: targetType,
    position: input.targetPosition,
    card: { ...current, catalogueType: targetType, taster: targetType === 'taster', archived: false, archivedAt: '' }
  });
  return { cards, recommendationSubsections: subsections };
}
```

Implement private `compactNumberedCohort` and `insertIntoNumberedCohort` in the same file. They operate only on Half/Taster in v4 and never use main/global rank to represent Recommendation order.

- [ ] **Step 6: Add inventory invariant tests**

```js
test('every active Recommendation must appear exactly once', () => {
  assert.throws(() => assertRecommendationInventory({
    subsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }],
    activeRecommendationKeys: ['a', 'b'],
    forbiddenKeys: []
  }), /missing.*b/i);
});

test('Half/Taster/archived keys are forbidden', () => {
  assert.throws(() => assertRecommendationInventory({
    subsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['half-a'] }],
    activeRecommendationKeys: [],
    forbiddenKeys: ['half-a']
  }), /forbidden.*half-a/i);
});
```

- [ ] **Step 7: Verify and commit**

```bash
node --test test/catalogue-structure.test.mjs test/half-cigar-cohort.test.mjs
git add public/catalogue-structure.mjs test/catalogue-structure.test.mjs
git commit -m "feat: add catalogue structural state engine"
```

---

### Task 2: Backward-compatible v4 Worker state

**Files:**
- Modify: `src/index.js` (`normaliseState`, `mergeState`, `hasMeaningfulState`, `handleState`, `handleEntry`)
- Create: `test/catalogue-state-v4.test.mjs`

**Consumes:** `CATALOGUE_STATE_VERSION`, `validateRecommendationSubsectionsShape`, `removeRecommendationEntry`.

- [ ] **Step 1: Write failing v3/v4 tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseState, mergeState } from '../src/index.js';

test('v3 remains v3 before explicit migration', () => {
  const state = normaliseState({ version: 3, cards: {}, sections: {}, entries: {} });
  assert.equal(state.version, 3);
  assert.equal('recommendationSubsections' in state, false);
});

test('v4 round-trips explicit subsections', () => {
  const source = {
    version: 4, cards: {}, sections: {}, entries: {},
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }
    ]
  };
  assert.deepEqual(normaliseState(source).recommendationSubsections, source.recommendationSubsections);
  assert.equal(normaliseState(source).version, 4);
});

test('ordinary merge into v4 preserves subsection state', () => {
  const existing = {
    version: 4, cards: {}, sections: {}, entries: {},
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }
    ]
  };
  const merged = mergeState(existing, { cards: { a: { quality: 9 } } });
  assert.equal(merged.version, 4);
  assert.deepEqual(merged.recommendationSubsections, existing.recommendationSubsections);
});
```

- [ ] **Step 2: Verify current hardcoded version fails**

```bash
node --test test/catalogue-state-v4.test.mjs
```

Expected: FAIL because current state normalization forces v3 and drops the field.

- [ ] **Step 3: Implement v3/v4 normalization without implicit migration**

```js
const explicit = Object.prototype.hasOwnProperty.call(raw, 'recommendationSubsections');
const output = {
  version: explicit ? CATALOGUE_STATE_VERSION : 3,
  updatedAt: text(raw.updatedAt),
  cards: normaliseCardOverrides(raw.cards),
  sections: record(raw.sections),
  entries
};
if (explicit) {
  output.recommendationSubsections = validateRecommendationSubsectionsShape(raw.recommendationSubsections);
}
return output;
```

`mergeState` preserves existing explicit arrays when incoming omits them, and validates/replaces them when incoming includes them.

- [ ] **Step 4: Prevent entry PUT/DELETE from downgrading v4**

Use:

```js
state.version = Array.isArray(state.recommendationSubsections) ? 4 : 3;
```

Before deleting an entry from v4, remove the key from explicit Recommendation lists. Do not leave dangling membership.

- [ ] **Step 5: Return actual state version and reject malformed explicit arrays before KV write**

`handleState` response uses `version: merged.version`. Add a Worker-handler test with a KV stub whose `put` count remains zero when duplicate membership is submitted.

- [ ] **Step 6: Verify and commit**

```bash
node --test test/catalogue-state-v4.test.mjs test/worker-rendering.test.mjs test/stock-import.test.mjs
git add src/index.js test/catalogue-state-v4.test.mjs
git commit -m "feat: persist catalogue v4 subsection state"
```

---

### Task 3: Explicit Recommendation renderer with v3-only fallback

**Files:**
- Create: `public/catalogue-recommendation-legacy.mjs`
- Create: `public/catalogue-recommendation-subsections.mjs`
- Modify: `public/catalogue-runtime.mjs`
- Modify: `test/catalogue-recommendation-cohorts.test.mjs`
- Modify: `test/catalogue-recommendation-subsection-regressions.test.mjs`
- Modify: `test/eyebrow-rank-regression.test.mjs`
- Create: `test/catalogue-recommendation-subsections.test.mjs`
- Delete after coverage passes: `public/catalogue-recommendation-cohorts.mjs`

- [ ] **Step 1: Write failing runtime contract tests**

```js
assert.match(runtimeSource, /catalogue-recommendation-subsections\.mjs/);
assert.doesNotMatch(runtimeSource, /catalogue-recommendation-cohorts\.mjs/);
assert.doesNotMatch(rendererSource, /data-tier-section=["']elite["']/);
assert.doesNotMatch(rendererSource, /data-tier-section=["']strong["']/);
assert.doesNotMatch(rendererSource, /data-noteworthy-section=["']neither["']/);
```

- [ ] **Step 2: Extract side-effect-free legacy classification only**

`catalogue-recommendation-legacy.mjs` keeps the current v3 semantics needed before migration:

```js
export function legacyRecommendationCohortForCard(fields) {
  if (fields.catalogueType && fields.catalogueType !== 'main') return '';
  if (fields.archived) return '';
  if (legacyFlavoured(fields) && fields.key !== 'kfc-ponies-sweets') return 'flavoured';
  const ring = Number(fields.ring);
  if (!Number.isFinite(ring) || ring <= 0) return '';
  return ring <= 34 ? 'coronets' : 'petit-panatelas';
}
```

Also expose `buildLegacyRecommendationSubsections(rows)` which sorts each legacy group by matching legacy `recommendationRank`, otherwise global rank. It has no DOM/network/save side effects.

- [ ] **Step 3: Implement real v4 subsection containers**

For each explicit subsection create/update:

```html
<section class="recommendation-subsection" data-recommendation-subsection="coronets">
  <div class="section-head">
    <h2>Coronets</h2>
    <p>34 ring gauge or lower.</p>
  </div>
  <div class="cards" id="recommendation-subsection-coronets-cards"></div>
</section>
```

Never relabel/reuse legacy Elite/Strong/Noteworthy containers.

- [ ] **Step 4: Render only from persisted array order in v4**

```js
export function updateRecommendationRankVisual(card, rank) {
  const flag = card?.querySelector?.('.rankflag');
  if (!flag) return;
  const label = flag.querySelector('span');
  const value = flag.querySelector('b');
  if (label) label.textContent = 'No.';
  if (value) value.textContent = String(rank);
}

export function renderRecommendationSubsections(state, root = document) {
  const explicit = state?.version >= 4 && Array.isArray(state?.recommendationSubsections);
  const subsections = explicit
    ? state.recommendationSubsections
    : buildLegacyRecommendationSubsections(rowsFromDomAndState(root, state));
  // ensure dedicated section DOM, then iterate entryKeys in order.
  // v4 branch never calls legacy classification.
  return subsections;
}
```

The implementation may respect existing unavailable-card presentation, but stock must not edit persisted list membership/order.

- [ ] **Step 5: Remove mutation-driven classification and save transforms**

The new module may refresh when API state changes or a dynamic card node appears. It must not observe ring/flavour/prose attributes to recompute membership and must not register `recommendation-subsection-ranks` or any other structural PUT transform.

- [ ] **Step 6: Add explicit-membership regressions**

Test Joya Black explicitly assigned to Coronets stays there even when its text contains `full-flavoured`. Test reload preserves array order and rank numbers. Test rank rendering never writes `.eyebrow`.

- [ ] **Step 7: Switch runtime, delete obsolete overlay, verify, commit**

```bash
node --test \
  test/catalogue-recommendation-subsections.test.mjs \
  test/catalogue-recommendation-subsection-regressions.test.mjs \
  test/catalogue-recommendation-cohorts.test.mjs \
  test/eyebrow-rank-regression.test.mjs \
  test/catalogue-runtime-hardening.test.mjs
git rm public/catalogue-recommendation-cohorts.mjs
git add public/catalogue-runtime.mjs public/catalogue-recommendation-legacy.mjs \
  public/catalogue-recommendation-subsections.mjs test/catalogue-recommendation-subsections.test.mjs \
  test/catalogue-recommendation-subsection-regressions.test.mjs \
  test/catalogue-recommendation-cohorts.test.mjs test/eyebrow-rank-regression.test.mjs
git commit -m "refactor: render explicit recommendation subsections"
```

---

### Task 4: Unified editor owns structural moves and subsection management

**Files:**
- Modify: `public/catalogue-admin-unified-v139.mjs`
- Modify: `public/catalogue-half-cohort.mjs`
- Modify: `test/catalogue-editor-regressions.test.mjs`
- Modify: `test/half-cigar-cohort.test.mjs`
- Modify: `test/half-cigar-ui-regression.test.mjs`
- Modify: `test/catalogue-save-pipeline.test.mjs`

**Consumes:** shared structure engine. Half module remains a visual/helper module, not a second structural save owner.

- [ ] **Step 1: Write failing editor state/markup tests**

Require:

```html
<select id="catalogue-admin-type">
  <option value="main">Recommendation</option>
  <option value="half">Half-Cigar</option>
  <option value="taster">Taster</option>
</select>
<select id="catalogue-admin-recommendation-subsection"></select>
<input id="catalogue-admin-rank" type="number" min="1">
<div id="catalogue-admin-subsection-manager"></div>
```

Assert browser state preserves `payload.version` and `payload.recommendationSubsections`.

- [ ] **Step 2: Make the core editor natively know all three types**

Remove reliance on Half-Cigar injecting its option later. For `main`, show subsection selector and local position. For Half/Taster, hide subsection selector and use H/T local position.

- [ ] **Step 3: Populate selected Recommendation location from explicit state**

```js
const location = recommendationLocation(stateForBrowser.recommendationSubsections || [], key);
if (location) {
  q('catalogue-admin-recommendation-subsection').value = location.subsectionId;
  q('catalogue-admin-rank').value = String(location.position);
}
```

Archived cards show destination controls; do not silently restore from stale `archivedRank`.

- [ ] **Step 4: Replace `reorderCohortOverrides()` as structural truth**

In `saveUnified()` calculate once:

```js
const structuralResult = applyCatalogueStructuralChange({
  cards: effectiveCardRowsAsMap(),
  recommendationSubsections: stateForBrowser.recommendationSubsections || [],
  key,
  targetType: structural.catalogueType,
  targetSubsectionId: structural.catalogueType === 'main'
    ? q('catalogue-admin-recommendation-subsection').value
    : '',
  targetPosition: Number(q('catalogue-admin-rank').value),
  wantsArchived: Boolean(editorWantsArchived),
  now: new Date().toISOString()
});
```

Merge only calculated structural changes plus editorial fields into the outgoing state.

- [ ] **Step 5: Implement subsection CRUD/reorder manager**

Generate an ID only at creation:

```js
function generatedSubsectionId(name, existingIds) {
  const base = String(name || 'subsection').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'subsection';
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) id = `${base}-${suffix++}`;
  return id;
}
```

Manager supports create, edit name, edit description, Move Up, Move Down, Delete. Rename never changes ID. Delete calls `deleteRecommendationSubsection` and surfaces its error without state mutation.

- [ ] **Step 6: Require explicit restore destinations**

- Recommendation: subsection + position.
- Half: H position.
- Taster: T position.

No archive restore guesses a destination from `archivedRank`.

- [ ] **Step 7: Validate complete effective inventory before PUT**

```js
const activeRecommendationKeys = rows
  .filter(row => !row.archived && row.catalogueType === 'main')
  .map(row => row.key);
const forbiddenKeys = rows
  .filter(row => row.archived || row.catalogueType !== 'main')
  .map(row => row.key);
assertRecommendationInventory({
  subsections: structuralResult.recommendationSubsections,
  activeRecommendationKeys,
  forbiddenKeys
});
```

This browser-level check covers static cards the Worker cannot infer from KV alone.

- [ ] **Step 8: Remove Half-Cigar structural transform ownership**

Keep H/T visual helpers and section rendering, but remove Half’s `registerCatalogueStateTransform` structural reranker. Recommendation and Half must not both mutate the same PUT payload after `saveUnified()`.

- [ ] **Step 9: Add regressions and verify**

Cover Recommendation subsection move, rename, reorder, create empty, reject non-empty delete, archive, explicit restore, Recommendation -> Half/Taster and reverse, independent H/T ranks, untouched eyebrow.

```bash
node --test \
  test/catalogue-editor-regressions.test.mjs \
  test/half-cigar-cohort.test.mjs \
  test/half-cigar-ui-regression.test.mjs \
  test/catalogue-save-pipeline.test.mjs \
  test/catalogue-structure.test.mjs
```

- [ ] **Step 10: Commit**

```bash
git add public/catalogue-admin-unified-v139.mjs public/catalogue-half-cohort.mjs \
  test/catalogue-editor-regressions.test.mjs test/half-cigar-cohort.test.mjs \
  test/half-cigar-ui-regression.test.mjs test/catalogue-save-pipeline.test.mjs
git commit -m "feat: manage recommendation subsections in editor"
```

---

### Task 5: Make catalogue publication v4-safe

**Files:**
- Modify: `scripts/publish-catalogue-request.mjs`
- Modify: `.github/workflows/publish-catalogue.yml`
- Modify: `test/publish-catalogue-request.test.mjs`
- Modify: `test/publisher-half-cohort.test.mjs`
- Modify: `test/publisher-live-ranking-source.test.mjs`
- Modify: `test/full-catalogue-rank-normalisation.test.mjs`

**New request surface:**

```json
{
  "operation": "update-recommendation-subsections",
  "recommendationSubsections": []
}
```

For structural upsert/unarchive:

```json
{ "destination": { "type": "main", "subsectionId": "coronets", "position": 3 } }
```

Half/Taster use `{ "type": "half", "position": 2 }` or `{ "type": "taster", "position": 4 }`.

- [ ] **Step 1: Write failing v4-preservation test**

Mock live v4 GET, publish a quality-only edit, inspect PUT body:

```js
assert.equal(putBody.version, 4);
assert.deepEqual(putBody.recommendationSubsections, liveState.recommendationSubsections);
```

- [ ] **Step 2: Preserve version/subsections in publisher state shape and PUT**

```js
const explicit = Array.isArray(input.recommendationSubsections);
return {
  version: explicit ? 4 : 3,
  cards,
  sections: isRecord(input.sections) ? clone(input.sections) : {},
  entries: isRecord(input.entries) ? clone(input.entries) : {},
  ...(explicit ? {
    recommendationSubsections: validateRecommendationSubsectionsShape(input.recommendationSubsections)
  } : {})
};
```

`putState` sends the field whenever present. It never writes `{ version: 3 }` over v4.

- [ ] **Step 3: Stop treating global main rank as Recommendation order in v4**

When state is v4, numeric compaction/invariant checks cover only `half` and `taster`. Keep current `main` behavior only for v3 compatibility.

- [ ] **Step 4: Add `update-recommendation-subsections` validation/publication**

No key is required. Validate the full array, construct effective static+dynamic inventory using existing `completeRankingCards`, call `assertRecommendationInventory`, PUT v4 state, GET read-back, and `assert.deepEqual` the complete array.

- [ ] **Step 5: Route structural archive/unarchive/upsert through the shared engine in v4**

Rules:
- non-structural edit preserves current membership without destination;
- new active `main` requires explicit Recommendation destination;
- unarchive requires explicit destination;
- type move requires explicit destination;
- archive removes active structural membership;
- no v4 operation invokes legacy ring/flavour inference.

- [ ] **Step 6: Update tests/workflow and verify**

Add workflow path for `scripts/build-recommendation-subsections-migration.mjs` under both PR and push triggers.

```bash
node --test \
  test/publish-catalogue-request.test.mjs \
  test/publisher-half-cohort.test.mjs \
  test/publisher-live-ranking-source.test.mjs \
  test/full-catalogue-rank-normalisation.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add scripts/publish-catalogue-request.mjs .github/workflows/publish-catalogue.yml \
  test/publish-catalogue-request.test.mjs test/publisher-half-cohort.test.mjs \
  test/publisher-live-ranking-source.test.mjs test/full-catalogue-rank-normalisation.test.mjs
git commit -m "feat: publish catalogue v4 structure safely"
```

---

### Task 6: Read-only migration builder, without live migration request on the code PR

**Files:**
- Create: `scripts/build-recommendation-subsections-migration.mjs`
- Create: `test/recommendation-subsection-migration.test.mjs`

**Critical rollout rule:** Do **not** commit `catalogue-requests/2026-09-14-migrate-recommendation-subsections.json` on the implementation PR. The current GitHub workflow automatically publishes changed request JSON on `main`, which would race ahead of manual Cloudflare code deployment. The request is generated again and committed only on the separate post-deployment migration branch in Task 8.

- [ ] **Step 1: Write fixture-driven migration tests**

Cover matching legacy `recommendationRank`, fallback global rank, 34/35 ring boundary, structured flavoured/infused classification, KFC exclusion, Half/Taster/archive exclusion, stock not erasing structural assignment, and exactly-once active Recommendation inventory.

- [ ] **Step 2: Implement pure builder**

```js
export function buildMigrationRequest({ rows }) {
  const recommendationSubsections = buildLegacyRecommendationSubsections(rows);
  assertRecommendationInventory({
    subsections: recommendationSubsections,
    activeRecommendationKeys: rows
      .filter(row => !row.archived && row.catalogueType === 'main')
      .map(row => row.key),
    forbiddenKeys: rows
      .filter(row => row.archived || row.catalogueType !== 'main')
      .map(row => row.key)
  });
  return {
    id: '2026-09-14-migrate-recommendation-subsections',
    operation: 'update-recommendation-subsections',
    recommendationSubsections,
    note: 'One-time migration from legacy inferred Recommendation subsections to explicit v4 structure.'
  };
}
```

CLI fetches live state/production HTML and prints JSON only. It has no token requirement and no PUT code.

- [ ] **Step 3: Generate a temporary candidate for review, not a repository request**

```bash
node scripts/build-recommendation-subsections-migration.mjs \
  > /tmp/recommendation-subsections-migration.json
```

Review current Coronets, Petit Panatelas, and Infused/Flavoured arrays, especially Joya Black, KFC Sweet Ponies, BLACKENED M81 Coronets, and current Petit Panatela entries. Confirm no Half/Taster/archived key appears.

- [ ] **Step 4: Verify and commit builder/tests only**

```bash
node --test test/recommendation-subsection-migration.test.mjs
git add scripts/build-recommendation-subsections-migration.mjs \
  test/recommendation-subsection-migration.test.mjs
git commit -m "chore: add recommendation subsection migration builder"
```

---

### Task 7: Full integration regression and obsolete-owner audit

**Files:** existing implementation/test files only; no unrelated refactor.

- [ ] **Step 1: Audit old Recommendation rank/cohort ownership**

```bash
grep -R "recommendationRank\|recommendationCohort\|catalogue-recommendation-cohorts" \
  public src scripts test --exclude-dir=node_modules
```

Allowed matches: v3 compatibility/migration helpers, tests proving v4 ignores legacy fields, deprecation comments. Any v4 runtime writer/order dependency is a failure.

- [ ] **Step 2: Audit competing structural transforms**

```bash
grep -R "registerCatalogueStateTransform" public --include='*.mjs'
```

Neither Recommendation nor Half may register a structural reranker. Leave unrelated transforms untouched.

- [ ] **Step 3: Run full tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Local Wrangler smoke check**

```bash
npm run dev
```

Verify v3 compatibility rendering, v4 fixture rendering, subsection rename/add/reorder, cross-subsection move, archive restore to Recommendation/Half/Taster, reload persistence, untouched eyebrow, independent H/T numbering. Stop the dev server afterwards.

- [ ] **Step 5: Diff audit and integration commit**

```bash
git diff main...HEAD -- public src scripts test .github/workflows
```

Confirm no unrelated cigar data changed. If integration fixes were necessary:

```bash
git add public src scripts test .github/workflows
git commit -m "test: harden recommendation subsection rebuild"
```

---

### Task 8: PR, staged code deployment, separate migration PR, and live verification

**Systems:** implementation branch/PR, PR #76, Cloudflare deployment, live KV, follow-up migration branch/PR.

- [ ] **Step 1: Close PR #76 unmerged after the new implementation branch exists**

Comment that the per-card seed model was superseded by the approved first-class ordered subsection architecture, then close it.

- [ ] **Step 2: Open/review implementation PR and pass CI**

PR describes v4 arrays, shared structural engine, editor manager/cross-type moves, v3 compatibility fallback, v4-safe publisher, and separate migration gate. Confirm GitHub `npm test` passes.

- [ ] **Step 3: Merge code-only PR**

The implementation PR must contain no migration request JSON. Inspect diff for unrelated catalogue data before merge.

- [ ] **Step 4: Deploy compatible code manually**

From updated `main`:

```bash
npm run deploy
```

Capture successful Wrangler deployment output/version.

- [ ] **Step 5: Verify production compatibility before touching KV schema**

Confirm production `catalogue-runtime.mjs` loads `catalogue-recommendation-subsections.mjs`, existing v3 live state still renders, and editor loads. Confirm live API is still v3/no explicit `recommendationSubsections`. If any check fails, stop.

- [ ] **Step 6: Create migration branch from deployed `main` and regenerate against current live state**

```bash
git switch -c migrate/recommendation-subsections-v4
node scripts/build-recommendation-subsections-migration.mjs \
  > catalogue-requests/2026-09-14-migrate-recommendation-subsections.json
```

Do not reuse a stale pre-deployment candidate. Inspect all `entryKeys` arrays and run:

```bash
node --test test/recommendation-subsection-migration.test.mjs test/publish-catalogue-request.test.mjs
```

- [ ] **Step 7: Commit/open/merge the small migration PR**

```bash
git add catalogue-requests/2026-09-14-migrate-recommendation-subsections.json
git commit -m "chore: migrate recommendation subsections to v4"
```

The PR should contain the request JSON only unless a request-specific regression fixture is strictly required. Merge only after inspection.

- [ ] **Step 8: Observe publication workflow and require successful read-back**

The GitHub Action must use the v4-safe publisher, write explicit subsections, GET live state again, and deep-compare the complete structure. Do not manually bypass an invariant failure.

- [ ] **Step 9: Verify live API**

GET `https://cigar-catalogue.psncodex.workers.dev/api/catalogue-overrides?verify=1` and confirm:

- `version === 4`;
- expected subsection IDs/names/descriptions;
- every active Recommendation exactly once;
- no Half/Taster/archived key in Recommendation arrays;
- ordering equals audited request;
- unrelated cards/entries intact.

- [ ] **Step 10: Verify production behavior**

Check independent contiguous `No. 1..N` per subsection, stable reloads, Joya Black explicit placement, rename persistence, empty-section creation persistence, subsection reorder, entry move between subsections, archive compaction, explicit restore to Recommendation, move/restore to Half/Taster without unrelated rank changes, and unchanged eyebrows.

Use a reversible low-risk entry for live structural smoke tests and restore its original state before completion.

- [ ] **Step 11: Final verification from updated `main`**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 12: Completion evidence**

Report completion only with implementation PR/merge commit, passing CI, Cloudflare deployment confirmation, migration publication success, live API v4 read-back, production UI/editor verification, and confirmation PR #76 closed unmerged.
