import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateRequest } from '../scripts/publish-catalogue-request.mjs';

const EXPECTED_LINKS = {
  'liga-privada-no-9-coronets': [
    'https://www.cigarhut.com.au/liga-privada-no-9-coronets-tins-10-cigars/',
    'https://firmincigars.com.au/product/drew-estate-liga-privada-no-9-coronets-10s-nicaragua/',
    'https://www.cigarworld.com.au/aud/products/liga-privada-no.9-coronet-%284%22-x-32%29-%252d-tin-of-10.html'
  ],
  'liga-t52-coronets': [
    'https://www.cigarhut.com.au/liga-privada-t52-coronets-tins-10-cigars/',
    'https://firmincigars.com.au/product/drew-estate-liga-privada-t52-coronets-single-cigar-nicaragua/',
    'https://www.cigarworld.com.au/aud/products/liga-privada-t52-coronet-%284%22-x-32%29-%252d-single.html'
  ],
  'undercrown-maduro-coronets': [
    'https://www.cigarhut.com.au/undercrown-maduro-coronets/',
    'https://www.cigarworld.com.au/aud/products/drew-estate-undercrown-maduro-coronet-%284%22-x-32%29-%252d-tin-of-10.html',
    'https://www.theindexcigars.com.au/products/undercrown-maduro-coronet-tin-of-10'
  ],
  'rocky-patel-sun-grown-juniors': [
    'https://www.cigarhut.com.au/rocky-patel-sun-grown-juniors-pack-of-5/',
    'https://cigarbox.com.au/products/rocky-pate-sun-grown-juniors-tin-of-5-4-x-38rg',
    'https://www.theindexcigars.com.au/products/rocky-patel-sun-grown-juniors'
  ],
  'tabernacle-broadleaf-corona': [
    'https://www.cigarhut.com.au/the-tabernacle-broadleaf-corona/',
    'https://www.theindexcigars.com.au/products/the-tabernacle-corona'
  ],
  'toscano-antico-half': [
    'https://www.cigarworld.com.au/aud/products/toscano-antico-%286%22-x-38%29-%252d-pack-of-5.html',
    'https://www.cigarhut.com.au/toscano-antico/',
    'https://cigarbox.com.au/products/toscani-antico-toscano-italian-pack-of-5',
    'https://www.theindexcigars.com.au/products/toscano-antico'
  ],
  'arturo-fuente-exquisitos-maduro': [
    'https://www.cigarhut.com.au/arturo-fuente-exquisitos_maduro/',
    'https://www.cigarworld.com.au/aud/products/arturo-fuente-exquisitos-maduro-%252d-single-%252d-%284-1%7B47%7D2%22-x-33%29.html',
    'https://cigarbox.com.au/products/arturo-fuente-exquisitos-4-5-x-33rg-1',
    'https://www.theindexcigars.com.au/products/arturo-fuente-exquisitos-maduro'
  ],
  'kfc-ponies': [
    'https://www.theindexcigars.com.au/collections/kentucky-fire-cured/products/kentucky-fire-cured-ponies?variant=45691606925561',
    'https://www.cigarhut.com.au/kfc-ponies/'
  ],
  'ashton-aged-maduro-esquire': [
    'https://firmincigars.com.au/product/ashton-esquire-10s-dominican-republic/',
    'https://cigarbox.com.au/products/ashton-aged-maduro-esquire-maduro-chicos-pack-of-10-4-25-x-32rg'
  ],
  'aj-fernandez-new-world-oscuro': [
    'https://www.cigarworld.com.au/aud/products/new-world-oscuro-pack-by-aj-fernandez-%252d-%284-x-36%29-%252d-pack-of-5.html'
  ],
  'oliva-serie-g-maduro-special-g': [
    'https://cigarbox.com.au/products/oliva-serie-g-maduro-special-g-3-7-x-48rg',
    'https://www.theindexcigars.com.au/collections/all/products/oliva-serie-g-special-g-maduro',
    'https://www.cigarworld.com.au/aud/products/oliva-%252d-%28serie-g%29-special-g-maduro-%252d-single-%252d-%283.75%22-x-48%29.html'
  ],
  'oliva-serie-o': [
    'https://www.theindexcigars.com.au/collections/all/products/oliva-serie-o-cigarillo?variant=48503352262905',
    'https://www.cigarhut.com.au/oliva-serie-o-cigarillos-tin-of-5-habano/',
    'https://cigarbox.com.au/products/oliva-serie-o-cigarillos-tin-of-5-habano'
  ],
  'kfc-ponies-sweets': [
    'https://www.theindexcigars.com.au/collections/kentucky-fire-cured/products/kentucky-fired-cured-sweets-ponies?variant=45691607351545',
    'https://www.cigarhut.com.au/kentucky-fire-cured-ponies-sweets-tins/'
  ],
  'cohiba-short-10': [
    'https://www.cigarhut.com.au/cohiba-short/',
    'https://www.cigarworld.com.au/aud/products/cohiba-short-%252d-packet-of-10-%252d-%283-1%7B47%7D4%22-x-28%29.html',
    'https://firmincigars.com.au/product/cohiba-short-cigars-10s-cuba/',
    'https://www.theindexcigars.com.au/products/cohiba-short'
  ],
  'davidoff-escurio-petit-robusto': [
    'https://www.cigarhut.com.au/davidoff-escurio-petit-robusto/',
    'https://www.cigarworld.com.au/aud/products/davidoff-escurio-petite-robusto-%252d-single-%252d-%283-1%7B47%7D4-x-50%29.html',
    'https://firmincigars.com.au/product/davidoff-escurio-petit-robusto-dominican-republic/'
  ],
  'oliva-serie-v-melanio-no4': [
    'https://cigarbox.com.au/products/oliva-serie-v-melanio-4-petit-corona-4-5-x-46rg',
    'https://www.cigarhut.com.au/oliva-serie-v-melanio-no-4/'
  ],
  'rocky-patel-disciple-half-corona': [
    'https://www.theindexcigars.com.au/products/rocky-patel-disciple-half-corona',
    'https://www.cigarhut.com.au/rocky-patel-disciple-half-corona/',
    'https://cigarbox.com.au/products/rocky-patel-disciple-half-corona-3-5-x-46rg-1'
  ],
  'cohiba-short-single': [
    'https://www.cigarworld.com.au/aud/products/cohiba-short-%252d-single-%252d-%283-1%7B47%7D4%22-x-28%29.html',
    'https://www.cigarhut.com.au/cohiba-short/',
    'https://www.theindexcigars.com.au/products/cohiba-short'
  ],
  'isla-del-sol-maduro-gran-corona': [
    'https://www.cigarhut.com.au/isla-del-sol-maduro-gran-corona/',
    'https://www.cigarworld.com.au/aud/products/isla-del-sol-%252d-maduro-%252d-gran-corona-%285-x-44%29-single.html'
  ]
};

test('retailer-link audit requests publish the verified complete URL lists', async () => {
  for (const [key, expectedLinks] of Object.entries(EXPECTED_LINKS)) {
    const path = new URL(`../catalogue-requests/2026-08-31-retailer-links-${key}.json`, import.meta.url);
    const request = validateRequest(JSON.parse(await readFile(path, 'utf8')));

    assert.equal(request.operation, 'upsert-entry', key);
    assert.equal(request.key, key);
    assert.deepEqual(request.entry.retailerLinks, expectedLinks, key);

    const hosts = expectedLinks.map(url => new URL(url).hostname.replace(/^www\./, ''));
    assert.equal(new Set(hosts).size, hosts.length, `${key} has duplicate retailer hosts`);
  }
});
