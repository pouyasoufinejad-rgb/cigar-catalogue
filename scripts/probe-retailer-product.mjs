#!/usr/bin/env node
// Read-only: fetches retailer product pages named in PROBE_URLS and prints the title,
// price, availability and any size/blend text found on them.
//
// The sandbox egress proxy refuses .com.au, so an agent working there cannot read an
// Australian retailer page directly and would otherwise be guessing at price, packaging
// and dimensions. Running this in Actions reads the real listing. It writes nothing and
// needs no secrets.

import { extractRetailerPrice, detectAvailability } from '../src/stock.js';

const urls = String(process.env.PROBE_URLS || '').split(/[,\s]+/).map(v => v.trim()).filter(Boolean);
if (!urls.length) throw new Error('PROBE_URLS is required.');

const strip = html => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#(\d+);/g, (_all, code) => String.fromCharCode(Number(code)))
  .replace(/\s+/g, ' ')
  .trim();

for (const url of urls) {
  console.log(`\n=== ${url}`);
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' }
    });
  } catch (error) {
    console.log(`   FETCH_FAILED ${error.message}`);
    continue;
  }
  console.log(`   HTTP ${response.status} ${response.url}`);
  if (!response.ok) continue;
  const html = await response.text();
  const text = strip(html);

  console.log(`   TITLE ${(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()}`);
  console.log(`   H1 ${strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')}`);
  let price = null;
  try { price = extractRetailerPrice(html, url); } catch (error) { price = `(parser: ${error.message})`; }
  console.log(`   PARSED_PRICE ${JSON.stringify(price)}`);
  console.log(`   AVAILABILITY ${detectAvailability(html)}`);
  console.log(`   PRICES_ON_PAGE ${JSON.stringify([...new Set((text.match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || []))].slice(0, 14))}`);
  // Dimensions are what an agent most often gets wrong, so surface every candidate rather
  // than the first match.
  const sizes = [...new Set(text.match(/\b\d(?:[.¼½¾]|\s?\d\/\d|\.\d+)?\s?(?:"|”|''|in\b|inch(?:es)?)?\s?[x×X]\s?\d{2}\b/g) || [])];
  console.log(`   SIZE_CANDIDATES ${JSON.stringify(sizes.slice(0, 10))}`);
  console.log(`   PACK_CANDIDATES ${JSON.stringify([...new Set(text.match(/\b(?:tin|pack|box|bundle)\s+of\s+\d+|\b\d+\s?(?:pack|pk)\b|single\s+cigar/gi) || [])].slice(0, 10))}`);
  for (const field of ['wrapper', 'binder', 'filler', 'origin', 'country', 'strength', 'length', 'ring gauge', 'ring']) {
    const hit = text.match(new RegExp(`${field}\\s*[:\\-\\u2013]?\\s*([^.|]{2,70})`, 'i'));
    if (hit) console.log(`   ${field.toUpperCase().replace(/ /g, '_')} ${hit[1].trim()}`);
  }
  const body = text.replace(/^.*?(?=Liga|Drew|Undercrown)/s, '').slice(0, 700);
  console.log(`   TEXT ${body}`);
}
console.log('\nPROBE_COMPLETE_READ_ONLY');
