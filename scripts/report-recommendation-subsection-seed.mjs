import { readFile } from 'node:fs/promises';
import {
  reconcileRecommendationSubsections,
  resolveRingGauge
} from '../public/catalogue-recommendation-subsections.mjs';

const livePath = process.argv[2] || '/tmp/catalogue-overrides.json';
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const live = JSON.parse(await readFile(livePath, 'utf8'));

function attr(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
}

function safeKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(key) ? key : '';
}

function productionLines(body) {
  const scrubbed = String(body || '').replace(/<img\b[^>]*>/gi, ' ');
  const leftStart = scrubbed.search(/<[^>]*class=["'][^"']*artmeta-left[^"']*["'][^>]*>/i);
  if (leftStart < 0) return [];
  const tail = scrubbed.slice(leftStart);
  const rightStart = tail.search(/<[^>]*class=["'][^"']*artmeta-right[^"']*["'][^>]*>/i);
  const block = rightStart >= 0 ? tail.slice(0, rightStart) : tail;
  return Array.from(block.matchAll(/<[^>]*class=["'][^"']*artmeta-line[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi), match =>
    match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .trim()
  ).filter(Boolean);
}

function parseStaticCards(source) {
  const cards = new Map();
  for (const match of String(source || '').matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const tag = `<article${match[1]}>`;
    if (!/(?:^|\s)card(?:\s|$)/i.test(attr(tag, 'class'))) continue;
    const key = safeKey(attr(tag, 'data-key'));
    if (!key) continue;
    const body = match[2] || '';
    const card = {
      key,
      catalogueType: attr(tag, 'data-catalogue-type') || (attr(tag, 'data-taster') === '1' ? 'taster' : 'main'),
      taster: attr(tag, 'data-taster') === '1',
      archived: attr(tag, 'data-archived') === '1',
      productionLines: productionLines(body)
    };
    const rank = Number(attr(tag, 'data-rank'));
    if (Number.isFinite(rank) && rank >= 1) card.rank = Math.round(rank);
    const visualRing = Number(body.match(/\bdata-visual-ring=["'](\d{2})["']/i)?.[1]);
    if (Number.isFinite(visualRing)) card.visualRing = visualRing;
    const sizeText = body.replace(/<img\b[^>]*>/gi, ' ').match(/\d+(?:\.\d+)?(?:″|&quot;|")?\s*[×x]\s*\d{2}(?!\d)/i)?.[0];
    if (sizeText) card.sizeText = sizeText;
    cards.set(key, card);
  }
  return cards;
}

const byKey = parseStaticCards(html);
for (const [key, entryRaw] of Object.entries(live.entries || {})) {
  const entry = entryRaw && typeof entryRaw === 'object' ? entryRaw : {};
  byKey.set(key, { ...(byKey.get(key) || { key }), ...entry, key });
}
for (const [key, overrideRaw] of Object.entries(live.cards || {})) {
  const override = overrideRaw && typeof overrideRaw === 'object' ? overrideRaw : {};
  byKey.set(key, { ...(byKey.get(key) || { key }), ...override, key });
}

const state = {
  version: 3,
  cards: JSON.parse(JSON.stringify(live.cards || {})),
  sections: JSON.parse(JSON.stringify(live.sections || {})),
  entries: JSON.parse(JSON.stringify(live.entries || {}))
};
const cards = Array.from(byKey.values());
reconcileRecommendationSubsections(state, cards);

const membership = Object.fromEntries(
  state.sections.recommendationSubsections.map(section => [section.id, section.entryKeys])
);
const members = new Set(state.sections.recommendationSubsections.flatMap(section => section.entryKeys));
const unresolved = cards
  .filter(card => members.has(card.key) && resolveRingGauge(card, state) === null)
  .map(card => ({ key: card.key, subsection: state.cards?.[card.key]?.subsection || null }));

console.log('RECOMMENDATION_SUBSECTION_SEED_REPORT');
console.log(JSON.stringify({ membership, unresolvedRingCards: unresolved }, null, 2));
