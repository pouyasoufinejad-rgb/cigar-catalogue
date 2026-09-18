import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE='https://cigar-catalogue.psncodex.workers.dev';
function bash(script) {
  try { return execFileSync('bash',['-lc',script],{encoding:'utf8',maxBuffer:64*1024*1024}); }
  catch(error) { return String(error.stdout||'')+String(error.stderr||''); }
}

test('deep recovery diagnostic for exact pre-sidebar state', async () => {
  bash("git fetch origin '+refs/heads/*:refs/remotes/origin/*' --force");
  const response=await fetch(BASE+'/api/catalogue-overrides?diag=deep-recovery-'+Date.now(),{headers:{accept:'application/json'},cache:'no-store'});
  assert.equal(response.ok,true);
  const state=await response.json();
  console.log('DEEP_LIVE_STATE '+JSON.stringify({updatedAt:state.updatedAt,entries:Object.keys(state.entries||{}).length,cards:Object.keys(state.cards||{}).length,sections:Object.keys(state.sections||{}).length}));

  const refs=bash("git for-each-ref --format='%(refname)' refs/heads refs/remotes | tr '\n' ' '");
  const smoking=bash("git grep -n -i 'smokingpipes' "+refs+" 2>/dev/null || true");
  console.log('DEEP_SMOKINGPIPES '+JSON.stringify(smoking.split('\n').filter(Boolean).slice(0,500)));

  for (const name of ['axe-charutos-live-state.json','live-snapshot-overrides.json']) {
    const history=bash("git log --all --format='%H|%cI|%s' -- '"+name+"'").split('\n').filter(Boolean);
    console.log('DEEP_STATE_HISTORY '+name+' '+JSON.stringify(history));
    for(const row of history){
      const commit=row.split('|')[0];
      const body=bash("git show '"+commit+":"+name+"' 2>/dev/null || true");
      if(!body.trim()) continue;
      try {
        const s=JSON.parse(body);
        console.log('DEEP_STATE_CONTENT '+JSON.stringify({name,commit,updatedAt:s.updatedAt,entries:Object.keys(s.entries||{}).length,cards:Object.keys(s.cards||{}).length,sections:Object.keys(s.sections||{}).length}));
      } catch {}
    }
  }

  const large=bash("for c in $(git rev-list --all); do git ls-tree -rl $c | awk '$4 >= 20000 && $5 ~ /\\.json$/ {print \"'$c' \" $4 \" \" $5}'; done | sort -k3,3 -k2,2nr | awk '!seen[$3]++' | head -n 200");
  console.log('DEEP_LARGE_JSON '+JSON.stringify(large.split('\n').filter(Boolean)));
});
