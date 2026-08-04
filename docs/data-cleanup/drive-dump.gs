/**
 * Google Apps Script — δίνει ΟΛΟ το δέντρο οχημάτων σε ένα CSV.
 * script.google.com → New project → επικόλληση → Save → Run (dumpFleet).
 * Δημιουργεί FLEET_DUMP.csv στη ρίζα του Drive.
 */
function dumpFleet() {
  var ROOTS = {
    'Τράκτορες': '10VPVhS-fedNhpjJt9RlZaJM2rhe5N3H1',
    'Θάλαμοι':   '1-vuWsm6d7On7FOQpAI7DjERnbncUCT_T'
  };
  var rows = [['ΟΜΑΔΑ', 'ΔΙΑΔΡΟΜΗ', 'ΑΡΧΕΙΟ', 'ΗΜ_ΤΡΟΠΟΠΟΙΗΣΗΣ']];
  for (var name in ROOTS) {
    walk(DriveApp.getFolderById(ROOTS[name]), name, '', rows);
  }
  var csv = rows.map(function (r) {
    return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var file = DriveApp.createFile('FLEET_DUMP.csv', csv, MimeType.CSV);
  Logger.log('Γραμμές: ' + (rows.length - 1));
  Logger.log('Έτοιμο: ' + file.getUrl());
}

function walk(folder, group, path, rows) {
  var here = path ? path + ' / ' + folder.getName() : folder.getName();
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    rows.push([group, here, f.getName(),
               Utilities.formatDate(f.getLastUpdated(), 'Europe/Athens', 'yyyy-MM-dd')]);
  }
  var subs = folder.getFolders();
  while (subs.hasNext()) walk(subs.next(), group, here, rows);
}
