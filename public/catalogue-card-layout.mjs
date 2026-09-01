const STYLE_ID = 'catalogue-wide-card-layout-v147';

export function ensureWideCardLayout() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
html body .grid{
  grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))!important;
}
html body article.card{
  width:100%!important;
  max-width:500px!important;
  margin-inline:auto!important;
}
html body article.card .medals{
  gap:6px!important;
}
html body article.card .medals .rating>span{font-size:10px!important}
html body article.card .medals .rating b{font-size:11px!important}
html body article.card .medals .subscore{font-size:9px!important}
html body article.card .cardbody .summary{font-size:14px!important;line-height:1.5!important}
html body article.card .artmeta{font-size:11px!important;line-height:1.35!important}
@media(max-width:700px){
  html body .grid{
    grid-template-columns:minmax(0,1fr)!important;
  }
  html body article.card{
    width:100%!important;
    max-width:100%!important;
  }
  html body article.card .medals{gap:5px!important}
  html body article.card .medals .rating{min-width:0!important}
  html body article.card .medals .rating>span{font-size:9px!important}
  html body article.card .medals .rating b{font-size:10px!important}
  html body article.card .medals .subscore{font-size:9px!important}
}
`;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureWideCardLayout, { once:true });
  else ensureWideCardLayout();
}
