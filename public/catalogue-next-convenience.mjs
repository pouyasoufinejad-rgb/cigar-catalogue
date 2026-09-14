import { sizeRatingForRing } from './catalogue-size-rules.mjs';
import { hasQualityAwardException } from './catalogue-rating-exceptions.mjs';
import { verifiedRetailerPriceFallback } from './catalogue-retailer-price-fallbacks.mjs';

const STORAGE_KEY = 'cigar-catalogue-convenience-v1';
const ROOT_ID = 'catalogue-next-root';
const STYLE_ID = 'catalogue-next-convenience-style-v1';
const STOCK_API = '/api/stock';
const STATE_API = '/api/catalogue-overrides';
const MAX_COMPARE = 4;
const PERSONAL_STATUSES = ['owned','tried','want','rebuy'];
const PERSONAL_FILTERS = new Set(['all',...PERSONAL_STATUSES]);
const VIEW_MODES = new Set(['compact','detailed']);

let browserState = normaliseNextConvenienceState();
let stockResults = {};
let catalogueState = {};
let observer = null;
let decorating = false;
let refreshTimer = 0;

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanKey(value) {
  return String(value || '').trim();
}

function uniqueKeys(value,limit=Number.MAX_SAFE_INTEGER) {
  const output=[];
  const seen=new Set();
  for (const raw of Array.isArray(value)?value:[]) {
    const key=cleanKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(key);
    if (output.length>=limit) break;
  }
  return output;
}

function normaliseStatusMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output={};
  for (const [rawKey,rawStatus] of Object.entries(value)) {
    const key=cleanKey(rawKey);
    if (!key || !rawStatus || typeof rawStatus !== 'object' || Array.isArray(rawStatus)) continue;
    output[key]=Object.fromEntries(PERSONAL_STATUSES.map(name=>[name,Boolean(rawStatus[name])]));
  }
  return output;
}

export function normaliseNextConvenienceState(value={}) {
  const raw=record(value);
  return {
    version:1,
    viewMode:VIEW_MODES.has(raw.viewMode)?raw.viewMode:'compact',
    personalFilter:PERSONAL_FILTERS.has(raw.personalFilter)?raw.personalFilter:'all',
    statuses:normaliseStatusMap(raw.statuses),
    compare:uniqueKeys(raw.compare,MAX_COMPARE),
    expandedKeys:uniqueKeys(raw.expandedKeys),
    collapsedKeys:uniqueKeys(raw.collapsedKeys)
  };
}

export function toggleNextCompareKey(input,rawKey,max=MAX_COMPARE) {
  const state=normaliseNextConvenienceState(input);
  const key=cleanKey(rawKey);
  if (!key) return state;
  if (state.compare.includes(key)) return {...state,compare:state.compare.filter(item=>item!==key)};
  const cap=Math.max(1,Math.floor(Number(max)||MAX_COMPARE));
  if (state.compare.length>=cap) return state;
  return {...state,compare:[...state.compare,key]};
}

export function nextCardMatchesFilter(input,rawKey) {
  const state=normaliseNextConvenienceState(input);
  const key=cleanKey(rawKey);
  return state.personalFilter==='all' ? true : Boolean(state.statuses[key]?.[state.personalFilter]);
}

function comparableUrl(value) {
  try {
    const url=new URL(String(value||''));
    url.hash='';
    let text=url.toString();
    if (url.pathname!=='/' && text.endsWith('/')) text=text.slice(0,-1);
    return text.toLowerCase();
  } catch (_) { return ''; }
}

export function retailerOfferFor(result,url,label='') {
  const rows=Array.isArray(result?.retailers)?result.retailers:[];
  const targetUrl=comparableUrl(url);
  const targetLabel=String(label||'').trim().toLowerCase();
  return rows.find(item=>targetUrl && comparableUrl(item?.url)===targetUrl)
    || rows.find(item=>targetLabel && String(item?.retailer||'').trim().toLowerCase()===targetLabel)
    || null;
}

function readState() {
  try { return normaliseNextConvenienceState(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')); }
  catch (_) { return normaliseNextConvenienceState(); }
}

function writeState(state) {
  browserState=normaliseNextConvenienceState(state);
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(browserState)); } catch (_) {}
  return browserState;
}

function escapeHtml(value) {
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
.catalogue-next-convenience-toolbar{max-width:1480px;margin:0 auto;padding:0 24px 10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.catalogue-next-convenience-toolbar .label{font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:#81796c;margin-right:3px}.catalogue-next-convenience-toolbar button{appearance:none;border:1px solid #302c24;background:#11100e;color:#978e80;padding:6px 8px;border-radius:2px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}.catalogue-next-convenience-toolbar button[aria-pressed="true"]{border-color:#78623a;color:#e6cc8c;background:#211b11}.catalogue-next-convenience-toolbar .spacer{width:7px}
.catalogue-next-card-tools{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.catalogue-next-card-tools button{appearance:none;border:1px solid #343027;background:#0e0d0b;color:#8e8679;padding:5px 7px;font-size:8px;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}.catalogue-next-card-tools button[aria-pressed="true"]{border-color:#80683c;color:#e6ca86;background:#211b11}
#${ROOT_ID}.catalogue-next-compact .catalogue-next-card:not(.catalogue-next-expanded) .catalogue-next-summary,#${ROOT_ID}.catalogue-next-compact .catalogue-next-card:not(.catalogue-next-expanded) .catalogue-next-note,#${ROOT_ID}.catalogue-next-compact .catalogue-next-card:not(.catalogue-next-expanded) .catalogue-next-experience,#${ROOT_ID}.catalogue-next-compact .catalogue-next-card:not(.catalogue-next-expanded) .catalogue-next-details,#${ROOT_ID}.catalogue-next-compact .catalogue-next-card:not(.catalogue-next-expanded) .catalogue-next-value-note,#${ROOT_ID}.catalogue-next-compact .catalogue-next-card:not(.catalogue-next-expanded) .catalogue-next-retailer-matrix{display:none!important}#${ROOT_ID}.catalogue-next-detailed .catalogue-next-card.catalogue-next-collapsed .catalogue-next-summary,#${ROOT_ID}.catalogue-next-detailed .catalogue-next-card.catalogue-next-collapsed .catalogue-next-note,#${ROOT_ID}.catalogue-next-detailed .catalogue-next-card.catalogue-next-collapsed .catalogue-next-experience,#${ROOT_ID}.catalogue-next-detailed .catalogue-next-card.catalogue-next-collapsed .catalogue-next-details,#${ROOT_ID}.catalogue-next-detailed .catalogue-next-card.catalogue-next-collapsed .catalogue-next-value-note,#${ROOT_ID}.catalogue-next-detailed .catalogue-next-card.catalogue-next-collapsed .catalogue-next-retailer-matrix{display:none!important}.catalogue-next-personal-filter-hidden{display:none!important}
.catalogue-next-retailer-matrix{border-top:1px solid #28251f;padding-top:7px;display:flex;flex-direction:column;gap:4px}.catalogue-next-retailer-row{display:grid;grid-template-columns:minmax(85px,1fr) auto auto;gap:7px;align-items:center;font-size:9px;color:#aaa194}.catalogue-next-retailer-row .status.in{color:#79b485}.catalogue-next-retailer-row .status.out,.catalogue-next-retailer-row .status.delisted{color:#c87972}.catalogue-next-retailer-row .status.unknown{color:#a69a82}.catalogue-next-retailer-row a{color:#d7bc79;text-decoration:none}.catalogue-next-retailer-row .price{color:#d4c8b4}
.catalogue-next-compare-tray{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:118;display:none;align-items:center;gap:8px;background:#171511;border:1px solid #695735;box-shadow:0 16px 45px rgba(0,0,0,.56);padding:8px 10px;color:#d8cebc}.catalogue-next-compare-tray.open{display:flex}.catalogue-next-compare-tray span{font-size:10px}.catalogue-next-compare-tray button{border:1px solid #473d2b;background:#0e0d0b;color:#d8c17f;padding:7px 9px;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
.catalogue-next-compare-overlay{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.82);display:none;padding:5vh 16px;align-items:flex-start;justify-content:center}.catalogue-next-compare-overlay.open{display:flex}.catalogue-next-compare-panel{width:min(1220px,100%);max-height:90vh;overflow:auto;background:#12110f;border:1px solid #4b4232;box-shadow:0 30px 100px rgba(0,0,0,.7)}.catalogue-next-compare-head{position:sticky;top:0;z-index:2;background:#12110f;border-bottom:1px solid #312d25;padding:13px 15px;display:flex;justify-content:space-between;align-items:center}.catalogue-next-compare-head h2{font-family:Georgia,serif;font-weight:500;margin:0}.catalogue-next-compare-head button{border:1px solid #3a352c;background:#0c0b0a;color:#ccc;padding:6px 9px}.catalogue-next-compare-table{display:grid;min-width:760px}.catalogue-next-compare-row{display:grid;grid-template-columns:130px repeat(var(--compare-count),minmax(170px,1fr));border-bottom:1px solid #29261f}.catalogue-next-compare-row>div{padding:10px;border-right:1px solid #29261f;font-size:10px;color:#bcb3a5}.catalogue-next-compare-row>div:first-child{color:#80796e;text-transform:uppercase;letter-spacing:.07em;font-size:8px}.catalogue-next-compare-product img{width:100%;height:120px;object-fit:contain;background:#0c0b09;margin-bottom:8px}.catalogue-next-compare-product strong{display:block;font-family:Georgia,serif;font-size:15px;color:#eee4d4}.catalogue-next-compare-product span{display:block;color:#b89958;font-size:9px;text-transform:uppercase;margin-bottom:3px}
.catalogue-next-corrected-size{transition:none}
@media(max-width:760px){.catalogue-next-convenience-toolbar{padding:0 12px 8px;overflow:auto;flex-wrap:nowrap}.catalogue-next-convenience-toolbar .label{display:none}.catalogue-next-retailer-row{grid-template-columns:1fr auto}.catalogue-next-retailer-row .price{grid-column:1/-1}.catalogue-next-compare-tray{bottom:7px;width:calc(100vw - 14px);justify-content:center}.catalogue-next-compare-overlay{padding:2vh 6px}}
`;
  document.head.appendChild(style);
}

function retailerLabel(urlValue) {
  try {
    const host=new URL(urlValue).hostname.replace(/^www\./,'').toLowerCase();
    if (host.includes('cigarhut.com.au')) return 'CigarHut';
    if (host.includes('cigarworld.com.au')) return 'Cigarworld';
    if (host.includes('cigarbox.com.au')) return 'CigarBox';
    if (host.includes('firmincigars.com.au')) return 'Firmin Cigars';
    if (host.includes('theindexcigars.com.au')) return 'The Index';
    if (host.includes('sydneycigarhouse')) return 'Sydney Cigar House';
    if (host.includes('corporatecigar')) return 'Corporate Cigar';
    return host;
  } catch (_) { return 'Retailer'; }
}

function currentStateForKey(key) {
  return {...record(catalogueState?.entries?.[key]),...record(catalogueState?.cards?.[key])};
}

function ratingScore(card,label) {
  const rating=[...(card.querySelectorAll?.('.catalogue-next-rating')||[])].find(node=>String(node.querySelector('span')?.textContent||'').trim().toLowerCase()===label.toLowerCase());
  const text=String(rating?.querySelector('small')?.textContent||'');
  const match=text.match(/(\d+)\s*\/\s*10/);
  return match?Number(match[1]):null;
}

function sizeFromCard(card) {
  const button=[...(card.querySelectorAll?.('.catalogue-next-facts button')||[])].find(node=>String(node.querySelector('span')?.textContent||'').trim()==='Size');
  const text=String(button?.querySelector('b')?.textContent||'');
  const match=text.match(/([\d.]+)\s*″?\s*[×x]\s*(\d+)/i);
  return match?{length:Number(match[1]),ring:Number(match[2])}:{length:0,ring:0};
}

function correctCanonicalSizeAndLaurel(card) {
  const key=card.dataset.key||'';
  const source=currentStateForKey(key);
  const {ring}=sizeFromCard(card);
  const canonical=sizeRatingForRing(ring);
  const sizeNode=[...(card.querySelectorAll?.('.catalogue-next-rating')||[])].find(node=>String(node.querySelector('span')?.textContent||'').trim()==='Size');
  if (sizeNode) {
    sizeNode.classList.remove('gold','silver','bronze');
    sizeNode.classList.add(canonical.tier,'catalogue-next-corrected-size');
    const bold=sizeNode.querySelector('b');
    if (bold) bold.textContent=canonical.tier[0].toUpperCase()+canonical.tier.slice(1);
  }
  const explicit=String(source.laurel||'auto').toLowerCase();
  let award=explicit;
  if (!['none','crown','gem'].includes(award)) {
    const strength=ratingScore(card,'Strength')||0;
    const quality=ratingScore(card,'Quality')||0;
    const flavour=ratingScore(card,'Flavour')||0;
    const value=ratingScore(card,'Value')||0;
    if (strength<5) award='none';
    else {
      let golds=0;
      if (strength>=7) golds++;
      if (quality>=7) golds++;
      if (flavour>=7) golds++;
      if (canonical.tier==='gold') golds++;
      if (value>=7) golds++;
      if (golds>=4 || ((!quality || quality<7) && hasQualityAwardException(key) && golds>=3)) award='gem';
      else if (golds>=3) award='crown';
      else award='none';
    }
  }
  const media=card.querySelector('.catalogue-next-media');
  let laurel=card.querySelector('.catalogue-next-laurel');
  if (award==='none') { laurel?.remove(); return; }
  if (!laurel && media) {
    laurel=document.createElement('span');
    laurel.className='catalogue-next-laurel';
    media.appendChild(laurel);
  }
  if (laurel) {
    laurel.classList.remove('gem','crown');
    laurel.classList.add(award);
    laurel.textContent=award==='gem'?'Gem':'Crown';
  }
}

function statusText(status) {
  if (status==='in') return 'In stock';
  if (status==='out') return 'Out';
  if (status==='delisted') return 'Delisted';
  return 'Unknown';
}

function priceText(value) {
  const n=Number(value);
  return Number.isFinite(n)&&n>0 ? `A$${Number.isInteger(n)?n.toFixed(0):n.toFixed(2)}` : '—';
}

function decorateRetailers(card) {
  const key=card.dataset.key||'';
  const wrap=card.querySelector('.catalogue-next-retailers');
  if (!wrap) return;
  let matrix=wrap.parentElement?.querySelector?.('.catalogue-next-retailer-matrix');
  if (!matrix) {
    matrix=document.createElement('div');
    matrix.className='catalogue-next-retailer-matrix';
    wrap.insertAdjacentElement('afterend',matrix);
  }
  const links=[...wrap.querySelectorAll('a.catalogue-next-shop[href]')];
  const result=record(stockResults[key]);
  matrix.innerHTML=links.map(link=>{
    const url=link.href;
    const label=retailerLabel(url);
    const offer=retailerOfferFor(result,url,label);
    const status=['in','out','delisted'].includes(offer?.status)?offer.status:'unknown';
    const price=offer?.price ?? verifiedRetailerPriceFallback(url);
    return `<div class="catalogue-next-retailer-row"><span>${escapeHtml(label)}</span><span class="status ${status}">${escapeHtml(statusText(status))}</span><span class="price">${escapeHtml(priceText(price))}</span><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a></div>`;
  }).join('');
  if (!links.length) matrix.remove();
}

function isExpanded(key) {
  if (browserState.viewMode==='detailed') return !browserState.collapsedKeys.includes(key);
  return browserState.expandedKeys.includes(key);
}

function toggleExpanded(key) {
  const expanded=isExpanded(key);
  if (browserState.viewMode==='detailed') {
    browserState={...browserState,collapsedKeys:expanded?[...browserState.collapsedKeys,key]:browserState.collapsedKeys.filter(item=>item!==key)};
  } else {
    browserState={...browserState,expandedKeys:expanded?browserState.expandedKeys.filter(item=>item!==key):[...browserState.expandedKeys,key]};
  }
  writeState(browserState);
}

function decorateCard(card) {
  const key=cleanKey(card.dataset.key);
  if (!key) return;
  const status=record(browserState.statuses[key]);
  card.querySelectorAll('[data-personal-status]').forEach(button=>{
    const name=button.dataset.personalStatus;
    const active=Boolean(status[name]);
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
  card.classList.toggle('catalogue-next-personal-filter-hidden',!nextCardMatchesFilter(browserState,key));
  const expanded=isExpanded(key);
  card.classList.toggle('catalogue-next-expanded',browserState.viewMode==='compact'&&expanded);
  card.classList.toggle('catalogue-next-collapsed',browserState.viewMode==='detailed'&&!expanded);
  let tools=card.querySelector('.catalogue-next-card-tools');
  if (!tools) {
    tools=document.createElement('div');
    tools.className='catalogue-next-card-tools';
    const personal=card.querySelector('.catalogue-next-personal');
    (personal||card.querySelector('.catalogue-next-copy'))?.insertAdjacentElement('afterend',tools);
  }
  if (tools) tools.innerHTML=`<button type="button" data-next-card-details="${escapeHtml(key)}">${expanded?'Collapse':'Details'}</button><button type="button" data-next-compare="${escapeHtml(key)}" aria-pressed="${browserState.compare.includes(key)?'true':'false'}">Compare</button>`;
  correctCanonicalSizeAndLaurel(card);
  decorateRetailers(card);
}

function installToolbar(root) {
  const topbar=root.querySelector('.catalogue-next-topbar');
  if (!topbar) return;
  let toolbar=root.querySelector('.catalogue-next-convenience-toolbar');
  if (!toolbar) {
    toolbar=document.createElement('div');
    toolbar.className='catalogue-next-convenience-toolbar';
    topbar.appendChild(toolbar);
  }
  const labels={all:'All',owned:'Owned',tried:'Tried',want:'Want to Try',rebuy:'Rebuy'};
  toolbar.innerHTML=`<span class="label">View</span><button type="button" data-next-view="compact" aria-pressed="${browserState.viewMode==='compact'}">Compact</button><button type="button" data-next-view="detailed" aria-pressed="${browserState.viewMode==='detailed'}">Detailed</button><span class="spacer"></span><span class="label">Status</span>${Object.entries(labels).map(([name,label])=>`<button type="button" data-next-filter="${name}" aria-pressed="${browserState.personalFilter===name}">${label}</button>`).join('')}`;
}

function ensureCompareUI(root) {
  let tray=root.querySelector('.catalogue-next-compare-tray');
  if (!tray) {
    tray=document.createElement('div');
    tray.className='catalogue-next-compare-tray';
    tray.innerHTML='<span data-next-compare-count></span><button type="button" data-next-open-compare>Compare</button><button type="button" data-next-clear-compare>Clear</button>';
    root.appendChild(tray);
  }
  tray.classList.toggle('open',browserState.compare.length>0);
  const count=tray.querySelector('[data-next-compare-count]');
  if (count) count.textContent=`${browserState.compare.length} selected`;

  let overlay=root.querySelector('.catalogue-next-compare-overlay');
  if (!overlay) {
    overlay=document.createElement('div');
    overlay.className='catalogue-next-compare-overlay';
    overlay.id='catalogue-next-compare-overlay';
    overlay.innerHTML='<div class="catalogue-next-compare-panel"><header class="catalogue-next-compare-head"><h2>Compare cigars</h2><button type="button" data-next-close-compare>Close</button></header><div data-next-compare-table></div></div>';
    root.appendChild(overlay);
  }
}

function textFrom(card,selector) {
  return String(card?.querySelector?.(selector)?.textContent||'').trim();
}

function compareCell(card,label) {
  if (!card) return '—';
  if (label==='Product') {
    const img=card.querySelector('.catalogue-next-media img')?.src||'';
    const brand=textFrom(card,'.catalogue-next-brand');
    const title=textFrom(card,'.catalogue-next-copy h3');
    return `<div class="catalogue-next-compare-product">${img?`<img src="${escapeHtml(img)}" alt="">`:''}<span>${escapeHtml(brand)}</span><strong>${escapeHtml(title)}</strong></div>`;
  }
  if (label==='Per cigar') return escapeHtml(textFrom(card,'.catalogue-next-price strong')||'—');
  if (label==='Package') return escapeHtml(textFrom(card,'.catalogue-next-package')||'—');
  if (label==='Dimensions') {
    const size=[...card.querySelectorAll('.catalogue-next-facts button')].find(node=>textFrom(node,'span')==='Size');
    return escapeHtml(textFrom(size,'b')||'—');
  }
  if (['Strength','Flavour','Quality','Size','Value'].includes(label)) {
    const node=[...card.querySelectorAll('.catalogue-next-rating')].find(item=>textFrom(item,'span')===label);
    return escapeHtml(`${textFrom(node,'b')} ${textFrom(node,'small')}`.trim()||'—');
  }
  if (label==='Smoke time') return escapeHtml(textFrom(card,'.catalogue-next-smoke')||'—');
  if (label==='Stock') {
    const stock=[...card.querySelectorAll('.catalogue-next-facts button')].find(node=>textFrom(node,'span')==='Stock');
    return escapeHtml(textFrom(stock,'b')||'—');
  }
  if (label==='Status') {
    const key=card.dataset.key||'';
    const status=record(browserState.statuses[key]);
    const active=PERSONAL_STATUSES.filter(name=>status[name]).map(name=>name==='want'?'Want to Try':name[0].toUpperCase()+name.slice(1));
    return escapeHtml(active.join(' · ')||'—');
  }
  if (label==='Production') return escapeHtml(textFrom(card,'.catalogue-next-detail-grid>div:first-child')||'—');
  return '—';
}

function renderCompare(root) {
  const overlay=root.querySelector('.catalogue-next-compare-overlay');
  const target=root.querySelector('[data-next-compare-table]');
  if (!overlay||!target) return;
  const cards=browserState.compare.map(key=>root.querySelector(`.catalogue-next-card[data-key="${globalThis.CSS?.escape?CSS.escape(key):key}"]`));
  const rows=['Product','Per cigar','Package','Dimensions','Strength','Flavour','Quality','Size','Value','Smoke time','Stock','Status','Production'];
  target.innerHTML=`<div class="catalogue-next-compare-table" style="--compare-count:${Math.max(cards.length,1)}">${rows.map(label=>`<div class="catalogue-next-compare-row"><div>${escapeHtml(label)}</div>${cards.map(card=>`<div>${compareCell(card,label)}</div>`).join('')}</div>`).join('')}</div>`;
}

function refreshAll(root) {
  if (decorating) return;
  decorating=true;
  try {
    browserState=readState();
    root.classList.toggle('catalogue-next-compact',browserState.viewMode==='compact');
    root.classList.toggle('catalogue-next-detailed',browserState.viewMode==='detailed');
    installToolbar(root);
    root.querySelectorAll('.catalogue-next-card[data-key]').forEach(decorateCard);
    ensureCompareUI(root);
  } finally { decorating=false; }
}

function scheduleRefresh(root) {
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>refreshAll(root),0);
}

function mutationChangesCatalogueCards(mutations=[]) {
  return mutations.some(mutation=>[...(mutation.addedNodes||[]),...(mutation.removedNodes||[])].some(node=>{
    if (node?.nodeType!==1) return false;
    return Boolean(node.matches?.('.catalogue-next-card') || node.querySelector?.('.catalogue-next-card'));
  }));
}

async function loadRemoteData() {
  const [stock,state]=await Promise.all([
    fetch(`${STOCK_API}?next_convenience=1`,{cache:'no-store'}).then(r=>r.ok?r.json():{}).catch(()=>({})),
    fetch(`${STATE_API}?next_convenience=1`,{cache:'no-store'}).then(r=>r.ok?r.json():{}).catch(()=>({}))
  ]);
  stockResults=record(stock?.results);
  catalogueState=record(state);
}

function installEvents(root) {
  root.addEventListener('click',event=>{
    const view=event.target.closest?.('[data-next-view]');
    if (view) {
      browserState=writeState({...browserState,viewMode:view.dataset.nextView,expandedKeys:[],collapsedKeys:[]});
      refreshAll(root);
      return;
    }
    const filter=event.target.closest?.('[data-next-filter]');
    if (filter) {
      browserState=writeState({...browserState,personalFilter:filter.dataset.nextFilter});
      refreshAll(root);
      return;
    }
    const details=event.target.closest?.('[data-next-card-details]');
    if (details) {
      toggleExpanded(details.dataset.nextCardDetails);
      refreshAll(root);
      return;
    }
    const compare=event.target.closest?.('[data-next-compare]');
    if (compare) {
      const before=browserState.compare.length;
      browserState=writeState(toggleNextCompareKey(browserState,compare.dataset.nextCompare));
      if (browserState.compare.length===before && !browserState.compare.includes(compare.dataset.nextCompare) && before>=MAX_COMPARE) globalThis.alert?.('Compare supports up to four cigars.');
      refreshAll(root);
      return;
    }
    if (event.target.closest?.('[data-next-clear-compare]')) {
      browserState=writeState({...browserState,compare:[]});
      refreshAll(root);
      root.querySelector('.catalogue-next-compare-overlay')?.classList.remove('open');
      return;
    }
    if (event.target.closest?.('[data-next-open-compare]')) {
      renderCompare(root);
      root.querySelector('.catalogue-next-compare-overlay')?.classList.add('open');
      return;
    }
    if (event.target.closest?.('[data-next-close-compare]') || event.target.classList?.contains('catalogue-next-compare-overlay')) {
      root.querySelector('.catalogue-next-compare-overlay')?.classList.remove('open');
      return;
    }
    if (event.target.closest?.('[data-personal-status]')) setTimeout(()=>{browserState=readState();refreshAll(root);},0);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape') root.querySelector('.catalogue-next-compare-overlay')?.classList.remove('open');});
}

async function installNextConvenience() {
  const wait=()=>document.getElementById(ROOT_ID);
  let root=wait();
  if (!root) {
    await new Promise(resolve=>{
      const temporary=new MutationObserver(()=>{root=wait();if(root){temporary.disconnect();resolve();}});
      temporary.observe(document.documentElement,{childList:true,subtree:true});
      setTimeout(()=>{temporary.disconnect();resolve();},8000);
    });
    root=wait();
  }
  if (!root) return;
  installStyle();
  browserState=readState();
  installEvents(root);
  refreshAll(root);
  await loadRemoteData();
  refreshAll(root);
  observer?.disconnect?.();
  observer=new MutationObserver(mutations=>{if(!decorating && mutationChangesCatalogueCards(mutations)) scheduleRefresh(root);});
  observer.observe(root,{childList:true,subtree:true});
}

if (typeof document!=='undefined') {
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',installNextConvenience,{once:true});
  else installNextConvenience();
}
