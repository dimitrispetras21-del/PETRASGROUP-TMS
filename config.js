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
  PALLET_LEDGER: 'tblAAH3N1bIcBRPXi',
};

// ── Tricky Airtable field names (document here, reference everywhere) ──
// These fields have unusual naming that causes silent bugs if mistyped.
const F = {
  // ORDERS table
  WEEK_NUM:       ' Week Number',        // Leading space! Formula field, NOT writable
  VEROIA_SWITCH:  'Veroia Switch ',      // Trailing space!
  // PARTNERS table
  ADDRESS:        'Adress',              // Single 'd' — Airtable typo
  // NATIONAL ORDERS — direction values (arrow chars)
  DIR_NS:         'North→South',         // ΚΑΘΟΔΟΣ
  DIR_SN:         'South→North',         // ΑΝΟΔΟΣ
  // CONSOLIDATED LOADS — direction values (Greek)
  CL_KATHODOS:    'ΚΑΘΟΔΟΣ',
  CL_ANODOS:      'ΑΝΟΔΟΣ',
  // Special location
  VEROIA_LOC:     'recJucKOhC1zh4IP3',
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
  owner:      { planning:'full', orders:'full',  clients:'full', maintenance:'full', drivers:'full', costs:'full',  settings:'full', performance:'full' },
  dispatcher: { planning:'full', orders:'full',  clients:'full', maintenance:'view', drivers:'view', costs:'none',  settings:'none', performance:'view' },
  management: { planning:'view', orders:'view',  clients:'full', maintenance:'full', drivers:'full', costs:'view',  settings:'full', performance:'view' },
  accountant: { planning:'view', orders:'view',  clients:'full', maintenance:'view', drivers:'full', costs:'full',  settings:'none', performance:'view' },
};
