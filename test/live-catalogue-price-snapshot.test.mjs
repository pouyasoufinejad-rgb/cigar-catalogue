import test from 'node:test';
import assert from 'node:assert/strict';

function text(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : '';
}

test('print current production catalogue prices for audit', async () => {
  const response = await fetch('https://cigar-catalogue.psncodex.workers.dev/', {
    headers: { accept: 'text/html' }
  });
  assert.equal(response.ok, true, `production catalogue returned ${response.status}`);
  const html = await response.text();
  const rows = [];
  const rx = /<article\b([^>]*\bdata-key=(?:"[^"]+"|'[^']+')[^>]*)>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = rx.exec(html))) {
    const opening = match[1];
    const body = match[2];
    if (attr(opening, 'data-archived') === '1') continue;
    const key = attr(opening, 'data-key');
    const h3 = body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '';
    const brand = text(h3.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const title = text(h3.replace(/<span\b[^>]*>[\s\S]*?<\/span>/i, ''));
    const facts = [...body.matchAll(/<div><b>A\$([^<]+)<\/b><small>([^<]*)<\/small><\/div>/gi)];
    const links = [...body.matchAll(/<a\b([^>]*\bclass=(?:"[^"]*\bshop\b[^"]*"|'[^']*\bshop\b[^']*')[^>]*)>([\s\S]*?)<\/a>/gi)]
      .map(item => ({ url: attr(item[1], 'href'), label: text(item[2]) }));
    rows.push({
      key,
      brand,
      title,
      taster: attr(opening, 'data-taster') === '1',
      stock: attr(opening, 'data-stock') || 'unknown',
      displayedPackagePrice: facts[0] ? Number(String(facts[0][1]).replace(/,/g, '')) : null,
      packageLabel: facts[0] ? text(facts[0][2]) : '',
      displayedPerStickPrice: facts[1] ? Number(String(facts[1][1]).replace(/,/g, '')) : null,
      retailerLinks: links
    });
  }
  console.log('LIVE_CATALOGUE_PRICE_SNAPSHOT=' + JSON.stringify(rows));
  assert.ok(rows.length > 20, `expected full catalogue, got ${rows.length} cards`);
});

// Final production readback after all sequential price-audit replays.
