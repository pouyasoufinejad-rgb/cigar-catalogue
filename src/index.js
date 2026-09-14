import legacyWorker, * as legacy from './index-core.js';
import {
  CATALOGUE_STATE_VERSION,
  validateRecommendationSubsectionsShape,
  removeRecommendationEntry
} from '../public/catalogue-structure.mjs';

export * from './index-core.js';

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function readJsonKey(kv, key) {
  try {
    const textValue = await kv.get(key);
    return textValue ? JSON.parse(textValue) : null;
  } catch (_) {
    return null;
  }
}

function explicitRecommendationSubsections(value) {
  return isRecord(value) && own(value, 'recommendationSubsections');
}

export function normaliseState(input) {
  const raw = isRecord(input) ? input : {};
  const base = legacy.normaliseState(raw);
  if (!explicitRecommendationSubsections(raw)) return base;
  return {
    ...base,
    version: CATALOGUE_STATE_VERSION,
    recommendationSubsections: validateRecommendationSubsectionsShape(raw.recommendationSubsections)
  };
}

export function mergeState(existingInput, incomingInput) {
  const existing = normaliseState(existingInput);
  const incoming = isRecord(incomingInput) ? incomingInput : {};
  const base = legacy.mergeState(existing, incoming);
  const incomingExplicit = explicitRecommendationSubsections(incoming);
  const existingExplicit = Array.isArray(existing.recommendationSubsections);
  if (!incomingExplicit && !existingExplicit) return base;

  return {
    ...base,
    version: CATALOGUE_STATE_VERSION,
    recommendationSubsections: validateRecommendationSubsectionsShape(
      incomingExplicit ? incoming.recommendationSubsections : existing.recommendationSubsections
    )
  };
}

export function hasMeaningfulState(value) {
  if (legacy.hasMeaningfulState(value)) return true;
  return Boolean(
    isRecord(value)
    && own(value, 'recommendationSubsections')
    && Array.isArray(value.recommendationSubsections)
  );
}

export async function readRawState(env) {
  if (!env?.CATALOGUE_STATE) return null;
  const current = await readJsonKey(env.CATALOGUE_STATE, legacy.STATE_KEY);
  if (hasMeaningfulState(current)) return current;

  const previous = await readJsonKey(env.CATALOGUE_STATE, legacy.LEGACY_STATE_KEY);
  if (!hasMeaningfulState(previous)) return current;

  const migrated = normaliseState(previous);
  migrated.updatedAt = new Date().toISOString();
  await env.CATALOGUE_STATE.put(legacy.STATE_KEY, JSON.stringify(migrated));
  console.log(`[catalogue-state] migrated ${legacy.LEGACY_STATE_KEY} -> ${legacy.STATE_KEY}`);
  return migrated;
}

export async function readState(env) {
  return normaliseState(await readRawState(env));
}

async function writeState(env, state) {
  await env.CATALOGUE_STATE.put(legacy.STATE_KEY, JSON.stringify(state));
}

export async function handleState(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const response = json(await readState(env));
    return request.method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  }
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT' } });
  }

  const denied = await legacy.requireAdminWrite(request, env);
  if (denied) return denied;
  if (!env?.CATALOGUE_STATE) {
    return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > legacy.MAX_STATE_BYTES) {
    return json({ error: 'Catalogue state is too large.' }, { status: 413 });
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (_) {
    return json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const existing = await readRawState(env);
  let merged;
  try {
    merged = mergeState(existing, parsed);
  } catch (error) {
    return json({ error: String(error?.message || error) }, { status: 400 });
  }

  await writeState(env, merged);
  return json({
    ok: true,
    version: merged.version,
    cards: Object.keys(merged.cards).length,
    sections: Object.keys(merged.sections).length,
    entries: Object.keys(merged.entries).length,
    updatedAt: merged.updatedAt
  });
}

export async function handleEntry(request, env, rawKey) {
  const key = legacy.sanitiseKey(decodeURIComponent(String(rawKey || '')));
  if (!key) return json({ error: 'Invalid entry key.' }, { status: 400 });

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!env?.CATALOGUE_STATE) {
      return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
    }
    const state = await readState(env);
    const entry = state.entries[key];
    if (!entry) return json({ error: 'Entry not found.' }, { status: 404 });
    const response = json(entry);
    return request.method === 'HEAD'
      ? new Response(null, { status: 200, headers: response.headers })
      : response;
  }

  if (request.method !== 'PUT' && request.method !== 'DELETE') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT, DELETE' } });
  }

  const denied = await legacy.requireAdminWrite(request, env);
  if (denied) return denied;
  if (!env?.CATALOGUE_STATE) {
    return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  }

  const state = await readState(env);
  if (request.method === 'PUT') {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 256 * 1024) {
      return json({ error: 'Entry payload is too large.' }, { status: 413 });
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      return json({ error: 'Invalid JSON.' }, { status: 400 });
    }
    const entry = legacy.normaliseEntry(parsed, key);
    if (!entry.brand || !entry.title) {
      return json({ error: 'Brand and title are required.' }, { status: 400 });
    }
    state.entries[key] = entry;
    state.version = Array.isArray(state.recommendationSubsections) ? CATALOGUE_STATE_VERSION : 3;
    state.updatedAt = new Date().toISOString();
    await writeState(env, state);
    return json({ ok: true, entry });
  }

  if (!state.entries[key]) return json({ error: 'Entry not found.' }, { status: 404 });
  delete state.entries[key];
  delete state.cards[key];
  if (Array.isArray(state.recommendationSubsections)) {
    state.recommendationSubsections = removeRecommendationEntry(state.recommendationSubsections, key);
  }
  state.version = Array.isArray(state.recommendationSubsections) ? CATALOGUE_STATE_VERSION : 3;
  state.updatedAt = new Date().toISOString();
  await writeState(env, state);
  await Promise.all([
    env.CATALOGUE_STATE.delete(`${legacy.IMAGE_PREFIX}${key}`),
    env.CATALOGUE_STATE.delete(`${legacy.IMAGE_META_PREFIX}${key}`)
  ]);
  return json({ ok: true, key });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/catalogue-overrides') return handleState(request, env);
    const entryMatch = url.pathname.match(/^\/api\/catalogue-entry\/([^/]+)$/);
    if (entryMatch) return handleEntry(request, env, entryMatch[1]);
    return legacyWorker.fetch(request, env);
  },

  async scheduled(controller, env, ctx) {
    return legacyWorker.scheduled(controller, env, ctx);
  }
};
