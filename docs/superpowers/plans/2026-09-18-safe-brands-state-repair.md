# Safe Brands Sidebar and Catalogue State Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the application to the 2026-09-17 13:21 Perth `208e0b172f4a8cad71f9497a97ebfedea751d8ef` baseline, keep Brands navigation/filtering safe and compact, and repair catalogue placement/image references without allowing sidebar UI to mutate catalogue state.

**Architecture:** The branch starts exactly at `208e0b`. Brand filtering remains a browser-only view concern; the Brands module may GET `/api/catalogue-overrides` to determine active/archived cards and may PUT only `/api/catalogue-image/brand-logo-*` for brand-logo uploads. Catalogue placement/image repair is performed through a separate guarded recovery script/request path that reads current live KV, applies only historically verified corrections, preserves unrelated state, removes stored Value fields, and verifies live read-back plus rendered HTML.

**Tech Stack:** Node.js 22, ES modules, node:test, JSDOM, Cloudflare Worker/KV, GitHub Actions publisher.

**Spec:** User-approved repair in the 2026-09-18 Cigar Catalogue conversation.

## Global Constraints

- Application baseline is commit `208e0b172f4a8cad71f9497a97ebfedea751d8ef`.
- Brands filtering/navigation must never PUT/POST/PATCH/DELETE `/api/catalogue-overrides`.
- Brand logos use only `/api/catalogue-image/brand-logo-<slug>`.
- Preserve unrelated catalogue fields and live data.
- Value remains system-derived; stored/manual `value` fields are removed rather than restored.
- Main, Taster, and Half-Cigar cohorts remain distinct.
- Rank changes only follow verified subsection/cohort placement; eyebrow text is untouched.
- Verify live KV and rendered Worker output before completion.

---

### Task 1: Lock Brands write-safety with regression tests

**Files:**
- Modify: `test/catalogue-control-sidebar.test.mjs`

**Interfaces:**
- Consumes: `public/catalogue-control-sidebar.mjs`
- Produces: tests proving filter/navigation never write catalogue state and logo upload targets only the brand-logo image endpoint.

- [ ] **Step 1: Write failing tests**

Add source/behaviour assertions that:

```js
const sidebarSource = await readFile(new URL('../public/catalogue-control-sidebar.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(sidebarSource, /method:\s*['\"](?:PUT|POST|PATCH|DELETE)['\"][\s\S]{0,300}\/api\/catalogue-overrides/i);
```

and simulate brand filtering with a fetch spy, allowing the initial GET of `/api/catalogue-overrides` but asserting no non-GET request targets that endpoint.

- [ ] **Step 2: Run the targeted test and verify the new safety test fails if an unsafe write is injected**

Run: `node --test test/catalogue-control-sidebar.test.mjs`

Expected: existing 1:21 code passes; temporarily mutating the test fixture/source expectation to an unsafe pattern proves the test catches it, then restore the real assertion.

- [ ] **Step 3: Keep production behaviour minimal**

No catalogue-state write helper may be introduced in the sidebar. Retain only GET state hydration and PUT brand-logo image upload.

- [ ] **Step 4: Run the targeted test**

Run: `node --test test/catalogue-control-sidebar.test.mjs`
Expected: PASS.

### Task 2: Make Brands compact without catalogue-state persistence

**Files:**
- Modify: `public/catalogue-control-sidebar.mjs`
- Modify: `test/catalogue-control-sidebar.test.mjs`
- Modify: `public/catalogue-runtime.mjs` if cache-bust identifier must change

**Interfaces:**
- Produces: collapsed-by-default Brands panel, active brands only, single-select filter, All Brands reset, deterministic logo display/upload.

- [ ] **Step 1: Write failing UI tests**

Assert Brands uses an accessible collapsible control (`details`/`summary` or equivalent), starts collapsed, retains `All Brands`, and filtering continues to preserve pre-existing hidden state.

- [ ] **Step 2: Run targeted test and verify RED**

Run: `node --test test/catalogue-control-sidebar.test.mjs`
Expected: FAIL because the 1:21 Brands section is always expanded.

- [ ] **Step 3: Implement minimal compact Brands UI**

Use a `<details>` container with `<summary class="catalogue-sidebar-heading">BRANDS</summary>` and the existing brand list inside. Do not add persisted open/closed state. Keep upload controls local to each active brand row and keep logo writes on the image endpoint only.

- [ ] **Step 4: Run targeted test and full suite**

Run: `node --test test/catalogue-control-sidebar.test.mjs && npm test`
Expected: PASS.

### Task 3: Reconstruct verified placement and image references

**Files:**
- Create: `scripts/repair-live-placement-images.mjs`
- Create: `test/repair-live-placement-images.test.mjs`
- Modify: `.github/workflows/publish-catalogue.yml` only if a guarded one-shot repair trigger is required.

**Interfaces:**
- Consumes: current `/api/catalogue-overrides`, the static 1:21 catalogue seed in `public/index.html`, and verified historical exceptions/additions.
- Produces: a repaired full state payload that preserves unrelated card/entry metadata while correcting only placement/cohort/rank and image-reference fields.

- [ ] **Step 1: Write failing recovery tests**

Build fixtures representing the known bad reconstruction: entries incorrectly forced into `catalogueType:'main'`, subsection arrays with stale membership/order, and image source keys pointing at stale/non-matching keys. Assert repair preserves unrelated prose/prices/ratings, restores verified cohort placement, derives main-subsection rank from authoritative ordered arrays, never converts Taster/Half-Cigar to main, and only rewrites image references when a verified source key is supplied.

- [ ] **Step 2: Run recovery test and verify RED**

Run: `node --test test/repair-live-placement-images.test.mjs`
Expected: FAIL because the repair module does not yet exist.

- [ ] **Step 3: Implement pure repair functions first**

Export functions that clone current state, apply a verified placement map and verified image-source map, rebuild recommendation subsection membership/ranks only for main entries, preserve Taster/Half-Cigar cohorts, remove stored `value`, and leave all unrelated fields untouched.

- [ ] **Step 4: Add guarded live mode**

`--dry-run-live` fetches live state and prints counts/diffs without writing. `--apply` requires `CATALOGUE_ADMIN_TOKEN`, PUTs the complete repaired state once, then GETs `/api/catalogue-overrides` and the rendered home page to verify key counts, cohort placement, image references and rendered cards.

- [ ] **Step 5: Run targeted recovery tests and full suite**

Run: `node --test test/repair-live-placement-images.test.mjs && npm test`
Expected: PASS.

### Task 4: Deploy and verify production

**Files:**
- No new production files beyond Tasks 1–3.

**Interfaces:**
- Consumes: merged main branch and Cloudflare native Git deployment/publisher.
- Produces: live 1:21-based app with safe Brands sidebar and repaired catalogue state.

- [ ] **Step 1: Open PR from `repair/208e-safe-brands-and-state` to `main` and wait for CI**
- [ ] **Step 2: Inspect test job logs; do not merge on failure**
- [ ] **Step 3: Merge after green CI**
- [ ] **Step 4: Confirm native Cloudflare deployment serves the new sidebar module**
- [ ] **Step 5: Apply the guarded placement/image repair through the repository publisher/one-shot script**
- [ ] **Step 6: Read live KV and rendered Worker output back and compare expected counts/keys/placements/images**
- [ ] **Step 7: Confirm Brands filtering works while catalogue state remains byte-for-byte unchanged across a filter click except for no state write occurring at all**
