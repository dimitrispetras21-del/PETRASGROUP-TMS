// tests/wi4-vectors-hash.test.js — run: node --test tests/wi4-vectors-hash.test.js
//
// Why (TECH_DESIGN §d.5): the front comparator (WI4.sameValue) and the
// Worker's expectSame must agree, or the «someone else changed it» check
// raises false 409s or misses real ones. Both run ONE vectors file,
// worker/test/fixtures/expect-vectors.json. WP8's branch
// (deploy/worker-presence) holds the original; feat/wi-v4 holds a copy at the
// same path until the post-deploy sync of worker/test reaches main. WP8 wrote
// the sha256 of its original into expect-vectors.sha256, and the coordinator
// cherry-picks that one file. If the copy drifts from it, this fails loudly.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIR = path.join(__dirname, '..', 'worker', 'test', 'fixtures');

test('expect-vectors.json copy has the sha256 WP8 recorded', () => {
  const bytes = fs.readFileSync(path.join(DIR, 'expect-vectors.json'));
  const want = fs.readFileSync(path.join(DIR, 'expect-vectors.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert.match(want, /^[0-9a-f]{64}$/, 'expect-vectors.sha256 must hold one sha256');
  assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), want,
    'the vectors copy drifted from WP8\'s original — re-copy it from deploy/worker-presence');
});

test('expect-vectors.json holds the cases §d.5 names', () => {
  const v = JSON.parse(fs.readFileSync(path.join(DIR, 'expect-vectors.json'), 'utf8'));
  const has = (pred) => v.some(pred);
  assert.ok(has((x) => x.a === '12' && x.b === 'AB 1 2' && x.same === false), "'12' vs 'AB 1 2'");
  assert.ok(has((x) => x.label === 'Loading DateTime' && /Z$/.test(String(x.a)) && /\+00:00$/.test(String(x.b)) && x.same === true), 'Z vs +00:00 on a date label');
  assert.ok(has((x) => x.label === 'Partner Truck Plates' && /Z$/.test(String(x.a)) && /\+00:00$/.test(String(x.b)) && x.same === false), 'same pair on a non-date label');
  assert.ok(has((x) => x.label === 'Is Partner Trip' && x.a === false && !('b' in x) && x.same === true), 'false vs absent on a checkbox');
  assert.ok(has((x) => Array.isArray(x.a) && x.a.join() === 'recA,recB' && Array.isArray(x.b) && x.b.join() === 'recB,recA' && x.same === true), 'array order');
});
