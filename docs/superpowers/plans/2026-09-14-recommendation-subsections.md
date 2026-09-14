# Recommendation Subsections Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the glitch-prone inferred Recommendation ranking overlay with first-class editable Recommendation subsections whose ordered entry lists are authoritative, while preserving independent Half-Cigar/Taster cohorts and adding safe cross-cohort/archive moves.

**Architecture:** Add one shared pure structural state engine that owns Recommendation subsection schema, membership, ordering, and cross-type moves. The Worker, browser editor, renderer, and GitHub publication tooling all consume that same model. Production code remains backward-compatible with v3 state until a separately audited one-time migration writes v4 `recommendationSubsections`; after v4 exists, no runtime Recommendation membership or ordering may fall back to ring gauge, flavour text, or legacy global rank.

**Tech Stack:** Vanilla ES modules, Node.js 22 test runner, Cloudflare Workers/KV, Wrangler, browser DOM APIs, GitHub Actions publication workflow.

**Spec:** `docs/superpowers/specs/2026-09-14-recommendation-subsections-design.md`

## Global Constraints

- Explicit Recommendation subsection storage uses catalogue state version `4`.
- Internal catalogue type `main` remains the compatibility representation of Recommendation; do not create a fourth catalogue type.
- Recommendation subsection array order is subsection display order.
- Each subsection `entryKeys` array order is authoritative local Recommendation order; visible rank is derived from list position, never independently persisted.
- Every non-archived Recommendation entry must belong to exactly one Recommendation subsection after v4 migration.
- Half-Cigar and Taster remain distinct top-level cohorts with their existing `H1…` and `T1…` visual semantics.
- Recommendation edits must not renumber Half-Cigar/Taster unless the edited entry explicitly moves into or out of that cohort.
- Subsection IDs remain stable across rename/description edits.
- A non-empty subsection cannot be deleted.
- Stock state must never mutate stored Recommendation subsection membership or list order. If existing unavailable presentation temporarily renders a card elsewhere, its structural membership/position remains intact for restoration.
- Preserve unrelated cigar fields, prose, ratings, prices, images, retailer data, eyebrow copy, Value logic, and established catalogue exceptions.
- Production code must be deployed before the live v4 migration request is published.
- A merge is not proof of Cloudflare deployment. Verify deployed code, live KV read-back, and production rendering separately.
- PR #76 (`Persist independent recommendation subsection ranks`) is superseded and must not be merged.

---

## File Structure

### New focused modules

- `public/catalogue-structure.mjs` — pure v4 catalogue structure engine: subsection schema/validation, Recommendation list operations, Half/Taster compaction, and atomic cross-type/archive moves.
- `public/catalogue-recommendation-subsections.mjs` — browser Recommendation renderer/controller driven by explicit v4 state, with a v3-only compatibility fallback.
- `public/catalogue-recommendation-legacy.mjs` — side-effect-free copy of only the old v3 classification logic needed for compatibility/migration; never authoritative when v4 explicit state exists.
- `scripts/build-recommendation-subsections-migration.mjs` — read-only migration builder that derives the initial explicit lists from current live state/production data and outputs an auditable request document.
- `test/catalogue-structure.test.mjs` — pure structural engine tests.
- `test/catalogue-state-v4.test.mjs` — Worker v3/v4 persistence and validation tests.
- `test/catalogue-recommendation-subsections.test.mjs` — v4 renderer/controller contract tests.
- `test/recommendation-subsection-migration.test.mjs` — migration builder tests.

### Existing files to modify

- `src/index.js` — preserve/read/write v4 state, validate subsection shape, never downgrade v4 during entry writes.
- `public/catalogue-admin-unified-v139.mjs` — add subsection controls/manager, retain `recommendationSubsections` in browser state, and use one atomic structural save calculation.
- `public/catalogue-half-cohort.mjs` — keep H/T visual/UI helpers but remove competing structural save-transform ownership.
- `public/catalogue-runtime.mjs` — load the new Recommendation renderer instead of `catalogue-recommendation-cohorts.mjs`.
- `public/catalogue-save-pipeline.mjs` — keep generic response-listener plumbing; structural correctness must no longer depend on competing Half/Recommendation transforms.
- `scripts/publish-catalogue-request.mjs` — preserve v4 state on every publication, support explicit Recommendation subsection structure updates/destinations, and use shared structural logic for archive/unarchive/type moves.
- `scripts/publish-live-catalogue-request.mjs` — only adjust if needed to accept/describe the new request operation; do not create a second structural implementation.
- `.github/workflows/publish-catalogue.yml` — include new migration-builder path in verification triggers if the builder is added outside already-covered `scripts/publish-catalogue-request.mjs`.
- `test/catalogue-recommendation-cohorts.test.mjs` — replace tests that assert inferred runtime architecture with v3-compatibility-only tests, or delete after equivalent coverage exists.
- `test/catalogue-recommendation-subsection-regressions.test.mjs` — rewrite around explicit v4 membership/rank stability.
- `test/catalogue-editor-regressions.test.mjs` — add subsection editor/archive restoration contracts.
- `test/half-cigar-cohort.test.mjs` and `test/half-cigar-ui-regression.test.mjs` — assert H/T remain independent but no longer own the save transform.
- `test/catalogue-save-pipeline.test.mjs` — prove structural edits are not being chained through competing rank transforms.
- `test/publish-catalogue-request.test.mjs`, `test/publisher-half-cohort.test.mjs`, `test/publisher-live-ranking-source.test.mjs`, `test/full-catalogue-rank-normalisation.test.mjs` — update publisher invariants for v4.

### Files to retire after replacement is proven

- `public/catalogue-recommendation-cohorts.mjs` — remove from runtime and delete once pure legacy classification has moved to `catalogue-recommendation-legacy.mjs` and all tests point at the new architecture.

---

### Task 1: Build the shared structural state engine

**Files:**
- Create: `public/catalogue-structure.mjs`
- Create: `test/catalogue-structure.test.mjs`
- Reference: `public/catalogue-half-cohort.mjs`
- Reference: `docs/superpowers/specs/2026-09-14-recommendation-subsections-design.md`

**Interfaces:**
- Produces:
  - `CATALOGUE_STATE_VERSION = 4`
  - `normaliseCatalogueType(value, taster = false) -> 'main' | 'half' | 'taster'`
  - `validateRecommendationSubsectionsShape(input) -> RecommendationSubsection[]` or throws
  - `recommendationMembership(subsections) -> Record<entryKey, { subsectionId, position }>`
  - `recommendationLocation(subsections, key) -> { subsectionId, position } | null`
  - `addRecommendationSubsection(subsections, { id, name, description, index }) -> RecommendationSubsection[]`
  - `updateRecommendationSubsection(subsections, { id, name, description }) -> RecommendationSubsection[]`
  - `reorderRecommendationSubsections(subsections, { id, targetIndex }) -> RecommendationSubsection[]`
  - `deleteRecommendationSubsection(subsections, id) -> RecommendationSubsection[]` or throws if non-empty
  - `moveRecommendationEntry(subsections, { key, targetSubsectionId, targetPosition }) -> RecommendationSubsection[]`
  - `removeRecommendationEntry(subsections, key) -> RecommendationSubsection[]`
  - `assertRecommendationInventory({ subsections, activeRecommendationKeys, forbiddenKeys }) -> true` or throws
  - `applyCatalogueStructuralChange({ cards, recommendationSubsections, key, targetType, targetSubsectionId, targetPosition, wantsArchived, now }) -> { cards, recommendationSubsections }`
- Consumes no DOM and performs no network I/O.

- [ ] **Step 1: Write failing subsection schema/invariant tests**

Add tests covering duplicate subsection IDs, duplicate entry membership, stable rename IDs, empty-section persistence, non-empty delete rejection, and exact list ordering:

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

test('subsection order and entry order are authoritative', () => {
  const moved = moveRecommendationEntry(base, {
    key: 'b', targetSubsectionId: 'petit-panatelas', targetPosition: 1
  });
  assert.deepEqual(moved[0].entryKeys, ['a']);
  assert.deepEqual(moved[1].entryKeys, ['b', 'c']);
  assert.deepEqual(recommendationMembership(moved).b, {
    subsectionId: 'petit-panatelas', position: 1
  });
});

test('rename preserves stable subsection id and membership', () => {
  const next = updateRecommendationSubsection(base, {
    id: 'coronets', name: 'Small Formats', description: 'Edited'
  });
  assert.equal(next[0].id, 'coronets');
  assert.deepEqual(next[0].entryKeys, ['a', 'b']);
});

test('duplicate active Recommendation membership is rejected', () => {
  assert.throws(() => validateRecommendationSubsectionsShape([
    { id: 'one', name: 'One', description: '', entryKeys: ['a'] },
    { id: 'two', name: 'Two', description: '', entryKeys: ['a'] }
  ]), /duplicate.*a/i);
});

test('non-empty subsection cannot be deleted', () => {
  assert.throws(() => deleteRecommendationSubsection(base, 'coronets'), /not empty/i);
});
```

- [ ] **Step 2: Run the focused test and confirm the module is missing**

Run:

```bash
node --test test/catalogue-structure.test.mjs
```

Expected: FAIL because `public/catalogue-structure.mjs` does not yet exist.

- [ ] **Step 3: Implement strict subsection shape validation and pure list operations**

Use a stable subsection ID rule that allows the existing IDs and future generated IDs:

```js
const SUBSECTION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const CATALOGUE_STATE_VERSION = 4;

export function validateRecommendationSubsectionsShape(input) {
  if (!Array.isArray(input)) throw new Error('recommendationSubsections must be an array.');
  const subsectionIds = new Set();
  const entryKeys = new Set();
  return input.map(raw => {
    const id = String(raw?.id || '').trim().toLowerCase();
    const name = String(raw?.name || '').trim();
    const description = String(raw?.description || '').trim();
    if (!SUBSECTION_ID.test(id)) throw new Error(`Invalid Recommendation subsection id: ${id || '(missing)'}.`);
    if (!name) throw new Error(`Recommendation subsection "${id}" requires a name.`);
    if (subsectionIds.has(id)) throw new Error(`Duplicate Recommendation subsection id: ${id}.`);
    subsectionIds.add(id);
    if (!Array.isArray(raw?.entryKeys)) throw new Error(`Recommendation subsection "${id}" requires entryKeys.`);
    const keys = raw.entryKeys.map(value => String(value || '').trim()).filter(Boolean);
    for (const key of keys) {
      if (entryKeys.has(key)) throw new Error(`Duplicate Recommendation entry membership: ${key}.`);
      entryKeys.add(key);
    }
    return { id, name, description, entryKeys: keys };
  });
}
```

Keep functions immutable: clone arrays/objects, never mutate caller-owned input.

- [ ] **Step 4: Add failing cross-type/archive tests**

Cover Recommendation -> Half, Recommendation -> Taster, Half/Taster -> Recommendation, archive removal, archive restore with explicit destination, and independence of unrelated cohorts:

```js
test('Recommendation to Half removes subsection membership and compacts only Half destination', () => {
  const cards = {
    rec: { catalogueType: 'main', archived: false, rank: 99 },
    h1: { catalogueType: 'half', archived: false, rank: 1 },
    t1: { catalogueType: 'taster', taster: true, archived: false, rank: 1 }
  };
  const result = applyCatalogueStructuralChange({
    cards,
    recommendationSubsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['rec'] }],
    key: 'rec',
    targetType: 'half',
    targetPosition: 2,
    wantsArchived: false,
    now: '2026-09-14T12:00:00Z'
  });
  assert.deepEqual(result.recommendationSubsections[0].entryKeys, []);
  assert.equal(result.cards.rec.catalogueType, 'half');
  assert.equal(result.cards.rec.rank, 2);
  assert.equal(result.cards.t1.rank, 1);
});

test('restore to Recommendation requires an explicit subsection', () => {
  assert.throws(() => applyCatalogueStructuralChange({
    cards: { rec: { catalogueType: 'main', archived: true } },
    recommendationSubsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: [] }],
    key: 'rec', targetType: 'main', targetPosition: 1, wantsArchived: false
  }), /subsection/i);
});
```

- [ ] **Step 5: Implement the atomic structural move function**

Rules inside `applyCatalogueStructuralChange`:

```js
// Pseudocode-level contract, implemented as ordinary JS:
// 1. validate/clone subsection state and card map
// 2. remove key from any Recommendation list
// 3. compact source Half/Taster only when key leaves one of those cohorts
// 4. if wantsArchived: mark archived and do not insert into any active structure
// 5. if targetType === 'main': require existing targetSubsectionId and insert at 1-based targetPosition
// 6. if targetType === 'half' or 'taster': insert into that cohort at 1-based targetPosition and compact that cohort
// 7. write catalogueType/taster/archive metadata for the moved key
// 8. never compact or rewrite legacy main/global rank to represent Recommendation order
```

Clamp insertion only to the valid inclusive range `1..(destinationLength + 1)`. Reject `0`, negative, non-numeric, and wildly out-of-range positions rather than silently choosing a different destination.

- [ ] **Step 6: Add inventory-level invariant tests**

Test exact active Recommendation completeness and forbidden membership:

```js
test('inventory requires every active Recommendation exactly once', () => {
  assert.throws(() => assertRecommendationInventory({
    subsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }],
    activeRecommendationKeys: ['a', 'b'],
    forbiddenKeys: []
  }), /missing.*b/i);
});

test('Half/Taster/archived keys are forbidden from Recommendation lists', () => {
  assert.throws(() => assertRecommendationInventory({
    subsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['half-a'] }],
    activeRecommendationKeys: [],
    forbiddenKeys: ['half-a']
  }), /forbidden.*half-a/i);
});
```

- [ ] **Step 7: Run the structural engine tests**

Run:

```bash
node --test test/catalogue-structure.test.mjs test/half-cigar-cohort.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/catalogue-structure.mjs test/catalogue-structure.test.mjs
git commit -m "feat: add catalogue structural state engine"
```

---

### Task 2: Add backward-compatible v4 Worker state persistence

**Files:**
- Modify: `src/index.js` around `normaliseState`, `mergeState`, `hasMeaningfulState`, `handleState`, and `handleEntry`
- Create: `test/catalogue-state-v4.test.mjs`
- Reuse: `public/catalogue-structure.mjs`

**Interfaces:**
- Consumes `CATALOGUE_STATE_VERSION` and `validateRecommendationSubsectionsShape`.
- Produces Worker state that remains v3 when the stored state has no explicit subsection structure, and becomes/stays v4 when `recommendationSubsections` exists.
- A v4 entry PUT/DELETE must not downgrade the enclosing state back to version 3.

- [ ] **Step 1: Write failing v3/v4 state tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseState, mergeState } from '../src/index.js';

test('legacy v3 state stays readable before migration', () => {
  const state = normaliseState({ version: 3, cards: {}, sections: {}, entries: {} });
  assert.equal(state.version, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(state, 'recommendationSubsections'), false);
});

test('v4 state round-trips explicit Recommendation subsections', () => {
  const input = {
    version: 4,
    cards: {}, sections: {}, entries: {},
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }
    ]
  };
  assert.deepEqual(normaliseState(input).recommendationSubsections, input.recommendationSubsections);
  assert.equal(normaliseState(input).version, 4);
});

test('merging an ordinary edit into v4 preserves subsection state', () => {
  const existing = {
    version: 4, cards: {}, sections: {}, entries: {},
    recommendationSubsections: [{ id: 'coronets', name: 'Coronets', description: '', entryKeys: ['a'] }]
  };
  const merged = mergeState(existing, { cards: { a: { quality: 9 } } });
  assert.equal(merged.version, 4);
  assert.deepEqual(merged.recommendationSubsections, existing.recommendationSubsections);
});
```

- [ ] **Step 2: Run and confirm current version-3 hardcoding fails**

Run:

```bash
node --test test/catalogue-state-v4.test.mjs
```

Expected: FAIL because `src/index.js` currently forces `version: 3` and drops the new field.

- [ ] **Step 3: Import and preserve explicit subsection state without auto-migrating v3**

Implement `normaliseState` with this compatibility rule:

```js
const hasExplicitRecommendationStructure = Object.prototype.hasOwnProperty.call(raw, 'recommendationSubsections');
const recommendationSubsections = hasExplicitRecommendationStructure
  ? validateRecommendationSubsectionsShape(raw.recommendationSubsections)
  : undefined;

const output = {
  version: hasExplicitRecommendationStructure ? CATALOGUE_STATE_VERSION : 3,
  updatedAt: text(raw.updatedAt),
  cards: normaliseCardOverrides(raw.cards),
  sections: record(raw.sections),
  entries
};
if (hasExplicitRecommendationStructure) output.recommendationSubsections = recommendationSubsections;
return output;
```

Do not manufacture v4 state from v3 on GET. The migration remains an explicit later operation.

- [ ] **Step 4: Make `mergeState` preserve v4 and validate explicit writes**

If incoming state contains `recommendationSubsections`, validate and write it. If incoming omits it but existing is v4, preserve existing. If both omit it, remain v3. Reject malformed explicit arrays before `writeState`.

- [ ] **Step 5: Prevent `handleEntry` from downgrading state**

Replace hardcoded `state.version = 3` with version preservation:

```js
state.version = Array.isArray(state.recommendationSubsections)
  ? CATALOGUE_STATE_VERSION
  : 3;
```

Deleting an entry from a v4 state must also remove the key from Recommendation subsection arrays before write, or reject deletion if the entry remains structurally referenced. Prefer explicit removal using `removeRecommendationEntry` so no dangling key can persist.

- [ ] **Step 6: Return actual version from `handleState`**

Change the PUT response from hardcoded `version: 3` to `version: merged.version`, and include `recommendationSubsections: merged.recommendationSubsections?.length ?? 0` as a count only, not the full payload.

- [ ] **Step 7: Add invalid-v4 write regression**

Test duplicate membership causes a 400-class validation failure before KV mutation. Use the existing Worker test KV stub pattern from `test/worker-rendering.test.mjs`.

- [ ] **Step 8: Run Worker-focused tests**

Run:

```bash
node --test test/catalogue-state-v4.test.mjs test/worker-rendering.test.mjs test/stock-import.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/index.js test/catalogue-state-v4.test.mjs
git commit -m "feat: persist catalogue v4 subsection state"
```

---

### Task 3: Replace the inferred Recommendation overlay with an explicit-state renderer

**Files:**
- Create: `public/catalogue-recommendation-legacy.mjs`
- Create: `public/catalogue-recommendation-subsections.mjs`
- Modify: `public/catalogue-runtime.mjs`
- Delete after replacement tests pass: `public/catalogue-recommendation-cohorts.mjs`
- Create: `test/catalogue-recommendation-subsections.test.mjs`
- Modify/replace: `test/catalogue-recommendation-cohorts.test.mjs`
- Modify: `test/catalogue-recommendation-subsection-regressions.test.mjs`
- Modify: `test/eyebrow-rank-regression.test.mjs`

**Interfaces:**
- `catalogue-recommendation-legacy.mjs` produces only pure v3 helpers such as `legacyRecommendationCohortForCard(fields)` and `buildLegacyRecommendationSubsections(rows)`.
- `catalogue-recommendation-subsections.mjs` consumes API state and DOM cards; explicit v4 state is authoritative.
- Exports `renderRecommendationSubsections(state, root = document)` and `updateRecommendationRankVisual(card, rank)` for direct unit testing.

- [ ] **Step 1: Write failing runtime contract tests**

Replace assertions that the runtime loads `catalogue-recommendation-cohorts.mjs` with:

```js
assert.match(runtimeSource, /catalogue-recommendation-subsections\.mjs/);
assert.doesNotMatch(runtimeSource, /catalogue-recommendation-cohorts\.mjs/);
```

Add source-contract assertions that the new renderer does not reference `data-tier-section="elite"`, `data-tier-section="strong"`, or `data-noteworthy-section="neither"` as destination containers.

- [ ] **Step 2: Extract side-effect-free v3 compatibility classification**

Move only these old semantics into `catalogue-recommendation-legacy.mjs`:

- flavoured/infused detection from structured production metadata;
- KFC Sweet Ponies exclusion;
- `<=34` ring -> Coronets, `>=35` -> Petit Panatelas when not flavoured;
- legacy ordering by prior Recommendation rank if present, otherwise legacy/global rank.

Do not register save transforms, response listeners, MutationObservers, or DOM movement in this file.

- [ ] **Step 3: Implement explicit v4 section creation/rendering**

For each persisted subsection, create a dedicated container identified by stable ID, for example:

```html
<section class="recommendation-subsection" data-recommendation-subsection="coronets">
  <div class="section-head">
    <h2>Coronets</h2>
    <p>34 ring gauge or lower.</p>
  </div>
  <div class="cards" id="recommendation-subsection-coronets-cards"></div>
</section>
```

Do not clone/relabel Elite/Strong/Noteworthy sections.

- [ ] **Step 4: Render explicit card order and a single Recommendation number owner**

For v4 state:

```js
for (const subsection of state.recommendationSubsections) {
  subsection.entryKeys.forEach((key, index) => {
    const card = root.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);
    if (!card) return;
    // Existing unavailable presentation may choose a different visible container,
    // but do not change structural membership/order because of stock.
    card.dataset.recommendationSubsection = subsection.id;
    card.dataset.recommendationPosition = String(index + 1);
    updateRecommendationRankVisual(card, index + 1);
    // Move into subsection grid only when the card is eligible for the normal active Recommendation presentation.
  });
}
```

`updateRecommendationRankVisual` changes only `.rankflag span` and `.rankflag b`. It must never write `.eyebrow`.

- [ ] **Step 5: Add the v3-only compatibility fallback**

When state has no explicit `recommendationSubsections` and `version < 4`, derive ephemeral sections with the legacy helper. This fallback is display-only:

- it does not write `recommendationCohort`;
- it does not write `recommendationRank`;
- it does not PUT state;
- it does not register a save transform;
- it stops being used immediately once v4 explicit state is present.

- [ ] **Step 6: Remove mutation-driven reclassification**

Do not carry forward observers that watch ring/flavour/prose attributes and reorder cards. Refresh only on explicit state hydration/change and necessary dynamic-entry DOM insertion. If a narrow observer is needed to notice a newly inserted card node, it may trigger a render from the already-persisted structure but must never recompute membership.

- [ ] **Step 7: Add Joya Black and stock-stability regressions**

```js
test('v4 explicit membership overrides all flavour/ring inference', () => {
  const state = {
    version: 4,
    recommendationSubsections: [
      { id: 'coronets', name: 'Coronets', description: '', entryKeys: ['joya-black'] },
      { id: 'flavoured', name: 'Infused / Flavoured', description: '', entryKeys: [] }
    ]
  };
  // Render fixture whose prose contains "full-flavoured".
  // Assert joya-black remains under coronets and displays No. 1.
});

test('stock changes do not mutate persisted Recommendation membership', () => {
  // Render same explicit state before/after data-stock changes.
  // Assert state/list ordering is unchanged and no inferred move occurs.
});
```

- [ ] **Step 8: Run renderer regressions**

Run:

```bash
node --test \
  test/catalogue-recommendation-subsections.test.mjs \
  test/catalogue-recommendation-subsection-regressions.test.mjs \
  test/eyebrow-rank-regression.test.mjs \
  test/catalogue-runtime-hardening.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Switch runtime import and remove obsolete overlay file/tests**

Update `public/catalogue-runtime.mjs` to import only the new renderer. Delete `public/catalogue-recommendation-cohorts.mjs` after all legacy classification tests have been transferred to the pure legacy helper tests.

- [ ] **Step 10: Commit**

```bash
git add public/catalogue-runtime.mjs public/catalogue-recommendation-legacy.mjs \
  public/catalogue-recommendation-subsections.mjs \
  test/catalogue-recommendation-subsections.test.mjs \
  test/catalogue-recommendation-subsection-regressions.test.mjs \
  test/catalogue-recommendation-cohorts.test.mjs test/eyebrow-rank-regression.test.mjs
git rm public/catalogue-recommendation-cohorts.mjs
git commit -m "refactor: render explicit recommendation subsections"
```

---

### Task 4: Centralize editor structural moves and add subsection management

**Files:**
- Modify: `public/catalogue-admin-unified-v139.mjs`
- Modify: `public/catalogue-half-cohort.mjs`
- Modify only if response-listener support needs a small adjustment: `public/catalogue-save-pipeline.mjs`
- Modify: `test/catalogue-editor-regressions.test.mjs`
- Modify: `test/half-cigar-cohort.test.mjs`
- Modify: `test/half-cigar-ui-regression.test.mjs`
- Modify: `test/catalogue-save-pipeline.test.mjs`

**Interfaces:**
- Consumes `applyCatalogueStructuralChange`, subsection CRUD helpers, and explicit v4 subsection state.
- Editor state shape becomes:

```js
{
  version: 3 | 4,
  cards: {},
  sections: {},
  entries: {},
  recommendationSubsections?: []
}
```

- `buildSavePlan(...)` must include `recommendationSubsections` whenever state is v4.
- Half module retains visual helpers such as `rankDisplayForType` and `updateCardRankVisual`, but no longer registers a structural state transform.

- [ ] **Step 1: Write failing editor markup/state tests**

Assert the unified editor contains:

```text
Catalogue type: Recommendation | Half-Cigar | Taster
Recommendation subsection select
Recommendation local position input
Manage Recommendation subsections control
Archive restore destination controls
```

Also assert `loadStateForBrowser` preserves `payload.version` and `payload.recommendationSubsections` instead of reconstructing `{ version: 3, cards, sections, entries }`.

- [ ] **Step 2: Add explicit controls to `structuralMarkup()`**

Use stable IDs so tests and behavior are deterministic:

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

Do not rely on Half-Cigar code injecting an option after load; the core editor now knows all three top-level types.

- [ ] **Step 3: Populate Recommendation subsection and position from explicit state**

When selected type is `main`, use `recommendationLocation(stateForBrowser.recommendationSubsections, key)` to select the subsection and position. Hide/disable the subsection select for Half/Taster.

For archived cards, show restoration destination fields instead of guessing from `archivedRank`.

- [ ] **Step 4: Replace the global/taster-only reorder calculation**

Retire `reorderCohortOverrides()` as the source of structural truth in `saveUnified()`. Build one move request and call the shared engine:

```js
const structuralResult = applyCatalogueStructuralChange({
  cards: effectiveCardRowsAsMap(),
  recommendationSubsections: stateForBrowser.recommendationSubsections,
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

Merge only changed structural card overrides back into the state payload. Editorial fields remain merge-preserving.

- [ ] **Step 5: Make archive restoration explicit**

On unarchive, require a destination before save:

- Recommendation requires subsection + 1-based local position;
- Half-Cigar requires H position;
- Taster requires T position.

Do not restore from stale `archivedRank` unless the user explicitly chooses that same destination position in the UI.

- [ ] **Step 6: Add subsection manager CRUD/reorder UI**

Render each subsection row with editable `name`, `description`, and Move Up/Move Down/Delete controls. Add an `Add subsection` control that creates a generated stable ID once:

```js
function generatedSubsectionId(name, existingIds) {
  const base = String(name || 'subsection')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'subsection';
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) id = `${base}-${suffix++}`;
  return id;
}
```

Rename never regenerates the ID. Delete calls `deleteRecommendationSubsection`; non-empty deletion displays the thrown message and leaves state untouched.

- [ ] **Step 7: Validate complete active Recommendation inventory before PUT**

Use DOM/effective rows to compute:

```js
const activeRecommendationKeys = rows
  .filter(row => !row.archived && row.catalogueType === 'main')
  .map(row => row.key);
const forbiddenKeys = rows
  .filter(row => row.archived || row.catalogueType !== 'main')
  .map(row => row.key);
assertRecommendationInventory({
  subsections: nextRecommendationSubsections,
  activeRecommendationKeys,
  forbiddenKeys
});
```

This is the browser save-layer completeness check the Worker cannot perform for static HTML cards it does not own in KV.

- [ ] **Step 8: Remove Half-Cigar structural transform registration**

`catalogue-half-cohort.mjs` may retain:

- type normalization compatibility helpers if other modules still import them;
- H/T visual rendering;
- separate Half section rendering if still needed.

It must stop registering a PUT transform that independently reranks state after the unified editor already calculated the structural result.

- [ ] **Step 9: Prove the save pipeline no longer has competing structural owners**

Update `test/catalogue-save-pipeline.test.mjs` to assert Recommendation and Half modules do not register overlapping structural transforms. Generic response listeners remain allowed.

- [ ] **Step 10: Add move/rename/archive UI regressions**

Cover:

- Coronet #2 -> Flavoured #1 compacts only those two subsection lists;
- subsection rename retains ID/membership;
- subsection reorder does not alter entry order;
- archive removes membership;
- archive -> Recommendation requires subsection;
- archive -> Half/Taster works;
- Recommendation move does not alter H/T ranks;
- eyebrow copy remains untouched.

- [ ] **Step 11: Run editor/cohort tests**

Run:

```bash
node --test \
  test/catalogue-editor-regressions.test.mjs \
  test/half-cigar-cohort.test.mjs \
  test/half-cigar-ui-regression.test.mjs \
  test/catalogue-save-pipeline.test.mjs \
  test/catalogue-structure.test.mjs
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add public/catalogue-admin-unified-v139.mjs public/catalogue-half-cohort.mjs \
  public/catalogue-save-pipeline.mjs test/catalogue-editor-regressions.test.mjs \
  test/half-cigar-cohort.test.mjs test/half-cigar-ui-regression.test.mjs \
  test/catalogue-save-pipeline.test.mjs
git commit -m "feat: manage recommendation subsections in editor"
```

---

### Task 5: Make GitHub catalogue publication v4-safe

**Files:**
- Modify: `scripts/publish-catalogue-request.mjs`
- Modify if needed: `scripts/publish-live-catalogue-request.mjs`
- Modify: `.github/workflows/publish-catalogue.yml`
- Modify: `test/publish-catalogue-request.test.mjs`
- Modify: `test/publisher-half-cohort.test.mjs`
- Modify: `test/publisher-live-ranking-source.test.mjs`
- Modify: `test/full-catalogue-rank-normalisation.test.mjs`

**Interfaces:**
- Reuse `public/catalogue-structure.mjs`; do not copy structural algorithms into the publisher.
- Add request operation `update-recommendation-subsections` accepting a complete validated `recommendationSubsections` array.
- Add optional `destination` for structural upsert/unarchive moves:

```json
{
  "type": "main",
  "subsectionId": "coronets",
  "position": 3
}
```

Half/Taster destinations use `{ "type": "half", "position": 2 }` or `{ "type": "taster", "position": 4 }`.

- [ ] **Step 1: Write failing publisher preservation test**

Simulate a live v4 GET, publish a non-structural quality edit, and assert the PUT still contains the exact same `recommendationSubsections` array and `version: 4`.

```js
test('ordinary publication preserves v4 subsection structure byte-for-byte', async () => {
  // mock GET returns v4 state + subsections
  // publish quality-only upsert
  // inspect PUT body
  assert.equal(putBody.version, 4);
  assert.deepEqual(putBody.recommendationSubsections, liveState.recommendationSubsections);
});
```

- [ ] **Step 2: Update `normaliseStateShape` and `putState`**

Stop hardcoding version 3:

```js
const explicit = Array.isArray(input.recommendationSubsections);
return {
  version: explicit ? 4 : 3,
  cards,
  sections: ...,
  entries: ...,
  ...(explicit ? { recommendationSubsections: validateRecommendationSubsectionsShape(input.recommendationSubsections) } : {})
};
```

`putState` must send `recommendationSubsections` whenever present.

- [ ] **Step 3: Stop global main-rank normalization from representing Recommendation order in v4**

For v4 state, `normaliseRankings` and `assertRankingInvariant` should compact/validate only Half-Cigar and Taster numeric cohorts. Legacy `main` rank may remain as compatibility data but must not be used to derive or verify Recommendation ordering.

Keep v3 behavior unchanged before migration.

- [ ] **Step 4: Add `update-recommendation-subsections` request validation**

Extend `SUPPORTED_OPERATIONS` and validate:

```js
if (operation === 'update-recommendation-subsections') {
  request.recommendationSubsections = validateRecommendationSubsectionsShape(input.recommendationSubsections);
}
```

The operation has no `key` requirement. It reads the effective current catalogue inventory, calls `assertRecommendationInventory`, writes the full v4 structure, reads back, and deep-compares the complete array.

- [ ] **Step 5: Make archive/unarchive/upsert use explicit structural destinations under v4**

Rules:

- quality/price/prose-only update to an existing card preserves existing membership and does not require `destination`;
- new active `main` entry requires `destination.type = 'main'`, valid subsection ID, and position;
- unarchive under v4 always requires an explicit destination;
- moving catalogue type requires destination;
- archive removes the key from Recommendation list or compacts H/T via shared engine;
- no operation may re-add Recommendation membership by ring/flavour inference.

- [ ] **Step 6: Verify publisher completeness against effective static + dynamic inventory**

Reuse the existing `completeRankingCards(...)` path to construct effective catalogue rows, then derive `activeRecommendationKeys` and `forbiddenKeys` for `assertRecommendationInventory`. This is the publication-path counterpart to the browser editor completeness guard.

- [ ] **Step 7: Update publisher regressions**

Add tests for:

- v4 quality edit preserves subsection arrays;
- v4 archive removes Recommendation membership;
- v4 unarchive without destination fails;
- v4 unarchive into chosen subsection/position succeeds;
- Half/Taster requests keep H/T compact and do not touch Recommendation order;
- v3 publication remains usable before migration;
- no v4 publisher code calls legacy Recommendation inference.

- [ ] **Step 8: Add new migration-builder path to workflow triggers**

Add `scripts/build-recommendation-subsections-migration.mjs` to both PR and push `paths` lists so any change to migration generation code runs `npm test`. The workflow does not need a special publish branch: generated JSON still goes through `publish-live-catalogue-request.mjs`.

- [ ] **Step 9: Run publisher tests**

Run:

```bash
node --test \
  test/publish-catalogue-request.test.mjs \
  test/publisher-half-cohort.test.mjs \
  test/publisher-live-ranking-source.test.mjs \
  test/full-catalogue-rank-normalisation.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add scripts/publish-catalogue-request.mjs scripts/publish-live-catalogue-request.mjs \
  .github/workflows/publish-catalogue.yml test/publish-catalogue-request.test.mjs \
  test/publisher-half-cohort.test.mjs test/publisher-live-ranking-source.test.mjs \
  test/full-catalogue-rank-normalisation.test.mjs
git commit -m "feat: publish catalogue v4 structure safely"
```

---

### Task 6: Build an auditable one-time migration request

**Files:**
- Create: `scripts/build-recommendation-subsections-migration.mjs`
- Create: `test/recommendation-subsection-migration.test.mjs`
- Create during execution after reading current live state: `catalogue-requests/2026-09-14-migrate-recommendation-subsections.json`
- Reuse: `public/catalogue-recommendation-legacy.mjs`
- Reuse: `public/catalogue-structure.mjs`

**Interfaces:**
- Builder is read-only. It may GET live `/api/catalogue-overrides` and production HTML, but it must never PUT.
- Output is a standard request document:

```json
{
  "id": "2026-09-14-migrate-recommendation-subsections",
  "operation": "update-recommendation-subsections",
  "recommendationSubsections": [
    { "id": "coronets", "name": "Coronets", "description": "34 ring gauge or lower.", "entryKeys": [] },
    { "id": "petit-panatelas", "name": "Petit Panatelas", "description": "35 ring gauge or higher.", "entryKeys": [] },
    { "id": "flavoured", "name": "Infused / Flavoured", "description": "Infused and flavoured recommendation cigars.", "entryKeys": [] }
  ],
  "note": "One-time migration from legacy inferred Recommendation subsections to explicit v4 structure."
}
```

- [ ] **Step 1: Write fixture-driven migration tests**

Cover:

- persisted legacy `recommendationRank` wins over global rank only for the matching legacy cohort;
- otherwise global rank supplies relative order;
- 34 RG maps to Coronets, 35 RG maps to Petit Panatelas;
- structured flavoured/infused maps to Flavoured;
- KFC Sweet Ponies stays out of Flavoured;
- Half/Taster/archived entries are excluded;
- stock/unavailable status does not erase structural assignment from the generated explicit list;
- every active Recommendation key appears exactly once.

- [ ] **Step 2: Implement migration input parsing as pure helpers**

Export a testable function:

```js
export function buildMigrationRequest({ rows }) {
  const subsections = buildLegacyRecommendationSubsections(rows);
  assertRecommendationInventory({
    subsections,
    activeRecommendationKeys: rows.filter(row => !row.archived && row.catalogueType === 'main').map(row => row.key),
    forbiddenKeys: rows.filter(row => row.archived || row.catalogueType !== 'main').map(row => row.key)
  });
  return {
    id: '2026-09-14-migrate-recommendation-subsections',
    operation: 'update-recommendation-subsections',
    recommendationSubsections: subsections,
    note: 'One-time migration from legacy inferred Recommendation subsections to explicit v4 structure.'
  };
}
```

The CLI layer loads live state/production rows and prints JSON. It must not publish.

- [ ] **Step 3: Run migration tests**

Run:

```bash
node --test test/recommendation-subsection-migration.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Generate the real migration request from current live state**

Only during implementation execution, after Tasks 1-5 pass:

```bash
node scripts/build-recommendation-subsections-migration.mjs \
  > catalogue-requests/2026-09-14-migrate-recommendation-subsections.json
```

Do not publish it yet.

- [ ] **Step 5: Review the generated membership manually before commit**

Check all three initial sections and compare the generated relative order to current production behavior. Specifically inspect known sensitive examples such as Joya Black, KFC Sweet Ponies, BLACKENED M81 Coronets, and current Petit Panatela entries. Confirm no Half/Taster/archived key appears.

- [ ] **Step 6: Add a request-shape regression for the generated file**

Test imports/reads the generated JSON and calls `validateRequest`, then asserts the membership invariant against the current repository catalogue inventory fixture.

- [ ] **Step 7: Commit migration builder and request, but do not merge/publish until compatible code is ready**

```bash
git add scripts/build-recommendation-subsections-migration.mjs \
  test/recommendation-subsection-migration.test.mjs \
  catalogue-requests/2026-09-14-migrate-recommendation-subsections.json
git commit -m "chore: prepare recommendation subsection migration"
```

---

### Task 7: Full integration regression and obsolete-code audit

**Files:**
- Potentially modify any tests listed above only to resolve genuine integration issues.
- Do not add unrelated refactors.

**Interfaces:**
- Entire repository test suite must pass under Node 22.
- No runtime code may write `recommendationRank` or `recommendationCohort` as authoritative v4 state.
- No v4 Recommendation render/save path may fall back to global `rank`.

- [ ] **Step 1: Search for obsolete Recommendation rank/cohort ownership**

Run:

```bash
grep -R "recommendationRank\|recommendationCohort\|catalogue-recommendation-cohorts" \
  public src scripts test --exclude-dir=node_modules
```

Expected remaining matches are limited to:

- v3 compatibility/migration code in `catalogue-recommendation-legacy.mjs`;
- tests explicitly proving legacy data is ignored after v4 migration;
- comments/docstrings identifying deprecated fields.

Any runtime v4 write or renderer dependency is a failure.

- [ ] **Step 2: Search for competing structural save transforms**

Run:

```bash
grep -R "registerCatalogueStateTransform" public --include='*.mjs'
```

Expected: no Recommendation or Half structural reranker registers a transform. If unrelated transforms exist, leave them untouched.

- [ ] **Step 3: Run the complete test suite**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Run a local Wrangler smoke check**

Start locally:

```bash
npm run dev
```

Verify manually against local state fixtures or dev KV:

1. v3 catalogue loads using compatibility rendering;
2. v4 fixture loads explicit subsection names/order;
3. editor can rename/add/reorder subsection;
4. move card between subsections;
5. archive and restore to Recommendation/Half/Taster;
6. reload preserves the exact state;
7. eyebrow text is unchanged;
8. H/T numbering remains independent.

Stop the dev server after verification.

- [ ] **Step 5: Inspect diff for unrelated catalogue-data changes**

Run:

```bash
git diff main...HEAD -- public src scripts test catalogue-requests .github/workflows
```

Confirm no incidental prose, rating, price, image, retailer, Value, or unrelated cigar metadata edits.

- [ ] **Step 6: Commit any integration-only fixes**

```bash
git add public src scripts test .github/workflows catalogue-requests
git commit -m "test: harden recommendation subsection rebuild"
```

Skip this commit if no changes were needed.

---

### Task 8: PR, staged deployment, live migration, and production verification

**Files/Systems:**
- Implementation branch/PR for this rebuild
- Superseded PR #76
- Cloudflare Worker deployment
- Live `catalogue-overrides` KV
- `catalogue-requests/2026-09-14-migrate-recommendation-subsections.json`

**Interfaces:**
- Code deployment and catalogue publication are separate gates.
- Migration publication is allowed only after production code is proven v3/v4-compatible.

- [ ] **Step 1: Close superseded PR #76 once the new implementation branch exists**

Close PR #76 with a short note that its per-card `recommendationCohort`/`recommendationRank` seed model was superseded by the approved first-class ordered subsection architecture. Do not merge it.

- [ ] **Step 2: Push/open the rebuild PR and wait for CI**

PR description must summarize:

- explicit v4 subsection arrays;
- single structural state engine;
- editor subsection manager and cross-type moves;
- v3 compatibility fallback;
- v4-safe publisher;
- separate live migration gate.

Confirm `npm test` GitHub Actions job passes.

- [ ] **Step 3: Review the implementation PR before merge**

Inspect changed files and confirm no unrelated catalogue data changed. Verify the migration request is present but understand that its automatic publication on merge must not occur before code deployment.

Because the current workflow publishes changed `catalogue-requests/*.json` on push to `main`, do **not** merge a commit containing the live migration request until the compatible Worker/frontend code is already deployed. Use one of these safe sequences:

1. Preferred: merge/deploy compatible code first without the migration request, then land the migration request in a second small PR; or
2. If keeping one development branch, split the migration request into a follow-up branch/PR before merge.

Do not rely on workflow ordering between Worker deployment and catalogue-request publication.

- [ ] **Step 4: Merge compatible code without publishing the migration request**

After CI and review, merge the code portion to `main`.

- [ ] **Step 5: Deploy the compatible code to Cloudflare**

Run from updated `main`:

```bash
npm run deploy
```

Capture Wrangler’s successful deployment output/version.

- [ ] **Step 6: Verify production is running the new compatible renderer before migration**

Check production assets/module source or another deterministic build marker and confirm:

- `catalogue-runtime.mjs` loads `catalogue-recommendation-subsections.mjs`;
- old v3 live state still renders correctly through compatibility fallback;
- editor still opens and loads state;
- no live state has been migrated yet.

If any of these checks fail, stop. Do not publish v4 state.

- [ ] **Step 7: Land the migration request in a separate small PR**

The migration PR should contain only the audited request JSON plus any request-specific regression test needed for that final generated content. Re-run CI and inspect the exact `entryKeys` arrays.

- [ ] **Step 8: Merge the migration request and observe the catalogue publication workflow**

The GitHub Action should call the v4-safe publisher, write explicit `recommendationSubsections`, read back the live state, and verify the full array.

If publication fails, do not manually patch around the invariant. Diagnose the mismatch and fix the request/tooling.

- [ ] **Step 9: Verify live KV read-back**

GET:

```text
https://cigar-catalogue.psncodex.workers.dev/api/catalogue-overrides?verify=1
```

Confirm:

- `version === 4`;
- all expected subsection IDs/names/descriptions exist;
- each active Recommendation key appears exactly once;
- no Half/Taster/archived key appears;
- array order matches the audited migration request;
- unrelated card/entry fields remain intact.

- [ ] **Step 10: Verify production rendering and editor behavior after migration**

In production verify:

1. Recommendation subsection order matches v4 state.
2. Each subsection numbering is contiguous `No. 1..N` and independent.
3. Reload does not reset or reshuffle ranks.
4. Joya Black remains in its explicit subsection regardless of prose wording.
5. Rename a subsection and reload: stable ID/membership/order persist.
6. Create an empty subsection and reload: it persists.
7. Reorder subsections and reload: order persists without changing cigar order.
8. Move one entry between two Recommendation subsections: only source/destination orders change.
9. Archive a Recommendation: it disappears from the active list and remaining local positions compact.
10. Restore an archived entry to a chosen Recommendation subsection/position.
11. Restore/move a test entry to Half-Cigar/Taster and verify only that destination cohort compacts.
12. Eyebrow copy is unchanged.

Use a reversible low-risk entry for live structural smoke tests and restore its original state before completion.

- [ ] **Step 11: Run final full verification from updated `main`**

```bash
npm test
```

Expected: PASS after the live migration request has merged.

- [ ] **Step 12: Report completion only with evidence**

Completion report must include:

- implementation PR/merge commit;
- successful CI result;
- Cloudflare deployment confirmation;
- migration publication workflow confirmation;
- live API version/read-back result;
- production UI verification result;
- confirmation PR #76 was closed unmerged.

Do not say the rebuild is complete if any one of those gates is missing.
