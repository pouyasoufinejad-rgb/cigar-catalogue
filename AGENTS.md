# Cigar Catalogue agent instructions

## Source of truth

- Cloudflare KV is authoritative for current editable catalogue data.
- Git is authoritative for code, tooling, and publication-request history.
- Before making a current catalogue decision, read `https://cigar-catalogue.psncodex.workers.dev/api/catalogue-overrides`.

## Routine catalogue changes

When the user clearly asks to add, edit, rank, archive, unarchive, or replace the image for a cigar, proceed end-to-end without asking them to run local commands.

For production mutations, create a request under `catalogue-requests/` using the format documented in `catalogue-requests/README.md`. Add supplied images under `catalogue-requests/assets/`. The GitHub Actions workflow publishes the request to KV using its repository secret and verifies the live result.

Do not place `CATALOGUE_ADMIN_TOKEN` or any other credential in Git, request JSON, logs, issues, or chat output.

## Catalogue editing rules

- Read current KV before ranking or editing.
- Existing static cards and dynamic entries are both supported by the publisher; do not invent a second storage path.
- New catalogue products are dynamic entries.
- Preserve unrelated fields on partial edits.
- Use the site's existing automatic Value logic; never hard-code a stale Value score.
- Keep main and taster ranking cohorts contiguous when changing ranks or archive status.
- Prefer archive over deletion. Do not wipe KV or bulk-delete catalogue data.

## Images

- If the user supplies an image, use that image unless they explicitly request another.
- Only PNG, JPEG, and WebP are supported by the Worker.
- Packaged products normally use the box/tin/pack as the primary image; true singles normally use the cigar.
- Preserve existing visual size fidelity based on actual length and ring gauge.

## Research and editorial judgment

For new products, verify exact product/vitola, current relevant Australian pricing, package quantity, per-stick price, country, dimensions, retailer URLs, and reliable construction/blend information. Do not fabricate specifications.

The catalogue strongly values flavour intensity/density, smoke volume, complexity, sweetness with pepper/spice, and construction. Very mild/weak cigars generally have a lower ceiling. Harshness or bitterness without sufficient flavour/nicotine payoff is negative. Same-blend tasting evidence transfers strongly; brand-only evidence is weak. Never describe an untasted cigar as personally tasted.

## Verification

A production publication is not complete until the workflow has verified API/KV read-back, image bytes when applicable, and production rendering. If a request fails, report the actual failure rather than claiming the catalogue was updated.
