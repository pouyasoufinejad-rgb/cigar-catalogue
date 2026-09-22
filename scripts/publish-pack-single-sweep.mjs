#!/usr/bin/env node
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';

const baseUrl=String(process.env.CATALOGUE_BASE_URL||DEFAULT_BASE_URL).replace(/\/$/,'');
const token=String(process.env.CATALOGUE_ADMIN_TOKEN||'').trim();
if(!token) throw new Error('CATALOGUE_ADMIN_TOKEN is required.');

const targets=[
  ['aj-fernandez-new-world-oscuro','', 'petit-corona','Cheapest single: A$24.11 · Cigarworld','https://www.cigarworld.com.au/aud/products/new-world-oscuro-pack-by-aj-fernandez-%252d-%284-x-36%29-%252d-single.html'],
  ['alonso-menendez-axe-charutos','','','Cheapest single: no in-stock Australian single found',''],
  ['alonso-menendez-gold-cigarillo','','','Cheapest single: no in-stock Australian single found',''],
  ['arturo-fuente-cubanitos-10','','','Cheapest single: A$15.60 · The Index','https://www.theindexcigars.com.au/products/arturo-fuente-cubanitos'],
  ['arturo-fuente-exquisitos-maduro','maduro','','Cheapest single: A$22.50 · The Index','https://www.theindexcigars.com.au/products/arturo-fuente-exquisitos-maduro'],
  ['ashton-aged-maduro-esquire','','','Cheapest single: no in-stock Australian single found',''],
  ['cao-bella-vanilla','','','Cheapest single: no in-stock Australian single found',''],
  ['cao-moontrance','','','Cheapest single: no in-stock Australian single found',''],
  ['davidoff-escurio','','','Cheapest single: no in-stock Australian single found',''],
  ['davidoff-nicaragua-mini-cigarillos','','','Cheapest single: no in-stock Australian single found',''],
  ['davidoff-primeros-escurio','','','Cheapest single: A$23.40 · Sydney Cigar House','https://www.sydneycigar.com.au/davidoff-primeros-escurio/'],
  ['davidoff-primeros-nicaragua-maduro','natural','','Cheapest single: A$23.40 · Sydney Cigar House','https://www.sydneycigar.com.au/davidoff-primeros-nicaragua/'],
  ['davidoff-primeros-nicaragua-maduro','maduro','','Cheapest single: A$23.70 · Cigarworld','https://www.cigarworld.com.au/aud/categories/cigars/davidoff-%28dominican%29/primeros/'],
  ['davidoff-winston-churchill-petite-panatela','','petite-panatela','Cheapest single: A$28.95 · Cigarworld','https://www.cigarworld.com.au/aud/categories/cigars/davidoff-%28dominican%29/davidoff/'],
  ['kfc-ponies-sweets','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/kentucky-fired-cured-sweets-ponies'],
  ['blackened-m81-coronets','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/blackened-m81-coronet'],
  ['blackened-s84-shade-to-black-coronets','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/blackened-s84-shade-to-black-coronets'],
  ['kfc-ponies','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/kentucky-fire-cured-ponies'],
  ['tabak-especial-cafecita-negra','','','Cheapest single: no in-stock Australian single found',''],
  ['isla-del-sol-maduro-coronets','','','Cheapest single: no in-stock Australian single found',''],
  ['joya-antano-1970-cigarillo','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/joya-antano-1970-cigarillo'],
  ['joya-black-cigarillo','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/joya-de-nicaragua-joya-black-cigarillo'],
  ['liga-privada-h99-coronets','','','Cheapest single: no in-stock Australian single found',''],
  ['liga-privada-10-seleccion-de-mercado-coronets','','','Cheapest single: no in-stock Australian single found',''],
  ['liga-privada-no-9-coronets','','','Cheapest single: A$14.80 · Firmin Cigars','https://firmincigars.com.au/product/drew-estate-liga-privada-no-9-coronets-single-cigar-nicaragua/?v=2c18c36508d1'],
  ['liga-privada-unico-papas-fritas','','','Cheapest single: no in-stock Australian single found',''],
  ['my-father-la-gran-oferta-lancero','','','Cheapest single: no in-stock Australian single found',''],
  ['partagas-serie-club-10','','','Cheapest single: no individual-cigar Australian single found',''],
  ['rocky-patel-sun-grown-juniors','sun-grown','juniors','Cheapest single: A$19.90 · The Index','https://www.theindexcigars.com.au/products/rocky-patel-sun-grown-juniors'],
  ['tatiana-mini-vanilla','','','Cheapest single: no in-stock Australian single found',''],
  ['toscanello-nero-cioccolato','','','Cheapest single: no in-stock Australian single found',''],
  ['undercrown-maduro-coronets','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/undercrown-maduro-coronet-tin-of-10'],
  ['undercrown-shade-coronets','','','Cheapest single: A$13.00 · The Index','https://www.theindexcigars.com.au/products/connecticut-shade-coronet-tin-of-10'],
  ['undercrown-10-coronets','','','Cheapest single: no in-stock Australian single found','']
];

const get=async path=>{
 const r=await fetch(baseUrl+path,{headers:{accept:'application/json'},cache:'no-store'});
 if(!r.ok) throw new Error('GET '+path+' failed HTTP '+r.status);
 return r.json();
};
const put=async (path,body)=>{
 const r=await fetch(baseUrl+path,{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok) throw new Error('PUT '+path+' failed HTTP '+r.status+': '+(await r.text()).slice(0,300));
 return r.json().catch(()=>({}));
};
function withLine(lines,line){
 const src=Array.isArray(lines)?lines:[];
 const out=src.filter(v=>!/^cheapest single\s*:/i.test(String(v||'')));
 const at=Math.min(1,out.length);
 out.splice(at,0,line);
 return out;
}
function addLink(links,url){
 const out=Array.isArray(links)?[...links]:[];
 if(url&&!out.includes(url)) out.push(url);
 return out;
}
function patchTarget(entry,blendId,sizeId,line,url){
 if(blendId){
   const blends=Array.isArray(entry.blendVariants)?structuredClone(entry.blendVariants):[];
   const bi=blends.findIndex(v=>String(v?.id||'')===blendId);
   if(bi<0) throw new Error(entry.key+': blend '+blendId+' missing');
   if(sizeId){
     const sizes=Array.isArray(blends[bi].sizeVariants)?structuredClone(blends[bi].sizeVariants):[];
     const si=sizes.findIndex(v=>String(v?.id||'')===sizeId);
     if(si<0) throw new Error(entry.key+': size '+sizeId+' missing under '+blendId);
     sizes[si]={...sizes[si],practicalLines:withLine(sizes[si].practicalLines,line),retailerLinks:addLink(sizes[si].retailerLinks,url)};
     blends[bi]={...blends[bi],sizeVariants:sizes};
   }else{
     blends[bi]={...blends[bi],practicalLines:withLine(blends[bi].practicalLines,line),retailerLinks:addLink(blends[bi].retailerLinks,url)};
   }
   return {...entry,blendVariants:blends};
 }
 if(sizeId){
   const sizes=Array.isArray(entry.sizeVariants)?structuredClone(entry.sizeVariants):[];
   const si=sizes.findIndex(v=>String(v?.id||'')===sizeId);
   if(si<0) throw new Error(entry.key+': size '+sizeId+' missing');
   sizes[si]={...sizes[si],practicalLines:withLine(sizes[si].practicalLines,line),retailerLinks:addLink(sizes[si].retailerLinks,url)};
   return {...entry,sizeVariants:sizes};
 }
 return {...entry,practicalLines:withLine(entry.practicalLines,line),retailerLinks:addLink(entry.retailerLinks,url)};
}
function targetRecord(entry,blendId,sizeId){
 let rec=entry;
 if(blendId) rec=(rec.blendVariants||[]).find(v=>String(v?.id||'')===blendId);
 if(!rec) return null;
 if(sizeId) rec=(rec.sizeVariants||[]).find(v=>String(v?.id||'')===sizeId);
 return rec||null;
}

const initial=await get('/api/catalogue-overrides?single_sweep='+Date.now());
const byKey=new Map();
for(const [key,blend,size,line,url] of targets){
 const base=byKey.get(key)||structuredClone(initial.entries?.[key]);
 if(!base) throw new Error(key+': not a dynamic entry; sweep stopped before writes');
 base.key=key;
 byKey.set(key,patchTarget(base,blend,size,line,url));
}
for(const [key,entry] of byKey){
 await put('/api/catalogue-entry/'+encodeURIComponent(key),entry);
 console.log('UPDATED '+key);
}
const finalState=await get('/api/catalogue-overrides?single_sweep_verify='+Date.now());
let verified=0;
for(const [key,blend,size,line,url] of targets){
 const entry=finalState.entries?.[key];
 const rec=entry&&targetRecord(entry,blend,size);
 if(!rec) throw new Error(key+': verification target missing');
 if(!(rec.practicalLines||[]).includes(line)) throw new Error(key+': cheapest-single line missing after write');
 if(url&&!(rec.retailerLinks||[]).includes(url)) throw new Error(key+': cheapest-single retailer link missing after write');
 verified++;
}
console.log('PACK_SINGLE_SWEEP_VERIFIED '+verified);
