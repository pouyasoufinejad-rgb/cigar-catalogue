# Live KV Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the requested targeted catalogue cleanup to current Cloudflare KV without changing unrelated fields, then verify ranking invariants, KV read-back, production rendering, and report-only inconsistencies.

**Architecture:** Extend the existing auditable publication-request path with one narrowly scoped `bulk-maintenance` operation. The publisher will read live `/api/catalogue-overrides` first, derive targeted field patches from the live data, normalise ranks with existing cohort logic, update dynamic entries plus card overrides, write KV, read it back, verify production HTML, and emit a machine-readable report for the report-only checks.

**Tech Stack:** Node 22, existing catalogue publisher, Cloudflare Worker APIs, Node test runner, GitHub Actions.

**Spec:** User request in the 2026-09-14 Cigar Catalogue conversation.

## Global Constraints

- Touch only `rank`, `practicalHtml`, `productionHtml`, `summaryHtml`, `title`, and `eyebrow` where explicitly requested or matched by the requested scans.
- Never write derived `value`, or modify strength, quality, size, laurel, flavour, price, packagePrice, or retailerLinks.
- Preserve visible practical/production text when removing markup defects.
- Main, Half, and Taster rankings remain independent contiguous cohorts.
- Archived cards retain `archivedRank` and must not retain active `rank`.
- Report-only findings must not mutate catalogue data.
- Verify live KV read-back and production rendering before reporting success.

---

### Task 1: Add bulk-maintenance request model and pure cleanup helpers

**Files:**
- Modify: `scripts/publish-catalogue-request.mjs`
- Test: `test/publish-catalogue-request.test.mjs`

**Interfaces:**
- Consumes: current live state plus the existing `normaliseRankings` / `assertRankingInvariant` helpers.
- Produces: validated `bulk-maintenance` requests and pure helpers for practical/production markup cleanup, eyebrow prefix removal, and explicit patch application.

- [ ] Write failing tests covering taster recompaction, archived-rank clearing, style removal without text loss, cadence rejoin, malformed Tatiana practical markup, Montecristo production cleanup, exact typo/title fixes, eyebrow-prefix stripping, and empty Foundation practical markup.
- [ ] Run `npm test` and confirm the new tests fail.
- [ ] Implement the minimal helpers and request validation needed to satisfy those tests.
- [ ] Run `npm test` and confirm all tests pass.

### Task 2: Publish one live maintenance request and emit report-only findings

**Files:**
- Create: `catalogue-requests/2026-09-14-live-kv-cleanup.json`
- Modify: `scripts/publish-catalogue-request.mjs`
- Test: `test/publish-catalogue-request.test.mjs`

**Interfaces:**
- Consumes: `bulk-maintenance` request and current live KV state.
- Produces: updated cards/entries, verified state, and a JSON report containing flavour/note mismatches, experience comparison clauses, stock/rank status, and wrapper conflict metadata without changing those report-only fields.

- [ ] Write failing integration-style publisher tests proving unrelated fields remain byte-for-byte/deep-equal and report-only fields are unchanged.
- [ ] Run the targeted tests and confirm failure.
- [ ] Implement the live-state scan, multi-card writes, read-back assertions, production checks, and report output.
- [ ] Run the full test suite and confirm success.
- [ ] Commit the request and implementation.

### Task 3: Merge, publish, and verify live state

**Files:**
- No additional source files unless verification exposes a regression.

**Interfaces:**
- Consumes: merged request and repository Actions secret `CATALOGUE_ADMIN_TOKEN`.
- Produces: live KV changes and verified production rendering.

- [ ] Open PR and confirm the pull-request test workflow succeeds.
- [ ] Review the diff to confirm only the planned publisher/test/request files changed.
- [ ] Merge to `main`.
- [ ] Confirm the push workflow publishes the maintenance request successfully.
- [ ] Read workflow logs for the emitted report and verification details.
- [ ] Independently inspect production/API evidence available from the workflow and report the final rankings plus report-only findings.
