// ═══════════════════════════════════════════════
// TEST SUITE: Core Utilities (core/utils.js)
// ═══════════════════════════════════════════════

section('escapeHtml');

assertEqual(escapeHtml('<script>'), '&lt;script&gt;', 'escapeHtml: script tag');
assertEqual(escapeHtml(null), '', 'escapeHtml: null returns empty');
assertEqual(escapeHtml(undefined), '', 'escapeHtml: undefined returns empty');
assertEqual(escapeHtml('hello'), 'hello', 'escapeHtml: plain text unchanged');
assertEqual(escapeHtml('"quotes"'), '&quot;quotes&quot;', 'escapeHtml: double quotes');
assertEqual(escapeHtml("it's"), "it&#39;s", 'escapeHtml: single quotes');
assertEqual(escapeHtml('a & b'), 'a &amp; b', 'escapeHtml: ampersand');
assertEqual(escapeHtml('<img onerror="alert(1)">'), '&lt;img onerror=&quot;alert(1)&quot;&gt;', 'escapeHtml: XSS payload');
assertEqual(escapeHtml(''), '', 'escapeHtml: empty string');
assertEqual(escapeHtml(0), '0', 'escapeHtml: number 0 coerced to string');

// ── toLocalDate ──
section('toLocalDate');

assert(typeof toLocalDate === 'function', 'toLocalDate exists');
assertEqual(toLocalDate(null), '', 'toLocalDate: null returns empty');
assertEqual(toLocalDate(''), '', 'toLocalDate: empty string returns empty');
assertEqual(toLocalDate('not-a-date'), '', 'toLocalDate: invalid date returns empty');

// Known fixed date (no timezone ambiguity -- use noon UTC)
const knownDate = '2026-03-15T12:00:00.000Z';
const localResult = toLocalDate(knownDate);
assertEqual(localResult.length, 10, 'toLocalDate: returns YYYY-MM-DD format (10 chars)');
assert(/^\d{4}-\d{2}-\d{2}$/.test(localResult), 'toLocalDate: matches YYYY-MM-DD regex');

// ── localToday ──
section('localToday');

const today = localToday();
assertEqual(today.length, 10, 'localToday: returns YYYY-MM-DD (10 chars)');
assert(/^\d{4}-\d{2}-\d{2}$/.test(today), 'localToday: matches YYYY-MM-DD regex');
assert(today.startsWith('202'), 'localToday: starts with current decade');

// ── localTomorrow ──
section('localTomorrow');

const tmrw = localTomorrow();
assertEqual(tmrw.length, 10, 'localTomorrow: returns YYYY-MM-DD (10 chars)');
assert(/^\d{4}-\d{2}-\d{2}$/.test(tmrw), 'localTomorrow: matches YYYY-MM-DD regex');
// Tomorrow should be after today
assert(tmrw > today, 'localTomorrow: is after localToday');

// ── currentWeekNumber ──
section('currentWeekNumber');

const wn = currentWeekNumber();
assert(typeof wn === 'number', 'currentWeekNumber: returns a number');
assert(wn > 0 && wn <= 53, 'currentWeekNumber: value in 1-53 range');

// ── formatDate ──
section('formatDate');

assertEqual(formatDate(null), '\u2014', 'formatDate: null returns dash');
assertEqual(formatDate(''), '\u2014', 'formatDate: empty returns dash');
assert(typeof formatDate('2026-03-15') === 'string', 'formatDate: returns string for valid date');

// ── formatCurrency ──
section('formatCurrency');

assertEqual(formatCurrency(null), '\u2014', 'formatCurrency: null returns dash');
assertEqual(formatCurrency(''), '\u2014', 'formatCurrency: empty returns dash');
assert(formatCurrency(1000).includes('1'), 'formatCurrency: includes digit for 1000');
assert(formatCurrency(1000).includes('\u20AC'), 'formatCurrency: default currency is euro');
assert(formatCurrency(50, '$').includes('$'), 'formatCurrency: custom currency symbol');

// ── getLinkId ──
section('getLinkId');

assertEqual(getLinkId(null), null, 'getLinkId: null returns null');
assertEqual(getLinkId('recABC123'), 'recABC123', 'getLinkId: plain string returned as-is');
assertEqual(getLinkId(['recABC123']), 'recABC123', 'getLinkId: array with string');
assertEqual(getLinkId([{ id: 'recXYZ' }]), 'recXYZ', 'getLinkId: array with object.id');
assertEqual(getLinkId([]), null, 'getLinkId: empty array returns null');
assertEqual(getLinkId({ id: 'recDEF' }), 'recDEF', 'getLinkId: plain object with id');

// ── fmtDate / fmtDateDM ──
section('fmtDate / fmtDateDM');

assertEqual(fmtDate(null), '\u2014', 'fmtDate: null returns dash');
assertEqual(fmtDate('2026-03-15'), '15/03/2026', 'fmtDate: formats YYYY-MM-DD to DD/MM/YYYY');
assertEqual(fmtDate('2026-12-01T10:00:00Z'), '01/12/2026', 'fmtDate: handles ISO datetime');

assertEqual(fmtDateDM(null), '\u2014', 'fmtDateDM: null returns dash');
assertEqual(fmtDateDM('2026-03-15'), '15/03', 'fmtDateDM: formats to DD/MM');

// ── debounce ──
section('debounce');

assert(typeof debounce === 'function', 'debounce: function exists');
assert(typeof debounce(() => {}) === 'function', 'debounce: returns a function');

// ── expiryClass ──
section('expiryClass');

assertEqual(expiryClass(null), '', 'expiryClass: null returns empty');
assertEqual(expiryClass(''), '', 'expiryClass: empty returns empty');
// Far future date should be OK
assertEqual(expiryClass('2099-12-31'), 'expiry-ok', 'expiryClass: far future is ok');
// Past date should be alert
assertEqual(expiryClass('2020-01-01'), 'expiry-alert', 'expiryClass: past date is alert');
