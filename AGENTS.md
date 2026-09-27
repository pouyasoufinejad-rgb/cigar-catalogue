# Cigar Catalogue: safe, focused edits

## Working rules

- Preserve production catalogue data and working behaviour. Make the smallest safe change; reuse existing modules, utilities and patterns.
- Read this file, then only files relevant to the request. Use targeted searches; do not routinely reread the repository, old requests, HANDOFF.md or historical plans.
- No broad audits, rewrites, unrelated formatting or cleanup unless requested. Fix root causes and clear inefficiencies in the area being changed; batch related changes.
- Implement authorized changes without unnecessary approval loops. Run targeted checks first; reserve full-suite/browser checks for changes that warrant them.
- Report only what changed, important issues, and check results. Update this map when architecture changes.

## Architecture and file map

Production: https://cigar-catalogue.psncodex.workers.dev/

Plain HTML/CSS and browser ES modules; a Cloudflare Worker serves assets and overlays KV data. No frontend bundler/build step.

| Area | Start here |
| --- | --- |
| Worker/API, normalization, server rendering | `src/index.js` |
| Static baseline, script tags, inline controls | `public/index.html` |
| Feature loading | `public/catalogue-runtime.mjs`, injected by Worker `injectRuntimeBootstrap` |
| Main editor / entry creation | `public/catalogue-admin-unified-v139.mjs` |
| Direct editing / verified saves | `public/catalogue-direct-edit.mjs`, `public/catalogue-direct-persistence.mjs` |
| Variants: model / display / editor | `public/catalogue-variants.mjs`, `catalogue-variant-runtime.mjs`, `catalogue-variant-editor.mjs`, `catalogue-variant-edit-model.mjs` (all under `public/`) |
| Record merging / save transforms | `public/catalogue-state-record.mjs`, `public/catalogue-save-pipeline.mjs` |
| Ratings | `public/catalogue-value.mjs`, `catalogue-size-rules.mjs`, `catalogue-size-value-runtime.mjs`, `catalogue-flavour*.mjs`, `catalogue-overall-score.mjs` |
| Layout / filters / sidebar | `public/css/catalogue-*.css`, `public/catalogue-card-*.mjs`, `catalogue-convenience*.mjs`, `catalogue-filter-refinements.mjs`, `catalogue-control-sidebar.mjs` |
| Rankings / cohorts | `public/catalogue-recommendation-subsections.mjs`, `public/catalogue-half-cohort.mjs` |
| Retailer stock / pricing | `src/stock.js`, `src/retailer-price.js`, `public/catalogue-stock-client.mjs` |
| Publication | `scripts/publish-catalogue-request.mjs`, `scripts/publish-live-catalogue-request.mjs`; schema in `catalogue-requests/README.md` |

## Data and saving: hard requirements

- Live KV binding `CATALOGUE_STATE` is authoritative: key `catalogue-overrides`, version 3, maps `cards` (overrides), `entries` (dynamic products), `sections`. Legacy fallback: `catalogue-overrides-v2`. Images use `catalogue-image:<key>` and `catalogue-image-meta:<key>`.
- Git holds code, static baseline and publication history; old request JSON and static HTML are **not** a current catalogue backup. Read production `/api/catalogue-overrides` before data decisions/writes. Never seed/reset production from fixtures or replace its KV binding.
- **State PUT replaces each supplied top-level map; omitted maps survive.** Fetch fresh state and preserve every unrelated record/field in maps sent to `/api/catalogue-overrides`. There is no revision/conflict guard: avoid concurrent writers. Entry PUT `/api/catalogue-entry/<key>` replaces that entry; preserve its other fields too.
- Main editor saves dynamic entries/images, then card/section state and verifies read-back. Direct and variant editors read fresh state, patch, PUT and verify. Writes require bearer authentication against Worker `ADMIN_TOKEN`; Actions uses `CATALOGUE_ADMIN_TOKEN`. Never expose credentials.
- Reuse the shared save pipeline (flavour → half cohort → subsections), not another fetch wrapper. Use `catalogueRecordFromState` for entry/card merging. Variant lists merge by identity; explicit `[]` clears them. Preserve IDs, defaults, siblings and nested blend-size variants. Variant edits update cards and matching dynamic entries; direct copy uses `updateVariantScopedCopy` to respect blend/size scope.
- New products are dynamic entries. For requested production data changes, create unique requests/assets under `catalogue-requests/` and use the existing publisher end-to-end. Prefer archive; never wipe KV or bulk-delete. Keep Main, Half-Cigar and Taster ranks independently contiguous. Use automatic Value calculations.
- Publication success requires API/KV read-back, image-byte verification when applicable, and production rendering.

## Build, deployment and checks

- Node 22 (CI); install dependencies when needed. `npm run dev` runs Wrangler locally; `npm run deploy` / `DEPLOY.bat` deploy Worker + `public/` using `wrangler.jsonc`. Local development must not use remote production KV.
- `.github/workflows/publish-catalogue.yml` tests relevant PR/push changes and publishes changed requests sequentially on main (or a manual request retry); it does not deploy Worker code. `UPDATE.bat` describes a separate Cloudflare Git auto-deploy integration; verify its deployment status rather than assuming a push is live.
- That workflow also runs live cleanup/normalization after requests and can run repairs when their scripts change: inspect its triggers before touching those scripts. Documentation-only changes need no deployment.
- For CSS edits, run `node scripts/rehash-stylesheet.mjs --write`, then `--check`; CSS/art URLs are immutable. For runtime changes, update affected versioned imports and the outer Worker bootstrap URL; update pinned cache-bust tests as needed.
- Use `node --test test/<relevant>.test.mjs`. Save/variant changes: start with `state-merge-preservation`, `catalogue-save-pipeline`, `variant-editing`, `edit-state-consistency`. Rendering: `worker-rendering`, `html-shell-resilience`. UI: matching layout/editor tests, then focused browser verification. Full suite: `npm test`. Documentation: diff/whitespace and referenced-path checks suffice.

## Catalogue editorial rules (only for content changes)

- Verify exact product/vitola, Australian prices, package quantity/per-stick price, country, dimensions, retailer URLs and blend/construction; never fabricate or imply personal tasting.
- Over A$30 per single: use the best available single benchmark, not a box discount (except inherent tin/pack products with no single). Variant benchmark packs must have at most 10 cigars.
- For packs, separately record the cheapest available Australian genuine single and direct link, or “no single found”. Surface CigarHut, Cigarworld, The Index or Firmin Cigars if available and less than A$5 above the cheapest; use another retailer only if at least A$5 cheaper than the best preferred option or none is available. Stock takes priority.
- Value flavour intensity, smoke volume, complexity, sweetness/spice and construction. Mild/weak cigars have a lower ceiling; harshness/bitterness without payoff is negative. Same-blend evidence outweighs brand-only evidence.
- Notes must add distinctive cigar context, not “Untasted”/status filler or repeated retailer/package information.
- Use supplied images unless told otherwise; PNG/JPEG/WebP only. Normally show packaging for packs and the cigar for singles; retain dimension-based visual scale.
