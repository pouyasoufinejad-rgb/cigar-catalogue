#!/usr/bin/env node
// One-shot content fix: give each variant whose inherited summary names a different size
// its own copy.
//
// A variant with no summaryHtml inherits the card's, and the card's was written about the
// default size. Selecting the Toro on Undercrown 10 printed "At 5in x 43 it is narrow
// enough" above a facts line reading 6in x 52. Ten variants were doing this.
//
// It merges into the live sizeVariants array rather than restating it, because a patch
// replaces that array wholesale and restating six large arrays by hand is how variants get
// silently dropped. Only summaryHtml and noteHtml are set, and only on the named variant.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BASE_URL, publishRequestDocument } from './publish-catalogue-request.mjs';
import { inheritedSizeConflicts } from './audit-variant-copy.mjs';

// Blend facts are reused from each card's own copy; only the format commentary is new.
export const COPY = {
  'davidoff-winston-churchill-petite-panatela': {
    'petit-corona': {
      summaryHtml: '<strong>Wood, chocolate, coffee, warm spice and dried-fruit sweetness</strong> carry through the Winston Churchill line from its Ecuadorian Habano Rojiza wrapper, Mexican San Andrés Oscuro binder and Dominican and Nicaraguan filler. At 4½″ × 41 the Petit Corona is the classic short corona of the range, with enough length for the savoury spice to develop past the first third while the narrow ring keeps the wrapper’s sweetness in front of the filler.',
      noteHtml: 'At 4½″ × 41 the Petit Corona gives the blend room to develop past the first third while the narrow ring keeps the wrapper forward.'
    },
    robusto: {
      summaryHtml: '<strong>Wood, chocolate, coffee, warm spice and dried-fruit sweetness</strong> carry through the Winston Churchill line from its Ecuadorian Habano Rojiza wrapper, Mexican San Andrés Oscuro binder and Dominican and Nicaraguan filler. At 5½″ × 52 the Robusto is the fullest-bodied way to take the blend: the wide ring slows the burn and pushes the San Andrés binder’s earth and pepper forward, with the wrapper’s dried fruit arriving later than in the smaller sizes.',
      noteHtml: 'At 5½″ × 52 the wide ring slows the burn and pushes the binder’s earth and pepper ahead of the wrapper’s dried fruit.'
    },
    churchill: {
      summaryHtml: '<strong>Wood, chocolate, coffee, warm spice and dried-fruit sweetness</strong> carry through the Winston Churchill line from its Ecuadorian Habano Rojiza wrapper, Mexican San Andrés Oscuro binder and Dominican and Nicaraguan filler. At 6⅞″ × 47 the Churchill is the longest format in the line, and that length separates the smoke into three clear thirds: cedar and coffee early, savoury spice through the middle, then a denser and sweeter finish.',
      noteHtml: 'At 6⅞″ × 47 the length separates the smoke into three clear thirds rather than the single arc of the compact sizes.'
    }
  },
  'aj-fernandez-new-world-cameroon-short-robusto': {
    'double-robusto': {
      summaryHtml: '<strong>Cedar, sweet spice, cinnamon, roasted nuts, cocoa and a floral top note</strong> are the signature of the Cameroon Selection, the only New World blend to use an African Cameroon wrapper over AJ Fernandez’s Estelí-grown Nicaraguan binder and filler. At 5½″ × 54 the Double Robusto trades the Short Robusto’s concentration for volume, and the wide ring produces a cooler, thicker smoke that sets the cinnamon and floral notes alongside the roasted nuts rather than behind them.',
      noteHtml: 'At 5½″ × 54 the wide ring produces a cooler, thicker smoke than the Short Robusto, with the aromatic notes alongside the nuts rather than behind them.'
    },
    toro: {
      summaryHtml: '<strong>Cedar, sweet spice, cinnamon, roasted nuts, cocoa and a floral top note</strong> are the signature of the Cameroon Selection, the only New World blend to use an African Cameroon wrapper over AJ Fernandez’s Estelí-grown Nicaraguan binder and filler. At 6″ × 50 the Toro is the longest of the three formats, and the extra length lets the Cameroon wrapper move from its sweet, aromatic opening into the roasted-nut and cocoa centre at its own pace.',
      noteHtml: 'At 6″ × 50 the extra length lets the wrapper move from its aromatic opening into the roasted-nut centre at its own pace.'
    }
  },
  'aj-fernandez-new-world-oscuro': {
    toro: {
      summaryHtml: '<strong>Dark tobacco, espresso, cocoa, earth and black pepper</strong> are the centre of this Nicaraguan blend, built on a dark Nicaraguan wrapper over a Jalapa binder with Ometepe, Condega and Estelí fillers. At 6½″ × 55 the Toro is a far longer and wider smoke than the compact petit corona: the added volume cools the pepper and gives the espresso and cocoa a longer run, at the cost of the small format’s immediacy.',
      noteHtml: 'At 6½″ × 55 the added volume cools the pepper and gives the espresso and cocoa a longer run than the compact format allows.'
    }
  },
  'foundation-charter-oak-maduro-rothschild': {
    'petite-corona': {
      summaryHtml: '<strong>Dark chocolate, espresso, molasses, cedar, earth and black pepper</strong> come from the Connecticut Broadleaf wrapper over a Nicaraguan Habano binder and Nicaraguan filler. At 5¼″ × 42 the Petite Corona is the narrowest format in the line, and the tighter ring concentrates the Broadleaf’s sweetness and pepper rather than the filler’s earth.',
      noteHtml: 'At 5¼″ × 42 the tighter ring concentrates the Broadleaf’s sweetness and pepper rather than the filler’s earth.'
    },
    grande: {
      summaryHtml: '<strong>Dark chocolate, espresso, molasses, cedar, earth and black pepper</strong> come from the Connecticut Broadleaf wrapper over a Nicaraguan Habano binder and Nicaraguan filler. At 6″ × 60 the Grande is the largest format in the line, and the very wide ring gives a cool, slow burn that favours the filler’s earth and cedar, with the molasses sweetness spread more thinly than in the compact sizes.',
      noteHtml: 'At 6″ × 60 the very wide ring favours the filler’s earth and cedar, with the molasses sweetness spread more thinly.'
    }
  },
  'rocky-patel-sun-grown-juniors': {
    robusto: {
      summaryHtml: '<strong>Earth, white pepper, cedar, molasses and roasted espresso</strong> give the Sun Grown line a dry, spicy-sweet profile with more edge than creaminess, led by its Ecuadorian Sumatra wrapper. At 5½″ × 50 the Robusto is a full-length smoke rather than a compact one, and the wider ring softens the white pepper that dominates the small format while giving the molasses and espresso a longer, rounder finish.',
      noteHtml: 'At 5½″ × 50 the wider ring softens the white pepper that dominates the compact format and lengthens the molasses finish.'
    }
  },
  'undercrown-10-corona-viva': {
    toro: {
      summaryHtml: '<strong>Black pepper, Mexican hot chocolate, earth, espresso, dried cherry and raisin sweetness</strong> define Undercrown 10, built on a dark San Andrés wrapper with long-filler construction. At 6″ × 52 the Toro is the full-size expression of the blend: the extra volume cools the pepper that leads the narrower Corona Viva and lets the cocoa and dried fruit hold the middle of the smoke.',
      noteHtml: 'At 6″ × 52 the extra volume cools the pepper that leads the narrower Corona Viva and lets the cocoa and dried fruit hold the middle.'
    }
  }
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Returns a new sizeVariants array with the copy applied, or null when nothing changed.
export function applyCopy(variants, copyForCard) {
  if (!Array.isArray(variants) || !isRecord(copyForCard)) return null;
  let touched = false;
  const next = variants.map(variant => {
    const copy = copyForCard[variant?.id];
    if (!copy) return variant;
    if (variant.summaryHtml === copy.summaryHtml && variant.noteHtml === copy.noteHtml) return variant;
    touched = true;
    return { ...variant, ...copy };
  });
  return touched ? next : null;
}

async function readLiveState(fetchImpl, baseUrl) {
  const response = await fetchImpl(`${baseUrl}/api/catalogue-overrides?copyfix=${Date.now()}`, {
    headers: { accept: 'application/json' }, cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Live state read failed with HTTP ${response.status}.`);
  return response.json();
}

export async function fixVariantCopy(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = String(options.baseUrl || process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = String(options.token || process.env.CATALOGUE_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required for publication.');
  const repoRoot = resolve(options.repoRoot || process.cwd());

  const published = [];
  for (const key of Object.keys(COPY)) {
    const state = await readLiveState(fetchImpl, baseUrl);
    const merged = { ...(state.cards?.[key] || {}), ...(state.entries?.[key] || {}) };
    const next = applyCopy(merged.sizeVariants, COPY[key]);
    if (!next) { console.log(`${key}: already current, nothing written.`); continue; }
    await publishRequestDocument(
      {
        id: `fix-variant-size-copy-${key}`,
        operation: 'upsert-entry',
        key,
        entry: { sizeVariants: next },
        note: 'Give each size variant copy about its own format instead of inheriting copy about the default size.'
      },
      { baseUrl, token, fetchImpl, repoRoot, now: options.now, sleep: options.sleep }
    );
    published.push(key);
    console.log(`${key}: wrote copy for ${Object.keys(COPY[key]).join(', ')}.`);
  }

  // Verify against the audit's own rule rather than trusting the writes.
  const finalState = await readLiveState(fetchImpl, baseUrl);
  const remaining = [];
  for (const [key, card] of Object.entries({ ...finalState.cards })) {
    const record = { ...card, ...(finalState.entries?.[key] || {}) };
    if (record.archived) continue;
    for (const variant of record.sizeVariants || []) {
      if (variant.summaryHtml) continue;
      const clash = inheritedSizeConflicts(record.summaryHtml, variant);
      if (clash) remaining.push(`${key}:${variant.id} (${variant.length}x${variant.ring} vs ${clash.length}x${clash.ring})`);
    }
  }
  if (remaining.length) {
    throw new Error(`Variant copy fix incomplete; still inheriting the wrong size: ${remaining.join(', ')}`);
  }
  console.log(`\nVariant copy verified: ${published.length} card(s) updated; no variant inherits copy about a different size.`);
  return published;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await fixVariantCopy();
