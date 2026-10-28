// app.js — Oberfläche des neuen Cockpits: Filter, Navigation, Seiten.
// Die Daten und Berechnungen kommen aus data.js (D, aS, aM, getActiveMonths …).

// ── Seiten ───────────────────────────────────────────────────────────────
// Bereiche, die noch nicht umgebaut sind, verweisen auf die alte Ansicht.
const PAGES=[
  {id:'uebersicht',l:'Übersicht'},
  {id:'erbracht',l:'Erbracht'},
  {id:'abgerechnet',l:'Abgerechnet'},
  {id:'vorschau',l:'Jahresvorschau'},
  {id:'planist',l:'Plan vs. Ist'},
  {id:'auslastung',l:'Auslastung'},
  {id:'termine',l:'Terminvergabe'},
  {id:'therapeuten',l:'Therapeuten'},
  {id:'krankenstand',l:'Krankenstand'},
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
  el.innerHTML=p.id==='uebersicht'?pUebersicht():p.id==='erbracht'?pErbracht():p.id==='abgerechnet'?pAbgerechnet():p.id==='vorschau'?pVorschau():p.id==='planist'?pPlanIst():p.id==='auslastung'?pAuslastung():p.id==='termine'?pTermine():p.id==='therapeuten'?pTherapeuten():p.id==='krankenstand'?pKrankenstand():pAlt(p);
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
  // Nach Therapeut:in: Umsatz, Stunden, € je Stunde; Klick klappt die Tage auf
  const amp=v=>v>=65?'p-g':v>=56?'p-a':'p-r';
  const tl=Object.keys(byT).map(n=>{const t=D.ctrl.find(c=>c.n===n);const st=t?tvStdSumme(t,months):{soll:0,anw:0,tracker:true};return Object.assign({name:n,ctrl:t,soll:st.soll,anw:st.anw,tracker:st.tracker},byT[n]);}).sort((a,b)=>b.gesamt-a.gesamt);
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Therapeut:in</h2><span class="sub">${tl.length} Personen · Zeile anklicken für die Tage</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Termine</th><th class="r">Gesamt</th><th class="r">Stattgefunden</th><th class="r">Geplant</th><th class="r">Ausfall · Reserv.</th><th class="r">Soll h</th><th class="r">Anw. h</th><th class="r">€ / Vertragsstd.</th><th class="r">€ / anw. Std.</th></tr></thead><tbody>`;
  tl.forEach((t,i)=>{
    const ev=t.soll>0?t.gesamt/t.soll:null,ea=t.anw>0?t.gesamt/t.anw:null;
    h+=`<tr class="t-row" onclick="toggleTage('tg${i}')" style="cursor:pointer"><td><b>${esc(t.name)}</b></td><td>${siteTag(t.standort)}</td><td class="r">${n0(t.n)}</td><td class="r"><b>${eur0(t.gesamt)}</b></td><td class="r">${eur0(t.erbracht)}</td><td class="r">${eur0(t.offen)}</td><td class="r c-m">${eur0(t.ausfall+t.reserviert)}</td><td class="r">${n1(t.soll)}${t.tracker?' <span title="Stunden aus dem Weekly Tracker">*</span>':''}</td><td class="r">${n1(t.anw)}</td><td class="r">${ev==null?'—':`<span class="pill ${amp(ev)}">${n1(ev)}</span>`}</td><td class="r">${ea==null?'—':`<span class="pill ${amp(ea)}">${n1(ea)}</span>`}</td></tr>`;
    ERB_TAGE['tg'+i]={t,rows:rows.filter(r=>r.name===t.name)};
    h+=`<tr id="tg${i}" style="display:none"><td colspan="11" style="padding:0 0 10px 0;background:var(--bg)"></td></tr>`;
  });
  h+='</tbody></table></div><p class="hint">€ je Stunde = Umsatz der Person ÷ Soll-Stunden bzw. anwesende Stunden des Zeitraums; Ampel ab 65 grün, ab 56 gelb. Stern: Stunden aus dem Weekly Tracker ohne Abwesenheiten.</p></section>';
  // Methodik
  h+=`<section class="sec"><details><summary style="cursor:pointer;font-weight:600">Wie gerechnet wird</summary><p class="hint" style="margin-top:8px">Jeder Kalender-Slot zählt einzeln, zwei 20-Minuten-Termine sind zwei KG. Preis je Termin: zuerst der Wert, den thevea für die Verordnung ausweist (Verordnungswert-Prognose, inklusive Privat-, Beihilfe-, BG-Sätzen und Hausbesuchspauschale), sonst das Heilmittel nach der GKV-Preisliste 2026 plus Hausbesuchspauschale je Besuch, zuletzt der Standardsatz Krankengymnastik. Termine ohne Status zählen mit Planwert, Ausfall (ausgefallen oder abgesagt) mit dem Heilmittelwert. Reservierungen sind Patiententermine ohne Verordnung bei Behandler:innen mit mindestens ${TV_BEHANDLER_MIN} Rezeptterminen: 20 Min = KG 29,63 €, 30 Min = MLD-30 35,97 €, 45 Min = MLD-45 53,94 €, andere Längen als Vielfache von 20 Min KG. Blocker zählen nicht. Ab 27.07.2026 (Ergo 01.08.) ersetzt der thevea-Kalender die Medifox-Exporte für KIMOJO; Kitzingen bleibt Medifox ohne Club, T-RENA und Präventionskurse.</p></details></section>`;
  return h;
}


// ── Abgerechnet ──────────────────────────────────────────────────────────
// KIMOJO: thevea-Statistik „Umsatz abgerechnete Verordnungen" (nach
// Abrechnungsdatum, je Person, inkl. Privat/Beihilfe, mit Zuzahlung) plus die
// thevea-Rechnungen (Privat-, Selbstzahler-, Ausfall-, Zuzahlungsrechnungen).
// Kitzingen und KIMOJO vor dem Cutover: Medifox-Zeilen mit Kennzeichen
// „Abgerechnet", nach Leistungsmonat; GKV/BG/Privat an der Positionsnummer,
// Zuzahlung rechnerisch (10 % + 10 € je Rezept), weil Medifox sie nicht exportiert.
const ABG_GKV_PREISE=new Set([29.63,35.59,35.97,53.94,71.94,55.81,16.16,8.63,22.78,13.09,47.06,27.46,36.61,8.43,13.47,21.63,31.52]);
function abgMedifoxArt(r){
  const p=String(r.posNr||'').trim(),l=String(r.leistung||'').toLowerCase();
  if(/^ausfallrechnung/.test(l))return'ausfall';
  if(/^x/i.test(p))return'gkv';
  if(/\s[ab]$/i.test(p)||/^8\d{3}/.test(p))return'bg';
  if(/^2\d{4}$/.test(p)&&ABG_GKV_PREISE.has(Math.round(r.price*100)/100))return'gkv';
  return'privat';
}
function abgDaten(){
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1),jahr=new Date().getFullYear();
  const M={},P={},RE={};
  const mk=(o,k,init)=>o[k]||(o[k]=init());
  const mAgg=(s,m)=>({standort:s,month:m,quelle:null,beh:0,brutto:0,gkv:0,bg:0,privat:0,privatN:0,ausfall:0,zuz:0,zuzEst:0,netto:0,offen:0,offenN:0,kalender:0});
  const pAgg=(s,n)=>({standort:s,name:n,quelle:null,beh:0,brutto:0,zuz:0,zuzEst:false,netto:0,offen:0});
  // thevea-Statistik
  ((D.abg&&D.abg.rows)||[]).forEach(r=>{
    if(r.jahr!==jahr||!monthNums.includes(r.month)||!matchS(r.standort))return;
    const m=mk(M,r.standort+'|'+r.month,()=>mAgg(r.standort,r.month));m.quelle='thevea';m.beh+=r.beh;m.brutto+=r.brutto;m.gkv+=r.brutto;m.zuz+=r.zuzahlung;m.netto+=r.netto;
    const p=mk(P,r.standort+'|'+r.name,()=>pAgg(r.standort,r.name));p.quelle='thevea';p.beh+=r.beh;p.brutto+=r.brutto;p.zuz+=r.zuzahlung;p.netto+=r.netto;
  });
  // thevea-Rechnungen: Privatanteil, Ausfallrechnungen, Zahlungseingang
  ((D.re&&D.re.rows)||[]).forEach(r=>{
    if(r.jahr!==jahr||!monthNums.includes(r.month)||!matchS(r.standort)||r.storno)return;
    const x=mk(RE,r.art,()=>({art:r.art,artName:r.artName,n:0,betrag:0,bezahlt:0}));x.n++;x.betrag+=r.brutto;x.bezahlt+=r.bezahlt;
    const m=mk(M,r.standort+'|'+r.month,()=>mAgg(r.standort,r.month));
    if(r.art==='privat'||r.art==='selbstzahler'){const p=Math.min(r.brutto,Math.max(0,m.gkv));m.privat+=r.brutto;m.privatN++;m.gkv-=p;}
    else if(r.art==='ausfall')m.ausfall+=r.brutto;
  });
  // Medifox (Kitzingen, KIMOJO vor dem Cutover)
  const theraNames=new Set(D.ctrl.filter(t=>matchS(t.s)).map(t=>t.n));
  const vos={};
  D.raw.forEach(r=>{
    if(r.src==='thevea'||!r.month||!monthNums.includes(r.month)||!tvRowPasst(r,theraNames)||tvIstKurs(r))return;
    const s=rowSite(r),art=abgMedifoxArt(r);
    const m=mk(M,s+'|'+r.month,()=>mAgg(s,r.month));m.quelle=m.quelle||'medifox';
    const p=mk(P,s+'|'+r.name,()=>pAgg(s,r.name));p.quelle=p.quelle||'medifox';
    if(!r.billed){if(art!=='ausfall'){m.offen+=r.price;m.offenN++;p.offen+=r.price;}return;}
    if(art==='ausfall'){m.ausfall+=r.price;return;}
    m.beh++;m.brutto+=r.price;m[art]+=r.price;if(art==='privat')m.privatN++;
    p.beh++;p.brutto+=r.price;p.quelle='medifox';
    if(art==='gkv'){const z=r.price*0.1;m.zuz+=z;m.zuzEst+=z;p.zuz+=z;p.zuzEst=true;const vk=s+'|'+r.month+'|'+r.name+'|'+(r.patient||'')+'|'+(r.vo||'');if(!vos[vk]){vos[vk]=1;m.zuz+=10;m.zuzEst+=10;p.zuz+=10;}}
  });
  Object.values(M).forEach(m=>{if(m.quelle==='medifox'){m.netto=m.brutto-m.zuz;}});
  Object.values(P).forEach(p=>{if(p.quelle==='medifox')p.netto=p.brutto-p.zuz;});
  // Kalenderwert (Seite Erbracht) für thevea-Monate als Bezugsgröße
  erbrachtZeilen().forEach(r=>{const m=M[r.standort+'|'+r.month];if(m&&m.quelle==='thevea')m.kalender+=r.price;});
  Object.values(M).forEach(m=>{if(m.quelle==='thevea'){m.offen=Math.max(0,m.kalender-m.brutto);}else{m.kalender=m.brutto+m.offen;}});
  return{months,monthNums,M:Object.values(M),P:Object.values(P),RE:Object.values(RE)};
}
function pAbgerechnet(){
  const {months,monthNums,M,P,RE}=abgDaten();
  const sub=`${esc(zeitraumLabel())} · ${esc(sn(aS))}`;
  if(!M.length)return`<section class="sec"><div class="sec-h"><h2>Abgerechnete Leistungen</h2><span class="sub">${sub}</span></div><div class="empty">Keine abgerechneten Leistungen im gewählten Zeitraum.</div></section>`;
  const S=(arr,k)=>arr.reduce((t,x)=>t+(x[k]||0),0);
  const oe=x=>n1(x)+' €';
  const tot={beh:S(M,'beh'),brutto:S(M,'brutto'),gkv:S(M,'gkv'),bg:S(M,'bg'),privat:S(M,'privat'),privatN:S(M,'privatN'),ausfall:S(M,'ausfall'),zuz:S(M,'zuz'),zuzEst:S(M,'zuzEst'),netto:S(M,'netto'),offen:S(M,'offen'),kalender:S(M,'kalender')};
  let standTxt='';{const st=(D.abg&&D.abg.stand)||{};const bis=Object.keys(st).filter(k=>matchS(k.split('|')[0])).map(k=>st[k].bis).filter(Boolean).sort().pop();if(bis)standTxt=' · thevea abgerechnet bis '+ausYmd(bis).toLocaleDateString('de-DE');}
  let h=`<section class="sec"><div class="sec-h"><h2>Abgerechnete Leistungen</h2><span class="sub">${sub}${standTxt}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Abgerechnet brutto</div><div class="v">${eur0(tot.brutto)}</div><div class="s">${n0(tot.beh)} Behandlungen · ø <b>${oe(tot.beh?tot.brutto/tot.beh:0)}</b> je Behandlung</div></div>`;
  h+=`<div class="kpi"><div class="l">Privatleistungen</div><div class="v">${eur0(tot.privat)}</div><div class="s">${n1(tot.brutto?tot.privat/tot.brutto*100:0)} % des Brutto · GKV/BG <b>${eur0(tot.gkv+tot.bg)}</b></div></div>`;
  h+=`<div class="kpi"><div class="l">Zuzahlungen</div><div class="v">${eur0(tot.zuz)}</div><div class="s">Netto nach Zuzahlung <b>${eur0(tot.netto)}</b>${tot.zuzEst?` · davon ${eur0(tot.zuzEst)} rechnerisch (Medifox)`:''}</div></div>`;
  const quote=tot.kalender>0?tot.brutto/tot.kalender*100:null;
  h+=`<div class="kpi"><div class="l">Noch nicht abgerechnet</div><div class="v ${tot.offen>0?'c-a':'c-g'}">${eur0(tot.offen)}</div><div class="s">abgerechnet <b>${quote==null?'—':n0(quote)+' %'}</b> von ${eur0(tot.kalender)} erbracht</div></div>`;
  h+='</div>';
  // Nach Standort
  const bySite={};M.forEach(m=>{const a=bySite[m.standort]||(bySite[m.standort]={standort:m.standort,beh:0,brutto:0,gkv:0,bg:0,privat:0,zuz:0,zuzEst:0,netto:0,ausfall:0,offen:0,kalender:0,quellen:new Set()});['beh','brutto','gkv','bg','privat','zuz','zuzEst','netto','ausfall','offen','kalender'].forEach(k=>a[k]+=m[k]);a.quellen.add(m.quelle);});
  const sites=Object.values(bySite);
  const qTag=q=>q.has('thevea')&&q.has('medifox')?'thevea + Medifox':q.has('thevea')?'thevea':'Medifox';
  if(sites.length>1)h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Standort</th><th>Quelle</th><th class="r">Beh.</th><th class="r">Brutto</th><th class="r">GKV / BG</th><th class="r">Privat</th><th class="r">Zuzahlung</th><th class="r">Netto</th><th class="r">Ausfall</th><th class="r">Offen</th></tr></thead><tbody>'+sites.map(a=>`<tr><td>${siteTag(a.standort)}</td><td class="c-m">${qTag(a.quellen)}</td><td class="r">${n0(a.beh)}</td><td class="r"><b>${eur0(a.brutto)}</b></td><td class="r">${eur0(a.gkv+a.bg)}</td><td class="r">${eur0(a.privat)}</td><td class="r">${eur0(a.zuz)}${a.zuzEst?'*':''}</td><td class="r">${eur0(a.netto)}</td><td class="r c-m">${eur0(a.ausfall)}</td><td class="r c-a">${eur0(a.offen)}</td></tr>`).join('')+'</tbody></table></div>';
  h+=`<p class="hint">KIMOJO aus der thevea-Statistik „Umsatz abgerechnete Verordnungen“ nach Abrechnungsdatum (inklusive Privat- und Beihilferezepte, Zuzahlung laut thevea); der Privatanteil kommt aus den Privat- und Selbstzahlerrechnungen desselben Monats. Kitzingen und KIMOJO bis zum Cutover aus Medifox: Leistungen mit Kennzeichen „Abgerechnet“ nach Leistungsmonat, GKV/BG/Privat an der Positionsnummer; * Zuzahlung rechnerisch 10 % + 10 € je Rezept ohne Befreiungen, weil Medifox sie nicht exportiert. Ausfallrechnungen stehen neben dem Brutto, Club, T-RENA und Kurse sind ausgeklammert.</p></section>`;
  // Nach Monat
  const byM={};M.forEach(m=>{const a=byM[m.month]||(byM[m.month]={beh:0,brutto:0,gkv:0,bg:0,privat:0,zuz:0,zuzEst:0,netto:0,ausfall:0,offen:0,kalender:0});['beh','brutto','gkv','bg','privat','zuz','zuzEst','netto','ausfall','offen','kalender'].forEach(k=>a[k]+=m[k]);});
  const zeile=(label,a,sum)=>{const q=a.kalender>0?a.brutto/a.kalender*100:null;return`<tr${sum?' class="sum"':''}><td>${esc(label)}</td><td class="r">${n0(a.beh)}</td><td class="r"><b>${eur0(a.brutto)}</b></td><td class="r">${eur0(a.gkv+a.bg)}</td><td class="r">${eur0(a.privat)}</td><td class="r">${eur0(a.zuz)}${a.zuzEst?'*':''}</td><td class="r">${eur0(a.netto)}</td><td class="r c-m">${eur0(a.ausfall)}</td><td class="r">${eur0(a.offen)}</td><td class="r">${q==null?'—':`<span class="pill ${q>=95?'p-g':q>=80?'p-a':'p-r'}">${n0(q)} %</span>`}</td></tr>`;};
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Monat</h2><span class="sub">thevea nach Abrechnungsdatum · Medifox nach Leistungsmonat</span></div><div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Beh.</th><th class="r">Brutto</th><th class="r">GKV / BG</th><th class="r">Privat</th><th class="r">Zuzahlung</th><th class="r">Netto</th><th class="r">Ausfall</th><th class="r">Offen</th><th class="r">Quote</th></tr></thead><tbody>`;
  monthNums.forEach(mi=>{const a=byM[mi];if(!a)return;h+=zeile(MN[mi-1],a,false);});
  h+=zeile('Summe',tot,true)+'</tbody></table></div><p class="hint">Offen = erbrachter Kalenderwert, der noch nicht abgerechnet ist (KIMOJO: Kalenderwert der Seite Erbracht minus thevea-Abrechnung; Medifox: Leistungen ohne Kennzeichen „Abgerechnet“). Quote = abgerechnet ÷ erbracht; im laufenden Monat naturgemäß niedriger, weil viele Rezepte noch offen sind.</p></section>';
  // Rechnungen & Zahlungseingang (thevea)
  if(RE.length){
    const ord={privat:1,selbstzahler:2,zuzahlung:3,ausfall:4,sonst:5};RE.sort((a,b)=>(ord[a.art]||9)-(ord[b.art]||9));
    h+=`<section class="sec"><div class="sec-h"><h2>Rechnungen und Zahlungseingang</h2><span class="sub">thevea-Rechnungen nach Rechnungsdatum · KIMOJO</span></div><div class="tbl-wrap"><table><thead><tr><th>Rechnungsart</th><th class="r">Anzahl</th><th class="r">Betrag</th><th class="r">Bezahlt</th><th class="r">Offen</th><th style="min-width:110px"></th></tr></thead><tbody>`;
    RE.forEach(x=>{const off=Math.max(0,x.betrag-x.bezahlt),pq=x.betrag>0?x.bezahlt/x.betrag*100:0;h+=`<tr><td><b>${esc(x.artName)}</b></td><td class="r">${n0(x.n)}</td><td class="r"><b>${eur0(x.betrag)}</b></td><td class="r c-g">${eur0(x.bezahlt)}</td><td class="r ${off>0?'c-a':'c-m'}">${eur0(off)}</td><td><div class="bar"><i style="width:${pq}%;background:var(--green)"></i></div></td></tr>`;});
    h+='</tbody></table></div><p class="hint">Alle nicht stornierten Rechnungen des Zeitraums; „Offen“ = Rechnungsbetrag minus Zahlungseingang. Zuzahlungsrechnungen zeigen, wie viel der Zuzahlungen schon eingegangen ist.</p></section>';
  }
  // Nach Therapeut:in
  const tl=P.filter(p=>p.brutto>0||p.offen>0).sort((a,b)=>b.brutto-a.brutto);const mx=Math.max(...tl.map(t=>t.brutto),1);
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Therapeut:in</h2><span class="sub">${tl.length} Personen · sortiert nach Brutto</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Beh.</th><th class="r">Brutto</th><th class="r">Zuzahlung</th><th class="r">Netto</th><th class="r">ø je Beh.</th><th class="r">Offen</th><th style="min-width:110px"></th></tr></thead><tbody>`;
  tl.forEach(t=>{h+=`<tr><td><b>${esc(t.name)}</b></td><td>${siteTag(t.standort)}</td><td class="r">${n0(t.beh)}</td><td class="r"><b>${eur0(t.brutto)}</b></td><td class="r">${eur0(t.zuz)}${t.zuzEst?'*':''}</td><td class="r">${eur0(t.netto)}</td><td class="r">${oe(t.beh?t.brutto/t.beh:0)}</td><td class="r">${t.quelle==='medifox'?eur0(t.offen):'<span class="c-m">—</span>'}</td><td><div class="bar"><i style="width:${t.brutto/mx*100}%;background:${SITE_COL[t.standort]||'var(--blue)'}"></i></div></td></tr>`;});
  h+='</tbody></table></div><p class="hint">KIMOJO je Person aus der thevea-Statistik (Privatanteil dort nicht je Person ausweisbar); Kitzingen je Person aus den Medifox-Zeilen mit Kennzeichen „Abgerechnet“, Offen = noch nicht abgerechnete Leistungen. Ergo-Nachnamen ergänzt der Weekly Tracker.</p></section>';
  return h;
}

// ── Krankenstand ─────────────────────────────────────────────────────────
// Krankheitstage je Person aus den Stammdaten (t.tag[ymd].grund): thevea
// Abwesenheiten KRANKHEIT seit dem Cutover (Werneck), Medifox-Abwesenheit
// „Krank" seit Januar (Kitzingen). Für KIMOJO-Monate vor dem Cutover liefert
// der Weekly Tracker die Krankheitstage je Tag (ohne Personenbezug).
// Krankenquote = Krankheitsstunden ÷ Soll-Stunden (Vertragszeit), Tage nur bis heute.
const KS_CUTOVER={'KIMOJO Physio':8,'KIMOJO Ergo':8};// ab diesem Monat zählt thevea
function ksDaten(){
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1),h0=ymdP(heute());
  const tage=new Set(tageImZeitraum(months).filter(d=>d<=h0));
  const P=[],M={},S={};
  const mAgg=()=>({sollTage:0,sollStd:0,krankTage:0,krankStd:0,personen:new Set(),tracker:0,quelle:'export'});
  D.ctrl.filter(t=>matchS(t.s)&&t.tag).forEach(t=>{
    const p={name:t.n,standort:t.s,sollTage:0,sollStd:0,krankTage:0,krankStd:0,urlaub:0,fortb:0,sonst:0,episoden:0,letzte:null,seit:null,bis:null,heuteKrank:false};
    let prev=false;
    Object.keys(t.tag).sort().forEach(d=>{
      const x=t.tag[d];if(!x.soll)return;
      const krank=x.grund==='KRANKHEIT';
      if(d>h0){if(krank&&p.heuteKrank&&(!p.bis||d>p.bis))p.bis=d;return;}
      if(!tage.has(d))return;
      p.sollTage++;p.sollStd+=x.soll/60;
      const m=+d.slice(5,7);const mm=M[m]||(M[m]=mAgg());mm.sollTage++;mm.sollStd+=x.soll/60;
      const sk=t.s+'|'+m;const ss=S[sk]||(S[sk]=mAgg());ss.sollTage++;ss.sollStd+=x.soll/60;
      if(krank){p.krankTage++;p.krankStd+=x.soll/60;mm.krankTage++;mm.krankStd+=x.soll/60;mm.personen.add(t.n);ss.krankTage++;ss.krankStd+=x.soll/60;ss.personen.add(t.n);p.letzte=d;if(!prev){p.episoden++;p.seit=d;}if(d===h0)p.heuteKrank=true;}
      else if(x.grund==='URLAUB')p.urlaub++;else if(x.grund==='FORTBILDUNG')p.fortb++;else if(x.grund)p.sonst++;
      prev=krank;
    });
    if(p.sollTage)P.push(p);
  });
  // Tracker-Krankheitstage je Standort und Monat (KIMOJO), nur bis heute
  const tr={'KIMOJO Physio':(D.trackerTage&&D.trackerTage.physio)||[],'KIMOJO Ergo':(D.trackerTage&&D.trackerTage.ergo)||[]};
  Object.keys(tr).forEach(site=>{if(!matchS(site))return;tr[site].forEach(x=>{if(!x.krank||!tage.has(x.ds))return;const m=+x.ds.slice(5,7);const ss=S[site+'|'+m]||(S[site+'|'+m]=mAgg());ss.tracker+=x.krank;});});
  // Vor dem Cutover zählt der Tracker statt des Exports. Die thevea-Historie
  // reicht nur 180 Tage zurück, deshalb kommt das Soll dieser Monate aus den
  // Monatsstunden (tvStdMonat, Rückfall Tracker-Wochenstunden) und den
  // Arbeitstagen Mo–Fr ohne Feiertage.
  const jahr=new Date().getFullYear(),feier=tvFeiertage(jahr);
  const arbeitstage=mi=>{let n=0;const tg=new Date(jahr,mi,0).getDate();for(let d=1;d<=tg;d++){const dt=new Date(jahr,mi-1,d),y=ymdP(dt);if(y>h0)break;if(dt.getDay()===0||dt.getDay()===6||feier.has(y))continue;n++;}return n;};
  Object.keys(KS_CUTOVER).forEach(site=>{if(!matchS(site))return;monthNums.forEach(mi=>{if(mi>=KS_CUTOVER[site])return;const k=site+'|'+mi;const ss=S[k]||(S[k]=mAgg());const personen=D.ctrl.filter(t=>t.s===site);let sollStd=0,n=0;personen.forEach(t=>{const st=tvStdMonat(t,MN[mi-1]);if(st.soll>0){sollStd+=st.soll;n++;}});const at=arbeitstage(mi);if(!n||!at){delete S[k];return;}ss.quelle='tracker';ss.sollStd=sollStd*(at/arbeitstage0(mi));ss.sollTage=n*at;ss.personen=new Set();ss.krankTage=ss.tracker;ss.krankStd=ss.sollTage?ss.tracker*(ss.sollStd/ss.sollTage):0;});});
  function arbeitstage0(mi){let n=0;const tg=new Date(jahr,mi,0).getDate();for(let d=1;d<=tg;d++){const dt=new Date(jahr,mi-1,d),y=ymdP(dt);if(dt.getDay()===0||dt.getDay()===6||feier.has(y))continue;n++;}return n;}
  // Monatswerte neu aus den Standortwerten summieren (nach dem Tracker-Tausch)
  const M2={};Object.keys(S).forEach(k=>{const m=+k.split('|')[1];const ss=S[k];const mm=M2[m]||(M2[m]={sollTage:0,sollStd:0,krankTage:0,krankStd:0,personen:new Set(),quellen:new Set()});mm.sollTage+=ss.sollTage;mm.sollStd+=ss.sollStd;mm.krankTage+=ss.krankTage;mm.krankStd+=ss.krankStd;ss.personen.forEach(n=>mm.personen.add(n));mm.quellen.add(ss.quelle);});
  return{months,monthNums,P,M:M2,S,h0};
}
function pKrankenstand(){
  const {months,monthNums,P,M,S,h0}=ksDaten();
  const sub=`${esc(zeitraumLabel())} · ${esc(sn(aS))} · bis ${ausYmd(h0).toLocaleDateString('de-DE')}`;
  if(!Object.keys(S).length)return`<section class="sec"><div class="sec-h"><h2>Krankenstand</h2><span class="sub">${sub}</span></div><div class="empty">Keine Arbeitszeiten im gewählten Zeitraum.</div></section>`;
  const Sv=Object.values(S);const sum=k=>Sv.reduce((t,x)=>t+x[k],0);
  const sollStd=sum('sollStd'),krankStd=sum('krankStd'),sollTage=sum('sollTage'),krankTage=sum('krankTage');
  const quote=sollStd>0?krankStd/sollStd*100:null;
  const amp=q=>q==null?'':q<=4?'c-g':q<=7?'c-a':'c-r';const pill=q=>q==null?'<span class="pill p-n">—</span>':`<span class="pill ${q<=4?'p-g':q<=7?'p-a':'p-r'}">${n1(q)} %</span>`;
  const heuteKrank=P.filter(p=>p.heuteKrank);
  const betroffen=P.filter(p=>p.krankTage>0).length;
  let h=`<section class="sec"><div class="sec-h"><h2>Krankenstand</h2><span class="sub">${sub}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Krankenquote</div><div class="v ${amp(quote)}">${quote==null?'—':n1(quote)+' %'}</div><div class="s">${n0(krankStd)} von ${n0(sollStd)} Soll-Stunden krank</div></div>`;
  h+=`<div class="kpi"><div class="l">Krankheitstage</div><div class="v">${n0(krankTage)}</div><div class="s">von ${n0(sollTage)} Soll-Arbeitstagen · ${n1(sollTage?krankTage/sollTage*100:0)} % der Tage</div></div>`;
  h+=`<div class="kpi"><div class="l">Betroffene</div><div class="v">${betroffen} <span class="c-m" style="font-size:16px">/ ${P.length}</span></div><div class="s">Personen mit Krankheitstag · ø <b>${n1(betroffen?krankTage/betroffen:0)}</b> Tage je Betroffene:r</div></div>`;
  h+=`<div class="kpi"><div class="l">Heute krank</div><div class="v ${heuteKrank.length?'c-r':'c-g'}">${heuteKrank.length}</div><div class="s">${heuteKrank.length?esc(heuteKrank.map(p=>p.name.split(',')[0]).join(', ')):'niemand gemeldet'}</div></div>`;
  h+='</div>';
  // Standorte
  const bySite={};Sv.forEach(x=>{const k=Object.keys(S).find(kk=>S[kk]===x).split('|')[0];const a=bySite[k]||(bySite[k]={standort:k,sollTage:0,sollStd:0,krankTage:0,krankStd:0,personen:new Set(),quellen:new Set()});a.sollTage+=x.sollTage;a.sollStd+=x.sollStd;a.krankTage+=x.krankTage;a.krankStd+=x.krankStd;x.personen.forEach(n=>a.personen.add(n));a.quellen.add(x.quelle);});
  const sites=Object.values(bySite);
  const qTxt=q=>q.has('tracker')&&q.has('export')?'Export + Tracker':q.has('tracker')?'Tracker':'Export';
  if(sites.length>1)h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Standort</th><th class="r">Soll-Tage</th><th class="r">Krank-Tage</th><th class="r">Krank-Std.</th><th class="r">Quote</th><th class="r">Betroffene</th><th>Quelle</th></tr></thead><tbody>'+sites.map(a=>`<tr><td>${siteTag(a.standort)}</td><td class="r">${n0(a.sollTage)}</td><td class="r"><b>${n0(a.krankTage)}</b></td><td class="r">${n0(a.krankStd)}</td><td class="r">${pill(a.sollStd?a.krankStd/a.sollStd*100:null)}</td><td class="r">${a.personen.size||'—'}</td><td class="c-m">${qTxt(a.quellen)}</td></tr>`).join('')+'</tbody></table></div>';
  h+='<p class="hint">Krankenquote = Krankheitsstunden ÷ Soll-Stunden der Vertragszeit (Feiertage abgezogen), nur Tage bis heute. Werneck aus den thevea-Abwesenheiten „Krankheit“ seit dem Cutover (Juli/August), davor aus den Krankheitstagen des Weekly Trackers (Tageszähler ohne Personenbezug, Stunden mit dem Tagesdurchschnitt bewertet); Kitzingen aus der Medifox-Abwesenheit „Krank“ seit Januar. Ampel bis 4 % grün, bis 7 % gelb.</p></section>';
  // Nach Monat
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Monat</h2><span class="sub">Soll-Tage und Krankheitstage aller Personen des Standortfilters</span></div><div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Soll-Tage</th><th class="r">Krank-Tage</th><th class="r">Krank-Std.</th><th class="r">Quote</th><th class="r">Betroffene</th><th style="min-width:110px"></th><th>Quelle</th></tr></thead><tbody>`;
  const mx=Math.max(...Object.values(M).map(m=>m.sollStd?m.krankStd/m.sollStd*100:0),1);
  monthNums.forEach(mi=>{const m=M[mi];if(!m||!m.sollTage)return;const q=m.sollStd?m.krankStd/m.sollStd*100:null;h+=`<tr><td>${MN[mi-1]}</td><td class="r">${n0(m.sollTage)}</td><td class="r"><b>${n0(m.krankTage)}</b></td><td class="r">${n0(m.krankStd)}</td><td class="r">${pill(q)}</td><td class="r">${m.personen.size||'—'}</td><td><div class="bar"><i style="width:${q==null?0:q/mx*100}%;background:${q<=4?'var(--green)':q<=7?'var(--amber)':'var(--red)'}"></i></div></td><td class="c-m">${qTxt(m.quellen)}</td></tr>`;});
  h+=`<tr class="sum"><td>Summe</td><td class="r">${n0(sollTage)}</td><td class="r">${n0(krankTage)}</td><td class="r">${n0(krankStd)}</td><td class="r">${pill(quote)}</td><td class="r">${betroffen||'—'}</td><td></td><td></td></tr></tbody></table></div></section>`;
  // Aktuell krank
  if(heuteKrank.length){
    h+=`<section class="sec"><div class="sec-h"><h2>Aktuell krank</h2><span class="sub">Stand heute</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th>Seit</th><th>Gemeldet bis</th><th class="r">Tage in dieser Episode</th></tr></thead><tbody>`;
    heuteKrank.forEach(p=>{const seit=ausYmd(p.seit),tage=Math.round((ausYmd(h0)-seit)/864e5)+1;h+=`<tr><td><b>${esc(p.name)}</b></td><td>${siteTag(p.standort)}</td><td>${seit.toLocaleDateString('de-DE')}</td><td>${p.bis?ausYmd(p.bis).toLocaleDateString('de-DE'):'<span class="c-m">offen</span>'}</td><td class="r">${tage}</td></tr>`;});
    h+='</tbody></table></div></section>';
  }
  // Je Person
  const tl=P.filter(p=>p.krankTage>0).sort((a,b)=>(b.sollStd?b.krankStd/b.sollStd:0)-(a.sollStd?a.krankStd/a.sollStd:0));
  const ohne=P.length-tl.length;
  h+=`<section class="sec"><div class="sec-h"><h2>Je Therapeut:in</h2><span class="sub">${tl.length} Personen mit Krankheitstagen · ${ohne} ohne</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Soll-Tage</th><th class="r">Krank-Tage</th><th class="r">Krank-Std.</th><th class="r">Quote</th><th class="r">Episoden</th><th>Zuletzt</th><th class="r">Urlaub</th><th class="r">Fortb.</th></tr></thead><tbody>`;
  tl.forEach(p=>{const q=p.sollStd?p.krankStd/p.sollStd*100:null;h+=`<tr><td><b>${esc(p.name)}</b></td><td>${siteTag(p.standort)}</td><td class="r">${n0(p.sollTage)}</td><td class="r"><b>${n0(p.krankTage)}</b></td><td class="r">${n0(p.krankStd)}</td><td class="r">${pill(q)}</td><td class="r">${p.episoden}</td><td>${p.letzte?ausYmd(p.letzte).toLocaleDateString('de-DE'):'—'}</td><td class="r c-m">${n0(p.urlaub)}</td><td class="r c-m">${n0(p.fortb)}</td></tr>`;});
  h+='</tbody></table></div><p class="hint">Nur Personen mit Krankheitstagen im Zeitraum; Werneck erst ab dem thevea-Cutover personenscharf, die Tracker-Krankheitstage davor stehen nur in den Monats- und Standortwerten. Episoden = zusammenhängende Krankmeldungen, Urlaub und Fortbildung als Arbeitstage zum Vergleich.</p></section>';
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


// ── Auslastung ───────────────────────────────────────────────────────────
// Dieselben Quellen wie auf der Übersicht: Werneck aus der Patientenchecker-
// Tagesmessung (bereinigt), Kitzingen aus dem Medifox-Kalender. Der Weekly
// Tracker steht als von Hand gepflegter Vergleichswert daneben.
function wochenImZeitraum(){
  const h0=heute(),hs=ymdP(h0);const tage=tageImZeitraum(getActiveMonths()).filter(y=>{const d=ausYmd(y).getDay();return d>=1&&d<=5&&y<=hs;});
  const map={};tage.forEach(y=>{const d=ausYmd(y);const kw=tvWoche(d);(map[kw]=map[kw]||{kw,tage:[],von:y}).tage.push(y);});
  return Object.values(map).sort((a,b)=>a.kw-b.kw);
}
function trackerWoche(kw,site){
  const q=site==='PF im Park'?D.auslP:D.auslK;const e=(q||[]).find(x=>x.kw===kw);if(!e)return null;
  return site==='KIMOJO Ergo'?e.ergo:e.physio;
}
function auslPersonen(tage){
  const out=[];const tset=new Set(tage);
  // Werneck: Patientenchecker-Therapeutenliste je Tag
  const q=D.kenn&&D.kenn.werneck;const pc={};
  (q&&q.tage||[]).forEach(t=>{if(!tset.has(t.ds))return;Object.keys(PC_LOC).forEach(site=>{const l=t.loc&&t.loc[PC_LOC[site]];if(!l||!l.heute||!sitesAktiv().includes(site))return;(l.heute.thListe||[]).forEach(x=>{const nm=(()=>{const t=String(x.name||'').trim();const i=t.lastIndexOf(' ');return i>0?t.slice(i+1)+', '+t.slice(0,i):t;})();const k=site+'|'+nm;const a=pc[k]||(pc[k]={name:nm,site,pm:0,vm:0,wm:0,tage:0});a.pm+=x.pm||0;a.vm+=x.vm||0;a.wm+=x.wm||0;if((x.wm||0)>0)a.tage++;});});});
  Object.values(pc).forEach(a=>{if(a.wm>0)out.push({name:a.name,site:a.site,pct:a.vm>0?a.pm/a.vm*100:null,brutto:a.pm/a.wm*100,geb:a.pm,kap:a.vm,tage:a.tage,quelle:'pc'});});
  // Kitzingen: Kalender je Person
  if(sitesAktiv().includes('PF im Park')){
    const {idx}=auslIndex();const geb={};
    D.raw.forEach(r=>{if(rowSite(r)!=='PF im Park'||!r.dateKey||!(r.durMin>0))return;if(/ausfallrechnung/i.test(r.leistung||''))return;const p=r.dateKey.split('-');const y=p[0]+'-'+String(p[1]).padStart(2,'0')+'-'+String(p[2]).padStart(2,'0');if(!tset.has(y))return;geb[r.name]=(geb[r.name]||0)+r.durMin;});
    D.ctrl.filter(t=>t.s==='PF im Park'&&t.tag).forEach(t=>{let kap=0,n=0;tage.forEach(y=>{const d=t.tag[y];if(d&&d.anw>0){kap+=d.anw;n++;}});const g=geb[t.n]||0;if(kap>0||g>0)out.push({name:t.n,site:'PF im Park',pct:kap>0?g/kap*100:null,brutto:null,geb:g,kap,tage:n,quelle:'kal'});});
  }
  return out.sort((a,b)=>(b.pct||0)-(a.pct||0));
}
function pAuslastung(){
  const sites=sitesAktiv(),h0=heute();
  const wochen=wochenImZeitraum();
  const woche=[];for(let i=0;i<5;i++)woche.push(ymdP(plusTage(montag(h0),i)));
  const vorwoche=woche.map(y=>ymdP(plusTage(ausYmd(y),-7)));
  const zr=[].concat(...wochen.map(w=>w.tage));
  const amp=v=>ampelPill(v,90,80);
  let h=`<section class="sec"><div class="sec-h"><h2>Auslastung</h2><span class="sub">${esc(zeitraumLabel())} · Werneck: Patientenchecker bereinigt · Kitzingen: Kalender</span></div><div class="grid g3">`;
  sites.forEach(s=>{h+=`<div class="kpi"><div class="l">${siteTag(s)}</div><div class="v">${pctS(auslSumme(zr,s))}</div><div class="s">${esc(zeitraumLabel())} · diese Woche <b>${pctS(auslSumme(woche,s))}</b> · Vorwoche <b>${pctS(auslSumme(vorwoche,s))}</b></div></div>`;});
  h+='</div></section>';
  // Wochen
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Kalenderwoche</h2><span class="sub">Messung · daneben der Weekly Tracker (von Hand)</span></div><div class="tbl-wrap"><table><thead><tr><th>KW</th><th>Montag</th>${sites.map(s=>`<th class="r">${esc(sn(s))}</th><th class="r c-m">Tracker</th>`).join('')}</tr></thead><tbody>`;
  wochen.slice().reverse().forEach(w=>{
    h+=`<tr${w.tage.includes(ymdP(h0))?' class="today"':''}><td>KW ${w.kw}</td><td class="c-m">${esc(fDat(ausYmd(w.von)).replace(/^\S+\s/,''))}</td>`+sites.map(s=>{const v=auslSumme(w.tage,s),t=trackerWoche(w.kw,s);return`<td class="r">${amp(v)}</td><td class="r c-m">${t==null?'—':n1(t)+' %'}</td>`;}).join('')+'</tr>';
  });
  h+='</tbody></table></div><p class="hint">Der Tracker-Wert stammt aus dem Blatt „Auslastung“ des Weekly KPI Trackers und wird manuell eingetragen; Abweichungen zur Messung sind normal, weil dort anders gerechnet wird.</p></section>';
  // Wochentage
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Wochentag</h2><span class="sub">${esc(zeitraumLabel())} · wo entstehen die Lücken?</span></div><div class="tbl-wrap"><table><thead><tr><th>Wochentag</th>${sites.map(s=>`<th class="r">${esc(sn(s))}</th>`).join('')}</tr></thead><tbody>`;
  ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'].forEach((wd,i)=>{const t=zr.filter(y=>ausYmd(y).getDay()===i+1);h+=`<tr><td>${wd}</td>`+sites.map(s=>`<td class="r">${amp(auslSumme(t,s))} <span class="c-m" style="font-size:11px">${t.length} Tage</span></td>`).join('')+'</tr>';});
  h+='</tbody></table></div></section>';
  // Therapeut:innen
  const pers=auslPersonen(zr);
  h+=`<section class="sec"><div class="sec-h"><h2>Je Therapeut:in</h2><span class="sub">${pers.length} Personen · ${esc(zeitraumLabel())}</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Auslastung</th><th class="r">brutto</th><th class="r">Patientenzeit</th><th class="r">verfügbar</th><th class="r">Tage</th></tr></thead><tbody>`;
  pers.forEach(p=>{h+=`<tr><td>${esc(p.name)}</td><td>${siteTag(p.site)}</td><td class="r">${amp(p.pct)}</td><td class="r c-m">${p.brutto==null?'—':n1(p.brutto)+' %'}</td><td class="r">${n1(p.geb/60)} h</td><td class="r">${n1(p.kap/60)} h</td><td class="r c-m">${p.tage}</td></tr>`;});
  h+='</tbody></table></div><p class="hint">Werneck: Patientenminuten ÷ verfügbare Minuten je Person aus der Patientenchecker-Messung, brutto gegen die Arbeitsminuten. Kitzingen: gebuchte Minuten ÷ anwesende Soll-Minuten aus Medifox. Ampel: ≥ 90 % grün, ≥ 80 % gelb.</p></section>';
  return h;
}


// Tageszeilen einer Person auf der Erbracht-Seite: Termine, Umsatz, Stunden.
// Tageszeilen werden erst beim ersten Aufklappen gebaut (sonst wird die Seite sehr groß).
const ERB_TAGE={};
function toggleTage(id){const el=document.getElementById(id);if(!el)return;if(!el.dataset.ok){const d=ERB_TAGE[id];if(d){el.firstElementChild.innerHTML=tageTabelle(d.t,d.rows);el.dataset.ok='1';}}el.style.display=el.style.display==='none'?'':'none';}
function tageTabelle(t,rows){
  const byD={};
  rows.forEach(r=>{let y;if(r.datum){y=ymdP(r.datum);}else if(r.dateKey){const p=r.dateKey.split('-');y=p[0]+'-'+String(p[1]).padStart(2,'0')+'-'+String(p[2]).padStart(2,'0');}else return;
    const d=byD[y]||(byD[y]={n:0,sum:0,erb:0,offen:0,aus:0,res:0});d.n++;d.sum+=r.price;if(r.kind==='erbracht')d.erb+=r.price;else if(r.kind==='offen')d.offen+=r.price;else if(r.kind==='ausfall')d.aus+=r.price;else d.res+=r.price;});
  const tag=t.ctrl&&t.ctrl.tag||{};
  const ymds=[...new Set([...Object.keys(byD),...Object.keys(tag).filter(y=>{const mi=+y.slice(5,7);return getActiveMonths().includes(MN[mi-1])&&y.slice(0,4)==String(new Date().getFullYear());})])].sort();
  if(!ymds.length)return'<div class="empty">Keine Tage.</div>';
  const h0=ymdP(heute());
  let h='<div class="tbl-wrap" style="margin:0"><table style="min-width:0;font-size:12px"><thead><tr><th>Tag</th><th class="r">Termine</th><th class="r">Umsatz</th><th class="r">Stattgef.</th><th class="r">Geplant</th><th class="r">Ausf. · Res.</th><th class="r">Soll h</th><th class="r">Anw. h</th><th class="r">€ / anw. Std.</th></tr></thead><tbody>';
  ymds.forEach(y=>{const d=byD[y]||{n:0,sum:0,erb:0,offen:0,aus:0,res:0},s=tag[y]||{soll:0,anw:0};if(!d.n&&!s.soll)return;const dt=ausYmd(y);
    const abw=s.soll>0&&s.anw===0;const eph=s.anw>0?d.sum/(s.anw/60):null;
    h+=`<tr${y===h0?' class="today"':''}${y>h0?' style="color:var(--faint)"':''}><td>${esc(fDat(dt))}${abw?' <span class="pill p-n">abwesend</span>':''}</td><td class="r">${n0(d.n)}</td><td class="r"><b>${eur0(d.sum)}</b></td><td class="r">${eur0(d.erb)}</td><td class="r">${eur0(d.offen)}</td><td class="r c-m">${eur0(d.aus+d.res)}</td><td class="r">${s.soll?n1(s.soll/60):'—'}</td><td class="r">${s.soll?n1(s.anw/60):'—'}</td><td class="r">${eph==null?'—':n1(eph)}</td></tr>`;});
  return h+'</tbody></table></div>';
}


// ── Terminvergabe ────────────────────────────────────────────────────────
// Tageswerte aus dem Weekly Tracker: „Termine vereinbart“ und „davon
// Neuaufnahmen/Neuanfragen“. Wochenwerte sind Summen, ø je Tag teilt durch
// die Tage mit Eintrag.
function termineQuellen(){
  const tt=D.trackerTage||{};
  return[{site:'KIMOJO Physio',d:tt.physio||[]},{site:'KIMOJO Ergo',d:tt.ergo||[]},{site:'PF im Park',d:tt.phfip||[]}].filter(q=>sitesAktiv().includes(q.site));
}
function pTermine(){
  const quellen=termineQuellen();const h0=heute(),hs=ymdP(h0);
  const months=getActiveMonths(),zr=new Set(tageImZeitraum(months));
  const sum=(arr,f)=>arr.reduce((s,x)=>s+(x[f]||0),0);
  let h=`<section class="sec"><div class="sec-h"><h2>Terminvergabe</h2><span class="sub">${esc(zeitraumLabel())} · Termine vereinbart je Tag, davon Neuanfragen</span></div>`;
  if(!quellen.some(q=>q.d.length))return h+'<div class="empty">Keine Tracker-Einträge für die aktuelle Auswahl.</div></section>';
  h+='<div class="grid g3">';
  quellen.forEach(q=>{const inZr=q.d.filter(x=>x.ds<=hs&&zr.has(x.ds));const wo=q.d.filter(x=>x.ds>=ymdP(montag(h0))&&x.ds<=hs);const tage=inZr.filter(x=>x.vereinbart!=null).length;
    h+=`<div class="kpi"><div class="l">${siteTag(q.site)}</div><div class="v">${n0(sum(inZr,'vereinbart'))}</div><div class="s">${esc(zeitraumLabel())} · ø <b>${tage?n1(sum(inZr,'vereinbart')/tage):'—'}</b> je Tag · Neuanfragen <b>${q.site==='PF im Park'?'—':n0(sum(inZr,'neu'))}</b></div><div class="s">diese Woche <b>${n0(sum(wo,'vereinbart'))}</b></div></div>`;});
  h+='</div></section>';
  // Wochen
  const wochen={};quellen.forEach(q=>q.d.forEach(x=>{if(!zr.has(x.ds)||x.ds>hs)return;const kw=tvWoche(ausYmd(x.ds));const w=wochen[kw]||(wochen[kw]={kw,von:x.ds,sites:{}});if(x.ds<w.von)w.von=x.ds;const s=w.sites[q.site]||(w.sites[q.site]={v:0,n:0,t:0});s.v+=x.vereinbart||0;s.n+=x.neu||0;if(x.vereinbart!=null)s.t++;}));
  const wl=Object.values(wochen).sort((a,b)=>b.kw-a.kw);
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Kalenderwoche</h2><span class="sub">Summe · ø je Tag · Neuanfragen</span></div><div class="tbl-wrap"><table><thead><tr><th>KW</th><th>Montag</th>${quellen.map(q=>`<th class="r">${esc(sn(q.site))}</th><th class="r c-m">ø / Tag</th><th class="r c-m">neu</th>`).join('')}</tr></thead><tbody>`;
  wl.forEach(w=>{h+=`<tr${w.kw===tvWoche(h0)?' class="today"':''}><td>KW ${w.kw}</td><td class="c-m">${esc(fDat(montag(ausYmd(w.von))).replace(/^\S+\s/,''))}</td>`+quellen.map(q=>{const s=w.sites[q.site];return s?`<td class="r"><b>${n0(s.v)}</b></td><td class="r c-m">${s.t?n1(s.v/s.t):'—'}</td><td class="r c-m">${q.site==='PF im Park'?'—':n0(s.n)}</td>`:'<td class="r">—</td><td></td><td></td>';}).join('')+'</tr>';});
  h+='</tbody></table></div></section>';
  // Letzte Tage
  const tage=[];for(let d=new Date(h0);tage.length<10;d=plusTage(d,-1)){if(d.getDay()>=1&&d.getDay()<=5)tage.unshift(ymdP(d));}
  h+=`<section class="sec"><div class="sec-h"><h2>Letzte zehn Arbeitstage</h2><span class="sub">Termine vereinbart (davon neu)</span></div><div class="tbl-wrap"><table><thead><tr><th>Tag</th>${quellen.map(q=>`<th class="r">${esc(sn(q.site))}</th>`).join('')}</tr></thead><tbody>`;
  tage.forEach(y=>{h+=`<tr${y===hs?' class="today"':''}><td>${esc(fDat(ausYmd(y)))}</td>`+quellen.map(q=>{const x=q.d.find(e=>e.ds===y);return`<td class="r">${x&&x.vereinbart!=null?`<b>${n0(x.vereinbart)}</b>${x.neu!=null?` <span class="c-m">(${n0(x.neu)})</span>`:''}`:'<span class="c-m">kein Eintrag</span>'}</td>`;}).join('')+'</tr>';});
  h+='</tbody></table></div><p class="hint">Quelle: Weekly KPI Tracker je Standort. Kitzingen führt keine Neuanfragen-Spalte. Tage ohne Eintrag zählen nicht als null.</p></section>';
  return h;
}

// ── Therapeuten · Umsatz pro Stunde ──────────────────────────────────────
// Dieselben Zahlen wie auf Übersicht und Erbracht: Therapieumsatz je Person
// gegen Soll-Stunden und anwesende Stunden des Zeitraums, gewichtet.
function pTherapeuten(){
  const months=getActiveMonths(),rows=erbrachtZeilen();
  const agg={},cnt={};rows.forEach(r=>{agg[r.name]=(agg[r.name]||0)+r.price;cnt[r.name]=(cnt[r.name]||0)+1;});
  const list=D.ctrl.filter(t=>matchS(t.s)&&agg[t.n]>0).map(t=>{const st=tvStdSumme(t,months);const u=agg[t.n];return{t,u,b:cnt[t.n],soll:st.soll,anw:st.anw,tracker:st.tracker,ev:st.soll>0?u/st.soll:null,ea:st.anw>0?u/st.anw:null,plan:getPlanTherapist(t.plan||t.n,months)};}).sort((a,b)=>(b.ev||0)-(a.ev||0));
  if(!list.length)return'<section class="sec"><div class="empty">Keine Umsätze im gewählten Zeitraum.</div></section>';
  const S=k=>list.reduce((s,x)=>s+x[k],0);const gV=S('soll')>0?S('u')/S('soll'):0,gA=S('anw')>0?S('u')/S('anw'):0;
  const amp=v=>v>=65?'p-g':v>=56?'p-a':'p-r';const cls=v=>v>=65?'c-g':v>=56?'c-a':'c-r';
  const gut=list.filter(x=>x.ev>=65).length,mittel=list.filter(x=>x.ev>=56&&x.ev<65).length,rot=list.filter(x=>x.ev<56).length;
  let h=`<section class="sec"><div class="sec-h"><h2>Umsatz pro Stunde</h2><span class="sub">${esc(zeitraumLabel())} · ${esc(sn(aS))} · ${list.length} Personen</span></div><div class="grid">`;
  h+=`<div class="kpi"><div class="l">€ je Vertragsstunde</div><div class="v ${cls(gV)}">${n1(gV)} €</div><div class="s">gewichtet · ${n0(S('soll'))} Soll-Stunden</div></div>`;
  h+=`<div class="kpi"><div class="l">€ je anwesender Stunde</div><div class="v ${cls(gA)}">${n1(gA)} €</div><div class="s">gewichtet · ${n0(S('anw'))} anwesende Stunden</div></div>`;
  h+=`<div class="kpi"><div class="l">Verteilung</div><div class="v"><span class="c-g">${gut}</span> · <span class="c-a">${mittel}</span> · <span class="c-r">${rot}</span></div><div class="s">≥ 65 · 56–65 · &lt; 56 € je Vertragsstunde</div></div>`;
  const mitPlan=list.filter(x=>x.plan>0);h+=`<div class="kpi"><div class="l">Plan</div><div class="v">${mitPlan.filter(x=>x.u>=x.plan).length} / ${mitPlan.length}</div><div class="s">Personen über ihrem Umsatzplan</div></div>`;
  h+='</div></section>';
  h+=`<section class="sec"><div class="sec-h"><h2>Je Therapeut:in</h2><span class="sub">sortiert nach € je Vertragsstunde</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Soll h</th><th class="r">Anw. h</th><th class="r">Umsatz</th><th class="r">Plan</th><th class="r">Beh.</th><th class="r">€ / Vertragsstd.</th><th class="r">€ / anw. Std.</th><th style="min-width:110px"></th></tr></thead><tbody>`;
  const mx=Math.max(...list.map(x=>x.u),1);
  list.forEach(x=>{const pd=x.plan>0?(x.u-x.plan)/x.plan*100:null;
    h+=`<tr><td><b>${esc(x.t.n)}</b></td><td>${siteTag(x.t.s)}</td><td class="r">${n1(x.soll)}${x.tracker?' <span title="Stunden aus dem Weekly Tracker">*</span>':''}</td><td class="r">${n1(x.anw)}</td><td class="r"><b>${eur0(x.u)}</b></td><td class="r">${pd==null?'<span class="c-m">—</span>':`<span class="c-m">${fmK(x.plan)}</span> <span class="pill ${pd>=0?'p-g':'p-r'}">${pd>=0?'+':''}${n0(pd)} %</span>`}</td><td class="r c-m">${n0(x.b)}</td><td class="r">${x.ev==null?'—':`<span class="pill ${amp(x.ev)}">${n1(x.ev)}</span>`}</td><td class="r">${x.ea==null?'—':`<span class="pill ${amp(x.ea)}">${n1(x.ea)}</span>`}</td><td><div class="bar"><i style="width:${x.u/mx*100}%;background:${x.ev>=65?'var(--green)':x.ev>=56?'var(--amber)':'var(--red)'}"></i></div></td></tr>`;});
  h+='</tbody></table></div><p class="hint">Umsatz = Therapieumsatz des Zeitraums wie auf der Seite Erbracht (Kalenderwert, Kitzingen ohne Club, T-RENA und Kurse). Soll-Stunden aus thevea bzw. Medifox an den Kalendertagen ohne Feiertage, anwesende Stunden ohne Urlaub, Krankheit, Fortbildung; Stern = Tracker-Stunden ohne Abwesenheiten. Plan aus der Planung je Therapeut:in.</p></section>';
  return h;
}
