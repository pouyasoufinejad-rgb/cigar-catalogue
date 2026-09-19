#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BASE_URL,
  publishRequestDocument
} from './publish-catalogue-request.mjs';
import { parseCatalogueSeed } from './cleanup-live-card-copy.mjs';

const SMALL_FAMILY = 'coronet-flavoured';
const REGULAR_FAMILY = 'regular-main';
const TASTER_FAMILY = 'taster';
const HALF_FAMILY = 'half';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stripTags(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function linesFromHtml(html) {
  const source = String(html || '');
  const matches = [...source.matchAll(/<span\b[^>]*class=["'][^"']*\bartmeta-line\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  if (matches.length) return matches.map(match => stripTags(match[1])).filter(Boolean);
  return stripTags(source) ? [stripTags(source)] : [];
}

function arrayLines(value) {
  return Array.isArray(value) ? value.map(line => stripTags(line)).filter(Boolean) : [];
}

function uniqueLines(lines) {
  const seen = new Set();
  const output = [];
  for (const line of lines) {
    const clean = stripTags(line);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function sourceLines(record, kind) {
  const direct = arrayLines(record?.[`${kind}Lines`]);
  const html = linesFromHtml(record?.[`${kind}Html`]);
  const fallback = arrayLines(record?.[`__source${kind[0].toUpperCase()}${kind.slice(1)}Lines`]);
  return uniqueLines([...direct, ...html, ...fallback]);
}

function effectiveRecord(card = {}, entry = {}, base = {}, key = '') {
  const merged = {
    ...(isRecord(base) ? base : {}),
    ...(isRecord(entry) ? entry : {}),
    ...(isRecord(card) ? card : {})
  };
  if (key && !merged.key) merged.key = key;
  merged.__sourceProductionLines = uniqueLines([
    ...arrayLines(card?.productionLines), ...linesFromHtml(card?.productionHtml),
    ...arrayLines(entry?.productionLines), ...linesFromHtml(entry?.productionHtml),
    ...arrayLines(base?.productionLines), ...linesFromHtml(base?.productionHtml)
  ]);
  merged.__sourcePracticalLines = uniqueLines([
    ...arrayLines(card?.practicalLines), ...linesFromHtml(card?.practicalHtml),
    ...arrayLines(entry?.practicalLines), ...linesFromHtml(entry?.practicalHtml),
    ...arrayLines(base?.practicalLines), ...linesFromHtml(base?.practicalHtml)
  ]);
  return merged;
}

function subsectionMapFromState(state = {}, baseState = {}) {
  const map = new Map();
  const sources = [state?.sections?.recommendationSubsections, baseState?.sections?.recommendationSubsections];
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const section of list) {
      if (!isRecord(section) || !Array.isArray(section.entryKeys)) continue;
      for (const key of section.entryKeys) {
        const clean = String(key || '').trim();
        if (clean && !map.has(clean)) map.set(clean, String(section.id || '').trim());
      }
    }
  }
  return map;
}

// Static cards keep their dimensions on the article markup rather than in the override
// seed, so a card that has never been edited has no ring gauge in any state object. The
// cadence rule is driven entirely by ring gauge, so read them out of the page.
export function parseStaticCardDimensions(html) {
  const source = String(html || '');
  const articles = [...source.matchAll(/<article\b[^>]*\bdata-key="([a-z0-9_-]+)"[^>]*>/gi)];
  const map = new Map();
  for (let index = 0; index < articles.length; index += 1) {
    const start = articles[index].index;
    const end = index + 1 < articles.length ? articles[index + 1].index : source.length;
    const match = source.slice(start, end).match(/data-visual-length="([0-9.]+)"\s+data-visual-ring="([0-9]+)"/);
    if (!match) continue;
    map.set(articles[index][1], { length: Number(match[1]), ring: Number(match[2]) });
  }
  return map;
}

export function buildStructureContext(state = {}, baseState = {}, html = '') {
  return {
    subsectionByKey: subsectionMapFromState(state, baseState),
    dimensionsByKey: parseStaticCardDimensions(html)
  };
}

// The ring gauge the cadence rule is applied to: an explicit override wins, otherwise the
// static card markup, so an unedited card is still classified from its real dimensions.
function effectiveRing(record = {}, context = {}) {
  const own = Number(record.ring);
  if (Number.isFinite(own) && own > 0) return own;
  const fallback = context?.dimensionsByKey?.get?.(String(record.key || ''))?.ring;
  return Number.isFinite(fallback) ? fallback : NaN;
}

function explicitCatalogueType(record = {}) {
  const type = String(record.catalogueType || '').trim().toLowerCase();
  if (type === 'half' || type === 'half-cigar' || type === 'halfcigar') return HALF_FAMILY;
  if (type === 'taster' || record.taster) return TASTER_FAMILY;
  return 'main';
}

function exactFlavourStatus(lines) {
  if (lines.some(line => /^flavoured$/i.test(line))) return 'Flavoured';
  if (lines.some(line => /^unflavoured$/i.test(line))) return 'Unflavoured';
  return '';
}

export function classifyStructureFamily(record = {}, context = {}) {
  const type = explicitCatalogueType(record);
  if (type === HALF_FAMILY) return HALF_FAMILY;
  if (type === TASTER_FAMILY) return TASTER_FAMILY;

  const key = String(record.key || '').trim();
  const subsection = context?.subsectionByKey?.get?.(key) || String(record.subsection || '').trim();
  if (subsection === 'flavoured-infused' || subsection === 'coronets-cigarillos') return SMALL_FAMILY;
  if (subsection === 'petit-panatelas') return REGULAR_FAMILY;

  if (exactFlavourStatus(sourceLines(record, 'production')) === 'Flavoured') return SMALL_FAMILY;
  const ring = effectiveRing(record, context);
  if (Number.isFinite(ring) && ring <= 34) return SMALL_FAMILY;
  return REGULAR_FAMILY;
}

function firstMatch(lines, pattern) {
  return lines.find(line => pattern.test(line)) || '';
}

function normaliseConstruction(lines) {
  if (lines.some(line => /machine[\s-]?made/i.test(line))) return 'Machine-made';
  return 'Handmade';
}

function cleanFactValue(value) {
  return String(value || '')
    .trim()
    .replace(/^and\s+/i, '')
    .replace(/\s+tobaccos?\b.*$/i, '')
    .replace(/[.;]+$/g, '')
    .trim();
}

function prefixedFact(lines, label) {
  const pattern = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'i');
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return cleanFactValue(match[1]);
  }
  return '';
}

function proseFact(lines, term) {
  const lowerTerm = String(term).toLowerCase();
  for (const line of lines) {
    const lower = line.toLowerCase();
    const index = lower.indexOf(` ${lowerTerm}`);
    if (index < 0) continue;
    const left = line.slice(0, index);
    const segment = left.split(/[:,;]/).pop();
    const value = cleanFactValue(segment);
    if (value && !/^(wrapper|binder|filler)$/i.test(value)) return value;
  }
  return '';
}

function productionFact(lines, label, term = label.toLowerCase()) {
  return prefixedFact(lines, label) || proseFact(lines, term) || 'Undisclosed';
}

// The reference cards print a "Flavoured" banner on infused blends and print nothing at
// all on the rest, so an "Unflavoured" line is never emitted regardless of family.
function isFlavoured(record, lines, context) {
  if (exactFlavourStatus(lines) === 'Flavoured') return true;
  return context?.subsectionByKey?.get?.(String(record.key || '')) === 'flavoured-infused';
}

export function normaliseProductionLines(record = {}, context = {}) {
  const lines = sourceLines(record, 'production');
  const core = [
    normaliseConstruction(lines),
    `Wrapper: ${productionFact(lines, 'Wrapper')}`,
    `Binder: ${productionFact(lines, 'Binder')}`,
    `Filler: ${productionFact(lines, 'Filler')}`
  ];
  return isFlavoured(record, lines, context) ? ['Flavoured', ...core] : core;
}

function packageLine(record, lines, family) {
  if (family === HALF_FAMILY) return 'Two Halves';
  if (family === TASTER_FAMILY) {
    if (/\btubo\b/i.test(String(record.title || '')) || lines.some(line => /^single\s+tubo\b/i.test(line))) return 'Single tubo';
    return 'Single cigar';
  }
  const existing = firstMatch(lines, /^(?:tin|pack|box|case|bundle|single\b)/i);
  if (existing) {
    if (/^single\s+\d/i.test(existing)) return 'Single cigar';
    return existing.replace(/^single$/i, 'Single cigar');
  }
  const label = String(record.packageLabel || '').trim();
  if (label) {
    if (/^single(?:\s+cigar)?$/i.test(label)) return 'Single cigar';
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return 'Single cigar';
}

function cutLine(lines, family) {
  if (family === HALF_FAMILY) return 'Cut';
  if (lines.some(line => /^cut$/i.test(line))) return 'Cut';
  if (lines.some(line => /^uncut$/i.test(line))) return 'Uncut';
  if (lines.some(line => /\bpre[- ]?cut\b|factory[- ]cut/i.test(line))) return 'Cut';
  return 'Uncut';
}

function protectionLine(record, lines, family, first) {
  const protectedLine = firstMatch(lines, /^(?:protected|fragile|dry[- ]cured)$/i);
  if (family === SMALL_FAMILY) {
    if (protectedLine) return protectedLine.replace(/^dry cured$/i, 'Dry-cured');
    if (/^(?:tin|box|case|pack)\b/i.test(first) || /\btubo\b/i.test(String(record.title || ''))) return 'Protected';
    return 'Fragile';
  }
  if (/^(?:protected|fragile)$/i.test(protectedLine)) return /^protected$/i.test(protectedLine) ? 'Protected' : 'Fragile';
  if (/\btubo\b/i.test(first) || /\btubo\b/i.test(String(record.title || ''))) return 'Protected';
  return 'Fragile';
}

// Cadence is a property of the ring gauge alone: a narrow stick overheats if it is pushed,
// a fat one tolerates a faster draw. Whatever wording a card carried before is discarded,
// because the old copy was written per-card and drifted.
export function cadenceForRing(ring) {
  const value = Number(ring);
  if (!Number.isFinite(value)) return 'Lenient Cadence';
  if (value <= 32) return 'Sensitive Cadence';
  if (value <= 40) return 'Lenient Cadence';
  return 'Forgiving Cadence';
}

function numberWithFraction(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const whole = Math.floor(number + 1e-9);
  const eighths = Math.round((number - whole) * 8);
  const glyph = { 0:'', 1:'⅛', 2:'¼', 3:'⅜', 4:'½', 5:'⅝', 6:'¾', 7:'⅞', 8:'' }[eighths] ?? '';
  if (eighths === 8) return String(whole + 1);
  return `${whole || ''}${glyph}` || '0';
}

function parseFractionNumber(text) {
  const value = String(text || '').trim();
  const decimal = Number(value);
  if (Number.isFinite(decimal)) return decimal;
  const match = value.match(/^(\d+)?([⅛¼⅜½⅝¾⅞])$/);
  if (!match) return NaN;
  const fractions = { '⅛':0.125, '¼':0.25, '⅜':0.375, '½':0.5, '⅝':0.625, '¾':0.75, '⅞':0.875 };
  return Number(match[1] || 0) + fractions[match[2]];
}

function vitolaFromTitle(title = '') {
  const source = String(title);
  const names = [
    'Corona Viva','Petite Robusto','Petit Robusto','Short Robusto','Petit Corona','Petite Corona',
    'Corona Gorda','Gran Corona','Double Corona','Lancero','Panatela','Chiselito','Chisel','Perfecto',
    'Rothschild','Robusto','Toro','Churchill','Torpedo','Corona','Cigarillo','Coronet'
  ];
  return names.find(name => new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i').test(source)) || 'Cigar';
}

function fullHalfDimensions(record, lines, context) {
  const patterns = [
    /full(?:-size)?(?:\s+vitola|\s+cigar)?\s*:\s*([0-9.¼½¾⅛⅜⅝⅞]+)\s*″?\s*[×x]\s*(\d{2})/i,
    /^single\s+([0-9.¼½¾⅛⅜⅝⅞]+)\s*″?\s*[×x]\s*(\d{2})/i
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return { length:parseFractionNumber(match[1]), ring:Number(match[2]) };
    }
  }
  const fallback = context?.dimensionsByKey?.get?.(String(record.key || '')) || {};
  const halfLength = Number.isFinite(Number(record.length)) ? Number(record.length) : Number(fallback.length);
  const ring = effectiveRing(record, context);
  return {
    length:Number.isFinite(halfLength) ? halfLength * 2 : NaN,
    ring:Number.isFinite(ring) ? ring : NaN
  };
}

function fullCigarLine(record, lines, context) {
  const full = fullHalfDimensions(record, lines, context);
  const ring = Number.isFinite(full.ring) ? Math.round(full.ring) : Math.round(effectiveRing(record, context));
  const fullLength = numberWithFraction(full.length);
  return fullLength && Number.isFinite(ring)
    ? `Full cigar: ${fullLength}″ × ${ring} ${vitolaFromTitle(record.title)}`
    : 'Full cigar split before lighting';
}

export function normalisePracticalLines(record = {}, context = {}) {
  const family = classifyStructureFamily(record, context);
  const lines = sourceLines(record, 'practical');
  const first = packageLine(record, lines, family);
  const cut = cutLine(lines, family);
  const protection = protectionLine(record, lines, family, first);
  const cadence = cadenceForRing(effectiveRing(record, context));
  if (family === HALF_FAMILY) return [first, cut, protection, fullCigarLine(record, lines, context), cadence];
  return [first, cut, protection, cadence];
}

function currentEffectiveLines(record, kind) {
  const direct = arrayLines(record?.[`${kind}Lines`]);
  if (direct.length) return direct;
  return linesFromHtml(record?.[`${kind}Html`]);
}

export function buildStructurePatch(card = {}, entry = {}, base = {}, context = {}, key = '') {
  const record = effectiveRecord(card, entry, base, key || entry?.key || card?.key || base?.key || '');
  const desiredProduction = normaliseProductionLines(record, context);
  const desiredPractical = normalisePracticalLines(record, context);
  const currentProduction = currentEffectiveLines(record, 'production');
  const currentPractical = currentEffectiveLines(record, 'practical');
  const patch = {};
  if (JSON.stringify(currentProduction) !== JSON.stringify(desiredProduction)) patch.productionLines = desiredProduction;
  if (JSON.stringify(currentPractical) !== JSON.stringify(desiredPractical)) patch.practicalLines = desiredPractical;
  return patch;
}

export function findNonCompliantKeys(state = {}, baseState = {}, context = buildStructureContext(state, baseState)) {
  const cards = isRecord(state?.cards) ? state.cards : {};
  const entries = isRecord(state?.entries) ? state.entries : {};
  const baseCards = isRecord(baseState?.cards) ? baseState.cards : {};
  const keys = new Set([...Object.keys(baseCards), ...Object.keys(entries), ...Object.keys(cards)]);
  return [...keys]
    .filter(key => Object.keys(buildStructurePatch(cards[key], entries[key], baseCards[key], context, key)).length > 0)
    .sort();
}

async function readLiveState(fetchImpl, baseUrl) {
  const response = await fetchImpl(`${baseUrl}/api/catalogue-overrides`, {
    method:'GET',
    headers:{ accept:'application/json' },
    cache:'no-store'
  });
  if (!response.ok) throw new Error(`Catalogue state read failed with HTTP ${response.status}.`);
  return response.json();
}

function currentLinesForKey(state, seed, key) {
  const record = effectiveRecord(state?.cards?.[key], state?.entries?.[key], seed?.cards?.[key], key);
  return {
    production: currentEffectiveLines(record, 'production'),
    practical: currentEffectiveLines(record, 'practical')
  };
}

// A preview run reads live state and prints the exact before/after for every card it would
// touch, without sending a single write. The format change strips lines that were authored
// by hand, so the diff is reviewable before anything is committed to KV.
export function buildStructurePreview(state = {}, seed = {}, html = '') {
  const context = buildStructureContext(state, seed, html);
  const keys = findNonCompliantKeys(state, seed, context);
  return keys.map(key => {
    const before = currentLinesForKey(state, seed, key);
    const patch = buildStructurePatch(state?.cards?.[key], state?.entries?.[key], seed?.cards?.[key], context, key);
    return {
      key,
      before,
      after: {
        production: patch.productionLines || before.production,
        practical: patch.practicalLines || before.practical
      }
    };
  });
}

function printPreview(preview) {
  for (const row of preview) {
    console.log(`\n--- ${row.key}`);
    if (JSON.stringify(row.before.production) !== JSON.stringify(row.after.production)) {
      console.log(`  Production before: ${JSON.stringify(row.before.production)}`);
      console.log(`  Production after : ${JSON.stringify(row.after.production)}`);
    }
    if (JSON.stringify(row.before.practical) !== JSON.stringify(row.after.practical)) {
      console.log(`  Practical before : ${JSON.stringify(row.before.practical)}`);
      console.log(`  Practical after  : ${JSON.stringify(row.after.practical)}`);
    }
  }
}

export async function runLiveStructureNormalisation(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const dryRun = options.dryRun ?? /^(1|true|yes)$/i.test(String(process.env.NORMALISE_DRY_RUN || ''));
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token && !dryRun) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');
  const repoRoot = resolve(options.repoRoot || process.cwd());

  const html = await readFile(resolve(repoRoot, 'public/index.html'), 'utf8');
  const seed = parseCatalogueSeed(html);
  const initialState = await readLiveState(fetchImpl, baseUrl);
  const initialContext = buildStructureContext(initialState, seed, html);
  const initialKeys = findNonCompliantKeys(initialState, seed, initialContext);
  console.log(`Found ${initialKeys.length} catalogue card(s) with non-compliant Production/Practical structure.`);

  if (dryRun) {
    const preview = buildStructurePreview(initialState, seed, html);
    printPreview(preview);
    console.log(`\nDry run only: ${preview.length} card(s) would change and nothing was written to KV.`);
    return { published:[], remaining:initialKeys, preview, dryRun:true };
  }

  const published = [];
  for (const key of initialKeys) {
    const currentState = await readLiveState(fetchImpl, baseUrl);
    const context = buildStructureContext(currentState, seed, html);
    const patch = buildStructurePatch(
      currentState?.cards?.[key],
      currentState?.entries?.[key],
      seed?.cards?.[key],
      context,
      key
    );
    if (!Object.keys(patch).length) continue;
    await publishRequestDocument({
      id:`normalise-structure-${key}`,
      operation:'upsert-entry',
      key,
      entry:patch,
      note:'Normalise Production and Practical blocks to the approved catalogue house structure.'
    }, {
      baseUrl,
      token,
      fetchImpl,
      repoRoot,
      now:options.now,
      sleep:options.sleep
    });
    published.push(key);
    console.log(`Normalised Production/Practical structure for ${key}.`);
  }

  const finalState = await readLiveState(fetchImpl, baseUrl);
  const finalContext = buildStructureContext(finalState, seed, html);
  const remaining = findNonCompliantKeys(finalState, seed, finalContext);
  if (remaining.length) {
    throw new Error(`Structure verification failed; non-compliant entries remain: ${remaining.join(', ')}`);
  }
  console.log(`Structure normalisation verified: ${published.length} card(s) updated and zero non-compliant entries remain.`);
  return { published, remaining };
}

const directInvocation = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directInvocation) {
  runLiveStructureNormalisation().catch(error => {
    console.error(`Catalogue structure normalisation failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
