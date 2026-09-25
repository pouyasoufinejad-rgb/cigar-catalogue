#!/usr/bin/env node
// Strips tasting-status filler from every live Experience chip.
//
// AGENTS.md: catalogue-visible text must not say "Untasted" or use equivalent status
// filler. "(projected)" is that filler wearing a different word. It tells a reader nothing
// about the cigar, only about who wrote the line, and not claiming a cigar was tasted is
// already enough without announcing it.
//
// Only the marker is removed. The chip's actual content is left exactly as it was, so this
// cannot change what any card claims about a cigar.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BASE_URL, publishRequestDocument } from './publish-catalogue-request.mjs';

export const STATUS_FILLER = /\s*\((?:projected|untasted|unverified|estimated|inferred)\)\s*$/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stripFiller(chip) {
  return String(chip == null ? '' : chip).replace(STATUS_FILLER, '').trimEnd();
}

// Returns the cleaned list, or null when there was nothing to clean. Returning null is what
// keeps this from writing to a record it has no reason to touch.
export function cleanedTags(tags) {
  if (!Array.isArray(tags)) return null;
  const next = tags.map(stripFiller);
  return next.some((chip, index) => chip !== tags[index]) ? next : null;
}

export function findAffected(state) {
  const cards = isRecord(state?.cards) ? state.cards : {};
  const entries = isRecord(state?.entries) ? state.entries : {};
  const out = [];
  for (const key of [...new Set([...Object.keys(cards), ...Object.keys(entries)])].sort()) {
    const merged = { ...(cards[key] || {}), ...(entries[key] || {}) };
    const next = cleanedTags(merged.experienceTags);
    if (next) out.push({ key, tags: next });
  }
  return out;
}

async function readLiveState(fetchImpl, baseUrl) {
  const response = await fetchImpl(`${baseUrl}/api/catalogue-overrides?filler=${Date.now()}`, {
    headers: { accept: 'application/json' }, cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Live state read failed with HTTP ${response.status}.`);
  return response.json();
}

export async function cleanupStatusFiller(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = String(options.baseUrl || process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token || process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');
  const repoRoot = resolve(options.repoRoot || process.cwd());

  const affected = findAffected(await readLiveState(fetchImpl, baseUrl));
  console.log(`Found ${affected.length} catalogue card(s) with tasting-status filler in Experience.`);

  const published = [];
  for (const { key } of affected) {
    // Re-read per entry: earlier publishes in this loop change live state.
    const current = await readLiveState(fetchImpl, baseUrl);
    const merged = { ...(current?.cards?.[key] || {}), ...(current?.entries?.[key] || {}) };
    const tags = cleanedTags(merged.experienceTags);
    if (!tags) continue;
    await publishRequestDocument(
      {
        id: `cleanup-status-filler-${key}`,
        operation: 'upsert-entry',
        key,
        entry: { experienceTags: tags },
        note: 'Remove tasting-status filler from Experience chips; chip content is unchanged.'
      },
      { baseUrl, token, fetchImpl, repoRoot, now: options.now, sleep: options.sleep }
    );
    published.push(key);
    console.log(`Cleaned Experience chips for ${key}.`);
  }

  const remaining = findAffected(await readLiveState(fetchImpl, baseUrl));
  if (remaining.length) {
    throw new Error(`Status-filler cleanup verification failed; still present on: ${remaining.map(row => row.key).join(', ')}`);
  }
  console.log(`Status-filler cleanup verified: ${published.length} card(s) updated; none remain in live state.`);
  return published;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await cleanupStatusFiller();
}
