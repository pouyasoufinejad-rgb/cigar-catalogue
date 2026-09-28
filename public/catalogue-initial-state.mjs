// Page-startup reads only. Editors, reloads and save verification must fetch fresh state.
function freshServerSeed(source = globalThis) {
  const seed = source?.CATALOGUE_OVERRIDE_SEED;
  if (source?.CATALOGUE_OVERRIDE_SEED_FRESH !== true) return null;
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) return null;
  return seed;
}

export function createInitialCatalogueStateLoader(seedSource = globalThis) {
  let initialRead;
  return async function load(fetchImpl = globalThis.fetch) {
    if (!initialRead) {
      initialRead = Promise.resolve().then(async () => {
        const seeded = freshServerSeed(seedSource);
        if (seeded) return structuredClone(seeded);
        const response = await fetchImpl('/api/catalogue-overrides', {
          cache: 'no-store', headers: { accept: 'application/json' }
        });
        if (!response?.ok) throw new Error(`Could not load catalogue state (HTTP ${response?.status}).`);
        return response.json();
      }).catch(error => {
        initialRead = undefined;
        throw error;
      });
    }
    // Features reconcile their own state; never let one mutate another's startup data.
    return structuredClone(await initialRead);
  };
}

export const loadInitialCatalogueState = createInitialCatalogueStateLoader();
