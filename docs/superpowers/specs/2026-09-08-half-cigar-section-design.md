# Half-Cigar Catalogue Presentation Design

## Goal

Replace the rating-driven “Substantial Format” recommendation group with a semantic “The Half-Cigar” group, separate the main rank order from recommendation grouping and tasters, and add a Half Cigars-only view control.

## Requirements

- The recommendation order is: Elite, Strong, The Half-Cigar, then Noteworthy groups.
- “Substantial Format” is no longer a recommendation destination and no rating combination creates it.
- The Half-Cigar group is semantic, not medal-driven.
- A main-catalogue card belongs in The Half-Cigar when its identifying or usage metadata contains `half` or a `halv…` form, case-insensitively. This includes names such as “Half Corona” and usage wording such as “halve”, “halved”, “halves”, or “halving”.
- Do not classify from tasting-summary prose alone, because incidental phrases such as “second half” do not describe a cigar intended to be halved.
- Tasters remain a separate cohort and must not be pulled into the Half-Cigar recommendation group.
- Active main-catalogue ranking is presented independently of the recommendation groups. Ranking is ordered by each card’s current main rank and excludes archived cards and tasters.
- Recommendation cards no longer need to communicate their numeric rank as part of the recommendation grouping; the independent Ranking presentation is the source of the ordered main list.
- Add a `Half Cigars` control beside the existing Tasters-style view controls. Activating it shows only the Half-Cigar group/cards; choosing another catalogue view exits Half Cigars-only mode.
- The feature must work for static and dynamically hydrated catalogue entries without hard-coding cigar keys.

## Implementation approach

Keep the large static `public/index.html` unchanged. Extend `public/catalogue-presentation.mjs`, which already owns recommendation reclassification and runs after hydration. Reuse the existing `data-noteworthy-section="substantial"` container as an internal mount point, rename and reposition it at runtime, and change recommendation routing so non-half cards fall through to Elite, Strong, or Noteworthy normally.

Generate a lightweight Ranking section from the current active main-card DOM instead of cloning full cards. The presentation runtime refreshes it after mutations and rank changes. Mark half-cigar cards with a data attribute so recommendation placement and the Half Cigars-only view share one classification rule.

## Classification inputs

A card is a Half-Cigar when the combined text from these sources contains `half` or `halv`:

- `data-key`
- cigar title (`h3`)
- Practical metadata (`.artmeta-right`)
- catalogue note (`.mog-note`)

The tasting summary (`.summary`) is intentionally excluded.

## Testing

Update presentation tests first so they fail against the current Substantial logic. Cover:

- `half`/`halve` cue matching and case-insensitivity
- title/key/practical/note-based card classification
- summary-only “second half” not qualifying
- removal of rating-driven `substantial` routing
- Strong fallback for Strength + Size Gold
- runtime hooks for Half-Cigar section rename/order, ranking generation, and Half Cigars-only control

Update the layout regression test so it no longer requires the old static Substantial-before-Noteworthy order; runtime presentation now owns the visible order.