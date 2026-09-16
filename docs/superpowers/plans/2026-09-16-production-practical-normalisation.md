# Production / Practical Normalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalise every live catalogue entry's Production and Practical blocks to the four approved house structures without changing ratings, rankings, pricing, stock, subsection membership, or unrelated copy.

**Architecture:** Add one live-state normaliser that reads the current Worker state plus the static seed, classifies each effective entry as coronet/flavoured, regular main, taster, or half-cigar, and emits the smallest `upsert-entry` patch needed. The normaliser reuses existing facts wherever possible, strips country wording from Production, preserves wrapper/binder/filler information, and derives only safe structural Practical lines when an entry is missing them. GitHub Actions runs the normaliser after verification whenever its script changes.

**Tech Stack:** Node.js 22, existing catalogue publisher, Cloudflare Worker KV, Node test runner.

**Spec:** User-approved structure in chat on 2026-09-16.

## Global Constraints

- Production never includes a country line or country suffix in Handmade/Machine-made.
- Coronet/flavoured Production: Flavoured/Unflavoured → Handmade/Machine-made → Wrapper → Binder → Filler.
- Regular main Production: Handmade/Machine-made → Wrapper → Binder → Filler.
- Taster Production: Flavoured/Unflavoured → Handmade/Machine-made → Wrapper → Binder → Filler.
- Half-Cigar Production: Handmade/Machine-made → Wrapper → Binder → Filler.
- Coronet/flavoured Practical: package → Cut/Uncut → Protected/Fragile/Dry-cured → Cadence.
- Taster Practical: Single cigar/tubo → Cut/Uncut → Protected/Fragile → Cadence.
- Regular-main Practical: Single cigar/package → Cut/Uncut → Protected/Fragile → construction/form detail → useful format/role detail → Cadence.
- Half-Cigar Practical: Two Halves → Cut/Uncut → Protected/Fragile → construction/form detail → useful format/role detail → Cadence.
- Value remains system-derived.
- Do not alter ranks, eyebrow rank text, flavour ratings, stock, retailer links, price, or unrelated editorial fields.

---

### Task 1: Define the structural normaliser with regression tests

**Files:**
- Create: `scripts/normalise-live-card-structure.mjs`
- Create: `test/normalise-live-card-structure.test.mjs`

**Interfaces:**
- Produces `classifyStructureFamily(record, context) -> string`.
- Produces `normaliseProductionLines(record, context) -> string[]`.
- Produces `normalisePracticalLines(record, context) -> string[]`.
- Produces `buildStructurePatch(card, entry, base, context) -> object`.

- [ ] **Step 1: Write failing tests** covering the four reference families, removal of country wording, preservation of wrapper/binder/filler, Half-Cigar `Two Halves`, regular-main expanded Practical ordering, and no-op behaviour for compliant reference-shaped entries.
- [ ] **Step 2: Run the focused test file** and confirm it fails before implementation.
- [ ] **Step 3: Implement the minimum normalisation functions** with deterministic classification and conservative fact extraction.
- [ ] **Step 4: Run the focused tests** and confirm they pass.

### Task 2: Add live-state audit and publication

**Files:**
- Modify: `scripts/normalise-live-card-structure.mjs`
- Modify: `.github/workflows/publish-catalogue.yml`

**Interfaces:**
- `runLiveStructureNormalisation(options) -> { published, remaining }` reads `/api/catalogue-overrides`, publishes minimal patches through `publishRequestDocument`, re-reads after every mutation, and fails if any live entry remains structurally non-compliant.

- [ ] **Step 1: Add tests** for effective-state merging, live-key scanning, and patch minimality.
- [ ] **Step 2: Implement live audit/publication** using the current Worker state as authoritative.
- [ ] **Step 3: Update the workflow** so a change to the structural normaliser triggers verification and then runs the live pass on main.
- [ ] **Step 4: Run the full test suite** and require green.

### Task 3: Publish and verify

**Files:**
- No additional source files unless verification exposes a defect.

- [ ] **Step 1: Open a PR from the normalisation branch.**
- [ ] **Step 2: Confirm the PR test workflow is green.**
- [ ] **Step 3: Merge the branch.**
- [ ] **Step 4: Confirm the main publish job runs the structural normaliser and finishes green.**
- [ ] **Step 5: Verify the final job log reports zero remaining non-compliant live entries.**
