# SmokingPipes-Inspired Catalogue UI Foundation

Date: 2026-09-15
Status: Design approved in chat; implementation pending plan/review
Branch: `feature/smokingpipes-ui-foundation`

## 1. Goal

Build a new, clean frontend foundation for the Cigar Catalogue using the public SmokingPipes cigar catalogue as the principal information-architecture and interaction reference.

The new frontend must be structurally independent from the current accumulated presentation/editor modules and must not mutate or migrate live catalogue data during the foundation phase.

The eventual result should support the user's existing catalogue data, rankings, medals, retailer information, image presentation and master edit mode, but those data and persistence integrations are deliberately staged after the visual/structural foundation is stable.

## 2. Reference UI

Primary public references:

- `https://www.smokingpipes.com/cigars/`
- brand catalogue pages such as `https://www.smokingpipes.com/cigars/drew-estate/`
- individual cigar product pages linked from those catalogue pages

The build may inspect public HTML structure and publicly delivered assets for behavioural/reference purposes, but it will not copy SmokingPipes proprietary source wholesale. The implementation will recreate the useful layout and interaction patterns in project-owned code.

Key SmokingPipes patterns to reproduce:

- dense utility header and primary catalogue navigation
- breadcrumb-led page hierarchy
- editorial/category introduction before results
- left-side collapsible faceted filtering on desktop
- compact filter drawer on smaller screens
- results toolbar with count, sort and view controls
- dense multi-column product grid
- brand-first then product-name hierarchy
- visible vitola/dimensions and price/availability metadata
- product detail page with large image/gallery area, product data and long-form notes
- brand pages using the same shared filtering/grid system
- restrained visual language using rules, spacing and typography instead of oversized cards

SmokingPipes ecommerce-only concerns such as cart, checkout, account, US shipping and stock-purchase workflow are not part of this project.

## 3. Existing Project Constraints

The repository is a Cloudflare Worker application. `src/index.js` owns Worker/API behaviour and `public/**` contains the browser frontend. Cloudflare KV is authoritative for editable catalogue state; Git is authoritative for code and tooling.

The current frontend bootstraps many independent modules through `public/catalogue-runtime.mjs`. The replacement must avoid adding another patch layer to that stack.

The foundation must therefore be additive and previewable in isolation until cutover.

## 4. Chosen Architecture

### 4.1 No new framework

Use standards-based HTML, CSS and ES modules rather than introducing React/Vue/Svelte or a build tool.

Reasons:

- the current Worker already serves static assets directly
- there is no bundler or frontend framework dependency today
- the UI does not require framework-level state complexity
- direct modules keep deployment and debugging simple
- lower risk of changing Worker/runtime behaviour during the rebuild

### 4.2 Parallel v2 shell

Create the new frontend under a dedicated subtree:

```text
public/ui-v2/
  index.html
  catalogue.css
  catalogue-app.mjs
  data/
    fixture-catalogue.mjs
  lib/
    catalogue-model.mjs
    catalogue-query.mjs
    catalogue-routing.mjs
    edit-registry.mjs
  components/
    site-header.mjs
    breadcrumb.mjs
    catalogue-intro.mjs
    filter-panel.mjs
    results-toolbar.mjs
    product-grid.mjs
    product-card.mjs
    brand-view.mjs
    product-view.mjs
    rating-display.mjs
    retailer-display.mjs
    edit-overlay.mjs
```

The initial preview will be reachable as a static asset path and will not replace `/`.

The legacy `public/index.html` and existing runtime modules remain untouched during the foundation phase.

## 5. Normalized View Model

The new UI must not bind directly to the current KV/static-storage quirks. It consumes a normalized view model.

Proposed product shape:

```js
{
  id,
  slug,
  brand,
  name,
  vitola,
  section,
  subsection,
  type,
  image,
  dimensions: {
    lengthInches,
    ringGauge,
    display
  },
  country,
  wrapper,
  binder,
  filler,
  strength,
  quality,
  value,
  risk,
  rank,
  eyebrow,
  price: {
    amount,
    currency,
    perStick,
    packageQuantity
  },
  retailers: [],
  tastingNotes,
  description,
  flags: {
    flavoured,
    archived,
    noteworthy
  }
}
```

During foundation work this model is populated by a fixture module. In the later data-port phase, a single adapter will translate current static/KV data into this model.

This boundary is mandatory. Presentation components must not know whether a field came from static baseline HTML, a dynamic KV entry, a card override or a later storage format.

## 6. Page Structure

### 6.1 Catalogue index

```text
Site header
Primary navigation
Breadcrumb
Page heading + concise catalogue introduction
Quick links / section tabs
Main two-column catalogue layout
  Sidebar filters
  Results region
    results toolbar
    product grid
Footer
```

Desktop target: dense catalogue browsing with a persistent left filter rail and 3 to 5 product columns depending on viewport width.

Mobile target: filter rail becomes an explicit drawer/sheet; product cards collapse to one or two columns without dropping key data.

### 6.2 Brand explorer

Clicking a brand anywhere in a product card opens a brand-scoped catalogue view using the same filter and grid components.

The brand explorer contains:

- breadcrumb
- brand name
- optional short brand summary
- count of catalogue entries
- brand-scoped filter set
- normal results toolbar
- product grid

No separate hard-coded brand UI should exist.

### 6.3 Product detail

The product page uses a SmokingPipes-like information hierarchy adapted to catalogue scoring:

```text
Breadcrumb
Brand link
Product name + vitola
Main content split
  large black-background product image
  primary metadata / score panel
    dimensions
    strength
    quality
    value
    risk
    rank / medal
    price
    retailer links
Catalogue assessment
Tasting notes
Blend / construction data
Related cigars
More from this brand
```

The project's black-background product imagery is retained rather than copying SmokingPipes product photography styling.

## 7. Product Card Design

Product cards should be denser and more editorial than the current UI.

Required visible hierarchy:

1. product image
2. clickable brand
3. cigar name
4. vitola and dimensions
5. price / package context
6. concise score strip for Quality, Strength and Value
7. ranking / risk / medal indicators only where relevant
8. short eyebrow or note where the catalogue already uses one

Cards should not show every available field by default. Long description and tasting prose belong on product detail.

Cards should use borders/rules and whitespace rather than floating rounded panels.

## 8. Filtering and Sorting

Foundation filters should support the normalized model even before live data is connected.

Initial facets:

- section / cohort
- brand
- strength
- wrapper
- country
- size / length
- ring gauge
- price
- quality
- value
- risk
- flavoured status
- archive/noteworthy status when edit/admin context permits

Filters are conjunctive across groups and disjunctive within a multi-select group.

URL query state should reflect filters and sorting so views can be shared/bookmarked.

Sorting foundation:

- catalogue rank
- quality
- value
- price low-high
- price high-low
- brand A-Z
- cigar name A-Z
- strength

Subsection ranking logic remains separate from filtering. A filter must never recalculate or merge ranking cohorts.

## 9. Routing

Use History API routing without adding a framework.

Foundation routes:

- `/ui-v2/` catalogue index
- `/ui-v2/brand/<brand-slug>` brand explorer
- `/ui-v2/cigar/<product-slug>` product detail

The static preview should still work when opened directly under the Worker. If Worker fallback handling is needed for nested routes, route support will be added deliberately during implementation rather than relying on accidental static behaviour.

## 10. Master Edit Mode Preparation

The eventual `Edit Catalogue` control is a master mode, not a separate disconnected editor.

Foundation components therefore expose stable edit targets using semantic field paths, for example:

```html
<span data-edit-path="products.<id>.name">...</span>
```

and structural targets such as:

```html
<section data-edit-region="catalogue-intro">...</section>
<div data-edit-region="product-order">...</div>
```

During foundation work, clicking Edit Catalogue may initially show edit-target outlines/selection only. No live save is required in the foundation phase.

Later, the edit overlay will map selected targets to the existing persistence pipeline or a replacement save service. This allows:

- text editing
- score/metadata editing
- image replacement
- card reordering
- subsection/section ordering
- heading/introduction editing
- visibility controls
- layout-level settings deliberately registered as editable

The edit system must edit explicit data/schema fields. It must not persist arbitrary mutated HTML.

## 11. Visual System

The goal is recognizably SmokingPipes-inspired without being a pixel-for-pixel clone.

### Typography

- serif family for major headings/product titles
- compact neutral sans-serif for navigation, filters, dimensions, prices and score metadata
- strong size hierarchy, restrained weight changes

Use system/web-safe stacks in the foundation to avoid font licensing/deployment issues.

### Colour

- warm white / light neutral page background
- charcoal/near-black type
- subdued brown/burgundy accent family inspired by tobacco retail presentation
- black product-image wells retained from the current catalogue
- medal/risk colours only where semantically meaningful

### Layout

- maximum content width around 1400px
- narrow utility/header heights
- desktop filter rail around 240-280px
- compact gaps between cards
- square/rectangular corners or very small radii
- fine borders/dividers

## 12. Accessibility and Interaction

- semantic buttons for expandable filter groups
- visible keyboard focus
- filter controls with labels
- no hover-only essential information
- brand and product titles remain genuine links
- edit mode selection must be keyboard-operable later
- reduced-motion friendly interactions

## 13. Performance

The foundation should load no third-party frontend framework and minimal JavaScript.

Requirements:

- product card rendering from normalized data in one render pass
- filters computed in-memory for current catalogue size
- event delegation where practical
- images use lazy loading except initial visible products
- no mutation-observer-driven layout patching for core presentation
- no repeated DOM reconstruction loops during initial hydration

The current catalogue has regression tests around hydration/performance; new tests should establish equivalent or better constraints for v2 rather than making the new shell depend on old module behaviour.

## 14. Testing Strategy

Foundation tests should cover behaviour rather than exact incidental markup.

Add tests for:

- normalized-model validation/defaults
- filter composition
- sort behaviour
- independent ranking/cohort preservation
- brand route filtering
- product route lookup
- card required metadata contract
- edit-target registration
- no legacy runtime imports from `ui-v2`
- Worker/static accessibility of the preview entrypoint

Existing legacy tests remain unchanged during the foundation phase.

## 15. Migration / Cutover Strategy

### Phase 1: foundation

- build isolated `public/ui-v2/`
- use fixture products representative of main, Taster, Half-Cigar, flavoured and noteworthy entries
- implement catalogue, brand and product views
- implement filter/sort/query-state behaviour
- add edit-target registry/visual selection only
- do not write KV
- do not alter `/`

### Phase 2: data adapter

- read current authoritative catalogue state
- create a single translation layer from current catalogue state into the v2 normalized model
- verify field parity against representative entries
- keep old UI available as fallback

### Phase 3: editor integration

- connect master edit mode to persistence
- support explicit field and structural edits
- verify live read-back without changing unrelated fields

### Phase 4: cutover

- after side-by-side verification, make v2 the root presentation
- retain a rollback path to the legacy frontend for at least one deployment cycle
- remove legacy presentation modules only after successful cutover and verification

## 16. Non-goals for Foundation Phase

Do not:

- migrate KV
- rewrite catalogue data
- alter ranking values
- replace live root page
- remove the legacy editor
- redesign retailer-stock backend
- recreate ecommerce/cart/account functionality
- copy SmokingPipes proprietary CSS or JavaScript wholesale

## 17. Acceptance Criteria for Foundation

The foundation is ready for the data-port phase when:

1. `/ui-v2/` renders independently of legacy presentation modules.
2. The page visually and structurally follows SmokingPipes catalogue conventions.
3. Fixture products render correctly in catalogue, brand and product views.
4. Filters and sort state work and can be represented in the URL.
5. Brand links open brand-scoped views.
6. Product links open structured detail views.
7. Desktop and mobile layouts remain usable.
8. Edit Catalogue can identify registered editable fields/regions without saving.
9. No foundation action reads from or writes to production KV unless explicitly added in Phase 2.
10. Existing production root and existing catalogue data remain untouched.
