// Local stand-in for the three Claude Code cloud routines (tms-auditor-p1 / -watchdog / -digest).
// It performs EXACTLY the steps their prompts describe (routines/*.md), against PGlite, AS THE NARROW ROLE
// tms_monitor_writer (SET ROLE), with push/e-mail replaced by a transport that records to memory/files.
// What this proves: the DB side + the routine logic + the narrow privileges work together. What it does NOT
// prove: that a real cloud routine runs, that PushNotification reaches the phone, that Gmail delivers.
import { diagnose } from '../investigate/diagnose.mjs';
import { enrich } from '../investigate/package.mjs';

export const PUSH_MAX_CHARS = 200;                    // PushNotification tool contract: < 200 chars, one line

export function memoryTransport({ pushFails = false, emailFails = false } = {}) {
  const t = { pushes: [], emails: [] };
  t.push = async (msg) => {
    if (msg.includes('\n') || msg.length >= PUSH_MAX_CHARS) throw new Error(`push violates contract (${msg.length} chars / newline)`);
    if (pushFails) return { sent: false, why: 'not sent (no Remote Control / redundant)' };   // tool may say "not sent"
    t.pushes.push(msg); return { sent: true };
  };
  t.email = async (subject, body) => { if (emailFails) return { sent: false, why: 'gmail error' }; t.emails.push({ subject, body }); return { sent: true }; };
  return t;
}

const clip = (s) => (s.length < PUSH_MAX_CHARS ? s : s.slice(0, PUSH_MAX_CHARS - 2) + '…');   // truncation is marked, never silent
const oneLine = (body) => { const [first, second = ''] = body.split('\n'); return clip(`${first} · ${second.replace(/^Έκταση:\s*/, '')}`); };

async function asWriter(db, fn) {
  await db.exec('SET ROLE tms_monitor_writer');
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
const rows = async (db, sql, p) => (await db.query(sql, p)).rows;

async function record(db, incidentId, kind, channel, body, res, run) {
  await db.query('SELECT monitoring.record_notification($1,$2,$3,$4,$5,$6,$7)',
    [incidentId, kind, channel, body, res.sent ? 'sent' : 'failed', run, res.sent ? null : res.why || 'failed']);
}

// ---------------------------------------------------------------- p1 (hourly + woken by /fire)
export async function runP1(db, transport, run = 'sim-p1') {
  return asWriter(db, async () => {
    const [{ max }] = await rows(db, "SELECT value::int AS max FROM monitoring.limits WHERE name='push_max_per_run'");
    const due = await rows(db, 'SELECT id, incident_key, severity, body FROM monitoring.v_alerts_due');
    const dueKeys = new Set(due.map((d) => d.incident_key));
    const health = (await rows(db, 'SELECT problem, severity, detail FROM monitoring.v_health'))
      .filter((h) => h.problem !== 'routine:routine-p1')                                   // I am alive: I am running
      .filter((h) => !dueKeys.has(h.problem.replace(/^(incident|undelivered):/, '')));     // already an alert below
    const out = { due: due.length, health: health.length, sent: 0, storm: false };

    if (due.length > max) {                                                                // storm: ONE message, never silence
      out.storm = true;
      const body = due.map((d) => d.body).join('\n\n');
      const p = await transport.push(`🔴 ${due.length} περιστατικά P1/MECH — πλήρης λίστα στο email`);
      const e = await transport.email(`TMS: ${due.length} περιστατικά`, body);
      for (const d of due) await record(db, d.id, 'storm', 'email-routine', d.body, e, run);
      await record(db, null, 'storm', 'push-routine', `storm ${due.length}`, p, run);
      out.sent = due.length;
    } else {
      for (const d of due) {
        const p = await transport.push(oneLine(d.body));
        const e = await transport.email(`TMS ${d.severity} ${d.incident_key}`, d.body);
        await record(db, d.id, 'alert', 'push-routine', oneLine(d.body), p, run);
        await record(db, d.id, 'alert', 'email-routine', d.body, e, run);                 // e-mail = the sure channel
        if (p.sent || e.sent) out.sent++;
      }
    }
    for (const h of health) {                                                              // «no data» = RED, pushed
      const msg = `⚫ ΜΗΧΑΝΙΣΜΟΣ: ${h.detail}`;
      const p = await transport.push(clip(msg));
      const e = await transport.email('TMS: μηχανισμός', msg);
      await record(db, null, 'alert', 'email-routine', msg, e, run);
      if (!p.sent && !e.sent) out.lost = (out.lost || 0) + 1;
    }
    await db.query('SELECT monitoring.beat($1,$2,$3)', ['routine-p1', run, `due ${out.due} health ${out.health}`]);
    return out;
  });
}

// ---------------------------------------------------------------- watchdog (hourly, +30′)
export async function runWatchdog(db, transport, run = 'sim-watchdog') {
  return asWriter(db, async () => {
    const health = (await rows(db, 'SELECT problem, detail FROM monitoring.v_health'))
      .filter((h) => h.problem !== 'routine:routine-watchdog')
      .filter((h) => /^(cron|routine|undelivered):/.test(h.problem));                    // what p1 cannot say about itself
    for (const h of health) {
      const msg = `⚫ Ο ελεγκτής σιώπησε: ${h.detail}`;
      await transport.push(clip(msg));
      const e = await transport.email('TMS: ο ελεγκτής σιώπησε', msg);
      await record(db, null, 'alert', 'email-routine', msg, e, run);
    }
    await db.query('SELECT monitoring.beat($1,$2,$3)', ['routine-watchdog', run, `problems ${health.length}`]);
    return { problems: health.length };
  });
}

// ---------------------------------------------------------------- digest (17:00): diagnosis + e-mail
export async function runDigest(db, transport, { provider = 'mock', routineTexts = {}, run = 'sim-digest' } = {}) {
  return asWriter(db, async () => {
    const [{ lim }] = await rows(db, "SELECT value::int AS lim FROM monitoring.limits WHERE name='investigations_per_day'");
    const open = await rows(db, `SELECT id, incident_key, severity FROM monitoring.incidents
       WHERE state IN ('new','confirmed','recurred') AND diagnosis IS NULL
       ORDER BY CASE severity WHEN 'MECH' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, first_seen`);
    const results = [];
    for (const [n, inc] of open.entries()) {
      if (n >= lim) { results.push({ key: inc.incident_key, valid: false, errs: [`ΕΚΚΡΕΜΕΙ — όριο ημέρας (${lim})`] }); continue; }
      const [{ pkg }] = await rows(db, 'SELECT monitoring.build_package($1) AS pkg', [inc.id]);
      const d = await diagnose(enrich(pkg), { provider, usedToday: n, routineText: routineTexts[inc.incident_key] });
      if (d.valid) await db.query('SELECT monitoring.record_diagnosis($1,$2)', [inc.id, JSON.stringify(d.report)]);
      results.push({ key: inc.incident_key, valid: d.valid, category: d.report?.category, errs: d.errs });
    }
    const [{ text }] = await rows(db, 'SELECT monitoring.digest() AS text');
    const body = text + (results.length ? '\n\nΔιαγνώσεις:\n' + results.map((r) =>
      `• ${r.key}: ${r.valid ? r.category : 'χωρίς διάγνωση — ' + (r.errs[0] || 'απορρίφθηκε')}`).join('\n') : '');
    const e = await transport.email('Σύνοψη TMS 17:00', body);
    const p = await transport.push(clip(`Σύνοψη TMS: ${open.length} ανοιχτά περιστατικά — λεπτομέρειες στο email`));
    await record(db, null, 'digest', 'email-routine', body, e, run);
    await record(db, null, 'digest', 'push-routine', 'digest push', p, run);
    await db.query('SELECT monitoring.beat($1,$2,$3)', ['routine-digest', run, `diagnosed ${results.filter((r) => r.valid).length}/${results.length}`]);
    return { open: open.length, results, body };
  });
}
