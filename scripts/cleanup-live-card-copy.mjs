#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BASE_URL,
  publishRequestDocument
} from './publish-catalogue-request.mjs';

const TEXT_FIELDS = Object.freeze([
  'eyebrow',
  'summaryHtml',
  'noteHtml',
  'smokeTime',
  'productionHtml',
  'practicalHtml'
]);

const ARRAY_FIELDS = Object.freeze([
  'experienceTags',
  'productionLines',
  'practicalLines'
]);

const REDUNDANT_COPY = /\b(?:untasted|projected|projections?)\b/i;

function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ');
}

function cleanSpacing(value) {
  return String(value || '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:]){2,}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitSummarySentences(value) {
  const marker = '\uE000';
  const protectedText = String(value || '').replace(/\bNo\.\s+(?=\d)/gi, match => match.replace('.', marker));
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.replaceAll(marker, '.'));
}

export function cleanCatalogueText(input) {
  if (typeof input !== 'string') return input;
  if (!REDUNDANT_COPY.test(plainText(input))) return input;

  let text = input;

  // Parenthetical status markers add no useful information.
  text = text.replace(/\s*\(\s*projected\s*\)/gi, '');

  // Keep the useful clause before a trailing untasted/projection disclaimer.
  text = text.replace(
    /,\s*but\s+(?:it\s+)?remains?\s+untasted(?:\s+here|\s+in\s+this\s+catalogue)?\s*,?\s*so\s+[^.!?]*\bprojections?\b[^.!?]*([.!?])/gi,
    '$1'
  );

  // Remove whole status/disclaimer sentences while retaining factual sentences.
  text = text
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => {
      const plain = plainText(sentence).trim();
      if (!plain) return false;
      if (/^untasted(?:\s+projection)?[.!?]?$/i.test(plain)) return false;
      if (/^untasted\b/i.test(plain)) return false;
      if (/\buntasted\b/i.test(plain) && /\bprojections?\b/i.test(plain)) return false;
      if (
        /\bprojections?\b/i.test(plain)
        && /\b(?:strength|quality|flavour|intensity|finish|pairings?|claims?)\b/i.test(plain)
      ) return false;
      if (/^flavour\s+(?:remains|stays)\s+unrated\b/i.test(plain)) return false;
      return true;
    })
    .join(' ');

  // Remove residual inline labels while keeping the substantive wording.
  text = text
    .replace(/\buntasted\s*;\s*/gi, '')
    .replace(/\buntasted\b\s*/gi, '')
    .replace(/\bprojected\b\s*/gi, '')
    .replace(/\bprojections?\b\s*/gi, '');

  text = cleanSpacing(text);

  // Defensive final pass: never publish a visible field that still contains
  // one of the redundant status terms. Drop only the sentence containing it.
  if (REDUNDANT_COPY.test(plainText(text))) {
    text = cleanSpacing(
      text
        .split(/(?<=[.!?])\s+/)
        .filter(sentence => !REDUNDANT_COPY.test(plainText(sentence)))
        .join(' ')
    );
  }

  return text;
}

function isCataloguePlacementSentence(sentence) {
  const plain = plainText(sentence).trim();
  if (!plain) return false;

  const explicitCataloguePlacement = /\b(?:catalogue|catalog)\b/i.test(plain)
    && /\b(?:rank(?:ed|ing|s)?|placement|position|sits?|placed|above|below|ahead|behind|moves?|moved|slot|spot|no\.\s*\d+|#\s*\d+)\b/i.test(plain);

  const shortPlacementStatement = /\b(?:that|this)\s+(?:puts?|places?)\s+it\s+(?:at|in)\s+(?:no\.\s*\d+|#\s*\d+|\w+\s+place)\b/i.test(plain)
    || /\b(?:it|this cigar)\s+(?:currently\s+)?sits?\s+at\s+(?:no\.\s*\d+|#\s*\d+)\b/i.test(plain)
    || /\bcurrent\s+(?:rank|ranking|placement|position)\b/i.test(plain)
    || /\b(?:moves?|moved|puts?|placed)\s+(?:it|this cigar)\s+(?:up|down|at|to|into)\s+(?:no\.\s*\d+|#\s*\d+|\w+\s+place)\b/i.test(plain);

  return explicitCataloguePlacement || shortPlacementStatement;
}

export function cleanSummaryMeta(input) {
  if (typeof input !== 'string') return input;
  const sentences = splitSummarySentences(input);
  if (!sentences.some(isCataloguePlacementSentence)) return input;
  return cleanSpacing(sentences.filter(sentence => !isCataloguePlacementSentence(sentence)).join(' '));
}

function effectiveRecord(card = {}, entry = {}, base = {}) {
  return {
    ...(base && typeof base === 'object' ? base : {}),
    ...(entry && typeof entry === 'object' ? entry : {}),
    ...(card && typeof card === 'object' ? card : {})
  };
}

export function buildCleanupPatch(card = {}, entry = {}, base = {}) {
  const effective = effectiveRecord(card, entry, base);
  const patch = {};

  for (const field of TEXT_FIELDS) {
    if (typeof effective[field] !== 'string') continue;
    let cleaned = cleanCatalogueText(effective[field]);
    if (field === 'summaryHtml') cleaned = cleanSummaryMeta(cleaned);
    if (cleaned !== effective[field]) patch[field] = cleaned;
  }

  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(effective[field])) continue;
    const cleaned = effective[field].map(value =>
      typeof value === 'string' ? cleanCatalogueText(value) : value
    );
    if (JSON.stringify(cleaned) !== JSON.stringify(effective[field])) patch[field] = cleaned;
  }

  return patch;
}

export function findAffectedKeys(state = {}, baseState = {}) {
  const cards = state?.cards && typeof state.cards === 'object' ? state.cards : {};
  const entries = state?.entries && typeof state.entries === 'object' ? state.entries : {};
  const baseCards = baseState?.cards && typeof baseState.cards === 'object' ? baseState.cards : {};
  const keys = new Set([
    ...Object.keys(baseCards),
    ...Object.keys(entries),
    ...Object.keys(cards)
  ]);

  return [...keys]
    .filter(key => Object.keys(buildCleanupPatch(cards[key], entries[key], baseCards[key])).length > 0)
    .sort();
}

export function parseCatalogueSeed(html) {
  const match = String(html || '').match(
    /<script\b[^>]*id=["']catalogue-override-seed["'][^>]*>\s*window\.CATALOGUE_OVERRIDE_SEED\s*=\s*([\s\S]*?);\s*<\/script>/i
  );
  if (!match) return { cards: {}, entries: {} };
  const parsed = JSON.parse(match[1]);
  return parsed && typeof parsed === 'object' ? parsed : { cards: {}, entries: {} };
}

async function readLiveState(fetchImpl, baseUrl) {
  const response = await fetchImpl(`${baseUrl}/api/catalogue-overrides`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Catalogue state read failed with HTTP ${response.status}.`);
  return response.json();
}

export async function runLiveCleanup(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');
  const repoRoot = resolve(options.repoRoot || process.cwd());

  const html = await readFile(resolve(repoRoot, 'public/index.html'), 'utf8');
  const seed = parseCatalogueSeed(html);
  const initialState = await readLiveState(fetchImpl, baseUrl);
  const initialKeys = findAffectedKeys(initialState, seed);

  console.log(`Found ${initialKeys.length} catalogue card(s) with redundant visible copy.`);

  const published = [];
  for (const key of initialKeys) {
    // Re-read before every mutation so a newer manual edit always wins over
    // repository history or an earlier patch in this cleanup run.
    const currentState = await readLiveState(fetchImpl, baseUrl);
    const patch = buildCleanupPatch(
      currentState?.cards?.[key],
      currentState?.entries?.[key],
      seed?.cards?.[key]
    );
    if (!Object.keys(patch).length) continue;

    await publishRequestDocument(
      {
        id: `cleanup-copy-${key}`,
        operation: 'upsert-entry',
        key,
        entry: patch,
        note: 'Clean redundant status or catalogue-placement wording from current visible catalogue copy.'
      },
      {
        baseUrl,
        token,
        fetchImpl,
        repoRoot,
        now: options.now,
        sleep: options.sleep
      }
    );
    published.push(key);
    console.log(`Cleaned visible copy for ${key}.`);
  }

  const finalState = await readLiveState(fetchImpl, baseUrl);
  const remaining = findAffectedKeys(finalState, seed);
  if (remaining.length) {
    throw new Error(`Cleanup verification failed; redundant copy remains for: ${remaining.join(', ')}`);
  }

  console.log(`Cleanup verified: ${published.length} card(s) updated and no redundant visible copy remains.`);
  return { published, remaining };
}

const directInvocation = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (directInvocation) {
  runLiveCleanup().catch(error => {
    console.error(`Catalogue copy cleanup failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
