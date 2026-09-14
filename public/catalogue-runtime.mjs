const ASSET_VERSION = '20260914-v4';
const versioned = path => `${path}?v=${ASSET_VERSION}`;

if (typeof document !== 'undefined') {
  await import(versioned('./catalogue-personal-status-persistence.mjs'));
  import(versioned('./catalogue-direct-edit.mjs'));
  import(versioned('./catalogue-direct-persistence.mjs'));
  import(versioned('./catalogue-flavour.mjs'));
  import(versioned('./catalogue-card-layout.mjs'));
  import(versioned('./catalogue-legacy-copy.mjs'));
  import(versioned('./catalogue-size-presentation.mjs'));
  import(versioned('./catalogue-presentation.mjs'));
  import(versioned('./catalogue-recommendation-subsections.mjs'));
  import(versioned('./catalogue-half-cohort.mjs'));
  import(versioned('./catalogue-structure-editor.mjs'));
  import(versioned('./catalogue-editor-behaviour.mjs'));
  import(versioned('./catalogue-convenience.mjs'));
  import(versioned('./catalogue-retailer-price-fallbacks.mjs'));
  import(versioned('./catalogue-convenience-refinements.mjs'));
}
