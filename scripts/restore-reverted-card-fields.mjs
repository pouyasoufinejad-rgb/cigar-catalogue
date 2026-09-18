#!/usr/bin/env node
// Restores catalogue fields that were reverted to the static seed baseline by the
// sidebar partial-write regression, using the git request ledger as the source of truth.
//
// Safety rule: a field is only restored when the live value still matches the static
// seed baseline AND the request ledger declares a different value. A live value that
// differs from both is treated as a deliberate later edit and is never touched.
//
// Default mode is a read-only dry run. Pass --apply to write.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import { parseCatalogueSeed } from './cleanup-live-card-copy.mjs';

// Production/Practical lines are owned by the house normaliser and are repaired by
// scripts/repair-pre-sidebar-live-state.mjs. Ranking and placement are cohort-managed.
// Neither belongs here.
export const RESTORABLE_FIELDS = Object.freeze([
  'eyebrow', 'summaryHtml', 'noteHtml', 'experienceTags', 'smokeTime',
  'strength', 'quality', 'country', 'length', 'ring',
  'packageLabel', 'packagePrice', 'price', 'retailerLinks'
]);

// public/index.html was re-baked on 2026-09-15, so its seed is a snapshot of that
// day's state rather than an old baseline. For these fields the Sep 15 text is
// genuinely newer than the request ledger: it reflects availability and pricing that
// changed after the request was published, so replaying the request would regress it.
export const NEWER_THAN_LEDGER = Object.freeze({
  'isla-del-sol-maduro-coronets': ['noteHtml'],
  'isla-del-sol-maduro-gran-corona': ['noteHtml']
});

const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const json = v => JSON.stringify(v);

function normaliseText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/^\s*No\.\s*\d+\s*[—–-]\s*/i, '')
    .replace(/^\s*Best\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sameValue(a, b) {
  if (json(a) === json(b)) return true;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => normaliseText(item) === normaliseText(b[index]));
  }
  if (a === undefined || b === undefined) return false;
  return normaliseText(a) === normaliseText(b);
}

function git(args, repoRoot) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export async function loadLedger(repoRoot) {
  const names = git(['ls-tree', '-r', '--name-only', 'HEAD', 'catalogue-requests'], repoRoot)
    .split(/\r?\n/).filter(path => path.endsWith('.json'));
  const rows = [];
  for (const path of names) {
    let epoch = 0;
    try { epoch = Number(git(['log', '-1', '--format=%ct', 'HEAD', '--', path], repoRoot).trim()) || 0; } catch (_) {}
    let request = null;
    try { request = JSON.parse(await readFile(resolve(repoRoot, path), 'utf8')); } catch (_) { continue; }
    rows.push({ path, epoch, request });
  }
  rows.sort((a, b) => a.epoch - b.epoch || a.path.localeCompare(b.path));

  const ledger = new Map();
  const provenance = new Map();
  for (const { request, path } of rows) {
    if (!isRecord(request) || request.operation !== 'upsert-entry' || !isRecord(request.entry)) continue;
    const key = String(request.key || '').trim();
    if (!key) continue;
    ledger.set(key, { ...(ledger.get(key) || {}), ...clone(request.entry) });
    const sources = provenance.get(key) || {};
    for (const field of Object.keys(request.entry)) sources[field] = path;
    provenance.set(key, sources);
  }
  return { ledger, provenance };
}

export function planRestore({ live, seed, ledger, provenance = new Map() }) {
  const liveCards = isRecord(live.cards) ? live.cards : {};
  const liveEntries = isRecord(live.entries) ? live.entries : {};
  const seedCards = isRecord(seed.cards) ? seed.cards : {};

  const restores = [];
  const manualDivergences = [];

  for (const key of [...ledger.keys()].sort()) {
    const intent = ledger.get(key);
    const card = isRecord(liveCards[key]) ? liveCards[key] : null;
    const entry = isRecord(liveEntries[key]) ? liveEntries[key] : null;
    if (!card && !entry) continue;
    const seedCard = isRecord(seedCards[key]) ? seedCards[key] : {};

    for (const field of RESTORABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(intent, field)) continue;
      if ((NEWER_THAN_LEDGER[key] || []).includes(field)) continue;
      const target = intent[field];
      const liveValue = entry && Object.prototype.hasOwnProperty.call(entry, field)
        ? entry[field]
        : card?.[field];

      if (sameValue(liveValue, target)) continue;

      const seedValue = seedCard[field];
      const seedDeclares = Object.prototype.hasOwnProperty.call(seedCard, field);
      const hasOverride = liveValue !== undefined;
      // A card with no override renders the seed value, so a missing override is the
      // same reverted-to-baseline condition as an override that equals the seed.
      const effectiveLive = hasOverride ? liveValue : (seedDeclares ? seedValue : undefined);
      const liveMatchesSeed = seedDeclares
        ? sameValue(effectiveLive, seedValue)
        : effectiveLive === undefined || effectiveLive === '';

      const row = {
        key, field,
        live: liveValue,
        target,
        seed: seedDeclares ? seedValue : undefined,
        source: provenance.get(key)?.[field] || null
      };
      if (!liveMatchesSeed) { manualDivergences.push(row); continue; }

      const clearsContent = (target === '' || target === null)
        && typeof effectiveLive === 'string' && effectiveLive.trim() !== '';
      if (field === 'price' || field === 'packagePrice') row.category = 'price';
      else if (clearsContent) row.category = 'clears';
      else row.category = 'content';
      restores.push(row);
    }
  }
  return { restores, manualDivergences };
}

export function applyRestores(live, restores) {
  const next = clone(live);
  next.cards = isRecord(next.cards) ? next.cards : {};
  next.entries = isRecord(next.entries) ? next.entries : {};
  for (const { key, field, target } of restores) {
    if (isRecord(next.entries[key])) next.entries[key][field] = clone(target);
    if (isRecord(next.cards[key])) next.cards[key][field] = clone(target);
  }
  return next;
}

async function fetchLive(baseUrl, tag) {
  const response = await fetch(`${baseUrl}/api/catalogue-overrides?${tag}=${Date.now()}`, {
    headers: { accept: 'application/json' }, cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Live read failed with HTTP ${response.status}.`);
  return response.json();
}

function preview(value) {
  const text = typeof value === 'string' ? value : json(value);
  return String(text ?? 'undefined').slice(0, 140);
}

export async function run(options = {}) {
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const apply = options.apply ?? process.argv.includes('--apply');

  const live = await fetchLive(baseUrl, 'restore_read');
  const seed = parseCatalogueSeed(await readFile(resolve(repoRoot, 'public/index.html'), 'utf8'));
  const { ledger, provenance } = await loadLedger(repoRoot);
  const { restores: allRestores, manualDivergences } = planRestore({ live, seed, ledger, provenance });

  const includePrices = options.includePrices ?? process.env.RESTORE_INCLUDE_PRICES === '1';
  const includeClears = options.includeClears ?? process.env.RESTORE_INCLUDE_CLEARS === '1';
  const enabled = new Set(['content', ...(includePrices ? ['price'] : []), ...(includeClears ? ['clears'] : [])]);
  const restores = allRestores.filter(row => enabled.has(row.category));
  const held = allRestores.filter(row => !enabled.has(row.category));

  const byCategory = {};
  for (const row of allRestores) byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  console.log(`RESTORE_PLAN ${json({
    selected: restores.length,
    heldBack: held.length,
    byCategory,
    manualDivergences: manualDivergences.length,
    keys: [...new Set(restores.map(r => r.key))].length
  })}`);

  console.log('=== SELECTED FOR RESTORE (live renders the stale seed value; ledger has a newer one) ===');
  for (const row of restores) {
    console.log(`  RESTORE ${row.key}.${row.field}  [${row.source}]`);
    console.log(`     now  : ${preview(row.live === undefined ? '(no override, renders seed)' : row.live)}`);
    console.log(`     after: ${preview(row.target)}`);
  }

  console.log('=== HELD BACK (needs an explicit opt-in) ===');
  for (const row of held) console.log(`  HOLD[${row.category}] ${row.key}.${row.field} now=${preview(row.live)} would=${preview(row.target)}`);

  console.log('=== LEFT ALONE (differs from both seed and ledger, treated as a later deliberate edit) ===');
  for (const row of manualDivergences) console.log(`  SKIP ${row.key}.${row.field}`);

  if (!apply) {
    console.log('RESTORE_DRY_RUN_COMPLETE_NO_WRITES');
    return { restores, manualDivergences, applied: false };
  }
  if (!restores.length) {
    console.log('RESTORE_NOTHING_TO_APPLY');
    return { restores, manualDivergences, applied: false };
  }

  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required to apply.');

  const next = applyRestores(live, restores);
  const response = await fetch(`${baseUrl}/api/catalogue-overrides`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: json({ version: next.version ?? 3, cards: next.cards, entries: next.entries, sections: next.sections })
  });
  if (!response.ok) throw new Error(`Write failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);

  const verified = await fetchLive(baseUrl, 'restore_verify');
  const failures = [];
  for (const { key, field, target } of restores) {
    const actual = isRecord(verified.entries?.[key]) && Object.prototype.hasOwnProperty.call(verified.entries[key], field)
      ? verified.entries[key][field]
      : verified.cards?.[key]?.[field];
    if (!sameValue(actual, target)) failures.push(`${key}.${field}`);
  }
  if (failures.length) throw new Error(`Verification failed for: ${failures.join(', ')}`);

  console.log(`RESTORE_APPLIED_AND_VERIFIED ${restores.length} field writes across ${[...new Set(restores.map(r => r.key))].length} keys.`);
  return { restores, manualDivergences, applied: true };
}

const invoked = process.argv[1] && resolve(process.argv[1]).endsWith('restore-reverted-card-fields.mjs');
if (invoked) {
  run().catch(error => {
    console.error(`Restore failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
