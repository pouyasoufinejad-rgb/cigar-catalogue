const STYLE_ID = 'catalogue-wide-card-layout-v151';

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
html body .grid > article.card:last-of-type:nth-of-type(3n + 2){
  grid-column:3!important;
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
  html body .grid > article.card:last-of-type:nth-of-type(3n + 2){
    grid-column:auto!important;
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
