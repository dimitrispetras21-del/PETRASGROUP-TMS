// The 12 redesign units. A "unit" is one body of CODE, not one route:
// six master-data routes all render through renderEntity(), so core/entity.js
// is ONE unit covering six screens (core/router.js:305-320). Treating them as
// six would fan out six agents onto the same file — a hidden edge, not
// parallelism.
//
// Source of truth: docs/superpowers/specs/2026-08-28-app-redesign-graph-design.md §3.1
// Excluded on purpose (§3.2): costs (already the reference), ceo_dashboard,
// performance, invoicing (structurally broken — fix before polishing),
// daily_ramp (owner 24/8: goes last).

module.exports = [
  // Tier 1 — the data contract is a HARD gate: no field may disappear.
  { unit: 'entity',      tier: 1, routes: ['clients', 'partners', 'drivers', 'trucks', 'trailers', 'workshops'], files: ['core/entity.js'] },
  // maint_trucks/maint_trailers («Ιστορικό Φορτηγών/Ρυμουλκών») προστέθηκαν
  // 30/8/2026. Ζούσαν στο ΙΔΙΟ modules/maintenance.js με τις άλλες τέσσερις,
  // αλλά έλειπαν από αυτή τη λίστα — άρα κανένας ζωντανός κριτής δεν τις
  // οδηγούσε: ούτε συμβόλαιο, ούτε ρόλοι, ούτε άγνωστο≠μηδέν, ούτε πλάτος.
  // Κρυφή ακμή: ένα αρχείο, τέσσερις οθόνες ορατές στη σουίτα, δύο αόρατες —
  // και θα άλλαζαν ΤΥΧΑΙΑ στο redesign του κύματος 2.
  //
  // Βρέθηκε συγκρίνοντας τα `case` του core/router.js με αυτό το αρχείο:
  // 35 διαδρομές, 20 καλυμμένες. Η σύγκριση ΔΕΝ τρέχει αυτόματα — όποιος
  // προσθέτει οθόνη στον router πρέπει να την κάνει με το χέρι.
  { unit: 'maintenance', tier: 1, routes: ['maint_dash', 'maint_req', 'maint_expiry', 'maint_svc', 'maint_trucks', 'maint_trailers'], files: ['modules/maintenance.js'] },
  { unit: 'locations',   tier: 1, routes: ['locations'],                                                          files: ['modules/locations.js', 'modules/locations_map.js'] },
  { unit: 'pallets',     tier: 1, routes: ['pallet_ledger'],                                                      files: ['modules/pallet_ledger.js', 'modules/pallet_upload.js'] },
  { unit: 'audit',       tier: 1, routes: ['audit_trail', 'metrics_audit'],                                       files: ['modules/audit_trail.js', 'modules/metrics_audit.js'] },

  // The stylesheet is its own unit, and it has NO routes on purpose.
  //
  // WHY it must exist: critics #3/#4 read the unit `files` list, and every
  // other unit lists only .js. assets/style.css holds ~427 hex literals and
  // 27 truncation rules that no unit was counting. The normal, expected move
  // in a redesign — lift colour and text-overflow out of the modules and into
  // the stylesheet — would then drive every .js ratchet DOWN and read as
  // progress, while raw hex and cut company names accumulate in the one file
  // nothing watched. DESIGN.md #6 exists because dispatchers phone the
  // companies whose names must not be cut; an ellipsis added here is exactly
  // as harmful as one added in a module.
  //
  // WHY routes is empty: there is no screen that "is" the stylesheet, so the
  // live critics (contract/semantics) have nothing to drive. They skip a
  // unit with no routes — see the guard at the top of both spec files.
  { unit: 'styles',      tier: 1, routes: [],                                                                     files: ['assets/style.css'] },

  // Tier 3 — the contract MAY change; the critic reports a diff for approval
  // instead of failing (spec §6.1).
  { unit: 'dashboard',   tier: 3, routes: ['dashboard'],    files: ['modules/dashboard.js'] },
  { unit: 'daily_ops',   tier: 3, routes: ['daily_ops'],    files: ['modules/daily_ops.js'] },
  { unit: 'weekly_intl', tier: 3, routes: ['weekly_intl'],  files: ['modules/weekly_intl.js'] },
  { unit: 'weekly_natl', tier: 3, routes: ['weekly_natl'],  files: ['modules/weekly_natl.js'] },
  { unit: 'orders_intl', tier: 3, routes: ['orders_intl'],  files: ['modules/orders_intl.js'] },
  { unit: 'orders_natl', tier: 3, routes: ['orders_natl'],  files: ['modules/orders_natl.js'] },
];
