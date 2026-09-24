const STYLE_ID = 'catalogue-wide-card-layout-v154';

export function ensureWideCardLayout() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
/* The cards overhang the wrap on the right only. The fixed sidebar sits to the left of the
   wrap, so any left overhang slides underneath it; the left edge stays on the wrap and keeps
   the gap the sidebar already leaves. The overhang is also capped by how much room is
   actually free to the right, so a narrower desktop cannot be pushed into sideways scroll. */
html body .grid{
  /* The sidebar's right edge sits 40px left of the wrap, so the left overhang is capped
     well under that and keeps a visible gap; the right has the rest of the room. Both are
     also capped by how much space is actually free, so no width is pushed into sideways
     scroll by a fixed number that only suited a wider one. */
  --card-room:max(0px, (100vw - 100%) / 2 - 16px);
  --card-bleed-left:min(24px, var(--card-room));
  --card-bleed-right:min(150px, var(--card-room));
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:8px!important;
  width:calc(100% + var(--card-bleed-left) + var(--card-bleed-right))!important;
  margin-left:calc(-1 * var(--card-bleed-left))!important;
  margin-right:calc(-1 * var(--card-bleed-right))!important;
}
html body article.card{
  width:100%!important;
  max-width:none!important;
  margin:0!important;
}

/* The cards deliberately overhang the 1220px wrap on desktop. Give the catalogue chrome
   the exact same left edge and right edge so the header, section furniture and subsection
   rules do not stop short of the cards. This is desktop-only; mobile keeps the wrap intact. */
@media(min-width:901px){
  html body .wrap > header,
  html body .wrap > .section > .section-head,
  html body .wrap > .section > .legend-dropdown,
  html body .wrap > .section > .test-impact-note,
  html body .wrap > .section > .live-stock-check,
  html body .wrap > .section > .controls,
  html body .wrap > .section > .tier-stack > .tier-block > .tier-heading,
  html body .wrap > .section > .tier-stack > .tier-block > .subtier-note{
    --card-room:max(0px, (100vw - 100%) / 2 - 16px);
    --card-bleed-left:min(24px, var(--card-room));
    --card-bleed-right:min(150px, var(--card-room));
    width:calc(100% + var(--card-bleed-left) + var(--card-bleed-right))!important;
    margin-left:calc(-1 * var(--card-bleed-left))!important;
    margin-right:calc(-1 * var(--card-bleed-right))!important;
  }
}
/* Only use the extra horizontal room on the large-desktop layout where the fixed
   sidebar is present. Keeping the 901-1659px geometry unchanged avoids introducing
   horizontal overflow on narrower desktop and tablet-width viewports. */
@media(min-width:1660px){
  html body .grid,
  html body .wrap > header,
  html body .wrap > .section > .section-head,
  html body .wrap > .section > .legend-dropdown,
  html body .wrap > .section > .test-impact-note,
  html body .wrap > .section > .live-stock-check,
  html body .wrap > .section > .controls,
  html body .wrap > .section > .tier-stack > .tier-block > .tier-heading,
  html body .wrap > .section > .tier-stack > .tier-block > .subtier-note{
    --card-room:max(0px, (100vw - 100%) / 2 - 16px);
    --card-bleed-left:min(24px, var(--card-room));
    --card-bleed-right:min(210px, var(--card-room));
    width:calc(100% + var(--card-bleed-left) + var(--card-bleed-right))!important;
    margin-left:calc(-1 * var(--card-bleed-left))!important;
    margin-right:calc(-1 * var(--card-bleed-right))!important;
  }
}
@media(min-width:901px){
html body .grid > article.card:not(.hidden):not(.brand-line-filter-hidden):not([data-personal-filter-hidden="1"]):nth-last-child(2 of article.card:not(.hidden):not(.brand-line-filter-hidden):not([data-personal-filter-hidden="1"])):nth-child(3n + 1 of article.card:not(.hidden):not(.brand-line-filter-hidden):not([data-personal-filter-hidden="1"])){
  transform:translateX(30%)!important;
}
html body .grid > article.card:not(.hidden):not(.brand-line-filter-hidden):not([data-personal-filter-hidden="1"]):nth-last-child(1 of article.card:not(.hidden):not(.brand-line-filter-hidden):not([data-personal-filter-hidden="1"])):nth-child(3n + 2 of article.card:not(.hidden):not(.brand-line-filter-hidden):not([data-personal-filter-hidden="1"])){
  grid-column:3!important;
  transform:translateX(-30%)!important;
}
}
html body article.card .medals{
  gap:4px!important;
}
/* The medals lost their frames and their tier words, so these no longer reserve room for
   them. Kept here rather than fought with from the page stylesheet: this selector outranks
   it, so the two have to agree. */
html body article.card .medals .rating{
  min-height:0!important;
  padding:0 2px 2px!important;
}
html body article.card .medals .medal{
  width:min(92px,88%)!important;
  height:86px!important;
  margin:0 auto!important;
}
html body article.card .medals .rating>span{font-size:10px!important}
html body article.card .medals .subscore{font-size:13px!important;margin-top:0!important}
html body article.card .cardbody .summary{font-size:14px!important;line-height:1.5!important}
html body article.card .artmeta{font-size:11px!important;line-height:1.35!important}
@media(max-width:900px){
  html body .grid{
    grid-template-columns:minmax(0,1fr)!important;
    gap:6px!important;
    width:100%!important;
    margin-inline:0!important;
    --card-bleed-left:0px;
    --card-bleed-right:0px;
  }
  html body article.card{
    width:100%!important;
    max-width:100%!important;
    margin:0!important;
  }
  html body .grid > article.card{
    grid-column:auto!important;
    transform:none!important;
  }
  html body article.card .medals{gap:4px!important}
  html body article.card .medals .rating{
    min-width:0!important;
    min-height:0!important;
    padding:0 2px 2px!important;
  }
  html body article.card .medals .medal{
    width:min(62px,94%)!important;
    height:58px!important;
    margin:0 auto!important;
  }
  html body article.card .medals .rating>span{font-size:9px!important}
  html body article.card .medals .subscore{font-size:10.5px!important;margin-top:0!important}
}
`;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureWideCardLayout, { once:true });
  else ensureWideCardLayout();
}
