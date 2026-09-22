#!/usr/bin/env node
import { DEFAULT_BASE_URL } from './publish-catalogue-request.mjs';
import {
  blendEffectiveRecord,
  normaliseBlendVariants,
  normaliseVariants,
  variantEffectiveRecord
} from '../public/catalogue-variants.mjs';

const baseUrl = String(process.env.CATALOGUE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

const textOnly = value => String(value || '').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const money = value => Number(String(value || '').replace(/[^0-9.]/g,'')) || 0;

export function packageCount(record = {}) {
  const explicit = Number(record.packageCount);
  if (Number.isFinite(explicit) && explicit > 1) return Math.round(explicit);
  const firstPractical = Array.isArray(record.practicalLines) ? record.practicalLines[0] : '';
  const source = [record.packageLabel, firstPractical].filter(Boolean).join(' ');
  const m = source.match(/\b(?:pack|tin|box|packet|carton|bundle)\s+(?:of\s+)?(\d{1,3})\b/i)
    || source.match(/\b(\d{1,3})[- ]?(?:pack|tin|box|count|ct)\b/i)
    || source.match(/\b(\d{1,3})\s+(?:cigars?|cigarillos?|sticks?)\b/i);
  if (m) return Math.max(1, Number(m[1]) || 1);
  return /\b(?:pack|tin|box|packet|carton|bundle)\b/i.test(source) ? 2 : 1;
}
export function isMulti(record) { return packageCount(record) > 1; }

function parseRendered(html) {
  const out={};
  for (const m of String(html||'').matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)) {
    const attrs=m[1]||'', body=m[2]||'';
    const key=attrs.match(/\bdata-key=["']([^"']+)["']/i)?.[1]||'';
    if(!key) continue;
    const h3=body.match(/<h3>\s*<span>([\s\S]*?)<\/span>([\s\S]*?)<\/h3>/i);
    const facts=body.match(/<div class="facts">([\s\S]*?)<\/div>(?:<div class="value-calc|<div class="stock|<div class="medals")/i)?.[1]||'';
    const factRows=[...facts.matchAll(/<div[^>]*>\s*<b>([\s\S]*?)<\/b>\s*<small>([\s\S]*?)<\/small>\s*<\/div>/gi)];
    const practicalBlock=body.match(/<div\b[^>]*class=["'][^"']*artmeta-right[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
    const practicalLines=[...practicalBlock.matchAll(/class=["'][^"']*artmeta-line[^"']*["'][^>]*>([\s\S]*?)<\//gi)].map(x=>textOnly(x[1])).filter(Boolean);
    const links=[...body.matchAll(/<a\b[^>]*class=["'][^"']*shop[^"']*["'][^>]*href=["']([^"']+)["']/gi)].map(x=>x[1]);
    out[key]={
      key,
      brand:textOnly(h3?.[1]||''),
      title:textOnly(h3?.[2]||''),
      packagePrice:money(factRows[0]?.[1]||''),
      packageLabel:textOnly(factRows[0]?.[2]||''),
      price:money(factRows[1]?.[1]||''),
      practicalLines,
      retailerLinks:links,
      archived:/\bdata-archived=["']1["']/i.test(attrs)
    };
  }
  return out;
}

function row(key, record, blendVariantId='', variantId='') {
  return {key,blendVariantId,variantId,brand:record.brand||'',title:record.title||'',packageLabel:record.packageLabel||'',packageCount:packageCount(record),packagePrice:Number(record.packagePrice)||0,perStickPrice:Number(record.price)||0,retailerLinks:Array.isArray(record.retailerLinks)?record.retailerLinks:[],practicalLines:Array.isArray(record.practicalLines)?record.practicalLines:[]};
}

export function collectMultiStickEntries(entries={}, rendered={}) {
  const rows=[], seen=new Set(), keys=new Set([...Object.keys(rendered),...Object.keys(entries)]);
  for(const key of keys){
    const base={...(rendered[key]||{}),...(entries[key]||{})};
    if(!base||base.archived) continue;
    const blends=normaliseBlendVariants(base);
    const blendCandidates=blends.length?blends.map(b=>({id:b.id,record:blendEffectiveRecord(base,b.id).record})):[{id:'',record:base}];
    for(const blend of blendCandidates){
      const sizes=normaliseVariants(blend.record);
      const sizeCandidates=sizes.length?sizes.map(s=>({id:s.id,record:variantEffectiveRecord(blend.record,s.id).record})):[{id:'',record:blend.record}];
      for(const size of sizeCandidates){
        if(!isMulti(size.record)) continue;
        const sig=[key,blend.id,size.id].join('|');
        if(seen.has(sig)) continue;
        seen.add(sig); rows.push(row(key,size.record,blend.id,size.id));
      }
    }
  }
  return rows.sort((a,b)=>a.brand.localeCompare(b.brand)||a.title.localeCompare(b.title)||a.key.localeCompare(b.key)||a.blendVariantId.localeCompare(b.blendVariantId)||a.variantId.localeCompare(b.variantId));
}

async function main(){
  const [stateResp,pageResp]=await Promise.all([
    fetch(`${baseUrl}/api/catalogue-overrides?pack_single_audit=${Date.now()}`,{headers:{accept:'application/json'},cache:'no-store'}),
    fetch(`${baseUrl}/?pack_single_audit=${Date.now()}`,{headers:{accept:'text/html'},cache:'no-store'})
  ]);
  if(!stateResp.ok) throw new Error(`Live state read failed with HTTP ${stateResp.status}.`);
  if(!pageResp.ok) throw new Error(`Rendered catalogue read failed with HTTP ${pageResp.status}.`);
  const pageHtml=await pageResp.text();
  const state=await stateResp.json(), rendered=parseRendered(pageHtml);
  const visibleRows=(pageHtml.match(/class=["'][^"']*cheapest-single[^"']*["']/gi)||[]).length;
  const runtimeResp=await fetch(baseUrl+'/catalogue-variant-runtime.mjs?pack_single_ui_verify='+Date.now(),{headers:{accept:'text/javascript'},cache:'no-store'});
  if(!runtimeResp.ok) throw new Error('Variant runtime read failed with HTTP '+runtimeResp.status+'.');
  const runtimeText=await runtimeResp.text();
  if(!runtimeText.includes('syncCheapestSingleLine')||!runtimeText.includes('.cheapest-single')) {
    throw new Error('Production variant runtime does not include the visible cheapest-single UI.');
  }
  if(!visibleRows) throw new Error('Production HTML contains no visible cheapest-single rows.');
  console.log('PACK_SINGLE_VISIBLE_ROWS count='+visibleRows);
  const effective={};
  for(const key of new Set([...Object.keys(rendered),...Object.keys(state.cards||{}),...Object.keys(state.entries||{})])) effective[key]={...(rendered[key]||{}),...(state.cards?.[key]||{}),...(state.entries?.[key]||{})};
  const rows=collectMultiStickEntries(effective,rendered);
  const isla=effective['isla-del-sol-maduro-gran-corona']||{};
  const natural=(Array.isArray(isla.blendVariants)?isla.blendVariants:[]).find(v=>String(v?.id||'')==='natural');
  const maduro=(Array.isArray(isla.blendVariants)?isla.blendVariants:[]).find(v=>String(v?.id||'')==='maduro');
  if(Number(isla.price)!==37.39||Number(isla.ring)!==44||!natural||!maduro||Number(natural.price)!==35.21||Number(natural.ring)!==44){
    throw new Error('Live Isla del Sol Gran Corona blend state is not the verified Maduro/Natural 5 x 44 configuration.');
  }
  console.log('ISLA_GRAN_CORONA_VERIFIED maduro=37.39 natural=35.21 ring=44');
  const expectedSingles=[
    ['davidoff-winston-churchill-petite-panatela','Cheapest single: A$28.95 · Cigarworld'],
    ['davidoff-primeros-escurio','Cheapest single: A$24.10 · The Index'],
    ['davidoff-primeros-nicaragua-maduro','Cheapest single: A$24.10 · The Index'],
    ['liga-privada-no-9-coronets','Cheapest single: A$13.00 · The Index'],
    ['liga-privada-unico-papas-fritas','Cheapest single: A$29.00 · CigarHut'],
    ['my-father-la-gran-oferta-lancero','Cheapest single: A$51.50 · The Index']
  ];
  for(const [key,line] of expectedSingles){
    const hits=rows.filter(item=>item.key===key);
    if(!hits.length||!hits.some(item=>(item.practicalLines||[]).includes(line))) {
      throw new Error(key+': corrected cheapest-single value is not live.');
    }
  }
  console.log('PACK_SINGLE_CORRECTIONS_VERIFIED count='+expectedSingles.length);
  console.log(`PACK_SINGLE_AUDIT count=${rows.length}`);
  for(const item of rows) console.log(`PACK ${JSON.stringify(item)}`);
  const missing=rows.filter(item=>!(item.practicalLines||[]).some(line=>/^cheapest single\s*:/i.test(String(line||''))));
  console.log(`PACK_SINGLE_MISSING count=${missing.length}`);
  for(const item of missing) console.log(`MISSING ${JSON.stringify(item)}`);
  if(missing.length) throw new Error(`Cheapest-single line missing from ${missing.length} multi-stick presentation(s).`);
  console.log('PACK_SINGLE_AUDIT_COMPLETE');
}
if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g,'/'))) main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
