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
  const source = [record.packageLabel, ...(Array.isArray(record.practicalLines) ? record.practicalLines : [])].filter(Boolean).join(' ');
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
  const state=await stateResp.json(), rendered=parseRendered(await pageResp.text());
  const effective={};
  for(const key of new Set([...Object.keys(rendered),...Object.keys(state.cards||{}),...Object.keys(state.entries||{})])) effective[key]={...(rendered[key]||{}),...(state.cards?.[key]||{}),...(state.entries?.[key]||{})};
  const rows=collectMultiStickEntries(effective,rendered);
  console.log(`PACK_SINGLE_AUDIT count=${rows.length}`);
  for(const item of rows) console.log(`PACK ${JSON.stringify(item)}`);
  console.log('PACK_SINGLE_AUDIT_COMPLETE');
}
if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g,'/'))) main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
