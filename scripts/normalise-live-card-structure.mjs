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

export function buildStructureContext(state = {}, baseState = {}) {
  return { subsectionByKey: subsectionMapFromState(state, baseState) };
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
  const ring = Number(record.ring);
  if (Number.isFinite(ring) && ring <= 34) return SMALL_FAMILY;
  return REGULAR_FAMILY;
}

function firstMatch(lines, pattern) {
  return lines.find(line => pattern.test(line)) || '';
}

function normaliseConstruction(lines, family) {
  if (lines.some(line => /machine[\s-]?made/i.test(line))) return 'Machine-made';
  if (lines.some(line => /hand[\s-]?made/i.test(line))) return 'Handmade';
  if (lines.some(line => /^made\s+in\b.*\bat\b.*\bcigars?\b/i.test(line))) return 'Handmade';
  if (family === HALF_FAMILY || family === REGULAR_FAMILY) return 'Handmade';
  return 'Handmade';
}

function cleanFactValue(value) {
  return String(value || '')
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

export function normaliseProductionLines(record = {}, context = {}) {
  const family = classifyStructureFamily(record, context);
  const lines = sourceLines(record, 'production');
  const status = exactFlavourStatus(lines)
    || ((context?.subsectionByKey?.get?.(String(record.key || '')) === 'flavoured-infused') ? 'Flavoured' : 'Unflavoured');
  const construction = normaliseConstruction(lines, family);
  const wrapper = productionFact(lines, 'Wrapper');
  const binder = productionFact(lines, 'Binder');
  const filler = productionFact(lines, 'Filler');
  const core = [construction, `Wrapper: ${wrapper}`, `Binder: ${binder}`, `Filler: ${filler}`];
  return (family === SMALL_FAMILY || family === TASTER_FAMILY) ? [status, ...core] : core;
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
    if (/^(?:tin|box|case)\b/i.test(first) || /\btubo\b/i.test(String(record.title || ''))) return 'Protected';
    return 'Fragile';
  }
  if (/^(?:protected|fragile)$/i.test(protectedLine)) return /^protected$/i.test(protectedLine) ? 'Protected' : 'Fragile';
  if (/\btubo\b/i.test(first) || /\btubo\b/i.test(String(record.title || ''))) return 'Protected';
  return 'Fragile';
}

function cadenceLine(lines, family) {
  const existing = firstMatch(lines, /\bcadence\b/i);
  if (existing) return existing;
  return (family === REGULAR_FAMILY || family === HALF_FAMILY) ? 'Slow Cadence' : 'Lenient Cadence';
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

function dimensionsLine(record) {
  const length = numberWithFraction(record.length);
  const ring = Number(record.ring);
  if (!length || !Number.isFinite(ring)) return '';
  return `${length}″ × ${Math.round(ring)} ${vitolaFromTitle(record.title)}`;
}

function isStructuralPracticalLine(line) {
  return /^(?:tin|pack|box|case|bundle|single\b|two\s+halves$|cut$|uncut$|protected$|fragile$|dry[- ]cured$)/i.test(line)
    || /\bcadence\b/i.test(line);
}

function isPriceLine(line) {
  return /A\$|\bprice\b|\bbuy\b|per\s+(?:cigar|session|stick)/i.test(line);
}

function detailCandidates(lines) {
  return lines.filter(line => !isStructuralPracticalLine(line) && !isPriceLine(line));
}

function deriveRoleDetail(record) {
  const length = Number(record.length);
  const ring = Number(record.ring);
  if (Number.isFinite(ring) && ring >= 56) return 'Very large ring gauge';
  if (Number.isFinite(length) && Number.isFinite(ring) && length >= 6.5 && ring <= 42) return 'Long, narrow format';
  if (Number.isFinite(ring) && ring <= 40) return 'Narrow-ring format';
  if (Number.isFinite(length) && length <= 4.5) return 'Compact format';
  if (Number.isFinite(ring) && ring <= 46) return 'Slim traditional format';
  return 'Traditional full-size format';
}

function regularDetails(record, lines) {
  const candidates = detailCandidates(lines);
  const construction = candidates.find(line => /construction|box[- ]?press|chisel|taper|perfecto|pigtail|closed foot|open foot|long[- ]filler|short[- ]filler|shape/i.test(line))
    || candidates.find(line => /\d+(?:[.¼½¾⅛⅜⅝⅞]+)?\s*″?\s*[×x]\s*\d{2}/i.test(line))
    || dimensionsLine(record)
    || 'Standard cigar construction';
  const role = candidates.find(line => line !== construction && /taster|format|ring gauge|ring|session|wrapper|blend|compact|narrow|large|traditional|quick|premium|full-bodied|mellow/i.test(line))
    || deriveRoleDetail(record);
  return [construction, role];
}

function fullHalfDimensions(record, lines) {
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
  const halfLength = Number(record.length);
  const ring = Number(record.ring);
  return {
    length:Number.isFinite(halfLength) ? halfLength * 2 : NaN,
    ring:Number.isFinite(ring) ? ring : NaN
  };
}

function halfDetails(record, lines) {
  const full = fullHalfDimensions(record, lines);
  const ring = Number.isFinite(full.ring) ? Math.round(full.ring) : Math.round(Number(record.ring));
  const fullLength = numberWithFraction(full.length);
  const sessionLength = numberWithFraction(Number.isFinite(full.length) ? full.length / 2 : record.length);
  const vitola = vitolaFromTitle(record.title);
  const fullLine = fullLength && Number.isFinite(ring)
    ? `Full cigar: ${fullLength}″ × ${ring} ${vitola}`
    : 'Full cigar split before lighting';
  const sessionLine = sessionLength && Number.isFinite(ring)
    ? `Two ${sessionLength}″ × ${ring} sessions`
    : 'Two practical smoking sessions';
  return [fullLine, sessionLine];
}

export function normalisePracticalLines(record = {}, context = {}) {
  const family = classifyStructureFamily(record, context);
  const lines = sourceLines(record, 'practical');
  const first = packageLine(record, lines, family);
  const cut = cutLine(lines, family);
  const protection = protectionLine(record, lines, family, first);
  const cadence = cadenceLine(lines, family);

  if (family === SMALL_FAMILY || family === TASTER_FAMILY) return [first, cut, protection, cadence];
  const [construction, role] = family === HALF_FAMILY ? halfDetails(record, lines) : regularDetails(record, lines);
  return [first, cut, protection, construction, role, cadence];
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

export async function runLiveStructureNormalisation(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');
  const repoRoot = resolve(options.repoRoot || process.cwd());

  const html = await readFile(resolve(repoRoot, 'public/index.html'), 'utf8');
  const seed = parseCatalogueSeed(html);
  const initialState = await readLiveState(fetchImpl, baseUrl);
  const initialContext = buildStructureContext(initialState, seed);
  const initialKeys = findNonCompliantKeys(initialState, seed, initialContext);
  console.log(`Found ${initialKeys.length} catalogue card(s) with non-compliant Production/Practical structure.`);

  const published = [];
  for (const key of initialKeys) {
    const currentState = await readLiveState(fetchImpl, baseUrl);
    const context = buildStructureContext(currentState, seed);
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
  const finalContext = buildStructureContext(finalState, seed);
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
