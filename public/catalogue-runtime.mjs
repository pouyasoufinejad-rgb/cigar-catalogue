if (typeof document !== 'undefined') {
  await import('./catalogue-personal-status-persistence.mjs');
  import('./catalogue-direct-persistence.mjs');
  import('./catalogue-flavour.mjs');
  import('./catalogue-card-layout.mjs');
  import('./catalogue-legacy-copy.mjs');
  import('./catalogue-size-presentation.mjs');
  import('./catalogue-presentation.mjs');
  await import('./catalogue-convenience.mjs?v=20260914-v10');
  await import('./catalogue-recommendation-subsections.mjs?v=20260914-v10');
  import('./catalogue-half-cohort.mjs');
  import('./catalogue-structure-editor.mjs?v=20260914-v10');
  import('./catalogue-editor-behaviour.mjs');
  import('./catalogue-editor-fullscreen.mjs?v=20260914-v10');
  import('./catalogue-retailer-price-fallbacks.mjs');
  import('./catalogue-convenience-refinements.mjs');
}
