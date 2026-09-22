// Ζ — THE FIRST FULL CHAIN, proven LOCALLY (PGlite + mocked pg_net/Vault + simulated routines):
// synthetic event (F-14: order assigned, no round trip) → check B-01 red → incident → DB wakes the routine
// (/fire, mocked) → p1 routine (as tms_monitor_writer) pushes one line + e-mails the full alert → marked
// notified in monitoring only → digest routine: package → diagnosis → validator → stored → e-mail →
// data fixed → green → incident resolved. Every step is asserted; the notifications are written to
// out/notifications.log (the "mock channel" of the brief).
// It proves ONLY the local chain. Not proven here: real pg_cron timing, a real routine run, real push/e-mail.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { freshDb, onlyChecks, assignedOrder, roundTripFor, vault, one, all } from './helpers.mjs';
import { memoryTransport, runP1, runWatchdog, runDigest } from '../routines/sim.mjs';
import { diagnose } from '../investigate/diagnose.mjs';
import { validateReport, extractReport } from '../investigate/validate.mjs';

const FIRE = 'https://api.anthropic.invalid/v1/claude_code/routines/trig_TEST/fire';
const HERE = new URL('.', import.meta.url).pathname;

test('Ζ chain: event → check → incident → wake-up → push+email → diagnosis → resolved', async () => {
  const t = {}; const T0 = Date.now(); const mark = (k) => { t[k] = Date.now() - T0; };
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  await vault(db, { routine_p1_fire_url: FIRE, routine_p1_fire_token: 'test-token' });
  await db.query("SELECT monitoring.beat('routine-watchdog','sim','alive')");   // steady state: the watchdog is alive
  const tr = memoryTransport();

  // 1. synthetic event: the assignment happened 20′ ago, the trigger never produced a round trip
  const a = await assignedOrder(db, { minutesAgo: 20, legacy: 'recTEST0001' }); mark('event');
  // 2. scheduled check (cron 'fast' every 15′ in production)
  await db.query("SELECT monitoring.run_checks('fast')"); mark('check_red');
  const r = await one(db, "SELECT status, value, ids FROM monitoring.results WHERE check_id='B-01'");
  assert.deepEqual([r.status, Number(r.value), r.ids], ['red', 1, ['recTEST0001']]);
  // 3. incident
  const inc = await one(db, "SELECT * FROM monitoring.incidents WHERE incident_key='B-01'");
  assert.equal(inc.state, 'new'); assert.equal(inc.severity, 'P1'); mark('incident');
  // 4. the DB wakes the routine (cron 'fire' every 5′): ids only
  assert.equal((await one(db, 'SELECT monitoring.fire_due() AS n')).n, 1);
  const fire = await one(db, 'SELECT body FROM net.mock_requests');
  assert.equal(fire.body.text, `tms-auditor due incidents: ${inc.id}`); mark('fired');
  // 5. p1 routine: push (one line < 200) + full e-mail; monitoring-only writes as tms_monitor_writer
  const p1 = await runP1(db, tr, 'sim-p1-1'); mark('notified');
  assert.equal(p1.sent, 1);
  assert.equal(tr.pushes.length, 1); assert.ok(tr.pushes[0].length < 200 && !tr.pushes[0].includes('\n'));
  assert.match(tr.pushes[0], /^🔴 P1 · B-01/);
  const mail = tr.emails.find((e) => e.subject.includes('B-01'));
  for (const k of ['Έκταση: 1 · ids recTEST0001', 'Επίπτωση:', 'Αποδεικτικά:', 'Βεβαιότητα:', 'Επόμενο:']) assert.ok(mail.body.includes(k), k);
  const notified = await one(db, "SELECT notified_at, notify_count FROM monitoring.incidents WHERE id=$1", [inc.id]);
  assert.ok(notified.notified_at); assert.equal(notified.notify_count, 2, 'push + e-mail recorded');
  assert.equal((await one(db, "SELECT last_run FROM monitoring.heartbeat WHERE source='routine-p1'")).last_run, 'sim-p1-1');
  // 6. nothing new ⇒ the next wake-up/run sends nothing (dedupe)
  const tr2 = memoryTransport(); await db.query("SELECT monitoring.run_checks('fast')");
  assert.equal((await runP1(db, tr2, 'sim-p1-2')).sent, 0); assert.equal(tr2.pushes.filter((p) => p.includes('B-01')).length, 0);
  // 7. digest 17:00: package → diagnosis (mock provider in the chain; the real Claude answer is tested below)
  const dg = await runDigest(db, tr, { provider: 'mock' }); mark('diagnosed');
  assert.equal(dg.results[0].valid, true, JSON.stringify(dg.results));
  assert.ok((await one(db, 'SELECT diagnosis FROM monitoring.incidents WHERE id=$1', [inc.id])).diagnosis.category);
  assert.ok(tr.emails.some((e) => e.subject === 'Σύνοψη TMS 17:00' && e.body.includes('Τελευταίος ΠΛΗΡΗΣ έλεγχος')));
  // 8. the data is fixed (by a human in the app — here synthetically) ⇒ next check green ⇒ resolved
  await roundTripFor(db, a);
  await db.query("SELECT monitoring.run_checks('fast')"); mark('resolved');
  const fin = await one(db, 'SELECT state, resolved_verified_at FROM monitoring.incidents WHERE id=$1', [inc.id]);
  assert.equal(fin.state, 'resolved'); assert.ok(fin.resolved_verified_at);

  fs.mkdirSync(`${HERE}../out`, { recursive: true });
  fs.writeFileSync(`${HERE}../out/notifications.log`, [
    `# local chain ${new Date().toISOString()} — step timings (ms since event, in-process; NOT production latency): ${JSON.stringify(t)}`,
    ...tr.pushes.map((p) => `PUSH  ${p}`), ...tr.emails.map((e) => `EMAIL ${e.subject}\n${e.body}\n`)].join('\n'));
});

test('the REAL Claude answer (isolated session, fixture) passes the validator on the package it saw', () => {
  const text = fs.readFileSync(`${HERE}fixtures/claude-routine-B-01.txt`, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(`${HERE}fixtures/package-B-01.json`, 'utf8'));
  const { report, err } = extractReport(text);
  assert.equal(err, null);
  const v = validateReport(report, pkg);
  assert.deepEqual(v.errs, []);
  assert.equal(report.category, 'ΑΝΕΠΑΡΚΗ ΣΤΟΙΧΕΙΑ');
});

test('the same answer against a DIFFERENT package is rejected (its 22:43 is not in that package)', async () => {
  const text = fs.readFileSync(`${HERE}fixtures/claude-routine-B-01.txt`, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(`${HERE}fixtures/package-B-01.json`, 'utf8'));
  pkg.times_athens = ['23/09 06:15'];
  const d = await diagnose(pkg, { provider: 'claude-routine', routineText: text });
  assert.equal(d.valid, false); assert.ok(d.errs.some((e) => e.includes('22:43')));
});

test('anthropic-api provider is a stub by decision (no paid API, Worker key not used)', async () => {
  const pkg = JSON.parse(fs.readFileSync(`${HERE}fixtures/package-B-01.json`, 'utf8'));
  const d = await diagnose(pkg, { provider: 'anthropic-api' });
  assert.equal(d.valid, false); assert.match(d.errs[0], /NOT CONFIGURED/);
});

test('watchdog: p1 routine silent > 75′ ⇒ «ο ελεγκτής σιώπησε» push + e-mail; p1 reports a dead watchdog', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  for (const tag of ['fast', 'half', 'hourly', 'daily', 'weekly']) await db.query('SELECT monitoring.run_checks($1)', [tag]);
  await db.query("SELECT monitoring.beat('routine-p1','old','x')");
  await db.query("UPDATE monitoring.heartbeat SET last_beat = now() - interval '2 hours' WHERE source='routine-p1'");
  const tr = memoryTransport();
  await runWatchdog(db, tr);
  assert.ok(tr.pushes.some((p) => p.startsWith('⚫ Ο ελεγκτής σιώπησε') && p.includes('routine-p1')), JSON.stringify(tr.pushes));
  await db.query("UPDATE monitoring.heartbeat SET last_beat = now() - interval '3 hours' WHERE source='routine-watchdog'");
  const tr2 = memoryTransport(); await runP1(db, tr2);
  assert.ok(tr2.pushes.some((p) => p.includes('routine-watchdog')), 'the p1 routine reports a dead watchdog (mutual watch)');
});

test('storm: more than 3 due ⇒ ONE push listing the count, full list by e-mail, all recorded', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  for (const k of ['S1', 'S2', 'S3', 'S4', 'S5']) await db.query("SELECT monitoring.raise_incident($1,'MECH','MECH',NULL,'x')", ['MECH:test:' + k]);
  const tr = memoryTransport(); const out = await runP1(db, tr);
  assert.equal(out.storm, true);
  assert.equal(tr.pushes.filter((p) => p.includes('περιστατικά P1/MECH')).length, 1);
  assert.equal((await all(db, 'SELECT * FROM monitoring.v_alerts_due')).length, 0, 'all 5 marked notified');
});

test('push not delivered (no Remote Control) ⇒ e-mail still carries it; both lost ⇒ it stays due', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  await db.query("SELECT monitoring.beat('routine-watchdog','sim','alive')");
  await assignedOrder(db, { minutesAgo: 30 }); await db.query("SELECT monitoring.run_checks('fast')");
  await runP1(db, memoryTransport({ pushFails: true }));
  assert.equal((await all(db, 'SELECT * FROM monitoring.v_alerts_due')).length, 0, 'e-mail sent ⇒ notified');
  const db2 = await freshDb(); await onlyChecks(db2, ['B-01']);
  await db2.query("SELECT monitoring.beat('routine-watchdog','sim','alive')");
  await assignedOrder(db2, { minutesAgo: 30 }); await db2.query("SELECT monitoring.run_checks('fast')");
  await runP1(db2, memoryTransport({ pushFails: true, emailFails: true }));
  assert.equal((await all(db2, 'SELECT * FROM monitoring.v_alerts_due')).length, 1, 'nothing delivered ⇒ still due (never marked)');
  assert.equal((await one(db2, "SELECT count(*)::int n FROM monitoring.notifications WHERE status='failed'")).n, 2, 'failures are recorded');
});

test('B2: the package carries the code (excerpts around graph pointers); the token cap is enforced', async () => {
  const { enrich } = await import('../investigate/package.mjs');
  const { fitToBudget, LIMITS, estimateTokens, brief } = await import('../investigate/diagnose.mjs');
  const base = JSON.parse(fs.readFileSync(`${HERE}fixtures/package-B-01.json`, 'utf8'));
  const pkg = enrich({ ...base, code_pointers: undefined, code_excerpts: undefined });
  const e033 = pkg.code_excerpts.filter((e) => e.file === 'worker/migrations/033_rt_create_related.sql');
  assert.ok(e033.some((e) => e.text.includes('\n229: ') && e.text.includes('\n107: ')), 'the pointed lines (229, and 107 inside the range 83-228) are in the package, with numbers');
  assert.ok(estimateTokens(brief(pkg)) <= LIMITS.max_tokens_in, 'the real B-01 brief fits in one turn under the cap');
  // oversized: 10 fat excerpts ⇒ trimmed from the end WITH a marker, never silently
  const fat = { ...pkg, code_excerpts: Array.from({ length: 10 }, (_, i) => ({ file: `f${i}.js`, from: 1, to: 2, text: 'x'.repeat(40000) })) };
  const f = fitToBudget(fat);
  assert.ok(f.fits && f.pkg.code_excerpts.length < 10);
  assert.match(f.pkg.code_excerpts_truncated, /^\[περικόπηκε: \d+ απόσπασμα/);
  // impossible even without excerpts ⇒ refused, nothing sent
  const huge = { ...pkg, code_excerpts: [], app_errors_window: [{ message: 'y'.repeat(400000) }] };
  const d = await diagnose(huge, { provider: 'mock' });
  assert.equal(d.valid, false); assert.match(d.errs[0], /δεν στάλθηκε/);
});
