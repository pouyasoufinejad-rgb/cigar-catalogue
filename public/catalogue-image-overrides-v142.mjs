/* V142_PREMIUM_SINGLE_IMAGE_OVERRIDES */
const OVERRIDES = [
  {
    keys: ['arturo-fuente-exquisitos-maduro'],
    src: '/premium-cigars-v142/arturo-fuente-exquisitos-maduro.png',
    alt: 'Arturo Fuente Exquisitos Maduro'
  },
  {
    keys: ['oliva-serie-g', 'oliva-serie-g-cigarillos'],
    src: '/premium-cigars-v142/oliva-serie-g-cigarillos.png',
    alt: 'Oliva Serie G Cigarillos'
  },
  {
    keys: ['oliva-serie-v-melanio-no4', 'oliva-serie-v-melanio-no-4'],
    src: '/premium-cigars-v142/oliva-serie-v-melanio-no4.png',
    alt: 'Oliva Serie V Melanio No. 4 Petit Corona'
  },
  {
    keys: ['davidoff-escurio-petit-robusto', 'davidoff-escurio-petitrobusto'],
    src: '/premium-cigars-v142/davidoff-escurio-petit-robusto.png',
    alt: 'Davidoff Escurio Petit Robusto'
  }
];

function addStyle() {
  if (document.getElementById('v142-premium-image-style')) return;
  const style = document.createElement('style');
  style.id = 'v142-premium-image-style';
  style.textContent = `
    .artframe.v142-premium-image { background:#000 !important; }
    .artframe.v142-premium-image > img,
    .artframe.v142-premium-image img {
      background:#000 !important;
      object-fit:contain;
    }
  `;
  document.head.appendChild(style);
}

function replaceCardImage(card, override) {
  const art = card.querySelector('.artframe');
  if (!art) return false;
  const img = art.querySelector('img');
  if (!img) return false;
  const url = `${override.src}?v=142`;
  if (img.getAttribute('src') !== url) {
    img.src = url;
    img.removeAttribute('srcset');
    img.alt = override.alt;
  }
  art.classList.add('v142-premium-image');
  art.dataset.v142Image = '1';
  return true;
}

function apply(root = document) {
  let hits = 0;
  for (const override of OVERRIDES) {
    for (const key of override.keys) {
      const card = root.querySelector(`article.card[data-key="${CSS.escape(key)}"]`);
      if (card && replaceCardImage(card, override)) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

function init() {
  addStyle();
  apply(document);

  const observer = new MutationObserver(() => apply(document));
  observer.observe(document.body, { childList:true, subtree:true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once:true });
} else {
  init();
}
