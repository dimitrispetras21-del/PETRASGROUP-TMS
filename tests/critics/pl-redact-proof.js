// Proof rig — P&L redaction on the partner card (4/10/2026, ledger A7 / SA-11).
// Worker branch deploy/worker-pl-redact strips Client Revenue / Gross Profit /
// Margin Percent from PARTNER ASSIGNMENTS for every role outside
// owner/management/accountant. This rig serves PA records the way that Worker
// will: WITHOUT the P&L labels for a dispatcher, WITH them for the owner, then
// OPENS the partner history block (core/entity.js _renderPartnerAssignments)
// and reads what is rendered. The dispatcher must see no Revenue/Margin at all
// — not «€0», not «Avg Margin 0.0%» (facade trap #2: absent shown as measured).
// Read-only screen: the rig also asserts that nothing is written.
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/pl-redact-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const PA = 'tblUhgqnmiam5MGNK';
const PARTNER = 'recPartner00001A';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

function paRecords(withPL) {
  const base = [
    { id: 'recPA0000000001A', fields: { Partner: [PARTNER], Order: ['recOrder000001AA'], 'Partner Rate': 900, Status: 'Delivered', 'Assignment Date': '2026-10-01' } },
    { id: 'recPA0000000002A', fields: { Partner: [PARTNER], 'Nat Load': ['recNatLoad0001AA'], 'Partner Rate': 400, Status: 'Assigned', 'Assignment Date': '2026-10-03' } },
  ];
  if (withPL) {
    Object.assign(base[0].fields, { 'Client Revenue': 1500, 'Gross Profit': 600, 'Margin Percent': 40 });
    Object.assign(base[1].fields, { 'Client Revenue': 450, 'Gross Profit': 50, 'Margin Percent': 11.1 });
  }
  return base;
}

async function openCard(browser, role, withPL) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const S = { writes: [], errors: [] };
  page.on('pageerror', e => S.errors.push(String(e)));
  await preparePage(page, role);
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, route => {
    const req = route.request();
    if (req.method() !== 'GET') { S.writes.push(req.method() + ' ' + req.url()); return json(route, { ok: true }); }
    const mm = new URL(req.url()).pathname.match(/\/v0\/[^/]+\/(tbl[A-Za-z0-9]+)$/);
    return json(route, { records: mm && mm[1] === PA ? paRecords(withPL) : [] });
  });
  await gotoPage(page, 'partners', BASE);
  await page.waitForFunction(() => typeof _loadEntityHistory === 'function', null, { timeout: 60000 });
  const html = await page.evaluate(async (pid) => {
    const d = document.createElement('div'); d.id = 'entity_history_' + pid; document.body.appendChild(d);
    await _loadEntityHistory('partner', pid, 'Test Partner');
    return { text: d.innerText, ths: [...d.querySelectorAll('th')].map(t => t.innerText.trim()), firstRow: [...(d.querySelector('tbody tr') || { children: [] }).children].map(td => td.innerText.trim()) };
  }, PARTNER);
  await ctx.close();
  return { html, S };
}

(async () => {
  const browser = await chromium.launch();

  console.log('\n── dispatcher · Worker serves PA WITHOUT Client Revenue / Margin Percent');
  let { html, S } = await openCard(browser, 'dispatcher', false);
  ok(/2 assignments/.test(html.text), 'the partner card opens with its 2 assignments');
  ok(html.ths.join('|').toUpperCase() === 'DATE|TYPE|RATE|STATUS', 'table headers: ' + html.ths.join('|'));
  ok(!/margin/i.test(html.text) && !/revenue/i.test(html.text), 'no «Margin» / «Revenue» anywhere on the card');
  ok(!/0\.0%/.test(html.text) && !/€0\b/.test(html.text), 'no fake «0.0%» / «€0» from an absent field');
  ok(/€900/.test(html.text) && /Avg Rate/i.test(html.text), 'Partner Rate (needed to assign) still shown: €900, Avg Rate');
  ok(S.writes.length === 0, 'nothing written (' + S.writes.length + ' writes)');
  ok(S.errors.length === 0, 'no page errors' + (S.errors.length ? ': ' + S.errors[0] : ''));

  console.log('\n── owner · Worker serves PA WITH the P&L labels');
  ({ html, S } = await openCard(browser, 'owner', true));
  ok(html.ths.join('|').toUpperCase() === 'DATE|TYPE|RATE|REVENUE|MARGIN|STATUS', 'table headers: ' + html.ths.join('|'));
  ok(/Avg Margin/i.test(html.text) && /25\.6%/.test(html.text), 'Avg Margin card = 25.6% (40 and 11.1)');
  ok(html.firstRow.includes('€450') && html.firstRow.includes('11.1%'), 'newest row shows revenue €450 and margin 11.1%: ' + html.firstRow.join(' | '));
  ok(S.writes.length === 0, 'nothing written (' + S.writes.length + ' writes)');
  ok(S.errors.length === 0, 'no page errors' + (S.errors.length ? ': ' + S.errors[0] : ''));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
