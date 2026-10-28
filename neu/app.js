// app.js — Oberfläche des neuen Cockpits: Filter, Navigation, Seiten.
// Die Daten und Berechnungen kommen aus data.js (D, aS, aM, getActiveMonths …).

// ── Seiten ───────────────────────────────────────────────────────────────
// Bereiche, die noch nicht umgebaut sind, verweisen auf die alte Ansicht.
const PAGES=[
  {id:'uebersicht',l:'Übersicht'},
  {id:'erbracht',l:'Erbracht',alt:true},
  {id:'vorschau',l:'Jahresvorschau',alt:true},
  {id:'planist',l:'Plan vs. Ist',alt:true},
  {id:'auslastung',l:'Auslastung',alt:true},
  {id:'termine',l:'Terminvergabe',alt:true},
  {id:'therapeuten',l:'Therapeuten',alt:true},
  {id:'krankenstand',l:'Krankenstand',alt:true},
  {id:'bwa',l:'BWA',alt:true},
  {id:'cashflow',l:'Cashflow',alt:true},
  {id:'liquiditaet',l:'Liquidität',alt:true}
];
aM='AKTUELL';// Standard: laufender Monat eingeschlossen
let page=(location.hash||'#uebersicht').slice(1);
if(!PAGES.some(p=>p.id===page))page='uebersicht';
window.addEventListener('hashchange',()=>{page=(location.hash||'#uebersicht').slice(1);if(!PAGES.some(p=>p.id===page))page='uebersicht';rNav();rPage();});

function renderMainTabs(){}// vom Lader aufgerufen; im neuen Gerüst ohne Funktion
function RA(){
  rFilter();rNav();rPage();
  const s=document.getElementById('stand');
  if(s)s.textContent='Stand '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
}
function setM(m){aM=m;RA();}
function setS(s){aS=s;RA();}

// ── Helfer ───────────────────────────────────────────────────────────────
const SITE_COL={'KIMOJO Physio':'var(--primary)','KIMOJO Ergo':'var(--accent)','PF im Park':'var(--teal)'};
const n0=x=>Math.round(x||0).toLocaleString('de-DE');
const n1=x=>(Math.round((x||0)*10)/10).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});
const eur0=x=>n0(x)+' €';
const pctS=x=>x==null?'—':n1(x)+' %';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ymdP=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const heute=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
function montag(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
function plusTage(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function ausYmd(s){const p=String(s).split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);}
const fDat=d=>d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'});
function sitesAktiv(){if(aS==='Alle')return AUSL_SITES.slice();if(aS==='KIMOJO Gesamt')return['KIMOJO Physio','KIMOJO Ergo'];return[aS];}
function siteTag(s){return`<span class="site"><span class="dot" style="background:${SITE_COL[s]||'#999'}"></span>${esc(sn(s))}</span>`;}
function tageImZeitraum(months){
  const jahr=new Date().getFullYear(),out=[];
  months.forEach(m=>{const mi=MN.indexOf(m);if(mi<0)return;const n=new Date(jahr,mi+1,0).getDate();for(let d=1;d<=n;d++)out.push(ymdP(new Date(jahr,mi,d)));});
  return out;
}
function zeitraumLabel(){
  const months=getActiveMonths();
  if(aM==='YTD')return'Jahr bis '+(months.length?months[months.length-1]:'heute');
  if(aM==='AKTUELL')return'Jan – '+MN[new Date().getMonth()]+' (laufend)';
  return aM+' '+new Date().getFullYear();
}
const ampelPill=(v,g,a,inv)=>{if(v==null)return'<span class="pill p-n">—</span>';const ok=inv?v<=g:v>=g,mid=inv?v<=a:v>=a;return`<span class="pill ${ok?'p-g':mid?'p-a':'p-r'}">${n1(v)}${inv===undefined||inv===false?' %':''}</span>`;};
const planPill=(ist,plan)=>{if(!plan)return'';const d=(ist-plan)/Math.abs(plan)*100;return`<span class="pill ${d>=0?'p-g':'p-r'}">${d>=0?'+':''}${n1(d)} % zum Plan ${fmK(plan)}</span>`;};

// ── Filter und Navigation ────────────────────────────────────────────────
function rFilter(){
  const el=document.getElementById('filters');if(!el)return;
  const rawMonths=new Set(D.raw.map(r=>r.month).filter(Boolean).map(m=>MN[m-1]));
  const bwaMonths=new Set([...getBWAMonths(D.bwaK).map(x=>x.month),...getBWAMonths(D.bwaP).map(x=>x.month)]);
  const avail=new Set([...bwaMonths,...rawMonths]);
  let h='<div class="seg">';
  h+=`<button class="${aM==='YTD'?'a':''}" onclick="setM('YTD')">YTD</button>`;
  h+=`<button class="${aM==='AKTUELL'?'a':''}" onclick="setM('AKTUELL')">Aktuell</button>`;
  MN.forEach(m=>{if(avail.has(m))h+=`<button class="${aM===m?'a':''}" onclick="setM('${m}')">${m}</button>`;});
  h+='</div><div class="chips">';
  ['Alle','KIMOJO Gesamt','KIMOJO Physio','KIMOJO Ergo','PF im Park'].forEach(s=>{
    h+=`<button class="chip${aS===s?' a':''}" onclick="setS('${s}')">${s!=='Alle'&&s!=='KIMOJO Gesamt'?`<span class="dot" style="background:${SITE_COL[s]}"></span>`:''}${esc(sn(s))}</button>`;
  });
  h+='</div>';
  el.innerHTML=h;
}
function rNav(){
  const el=document.getElementById('nav');if(!el)return;
  el.innerHTML=PAGES.map(p=>`<button class="${p.id===page?'a':''}${p.alt?' alt':''}" onclick="location.hash='${p.id}'">${esc(p.l)}</button>`).join('');
}
function rPage(){
  const el=document.getElementById('page');if(!el)return;
  const p=PAGES.find(x=>x.id===page)||PAGES[0];
  el.innerHTML=p.id==='uebersicht'?pUebersicht():pAlt(p);
  window.scrollTo({top:0});
}
function pAlt(p){
  return`<div class="sec"><div class="alt-box"><h3>${esc(p.l)}</h3><p>Dieser Bereich wird als Nächstes umgebaut. Bis dahin steht er in der <a href="../">alten Ansicht</a>.</p></div></div>`;
}

// ── Übersicht ────────────────────────────────────────────────────────────
function pUebersicht(){
  return secUmsatz()+secAnfragen()+secClub()+secAuslastung();
}

// 1 · Umsatz erbracht: jeder Kalender-Slot mit seinem Heilmittelwert (thevea
//     für Werneck, Medifox für Kitzingen ohne Club/T-RENA/Kurse).
function secUmsatz(){
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1);
  const therapists=D.ctrl.filter(t=>matchS(t.s)),theraNames=new Set(therapists.map(t=>t.n));
  const rows=D.raw.filter(r=>monthNums.includes(r.month)&&tvRowPasst(r,theraNames));
  const jetzt=new Date();let ges=0,bis=0,zuk=0;const bySite={},agg={};
  rows.forEach(r=>{ges+=r.price;if(r.datum&&r.datum>jetzt)zuk+=r.price;else bis+=r.price;const s=rowSite(r);bySite[s]=(bySite[s]||0)+r.price;agg[r.name]=(agg[r.name]||0)+r.price;});
  const std=therapists.reduce((o,t)=>{const rev=agg[t.n]||0;if(rev<=0)return o;const s=tvStdSumme(t,months);o.rev+=rev;o.soll+=s.soll;o.anw+=s.anw;return o;},{rev:0,soll:0,anw:0});
  const ephV=std.soll>0?std.rev/std.soll:0,ephA=std.anw>0?std.rev/std.anw:0;
  const planEin=getPlanForMonths(months,'einnahmen');
  const amp=v=>v>=65?'c-g':v>=56?'c-a':'c-r';
  let h=`<section class="sec"><div class="sec-h"><h2>Umsatz erbracht</h2><span class="sub">${esc(zeitraumLabel())} · ${esc(sn(aS))}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Umsatz erbracht</div><div class="v">${eur0(ges)}</div><div class="s">davon <b>${eur0(bis)}</b> bereits erbracht · <b>${eur0(zuk)}</b> geplant bis Monatsende</div>${planEin?`<div class="s">${planPill(ges,planEin)}</div>`:''}</div>`;
  const sites=sitesAktiv().filter(s=>bySite[s]);
  if(sites.length>1)h+=`<div class="kpi"><div class="l">Nach Standort</div>${sites.map(s=>`<div class="s" style="display:flex;justify-content:space-between;gap:8px;margin-top:6px">${siteTag(s)}<b>${eur0(bySite[s])}</b></div>`).join('')}</div>`;
  h+=`<div class="kpi"><div class="l">€ je Vertragsstunde</div><div class="v ${amp(ephV)}">${n1(ephV)} €</div><div class="s">Umsatz ÷ Soll-Stunden (${n0(std.soll)} h) · Ziel ≥ 65</div></div>`;
  h+=`<div class="kpi"><div class="l">€ je anwesender Stunde</div><div class="v ${amp(ephA)}">${n1(ephA)} €</div><div class="s">ohne Urlaub, Krankheit, Fortbildung (${n0(std.anw)} h)</div></div>`;
  h+='</div>';
  if(D.thevea&&D.thevea.bis)h+=`<p class="hint">Stattgefunden bis ${D.thevea.bis.toLocaleDateString('de-DE')} · Kitzingen aus Medifox ohne Club, T-RENA und Präventionskurse.</p>`;
  return h+'</section>';
}

// 2 · Terminanfragen aus dem Weekly Tracker: „Termine vereinbart“ je Tag
//     und davon Neuanfragen. Eine leere Zeile ist kein Tag mit null Terminen.
function secAnfragen(){
  const tt=D.trackerTage||{};
  const quellen=[{site:'KIMOJO Physio',d:tt.physio||[]},{site:'KIMOJO Ergo',d:tt.ergo||[]},{site:'PF im Park',d:tt.phfip||[]}].filter(q=>sitesAktiv().includes(q.site));
  const months=getActiveMonths(),zr=new Set(tageImZeitraum(months));
  const h0=heute(),h0s=ymdP(h0),wMo=ymdP(montag(h0)),vMo=ymdP(plusTage(montag(h0),-7)),vSo=ymdP(plusTage(montag(h0),-1));
  let h=`<section class="sec"><div class="sec-h"><h2>Terminanfragen</h2><span class="sub">Termine vereinbart · davon Neuanfragen</span></div>`;
  if(!quellen.some(q=>q.d.length))return h+'<div class="empty">Keine Tracker-Einträge für die aktuelle Auswahl.</div></section>';
  const sum=(arr,f)=>arr.reduce((s,x)=>s+(x[f]||0),0);
  const tot={tag:0,neuTag:0,wo:0,neuWo:0,vw:0,neuVw:0,zr:0,neuZr:0,wochen:new Set()};
  let rowsH='';
  quellen.forEach(q=>{
    const letzte=q.d.filter(x=>x.ds<=h0s).slice(-1)[0];
    const wo=q.d.filter(x=>x.ds>=wMo&&x.ds<=h0s),vw=q.d.filter(x=>x.ds>=vMo&&x.ds<=vSo),inZr=q.d.filter(x=>x.ds>=h0s?false:zr.has(x.ds));
    const wochen=new Set(inZr.map(x=>tvWoche(ausYmd(x.ds))));
    const oWo=wochen.size?sum(inZr,'vereinbart')/wochen.size:null;
    tot.tag+=letzte?letzte.vereinbart||0:0;tot.neuTag+=letzte?letzte.neu||0:0;tot.wo+=sum(wo,'vereinbart');tot.neuWo+=sum(wo,'neu');tot.vw+=sum(vw,'vereinbart');tot.neuVw+=sum(vw,'neu');tot.zr+=sum(inZr,'vereinbart');tot.neuZr+=sum(inZr,'neu');wochen.forEach(w=>tot.wochen.add(w));
    rowsH+=`<tr><td>${siteTag(q.site)}</td><td class="r">${letzte?esc(fDat(ausYmd(letzte.ds))):'—'}</td><td class="r"><b>${letzte?n0(letzte.vereinbart):'—'}</b></td><td class="r">${letzte&&letzte.neu!=null?n0(letzte.neu):'—'}</td><td class="r"><b>${n0(sum(wo,'vereinbart'))}</b> <span class="c-m">(${n0(sum(wo,'neu'))})</span></td><td class="r">${n0(sum(vw,'vereinbart'))} <span class="c-m">(${n0(sum(vw,'neu'))})</span></td><td class="r"><b>${oWo==null?'—':n1(oWo)}</b></td><td class="r">${n0(sum(inZr,'neu'))}</td></tr>`;
  });
  const oTot=tot.wochen.size?tot.zr/tot.wochen.size:null;
  h+=`<div class="grid">`+
    `<div class="kpi"><div class="l">Letzter Tag</div><div class="v">${n0(tot.tag)}</div><div class="s">davon <b>${n0(tot.neuTag)}</b> Neuanfragen</div></div>`+
    `<div class="kpi"><div class="l">Diese Woche</div><div class="v">${n0(tot.wo)}</div><div class="s">Vorwoche <b>${n0(tot.vw)}</b> · neu <b>${n0(tot.neuWo)}</b></div></div>`+
    `<div class="kpi"><div class="l">ø je Woche</div><div class="v">${oTot==null?'—':n1(oTot)}</div><div class="s">${esc(zeitraumLabel())} · ${tot.wochen.size} Wochen</div></div>`+
    `<div class="kpi"><div class="l">Neuanfragen</div><div class="v">${n0(tot.neuZr)}</div><div class="s">${esc(zeitraumLabel())} · von ${n0(tot.zr)} Terminen</div></div>`+
    `</div>`;
  h+=`<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Standort</th><th class="r">Letzter Tag</th><th class="r">Termine</th><th class="r">davon neu</th><th class="r">Diese Woche (neu)</th><th class="r">Vorwoche (neu)</th><th class="r">ø je Woche</th><th class="r">Neuanfragen Zeitraum</th></tr></thead><tbody>${rowsH}</tbody></table></div>`;
  const letzter=quellen.map(q=>q.d.filter(x=>x.ds<=h0s).slice(-1)[0]).filter(Boolean).map(x=>x.ds).sort().pop();
  if(letzter&&letzter<ymdP(plusTage(h0,-14)))h+=`<p class="hint c-r">Der Tracker ist seit dem ${esc(fDat(ausYmd(letzter)))} nicht mehr gepflegt – die Werte oben sind entsprechend alt.</p>`;
  h+=`<p class="hint">Quelle: Weekly KPI Tracker, Spalten „Termine vereinbart“ und „davon Neuaufnahmen/Neuanfragen“ je Tag. Tage ohne Eintrag fehlen und zählen nicht als null.</p>`;
  return h+'</section>';
}

// 3 · Club-Abschlüsse aus den MyWellness-Gesprächen (1.–3. Gespräch).
function secClub(){
  const mw=(D.mw||[]).filter(mwPasst);
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1),jahr=new Date().getFullYear();
  const zr=mw.filter(e=>e.dt.getFullYear()===jahr&&monthNums.includes(e.dt.getMonth()+1));
  const mo=montag(heute()),wo=mw.filter(e=>e.dt>=mo);
  const c=(arr,...ks)=>arr.filter(e=>ks.includes(e.erg)).length;
  let h=`<section class="sec"><div class="sec-h"><h2>Club-Abschlüsse</h2><span class="sub">${esc(zeitraumLabel())} · Gespräche nach Rezeptende</span></div>`;
  if(!mw.length)return h+'<div class="empty">Noch keine MyWellness-Gespräche für die aktuelle Auswahl.</div></section>';
  const ab=zr.filter(e=>e.ab).length,quote=zr.length?ab/zr.length*100:null;
  h+='<div class="grid">'+
    `<div class="kpi"><div class="l">Club-Mitgliedschaften</div><div class="v c-g">${n0(c(zr,'club'))}</div><div class="s">diese Woche <b>${n0(c(wo,'club'))}</b></div></div>`+
    `<div class="kpi"><div class="l">Präventionskurse</div><div class="v">${n0(c(zr,'praev8','praev16'))}</div><div class="s">8 Wochen <b>${n0(c(zr,'praev8'))}</b> · 16 Wochen <b>${n0(c(zr,'praev16'))}</b> · diese Woche <b>${n0(c(wo,'praev8','praev16'))}</b></div></div>`+
    `<div class="kpi"><div class="l">T-RENA · R+V Fit</div><div class="v">${n0(c(zr,'trena'))} · ${n0(c(zr,'rv'))}</div><div class="s">diese Woche <b>${n0(c(wo,'trena'))}</b> · <b>${n0(c(wo,'rv'))}</b></div></div>`+
    `<div class="kpi"><div class="l">Gespräche</div><div class="v">${n0(zr.length)}</div><div class="s">Abschlussquote <b>${pctS(quote)}</b> · Folgegespräch offen <b>${n0(c(zr,'folgeg'))}</b></div></div>`+
    '</div>';
  if(aS==='Alle'){
    const orte=[...new Set(mw.map(e=>e.standort))].sort();
    h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Standort</th><th class="r">Gespräche</th><th class="r">Club</th><th class="r">Prävention</th><th class="r">T-RENA</th><th class="r">R+V</th><th class="r">Quote</th></tr></thead><tbody>';
    orte.forEach(o=>{const z=zr.filter(e=>e.standort===o);const a=z.filter(e=>e.ab).length;h+=`<tr><td>${esc(o||'ohne Standort')}</td><td class="r">${n0(z.length)}</td><td class="r"><b>${n0(c(z,'club'))}</b></td><td class="r">${n0(c(z,'praev8','praev16'))}</td><td class="r">${n0(c(z,'trena'))}</td><td class="r">${n0(c(z,'rv'))}</td><td class="r">${pctS(z.length?a/z.length*100:null)}</td></tr>`;});
    h+='</tbody></table></div>';
  }
  h+='<p class="hint">Quelle: MyWellness-Exporte unter Controlling/MyWellness, je Person und Gesprächsstufe der jüngste Stand. Club zählt als Abschluss; Kurse, T-RENA und R+V sind Stationen auf dem Weg dorthin.</p>';
  return h+'</section>';
}

// 4 · Auslastung je Tag und Standort.
//     Werneck: Messung des Patientenchecker-Praxismanagements (bereinigte
//     Auslastung = geplante Patientenminuten ÷ verfügbare Minuten ohne
//     Blocker, Pausen und Fahrzeiten; brutto = ÷ Arbeitsminuten).
//     Kitzingen: gebuchte Patientenminuten ÷ anwesende Soll-Minuten aus
//     Medifox, weil es dort keine Patientenchecker-Messung gibt.
const PC_LOC={'KIMOJO Physio':'wp','KIMOJO Ergo':'we'};
function pcTag(ymd,site){
  const q=D.kenn&&D.kenn.werneck;const k=PC_LOC[site];if(!q||!k)return null;
  const t=(q.tage||[]).find(x=>x.ds===ymd);const h=t&&t.loc&&t.loc[k]&&t.loc[k].heute;
  if(!h||!(h.wm>0))return null;
  return{geb:h.pg||0,kap:h.vm||0,kapBrutto:h.wm||0,pct:h.vm>0?(h.pg||0)/h.vm*100:null,brutto:h.wm>0?(h.pg||0)/h.wm*100:null};
}
// Ein Tag, egal welche Quelle: {pct, geb, kap, quelle, brutto?, offen?}
function auslWert(ymd,site){
  if(PC_LOC[site]){const p=pcTag(ymd,site);return p?Object.assign(p,{quelle:'pc'}):{pct:null,geb:0,kap:0,quelle:'pc',fehlt:true};}
  const a=auslTag(ymd,site);return{pct:a.pct,geb:a.gebucht,kap:a.anw,quelle:'kal',offen:a.offen,keineDaten:a.keineDaten};
}
function auslSumme(tage,site){
  let geb=0,kap=0;tage.forEach(y=>{const a=auslWert(y,site);if(a.pct===null)return;geb+=a.geb;kap+=a.kap;});
  return kap>0?geb/kap*100:null;
}
function secAuslastung(){
  const sites=sitesAktiv();const h0=heute();
  const tage=[];for(let d=new Date(h0);tage.length<10;d=plusTage(d,-1)){if(d.getDay()>=1&&d.getDay()<=5)tage.unshift(ymdP(d));}
  const woche=[];for(let i=0;i<5;i++)woche.push(ymdP(plusTage(montag(h0),i)));
  const vorwoche=woche.map(y=>ymdP(plusTage(ausYmd(y),-7)));
  const zr=tageImZeitraum(getActiveMonths()).filter(y=>{const d=ausYmd(y).getDay();return d>=1&&d<=5&&y<ymdP(h0);});
  const amp=v=>ampelPill(v,90,80);
  let h=`<section class="sec"><div class="sec-h"><h2>Auslastung</h2><span class="sub">Werneck: Patientenchecker, bereinigt · Kitzingen: Kalender</span></div>`;
  h+='<div class="grid g3">';
  sites.forEach(s=>{
    h+=`<div class="kpi"><div class="l">${siteTag(s)}</div><div class="v">${pctS(auslSumme(woche,s))}</div><div class="s">diese Woche · Vorwoche <b>${pctS(auslSumme(vorwoche,s))}</b> · ø ${esc(zeitraumLabel())} <b>${pctS(auslSumme(zr,s))}</b></div></div>`;
  });
  h+='</div>';
  h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Tag</th>'+sites.map(s=>`<th class="r">${esc(sn(s))}</th>`).join('')+'</tr></thead><tbody>';
  tage.forEach(y=>{
    const d=ausYmd(y);
    h+=`<tr${y===ymdP(h0)?' class="today"':''}><td>${esc(fDat(d))}</td>`+sites.map(s=>{
      const a=auslWert(y,s);
      if(a.offen)return'<td class="r"><span class="pill p-n">noch kein Export</span></td>';
      if(a.keineDaten)return'<td class="r"><span class="pill p-n">vor thevea</span></td>';
      if(a.pct===null)return'<td class="r"><span class="pill p-n">—</span></td>';
      const sub=a.quelle==='pc'?`brutto ${n1(a.brutto)} % · ${n1(a.geb/60)} / ${n1(a.kap/60)} h`:`${n1(a.geb/60)} / ${n1(a.kap/60)} h`;
      return`<td class="r">${amp(a.pct)} <span class="c-m" style="font-size:11px">${sub}</span></td>`;}).join('')+'</tr>';
  });
  h+='</tbody></table></div>';
  h+='<p class="hint">Werneck aus der Tagesmessung des Patientenchecker-Praxismanagements: bereinigt = geplante Patientenminuten ÷ verfügbare Minuten ohne Blocker, Pausen und Fahrzeiten; brutto = ÷ Arbeitsminuten. Kitzingen aus dem Medifox-Umsatzexport: gebuchte Minuten ÷ anwesende Soll-Minuten. Wochen- und Zeitraumwerte sind Summenquotienten. Ampel: ≥ 90 % grün, ≥ 80 % gelb.</p>';
  return h+'</section>';
}
