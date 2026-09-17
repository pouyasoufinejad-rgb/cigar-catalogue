# Safe Brands and Catalogue State Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the 2026-09-17 13:21 Perth application baseline, rebuild Brands so it cannot mutate catalogue state, and repair historically verified placement/image mappings without collateral edits.

**Architecture:** Application code is restored exactly from commit `208e0b172f4a8cad71f9497a97ebfedea751d8ef`. Brands may GET authoritative catalogue state and PUT only dedicated brand-logo image keys; it must never PUT `/api/catalogue-overrides`. Catalogue placement/image repair is a separate guarded full-state operation derived from historical evidence and verified by read-back.

**Tech Stack:** Cloudflare Workers/KV, browser ES modules, Node 22 tests, GitHub Actions.

**Spec:** Conversation-approved repair design dated 2026-09-18.

## Global Constraints
- Never mutate unrelated catalogue fields.
- Value remains automatic; stored `value` fields are forbidden.
- Taster and Half-Cigar cohorts remain separate from main recommendation subsections.
- Brands filtering is browser-only and read-only against catalogue state.
- Brand logos use dedicated `brand-logo-*` image keys only.
- Production success requires live Worker and KV read-back verification.

### Task 1: Restore 1:21 PM application baseline
- [ ] Create a commit on the repair branch whose tree SHA equals the 1:21 PM commit tree.
- [ ] Verify restored sidebar/runtime/tests match the target commit.

### Task 2: Make Brands state-safe and compact
- [ ] Add failing tests for collapsed-by-default Brands and zero catalogue-state writes.
- [ ] Verify the new tests fail for the expected missing collapsed behavior.
- [ ] Implement disclosure-based Brands while preserving read-only filtering and dedicated logo uploads.
- [ ] Verify focused tests pass.

### Task 3: Reconstruct placement and image references
- [ ] Encode only historically verified subsection/cohort/order and image-source corrections.
- [ ] Make dry-run output enumerate every changed key and field.
- [ ] Require full-state preservation assertions before PUT.
- [ ] Apply through authenticated workflow only after tests pass.
- [ ] Verify exact live KV read-back and rendered HTML.

### Task 4: Production verification
- [ ] Run full `npm test` in GitHub Actions.
- [ ] Merge only after green CI.
- [ ] Verify native Cloudflare deployment serves safe Brands.
- [ ] Verify catalogue counts/fingerprints and repaired placements/images.
