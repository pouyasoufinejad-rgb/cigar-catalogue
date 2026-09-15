import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, pattern, replacement, label) {
  const matches = typeof pattern === 'string'
    ? source.split(pattern).length - 1
    : Array.from(source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))).length;
  if (matches !== 1) throw new Error(`${label}: expected exactly one match, found ${matches}`);
  return source.replace(pattern, replacement);
}

async function patchFile(path, mutate) {
  const before = await readFile(path, 'utf8');
  const after = mutate(before);
  if (after !== before) await writeFile(path, after);
  return after !== before;
}

function findMatchingDiv(source, openingIndex) {
  const token = /<\/?div\b[^>]*>/gi;
  token.lastIndex = openingIndex;
  let depth = 0;
  let match;
  while ((match = token.exec(source))) {
    if (/^<\/div/i.test(match[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) return { start: openingIndex, end: token.lastIndex };
  }
  throw new Error('Could not find matching #cards closing div');
}

function patchIndex(source) {
  if (!source.includes('data-recommendation-subsection="coronets-cigarillos"')) {
    const opening = '<div class="tier-stack" id="cards">';
    const start = source.indexOf(opening);
    if (start < 0) throw new Error('index: #cards tier stack not found');
    const range = findMatchingDiv(source, start);
    const oldBlock = source.slice(range.start, range.end);
    const articles = Array.from(oldBlock.matchAll(/<article\b[\s\S]*?<\/article>/gi), match => match[0]);
    if (!articles.length) throw new Error('index: no recommendation articles found');
    const rebuilt = `<div class="tier-stack" id="cards">\n<div class="grid hidden" id="flat-main"></div>\n<div class="tier-block" data-recommendation-subsection="coronets-cigarillos">\n<h3 class="tier-heading">Coronets &amp; Cigarillos</h3>\n<p class="subtier-note">Ring gauge 34 and under.</p>\n<div class="grid tier-grid" id="recommendation-coronets-cigarillos">\n${articles.join('\n')}\n</div>\n</div>\n<div class="tier-block" data-recommendation-subsection="petit-panatelas">\n<h3 class="tier-heading">Petit Panatelas</h3>\n<p class="subtier-note">Ring gauge 35 and over.</p>\n<div class="grid tier-grid" id="recommendation-petit-panatelas"></div>\n</div>\n<div class="tier-block" data-recommendation-subsection="flavoured-infused">\n<h3 class="tier-heading">Flavoured &amp; Infused Cigars</h3>\n<p class="subtier-note">Sweetened, aromatic and infused profiles.</p>\n<div class="grid tier-grid" id="recommendation-flavoured-infused"></div>\n</div>\n</div>`;
    source = source.slice(0, range.start) + rebuilt + source.slice(range.end);
  }

  if (!source.includes('id="catalogue-admin-subsection"')) {
    source = replaceOnce(
      source,
      /(<div class="catalogue-admin-field"><label for="catalogue-admin-section">Section<\/label><select id="catalogue-admin-section">[\s\S]*?<\/select><\/div>)/,
      `$1\n      <div class="catalogue-admin-field"><label for="catalogue-admin-subsection">Recommendation subsection</label><select id="catalogue-admin-subsection"></select></div>`,
      'index: subsection select mount'
    );
  }

  if (!source.includes('id="catalogue-admin-subsection-editor"')) {
    source = replaceOnce(
      source,
      /(<div class="catalogue-admin-divider"><\/div>\s*)(<div class="catalogue-admin-actions"><button class="primary" id="catalogue-admin-save")/,
      `$1<div id="catalogue-admin-subsection-editor"></div>\n    $2`,
      'index: subsection metadata editor mount'
    );
  }

  source = source.replace(
    /const tierTargets=\{\s*elite:document\.getElementById\('tier-elite'\),\s*strong:document\.getElementById\('tier-strong'\),\s*cheap:document\.getElementById\('noteworthy-cheap'\),\s*substantial:document\.getElementById\('noteworthy-substantial'\),\s*neither:document\.getElementById\('noteworthy-neither'\)\s*\};/,
    `const recommendationSubsectionGrids=()=>Array.from(document.querySelectorAll('#cards [data-recommendation-subsection] .tier-grid'));`
  );

  source = source.replace(
    /function recommendedTarget\(card\)\{[\s\S]*?return tierTargets\.neither;\s*\}/,
    `function recommendedTarget(card){\n  const id=String(card.dataset.subsection||'');\n  return document.getElementById('recommendation-'+id)||recommendationSubsectionGrids()[0]||flatMain;\n}\nfunction recommendationSubsectionTitle(card){\n  const target=recommendedTarget(card);\n  return target?.closest?.('[data-recommendation-subsection]')?.querySelector?.('.tier-heading')?.textContent?.trim()||'Recommendation';\n}`
  );
  source = source.replace('badge.textContent=tierLabel(card.dataset.tier);', 'badge.textContent=recommendationSubsectionTitle(card);');
  source = source.replace(
    /function assignTier\(card\)\{[\s\S]*?ensureMainTierBadge\(card\);\s*\}/,
    `function assignTier(card){\n  recommendedTarget(card).appendChild(card);\n  ensureMainTierBadge(card);\n}`
  );
  source = source.replace(
    /function renderRecommended\(\)\{\s*activeMainCards\(\)\.sort\(\(a,b\)=>\+a\.dataset\.rank-\+b\.dataset\.rank\)\.forEach\(card=>recommendedTarget\(card\)\.appendChild\(card\)\);\s*flatMain\.classList\.add\('hidden'\);\s*\}/,
    `function renderRecommended(){\n  const groups=new Map();\n  activeMainCards().forEach(card=>{\n    const target=recommendedTarget(card);\n    const list=groups.get(target)||[];\n    list.push(card);\n    groups.set(target,list);\n  });\n  groups.forEach((cards,target)=>cards.sort((a,b)=>+a.dataset.rank-+b.dataset.rank).forEach(card=>target.appendChild(card)));\n  flatMain.classList.add('hidden');\n}`
  );
  return source;
}

function patchAdmin(source) {
  source = source.replace(
    /function sectionsFromFields\(\)\{\s*return \{\s*legendHtml:q\('catalogue-admin-legend'\)\.value,\s*benchmarksHtml:q\('catalogue-admin-benchmarks'\)\.value\s*\};\s*\}/,
    `function sectionsFromFields(){\n  return {\n    ...(stateForBrowser.sections&&typeof stateForBrowser.sections==='object'?stateForBrowser.sections:{}),\n    legendHtml:q('catalogue-admin-legend').value,\n    benchmarksHtml:q('catalogue-admin-benchmarks').value\n  };\n}`
  );
  return source;
}

function patchHalf(source) {
  source = source.replace(
    /export function compactCatalogueCohorts\(rows = \[\]\) \{[\s\S]*?\n\}\n\nexport function reorderCatalogueCohorts/,
    `export function compactCatalogueCohorts(rows = []) {\n  const source = Array.isArray(rows) ? rows.map(row => ({ ...row, catalogueType: catalogueTypeForRow(row) })) : [];\n  const rankByKey = new Map();\n  for (const type of [HALF_TYPE, TASTER_TYPE]) {\n    source\n      .filter(row => !row.archived && row.catalogueType === type)\n      .sort((a, b) => finiteNumber(a.rank, Number.MAX_SAFE_INTEGER) - finiteNumber(b.rank, Number.MAX_SAFE_INTEGER))\n      .forEach((row, index) => rankByKey.set(row.key, index + 1));\n  }\n  return source.map(row => {\n    if (row.archived || row.catalogueType === MAIN_TYPE) return row;\n    return { ...row, rank: rankByKey.get(row.key) || 1 };\n  });\n}\n\nexport function reorderCatalogueCohorts`
  );

  source = source.replace(
    /export function reorderCatalogueCohorts\(rows, existingCards, options = \{\}\) \{[\s\S]*?\n\}\n\nexport function normaliseAllCohortRanks/,
    `export function reorderCatalogueCohorts(rows, existingCards, options = {}) {\n  const key = String(options.key || '');\n  const targetType = normaliseCatalogueType(options.targetType);\n  const wantsArchived = Boolean(options.wantsArchived);\n  const targetRank = Math.max(1, Math.round(finiteNumber(options.targetRank, 1)));\n  const now = String(options.now || new Date().toISOString());\n  const sourceRows = compactCatalogueCohorts(Array.isArray(rows) ? rows : []);\n  const selected = sourceRows.find(row => row.key === key);\n  const updates = {};\n  if (!selected) return updates;\n  const originalRank = Math.max(1, Math.round(finiteNumber(selected.rank, 1)));\n  const oldType = catalogueTypeForRow(selected);\n  const existing = existingCards && existingCards[key] && typeof existingCards[key] === 'object' ? existingCards[key] : {};\n\n  if (!selected.archived && oldType !== MAIN_TYPE && (wantsArchived || oldType !== targetType)) {\n    sourceRows\n      .filter(row => row.key !== key && !row.archived && catalogueTypeForRow(row) === oldType)\n      .sort((a, b) => finiteNumber(a.rank) - finiteNumber(b.rank))\n      .forEach((row, index) => {\n        updates[row.key] = mergeOverride(existingCards?.[row.key], { rank:index + 1, catalogueType:oldType, taster:oldType === TASTER_TYPE });\n      });\n  }\n\n  if (wantsArchived) {\n    const archived = mergeOverride(existing, {\n      archived:true, archivedAt:existing.archivedAt || now, archivedRank:existing.archivedRank || originalRank,\n      catalogueType:targetType, taster:targetType === TASTER_TYPE\n    });\n    delete archived.rank;\n    delete archived.subsection;\n    updates[key] = archived;\n    return updates;\n  }\n\n  if (targetType === MAIN_TYPE) {\n    const main = mergeOverride(existing, { catalogueType:MAIN_TYPE, taster:false, archived:false, archivedAt:'' });\n    delete main.subsection;\n    updates[key] = main;\n    return updates;\n  }\n\n  const targetCohort = sourceRows\n    .filter(row => row.key !== key && !row.archived && catalogueTypeForRow(row) === targetType)\n    .sort((a, b) => finiteNumber(a.rank) - finiteNumber(b.rank));\n  const insertionIndex = Math.max(0, Math.min(targetCohort.length, targetRank - 1));\n  targetCohort.splice(insertionIndex, 0, { ...selected, key, catalogueType:targetType, taster:targetType === TASTER_TYPE, archived:false });\n  targetCohort.forEach((row, index) => {\n    updates[row.key] = mergeOverride(existingCards?.[row.key], {\n      rank:index + 1, catalogueType:targetType, taster:targetType === TASTER_TYPE,\n      ...(row.key === key ? { archived:false, archivedAt:'' } : {})\n    });\n  });\n  return updates;\n}\n\nexport function normaliseAllCohortRanks`
  );

  source = source.replace(
    /export function normaliseAllCohortRanks\(rows, existingCards, selectedKey = '', selectedType = MAIN_TYPE, selectedRank = 1\) \{[\s\S]*?\n\}\n\nfunction cardText/,
    `export function normaliseAllCohortRanks(rows, existingCards, selectedKey = '', selectedType = MAIN_TYPE, selectedRank = 1) {\n  const targetType = normaliseCatalogueType(selectedType);\n  const activeRows = compactCatalogueCohorts((Array.isArray(rows) ? rows : [])\n    .filter(row => !row.archived)\n    .map(row => row.key === selectedKey ? { ...row, catalogueType:targetType, taster:targetType === TASTER_TYPE } : { ...row }));\n  const output = {};\n  for (const type of [HALF_TYPE, TASTER_TYPE]) {\n    const cohort = activeRows.filter(row => catalogueTypeForRow(row) === type).sort((a,b)=>finiteNumber(a.rank)-finiteNumber(b.rank));\n    if (selectedKey && targetType === type) {\n      const selectedIndex = cohort.findIndex(row => row.key === selectedKey);\n      if (selectedIndex >= 0) {\n        const [selected] = cohort.splice(selectedIndex, 1);\n        const insertionIndex = Math.max(0, Math.min(cohort.length, Math.round(finiteNumber(selectedRank, 1)) - 1));\n        cohort.splice(insertionIndex, 0, selected);\n      }\n    }\n    cohort.forEach((row,index)=>{ output[row.key]=mergeOverride(existingCards?.[row.key], { rank:index+1, catalogueType:type, taster:type===TASTER_TYPE }); });\n  }\n  if (selectedKey && targetType === MAIN_TYPE) {\n    const main = mergeOverride(existingCards?.[selectedKey], { catalogueType:MAIN_TYPE, taster:false, archived:false });\n    delete main.subsection;\n    output[selectedKey] = main;\n  }\n  return output;\n}\n\nfunction cardText`
  );
  return source;
}

const changes = [];
if (await patchFile('public/index.html', patchIndex)) changes.push('public/index.html');
if (await patchFile('public/catalogue-admin-unified-v139.mjs', patchAdmin)) changes.push('public/catalogue-admin-unified-v139.mjs');
if (await patchFile('public/catalogue-half-cohort.mjs', patchHalf)) changes.push('public/catalogue-half-cohort.mjs');
console.log(JSON.stringify({ changed: changes }, null, 2));
