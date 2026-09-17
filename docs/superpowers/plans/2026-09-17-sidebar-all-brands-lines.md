# Sidebar All Brands & Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar expose every catalogue brand plus useful named product lines, and make the existing logo hook obvious and centrally configurable.

**Architecture:** Keep brand discovery data-driven from rendered catalogue cards, add stable `data-brand` metadata to dynamic cards, and move explicit line aliases/mappings plus optional logo paths into one dedicated config module. The sidebar remains the sole filtering implementation and line matching uses stable catalogue keys.

**Tech Stack:** JavaScript ES modules, Cloudflare Worker rendering, JSDOM/node:test.

**Spec:** Approved sidebar design from the current conversation, extended by the user's request to include all brands/lines.

## Global Constraints

- Do not alter ranking, value, size, editorial copy, pricing, archive, or product-image logic.
- Brand filtering must continue composing with existing filters rather than clearing their visibility state.
- Logo configuration must remain optional; missing logos render text-only.

---

### Task 1: Production-aligned brand discovery

**Files:**
- Modify: `test/catalogue-control-sidebar.test.mjs`
- Modify: `src/index.js`
- Modify: `public/catalogue-control-sidebar.mjs`

**Interfaces:**
- Consumes: rendered `article.card[data-key]` elements.
- Produces: stable `data-brand` metadata and brand discovery from `data-brand` / production heading markup.

- [ ] Write a failing regression test using `<h3><span>Brand</span>Title</h3>` and assert non-configured brands are discovered.
- [ ] Run the full test command and confirm the new assertion fails for the missing brand.
- [ ] Add `data-brand` to dynamic cards and update `cardBrand()` fallback to `h3 > span, h3 > small`.
- [ ] Re-run the full test command and confirm it passes.

### Task 2: Explicit catalogue line families and logo config

**Files:**
- Create: `public/catalogue-brand-line-config.mjs`
- Modify: `public/catalogue-control-sidebar.mjs`
- Modify: `test/catalogue-control-sidebar.test.mjs`

**Interfaces:**
- Produces: `BRAND_LINE_CONFIG` descriptors with `id`, `label`, `kind`, optional stable key matchers, and `logo`.

- [ ] Add failing tests for representative line families and for the dedicated logo config module.
- [ ] Run the full test command and confirm the new assertions fail.
- [ ] Add the central config with current catalogue line families and an explicit `/brand-logos/...` logo-path convention.
- [ ] Import/re-export the config from the sidebar and keep button rendering unchanged.
- [ ] Re-run the full test command and confirm it passes.

### Task 3: Cache bust, merge, and production verification

**Files:**
- Modify: `public/catalogue-runtime.mjs`
- Modify: `test/catalogue-control-sidebar.test.mjs`

**Interfaces:**
- Produces: runtime import `catalogue-control-sidebar.mjs?v=sidebar-controls-3`.

- [ ] Update the runtime cache key and its regression test.
- [ ] Run the full test suite and confirm zero failures.
- [ ] Merge the branch after CI passes.
- [ ] Verify the main-branch GitHub Actions run and Cloudflare Workers build both report success.
