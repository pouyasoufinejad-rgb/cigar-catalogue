# SmokingPipes-Inspired Catalogue UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current layered catalogue UI with a single dense SmokingPipes-inspired catalogue surface and one master contextual edit mode while preserving live KV data and the Jax and the Skeletons artwork.

**Architecture:** Keep the existing HTML as the authoritative static inventory/image seed, then move hydrated card nodes into a new shell owned by `catalogue-next-ui.mjs`. Persist through the existing `/api/catalogue-overrides`, entry/image APIs, and `adminWriteFetch`; remove conflicting old editor modules from the runtime bootstrap.

**Tech Stack:** Vanilla ES modules, Cloudflare Workers/KV, Node 22 `node:test`, existing catalogue persistence modules.

**Spec:** `docs/superpowers/specs/2026-09-15-smokingpipes-ui-rebuild-design.md`

## Global Constraints

- Keep Cloudflare KV authoritative for editable catalogue data.
- Retain the Jax and the Skeletons artwork/header at the top of the page.
- Preserve unrelated state fields on every partial edit.
- Do not persist a direct Value score.
- Recommendation subsection ranks, Half-Cigar ranks and Taster ranks are independent.
- Rank changes never rewrite eyebrow copy.
- Benchmarks/Legends start collapsed.
- No-hash page loads start at the top.

---

### Task 1: Pure catalogue-view/edit helpers

**Files:**
- Create: `public/catalogue-next-model.mjs`
- Create: `test/catalogue-next-model.test.mjs`

**Interfaces:**
- Produces: `mergedCatalogueSource(key,state,domSeed)`, `catalogueTypeOf(source)`, `brandGroups(rows)`, `recommendationLocation(key,state)`, `moveRecommendationEntry(state,key,subsectionId,targetIndex)`, `moveRankedCohort(rows,key,targetIndex,type)`, `mergeSparseCardPatch(state,key,patch)`, `editablePatch(field,value,source)`.

- [ ] **Step 1: Write failing tests** for exact-brand grouping, explicit Recommendation subsection location, cohort-local reordering, sparse field preservation, eyebrow preservation and direct-Value rejection.
- [ ] **Step 2: Run tests and verify failure** because `catalogue-next-model.mjs` is absent.
- [ ] **Step 3: Implement the model helpers** with no DOM dependency and reuse `validateRecommendationSubsectionsShape`/`normaliseCatalogueType` from `catalogue-structure.mjs`.
- [ ] **Step 4: Run the focused model tests** and ensure they pass.
- [ ] **Step 5: Commit** model and tests.

### Task 2: New catalogue shell and SmokingPipes-style presentation

**Files:**
- Create: `public/catalogue-next-ui.mjs`
- Create: `test/catalogue-next-ui.test.mjs`

**Interfaces:**
- Consumes: helpers from `catalogue-next-model.mjs`; current DOM `article.card[data-key]`; `/api/catalogue-overrides`.
- Produces: `installCatalogueNextUI(root,options)`, `buildCatalogueShell(root,state)`, `renderCatalogueSections(root,state)`, `openBrandExplorer(brand)`.

- [ ] **Step 1: Write failing structural tests** checking that the module exports the install/render functions, defines the new shell IDs/classes, retains existing header/artwork nodes rather than clearing `body`, renders explicit Recommendation subsections, Half-Cigar and Taster mounts, and creates a brand explorer.
- [ ] **Step 2: Run focused tests and verify failure** before the module exists.
- [ ] **Step 3: Implement the shell** by collecting existing card nodes, inserting the new shell below the retained top artwork/header, moving cards into state-driven sections, and hiding only obsolete catalogue containers after their cards have moved.
- [ ] **Step 4: Implement dense responsive CSS** inside one injected stylesheet: sticky utility/nav strip, compact filters/search, three-column retail cards on desktop and single-column cards on mobile.
- [ ] **Step 5: Implement search and brand explorer** using exact brand text/source data and card jump behavior.
- [ ] **Step 6: Run focused tests** and ensure they pass.
- [ ] **Step 7: Commit** the presentation module and tests.

### Task 3: Master contextual edit mode

**Files:**
- Modify: `public/catalogue-next-ui.mjs`
- Modify: `test/catalogue-next-ui.test.mjs`

**Interfaces:**
- Consumes: `adminWriteFetch` from `catalogue-admin-unified-v139.mjs`; model sparse patch/reorder helpers.
- Produces: one `Edit Catalogue` toggle, `data-catalogue-editable` targets, contextual inspector, staged draft state, undo/discard/save controls.

- [ ] **Step 1: Add failing tests** for one master edit toggle, field selection mapping, rank-local behavior, no direct Value input, staged save, undo/discard and successful-state re-fetch.
- [ ] **Step 2: Run tests and verify expected failures.**
- [ ] **Step 3: Implement edit-mode selection and inspector** for title, brand, eyebrow, summary/note, price/package, dimensions, ratings, risk, stock pin, type, retailers, smoke time, image and subsection metadata.
- [ ] **Step 4: Implement rank/reorder controls** using Recommendation `entryKeys` for main cards and contiguous ranks for Half-Cigar/Taster only.
- [ ] **Step 5: Implement staged save/undo/discard** and call `adminWriteFetch('/api/catalogue-overrides',{method:'PUT',...})`; re-fetch state after a successful save.
- [ ] **Step 6: Run focused tests** and ensure they pass.
- [ ] **Step 7: Commit** edit mode.

### Task 4: Runtime cutover without losing legacy content

**Files:**
- Modify: `public/catalogue-runtime.mjs`
- Modify: `test/catalogue-runtime-hardening.test.mjs`
- Modify: `test/catalogue-editor-regressions.test.mjs`
- Create: `test/catalogue-next-runtime.test.mjs`

**Interfaces:**
- Runtime imports `catalogue-next-ui.mjs` after personal status and required persistence/presentation prerequisites, and does not load the old structure/fullscreen editor stack.

- [ ] **Step 1: Add failing runtime tests** that require the new module and reject imports of `catalogue-structure-editor.mjs`, `catalogue-editor-fullscreen.mjs`, `catalogue-editor-behaviour.mjs`, and old convenience editor UI where they conflict.
- [ ] **Step 2: Run tests and verify expected failures.**
- [ ] **Step 3: Replace runtime imports** with the minimum non-conflicting set and the new UI module, keeping stock/status/value/personal-status behavior required by cards.
- [ ] **Step 4: Update superseded regression tests** to assert the new master editor contract rather than the retired full-screen editor.
- [ ] **Step 5: Run the full test suite.**
- [ ] **Step 6: Commit** runtime cutover.

### Task 5: Production verification and deployment

**Files:**
- Modify: `scripts/verify-live-code-ready.mjs`
- Modify: `.github/workflows/deploy-worker.yml`
- Test: `test/runtime-cache-bust.test.mjs`

**Interfaces:**
- Production verification recognizes the new runtime marker and verifies the new UI asset is served.

- [ ] **Step 1: Add/adjust failing verifier tests** for the new runtime/UI marker.
- [ ] **Step 2: Update the verifier/workflow wording** so production readiness checks the rebuilt UI rather than the old v7/v4 editor module chain.
- [ ] **Step 3: Run full tests on the feature branch through pull-request CI.**
- [ ] **Step 4: Merge to `main` only after branch CI passes.**
- [ ] **Step 5: Verify the push workflow completes successfully**, including its production read-back step.
- [ ] **Step 6: Verify production source/state** shows the new runtime asset, live v4 Recommendation subsections, and retained Joya Black Coronets membership.
