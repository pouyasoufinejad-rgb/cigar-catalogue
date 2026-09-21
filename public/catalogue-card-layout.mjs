const STYLE_ID = 'catalogue-wide-card-layout-v154';

export function ensureWideCardLayout() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
html body .grid{
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:8px!important;
  width:calc(100% + 60px)!important;
  margin-inline:-30px!important;
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
    width:calc(100% + 60px)!important;
    margin-left:-30px!important;
    margin-right:0!important;
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
    width:calc(100% + 150px)!important;
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
html body article.card .medals .rating{
  min-height:148px!important;
  padding:8px 4px 5px!important;
}
html body article.card .medals .medal{
  width:min(112px,94%)!important;
  height:92px!important;
  margin:2px auto -3px!important;
}
html body article.card .medals .rating>span{font-size:10px!important}
html body article.card .medals .rating b{font-size:11px!important;margin-top:-2px!important}
html body article.card .medals .subscore{font-size:9px!important;margin-top:-1px!important}
html body article.card .cardbody .summary{font-size:14px!important;line-height:1.5!important}
html body article.card .artmeta{font-size:11px!important;line-height:1.35!important}
@media(max-width:900px){
  html body .grid{
    grid-template-columns:minmax(0,1fr)!important;
    gap:6px!important;
    width:100%!important;
    margin-inline:0!important;
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
    min-height:140px!important;
    padding:7px 3px 4px!important;
  }
  html body article.card .medals .medal{
    width:min(104px,94%)!important;
    height:84px!important;
    margin:2px auto -3px!important;
  }
  html body article.card .medals .rating>span{font-size:9px!important}
  html body article.card .medals .rating b{font-size:10px!important;margin-top:-2px!important}
  html body article.card .medals .subscore{font-size:9px!important;margin-top:-1px!important}
}
`;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureWideCardLayout, { once:true });
  else ensureWideCardLayout();
}
