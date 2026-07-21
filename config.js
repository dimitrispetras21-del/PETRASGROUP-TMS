// ═══════════════════════════════════════════════
// PETRAS GROUP TMS — CONFIG
// ═══════════════════════════════════════════════

const AT_BASE  = 'appElT5CQV6JQvym8';

// ── API Mode ──
// Proxy mode: all Airtable traffic goes through the Cloudflare Worker, which
// holds the write PAT as a server-side secret (env.AIRTABLE_TOKEN). The browser
// never sees an Airtable token. See .ai-notes/2026-07-13-rotation-day-runbook.md.
// Flipped true on rotation day (S-1 remediation) — the raw AT_TOKEN below was removed.
const USE_PROXY  = true;
const PROXY_URL  = 'https://tms-api-proxy.petrasgroup.workers.dev';

// ── Sentry DSN (error monitoring) ──
// Leave empty to disable. When set, all errors logged via logError() are
// forwarded to Sentry in addition to the local error log.
// Get a DSN at https://sentry.io (free tier: 5k errors/month).
const TMS_SENTRY_DSN = '';

// ── Airtable token: REMOVED from the browser (S-1 remediation, 2026-07-13) ──
// The write PAT now lives only as a Cloudflare Worker secret (env.AIRTABLE_TOKEN).
// With USE_PROXY=true, core/api.js sends the user's JWT and the Worker swaps it
// for the real PAT server-side. Nothing here needs AT_TOKEN anymore.
// If USE_PROXY is ever set back to false, the app WILL break — that is intentional:
// there is no client-side Airtable credential by design now.

// ── Anthropic key: REMOVED from the browser (Fix 1.D, 2026-07-13) ──
// The AI tools (scan, chat, pallet OCR) now POST to the Worker's /v1/ai/messages
// route with the user's JWT; the Worker holds the real key (env.ANTHROPIC_KEY)
// and talks to api.anthropic.com server-side. Same pattern as the Airtable PAT.
// See .ai-notes/2026-07-13-rotation-day-runbook.md step 4.
const AI_PROXY_URL = PROXY_URL + '/v1/ai/messages';

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
  PALLET_LEDGER: 'tblAAH3N1bIcBRPXi',           // DEPRECATED alias
  PALLET_LEDGER_SUPPLIERS: 'tblAAH3N1bIcBRPXi', // renamed from PALLET LEDGER
  PALLET_LEDGER_PARTNERS:  'tblAUixdjwpgnJ1hK', // new: partner exchanges only
  ORDER_STOPS:   'tblaeY5QOHAS1gyE8',
  RAMP_EVENTS:   'tbllHu40WSq4yWg5S',
  PARTNER_ASSIGN:'tblUhgqnmiam5MGNK',
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
  OPUS:   'claude-opus-4-6',           // active (retirement not before 2026-02-05)
  SONNET: 'claude-sonnet-4-6',         // active replacement for the retired Sonnet 4
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
// Single source of truth for client-side auth (index.html references this).
// NOTE: worker/index.js (Cloudflare Worker) has its own copy — keep in sync manually.
const USERS = [
  { username: 'dimitris',   hash: '9f0ed2c68d6bc81d92dc15d0d4759223db5f596e1a687ce9e5c0017b7da8cb85', role: 'owner',      name: 'Dimitris Petras' },
  { username: 'pantelis',   hash: 'bcc9e4d2c4ed2564ad8277876393b815ded43cfe15fadb9b22f3223f7f842271', role: 'dispatcher', name: 'Pantelis Tsanaktsidis' },
  { username: 'sotiris',    hash: '164009a07c161d8ad67cb949d751f5097a8bfa558230b9aeefe521851d1209bf', role: 'dispatcher', name: 'Sotiris Koulouriotis' },
  { username: 'thodoris',   hash: 'f08f0ac8eb0b89aaef2dcc904cafc21b00e1f8f5c5f271703e0b649ffeea69fe', role: 'management', name: 'Thodoris Vainas' },
  { username: 'eirini',     hash: '5c9954dd6574c7f5f91c07739df100f9f8526846b0bc07518364a66a393ce7fb', role: 'accountant', name: 'Eirini Papazoi' },
  { username: 'kelesmitos', hash: '0eaeebea099831a5ca606ff11c8015300ceee85b508f49efbebb188fa1b62d0e', role: 'dispatcher', name: 'Dimitris Kelesmitos' },
];

// Role permission matrix
const PERMS = {
  owner:      { planning:'full', orders:'full',  clients:'full', maintenance:'full', drivers:'full', costs:'full',  settings:'full', performance:'full', ceo_dashboard:'full' },
  dispatcher: { planning:'full', orders:'full',  clients:'full', maintenance:'view', drivers:'view', costs:'none',  settings:'none', performance:'view',  ceo_dashboard:'none' },
  management: { planning:'view', orders:'view',  clients:'full', maintenance:'full', drivers:'full', costs:'view',  settings:'full', performance:'view',  ceo_dashboard:'none' },
  accountant: { planning:'view', orders:'view',  clients:'full', maintenance:'view', drivers:'full', costs:'full',  settings:'none', performance:'view',  ceo_dashboard:'none' },
};
