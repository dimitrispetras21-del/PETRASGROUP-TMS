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

// Users are defined in index.html / auth layer
// Role permission matrix
const PERMS = {
  owner:      { planning:'full', orders:'full',  clients:'full', maintenance:'full', drivers:'full', costs:'full',  settings:'full', performance:'full' },
  dispatcher: { planning:'full', orders:'full',  clients:'full', maintenance:'view', drivers:'view', costs:'none',  settings:'none', performance:'view' },
  management: { planning:'view', orders:'view',  clients:'full', maintenance:'full', drivers:'full', costs:'view',  settings:'full', performance:'view' },
  accountant: { planning:'view', orders:'view',  clients:'full', maintenance:'view', drivers:'full', costs:'full',  settings:'none', performance:'view' },
};
