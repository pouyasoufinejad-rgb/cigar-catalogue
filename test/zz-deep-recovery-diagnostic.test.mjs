import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE='https://cigar-catalogue.psncodex.workers.dev';

function sh(args, options={}) {
  try { return execFileSync(args[0], args.slice(1), { encoding:'utf8', maxBuffer:64*1024*1024, ...options }); }
  catch (error) { return String(error.stdout||'') + String(error.stderr||''); }
}

test('deep recovery diagnostic for exact pre-sidebar state', async () => {
  try { sh(['git','fetch','origin','+refs/heads/*:refs/remotes/origin/*','--force']); } catch {}
  const response=await fetch(BASE+'/api/catalogue-overrides?diag=deep-recovery-'+Date.now(),{headers:{accept:'application/json'},cache:'no-store'});
  assert.equal(response.ok,true);
  const state=await response.json();

  console.log('LIVE_STATE_SUMMARY '+JSON.stringify({
    updatedAt:state.updatedAt,
    entries:Object.keys(state.entries||{}).length,
    cards:Object.keys(state.cards||{}).length,
    sections:Object.keys(state.sections||{}).length
  }));

  const allRefs=sh(['git','for-each-ref','--format=%(refname)','refs/heads/','refs/remotes/']);
  console.log('REFS '+JSON.stringify(allRefs.trim().split(/\n+/).filter(Boolean)));

  const candidates=sh(['git','log','--all','--name-only','--pretty=format:','--','*.json'])
    .split(/\n+/).filter(Boolean);
  const unique=[...new Set(candidates)];
  const interesting=[];
  for(const p of unique){
    const hist=sh(['git','log','--all','--format=%H|%cI|%s','--',p]).trim().split(/\n+/).filter(Boolean);
    if(!hist.length) continue;
    let found=null;
    for(const row of hist){
      const [commit]=row.split('|');
      const body=sh(['git','show',commit+':'+p]);
      if(!body || /fatal:|does not exist/i.test(body)) continue;
      if(/smokingpipes|retailerLinks|productionLines|practicalLines|catalogue-overrides/i.test(body)){
        found={p,row,smokingpipes:/smokingpipes/i.test(body),bytes:Buffer.byteLength(body)};
        if(found.smokingpipes) {
          const urls=body.split('"').filter(u=>u.includes('smokingpipes.com'));
          found.urls=[...new Set(urls)].slice(0,30);
        }
        break;
      }
    }
    if(found) interesting.push(found);
  }
  console.log('INTERESTING_JSON '+JSON.stringify(interesting.slice(0,500)));

  const grep=sh(['git','grep','-n','-i','smokingpipes','--','refs/remotes/origin/*']);
  console.log('SMOKINGPIPES_GREP '+JSON.stringify(grep.split(/\n+/).filter(Boolean).slice(0,500)));

  const stateFiles=['axe-charutos-live-state.json','live-snapshot-overrides.json'];
  for(const name of stateFiles){
    const hist=sh(['git','log','--all','--format=%H|%cI|%s','--',name]).trim().split(/\n+/).filter(Boolean);
    console.log('STATE_FILE_HISTORY '+name+' '+JSON.stringify(hist));
    for(const row of hist){
      const [commit]=row.split('|');
      const body=sh(['git','show',commit+':'+name]);
      if(!body || /fatal:|does not exist/i.test(body)) continue;
      try{
        const s=JSON.parse(body);
        console.log('STATE_FILE_CONTENT '+JSON.stringify({name,commit,updatedAt:s.updatedAt,entries:Object.keys(s.entries||{}).length,cards:Object.keys(s.cards||{}).length,sections:Object.keys(s.sections||{}).length}));
      }catch{}
    }
  }
});
