import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, pattern, replacement, label) {
  const probe = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const count = Array.from(source.matchAll(probe)).length;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(pattern, replacement);
}

async function patch(path, mutate) {
  const before = await readFile(path, 'utf8');
  const after = mutate(before);
  if (after !== before) await writeFile(path, after);
  return after !== before;
}

function patchAdmin(source) {
  if (source.includes('...(stateForBrowser.sections')) return source;
  return replaceOnce(
    source,
    /function sectionsFromFields\(\) \{\s*return \{\s*legendHtml: sanitiseMarkup\(q\('catalogue-admin-legend'\)\?\.value \|\| stateForBrowser\.sections\.legendHtml \|\| ''\),\s*benchmarksHtml: sanitiseMarkup\(q\('catalogue-admin-benchmarks'\)\?\.value \|\| stateForBrowser\.sections\.benchmarksHtml \|\| ''\)\s*\};\s*\}/,
    `function sectionsFromFields() {\n  return {\n    ...(stateForBrowser.sections && typeof stateForBrowser.sections === 'object' ? stateForBrowser.sections : {}),\n    legendHtml: sanitiseMarkup(q('catalogue-admin-legend')?.value || stateForBrowser.sections.legendHtml || ''),\n    benchmarksHtml: sanitiseMarkup(q('catalogue-admin-benchmarks')?.value || stateForBrowser.sections.benchmarksHtml || '')\n  };\n}`,
    'admin sectionsFromFields'
  );
}

function patchPublisher(source) {
  if (!source.includes("from './recommendation-subsection-ranking.mjs'")) {
    source = source.replace(
      "import assert from 'node:assert/strict';",
      `import assert from 'node:assert/strict';\nimport {\n  normalisePublisherRankingState,\n  reorderPublisherTarget,\n  assertPublisherRankingInvariant\n} from './recommendation-subsection-ranking.mjs';`
    );
  }

  source = source.replace(
    "'archived', 'archivedAt', 'archivedRank', 'stockPin', 'rank', 'strength', 'quality', 'flavour', 'size', 'laurel',",
    "'archived', 'archivedAt', 'archivedRank', 'archivedSubsection', 'subsection', 'stockPin', 'rank', 'strength', 'quality', 'flavour', 'size', 'laurel',"
  );
  if (!source.includes('delete patch.subsection;')) {
    source = source.replace(
      "  delete patch.catalogueType;\n  delete patch.flavour;",
      "  delete patch.catalogueType;\n  delete patch.subsection;\n  delete patch.archivedSubsection;\n  delete patch.flavour;"
    );
  }

  source = replaceOnce(
    source,
    /function parseStaticRankingCards\(html\) \{[\s\S]*?\n\}\n\nfunction rankingCardFromEntry/,
    `function parseStaticRankingCards(html) {\n  const cards = {};\n  for (const match of String(html || '').matchAll(/<article\\b([^>]*)>([\\s\\S]*?)<\\/article>/gi)) {\n    const tag = \`<article\${match[1]}>\`;\n    const body = match[2] || '';\n    const className = htmlAttribute(tag, 'class');\n    if (!/(?:^|\\s)card(?:\\s|$)/i.test(className)) continue;\n    const key = safeKey(htmlAttribute(tag, 'data-key'));\n    if (!key) continue;\n    const taster = htmlAttribute(tag, 'data-taster') === '1';\n    const explicitType = htmlAttribute(tag, 'data-catalogue-type');\n    const card = {\n      taster,\n      catalogueType: explicitType || (taster ? 'taster' : 'main'),\n      archived: htmlAttribute(tag, 'data-archived') === '1'\n    };\n    const rank = Number(htmlAttribute(tag, 'data-rank'));\n    if (Number.isFinite(rank) && rank >= 1) card.rank = Math.round(rank);\n    const archivedRank = Number(htmlAttribute(tag, 'data-archived-rank'));\n    if (Number.isFinite(archivedRank) && archivedRank >= 1) card.archivedRank = Math.round(archivedRank);\n    const visualRing = Number(body.match(/\\bdata-visual-ring=["'](\\d{2})["']/i)?.[1]);\n    if (Number.isFinite(visualRing)) card.visualRing = visualRing;\n    const scrubbed = body.replace(/<img\\b[^>]*>/gi, ' ');\n    const sizeText = scrubbed.match(/\\d+(?:\\.\\d+)?(?:″|&quot;|")?\\s*[×x]\\s*\\d{2}(?!\\d)/i)?.[0];\n    if (sizeText) card.sizeText = sizeText;\n    const production = scrubbed.match(/<[^>]*class=["'][^"']*artmeta-left[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i)?.[1] || '';\n    card.productionLines = Array.from(production.matchAll(/<[^>]*class=["'][^"']*artmeta-line[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>/gi), line =>\n      line[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim()\n    ).filter(Boolean);\n    cards[key] = card;\n  }\n  return cards;\n}\n\nfunction rankingCardFromEntry`,
    'publisher static ranking parser'
  );

  source = source.replace(
    /function rankingCardFromEntry\(entry\) \{[\s\S]*?\n\}/,
    `function rankingCardFromEntry(entry) {\n  const taster = Boolean(entry?.taster);\n  const card = {\n    taster,\n    catalogueType: String(entry?.catalogueType || '').trim() || (taster ? 'taster' : 'main'),\n    archived: Boolean(entry?.archived)\n  };\n  const rank = Number(entry?.rank);\n  if (Number.isFinite(rank) && rank >= 1) card.rank = Math.round(rank);\n  const archivedRank = Number(entry?.archivedRank);\n  if (Number.isFinite(archivedRank) && archivedRank >= 1) card.archivedRank = Math.round(archivedRank);\n  const ring = Number(entry?.ring);\n  if (Number.isFinite(ring) && ring >= 10 && ring <= 99) card.ring = Math.round(ring);\n  if (Array.isArray(entry?.productionLines)) card.productionLines = entry.productionLines.map(value => String(value));\n  if (typeof entry?.archivedAt === 'string') card.archivedAt = entry.archivedAt;\n  return card;\n}`
  );

  source = replaceOnce(
    source,
    /function normaliseRankings\(cardsInput\) \{[\s\S]*?\n\}\n\nfunction validateImage/,
    `function normaliseRankings(cardsInput, sections = {}) {\n  const scratch = { version:3, cards:cardsInput || {}, sections, entries:{} };\n  normalisePublisherRankingState(scratch, cardsInput || {});\n  return scratch.cards;\n}\n\nfunction assertRankingInvariant(cardsInput, label, sections = {}) {\n  return assertPublisherRankingInvariant({ version:3, cards:cardsInput || {}, sections, entries:{} }, label);\n}\n\nfunction reorderForTarget(cardsInput, key, targetCard, nowString, sections = {}) {\n  const scratch = { version:3, cards:{ ...(cardsInput || {}) }, sections, entries:{} };\n  reorderPublisherTarget(scratch, key, targetCard, nowString);\n  return scratch.cards;\n}\n\nfunction validateImage`,
    'publisher ranking functions'
  );

  source = source.replace(
    /if \(operation === 'update-sections'\) \{\s*const sectionNames = Object\.keys\(sections\);\s*if \(!sectionNames\.length\) throw new Error\('update-sections requires a sections object\.'\);\s*if \(sectionNames\.some\(name => !\['legendHtml', 'benchmarksHtml'\]\.includes\(name\) \|\| typeof sections\[name\] !== 'string'\)\) \{\s*throw new Error\('update-sections only accepts string legendHtml and benchmarksHtml fields\.'\);\s*\}\s*\}/,
    `if (operation === 'update-sections') {\n    const sectionNames = Object.keys(sections);\n    if (!sectionNames.length) throw new Error('update-sections requires a sections object.');\n    const invalid = sectionNames.some(name => {\n      if (name === 'legendHtml' || name === 'benchmarksHtml') return typeof sections[name] !== 'string';\n      if (name !== 'recommendationSubsections') return true;\n      return !Array.isArray(sections[name]) || !sections[name].length || sections[name].some(section =>\n        !isRecord(section) || !/^[a-z0-9][a-z0-9_-]*$/i.test(String(section.id || '')) ||\n        typeof section.title !== 'string' || typeof section.note !== 'string' ||\n        !Array.isArray(section.entryKeys) || section.entryKeys.some(key => !safeKey(key))\n      );\n    });\n    if (invalid) throw new Error('update-sections accepts legendHtml, benchmarksHtml and valid recommendationSubsections only.');\n  }`
  );

  if (!source.includes("const includeStaticCatalogue = options.includeStaticCatalogue ?? (options.repoRoot !== undefined || options.fetchImpl === undefined);\n  if (request.operation === 'update-sections')")) {
    source = source.replace(
      "  const state = normaliseStateShape(rawState);\n  if (request.operation === 'update-sections') {",
      "  const state = normaliseStateShape(rawState);\n  const includeStaticCatalogue = options.includeStaticCatalogue ?? (options.repoRoot !== undefined || options.fetchImpl === undefined);\n  if (request.operation === 'update-sections') {"
    );
  }
  source = source.replace(
    "    state.sections = { ...state.sections, ...request.sections };\n    await putState(fetchImpl, baseUrl, token, state);",
    "    state.sections = { ...state.sections, ...request.sections };\n    if (Array.isArray(request.sections.recommendationSubsections)) {\n      state.cards = normaliseRankings(await completeRankingCards(repoRoot, state, includeStaticCatalogue), state.sections);\n      assertRankingInvariant(state.cards, 'Catalogue section write', state.sections);\n    }\n    await putState(fetchImpl, baseUrl, token, state);"
  );
  source = source.replace(
    "  const includeStaticCatalogue = options.includeStaticCatalogue ?? (options.repoRoot !== undefined || options.fetchImpl === undefined);\n  state.cards = normaliseRankings(await completeRankingCards(repoRoot, state, includeStaticCatalogue));",
    "  state.cards = normaliseRankings(await completeRankingCards(repoRoot, state, includeStaticCatalogue), state.sections);"
  );
  source = source.replace(
    "    state.cards = reorderForTarget(state.cards, request.key, nextCard, timestamp);",
    "    state.cards = reorderForTarget(state.cards, request.key, nextCard, timestamp, state.sections);"
  );
  source = source.replace(
    "  assertRankingInvariant(state.cards, 'Catalogue write');",
    "  assertRankingInvariant(state.cards, 'Catalogue write', state.sections);"
  );
  source = source.replace(
    "  assertRankingInvariant(verifiedState.cards, 'Catalogue state read-back');",
    "  assertRankingInvariant(verifiedState.cards, 'Catalogue state read-back', verifiedState.sections);"
  );
  return source;
}

const changed = [];
if (await patch('public/catalogue-admin-unified-v139.mjs', patchAdmin)) changed.push('public/catalogue-admin-unified-v139.mjs');
if (await patch('scripts/publish-catalogue-request.mjs', patchPublisher)) changed.push('scripts/publish-catalogue-request.mjs');
console.log(JSON.stringify({ changed }, null, 2));
