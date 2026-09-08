import { hasQualityAwardException } from './catalogue-rating-exceptions.mjs';

const STYLE_ID = 'catalogue-presentation-v153';
const STOCK_COLOURS = new Set(['green', 'yellow', 'red']);
const HALF_SECTION_SELECTOR = '[data-noteworthy-section="substantial"]';
const STRONG_SECTION_SELECTOR = '[data-tier-section="strong"]';
const ELITE_SECTION_SELECTOR = '[data-tier-section="elite"]';
const CONTROL_SELECTOR = 'button,a,[role="button"]';

function normaliseGoldLabels(labels = []) {
  return [...new Set(Array.from(labels || [])
    .map(label => String(label || '').trim().toLowerCase())
    .filter(Boolean))].sort();
}

export function containsHalfCigarCue(value) {
  return /half|halv/i.test(String(value || ''));
}

export function isHalfCigarCard(card) {
  if (!card) return false;
  const sources = [
    card.dataset?.key || '',
    card.textContent || '',
    card.querySelector?.('h3')?.textContent || '',
    card.querySelector?.('.artmeta-right')?.textContent || '',
    card.querySelector?.('.mog-note')?.textContent || '',
    card.querySelector?.('.summary')?.textContent || ''
  ];
  return sources.some(containsHalfCigarCue);
}

export function recommendationDestination(labels = [], { flavourRated = false, key = '' } = {}) {
  const golds = new Set(normaliseGoldLabels(labels));
  const strengthGold = golds.has('strength');
  const qualityGold = golds.has('quality');
  const eliteQualityGold = qualityGold || hasQualityAwardException(key);
  if (strengthGold && eliteQualityGold && (!flavourRated || golds.has('flavour'))) return 'elite';
  if (strengthGold || qualityGold) return 'strong';
  if (golds.has('value')) return 'noteworthy-cheap';
  return 'noteworthy-neither';
}

export function stockColourForStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'in') return 'green';
  if (value === 'out' || value === 'delisted') return 'red';
  return 'yellow';
}

export function normaliseExperienceTagText(value) {
  const text = String(value ?? '');
  if (text === 'Nicotine: High') return 'Nicotine Bomb';
  if (text === 'Nicotine: High (projected)') return 'Nicotine Bomb (projected)';
  return text;
}

export function normaliseExperienceTags(root = document) {
  if (!root?.querySelectorAll) return 0;
  let changed = 0;
  root.querySelectorAll('.tag-group').forEach(group => {
    const label = group.querySelector?.('.tag-label')?.textContent?.trim().toLowerCase();
    if (label !== 'experience') return;
    group.querySelectorAll('.tag-chip').forEach(chip => {
      const next = normaliseExperienceTagText(chip.textContent);
      if (chip.textContent !== next) {
        chip.textContent = next;
        changed += 1;
      }
    });
  });
  return changed;
}

function stockLabelForColour(colour) {
  if (colour === 'green') return 'In stock';
  if (colour === 'red') return 'Out of stock';
  return 'Stock status unknown';
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
article.card .freshness{display:none!important}
article.card .eyebrow .stock-dot{
  display:inline-block;
  width:9px;
  height:9px;
  margin-right:6px;
  border-radius:50%;
  border:1px solid rgba(255,255,255,.7);
  box-shadow:0 1px 4px rgba(0,0,0,.5);
  vertical-align:1px;
  flex:0 0 auto;
}
article.card .eyebrow .stock-dot-green{background:#3f9a4a}
article.card .eyebrow .stock-dot-yellow{background:#d7a52f}
article.card .eyebrow .stock-dot-red{background:#a92d35}
[data-ranking-section="main"]{margin:0 0 28px}
[data-ranking-section="main"] .catalogue-ranking-list{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:7px 18px;
  margin:12px 0 0;
  padding-left:24px;
}
[data-ranking-section="main"] .catalogue-ranking-list li{padding:2px 4px;line-height:1.35}
[data-recommendations-heading]{margin-top:8px}
body.catalogue-half-only [data-ranking-section],
body.catalogue-half-only [data-recommendations-heading],
body.catalogue-half-only [data-tier-section],
body.catalogue-half-only [data-noteworthy-section]{display:none!important}
body.catalogue-half-only [data-noteworthy-section="substantial"]{display:block!important}
body.catalogue-half-only article.card{display:none!important}
body.catalogue-half-only [data-noteworthy-section="substantial"] article.card[data-half-cigar="1"]{display:block!important}
body.catalogue-tasters-selected [data-ranking-section],
body.catalogue-tasters-selected [data-recommendations-heading]{display:none!important}
@media(max-width:700px){
  [data-ranking-section="main"] .catalogue-ranking-list{grid-template-columns:minmax(0,1fr)}
}
`;
  document.head.appendChild(style);
}

function cardGoldLabels(card) {
  return Array.from(card?.querySelectorAll?.('.rating.gold') || []).map(node =>
    node.querySelector(':scope > span')?.textContent?.trim().toLowerCase() || ''
  ).filter(Boolean);
}

function cardFlavourRated(card) {
  const flavour = Array.from(card?.querySelectorAll?.('.rating') || []).find(node =>
    node.querySelector(':scope > span')?.textContent?.trim().toLowerCase() === 'flavour'
  );
  return Boolean(flavour && !flavour.classList.contains('flavour-unrated'));
}

export function recommendationDestinationForCard(card) {
  return recommendationDestination(cardGoldLabels(card), {
    flavourRated: cardFlavourRated(card),
    key: card?.dataset?.key || ''
  });
}

function effectiveStockStatus(card) {
  const pin = String(card?.dataset?.stockPin || '').trim().toLowerCase();
  if (pin === 'in' || pin === 'out' || pin === 'hold') return pin;
  return String(card?.dataset?.stock || 'unknown').trim().toLowerCase();
}

export function ensureStockDot(card) {
  if (!card?.querySelector) return null;
  const eyebrow = card.querySelector('.eyebrow');
  if (!eyebrow) return null;

  card.querySelector('.rankflag .stock-dot')?.remove();
  let dot = eyebrow.querySelector('.stock-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'stock-dot';
    eyebrow.insertBefore(dot, eyebrow.firstChild);
  }

  dot.textContent = '';
  dot.removeAttribute?.('title');
  const colour = stockColourForStatus(effectiveStockStatus(card));
  const className = `stock-dot stock-dot-${STOCK_COLOURS.has(colour) ? colour : 'yellow'}`;
  if (dot.className !== className) dot.className = className;
  const label = stockLabelForColour(colour);
  if (dot.getAttribute('aria-label') !== label) dot.setAttribute('aria-label', label);
  return dot;
}

function destinationGrid(root, destination) {
  const selector = destination === 'half-cigar' || destination === 'substantial'
    ? `${HALF_SECTION_SELECTOR} .grid`
    : destination === 'elite'
      ? `${ELITE_SECTION_SELECTOR} .grid`
      : destination === 'strong'
        ? `${STRONG_SECTION_SELECTOR} .grid`
        : destination === 'noteworthy-cheap'
          ? '[data-noteworthy-section="cheap"] .grid'
          : '[data-noteworthy-section="neither"] .grid';
  return root.querySelector(selector);
}

function halfCigarSection(root) {
  return root?.querySelector?.(HALF_SECTION_SELECTOR) || null;
}

export function configureHalfCigarSection(root = document) {
  if (!root?.querySelector) return null;
  const halfSection = halfCigarSection(root);
  if (!halfSection) return null;

  const heading = halfSection.querySelector?.('.subtier-heading');
  if (heading && heading.textContent !== 'The Half-Cigar') heading.textContent = 'The Half-Cigar';
  const note = halfSection.querySelector?.('.subtier-note');
  const noteText = 'Formats explicitly marked half or intended to be halved.';
  if (note && note.textContent !== noteText) note.textContent = noteText;

  const strongSection = root.querySelector(STRONG_SECTION_SELECTOR);
  const parent = strongSection?.parentElement;
  if (parent && halfSection.parentElement === parent && strongSection.nextSibling !== halfSection) {
    parent.insertBefore(halfSection, strongSection.nextSibling);
  }
  return halfSection;
}

function isUnavailableCard(card) {
  return card.classList?.contains('is-unavailable')
    || card.closest?.('.unavailable-grid')
    || ['out', 'delisted'].includes(effectiveStockStatus(card));
}

function insertByRank(grid, card) {
  if (!grid || !card) return;
  const rank = Number(card.dataset?.rank) || Number.MAX_SAFE_INTEGER;
  const siblings = Array.from(grid.querySelectorAll(':scope > article.card'));
  const before = siblings.find(node => (Number(node.dataset?.rank) || Number.MAX_SAFE_INTEGER) > rank);
  if (before) grid.insertBefore(card, before);
  else grid.appendChild(card);
}

function refreshRecommendationGroupVisibility() {
  const refresh = globalThis?.window?.refreshGroupVisibility;
  if (typeof refresh === 'function') refresh();
}

export function markHalfCigarCards(root = document) {
  if (!root?.querySelectorAll) return 0;
  let changed = 0;
  root.querySelectorAll('article.card[data-key]').forEach(card => {
    const next = isHalfCigarCard(card) ? '1' : '0';
    if (card.dataset.halfCigar !== next) {
      card.dataset.halfCigar = next;
      changed += 1;
    }
  });
  return changed;
}

export function reclassifyRecommendationCards(root = document) {
  if (!root?.querySelectorAll) return 0;
  const sort = root.getElementById?.('sort') || root.querySelector?.('#sort');
  if (sort?.value && sort.value !== 'rank') return 0;
  const halfGrid = destinationGrid(root, 'half-cigar');
  if (!halfGrid) return 0;

  let moved = 0;
  root.querySelectorAll('article.card[data-key]').forEach(card => {
    if (card.dataset.archived === '1' || card.dataset.taster === '1' || isUnavailableCard(card)) return;
    const destination = isHalfCigarCard(card) ? 'half-cigar' : recommendationDestinationForCard(card);
    const target = destinationGrid(root, destination);
    if (target && card.parentElement !== target) {
      insertByRank(target, card);
      moved += 1;
    }
  });
  if (moved) refreshRecommendationGroupVisibility();
  return moved;
}

export const reclassifySubstantialCards = reclassifyRecommendationCards;

function stripRankPrefix(value) {
  return String(value || '').replace(/^\s*No\.\s*\d+\s*[—–-]\s*/i, '').trim();
}

function normaliseCardRankCaption(card) {
  const eyebrow = card?.querySelector?.('.eyebrow');
  if (!eyebrow) return false;
  const current = eyebrow.textContent?.trim() || '';
  const next = stripRankPrefix(current);
  if (!next || next === current) return false;
  const dot = eyebrow.querySelector?.('.stock-dot') || null;
  eyebrow.textContent = next;
  if (dot) eyebrow.insertBefore(dot, eyebrow.firstChild);
  return true;
}

function cardTitleText(card) {
  const h3 = card?.querySelector?.('h3');
  if (!h3) return String(card?.dataset?.key || 'Untitled cigar');
  const clone = h3.cloneNode?.(true);
  if (clone?.querySelector) {
    clone.querySelector('span')?.remove();
    return clone.textContent?.trim() || String(card?.dataset?.key || 'Untitled cigar');
  }
  return h3.textContent?.trim() || String(card?.dataset?.key || 'Untitled cigar');
}

function documentForRoot(root) {
  if (root?.createElement) return root;
  if (root?.ownerDocument?.createElement) return root.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

export function refreshRankingSection(root = document) {
  if (!root?.querySelector || !root?.querySelectorAll) return null;
  const anchor = root.querySelector(ELITE_SECTION_SELECTOR) || root.querySelector(STRONG_SECTION_SELECTOR);
  if (!anchor?.parentElement) return null;
  const doc = documentForRoot(root);
  if (!doc) return null;

  let section = root.querySelector('[data-ranking-section="main"]');
  if (!section) {
    section = doc.createElement('section');
    section.setAttribute('data-ranking-section', 'main');
    section.className = 'catalogue-ranking-section';
    const heading = doc.createElement('h3');
    heading.className = 'tier-heading';
    heading.textContent = 'Ranking';
    const note = doc.createElement('p');
    note.className = 'tier-note';
    note.textContent = 'Active catalogue in rank order.';
    const list = doc.createElement('ol');
    list.className = 'catalogue-ranking-list';
    section.append(heading, note, list);
    anchor.parentElement.insertBefore(section, anchor);
  }

  const cards = Array.from(root.querySelectorAll('article.card[data-key]'))
    .filter(card => card.dataset.archived !== '1' && card.dataset.taster !== '1')
    .sort((a, b) => {
      const rankA = Number(a.dataset.rank) || Number.MAX_SAFE_INTEGER;
      const rankB = Number(b.dataset.rank) || Number.MAX_SAFE_INTEGER;
      return rankA - rankB || cardTitleText(a).localeCompare(cardTitleText(b));
    });

  const rows = cards.map(card => {
    const rank = Number(card.dataset.rank);
    return `${Number.isFinite(rank) && rank > 0 ? rank : '—'}\u0000${cardTitleText(card)}`;
  });
  const signature = rows.join('\u0001');
  if (section.dataset.rankingSignature === signature) return section;
  section.dataset.rankingSignature = signature;

  const list = section.querySelector('.catalogue-ranking-list');
  if (!list) return section;
  list.replaceChildren();
  for (const card of cards) {
    const item = doc.createElement('li');
    const rank = Number(card.dataset.rank);
    const rankText = Number.isFinite(rank) && rank > 0 ? `No. ${rank}` : 'Unranked';
    item.textContent = `${rankText} — ${cardTitleText(card)}`;
    list.appendChild(item);
  }
  return section;
}

function ensureRecommendationsHeading(root = document) {
  if (!root?.querySelector) return null;
  const anchor = root.querySelector(ELITE_SECTION_SELECTOR) || root.querySelector(STRONG_SECTION_SELECTOR);
  if (!anchor?.parentElement) return null;
  let wrapper = root.querySelector('[data-recommendations-heading]');
  if (wrapper) return wrapper;
  const doc = documentForRoot(root);
  if (!doc) return null;
  wrapper = doc.createElement('div');
  wrapper.setAttribute('data-recommendations-heading', '');
  const heading = doc.createElement('h3');
  heading.className = 'tier-heading';
  heading.textContent = 'Recommendations';
  wrapper.appendChild(heading);
  anchor.parentElement.insertBefore(wrapper, anchor);
  return wrapper;
}

function bodyForRoot(root) {
  if (root?.body) return root.body;
  return root?.ownerDocument?.body || (typeof document !== 'undefined' ? document.body : null);
}

export function setHalfCigarOnly(root = document, active = true) {
  const body = bodyForRoot(root);
  if (!body) return false;
  body.classList.toggle('catalogue-half-only', Boolean(active));
  if (active) body.classList.remove('catalogue-tasters-selected');
  const button = root.querySelector?.('[data-half-cigar-filter]');
  button?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
  refreshRecommendationGroupVisibility();
  return Boolean(active);
}

function findTasterControl(root) {
  if (!root?.querySelectorAll) return null;
  return Array.from(root.querySelectorAll(CONTROL_SELECTOR)).find(node =>
    /^tasters$/i.test(String(node.textContent || '').trim())
  ) || null;
}

export function ensureHalfCigarFilterControl(root = document) {
  if (!root?.querySelector) return null;
  const existing = root.querySelector('[data-half-cigar-filter]');
  if (existing) return existing;
  const tasterControl = findTasterControl(root);
  if (!tasterControl?.parentElement) return null;
  const doc = documentForRoot(root);
  if (!doc) return null;

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = tasterControl.className || '';
  button.textContent = 'Half Cigars';
  button.setAttribute('data-half-cigar-filter', '');
  button.setAttribute('aria-pressed', 'false');
  tasterControl.parentElement.insertBefore(button, tasterControl.nextSibling);
  button.addEventListener('click', () => {
    const active = bodyForRoot(root)?.classList?.contains('catalogue-half-only');
    setHalfCigarOnly(root, !active);
  });

  const controls = tasterControl.parentElement;
  if (controls.dataset.halfCigarExitBound !== '1') {
    controls.dataset.halfCigarExitBound = '1';
    controls.addEventListener('click', event => {
      const control = event.target?.closest?.(CONTROL_SELECTOR);
      if (!control || control.matches?.('[data-half-cigar-filter]')) return;
      setHalfCigarOnly(root, false);
      const body = bodyForRoot(root);
      if (body) body.classList.toggle('catalogue-tasters-selected', /^tasters$/i.test(String(control.textContent || '').trim()));
    });
  }
  return button;
}

let refreshTimer = 0;
function refreshPresentation() {
  refreshTimer = 0;
  ensureStyle();
  configureHalfCigarSection(document);
  markHalfCigarCards(document);
  normaliseExperienceTags(document);
  document.querySelectorAll('article.card[data-key]').forEach(card => {
    normaliseCardRankCaption(card);
    ensureStockDot(card);
  });
  reclassifyRecommendationCards(document);
  refreshRankingSection(document);
  ensureRecommendationsHeading(document);
  ensureHalfCigarFilterControl(document);
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(refreshPresentation, 0);
}

export function installCataloguePresentation() {
  if (typeof document === 'undefined') return;
  ensureStyle();
  const start = () => {
    refreshPresentation();
    document.getElementById('sort')?.addEventListener('change', scheduleRefresh);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, {
        subtree:true,
        childList:true,
        characterData:true,
        attributes:true,
        attributeFilter:['class', 'data-stock', 'data-stock-pin', 'data-archived', 'data-taster', 'data-rank', 'data-key']
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}

if (typeof document !== 'undefined') installCataloguePresentation();
