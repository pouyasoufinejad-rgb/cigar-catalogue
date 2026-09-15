const STYLE_ID = 'catalogue-presentation-v155';
const STOCK_COLOURS = new Set(['green', 'yellow', 'red']);

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
`;
  document.head.appendChild(style);
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

let refreshTimer = 0;
function refreshPresentation() {
  refreshTimer = 0;
  ensureStyle();
  normaliseExperienceTags(document);
  document.querySelectorAll('article.card[data-key]').forEach(ensureStockDot);
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
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, {
        subtree:true,
        childList:true,
        characterData:true,
        attributes:true,
        attributeFilter:['class', 'data-stock', 'data-stock-pin', 'data-archived', 'data-taster', 'data-catalogue-type', 'data-key']
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}

if (typeof document !== 'undefined') installCataloguePresentation();
