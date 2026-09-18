import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE='https://cigar-catalogue.psncodex.workers.dev';
const TARGET='8ba8f65754b37d5973331e55be0e9e9d5d306cf5';
const git=(args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

test('live Production Practical retailer fields match pre-sidebar request ledger', async()=>{
  const r=await fetch(BASE+'/api/catalogue-overrides?verify_repair='+Date.now(),{headers:{accept:'application/json'},cache:'no-store'});
  assert.equal(r.ok,true);
  const state=await r.json();
  const paths=git(['ls-tree','-r','--name-only',TARGET,'catalogue-requests']).split(/\n+/).filter(x=>x.endsWith('.json')).sort();
  const ledger=new Map();
  for(const p of paths){
    const body=git(['show',TARGET+':'+p]); let q; try{q=JSON.parse(body)}catch{continue}
    if(!q.key) continue;
    const cur=ledger.get(q.key)||{};
    if(q.operation==='upsert-entry' && q.entry) Object.assign(cur,q.entry);
    ledger.set(q.key,cur);
  }
  const mismatches=[];
  for(const [key,intent] of ledger){
    for(const f of ['productionLines','practicalLines','retailerLinks']){
      if(!(f in intent)) continue;
      const entry=state.entries?.[key]?.[f];
      const card=state.cards?.[key]?.[f];
      const actual=Array.isArray(entry)&&entry.length?entry:card;
      if(!eq(actual,intent[f])) mismatches.push({key,field:f,expected:intent[f],actual});
    }
  }
  const smoking=[];
  for(const [key,e] of Object.entries(state.entries||{})) for(const u of e.retailerLinks||[]) if(/smokingpipes/i.test(u)) smoking.push({key,url:u});
  for(const [key,c] of Object.entries(state.cards||{})) for(const u of c.retailerLinks||[]) if(/smokingpipes/i.test(u)&&!smoking.some(x=>x.key===key&&x.url===u)) smoking.push({key,url:u});
  console.log('LIVE_REPAIR_COUNTS '+JSON.stringify({entries:Object.keys(state.entries||{}).length,cards:Object.keys(state.cards||{}).length,mismatches:mismatches.length,smokingpipes:smoking.length,updatedAt:state.updatedAt}));
  console.log('LIVE_REPAIR_MISMATCHES '+JSON.stringify(mismatches.slice(0,250)));
  console.log('LIVE_SMOKINGPIPES '+JSON.stringify(smoking));
  assert.equal(mismatches.length,0);
});
