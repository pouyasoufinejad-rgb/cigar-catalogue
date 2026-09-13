const STORAGE_KEY = 'cigar-catalogue-convenience-v1';
const PERSONAL_STATUS_API = '/api/personal-statuses';
const ADMIN_TOKEN_SESSION_KEY = 'cigar-catalogue-admin-token';
const STATUS_NAMES = ['owned', 'tried', 'want', 'rebuy'];
let adminTokenMemory = '';
let persistTimer = 0;

function cleanKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function normaliseStatuses(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [rawKey, rawStatus] of Object.entries(value)) {
    const key = cleanKey(rawKey);
    if (!key || !rawStatus || typeof rawStatus !== 'object' || Array.isArray(rawStatus)) continue;
    output[key] = Object.fromEntries(STATUS_NAMES.map(name => [name, Boolean(rawStatus[name])]));
  }
  return output;
}

function readLocalState(storage = globalThis?.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeLocalState(state, storage = globalThis?.localStorage) {
  try { storage?.setItem?.(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

export function mergeRemoteStatuses(localState, remoteStatuses) {
  const local = localState && typeof localState === 'object' && !Array.isArray(localState) ? localState : {};
  return {
    ...local,
    statuses: {
      ...normaliseStatuses(local.statuses),
      ...normaliseStatuses(remoteStatuses)
    }
  };
}

function readAdminToken() {
  if (adminTokenMemory) return adminTokenMemory;
  try { adminTokenMemory = sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY) || ''; }
  catch (_) { adminTokenMemory = ''; }
  return adminTokenMemory;
}

function requireAdminToken() {
  const existing = readAdminToken();
  if (existing) return existing;
  const token = String(globalThis.prompt?.('Admin token required to save personal cigar statuses permanently.') || '').trim();
  if (!token) throw new Error('Admin token is required for permanent personal-status saves.');
  adminTokenMemory = token;
  try { sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token); } catch (_) {}
  return token;
}

export async function loadPersonalStatuses(storage = globalThis?.localStorage, fetchImpl = globalThis?.fetch) {
  if (typeof fetchImpl !== 'function') return readLocalState(storage);
  try {
    const response = await fetchImpl(PERSONAL_STATUS_API, { cache:'no-store', headers:{ accept:'application/json' } });
    if (!response.ok) throw new Error(`Personal status load failed (${response.status})`);
    const payload = await response.json();
    const merged = mergeRemoteStatuses(readLocalState(storage), payload?.statuses);
    writeLocalState(merged, storage);
    return merged;
  } catch (_) {
    return readLocalState(storage);
  }
}

export async function persistPersonalStatuses(storage = globalThis?.localStorage, fetchImpl = globalThis?.fetch) {
  if (typeof fetchImpl !== 'function') return false;
  const token = requireAdminToken();
  const state = readLocalState(storage);
  const response = await fetchImpl(PERSONAL_STATUS_API, {
    method:'PUT',
    headers:{
      'content-type':'application/json',
      authorization:`Bearer ${token}`
    },
    body:JSON.stringify({ statuses:normaliseStatuses(state.statuses) })
  });
  if (response.status === 401) {
    adminTokenMemory = '';
    try { sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY); } catch (_) {}
  }
  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    throw new Error(payload.error || `Personal status save failed (${response.status})`);
  }
  return true;
}

function schedulePersonalStatusSave() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      await persistPersonalStatuses();
    } catch (error) {
      console.error('[catalogue] personal status sync failed', error);
      globalThis.alert?.(`Personal status was kept on this browser but could not be saved permanently. ${error.message || error}`);
    }
  }, 0);
}

function installPersonalStatusPersistence() {
  document.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-personal-status]')) return;
    schedulePersonalStatusSave();
  });
}

if (typeof document !== 'undefined') {
  await loadPersonalStatuses();
  installPersonalStatusPersistence();
}

export { STORAGE_KEY, PERSONAL_STATUS_API, ADMIN_TOKEN_SESSION_KEY };
