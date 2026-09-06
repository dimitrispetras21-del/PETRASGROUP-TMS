// ===============================================
// CORE -- CONSTANTS (magic strings registry)
// ===============================================
// Central registry of all repeated string literals.
// Modules still use hardcoded strings for now --
// this file is the single-source-of-truth reference
// for a future refactor pass.

// -- Order / Trip Status (unified lifecycle) ---
// Single canonical enum for ORDERS, NAT_ORDERS, PA
// NAT_LOADS keeps simpler 3-state (Pending/Assigned/Done) — see README
const STATUS = {
  PENDING:           'Pending',
  ASSIGNED:          'Assigned',
  IN_TRANSIT:        'In Transit',
  DELIVERED:         'Delivered',
  INVOICED:          'Invoiced',
  CANCELLED:         'Cancelled',
  // Planning-only (GL, internal)
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

// -- Daily Ops Status (DEPRECATED — use STATUS) -
// Kept temporarily for any legacy reads; writes should go to STATUS.
// TODO: remove after full migration of Ops Status field.

// -- Delivery Performance ----------------------
const DELIVERY_PERF = {
  ON_TIME: 'On Time',
  DELAYED: 'Delayed',
};

// -- Ramp Board Status (simplified) ------------
// Just "did it happen or not" — 2 states only.
const RAMP_STATUS = {
  PLANNED: 'Planned',
  DONE:    'Done',
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

// -- Λήξεις εγγράφων ανά τύπο οχήματος (χάρτης Worker, επαληθευμένο 26/8) -----
// Το 'ATP Expiry' ΔΕΝ υπάρχει στον χάρτη: ATP είναι η κατηγορία πιστοποιητικού,
// FRC η βαθμίδα που κρατάμε (στήλη frc_expiry — μόνο TRAILERS). Μία κοινή
// λίστα ανά τύπο, ώστε κανένα σημείο να μην ξεχνά έγγραφο: το ΚΤΕΟ των
// ρυμουλκών έλειπε από δύο σημεία και ρυμούλκα με ληγμένο FRC 3 μήνες
// κυκλοφορούσε αόρατη από κάθε ταμπλό.
// Object form ({field,label}) is the single definition: maintenance.js used to
// declare its own identically-named const, which made the browser abort the whole
// file with "Identifier already declared" — every maintenance page went blank
// (25/8). Column-name-only consumers use the derived *_NAMES lists below.
const TRUCK_EXPIRY_FIELDS = [
  { field: 'KTEO Expiry',      label: 'KTEO' },
  { field: 'KEK Expiry',       label: 'KEK' },
  { field: 'Insurance Expiry', label: 'Insurance' },
  // Tachograph calibration (owner 6/9/2026: «πολύ σημαντικό», trucks only).
  // Feeds the maintenance expiry table + alerts; the column arrives with
  // worker/migrations/017_fleet.sql — until then the cell simply reads «—».
  { field: 'Tachograph Expiry', label: 'Ταχογράφος' },
];
const TRAILER_EXPIRY_FIELDS = [
  { field: 'KTEO Expiry',      label: 'KTEO' },
  { field: 'FRC Expiry',       label: 'FRC' },
  { field: 'Insurance Expiry', label: 'Insurance' },
];
const TRUCK_EXPIRY_NAMES   = TRUCK_EXPIRY_FIELDS.map(e => e.field);
const TRAILER_EXPIRY_NAMES = TRAILER_EXPIRY_FIELDS.map(e => e.field);

// -- Badge CSS class map (status -> class) -----
const STATUS_BADGE = {
  'Pending':    'badge-yellow',
  'Assigned':   'badge-blue',
  'In Transit': 'badge-green',
  'Delivered':  'badge-grey',
  'Invoiced':   'badge-grey',
  'Cancelled':  'badge-red',
  // Legacy (read-only for migration period)
  'Loaded':     'badge-green',
  'Confirmed':  'badge-blue',
};
