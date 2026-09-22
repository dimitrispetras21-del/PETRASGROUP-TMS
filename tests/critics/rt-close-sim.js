// Η ΣΥΜΒΑΣΗ ΜΕΤΑ ΤΗΝ 046 (owner 22/9): το status ενός round trip είναι παράγωγο
// των σκελών του και το βγάζει Η ΒΑΣΗ. Ο αυτόματος feed (core/rt-feed.js) ΔΕΝ
// κλείνει και ΔΕΝ ξανανοίγει γύρους — προσαρτά σκέλη και μιλάει.
//
// Μέχρι τις 22/9 ο ίδιος έλεγχος έτρεχε τον _rtOpenLegs (τον μετρητή ανοιχτών
// σκελών του front, RT-1171). Ο μετρητής έφυγε: ο ορισμός του «ανοιχτού
// σκέλους» ζει τώρα ΜΟΝΟ στην rt_auto_close (046). Ένα δεύτερο αντίγραφο εδώ
// θα απέκλινε — αρχή 3. Άρα ο έλεγχος αλλάζει στόχο: φρουρεί ότι το front δεν
// ξαναποκτά εξουσία πάνω στο status, και ότι κρατά όσα ΔΕΝ άλλαξαν.
const fs=require('fs'),path=require('path');
const rtFeed=fs.readFileSync(path.join(__dirname,'../../core/rt-feed.js'),'utf8');
const weekly=fs.readFileSync(path.join(__dirname,'../../modules/weekly_intl.js'),'utf8');
// σχόλια εκτός: μιλάμε για ΚΩΔΙΚΑ που τρέχει, όχι για κείμενο που τον εξηγεί
const code=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
const feedCode=code(rtFeed), weeklyCode=code(weekly);

const fails=[];
const checks={};

// 1. Καμία εγγραφή status σε round trip από τον feed (ούτε closed, ούτε planned).
checks.noStatusWrite=!/\/costs\/rt\/[^\n]*status:\s*'(closed|complete|planned)'/.test(feedCode);
if(!checks.noStatusWrite) fails.push('ο feed ξαναγράφει status σε round trip — η 046 το δίνει στη βάση');

// 2. Ο μετρητής ανοιχτών σκελών δεν ξαναγεννιέται στο front.
checks.noOpenLegsCounter=!/function\s+_rtOpenLegs/.test(feedCode);
if(!checks.noOpenLegsCounter) fails.push('ο _rtOpenLegs επέστρεψε στο front — ένας ορισμός, στη βάση');

// 3. Η ΑΚΥΡΩΣΗ κλεισμένου γύρου μένει απαγορευμένη: _rtClosed ζει ακόμη και
//    φρουρεί το cancelled-μονοπάτι (πραγματικό οικονομικό ιστορικό).
checks.closedStillGuarded=/_rtClosed\(rt\)\s*&&\s*\(gone\s*\|\|\s*!exec\)/.test(feedCode)
  && /_rtClosed\s*=\s*rt\s*=>/.test(feedCode);
if(!checks.closedStillGuarded) fails.push('έφυγε ο φρουρός: κλεισμένος γύρος δεν ακυρώνεται/δεν πειράζεται αυτόματα');

// 4. Weekly Διεθνών: η ρότα ΔΕΝ αναιρεί πια το Rotation ID επειδή ο γονέας
//    είναι κλειστός (η βάση ξανανοίγει) — δεν υπάρχει τέτοιο μήνυμα.
checks.weeklyNoClosedRevert=!/κλειστός\s*—\s*ξανάνοιγμα από Μισθοδοσία/.test(weeklyCode);
if(!checks.weeklyNoClosedRevert) fails.push('το weekly_intl αναιρεί ακόμη τη ρότα σε κλειστό γύρο');

// 5. …αλλά ο φρουρός ορφανής ρότας (γονέας έχει RT, το σκέλος δεν μπήκε) μένει.
checks.weeklyOrphanGuard=/if\(parentRt&&!attached\)/.test(weeklyCode);
if(!checks.weeklyOrphanGuard) fails.push('έφυγε ο φρουρός ορφανής ρότας του _wiRotAdd');

console.log(JSON.stringify(checks));
if(fails.length){ console.error('✗ '+fails.join(' · ')); process.exit(1); }
console.log('✓ rt-close-sim: 5/5 — το front δεν κλείνει γύρους, η βάση τους κλείνει');
