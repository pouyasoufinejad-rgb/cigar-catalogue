const STATE_API_PATH = '/api/catalogue-overrides';

function registrationName(value) {
  return String(value || '').trim();
}

function requestDetails(input, init = {}, target = globalThis) {
  const raw = typeof input === 'string' ? input : input?.url || '';
  if (!raw) return null;
  const base = target?.location?.href || globalThis?.location?.href || 'https://catalogue.local/';
  try {
    const url = new URL(raw, base);
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    return { url, method };
  } catch (_) {
    return null;
  }
}

export function createCatalogueStatePipeline() {
  const transforms = new Map();
  const listeners = new Map();
  const installedTargets = new WeakMap();

  function registerTransform(nameInput, priorityInput, transform) {
    const name = registrationName(nameInput);
    if (!name || typeof transform !== 'function') return false;
    const priority = Number(priorityInput);
    transforms.set(name, {
      name,
      priority: Number.isFinite(priority) ? priority : 100,
      transform
    });
    return true;
  }

  function registerResponseListener(nameInput, listener) {
    const name = registrationName(nameInput);
    if (!name || typeof listener !== 'function') return false;
    listeners.set(name, listener);
    return true;
  }

  async function applyTransforms(payload, context = {}) {
    let next = payload;
    const ordered = [...transforms.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    for (const registration of ordered) {
      const transformed = await registration.transform(next, context);
      if (transformed !== undefined) next = transformed;
    }
    return next;
  }

  function notifyListeners(event) {
    for (const listener of listeners.values()) {
      try {
        const result = listener(event);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (_) {}
    }
  }

  function install(target = globalThis) {
    if (!target || typeof target.fetch !== 'function') return false;
    if (installedTargets.has(target)) return true;

    const originalFetch = target.fetch.bind(target);
    async function wrappedFetch(input, init = {}) {
      const details = requestDetails(input, init, target);
      if (!details || details.url.pathname !== STATE_API_PATH) return originalFetch(input, init);

      let nextInit = init;
      let finalState = null;
      if (details.method === 'PUT' && typeof init?.body === 'string') {
        try {
          const parsed = JSON.parse(init.body);
          finalState = await applyTransforms(parsed, {
            input,
            init,
            method: details.method,
            url: details.url
          });
          nextInit = { ...init, body: JSON.stringify(finalState) };
        } catch (_) {
          finalState = null;
        }
      }

      const response = await originalFetch(input, nextInit);
      if (!response?.ok) return response;

      if ((details.method === 'GET' || details.method === 'HEAD') && typeof response.clone === 'function') {
        response.clone().json().then(state => {
          if (state && typeof state === 'object') {
            notifyListeners({
              method: details.method,
              url: details.url,
              state,
              response
            });
          }
        }).catch(() => {});
      } else if (details.method === 'PUT' && finalState && typeof finalState === 'object') {
        notifyListeners({
          method: details.method,
          url: details.url,
          state: finalState,
          response
        });
      }
      return response;
    }

    wrappedFetch.__catalogueStatePipeline = true;
    wrappedFetch.__catalogueStatePipelineOriginal = originalFetch;
    target.fetch = wrappedFetch;
    installedTargets.set(target, { originalFetch, wrappedFetch });
    return true;
  }

  return {
    registerTransform,
    registerResponseListener,
    applyTransforms,
    install
  };
}

const sharedPipeline = createCatalogueStatePipeline();

export function registerCatalogueStateTransform(name, priority, transform) {
  const registered = sharedPipeline.registerTransform(name, priority, transform);
  if (registered) sharedPipeline.install(globalThis);
  return registered;
}

export function registerCatalogueStateResponseListener(name, listener) {
  const registered = sharedPipeline.registerResponseListener(name, listener);
  if (registered) sharedPipeline.install(globalThis);
  return registered;
}

export function installCatalogueSavePipeline(target = globalThis) {
  return sharedPipeline.install(target);
}
