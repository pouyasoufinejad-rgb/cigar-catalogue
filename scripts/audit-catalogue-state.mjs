#!/usr/bin/env node
// Read-only. Compares current live catalogue state against the git-reconstructible
// pre-sidebar baseline and reports divergence. Never writes.
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import { parseCatalogueSeed } from './cleanup-live-card-copy.mjs';

export const PRE_SIDEBAR_COMMIT = '8ba8f65754b37d5973331e55be0e9e9d5d306cf5';

const SIDEBAR_ONLY_SECTION_KEYS = ['brandLogos', 'hiddenBrands', 'brandLines'];
const CONTENT_FIELDS = [
  'brand', 'title', 'eyebrow', 'price', 'packagePrice', 'packageLabel', 'length', 'ring', 'country',
  'strength', 'quality', 'flavour', 'size', 'risk', 'smokeTime', 'summaryHtml', 'noteHtml',
  'productionLines', 'practicalLines', 'retailerLinks', 'imageUrl', 'rank', 'archived', 'taster', 'catalogueType'
];

const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const json = v => JSON.stringify(v);

function git(args, repoRoot) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function ensureCommit(repoRoot) {
  try {
    git(['cat-file', '-e', `${PRE_SIDEBAR_COMMIT}^{commit}`], repoRoot);
    return;
  } catch (_) {}
  try {
    if (git(['rev-parse', '--is-shallow-repository'], repoRoot).trim() === 'true') {
      git(['fetch', '--unshallow', 'origin'], repoRoot);
    } else {
      git(['fetch', 'origin', PRE_SIDEBAR_COMMIT], repoRoot);
    }
  } catch (_) {}
  git(['cat-file', '-e', `${PRE_SIDEBAR_COMMIT}^{commit}`], repoRoot);
}

async function loadTargetRequests(repoRoot) {
  ensureCommit(repoRoot);
  const names = git(['ls-tree', '-r', '--name-only', PRE_SIDEBAR_COMMIT, 'catalogue-requests'], repoRoot)
    .split(/\r?\n/).filter(path => path.endsWith('.json'));
  const rows = [];
  for (const path of names) {
    let epoch = 0;
    try { epoch = Number(git(['log', '-1', '--format=%ct', PRE_SIDEBAR_COMMIT, '--', path], repoRoot).trim()) || 0; } catch (_) {}
    let request = null;
    try { request = JSON.parse(git(['show', `${PRE_SIDEBAR_COMMIT}:${path}`], repoRoot)); } catch (_) { continue; }
    rows.push({ path, epoch, request });
  }
  rows.sort((a, b) => a.epoch - b.epoch || a.path.localeCompare(b.path));
  return rows;
}

export function replayLedger(rows = []) {
  const entries = new Map();
  for (const { request } of rows) {
    if (!isRecord(request)) continue;
    const key = String(request.key || '').trim();
    const operation = String(request.operation || '').trim();
    if (!key) continue;
    const current = entries.get(key) || {};
    if (operation === 'upsert-entry' && isRecord(request.entry)) {
      entries.set(key, { ...current, ...JSON.parse(json(request.entry)) });
    } else if (operation === 'archive-entry') {
      entries.set(key, { ...current, archived: true });
    } else if (operation === 'unarchive-entry') {
      entries.set(key, { ...current, archived: false });
    }
  }
  return entries;
}

function diffFields(live = {}, target = {}) {
  const differing = [];
  for (const field of CONTENT_FIELDS) {
    const hasTarget = Object.prototype.hasOwnProperty.call(target, field);
    if (!hasTarget) continue;
    if (json(live?.[field]) !== json(target[field])) differing.push(field);
  }
  return differing;
}

async function fetchLive(baseUrl) {
  const response = await fetch(`${baseUrl}/api/catalogue-overrides?audit=${Date.now()}`, {
    headers: { accept: 'application/json' }, cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Live read failed with HTTP ${response.status}.`);
  return response.json();
}

function reportSubsections(live) {
  const sections = isRecord(live.sections) ? live.sections : {};
  const list = Array.isArray(sections.recommendationSubsections) ? sections.recommendationSubsections : [];
  console.log(`SUBSECTIONS count=${list.length}`);
  for (const section of list) {
    const keys = Array.isArray(section?.entryKeys) ? section.entryKeys : [];
    console.log(`  SUBSECTION id=${section?.id} title=${json(section?.title || '')} members=${keys.length}`);
    console.log(`    ORDER ${json(keys)}`);
  }
  const pollution = SIDEBAR_ONLY_SECTION_KEYS.filter(key => sections[key] !== undefined);
  console.log(`SIDEBAR_ONLY_SECTION_KEYS_PRESENT ${json(pollution)}`);
  console.log(`OTHER_SECTION_KEYS ${json(Object.keys(sections).filter(k => k !== 'recommendationSubsections'))}`);
}

function inspectKeys(live, seedCards, ledger, keys) {
  const liveCards = isRecord(live.cards) ? live.cards : {};
  const liveEntries = isRecord(live.entries) ? live.entries : {};
  console.log('=== KEY INSPECTION ===');
  for (const key of keys) {
    console.log(`--- ${key} ---`);
    const seedCard = seedCards[key];
    console.log(`  SEED_PRESENT ${Boolean(seedCard)}`);
    if (seedCard) {
      const picked = {};
      for (const field of ['title', 'brand', 'length', 'ring', 'price', 'packagePrice', 'retailerLinks', 'imageUrl']) {
        if (seedCard[field] !== undefined) picked[field] = seedCard[field];
      }
      console.log(`  SEED ${json(picked)}`);
    }
    console.log(`  LIVE_CARD ${json(liveCards[key] ?? null)}`.slice(0, 2400));
    console.log(`  LIVE_ENTRY ${json(liveEntries[key] ?? null)}`.slice(0, 2400));
    console.log(`  LEDGER_INTENT ${json(ledger.get(key) ?? null)}`.slice(0, 2400));
  }
}

export async function runAudit(options = {}) {
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const inspectArg = (options.keys ?? process.env.AUDIT_KEYS ?? '').trim();
  const keysToInspect = inspectArg ? inspectArg.split(',').map(k => k.trim()).filter(Boolean) : [];

  const live = await fetchLive(baseUrl);
  const liveCards = isRecord(live.cards) ? live.cards : {};
  const liveEntries = isRecord(live.entries) ? live.entries : {};

  const seed = parseCatalogueSeed(await readFile(resolve(repoRoot, 'public/index.html'), 'utf8'));
  const seedCards = isRecord(seed.cards) ? seed.cards : {};
  const rows = await loadTargetRequests(repoRoot);
  const ledger = replayLedger(rows);

  if (keysToInspect.length) {
    inspectKeys(live, seedCards, ledger, keysToInspect);
    console.log('AUDIT_COMPLETE_READ_ONLY');
    return { live, ledger, inspected: keysToInspect };
  }

  console.log('=== LIVE STATE ===');
  console.log(`LIVE_COUNTS ${json({
    version: live.version,
    updatedAt: live.updatedAt,
    cards: Object.keys(liveCards).length,
    entries: Object.keys(liveEntries).length,
    sections: Object.keys(isRecord(live.sections) ? live.sections : {}).length
  })}`);
  reportSubsections(live);

  const archivedLive = Object.entries(liveEntries).filter(([, e]) => e?.archived).map(([k]) => k).sort();
  console.log(`LIVE_ARCHIVED_ENTRIES count=${archivedLive.length} ${json(archivedLive)}`);
  const noImage = Object.entries(liveEntries).filter(([, e]) => !e?.imageUrl).map(([k]) => k).sort();
  console.log(`LIVE_ENTRIES_WITHOUT_IMAGE count=${noImage.length} ${json(noImage)}`);

  console.log('=== GIT-RECONSTRUCTIBLE PRE-SIDEBAR BASELINE ===');
  console.log(`TARGET_COMMIT ${PRE_SIDEBAR_COMMIT}`);
  console.log(`TARGET_SOURCES ${json({ requestFiles: rows.length, ledgerKeys: ledger.size, seedCards: Object.keys(seedCards).length })}`);

  const missingFromLive = [...ledger.keys()].filter(key => !liveEntries[key] && !liveCards[key]).sort();
  const liveOnlyEntries = Object.keys(liveEntries).filter(key => !ledger.has(key)).sort();
  console.log(`KEYS_IN_BASELINE_MISSING_FROM_LIVE count=${missingFromLive.length} ${json(missingFromLive)}`);
  console.log(`LIVE_ENTRIES_NOT_IN_BASELINE count=${liveOnlyEntries.length} ${json(liveOnlyEntries)}`);

  console.log('=== CONTENT DIVERGENCE (live vs baseline, baseline-declared fields only) ===');
  const fieldCounts = {};
  let divergentKeys = 0;
  for (const key of [...ledger.keys()].sort()) {
    const target = ledger.get(key);
    const liveRecord = { ...(seedCards[key] || {}), ...(liveCards[key] || {}), ...(liveEntries[key] || {}) };
    const differing = diffFields(liveRecord, target);
    if (!differing.length) continue;
    divergentKeys += 1;
    for (const field of differing) fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    if (divergentKeys <= 40) console.log(`  DIFF ${key} -> ${json(differing)}`);
  }
  console.log(`DIVERGENT_KEYS ${divergentKeys} of ${ledger.size}`);
  console.log(`DIVERGENT_FIELD_COUNTS ${json(fieldCounts)}`);
  console.log('AUDIT_COMPLETE_READ_ONLY');
  return { live, ledger, divergentKeys, fieldCounts };
}

const invoked = process.argv[1] && resolve(process.argv[1]).endsWith('audit-catalogue-state.mjs');
if (invoked) {
  runAudit().catch(error => {
    console.error(`Audit failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
