# Catalogue content rules

Read this file only for tasks that add, edit, rank, archive, price, describe, or replace imagery for catalogue products.

- Live production `/api/catalogue-overrides` is authoritative for current catalogue data. Preserve unrelated fields and records; never seed/reset production from fixtures or bulk-delete KV.
- New products are dynamic entries. Use the existing request/publisher flow in `catalogue-requests/README.md`; prefer archive over deletion. Keep Main, Half-Cigar and Taster ranks independently contiguous. Use automatic Value calculations.
- Verify exact product/vitola, Australian pricing, package quantity/per-stick price, country, dimensions, retailer URLs and blend/construction. Never fabricate or imply personal tasting.
- If a single cigar costs over A$30, benchmark the best available single price rather than a box discount. Variant benchmark packs must contain at most 10 cigars.
- For packs/tins, separately record the cheapest available Australian genuine single and direct link, or state that no single was found. Prefer CigarHut, Cigarworld, The Index or Firmin when available and less than A$5 above the cheapest; otherwise use the cheaper available retailer. Stock takes priority.
- Catalogue scoring should favour flavour intensity/density, smoke volume, complexity, sweetness/spice and construction. Mild/weak cigars have a lower ceiling; harshness/bitterness without payoff is negative. Same-blend evidence outweighs brand-only evidence.
- Notes must add cigar-specific context, not “Untasted”/status filler or repeated retailer/package information.
- Use supplied images unless told otherwise. PNG/JPEG/WebP only. Normally show packaging for packs and the cigar for singles; preserve dimension-based visual scale.
- Production publication is complete only after API/KV read-back, image-byte verification when applicable, and production rendering.
