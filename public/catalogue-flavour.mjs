import { deriveValue } from './catalogue-value.mjs';
import { blendEffectiveRecord, normaliseBlendVariants } from './catalogue-variants.mjs?v=entry-flavour-1';
import {
  FLAVOUR_AXES,
  FLAVOUR_SCALE_MAX,
  normaliseFlavourProfile
} from './catalogue-flavour-axes.mjs?v=flavour-profile-1';
import {
  deriveOverallScore,
  flavourRatingMarkup,
  flavourTier as tierForScore,
  normaliseFlavour,
  overallScoreTier,
  overallScoreTitle
} from './catalogue-overall-score.mjs?v=entry-flavour-1';
import {
  registerCatalogueStateTransform,
  registerCatalogueStateResponseListener
} from './catalogue-save-pipeline.mjs';

const STATE_API = '/api/catalogue-overrides';
const SCORE_CLASSES = ['gold', 'silver', 'bronze', 'score-high', 'score-mid', 'score-low', 'flavour-unrated'];

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export { flavourRatingMarkup, normaliseFlavour };


// Only the axes actually typed in. A cigar that tastes of nothing but cedar and pepper
// should carry two bars, not seven, five of which say zero: a blank axis means the cigar
// was not judged on it, and that is different from judging it absent.
export function profileFromEditorFields(root = globalThis.document) {
  const profile = {};
  for (const axis of FLAVOUR_AXES) {
    const input = root?.getElementById?.(`catalogue-admin-flavour-${axis.id}`);
    const entered = String(input?.value ?? '').trim();
    if (entered === '') continue;
    const score = Number(entered);
    if (!Number.isFinite(score)) continue;
    profile[axis.id] = Math.max(0, Math.min(FLAVOUR_SCALE_MAX, Math.round(score)));
  }
  return profile;
}

export function injectFlavourProfileIntoStatePayload(payload, key, profile) {
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
        flavourProfile: normaliseFlavourProfile(profile)
      }
    }
  };
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

// Gem and Crown are decided by the number of Gold rating fields and nothing else.
//
// There is no strength gate and no per-cigar exception: a cigar with all five Golds is a
// Gem, a cigar with exactly four is a Crown, and anything below that gets neither. The
// weighted /100 score deliberately plays no part here.
export function countGoldRatings({ strength, quality, flavour, size, value } = {}) {
  let golds = 0;
  if (finite(strength, 0) >= 7) golds++;
  if (finite(quality, 0) >= 7) golds++;
  const flavourScore = normaliseFlavour(flavour);
  if (flavourScore !== null && flavourScore >= 7) golds++;
  if (String(size || '').toLowerCase() === 'gold') golds++;
  if (finite(value, 0) >= 7) golds++;
  return golds;
}

export function deriveAutoLaurel(ratings = {}) {
  const golds = countGoldRatings(ratings);
  if (golds >= 5) return 'gem';
  if (golds === 4) return 'crown';
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

function formatAUD(value) {
  const number = Math.max(0, finite(value));
  return `A$${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2)}`;
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

function setValueVisual(card, value) {
  const node = ratingNode(card, 'Value');
  if (!node) return;
  const score = Math.max(1, Math.min(10, Math.round(finite(value, 1))));
  node.classList.remove('gold', 'silver', 'bronze', 'score-high', 'score-mid', 'score-low');
  const tier = tierForScore(score);
  const scoreClass = score >= 8 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low';
  node.classList.add(tier, scoreClass);
  const medal = node.querySelector('.medal');
  if (medal) medal.className = `medal ${tier}`;
  setText(node.querySelector('b'), tier[0].toUpperCase() + tier.slice(1));
  let small = node.querySelector('.subscore');
  if (!small) {
    small = document.createElement('small');
    small.className = 'subscore';
    node.appendChild(small);
  }
  setText(small, `${score}/10`);
  card.dataset.value = String(score >= 7 ? 3 : score >= 5 ? 2 : 1);
}

// The size-adjusted runtime is the authority on Value. It registers itself here so a
// card's Value medal has exactly one writer. Without this both modules looped over every
// card on their own timers, one scoring with the size factor and one without, and the
// medal settled on whichever loop happened to run last.
let valueRefreshOverride = null;

export function registerValueRefresh(handler) {
  valueRefreshOverride = typeof handler === 'function' ? handler : null;
}

export function refreshValueForCard(card, flavour = null) {
  if (!card) return null;
  if (valueRefreshOverride) return valueRefreshOverride(card, flavour);
  const quality = ratingScore(card, 'Quality', 5);
  const price = Math.max(0, finite(card.dataset.price));
  const result = deriveValue(price, quality, flavour);
  setValueVisual(card, result.score);
  card.dataset.expected = String(result.benchmark);
  card.dataset.ratio = Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '';
  const row = card.querySelector('.value-calc');
  if (row) {
    row.classList.remove('gold', 'silver', 'bronze');
    row.classList.add(result.score >= 7 ? 'gold' : result.score >= 5 ? 'silver' : 'bronze');
    row.innerHTML = `<span>Q${quality} benchmark <b>${formatAUD(result.benchmark)}</b></span><span>Actual <b>${formatAUD(price)}</b></span><span>Ratio <b>${Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '—'}×</b></span>`;
  }
  return result;
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

const LAUREL_LABEL = { gem: 'Gem Laurels', crown: 'Crown Laurels' };

// The artwork still lives in the page's award boxes, so the badge borrows the image rather
// than shipping a second copy of it. It has to be cached before the first removal: the
// boxes are the only source, and applyLaurelKind deletes them as it goes, so reading it
// lazily would work for the first card and come back empty for every card after it.
const laurelArt = { gem: null, crown: null };

function captureLaurelArt() {
  for (const kind of ['gem', 'crown']) {
    if (laurelArt[kind] !== null) continue;
    const selector = kind === 'gem' ? '.gem-award.gem-tier img' : '.gem-award.crown-tier img';
    laurelArt[kind] = document.querySelector(selector)?.getAttribute('src') || '';
  }
}

function laurelImageSource(kind) {
  captureLaurelArt();
  return laurelArt[kind] || '';
}

// The laurel now reads as a small icon beside the country flag instead of a full-width
// award box. Any box left in the static markup is removed on sight, so a card that was
// baked with one does not end up showing both.
function applyLaurelKind(card, kind) {
  captureLaurelArt();
  card.querySelectorAll('.gem-award').forEach(node => node.remove());

  const row = card.querySelector('.country-row');
  const existing = card.querySelector('.laurel-badge');
  if (kind === 'none' || !row) {
    existing?.remove();
    card.classList.remove('crown-laurel', 'gem-laurel');
    return;
  }

  card.classList.toggle('gem-laurel', kind === 'gem');
  card.classList.toggle('crown-laurel', kind === 'crown');

  const label = LAUREL_LABEL[kind] || '';
  const badge = existing || document.createElement('span');
  if (badge.dataset.laurel === kind && badge.isConnected) return;
  badge.className = `laurel-badge laurel-${kind}`;
  badge.dataset.laurel = kind;
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', label);
  badge.setAttribute('title', label);
  const src = laurelImageSource(kind);
  badge.innerHTML = src ? `<img alt="" src="${src}">` : `<i aria-hidden="true">${kind === 'gem' ? '◆' : '♔'}</i>`;
  if (!badge.isConnected) row.appendChild(badge);
}

// The five 1-10 scores the card is currently showing. Size renders its tier as the medal
// but still carries its own 1-10 subscore, so every field has a number to weight.
function cardRatingScores(card, saved = {}) {
  const flavourSaved = own(saved, 'flavour') ? normaliseFlavour(saved.flavour) : null;
  return {
    strength: own(saved, 'strength') ? finite(saved.strength, 0) : ratingScore(card, 'Strength', 0),
    quality: own(saved, 'quality') ? finite(saved.quality, 0) : ratingScore(card, 'Quality', 0),
    flavour: flavourSaved !== null ? flavourSaved : ratingScore(card, 'Flavour', 0),
    size: finite(card?.dataset?.sizeScore, 0) || ratingScore(card, 'Size', 0),
    value: ratingScore(card, 'Value', 0)
  };
}

// The score sits to the left of the flag and shows the figure alone.
function refreshOverallScoreForCard(card, saved = {}) {
  if (!card?.querySelector) return null;
  const { score, provisional } = deriveOverallScore(cardRatingScores(card, saved));
  const existing = card.querySelector('.overall-score');
  const row = card.querySelector('.country-row');
  if (score === null || !row) {
    existing?.remove();
    delete card.dataset.overallScore;
    return null;
  }
  const node = existing || document.createElement('span');
  node.className = `overall-score ${overallScoreTier(score)}${provisional ? ' is-provisional' : ''}`;
  node.setAttribute('title', overallScoreTitle(provisional));
  node.textContent = String(score);
  // Always the first child, so it stays left of the flag however often this reruns.
  if (node.parentElement !== row || row.firstElementChild !== node) row.prepend(node);
  card.dataset.overallScore = String(score);
  return score;
}

export function refreshLaurelForCard(card, saved = {}) {
  const scores = cardRatingScores(card, saved);
  let kind = String(saved.laurel || 'auto').toLowerCase();
  if (!['auto', 'none', 'crown', 'gem'].includes(kind)) kind = 'auto';
  if (kind === 'auto') {
    // Size gold is a ring-gauge band, not a score threshold, so the tier is what counts.
    const size = saved.size || ratingTier(card, 'Size', 'bronze');
    kind = deriveAutoLaurel({ ...scores, size });
  }
  applyLaurelKind(card, kind);
  refreshOverallScoreForCard(card, saved);
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
/* One card per row on a phone.
   This rule also lives in the page stylesheet, but the page is the one URL that never
   changes: a browser holding the document in a tab keeps the old CSS while still fetching
   fresh modules, which is how a phone ends up with the current script and a two-column
   layout. This module is proven to run whenever a card renders, so the rule is repeated
   here where a stale document cannot strand it. */
@media(max-width:900px){
  html body .grid.grid.grid{grid-template-columns:minmax(0,1fr)!important;width:100%!important;margin-inline:0!important}
  html body .grid.grid.grid>article.card{grid-column:auto!important;transform:none!important;width:100%!important;max-width:100%!important;margin-inline:auto!important}
  html body article.card .artframe{min-height:400px!important}
}
/* Score, flag and laurel centred across the card at every width, and a laurel large enough
   to read at a glance. Repeated here for the same reason as the rule above: a browser
   holding the old document keeps the old stylesheet while still fetching fresh modules. */
html body .country-above .country-row{grid-column:1/-1}
html body .country-above .country-flag{transform:scale(1.1);margin-inline:2px}
html body .country-above .overall-score{transform:scale(1.1);margin-inline:2px}
html body .laurel-badge{width:30px;height:28px}
html body .laurel-badge i{font-size:18px}
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

  // The profile is per-axis and every axis is optional, so this is a row of blanks rather
  // than seven zeroes. Leaving one blank keeps that bar off the card entirely.
  const profileField = document.createElement('div');
  profileField.className = host.className || 'catalogue-admin-field';
  profileField.id = 'catalogue-admin-flavour-profile';
  const inputs = FLAVOUR_AXES.map(axis =>
    `<span class="catalogue-admin-axis"><label for="catalogue-admin-flavour-${axis.id}">`
    + `<i class="flavour-icon" style="--flavour-colour:${axis.colour};-webkit-mask-image:url('${axis.mask}');mask-image:url('${axis.mask}')"></i>`
    + `${axis.label}</label>`
    + `<input id="catalogue-admin-flavour-${axis.id}" type="number" min="0" max="${FLAVOUR_SCALE_MAX}" step="1" placeholder="—"></span>`
  ).join('');
  profileField.innerHTML = `<label>Flavour profile 0\u2013${FLAVOUR_SCALE_MAX}</label>`
    + `<div class="catalogue-admin-axes">${inputs}</div>`
    + '<small class="catalogue-admin-derived">Only the axes this cigar actually shows. '
    + 'Leave an axis blank to keep it off the card; 0 means judged and absent.</small>';
  field.insertAdjacentElement('afterend', profileField);
}

export function previewFlavourAdjustedValue() {
  const flavourInput = document.getElementById('catalogue-admin-flavour');
  const qualityInput = document.getElementById('catalogue-admin-quality');
  const priceInput = document.getElementById('catalogue-v139-price');
  if (!flavourInput || !qualityInput || !priceInput) return null;

  const flavour = normaliseFlavour(flavourInput.value);
  const quality = Math.max(1, Math.min(10, Math.round(finite(qualityInput.value, 1))));
  const price = Math.max(0, finite(priceInput.value));
  const result = deriveValue(price, quality, flavour);
  const valueInput = document.getElementById('catalogue-admin-value');
  if (valueInput) valueInput.value = String(result.score);
  const detail = document.getElementById('catalogue-admin-value-detail');
  if (detail) {
    const baseRatio = Number.isFinite(result.baseRatio) ? result.baseRatio.toFixed(2) : '—';
    const adjustedRatio = Number.isFinite(result.ratio) ? result.ratio.toFixed(2) : '—';
    const flavourNote = result.flavourMultiplier < 1 && flavour !== null
      ? ` · Flavour ${flavour}/10 ×${result.flavourMultiplier.toFixed(2)}`
      : '';
    detail.textContent = `Q${quality} benchmark ${formatAUD(result.benchmark)} · base ratio ${baseRatio}×${flavourNote} · adjusted ratio ${adjustedRatio}×`;
  }

  const card = selectedCard();
  if (card) {
    refreshValueForCard(card, flavour);
    const saved = { ...(state.cards?.[card.dataset.key] || {}), flavour };
    refreshLaurelForCard(card, saved);
  }
  return result;
}

function populateEditorField() {
  ensureFlavourEditor();
  const input = document.getElementById('catalogue-admin-flavour');
  if (!input) return;
  const key = selectedKey();
  if (!key || document.getElementById('catalogue-admin-card')?.value?.startsWith('__v139_')) {
    input.value = '';
    setTimeout(previewFlavourAdjustedValue, 0);
    return;
  }
  const saved = state.cards?.[key];
  const score = saved && own(saved, 'flavour') ? normaliseFlavour(saved.flavour) : null;
  input.value = score === null ? '' : String(score);
  populateProfileFields(saved);
  setTimeout(previewFlavourAdjustedValue, 0);
}

function populateProfileFields(saved) {
  const merged = { ...(saved || {}), ...(state.entries?.[selectedKey()] || {}) };
  const profile = normaliseFlavourProfile(merged.flavourProfile);
  for (const axis of FLAVOUR_AXES) {
    const field = document.getElementById(`catalogue-admin-flavour-${axis.id}`);
    if (!field) continue;
    field.value = own(profile, axis.id) ? String(profile[axis.id]) : '';
  }
}

// The ratings this sweep should paint onto one card.
//
// This used to read the card override alone. On a card showing an alternate blend that is
// the wrong cigar's rating: the sweep reruns on every state refresh, so a Maduro rated 9
// was repainted with the Natural's 7 moments after the blend selector applied it, and the
// Value and overall score derived from it went with it. Cards without blends keep reading
// the override exactly as before.
function savedRatingsForCard(card) {
  const key = card?.dataset?.key || '';
  const override = state.cards?.[key] || {};
  const merged = { ...override, ...(state.entries?.[key] || {}) };
  if (!normaliseBlendVariants(merged).length) return override;
  return blendEffectiveRecord(merged, card.dataset.activeBlend || '').record;
}


// Profiles can arrive after the initial HTML through catalogue state. Redraw them on the
// same state sweep that already repaints ratings, Value and laurels. This also means an
// admin edit can add or remove axes without requiring a blend switch or page reload.
function syncFlavourProfileForCard(card, profile) {
  const existing = card?.querySelector?.('.flavour-profile');
  const markup = flavourProfileMarkup(profile);
  if (!markup) { existing?.remove(); return; }
  if (existing) { existing.outerHTML = markup; return; }
  const facts = card.querySelector('.card-face-front .facts') || card.querySelector('.facts');
  if (facts) facts.insertAdjacentHTML('afterend', markup);
}

function refreshAllCards() {
  refreshTimer = 0;
  ensureStyle();
  ensureFlavourEditor();
  document.querySelectorAll('article.card[data-key]').forEach(card => {
    const saved = savedRatingsForCard(card);
    const flavour = own(saved, 'flavour') ? saved.flavour : null;
    ensureFlavourRating(card, flavour);
    syncFlavourProfileForCard(card, saved.flavourProfile);
    refreshValueForCard(card, flavour);
    refreshLaurelForCard(card, saved);
  });
  populateEditorField();
}

// Apply a catalogue state and repaint immediately. The listeners below debounce through
// scheduleRefresh; this is the undebounced entry point, so a caller can apply state and
// read the result back without waiting on a timer.
export function applyCatalogueState(next) {
  if (!next || typeof next !== 'object') return;
  state = next;
  refreshAllCards();
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(refreshAllCards, 0);
}

function installSavePipeline() {
  registerCatalogueStateTransform('flavour', 10, payload => {
    if (!pendingSave || Date.now() - pendingSave.at >= 15000) return payload;
    const withFlavour = injectFlavourIntoStatePayload(payload, pendingSave.key, pendingSave.flavour);
    const injected = injectFlavourProfileIntoStatePayload(withFlavour, pendingSave.key, pendingSave.profile);
    pendingSave = null;
    return injected;
  });
  registerCatalogueStateResponseListener('flavour', event => {
    if (!event?.state || typeof event.state !== 'object') return;
    if (event.method === 'GET' || event.method === 'HEAD') {
      state = event.state;
      scheduleRefresh();
      return;
    }
    if (event.method === 'PUT') {
      state = { ...state, cards: event.state.cards || state.cards || {} };
      scheduleRefresh();
    }
  });
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
      if (key && input && modal && !modal.hidden) {
        pendingSave = { key, flavour: input.value, profile: profileFromEditorFields(), at: Date.now() };
      }
    }
    if (event.target?.closest?.('#catalogue-admin-toggle')) setTimeout(populateEditorField, 0);
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'catalogue-admin-card') setTimeout(populateEditorField, 0);
    if (['catalogue-admin-flavour', 'catalogue-admin-quality', 'catalogue-v139-price'].includes(event.target?.id)) {
      setTimeout(previewFlavourAdjustedValue, 0);
    }
  });

  document.addEventListener('input', event => {
    if (['catalogue-admin-flavour', 'catalogue-admin-quality', 'catalogue-v139-price'].includes(event.target?.id)) {
      setTimeout(previewFlavourAdjustedValue, 0);
    }
  });

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutationAddsRelevantNode)) scheduleRefresh();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function initFlavourRuntime() {
  installSavePipeline();
  ensureStyle();
  ensureFlavourEditor();
  bindEvents();
  scheduleRefresh();
  loadState();
}

// Guarded like every other runtime module. Unguarded, merely importing this file started
// the runtime, and its loadState() fetch then hung whatever imported it: a test harness has
// no catalogue API to answer, so the request never settles and the process never exits.
if (typeof document !== 'undefined' && !globalThis.__CATALOGUE_VARIANT_TEST__) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFlavourRuntime, { once: true });
  else initFlavourRuntime();
}
