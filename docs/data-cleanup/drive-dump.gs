/**
 * Google Apps Script — δίνει ΟΛΟ το δέντρο οχημάτων σε ένα CSV.
 * Χρήση: script.google.com → Νέο έργο → επικόλληση → Run → δες το Log,
 * ή άνοιξε το CSV που δημιουργείται στο Drive σου.
 * Γλιτώνει ~100 αιτήματα API και τρέχει σε δευτερόλεπτα.
 */
function dumpFleet() {
  var ROOTS = {
    'Τράκτορες': '10VPVhS-fedNhpjJt9RlZaJM2rhe5N3H1',
    'Θάλαμοι':   '1-vuWsm6d7On7FOQpAI7DjERnbncUCT_T'
  };
  var rows = [['ΟΜΑΔΑ','ΥΠΟΦΑΚΕΛΟΣ','ΟΧΗΜΑ','ΑΡΧΕΙΟ','ΤΥΠΟΣ','ΤΕΛ.ΤΡΟΠΟΠΟΙΗΣΗ']];
  for (var name in ROOTS) walk(DriveApp.getFolderById(ROOTS[name]), name, '', rows, 0);
  var csv = rows.map(function(r){
    return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');
  var f = DriveApp.createFile('FLEET_DUMP.csv', csv, MimeType.CSV);
  Logger.log('Έτοιμο: ' + f.getUrl());
}

function walk(folder, group, sub, rows, depth) {
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    // depth 0 = χώρα (Ελλάδα/Βουλγαρία), depth 1 = όχημα
    if (depth === 0) walk(s, group, s.getName(), rows, 1);
    else             walk(s, group, sub, rows, 2), listFiles(s, group, sub, s.getName(), rows);
  }
  if (depth >= 1) listFiles(folder, group, sub, folder.getName(), rows);
}

function listFiles(folder, group, sub, vehicle, rows) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    rows.push([group, sub, vehicle, f.getName(), f.getMimeType(),
               Utilities.formatDate(f.getLastUpdated(), 'Europe/Athens', 'yyyy-MM-dd')]);
  }
}
