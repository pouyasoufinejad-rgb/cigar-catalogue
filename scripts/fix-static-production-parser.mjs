import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/publish-catalogue-request.mjs';
const source = await readFile(path, 'utf8');
const before = `    const production = scrubbed.match(/<[^>]*class=["'][^"']*artmeta-left[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i)?.[1] || '';
    card.productionLines = Array.from(production.matchAll(/<[^>]*class=["'][^"']*artmeta-line[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>/gi), line =>
      line[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim()
    ).filter(Boolean);`;
const after = `    const productionStart = scrubbed.search(/<[^>]*class=["'][^"']*artmeta-left[^"']*["'][^>]*>/i);
    const productionTail = productionStart >= 0 ? scrubbed.slice(productionStart) : '';
    const practicalStart = productionTail.search(/<[^>]*class=["'][^"']*artmeta-right[^"']*["'][^>]*>/i);
    const production = practicalStart >= 0 ? productionTail.slice(0, practicalStart) : productionTail;
    card.productionLines = Array.from(production.matchAll(/<[^>]*class=["'][^"']*artmeta-line[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>/gi), line =>
      line[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim()
    ).filter(Boolean);`;

if (!source.includes(before)) {
  if (source.includes(after)) {
    console.log('Static production parser already patched.');
    process.exit(0);
  }
  throw new Error('Expected static production parser block not found exactly once.');
}
if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error('Static production parser block matched more than once.');
await writeFile(path, source.replace(before, after));
console.log('Patched static Production block extraction.');
