#!/usr/bin/env node
// Read-only: compares an image the repository ships against the bytes production serves.
//
// A committed asset and a served asset are different things. A publish can carry a new
// imageUrl while the asset behind it is still the old file, or a cached edge copy can keep
// serving the previous bytes at the same URL. Only fetching it settles which one a reader
// gets, and the sandbox proxy refuses the Worker host, so this runs in Actions.
//
// Compares by size and by pixel dimensions read from the WebP header, since "blurry" shows
// up as a smaller image scaled into the same slot.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const paths = String(process.env.ASSET_PATHS || 'public/variant-images/lfd-double-ligero-chiselito-natural.webp')
  .split(/[,\s]+/).map(value => value.trim()).filter(Boolean);

// Enough of the WebP container to read the dimensions of the lossy, lossless and extended
// forms. Anything else reports unknown rather than guessing.
function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const format = buffer.toString('ascii', 12, 16);
  if (format === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (format === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8X') {
    return {
      width: 1 + (buffer.readUIntLE(24, 3)),
      height: 1 + (buffer.readUIntLE(27, 3))
    };
  }
  return null;
}

const describe = buffer => {
  const size = buffer.length;
  const dimensions = webpDimensions(buffer);
  return `${size} bytes${dimensions ? `, ${dimensions.width}x${dimensions.height}` : ', dimensions unknown'}`;
};

let failures = 0;
for (const path of paths) {
  const served = `/${path.replace(/^public\//, '')}`;
  console.log(`\n=== ${path}`);

  let local;
  try {
    local = await readFile(resolve(process.cwd(), path));
  } catch (error) {
    console.error(`   FAIL the repository does not have this file: ${error.message}`);
    failures += 1;
    continue;
  }
  console.log(`   REPO   ${describe(local)}`);

  const url = `${baseUrl}${served}?asset_check=${Date.now()}`;
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (error) {
    console.error(`   FAIL could not fetch ${served}: ${error.message}`);
    failures += 1;
    continue;
  }
  if (!response.ok) {
    console.error(`   FAIL ${served} returned HTTP ${response.status}`);
    failures += 1;
    continue;
  }
  const remote = Buffer.from(await response.arrayBuffer());
  console.log(`   LIVE   ${describe(remote)}  (cf-cache-status: ${response.headers.get('cf-cache-status') ?? 'absent'})`);

  if (remote.equals(local)) {
    console.log('   MATCH  production serves exactly the committed bytes');
    continue;
  }
  console.error('   FAIL   production is serving different bytes from the committed asset');
  const localDimensions = webpDimensions(local);
  const remoteDimensions = webpDimensions(remote);
  if (localDimensions && remoteDimensions && remoteDimensions.width < localDimensions.width) {
    console.error(`   the served image is smaller (${remoteDimensions.width}px vs ${localDimensions.width}px), which is what a blurry card looks like`);
  }
  failures += 1;
}

// Which live records point at this asset, and with what cache-busting query. Serving the
// right bytes is only half of it: a browser holding the old file under the bare URL keeps
// showing it until the stored URL changes.
const state = await fetch(`${baseUrl}/api/catalogue-overrides?asset_refs=${Date.now()}`,
  { headers: { accept: 'application/json' }, cache: 'no-store' })
  .then(response => (response.ok ? response.json() : null))
  .catch(() => null);

if (state) {
  for (const path of paths) {
    const basename = path.split('/').pop();
    const found = new Set();
    const walk = (node, trail) => {
      if (typeof node === 'string') {
        if (node.includes(basename)) found.add(`${trail} -> ${node}`);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) walk(value, `${trail}.${key}`);
    };
    walk(state.cards, 'cards');
    walk(state.entries, 'entries');
    console.log(`\n=== live references to ${basename}`);
    if (!found.size) console.log('   (none: no catalogue record points at this asset)');
    for (const line of found) console.log(`   ${line}`);
  }
} else {
  console.log('\n(could not read live catalogue state to list references)');
}

if (failures) {
  console.error(`\nASSET_CHECK_FAILED: ${failures} asset(s) do not match production.`);
  process.exitCode = 1;
} else {
  console.log('\nASSET_CHECK_PASSED: production serves the committed image bytes.');
}
