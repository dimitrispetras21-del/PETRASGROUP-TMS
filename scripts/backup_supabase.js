#!/usr/bin/env node
/**
 * Supabase JSON dump — ΟΛΕΣ οι γραμμές, με τα soft-deleted μαζί.
 *
 * Γιατί ξεχωριστό από το scripts/backup.sh: εκείνο χτυπάει ακόμη Airtable, που
 * δεν είναι η βάση από 28/7/2026. Αυτό γράφτηκε ως δίχτυ ασφαλείας ΠΡΙΝ την
 * οριστική διαγραφή παραγγελιών (owner 12/8) — hard delete χωρίς dump δεν γίνεται.
 *
 * Usage: node scripts/backup_supabase.js <out-dir> <table> [table ...]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY (από .env.local)
 */
const fs = require('fs');
const path = require('path');

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) { console.error('ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY missing'); process.exit(1); }

const outDir = process.argv[2];
const tables = process.argv.slice(3);
if (!outDir || !tables.length) {
  console.error('Usage: node scripts/backup_supabase.js <out-dir> <table> [table ...]');
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const PAGE = 1000;  // PostgREST max-rows· μεγαλύτερο page απλώς αγνοείται

async function dump(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const counts = {};
  let failed = 0;
  for (const t of tables) {
    try {
      const rows = await dump(t);
      fs.writeFileSync(path.join(outDir, `${t}.json`), JSON.stringify(rows, null, 2));
      counts[t] = rows.length;
      console.log(`${String(rows.length).padStart(6)}  ${t}`);
    } catch (e) {
      counts[t] = `ERROR: ${e.message}`;
      failed++;
      console.error(`  FAIL  ${t}: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(outDir, '_manifest.json'),
    JSON.stringify({ takenAt: new Date().toISOString(), supabase: URL_, counts }, null, 2));
  console.log(`\n→ ${outDir}`);
  // Ένας αποτυχημένος πίνακας κάνει το backup ΜΗ ασφαλές για να ακολουθήσει
  // διαγραφή· βγαίνει μη μηδενικό ώστε ένα `&&` να μη συνεχίσει.
  process.exit(failed ? 1 : 0);
})();
