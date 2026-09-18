#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import { parseCatalogueSeed } from './cleanup-live-card-copy.mjs';
import {
  buildStructureContext,
  normaliseProductionLines,
  normalisePracticalLines
} from './normalise-live-card-structure.mjs';

export const PRE_SIDEBAR_TARGET = '8ba8f65754b37d5973331e55be0e9e9d5d306cf5';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function stringList(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function linesToMarkup(lines) {
  return stringList(lines)
    .map(line => `<span class="artmeta-line">${String(line)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</span>`)
    .join('');
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function git(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  }).trim();
}

async function listRequestFiles(repoRoot) {
  const dir = resolve(repoRoot, 'catalogue-requests');
  const names = (await readdir(dir)).filter(name => name.endsWith('.json'));
  const rows = [];
  for (const name of names) {
    const path = `catalogue-requests/${name}`;
    let epoch = 0;
    try {
      epoch = Number(git(repoRoot, ['log', '-1', '--format=%ct', PRE_SIDEBAR_TARGET, '--', path])) || 0;
    } catch (_) {}
    rows.push({ path, epoch });
  }
  rows.sort((a, b) => a.epoch - b.epoch || a.path.localeCompare(b.path));
  return rows;
}

export function replayRequestDocuments(documents = []) {
  const ledger = new Map();
  for (const item of documents) {
    const request = isRecord(item?.request) ? item.request : item;
    if (!isRecord(request)) continue;
    const operation = String(request.operation || '').trim();
    const key = String(request.key || '').trim();
    if (!key) continue;
    const current = ledger.get(key) || {};
    if (operation === 'upsert-entry' && isRecord(request.entry)) {
      ledger.set(key, { ...current, ...clone(request.entry) });
      continue;
    }
    if (operation === 'archive-entry') {
      ledger.set(key, { ...current, archived:true });
      continue;
    }
    if (operation === 'unarchive-entry') {
      ledger.set(key, { ...current, archived:false });
    }
  }
  return ledger;
}

export async function loadPreSidebarRequestLedger(repoRoot = process.cwd()) {
  const files = await listRequestFiles(repoRoot);
  const documents = [];
  for (const row of files) {
    let body = '';
    try {
      body = git(repoRoot, ['show', `${PRE_SIDEBAR_TARGET}:${row.path}`]);
    } catch (_) {
      body = await readFile(resolve(repoRoot, row.path), 'utf8');
    }
    let request;
    try { request = JSON.parse(body); }
    catch { continue; }
    documents.push({ ...row, request });
  }
  return replayRequestDocuments(documents);
}

function pickStructureSource(currentCard, currentEntry, baseCard, intent, kind) {
  const linesKey = `${kind}Lines`;
  const htmlKey = `${kind}Html`;
  if (Array.isArray(intent?.[linesKey]) && intent[linesKey].length) {
    return { lines:clone(intent[linesKey]), html:'' };
  }
  if (Array.isArray(currentEntry?.[linesKey]) && currentEntry[linesKey].length) {
    return { lines:clone(currentEntry[linesKey]), html:'' };
  }
  if (Array.isArray(currentCard?.[linesKey]) && currentCard[linesKey].length) {
    return { lines:clone(currentCard[linesKey]), html:'' };
  }
  if (typeof currentCard?.[htmlKey] === 'string' && currentCard[htmlKey].trim()) {
    return { lines:[], html:currentCard[htmlKey] };
  }
  if (Array.isArray(baseCard?.[linesKey]) && baseCard[linesKey].length) {
    return { lines:clone(baseCard[linesKey]), html:'' };
  }
  if (typeof baseCard?.[htmlKey] === 'string' && baseCard[htmlKey].trim()) {
    return { lines:[], html:baseCard[htmlKey] };
  }
  return { lines:[], html:'' };
}

function chooseRetailerLinks(currentCard, currentEntry, baseCard, intent) {
  if (own(intent, 'retailerLinks')) return stringList(intent.retailerLinks);
  if (Array.isArray(currentEntry?.retailerLinks) && currentEntry.retailerLinks.length) return stringList(currentEntry.retailerLinks);
  if (Array.isArray(currentCard?.retailerLinks) && currentCard.retailerLinks.length) return stringList(currentCard.retailerLinks);
  if (Array.isArray(baseCard?.retailerLinks) && baseCard.retailerLinks.length) return stringList(baseCard.retailerLinks);
  return [];
}

function effectiveRecord(key, currentCard, currentEntry, baseCard, intent, productionSource, practicalSource) {
  const record = {
    ...(isRecord(baseCard) ? baseCard : {}),
    ...(isRecord(currentEntry) ? currentEntry : {}),
    ...(isRecord(currentCard) ? currentCard : {}),
    ...(isRecord(intent) ? intent : {}),
    key
  };
  record.productionLines = productionSource.lines;
  record.productionHtml = productionSource.html;
  record.practicalLines = practicalSource.lines;
  record.practicalHtml = practicalSource.html;
  return record;
}

function fieldChange(changes, key, field, before, after) {
  if (jsonEqual(before, after)) return;
  changes.push({ key, field, before:clone(before), after:clone(after) });
}

export function buildPreSidebarRepair(currentInput, seedInput, ledgerInput) {
  const current = clone(isRecord(currentInput) ? currentInput : {});
  current.cards = isRecord(current.cards) ? current.cards : {};
  current.entries = isRecord(current.entries) ? current.entries : {};
  current.sections = isRecord(current.sections) ? current.sections : {};

  const seed = isRecord(seedInput) ? seedInput : { cards:{}, entries:{}, sections:{} };
  const seedCards = isRecord(seed.cards) ? seed.cards : {};
  const ledger = ledgerInput instanceof Map ? ledgerInput : replayRequestDocuments(ledgerInput || []);
  const context = buildStructureContext(current, seed);
  const keys = new Set([
    ...Object.keys(seedCards),
    ...Object.keys(current.cards),
    ...Object.keys(current.entries),
    ...ledger.keys()
  ]);
  const changes = [];

  for (const key of [...keys].sort()) {
    const currentCard = isRecord(current.cards[key]) ? current.cards[key] : {};
    const currentEntry = isRecord(current.entries[key]) ? current.entries[key] : null;
    const baseCard = isRecord(seedCards[key]) ? seedCards[key] : {};
    const intent = isRecord(ledger.get(key)) ? ledger.get(key) : {};

    const productionSource = pickStructureSource(currentCard, currentEntry, baseCard, intent, 'production');
    const practicalSource = pickStructureSource(currentCard, currentEntry, baseCard, intent, 'practical');
    const record = effectiveRecord(key, currentCard, currentEntry, baseCard, intent, productionSource, practicalSource);

    const hasProductionSource = productionSource.lines.length || productionSource.html;
    const hasPracticalSource = practicalSource.lines.length || practicalSource.html;
    const desiredProduction = hasProductionSource ? normaliseProductionLines(record, context) : [];
    const desiredPractical = hasPracticalSource ? normalisePracticalLines(record, context) : [];
    const desiredRetailers = chooseRetailerLinks(currentCard, currentEntry, baseCard, intent);

    const nextCard = { ...currentCard };
    if (desiredProduction.length) {
      fieldChange(changes, key, 'card.productionLines', nextCard.productionLines || [], desiredProduction);
      fieldChange(changes, key, 'card.productionHtml', nextCard.productionHtml || '', linesToMarkup(desiredProduction));
      nextCard.productionLines = desiredProduction;
      nextCard.productionHtml = linesToMarkup(desiredProduction);
    }
    if (desiredPractical.length) {
      fieldChange(changes, key, 'card.practicalLines', nextCard.practicalLines || [], desiredPractical);
      fieldChange(changes, key, 'card.practicalHtml', nextCard.practicalHtml || '', linesToMarkup(desiredPractical));
      nextCard.practicalLines = desiredPractical;
      nextCard.practicalHtml = linesToMarkup(desiredPractical);
    }
    if (desiredRetailers.length || own(intent, 'retailerLinks')) {
      fieldChange(changes, key, 'card.retailerLinks', nextCard.retailerLinks || [], desiredRetailers);
      nextCard.retailerLinks = desiredRetailers;
    }
    if (Object.keys(nextCard).length) current.cards[key] = nextCard;

    if (currentEntry) {
      const nextEntry = { ...currentEntry };
      if (desiredProduction.length) {
        fieldChange(changes, key, 'entry.productionLines', nextEntry.productionLines || [], desiredProduction);
        nextEntry.productionLines = desiredProduction;
      }
      if (desiredPractical.length) {
        fieldChange(changes, key, 'entry.practicalLines', nextEntry.practicalLines || [], desiredPractical);
        nextEntry.practicalLines = desiredPractical;
      }
      if (desiredRetailers.length || own(intent, 'retailerLinks')) {
        fieldChange(changes, key, 'entry.retailerLinks', nextEntry.retailerLinks || [], desiredRetailers);
        nextEntry.retailerLinks = desiredRetailers;
      }
      current.entries[key] = nextEntry;
    }
  }

  return { state:current, changes };
}

async function fetchState(fetchImpl, baseUrl, suffix = '') {
  const response = await fetchImpl(`${baseUrl}/api/catalogue-overrides${suffix}`, {
    headers:{ accept:'application/json' },
    cache:'no-store'
  });
  if (!response.ok) throw new Error(`Catalogue state read failed with HTTP ${response.status}.`);
  return response.json();
}

async function putState(fetchImpl, baseUrl, token, state) {
  const response = await fetchImpl(`${baseUrl}/api/catalogue-overrides`, {
    method:'PUT',
    headers:{
      'content-type':'application/json',
      authorization:`Bearer ${token}`
    },
    body:JSON.stringify(state)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Catalogue state write failed with HTTP ${response.status}: ${text.slice(0,300)}`);
  return text ? JSON.parse(text) : {};
}

function verifyChangedFields(actual, expected, changes) {
  for (const change of changes) {
    const [scope, field] = change.field.split('.');
    const bucket = scope === 'entry' ? actual.entries : actual.cards;
    const expectedBucket = scope === 'entry' ? expected.entries : expected.cards;
    if (!jsonEqual(bucket?.[change.key]?.[field], expectedBucket?.[change.key]?.[field])) {
      throw new Error(`Verification failed for ${change.key} ${change.field}.`);
    }
  }
}

function summary(changes) {
  const byField = {};
  const keys = new Set();
  for (const change of changes) {
    keys.add(change.key);
    byField[change.field] = (byField[change.field] || 0) + 1;
  }
  const retailerAdds = changes
    .filter(change => change.field.endsWith('retailerLinks'))
    .flatMap(change => {
      const before = new Set(stringList(change.before));
      return stringList(change.after)
        .filter(url => !before.has(url))
        .map(url => ({ key:change.key, url }));
    });
  return { keys:[...keys].sort(), byField, retailerAdds };
}

export async function runPreSidebarRepair(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const dryRun = options.dryRun ?? process.env.PRE_SIDEBAR_REPAIR_DRY_RUN === '1';
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();

  const current = await fetchState(fetchImpl, baseUrl, `?repair_read=${Date.now()}`);
  const html = await readFile(resolve(repoRoot, 'public/index.html'), 'utf8');
  const seed = parseCatalogueSeed(html);
  const ledger = options.ledger || await loadPreSidebarRequestLedger(repoRoot);
  const { state, changes } = buildPreSidebarRepair(current, seed, ledger);
  const info = summary(changes);

  console.log('PRE_SIDEBAR_REPAIR_SUMMARY ' + JSON.stringify({
    changedKeys:info.keys.length,
    changes:changes.length,
    byField:info.byField,
    retailerAdds:info.retailerAdds
  }));

  if (dryRun) return { state, changes, summary:info, dryRun:true };
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for repair.');

  const backupPath = resolve(repoRoot, 'pre-repair-live-state.json');
  await writeFile(backupPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
  console.log(`Saved pre-repair live-state backup to ${relative(repoRoot, backupPath)}.`);

  await putState(fetchImpl, baseUrl, token, state);
  const verified = await fetchState(fetchImpl, baseUrl, `?repair_verify=${Date.now()}`);
  verifyChangedFields(verified, state, changes);

  const page = await fetchImpl(`${baseUrl}/?repair_render_verify=${Date.now()}`, { cache:'no-store' });
  if (!page.ok) throw new Error(`Production render verification failed with HTTP ${page.status}.`);
  const rendered = await page.text();
  const renderedKeys = [...rendered.matchAll(/<article\b[^>]*\bdata-key=["']([^"']+)["']/gi)].map(match => match[1]);
  if (new Set(renderedKeys).size < 90) throw new Error(`Production render verification found only ${new Set(renderedKeys).size} unique cards.`);

  console.log(`Pre-sidebar field repair verified: ${info.keys.length} keys, ${changes.length} field writes, ${new Set(renderedKeys).size} rendered cards.`);
  return { state:verified, changes, summary:info, dryRun:false };
}

const directInvocation = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directInvocation) {
  runPreSidebarRepair().catch(error => {
    console.error(`Pre-sidebar repair failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
