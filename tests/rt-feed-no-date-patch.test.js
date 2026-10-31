// tests/rt-feed-no-date-patch.test.js - run: node --test tests/rt-feed-no-date-patch.test.js
// F41 (owner 28/10): the international's P&L feed never writes the dates of an EXISTING round trip. The database owns
// them (rt_recompute, all legs); the feed wrote the anchor export's own dates and every save of a paired import moved
// date_end back and forth (RT-1252, closed, 22 <-> 27). Build time, plain node: the patch of an existing RT in
// core/rt-feed.js names no date field. A new RT (POST, created with its first dates) is not this patch.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('rt-feed: the PATCH of an existing round trip carries no date (one writer of RT dates: the database)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'core/rt-feed.js'), 'utf8');
  const a = src.indexOf('      const patch = {};');
  const b = src.indexOf("plFetch('/costs/rt/' + rt.id, { method: 'PATCH', body: patch })", a);
  assert.ok(a > 0 && b > a, 'the existing-RT patch block of rtOnOrderSaved was not found');
  const block = src.slice(a, b);
  assert.ok(/patch\.truck_id/.test(block), 'the block is the vehicle patch');
  assert.ok(!/patch\.date_(start|end)\b|date_(start|end)\s*:/.test(block.replace(/\/\/[^\n]*/g, '')), 'a date is patched again');
});
