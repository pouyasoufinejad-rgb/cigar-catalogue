import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// AGENTS.md: catalogue-visible text must not say "Untasted" or use equivalent status
// filler. "(projected)" is that filler wearing a different word: it tells a reader nothing
// about the cigar, only about who wrote the line. Not claiming a cigar was tasted is
// enough, and saying so out loud is what the rule forbids.
const FILLER = /\b(untasted|projected|unverified taste|not (?:yet )?(?:tasted|smoked))\b/i;

test('the catalogue shell carries no tasting-status filler', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const chips = [...html.matchAll(/<span class="tag-chip">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.ok(chips.length > 100, `expected the Experience chips, found ${chips.length}`);
  const offenders = chips.filter(chip => FILLER.test(chip));
  assert.deepEqual(offenders, [], 'these chips describe their own provenance, not the cigar');

  // The eyebrow and note lines are the ones AGENTS.md names directly.
  for (const [, text] of html.matchAll(/<p class="mog-note[^"]*">([\s\S]*?)<\/p>/g)) {
    assert.ok(!FILLER.test(text), `note carries status filler: ${text.slice(0, 80)}`);
  }
});

// Requests written before the rule was enforced are a record of what was published, not a
// claim about what is true now. Rewriting them to pass a test would falsify that record;
// the live state is what the sweep and the shell test cover.
const ENFORCED_FROM = '2026-09-24';

test('no request written under the rule ships tasting-status filler', async () => {
  const dir = new URL('../catalogue-requests/', import.meta.url);
  const files = (await readdir(dir))
    .filter(name => name.endsWith('.json'))
    .filter(name => /^\d{4}-\d{2}-\d{2}/.test(name) && name.slice(0, 10) >= ENFORCED_FROM);
  assert.ok(files.length > 0, 'expected the recent requests');
  for (const name of files) {
    const body = JSON.parse(await readFile(new URL(name, dir), 'utf8'));
    const entry = body.entry || {};
    for (const chip of entry.experienceTags || []) {
      assert.ok(!FILLER.test(chip), `${name}: ${chip}`);
    }
    for (const field of ['noteHtml', 'summaryHtml', 'eyebrow']) {
      if (entry[field]) assert.ok(!FILLER.test(entry[field]), `${name} ${field}: ${entry[field].slice(0, 80)}`);
    }
  }
});


test('the live sweep strips only the marker, never the chip', async () => {
  const { stripFiller, cleanedTags, findAffected } =
    await import('../scripts/cleanup-live-status-filler.mjs');

  assert.equal(stripFiller('Nicotine: High (projected)'), 'Nicotine: High');
  assert.equal(stripFiller('Pairings: Coffee, dark chocolate, rum (projected)'),
    'Pairings: Coffee, dark chocolate, rum');
  assert.equal(stripFiller('Nicotine: High (untasted)'), 'Nicotine: High');
  // Content in brackets that is not a status marker has to survive.
  assert.equal(stripFiller('Occasion: Quick smoke (20 min)'), 'Occasion: Quick smoke (20 min)');
  assert.equal(stripFiller('Nicotine: Medium–High'), 'Nicotine: Medium–High');

  // A record with nothing to clean is not written to at all.
  assert.equal(cleanedTags(['Nicotine: High']), null);
  assert.equal(cleanedTags(undefined), null);
  assert.deepEqual(cleanedTags(['Nicotine: High (projected)', 'Occasion: Quick smoke']),
    ['Nicotine: High', 'Occasion: Quick smoke']);

  const state = {
    cards: { clean: { experienceTags: ['Nicotine: High'] } },
    entries: { dirty: { experienceTags: ['Nicotine: Mild (projected)'] } }
  };
  assert.deepEqual(findAffected(state), [{ key: 'dirty', tags: ['Nicotine: Mild'] }]);
});

test('the publish workflow runs the sweep', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/publish-catalogue.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node scripts\/cleanup-live-status-filler\.mjs/);
  // On every publish, not only when the script itself changes, or a later request could
  // reintroduce the filler and nothing would catch it.
  assert.match(workflow, /filler_cleanup_changed\}" == "true" \]\] \|\| \(\( \$\{#files\[@\]\} > 0 \)\)/);
});
