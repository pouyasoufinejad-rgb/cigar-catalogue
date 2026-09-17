# Safe Brands Sidebar and Catalogue State Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the application to the 2026-09-17 13:21 Perth `208e0b172f4a8cad71f9497a97ebfedea751d8ef` baseline, keep Brands navigation/filtering safe and compact, and repair catalogue placement/image references without allowing sidebar UI to mutate catalogue state.

**Architecture:** Start from current `main`, explicitly restore the four application/test files changed since `208e0b`, then harden Brands. Brand filtering remains browser-only; the Brands module may GET `/api/catalogue-overrides` for authoritative archive state and may PUT only `/api/catalogue-image/brand-logo-*`. Placement/image recovery uses a separate guarded script that clones current live state, applies only verified corrections, removes stored Value fields, and verifies live read-back and rendered HTML.

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

### Task 1: Restore the 1:21 PM application tree

**Files:**
- Restore from `208e0b`: `public/catalogue-brand-line-config.mjs`
- Restore from `208e0b`: `public/catalogue-control-sidebar.mjs`
- Restore from `208e0b`: `public/catalogue-runtime.mjs`
- Restore from `208e0b`: `test/catalogue-control-sidebar.test.mjs`

- [ ] Add a failing test proving the compact Brands panel requirement.
- [ ] Restore the four 1:21 PM files exactly from `208e0b`.
- [ ] Run targeted sidebar tests.

### Task 2: Harden and compact Brands

**Files:**
- Modify: `public/catalogue-control-sidebar.mjs`
- Modify: `test/catalogue-control-sidebar.test.mjs`
- Test: `test/catalogue-control-sidebar-safety.test.mjs`

- [ ] Add a source/behaviour regression guard forbidding non-GET requests to `/api/catalogue-overrides` from the Brands module.
- [ ] Make Brands a collapsed-by-default `<details data-brand-sidebar>` with `BRANDS` summary.
- [ ] Keep `All Brands`, active-brand discovery, URL state, and image-endpoint-only logo uploads.
- [ ] Run `node --test test/catalogue-control-sidebar*.test.mjs` then `npm test`.

### Task 3: Reconstruct verified placement and image references

**Files:**
- Create: `scripts/repair-live-placement-images.mjs`
- Create: `test/repair-live-placement-images.test.mjs`
- Modify: `.github/workflows/publish-catalogue.yml` only if needed for one-shot guarded execution.

- [ ] Write failing fixtures for stale subsection membership, wrong main/taster/half type, rank drift and stale image references.
- [ ] Implement pure repair functions that preserve all unrelated fields.
- [ ] Use the 1:21 static seed as placement/image baseline for seed-backed cards; preserve verified later KV-only additions such as Arturito and ACID with explicit overrides.
- [ ] In live mode fetch current state, apply only verified corrections, PUT one complete state, then GET live state and rendered HTML to verify.
- [ ] Run targeted repair tests and full suite.

### Task 4: Deploy and verify

- [ ] Open PR and require green CI.
- [ ] Merge only after tests pass.
- [ ] Verify Cloudflare native Git deployment serves the safe 1:21-based sidebar.
- [ ] Run the guarded state repair using the existing `CATALOGUE_ADMIN_TOKEN` Actions secret.
- [ ] Verify live KV counts, subsection/cohort placement, image source keys, Arturito, ACID, and rendered cards.
- [ ] Confirm no Brands action mutates `/api/catalogue-overrides`.
