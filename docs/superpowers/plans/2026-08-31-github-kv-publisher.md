# GitHub → KV Catalogue Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Actions handoff that publishes catalogue request files to the existing Cloudflare Worker/KV APIs with secure secret handling, image support, read-back verification, and production-render verification.

**Architecture:** `catalogue-requests/*.json` is the auditable handoff format. `scripts/publish-catalogue-request.mjs` performs validation and one-request publication against the existing Worker API using `CATALOGUE_ADMIN_TOKEN`; `.github/workflows/publish-catalogue.yml` runs tests first and only performs production writes for pushes to `main` or explicit manual dispatch. The existing Worker HTML injection remains the rendering implementation; `wrangler.jsonc` is corrected so `/` and `/index.html` actually run through the Worker before static assets.

**Tech Stack:** Node.js ESM, built-in `fetch`, `node:test`, GitHub Actions, Cloudflare Workers/Wrangler configuration.

**Spec:** `docs/superpowers/specs/2026-08-31-github-kv-publisher-design.md`

## Global Constraints

- KV remains authoritative for current editable catalogue data.
- Git remains authoritative for code/tooling and request history.
- `CATALOGUE_ADMIN_TOKEN` must never be printed, logged, serialized, or committed.
- Routine request publication must not require Cloudflare account credentials or a Worker deployment.
- Publisher accepts only PNG, JPEG, and WebP images, maximum 12 MiB.
- Individual deletion is out of scope; archive/unarchive are supported.
- Production write tests use mocks only; no fake production entries.

---

### Task 1: Reproduce and fix dynamic-entry routing

**Files:**
- Modify: `wrangler.jsonc`
- Create: `test/worker-rendering.test.mjs`

**Interfaces:**
- Consumes: existing `src/index.js` default Worker export and `injectEntriesIntoHtml` path.
- Produces: root HTML requests routed through Worker and a regression test proving a KV-only dynamic entry appears in generated HTML.

- [ ] **Step 1: Write failing routing/render tests**
  - Assert `wrangler.jsonc` routes `/` and `/index.html` through `run_worker_first`.
  - Call the Worker with mocked `ASSETS` + `CATALOGUE_STATE` containing a KV-only entry and assert returned HTML includes `data-key="kv-only-test"`.

- [ ] **Step 2: Verify RED**
  - Run `node --test test/worker-rendering.test.mjs`.
  - Expected before config repair: routing assertion fails because only `/api/*` is configured.

- [ ] **Step 3: Repair routing**
  - Add `/` and `/index.html` to `assets.run_worker_first` while preserving `/api/*`.

- [ ] **Step 4: Verify GREEN**
  - Run `node --test test/worker-rendering.test.mjs` and confirm all tests pass.

### Task 2: Implement request publisher with TDD

**Files:**
- Create: `scripts/publish-catalogue-request.mjs`
- Create: `test/publish-catalogue-request.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: request JSON path, `CATALOGUE_ADMIN_TOKEN`, production base URL (default `https://cigar-catalogue.psncodex.workers.dev`).
- Produces: validated sequential publication and verification for `upsert-entry`, `archive-entry`, `unarchive-entry`, `replace-image`.

- [ ] **Step 1: Write failing publisher tests**
  - Validate safe keys and supported operations.
  - Reject image MIME/size/path violations.
  - Prove partial upsert fetches current entry and preserves unrelated fields.
  - Prove archive/unarchive toggles expected fields.
  - Prove image upload is verified by GET and entry is associated with `imageSourceKey` and incremented `imageVersion`.
  - Prove Authorization is sent on writes without exposing the token in errors/logs.
  - Prove API failures and absent production rendering fail publication.

- [ ] **Step 2: Verify RED**
  - Run `node --test test/publish-catalogue-request.test.mjs` and confirm failure because publisher module is absent.

- [ ] **Step 3: Implement minimum publisher**
  - Parse and validate one request file.
  - Resolve repository-relative image paths safely.
  - Fetch current entry; treat 404 as new only for upsert.
  - Merge only intended fields.
  - Upload and verify image where requested.
  - PUT normalized request payload to existing entry endpoint.
  - GET saved entry and compare intended fields.
  - Fetch production `/` and require the entry key in rendered HTML.
  - Avoid logging secret-bearing headers or token values.

- [ ] **Step 4: Verify GREEN**
  - Run publisher test file and full test suite.

### Task 3: Add secure GitHub Actions publication workflow

**Files:**
- Create: `.github/workflows/publish-catalogue.yml`
- Create: `catalogue-requests/README.md`

**Interfaces:**
- Consumes: changed `catalogue-requests/*.json` paths on pushes to `main`, or one manual `request_path`.
- Produces: serialized, test-gated publications using GitHub Actions secret `CATALOGUE_ADMIN_TOKEN`.

- [ ] **Step 1: Define CI/publish behavior**
  - `pull_request`: run tests only for publisher/Worker/config/request changes.
  - `push` to `main`: run tests, determine changed request JSON files, publish sequentially.
  - `workflow_dispatch`: require explicit request path and publish it after tests.
  - `concurrency`: one catalogue publication at a time.

- [ ] **Step 2: Add repository request documentation**
  - Document exact JSON schema/examples, image placement, and one-time Actions secret name.

- [ ] **Step 3: Validate workflow syntax and shell behavior**
  - Use YAML parse/static inspection plus GitHub Actions PR execution as the authoritative integration check.

### Task 4: Final verification and PR

**Files:** all above.

- [ ] **Step 1: Run fresh verification**
  - `npm test`
  - `git diff --check` equivalent through branch diff inspection.
  - confirm no token-shaped secret value was added.
  - inspect `wrangler.jsonc` route fix.

- [ ] **Step 2: Open PR to `main`**
  - Explain one-time `CATALOGUE_ADMIN_TOKEN` GitHub Actions secret and one-time Worker deployment required for the routing fix.

- [ ] **Step 3: Inspect PR workflow results**
  - Require green tests before recommending merge.
