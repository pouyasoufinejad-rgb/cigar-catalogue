export const QUALITY_BENCHMARKS = Object.freeze({1:1.75,2:2.50,3:3.50,4:5,5:7,6:10,7:14,8:18,9:22,10:26});
const API = '/api/catalogue-overrides';
const IMAGE_API = '/api/catalogue-image/';

export function clampScore(value) { return Math.max(1, Math.min(10, Math.round(Number(value) || 1))); }
export function bucketForScore(value) { const n = clampScore(value); return n >= 7 ? 3 : n >= 5 ? 2 : 1; }
export function tierForScore(value) { return bucketForScore(value) === 3 ? 'gold' : bucketForScore(value) === 2 ? 'silver' : 'bronze'; }
export function sizeBucket(size) { return size === 'gold' ? 3 : size === 'silver' ? 2 : 1; }
export function deriveSize(length, ring) {
  length = Number(length) || 0; ring = Number(ring) || 0;
  if (length >= 4 && ring >= 32) return 'gold';
  if (length >= 4 && ring >= 28) return 'silver';
  return 'bronze';
}
export function deriveValue(price, quality) {
  const q = clampScore(quality);
  const benchmark = QUALITY_BENCHMARKS[q];
  const p = Number(price);
  const ratio = Number.isFinite(p) && p > 0 ? p / benchmark : NaN;
  const raw = Number.isFinite(ratio) && ratio > 0 ? 6 - 3.5 * Math.log2(ratio) : 1;
  return { quality: q, benchmark, price: p, ratio, score: Math.max(1, Math.min(10, Math.round(raw))) };
}
export function sanitiseKey(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96);
}
export function retailerLabelForUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'cigarhut.com.au' || host.endsWith('.cigarhut.com.au')) return 'Cigarhut';
    if (host === 'cigarworld.com.au' || host.endsWith('.cigarworld.com.au')) return 'Cigarworld';
    if (host === 'cigarbox.com.au' || host.endsWith('.cigarbox.com.au')) return 'CigarBox';
  } catch (_) {}
  return 'Retailer';
}
export function authHeaders(_key, json = false) {
  const headers = {};
  if (json) headers['content-type'] = 'application/json';
  return headers;
}
export function reorderByTarget(items = [], key, targetRank = 1) {
  const sorted = [...items].sort((a,b)=>(Number(a.rank)||0)-(Number(b.rank)||0));
  const found = sorted.find(item => item.key === key);
  const others = sorted.filter(item => item.key !== key);
  if (!found) return others.map(item => item.key);
  const index = Math.max(0, Math.min(others.length, Math.round(Number(targetRank) || 1) - 1));
  others.splice(index, 0, found);
  return others.map(item => item.key);
}

function cleanString(value, max = 5000) { return String(value ?? '').trim().slice(0, max); }
function cleanLines(value, maxLines = 12) {
  const lines = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return lines.map(v => cleanString(v, 500)).filter(Boolean).slice(0, maxLines);
}
function normaliseLinks(value) {
  const links = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  const out = [];
  for (const raw of links) {
    const text = cleanString(raw, 1000);
    if (!text) continue;
    try { const u = new URL(text); if (!/^https?:$/.test(u.protocol)) continue; out.push(u.toString()); } catch (_) {}
  }
  return [...new Set(out)].slice(0, 6);
}
function safeMarkup(value) {
  const input = String(value || '');
  if (typeof DOMParser === 'undefined') {
    return input.replace(/<\/?(?:script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*>/gi, '').replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '').replace(/javascript:/gi, '');
  }
  const doc = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  root.querySelectorAll('script,style,iframe,object,embed,form,input,button,textarea,select').forEach(n => n.remove());
  root.querySelectorAll('*').forEach(node => Array.from(node.attributes).forEach(attr => {
    const name = attr.name.toLowerCase(); const val = attr.value.trim().toLowerCase();
    if (name.startsWith('on') || ((name === 'href' || name === 'src') && val.startsWith('javascript:'))) node.removeAttribute(attr.name);
  }));
  return root.innerHTML;
}
export function normaliseSections(input = {}) {
  const sections = input && typeof input === 'object' ? input : {};
  return {
    legendHtml: safeMarkup(sections.legendHtml || ''),
    benchmarksHtml: safeMarkup(sections.benchmarksHtml || '')
  };
}
export function normaliseEntry(input = {}) {
  const key = sanitiseKey(input.key || `${input.brand || ''}-${input.title || ''}`) || `entry-${Date.now()}`;
  const quality = clampScore(input.quality ?? 5);
  const strength = clampScore(input.strength ?? 5);
  const price = Math.max(0, Number(input.price) || 0);
  const length = Math.max(0, Number(input.length) || 0);
  const ring = Math.max(0, Math.round(Number(input.ring) || 0));
  const size = ['gold','silver','bronze'].includes(input.size) ? input.size : deriveSize(length, ring);
  const value = deriveValue(price, quality).score;
  const stock = ['in','out','unknown','delisted'].includes(input.stock) ? input.stock : 'unknown';
  const stockPin = ['in','out','hold',''].includes(input.stockPin) ? input.stockPin : '';
  return {
    ...input,
    key,
    brand: cleanString(input.brand, 120), title: cleanString(input.title, 180), eyebrow: cleanString(input.eyebrow, 220),
    packagePrice: Math.max(0, Number(input.packagePrice) || price), packageLabel: cleanString(input.packageLabel || 'single cigar', 120),
    price, length, ring, country: cleanString(input.country || '', 60), rank: Math.max(1, Math.round(Number(input.rank) || 1)),
    strength, quality, value, size, format: sizeBucket(size), risk: Math.max(1, Math.min(3, Math.round(Number(input.risk) || 1))),
    taster: Boolean(input.taster), archived: Boolean(input.archived), archivedAt: cleanString(input.archivedAt || '', 80),
    stock, stockPin, experienceTags: cleanLines(input.experienceTags, 12),
    summaryHtml: safeMarkup(input.summaryHtml), noteHtml: safeMarkup(input.noteHtml),
    productionLines: cleanLines(input.productionLines, 8), practicalLines: cleanLines(input.practicalLines, 8), smokeTime: cleanString(input.smokeTime, 100),
    retailerLinks: normaliseLinks(input.retailerLinks?.length ? input.retailerLinks : input.retailerUrl || ''),
    imageUrl: cleanString(input.imageUrl || '', 2000), imageVersion: Math.max(0, Number(input.imageVersion) || 0),
    laurel: ['auto','none','crown','gem'].includes(input.laurel) ? input.laurel : 'auto'
  };
}

export function staticOverrideFromEntry(raw = {}) {
  const e = normaliseEntry(raw);
  return {
    brand: e.brand, title: e.title, eyebrow: e.eyebrow,
    packagePrice: e.packagePrice, packageLabel: e.packageLabel, price: e.price,
    length: e.length, ring: e.ring, country: e.country, rank: e.rank,
    strength: e.strength, quality: e.quality, value: e.value, size: e.size, format: e.format, risk: e.risk,
    taster: e.taster, archived: e.archived, archivedAt: e.archivedAt, stock: e.stock, stockPin: e.stockPin,
    experienceTags: e.experienceTags, summaryHtml: e.summaryHtml, noteHtml: e.noteHtml,
    productionLines: e.productionLines, practicalLines: e.practicalLines, smokeTime: e.smokeTime,
    retailerLinks: e.retailerLinks, imageVersion: e.imageVersion, laurel: e.laurel
  };
}

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function aud(value) { const n = Number(value); if (!Number.isFinite(n)) return 'A$—'; return `A$${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)}`; }
function countryClass(country) {
  const value = String(country || '').toLowerCase();
  if (value === 'dr' || value.includes('dominican')) return 'dominican';
  if (value.includes('nicaragua')) return 'nicaragua';
  if (value.includes('cuba')) return 'cuba';
  if (value.includes('ital')) return 'italy';
  if (value.includes('hondur')) return 'honduras';
  if (value.includes('brazil')) return 'brazil';
  return '';
}
function medalRating(label, score) {
  const tier = tierForScore(score); return `<div class="rating ${tier}"><span>${esc(label)}</span><i aria-hidden="true" class="medal ${tier}"></i><b>${tier[0].toUpperCase()+tier.slice(1)}</b><small class="subscore">${clampScore(score)}/10</small></div>`;
}
function sizeRating(size) {
  const tier = ['gold','silver','bronze'].includes(size) ? size : 'bronze'; return `<div class="rating ${tier}"><span>Size</span><i aria-hidden="true" class="medal ${tier}"></i><b>${tier[0].toUpperCase()+tier.slice(1)}</b></div>`;
}
function riskHtml(risk) {
  const map = {1:['green','Low risk'],2:['yellow','Moderate risk'],3:['red','High risk']}; const [tone,label] = map[risk] || map[2];
  return `<div aria-label="Risk: ${label.toLowerCase()}" class="risk-badge risk-${tone}"><i aria-hidden="true" class="risk-icon ${tone}">✓</i><span>${label}</span></div>`;
}
function imageSrc(entry) {
  if (entry.imageVersion) return `${IMAGE_API}${encodeURIComponent(entry.key)}?v=${encodeURIComponent(entry.imageVersion)}`;
  return entry.imageUrl || '';
}
function linksHtml(entry) {
  return entry.retailerLinks.map((url, i) => `<a class="shop" href="${esc(url)}" rel="noopener" ${i ? 'style="margin-top:8px"' : ''} target="_blank">View at ${esc(retailerLabelForUrl(url))} <span>↗</span></a>`).join('');
}
function stockHtml(entry) {
  const manual = entry.stockPin === 'in' ? 'Manually marked available' : entry.stockPin === 'out' ? 'Manually marked unavailable' : entry.stockPin === 'hold' ? 'Stock check on hold' : '';
  const status = manual || (entry.stock === 'in' ? 'In stock' : entry.stock === 'out' ? 'Out of stock' : 'Stock unknown');
  const cls = entry.stockPin === 'in' || (!entry.stockPin && entry.stock === 'in') ? 'live-stock-in' : entry.stockPin === 'out' || (!entry.stockPin && entry.stock === 'out') ? 'live-stock-out' : '';
  return `<div class="freshness ${cls}"><span class="stock-state">${esc(status)}</span><span class="checked-state">${manual ? 'Manual stock override saved to Cloudflare KV' : 'Automatic retailer check enabled'}</span></div>`;
}
function tierForEntry(entry) {
  const strengthGold = bucketForScore(entry.strength) === 3, qualityGold = bucketForScore(entry.quality) === 3;
  return strengthGold && qualityGold ? 'elite' : (strengthGold || qualityGold ? 'strong' : 'noteworthy');
}
export function laurelTypeForEntry(rawEntry = {}) {
  const entry = normaliseEntry(rawEntry);
  if (entry.laurel === 'crown' || entry.laurel === 'gem') return entry.laurel;
  if (entry.laurel === 'none') return 'none';
  const strengthBucket = bucketForScore(entry.strength);
  const golds = [bucketForScore(entry.strength), bucketForScore(entry.quality), sizeBucket(entry.size), bucketForScore(entry.value)].filter(v => v === 3).length;
  if (strengthBucket < 2 || golds < 3) return 'none';
  return golds === 4 ? 'gem' : 'crown';
}
export function renderCardHtml(rawEntry) {
  const entry = normaliseEntry(rawEntry); const valueInfo = deriveValue(entry.price, entry.quality); const tier = tierForEntry(entry);
  const image = imageSrc(entry); const country = countryClass(entry.country);
  const exp = entry.experienceTags.length ? `<div class="tag-groups"><div class="tag-group"><span class="tag-label">Experience</span><div class="tag-items">${entry.experienceTags.map(x=>`<span class="tag-chip">${esc(x)}</span>`).join('')}</div></div></div>` : '';
  const note = entry.noteHtml ? `<p class="mog-note">${entry.noteHtml}</p>` : '';
  const production = entry.productionLines.map(x=>`<span class="artmeta-line">${esc(x)}</span>`).join('');
  const practical = entry.practicalLines.map(x=>`<span class="artmeta-line">${esc(x)}</span>`).join('');
  const archivedAttrs = entry.archived ? ` data-archived="1" data-archived-at="${esc(entry.archivedAt || new Date().toISOString())}"` : '';
  const tasterAttr = entry.taster ? ' data-taster="1"' : '';
  return `<article class="card${entry.archived ? ' archived-card' : ''}" data-dynamic-entry="1" data-key="${esc(entry.key)}" data-expected="${valueInfo.benchmark}" data-format="${sizeBucket(entry.size)}" data-price="${entry.price.toFixed(2)}" data-quality="${bucketForScore(entry.quality)}" data-rank="${entry.rank}" data-ratio="${Number.isFinite(valueInfo.ratio)?valueInfo.ratio.toFixed(2):''}" data-risk="${entry.risk}" data-stock="${esc(entry.stock)}" data-strength="${bucketForScore(entry.strength)}" data-value="${bucketForScore(entry.value)}" data-tier="${tier}"${tasterAttr}${archivedAttrs}${entry.stockPin ? ` data-stock-pin="${esc(entry.stockPin)}"` : ''}>
<div class="artframe size-normalized" data-visual-length="${entry.length}" data-visual-ring="${entry.ring}" style="--visual-footprint:${Math.max(.32,Math.min(1.15,(entry.length/5)*(entry.ring/50))).toFixed(4)}">
${image ? `<img alt="${esc(`${entry.brand} ${entry.title}`)}" src="${esc(image)}">` : '<div class="v137-image-placeholder">No image</div>'}
<div class="rankflag"><span>${entry.taster?'Taster':'No.'}</span><b>${entry.taster?`T${entry.rank}`:entry.rank}</b></div>${riskHtml(entry.risk)}
<div class="artmeta artmeta-left"><span class="artmeta-title">Production</span>${production}</div><div class="artmeta artmeta-right"><span class="artmeta-title">Practical</span>${practical}</div>${entry.smokeTime?`<div class="artmeta artmeta-bottom">${esc(entry.smokeTime)}</div>`:''}</div>
<div class="cardbody">${!entry.taster?`<div class="tier-badge">${tier==='elite'?'Elite':tier==='strong'?'Strong':'Noteworthy'}</div>`:''}<div class="eyebrow">${entry.archived?'Archived':entry.taster?`T${entry.rank}`:`No. ${entry.rank}`} — ${esc(entry.eyebrow)}</div><h3><span>${esc(entry.brand)}</span>${esc(entry.title)}</h3>
<div class="country-above"><div class="country-row">${country?`<span aria-hidden="true" class="country-flag flag-${country}"></span>`:''}<span class="country-name">${esc(entry.country)}</span></div></div>
<div class="facts"><div><b>${aud(entry.packagePrice)}</b><small>${esc(entry.packageLabel)}</small></div><div><b>${aud(entry.price)}</b><small>per stick</small></div><div class="size-only"><b>${entry.length}″ × ${entry.ring}</b><small>length x ring gauge</small></div></div>
<div class="value-calc ${tierForScore(entry.value)}"><span>Q${entry.quality} benchmark <b>${aud(valueInfo.benchmark)}</b></span><span>Actual <b>${aud(entry.price)}</b></span><span>Ratio <b>${Number.isFinite(valueInfo.ratio)?valueInfo.ratio.toFixed(2):'—'}×</b></span></div>${stockHtml(entry)}
<div class="medals">${medalRating('Strength',entry.strength)}${medalRating('Quality',entry.quality)}${sizeRating(entry.size)}${medalRating('Value',entry.value)}</div>${exp}<p class="summary">${entry.summaryHtml}</p>${note}${linksHtml(entry)}</div></article>`;
}

function q(id) { return document.getElementById(id); }
function allCards() { return Array.from(document.querySelectorAll('article.card[data-key]')); }
function ratingNode(card, name) { return Array.from(card.querySelectorAll('.rating')).find(n => n.querySelector(':scope > span')?.textContent.trim().toLowerCase() === name.toLowerCase()) || null; }
function scoreFromCard(card, name, fallback=5) { const m = ratingNode(card,name)?.querySelector('.subscore')?.textContent.match(/(\d+)\s*\/\s*10/); return m ? Number(m[1]) : fallback; }
function sizeFromCard(card) { const n=ratingNode(card,'Size'); return n?.classList.contains('gold')?'gold':n?.classList.contains('silver')?'silver':'bronze'; }
function h3Title(card) { const node=card.querySelector('h3'); if(!node)return ''; const copy=node.cloneNode(true); copy.querySelector('span')?.remove(); return copy.textContent.trim(); }
function numText(text) { const m=String(text||'').replace(/,/g,'').match(/\d+(?:\.\d+)?/); return m?Number(m[0]):0; }
function staticEntryFromCard(card) {
  const facts=card.querySelectorAll('.facts>div'); const art=card.querySelector('.artframe');
  const experience=Array.from(card.querySelectorAll('.tag-group')).find(g=>g.querySelector('.tag-label')?.textContent.trim()==='Experience');
  return normaliseEntry({
    key:card.dataset.key, brand:card.querySelector('h3 span')?.textContent||'', title:h3Title(card), eyebrow:(card.querySelector('.eyebrow')?.textContent||'').replace(/^(?:T\d+|Taster|No\.\s*\d+|Archived)\s*[—–-]\s*/,''),
    packagePrice:numText(facts[0]?.querySelector('b')?.textContent), packageLabel:facts[0]?.querySelector('small')?.textContent||'', price:Number(card.dataset.price)||numText(facts[1]?.querySelector('b')?.textContent),
    length:Number(art?.dataset.visualLength)||0, ring:Number(art?.dataset.visualRing)||0, country:card.querySelector('.country-name')?.textContent||'', rank:Number(card.dataset.rank)||1,
    strength:scoreFromCard(card,'Strength'), quality:scoreFromCard(card,'Quality'), size:sizeFromCard(card), risk:Number(card.dataset.risk)||1,
    taster:card.dataset.taster==='1', archived:card.dataset.archived==='1', archivedAt:card.dataset.archivedAt||'', stock:card.dataset.stock||'unknown', stockPin:card.dataset.stockPin||'',
    experienceTags:experience?Array.from(experience.querySelectorAll('.tag-chip')).map(n=>n.textContent.trim()):[], summaryHtml:card.querySelector('.summary')?.innerHTML||'', noteHtml:card.querySelector('.mog-note')?.innerHTML||'',
    productionLines:Array.from(card.querySelectorAll('.artmeta-left .artmeta-line')).map(n=>n.textContent.trim()), practicalLines:Array.from(card.querySelectorAll('.artmeta-right .artmeta-line')).map(n=>n.textContent.trim()), smokeTime:card.querySelector('.artmeta-bottom')?.textContent||'',
    retailerLinks:Array.from(card.querySelectorAll('a.shop[href]')).map(a=>a.href), imageUrl:card.querySelector('.artframe img')?.getAttribute('src')||'', imageVersion:0,
    laurel:card.classList.contains('gem-laurel')?'gem':card.classList.contains('crown-laurel')?'crown':'auto'
  });
}
function registerCard(card) {
  if (!card) return;
  const all = window.__CATALOGUE_CARDS__ || (window.__CATALOGUE_CARDS__ = allCards().filter(c=>c!==card));
  if (!all.includes(card)) all.push(card);
  const main = window.__CATALOGUE_MAIN_CARDS__ || (window.__CATALOGUE_MAIN_CARDS__ = all.filter(c=>c.dataset.taster!=='1'));
  const tasters = window.__CATALOGUE_TASTER_CARDS__ || (window.__CATALOGUE_TASTER_CARDS__ = all.filter(c=>c.dataset.taster==='1'));
  if(card.dataset.taster==='1'){ if(!tasters.includes(card))tasters.push(card); const i=main.indexOf(card); if(i>=0)main.splice(i,1); }
  else { if(!main.includes(card))main.push(card); const i=tasters.indexOf(card); if(i>=0)tasters.splice(i,1); }
}
function unregisterCard(card) {
  for (const key of ['__CATALOGUE_CARDS__','__CATALOGUE_MAIN_CARDS__','__CATALOGUE_TASTER_CARDS__']) {
    const arr=window[key]; if(!Array.isArray(arr))continue; const i=arr.indexOf(card); if(i>=0)arr.splice(i,1);
  }
}
function targetFor(card) {
  if(card.dataset.archived==='1') return q('archived-cards');
  if(card.dataset.taster==='1') return q('taster-cards');
  if(card.dataset.tier==='elite') return q('tier-elite');
  if(card.dataset.tier==='strong') return q('tier-strong');
  if(Number(card.dataset.value)===3) return q('noteworthy-cheap');
  if(Number(card.dataset.format)===3) return q('noteworthy-substantial');
  return q('noteworthy-neither');
}
function refreshRisk(card, risk) {
  const old = card?.querySelector('.risk-badge');
  if (!card || !old) return;
  const template = document.createElement('template'); template.innerHTML = riskHtml(Math.max(1, Math.min(3, Number(risk) || 1))).trim();
  old.replaceWith(template.content.firstElementChild);
}
function refreshCountry(card, country) {
  const row = card?.querySelector('.country-row'); if (!row) return;
  row.querySelector('.country-flag')?.remove();
  const cls = countryClass(country);
  if (cls) { const flag=document.createElement('span'); flag.className=`country-flag flag-${cls}`; flag.setAttribute('aria-hidden','true'); row.insertBefore(flag,row.firstChild); }
  const name=row.querySelector('.country-name'); if(name) name.textContent=country || '';
}
function awardTemplate(type) {
  const selector = type === 'gem' ? '.gem-award.gem-tier' : '.gem-award.crown-tier';
  const node = Array.from(document.querySelectorAll(selector)).find(n => !n.closest('article.card[data-dynamic-entry="1"]')) || document.querySelector(selector);
  return node ? node.cloneNode(true) : null;
}
function refreshLaurel(card, rawEntry) {
  if (!card) return;
  card.classList.remove('crown-laurel','gem-laurel'); card.querySelectorAll('.gem-award').forEach(n=>n.remove());
  const type = laurelTypeForEntry(rawEntry); if (type === 'none') return;
  const award = awardTemplate(type); const medals = card.querySelector('.medals');
  card.classList.add(type === 'gem' ? 'gem-laurel' : 'crown-laurel');
  if (award && medals) medals.insertAdjacentElement('beforebegin', award);
}
function refreshRankVisual(card) {
  if (!card) return;
  const rank=card.dataset.rank||''; const taster=card.dataset.taster==='1'; const archived=card.dataset.archived==='1';
  const flagRoot=card.querySelector('.rankflag'), label=flagRoot?.querySelector('span'), value=flagRoot?.querySelector('b'), eyebrow=card.querySelector('.eyebrow');
  const clean=(eyebrow?.textContent||'').replace(/^(?:T\d+|Taster|No\.\s*\d+|Archived)\s*[—–-]\s*/,'').trim();
  if(label)label.textContent=archived?'Archived':taster?'Taster':'No.'; if(value)value.textContent=archived?'':taster?`T${rank}`:rank;
  if(eyebrow)eyebrow.textContent=`${archived?'Archived':taster?`T${rank}`:`No. ${rank}`} — ${clean}`;
}
function renderDynamicEntry(entry) {
  const old=document.querySelector(`article.card[data-dynamic-entry="1"][data-key="${CSS.escape(entry.key)}"]`); if(old){unregisterCard(old);old.remove();}
  const template=document.createElement('template'); template.innerHTML=renderCardHtml(entry).trim(); const card=template.content.firstElementChild;
  (targetFor(card)||q('flat-main')||q('taster-cards'))?.appendChild(card); registerCard(card); refreshLaurel(card, entry); return card;
}
function renderDynamicEntries(entries) {
  document.querySelectorAll('article.card[data-dynamic-entry="1"]').forEach(card=>{unregisterCard(card);card.remove();});
  Object.values(entries||{}).map(normaliseEntry).sort((a,b)=>a.rank-b.rank).forEach(renderDynamicEntry);
  if(typeof window.reorder==='function')window.reorder();
}
function setRating(card,name,score){const node=ratingNode(card,name);if(!node)return;const tier=tierForScore(score);node.classList.remove('bronze','silver','gold','score-low','score-mid','score-high');node.classList.add(tier);const medal=node.querySelector('.medal');if(medal){medal.classList.remove('bronze','silver','gold');medal.classList.add(tier);}const label=node.querySelector(':scope>b');if(label)label.textContent=tier[0].toUpperCase()+tier.slice(1);let sub=node.querySelector('.subscore');if(!sub){sub=document.createElement('small');sub.className='subscore';node.appendChild(sub);}sub.textContent=`${clampScore(score)}/10`;card.dataset[name.toLowerCase()]=String(bucketForScore(score));}
function setSize(card,size){const node=ratingNode(card,'Size');if(!node)return;node.classList.remove('bronze','silver','gold');node.classList.add(size);const medal=node.querySelector('.medal');if(medal){medal.classList.remove('bronze','silver','gold');medal.classList.add(size);}const label=node.querySelector(':scope>b');if(label)label.textContent=size[0].toUpperCase()+size.slice(1);card.dataset.format=String(sizeBucket(size));}
function applyStaticOverride(card, raw) {
  if(!card||!raw)return; const e=normaliseEntry({...staticEntryFromCard(card),...raw,key:card.dataset.key});
  card.dataset.price=String(e.price);card.dataset.rank=String(e.rank);card.dataset.risk=String(e.risk);card.dataset.stock=e.stock; if(e.taster)card.dataset.taster='1';else delete card.dataset.taster; if(e.stockPin)card.dataset.stockPin=e.stockPin;else delete card.dataset.stockPin;
  if(e.archived){card.dataset.archived='1';card.dataset.archivedAt=e.archivedAt||new Date().toISOString();card.classList.add('archived-card');}else{delete card.dataset.archived;delete card.dataset.archivedAt;card.classList.remove('archived-card');}
  setRating(card,'Strength',e.strength);setRating(card,'Quality',e.quality);setRating(card,'Value',e.value);setSize(card,e.size);
  const strengthGold=bucketForScore(e.strength)===3,qualityGold=bucketForScore(e.quality)===3;card.dataset.tier=strengthGold&&qualityGold?'elite':(strengthGold||qualityGold?'strong':'noteworthy');
  const h3=card.querySelector('h3');if(h3)h3.innerHTML=`<span>${esc(e.brand)}</span>${esc(e.title)}`; const eyebrow=card.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent=`${e.archived?'Archived':e.taster?`T${e.rank}`:`No. ${e.rank}`} — ${e.eyebrow}`;
  const facts=card.querySelectorAll('.facts>div'); if(facts[0])facts[0].innerHTML=`<b>${aud(e.packagePrice)}</b><small>${esc(e.packageLabel)}</small>`;if(facts[1])facts[1].innerHTML=`<b>${aud(e.price)}</b><small>per stick</small>`;if(facts[2])facts[2].innerHTML=`<b>${e.length}″ × ${e.ring}</b><small>length x ring gauge</small>`;
  const art=card.querySelector('.artframe');if(art){art.dataset.visualLength=String(e.length);art.dataset.visualRing=String(e.ring);} refreshCountry(card,e.country); refreshRisk(card,e.risk);
  const summary=card.querySelector('.summary');if(summary)summary.innerHTML=e.summaryHtml; let note=card.querySelector('.mog-note');if(e.noteHtml){if(!note){note=document.createElement('p');note.className='mog-note';summary?.insertAdjacentElement('afterend',note);}note.innerHTML=e.noteHtml;}else note?.remove();
  const exp=Array.from(card.querySelectorAll('.tag-group')).find(g=>g.querySelector('.tag-label')?.textContent.trim()==='Experience');if(exp){const items=exp.querySelector('.tag-items');if(items)items.innerHTML=e.experienceTags.map(x=>`<span class="tag-chip">${esc(x)}</span>`).join('');}
  const prod=card.querySelector('.artmeta-left');if(prod)prod.innerHTML=`<span class="artmeta-title">Production</span>${e.productionLines.map(x=>`<span class="artmeta-line">${esc(x)}</span>`).join('')}`; const pract=card.querySelector('.artmeta-right');if(pract)pract.innerHTML=`<span class="artmeta-title">Practical</span>${e.practicalLines.map(x=>`<span class="artmeta-line">${esc(x)}</span>`).join('')}`; const smoke=card.querySelector('.artmeta-bottom');if(smoke)smoke.textContent=e.smokeTime;
  if(e.imageVersion){const img=card.querySelector('.artframe img');if(img)img.src=`${IMAGE_API}${encodeURIComponent(e.key)}?v=${e.imageVersion}`;}
  const currentLinks=Array.from(card.querySelectorAll('a.shop'));currentLinks.forEach(a=>a.remove());const body=card.querySelector('.cardbody');if(body)body.insertAdjacentHTML('beforeend',linksHtml(e));
  const calc=card.querySelector('.value-calc');const vi=deriveValue(e.price,e.quality);if(calc){calc.classList.remove('bronze','silver','gold');calc.classList.add(tierForScore(e.value));calc.innerHTML=`<span>Q${e.quality} benchmark <b>${aud(vi.benchmark)}</b></span><span>Actual <b>${aud(e.price)}</b></span><span>Ratio <b>${Number.isFinite(vi.ratio)?vi.ratio.toFixed(2):'—'}×</b></span>`;}
  const freshness=card.querySelector('.freshness');if(freshness){const t=document.createElement('template');t.innerHTML=stockHtml(e).trim();freshness.replaceWith(t.content.firstElementChild);} refreshLaurel(card,e); refreshRankVisual(card); registerCard(card);
}

function applySections(sections = {}) {
  const clean = normaliseSections(sections);
  const legend = document.querySelector('.legend-dropdown .legend');
  const benchmarks = document.querySelector('#test-impact-map .test-impact-panel');
  if (legend && clean.legendHtml) legend.innerHTML = clean.legendHtml;
  if (benchmarks && clean.benchmarksHtml) benchmarks.innerHTML = clean.benchmarksHtml;
  return clean;
}

async function compressImage(file) {
  if(!file)return null; const bitmap=await createImageBitmap(file); let max=1600,quality=.84,last=null;
  for(let attempt=0;attempt<3;attempt++){
    const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)); const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale)); const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d',{alpha:true}).drawImage(bitmap,0,0,w,h);
    last=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality)); if(last&&last.size<=1.9*1024*1024)break;max=Math.round(max*.78);quality-=.08;
  }
  bitmap.close?.(); if(!last)throw new Error('Could not compress image.'); if(last.size>2*1024*1024)throw new Error('Image is still over 2 MiB after compression.'); return last;
}

function injectAdminCss(){const style=document.createElement('style');style.id='catalogue-admin-v137-style';style.textContent=`
#catalogue-admin-toggle,#catalogue-admin{display:none!important}#catalogue-admin-v137-toggle{position:fixed;right:18px;bottom:18px;z-index:9998;border:1px solid #c3a250;background:#17100b;color:#f1d57f;padding:11px 14px;font-family:Cinzel,serif;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;box-shadow:0 6px 22px #0009}.v137-admin{position:fixed;inset:0;z-index:9999;background:#000c;display:grid;place-items:center;padding:18px}.v137-admin[hidden]{display:none}.v137-panel{width:min(1050px,100%);max-height:94vh;overflow:auto;background:#100d0a;color:#eee4cf;border:1px solid #c3a250;box-shadow:0 24px 80px #000;padding:18px}.v137-head{display:flex;justify-content:space-between;gap:12px;align-items:center;position:sticky;top:-18px;background:#100d0a;z-index:2;padding:12px 0;border-bottom:1px solid #594a2b}.v137-head h2{font-family:Cinzel;margin:0;font-size:18px;color:#f1d57f}.v137-close{font-size:22px;background:none;border:0;color:#eee4cf;cursor:pointer}.v137-toolbar,.v137-actions{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0}.v137-admin button{border:1px solid #806c3e;background:#17130f;color:#eee4cf;padding:9px 11px;cursor:pointer;font-family:Cinzel;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.v137-admin button.primary{background:#8b6a24;border-color:#d4b35e}.v137-admin button.danger{border-color:#9d4c43;color:#f0b7ad}.v137-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.v137-field{display:flex;flex-direction:column;gap:4px}.v137-field.wide{grid-column:span 2}.v137-field.full{grid-column:1/-1}.v137-field label{font-family:Cinzel;font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:#c5b58f}.v137-field input,.v137-field select,.v137-field textarea{margin:0;width:100%;border:1px solid #5f5133;background:#090806;color:#f0e7d6;padding:8px;font:13px Georgia,serif}.v137-field textarea{min-height:88px;resize:vertical}.v137-field textarea.tall{min-height:150px}.v137-status{margin-top:10px;padding:9px;border-left:2px solid #8b6a24;background:#c3a25012;font-size:12px}.v137-status.error{border-color:#b44;color:#f3b6ad}.v137-derived{font-size:11px;color:#bca982}.v137-image-preview{height:150px;background:#020202;border:1px solid #443821;display:grid;place-items:center;overflow:hidden}.v137-image-preview img{width:100%;height:100%;object-fit:contain}.v137-image-placeholder{height:100%;display:grid;place-items:center;color:#8c806c;font-family:Cinzel;font-size:10px;text-transform:uppercase;letter-spacing:.1em}.v137-kind{font-size:10px;color:#a89571}.v137-admin-key-row{display:flex;gap:8px;align-items:end}.v137-admin-key-row .v137-field{flex:1}@media(max-width:760px){.v137-grid{grid-template-columns:1fr 1fr}.v137-field.wide{grid-column:span 2}}@media(max-width:480px){.v137-grid{grid-template-columns:1fr}.v137-field.wide,.v137-field.full{grid-column:1}}
`;document.head.appendChild(style);}

function buildAdminUi(){
  const toggle=document.createElement('button');toggle.id='catalogue-admin-v137-toggle';toggle.type='button';toggle.textContent='Catalogue admin';document.body.appendChild(toggle);
  const root=document.createElement('div');root.className='v137-admin';root.id='catalogue-admin-v137';root.hidden=true;root.innerHTML=`<section class="v137-panel"><div class="v137-head"><div><div class="v137-kind">Cloudflare KV · v137</div><h2>Catalogue manager</h2></div><button class="v137-close" id="v137-close" type="button">×</button></div>
<div class="v137-status">Catalogue changes save directly to Cloudflare KV. Git is only needed for site-code changes.</div>
<div class="v137-toolbar"><select id="v137-card-select"></select><button id="v137-new" type="button">New entry</button><button id="v137-duplicate" type="button">Duplicate</button><button id="v137-delete" class="danger" type="button">Delete entry</button></div>
<div class="v137-grid">
<div class="v137-field wide"><label>Key</label><input id="v137-key"></div><div class="v137-field"><label>Section</label><select id="v137-section"><option value="active">Active</option><option value="taster">Taster</option><option value="archived">Archive</option></select></div><div class="v137-field"><label>Rank</label><input id="v137-rank" type="number" min="1"></div>
<div class="v137-field"><label>Brand</label><input id="v137-brand"></div><div class="v137-field wide"><label>Product title</label><input id="v137-title"></div><div class="v137-field"><label>Country</label><input id="v137-country" placeholder="DR / Nicaragua / Cuba"></div>
<div class="v137-field"><label>Package price A$</label><input id="v137-package-price" type="number" min="0" step="0.01"></div><div class="v137-field"><label>Package label</label><input id="v137-package-label" placeholder="single / tin of 10"></div><div class="v137-field"><label>Per-stick price A$</label><input id="v137-price" type="number" min="0" step="0.01"></div><div class="v137-field"><label>Stock</label><select id="v137-stock"><option value="">Automatic</option><option value="in">Available</option><option value="out">Unavailable</option><option value="hold">Hold</option></select></div>
<div class="v137-field"><label>Length inches</label><input id="v137-length" type="number" min="0" step="0.01"></div><div class="v137-field"><label>Ring gauge</label><input id="v137-ring" type="number" min="0" step="1"></div><div class="v137-field"><label>Risk</label><select id="v137-risk"><option value="1">Low</option><option value="2">Moderate</option><option value="3">High</option></select></div><div class="v137-field"><label>Size medal</label><select id="v137-size"><option value="gold">Gold</option><option value="silver">Silver</option><option value="bronze">Bronze</option></select></div>
<div class="v137-field"><label>Strength /10</label><input id="v137-strength" type="number" min="1" max="10"></div><div class="v137-field"><label>Quality /10</label><input id="v137-quality" type="number" min="1" max="10"></div><div class="v137-field"><label>Value /10 automatic</label><input id="v137-value" readonly></div><div class="v137-field"><label>Laurels</label><select id="v137-laurel"><option value="auto">Auto</option><option value="none">None</option><option value="crown">Crown</option><option value="gem">Gem</option></select></div>
<div class="v137-field full"><div class="v137-derived" id="v137-value-detail"></div></div>
<div class="v137-field full"><label>Retailer links, one per line</label><textarea id="v137-links"></textarea></div><div class="v137-field full"><label>Experience tags, one per line</label><textarea id="v137-experience"></textarea></div>
<div class="v137-field full"><label>Eyebrow / ranking caption</label><input id="v137-eyebrow"></div><div class="v137-field full"><label>Description markup</label><textarea class="tall" id="v137-summary"></textarea></div><div class="v137-field full"><label>Note markup</label><textarea id="v137-note"></textarea></div>
<div class="v137-field wide"><label>Production, one line per item</label><textarea id="v137-production"></textarea></div><div class="v137-field wide"><label>Practical, one line per item</label><textarea id="v137-practical"></textarea></div><div class="v137-field"><label>Smoke time</label><input id="v137-smoke-time"></div>
<div class="v137-field wide"><label>Product image</label><input id="v137-image" type="file" accept="image/png,image/jpeg,image/webp"><span class="v137-kind">Uploads are compressed and stored in KV.</span></div><div class="v137-field wide"><label>Current image</label><div class="v137-image-preview" id="v137-image-preview"></div></div>
<div class="v137-field full"><label>Legend markup</label><textarea id="v137-legend"></textarea></div><div class="v137-field full"><label>Benchmark / impact markup</label><textarea class="tall" id="v137-benchmarks"></textarea></div>
</div><div class="v137-actions"><button class="primary" id="v137-save" type="button">Save to site</button><button id="v137-reload" type="button">Reload KV</button><button id="v137-archive" type="button">Archive</button></div><div class="v137-status" id="v137-status">Loading catalogue state…</div></section>`;document.body.appendChild(root);return {toggle,root};
}

async function init(){
  injectAdminCss(); const {toggle,root}=buildAdminUi();
  const els={key:q('v137-key'),select:q('v137-card-select'),section:q('v137-section'),rank:q('v137-rank'),brand:q('v137-brand'),title:q('v137-title'),country:q('v137-country'),packagePrice:q('v137-package-price'),packageLabel:q('v137-package-label'),price:q('v137-price'),stock:q('v137-stock'),length:q('v137-length'),ring:q('v137-ring'),risk:q('v137-risk'),size:q('v137-size'),strength:q('v137-strength'),quality:q('v137-quality'),value:q('v137-value'),valueDetail:q('v137-value-detail'),laurel:q('v137-laurel'),links:q('v137-links'),experience:q('v137-experience'),eyebrow:q('v137-eyebrow'),summary:q('v137-summary'),note:q('v137-note'),production:q('v137-production'),practical:q('v137-practical'),smokeTime:q('v137-smoke-time'),image:q('v137-image'),preview:q('v137-image-preview'),legend:q('v137-legend'),benchmarks:q('v137-benchmarks'),status:q('v137-status'),delete:q('v137-delete'),archive:q('v137-archive')};
  let state={version:3,cards:{},sections:{},entries:{}};let editingNew=false;let draft=null;
  function persistRankForCard(card, rank) {
    if (!card) return;
    const key=card.dataset.key; rank=Math.max(1,Math.round(Number(rank)||1)); card.dataset.rank=String(rank); refreshRankVisual(card);
    if (state.entries[key]) state.entries[key]={...state.entries[key],rank};
    else state.cards[key]={...(state.cards[key]||{}),rank};
  }
  function rebalanceRanks(focusCard=null, targetRank=null) {
    for (const taster of [false,true]) {
      const cohort=allCards().filter(card=>card.dataset.archived!=='1'&&(card.dataset.taster==='1')===taster);
      let keys;
      if (focusCard && focusCard.dataset.archived!=='1' && (focusCard.dataset.taster==='1')===taster && targetRank != null) {
        keys=reorderByTarget(cohort.map(card=>({key:card.dataset.key,rank:Number(card.dataset.rank)||1})),focusCard.dataset.key,targetRank);
      } else keys=[...cohort].sort((a,b)=>(Number(a.dataset.rank)||0)-(Number(b.dataset.rank)||0)).map(card=>card.dataset.key);
      keys.forEach((key,index)=>persistRankForCard(cohort.find(card=>card.dataset.key===key),index+1));
    }
  }
  const setStatus=(msg,error=false)=>{els.status.textContent=msg;els.status.classList.toggle('error',error);};
  function selectedCard(){return document.querySelector(`article.card[data-key="${CSS.escape(els.select.value)}"]`);}
  function selectedIsDynamic(){return Boolean(state.entries?.[els.select.value]);}
  function populateSelect(prefer=''){
    const chosen=prefer||els.select.value;els.select.innerHTML='';allCards().sort((a,b)=>(Number(a.dataset.taster)-Number(b.dataset.taster))||(Number(a.dataset.rank)-Number(b.dataset.rank))).forEach(card=>{const o=document.createElement('option');o.value=card.dataset.key;o.textContent=`${card.dataset.dynamicEntry==='1'?'◆ ':'Base · '}${card.dataset.archived==='1'?'Archived · ':card.dataset.taster==='1'?'Taster · ':''}${card.querySelector('h3')?.textContent.trim()||card.dataset.key}`;els.select.appendChild(o);});if(chosen&&Array.from(els.select.options).some(o=>o.value===chosen))els.select.value=chosen;
  }
  function updateValuePreview(){const d=deriveValue(els.price.value,els.quality.value);els.value.value=d.score;els.valueDetail.textContent=`Q${d.quality} benchmark ${aud(d.benchmark)} · ${aud(d.price)} ÷ ${aud(d.benchmark)} = ${Number.isFinite(d.ratio)?d.ratio.toFixed(2):'—'}×`;}
  function previewImage(url){els.preview.innerHTML=url?`<img src="${esc(url)}" alt="Current product image">`:'No image';}
  function loadForm(raw, isNew=false){const e=normaliseEntry(raw);draft=e;editingNew=isNew;els.key.value=e.key;els.key.readOnly=!isNew;els.section.value=e.archived?'archived':e.taster?'taster':'active';els.rank.value=e.rank;els.brand.value=e.brand;els.title.value=e.title;els.country.value=e.country;els.packagePrice.value=e.packagePrice;els.packageLabel.value=e.packageLabel;els.price.value=e.price;els.stock.value=e.stockPin;els.length.value=e.length;els.ring.value=e.ring;els.risk.value=e.risk;els.size.value=e.size;els.strength.value=e.strength;els.quality.value=e.quality;els.laurel.value=e.laurel;els.links.value=e.retailerLinks.join('\n');els.experience.value=e.experienceTags.join('\n');els.eyebrow.value=e.eyebrow;els.summary.value=e.summaryHtml;els.note.value=e.noteHtml;els.production.value=e.productionLines.join('\n');els.practical.value=e.practicalLines.join('\n');els.smokeTime.value=e.smokeTime;els.image.value='';previewImage(imageSrc(e));els.delete.disabled=!state.entries?.[e.key];els.archive.textContent=e.archived?'Restore':'Archive';updateValuePreview();}
  function loadSelected(){const key=els.select.value;if(!key)return;loadForm(state.entries?.[key]||{...staticEntryFromCard(selectedCard()),...(state.cards?.[key]||{})},false);}
  function formEntry(){const old=draft||{};const section=els.section.value;return normaliseEntry({...old,key:els.key.value,brand:els.brand.value,title:els.title.value,country:els.country.value,packagePrice:els.packagePrice.value,packageLabel:els.packageLabel.value,price:els.price.value,stockPin:els.stock.value,length:els.length.value,ring:els.ring.value,risk:els.risk.value,size:els.size.value,strength:els.strength.value,quality:els.quality.value,laurel:els.laurel.value,rank:els.rank.value,taster:section==='taster',archived:section==='archived',archivedAt:section==='archived'?(old.archivedAt||new Date().toISOString()):'',retailerLinks:els.links.value,experienceTags:els.experience.value,eyebrow:els.eyebrow.value,summaryHtml:els.summary.value,noteHtml:els.note.value,productionLines:els.production.value,practicalLines:els.practical.value,smokeTime:els.smokeTime.value});}
  async function fetchState(){const res=await fetch(API,{cache:'no-store'});if(!res.ok)throw new Error(`State HTTP ${res.status}`);const body=await res.json();return {version:3,cards:body.cards||{},sections:normaliseSections(body.sections||{}),entries:body.entries||{}};}
  async function persist(){const res=await fetch(API,{method:'PUT',headers:authHeaders('',true),body:JSON.stringify(state)});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);return body;}
  async function reload(){setStatus('Loading Cloudflare KV…');state=await fetchState();const baseSections={legendHtml:document.querySelector('.legend-dropdown .legend')?.innerHTML||'',benchmarksHtml:document.querySelector('#test-impact-map .test-impact-panel')?.innerHTML||''};state.sections=normaliseSections({...baseSections,...state.sections});applySections(state.sections);els.legend.value=state.sections.legendHtml;els.benchmarks.value=state.sections.benchmarksHtml;Object.entries(state.cards).forEach(([key,ov])=>{const card=document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);if(card&&!card.dataset.dynamicEntry)applyStaticOverride(card,ov);});renderDynamicEntries(state.entries);populateSelect();if(els.select.options.length)loadSelected();setStatus(`Loaded ${Object.keys(state.entries).length} dynamic entries. Existing catalogue overrides preserved.`);}
  async function uploadSelectedImage(entry){if(!els.image.files?.[0])return entry;setStatus('Compressing product image…');const blob=await compressImage(els.image.files[0]);setStatus(`Uploading ${(blob.size/1024).toFixed(0)} KiB image…`);const res=await fetch(`${IMAGE_API}${encodeURIComponent(entry.key)}`,{method:'PUT',headers:{'content-type':blob.type||'image/webp'},body:blob});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||`Image HTTP ${res.status}`);entry.imageVersion=Date.now();entry.imageUrl='';return entry;}
  async function save(){try{state.sections=normaliseSections({legendHtml:els.legend.value,benchmarksHtml:els.benchmarks.value});applySections(state.sections);let e=formEntry();if(!e.brand||!e.title)throw new Error('Brand and product title are required.');if(editingNew){const wanted=sanitiseKey(els.key.value||`${e.brand}-${e.title}`);if(!wanted)throw new Error('Entry key is required.');if((state.entries[wanted]||document.querySelector(`article.card[data-key="${CSS.escape(wanted)}"]`))&&wanted!==draft?.key)throw new Error('That entry key already exists.');e.key=wanted;}e=await uploadSelectedImage(e);const dynamic=editingNew||Boolean(state.entries[e.key]);let card;if(dynamic){state.entries[e.key]=e;card=renderDynamicEntry(e);}else{card=selectedCard();state.cards[e.key]={...(state.cards[e.key]||{}),...staticOverrideFromEntry(e)};applyStaticOverride(card,state.cards[e.key]);}rebalanceRanks(card,e.archived?null:e.rank);e={...e,rank:Number(card?.dataset.rank)||e.rank};if(state.entries[e.key])state.entries[e.key]={...state.entries[e.key],rank:e.rank};setStatus('Saving catalogue to Cloudflare KV…');await persist();editingNew=false;draft=e;populateSelect(e.key);loadForm(e,false);if(typeof window.reorder==='function')window.reorder();setStatus('Saved site-wide. No Git deploy required.');}catch(err){setStatus(`Save failed: ${err.message}`,true);}}
  q('v137-save').addEventListener('click',save);q('v137-reload').addEventListener('click',()=>reload().catch(e=>setStatus(`Reload failed: ${e.message}`,true)));els.select.addEventListener('change',loadSelected);els.price.addEventListener('input',updateValuePreview);els.quality.addEventListener('input',updateValuePreview);els.image.addEventListener('change',()=>{const f=els.image.files?.[0];if(f)previewImage(URL.createObjectURL(f));});
  q('v137-new').addEventListener('click',()=>loadForm({key:'',brand:'',title:'',price:0,packagePrice:0,packageLabel:'single cigar',quality:5,strength:5,length:4,ring:32,rank:allCards().filter(c=>c.dataset.taster!=='1'&&c.dataset.archived!=='1').length+1,country:'',stock:'unknown',size:'gold',risk:1,retailerLinks:[],experienceTags:[],summaryHtml:'',productionLines:[],practicalLines:[],smokeTime:''},true));
  q('v137-duplicate').addEventListener('click',()=>{const base=formEntry();const key=sanitiseKey(`${base.key}-copy`);loadForm({...base,key,title:`${base.title} Copy`,rank:base.rank+1,imageVersion:0},true);});
  els.delete.addEventListener('click',async()=>{const key=els.select.value;if(!state.entries[key]){setStatus('Built-in entries cannot be deleted. Archive them instead.',true);return;}if(!confirm(`Delete ${key} from the catalogue?`))return;try{delete state.entries[key];const card=document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);if(card){unregisterCard(card);card.remove();}rebalanceRanks();await fetch(`${IMAGE_API}${encodeURIComponent(key)}`,{method:'DELETE'}).catch(()=>{});await persist();populateSelect();if(els.select.options.length)loadSelected();if(typeof window.reorder==='function')window.reorder();setStatus('Entry deleted from KV.');}catch(err){setStatus(`Delete failed: ${err.message}`,true);}});
  els.archive.addEventListener('click',()=>{els.section.value=els.section.value==='archived'?(draft?.taster?'taster':'active'):'archived';save();});
  toggle.addEventListener('click',()=>{root.hidden=false;document.body.style.overflow='hidden';populateSelect();if(els.select.options.length)loadSelected();});q('v137-close').addEventListener('click',()=>{root.hidden=true;document.body.style.overflow='';});root.addEventListener('click',e=>{if(e.target===root){root.hidden=true;document.body.style.overflow='';}});
  try{await reload();}catch(e){setStatus(`Catalogue manager failed to load: ${e.message}`,true);}
  window.CatalogueAdminV137={getState:()=>state,reload,renderDynamicEntries,allCards};
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true}); else init().catch(console.error);
}
