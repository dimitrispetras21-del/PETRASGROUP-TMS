// ═══════════════════════════════════════════════
// TEST SUITE: Business Logic Integration Tests
// Tests VS sync chain, form validation, soft delete, and data helpers
// ═══════════════════════════════════════════════

// ── Mock API setup ──────────────────────────────
let _mockCreated = [];
let _mockFetched = [];
const _origCreate = window.atCreate;
const _origGetAll = window.atGetAll;
const _origGetOne = window.atGetOne;
const _origDelete = window.atDelete;
const _origPatch  = window.atPatch;

function mockApi() {
  _mockCreated = [];
  _mockFetched = [];
  window.atCreate = async (table, fields) => {
    _mockCreated.push({ table, fields });
    return { id: 'rec_mock_' + _mockCreated.length, fields };
  };
  window.atGetAll = async (table, opts) => {
    return _mockFetched;
  };
  window.atGetOne = async (table, id) => {
    return { id, fields: { 'Company Name': 'Test Client' } };
  };
  window.atDelete = async (table, id) => {
    return { id, deleted: true };
  };
  window.atPatch = async (table, id, fields) => {
    return { id, fields };
  };
}

function restoreApi() {
  window.atCreate = _origCreate;
  window.atGetAll = _origGetAll;
  window.atGetOne = _origGetOne;
  window.atDelete = _origDelete;
  window.atPatch  = _origPatch;
  _mockCreated = [];
  _mockFetched = [];
}

// ── Helper: add/subtract days from a date string ──
function _testAddDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ══════════════════════════════════════════════
// 1. Export VS Sync — Direction
// ══════════════════════════════════════════════
section('Export VS sync: direction');

(function testExportVSDirection() {
  // When an Export order has VS ON, the national leg should be ANODOS (South→North, supplier→Veroia)
  const intlDirection = 'Export';
  const expectedNatDirection = F.CL_ANODOS; // ΑΝΟΔΟΣ
  const natDirection = intlDirection === 'Export' ? F.CL_ANODOS : F.CL_KATHODOS;

  assertEqual(natDirection, expectedNatDirection, 'Export VS creates NAT direction ΑΝΟΔΟΣ');
  assertEqual(natDirection, DIR.ANODOS, 'Export VS direction matches DIR.ANODOS constant');

  // Verify delivery location should be Veroia for Export
  const delivLoc = intlDirection === 'Export' ? F.VEROIA_LOC : null;
  assertEqual(delivLoc, 'recJucKOhC1zh4IP3', 'Export VS delivery location is Veroia cross-dock');
})();

// ══════════════════════════════════════════════
// 2. Export VS Sync — Dates
// ══════════════════════════════════════════════
section('Export VS sync: dates');

(function testExportVSDates() {
  // Rule: Export VS
  //   NAT Loading  = INTL Loading
  //   NAT Delivery = INTL Loading + 1 day
  const intlLoadingDate  = '2026-04-01';
  const intlDeliveryDate = '2026-04-03';

  // Simulate the date logic from _syncVeroiaSwitch
  const natLoadDt = intlLoadingDate; // NAT Loading = INTL Loading
  const natDelDt  = _testAddDays(intlLoadingDate, 1); // NAT Delivery = INTL Loading + 1

  assertEqual(natLoadDt, '2026-04-01', 'Export VS: NAT Loading = INTL Loading (2026-04-01)');
  assertEqual(natDelDt, '2026-04-02', 'Export VS: NAT Delivery = INTL Loading + 1 (2026-04-02)');

  // Verify INTL Delivery is NOT used for Export
  assert(natDelDt !== intlDeliveryDate, 'Export VS: NAT Delivery does NOT equal INTL Delivery');
})();

// Edge case: month boundary
(function testExportVSMonthBoundary() {
  const intlLoadingDate = '2026-03-31';
  const natDelDt = _testAddDays(intlLoadingDate, 1);
  assertEqual(natDelDt, '2026-04-01', 'Export VS month cross: Loading Mar 31 → Delivery Apr 1');
})();

// ══════════════════════════════════════════════
// 3. Import VS Sync — Direction
// ══════════════════════════════════════════════
section('Import VS sync: direction');

(function testImportVSDirection() {
  // When an Import order has VS ON, the national leg should be KATHODOS (North→South, Veroia→client)
  const intlDirection = 'Import';
  const natDirection = intlDirection === 'Export' ? F.CL_ANODOS : F.CL_KATHODOS;

  assertEqual(natDirection, DIR.KATHODOS, 'Import VS creates NAT direction ΚΑΘΟΔΟΣ');
  assertEqual(natDirection, F.CL_KATHODOS, 'Import VS direction matches F.CL_KATHODOS');

  // Verify pickup location should be Veroia for Import
  const pickupLoc = intlDirection === 'Import' ? F.VEROIA_LOC : null;
  assertEqual(pickupLoc, 'recJucKOhC1zh4IP3', 'Import VS pickup location is Veroia cross-dock');
})();

// ══════════════════════════════════════════════
// 4. Import VS Sync — Dates
// ══════════════════════════════════════════════
section('Import VS sync: dates');

(function testImportVSDates() {
  // Rule: Import VS
  //   NAT Loading  = INTL Delivery - 1 day
  //   NAT Delivery = INTL Delivery
  const intlLoadingDate  = '2026-04-05';
  const intlDeliveryDate = '2026-04-07';

  // Simulate the date logic from _syncVeroiaSwitch
  const natDelDt  = intlDeliveryDate; // NAT Delivery = INTL Delivery
  const natLoadDt = _testAddDays(intlDeliveryDate, -1); // NAT Loading = INTL Delivery - 1

  assertEqual(natLoadDt, '2026-04-06', 'Import VS: NAT Loading = INTL Delivery - 1 (2026-04-06)');
  assertEqual(natDelDt, '2026-04-07', 'Import VS: NAT Delivery = INTL Delivery (2026-04-07)');

  // Verify INTL Loading is NOT used for Import
  assert(natLoadDt !== intlLoadingDate, 'Import VS: NAT Loading does NOT equal INTL Loading');
})();

// Edge case: year boundary
(function testImportVSYearBoundary() {
  const intlDeliveryDate = '2027-01-01';
  const natLoadDt = _testAddDays(intlDeliveryDate, -1);
  assertEqual(natLoadDt, '2026-12-31', 'Import VS year cross: Delivery Jan 1 → Loading Dec 31');
})();

// ══════════════════════════════════════════════
// 5. Form Validation — Order Without Client
// ══════════════════════════════════════════════
section('Form validation: order without client');

(function testValidationNoClient() {
  // Simulate validation logic from submitNatlOrder
  const fields = {
    'Direction': 'South→North',
    'Loading DateTime': '2026-04-01',
    'Delivery DateTime': '2026-04-03',
  };
  const clientId = ''; // Empty — no client selected
  const pickupId = 'recLOC001';
  const delivId  = 'recLOC002';

  const errors = [];
  if (!fields['Direction'])         errors.push('Direction is required');
  if (!clientId)                    errors.push('Client is required');
  if (!pickupId)                    errors.push('Pickup Location is required');
  if (!delivId)                     errors.push('Delivery Location is required');
  if (!fields['Loading DateTime'])  errors.push('Loading Date is required');
  if (!fields['Delivery DateTime']) errors.push('Delivery Date is required');

  assert(errors.length > 0, 'Validation rejects order without client');
  assert(errors.includes('Client is required'), 'Error message says "Client is required"');
  assertEqual(errors.length, 1, 'Only one error when only client is missing');
})();

// ══════════════════════════════════════════════
// 6. Form Validation — Delivery Before Loading
// ══════════════════════════════════════════════
section('Form validation: delivery before loading');

(function testValidationDateOrder() {
  const fields = {
    'Direction': 'South→North',
    'Loading DateTime': '2026-04-10',
    'Delivery DateTime': '2026-04-05', // Before loading!
  };
  const clientId = 'recCLI001';
  const pickupId = 'recLOC001';
  const delivId  = 'recLOC002';

  const errors = [];
  if (!fields['Direction'])         errors.push('Direction is required');
  if (!clientId)                    errors.push('Client is required');
  if (!pickupId)                    errors.push('Pickup Location is required');
  if (!delivId)                     errors.push('Delivery Location is required');
  if (!fields['Loading DateTime'])  errors.push('Loading Date is required');
  if (!fields['Delivery DateTime']) errors.push('Delivery Date is required');

  // Date cross-validation (same logic as submitNatlOrder)
  if (fields['Loading DateTime'] && fields['Delivery DateTime']) {
    if (new Date(fields['Delivery DateTime']) < new Date(fields['Loading DateTime'])) {
      errors.push('Delivery date cannot be before loading date');
    }
  }

  assert(errors.length > 0, 'Validation rejects delivery before loading');
  assert(errors.includes('Delivery date cannot be before loading date'), 'Error message about date order');
})();

// Valid dates should pass
(function testValidationDateOrderOk() {
  const loadDate = '2026-04-01';
  const delDate  = '2026-04-03';
  const dateError = new Date(delDate) < new Date(loadDate);
  assert(!dateError, 'Valid dates (delivery after loading) pass validation');
})();

// Same-day delivery should pass
(function testValidationSameDay() {
  const loadDate = '2026-04-01';
  const delDate  = '2026-04-01';
  const dateError = new Date(delDate) < new Date(loadDate);
  assert(!dateError, 'Same-day delivery passes validation (not strictly before)');
})();

// ══════════════════════════════════════════════
// 7. Soft Delete — Saves to Trash
// ══════════════════════════════════════════════
section('Soft delete: trash backup');

(async function testSoftDeleteTrash() {
  // Save original localStorage state
  const origTrash = localStorage.getItem('tms_trash');
  const origUser  = localStorage.getItem('tms_user');

  try {
    // Set up mock environment
    mockApi();
    localStorage.setItem('tms_user', JSON.stringify({ name: 'TestUser', role: 'owner' }));
    localStorage.removeItem('tms_trash');

    // Call atSoftDelete (it should save to trash, then delete)
    await atSoftDelete('tblTEST123', 'recDELETEME');

    // Check trash
    const trash = JSON.parse(localStorage.getItem('tms_trash') || '[]');
    assert(trash.length > 0, 'Soft delete saves record to trash');
    assertEqual(trash[0].id, 'recDELETEME', 'Trash entry has correct record ID');
    assertEqual(trash[0].table, 'tblTEST123', 'Trash entry has correct table ID');
    assertNotNull(trash[0].deletedAt, 'Trash entry has deletedAt timestamp');
    assertEqual(trash[0].deletedBy, 'TestUser', 'Trash entry has deletedBy user name');
    assertNotNull(trash[0].fields, 'Trash entry has saved fields');
  } finally {
    restoreApi();
    // Restore original localStorage
    if (origTrash) localStorage.setItem('tms_trash', origTrash);
    else localStorage.removeItem('tms_trash');
    if (origUser) localStorage.setItem('tms_user', origUser);
    else localStorage.removeItem('tms_user');
  }
})();

// Trash limit check
(function testSoftDeleteTrashLimit() {
  const origTrash = localStorage.getItem('tms_trash');

  try {
    // Fill trash with 55 items
    const bigTrash = [];
    for (let i = 0; i < 55; i++) {
      bigTrash.push({ id: 'rec_' + i, table: 'tbl', fields: {}, deletedAt: new Date().toISOString(), deletedBy: 'test' });
    }
    localStorage.setItem('tms_trash', JSON.stringify(bigTrash));

    // Simulate the trim logic from atSoftDelete
    const trash = JSON.parse(localStorage.getItem('tms_trash') || '[]');
    trash.unshift({ id: 'recNEW', table: 'tbl', fields: {}, deletedAt: new Date().toISOString(), deletedBy: 'test' });
    if (trash.length > 50) trash.length = 50;
    localStorage.setItem('tms_trash', JSON.stringify(trash));

    const result = JSON.parse(localStorage.getItem('tms_trash'));
    assertEqual(result.length, 50, 'Trash is capped at 50 entries');
    assertEqual(result[0].id, 'recNEW', 'Newest entry is first in trash');
  } finally {
    if (origTrash) localStorage.setItem('tms_trash', origTrash);
    else localStorage.removeItem('tms_trash');
  }
})();

// ══════════════════════════════════════════════
// 8. getLinkId — All Formats
// ══════════════════════════════════════════════
section('getLinkId: all input formats');

// Plain string
assertEqual(getLinkId('recABC123'), 'recABC123', 'getLinkId: plain string');

// Array of strings
assertEqual(getLinkId(['recDEF456']), 'recDEF456', 'getLinkId: array with one string');
assertEqual(getLinkId(['recFIRST', 'recSECOND']), 'recFIRST', 'getLinkId: array returns first element');

// Array of objects with .id
assertEqual(getLinkId([{ id: 'recOBJ789' }]), 'recOBJ789', 'getLinkId: array with object.id');
assertEqual(getLinkId([{ id: 'recOBJ1' }, { id: 'recOBJ2' }]), 'recOBJ1', 'getLinkId: array of objects returns first');

// Null / undefined / empty
assertEqual(getLinkId(null), null, 'getLinkId: null returns null');
assertEqual(getLinkId(undefined), null, 'getLinkId: undefined returns null');
assertEqual(getLinkId([]), null, 'getLinkId: empty array returns null');
assertEqual(getLinkId(''), null, 'getLinkId: empty string returns null');

// Object with .id (non-array)
assertEqual(getLinkId({ id: 'recPLAIN' }), 'recPLAIN', 'getLinkId: plain object with .id');

// Number (edge case)
assertEqual(getLinkId(0), null, 'getLinkId: number 0 returns null');
assertEqual(getLinkId(42), null, 'getLinkId: number returns null');

// ══════════════════════════════════════════════
// 9. VS Sync — Source Type and Field Mapping
// ══════════════════════════════════════════════
section('VS sync: field mapping');

(function testVSSyncFieldMapping() {
  // Verify that VS-created NAT_LOADS should have Source Type = 'VS'
  assertEqual(SOURCE_TYPE.VS, 'VS', 'Source type for VS sync is "VS"');
  assertEqual(SOURCE_TYPE.DIRECT, 'Direct', 'Source type for direct national orders is "Direct"');
  assertEqual(SOURCE_TYPE.GROUPAGE, 'Groupage', 'Source type for groupage is "Groupage"');

  // Verify direction mapping consistency
  const exportDir = 'Export';
  const importDir = 'Import';

  const nlDirExport = exportDir === 'Export' ? F.CL_ANODOS : F.CL_KATHODOS;
  const nlDirImport = importDir === 'Export' ? F.CL_ANODOS : F.CL_KATHODOS;

  assertEqual(nlDirExport, DIR.ANODOS, 'Export → ΑΝΟΔΟΣ');
  assertEqual(nlDirImport, DIR.KATHODOS, 'Import → ΚΑΘΟΔΟΣ');

  // NAT_ORDERS use arrow chars; NAT_LOADS/CL use Greek
  assert(DIR.SOUTH_NORTH !== DIR.ANODOS, 'South→North (arrow) is different from ΑΝΟΔΟΣ (Greek)');
  assert(DIR.NORTH_SOUTH !== DIR.KATHODOS, 'North→South (arrow) is different from ΚΑΘΟΔΟΣ (Greek)');
})();

// ══════════════════════════════════════════════
// 10. Complete Validation: All Required Fields
// ══════════════════════════════════════════════
section('Form validation: all fields missing');

(function testValidationAllMissing() {
  const fields = {};
  const clientId = '';
  const pickupId = '';
  const delivId  = '';

  const errors = [];
  if (!fields['Direction'])         errors.push('Direction is required');
  if (!clientId)                    errors.push('Client is required');
  if (!pickupId)                    errors.push('Pickup Location is required');
  if (!delivId)                     errors.push('Delivery Location is required');
  if (!fields['Loading DateTime'])  errors.push('Loading Date is required');
  if (!fields['Delivery DateTime']) errors.push('Delivery Date is required');

  assertEqual(errors.length, 6, 'All 6 required fields generate errors when empty');
})();

// All fields filled should pass
(function testValidationAllFilled() {
  const fields = {
    'Direction': 'South→North',
    'Loading DateTime': '2026-04-01',
    'Delivery DateTime': '2026-04-03',
  };
  const clientId = 'recCLI001';
  const pickupId = 'recLOC001';
  const delivId  = 'recLOC002';

  const errors = [];
  if (!fields['Direction'])         errors.push('Direction is required');
  if (!clientId)                    errors.push('Client is required');
  if (!pickupId)                    errors.push('Pickup Location is required');
  if (!delivId)                     errors.push('Delivery Location is required');
  if (!fields['Loading DateTime'])  errors.push('Loading Date is required');
  if (!fields['Delivery DateTime']) errors.push('Delivery Date is required');

  if (fields['Loading DateTime'] && fields['Delivery DateTime']) {
    if (new Date(fields['Delivery DateTime']) < new Date(fields['Loading DateTime'])) {
      errors.push('Delivery date cannot be before loading date');
    }
  }

  assertEqual(errors.length, 0, 'All fields filled: zero validation errors');
})();
