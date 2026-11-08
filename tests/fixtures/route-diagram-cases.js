// Synthetic route cases for tests/route-diagram.test.js AND tests/critics/route-diagram-preview.html (one list, so the
// page that is screenshotted is the page that is tested). Every designed case of docs/order-route/CASES.md (Δ, Π, Ν)
// and RT-CASES.md (RT0–RT20) has an entry; DESIGN.md §2 maps them. The repo is PUBLIC: no client, driver or plate
// from production — places are «Πόλη Α», people «ΟΔΗΓΟΣ Α», order numbers #9xx.
// Each case: { id, family, title, figma?, build(A) → input | input[] } where A = RouteDiagramAdapters. An array is
// drawn side by side (RT10, RT16: the same vehicle in two or three RTs).
(function () {
'use strict';
const TODAY = '2026-10-26';   // Monday, as the Figma frame 2283:10009 («Δευ 26/10 · σήμερα»)

// ── facade helpers (ORDERS / ORDER STOPS as the Worker returns them) ──
const LOC = {
  rGR1: { name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR' }, rGR2: { name: 'Πελάτης Β', city: 'Πόλη Β', cc: 'GR' },
  rGR3: { name: 'Πελάτης Γ', city: 'Πόλη Γ', cc: 'GR' }, rVER: { name: 'Αποθήκη Βέροιας', city: 'Veria', cc: 'GR' },
  rHR: { name: 'Παραλήπτης HR', city: 'Πόλη HR', cc: 'HR' }, rAT1: { name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT' },
  rAT2: { name: 'Προμηθευτής AT2', city: 'Πόλη AT2', cc: 'AT' }, rDE: { name: 'Παραλήπτης DE', city: 'Πόλη DE', cc: 'DE' },
  rIT: { name: 'Παραλήπτης IT', city: 'Πόλη IT', cc: 'IT' }, rBG1: { name: 'Παραλήπτης BG1', city: 'Πόλη BG1', cc: 'BG' },
  rBG2: { name: 'Παραλήπτης BG2', city: 'Πόλη BG2', cc: 'BG' }, rSI: { name: 'Σημείο SI', city: 'Πόλη SI', cc: 'SI' },
  rES: { name: 'Παραλήπτης ES', city: 'Πόλη ES', cc: 'ES' }, rNOC: { name: 'Τόπος χωρίς χώρα', city: 'Πόλη Χ', cc: '' },
  rPL: { name: 'Παραλήπτης PL', city: 'Πόλη PL', cc: 'PL' },
};
const locMeta = (id) => LOC[id] || null;
// Athens: summer time ends on Sunday 25/10/2026, so the offset is +03:00 before it and +02:00 from it
const at = (day, hh) => `${day}T${hh || '10'}:00:00${day >= '2026-10-25' ? '+02:00' : '+03:00'}`;
const st = (n, type, day, loc, pal, done) => ({ fields: Object.assign({ 'Stop Number': n, 'Stop Type': type, DateTime: at(day), Location: loc ? [loc] : [], Pallets: pal },
  done ? { 'Completed At': at(day, '12') } : {}) });
const ord = (no, dir, extra) => ({ id: 'rec' + no, fields: Object.assign({ 'Order No': no, Direction: dir, Truck: ['recT1'] }, extra || {}) });
const C = (o) => Object.assign({ today: TODAY, locMeta }, o || {});

// ── board helpers (GET /plan/board, 072 + 072b) ──
const HUB = 360;
const leg = (act, pal, kind) => ({ act, pallets: pal, kind: kind || 'national' });
const bs = (id, seq, side, loc, name, day, legs, o) => Object.assign({ stop_id: id, seq, side, location_id: loc, location: name,
  planned_from: at(day, '08'), planned_to: at(day, '10'), stop_day: day, executed: false, has_vehicle: true, has_late: false, legs }, o || {});
const cyc = (stops, o) => Object.assign({ rt_id: 1, code: 'RT-T1', trip_type: 'OWNED', truck_id: 1, truck: 'ΦΟΡΤΗΓΟ Α', trailer: 'ΨΥΓΕΙΟ Α',
  driver_id: 1, driver: 'ΟΔΗΓΟΣ Α', partner_id: null, partner: null, stops }, o || {});
const B = (o) => Object.assign({ today: TODAY, hubId: HUB, countryOf: () => 'GR' }, o || {});

const cases = [
  // ═══ Δ · one international order (CASES.md §Α) ═══
  { id: 'Δ1', family: 'Δ', title: 'Απλή εξαγωγή (παραδόθηκε)', build: (A) => A.facadeOrder(ord(901, 'Export', { Status: 'Delivered' }),
    [st(1, 'Loading', '2026-10-19', 'rGR1', 26, true), st(2, 'Unloading', '2026-10-21', 'rHR', 26, true)], C()) },
  { id: 'Δ2', family: 'Δ', title: 'Εξαγωγή με πολλά σημεία', build: (A) => A.facadeOrder(ord(902, 'Export'),
    [st(1, 'Loading', '2026-10-27', 'rGR1', 10), st(2, 'Loading', '2026-10-27', 'rGR2', 10), st(3, 'Loading', '2026-10-28', 'rGR3', 13),
      st(4, 'Unloading', '2026-10-30', 'rDE', 20), st(5, 'Unloading', '2026-10-30', 'rIT', 13)], C()) },
  { id: 'Δ3', family: 'Δ', title: 'Εξαγωγή VS', build: (A) => A.facadeOrder(ord(903, 'Export', { 'Veroia Switch': true }),
    [st(1, 'Loading', '2026-10-27', 'rGR1', 20), st(2, 'Cross-dock', '2026-10-28', null, 20), st(3, 'Unloading', '2026-10-30', 'rDE', 20)],
    C({ natLeg: { ref: 'NL 903', kind: 'own' } })) },
  { id: 'Δ4', family: 'Δ', title: 'Βέροια ως απλή στάση (χωρίς VS)', build: (A) => A.facadeOrder(ord(904, 'Export'),
    [st(1, 'Loading', '2026-10-27', 'rVER', 18), st(2, 'Unloading', '2026-10-29', 'rPL', 18)], C()) },
  { id: 'Δ5', family: 'Δ', title: 'Σπάσιμο σκέλους · δικό μας → συνεργάτης', figma: '2310:7917', build: (A) => A.facadeOrder(ord(905, 'Export'), [],
    C({ legs: [
      { rec: ord(906, 'Export'), stops: [st(1, 'Loading', '2026-10-21', 'rGR1', 21), st(2, 'Unloading', '2026-10-23', 'rSI', 21, true)] },
      { rec: ord(907, 'Export', { Truck: [], Partner: ['recP1'] }), stops: [st(1, 'Loading', '2026-10-23', 'rSI', 21, true), st(2, 'Unloading', '2026-10-25', 'rES', 21, true)] },
    ] })) },
  { id: 'Δ6', family: 'Δ', title: 'Απλή εισαγωγή', build: (A) => A.facadeOrder(ord(908, 'Import', { 'Pallet Exchange': true }),
    [st(1, 'Loading', '2026-10-26', 'rAT1', 33), st(2, 'Unloading', '2026-10-28', 'rGR1', 33)], C({ temp: '4°' })) },
  { id: 'Δ7', family: 'Δ', title: 'Εισαγωγή από πολλά σημεία · τόπος χωρίς χώρα', build: (A) => A.facadeOrder(ord(909, 'Import'),
    [st(1, 'Loading', '2026-10-27', 'rAT1', 10), st(2, 'Loading', '2026-10-27', 'rNOC', 8), st(3, 'Loading', '2026-10-28', 'rAT2', 12),
      st(4, 'Unloading', '2026-10-30', 'rGR1', 30)], C()) },
  { id: 'Δ8', family: 'Δ', title: 'Εισαγωγή VS · εθνικό σκέλος χωρίς ανάθεση', figma: '2283:9963', build: (A) => A.facadeOrder(ord(910, 'Import', { 'Pallet Exchange': true, 'Veroia Switch': true }),
    [st(1, 'Loading', '2026-10-23', 'rAT1', 23), st(2, 'Loading', '2026-10-23', 'rAT2', 9), st(3, 'Cross-dock', TODAY, null, 32),
      st(4, 'Unloading', '2026-10-27', 'rGR1', 13), st(5, 'Unloading', '2026-10-27', 'rGR2', 8), st(6, 'Unloading', '2026-10-27', 'rGR3', 11)],
    C({ temp: '4°', natLeg: { ref: 'NL 910', kind: 'none' } })) },
  { id: 'Δ9', family: 'Δ', title: 'Εισαγωγή μόνο Βουλγαρία', build: (A) => A.facadeOrder(ord(911, 'Import'),
    [st(1, 'Loading', '2026-10-27', 'rAT1', 20), st(2, 'Unloading', '2026-10-29', 'rBG1', 12), st(3, 'Unloading', '2026-10-29', 'rBG2', 8)], C()) },
  { id: 'Δ10', family: 'Δ', title: 'Εισαγωγή Βουλγαρία και μετά Ελλάδα', build: (A) => A.facadeOrder(ord(912, 'Import'),
    [st(1, 'Loading', '2026-10-27', 'rAT1', 24), st(2, 'Unloading', '2026-10-29', 'rBG1', 10), st(3, 'Unloading', '2026-10-30', 'rGR1', 14)], C()) },
  { id: 'Δ11', family: 'Δ', title: 'Εισαγωγή VS από Βουλγαρία', build: (A) => A.facadeOrder(ord(913, 'Import', { 'Veroia Switch': true }),
    [st(1, 'Loading', '2026-10-27', 'rBG1', 22), st(2, 'Cross-dock', '2026-10-28', null, 22), st(3, 'Unloading', '2026-10-29', 'rGR2', 22)],
    C({ natLeg: { ref: 'NL 913', kind: 'partner' } })) },
  { id: 'Δ12', family: 'Δ', title: 'Από απόθεμα', build: (A) => A.facadeOrder(ord(914, 'Import'),
    [st(1, 'Loading', '2026-10-27', 'rVER', 6), st(2, 'Unloading', '2026-10-27', 'rGR1', 6)], C({ stockOut: 'παρτίδα 3 · Βέροια' })) },
  { id: 'Δ13', family: 'Δ', title: 'Ολόκληρη με συνεργάτη', build: (A) => A.facadeOrder(ord(915, 'Import', { Truck: [], Partner: ['recP1'] }),
    [st(1, 'Loading', '2026-10-27', 'rDE', 30), st(2, 'Unloading', '2026-10-30', 'rGR1', 30)], C()) },
  { id: 'Δ14', family: 'Δ', title: 'Cross-trade', build: (A) => A.facadeOrder(ord(916, 'Import'),
    [st(1, 'Loading', '2026-10-27', 'rDE', 30), st(2, 'Unloading', '2026-10-29', 'rIT', 30)], C()) },
  { id: 'Δ15', family: 'Δ', title: 'Μέρος σε αποθήκη τρίτου (μόνο σημειώσεις)', figma: '2310:7918', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΙΣΑΓΩΓΗ', chip: '#917', aside: 'PE · 4°', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-15', name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 15, extra: ['31 π. στις σημειώσεις'], marked: true },
      { kind: 'node', node: 'warehouse-leave', name: 'Αποθήκη τρίτου · εξωτερικό', extra: ['μένουν 16 π.'], notes: [{ tone: 'amber', text: '7 π. φεύγουν με την #918 →' }] },
      { kind: 'crossdock', day: '2026-10-25', pallets: 15, notes: [{ tone: 'amber', text: 'εθνικό σκέλος NL 917: χωρίς ανάθεση' }] },
      { kind: 'stop', act: 'unload', day: TODAY, name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 15 }] }] }) },
  { id: 'Δ16', family: 'Δ', title: 'Φόρτωση ανάμεσα σε παραδόσεις', figma: '2310:7919', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΞΑΓΩΓΗ', chip: '#919', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 33, extra: ['3°'] },
      { kind: 'stop', act: 'unload', day: '2026-10-29', name: 'Παραλήπτης AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 10 },
      { kind: 'stop', act: 'both', day: '2026-10-29', name: 'Παραλήπτης AT2', city: 'Πόλη AT2', cc: 'AT', pallets: 11,
        notes: [{ tone: 'amber', text: '+ φορτώνει 1 π. για την Πόλη DE · μόνο στις σημειώσεις' }] },
      { kind: 'stop', act: 'unload', day: '2026-10-30', name: 'Παραλήπτης DE', city: 'Πόλη DE', cc: 'DE', pallets: 13 }] }] }) },
  { id: 'Δ17', family: 'Δ', title: 'Γεμίζει απόθεμα', build: (A) => A.facadeOrder(ord(920, 'Import', { Truck: [], Partner: ['recP1'] }),
    [st(1, 'Loading', '2026-10-27', 'rDE', 30), st(2, 'Unloading', '2026-10-30', 'rVER', 30)], C({ stockIn: 'παρτίδα 4 · Βέροια' })) },
  { id: 'Δ19', family: 'Δ', title: 'Εκτός ΕΕ · τελωνείο και σύνορα (μόνο σημειώσεις)', figma: '2310:7920', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΞΑΓΩΓΗ', chip: '#921', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 30, extra: ['8°'] },
      { kind: 'node', node: 'customs', name: 'Τελωνείο φόρτωσης', city: 'Πόλη Α', cc: 'GR' },
      { kind: 'node', node: 'border', name: 'Σύνορα GR → RS', extra: ['πράκτορας συνόρων'] },
      { kind: 'node', node: 'customs', name: 'Τελωνείο προορισμού', city: 'Πόλη RS', cc: 'RS' },
      { kind: 'stop', act: 'unload', day: '2026-10-29', name: 'Παραλήπτης RS', city: 'Πόλη RS', cc: 'RS', pallets: 30 }] }] }) },
  { id: 'Δ20', family: 'Δ', title: 'Φορτηγό πελάτη στη Βέροια · μεταφόρτωση', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΞΑΓΩΓΗ', chip: '#922', executors: [{ desk: 'intl', kind: 'client' }, { desk: 'intl', kind: 'own' }], rows: [
      { kind: 'handover', what: 'transship', day: '2026-10-27', place: 'Βέροια', meta: 'όχημα πελάτη → δικό μας φορτηγό' },
      { kind: 'stop', act: 'unload', day: '2026-10-29', name: 'Παραλήπτης PL', city: 'Πόλη PL', cc: 'PL', pallets: 26 }] }] }) },
  // ═══ Π · described by the owner, no data (CASES.md §Β) ═══
  { id: 'Π1', family: 'Π', title: 'Στάση στην Ελλάδα πριν από τη Βέροια (VS)', build: (A) => A.facadeOrder(ord(923, 'Import', { 'Veroia Switch': true }),
    [st(1, 'Loading', '2026-10-27', 'rAT1', 20), st(2, 'Loading', '2026-10-28', 'rGR3', 4), st(3, 'Cross-dock', '2026-10-28', null, 24),
      st(4, 'Unloading', '2026-10-29', 'rGR1', 24)], C({ natLeg: { ref: 'NL 923', kind: 'own' } })) },
  { id: 'Π2', family: 'Π', title: 'Το διεθνές συνεχίζει μόνο του μετά τη Βέροια', build: () => ({ today: TODAY, sections: [
    { title: 'ΕΙΣΑΓΩΓΗ', chip: '#924', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 20 },
      { kind: 'crossdock', day: '2026-10-29', pallets: 20 }] },
    { title: 'ΕΘΝΙΚΟ ΣΚΕΛΟΣ', chip: 'NL 924', executor: { desk: 'natl', kind: 'own', text: 'Εθνικών · το ίδιο διεθνές φορτηγό' }, rows: [
      { kind: 'stop', act: 'unload', day: '2026-10-29', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 20 }] }] }) },
  { id: 'Π4', family: 'Π', title: 'VS μοιράζεται σε 2 εθνικά φορτηγά (Π3/Π4)', figma: '2310:7921', build: () => ({ today: TODAY, sections: [
    { title: 'ΕΙΣΑΓΩΓΗ', chip: '#925', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-21', name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 25, extra: ['4°'], marked: true },
      { kind: 'crossdock', day: TODAY, pallets: 25 }] },
    { title: 'ΚΑΘΟΔΟΣ', chip: 'NL 925', executor: { desk: 'natl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'unload', day: '2026-10-27', tag: 'ΕΘΝΙΚΟ ΦΟΡΤΗΓΟ 2', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 5 },
      { kind: 'stop', act: 'unload', day: '2026-10-27', tag: 'ΕΘΝΙΚΟ ΦΟΡΤΗΓΟ 2', name: 'Πελάτης Β', city: 'Πόλη Β', cc: 'GR', pallets: 15 },
      { kind: 'stop', act: 'unload', day: '2026-10-27', tag: 'ΕΘΝΙΚΟ ΦΟΡΤΗΓΟ 3', name: 'Πελάτης Γ', city: 'Πόλη Γ', cc: 'GR', pallets: 5 }] }],
    kv: [['Παλέτες', '25 = 20 φορτηγό 2 · 5 φορτηγό 3']] }) },
  { id: 'Π5', family: 'Π', title: 'Πέρασε από τη Βέροια με το VS κλειστό', build: (A) => A.facadeOrder(ord(926, 'Import'),
    [st(1, 'Loading', '2026-10-27', 'rAT1', 22), st(2, 'Unloading', '2026-10-29', 'rGR1', 12), st(3, 'Unloading', '2026-10-29', 'rGR2', 10)], C()) },
  { id: 'Π6', family: 'Π', title: 'Μικτή εξαγωγή · εθνικά κομμάτια ενώνονται στη Βέροια', build: () => ({ today: TODAY, sections: [
    { title: 'ΑΝΟΔΟΣ', chip: 'NL 927', executor: { desk: 'natl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 10 },
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Πελάτης Β', city: 'Πόλη Β', cc: 'GR', pallets: 12 }] },
    { title: 'ΕΞΑΓΩΓΗ', chip: '#927', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'crossdock', day: '2026-10-28', pallets: 22 },
      { kind: 'stop', act: 'unload', day: '2026-10-30', name: 'Παραλήπτης DE', city: 'Πόλη DE', cc: 'DE', pallets: 22 }] }] }) },
  { id: 'Π8', family: 'Π', title: 'Τοπικός οδηγός στη φόρτωση', build: () => ({ today: TODAY, sections: [
    { title: 'ΑΝΟΔΟΣ', executor: { desk: 'natl', kind: 'local' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 8 },
      { kind: 'stop', act: 'unload', day: '2026-10-27', name: 'Βέροια', city: 'Veria', cc: 'GR', pallets: 8 }] }] }) },
  { id: 'Π9', family: 'Π', title: 'Εισαγωγή VS με διεθνή συνεργάτη ως τη Βέροια', build: (A) => A.facadeOrder(ord(929, 'Import', { 'Veroia Switch': true, Truck: [], Partner: ['recP1'] }),
    [st(1, 'Loading', '2026-10-27', 'rDE', 30), st(2, 'Cross-dock', '2026-10-29', null, 30), st(3, 'Unloading', '2026-10-30', 'rGR1', 30)],
    C({ natLeg: { ref: 'NL 929', kind: 'none' } })) },
  { id: 'Π11', family: 'Π', title: 'Αλλαγή εθνικού οχήματος · ίδια παραγγελία σε 2 σκέλη', figma: '2310:7922', build: () => ({ today: TODAY, sections: [
    { title: 'ΚΑΘΟΔΟΣ', rows: [
      { kind: 'stop', act: 'load', seg: 'initial', day: '2026-10-27', time: '06:00', name: 'Βέροια', extra: ['φορτηγό Α · οδηγός Α'] },
      { kind: 'handover', what: 'vehicle', day: '2026-10-27', time: '10:30', place: 'Πόλη Β', meta: 'τέλος σκέλους 1 · αρχή σκέλους 2 · ίδια παραγγελία' },
      { kind: 'stop', act: 'unload', seg: 'final', day: '2026-10-27', time: '14:00', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', extra: ['φορτηγό Β · οδηγός Β'] }] }] }) },
  // ═══ Ν · national (CASES.md §Γ), through the v5 board adapter ═══
  { id: 'Ν1', family: 'Ν', title: 'Εθνική σημείο σε σημείο', build: (A) => A.boardCycle(cyc([
    bs(11, 1, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-27', [leg('load', 12)]), bs(12, 2, 'KATHODOS', 902, 'Πελάτης Β', '2026-10-27', [leg('unload', 12)])]), B()) },
  { id: 'Ν2', family: 'Ν', title: 'Groupage καθόδου', build: (A) => A.boardCycle(cyc([
    bs(21, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('load', 8), leg('load', 6), leg('load', 4)]),
    bs(22, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-28', [leg('unload', 8)]), bs(23, 3, 'KATHODOS', 902, 'Πελάτης Β', '2026-10-28', [leg('unload', 6)]),
    bs(24, 4, 'KATHODOS', 903, 'Πελάτης Γ', '2026-10-28', [leg('unload', 4)])]), B()) },
  { id: 'Ν3', family: 'Ν', title: 'Εθνική ανόδου προς τη Βέροια', build: (A) => A.boardCycle(cyc([
    bs(31, 1, 'ANODOS', 901, 'Προμηθευτής Α', '2026-10-28', [leg('load', 18)]), bs(32, 2, 'ANODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-29', [leg('unload', 18)])]), B()) },
  { id: 'Ν4', family: 'Ν', title: 'Groupage ανόδου', build: (A) => A.boardCycle(cyc([
    bs(41, 1, 'ANODOS', 901, 'Προμηθευτής Α', '2026-10-28', [leg('load', 6)]), bs(42, 2, 'ANODOS', 902, 'Προμηθευτής Β', '2026-10-28', [leg('load', 9)]),
    bs(43, 3, 'ANODOS', 903, 'Προμηθευτής Γ', '2026-10-28', [leg('load', null)]), bs(44, 4, 'ANODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-29', [leg('unload', 6), leg('unload', 9), leg('unload', null)])]), B()) },
  { id: 'Ν5', family: 'Ν', title: 'Τοπικές κινήσεις γύρω από τη Βέροια', build: (A) => A.boardCycle(cyc([
    bs(51, 1, 'ANODOS', 904, 'Κοπανός', '2026-10-27', [leg('load', 4)]), bs(52, 2, 'ANODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('unload', 4)])], { code: 'RT-T5' }), B()) },
  { id: 'Ν6', family: 'Ν', title: 'Άδειες παλέτες από τη Βέροια', build: (A) => A.boardCycle(cyc([
    bs(61, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('load', 30)]), bs(62, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-27', [leg('unload', 30)])]), B()) },
  { id: 'Ν7', family: 'Ν', title: 'Εθνική με συνεργάτη', build: (A) => A.boardCycle(cyc([
    bs(71, 1, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-27', [leg('load', 20)]), bs(72, 2, 'KATHODOS', 902, 'Πελάτης Β', '2026-10-28', [leg('unload', 20)])],
    { trip_type: 'PARTNER', truck_id: null, truck: null, driver: null, driver_id: null, partner_id: 5, partner: 'ΣΥΝΕΡΓΑΤΗΣ Α' }), B()) },
  { id: 'Ν8', family: 'Ν', title: 'Απόθεμα στη Βέροια με εθνικό σκέλος', build: () => ({ today: TODAY, sections: [
    { title: 'ΚΑΘΟΔΟΣ', executor: { desk: 'natl', kind: 'own' }, rows: [
      { kind: 'node', node: 'stock-out', day: '2026-10-27', name: 'παρτίδα 4 · Βέροια', pallets: 6 },
      { kind: 'stop', act: 'unload', day: '2026-10-27', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 6 }] }] }) },
  // ═══ RT · one road trip (RT-CASES.md) ═══
  { id: 'RT0', family: 'RT', title: 'Άδειο ή ακυρωμένο', build: (A) => A.facadeRt([], C({ cancelled: true })) },
  { id: 'RT1', family: 'RT', title: 'Εξαγωγή + εισαγωγή VS (το frame του Figma)', figma: '2283:10025', build: (A) => A.facadeRt([
    { rec: ord(930, 'Export', { Status: 'Delivered' }), stops: [st(1, 'Loading', '2026-10-19', 'rGR1', 26, true), st(2, 'Unloading', '2026-10-21', 'rHR', 26, true)] },
    { rec: ord(931, 'Import', { 'Pallet Exchange': true, 'Veroia Switch': true }), ctx: { temp: '4°', natLeg: { ref: 'NL 931', kind: 'none' } }, stops: [
      st(1, 'Loading', '2026-10-23', 'rAT1', 23), st(2, 'Loading', '2026-10-23', 'rAT2', 9), st(3, 'Cross-dock', TODAY, null, 32),
      st(4, 'Unloading', '2026-10-27', 'rGR1', 13), st(5, 'Unloading', '2026-10-27', 'rGR2', 8), st(6, 'Unloading', '2026-10-27', 'rGR3', 11)] }], C()) },
  { id: 'RT2', family: 'RT', title: 'Μόνο εξαγωγή · άδεια επιστροφή', build: (A) => A.facadeRt([
    { rec: ord(932, 'Export'), stops: [st(1, 'Loading', '2026-10-27', 'rGR1', 33), st(2, 'Unloading', '2026-10-29', 'rDE', 33)] }], C()) },
  { id: 'RT3', family: 'RT', title: 'Μόνο εισαγωγή · άδεια μετάβαση', build: (A) => A.facadeRt([
    { rec: ord(933, 'Import'), stops: [st(1, 'Loading', '2026-10-28', 'rDE', 33), st(2, 'Unloading', '2026-10-30', 'rGR1', 33)] }], C()) },
  { id: 'RT4', family: 'RT', title: 'Groupage εισαγωγών', build: (A) => A.facadeRt([
    { rec: ord(934, 'Export'), stops: [st(1, 'Loading', '2026-10-24', 'rGR1', 30, true), st(2, 'Unloading', '2026-10-25', 'rDE', 30, true)] },
    { rec: ord(935, 'Import'), stops: [st(1, 'Loading', '2026-10-27', 'rAT1', 15), st(2, 'Unloading', '2026-10-29', 'rBG1', 15)] },
    { rec: ord(936, 'Import'), stops: [st(1, 'Loading', '2026-10-27', 'rAT2', 15), st(2, 'Unloading', '2026-10-29', 'rBG2', 15)] }], C()) },
  { id: 'RT5', family: 'RT', title: 'Groupage εξαγωγών (μία γραμμή ανά ομάδα)', figma: '2310:7925', build: () => ({ today: TODAY, sections: [
    { title: 'GROUPAGE ΕΞΑΓΩΓΩΝ · 3 παραγγελίες', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Πόλη Α · Πόλη Β · Πόλη Γ', cc: 'GR', pallets: 26, extra: ['#937 #938 #939'] },
      { kind: 'stop', act: 'unload', day: '2026-10-29', dayTo: '2026-10-30', name: 'BG · HU · AT', extra: ['6 σημεία', '26π'] }] },
    { title: 'ΕΙΣΑΓΩΓΗ', chip: '#940', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-31', name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 23 },
      { kind: 'stop', act: 'unload', day: '2026-11-02', name: 'Παραλήπτης BG1', city: 'Πόλη BG1', cc: 'BG', pallets: 23 }] }] }) },
  { id: 'RT6', family: 'RT', title: 'Groupage και στα δύο', build: (A) => A.facadeRt([
    { rec: ord(941, 'Export'), stops: [st(1, 'Loading', '2026-10-24', 'rGR1', 10, true), st(2, 'Unloading', '2026-10-25', 'rDE', 10, true)] },
    { rec: ord(942, 'Export'), stops: [st(1, 'Loading', '2026-10-24', 'rGR2', 20, true), st(2, 'Unloading', TODAY, 'rIT', 20)] },
    { rec: ord(943, 'Import'), stops: [st(1, 'Loading', '2026-10-27', 'rAT1', 12), st(2, 'Unloading', '2026-10-29', 'rGR1', 12)] },
    { rec: ord(944, 'Import'), stops: [st(1, 'Loading', '2026-10-27', 'rAT2', 18), st(2, 'Unloading', '2026-10-29', 'rGR2', 18)] }], C()) },
  { id: 'RT7', family: 'RT', title: 'Ρότα (επιπλέον σκέλος)', build: (A) => A.facadeRt([
    { rec: ord(945, 'Export', { 'Veroia Switch': true }), ctx: { natLeg: { ref: 'NL 945', kind: 'own' } }, stops: [st(1, 'Loading', '2026-10-21', 'rGR1', 20, true), st(2, 'Cross-dock', '2026-10-22', null, 20, true), st(3, 'Unloading', '2026-10-24', 'rDE', 20, true)] },
    { rec: ord(946, 'Export'), stops: [st(1, 'Loading', '2026-10-24', 'rDE', 30, true), st(2, 'Unloading', '2026-10-25', 'rPL', 30, true)] },
    { rec: ord(947, 'Import'), stops: [st(1, 'Loading', '2026-10-27', 'rPL', 30), st(2, 'Unloading', '2026-10-30', 'rGR1', 30)] }], C()) },
  { id: 'RT8', family: 'RT', title: 'Με σκέλος σπασίματος', build: (A) => A.facadeRt([
    { rec: ord(948, 'Export'), stops: [], ctx: { legs: [
      { rec: ord(949, 'Export'), stops: [st(1, 'Loading', '2026-10-21', 'rGR1', 21, true), st(2, 'Unloading', '2026-10-23', 'rSI', 21, true)] },
      { rec: ord(950, 'Export', { Truck: [], Partner: ['recP1'] }), stops: [st(1, 'Loading', '2026-10-23', 'rSI', 21, true), st(2, 'Unloading', '2026-10-25', 'rES', 21, true)] }] } },
    { rec: ord(951, 'Import'), stops: [st(1, 'Loading', '2026-10-27', 'rSI', 33), st(2, 'Unloading', '2026-10-29', 'rGR1', 33)] }], C()) },
  { id: 'RT9', family: 'RT', title: 'RT συνεργάτη', build: (A) => A.facadeRt([
    { rec: ord(952, 'Export', { Truck: [], Partner: ['recP1'] }), stops: [st(1, 'Loading', '2026-10-27', 'rGR1', 33), st(2, 'Unloading', '2026-10-29', 'rDE', 33)] },
    { rec: ord(953, 'Import', { Truck: [], Partner: ['recP1'] }), stops: [st(1, 'Loading', '2026-10-30', 'rDE', 33), st(2, 'Unloading', '2026-11-01', 'rGR1', 33)] }], C()) },
  { id: 'RT10', family: 'RT', title: 'Δύο RT του ίδιου φορτηγού επικαλύπτονται (δίπλα-δίπλα)', figma: '2310:7923', build: () => [
    { today: TODAY, sections: [{ title: 'ΕΙΣΑΓΩΓΗ', chip: '#954', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-23', name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 7, marked: true },
      { kind: 'stop', act: 'unload', day: '2026-10-25', overlap: true, name: 'Παραλήπτης BG1', city: 'Πόλη BG1', cc: 'BG', pallets: 7, marked: true }] }] },
    { today: TODAY, sections: [{ title: 'ΕΞΑΓΩΓΗ', chip: '#955', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-25', overlap: true, name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 32, marked: true },
      { kind: 'stop', act: 'unload', day: '2026-10-28', name: 'Παραλήπτης DE', city: 'Πόλη DE', cc: 'DE', pallets: 32 }] }] }] },
  { id: 'RT11', family: 'RT', title: 'Διεθνές φορτηγό σε εθνικό φορτίο (ημέρες επικάλυψης)', build: (A) => A.boardCycle(cyc([
    bs(111, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('load', 20, 'vs_import')]), bs(112, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-28', [leg('unload', 20, 'vs_import')])]),
    B({ overlapDays: ['2026-10-27', '2026-10-28'] })) },
  { id: 'RT12', family: 'RT', title: 'Εθνικός κύκλος κάθοδος + άνοδος', build: (A) => A.boardCycle(cyc([
    bs(121, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-24', [leg('load', 20, 'vs_import')], { executed: true }),
    bs(122, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-25', [leg('unload', 20, 'vs_import')]),
    bs(123, 3, 'ANODOS', 902, 'Προμηθευτής Β', TODAY, [leg('load', 14, 'vs_export')]),
    bs(124, 4, 'ANODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('unload', 14, 'vs_export')])]), B()) },
  { id: 'RT13', family: 'RT', title: 'Επιστροφή από Βουλγαρία μέσω Βέροιας (ρότα)', build: (A) => A.facadeRt([
    { rec: ord(956, 'Export'), stops: [st(1, 'Loading', '2026-10-20', 'rGR1', 26, true), st(2, 'Unloading', '2026-10-22', 'rDE', 26, true)] },
    { rec: ord(957, 'Import', { 'Veroia Switch': true }), ctx: { natLeg: { ref: 'NL 957', kind: 'own' } }, stops: [st(1, 'Loading', '2026-10-23', 'rDE', 20, true), st(2, 'Cross-dock', '2026-10-25', null, 20, true), st(3, 'Unloading', TODAY, 'rGR2', 20)] },
    { rec: ord(958, 'Import'), stops: [st(1, 'Loading', '2026-10-27', 'rBG1', 12), st(2, 'Unloading', '2026-10-28', 'rGR3', 12)] }], C()) },
  { id: 'RT14', family: 'RT', title: 'Μέρος του φορτίου σε αποθήκη τρίτου · το παίρνει άλλο RT', figma: '2310:7924', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΙΣΑΓΩΓΗ', chip: '#959', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-18', name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 26, marked: true },
      { kind: 'node', node: 'warehouse-pick', day: '2026-10-18', name: 'Αποθήκη τρίτου · εξωτερικό', notes: [{ tone: 'muted', text: '+ 7 π. από τα 16 της #917 (άλλο RT)' }] },
      { kind: 'stop', act: 'unload', day: '2026-10-20', name: 'Παραλήπτης BG1', city: 'Πόλη BG1', cc: 'BG', pallets: 33, marked: true }] }] }) },
  { id: 'RT15', family: 'RT', title: 'Διάδρομος εκτός ΕΕ, με τελωνείο', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΞΑΓΩΓΗ', chip: '#960', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-24', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 30, marked: true },
      { kind: 'node', node: 'border', name: 'Σύνορα GR → RS' },
      { kind: 'node', node: 'customs', name: 'Τελωνείο προορισμού', city: 'Πόλη RS', cc: 'RS' },
      { kind: 'stop', act: 'unload', day: '2026-10-25', name: 'Παραλήπτης RS', city: 'Πόλη RS', cc: 'RS', pallets: 30 }] }] }) },
  { id: 'RT16', family: 'RT', title: 'Η ρυμούλκα αλλάζει τράκτορα ανάμεσα σε RT (τρία δίπλα-δίπλα)', figma: '2310:7925', build: (A) => [
    A.facadeRt([{ rec: ord(961, 'Export'), stops: [st(1, 'Loading', '2026-10-17', 'rGR1', 26, true), st(2, 'Unloading', '2026-10-19', 'rHR', 26, true)] }], C()),
    A.facadeRt([{ rec: ord(962, 'Import'), stops: [st(1, 'Loading', '2026-10-20', 'rAT1', 29, true), st(2, 'Unloading', '2026-10-22', 'rBG1', 29, true)] }], C()),
    A.facadeRt([{ rec: ord(963, 'Export'), stops: [st(1, 'Loading', '2026-10-25', 'rGR2', 26, true), st(2, 'Unloading', TODAY, 'rPL', 26)] }], C())] },
  { id: 'RT17', family: 'RT', title: 'Αλλαγή εθνικού οχήματος · ΑΡΧΙΚΟ / ΤΕΛΙΚΟ', figma: '2310:7926', build: (A) => A.boardCycle(cyc([
    bs(171, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('load', 20)], { planned_from: at('2026-10-27', '06'), planned_to: at('2026-10-27', '07') }),
    bs(172, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-27', [leg('unload', 20)], { planned_from: at('2026-10-27', '14'), planned_to: at('2026-10-27', '15') }),
    bs(173, 3, 'ANODOS', 902, 'Προμηθευτής Β', '2026-10-27', [leg('load', 12)], { planned_from: at('2026-10-27', '17'), planned_to: at('2026-10-27', '18') }),
    bs(174, 4, 'ANODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-28', [leg('unload', 12)], { planned_from: at('2026-10-28', '06'), planned_to: at('2026-10-28', '07') })],
    { segments: [
      { segment_id: 1, label: 'initial', trip_type: 'OWNED', truck: 'φορτηγό Α', driver: 'οδηγός Α', has_vehicle: true, stop_ids: [171], from_at: at('2026-10-27', '05') },
      { segment_id: 2, label: 'final', trip_type: 'OWNED', truck: 'φορτηγό Β', driver: 'οδηγός Β', has_vehicle: true, stop_ids: [172, 173, 174],
        from_at: '2026-10-27T10:30:00+02:00', place_note: 'Πόλη Β', reason: 'planned_truck' }] }), B()) },
  { id: 'RT17b', family: 'RT', title: 'Αλλαγή οχήματος δύο φορές · ΑΡΧΙΚΟ / ΕΝΔΙΑΜΕΣΟ / ΤΕΛΙΚΟ', build: (A) => A.boardCycle(cyc([
    bs(181, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('load', 20)], { executed: true }),
    bs(182, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-28', [leg('unload', 10)]),
    bs(183, 3, 'KATHODOS', 902, 'Πελάτης Β', '2026-10-29', [leg('unload', 10)])],
    { segments: [
      { segment_id: 1, label: 'initial', trip_type: 'OWNED', truck: 'φορτηγό Α', driver: 'οδηγός Α', has_vehicle: true, stop_ids: [181] },
      { segment_id: 2, label: 'intermediate', trip_type: 'OWNED', truck: 'φορτηγό Β', driver: 'οδηγός Β', has_vehicle: true, stop_ids: [182],
        from_at: '2026-10-27T18:00:00+02:00', place_note: 'Πόλη Δ', reason: 'vehicle_breakdown' },
      { segment_id: 3, label: 'final', trip_type: 'PARTNER', partner: 'ΣΥΝΕΡΓΑΤΗΣ Α', has_vehicle: true, stop_ids: [183],
        from_at: '2026-10-28T20:00:00+02:00', place_note: 'Πόλη Ε', reason: 'driver_hours' }] }), B()) },
  { id: 'RT18', family: 'RT', title: 'Αλλαγή οδηγού στη μέση', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΞΑΓΩΓΗ', chip: '#964', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', seg: 'initial', day: '2026-10-27', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 33, extra: ['οδηγός Α'] },
      { kind: 'handover', what: 'driver', day: '2026-10-28', place: 'Πόλη HU', from: 'initial', to: 'final', reason: 'Προγραμματισμένη αλλαγή οδηγού' },
      { kind: 'stop', act: 'unload', seg: 'final', day: '2026-10-29', name: 'Παραλήπτης DE', city: 'Πόλη DE', cc: 'DE', pallets: 33, extra: ['οδηγός Β'] }] }] }) },
  { id: 'RT19', family: 'RT', title: 'Σκέλος με πλοίο (μόνο ως κείμενο)', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΞΑΓΩΓΗ', chip: '#965', executor: { desk: 'intl', kind: 'own', text: 'Διεθνών · δικό μας φορτηγό · πλοίο Ηγουμενίτσα → Μπάρι' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-27', name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 33 },
      { kind: 'stop', act: 'unload', day: '2026-10-29', name: 'Παραλήπτης IT', city: 'Πόλη IT', cc: 'IT', pallets: 33 }] }] }) },
  { id: 'RT20', family: 'RT', title: 'Εθνικό φορτηγό · μικτή κάθοδος και μικτή άνοδος', build: (A) => A.boardCycle(cyc([
    bs(201, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('load', 12, 'vs_import'), leg('load', 8)]),
    bs(202, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-27', [leg('unload', 12, 'vs_import')]),
    bs(203, 3, 'KATHODOS', 902, 'Πελάτης Β', '2026-10-27', [leg('unload', 8), leg('load', 5)]),
    bs(204, 4, 'ANODOS', 903, 'Προμηθευτής Γ', '2026-10-28', [leg('load', 10, 'vs_export')]),
    bs(205, 5, 'ANODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-28', [leg('unload', 10, 'vs_export'), leg('unload', 5)])]), B()) },
  // ═══ states (plan §4, PANEL.md) ═══
  { id: 'S-missed', family: 'S', title: 'Δεν σημειώθηκε · καθυστέρηση · χωρίς ημέρα', build: () => ({ today: TODAY, sections: [{
    title: 'ΕΙΣΑΓΩΓΗ', chip: '#966', executor: { desk: 'intl', kind: 'own' }, rows: [
      { kind: 'stop', act: 'load', day: '2026-10-23', name: 'Προμηθευτής AT1', city: 'Πόλη AT1', cc: 'AT', pallets: 20 },
      { kind: 'stop', act: 'load', day: '2026-10-27', late: true, name: 'Προμηθευτής AT2', city: 'Πόλη AT2', cc: 'AT', pallets: 10 },
      { kind: 'stop', act: 'unload', day: null, name: 'Πελάτης Α', city: 'Πόλη Α', cc: 'GR', pallets: 30 }] }] }) },
  { id: 'S-unassigned', family: 'S', title: 'Εθνικός κύκλος χωρίς όχημα (K10) · παλέτες άγνωστες', build: (A) => A.boardCycle(cyc([
    bs(301, 1, 'KATHODOS', HUB, 'ΒΕΡΟΙΑ', '2026-10-27', [leg('load', null, 'vs_import')], { has_vehicle: false }),
    bs(302, 2, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-27', [leg('unload', null, 'vs_import')], { has_vehicle: false })],
    { truck_id: null, truck: null, driver: null, driver_id: null }), B()) },
  { id: 'S-country', family: 'S', title: 'Χώρα; (τόπος χωρίς χώρα)', build: (A) => A.boardCycle(cyc([
    bs(401, 1, 'KATHODOS', 901, 'Πελάτης Α', '2026-10-27', [leg('load', 6)]), bs(402, 2, 'KATHODOS', 905, 'Τόπος χωρίς χώρα', '2026-10-27', [leg('unload', 6)])]),
    B({ countryOf: (id) => (id === 905 ? null : 'GR') })) },
  { id: 'S-K0', family: 'S', title: 'Παραγγελία χωρίς στάσεις (K0)', build: (A) => A.facadeOrder(ord(967, 'Import'), [], C()) },
  { id: 'S-vs-no-hub', family: 'S', title: 'VS χωρίς στάση cross-dock · εθνικό σκέλος δεν διαβάστηκε', build: (A) => [
    A.facadeOrder(ord(968, 'Import', { 'Veroia Switch': true }), [st(1, 'Loading', '2026-10-27', 'rAT1', 20), st(2, 'Unloading', '2026-10-29', 'rGR1', 20)], C()),
    A.facadeOrder(ord(969, 'Import', { 'Veroia Switch': true }), [st(1, 'Loading', '2026-10-27', 'rAT1', 20), st(2, 'Cross-dock', '2026-10-28', null, 20), st(3, 'Unloading', '2026-10-29', 'rGR1', 20)], C())] },
];

const out = { TODAY, HUB, LOC, cases };
if (typeof module !== 'undefined' && module.exports) module.exports = out;
if (typeof window !== 'undefined') window.RD_CASES = out;
})();
