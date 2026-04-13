#!/usr/bin/env node
/**
 * Migration Script: Create ORDER_STOPS records from flat Location fields
 * Run once: node scripts/migrate_orders_to_stops.js
 *
 * For each INTL ORDER and NAT_ORDER without ORDER STOPS:
 *   - Reads Loading Location 1-10, Loading Pallets 1-10, Loading DateTime 1-10
 *   - Reads Unloading Location 1-10, Unloading Pallets 1-10, Unloading DateTime 1-10
 *   - Creates ORDER_STOPS records with proper links
 */

const AT_TOKEN = 'patpPJXnFYnxdgoK3.a2162b09fbb214628114ff2ce68bb5a7b30aea2061b14f9562a1ab222585cf08';
const AT_BASE  = 'appElT5CQV6JQvym8';

const T_ORDERS     = 'tblgHlNmLBH3JTdIM';
const T_NAT_ORDERS = 'tblGHCCsTMqAy4KR2';
const T_STOPS      = 'tblaeY5QOHAS1gyE8';

const HEADERS = { 'Authorization': `Bearer ${AT_TOKEN}`, 'Content-Type': 'application/json' };

async function atFetch(table, params = '') {
  const records = [];
  let offset = '';
  do {
    const url = `https://api.airtable.com/v0/${AT_BASE}/${table}?pageSize=100${params}${offset ? '&offset=' + offset : ''}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const d = await res.json();
    records.push(...(d.records || []));
    offset = d.offset || '';
  } while (offset);
  return records;
}

async function atCreateBatch(table, records) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${table}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) throw new Error(`POST ${table}: ${res.status} ${await res.text()}`);
    const d = await res.json();
    results.push(...(d.records || []));
    // Rate limit: 5 req/sec
    if (i + 10 < records.length) await new Promise(r => setTimeout(r, 250));
  }
  return results;
}

// ── INTL ORDERS Migration ────────────────────────────────

function extractIntlStops(orderId, f) {
  const stops = [];

  // Loading stops
  for (let i = 1; i <= 10; i++) {
    const locArr = f[`Loading Location ${i}`];
    const locId = Array.isArray(locArr) ? locArr[0] : null;
    if (!locId && i > 1) break;
    if (!locId) continue;
    const dt = i === 1 ? f['Loading DateTime'] : f[`Loading DateTime ${i}`];
    stops.push({
      fields: {
        'Parent Order': [orderId],
        'Stop Number': i,
        'Stop Type': 'Loading',
        'Stop Label': `Loading #${i}`,
        'Location': [locId],
        ...(dt ? { 'DateTime': dt } : {}),
        'Pallets': parseFloat(f[`Loading Pallets ${i}`]) || 0,
      }
    });
  }

  // Unloading stops
  for (let i = 1; i <= 10; i++) {
    const locArr = f[`Unloading Location ${i}`];
    const locId = Array.isArray(locArr) ? locArr[0] : null;
    if (!locId && i > 1) break;
    if (!locId) continue;
    const dt = f[`Unloading DateTime ${i}`];
    stops.push({
      fields: {
        'Parent Order': [orderId],
        'Stop Number': i,
        'Stop Type': 'Unloading',
        'Stop Label': `Unloading #${i}`,
        'Location': [locId],
        ...(dt ? { 'DateTime': dt } : {}),
        'Pallets': parseFloat(f[`Unloading Pallets ${i}`]) || 0,
      }
    });
  }

  return stops;
}

// ── NAT_ORDERS Migration ────────────────────────────────

function extractNatStops(orderId, f) {
  const stops = [];

  const pickupArr = f['Pickup Location 1'];
  const pickupId = Array.isArray(pickupArr) ? pickupArr[0] : null;
  if (pickupId) {
    stops.push({
      fields: {
        'Parent Nat Order': [orderId],
        'Stop Number': 1,
        'Stop Type': 'Loading',
        'Stop Label': 'Loading #1',
        'Location': [pickupId],
        ...(f['Loading DateTime'] ? { 'DateTime': f['Loading DateTime'] } : {}),
        'Pallets': parseFloat(f['Pallets']) || 0,
      }
    });
  }

  const delivArr = f['Delivery Location 1'];
  const delivId = Array.isArray(delivArr) ? delivArr[0] : null;
  if (delivId) {
    stops.push({
      fields: {
        'Parent Nat Order': [orderId],
        'Stop Number': 1,
        'Stop Type': 'Unloading',
        'Stop Label': 'Unloading #1',
        'Location': [delivId],
        ...(f['Delivery DateTime'] ? { 'DateTime': f['Delivery DateTime'] } : {}),
        'Pallets': parseFloat(f['Pallets']) || 0,
      }
    });
  }

  return stops;
}

// ── MAIN ────────────────────────────────────────────────

async function main() {
  console.log('=== ORDER_STOPS Migration ===\n');

  // ── INTL ORDERS ──
  console.log('Fetching INTL ORDERS...');
  const intlOrders = await atFetch(T_ORDERS);
  console.log(`Found ${intlOrders.length} INTL orders`);

  let intlMigrated = 0, intlSkipped = 0, intlStopsCreated = 0;
  for (const order of intlOrders) {
    const existingStops = order.fields['ORDER STOPS'] || [];
    if (existingStops.length > 0) {
      intlSkipped++;
      continue;
    }

    const stops = extractIntlStops(order.id, order.fields);
    if (!stops.length) {
      intlSkipped++;
      continue;
    }

    try {
      const created = await atCreateBatch(T_STOPS, stops);
      intlStopsCreated += created.length;
      intlMigrated++;
      console.log(`  ✓ ${order.fields['Order Number']?.slice(0, 40) || order.id} → ${created.length} stops`);
    } catch (e) {
      console.error(`  ✗ ${order.id}: ${e.message}`);
    }
  }

  console.log(`\nINTL: ${intlMigrated} migrated, ${intlSkipped} skipped, ${intlStopsCreated} stops created\n`);

  // ── NAT_ORDERS ──
  console.log('Fetching NAT_ORDERS...');
  const natOrders = await atFetch(T_NAT_ORDERS);
  console.log(`Found ${natOrders.length} NAT orders`);

  let natMigrated = 0, natSkipped = 0, natStopsCreated = 0;
  for (const order of natOrders) {
    const existingStops = order.fields['ORDER STOPS'] || [];
    if (existingStops.length > 0) {
      natSkipped++;
      continue;
    }

    const stops = extractNatStops(order.id, order.fields);
    if (!stops.length) {
      natSkipped++;
      continue;
    }

    try {
      const created = await atCreateBatch(T_STOPS, stops);
      natStopsCreated += created.length;
      natMigrated++;
      console.log(`  ✓ ${order.fields['Name']?.slice(0, 40) || order.id} → ${created.length} stops`);
    } catch (e) {
      console.error(`  ✗ ${order.id}: ${e.message}`);
    }
  }

  console.log(`\nNAT: ${natMigrated} migrated, ${natSkipped} skipped, ${natStopsCreated} stops created`);
  console.log(`\n=== DONE ===`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
