import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATE_BACKUP_LATEST_KEY,
  STATE_KEY,
  handleEntry,
  handleState,
  mergeState,
  normaliseEntry,
  stateBackupKey,
  validateStateTransition
} from '../src/index.js';
import {
  normaliseBlendVariant,
  normaliseVariant
} from '../public/catalogue-variants.mjs';

class MemoryKv {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async put(key, value) {
    this.values.set(key, typeof value === 'string' ? value : String(value));
  }
  async delete(key) {
    this.values.delete(key);
  }
}

function state(overrides = {}) {
  return {
    version:3,
    revision:7,
    updatedAt:'2026-09-28T00:00:00.000Z',
    cards:{
      alpha:{ rank:1, quality:8, futureCardField:{ keep:true } },
      beta:{ rank:2, quality:7 }
    },
    sections:{
      recommendationSubsections:[
        { id:'one', title:'One', note:'', entryKeys:['alpha','beta','dynamic'] },
        { id:'two', title:'Two', note:'', entryKeys:['gamma','delta','epsilon','zeta','eta','theta'] }
      ],
      futureSection:{ keep:true }
    },
    entries:{
      dynamic:{
        key:'dynamic',
        brand:'Future Brand',
        title:'Future Cigar',
        rank:3,
        strength:7,
        quality:8,
        futureEntryField:{ keep:true },
        blendVariants:[
          { id:'natural', label:'Natural', futureBlendField:{ keep:true } },
          { id:'maduro', label:'Maduro', futureBlendField:{ keep:true } }
        ]
      }
    },
    futureStateField:{ keep:true },
    ...overrides
  };
}

function request(path, { method='PUT', body={}, revision=7, origin=true } = {}) {
  const headers = {
    authorization:'Bearer secret',
    'content-type':'application/json'
  };
  if (revision !== null) headers['x-catalogue-state-revision'] = String(revision);
  if (origin) headers.origin = 'https://catalogue.example';
  return new Request(`https://catalogue.example${path}`, {
    method,
    headers,
    ...(method === 'DELETE' ? {} : { body:JSON.stringify(body) })
  });
}

test('future entry and variant fields survive current normalisers', () => {
  const entry = normaliseEntry({
    key:'future',
    brand:'Brand',
    title:'Title',
    futureEntryField:{ nested:['keep'] },
    anotherFutureFlag:true
  }, 'future');
  assert.deepEqual(entry.futureEntryField, { nested:['keep'] });
  assert.equal(entry.anotherFutureFlag, true);

  const size = normaliseVariant({
    id:'robusto',
    label:'Robusto',
    ring:50,
    futureSizeField:{ keep:true }
  });
  assert.deepEqual(size.futureSizeField, { keep:true });

  const blend = normaliseBlendVariant({
    id:'maduro',
    label:'Maduro',
    futureBlendField:{ keep:true },
    sizeVariants:[{ id:'short', label:'Short', futureNestedField:'keep' }]
  });
  assert.deepEqual(blend.futureBlendField, { keep:true });
  assert.equal(blend.sizeVariants[0].futureNestedField, 'keep');
});

test('partial state payloads cannot implicitly delete cards, entries, sections or future fields', () => {
  const before = state();
  const merged = mergeState(before, {
    cards:{ alpha:{ rank:1, quality:9, futureCardField:{ keep:true } } },
    sections:{ anotherSection:{ added:true } },
    entries:{ dynamic:{ title:'Renamed' } }
  });

  assert.equal(merged.cards.alpha.quality, 9);
  assert.ok(merged.cards.beta, 'an omitted existing card is preserved');
  assert.equal(merged.entries.dynamic.brand, 'Future Brand');
  assert.equal(merged.entries.dynamic.title, 'Renamed');
  assert.deepEqual(merged.entries.dynamic.futureEntryField, { keep:true });
  assert.deepEqual(merged.sections.futureSection, { keep:true });
  assert.deepEqual(merged.sections.anotherSection, { added:true });
  assert.deepEqual(merged.futureStateField, { keep:true });
});

test('explicit empty maps cannot wipe current card or entry maps', () => {
  const before = state();
  const merged = mergeState(before, { cards:{}, entries:{}, sections:{} });
  assert.deepEqual(merged.cards, before.cards);
  assert.deepEqual(merged.entries.dynamic.futureEntryField, { keep:true });
  assert.deepEqual(merged.sections, before.sections);
});

test('destructive variant loss and mass subsection loss are rejected before KV write', () => {
  const before = state({
    cards:{
      alpha:{
        rank:1,
        sizeVariants:[{ id:'one', label:'One' }, { id:'two', label:'Two' }]
      }
    },
    entries:{}
  });
  const variantLoss = structuredClone(before);
  variantLoss.cards.alpha.sizeVariants = [{ id:'one', label:'One' }];
  assert.throws(
    () => validateStateTransition(before, variantLoss),
    /would remove saved variant "two"/
  );

  const subsectionLoss = state();
  const next = structuredClone(subsectionLoss);
  next.sections.recommendationSubsections = [
    { id:'one', title:'One', note:'', entryKeys:['alpha'] }
  ];
  assert.throws(
    () => validateStateTransition(subsectionLoss, next),
    /recommendation memberships|empty all recommendation/
  );
});

test('state writes create rolling backups, advance revision and reject stale editors', async () => {
  const before = state();
  const kv = new MemoryKv({ [STATE_KEY]:JSON.stringify(before) });
  const env = { CATALOGUE_STATE:kv, ADMIN_TOKEN:'secret' };

  const first = await handleState(request('/api/catalogue-overrides', {
    body:{ version:3, cards:{ alpha:{ rank:1, quality:10, futureCardField:{ keep:true } } } }
  }), env);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.revision, 8);

  const saved = JSON.parse(await kv.get(STATE_KEY));
  assert.equal(saved.revision, 8);
  assert.equal(saved.cards.alpha.quality, 10);
  assert.ok(saved.cards.beta);
  assert.deepEqual(saved.entries.dynamic.futureEntryField, { keep:true });

  const latestBackup = JSON.parse(await kv.get(STATE_BACKUP_LATEST_KEY));
  const rollingBackup = JSON.parse(await kv.get(stateBackupKey(7)));
  assert.equal(latestBackup.revision, 7);
  assert.deepEqual(rollingBackup, latestBackup);
  assert.equal(latestBackup.cards.alpha.quality, 8);

  const stale = await handleState(request('/api/catalogue-overrides', {
    revision:7,
    body:{ version:3, cards:{ alpha:{ rank:1, quality:1 } } }
  }), env);
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /changed since this edit was loaded/i);
  assert.equal(JSON.parse(await kv.get(STATE_KEY)).cards.alpha.quality, 10);
});

test('browser writes from old cached editors require a revision precondition', async () => {
  const before = state();
  const kv = new MemoryKv({ [STATE_KEY]:JSON.stringify(before) });
  const env = { CATALOGUE_STATE:kv, ADMIN_TOKEN:'secret' };

  const response = await handleState(request('/api/catalogue-overrides', {
    revision:null,
    body:{ cards:{ alpha:{ rank:1, quality:1 } } }
  }), env);
  assert.equal(response.status, 428);
  assert.match((await response.json()).error, /out of date|reload/i);
  assert.equal(JSON.parse(await kv.get(STATE_KEY)).cards.alpha.quality, 8);
});

test('partial dynamic-entry saves preserve unknown and untouched fields and are backed up', async () => {
  const before = state();
  const kv = new MemoryKv({ [STATE_KEY]:JSON.stringify(before) });
  const env = { CATALOGUE_STATE:kv, ADMIN_TOKEN:'secret' };

  const response = await handleEntry(request('/api/catalogue-entry/dynamic', {
    body:{ title:'Updated Future Cigar', quality:9 }
  }), env, 'dynamic');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.revision, 8);
  assert.equal(payload.entry.title, 'Updated Future Cigar');
  assert.equal(payload.entry.brand, 'Future Brand');
  assert.deepEqual(payload.entry.futureEntryField, { keep:true });
  assert.equal(payload.entry.blendVariants[1].futureBlendField.keep, true);

  const backup = JSON.parse(await kv.get(STATE_BACKUP_LATEST_KEY));
  assert.equal(backup.entries.dynamic.title, 'Future Cigar');
});

test('dedicated entry DELETE remains the only path that can remove an entry/card pair', async () => {
  const before = state();
  before.cards.dynamic = { rank:3, archived:true };
  const kv = new MemoryKv({ [STATE_KEY]:JSON.stringify(before) });
  const env = { CATALOGUE_STATE:kv, ADMIN_TOKEN:'secret' };

  const response = await handleEntry(request('/api/catalogue-entry/dynamic', {
    method:'DELETE',
    body:null
  }), env, 'dynamic');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.revision, 8);

  const saved = JSON.parse(await kv.get(STATE_KEY));
  assert.equal(saved.entries.dynamic, undefined);
  assert.equal(saved.cards.dynamic, undefined);
  assert.ok(saved.cards.alpha);
  assert.ok(saved.cards.beta);

  const backup = JSON.parse(await kv.get(STATE_BACKUP_LATEST_KEY));
  assert.equal(backup.entries.dynamic.title, 'Future Cigar');
  assert.ok(backup.cards.dynamic);
});

test('full-state writes cannot blank an existing dynamic identity', async () => {
  const before = state();
  const kv = new MemoryKv({ [STATE_KEY]:JSON.stringify(before) });
  const env = { CATALOGUE_STATE:kv, ADMIN_TOKEN:'secret' };

  const response = await handleState(request('/api/catalogue-overrides', {
    body:{ entries:{ dynamic:{ brand:'', title:'' } } }
  }), env);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /blank brand|blank title/i);
  const saved = JSON.parse(await kv.get(STATE_KEY));
  assert.equal(saved.entries.dynamic.brand, 'Future Brand');
  assert.equal(saved.entries.dynamic.title, 'Future Cigar');
});
