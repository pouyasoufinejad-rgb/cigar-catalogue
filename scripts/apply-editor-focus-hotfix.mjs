import { readFile, writeFile, rm } from 'node:fs/promises';

const target = 'public/catalogue-recommendation-subsections.mjs';
let source = await readFile(target, 'utf8');

function replaceExact(before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing expected ${label} source`);
  source = source.replace(before, after);
}

replaceExact(
`  if (label) label.textContent = 'No.';
  if (value) value.textContent = String(rank);`,
`  if (label && label.textContent !== 'No.') label.textContent = 'No.';
  if (value && value.textContent !== String(rank)) value.textContent = String(rank);`,
'rank visual writes'
);

replaceExact(
`    block.dataset.recommendationSubsection = section.id;
    const heading = block.querySelector('.tier-heading');
    const note = block.querySelector('.subtier-note');
    const grid = block.querySelector('.tier-grid') || block.querySelector('.grid');
    if (heading) heading.textContent = section.title;
    if (note) note.textContent = section.note;
    if (grid) grid.id = \`recommendation-\${section.id}\`;`,
`    if (block.dataset.recommendationSubsection !== section.id) block.dataset.recommendationSubsection = section.id;
    const heading = block.querySelector('.tier-heading');
    const note = block.querySelector('.subtier-note');
    const grid = block.querySelector('.tier-grid') || block.querySelector('.grid');
    if (heading && heading.textContent !== section.title) heading.textContent = section.title;
    if (note && note.textContent !== section.note) note.textContent = section.note;
    if (grid && grid.id !== \`recommendation-\${section.id}\`) grid.id = \`recommendation-\${section.id}\`;`,
'subsection metadata writes'
);

replaceExact(
`    if (rankSortActive) {
      section.entryKeys.forEach((key, index) => {
        const card = byKey.get(key);
        if (!card || isArchived(card, target) || catalogueType(card, target) !== 'main' || unavailable(card)) return;
        card.dataset.rank = String(index + 1);
        card.dataset.subsection = section.id;
        refreshRankVisual(card);
        if (card.parentElement !== grid) grid.appendChild(card);
        else grid.appendChild(card);
      });
    }`,
`    if (rankSortActive) {
      let visibleIndex = 0;
      for (const [index, key] of section.entryKeys.entries()) {
        const card = byKey.get(key);
        if (!card || isArchived(card, target) || catalogueType(card, target) !== 'main' || unavailable(card)) continue;
        const rank = String(index + 1);
        if (card.dataset.rank !== rank) card.dataset.rank = rank;
        if (card.dataset.subsection !== section.id) card.dataset.subsection = section.id;
        refreshRankVisual(card);
        const expected = grid.children?.[visibleIndex] || null;
        if (expected !== card) grid.insertBefore(card, expected);
        visibleIndex += 1;
      }
    }`,
'card placement loop'
);

replaceExact(
`  if (typeof MutationObserver !== 'undefined' && root.body) {
    const observer = new MutationObserver(() => scheduleRefresh(root));
    observer.observe(root.body, {`,
`  const observationRoot = root.getElementById?.('cards') || root.querySelector?.('#cards');
  if (typeof MutationObserver !== 'undefined' && observationRoot) {
    const observer = new MutationObserver(() => scheduleRefresh(root));
    observer.observe(observationRoot, {`,
'observer root'
);

await writeFile(target, source);

for (const path of [
  'test/.editor-focus-red-marker',
  'test/editor-focus-regression-note.txt',
  'test/editor-focus-regression-trigger.mjs'
]) {
  await rm(path, { force: true });
}
