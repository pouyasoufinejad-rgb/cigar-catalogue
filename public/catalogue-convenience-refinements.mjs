const STYLE_ID = 'catalogue-convenience-refinements-v1';
const PRIMARY_COMPARE_FIELDS = Object.freeze([
  'Cigar',
  'Price / stick',
  'Dimensions',
  'Strength',
  'Quality',
  'Flavour',
  'Value',
  'Smoke time',
  'Stock'
]);
const SECONDARY_COMPARE_FIELDS = Object.freeze([
  'Package',
  'Size',
  'Personal status',
  'Production'
]);

function ensureRefinementStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.catalogue-personal-controls button[aria-pressed="false"]{
  opacity:.62!important;
  background:rgba(20,17,13,.72)!important;
  color:#aaa398!important;
  border-color:rgba(217,188,112,.22)!important;
}
.catalogue-personal-controls button[aria-pressed="true"]{
  opacity:1!important;
  background:#d9bc70!important;
  color:#18120a!important;
  border-color:#f0d992!important;
  box-shadow:0 0 0 1px rgba(217,188,112,.18),0 3px 10px rgba(0,0,0,.28)!important;
  font-weight:800!important;
}
.catalogue-personal-controls button[aria-pressed="true"]::before{content:'✓ ';font-weight:900}
.catalogue-compare-dialog{width:min(94vw,820px)!important;max-height:88vh!important;font-size:11px!important}
.catalogue-compare-header{padding:9px 11px!important;gap:8px!important}
.catalogue-compare-header h2{font-size:15px!important}
.catalogue-compare-scroll{max-height:calc(88vh - 48px)!important;padding:0!important}
.catalogue-compare-table{
  width:100%!important;
  min-width:0!important;
  grid-template-columns:96px repeat(var(--compare-count),minmax(145px,1fr))!important;
}
.catalogue-compare-cell{padding:6px 7px!important;font-size:10px!important;line-height:1.25!important}
.catalogue-compare-cell.compare-label{font-size:9px!important}
.catalogue-compare-product{gap:6px!important;min-height:64px!important;align-items:center!important}
.catalogue-compare-product img{width:48px!important;height:60px!important;border-radius:5px!important;flex:0 0 auto!important}
.catalogue-compare-product b{font-size:11px!important;line-height:1.15!important}
.catalogue-compare-secondary{border-top:1px solid rgba(217,188,112,.2);background:rgba(255,255,255,.015)}
.catalogue-compare-secondary > summary{
  cursor:pointer;list-style:none;padding:8px 10px;color:#d8c18a;font:700 10px/1.2 system-ui,sans-serif;
  user-select:none;
}
.catalogue-compare-secondary > summary::-webkit-details-marker{display:none}
.catalogue-compare-secondary > summary::after{content:' +';color:#a89465}
.catalogue-compare-secondary[open] > summary::after{content:' −'}
.catalogue-compare-secondary .catalogue-compare-table{border-top:1px solid rgba(255,255,255,.05)}
@media(max-width:700px){
  .catalogue-compare-dialog{width:98vw!important;max-height:94vh!important}
  .catalogue-compare-scroll{max-height:calc(94vh - 46px)!important;overflow:auto!important}
  .catalogue-compare-table{width:max-content!important;min-width:100%!important;grid-template-columns:84px repeat(var(--compare-count),minmax(132px,1fr))!important}
  .catalogue-compare-cell{padding:5px 6px!important;font-size:9px!important}
  .catalogue-compare-product img{width:42px!important;height:54px!important}
  .catalogue-compare-product b{font-size:10px!important}
}
`;
  document.head.appendChild(style);
}

function rowGroups(table, compareCount) {
  const width = compareCount + 1;
  const children = Array.from(table.children);
  const rows = [];
  for (let index = 0; index < children.length; index += width) {
    const cells = children.slice(index, index + width);
    if (cells.length !== width) continue;
    rows.push({
      label: cells[0]?.textContent?.replace(/\s+/g, ' ').trim() || '',
      cells
    });
  }
  return rows;
}

function makeCompareTable(compareCount, className) {
  const table = document.createElement('div');
  table.className = `catalogue-compare-table ${className}`;
  table.dataset.compareCompact = '1';
  table.style.setProperty('--compare-count', String(compareCount));
  return table;
}

function appendRows(table, rows) {
  rows.forEach(row => row.cells.forEach(cell => table.appendChild(cell)));
}

export function compactCompareContent(root = document) {
  const content = root.querySelector?.('[data-compare-content]');
  if (!content) return false;
  const original = Array.from(content.children).find(node =>
    node.classList?.contains('catalogue-compare-table') && !node.dataset.compareCompact
  );
  if (!original) return false;

  const compareCount = Number.parseInt(original.style.getPropertyValue('--compare-count'), 10);
  if (!Number.isInteger(compareCount) || compareCount < 1 || compareCount > 4) return false;

  const rows = rowGroups(original, compareCount);
  if (!rows.length) return false;
  const primarySet = new Set(PRIMARY_COMPARE_FIELDS);
  const secondarySet = new Set(SECONDARY_COMPARE_FIELDS);
  const primaryRows = rows.filter(row => primarySet.has(row.label));
  const secondaryRows = [
    ...SECONDARY_COMPARE_FIELDS.flatMap(label => rows.filter(row => row.label === label)),
    ...rows.filter(row => !primarySet.has(row.label) && !secondarySet.has(row.label))
  ];

  const primary = makeCompareTable(compareCount, 'catalogue-compare-primary');
  appendRows(primary, primaryRows);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(primary);

  if (secondaryRows.length) {
    const details = document.createElement('details');
    details.className = 'catalogue-compare-secondary';
    const summary = document.createElement('summary');
    summary.dataset.compareMore = '1';
    summary.textContent = 'More details';
    const secondary = makeCompareTable(compareCount, 'catalogue-compare-more-table');
    appendRows(secondary, secondaryRows);
    details.append(summary, secondary);
    fragment.appendChild(details);
  }

  original.replaceWith(fragment);
  return true;
}

function scheduleCompareCompaction() {
  setTimeout(() => compactCompareContent(document), 0);
}

function installCompareHooks() {
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-compare-open]')) scheduleCompareCompaction();
  });

  if (typeof MutationObserver === 'undefined' || !document.body) return;
  const observer = new MutationObserver(() => {
    const overlay = document.getElementById('catalogue-compare-overlay');
    if (!overlay || overlay.hidden) return;
    const content = overlay.querySelector('[data-compare-content]');
    const unrefined = content && Array.from(content.children).some(node =>
      node.classList?.contains('catalogue-compare-table') && !node.dataset.compareCompact
    );
    if (unrefined) scheduleCompareCompaction();
  });
  observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
}

export function initCatalogueConvenienceRefinements() {
  if (typeof document === 'undefined') return;
  ensureRefinementStyles();
  installCompareHooks();
  compactCompareContent(document);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCatalogueConvenienceRefinements, { once:true });
  else initCatalogueConvenienceRefinements();
}

export { PRIMARY_COMPARE_FIELDS, SECONDARY_COMPARE_FIELDS };
