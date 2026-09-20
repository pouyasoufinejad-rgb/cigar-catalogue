# Panatelas, Coronas & Robustos variant retailer research

Research date: 2026-09-20 (Australia/Perth)

Purpose: retailer/price evidence for Claude Code to implement nested size variants plus linked blend/format variants in the Panatelas, Coronas & Robustos subsection.

## Important constraints

- The live Worker endpoint was unreachable from the research environment during this pass. The 20-entry cohort below was reconstructed from the current repository, the current baked catalogue and publication-request history. Claude must re-read `/api/catalogue-overrides` before implementation and use live KV as authoritative.
- A product being in the same named line is not, by itself, proof that it is the exact same blend. Before nesting a size as an internal variant, verify that wrapper/binder/filler and construction are the same cigar/blend. If wrapper/blend materially differs, keep it a standalone linked entry.
- Packaging-only differences are not cigar variants. A box/tin quantity or a tubo version of an otherwise identical cigar should be represented as an offer/package option unless the cigar itself materially differs.
- Prices below are AUD and were verified from Australian retailer pages/search output. Prefer a direct product page over a category page when both exist. Where a direct URL could not be resolved reliably, the category page is explicitly labelled as a fallback. Do not invent product URLs.
- If a price/link is marked unresolved, leave the retailer offer unset rather than guessing.
- Cigarworld states its displayed prices include all taxes and are in AUD.
- Existing catalogue automatic Value logic must derive Value from the selected size variant's real price and dimensions.

## Reconstructed current cohort (20)

1. aj-fernandez-new-world-oscuro
2. rocky-patel-sun-grown-juniors
3. tabernacle-broadleaf-corona
4. oliva-serie-o
5. oliva-serie-g
6. alonso-menendez-axe-charutos
7. oliva-serie-g-maduro-special-g
8. aj-fernandez-last-call-maduro-flaquitas
9. davidoff-winston-churchill-petite-panatela
10. la-flor-dominicana-double-ligero-chiselito-maduro
11. la-flor-dominicana-reserva-especial-el-jocko-maduro
12. la-flor-dominicana-la-nox-petit
13. foundation-charter-oak-maduro-rothschild
14. paradiso-quintessence-robusto
15. ashton-vsg-enchantment
16. paradiso-elegancia-corona
17. my-father-la-gran-oferta-lancero
18. my-father-no-4-lancero
19. aj-fernandez-new-world-cameroon-short-robusto
20. liga-privada-no-9-petit-corona-oscuro

---

## AJ Fernandez New World Oscuro
Current key: `aj-fernandez-new-world-oscuro`

Retailer fallback: https://www.cigarworld.com.au/aud/categories/cigars/aj-fernandez-%28nicaragua%29/new-world/

Verified offers:
- New World Oscuro Pack, 4 × 36: A$24.11 single; A$115.55 carton/pack of 5. Same-blend size candidate. Direct product URL not reliably resolved in this pass, so use the category URL until verified.
- New World Oscuro Toro, 6.5 × 55: A$68.95 single. Same-blend size candidate. Category URL fallback.
- New World Oscuro Belicoso, 5.5 × 55: confirmed as a line vitola via Australian sampler evidence, but no current standalone AU price was verified. Do not invent a price.

Related New World blends are separate standalone linked entries, not nested merely because they share “New World”: Cameroon, Connecticut, Dorado, Puro Especial, Decenio.

## AJ Fernandez New World Cameroon
Current key: `aj-fernandez-new-world-cameroon-short-robusto`

Retailer fallback: https://www.cigarworld.com.au/aud/categories/cigars/aj-fernandez-%28nicaragua%29/new-world/

Verified same-line size candidates:
- Cameroon Short Robusto, 4 × 48: A$39.32 single; A$746.42 box of 20.
  - Current catalogue direct URL: https://www.cigarworld.com.au/aud/products/NEW-WORLD-%252d-Cameroon-Short-Robusto-%252d-%284%22-x-48%29-Single.html
- Cameroon Double Robusto, 5.5 × 54: A$54.75 single; A$1,054.92 box of 20.
  - Direct: https://www.cigarworld.com.au/aud/products/new-world-%252d-cameroon-double-robusto-%252d-%285-1%7B47%7D2-%22-x-54%29-single.html
- Cameroon Toro, 6 × 50: A$59.04 single. Category URL fallback.
- Cameroon Torpedo, 6.5 × 52: vitola confirmed in AU sampler evidence; standalone AU price unresolved.

Verified linked blend-counterpart offers from the New World family:
- Connecticut Corona Gorda, 5.5 × 46: A$42.45 single, temporarily unavailable.
- Connecticut Robusto, 5 × 50: A$52.06 single.
- Connecticut Toro, 6 × 52: A$59.24 single.
- Connecticut Gorda, 6 × 60: A$69.14 single.
- Connecticut Churchill, 7 × 50: A$65.93 single.
- Dorado Robusto, 5.5 × 52: A$61.56 single.
- Dorado Toro, 6 × 54: A$69.83 single.
- Puro Especial Toro, 6.5 × 52: A$69.60 single.
- Decenio Robusto, 5.5 × 54: A$63.39 single.
Use the New World Cigarworld category link as the retailer fallback unless/until an exact product page is resolved.

## Rocky Patel Sun Grown
Current key: `rocky-patel-sun-grown-juniors`

Verified blend identity evidence for the Junior: 4 × 38, Ecuadorian sun-grown wrapper, handmade premium cigar. External blend references vary slightly on binder/filler detail, so Claude should compare against the full-size Sun Grown product data before nesting.

Verified AU offers:
- Sun Grown Petit Corona: A$37 single at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/rocky-patel-sun-grown-petit-corona/
- Sun Grown Robusto, 5.5 × 50: A$47.30 single at The Index; single available.
  - Direct: https://www.theindexcigars.com.au/products/rocky-patel-sungrown-robusto
- Sun Grown Toro, 6.5 × 52: exact vitola/spec confirmed in The Index Toro Tubo sampler, but no verified standalone current AU price in this pass.
  - Evidence/fallback: https://www.theindexcigars.com.au/products/rocky-patel-toro-tubo-sampler-of-6-cigars
- Sun Grown Juniors: retain current catalogue offer/pricing unless live KV has changed; no better Australian direct listing was verified in this pass.

Blend counterpart, standalone linked family:
- Sun Grown Maduro Robusto, 5 × 50: A$47.30 single; A$906 box of 20; available at The Index.
  - Direct: https://www.theindexcigars.com.au/products/sun-grown-maduro-robusto
- Sun Grown Maduro Toro, 6.5 × 52: A$54.40 single; box A$1,048 currently unavailable; single available.
  - Direct: https://www.theindexcigars.com.au/products/sungrown-maduro-toro

## Foundation The Tabernacle Connecticut Broadleaf
Current key: `tabernacle-broadleaf-corona`

Important identity warning: this key was later retitled/re-dimensioned in request history to “The Tabernacle CT Broadleaf Lancero”; do not rename or split it based only on the stale key. Read live KV first.

Cigar Hut family page: https://www.cigarhut.com.au/the-tabernacle/

Verified Connecticut Broadleaf line offers:
- Lancero: A$55 single; up to A$1,179; currently listed sold out at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/the-tabernacle-lancero/
  - Also tracked at The Index: https://www.theindexcigars.com.au/collections/the-tabernacle/products/the-tabernacle-lancero
- Broadleaf Corona: A$49 single; up to A$1,099. Category page fallback.
- Robusto: A$56 single; up to A$1,229. Category page fallback.
- Toro: A$72 single; up to A$1,679. Category page fallback.
- Torpedo: A$39 single; up to A$859; listed sold out. Category page fallback.
- David: A$42 single; up to A$975; listed sold out.
  - Direct: https://www.cigarhut.com.au/the-tabernacle-david/
- Goliath: A$53 single; up to A$1,229; listed sold out.
  - Direct: https://www.cigarhut.com.au/the-tabernacle-goliath/
- Corona Doble: A$81 single; up to A$1,819.
  - Direct: https://www.cigarhut.com.au/the-tabernacle-corona-doble/

Havana Seed CT #142 is a different blend counterpart and should remain standalone linked:
- Robusto A$49 single.
- Toro A$70 single.
  - Direct: https://www.cigarhut.com.au/the-tabernacle-havana-seed-ct-no-142-toro/
- Lancero A$44 single, listed sold out.
- Double Corona A$80 single.
  - Direct: https://www.cigarhut.com.au/the-tabernacle-havana-seed-ct-142-double-corona/
- David A$52 single.
- Goliath A$55 single.
Use the family page for any unresolved exact direct URL.

## Oliva Serie O
Current key: `oliva-serie-o`

Cigar Hut family page: https://www.cigarhut.com.au/oliva/

Verified natural/Habano line offers:
- Cigarillos, tin of 5, 4 × 38: A$86 tin of 5, currently shown sold out on category.
  - Direct: https://www.cigarhut.com.au/oliva-serie-o-cigarillos-tin-of-5-habano/
- Petit Corona: A$29 single.
  - Direct: https://www.cigarhut.com.au/oliva-serie-o-petit-corona/
- Corona: A$39 single.
  - Direct: https://www.cigarhut.com.au/oliva-serie-o-corona/
- Robusto: A$42 single.
  - Direct: https://www.cigarhut.com.au/oliva-serie-o-robusto/

Maduro is a blend counterpart, standalone linked:
- Serie O Maduro Robusto, 5 × 50: A$42 single.
  - Direct: https://www.cigarhut.com.au/oliva-serie-o-maduro-robusto/
- Serie O Maduro Double Toro: A$67 single on Cigar Hut family page; exact direct URL unresolved in this pass.

## Oliva Serie G
Current key: `oliva-serie-g`

Cigar Hut family page: https://www.cigarhut.com.au/oliva/

Verified Cameroon/natural line offers:
- Cigarillos, tin of 5, 4 × 38: A$96 tin of 5.
  - Direct: https://www.cigarhut.com.au/oliva-serie-g-cigarillos-tin-of-5-cameroon/
- Petit Corona: A$29 single.
  - Direct: https://www.cigarhut.com.au/oliva-serie-g-petit-corona/
- Robusto: A$44 single.
  - Direct: https://www.cigarhut.com.au/oliva-serie-g-robusto/
- Belicoso: A$44 single.
  - Direct: https://www.cigarhut.com.au/oliva-serie-g-belicoso/
- Special G Natural: A$27 single on the Cigar Hut family page. Exact direct URL not resolved in this pass.

Maduro is a blend counterpart, standalone linked. See the existing `oliva-serie-g-maduro-special-g` entry below.

## Oliva Serie G Maduro
Current key: `oliva-serie-g-maduro-special-g`

Verified same-blend size candidates:
- Special G Maduro, 3.75 × 48: A$29.40 single at The Index; A$1,363.20 box of 48.
  - Direct: https://www.theindexcigars.com.au/products/oliva-serie-g-special-g-maduro
- Serie G Maduro Robusto: A$47 single at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/oliva-serie-g-maduro-robusto/

Natural/Cameroon Serie G is a blend counterpart and should remain standalone linked.

## Alonso Menendez Axe Charutos
Current key: `alonso-menendez-axe-charutos`

No current Australian retailer page for an exact Axe size sibling was verified in this pass.

Potential family-related product:
- Alonso Menendez Gold Cigarillo, box of 50: A$199 at Cigar Hut.
  - Retailer category: https://www.cigarhut.com.au/machine-made-cigars/

Do NOT automatically make Gold a blend variant of Axe. Brazilian brand catalogues show Axe, Gold, Gold Half Corona and Corona Rustico as separate Alonso Menendez products, but an exact same-blend relationship was not established. Treat as candidate-related only until blend identity is verified.

## AJ Fernandez Last Call Maduro
Current key: `aj-fernandez-last-call-maduro-flaquitas`

Cigarworld category fallback: https://www.cigarworld.com.au/aud/categories/cigars/aj-fernandez-%28nicaragua%29/last-call/

Verified Maduro offers:
- Maduro Flaquitas, 6 × 46: A$45.07 full cigar single at Cigarworld. The catalogue currently uses A$22.54 per half-session under its halving convention; do not confuse the session price with the retailer's full-stick price.
  - Direct: https://www.cigarworld.com.au/aud/products/last-call-%252d-maduro-flaquitas-%286%22-x-46%29-single.html
- Maduro Chiquitas, 3.5 × 50: A$38.89 single. Direct URL unresolved; category fallback.
- Maduro Corticas, 4 × 52: A$45.33 single.
  - Direct: https://www.cigarworld.com.au/aud/products/last-call-maduro-%252d-corticas-%284%22x-52%29-%252d-single.html

Habano is a separate blend counterpart:
- Habano Chiquitas, 3.5 × 50: A$38.60 single.
- Habano Corticas, 4 × 52: A$45.07 single.
- Habano Flaquitas, 6 × 46: A$44.08 single.
Exact direct URLs for those three were not reliably resolved; use the category fallback until verified.

## Davidoff Winston Churchill Original Series
Current key: `davidoff-winston-churchill-petite-panatela`

Verified offers:
- Petite Panatela, 4 × 38: A$28.95 single; A$139 tin of 5 at Cigarworld.
  - Category fallback: https://www.cigarworld.com.au/aud/categories/cigars/davidoff-%28dominican%29/davidoff/
- Belicoso, 4.5 × 46: A$36.80 single at The Index.
  - Direct: https://www.theindexcigars.com.au/products/davidoff-winston-churchill-the-original-series-belicoso
- Robusto, 5.25 × 52: A$70.30 single at The Index; single available.
  - Direct: https://www.theindexcigars.com.au/products/davidoff-winston-churchill-robusto
- Toro, 6 × 54: A$76.70 single at The Index from the retailer page indexed during this audit.
  - Direct: https://www.theindexcigars.com.au/products/davidoff-winston-churchill-toro
- Churchill, 6 7/8 × 47: A$78.80 single at The Index.
  - Direct: https://www.theindexcigars.com.au/products/davidoff-winston-churchill-churchill

These are same-line size candidates. Verify the Original Series blend is unchanged across these vitolas before nesting.

## La Flor Dominicana Double Ligero Chiselito Maduro
Current key: `la-flor-dominicana-double-ligero-chiselito-maduro`

Current exact retailer:
- Double Ligero Chiselito Maduro, 5 × 44: A$36.20 single from The Index in current catalogue research.
  - Direct: https://www.theindexcigars.com.au/products/la-flor-dominicana-double-ligero-chiselito-maduro

Australian searches also found Double Ligero Digger Natural, 8.5 × 60, at A$101.88 single on Cigarworld, but that is both a different size and Natural wrapper presentation; do not nest it under the Maduro entry without confirming exact blend relationship.
- Cigarworld LFD category: https://www.cigarworld.com.au/aud/categories/cigars/la-flor-dominicana-%28dominican-republic%29/

No current Australian direct listing for an exact Chiselito Natural counterpart was verified. Leave unresolved rather than inventing it.

## La Flor Dominicana Reserva Especial El Jocko
Current key: `la-flor-dominicana-reserva-especial-el-jocko-maduro`

Cigarworld LFD category: https://www.cigarworld.com.au/aud/categories/cigars/la-flor-dominicana-%28dominican-republic%29/

Verified:
- El Jocko Maduro, 4.5 × 32–54 Perfecto: A$37.14 single; A$843.33 box of 24.
- El Jocko Natural, 4.5 × 32–54 Perfecto: A$37.14 single; A$843.33 box of 24, with the box currently marked unavailable while the single is listed purchasable.

Natural is a wrapper/blend counterpart and should be a standalone linked entry, not an internal size variant.

## La Flor Dominicana La Nox
Current key: `la-flor-dominicana-la-nox-petit`

Verified:
- La Nox Petit, 5 × 40: A$39.84 single; A$1,891.87 box of 50 at Cigarworld.
  - Retailer/category: https://www.cigarworld.com.au/aud/categories/cigars/la-flor-dominicana-%28dominican-republic%29/

No other current Australian La Nox vitola with a standalone price was verified in this pass. Do not create priced sibling offers from overseas pricing.

## Foundation Charter Oak Maduro
Current key: `foundation-charter-oak-maduro-rothschild`

Cigar Hut family page: https://www.cigarhut.com.au/charter-oak/

Verified Maduro same-blend size candidates:
- Rothschild, 4.5 × 50: A$34 single; up to A$619.
  - Direct: https://www.cigarhut.com.au/charter-oak-maduro-rothschild/
- Petite Corona, 5.25 × 42: A$37 single. Direct product page and category page currently disagree on the maximum package price (direct has been seen at A$649 while category has A$679); use A$37 for the single and re-read live product page before persisting any box price.
  - Direct: https://www.cigarhut.com.au/charter-oak-maduro-petite-corona/
- Toro: A$56 single; up to A$999; category lists sold out.
  - Direct: https://www.cigarhut.com.au/charter-oak-maduro-toro/
- Lonsdale: A$54 single; up to A$989.
  - Direct: https://www.cigarhut.com.au/charter-oak-maduro-lonsdale/
- Grande: A$55 single; up to A$1,039.
  - Direct: https://www.cigarhut.com.au/charter-oak-maduro-grande/

Standalone linked blend counterparts:
- Shade Petite Corona: A$32 single; sold out.
  - Direct: https://www.cigarhut.com.au/charter-oak-shade-petite-corona/
- Shade Rothschild: A$42 single.
  - Direct: https://www.cigarhut.com.au/charter-oak-shade-rothschild/
- Shade Toro: A$56 single.
- Shade Lonsdale: A$51 single; sold out.
  - Direct: https://www.cigarhut.com.au/charter-oak-shade-lonsdale/
- Shade Grande: A$65 single.
- Habano Petit Corona: A$29 single; sold out.
  - Direct: https://www.cigarhut.com.au/charter-oak-habano-petit-corona/
- Habano Rothschild: A$42 single.
- Habano Toro: A$51 single.
- Habano Torpedo: A$61 single.
- Habano Grande: A$65 single.
  - Direct: https://www.cigarhut.com.au/charter-oak-habano-grande/

Where a direct link is not listed above, use the Charter Oak family page until the exact product URL is resolved.

## Paradiso Quintessence
Current key: `paradiso-quintessence-robusto`

Cigar Hut family page: https://www.cigarhut.com.au/paradiso/

Verified same-line candidates:
- Quintessence Robusto, 5.5 × 50: A$40 single.
  - Direct: https://www.cigarhut.com.au/paradiso-quintessence-robusto/
- Quintessence Majestic: A$52 single.
  - Direct: https://www.cigarhut.com.au/paradiso-quintessence-majestic/
- Quintessence Belicoso: A$56 single; listed sold out.
  - Direct: https://www.cigarhut.com.au/paradiso-quintessence-belicoso/

Other Paradiso-branded cigars (Clasico, Papagayo, Coloso, Elegancia) are not automatically internal size variants. Elegancia is clearly a separate wrapper/blend family and is already a separate current entry.

## Ashton VSG
Current key: `ashton-vsg-enchantment`

Cigar Hut VSG family page: https://www.cigarhut.com.au/vsg-virgin-sun-grown/

Verified same-line candidates:
- Enchantment, 4.375 × 60: A$44 single; up to A$899.
  - Direct: https://www.cigarhut.com.au/ashton-vsg-enchantment/
- Tres Mystique: A$39 single; listed sold out. Family page fallback.
- Belicoso No.1: A$56 single.
  - Direct: https://www.cigarhut.com.au/ashton-vsg-belicoso-no-1/
- Torpedo: A$69 single.
  - Direct: https://www.cigarhut.com.au/ashton-vsg-torpedo/
- Wizard: A$63 single. Family page fallback.
- Sorcerer: A$67 single.
  - Direct: https://www.cigarhut.com.au/ashton-vsg-sorcerer/
- Eclipse Tubo: A$62 single.
  - Direct: https://www.cigarhut.com.au/ashton-vsg-eclipse-tubo/
  - Treat the tubo as packaging if the cigar itself is identical to standard Eclipse.
- VSG Robusto, 5.5 × 50: A$60.18 single, in stock at Cigarworld.
  - Direct: https://www.cigarworld.com.au/aud/products/ashton-vsg-%252d-robusto-%252d-%285-1%7B47%7D2x-50%29-%252d-single.html

Australian VSG sampler evidence confirms standard Eclipse 6 × 52, Sorcerer 7 × 49, Torpedo 6.5 × 55, Robusto 5.5 × 50 and Wizard 6 × 56.

## Paradiso Elegancia
Current key: `paradiso-elegancia-corona`

Cigar Hut family page: https://www.cigarhut.com.au/paradiso/

Verified same-line candidates:
- Elegancia Corona, 5.5 × 46: A$37 single.
  - Direct: https://www.cigarhut.com.au/paradiso-elegancia-corona/
- Elegancia Robusto: A$47 single.
  - Direct: https://www.cigarhut.com.au/paradiso-elegancia-robusto/
- Elegancia Churchill: A$54 single.
  - Direct: https://www.cigarhut.com.au/paradiso-elegancia-churchill/

Keep Quintessence separate as a linked blend counterpart.

## My Father La Gran Oferta
Current key: `my-father-la-gran-oferta-lancero`

Verified current AU offer:
- La Gran Oferta Lancero, 7.5 × 38: A$666.96 box of 20 at AuCigars, equivalent to A$33.348 per cigar; currently unavailable.
  - Direct: https://aucigars.com/products/my-father-la-gran-oferta-lancero-cigar

AuCigars' current sitemap confirms live product records for:
- La Gran Oferta Robusto
- La Gran Oferta Toro
- La Gran Oferta Toro Gordo
- La Gran Oferta Lancero

However, current prices/direct product URLs for Robusto, Toro and Toro Gordo were not reliably resolved in this pass. Australian sampler evidence confirms La Gran Oferta Toro 6 × 50. Do not guess the sibling prices. Claude may create the size variants with no retailer offer, or defer them, but should not copy the Lancero price.

## My Father Original
Current key: `my-father-no-4-lancero`

Cigar Hut family page: https://www.cigarhut.com.au/my-father/

Verified same-line candidates:
- No.4 Lancero, 7.5 × 38: A$56 single; up to A$1,169.
  - Direct: https://www.cigarhut.com.au/my-father-no-4-lancero/
- No.1 Robusto, 5.25 × 52: A$60 single; up to A$1,149.
  - Direct: https://www.cigarhut.com.au/my-father-no-1-robusto/
- No.3 Cremas, 6 × 49: A$70 single; up to A$1,529.
  - Direct: https://www.cigarhut.com.au/my-father-no-3-cremas/
- No.6 Toro Gordo Box Pressed: A$80 single; up to A$1,319; category currently shows sold out.
- Cedros Deluxe Cervantes: A$56 single; up to A$1,149; category currently shows sold out.

Cigar Hut's product data shows No.1 and No.4 both use Habano-Rosado wrapper with Nicaraguan binder/filler, which is strong evidence of the same Original blend. Still verify No.3/No.6/Cedros before nesting.

## Liga Privada No. 9
Current key: `liga-privada-no-9-petit-corona-oscuro`

Cigar Hut family page: https://www.cigarhut.com.au/liga-privada-no-9/
Cigarworld Liga category: https://www.cigarworld.com.au/aud/categories/cigars/drew-estate-%28nicaragua%29/liga-privada/

Verified same-blend size candidates:
- Petit Corona Oscuro, 4.25 × 46: A$44 single at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-petit-corona-oscuro/
- Short Panatela Oscuro, 4.5 × 40: A$37 single at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-short-panatela-oscuro/
- Coronets, 4 × 32: A$109 tin of 10 at Cigar Hut (A$10.90/stick if the catalogue chooses per-stick value for this package).
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-coronets-tins-10-cigars/
- Corona Viva: A$55 single at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-corona-viva/
- Robusto, 5 × 54: A$61 single at Cigar Hut; Cigarworld currently lists A$61.35, so use Cigar Hut as the lower verified price.
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-robusto/
- Toro, 6 × 52: Cigarworld currently lists A$75 single, lower than Cigar Hut's A$80. Use A$75 as the current best verified offer.
  - Cigarworld category fallback above; exact direct Cigarworld product URL was not reliably resolved.
  - Cigar Hut direct alternative: https://www.cigarhut.com.au/liga-privada-no-9-toro/
- Belicoso Oscuro, 6 × 52: A$73 single at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-belicoso-oscuro/
- Corona Doble, 7 × 52: A$85 single at Cigar Hut.
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-corona-doble/
- Flying Pig, 4 × 60: A$65 single at Cigarworld but currently temporarily unavailable. Its materially different shape makes it a format candidate; do not automatically treat it as a trivial size variant.

Packaging-only:
- Toro Tubo, 6 × 52: A$75 at Cigar Hut, currently listed sold out.
  - Direct: https://www.cigarhut.com.au/liga-privada-no-9-toro-tubo/
If the actual cigar is the same Toro, do not create a separate cigar variant merely because it is tubed.

---

## Implementation handoff rules for Claude

1. Read live KV first and determine the current subsection membership from `sections.recommendationSubsections`. Do not blindly trust the reconstructed 20-entry list above.
2. Re-use these verified offers. Do not retype/normalize a URL into a guessed slug.
3. Prefer lowest verified Australian single/per-stick price when two exact offers are available. Do not use SmokingPipes as the best-price source.
4. For packaged compact formats, preserve package price and quantity, and use the catalogue's established per-stick/value convention.
5. For Half-Cigar/session entries, keep retailer full-stick price distinct from practical-session price.
6. Never copy a parent/default variant's price, dimensions or retailer link into a sibling size unless the retailer page explicitly applies to that exact size.
7. If an offer is unresolved here, leave it unresolved or verify it directly before displaying a price.
8. Same exact cigar/blend + only vitola/size difference => internal size variant.
9. Wrapper/blend counterpart => standalone linked entry.
10. Materially different construction/shape may be a standalone format variant. Packaging-only differences are offers, not cigar variants.
