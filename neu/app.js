// app.js — Oberfläche des neuen Cockpits: Filter, Navigation, Seiten.
// Die Daten und Berechnungen kommen aus data.js (D, aS, aM, getActiveMonths …).

// ── Seiten ───────────────────────────────────────────────────────────────
// Bereiche, die noch nicht umgebaut sind, verweisen auf die alte Ansicht.
const PAGES=[
  {id:'uebersicht',l:'Übersicht'},
  {id:'erbracht',l:'Erbracht'},
  {id:'vorschau',l:'Jahresvorschau'},
  {id:'planist',l:'Plan vs. Ist'},
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
  el.innerHTML=p.id==='uebersicht'?pUebersicht():p.id==='erbracht'?pErbracht():p.id==='vorschau'?pVorschau():p.id==='planist'?pPlanIst():pAlt(p);
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


// ── Erbracht ─────────────────────────────────────────────────────────────
// Werneck: jeder thevea-Kalender-Slot mit seinem Heilmittelwert (stattgefunden,
// geplant ohne Status, Ausfall, Reservierung). Kitzingen: Medifox-Behandlungen
// ohne Club, T-RENA und Präventionskurse. Beide in einer Struktur.
function erbrachtZeilen(){
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1);
  const theraNames=new Set(D.ctrl.filter(t=>matchS(t.s)).map(t=>t.n));
  return D.raw.filter(r=>monthNums.includes(r.month)&&tvRowPasst(r,theraNames)).map(r=>{
    if(r.src==='thevea')return r;
    // Medifox-Zeile wie eine stattgefundene Kalenderzeile behandeln
    return{name:r.name,month:r.month,price:r.price,kind:'erbracht',hm:r.leistung||'—',quelle:'medifox',standort:rowSite(r),src:'medifox',datum:null};
  });
}
function pErbracht(){
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1);
  const rows=erbrachtZeilen();
  if(!rows.length)return`<section class="sec"><div class="sec-h"><h2>Umsatz erbracht</h2><span class="sub">${esc(zeitraumLabel())} · ${esc(sn(aS))}</span></div><div class="empty">Keine Termine im gewählten Zeitraum.</div></section>`;
  const agg=()=>({n:0,erbracht:0,offen:0,ausfall:0,reserviert:0,gesamt:0,nAusfall:0,nReserviert:0,ng:0});
  const add=(a,r)=>{a.n++;a[r.kind]+=r.price;a.gesamt+=r.price;if(r.kind==='ausfall')a.nAusfall++;if(r.kind==='reserviert')a.nReserviert++;if(r.quelle==='geschaetzt')a.ng++;};
  const byM={},byT={},byL={},bySite={},tot=agg();
  rows.forEach(r=>{
    add(byM[r.month]||(byM[r.month]=agg()),r);add(tot,r);
    add(byT[r.name]||(byT[r.name]=Object.assign(agg(),{standort:r.standort})),r);
    add(bySite[r.standort]||(bySite[r.standort]=agg()),r);
    const lk=r.standort+'|'+r.hm;const l=byL[lk]||(byL[lk]={standort:r.standort,hm:r.hm,n:0,sum:0});l.n++;l.sum+=r.price;
  });
  const jahr=new Date().getFullYear();
  const statistik=mi=>{const ym=jahr+'-'+String(mi).padStart(2,'0');let b=0,has=false;TV_LOCS.forEach(l=>{if(!matchS(l.standort))return;const s=D.thevea&&D.thevea.statistik&&D.thevea.statistik[l.standort+'|'+ym];if(s){b+=s.brutto;has=true;}});return has?b:null;};
  const zukunft=rows.filter(r=>r.datum&&r.datum>new Date()).reduce((s,r)=>s+r.price,0);
  // Kennzahlen
  let h=`<section class="sec"><div class="sec-h"><h2>Umsatz erbracht</h2><span class="sub">${esc(zeitraumLabel())} · ${esc(sn(aS))}${D.thevea&&D.thevea.bis?' · stattgefunden bis '+D.thevea.bis.toLocaleDateString('de-DE'):''}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Gesamt</div><div class="v">${eur0(tot.gesamt)}</div><div class="s">${n0(tot.n)} Termine · davon <b>${eur0(zukunft)}</b> geplant in der Zukunft</div></div>`;
  h+=`<div class="kpi"><div class="l">Stattgefunden</div><div class="v c-g">${eur0(tot.erbracht)}</div><div class="s">mit Status in thevea bzw. Medifox-Behandlung</div></div>`;
  h+=`<div class="kpi"><div class="l">Ohne Status</div><div class="v">${eur0(tot.offen)}</div><div class="s">geplante Termine mit Planwert</div></div>`;
  h+=`<div class="kpi"><div class="l">Ausfall · Reserviert</div><div class="v">${eur0(tot.ausfall)} · ${eur0(tot.reserviert)}</div><div class="s">${n0(tot.nAusfall)} Ausfälle · ${n0(tot.nReserviert)} Reservierungen ohne Rezept</div></div>`;
  h+='</div>';
  const sites=Object.keys(bySite);
  if(sites.length>1)h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Standort</th><th class="r">Termine</th><th class="r">Stattgefunden</th><th class="r">Ohne Status</th><th class="r">Ausfall</th><th class="r">Reserviert</th><th class="r">Gesamt</th></tr></thead><tbody>'+sites.map(s=>{const a=bySite[s];return`<tr><td>${siteTag(s)}</td><td class="r">${n0(a.n)}</td><td class="r">${eur0(a.erbracht)}</td><td class="r">${eur0(a.offen)}</td><td class="r">${eur0(a.ausfall)}</td><td class="r">${eur0(a.reserviert)}</td><td class="r"><b>${eur0(a.gesamt)}</b></td></tr>`;}).join('')+'</tbody></table></div>';
  h+='</section>';
  // Nach Monat
  const zeile=(label,a,st,sum)=>`<tr${sum?' class="sum"':''}><td>${esc(label)}</td><td class="r">${n0(a.n)}</td><td class="r">${eur0(a.erbracht)}</td><td class="r">${eur0(a.offen)}</td><td class="r">${eur0(a.ausfall)} <span class="c-m">(${a.nAusfall})</span></td><td class="r">${eur0(a.reserviert)} <span class="c-m">(${a.nReserviert})</span></td><td class="r"><b>${eur0(a.gesamt)}</b></td><td class="r">${st==null?'—':eur0(st)}</td><td class="r${a.ng?' c-a':''}">${n0(a.ng)}</td></tr>`;
  let stSum=0,stHas=false;
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Monat</h2><span class="sub">Jeder Kalender-Slot einzeln · ohne Status = Planwert · Ausfall = Heilmittelwert</span></div><div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Termine</th><th class="r">Stattgefunden</th><th class="r">Ohne Status</th><th class="r">Ausfall</th><th class="r">Reserviert</th><th class="r">Gesamt</th><th class="r">thevea-Abrechnung</th><th class="r">Standardsatz</th></tr></thead><tbody>`;
  monthNums.forEach(mi=>{const a=byM[mi];if(!a)return;const st=statistik(mi);if(st!=null){stSum+=st;stHas=true;}h+=zeile(MN[mi-1],a,st,false);});
  h+=zeile('Summe',tot,stHas?stSum:null,true)+'</tbody></table></div>';
  let ungew=0;TV_LOCS.forEach(l=>{if(!matchS(l.standort))return;const st=(D.thevea&&D.thevea.stat&&D.thevea.stat[l.standort])||{};monthNums.forEach(mi=>{ungew+=(st[mi]&&st[mi].nUngewertet)||0;});});
  const extra=(D.thevea&&D.thevea.kitzExtra||[]).filter(r=>monthNums.includes(r.month)&&matchS('PF im Park'));
  h+='<p class="hint">„thevea-Abrechnung“ ist die Umsatzstatistik brutto aus thevea selbst und zählt nur schon abgerechnete Einheiten, liegt deshalb unter dem Kalenderwert. „Standardsatz“ sind Termine, deren Preis weder thevea noch die GKV-Liste kannte.'
    +(ungew?` ${n0(ungew)} Patiententermine ohne Rezept bei Personen, die nicht behandeln (Club-Einweisungen, Beratungen), sind nicht gewertet.`:'')
    +(extra.length?` Kitzingen ohne ${n0(extra.length)} Club-, T-RENA- und Kurspositionen (${eur0(extra.reduce((s,r)=>s+r.price,0))}).`:'')+'</p></section>';
  // Nach Therapeut:in
  const tl=Object.keys(byT).map(n=>Object.assign({name:n},byT[n])).sort((a,b)=>b.gesamt-a.gesamt);
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Therapeut:in</h2><span class="sub">${tl.length} Personen</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Termine</th><th class="r">Stattgefunden</th><th class="r">Ohne Status</th><th class="r">Ausfall</th><th class="r">Reserviert</th><th class="r">Gesamt</th></tr></thead><tbody>`;
  tl.forEach(t=>{h+=`<tr><td>${esc(t.name)}</td><td>${siteTag(t.standort)}</td><td class="r">${n0(t.n)}</td><td class="r">${eur0(t.erbracht)}</td><td class="r">${eur0(t.offen)}</td><td class="r">${eur0(t.ausfall)}</td><td class="r">${eur0(t.reserviert)}</td><td class="r"><b>${eur0(t.gesamt)}</b></td></tr>`;});
  h+='</tbody></table></div></section>';
  // Nach Leistung je Standort
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Leistung</h2><span class="sub">Top 15 je Standort</span></div><div class="grid g3" style="align-items:start">`;
  sitesAktiv().filter(s=>bySite[s]).forEach(s=>{
    const ll=Object.values(byL).filter(l=>l.standort===s).sort((a,b)=>b.sum-a.sum);
    h+=`<div><div style="margin-bottom:6px">${siteTag(s)}</div><div class="tbl-wrap"><table style="min-width:0"><thead><tr><th>Leistung</th><th class="r">n</th><th class="r">ø</th><th class="r">Umsatz</th></tr></thead><tbody>`;
    ll.slice(0,15).forEach(l=>{h+=`<tr><td style="white-space:normal">${esc(String(l.hm).slice(0,48))}</td><td class="r">${n0(l.n)}</td><td class="r">${n1(l.sum/l.n)} €</td><td class="r"><b>${eur0(l.sum)}</b></td></tr>`;});
    if(ll.length>15)h+=`<tr><td colspan="4" class="c-m">… ${ll.length-15} weitere</td></tr>`;
    h+='</tbody></table></div></div>';
  });
  h+='</div></section>';
  // Methodik
  h+=`<section class="sec"><details><summary style="cursor:pointer;font-weight:600">Wie gerechnet wird</summary><p class="hint" style="margin-top:8px">Jeder Kalender-Slot zählt einzeln, zwei 20-Minuten-Termine sind zwei KG. Preis je Termin: zuerst der Wert, den thevea für die Verordnung ausweist (Verordnungswert-Prognose, inklusive Privat-, Beihilfe-, BG-Sätzen und Hausbesuchspauschale), sonst das Heilmittel nach der GKV-Preisliste 2026 plus Hausbesuchspauschale je Besuch, zuletzt der Standardsatz Krankengymnastik. Termine ohne Status zählen mit Planwert, Ausfall (ausgefallen oder abgesagt) mit dem Heilmittelwert. Reservierungen sind Patiententermine ohne Verordnung bei Behandler:innen mit mindestens ${TV_BEHANDLER_MIN} Rezeptterminen: 20 Min = KG 29,63 €, 30 Min = MLD-30 35,97 €, 45 Min = MLD-45 53,94 €, andere Längen als Vielfache von 20 Min KG. Blocker zählen nicht. Ab 27.07.2026 (Ergo 01.08.) ersetzt der thevea-Kalender die Medifox-Exporte für KIMOJO; Kitzingen bleibt Medifox ohne Club, T-RENA und Präventionskurse.</p></details></section>`;
  return h;
}


// ── Jahresvorschau ───────────────────────────────────────────────────────
// Rollierende Planung: abgeschlossene Monate mit Ist (BWA), laufender und
// künftige Monate mit Plan. Der Zeitraumfilter spielt hier keine Rolle, der
// Standortfilter schon. Erbracht ist die Kalendersicht als zweite Ist-Spur.
let fcMode='einnahmen';
function setFC(m){fcMode=m;rPage();}
function vorschauDaten(){
  const now=new Date(),cur=now.getMonth();
  const kim=aS==='Alle'||aS==='KIMOJO Gesamt'||aS==='KIMOJO Physio'||aS==='KIMOJO Ergo',pf=aS==='Alle'||aS==='PF im Park';
  const therapists=D.ctrl.filter(t=>matchS(t.s)),theraNames=new Set(therapists.map(t=>t.n));
  const erbM={};D.raw.forEach(r=>{if(!r.month||!tvRowPasst(r,theraNames))return;erbM[r.month]=(erbM[r.month]||0)+r.price;});
  const plan=(key,m)=>{let v=0;if(kim&&D.planK.dashboard)v+=D.planK.dashboard.therapie[key+'_'+m]||0;if(pf&&D.planP.dashboard)v+=D.planP.dashboard.therapie[key+'_'+m]||0;return v;};
  return MN.map((m,i)=>{
    const bK=getBWA(D.bwaK,m),bP=getBWA(D.bwaP,m);
    let ein=0,kosten=0,gewinn=0,hasIst=false;
    if(kim&&bK){ein+=bK.umsatz;kosten+=bK.gesamtkosten;gewinn+=bK.ergebnis;hasIst=true;}
    if(pf&&bP){ein+=bP.umsatz;kosten+=bP.gesamtkosten;gewinn+=bP.ergebnis;hasIst=true;}
    const useIst=hasIst&&i<cur;
    const p={ein:plan('einnahmen',m),kosten:plan('kosten',m),gewinn:plan('gewinn',m)};
    const ist={ein,kosten,gewinn,erbracht:erbM[i+1]||0};
    return{m,i,isCurrent:i===cur,useIst,hasIst,ist,plan:p,fc:{ein:useIst?ein:p.ein,kosten:useIst?kosten:p.kosten,gewinn:useIst?gewinn:p.gewinn,erbracht:useIst?(ist.erbracht||ein):p.ein}};
  });
}
function pVorschau(){
  if(!D.planK.dashboard&&!D.planP.dashboard)return'<section class="sec"><div class="empty">Keine Plandaten geladen.</div></section>';
  const data=vorschauDaten(),cur=new Date().getMonth();
  const sum=(k,src)=>data.reduce((s,d)=>s+d[src][k],0);
  const fc={ein:sum('ein','fc'),kosten:sum('kosten','fc'),gewinn:sum('gewinn','fc'),erbracht:sum('erbracht','fc')},pl={ein:sum('ein','plan'),kosten:sum('kosten','plan'),gewinn:sum('gewinn','plan')};
  const istM=data.filter(d=>d.useIst);
  const trend=k=>istM.length?istM.reduce((s,d)=>s+d.fc[k],0)/istM.length*12:null;
  const delta=(ist,plan,inv)=>{if(!plan)return'';const d=(ist-plan)/Math.abs(plan)*100;const ok=inv?d<=0:d>=0;return`<span class="pill ${ok?'p-g':'p-r'}">${d>=0?'+':''}${n1(d)} % zum Plan</span>`;};
  const lastIst=data.reduce((l,d)=>d.useIst?d.i:l,-1);const istBis=lastIst>=0?'Jan – '+MN[lastIst]:'—';const fehlt=data.filter(d=>d.i<cur&&!d.useIst).map(d=>d.m);
  let h=`<section class="sec"><div class="sec-h"><h2>Jahresvorschau ${new Date().getFullYear()}</h2><span class="sub">Ist ${istBis} (BWA) + Plan ${MN[cur]} – Dez · ${esc(sn(aS))}${fehlt.length?' · BWA fehlt für '+fehlt.join(', ')+' (Plan eingesetzt)':''}</span></div><div class="grid g3">`;
  h+=`<div class="kpi big"><div class="l">Einnahmen Jahresende</div><div class="v">${fmK(fc.ein)}</div><div class="s">${delta(fc.ein,pl.ein)} · Plan <b>${fmK(pl.ein)}</b></div><div class="s">Erbracht statt BWA: <b>${fmK(fc.erbracht)}</b>${trend('ein')?` · Trend <b>${fmK(trend('ein'))}</b>`:''}</div></div>`;
  h+=`<div class="kpi big"><div class="l">Kosten Jahresende</div><div class="v">${fmK(fc.kosten)}</div><div class="s">${delta(fc.kosten,pl.kosten,true)} · Plan <b>${fmK(pl.kosten)}</b></div></div>`;
  h+=`<div class="kpi big"><div class="l">Gewinn Jahresende</div><div class="v ${fc.gewinn>=0?'c-g':'c-r'}">${fmK(fc.gewinn)}</div><div class="s">${delta(fc.gewinn,pl.gewinn)} · Plan <b>${fmK(pl.gewinn)}</b></div><div class="s">Erbracht − Kosten: <b>${fmK(fc.erbracht-fc.kosten)}</b>${trend('gewinn')?` · Trend <b>${fmK(trend('gewinn'))}</b>`:''}</div></div>`;
  h+='</div><p class="hint">Trend = Durchschnitt der abgeschlossenen Monate auf zwölf Monate hochgerechnet. „Erbracht“ ersetzt in den Ist-Monaten den BWA-Umsatz durch den Kalenderwert.</p></section>';
  // Verlauf
  const key=fcMode==='einnahmen'?'ein':fcMode;
  const label={einnahmen:'Einnahmen',kosten:'Kosten',gewinn:'Gewinn'}[fcMode];
  let cumFC=0,cumPl=0;data.forEach(d=>{cumFC+=d.fc[key];cumPl+=d.plan[key];d.cumFC=cumFC;d.cumPl=cumPl;});
  h+=`<section class="sec"><div class="sec-h"><h2>Verlauf ${esc(label)}</h2><div class="seg">${['einnahmen','kosten','gewinn'].map(m=>`<button class="${fcMode===m?'a':''}" onclick="setFC('${m}')">${{einnahmen:'Einnahmen',kosten:'Kosten',gewinn:'Gewinn'}[m]}</button>`).join('')}</div></div>`;
  h+=vorschauChart(data,label);
  // Monatstabelle
  h+=`<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Monat</th><th></th><th class="r">${esc(label)}</th><th class="r">Plan</th><th class="r">Abweichung</th><th class="r">Kumuliert</th><th class="r">Plan kumuliert</th></tr></thead><tbody>`;
  data.forEach(d=>{
    const v=d.fc[key],p=d.plan[key];const dv=d.useIst&&p?(v-p)/Math.abs(p)*100:null;const ok=fcMode==='kosten'?dv<=0:dv>=0;
    h+=`<tr${d.isCurrent?' class="today"':''}><td>${d.m}</td><td><span class="pill ${d.useIst?'p-g':'p-n'}">${d.useIst?'Ist':d.isCurrent?'laufend · Plan':d.i<cur?'BWA fehlt · Plan':'Plan'}</span></td><td class="r"><b>${eur0(v)}</b></td><td class="r">${eur0(p)}</td><td class="r">${dv==null?'—':`<span class="pill ${ok?'p-g':'p-r'}">${dv>=0?'+':''}${n1(dv)} %</span>`}</td><td class="r">${eur0(d.cumFC)}</td><td class="r c-m">${eur0(d.cumPl)}</td></tr>`;
  });
  h+=`<tr class="sum"><td>Jahr</td><td></td><td class="r">${eur0(cumFC)}</td><td class="r">${eur0(cumPl)}</td><td class="r">${delta(cumFC,cumPl,fcMode==='kosten')}</td><td></td><td></td></tr></tbody></table></div></section>`;
  return h;
}
function vorschauChart(data,label){
  const W=720,H=220,pd={t:22,r:70,b:26,l:56},cw=W-pd.l-pd.r,ch=H-pd.t-pd.b,cur=new Date().getMonth();
  const all=[...data.map(d=>d.cumFC),...data.map(d=>d.cumPl)];
  const maxV=Math.max(...all,1)*1.05,minV=Math.min(0,...all)*1.05,rg=maxV-minV||1;
  const x=i=>pd.l+i*cw/11,y=v=>pd.t+ch-(v-minV)/rg*ch;
  const F='-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Kumulierter Verlauf ${esc(label)}">`;
  for(let k=0;k<=4;k++){const v=minV+rg/4*k,yp=y(v);s+=`<line x1="${pd.l}" y1="${yp}" x2="${W-pd.r}" y2="${yp}" stroke="#E5E5EA"/><text x="${pd.l-6}" y="${yp+3}" text-anchor="end" font-size="9" fill="#8A8A92" font-family="${F}">${fmK(v)}</text>`;}
  data.forEach((d,i)=>{s+=`<text x="${x(i)}" y="${H-pd.b+14}" text-anchor="middle" font-size="9" fill="#8A8A92" font-family="${F}" font-weight="600">${d.m}</text>`;});
  const nx=x(cur)+cw/22;s+=`<line x1="${nx}" y1="${pd.t}" x2="${nx}" y2="${H-pd.b}" stroke="#BE3A30" stroke-dasharray="4,3" opacity=".5"/><text x="${nx}" y="${pd.t-6}" text-anchor="middle" font-size="8" fill="#BE3A30" font-family="${F}" font-weight="700">heute</text>`;
  const path=(k,from,to)=>{let p='';for(let i=from;i<=to;i++)p+=(i===from?'M ':' L ')+x(i)+' '+y(data[i][k]);return p;};
  s+=`<path d="${path('cumPl',0,11)}" fill="none" stroke="#3C5A80" stroke-width="2" stroke-dasharray="6,4" opacity=".6"/>`;
  const last=data.reduce((l,d,i)=>d.useIst?i:l,-1);
  if(last>=0)s+=`<path d="${path('cumFC',0,last)}" fill="none" stroke="#BE3A30" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  if(last<11)s+=`<path d="${path('cumFC',Math.max(last,0),11)}" fill="none" stroke="#BE3A30" stroke-width="2.5" stroke-dasharray="8,5" opacity=".55"/>`;
  data.forEach((d,i)=>{s+=`<circle cx="${x(i)}" cy="${y(d.cumFC)}" r="${d.useIst?4:3}" fill="#BE3A30" stroke="#fff" stroke-width="2" opacity="${d.useIst?1:.5}"/>`;});
  s+=`<text x="${W-pd.r+6}" y="${y(data[11].cumFC)+4}" font-size="11" fill="#BE3A30" font-family="${F}" font-weight="700">${fmK(data[11].cumFC)}</text>`;
  s+=`<text x="${W-pd.r+6}" y="${y(data[11].cumPl)+4}" font-size="10" fill="#3C5A80" font-family="${F}" font-weight="700" opacity=".8">${fmK(data[11].cumPl)}</text>`;
  s+='</svg>';
  s+='<div style="display:flex;gap:18px;justify-content:center;margin-top:8px;font-size:11.5px;color:var(--muted);font-weight:600"><span><span style="display:inline-block;width:18px;height:3px;background:var(--red);border-radius:2px;vertical-align:middle;margin-right:5px"></span>Ist + Plan kumuliert</span><span><span style="display:inline-block;width:18px;height:3px;background:var(--blue);opacity:.6;border-radius:2px;vertical-align:middle;margin-right:5px"></span>Jahresplan</span></div>';
  return s;
}


// ── Plan vs. Ist ─────────────────────────────────────────────────────────
// Monat für Monat im gewählten Zeitraum: Einnahmen als Erbracht (Kalender)
// und als BWA-Umsatz gegen den Plan, Kosten und Gewinn aus der BWA gegen den
// Plan. Kumulierte Verläufe zeigen, ob der Rückstand wächst oder schrumpft.
function planIstDaten(months){
  const kim=aS==='Alle'||aS==='KIMOJO Gesamt'||aS==='KIMOJO Physio'||aS==='KIMOJO Ergo',pf=aS==='Alle'||aS==='PF im Park';
  const theraNames=new Set(D.ctrl.filter(t=>matchS(t.s)).map(t=>t.n));
  const erbM={};D.raw.forEach(r=>{if(!r.month||!tvRowPasst(r,theraNames))return;erbM[r.month]=(erbM[r.month]||0)+r.price;});
  const plan=(key,m)=>{let v=0;if(kim&&D.planK.dashboard)v+=D.planK.dashboard.therapie[key+'_'+m]||0;if(pf&&D.planP.dashboard)v+=D.planP.dashboard.therapie[key+'_'+m]||0;return v;};
  return months.map(m=>{
    const bK=getBWA(D.bwaK,m),bP=getBWA(D.bwaP,m);let ein=0,kosten=0,gewinn=0,bwa=false;
    if(kim&&bK){ein+=bK.umsatz;kosten+=bK.gesamtkosten;gewinn+=bK.ergebnis;bwa=true;}
    if(pf&&bP){ein+=bP.umsatz;kosten+=bP.gesamtkosten;gewinn+=bP.ergebnis;bwa=true;}
    return{m,erbracht:erbM[MN.indexOf(m)+1]||0,bwa,ein,kosten,gewinn,pEin:plan('einnahmen',m),pKosten:plan('kosten',m),pGewinn:plan('gewinn',m)};
  });
}
const dPill=(ist,plan,inv)=>{if(!plan)return'<span class="pill p-n">—</span>';const d=(ist-plan)/Math.abs(plan)*100;const ok=inv?d<=0:d>=0;return`<span class="pill ${ok?'p-g':'p-r'}">${d>=0?'+':''}${n1(d)} %</span>`;};
const barCell=(ist,plan,col)=>{const mx=Math.max(ist,plan,1);return`<div class="bar" style="position:relative;height:8px"><i style="width:${Math.min(100,plan/mx*100)}%;background:var(--blue);opacity:.25;position:absolute;left:0;top:0"></i><i style="width:${Math.min(100,ist/mx*100)}%;background:${col};position:absolute;left:0;top:0"></i></div>`;};
function pPlanIst(){
  const months=getActiveMonths();
  if(!D.planK.dashboard&&!D.planP.dashboard)return'<section class="sec"><div class="empty">Keine Plandaten geladen.</div></section>';
  if(!months.length)return'<section class="sec"><div class="empty">Kein Monat im gewählten Zeitraum.</div></section>';
  const data=planIstDaten(months);
  const sum=k=>data.reduce((s,d)=>s+d[k],0);
  const mitBwa=data.filter(d=>d.bwa);const sumB=k=>mitBwa.reduce((s,d)=>s+d[k],0);
  const ohneBwa=data.filter(d=>!d.bwa).map(d=>d.m);
  let h=`<section class="sec"><div class="sec-h"><h2>Plan vs. Ist</h2><span class="sub">${esc(zeitraumLabel())} · ${esc(sn(aS))}${ohneBwa.length?' · BWA fehlt für '+ohneBwa.join(', '):''}</span></div><div class="grid">`;
  h+=`<div class="kpi"><div class="l">Einnahmen erbracht</div><div class="v">${fmK(sum('erbracht'))}</div><div class="s">${dPill(sum('erbracht'),sum('pEin'))} · Plan <b>${fmK(sum('pEin'))}</b></div></div>`;
  h+=`<div class="kpi"><div class="l">Umsatz BWA</div><div class="v">${fmK(sumB('ein'))}</div><div class="s">${dPill(sumB('ein'),sumB('pEin'))} · Plan <b>${fmK(sumB('pEin'))}</b>${ohneBwa.length?' · nur Monate mit BWA':''}</div></div>`;
  h+=`<div class="kpi"><div class="l">Kosten BWA</div><div class="v">${fmK(sumB('kosten'))}</div><div class="s">${dPill(sumB('kosten'),sumB('pKosten'),true)} · Plan <b>${fmK(sumB('pKosten'))}</b></div></div>`;
  h+=`<div class="kpi"><div class="l">Gewinn BWA</div><div class="v ${sumB('gewinn')>=0?'c-g':'c-r'}">${fmK(sumB('gewinn'))}</div><div class="s">${dPill(sumB('gewinn'),sumB('pGewinn'))} · Plan <b>${fmK(sumB('pGewinn'))}</b></div></div>`;
  h+='</div></section>';
  // Einnahmen
  h+=`<section class="sec"><div class="sec-h"><h2>Einnahmen</h2><span class="sub">Erbracht (Kalender) und BWA-Umsatz gegen Plan</span></div>`;
  h+='<div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Erbracht</th><th class="r">Δ Plan</th><th style="min-width:120px"></th><th class="r">BWA</th><th class="r">Δ Plan</th><th class="r">Plan</th></tr></thead><tbody>';
  data.forEach(d=>{h+=`<tr><td>${d.m}</td><td class="r"><b>${eur0(d.erbracht)}</b></td><td class="r">${dPill(d.erbracht,d.pEin)}</td><td>${barCell(d.erbracht,d.pEin,'var(--red)')}</td><td class="r">${d.bwa?eur0(d.ein):'<span class="c-m">—</span>'}</td><td class="r">${d.bwa?dPill(d.ein,d.pEin):'<span class="pill p-n">—</span>'}</td><td class="r c-m">${eur0(d.pEin)}</td></tr>`;});
  h+=`<tr class="sum"><td>Summe</td><td class="r">${eur0(sum('erbracht'))}</td><td class="r">${dPill(sum('erbracht'),sum('pEin'))}</td><td></td><td class="r">${eur0(sumB('ein'))}</td><td class="r">${dPill(sumB('ein'),sumB('pEin'))}</td><td class="r">${eur0(sum('pEin'))}</td></tr></tbody></table></div>`;
  if(data.length>1)h+='<div style="margin-top:14px">'+cumChart(data.map(d=>d.m),data.map(d=>d.erbracht),data.map(d=>d.pEin),'Erbracht','Plan')+'</div>';
  h+='</section>';
  // Kosten & Gewinn
  h+=`<section class="sec"><div class="sec-h"><h2>Kosten und Gewinn</h2><span class="sub">BWA gegen Plan</span></div>`;
  h+='<div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Kosten BWA</th><th class="r">Plan</th><th class="r">Δ</th><th class="r">Gewinn BWA</th><th class="r">Plan</th><th class="r">Δ</th><th style="min-width:120px"></th></tr></thead><tbody>';
  data.forEach(d=>{
    if(!d.bwa){h+=`<tr><td>${d.m}</td><td colspan="7" class="c-m">BWA liegt noch nicht vor · Plan Kosten ${eur0(d.pKosten)} · Plan Gewinn ${eur0(d.pGewinn)}</td></tr>`;return;}
    h+=`<tr><td>${d.m}</td><td class="r">${eur0(d.kosten)}</td><td class="r c-m">${eur0(d.pKosten)}</td><td class="r">${dPill(d.kosten,d.pKosten,true)}</td><td class="r"><b class="${d.gewinn>=0?'c-g':'c-r'}">${eur0(d.gewinn)}</b></td><td class="r c-m">${eur0(d.pGewinn)}</td><td class="r">${dPill(d.gewinn,d.pGewinn)}</td><td>${barCell(Math.max(d.gewinn,0),Math.max(d.pGewinn,0),d.gewinn>=0?'var(--green)':'var(--red)')}</td></tr>`;});
  h+=`<tr class="sum"><td>Summe</td><td class="r">${eur0(sumB('kosten'))}</td><td class="r">${eur0(sumB('pKosten'))}</td><td class="r">${dPill(sumB('kosten'),sumB('pKosten'),true)}</td><td class="r">${eur0(sumB('gewinn'))}</td><td class="r">${eur0(sumB('pGewinn'))}</td><td class="r">${dPill(sumB('gewinn'),sumB('pGewinn'))}</td><td></td></tr></tbody></table></div>`;
  if(mitBwa.length>1)h+='<div style="margin-top:14px">'+cumChart(mitBwa.map(d=>d.m),mitBwa.map(d=>d.gewinn),mitBwa.map(d=>d.pGewinn),'Gewinn BWA','Plan')+'</div>';
  h+='<p class="hint">Erbracht ist der Kalenderwert aus thevea und Medifox, BWA der Umsatz laut Steuerberater; die BWA liegt meist ein bis zwei Monate später vor. Kosten: unter Plan ist grün.</p></section>';
  return h;
}
// Kumulierter Verlauf zweier Reihen über beliebig viele Monate.
function cumChart(labels,istArr,planArr,lIst,lPlan){
  const n=labels.length;if(n<2)return'';
  const pts=[];let ci=0,cp=0;for(let i=0;i<n;i++){ci+=istArr[i];cp+=planArr[i];pts.push({ist:ci,plan:cp});}
  const W=720,H=200,pd={t:18,r:70,b:24,l:56},cw=W-pd.l-pd.r,ch=H-pd.t-pd.b;
  const all=[...pts.map(p=>p.ist),...pts.map(p=>p.plan)];const maxV=Math.max(...all,1)*1.05,minV=Math.min(0,...all)*1.05,rg=maxV-minV||1;
  const x=i=>pd.l+i*cw/(n-1),y=v=>pd.t+ch-(v-minV)/rg*ch;const F='-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Kumuliert ${esc(lIst)} gegen ${esc(lPlan)}">`;
  for(let k=0;k<=4;k++){const v=minV+rg/4*k,yp=y(v);s+=`<line x1="${pd.l}" y1="${yp}" x2="${W-pd.r}" y2="${yp}" stroke="#E5E5EA"/><text x="${pd.l-6}" y="${yp+3}" text-anchor="end" font-size="9" fill="#8A8A92" font-family="${F}">${fmK(v)}</text>`;}
  labels.forEach((m,i)=>{s+=`<text x="${x(i)}" y="${H-pd.b+14}" text-anchor="middle" font-size="9" fill="#8A8A92" font-family="${F}" font-weight="600">${esc(m)}</text>`;});
  const path=k=>pts.map((p,i)=>(i?' L ':'M ')+x(i)+' '+y(p[k])).join('');
  s+=`<path d="${path('plan')}" fill="none" stroke="#3C5A80" stroke-width="2" stroke-dasharray="6,4" opacity=".6"/>`;
  s+=`<path d="${path('ist')}" fill="none" stroke="#BE3A30" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  pts.forEach((p,i)=>{s+=`<circle cx="${x(i)}" cy="${y(p.ist)}" r="4" fill="#BE3A30" stroke="#fff" stroke-width="2"/>`;});
  const l=pts[n-1];
  s+=`<text x="${W-pd.r+6}" y="${y(l.ist)+4}" font-size="11" fill="#BE3A30" font-family="${F}" font-weight="700">${fmK(l.ist)}</text><text x="${W-pd.r+6}" y="${y(l.plan)+4}" font-size="10" fill="#3C5A80" font-family="${F}" font-weight="700" opacity=".8">${fmK(l.plan)}</text></svg>`;
  s+=`<div style="display:flex;gap:18px;justify-content:center;margin-top:6px;font-size:11.5px;color:var(--muted);font-weight:600"><span><span style="display:inline-block;width:18px;height:3px;background:var(--red);border-radius:2px;vertical-align:middle;margin-right:5px"></span>${esc(lIst)} kumuliert</span><span><span style="display:inline-block;width:18px;height:3px;background:var(--blue);opacity:.6;border-radius:2px;vertical-align:middle;margin-right:5px"></span>${esc(lPlan)} kumuliert</span></div>`;
  return s;
}
