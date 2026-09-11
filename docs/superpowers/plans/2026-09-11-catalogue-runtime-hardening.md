# Catalogue Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate browser runtime plumbing and CI coverage while preserving the current catalogue UI and all catalogue/editor behaviour.

**Architecture:** Keep existing feature modules and public markup contracts, but move browser bootstrap out of the pure Value module, replace two independent catalogue-state `fetch()` wrappers with one deterministic save pipeline, and make the convenience module own retailer best-price rendering directly. Limit cleanup to obsolete root artefacts and documentation; leave publication history and catalogue data untouched.

**Tech Stack:** Cloudflare Workers, browser ES modules, Node 22 test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-catalogue-runtime-hardening-design.md`

## Global Constraints

- No catalogue data, ranking, rating, Value formula, stock semantics, editor fields, visual markup, or user-facing copy changes except maintenance documentation.
- Keep `catalogue-requests/` unchanged.
- Preserve all current module feature behaviour.
- All production-code refactors require a failing regression test first.
- Full `npm test` must pass in GitHub Actions before merge.

---

### Task 1: Protect frontend changes in CI and define runtime bootstrap contract

**Files:**
- Modify: `.github/workflows/publish-catalogue.yml`
- Modify: `test/catalogue-convenience-loader.test.mjs`
- Create: `public/catalogue-runtime.mjs`
- Modify: `public/catalogue-value.mjs`

**Interfaces:**
- `catalogue-value.mjs` exports only Value-calculation APIs.
- `catalogue-runtime.mjs` loads browser feature modules when `document` exists.

- [ ] **Step 1: Write failing tests**

Update the loader test so it reads both `catalogue-value.mjs` and `catalogue-runtime.mjs`, asserts that runtime imports the existing browser modules, and asserts Value contains no browser bootstrap imports. Add a workflow-source assertion that both pull-request and push path filters include `public/**`.

- [ ] **Step 2: Run the PR workflow and verify RED**

Expected failure: runtime file missing and/or workflow does not include `public/**`.

- [ ] **Step 3: Implement minimal bootstrap split**

Create `catalogue-runtime.mjs` containing the guarded browser imports currently at the top of `catalogue-value.mjs`, and remove those imports from `catalogue-value.mjs`. Update the existing page bootstrap reference to load the runtime module while keeping Value available to Worker code.

- [ ] **Step 4: Add `public/**` to both workflow path filters**

Do not alter publish conditions; frontend-only changes should verify but should not create catalogue request mutations.

- [ ] **Step 5: Verify GREEN**

Run the PR workflow and confirm all tests pass for this task.

---

### Task 2: Replace independent save wrappers with one deterministic pipeline

**Files:**
- Create: `public/catalogue-save-pipeline.mjs`
- Create: `test/catalogue-save-pipeline.test.mjs`
- Modify: `public/catalogue-flavour.mjs`
- Modify: `public/catalogue-half-cohort.mjs`
- Modify: `public/catalogue-runtime.mjs`

**Interfaces:**
- `registerCatalogueStateTransform(name, priority, transform)` registers a pure JSON payload transform for catalogue-state PUT requests.
- `registerCatalogueStateResponseListener(name, listener)` registers a post-response listener.
- The shared pipeline owns the single global `fetch` wrapper and applies transforms in ascending priority, independent of module load order.

- [ ] **Step 1: Write failing save-pipeline tests**

Tests must prove transforms run in priority order, registration by name is idempotent/replaces the same registration, non-catalogue requests pass through unchanged, successful catalogue GET/PUT responses notify listeners, and only the shared pipeline assigns the wrapped global fetch.

- [ ] **Step 2: Run PR workflow and verify RED**

Expected failure: pipeline module does not exist and flavour/half modules still contain their own wrappers.

- [ ] **Step 3: Implement the pipeline**

Keep the wrapper narrowly scoped to `/api/catalogue-overrides`. For PUTs with a string JSON body, parse once, apply registered transforms, serialize once, call the original fetch, then notify listeners after successful responses. For successful GET/HEAD, provide listeners a cloned parsed state when available without consuming the caller response.

- [ ] **Step 4: Migrate Flavour**

Replace `patchFetch()` with registrations. Preserve the existing 15-second pending-save guard, flavour injection semantics, local state refresh after GET, and local card refresh after successful PUT.

- [ ] **Step 5: Migrate Half-Cigar**

Replace `installSaveInterceptor()` with registrations. Preserve `patchStatePayloadForEditor()` exactly and trigger membership hydration after successful catalogue-state PUTs.

- [ ] **Step 6: Verify GREEN**

Run full tests. Confirm no feature module other than `catalogue-save-pipeline.mjs` assigns `globalThis.fetch` or `window.fetch`.

---

### Task 3: Fold best-price rendering into the retailer matrix

**Files:**
- Modify: `public/catalogue-convenience.mjs`
- Modify: `test/catalogue-convenience.test.mjs`
- Modify: `test/catalogue-convenience-loader.test.mjs`
- Delete: `public/catalogue-retailer-best-price.mjs`
- Modify: `public/catalogue-runtime.mjs`

**Interfaces:**
- `retailerPriceAttribution(rowIndex, packageText, perStickText)` returns the catalogue benchmark price only for row 0 and `—` for later retailer rows.

- [ ] **Step 1: Write failing retailer tests**

Change the existing attribution tests to expect row-index semantics and add a source-level assertion that runtime no longer imports `catalogue-retailer-best-price.mjs`.

- [ ] **Step 2: Verify RED**

Expected failure: convenience still uses link-count suppression and runtime/workaround module still exists.

- [ ] **Step 3: Implement direct rendering**

In `decorateRetailerMatrix()`, calculate price independently per retailer row using the row index. Keep retailer stock matching, links, labels and matrix HTML structure unchanged.

- [ ] **Step 4: Remove workaround module**

Delete the extra best-price module and its MutationObserver, and remove its runtime import.

- [ ] **Step 5: Verify GREEN**

Run full tests and confirm first-row best price plus later-row dashes are preserved.

---

### Task 4: Safe maintenance cleanup

**Files:**
- Modify: `README.md`
- Modify: `DEPLOY.bat`
- Delete: `README_DEPLOY.txt`
- Delete: `live-snapshot-overrides.json`
- Delete: `lfd-add-research.json`
- Create/modify tests only if a deleted file is unexpectedly referenced.

**Interfaces:**
- README documents current source-of-truth and normal deployment/publisher paths.
- `DEPLOY.bat` performs the same `wrangler deploy` command without stale version text.

- [ ] **Step 1: Confirm runtime/test references**

Search source, tests, workflow and package scripts for each obsolete root filename. If any active reference exists, keep the file and document why instead of deleting it.

- [ ] **Step 2: Update README and deploy helper**

Document KV/Git source-of-truth, `npm test`, `npm run dev`, `npm run deploy`, catalogue request publishing, and the warning not to treat historical snapshots as live data.

- [ ] **Step 3: Delete only unreferenced artefacts**

Do not delete request history, specs/plans, assets, tests or current runtime files.

- [ ] **Step 4: Verify GREEN**

Run full tests.

---

### Task 5: Final regression and diff review

**Files:**
- Review all changed files.

- [ ] **Step 1: Run full `npm test` through GitHub Actions**

Expected: zero failures.

- [ ] **Step 2: Review changed filenames and patches**

Confirm there are no changes to `public/index.html`, catalogue request JSON, image files, Value constants/formula, ranking algorithms, stock logic, or catalogue content.

- [ ] **Step 3: Verify main behaviour contracts from tests**

Confirm publisher, Worker rendering, editor regressions, Half-Cigar cohort/UI, flavour/value, convenience compare/personal controls, stock visibility, layout and retailer-link tests all remain green.

- [ ] **Step 4: Merge by squash only after verification**

Use a concise commit title describing runtime hardening. Re-run the post-merge main workflow and report its actual result.
