#!/usr/bin/env node
// Read-only. Compares current live catalogue state against the git-reconstructible
// pre-sidebar baseline and reports divergence. Never writes.
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import { parseCatalogueSeed } from './cleanup-live-card-copy.mjs';
import { countGoldRatings, deriveAutoLaurel } from '../public/catalogue-flavour.mjs';
import { deriveOverallScore } from '../public/catalogue-overall-score.mjs';
import { sizeScoreForRing, sizeTierForRing } from '../public/catalogue-size-rules.mjs';
import { deriveValue } from '../public/catalogue-value.mjs';
import {
  buildStructureContext,
  buildStructurePatch,
  findNonCompliantKeys,
  normaliseProductionLines,
  normalisePracticalLines
} from './normalise-live-card-structure.mjs';

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

  // Read-only check that the deployed page is actually serving the current card markup.
  // The audit above reads the state API, which says nothing about whether the Worker and
  // its static assets have been redeployed.
  if ((options.mode ?? process.env.AUDIT_MODE ?? '') === 'render') {
    const page = await fetch(`${baseUrl}/?render_audit=${Date.now()}`, { cache: 'no-store' });
    if (!page.ok) throw new Error(`Production render read failed with HTTP ${page.status}.`);
    const html = await page.text();
    // What the browser is actually told about caching this document, as opposed to what the
    // Worker source intends. A long-lived or immutable policy here would explain a phone
    // running current modules against an old stylesheet.
    for (const header of ['cache-control', 'etag', 'last-modified', 'age', 'cf-cache-status', 'x-cigar-catalogue-version', 'vary']) {
      console.log(`HEADER ${header}: ${page.headers.get(header) ?? '(absent)'}`);
    }
    console.log(`HTML_BYTES ${html.length}`);
    // The rank a reader actually sees, for any keys named in AUDIT_KEYS. A dynamic entry
    // renders from the entry while ranking normalisation runs over the cards, so the two
    // can disagree and only the rendered value settles it.
    for (const key of String(process.env.AUDIT_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)) {
      const article = html.match(new RegExp(`<article\\b[^>]*\\bdata-key="${escapeRegex(key)}"[^>]*>`, 'i'))?.[0] || '';
      const rendered = article.match(/data-rank="(\d+)"/)?.[1] || '(none)';
      const eyebrow = html.slice(html.indexOf(article)).match(/<div class="eyebrow">([^<]*)</)?.[1] || '(none)';
      console.log(`RENDERED_RANK ${key}: data-rank=${rendered} eyebrow="${eyebrow.trim()}"`);
    }
    const cards = new Set([...html.matchAll(/<article\b[^>]*\bdata-key=["']([^"']+)["']/gi)].map(m => m[1]));
    // Read the expected bootstrap version out of the Worker source rather than pinning it
    // here, so a routine cache-bump does not fail the audit for the wrong reason.
    const worker = await readFile(resolve(repoRoot, 'src/index.js'), 'utf8');
    const expectedBootstrap = worker.match(/catalogue-runtime\.mjs\?v=(\d+)/)?.[1] || '';
    const checks = {
      RENDERED_CARDS: cards.size,
      EXPECTED_BOOTSTRAP: expectedBootstrap,
      BOOTSTRAP_DEPLOYED: Boolean(expectedBootstrap) && html.includes(`catalogue-runtime.mjs?v=${expectedBootstrap}`),
      LAUREL_BADGE_CSS: /\.laurel-badge\{/.test(html),
      OVERALL_SCORE_CSS: /\.overall-score\{/.test(html),
      MOBILE_ONE_COLUMN_CSS: /@media\(max-width:900px\)\{html body \.grid\.grid\{grid-template-columns:minmax\(0,1fr\)!important/.test(html),
      AWARD_BOX_HIDDEN_IN_CSS: /\.gem-award\{display:none!important\}/.test(html),
      OVERALL_SCORE_RENDERED: (html.match(/class="overall-score/g) || []).length,
      DOMINICAN_REPUBLIC_LEFT_LONG: (html.match(/<span class="country-name">[^<]*Dominican Republic[^<]*<\/span>/g) || []).length
    };
    for (const [name, value] of Object.entries(checks)) console.log(`${name} ${json(value)}`);
    const failed = Object.entries(checks).filter(([name, value]) =>
      (typeof value === 'boolean' && !value)
      || (name === 'DOMINICAN_REPUBLIC_LEFT_LONG' && value > 0)
      || (name === 'RENDERED_CARDS' && value < 90));
    if (failed.length) throw new Error(`Production render audit failed: ${json(failed)}`);
    console.log('RENDER_AUDIT_PASSED');
    console.log('AUDIT_COMPLETE_READ_ONLY');
    return { live, checks };
  }

  // Read-only check of the laurel and overall-score rules against what is actually live.
  if ((options.mode ?? process.env.AUDIT_MODE ?? '') === 'laurels') {
    const keys = [...new Set([...Object.keys(seedCards), ...Object.keys(liveEntries), ...Object.keys(liveCards)])].sort();
    const tally = { gem: 0, crown: 0, none: 0 };
    const goldTally = {};
    let flavourRated = 0;
    let scored = 0;
    let provisional = 0;
    const rows = [];

    for (const key of keys) {
      const record = { ...(seedCards[key] || {}), ...(liveEntries[key] || {}), ...(liveCards[key] || {}) };
      const ring = Number(record.ring);
      const price = Number(record.price);
      const quality = Number(record.quality);
      const flavour = record.flavour == null ? null : Number(record.flavour);
      const valueScore = deriveValue(price, quality, flavour, {
        length: Number(record.length), ring, catalogueType: record.catalogueType || '', valueUnit: ''
      }).score;
      const sizeTier = record.size || sizeTierForRing(ring);
      const ratings = { strength: Number(record.strength), quality, flavour, size: sizeTier, value: valueScore };

      const golds = countGoldRatings(ratings);
      const laurel = deriveAutoLaurel(ratings);
      const overall = deriveOverallScore({ ...ratings, size: sizeScoreForRing(ring) });

      tally[laurel] += 1;
      goldTally[golds] = (goldTally[golds] || 0) + 1;
      if (flavour !== null && Number.isFinite(flavour)) flavourRated += 1;
      if (overall.score !== null) scored += 1;
      if (overall.provisional) provisional += 1;
      rows.push({ key, golds, laurel, score: overall.score, provisional: overall.provisional, flavour });
    }

    console.log(`LAUREL_KEYS ${keys.length}`);
    console.log(`FLAVOUR_RATED ${flavourRated} of ${keys.length} (unrated ${keys.length - flavourRated})`);
    console.log(`GOLD_COUNT_DISTRIBUTION ${json(goldTally)}`);
    console.log(`LAUREL_TALLY ${json(tally)}`);
    console.log(`OVERALL_SCORED ${scored} (provisional ${provisional})`);
    const invalid = rows.filter(row => (row.golds >= 5) !== (row.laurel === 'gem') || (row.golds === 4) !== (row.laurel === 'crown'));
    console.log(`LAUREL_RULE_VIOLATIONS ${invalid.length} ${json(invalid.slice(0, 5))}`);
    for (const row of rows.filter(r => r.laurel !== 'none').sort((a, b) => b.score - a.score)) {
      console.log(`  ${row.laurel.toUpperCase().padEnd(5)} golds=${row.golds} score=${row.score}${row.provisional ? '*' : ' '} ${row.key}`);
    }
    const top = [...rows].filter(r => r.score !== null).sort((a, b) => b.score - a.score).slice(0, 10);
    console.log('TOP_SCORES');
    for (const row of top) console.log(`  ${String(row.score).padStart(3)}${row.provisional ? '*' : ' '} golds=${row.golds} ${row.key}`);
    console.log('AUDIT_COMPLETE_READ_ONLY');
    return { live, rows, tally };
  }

  if ((options.mode ?? process.env.AUDIT_MODE ?? '') === 'noncompliant') {
    const context = buildStructureContext(live, seed);
    const keys = findNonCompliantKeys(live, seed, context);
    console.log(`NON_COMPLIANT_KEYS count=${keys.length} ${json(keys)}`);
    const detailLimit = Number(process.env.AUDIT_DETAIL_LIMIT || 3);
    for (const key of keys.slice(0, detailLimit)) {
      const card = isRecord(liveCards[key]) ? liveCards[key] : undefined;
      const entry = isRecord(liveEntries[key]) ? liveEntries[key] : undefined;
      const base = isRecord(seedCards[key]) ? seedCards[key] : undefined;
      const merged = { ...(base || {}), ...(entry || {}), ...(card || {}), key };
      console.log(`--- ${key} ---`);
      console.log(`  card.practicalLines  ${json(card?.practicalLines)}`);
      console.log(`  entry.practicalLines ${json(entry?.practicalLines)}`);
      console.log(`  card.practicalHtml   ${json(card?.practicalHtml)}`.slice(0, 500));
      console.log(`  WANT practical       ${json(normalisePracticalLines(merged, context))}`);
      console.log(`  card.productionLines ${json(card?.productionLines)}`);
      console.log(`  WANT production      ${json(normaliseProductionLines(merged, context))}`);
      console.log(`  PATCH                ${json(buildStructurePatch(card, entry, base, context, key))}`.slice(0, 700));
    }
    console.log('AUDIT_COMPLETE_READ_ONLY');
    return { live, nonCompliant: keys };
  }

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
