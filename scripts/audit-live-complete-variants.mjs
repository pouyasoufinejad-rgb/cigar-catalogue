import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'https://cigar-catalogue.psncodex.workers.dev';
const requestPaths = [
  'catalogue-requests/2026-09-27-repair-chiselito-complete-variant.json',
  'catalogue-requests/2026-09-27-repair-cubanitos-complete-variant.json',
  'catalogue-requests/2026-09-27-repair-davidoff-primeros-natural-complete-variant.json',
  'catalogue-requests/2026-09-27-repair-exquisitos-complete-variant.json',
  'catalogue-requests/2026-09-27-repair-isla-del-sol-gran-corona-complete-variant.json',
  'catalogue-requests/2026-09-27-repair-undercrown-10-complete-variant.json',
  'catalogue-requests/2026-09-27-repair-wise-man-corojo-corona-complete-variant.json',
  'catalogue-requests/2026-09-27-repair-wise-man-lancero-complete-variant.json'
];

const requests = await Promise.all(requestPaths.map(async path => JSON.parse(await readFile(path, 'utf8'))));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(BASE + '/?integrity_audit=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const state = await page.evaluate(async () => {
    const r = await fetch('/api/catalogue-overrides?verify=1', { cache: 'no-store' });
    if (!r.ok) throw new Error('state HTTP ' + r.status);
    return r.json();
  });

  const own = (o,k) => Object.prototype.hasOwnProperty.call(o||{},k);
  const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const mismatches = [];

  for (const req of requests) {
    const key = req.key;
    const entry = state.entries?.[key] || {};
    const card = state.cards?.[key] || {};
    const byId = new Map();
    for (const v of Array.isArray(entry.blendVariants) ? entry.blendVariants : []) byId.set(v.id, { ...v });
    for (const v of Array.isArray(card.blendVariants) ? card.blendVariants : []) byId.set(v.id, { ...(byId.get(v.id)||{}), ...v });

    for (const expected of req.entry?.blendVariants || []) {
      const live = byId.get(expected.id);
      if (!live) {
        mismatches.push({ key, variant: expected.id, field: '__variant__', expected: 'present', live: null });
        continue;
      }
      for (const [field, expectedValue] of Object.entries(expected)) {
        if (field === 'flavourProfile') continue;
        if (!eq(live[field], expectedValue)) {
          mismatches.push({ key, variant: expected.id, field, expected: expectedValue, live: own(live,field) ? live[field] : '__MISSING__' });
        }
      }
    }
  }

  console.log('COMPLETE_VARIANT_INTEGRITY_MISMATCHES ' + mismatches.length);
  console.log(JSON.stringify(mismatches, null, 2));
  if (mismatches.length) process.exitCode = 2;
} finally {
  await browser.close();
}
