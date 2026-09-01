const STYLE_ID = 'catalogue-wide-card-layout-v149';

export function ensureWideCardLayout() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
html body .grid{
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:6px!important;
  width:calc(100% + 30px)!important;
  margin-inline:-15px!important;
}
html body article.card{
  width:100%!important;
  max-width:none!important;
  margin:0!important;
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
    gap:6px!important;
    width:100%!important;
    margin-inline:0!important;
  }
  html body article.card{
    width:100%!important;
    max-width:100%!important;
    margin:0!important;
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
