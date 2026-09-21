#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BASE_URL,
  publishRequestDocument
} from './publish-catalogue-request.mjs';

const UNTASTED_COPY = /\buntasted\b/i;
const PRICE_COPY = /(?:A\$|AU\$|\bAUD\s*\$?|\$\s*)\d+(?:\.\d{1,2})?/i;
const RETAILER_COPY = /\b(?:The Index|Index Cigars|Cigar\s*Hut|Cigarhut|Cigarworld|Cigar\s*World|Cigarbox|Cigar\s*Box|Corporate\s*Cigar|Sydney\s*Cigar\s*House|Firmin|Devlin'?s|Cigar\s*Social|Reeds|SmokingPipes|Sam'?s\s*Smokes|Alexander'?s)\b/i;
const LISTING_COPY = /\b(?:lists?|listed|listing|retails?|retailer|price(?:d|s)?|available|availability|in\s+stock|out\s+of\s+stock|sold\s+out|restock(?:ed|ing)?|currently\s+available|currently\s+unavailable|per\s+stick|single\s+at|tin\s+at|pack\s+at|box\s+at)\b/i;
const DESCRIPTIVE_COPY = /\b(?:wrapper|binder|filler|blend|tobacco|vitola|format|shape|cap|draw|burn|construction|finish|retrohale|pepper|cedar|cocoa|coffee|espresso|earth|leather|cream|sweet|smoke|spice|nut|fruit|vanilla|maple|hickory|barbecue|bourbon|floral|caramel|molasses|chocolate|strength|body|aroma|infus(?:ed|ion)|flavou?r(?:ed|ing)?|fire[- ]cured|sun[- ]grown|maduro|oscuro|cameroon|broadleaf|connecticut|corojo|criollo|habano|san\s+andr[eé]s|medio\s+tiempo|piloto|chisel|pigtail|box[- ]pressed|perfecto|lancero|panatela|corona|robusto|cigarillo|cheroot|short[- ]filler|long[- ]filler)\b/i;
const DISTINCTIVE_COPY = /\b(?:sweetened|fire[- ]cured|infus(?:ed|ion)|chisel|pigtail|box[- ]pressed|perfecto|lancero|cheroot|sun[- ]grown|maduro|oscuro|cameroon|broadleaf|connecticut|corojo|criollo|habano|san\s+andr[eé]s|medio\s+tiempo|piloto|short[- ]filler|long[- ]filler|unico|único|rare|unusual|distinctive|signature|pressed|figurado)\b/i;
const META_COPY = /\b(?:catalogue|catalog|rank(?:ed|ing)?|placement|benchmark|parent\s+tier)\b/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function plainText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSentence(value) {
  return plainText(value)
    .replace(UNTASTED_COPY, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitSentences(value) {
  const text = plainText(value);
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean);
}

function isCommercialSentence(sentence) {
  const text = plainText(sentence);
  return PRICE_COPY.test(text)
    || RETAILER_COPY.test(text)
    || (LISTING_COPY.test(text) && /\b(?:single|tin|pack|box|cigar|stick|stock|available|price|retail)\b/i.test(text));
}

export function noteNeedsReplacement(noteHtml) {
  const text = plainText(noteHtml);
  if (!text) return false;
  if (UNTASTED_COPY.test(text)) return true;

  const sentences = splitSentences(text);
  if (!sentences.some(isCommercialSentence)) return false;

  const descriptiveRemainder = sentences.filter(sentence => !isCommercialSentence(sentence)).join(' ');
  const wordCount = descriptiveRemainder.split(/\s+/).filter(Boolean).length;
  return wordCount < 6 || !DESCRIPTIVE_COPY.test(descriptiveRemainder);
}

function ensurePeriod(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : text + '.';
}

function clipSentence(value, max = 300) {
  const text = ensurePeriod(cleanSentence(value));
  if (text.length <= max) return text;
  const clipped = text.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,:;\s]+$/, '');
  return ensurePeriod(clipped);
}

function scoreSummarySentence(sentence) {
  const text = plainText(sentence);
  if (!text || isCommercialSentence(text) || UNTASTED_COPY.test(text) || META_COPY.test(text)) return -100;
  let score = 0;
  if (DISTINCTIVE_COPY.test(text)) score += 5;
  if (DESCRIPTIVE_COPY.test(text)) score += 3;
  if (/\b\d+(?:\.\d+)?(?:″|"|\s*in(?:ch(?:es)?)?)?\s*[×x]\s*\d{2}\b/i.test(text)) score += 1;
  if (/\b(?:wrapper|binder|filler|cap|shape|format|construction)\b/i.test(text)) score += 2;
  if (text.length >= 50 && text.length <= 260) score += 1;
  return score;
}

function productionLines(record) {
  if (Array.isArray(record?.productionLines)) return record.productionLines.map(plainText).filter(Boolean);
  if (typeof record?.productionHtml === 'string') {
    return String(record.productionHtml)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/[^>]+>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .split(/\r?\n/)
      .map(value => plainText(value))
      .filter(Boolean);
  }
  return [];
}

function practicalLines(record) {
  if (Array.isArray(record?.practicalLines)) return record.practicalLines.map(plainText).filter(Boolean);
  if (typeof record?.practicalHtml === 'string') {
    return String(record.practicalHtml)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/[^>]+>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .split(/\r?\n/)
      .map(value => plainText(value))
      .filter(Boolean);
  }
  return [];
}

function labelledValue(lines, label) {
  const regex = new RegExp('^' + label + '\\s*:\\s*(.+)$', 'i');
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match[1].trim();
  }
  return '';
}

function normaliseTobaccoPhrase(value) {
  return String(value || '').replace(/\s*\+\s*/g, ' and ').replace(/\s{2,}/g, ' ').trim();
}

export function buildDistinctiveNote(record = {}) {
  const summaryCandidates = splitSentences(record.summaryHtml)
    .map((sentence, index) => ({ sentence, index, score: scoreSummarySentence(sentence) }))
    .filter(item => item.score > -100)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (summaryCandidates.length) {
    return clipSentence(summaryCandidates[0].sentence);
  }

  const production = productionLines(record);
  const wrapper = labelledValue(production, 'Wrapper');
  const binder = labelledValue(production, 'Binder');
  const filler = labelledValue(production, 'Filler');

  if (wrapper && filler) {
    return clipSentence("Its " + normaliseTobaccoPhrase(wrapper) + " wrapper over " + normaliseTobaccoPhrase(filler) + " filler is the blend's defining construction choice");
  }
  if (wrapper && binder) {
    return clipSentence("Its " + normaliseTobaccoPhrase(wrapper) + " wrapper over " + normaliseTobaccoPhrase(binder) + " binder gives the blend its clearest structural identity");
  }
  if (wrapper) {
    return clipSentence("Its " + normaliseTobaccoPhrase(wrapper) + " wrapper is the clearest point of distinction in the blend");
  }

  const practical = practicalLines(record);
  const practicalCue = practical.find(line => DISTINCTIVE_COPY.test(line));
  if (practicalCue) {
    return clipSentence(practicalCue + " is the format detail that most clearly sets this cigar apart");
  }

  const eyebrow = cleanSentence(record.eyebrow);
  if (eyebrow && !UNTASTED_COPY.test(eyebrow) && !isCommercialSentence(eyebrow) && !META_COPY.test(eyebrow)) {
    return clipSentence(eyebrow);
  }

  const title = cleanSentence([record.brand, record.title].filter(Boolean).join(' '));
  const length = Number(record.length);
  const ring = Number(record.ring);
  if (title && Number.isFinite(length) && length > 0 && Number.isFinite(ring) && ring > 0) {
    return clipSentence(title + " uses a " + length + "″ × " + Math.round(ring) + " format that defines this presentation of the blend");
  }
  if (title) return clipSentence(title + " is included for its distinct blend and format identity");

  return 'Distinctive blend and format details make this cigar worth keeping as its own catalogue entry.';
}

function cleanVariantList(list, parentRecord, blendMode = false) {
  if (!Array.isArray(list)) return { changed: false, value: list };
  let changed = false;
  const value = list.map(variant => {
    if (!isRecord(variant)) return variant;
    const effective = { ...(isRecord(parentRecord) ? parentRecord : {}), ...variant };
    let next = variant;

    if (typeof variant.noteHtml === 'string' && noteNeedsReplacement(variant.noteHtml)) {
      next = { ...next, noteHtml: buildDistinctiveNote(effective) };
      changed = true;
    }

    if (Array.isArray(variant.sizeVariants)) {
      const nested = cleanVariantList(variant.sizeVariants, effective, false);
      if (nested.changed) {
        next = { ...next, sizeVariants: nested.value };
        changed = true;
      }
    }

    if (Array.isArray(variant.blendVariants)) {
      const nested = cleanVariantList(variant.blendVariants, effective, true);
      if (nested.changed) {
        next = { ...next, blendVariants: nested.value };
        changed = true;
      }
    }

    if (blendMode && Array.isArray(next.sizeVariants)) {
      const nested = cleanVariantList(next.sizeVariants, { ...effective, ...next }, false);
      if (nested.changed) {
        next = { ...next, sizeVariants: nested.value };
        changed = true;
      }
    }

    return next;
  });
  return { changed, value };
}

export function buildMarkupNotePatch(card = {}, entry = {}, base = {}) {
  const effective = {
    ...(isRecord(base) ? base : {}),
    ...(isRecord(entry) ? entry : {}),
    ...(isRecord(card) ? card : {})
  };
  const patch = {};

  if (typeof effective.noteHtml === 'string' && noteNeedsReplacement(effective.noteHtml)) {
    patch.noteHtml = buildDistinctiveNote(effective);
  }

  const sizes = cleanVariantList(effective.sizeVariants, effective, false);
  if (sizes.changed) patch.sizeVariants = sizes.value;

  const blends = cleanVariantList(effective.blendVariants, effective, true);
  if (blends.changed) patch.blendVariants = blends.value;

  return patch;
}

function extractArticleField(body, regex) {
  return body.match(regex)?.[1]?.trim() || '';
}

function parseLinesFromBlock(block) {
  return [...String(block || '').matchAll(/<[^>]*class=["'][^"']*artmeta-line[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)]
    .map(match => plainText(match[1]))
    .filter(Boolean);
}

export function parseRenderedCards(html) {
  const cards = {};
  for (const match of String(html || '').matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const key = attrs.match(/\bdata-key=["']([^"']+)["']/i)?.[1] || '';
    if (!key) continue;

    const h3 = body.match(/<h3>\s*<span>([\s\S]*?)<\/span>([\s\S]*?)<\/h3>/i);
    const artLeft = body.match(/<div\b[^>]*class=["'][^"']*artmeta-left[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const artRight = body.match(/<div\b[^>]*class=["'][^"']*artmeta-right[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const frame = body.match(/<div\b[^>]*class=["'][^"']*artframe[^"']*["'][^>]*>/i)?.[0] || '';

    cards[key] = {
      brand: plainText(h3?.[1] || ''),
      title: plainText(h3?.[2] || ''),
      eyebrow: plainText(extractArticleField(body, /<div\b[^>]*class=["'][^"']*eyebrow[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)).replace(/^.*?—\s*/, ''),
      summaryHtml: extractArticleField(body, /<p\b[^>]*class=["'][^"']*summary[^"']*["'][^>]*>([\s\S]*?)<\/p>/i),
      noteHtml: extractArticleField(body, /<p\b[^>]*class=["'][^"']*(?:mog-note|taster-note)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i),
      productionLines: parseLinesFromBlock(artLeft),
      practicalLines: parseLinesFromBlock(artRight),
      length: Number(frame.match(/\bdata-visual-length=["']([^"']+)["']/i)?.[1] || 0),
      ring: Number(frame.match(/\bdata-visual-ring=["']([^"']+)["']/i)?.[1] || 0)
    };
  }
  return cards;
}

async function readLiveState(fetchImpl, baseUrl) {
  const response = await fetchImpl(baseUrl + '/api/catalogue-overrides?markup_note_cleanup=' + Date.now(), {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Catalogue state read failed with HTTP ' + response.status + '.');
  return response.json();
}

async function readRenderedCards(fetchImpl, baseUrl) {
  const response = await fetchImpl(baseUrl + '/?markup_note_cleanup=' + Date.now(), {
    method: 'GET',
    headers: { accept: 'text/html' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Production catalogue read failed with HTTP ' + response.status + '.');
  return parseRenderedCards(await response.text());
}

export function findAffectedKeys(state = {}, baseCards = {}) {
  const cards = isRecord(state.cards) ? state.cards : {};
  const entries = isRecord(state.entries) ? state.entries : {};
  const keys = [...new Set([...Object.keys(cards), ...Object.keys(entries)])];
  return keys
    .filter(key => Object.keys(buildMarkupNotePatch(cards[key], entries[key], baseCards[key])).length > 0)
    .sort();
}

function badRawRenderedNotes(baseCards) {
  return Object.entries(baseCards)
    .filter(([, record]) => noteNeedsReplacement(record?.noteHtml))
    .map(([key]) => key)
    .sort();
}

export function badEffectiveRenderedNotes(state = {}, baseCards = {}) {
  const cards = isRecord(state.cards) ? state.cards : {};
  const entries = isRecord(state.entries) ? state.entries : {};
  return Object.entries(baseCards)
    .filter(([key, record]) => {
      const effective = {
        ...(isRecord(record) ? record : {}),
        ...(isRecord(entries[key]) ? entries[key] : {}),
        ...(isRecord(cards[key]) ? cards[key] : {})
      };
      return noteNeedsReplacement(effective.noteHtml);
    })
    .map(([key]) => key)
    .sort();
}

export async function runLiveMarkupNoteCleanup(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token ?? process.env.CATALOGUE_ADMIN_TOKEN ?? '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');
  const repoRoot = resolve(options.repoRoot || process.cwd());

  const [initialState, initialRendered] = await Promise.all([
    readLiveState(fetchImpl, baseUrl),
    readRenderedCards(fetchImpl, baseUrl)
  ]);

  const cards = isRecord(initialState.cards) ? initialState.cards : {};
  const entries = isRecord(initialState.entries) ? initialState.entries : {};
  const stateKeys = new Set([...Object.keys(cards), ...Object.keys(entries)]);
  const productionOnlyBad = badRawRenderedNotes(initialRendered).filter(key => !stateKeys.has(key));
  if (productionOnlyBad.length) {
    throw new Error('Rendered bad notes cannot be safely patched because their keys are absent from live state: ' + productionOnlyBad.join(', '));
  }

  const initialKeys = findAffectedKeys(initialState, initialRendered);
  console.log('Found ' + initialKeys.length + ' catalogue card(s) with redundant markup notes.');

  const published = [];
  for (const key of initialKeys) {
    const currentState = await readLiveState(fetchImpl, baseUrl);
    const patch = buildMarkupNotePatch(
      currentState?.cards?.[key],
      currentState?.entries?.[key],
      initialRendered[key]
    );
    if (!Object.keys(patch).length) continue;

    await publishRequestDocument(
      {
        id: 'cleanup-markup-note-' + key,
        operation: 'upsert-entry',
        key,
        entry: patch,
        note: 'Replace redundant untasted or retailer-price markup notes with cigar-specific editorial notes.'
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
    console.log('Rewrote markup note for ' + key + '.');
  }

  const [finalState, finalRendered] = await Promise.all([
    readLiveState(fetchImpl, baseUrl),
    readRenderedCards(fetchImpl, baseUrl)
  ]);
  const remainingState = findAffectedKeys(finalState, finalRendered);
  const remainingProduction = badEffectiveRenderedNotes(finalState, finalRendered);

  if (remainingState.length || remainingProduction.length) {
    throw new Error(
      'Markup-note cleanup verification failed. State=' + remainingState.join(', ')
      + ' Rendered=' + remainingProduction.join(', ')
    );
  }

  console.log('Markup-note cleanup verified: ' + published.length + ' card(s) updated; no redundant notes remain in state or rendered production.');
  return { published, remainingState, remainingProduction };
}

const directInvocation = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (directInvocation) {
  runLiveMarkupNoteCleanup().catch(error => {
    console.error('Markup-note cleanup failed: ' + (error?.message || error));
    process.exitCode = 1;
  });
}
