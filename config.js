// ═══════════════════════════════════════════════
// PETRAS GROUP TMS — CONFIG
// ═══════════════════════════════════════════════

const AT_BASE  = 'appElT5CQV6JQvym8';

// ── API Mode ──
// Set USE_PROXY = true after deploying the Cloudflare Worker
// Then the AT_TOKEN is no longer needed in the browser
const USE_PROXY  = false;
const PROXY_URL  = 'https://tms-api-proxy.petrasgroup.workers.dev';

// Direct mode (fallback) — REMOVE these after proxy is live
const AT_TOKEN = 'patpPJXnFYnxdgoK3.a2162b09fbb214628114ff2ce68bb5a7b30aea2061b14f9562a1ab222585cf08';
const ANTH_KEY  = 'sk-ant-api03-HG90hAxac0K9lx2mdS6fFKID6XMAICWl4FSbXeVM9'+
                 'zG3klf7diFSUiNY056CRFBAeUZ1H_dZwDfhVbf7IRD3HQ-_nYO3gAA';

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
  { username: 'dimitris',   hash: 'b7e480feeff4e9f28cde7b5f10c8b46d4e81eac0f44fc91d9b6ca20648dc75ca', role: 'owner',      name: 'Dimitris Petras' },
  { username: 'pantelis',   hash: 'fa1db14f60e798c8f3c582586fd7d4c70cf8431249ffc7787befa93e6dbfd215', role: 'dispatcher', name: 'Pantelis Tsanaktsidis' },
  { username: 'sotiris',    hash: 'a5b2ee26884135591d0c8213b30802060d379074e151c08d8bc07757aea77ead', role: 'dispatcher', name: 'Sotiris Koulouriotis' },
  { username: 'thodoris',   hash: '699d7aab30ff342aa3656f63b1b72b6fcfa83ca26fa75313ec89a4b7d5fc0c10', role: 'management', name: 'Thodoris Vainas' },
  { username: 'eirini',     hash: '172f322617cd908a2cefceab73f655b875f9f4c55cbc37d129f9072aee57512a', role: 'accountant', name: 'Eirini Papazoi' },
  { username: 'kelesmitos', hash: '00ad77798c78b32aecb433e682eabecae8338ed965dafebb4d31a697974a892a', role: 'dispatcher', name: 'Dimitris Kelesmitos' },
];

// Role permission matrix
const PERMS = {
  owner:      { planning:'full', orders:'full',  clients:'full', maintenance:'full', drivers:'full', costs:'full',  settings:'full', performance:'full', ceo_dashboard:'full' },
  dispatcher: { planning:'full', orders:'full',  clients:'full', maintenance:'view', drivers:'view', costs:'none',  settings:'none', performance:'view',  ceo_dashboard:'none' },
  management: { planning:'view', orders:'view',  clients:'full', maintenance:'full', drivers:'full', costs:'view',  settings:'full', performance:'view',  ceo_dashboard:'none' },
  accountant: { planning:'view', orders:'view',  clients:'full', maintenance:'view', drivers:'full', costs:'full',  settings:'none', performance:'view',  ceo_dashboard:'none' },
};
