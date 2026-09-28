# Cigar Catalogue engineering guide

## Default workflow
- Make the smallest safe change. Preserve production data and working behaviour. Reuse existing modules and patterns.
- Read this file first, then only files relevant to the request. Use targeted searches; do not routinely reread the repo, old requests, HANDOFF.md or historical plans.
- No broad audits, rewrites, unrelated cleanup or formatting unless requested. Fix root causes and clear inefficiencies in the area being changed.
- Implement authorized changes without approval loops. Run targeted checks first; use full-suite/browser checks only when warranted.
- Keep responses concise: what changed, important issue(s), checks.
- For catalogue-content changes only, also read `CATALOGUE_CONTENT_RULES.md`.

## Architecture map
Production: https://cigar-catalogue.psncodex.workers.dev/

- Worker/API/server rendering: `src/index.js`
- Static shell: `public/index.html`
- Runtime loader: `public/catalogue-runtime.mjs`; startup reads share `catalogue-initial-state.mjs` (editing/reloads must still fetch fresh).
- Main editor: `public/catalogue-admin-unified-v139.mjs`
- Direct editing: `public/catalogue-direct-edit.mjs`, `public/catalogue-direct-persistence.mjs`
- Variants: `public/catalogue-variants.mjs`, `catalogue-variant-runtime.mjs`, `catalogue-variant-editor.mjs`, `catalogue-variant-edit-model.mjs`
- Record/save logic: `public/catalogue-state-record.mjs`, `public/catalogue-save-pipeline.mjs`
- Ratings: `public/catalogue-value.mjs`, `catalogue-size-rules.mjs`, `catalogue-size-value-runtime.mjs`, `catalogue-flavour*.mjs`, `catalogue-overall-score.mjs`
- Rankings: `public/catalogue-recommendation-subsections.mjs`, `public/catalogue-half-cohort.mjs`
- Retailer data: `src/stock.js`, `src/retailer-price.js`, `public/catalogue-stock-client.mjs`
- Publishing: `scripts/publish-catalogue-request.mjs`, `scripts/publish-live-catalogue-request.mjs`, `catalogue-requests/README.md`

## Data safety
- Live KV binding `CATALOGUE_STATE` is authoritative for editable data. Git is authoritative for code and publication history.
- Fetch fresh state before writes. Preserve every unrelated record/field in maps or entries you send. Full-state PUT replaces supplied maps; main has no revision guard. Never seed/reset production from fixtures or replace its KV binding.
- Reuse `catalogueRecordFromState` and the shared save pipeline. Preserve variant IDs, defaults, siblings and nested blend/size variants.
- Credentials never belong in Git, request JSON, logs or chat output.

## Checks
- Node 22. Targeted test: `node --test test/<relevant>.test.mjs`; full suite: `npm test`.
- Save/variant work: start with `state-merge-preservation`, `catalogue-save-pipeline`, `variant-editing`, `edit-state-consistency`.
- Rendering: `worker-rendering`, `html-shell-resilience`.
- CSS: run `node scripts/rehash-stylesheet.mjs --write` then `--check`.
- Runtime changes: update affected versioned imports/cache-bust expectations and verify the deployed Worker rather than assuming a push is live.
