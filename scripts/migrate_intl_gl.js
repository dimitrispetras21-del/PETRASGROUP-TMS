/**
 * MIGRATION: Linked International Order refactor
 *
 * Run once in browser console on the TMS app (app.html), after deploying
 * the new orders_intl.js and national_consolidation.html.
 *
 * What this does:
 *  1. Creates "Source Intl Orders" field on CONS_LOADS (multipleRecordLinks → ORDERS)
 *  2. For each phantom NAT_ORDER (Type=Independent, National Groupage=ON):
 *     a. Find its Linked Order → intlOrderId
 *     b. Find its GL lines
 *     c. PATCH each GL: set Linked International Order = [intlOrderId], clear Linked National Order
 *  3. Delete phantom NAT_ORDERS
 *
 * Usage:
 *   Copy and paste into browser console while on app.html
 */

(async function migrateLIO() {
  const BASE = AT_BASE;
  const PAT  = AT_TOKEN;
  const T_NO = TABLES.NAT_ORDERS;
  const T_GL = TABLES.GL_LINES;
  const T_CL = TABLES.CONS_LOADS;
  const T_ORD = TABLES.ORDERS;
  const H = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function api(url, opts={}) {
    const r = await fetch(url, { headers: H, ...opts });
    return r.json();
  }

  async function fetchAll(table, filter, fieldNames) {
    let all = [], offset = null;
    const fq = fieldNames.map(f=>`fields[]=${encodeURIComponent(f)}`).join('&');
    const base = `https://api.airtable.com/v0/${BASE}/${table}?filterByFormula=${encodeURIComponent(filter)}&${fq}&pageSize=100`;
    do {
      const url = offset ? `${base}&offset=${encodeURIComponent(offset)}` : base;
      const d = await api(url);
      if (d.error) throw new Error(JSON.stringify(d.error));
      all = all.concat(d.records || []);
      offset = d.offset || null;
    } while (offset);
    return all;
  }

  console.log('=== MIGRATION: Linked International Order ===');

  // ── STEP 1: Create "Source Intl Orders" field on CONS_LOADS ────────────────
  console.log('Step 1: Creating "Source Intl Orders" field on CONS_LOADS...');
  try {
    const res = await api(`https://api.airtable.com/v0/meta/bases/${BASE}/tables/${T_CL}/fields`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Source Intl Orders',
        type: 'multipleRecordLinks',
        options: { linkedTableId: T_ORD }
      })
    });
    if (res.error) {
      // DUPLICATE_FIELD_NAME is expected if field already exists
      console.log(res.error.type === 'DUPLICATE_FIELD_NAME'
        ? '  Field already exists — OK'
        : `  Error: ${JSON.stringify(res.error)}`);
    } else {
      console.log('  Created field:', res.id, res.name, '✓');
    }
  } catch(e) { console.warn('  Meta API error:', e.message); }

  // ── STEP 2: Find phantom NAT_ORDERS ────────────────────────────────────────
  console.log('Step 2: Fetching phantom NAT_ORDERS (Type=Independent, Groupage=1)...');
  const allPhantoms = await fetchAll(
    T_NO,
    `AND({National Groupage}=1,{Type}='Independent')`,
    ['Name', 'Linked Order']
  );
  console.log(`  Found ${allPhantoms.length} phantom NAT_ORDERS`);

  if (!allPhantoms.length) {
    console.log('  Nothing to migrate.');
    console.log('=== DONE ===');
    return;
  }

  // ── STEP 3: Migrate GL lines ────────────────────────────────────────────────
  console.log('Step 3: Migrating GL lines...');
  let glMigrated = 0;
  const phantomsToDelete = [];

  for (const no of allPhantoms) {
    const links = no.fields['Linked Order'] || [];
    const intlOrderId = (links[0]?.id || links[0]) || null;
    if (!intlOrderId) {
      console.warn(`  NO ${no.id} "${no.fields.Name}" has no Linked Order — skipping`);
      continue;
    }
    console.log(`  NO ${no.id} "${no.fields.Name}" → ORDERS ${intlOrderId}`);

    // Find GL lines linked to this phantom NAT_ORDER
    const glLines = await fetchAll(
      T_GL,
      `FIND("${no.id}",ARRAYJOIN({Linked National Order},","))>0`,
      ['Status', 'Loading Location']
    );
    console.log(`    ${glLines.length} GL lines found`);

    for (const gl of glLines) {
      await delay(210); // stay under 5 req/sec
      const res = await api(`https://api.airtable.com/v0/${BASE}/${T_GL}/${gl.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            'Linked International Order': [intlOrderId],
            'Linked National Order': []
          }
        })
      });
      if (res.error) {
        console.warn(`    GL ${gl.id} PATCH error:`, res.error);
      } else {
        glMigrated++;
        console.log(`    GL ${gl.id} ✓`);
      }
    }

    phantomsToDelete.push(no.id);
  }

  console.log(`  GL lines migrated: ${glMigrated}`);

  // ── STEP 4: Delete phantom NAT_ORDERS ──────────────────────────────────────
  console.log('Step 4: Deleting phantom NAT_ORDERS...');
  for (const noId of phantomsToDelete) {
    await delay(210);
    const res = await api(`https://api.airtable.com/v0/${BASE}/${T_NO}/${noId}`, {
      method: 'DELETE'
    });
    if (res.deleted) {
      console.log(`  Deleted NO ${noId} ✓`);
    } else {
      console.warn(`  Delete NO ${noId} failed:`, res);
    }
  }

  console.log('');
  console.log('=== MIGRATION COMPLETE ===');
  console.log(`GL lines migrated : ${glMigrated}`);
  console.log(`Phantom NOs deleted: ${phantomsToDelete.length}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Resave the VS+GRP orders in International Orders to regenerate GL lines');
  console.log('  2. Verify in Airtable: GL_LINES should have Linked International Order filled');
  console.log('  3. Verify: no more phantom NAT_ORDERS (Type=Independent, Groupage=ON)');
})();
