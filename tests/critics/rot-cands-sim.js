// Simulation of the REAL _wiRotCands (extracted verbatim from weekly_intl.js)
// over week-39 orders from Supabase (SELECT 22/9). Only orders loading >= 20/9
// can ever enter `cands` (oLoad >= pDeliv), so the row set below is the full
// relevant set; earlier rows never reach the slice.
const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'../../modules/weekly_intl.js'),'utf8');
const m=src.match(/function _wiRotCands\(parentRow,stats\)\{[\s\S]*?\n\}\n/); if(!m) throw new Error('fn not found');
const _wk3D=s=>s, _wiFmt=s=>s, _wk3Loc=s=>s;
const toLocalDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
// [id, legacy, dir, loading, delivery, matchedImportLegacy, summaryL, summaryD]
const O=[
 [361,'recWf1H51TfREdMPr','Export','2026-09-17','2026-09-20','recZZboddvxqUGmVs','Veroia','Stubenberg'],
 [364,'recZZboddvxqUGmVs','Import','2026-09-20','2026-09-22',null,'Stubenberg AT','Stryama BG'],
 [356,'recw03JXAZDp0dk7E','Export','2026-09-22','2026-09-24',null,'exp356',''],
 [360,'recyUM3qcpkHCLP2c','Export','2026-09-22','2026-09-24',null,'exp360',''],
 [365,'recoOHGLszEr0D72k','Import','2026-09-22','2026-09-24',null,'imp365',''],
 [366,'rec95siENW67Ct8zJ','Import','2026-09-22','2026-09-24',null,'Stubenberg AT','Stryama BG'],
 [357,'recz7ZkmZTtPV7Zqt','Export','2026-09-23','2026-09-25',null,'exp357',''],
 [367,'recWuez1l9317v4F4','Import','2026-09-23','2026-09-24',null,'MyDay BG','GR'],
 [358,'recv8SnYFiJJ8XJA0','Export','2026-09-24','2026-09-26',null,'exp358',''],
 [359,'recy0KVpDi591K3U8','Export','2026-09-24','2026-09-26',null,'exp359',''],
];
const rec=o=>({id:o[1],pg:o[0],fields:{'Direction':o[2],'Loading DateTime':o[3],'Delivery DateTime':o[4],'Matched Import ID':o[5]||undefined,'Loading Summary':o[6],'Delivery Summary':o[7]}});
const exports_=O.filter(o=>o[2]==='Export').map(rec).sort((a,b)=>(a.fields['Delivery DateTime']||a.fields['Loading DateTime']).localeCompare(b.fields['Delivery DateTime']||b.fields['Loading DateTime']));
const imports_=O.filter(o=>o[2]==='Import').map(rec).sort((a,b)=>a.fields['Loading DateTime'].localeCompare(b.fields['Loading DateTime']));
const ws='2026-09-19', we='2026-09-25'; let seq=0; const rows=[];
for(const e of exports_) rows.push({id:++seq,type:'export',orderId:e.id,orderIds:[e.id],importId:e.fields['Matched Import ID']||null});
const matchedMap={}; exports_.forEach(e=>{ if(e.fields['Matched Import ID']) matchedMap[e.fields['Matched Import ID']]=e.id; });
for(const i of imports_){ const ld=i.fields['Loading DateTime']; rows.push({id:++seq,type:'import',orderId:i.id,orderIds:[i.id],importId:null,matchedTo:matchedMap[i.id]||null,adj:!(ld>=ws&&ld<=we)}); }
const WINTL={rows,data:{exports:exports_,imports:imports_}};
const _wiRotCands=new Function('WINTL','_wk3D','_wiFmt','_wk3Loc','toLocalDate', m[0]+'; return _wiRotCands;')(WINTL,_wk3D,_wiFmt,_wk3Loc,toLocalDate);
const pgOf=lid=>O.find(o=>o[1]===lid)[0];
const RESULTS={};
for(const parentPg of [364,366,361]){
  const lid=O.find(o=>o[0]===parentPg)[1];
  const row=rows.find(r=>r.orderId===lid);
  const stats={}; const c=_wiRotCands(row,stats);
  console.log(`parent ${parentPg} (${row.type}) → ${c.length} cands: [${c.map(x=>pgOf(x.oid)).join(', ')}]  367 ${c.some(x=>pgOf(x.oid)===367)?'ΝΑΙ':'ΟΧΙ'}  stats ${JSON.stringify(stats)}`);
  RESULTS[parentPg]={n:c.length,has367:c.some(x=>pgOf(x.oid)===367)};
}
// ASSERTIONS (Παντελής 22/9, πρόταση α+β): γονέας 366 → η 367 μέσα (23/9 ≥ 24/9−1)· γονέας 364 → και οι 8, όχι 6.
const fails=[];
if(!RESULTS[366].has367) fails.push('366 → 367 λείπει');
if(RESULTS[364].n!==8) fails.push('364 → '+RESULTS[364].n+' αντί 8');
if(fails.length){ console.error('✗ '+fails.join(' · ')); process.exit(1); } else console.log('✓ assertions: 366→367 μέσα, 364→8');
// without slice: how many pass the date filter per parent
for(const parentPg of [364,366]){
  const p=O.find(o=>o[0]===parentPg); const pDeliv=p[4];
  const pass=O.filter(o=>o[0]!==parentPg&&o[3]>=pDeliv&&!(parentPg===364&&o[0]===361)).map(o=>o[0]);
  const cut=O.filter(o=>o[0]!==parentPg&&o[3]<pDeliv&&o[0]!==361&&o[0]!==364).map(o=>o[0]);
  console.log(`parent ${parentPg}: date filter passes ${pass.length} [${pass}] · cut by date: [${cut}]`);
}
