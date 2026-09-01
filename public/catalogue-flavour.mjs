const STATE_API = '/api/catalogue-overrides';
const SCORE_CLASSES = ['gold', 'silver', 'bronze', 'score-high', 'score-mid', 'score-low', 'flavour-unrated'];

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normaliseFlavour(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(10, Math.round(number)));
}

function tierForScore(value) {
  return value >= 7 ? 'gold' : value >= 5 ? 'silver' : 'bronze';
}

export function flavourRatingMarkup(value) {
  const score = normaliseFlavour(value);
  if (score === null) {
    return '<div class="rating flavour-unrated"><span>Flavour</span><i aria-hidden="true" class="medal flavour-unrated-medal"></i><b>Unrated</b><small class="subscore">—</small></div>';
  }
  const tier = tierForScore(score);
  const scoreClass = score >= 8 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low';
  return `<div class="rating ${tier} ${scoreClass}"><span>Flavour</span><i aria-hidden="true" class="medal ${tier}"></i><b>${tier[0].toUpperCase() + tier.slice(1)}</b><small class="subscore">${score}/10</small></div>`;
}

export function injectFlavourIntoStatePayload(payload, key, value) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const cards = source.cards && typeof source.cards === 'object' ? source.cards : {};
  const safeKey = String(key || '').trim();
  if (!safeKey) return source;
  return {
    ...source,
    cards: {
      ...cards,
      [safeKey]: {
        ...(cards[safeKey] && typeof cards[safeKey] === 'object' ? cards[safeKey] : {}),
        flavour: normaliseFlavour(value)
      }
    }
  };
}

export function deriveAutoLaurel({ strength, quality, flavour, size, value } = {}) {
  const strengthScore = finite(strength, 0);
  if (strengthScore < 5) return 'none';
  let golds = 0;
  if (strengthScore >= 7) golds++;
  if (finite(quality, 0) >= 7) golds++;
  const flavourScore = normaliseFlavour(flavour);
  if (flavourScore !== null && flavourScore >= 7) golds++;
  if (String(size || '').toLowerCase() === 'gold') golds++;
  if (finite(value, 0) >= 7) golds++;
  if (golds >= 4) return 'gem';
  if (golds >= 3) return 'crown';
  return 'none';
}

function ratingNode(card, label) {
  return Array.from(card?.querySelectorAll?.('.rating') || []).find(node =>
    node.querySelector(':scope > span')?.textContent.trim().toLowerCase() === String(label).toLowerCase()
  ) || null;
}

function ratingScore(card, label, fallback = 0) {
  const text = ratingNode(card, label)?.querySelector('.subscore')?.textContent || '';
  const match = text.match(/(\d+)\s*\/\s*10/);
  return match ? Number(match[1]) : fallback;
}

function ratingTier(card, label, fallback = 'bronze') {
  const node = ratingNode(card, label);
  if (!node) return fallback;
  if (node.classList.contains('gold')) return 'gold';
  if (node.classList.contains('silver')) return 'silver';
  return 'bronze';
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function setFlavourVisual(card, value) {
  const node = ratingNode(card, 'Flavour');
  if (!node) return;
  const score = normaliseFlavour(value);
  node.classList.remove(...SCORE_CLASSES);
  const medal = node.querySelector('.medal');
  const bold = node.querySelector('b');
  let small = node.querySelector('.subscore');
  if (!small) {
    small = document.createElement('small');
    small.className = 'subscore';
    node.appendChild(small);
  }

  if (score === null) {
    node.classList.add('flavour-unrated');
    if (medal) medal.className = 'medal flavour-unrated-medal';
    setText(bold, 'Unrated');
    setText(small, '—');
    delete card.dataset.flavour;
    return;
  }

  const tier = tierForScore(score);
  const scoreClass = score >= 8 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low';
  node.classList.add(tier, scoreClass);
  if (medal) medal.className = `medal ${tier}`;
  setText(bold, tier[0].toUpperCase() + tier.slice(1));
  setText(small, `${score}/10`);
  card.dataset.flavour = String(score >= 7 ? 3 : score >= 5 ? 2 : 1);
}

export function ensureFlavourRating(card, value = null) {
  if (!card?.querySelector) return null;
  let node = ratingNode(card, 'Flavour');
  if (!node) {
    const medals = card.querySelector('.medals');
    if (!medals) return null;
    const strength = ratingNode(card, 'Strength');
    if (strength) strength.insertAdjacentHTML('afterend', flavourRatingMarkup(value));
    else medals.insertAdjacentHTML('afterbegin', flavourRatingMarkup(value));
    node = ratingNode(card, 'Flavour');
  }
  setFlavourVisual(card, value);
  return node;
}

function awardKindFromCard(card) {
  if (card.classList.contains('gem-laurel')) return 'gem';
  if (card.classList.contains('crown-laurel')) return 'crown';
  return 'none';
}

function applyLaurelKind(card, kind) {
  const current = awardKindFromCard(card);
  const existingAward = card.querySelector('.gem-award');
  if (current === kind && ((kind === 'none' && !existingAward) || (kind !== 'none' && existingAward))) return;

  const selector = kind === 'gem' ? '.gem-award.gem-tier' : kind === 'crown' ? '.gem-award.crown-tier' : '';
  const template = selector ? document.querySelector(selector)?.cloneNode(true) : null;
  card.querySelectorAll('.gem-award').forEach(node => node.remove());
  card.classList.remove('crown-laurel', 'gem-laurel');
  if (kind === 'none') return;
  card.classList.add(kind === 'gem' ? 'gem-laurel' : 'crown-laurel');
  const medals = card.querySelector('.medals');
  if (template && medals) medals.insertAdjacentElement('beforebegin', template);
}

function refreshLaurelForCard(card, saved = {}) {
  let kind = String(saved.laurel || 'auto').toLowerCase();
  if (!['auto', 'none', 'crown', 'gem'].includes(kind)) kind = 'auto';
  if (kind === 'auto') {
    const strength = own(saved, 'strength') ? finite(saved.strength, 0) : ratingScore(card, 'Strength', 0);
    const quality = own(saved, 'quality') ? finite(saved.quality, 0) : ratingScore(card, 'Quality', 0);
    const flavour = own(saved, 'flavour') ? saved.flavour : null;
    const size = saved.size || ratingTier(card, 'Size', 'bronze');
    const value = ratingScore(card, 'Value', 0);
    kind = deriveAutoLaurel({ strength, quality, flavour, size, value });
  }
  applyLaurelKind(card, kind);
}

let state = { version: 3, cards: {}, sections: {}, entries: {} };
let refreshTimer = 0;
let pendingSave = null;

function selectedKey() {
  const selected = document.getElementById('catalogue-admin-card')?.value || '';
  if (selected && !selected.startsWith('__v139_')) return selected;
  const draftKey = document.getElementById('catalogue-v139-key')?.value || '';
  return String(draftKey).trim().toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function selectedCard() {
  const key = selectedKey();
  return key && globalThis.CSS?.escape
    ? document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`)
    : null;
}

function ensureStyle() {
  if (document.getElementById('catalogue-flavour-style')) return;
  const style = document.createElement('style');
  style.id = 'catalogue-flavour-style';
  style.textContent = `
.rating.flavour-unrated{opacity:.68}
.rating.flavour-unrated .flavour-unrated-medal{filter:grayscale(1);opacity:.38}
.rating.flavour-unrated b,.rating.flavour-unrated .subscore{color:inherit;opacity:.72}
.medals{grid-template-columns:repeat(5,minmax(0,1fr))!important}
@media(max-width:700px){.medals{gap:4px!important}.medals .rating{min-width:0!important}.medals .rating>span{font-size:8px!important}.medals .rating b{font-size:9px!important}.medals .subscore{font-size:8px!important}}
`;
  document.head.appendChild(style);
}

function ensureFlavourEditor() {
  if (document.getElementById('catalogue-admin-flavour')) return;
  const strength = document.getElementById('catalogue-admin-strength');
  if (!strength) return;
  const host = strength.closest('.catalogue-admin-field') || strength.parentElement;
  if (!host?.parentElement) return;
  const field = document.createElement('div');
  field.className = host.className || 'catalogue-admin-field';
  field.innerHTML = '<label for="catalogue-admin-flavour">Flavour</label><input id="catalogue-admin-flavour" type="number" min="1" max="10" step="1" placeholder="Unrated"><small class="catalogue-admin-derived">Flavour intensity / richness. Leave blank for unrated.</small>';
  host.insertAdjacentElement('afterend', field);
}

function populateEditorField() {
  ensureFlavourEditor();
  const input = document.getElementById('catalogue-admin-flavour');
  if (!input) return;
  const key = selectedKey();
  if (!key || document.getElementById('catalogue-admin-card')?.value?.startsWith('__v139_')) {
    input.value = '';
    return;
  }
  const saved = state.cards?.[key];
  const score = saved && own(saved, 'flavour') ? normaliseFlavour(saved.flavour) : null;
  input.value = score === null ? '' : String(score);
}

function refreshAllCards() {
  refreshTimer = 0;
  ensureStyle();
  ensureFlavourEditor();
  document.querySelectorAll('article.card[data-key]').forEach(card => {
    const saved = state.cards?.[card.dataset.key] || {};
    const flavour = own(saved, 'flavour') ? saved.flavour : null;
    ensureFlavourRating(card, flavour);
    refreshLaurelForCard(card, saved);
  });
  populateEditorField();
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(refreshAllCards, 0);
}

function stateApiUrl(input) {
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    if (!raw) return null;
    return new URL(raw, location.href);
  } catch (_) {
    return null;
  }
}

function patchFetch() {
  const original = globalThis.fetch;
  if (typeof original !== 'function' || original.__catalogueFlavourWrapped) return;

  async function wrappedFetch(input, init = {}) {
    const url = stateApiUrl(input);
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    let options = init;
    let injectedPayload = null;

    if (url?.pathname === STATE_API && method === 'PUT' && pendingSave && Date.now() - pendingSave.at < 15000 && typeof init?.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        injectedPayload = injectFlavourIntoStatePayload(payload, pendingSave.key, pendingSave.flavour);
        options = { ...init, body: JSON.stringify(injectedPayload) };
      } catch (_) {}
      pendingSave = null;
    }

    const response = await original.call(globalThis, input, options);

    if (url?.pathname === STATE_API && response.ok) {
      if (method === 'GET' || method === 'HEAD') {
        response.clone().json().then(payload => {
          if (payload && typeof payload === 'object') {
            state = payload;
            scheduleRefresh();
          }
        }).catch(() => {});
      } else if (method === 'PUT' && injectedPayload) {
        state = { ...state, cards: injectedPayload.cards || state.cards || {} };
        scheduleRefresh();
      }
    }
    return response;
  }

  wrappedFetch.__catalogueFlavourWrapped = true;
  wrappedFetch.__catalogueFlavourOriginal = original;
  globalThis.fetch = wrappedFetch;
}

async function loadState() {
  try {
    const response = await fetch(STATE_API, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload && typeof payload === 'object') state = payload;
  } catch (_) {}
  scheduleRefresh();
}

function mutationAddsRelevantNode(mutation) {
  return Array.from(mutation.addedNodes || []).some(node => {
    if (node.nodeType !== 1) return false;
    if (node.matches?.('article.card[data-key],#catalogue-admin')) return true;
    return Boolean(node.querySelector?.('article.card[data-key],#catalogue-admin'));
  });
}

function bindEvents() {
  document.addEventListener('click', event => {
    const save = event.target?.closest?.('#catalogue-admin-save');
    if (save) {
      const key = selectedKey();
      const input = document.getElementById('catalogue-admin-flavour');
      const modal = document.getElementById('catalogue-admin');
      if (key && input && modal && !modal.hidden) pendingSave = { key, flavour: input.value, at: Date.now() };
    }
    if (event.target?.closest?.('#catalogue-admin-toggle')) setTimeout(populateEditorField, 0);
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'catalogue-admin-card') setTimeout(populateEditorField, 0);
  });

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutationAddsRelevantNode)) scheduleRefresh();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function initFlavourRuntime() {
  patchFetch();
  ensureStyle();
  ensureFlavourEditor();
  bindEvents();
  scheduleRefresh();
  loadState();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFlavourRuntime, { once: true });
  else initFlavourRuntime();
}
