#!/usr/bin/env node
// Read-only: reports how many served cards actually draw a flavour profile, and whether
// every mask the page asks for exists.
//
// A card with no profile draws nothing by design, so "I see no bars" and "the feature is
// broken" look identical from the outside. This separates them: it counts the cards that
// carry a profile and names them.

import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import { FLAVOUR_AXES } from '../public/catalogue-flavour-axes.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

const page = await fetch(`${baseUrl}/?flavour_verify=${Date.now()}`, { cache: 'no-store' });
if (!page.ok) throw new Error(`Page read failed with HTTP ${page.status}.`);
const html = await page.text();

const cards = html.match(/<article\b[^>]*\bclass=["'][^"']*\bcard\b[^"']*["'][\s\S]*?<\/article>/gi) || [];
const withProfile = cards.filter(card => card.includes('flavour-profile'));
console.log(`CARDS ${cards.length} WITH_PROFILE ${withProfile.length}`);

for (const card of withProfile) {
  const key = card.match(/data-key=["']([^"']+)["']/)?.[1] || '(static card)';
  const axes = [...card.matchAll(/data-axis=["']([a-z]+)["']/g)].map(m => m[1]);
  const filled = (card.match(/flavour-pip is-on/g) || []).length;
  console.log(`  ${key} axes=${axes.join(',')} filledPips=${filled}`);
}

// A mask the page references but the deploy does not carry would render as an empty box.
const referenced = [...new Set([...html.matchAll(/\/art\/flavour\/([a-z]+-[0-9a-f]{8}\.png)/g)].map(m => m[1]))];
console.log(`MASKS_REFERENCED ${referenced.length}`);
for (const name of referenced) {
  const response = await fetch(`${baseUrl}/art/flavour/${name}`, { method: 'HEAD' });
  console.log(`  ${name} HTTP ${response.status} ${response.headers.get('content-type') || ''}`);
}
const missingAxes = FLAVOUR_AXES.filter(axis => axis.mask && !html.includes(axis.mask.split('/').pop()));
console.log(`AXES_NEVER_REFERENCED ${missingAxes.map(a => a.id).join(',') || 'none'}`);
console.log('FLAVOUR_PROFILE_VERIFY_COMPLETE_READ_ONLY');
