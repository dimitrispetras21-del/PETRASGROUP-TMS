// ═══════════════════════════════════════════════
// TEST SUITE: VS Sync Chain Logic
// ═══════════════════════════════════════════════
// Tests the Veroia Switch sync date calculations
// and direction mapping WITHOUT hitting Airtable.

// ── Helper: add/subtract days from a date string ──
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC to avoid DST issues
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ══════════════════════════════════════════════
// 1. Constants Validation
// ══════════════════════════════════════════════

section('Constants: DIR / STATUS / SOURCE_TYPE');

assertEqual(DIR.ANODOS, '\u0391\u039D\u039F\u0394\u039F\u03A3', 'DIR.ANODOS constant correct (Greek)');
assertEqual(DIR.KATHODOS, '\u039A\u0391\u0398\u039F\u0394\u039F\u03A3', 'DIR.KATHODOS constant correct (Greek)');
assertEqual(DIR.EXPORT, 'Export', 'DIR.EXPORT is English "Export"');
assertEqual(DIR.IMPORT, 'Import', 'DIR.IMPORT is English "Import"');
assertEqual(DIR.SOUTH_NORTH, 'South\u2192North', 'DIR.SOUTH_NORTH uses arrow char');
assertEqual(DIR.NORTH_SOUTH, 'North\u2192South', 'DIR.NORTH_SOUTH uses arrow char');

assertEqual(STATUS.PENDING, 'Pending', 'STATUS.PENDING correct');
assertEqual(STATUS.UNASSIGNED, 'Unassigned', 'STATUS.UNASSIGNED correct');
assertEqual(STATUS.ASSIGNED, 'Assigned', 'STATUS.ASSIGNED correct');
assertEqual(STATUS.DELIVERED, 'Delivered', 'STATUS.DELIVERED correct');

assertEqual(SOURCE_TYPE.VS, 'VS', 'SOURCE_TYPE.VS correct');
assertEqual(SOURCE_TYPE.DIRECT, 'Direct', 'SOURCE_TYPE.DIRECT correct');
assertEqual(SOURCE_TYPE.GROUPAGE, 'Groupage', 'SOURCE_TYPE.GROUPAGE correct');

// ── Tricky field names (F constants) ──
section('Tricky field names (F constants)');

assertEqual(F.WEEK_NUM, ' Week Number', 'F.WEEK_NUM has leading space');
assertEqual(F.VEROIA_SWITCH, 'Veroia Switch ', 'F.VEROIA_SWITCH has trailing space');
assertEqual(F.ADDRESS, 'Adress', 'F.ADDRESS is single-d "Adress"');
assertEqual(F.VEROIA_LOC, 'recJucKOhC1zh4IP3', 'F.VEROIA_LOC is correct record ID');
assertEqual(F.CL_KATHODOS, '\u039A\u0391\u0398\u039F\u0394\u039F\u03A3', 'F.CL_KATHODOS matches DIR.KATHODOS');
assertEqual(F.CL_ANODOS, '\u0391\u039D\u039F\u0394\u039F\u03A3', 'F.CL_ANODOS matches DIR.ANODOS');

// ══════════════════════════════════════════════
// 2. addDays helper (used by VS sync logic)
// ══════════════════════════════════════════════

section('addDays helper');

assertEqual(addDays('2026-04-01', 1), '2026-04-02', 'addDays: +1 day');
assertEqual(addDays('2026-04-01', -1), '2026-03-31', 'addDays: -1 day crosses month');
assertEqual(addDays('2026-12-31', 1), '2027-01-01', 'addDays: +1 day crosses year');
assertEqual(addDays('2026-02-28', 1), '2026-03-01', 'addDays: +1 day crosses Feb (non-leap)');
assertEqual(addDays('2026-04-01', 0), '2026-04-01', 'addDays: +0 days unchanged');
assertEqual(addDays('2026-04-01', 7), '2026-04-08', 'addDays: +7 days');

// ══════════════════════════════════════════════
// 3. Export VS Date Logic
// ══════════════════════════════════════════════
// Rule: Export VS (supplier -> Veroia = ANODOS)
//   NAT Loading  = INTL Loading
//   NAT Delivery = INTL Loading + 1 day

section('Export VS date logic');

(function testExportVS() {
  const intlOrder = {
    Direction: 'Export',
    'Loading DateTime': '2026-04-01',
    'Delivery DateTime': '2026-04-03',
  };

  // NAT Loading = INTL Loading
  const natLoading = intlOrder['Loading DateTime'];
  assertEqual(natLoading, '2026-04-01', 'Export VS: NAT Loading = INTL Loading');

  // NAT Delivery = INTL Loading + 1
  const natDelivery = addDays(intlOrder['Loading DateTime'], 1);
  assertEqual(natDelivery, '2026-04-02', 'Export VS: NAT Delivery = INTL Loading + 1');

  // Direction should be ANODOS (supplier -> Veroia)
  const natDirection = DIR.ANODOS;
  assertEqual(natDirection, '\u0391\u039D\u039F\u0394\u039F\u03A3', 'Export VS: direction is ANODOS');

  // Delivery Location should be Veroia
  const deliveryLoc = F.VEROIA_LOC;
  assertEqual(deliveryLoc, 'recJucKOhC1zh4IP3', 'Export VS: delivery location is Veroia');
})();

// Edge case: Export VS with Friday loading (weekend delivery)
(function testExportVSFriday() {
  const intlOrder = {
    Direction: 'Export',
    'Loading DateTime': '2026-04-03', // Friday
    'Delivery DateTime': '2026-04-05', // Sunday
  };

  const natDelivery = addDays(intlOrder['Loading DateTime'], 1);
  assertEqual(natDelivery, '2026-04-04', 'Export VS Friday: NAT Delivery = Saturday (Loading + 1)');
})();

// ══════════════════════════════════════════════
// 4. Import VS Date Logic
// ══════════════════════════════════════════════
// Rule: Import VS (Veroia -> client = KATHODOS)
//   NAT Loading  = INTL Delivery - 1 day
//   NAT Delivery = INTL Delivery

section('Import VS date logic');

(function testImportVS() {
  const intlOrder = {
    Direction: 'Import',
    'Loading DateTime': '2026-04-05',
    'Delivery DateTime': '2026-04-07',
  };

  // NAT Loading = INTL Delivery - 1
  const natLoading = addDays(intlOrder['Delivery DateTime'], -1);
  assertEqual(natLoading, '2026-04-06', 'Import VS: NAT Loading = INTL Delivery - 1');

  // NAT Delivery = INTL Delivery
  const natDelivery = intlOrder['Delivery DateTime'];
  assertEqual(natDelivery, '2026-04-07', 'Import VS: NAT Delivery = INTL Delivery');

  // Direction should be KATHODOS (Veroia -> client)
  const natDirection = DIR.KATHODOS;
  assertEqual(natDirection, '\u039A\u0391\u0398\u039F\u0394\u039F\u03A3', 'Import VS: direction is KATHODOS');

  // Loading Location should be Veroia
  const loadingLoc = F.VEROIA_LOC;
  assertEqual(loadingLoc, 'recJucKOhC1zh4IP3', 'Import VS: loading location is Veroia');
})();

// Edge case: Import VS crossing month boundary
(function testImportVSMonthCross() {
  const intlOrder = {
    Direction: 'Import',
    'Loading DateTime': '2026-03-29',
    'Delivery DateTime': '2026-04-01',
  };

  const natLoading = addDays(intlOrder['Delivery DateTime'], -1);
  assertEqual(natLoading, '2026-03-31', 'Import VS month cross: NAT Loading = March 31');
  assertEqual(intlOrder['Delivery DateTime'], '2026-04-01', 'Import VS month cross: NAT Delivery = April 1');
})();

// ══════════════════════════════════════════════
// 5. Direction Mapping Consistency
// ══════════════════════════════════════════════
// Export -> ANODOS (South->North), Import -> KATHODOS (North->South)

section('Direction mapping consistency');

// INTL direction -> NAT_LOADS direction mapping
const directionMap = {
  'Export': DIR.ANODOS,    // supplier -> Veroia
  'Import': DIR.KATHODOS,  // Veroia -> client
};

assertEqual(directionMap['Export'], DIR.ANODOS, 'Export maps to ANODOS');
assertEqual(directionMap['Import'], DIR.KATHODOS, 'Import maps to KATHODOS');

// CL (Consolidated Loads) direction uses same Greek values
assertEqual(F.CL_ANODOS, DIR.ANODOS, 'CL ANODOS matches DIR.ANODOS');
assertEqual(F.CL_KATHODOS, DIR.KATHODOS, 'CL KATHODOS matches DIR.KATHODOS');

// NAT_ORDERS direction uses arrow characters (different from CL/NAT_LOADS)
assert(DIR.SOUTH_NORTH !== DIR.ANODOS, 'SOUTH_NORTH (arrow) differs from ANODOS (Greek)');
assert(DIR.NORTH_SOUTH !== DIR.KATHODOS, 'NORTH_SOUTH (arrow) differs from KATHODOS (Greek)');

// ══════════════════════════════════════════════
// 6. Linked Record Format Validation
// ══════════════════════════════════════════════
// Airtable requires plain string arrays for linked records

section('Linked record format');

// Correct format: plain string array
const correctLink = ['recABC123'];
assert(Array.isArray(correctLink), 'Linked record is array');
assert(typeof correctLink[0] === 'string', 'Linked record element is string');

// Wrong format: object array (causes INVALID_RECORD_ID)
const wrongLink = [{ id: 'recABC123' }];
assert(typeof wrongLink[0] !== 'string', 'Object format is NOT plain string (would fail)');

// getLinkId should extract correctly from both formats
assertEqual(getLinkId(correctLink), 'recABC123', 'getLinkId: extracts from string array');
assertEqual(getLinkId(wrongLink), 'recABC123', 'getLinkId: extracts from object array');
assertEqual(getLinkId('recABC123'), 'recABC123', 'getLinkId: extracts from plain string');

// ══════════════════════════════════════════════
// 7. Status Flow Validation
// ══════════════════════════════════════════════

section('Status flow');

// GL records status flow
const glStatuses = [STATUS.UNASSIGNED, STATUS.ASSIGNED, STATUS.GROUPAGE_ASSIGNED];
assert(glStatuses.includes('Unassigned'), 'GL can be Unassigned');
assert(glStatuses.includes('Assigned'), 'GL can be Assigned');
assert(glStatuses.includes('Groupage Assigned'), 'GL can be Groupage Assigned');

// Order status flow
const orderFlow = [STATUS.PENDING, STATUS.CONFIRMED, STATUS.ASSIGNED, STATUS.IN_TRANSIT, STATUS.DELIVERED, STATUS.INVOICED, STATUS.CANCELLED];
assertEqual(orderFlow.length, 7, 'Order flow has 7 statuses');
assert(orderFlow.indexOf(STATUS.PENDING) < orderFlow.indexOf(STATUS.DELIVERED), 'Pending comes before Delivered');

// ══════════════════════════════════════════════
// 8. TABLES constant validation
// ══════════════════════════════════════════════

section('TABLES constants');

assertNotNull(TABLES.ORDERS, 'TABLES.ORDERS exists');
assertNotNull(TABLES.NAT_ORDERS, 'TABLES.NAT_ORDERS exists');
assertNotNull(TABLES.NAT_LOADS, 'TABLES.NAT_LOADS exists');
assertNotNull(TABLES.GL_LINES, 'TABLES.GL_LINES exists');
assertNotNull(TABLES.CONS_LOADS, 'TABLES.CONS_LOADS exists');
assertNotNull(TABLES.RAMP, 'TABLES.RAMP exists');
assertNotNull(TABLES.TRUCKS, 'TABLES.TRUCKS exists');
assertNotNull(TABLES.DRIVERS, 'TABLES.DRIVERS exists');

// All table IDs should start with 'tbl'
Object.entries(TABLES).forEach(([name, id]) => {
  assert(id.startsWith('tbl'), `TABLES.${name} starts with "tbl": ${id}`);
});
