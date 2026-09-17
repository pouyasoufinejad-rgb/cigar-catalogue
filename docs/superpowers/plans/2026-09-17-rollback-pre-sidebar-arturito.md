# Pre-Sidebar Arturito Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the catalogue application to the final pre-sidebar commit from 16 Sep 2026 and reconstruct live KV to the corresponding catalogue state, preserving the user's later Arturito rename.

**Architecture:** Use commit `8ba8f65754b37d5973331e55be0e9e9d5d306cf5` as the immutable application baseline because it is the direct parent of the first sidebar commit. Add a one-shot guarded restore script/workflow that starts from the current live state, reinstates the ACID Krush Red Cameroon request and Sep 16 production/practical normalisation, strips sidebar-only state, and reapplies the known Arturo Fuente Arturito rename. Keep the ordinary catalogue publisher disabled during the rollback merge so later request history cannot replay into KV.

**Tech Stack:** Node.js 22, GitHub Actions, Cloudflare Worker/KV, node:test.

**Spec:** User instruction in chat on 17 Sep 2026: roll back everything to the last proper working version identified by the Arturo Fuente Exquisitos Maduro entry having “Arturito” in its name.

## Global Constraints

- Application baseline must be commit `8ba8f65754b37d5973331e55be0e9e9d5d306cf5`, the direct parent of the first sidebar commit.
- Do not preserve sidebar brand-filter/logo code or sidebar-only KV fields introduced after that baseline.
- Restore ACID Krush Red Cameroon, which was live before the Arturito rename.
- Preserve automatic Value calculation; do not write manual Value fields.
- Reapply the Sep 16 Production/Practical normalised structure that was live before the rename.
- The restored Arturo Fuente Exquisitos Maduro title must contain `Arturito` so the user's known-good fingerprint is present.
- Never claim success without production KV read-back and rendered-page verification.

---

### Task 1: Define rollback-state behavior with a failing test

**Files:**
- Create: `test/restore-pre-sidebar-arturito.test.mjs`
- Create later: `scripts/restore-pre-sidebar-arturito.mjs`

**Interfaces:**
- Consumes: current KV state and the historical ACID request payload.
- Produces: `buildPreSidebarState({ current, acidEntry }) -> state`.

- [ ] **Step 1: Write the failing test**

Test that the builder removes `brandLogos`/`hiddenBrands`, restores the ACID entry/card into `coronets-cigarillos`, removes stored Value, and changes the Arturo Fuente title to include `Arturito`.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --test-name-pattern="pre-sidebar Arturito"`
Expected: FAIL because `scripts/restore-pre-sidebar-arturito.mjs` does not exist yet.

- [ ] **Step 3: Implement the minimal state builder**

Create `scripts/restore-pre-sidebar-arturito.mjs` with pure helpers plus guarded live apply/read-back logic.

- [ ] **Step 4: Run the targeted test and full suite**

Run: `npm test -- --test-name-pattern="pre-sidebar Arturito"` then `npm test`.
Expected: PASS.

### Task 2: Guard deployment and one-shot live restore

**Files:**
- Modify: `.github/workflows/publish-catalogue.yml`
- Create: `.github/workflows/restore-pre-sidebar-arturito.yml`

**Interfaces:**
- Restore workflow runs tests and dry-run on PR; on `main` push it applies and verifies KV.
- Ordinary publisher must not run automatically for the rollback merge.

- [ ] **Step 1: Disable automatic publisher triggers for this rollback baseline**

Retain `workflow_dispatch` only in `publish-catalogue.yml` so the rollback merge cannot replay later requests or normalisers.

- [ ] **Step 2: Add guarded restore workflow**

On pull requests, run `npm install`, `npm test`, and `node scripts/restore-pre-sidebar-arturito.mjs --dry-run-live`. On main push, repeat verification then run `--apply` using `CATALOGUE_ADMIN_TOKEN`.

- [ ] **Step 3: Verify PR workflow is green before merge**

Require the full test suite and live dry-run to pass.

### Task 3: Merge, deploy, and verify production

**Files:**
- No additional source files.

**Interfaces:**
- Production Worker should use the pre-sidebar application tree.
- Production KV should contain the reconstructed pre-sidebar state and Arturito fingerprint.

- [ ] **Step 1: Merge the rollback PR**

Use squash merge after PR verification passes.

- [ ] **Step 2: Verify the restore workflow**

Require `RESTORE_APPLY_VERIFIED` and successful live read-back.

- [ ] **Step 3: Verify rendered production**

Confirm rendered HTML contains `Arturito`, contains `drew-estate-acid-krush-red-cameroon`, and contains no sidebar brand-filter runtime marker introduced by commit `441a815…`.
