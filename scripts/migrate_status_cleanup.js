#!/usr/bin/env node
/**
 * Migration: Unified Status System
 * Run once: node scripts/migrate_status_cleanup.js
 *
 * Steps:
 *   1. Add new RAMP Status options ('Planned','Done') via Metadata API
 *   2. Migrate RAMP records: Greek statuses → Planned/Done
 *   3. Migrate ORDERS: Status='Loaded' → 'In Transit'
 *   4. Sync Ops Status into Status where Ops Status is more advanced
 *
 * IDEMPOTENT: safe to re-run.
 */

const AT_TOKEN = process.env.AT_TOKEN
  || 'patpPJXnFYnxdgoK3.a2162b09fbb214628114ff2ce68bb5a7b30aea2061b14f9562a1ab222585cf08';
const AT_BASE  = 'appElT5CQV6JQvym8';

const T_ORDERS = 'tblgHlNmLBH3JTdIM';
const T_RAMP   = 'tblT8W5WcuToBQNiY';

const HEADERS = { 'Authorization': `Bearer ${AT_TOKEN}`, 'Content-Type': 'application/json' };

// ── RAMP Status mapping ──
// Old Greek values → New simplified vocabulary
const RAMP_STATUS_MAP = {
  'Προγραμματισμένο': 'Planned',
  '✅ Έγινε':         'Done',
  'Ολοκληρώθηκε':     'Done',
  'Έφτασε':           'Planned',  // Arrived but not yet completed
  'Φόρτωση':          'Planned',  // In progress = still planned (not done)
  'Εκφόρτωση':        'Planned',
  'Αναβλήθηκε':       'Planned',  // Postponed → handled via Postponed To field
  '⏩ Postponed':      'Planned',
};

// ── ORDERS Status promotion ──
// If Ops Status is more advanced than Status, promote Status.
const STATUS_RANK = {
  '': 0,
  'Pending': 1,
  'Assigned': 2,
  'Loaded': 3,        // legacy — promotes to In Transit
  'In Transit': 3,
  'Delivered': 4,
  'Invoiced': 5,
  'Cancelled': 6,
};
const OPS_TO_STATUS = {
  'Loaded':     'In Transit',
  'In Transit': 'In Transit',
  'Delivered':  'Delivered',
};

// ─────────────────────────────────────────────────────────────────

async function atFetch(table, params = '') {
  const records = [];
  let offset = '';
  do {
    const url = `https://api.airtable.com/v0/${AT_BASE}/${table}?pageSize=100${params}${offset ? '&offset=' + encodeURIComponent(offset) : ''}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const d = await res.json();
    records.push(...(d.records || []));
    offset = d.offset || '';
  } while (offset);
  return records;
}

async function atPatchBatch(table, records) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${table}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ records: batch, typecast: true })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`PATCH ${table} batch failed: ${res.status} — ${txt}`);
      throw new Error(`PATCH failed: ${res.status}`);
    }
    const d = await res.json();
    results.push(...(d.records || []));
    await new Promise(r => setTimeout(r, 220)); // rate limit
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────
// STEP 1: Add 'Planned' & 'Done' to RAMP Status field via Metadata API
// ─────────────────────────────────────────────────────────────────

async function ensureRampStatusOptions() {
  console.log('\n[1/4] Ensuring RAMP Status options exist…');

  // Get table schema
  const url = `https://api.airtable.com/v0/meta/bases/${AT_BASE}/tables`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Schema fetch failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  const rampTable = data.tables.find(t => t.id === T_RAMP);
  if (!rampTable) throw new Error('RAMP table not found in schema');

  const statusField = rampTable.fields.find(f => f.name === 'Status');
  if (!statusField) throw new Error('Status field not found in RAMP');

  const currentChoices = (statusField.options?.choices || []).map(c => c.name);
  console.log('  Current RAMP Status options:', currentChoices.join(', '));

  const needed = ['Planned', 'Done'];
  const toAdd = needed.filter(n => !currentChoices.includes(n));

  if (!toAdd.length) {
    console.log('  ✓ Both Planned and Done already exist');
    return;
  }

  // Append new choices (KEEPING all old ones — they're still in records)
  const allChoices = [
    ...(statusField.options?.choices || []),
    ...toAdd.map(name => ({ name, color: name === 'Done' ? 'greenLight2' : 'blueLight2' }))
  ];

  const patchUrl = `https://api.airtable.com/v0/meta/bases/${AT_BASE}/tables/${T_RAMP}/fields/${statusField.id}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ options: { choices: allChoices } })
  });

  if (!patchRes.ok) {
    const txt = await patchRes.text();
    throw new Error(`Failed to add options: ${patchRes.status} — ${txt}`);
  }
  console.log(`  ✓ Added options: ${toAdd.join(', ')}`);
}

// ─────────────────────────────────────────────────────────────────
// STEP 2: Migrate RAMP records
// ─────────────────────────────────────────────────────────────────

async function migrateRampStatuses() {
  console.log('\n[2/4] Migrating RAMP records…');

  const records = await atFetch(T_RAMP, '&fields[]=Status');
  console.log(`  Fetched ${records.length} RAMP records`);

  const updates = [];
  let alreadyClean = 0;
  let unmapped = new Set();

  for (const r of records) {
    const cur = r.fields.Status;
    if (!cur) continue;
    if (cur === 'Planned' || cur === 'Done') { alreadyClean++; continue; }

    const next = RAMP_STATUS_MAP[cur];
    if (!next) { unmapped.add(cur); continue; }

    updates.push({ id: r.id, fields: { Status: next } });
  }

  if (unmapped.size) console.warn('  ⚠ Unmapped values (skipped):', [...unmapped].join(', '));
  console.log(`  Already clean: ${alreadyClean} | To migrate: ${updates.length}`);

  if (updates.length) {
    await atPatchBatch(T_RAMP, updates);
    console.log(`  ✓ Migrated ${updates.length} RAMP records`);
  }
}

// ─────────────────────────────────────────────────────────────────
// STEP 3 & 4: Migrate ORDERS — Loaded → In Transit + sync Ops Status
// ─────────────────────────────────────────────────────────────────

async function migrateOrdersStatuses() {
  console.log('\n[3/4] Migrating ORDERS Status (Loaded → In Transit, sync from Ops Status)…');

  const records = await atFetch(T_ORDERS, '&fields[]=Status&fields[]=Ops%20Status');
  console.log(`  Fetched ${records.length} ORDER records`);

  const updates = [];
  let kept = 0;

  for (const r of records) {
    const cur = (r.fields.Status || '').trim();
    const ops = (r.fields['Ops Status'] || '').trim();

    let next = cur;

    // Rule 1: Status='Loaded' → 'In Transit'
    if (cur === 'Loaded') next = 'In Transit';

    // Rule 2: If Ops Status maps to a more advanced state, promote
    const opsMapped = OPS_TO_STATUS[ops];
    if (opsMapped && (STATUS_RANK[opsMapped] || 0) > (STATUS_RANK[next] || 0)) {
      next = opsMapped;
    }

    if (next !== cur) {
      updates.push({ id: r.id, fields: { Status: next } });
    } else {
      kept++;
    }
  }

  console.log(`  Kept: ${kept} | To update: ${updates.length}`);

  if (updates.length) {
    await atPatchBatch(T_ORDERS, updates);
    console.log(`  ✓ Migrated ${updates.length} ORDER records`);
  }
}

// ─────────────────────────────────────────────────────────────────
// STEP 4 (info only): Report on Ops Status field deprecation
// ─────────────────────────────────────────────────────────────────

async function reportOpsStatusUsage() {
  console.log('\n[4/4] Ops Status field usage report (for manual cleanup)…');
  const records = await atFetch(T_ORDERS, '&fields[]=Ops%20Status');
  const used = records.filter(r => r.fields['Ops Status']);
  console.log(`  ${used.length} ORDERS still have Ops Status set.`);
  console.log(`  Field is deprecated — code no longer reads/writes it.`);
  console.log(`  ACTION: Once you've verified all flows, delete "Ops Status" field from ORDERS in Airtable UI.`);
}

// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  STATUS UNIFICATION MIGRATION');
  console.log('  Base:', AT_BASE);
  console.log('═══════════════════════════════════════════════════════');

  try {
    await ensureRampStatusOptions();
    await migrateRampStatuses();
    await migrateOrdersStatuses();
    await reportOpsStatusUsage();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✓ MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n✗ MIGRATION FAILED:', err.message);
    process.exit(1);
  }
}

main();
