# Catalogue Convenience Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local personal statuses, a four-cigar compare tray, compact/detailed card disclosure, and retailer matrices without changing catalogue editorial/KV semantics.

**Architecture:** Add one browser-only decorator module loaded by the existing `catalogue-value.mjs` bootstrap. Keep all personal interaction state in localStorage, derive comparison and retailer display data from the existing rendered cards and read-only `/api/stock`, and leave the current renderer, ranking, Value, tier, archive, Half-Cigar, and stock systems untouched.

**Tech Stack:** Vanilla ES modules, DOM APIs, localStorage, existing Cloudflare Worker-rendered HTML, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-catalogue-convenience-layer-design.md`

## Global Constraints
- Do not add `Find me a cigar` or recommendation filters.
- Do not write personal status, compare state, or disclosure state to catalogue KV.
- Do not change ranking, tier routing, Value, laurels, archive state, Half-Cigar handling, or stock semantics.
- Preserve `.shop` retailer links in the DOM for stock extraction/backwards compatibility.
- Unknown retailer-specific stock or prices must remain unknown rather than inferred.

---

### Task 1: Pure state and retailer helpers

**Files:**
- Create: `test/catalogue-convenience.test.mjs`
- Create: `public/catalogue-convenience.mjs`

**Interfaces:**
- Produces: `normaliseConvenienceState(value)`, `togglePersonalStatus(state,key,status)`, `toggleCompareKey(state,key,max)`, `retailerLabelForUrl(url)`, `matchRetailerStatus(result,url,label)`.

- [ ] **Step 1:** Add tests asserting compact is the default, statuses remain independent, compare selection de-duplicates and refuses a fifth item, retailer labels map known Australian hosts, and missing retailer matches return `unknown`.
- [ ] **Step 2:** Push tests and confirm CI fails because `public/catalogue-convenience.mjs` does not exist.
- [ ] **Step 3:** Implement only the pure helpers and storage-safe defaults.
- [ ] **Step 4:** Confirm the focused tests pass.

### Task 2: Card controls and progressive disclosure

**Files:**
- Modify: `public/catalogue-convenience.mjs`
- Modify: `test/catalogue-convenience.test.mjs`

**Interfaces:**
- Consumes: Task 1 state helpers.
- Produces: idempotent `decorateCard(card)`, global toolbar, personal-status filtering, compact/detailed presentation, and per-card Details/Collapse overrides.

- [ ] **Step 1:** Add source/integration tests requiring four status chips, Compare and Details controls, dedicated personal-filter hiding, compact-first CSS selectors, and click propagation protection.
- [ ] **Step 2:** Confirm tests fail against helper-only module.
- [ ] **Step 3:** Implement toolbar/card decoration and CSS, preserving all existing card nodes and using only additive classes/data attributes.
- [ ] **Step 4:** Confirm focused tests pass.

### Task 3: Compare tray and overlay

**Files:**
- Modify: `public/catalogue-convenience.mjs`
- Modify: `test/catalogue-convenience.test.mjs`

**Interfaces:**
- Consumes: persisted compare keys and decorated cards.
- Produces: fixed compare tray, overlay, card snapshot extraction, max-four feedback, clear/close/Escape behaviour.

- [ ] **Step 1:** Add tests for required compare fields, max-four copy, tray visibility semantics, and no duplicate compare keys.
- [ ] **Step 2:** Confirm failure before UI implementation.
- [ ] **Step 3:** Implement comparison extraction/rendering without cloning or modifying editorial card content.
- [ ] **Step 4:** Confirm focused tests pass.

### Task 4: Retailer matrix

**Files:**
- Modify: `public/catalogue-convenience.mjs`
- Modify: `test/catalogue-convenience.test.mjs`

**Interfaces:**
- Consumes: existing `.shop` links, `/api/stock` cache payload, card package/per-stick facts.
- Produces: retailer matrix rows with label, matched stock, defensible price attribution, and direct Open link.

- [ ] **Step 1:** Add tests that legacy `.shop` links are preserved, multi-retailer cards do not receive inferred per-retailer prices, single-retailer cards may show the catalogue price, and stock fetch failure degrades to Unknown.
- [ ] **Step 2:** Confirm failure.
- [ ] **Step 3:** Implement read-only stock fetch and matrix decoration; hide legacy links visually only after a matrix exists.
- [ ] **Step 4:** Confirm focused tests pass.

### Task 5: Bootstrap, regression verification, and release

**Files:**
- Modify: `public/catalogue-value.mjs`
- Modify: `test/catalogue-convenience.test.mjs`

**Interfaces:**
- Consumes: completed convenience module.
- Produces: automatic loading on the live catalogue.

- [ ] **Step 1:** Add a loader assertion for `import('./catalogue-convenience.mjs')` and a guard test that the module contains no catalogue write endpoint or admin write helper.
- [ ] **Step 2:** Confirm loader test fails.
- [ ] **Step 3:** Add the one bootstrap import.
- [ ] **Step 4:** Run the complete repository test suite through PR CI and inspect the diff for unrelated modifications.
- [ ] **Step 5:** Merge only after CI is green, then verify the production asset and catalogue rendering before reporting completion.
