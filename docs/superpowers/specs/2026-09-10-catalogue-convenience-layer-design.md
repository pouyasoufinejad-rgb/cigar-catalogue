# Catalogue Convenience Layer Design

## Goal
Add four high-impact convenience features without rewriting the existing catalogue renderer or changing ranking, tier, Value, archive, Half-Cigar, flavour, or stock semantics: personal status chips, a compare tray, progressive-disclosure cards, and a retailer matrix.

## Architecture
Implement one additive browser module, `public/catalogue-convenience.mjs`, loaded from `public/catalogue-value.mjs` alongside the existing presentation modules. The module decorates both static and dynamic `article.card[data-key]` cards after hydration, and observes later-added cards. It must not mutate catalogue KV or card editorial data.

Personal UI state is stored only in `localStorage` under `cigar-catalogue-convenience-v1`. Storage failures must degrade safely to in-memory defaults.

## Personal status system
Each card gets four independent status chips: `Owned`, `Tried`, `Want to Try`, and `Rebuy`. No status implies any other status. A small global status filter offers `All`, `Owned`, `Tried`, `Want to Try`, and `Rebuy`; it composes with the catalogue's existing stock/tier filtering by using a dedicated `data-personal-filter-hidden` flag rather than the existing `hidden` class.

## Compare tray
Each card gets a `Compare` toggle. Up to four unique cigar keys may be selected. Selection persists locally across refreshes. A fixed bottom tray appears only with a non-empty selection and shows the selection count, `Compare`, and `Clear` actions.

Opening Compare displays an overlay with one column per selected cigar and rows for product image/name, per-stick price, package price, dimensions, Strength, Quality, Flavour, Size, Value, smoke time, stock, personal status, and Production/blend text. The panel is horizontally scrollable on narrow screens and can be closed with a close button, backdrop click, or Escape.

## Progressive disclosure
First-time default is `compact`. A global `Compact / Detailed` control switches the baseline for all cards. Per-card `Details / Collapse` toggles allow exceptions. The global toggle clears per-card exceptions.

Compact cards retain the image, identity, country, package/per-stick price, dimensions, stock indicator, medals/laurels, personal status chips, Compare, and Details controls. Compact mode hides Production/Practical overlays, value-calculation detail, experience tags, long summary, notes, retailer matrix, and legacy retailer links. Detailed mode restores those elements.

## Retailer matrix
For each card with one or more existing `.shop` retailer links, detailed mode replaces the visual presentation of those links with a compact matrix containing retailer name, current known stock status, price information when attribution is unambiguous, and an `Open` link.

The matrix reads live stock data from `/api/stock`. If a retailer-specific status cannot be matched, display `Unknown` rather than inferring it. If a card has exactly one retailer link, its catalogue package/per-stick price can be shown on that row; with multiple retailer links, do not attribute the catalogue price to a retailer without structured source data. The existing `.shop` links remain in the DOM for backwards compatibility and stock extraction, but are visually hidden only after a matrix is successfully created.

## Interaction safety
Controls inside cards stop click propagation so they do not trigger direct-edit selection or unrelated card handlers. Mutation observation decorates new dynamic cards idempotently and must not create duplicate controls or matrices.

## Visual style
Use the existing black/gold visual language. Controls should be compact, low-chrome, and secondary to the cigar image/name/medals. The compare tray and overlay may use stronger gold borders for hierarchy, but no wholesale redesign of existing cards.

## Explicit non-goals
- No `Find me a cigar` feature or recommendation filters.
- No renderer rewrite.
- No automatic retailer price scraping.
- No new personal-status data in Cloudflare KV.
- No changes to ranking, tier routing, Value calculation, laurels, stock logic, archived state, or Half-Cigar handling.

## Testing
Add a focused `test/catalogue-convenience.test.mjs` suite for pure state helpers and source-level integration guarantees, plus a loader assertion that the module is imported by `catalogue-value.mjs`. Tests must cover independent statuses, compare de-duplication/max-four, compact default/state normalisation, retailer labels/status matching, and the requirement that the module never references the catalogue write API.
