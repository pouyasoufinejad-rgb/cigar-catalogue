#!/usr/bin/env node
// Splits every static card in the page into a front and a back face.
//
// The 45 cards written directly into index.html predate dynamic entries, so the Worker's
// renderer never touches them. Doing this in the browser instead would mean the prose
// flashed on the front of every card before being moved, which is the stale-shell problem
// this page has already been through once.
//
// Parsed rather than pattern-matched: .tag-groups nests three levels of div, and a
// non-greedy regex closes it at the wrong </div>.
//
// Run with --write to apply; --check exits non-zero if the page still has a card to split.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  BACK_CLASS,
  BACK_FACE_SELECTORS,
  FACES_CLASS,
  FRONT_CLASS,
  flipControlMarkup
} from '../public/catalogue-card-faces.mjs';

const pageUrl = new URL('../public/index.html', import.meta.url);

function cardKey(card, index) {
  const explicit = card.getAttribute('data-key');
  if (explicit) return explicit;
  // Static cards carry no key. The heading is what the reader sees, so it is what the
  // control's aria-controls should be derived from, with the index to keep it unique.
  const heading = card.querySelector('h3')?.textContent || '';
  const slug = heading.toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 72);
  return slug ? `${slug}-${index}` : `static-card-${index}`;
}

export function splitCard(card, document, index) {
  const body = card.querySelector('.cardbody');
  if (!body || body.querySelector(`:scope > .${FACES_CLASS}`)) return false;

  const key = cardKey(card, index);
  const faces = document.createElement('div');
  faces.className = FACES_CLASS;
  const front = document.createElement('div');
  front.className = FRONT_CLASS;
  const back = document.createElement('div');
  back.className = BACK_CLASS;
  back.id = `card-back-${key}`;

  // Everything stays in document order. The back takes only the named nodes; the front
  // takes the rest, so nothing is dropped whatever else a card happens to carry.
  for (const node of [...body.childNodes]) {
    const isBack = node.nodeType === 1
      && BACK_FACE_SELECTORS.some(selector => node.matches(selector));
    (isBack ? back : front).appendChild(node);
  }

  faces.append(front, back);
  body.appendChild(faces);
  body.insertAdjacentHTML('beforeend', flipControlMarkup(key));
  return true;
}

// Card regions in source order. Articles do not nest, so a scan for the opening tag and
// its closer is exact, and it works across the multi-line opening tags the page uses.
export function cardRegions(html) {
  const regions = [];
  const open = /<article\b[^>]*\bclass=["'][^"']*\bcard\b[^"']*["'][^>]*>/gi;
  let match;
  while ((match = open.exec(html))) {
    const end = html.indexOf('</article>', match.index);
    if (end < 0) continue;
    regions.push({ start: match.index, end: end + '</article>'.length });
    open.lastIndex = end;
  }
  return regions;
}

export function splitAll(html) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const cards = [...document.querySelectorAll('article.card')];
  let split = 0;
  cards.forEach((card, index) => { if (splitCard(card, document, index)) split += 1; });

  // Only the cards are rewritten. Serialising the whole document would also renormalise
  // every unrelated attribute in the page, which is a large diff to review for no gain.
  const regions = cardRegions(html);
  if (regions.length !== cards.length) {
    throw new Error(`Found ${regions.length} card regions in the source but ${cards.length} parsed cards; refusing to splice.`);
  }
  let output = '';
  let cursor = 0;
  regions.forEach((region, index) => {
    output += html.slice(cursor, region.start) + cards[index].outerHTML;
    cursor = region.end;
  });
  output += html.slice(cursor);
  return { html: output, cards: cards.length, split };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = await readFile(pageUrl, 'utf8');
  const result = splitAll(html);
  console.log(`${result.cards} static card(s), ${result.split} split`);

  if (process.argv.includes('--check')) {
    if (result.split) {
      console.error('index.html still has cards without faces; run with --write');
      process.exit(1);
    }
    console.log('every static card already has faces');
    process.exit(0);
  }
  if (!result.split) { console.log('nothing to do'); process.exit(0); }
  if (!process.argv.includes('--write')) { console.log('(dry run, pass --write)'); process.exit(0); }
  await writeFile(pageUrl, result.html);
  console.log('written');
}
