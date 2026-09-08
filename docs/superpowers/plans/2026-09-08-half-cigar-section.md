# Half-Cigar Catalogue Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rating-driven Substantial recommendation group with a semantic Half-Cigar group, add an independent main Ranking presentation, and add a Half Cigars-only view control.

**Architecture:** Keep `public/index.html` unchanged because it is a very large generated/static file. Extend the existing presentation runtime so one classification rule marks half-cigar cards, repurposes the existing Substantial DOM container at runtime, builds a lightweight ranking list from active main cards, and installs a Half Cigars-only view button beside the existing Tasters control.

**Tech Stack:** Browser ES modules, vanilla DOM APIs, Node 22 test runner.

**Spec:** `docs/superpowers/specs/2026-09-08-half-cigar-section-design.md`

## Global Constraints

- Strong must render before The Half-Cigar.
- Every main entry whose identifying/usage metadata contains `half` or `halv…` belongs in The Half-Cigar.
- Summary-only wording such as “second half” must not classify a card.
- Tasters remain separate.
- No hard-coded cigar-key allowlist.
- Existing automatic medal/Value logic is unchanged.
- Preserve current stock-dot, nicotine-label, Elite-quality-exception, and unavailable-card behavior.

---

### Task 1: Replace Substantial behavior tests with Half-Cigar semantics

**Files:**
- Modify: `test/catalogue-presentation.test.mjs`
- Modify: `test/catalogue-layout.test.mjs`

**Interfaces:**
- Consumes: existing `recommendationDestination(labels, options)` export.
- Produces: required exports `containsHalfCigarCue(value)` and `isHalfCigarCard(card)` plus source-level expectations for runtime section/view setup.

- [ ] **Step 1: Write failing tests**

Replace the old Substantial medal-set tests with assertions equivalent to:

```js
assert.equal(presentation.containsHalfCigarCue('Half Corona'), true);
assert.equal(presentation.containsHalfCigarCue('halve before lighting'), true);
assert.equal(presentation.containsHalfCigarCue('HALVING format'), true);
assert.equal(presentation.containsHalfCigarCue('ordinary corona'), false);

const card = {
  dataset: { key: 'example-corona' },
  querySelector(selector) {
    if (selector === 'h3') return { textContent: 'Example Corona' };
    if (selector === '.artmeta-right') return { textContent: 'Single · Halve before smoking' };
    if (selector === '.mog-note') return { textContent: '' };
    if (selector === '.summary') return { textContent: 'Strong in the second half' };
    return null;
  }
};
assert.equal(presentation.isHalfCigarCard(card), true);
```

Also test a card whose only `half` occurrence is `.summary` returns false.

Change routing expectations so:

```js
assert.equal(presentation.recommendationDestination(['size']), 'noteworthy-neither');
assert.equal(presentation.recommendationDestination(['strength', 'size']), 'strong');
assert.notEqual(presentation.recommendationDestination(['size']), 'substantial');
```

Replace the layout test that requires static Substantial-before-Noteworthy ordering with source assertions that the presentation runtime renames the existing substantial section to `The Half-Cigar` and moves it after the Strong section.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test
```

Expected: FAIL because `containsHalfCigarCue` / `isHalfCigarCard` do not yet exist and current routing still returns `substantial`.

- [ ] **Step 3: Commit failing tests**

```bash
git add test/catalogue-presentation.test.mjs test/catalogue-layout.test.mjs
git commit -m "test: specify half-cigar presentation"
```

---

### Task 2: Implement semantic Half-Cigar recommendation grouping

**Files:**
- Modify: `public/catalogue-presentation.mjs`

**Interfaces:**
- Produces: `containsHalfCigarCue(value): boolean`
- Produces: `isHalfCigarCard(card): boolean`
- Keeps: `recommendationDestination(labels, options): string`

- [ ] **Step 1: Add the cue matcher and card classifier**

Implement:

```js
export function containsHalfCigarCue(value) {
  return /half|halv/i.test(String(value || ''));
}

export function isHalfCigarCard(card) {
  if (!card) return false;
  const sources = [
    card.dataset?.key,
    card.querySelector?.('h3')?.textContent,
    card.querySelector?.('.artmeta-right')?.textContent,
    card.querySelector?.('.mog-note')?.textContent
  ];
  return sources.some(containsHalfCigarCue);
}
```

Do not inspect `.summary`.

- [ ] **Step 2: Remove medal-driven Substantial routing**

Delete `isSubstantialGoldSet` from routing and make `recommendationDestination` fall through from Elite directly to Strong, then Noteworthy.

- [ ] **Step 3: Repurpose the existing Substantial grid**

Add runtime setup that:

```js
const halfSection = root.querySelector('[data-noteworthy-section="substantial"]');
const strongSection = root.querySelector('[data-tier-section="strong"]');
halfSection.querySelector('.subtier-heading').textContent = 'The Half-Cigar';
if (strongSection?.parentElement === halfSection?.parentElement) {
  strongSection.parentElement.insertBefore(halfSection, strongSection.nextSibling);
}
```

Update the section note to concise half-format copy.

- [ ] **Step 4: Reclassify main cards by semantic Half-Cigar status first**

For each active, non-taster, available main card:

```js
const destination = isHalfCigarCard(card)
  ? 'half-cigar'
  : recommendationDestinationForCard(card);
```

Map `half-cigar` to the existing Substantial grid internally. Mark every card with `data-half-cigar="1"` or `"0"` from the same classifier.

- [ ] **Step 5: Run tests and verify GREEN for grouping behavior**

Run:

```bash
npm test
```

Expected: Half-Cigar classification and recommendation-routing tests pass; remaining ranking/view tests may still fail until Task 3.

---

### Task 3: Add independent Ranking and Half Cigars-only view

**Files:**
- Modify: `public/catalogue-presentation.mjs`
- Test: `test/catalogue-presentation.test.mjs`

**Interfaces:**
- Produces runtime `[data-ranking-section="main"]` section.
- Produces runtime `[data-half-cigar-filter]` button.

- [ ] **Step 1: Generate a lightweight main Ranking section**

Create or refresh one section before the recommendation groups. Build rows from cards matching:

```js
article.card[data-key]
```

Exclude `data-archived="1"` and `data-taster="1"`, sort by numeric `data-rank`, and render rank + cigar title from `h3` with key fallback. Do not clone full cards.

- [ ] **Step 2: Remove numeric rank prefix from recommendation-card eyebrow copy**

Normalize visible eyebrow copy from forms such as `No. 12 — Strong profile` to `Strong profile`, while preserving the stock dot added by the presentation runtime.

- [ ] **Step 3: Install the Half Cigars view control**

Find the existing control whose trimmed text is `Tasters`. Insert a sibling button labeled `Half Cigars`, copy the Tasters control class for visual consistency, set `data-half-cigar-filter`, and attach a click handler.

- [ ] **Step 4: Implement Half Cigars-only mode**

When active, hide the Ranking section and every recommendation/taster group except the Half-Cigar section, and show only cards marked `data-half-cigar="1"`. When another sibling catalogue view control is clicked, restore the normal presentation state before that control handles its own view.

- [ ] **Step 5: Make refresh robust to dynamic catalogue edits**

Refresh ranking, half classification, section copy/order, and button presence from the existing mutation-driven presentation refresh. Add `data-rank` to the observer attribute filter and observe character data so title/practical/note edits reclassify without a reload.

- [ ] **Step 6: Run the entire suite**

Run:

```bash
npm test
```

Expected: all tests PASS with no warnings/errors.

- [ ] **Step 7: Commit implementation**

```bash
git add public/catalogue-presentation.mjs test/catalogue-presentation.test.mjs test/catalogue-layout.test.mjs
git commit -m "feat: add half-cigar catalogue view"
```

---

### Task 4: Review, CI verification, and integration

**Files:**
- No new source files required.

**Interfaces:**
- Verifies the feature branch against the repository test workflow.

- [ ] **Step 1: Review the branch diff**

Confirm only the spec/plan, presentation runtime, and presentation/layout tests changed.

- [ ] **Step 2: Open or update the pull request**

Use `feat/half-cigar-section` into `main` so the existing PR workflow runs `npm test` on Node 22.

- [ ] **Step 3: Verify CI**

Confirm the workflow completes successfully. If it fails, inspect the failing test/job and fix before merge.

- [ ] **Step 4: Merge after verification**

Integrate the tested branch into `main` so the hosting/deployment integration can publish the presentation update.
