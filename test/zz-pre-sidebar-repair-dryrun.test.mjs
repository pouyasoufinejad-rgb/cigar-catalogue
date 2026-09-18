import test from 'node:test';
import assert from 'node:assert/strict';
import { runPreSidebarRepair } from '../scripts/repair-pre-sidebar-live-state.mjs';

test('read-only live dry run identifies the pre-sidebar data repair', async () => {
  const result = await runPreSidebarRepair({ dryRun:true });
  console.log('LIVE_PRE_SIDEBAR_REPAIR_DRY_RUN '+JSON.stringify({
    changedKeys:result.summary.keys.length,
    changes:result.changes.length,
    byField:result.summary.byField,
    retailerAdds:result.summary.retailerAdds,
    retailerRemovals:result.summary.retailerRemovals,
    changedKeyList:result.summary.keys
  }));
  assert.ok(result.summary.keys.length > 0);
  assert.ok(result.changes.length > 0);
});

// post-deploy verification trigger
