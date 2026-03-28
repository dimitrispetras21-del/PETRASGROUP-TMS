// ===============================================
// CORE -- CONSTANTS (magic strings registry)
// ===============================================
// Central registry of all repeated string literals.
// Modules still use hardcoded strings for now --
// this file is the single-source-of-truth reference
// for a future refactor pass.

// -- Order / Trip Status -----------------------
const STATUS = {
  PENDING:           'Pending',
  ASSIGNED:          'Assigned',
  LOADED:            'Loaded',
  IN_TRANSIT:        'In Transit',
  DELIVERED:         'Delivered',
  INVOICED:          'Invoiced',
  CANCELLED:         'Cancelled',
  CONFIRMED:         'Confirmed',
  UNASSIGNED:        'Unassigned',
  GROUPAGE_ASSIGNED: 'Groupage Assigned',
};

// -- Directions --------------------------------
const DIR = {
  EXPORT:       'Export',
  IMPORT:       'Import',
  ANODOS:       '\u0391\u039D\u039F\u0394\u039F\u03A3',        // South -> North (CL / NAT_LOADS)
  KATHODOS:     '\u039A\u0391\u0398\u039F\u0394\u039F\u03A3',       // North -> South (CL / NAT_LOADS)
  SOUTH_NORTH:  'South\u2192North',  // arrow char used in NATIONAL ORDERS
  NORTH_SOUTH:  'North\u2192South',  // arrow char used in NATIONAL ORDERS
};

// -- Daily Ops Status --------------------------
const OPS_STATUS = {
  PENDING:         'Pending',
  ASSIGNED:        'Assigned',
  LOADED:          'Loaded',
  IN_TRANSIT:      'In Transit',
  DELIVERED:       'Delivered',
  CLIENT_NOTIFIED: 'Client Notified',
};

// -- Delivery Performance ----------------------
const DELIVERY_PERF = {
  ON_TIME: 'On Time',
  DELAYED: 'Delayed',
};

// -- Ramp Board Status -------------------------
const RAMP_STATUS = {
  SCHEDULED:  '\u03A0\u03C1\u03BF\u03B3\u03C1\u03B1\u03BC\u03BC\u03B1\u03C4\u03B9\u03C3\u03BC\u03AD\u03BD\u03BF',
  ARRIVED:    '\u0388\u03C6\u03C4\u03B1\u03C3\u03B5',
  LOADING:    '\u03A6\u03CC\u03C1\u03C4\u03C9\u03C3\u03B7',
  UNLOADING:  '\u0395\u03BA\u03C6\u03CC\u03C1\u03C4\u03C9\u03C3\u03B7',
  COMPLETED:  '\u039F\u03BB\u03BF\u03BA\u03BB\u03B7\u03C1\u03CE\u03B8\u03B7\u03BA\u03B5',
  POSTPONED:  '\u0391\u03BD\u03B1\u03B2\u03BB\u03AE\u03B8\u03B7\u03BA\u03B5',
  DONE:       '\u2705 \u0388\u03B3\u03B9\u03BD\u03B5',
};

// -- Ramp Type ---------------------------------
const RAMP_TYPE = {
  INBOUND:  '\u03A0\u03B1\u03C1\u03B1\u03BB\u03B1\u03B2\u03AE',   // Inbound
  OUTBOUND: '\u03A6\u03CC\u03C1\u03C4\u03C9\u03C3\u03B7',         // Outbound
};

// -- Ramp Category -----------------------------
const RAMP_CAT = {
  VF:           'Vermion Fresh',
  VS_SIMPLE:    'VS Simple',
  VS_GROUPAGE:  'VS + Groupage',
  OTHER:        'Other',
};

// -- Source Types (NAT_LOADS) ------------------
const SOURCE_TYPE = {
  DIRECT:   'Direct',
  GROUPAGE: 'Groupage',
  VS:       'VS',
};

// -- Stock Status ------------------------------
const STOCK_STATUS = {
  IN_STOCK: 'In Stock',
};

// -- Invoicing Status --------------------------
const INV_STATUS = {
  READY:    'Ready',
  BLOCKED:  'Blocked',
  INVOICED: 'Invoiced',
};

// -- Maintenance Status ------------------------
const MAINT_STATUS = {
  PENDING:     'Pending',
  IN_PROGRESS: 'In Progress',
  SCHEDULED:   'Scheduled',
  COMPLETED:   'Completed',
  DONE:        'Done',
};

// -- Badge CSS class map (status -> class) -----
const STATUS_BADGE = {
  'Pending':    'badge-yellow',
  'Confirmed':  'badge-blue',
  'Assigned':   'badge-blue',
  'In Transit': 'badge-green',
  'Delivered':  'badge-grey',
  'Invoiced':   'badge-grey',
  'Cancelled':  'badge-red',
};
