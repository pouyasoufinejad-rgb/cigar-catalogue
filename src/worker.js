import baseWorker, { requireAdminWrite, sanitiseKey } from './index.js';

export const PERSONAL_STATUS_KEY = 'catalogue-personal-statuses-v1';
const MAX_PERSONAL_STATUS_BYTES = 256 * 1024;

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normaliseStatusMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [rawKey, rawStatus] of Object.entries(value)) {
    const key = sanitiseKey(rawKey);
    if (!key || !rawStatus || typeof rawStatus !== 'object' || Array.isArray(rawStatus)) continue;
    output[key] = {
      owned: Boolean(rawStatus.owned),
      tried: Boolean(rawStatus.tried),
      want: Boolean(rawStatus.want),
      rebuy: Boolean(rawStatus.rebuy)
    };
  }
  return output;
}

function normalisePersonalStatusState(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    statuses: normaliseStatusMap(raw.statuses)
  };
}

async function readPersonalStatusState(env) {
  if (!env?.CATALOGUE_STATE) return normalisePersonalStatusState();
  const stored = await env.CATALOGUE_STATE.get(PERSONAL_STATUS_KEY, 'json');
  return normalisePersonalStatusState(stored || {});
}

export async function handlePersonalStatuses(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const response = json(await readPersonalStatusState(env));
    return request.method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  }

  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD, PUT' } });
  }

  const denied = await requireAdminWrite(request, env);
  if (denied) return denied;
  if (!env?.CATALOGUE_STATE) {
    return json({ error: 'CATALOGUE_STATE KV binding is unavailable.' }, { status: 503 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_PERSONAL_STATUS_BYTES) {
    return json({ error: 'Personal status state is too large.' }, { status: 413 });
  }

  let parsed;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch (_) {
    return json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const state = {
    version: 1,
    updatedAt: new Date().toISOString(),
    statuses: normaliseStatusMap(parsed?.statuses)
  };
  await env.CATALOGUE_STATE.put(PERSONAL_STATUS_KEY, JSON.stringify(state));
  return json(state);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/personal-statuses') return handlePersonalStatuses(request, env);
    return baseWorker.fetch(request, env);
  },

  async scheduled(controller, env, ctx) {
    return baseWorker.scheduled(controller, env, ctx);
  }
};
