# Recommendation Subsection Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed and verify stable, independent Coronets / Petit Panatelas / Infused-Flavoured ranking numbers in live KV without changing any catalogue names, prose, scores, prices, retailer data, catalogue types, Taster ranks, Half-Cigar ranks, or global Main ranks.

**Architecture:** Keep the already-deployed `public/catalogue-recommendation-cohorts.mjs` browser controller unchanged. Add a narrowly scoped live publisher that reads `/api/catalogue-overrides` and the current rendered catalogue first, mirrors the controller's cohort classification, writes only `recommendationCohort` and `recommendationRank` into `state.cards`, and verifies exact KV read-back. Existing global `rank` remains an ordering fallback and is never rewritten by this repair.

**Tech Stack:** Node 22, native `fetch`, Node test runner, Cloudflare Worker catalogue API, GitHub Actions.

**Spec:** User instruction in the 2026-09-14 Cigar Catalogue repair chat: inspect the actual live override JSON first; do not change names; Joya Black must not be Flavoured; subsection rankings must be completely independent and stable.

## Global Constraints

- Read live `/api/catalogue-overrides` before every write.
- Only `cards[*].recommendationCohort` and `cards[*].recommendationRank` may change.
- Do not change `brand`, `title`, `eyebrow`, summaries, notes, section copy, ratings, Value, price, packagePrice, retailerLinks, stock fields, `rank`, `archivedRank`, `catalogueType`, `taster`, or `archived`.
- Joya Black must resolve to `coronets`, never `flavoured`.
- Coronets, Petit Panatelas and Infused/Flavoured each rank independently from 1 with no gaps or duplicates.
- Preserve current relative order within each subsection by the existing global rank fallback when no saved subsection rank exists.
- Existing valid saved subsection ranks take precedence when present and match the computed cohort.
- Half-Cigar, Taster, archived and unavailable cards receive no new subsection ranking metadata.
- Do not modify the deployed subsection controller as part of this repair unless a test demonstrates it is necessary.

---

### Task 1: Pure live-state subsection seeding

**Files:**
- Create: `scripts/seed-live-recommendation-ranks.mjs`
- Create: `test/recommendation-rank-seed.test.mjs`

**Interfaces:**
- Consumes: KV state object plus live catalogue HTML.
- Produces: `buildRecommendationRankSeed(state, html) -> { state, rankings, changedKeys }`.

- [ ] **Step 1: Write failing tests** covering Joya Black structured production text, independent contiguous ranks, preservation of global ranks, preservation of every non-recommendation field, and exclusion of Taster/Half/archived/unavailable cards.
- [ ] **Step 2: Run the focused test** with `node --test test/recommendation-rank-seed.test.mjs`; expected result is FAIL because the helper does not exist.
- [ ] **Step 3: Implement the minimal parser/seeder** using the same exported classifier and ranking helper from `public/catalogue-recommendation-cohorts.mjs`.
- [ ] **Step 4: Run the focused test**; expected result is PASS.
- [ ] **Step 5: Commit** the pure helper and test.

### Task 2: Guarded live publication and read-back

**Files:**
- Modify: `scripts/seed-live-recommendation-ranks.mjs`
- Modify: `.github/workflows/publish-catalogue.yml`
- Create: `test/recommendation-rank-seed-publication.test.mjs`

**Interfaces:**
- Consumes: `CATALOGUE_ADMIN_TOKEN`, live Worker URL, and a request JSON with `operation: "seed-recommendation-ranks"`.
- Produces: authenticated PUT of the full preserved KV state and a verification report containing each subsection's ordered keys/ranks.

- [ ] **Step 1: Write a failing mocked publication test** proving the first network operation is live KV GET, only the two allowed metadata fields change, PUT is authenticated, read-back exactly matches the intended seed, and global/Taster/Half ranks are untouched.
- [ ] **Step 2: Run the focused publication test** and confirm FAIL before implementation.
- [ ] **Step 3: Implement publication** with pre-write diff guard and post-write read-back verification.
- [ ] **Step 4: Route only `seed-recommendation-ranks` requests** to this dedicated publisher in the GitHub workflow.
- [ ] **Step 5: Run focused tests and `npm test`**; all must PASS.
- [ ] **Step 6: Commit** publisher/workflow changes.

### Task 3: Seed current live KV

**Files:**
- Create: `catalogue-requests/2026-09-14-seed-recommendation-subsection-ranks.json`

**Interfaces:**
- Consumes: current live KV and HTML at publication time.
- Produces: persisted independent subsection metadata only.

- [ ] **Step 1: Add the request file** with only `operation` and explanatory note; do not hard-code catalogue prose or scores.
- [ ] **Step 2: Run the full PR workflow**; tests must pass and PR publication must remain skipped.
- [ ] **Step 3: Review the PR diff** and confirm no catalogue names/copy/data fields are present outside the dedicated ranking implementation/request.
- [ ] **Step 4: Merge** and allow the main push workflow to execute the live seed.
- [ ] **Step 5: Inspect the publish log** for exact subsection sequences and successful read-back verification.
- [ ] **Step 6: Perform a second read-only live diagnostic** against `/api/catalogue-overrides`; assert every active subsection sequence is contiguous and Joya Black is Coronets.
- [ ] **Step 7: Report the exact verified sequences** and explicitly list that no non-ranking fields changed.
