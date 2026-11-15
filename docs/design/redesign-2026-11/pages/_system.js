/* Shared helpers copied unchanged from ../index.html (script, lines 821-831, 855-858, 901-907, 1192). trk and need follow index.html of PR 316 (assignment box without icon, 15/11). DESIGN MOCKUP ONLY. */
const ic=n=>`<i data-lucide="${n}"></i>`,$=id=>document.getElementById(id);
const NAV=[['ΣΧΕΔΙΑΣΜΟΣ',[['globe','Εβδομαδιαίο Διεθνών','wi'],['map','Εβδομαδιαίο Εθνικών','wn'],['calendar-days','Ημερήσιο','d'],['warehouse','Ράμπα','r']]],
 ['ΔΟΥΛΕΙΑ',[['file-text','Παραγγελίες','o','10'],['package','Παλέτες','p','4']]],
 ['ΟΙΚΟΝΟΜΙΚΑ',[['receipt','Έξοδα δρομολογίων','e'],['coins','Μισθοδοσία','m']]],
 ['ΣΤΟΛΟΣ',[['truck','Οχήματα','t'],['wrench','Συντήρηση','s','2']]],
 ['ΣΤΟΙΧΕΙΑ',[['users','Πελάτες','c'],['briefcase','Συνεργάτες','pa'],['map-pin','Τοποθεσίες','l']]]];
function side(on){return `<aside class="side"><div class="lg"><span class="logo full" role="img" aria-label="Petras Group"></span><span class="logo mark"></span></div>`+
 NAV.map(([g,it],i)=>`${i?'<hr>':''}<h4>${g}</h4>`+it.map(([icn,l,id,n])=>`<a class="${id===on?'on':''}" title="${l}">${ic(icn)}<span>${l}</span>${n?`<em>${n}</em>`:''}</a>`).join('')).join('')+
 `<div class="me"><span class="av">ΔΠ</span><div>Δημήτρης Π.<small>Owner</small></div></div></aside>`}
const two=(a,b,c='')=>`<div class="two ${c}"><b><span class="el">${a}</span></b><span>${b}</span></div>`;
const tags=t=>t.split(' ').filter(Boolean).map(x=>`<span class="tag" title="${(typeof TG!=='undefined'&&TG[x])||''}">${x}</span>`).join('');
const ST={todo:'Σε αναμονή',asg:'Ανατέθηκε',run:'Σε μεταφορά',done:'Παραδόθηκε',can:'Ακυρώθηκε',pre:'Pre-order'};
const stt=(s,box)=>s==='pre'?`<span class="tag" style="margin:0;color:var(--amber);border-color:var(--amber-line);font-weight:600" title="Λείπουν: τόπος φόρτωσης, τόπος παράδοσης">PRE</span>`:`<span class="st ${s==='can'?'off':s} ${box?'box':''}">${s==='done'?ic('check'):''}${ST[s]}</span>`;
function asg(k,t){ if(k==='x')return `<div class="as x"><span class="tile e" style="border-color:transparent"></span><div class="two"><b>–</b></div></div>`;
 if(k==='o')return `<div class="as" title="Δεν έχει εθνικό φορτίο"><span class="tile need">${ic('circle-alert')}</span><div class="two"><b style="color:var(--red)">Εκτός πίνακα</b><span><a style="color:var(--link);font-weight:600">Στείλε →</a></span></div></div>`;
 if(k==='e')return `<div class="as x"><span class="tile e" title="Προς ανάθεση">${ic('plus')}</span><div class="two"><b>Προς ανάθεση</b></div></div>`;
 const [a,b]=t.split('|');return `<div class="as" title="${a} · ${b}"><span class="tile ${k==='p'?'p':''}">${ic(k==='p'?'users':'truck')}</span><div class="two"><b class="num">${a}</b><span>${b}</span></div></div>`}
const P=n=>{if(typeof n==='string')return `<span class="pal" title="Σε ένα σημείο οι παλέτες δεν είναι γνωστές"><b class="num">${n}</b><span class="m" style="background:none;height:0;border-top:2px dotted #A9ABB3"></span></span>`;const ov=n>33;return `<span class="pal ${ov?'over':''}"><b class="num">${n}</b><span class="m"><i style="--f:${Math.min(1,n/33).toFixed(2)}"></i></span>${ov?`<sup>+${n-33}</sup>`:''}</span>`};
const d=t=>`<span class="dt">${t}</span>`;
const trk=(a,b,k)=>`<div class="as asb ${k||''}" title="${k==='p'?'Συνεργάτης':'Δικό μας'}"><div class="two"><b class="num">${a}</b><span>${b}</span></div></div>`;
const need=`<div class="as asb need"><div class="two"><b style="color:var(--red)">Ανάθεση</b></div></div>`;
const slotD=`<div class="slot">${ic('arrow-down')}<span class="plus">${ic('plus')}</span></div>`;
const slotA=t=>`<div class="slot a">${ic('undo-2')}${t}<span class="plus" style="border-color:var(--amber-line);color:var(--amber);background:none">${ic('plus')}</span></div>`;
const c2=(a,t,b)=>`<div class="two"><b><span class="el">${a}</span>${tags(t)}</b><span>${b}</span></div>`;
const RED=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function fit(){document.querySelectorAll('.fit').forEach(w=>{const f=w.firstElementChild,s=Math.min(1,w.clientWidth/1440);f.style.transform=`scale(${s})`;w.style.height=f.offsetHeight*s+'px'})}
function boot(){lucide.createIcons();addEventListener('resize',fit);fit()}
