// P2 (22/9): a round trip closes only when EVERY leg is Delivered/Cancelled.
// Runs the REAL _rtOpenLegs (extracted from core/rt-feed.js) over the RT-1171
// shape: pair 361 (Export, Delivered) + 364 (Import, Delivered) + rotation leg
// 367 (Import, Pending) — before the fix the pair alone closed the trip.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../../core/rt-feed.js'),'utf8');
const m=src.match(/function _rtOpenLegs\(legsInfo, gathered\) \{[\s\S]*?\n\}\n/); if(!m) throw new Error('fn not found');
const _rtOpenLegs=new Function(m[0]+'; return _rtOpenLegs;')();
const rec=(id,st)=>({id,fields:{Status:st}});
const legs=[{orderId:'e361',direction:'EXPORT'},{orderId:'i364',direction:'IMPORT'},{orderId:'i367',direction:'IMPORT'}];
const before=_rtOpenLegs(legs,[rec('e361','Delivered'),rec('i364','Delivered'),rec('i367','Pending')]);
const after =_rtOpenLegs(legs,[rec('e361','Delivered'),rec('i364','Delivered'),rec('i367','Delivered')]);
const cancelled=_rtOpenLegs(legs,[rec('e361','Delivered'),rec('i364','Delivered'),rec('i367','Cancelled')]);
const unknown=_rtOpenLegs(legs,[rec('e361','Delivered'),rec('i364','Delivered')]);
console.log(JSON.stringify({before,after,cancelled,unknown}));
const fails=[];
if(JSON.stringify(before)!=='["i367"]') fails.push('Pending leg must keep the trip open');
if(after.length) fails.push('all Delivered must close');
if(cancelled.length) fails.push('Cancelled leg must not block closing');
if(JSON.stringify(unknown)!=='["i367"]') fails.push('unknown record must count as open');
if(fails.length){ console.error('✗ '+fails.join(' · ')); process.exit(1); } console.log('✓ rt-close-sim: 4/4');
