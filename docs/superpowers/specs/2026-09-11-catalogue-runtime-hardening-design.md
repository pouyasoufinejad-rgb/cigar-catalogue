# Catalogue Runtime Hardening Design

## Goal

Reduce runtime layering and future-change risk without changing the catalogue UI, catalogue data, ratings, ranking behaviour, editor behaviour, stock behaviour, or publication semantics.

## Non-negotiable behaviour

- The rendered catalogue must remain visually unchanged.
- Existing main, half and taster ranking cohorts remain independent and contiguous.
- Value remains automatically derived from price, quality and flavour exactly as before.
- The Axe Charutos quality-award exception remains intact.
- The existing admin editor, direct-edit mode, stock cache, comparison UI, personal-status controls and Half-Cigar section keep their current behaviour.
- Catalogue KV remains authoritative for editable catalogue data; Git remains authoritative for code and request history.
- `catalogue-requests/` remains intact as publication history.

## Architecture changes

### Browser bootstrap

`catalogue-value.mjs` becomes a pure calculation module. Browser-only module loading moves to `catalogue-runtime.mjs`, which is imported by the page/runtime bootstrap. This removes Worker-side coupling between Value calculations and browser feature loading.

### Catalogue state save pipeline

Introduce one `catalogue-save-pipeline.mjs` singleton that owns the only catalogue-state `fetch()` interception. Feature modules register deterministic request transforms and response listeners instead of each wrapping `fetch()` independently.

Flavour continues to inject the pending flavour field into the saved card state. Half-Cigar continues to normalise catalogue type/rank state and refresh membership after successful saves. Transform priority is explicit so behaviour does not depend on module evaluation order.

### Retailer matrix

Move best-available-price attribution into `catalogue-convenience.mjs` itself. The first retailer row receives the catalogue benchmark price and additional retailer rows remain unpriced until retailer-specific prices exist. Remove `catalogue-retailer-best-price.mjs` and its extra MutationObserver.

### CI and maintenance

The verification workflow must run for `public/**` changes as well as Worker, test and publisher changes. Keep historical request files. Remove only clearly obsolete root artefacts that are not runtime inputs and replace the one-line README with concise current architecture/deployment documentation.

## Verification

Use test-first changes. Add regression tests for the runtime bootstrap, shared save pipeline, retailer-price ownership and workflow path coverage. Run the complete Node test suite in GitHub Actions before merge. Review the final PR diff for accidental HTML/catalogue-data changes. Merge only if all checks pass.
