// ═══════════════════════════════════════════════
// PETRAS GROUP TMS — CONFIG
// ═══════════════════════════════════════════════

const AT_BASE  = 'appElT5CQV6JQvym8';
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
};

// Users are defined in index.html / auth layer
// Role permission matrix
const PERMS = {
  owner:      { planning:'full', orders:'full',  clients:'full', maintenance:'full', drivers:'full', costs:'full',  settings:'full' },
  dispatcher: { planning:'full', orders:'full',  clients:'full', maintenance:'view', drivers:'view', costs:'none',  settings:'none' },
  management: { planning:'view', orders:'view',  clients:'full', maintenance:'full', drivers:'full', costs:'view',  settings:'full' },
  accountant: { planning:'view', orders:'view',  clients:'full', maintenance:'view', drivers:'full', costs:'full',  settings:'none' },
};
