import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationCohortForMainCard } from '../public/catalogue-recommendation-cohorts.mjs';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function merged(state, key) {
  return {
    ...(isRecord(state.entries?.[key]) ? state.entries[key] : {}),
    ...(isRecord(state.cards?.[key]) ? state.cards[key] : {})
  };
}

function typeOf(source) {
  const explicit = String(source.catalogueType || '').trim().toLowerCase();
  if (explicit === 'half' || explicit === 'half-cigar' || explicit === 'halfcigar') return 'half';
  if (explicit === 'taster' || source.taster === true) return 'taster';
  return 'main';
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : null;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sectionSummary(html) {
  const out = [];
  const rx = /<section\b([^>]*)>([\s\S]*?)(?=<section\b|$)/gi;
  let m;
  while ((m = rx.exec(html))) {
    const attrs = m[1];
    const body = m[2];
    const heading = body.match(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/i)?.[1] || '';
    const keys = [...body.matchAll(/<article\b[^>]*\bdata-key=["']([^"']+)["'][^>]*>/gi)].map(x => x[1]);
    if (!keys.length && !heading) continue;
    out.push({
      heading: stripTags(heading),
      tier: attrs.match(/data-tier-section=["']([^"']+)/i)?.[1] || '',
      recommendationCohort: attrs.match(/data-recommendation-cohort=["']([^"']+)/i)?.[1] || '',
      noteworthy: attrs.match(/data-noteworthy-section=["']([^"']+)/i)?.[1] || '',
      keys
    });
  }
  return out;
}

test('read-only live ranking diagnostic', async () => {
  const [stateResponse, htmlResponse] = await Promise.all([
    fetch(`${BASE}/api/catalogue-overrides`, { headers: { accept: 'application/json' }, cache: 'no-store' }),
    fetch(`${BASE}/?catalogue_source=diagnostic`, { headers: { accept: 'text/html' }, cache: 'no-store' })
  ]);
  assert.equal(stateResponse.status, 200);
  assert.equal(htmlResponse.status, 200);
  const state = await stateResponse.json();
  const html = await htmlResponse.text();

  const keys = [...new Set([
    ...Object.keys(state.entries || {}),
    ...Object.keys(state.cards || {})
  ])].sort();

  const rows = keys.map(key => {
    const source = merged(state, key);
    const type = typeOf(source);
    const productionText = [
      ...(Array.isArray(source.productionLines) ? source.productionLines : []),
      source.productionHtml || ''
    ].join(' ');
    const explicitFlavoured = typeof source.flavoured === 'boolean'
      ? source.flavoured
      : (typeof source.infused === 'boolean' ? source.infused : null);
    const computedCohort = type === 'main' && source.archived !== true && String(source.stockPin || source.stock || '').toLowerCase() !== 'out'
      ? recommendationCohortForMainCard({ key, ring: source.ring, productionText, explicitFlavoured })
      : '';
    return {
      key,
      brand: source.brand || '',
      title: source.title || '',
      type,
      archived: source.archived === true,
      rank: positive(source.rank),
      archivedRank: positive(source.archivedRank),
      recommendationCohort: source.recommendationCohort || '',
      recommendationRank: positive(source.recommendationRank),
      computedCohort,
      ring: Number(source.ring) || 0,
      stockPin: source.stockPin || '',
      stock: source.stock || '',
      taster: source.taster === true
    };
  });

  const ranked = rows.filter(row => row.rank || row.archivedRank || row.recommendationRank || row.recommendationCohort || row.computedCohort);
  const byComputed = Object.fromEntries(['coronets', 'petit-panatelas', 'flavoured'].map(cohort => [
    cohort,
    ranked.filter(row => row.computedCohort === cohort).sort((a, b) => (a.recommendationRank ?? 9999) - (b.recommendationRank ?? 9999) || (a.rank ?? 9999) - (b.rank ?? 9999) || a.key.localeCompare(b.key))
  ]));

  console.log('LIVE_RANKING_DIAGNOSTIC ' + JSON.stringify({
    version: state.version,
    ranked,
    byComputed,
    sections: sectionSummary(html)
  }));
});
