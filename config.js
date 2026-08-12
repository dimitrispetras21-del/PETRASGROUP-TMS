// ═══════════════════════════════════════════════
// PETRAS GROUP TMS — CONFIG
// ═══════════════════════════════════════════════

const AT_BASE  = 'appElT5CQV6JQvym8';

// ── API Mode ──
// C2 CUTOVER 2026-07-28: USE_PROXY=true and PROXY_URL now points at Worker 2
// (petras-tms-backend, the Stage 2 Supabase backend), NOT the old Worker 1
// Airtable pass-through. The browser no longer talks to Airtable at all.
// ⚠️ index.html carries an independent copy of these two lines (the login page
// does not load config.js); both copies MUST stay in lockstep (F-E4).
// Rollback: set both copies back to false + bump SW_VERSION (see
// .reference/ops__c2-cutover-runbook.md in the ops repo).
const USE_PROXY  = true;
const PROXY_URL  = 'https://petras-tms-backend-staging.petrasgroup.workers.dev';

// ── Sentry DSN (error monitoring) ──
// ⚠️ EMPTY = THE APP HAS NO PRODUCTION ERROR REPORTING. Every error goes to the
// browser console and a 200-entry localStorage log, both of which nobody is
// watching. Filling this in is the single change that turns "nobody knew it
// broke" into "we were told". Free tier covers this app's volume many times over.
//
// Get a DSN at https://sentry.io, then paste it here. Nothing else is needed:
// both init paths (app.html's primary one and core/utils.js's fallback for the
// login/print pages) read THIS value, and logError() forwards automatically.
//
// Wiring note (fixed 2026-07-27): core/utils.js used to read a different name,
// `window.SENTRY_DSN`, which was never set anywhere, so that path was dead even
// when this value was filled in. Both now read TMS_SENTRY_DSN. If you add a
// third place that needs the DSN, read it from here rather than introducing
// another name; that mismatch is exactly what silently disabled reporting.
//
// Remember to bump this file's ?v= tag in app.html AND SW_VERSION in sw.js when
// you set it, or cached clients will keep the empty value and stay dark.
const TMS_SENTRY_DSN = '';

// Direct mode credentials: STRIPPED 2026-07-28 (post-C2). The app talks only to
// the Worker now, so no browser code needs a raw key. The consts stay declared
// (empty) so direct-mode code paths parse; direct mode itself is rollback-only.
// A rollback needing a live token restores it from a secure channel, NEVER by
// reverting this commit: the old PAT is scheduled for revocation and the old
// Anthropic key is already revoked (2026-07-21). Local browsing uses the
// gitignored config.local.js override with a READ-ONLY token, as before.
const AT_TOKEN = '';
const ANTH_KEY = '';

const TABLES = {
  TRIPS:         'tblgoyV26PBc6L9uE',
  ORDERS:        'tblgHlNmLBH3JTdIM',
  TRIP_COSTS:    'tblWUus6uSpqE1LMW',
  TRUCKS:        'tblEAPExIAjiA3asD',
  TRAILERS:      'tblDcrqRJXzPrtYLm',
  DRIVERS:       'tbl7UGmYhc2Y82pPs',
  DRIVER_LEDGER: 'tblZVr4BCr9sGFf8n',
  FUEL:          'tblxRFsMeVhlLrBjF',
  NAT_TRIPS:     'tbloI9yAxxyOJpMyr',
  NAT_ORDERS:    'tblGHCCsTMqAy4KR2',
  CLIENTS:       'tblFWKAQVUzAM8mCE',
  PARTNERS:      'tblLHl5m8bqONfhWv',
  LOCATIONS:     'tblxu8DRfTQOFRCzS',
  RAMP:          'tblT8W5WcuToBQNiY',
  GL_LINES:      'tblxUAaIsUMEDl3qQ',
  CONS_LOADS:    'tbl5XSLQjOnG6yLCW',
  WORKSHOPS:     'tblMiFxbm9ky8PCQi',
  MAINT_HISTORY: 'tbllPbPPd6N3zEZF1',
  MAINT_REQ:     'tbl3vhUmzKDWhJynR',
  NAT_LOADS:     'tblVW42cZnfC47gTb',
  // Τοπικές κινήσεις — γεννήθηκε στη Supabase, χωρίς Airtable προέλευση,
  // γι' αυτό το id είναι το pg name. Χάρτης: worker/src/index.js
  // Απαιτεί db/migrations/2026-08-10_local_moves.sql
  LOCAL_MOVES:   'local_moves',
  PALLET_LEDGER: 'tblAAH3N1bIcBRPXi',           // DEPRECATED alias
  PALLET_LEDGER_SUPPLIERS: 'tblAAH3N1bIcBRPXi', // renamed from PALLET LEDGER
  PALLET_LEDGER_PARTNERS:  'tblAUixdjwpgnJ1hK', // new: partner exchanges only
  ORDER_STOPS:   'tblaeY5QOHAS1gyE8',
  RAMP_EVENTS:   'tbllHu40WSq4yWg5S',
  PARTNER_ASSIGN:'tblUhgqnmiam5MGNK',
  SCAN_TRAINING:'tblScanTraining000',
  METRICS_SNAPSHOTS: 'tblakFiR37kf4uQXy',
  // SCAN_TRAINING: optional. Create the table manually in Airtable with these
  // fields (Doc Type single-select, Summary text, Client linked to CLIENTS,
  // AI Output long text, Corrected long text, Created date) and paste its
  // table id below. Leave blank to use localStorage-only mode.
  SCAN_TRAINING: '',
};

// ── Claude model IDs ───────────────────────────────────────────────────
// Single source of truth for every Anthropic API call (scan, AI chat, pallet
// OCR). Centralised here so a model deprecation is a one-line change, not a
// grep across core/ + modules/. Verify against the live deprecation list
// before changing: https://platform.claude.com/docs/en/docs/about-claude/model-deprecations
// History: claude-sonnet-4-20250514 retired 2026-06-15 → claude-sonnet-4-6.
//          claude-haiku-4-20250514 was never a valid ID → claude-haiku-4-5-20251001.
const MODELS = {
  OPUS:   'claude-opus-5',             // Claude 5 — στη λίστα ALLOWED_MODELS του Worker
  SONNET: 'claude-sonnet-5',           // Claude 5
  HAIKU:  'claude-haiku-4-5-20251001', // active Haiku 4.5
};

// ── Airtable field name constants ──────────────────────────────────────
// Single source of truth. Modules should migrate to F.XXX over time.
// Fields with unusual naming are marked with comments.
const F = {
  // ── ORDERS (International) ──────────────────────────────────────
  ORDER_NUMBER:     'Order Number',
  DIRECTION:        'Direction',
  STATUS:           'Status',
  BRAND:            'Brand',
  TYPE:             'Type',
  LOADING_DT:       'Loading DateTime',
  DELIVERY_DT:      'Delivery DateTime',
  LOADING_SUMMARY:  'Loading Summary',
  DELIVERY_SUMMARY: 'Delivery Summary',
  CLIENT:           'Client',
  CLIENT_NAME:      'Client Name',
  CLIENT_SUMMARY:   'Client Summary',
  REFERENCE:        'Reference',
  GOODS:            'Goods',
  TEMP:             'Temperature °C',
  REEFER_MODE:      'Refrigerator Mode',
  TOTAL_PALLETS:    'Total Pallets',
  LOADING_PALLETS1: 'Loading Pallets 1',
  UNLOADING_PALLETS1:'Unloading Pallets 1',
  PALLET_TYPE:      'Pallet Type',
  PALLET_EXCHANGE:  'Pallet Exchange',
  PALLET_SHEET1:    'Pallet Sheet 1 Uploaded',
  PALLET_SHEET2:    'Pallet Sheet 2 Uploaded',
  GROSS_WEIGHT:     'Gross Weight kg',
  PRICE:            'Price',
  NET_PRICE:        'Net Price',
  INVOICE_STATUS:   'Invoice Status',
  INVOICED:         'Invoiced',
  HIGH_RISK:        'High Risk Flag',
  CARRIER_TYPE:     'Carrier Type',
  NOTES:            'Notes',
  TRUCK:            'Truck',
  DRIVER:           'Driver',
  TRAILER:          'Trailer',
  PARTNER:          'Partner',
  IS_PARTNER:       'Is Partner Trip',
  PARTNER_PLATES:   'Partner Truck Plates',
  PARTNER_RATE:     'Partner Rate',
  MATCHED_IMPORT:   'Matched Import ID',
  DELIVERY_PERF:    'Delivery Performance',
  NAT_ORDER_CREATED:'National Order Created',
  WEEK_NUM:         'Week Number',          // Formula field, NOT writable (leading space removed)
  VEROIA_SWITCH:    'Veroia Switch',       // Trailing space removed
  NAT_GROUPAGE:     'National Groupage',
  TRIPS_EXPORT:     'TRIPS (Export Order)',
  TRIPS_IMPORT:     'TRIPS (Import Order)',
  // Loading/Unloading locations (1-5)
  LOADING_LOC1:     'Loading Location 1',
  LOADING_LOC2:     'Loading Location 2',
  LOADING_LOC3:     'Loading Location 3',
  UNLOADING_LOC1:   'Unloading Location 1',
  UNLOADING_LOC2:   'Unloading Location 2',
  UNLOADING_LOC3:   'Unloading Location 3',
  // Ops checklist fields
  TEMP_OK:          'Temp OK',
  DOCS_READY:       'Docs Ready',
  ADVANCE_PAID:     'Advance Paid',
  SECOND_CARD:      'Second Card',
  CMR_PHOTO:        'CMR Photo Received',
  CLIENT_NOTIFIED:  'Client Notified',
  DRIVER_NOTIFIED:  'Driver Notified',
  ETA:              'ETA',

  // ── NATIONAL ORDERS ──────────────────────────────────────────────
  PALLETS:          'Pallets',           // NAT_ORDERS uses 'Pallets' not 'Total Pallets'
  PICKUP_LOC:       'Pickup Location',
  PICKUP_LOC1:      'Pickup Location 1',
  DELIVERY_LOC:     'Delivery Location',
  DELIVERY_LOC1:    'Delivery Location 1',
  LINKED_TRIP:      'Linked Trip',
  NAT_TRIPS:        'NATIONAL TRIPS',
  NAT_TRIPS2:       'NATIONAL TRIPS 2',
  LINKED_NAT_ORDER: 'Linked National Order',
  LOADING_LOC_GL:   'Loading Location',  // GL_LINES uses this

  // ── NAT_LOADS ────────────────────────────────────────────────────
  NAME:             'Name',
  SOURCE_TYPE:      'Source Type',
  SOURCE_RECORD:    'Source Record',
  SOURCE_ORDERS:    'Source Orders',
  TEMPERATURE_C:    'Temperature C',     // NAT_LOADS uses 'Temperature C' (no °)
  MATCHED_LOAD:     'Matched Load',
  LOADING_DATE:     'Loading Date',
  DELIVERY_DATE:    'Delivery Date',

  // ── TRUCKS / TRAILERS ────────────────────────────────────────────
  LICENSE_PLATE:    'License Plate',
  ACTIVE:           'Active',
  KTEO_EXPIRY:      'KTEO Expiry',
  KEK_EXPIRY:       'KEK Expiry',
  INSURANCE_EXPIRY: 'Insurance Expiry',

  // ── DRIVERS ──────────────────────────────────────────────────────
  FULL_NAME:        'Full Name',

  // ── CLIENTS ──────────────────────────────────────────────────────
  COMPANY_NAME:     'Company Name',

  // ── PARTNERS ─────────────────────────────────────────────────────
  ADDRESS:          'Adress',              // Single 'd' — Airtable typo

  // ── LOCATIONS ────────────────────────────────────────────────────
  LOC_NAME:         'Name',
  LOC_CITY:         'City',
  LOC_COUNTRY:      'Country',
  LATITUDE:         'Latitude',
  LONGITUDE:        'Longitude',

  // ── RAMP PLAN ────────────────────────────────────────────────────
  PLAN_DATE:        'Plan Date',
  RAMP_TYPE:        'Type',
  RAMP_TIME:        'Time',
  RAMP_STATUS:      'Status',
  SUPPLIER_CLIENT:  'Supplier/Client',
  RAMP_CAT:         'Ramp Category',
  RAMP_TEMPERATURE: 'Temperature',       // RAMP uses 'Temperature' (no °C)
  POSTPONED_TO:     'Postponed To',
  STOCK_STATUS:     'Stock Status',
  IS_VS:            'Is Veroia Switch',
  LOADING_POINTS:   'Loading Points',
  DELIVERY_POINTS:  'Delivery Points',
  RAMP_ORDER:       'Order',
  RAMP_NAT_ORDER:   'National Order',

  // ── CONSOLIDATED LOADS ───────────────────────────────────────────
  GROUPAGE_ID:      'Groupage ID',

  // ── GROUPAGE LINES ───────────────────────────────────────────────
  GL_STATUS:        'Status',
  GL_PALLETS:       'Pallets',

  // ── Direction values (NOT field names — used as values) ──────────
  // All national tables use arrow format: South→North / North→South
  DIR_NS:           'North→South',        // ΚΑΘΟΔΟΣ
  DIR_SN:           'South→North',        // ΑΝΟΔΟΣ
  CL_KATHODOS:      'North→South',        // unified — was 'ΚΑΘΟΔΟΣ'
  CL_ANODOS:        'South→North',        // unified — was 'ΑΝΟΔΟΣ'

  // ── Special records ──────────────────────────────────────────────
  VEROIA_LOC:       'recJucKOhC1zh4IP3',

  // ── MAINTENANCE ──────────────────────────────────────────────────
  MAINT_STATUS:     'Status',

  // ── ORDER_STOPS ──────────────────────────────────────────────────
  STOP_LABEL:           'Stop Label',
  STOP_PARENT_ORDER:    'Parent Order',
  STOP_PARENT_NAT:      'Parent Nat Order',
  STOP_PARENT_NL:       'Parent Nat Load',
  STOP_NUMBER:          'Stop Number',
  STOP_TYPE:            'Stop Type',
  STOP_LOCATION:        'Location',
  STOP_DATETIME:        'DateTime',
  STOP_PALLETS:         'Pallets',
  STOP_CLIENT:          'Client at Stop',
  STOP_TEMP:            'Temperature',
  STOP_REF:             'Reference',
  STOP_GOODS:           'Goods',
  STOP_NOTES:           'Notes',
  STOP_PALLET_SHEET:    'Pallet Sheet',
  STOP_PALLET_SHEET_OK: 'Pallet Sheet OK',
  STOP_PALLETS_LOADED:  'Pallets Loaded',
  STOP_PALLETS_EXCHANGED:'Pallets Exchanged',

  // ── PARTNER_ASSIGN ───────────────────────────────────────────────
  PA_PARTNER:       'Partner',
  PA_ORDER:         'Order',
  PA_NAT_LOAD:      'Nat Load',
  PA_ASSIGN_DATE:   'Assignment Date',
  PA_STATUS:        'Status',
  PA_RATE:          'Partner Rate',
  PA_NOTES:         'Notes',
  PA_PAYMENT_TERMS: 'Payment Terms',

  // ── RAMP_EVENTS ──────────────────────────────────────────────────
  RE_SOURCE_STOP:   'Source Stop',
  RE_SOURCE_ORDER:  'Source Order',
  RE_PLAN_DATE:     'Plan Date',
  RE_TIME_SLOT:     'Time Slot',
  RE_RAMP_NUMBER:   'Ramp Number',
  RE_DIRECTION:     'Direction',
  RE_STATUS:        'Status',
  RE_TRUCK:         'Truck',
  RE_DRIVER:        'Driver',
  RE_PALLETS:       'Pallets',
  RE_CLIENT:        'Client',
  RE_LOC_NAME:      'Location Name',
  RE_GOODS:         'Goods',
  RE_TEMPERATURE:   'Temperature',
  RE_NOTES:         'Notes',
  RE_IS_VS:         'Is Veroia Switch',
  RE_RAMP_CAT:      'Ramp Category',

  // ── API meta fields ──────────────────────────────────────────────
  LAST_MODIFIED:    'Last Modified',
};

// ── User accounts (SHA-256 hashed passwords) ──
// ⚠️ THREE independent rosters exist and must stay in sync MANUALLY:
//   1. THIS array (loaded by app.html; auth.js _authRoleTampered checks it),
//   2. index.html's own USERS copy (the login page does NOT load config.js),
//   3. the backend `users` table (what actually authenticates in proxy mode).
// The old comment here called this the "single source of truth", which it never
// was, and that lie caused a real bug: the demo_* accounts were added to
// index.html and the backend but NOT here, so app.html's tamper guard bounced
// every demo login back to the login screen (found 2026-07-28 by walking the
// live post-C2 app; the roster-mismatch class F-E3, third occurrence).
const USERS = [
  { username: 'dimitris',   hash: 'b7e480feeff4e9f28cde7b5f10c8b46d4e81eac0f44fc91d9b6ca20648dc75ca', role: 'owner',      name: 'Dimitris Petras' },
  { username: 'pantelis',   hash: 'fa1db14f60e798c8f3c582586fd7d4c70cf8431249ffc7787befa93e6dbfd215', role: 'dispatcher', name: 'Pantelis Tsanaktsidis' },
  { username: 'sotiris',    hash: 'a5b2ee26884135591d0c8213b30802060d379074e151c08d8bc07757aea77ead', role: 'dispatcher', name: 'Sotiris Koulouriotis' },
  { username: 'thodoris',   hash: '699d7aab30ff342aa3656f63b1b72b6fcfa83ca26fa75313ec89a4b7d5fc0c10', role: 'management', name: 'Thodoris Vainas' },
  { username: 'eirini',     hash: '172f322617cd908a2cefceab73f655b875f9f4c55cbc37d129f9072aee57512a', role: 'accountant', name: 'Eirini Papazoi' },
  { username: 'alexia',     hash: '5db05ad60742b1618c0e30f1f4f09ae8d056e7b1108fb57bbca72c8655f4b9ee', role: 'accountant', name: 'Alexia' },
  { username: 'kelesmitos', hash: '00ad77798c78b32aecb433e682eabecae8338ed965dafebb4d31a697974a892a', role: 'dispatcher', name: 'Dimitris Kelesmitos' },
  // Demo accounts, one per role, mirroring index.html + the backend seed
  // (ops/seed-demo-users.sh). Hashes are the shared TMS_PW_DEMO in SHA-256
  // form; used only by direct-mode fallback, the tamper guard needs the
  // username+role pair either way.
  { username: 'demo_owner',      hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'owner',      name: 'Demo Owner' },
  { username: 'demo_management', hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'management', name: 'Demo Management' },
  { username: 'demo_accountant', hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'accountant', name: 'Demo Accountant' },
  { username: 'demo_dispatcher', hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'dispatcher', name: 'Demo Dispatcher' },
  { username: 'demo_warehouse',  hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'warehouse',  name: 'Demo Warehouse' },
];

// Role permission matrix
const PERMS = {
  owner:      { planning:'full', orders:'full',  clients:'full', maintenance:'full', drivers:'full', costs:'full',  settings:'full', performance:'full', ceo_dashboard:'full' },
  dispatcher: { planning:'full', orders:'full',  clients:'full', maintenance:'view', drivers:'view', costs:'none',  settings:'none', performance:'view',  ceo_dashboard:'none' },
  management: { planning:'view', orders:'view',  clients:'full', maintenance:'full', drivers:'full', costs:'view',  settings:'full', performance:'view',  ceo_dashboard:'none' },
  accountant: { planning:'view', orders:'view',  clients:'full', maintenance:'view', drivers:'full', costs:'full',  settings:'none', performance:'view',  ceo_dashboard:'none' },
  // Warehouse was missing here until 2026-07-27 while existing in the backend
  // RBAC matrix, so `can()` fell through to its 'none' default and a warehouse
  // login saw an entirely empty app. Fails safe, but useless for demonstrating
  // the role. Mirrors src/middleware/rbac.js `warehouse`: read-only on the
  // order/load tables it needs to load and unload, and no costs or settings
  // at all (a cost table is exactly what warehouse must not see).
  // Keep these two in step: the UI hides, the backend enforces.
  warehouse:  { planning:'view', orders:'view',  clients:'none', maintenance:'none', drivers:'none', costs:'none',  settings:'none', performance:'none', ceo_dashboard:'none' },
};
