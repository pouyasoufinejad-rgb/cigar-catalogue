# SmokingPipes-Inspired Catalogue UI Rebuild Design

## Goal

Replace the brittle layered catalogue presentation/editor with one coherent catalogue surface while preserving the live Cloudflare KV catalogue state, all existing cigar data, existing ranking rules, and the Jax and the Skeletons artwork at the top of the page.

## Non-negotiable constraints

- Cloudflare KV remains the source of truth for editable catalogue state.
- Existing static and dynamic cigar entries remain supported and no catalogue data is bulk-migrated or deleted.
- Preserve the existing Jax and the Skeletons artwork/header at the top of the page.
- Preserve automatic Value derivation. Value is never directly persisted as an arbitrary editable score.
- Recommendation subsections are independent ranking cohorts. Current live subsections are Coronets, Petit Panatelas, and Infused / Flavoured.
- Half-Cigar and Taster rankings remain independent of Recommendation subsections and of each other.
- Rank changes alter only the rank flag/order, never eyebrow prose.
- Joya Black remains in Coronets unless explicitly moved by the user.
- Benchmarks/Legends remain collapsed by default.
- Archive is preferred over deletion.
- The page must load at the top when there is no URL hash.

## Architecture

The rebuild uses the existing server-rendered catalogue HTML as the inventory/content seed and moves the existing cigar card nodes into a new presentation shell after hydration. This preserves all static cigar content and embedded/existing image assets, including data not duplicated in KV, while removing the old page structure from the visible interaction model.

A single new module, `public/catalogue-next-ui.mjs`, owns presentation, navigation, brand exploration, inline selection, edit mode, contextual editing, and staged saves. Existing state APIs and the established admin authentication helper remain the persistence boundary. The old full-screen/structure editors are not loaded by the new runtime path.

The module is split internally into pure helpers for catalogue type, subsection membership, rank operations, editable field mapping, and state patch construction so those behaviors can be unit-tested without a browser dependency.

## Presentation

The visual direction borrows SmokingPipes' information hierarchy and browsing density without copying its branding. The catalogue keeps its dark identity and existing artwork.

The new shell contains:

- retained top artwork/header;
- compact sticky navigation with catalogue title, search, section shortcuts, and `Edit Catalogue`;
- Recommendation section subdivided by the explicit live Recommendation subsections;
- Half-Cigars section;
- Tasters section;
- unavailable/archived disclosure;
- collapsed Benchmarks/Legends disclosure when the legacy content exists;
- clickable brand names that open a Brand Explorer overlay containing every matching product, current price, size, ratings, stock, and a jump-to-card action.

Cards use a denser retail-catalogue layout: product image on the left, brand/name and descriptive content in the center, and compact price/ratings/stock metadata on the right. Mobile collapses this to a single readable column while retaining the same information order.

## Master edit mode

`Edit Catalogue` toggles one master edit mode on the live catalogue surface. There is no separate admin page.

While edit mode is active:

- editable elements receive a subtle hover/selection outline;
- clicking a card field selects that exact field and opens a contextual inspector;
- clicking a card background opens the full cigar inspector;
- clicking a subsection heading edits its name/description;
- clicking an image exposes image replacement/presentation controls through the existing image persistence path;
- clicking a rank flag edits position only inside its own cohort;
- card/subsection drag handles appear where reordering is valid;
- section-level controls allow subsection ordering and visibility where supported;
- changes are staged in memory and preview immediately;
- a sticky edit bar exposes Undo, Discard, Save Changes and Done Editing.

The inspector edits persisted source fields rather than derived display values. For derived Value, the inspector explains that Value updates automatically from price/quality/strength/size rules and directs edits to those inputs.

## Save model

The UI fetches `/api/catalogue-overrides` and merges it with the existing DOM seed. Edits are represented as a draft state. `Save Changes` submits one validated state update through `adminWriteFetch`, preserving all unrelated card overrides, entries, sections, and explicit Recommendation subsection state.

Recommendation ordering writes only `recommendationSubsections[].entryKeys`. Half-Cigar and Taster ordering writes contiguous `rank` values only within those respective cohorts. Main cards in v4 Recommendation subsections do not receive legacy global `rank` values.

Dynamic-entry edits preserve the established entry payload and image metadata behavior. Static-card edits remain sparse overrides in `state.cards`.

## Error handling

Failed state loads leave the legacy catalogue visible rather than presenting an empty rebuild. Failed saves keep the draft active, show the actual error, and do not discard staged edits. A successful save re-fetches state before confirming completion.

## Verification

Tests cover:

- runtime loads the new UI and does not load conflicting old editor modules;
- Jax/header content is not removed by the rebuild;
- explicit Recommendation subsection membership/order is preserved;
- Joya Black remains in Coronets in live-derived v4 state;
- Recommendation, Half-Cigar and Taster reorder helpers are cohort-local and contiguous;
- eyebrow text is untouched by rank changes;
- Value is never written directly;
- staged patches preserve unrelated fields;
- initial no-hash load restores scroll position to top;
- Brand Explorer groups products by exact brand;
- edit mode exposes one master toggle and contextual inspector rather than the old full-screen admin panel.
