#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BASE_URL,
  publishRequestFile
} from './publish-catalogue-request.mjs';

function sanitiseBody(text) {
  return String(text || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
}

export async function fetchLiveCatalogueHtml(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const response = await fetchImpl(`${baseUrl}/?catalogue_source=rankings`, {
    method: 'GET',
    headers: { accept: 'text/html' },
    cache: 'no-store'
  });
  if (!response.ok) {
    const body = sanitiseBody(await response.text().catch(() => ''));
    throw new Error(`Live catalogue source failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }
  const html = await response.text();
  if (!/<article\b[^>]*\bdata-key=["'][^"']+["'][^>]*>/i.test(html)) {
    throw new Error('Live catalogue source did not contain catalogue cards.');
  }
  return html;
}

export async function publishLiveCatalogueRequestFile(requestPath, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const indexPath = resolve(repoRoot, 'public/index.html');
  const originalHtml = await readFile(indexPath, 'utf8');
  const liveHtml = await fetchLiveCatalogueHtml({ fetchImpl, baseUrl });

  try {
    await writeFile(indexPath, liveHtml, 'utf8');
    return await publishRequestFile(requestPath, {
      ...options,
      fetchImpl,
      baseUrl,
      repoRoot,
      includeStaticCatalogue: true
    });
  } finally {
    await writeFile(indexPath, originalHtml, 'utf8');
  }
}

async function main(argv) {
  const requestPath = argv[2];
  if (!requestPath) throw new Error('Usage: node scripts/publish-live-catalogue-request.mjs <catalogue-requests/request.json>');
  const result = await publishLiveCatalogueRequestFile(requestPath);
  const subject = result.key ? ` for ${result.key}` : '';
  console.log(`Published ${result.operation}${subject} from live catalogue state; KV and production rendering verified.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && invokedPath === thisPath) {
  main(process.argv).catch(error => {
    console.error(`Catalogue publication failed: ${error.message}`);
    process.exitCode = 1;
  });
}
