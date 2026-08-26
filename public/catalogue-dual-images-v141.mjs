/* V141_DUAL_IMAGE_CLICK_SIZE_TRUE */
const SPECS = {
  'liga-privada-no-9-coronets': {
    src: '/cigar-stick-sources-v141/liga-no9.jpg',
    crop: [0.625, 0.19, 0.145, 0.70],
    defaultView: 'package', length: 4, ring: 32
  },
  'liga-t52-coronets': {
    src: '/cigar-stick-sources-v141/liga-t52.jpg',
    crop: [0.665, 0.14, 0.155, 0.76],
    defaultView: 'package', length: 4, ring: 32
  },
  'undercrown-maduro-coronets': {
    src: '/cigar-stick-sources-v141/undercrown-maduro.jpg',
    crop: [0.585, 0.21, 0.135, 0.58],
    defaultView: 'package', length: 4, ring: 32
  },
  'arturo-fuente-exquisitos-maduro': {
    src: '/cigar-stick-sources-v141/fuente-exquisitos-maduro.webp',
    defaultView: 'stick', length: 4.5, ring: 33
  },
  'oliva-serie-g': {
    src: '/cigar-stick-sources-v141/oliva-serie-g-cigarillo.webp',
    defaultView: 'package', length: 4, ring: 38
  },
  'oliva-serie-v-melanio-no4': {
    src: '/cigar-stick-sources-v141/oliva-melanio-no4.webp',
    defaultView: 'stick', length: 4.5, ring: 46
  },
  'davidoff-escurio-petit-robusto': {
    src: '/cigar-stick-sources-v141/davidoff-escurio-petit-robusto.webp',
    defaultView: 'stick', length: 3.25, ring: 50
  },
  'montecristo-joyitas': {
    src: '/cigar-stick-sources-v141/montecristo-joyitas.webp',
    defaultView: 'stick', length: 4.5, ring: 26
  },
  'romeo-y-julieta-puritos': {
    src: '/cigar-stick-sources-v141/ryj-puritos.webp',
    defaultView: 'stick', length: 3.9, ring: 26
  }
};

const BANNER_KEYS = [
  'liga-privada-no-9-coronets',
  'liga-t52-coronets',
  'undercrown-maduro-coronets',
  'arturo-fuente-exquisitos-maduro',
  'oliva-serie-g',
  'oliva-serie-v-melanio-no4',
  'davidoff-escurio-petit-robusto',
  'montecristo-joyitas',
  'romeo-y-julieta-puritos'
];

const preparedCache = new Map();

function addStyle() {
  if (document.getElementById('v141-dual-image-style')) return;
  const style = document.createElement('style');
  style.id = 'v141-dual-image-style';
  style.textContent = `
    .artframe.v141-dual-image{cursor:pointer;position:relative;background:#000!important}
    .artframe.v141-dual-image:focus-visible{outline:1px solid rgba(218,184,96,.85);outline-offset:3px}
    .artframe.v141-dual-image .v141-stick-canvas{position:absolute;inset:0;width:100%;height:100%;display:none;background:#000;z-index:0}
    .artframe.v141-dual-image.v141-stick-active .v141-stick-canvas{display:block}
    .artframe.v141-dual-image.v141-stick-active>img.v141-package-img{visibility:hidden}
    .artframe.v141-dual-image .artmeta{z-index:2}
    #v141-cigar-banner{width:min(1380px,96vw);height:clamp(112px,13vw,180px);margin:10px auto 12px;background:#000;overflow:hidden;position:relative;isolation:isolate}
    #v141-cigar-banner canvas{display:block;width:100%;height:100%;background:#000}
    @media(max-width:700px){
      #v141-cigar-banner{width:100%;height:105px;margin-top:4px}
    }
  `;
  document.head.appendChild(style);
}

function imagePromise(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load cigar source ${src}`));
    img.src = src;
  });
}

function removeEdgeWhite(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;

  const isBg = idx => {
    const i = idx * 4;
    const a = p[i + 3];
    if (a < 20) return true;
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return r > 218 && g > 218 && b > 218 && (mx - mn) < 28;
  };
  const push = idx => {
    if (idx < 0 || idx >= seen.length || seen[idx] || !isBg(idx)) return;
    seen[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w, y = (idx / w) | 0;
    if (x > 0) push(idx - 1);
    if (x + 1 < w) push(idx + 1);
    if (y > 0) push(idx - w);
    if (y + 1 < h) push(idx + w);
  }

  for (let idx = 0; idx < seen.length; idx++) if (seen[idx]) p[idx * 4 + 3] = 0;
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function trimTransparent(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width:w, height:h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return canvas;
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function horizontalise(canvas) {
  if (canvas.width >= canvas.height) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.height;
  out.height = canvas.width;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

async function prepare(spec) {
  const key = `${spec.src}|${(spec.crop || []).join(',')}`;
  if (preparedCache.has(key)) return preparedCache.get(key);
  const promise = (async () => {
    const img = await imagePromise(spec.src);
    const crop = spec.crop || [0, 0, 1, 1];
    const sx = Math.max(0, Math.floor(img.naturalWidth * crop[0]));
    const sy = Math.max(0, Math.floor(img.naturalHeight * crop[1]));
    const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.ceil(img.naturalWidth * crop[2])));
    const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.ceil(img.naturalHeight * crop[3])));
    const work = document.createElement('canvas');
    work.width = sw; work.height = sh;
    work.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return horizontalise(trimTransparent(removeEdgeWhite(work)));
  })();
  preparedCache.set(key, promise);
  return promise;
}

function cigarDimensions(card, spec) {
  const art = card.querySelector('.artframe');
  const length = Number(art?.dataset.visualLength || spec.length || 4);
  const ring = Number(art?.dataset.visualRing || spec.ring || 32);
  return {
    length: Number.isFinite(length) && length > 0 ? length : spec.length,
    ring: Number.isFinite(ring) && ring > 0 ? ring : spec.ring
  };
}

function renderPhysical(canvas, source, length, ring) {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cssW, cssH);

  const pxPerInch = (cssW * 0.86) / 7.25;
  const targetW = Math.max(1, length * pxPerInch);
  const targetH = Math.max(1, (ring / 64) * pxPerInch);
  const x = (cssW - targetW) / 2;
  const y = (cssH - targetH) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, x, y, targetW, targetH);
}

async function attachCard(card, spec) {
  const art = card.querySelector('.artframe');
  const packageImg = art?.querySelector(':scope > img') || art?.querySelector('img');
  if (!art || !packageImg || art.dataset.v141Ready === '1') return;
  art.dataset.v141Ready = '1';
  art.classList.add('v141-dual-image');
  packageImg.classList.add('v141-package-img');

  const canvas = document.createElement('canvas');
  canvas.className = 'v141-stick-canvas';
  packageImg.after(canvas);
  const source = await prepare(spec);
  const dims = cigarDimensions(card, spec);

  const draw = () => renderPhysical(canvas, source, dims.length, dims.ring);
  const setView = view => {
    const stick = view === 'stick';
    art.classList.toggle('v141-stick-active', stick);
    art.dataset.v141View = stick ? 'stick' : 'package';
    art.setAttribute('aria-label', stick ? 'Showing individual cigar. Click to view package.' : 'Showing package. Click to view individual cigar.');
    art.title = stick ? 'Click for package' : 'Click for individual cigar';
    if (stick) draw();
  };

  const toggle = () => setView(art.dataset.v141View === 'stick' ? 'package' : 'stick');
  art.tabIndex = art.tabIndex >= 0 ? art.tabIndex : 0;
  art.setAttribute('role', 'button');
  art.addEventListener('click', event => {
    if (event.target.closest('a,button,input,select,textarea')) return;
    toggle();
  });
  art.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
  });

  if ('ResizeObserver' in window) new ResizeObserver(() => { if (art.dataset.v141View === 'stick') draw(); }).observe(art);
  setView(spec.defaultView === 'stick' ? 'stick' : 'package');
}

async function buildBanner() {
  if (document.getElementById('v141-cigar-banner')) return;
  const available = BANNER_KEYS.map(key => [key, SPECS[key]]).filter(([, spec]) => spec);
  const prepared = await Promise.all(available.map(async ([key, spec]) => [key, spec, await prepare(spec)]));

  const section = document.createElement('section');
  section.id = 'v141-cigar-banner';
  section.setAttribute('aria-label', 'Catalogue cigar size lineup');
  const canvas = document.createElement('canvas');
  section.appendChild(canvas);

  const heading = Array.from(document.querySelectorAll('h1,h2')).find(node => /CIGAR\s*CATALOGUE/i.test(node.textContent || ''));
  const anchor = heading ? (heading.closest('header,.hero,.masthead') || heading) : document.querySelector('main') || document.body.firstElementChild;
  if (anchor?.parentNode) anchor.parentNode.insertBefore(section, anchor);
  else document.body.prepend(section);

  const draw = () => {
    const rect = section.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);

    const gap = Math.max(7, Math.min(14, w / 90));
    const totalInches = prepared.reduce((sum, [, spec]) => sum + spec.length, 0);
    const ppi = Math.min(40, Math.max(16, (w - 34 - gap * (prepared.length - 1)) / totalInches));
    const totalWidth = prepared.reduce((sum, [, spec]) => sum + spec.length * ppi, 0) + gap * (prepared.length - 1);
    let x = (w - totalWidth) / 2;
    const offsets = [-22, 13, -5, 24, -15, 7, -25, 19, -1];
    const angles = [-0.035, 0.02, -0.018, 0.028, -0.024, 0.018, -0.03, 0.025, -0.012];

    prepared.forEach(([, spec, source], i) => {
      const cw = spec.length * ppi;
      const ch = (spec.ring / 64) * ppi;
      const cy = h / 2 + (offsets[i] || 0) * (h / 170);
      ctx.save();
      ctx.translate(x + cw / 2, cy);
      ctx.rotate(angles[i] || 0);
      ctx.drawImage(source, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();
      x += cw + gap;
    });
  };
  draw();
  if ('ResizeObserver' in window) new ResizeObserver(draw).observe(section);
  else window.addEventListener('resize', draw, { passive:true });
}

async function init() {
  addStyle();
  const jobs = [];
  for (const [key, spec] of Object.entries(SPECS)) {
    const card = document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);
    if (card) jobs.push(attachCard(card, spec).catch(error => console.warn('[v141 dual image]', key, error)));
  }
  await Promise.all(jobs);
  buildBanner().catch(error => console.warn('[v141 banner]', error));

  const observer = new MutationObserver(() => {
    for (const [key, spec] of Object.entries(SPECS)) {
      const card = document.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);
      if (card && card.querySelector('.artframe')?.dataset.v141Ready !== '1') {
        attachCard(card, spec).catch(error => console.warn('[v141 dual image dynamic]', key, error));
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();
