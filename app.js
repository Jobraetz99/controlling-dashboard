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
  {id:'bwa',l:'BWA'},
  {id:'cashflow',l:'Cashflow'},
  {id:'liquiditaet',l:'Liquidität'},
  {id:'praxis',l:'Praxismanagement'}
];
aM='AKTUELL';// Standard: laufender Monat eingeschlossen
// Gewähltes Jahr (Jahresauswahl in der Filterleiste). data.js liest es über cockpitJahr().
var aJ=new Date().getFullYear();
const JAHR_START=2026;// erstes Jahr mit Daten im Cockpit
function setJ(j){if(+j===+aJ)return;aJ=+j;aM='AKTUELL';anfrTag=null;loadAll();}
const istVorjahr=()=>cockpitJahr()<new Date().getFullYear();
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
const SITE_COL={'KIMOJO Physio':'var(--primary)','KIMOJO Ergo':'var(--accent)','PF im Park':'var(--teal)','KIMOJO (Medifox)':'var(--primary)'};
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
  const jahr=cockpitJahr(),out=[];
  months.forEach(m=>{const mi=MN.indexOf(m);if(mi<0)return;const n=new Date(jahr,mi+1,0).getDate();for(let d=1;d<=n;d++)out.push(ymdP(new Date(jahr,mi,d)));});
  return out;
}
function zeitraumLabel(){
  const months=getActiveMonths();
  if(aM==='YTD')return'Jahr bis '+(months.length?months[months.length-1]:'heute');
  if(aM==='AKTUELL')return istVorjahr()?'Jan – Dez '+cockpitJahr():'Jan – '+MN[new Date().getMonth()]+' (laufend)';
  return aM+' '+cockpitJahr();
}
const ampelPill=(v,g,a,inv)=>{if(v==null)return'<span class="pill p-n">—</span>';const ok=inv?v<=g:v>=g,mid=inv?v<=a:v>=a;return`<span class="pill ${ok?'p-g':mid?'p-a':'p-r'}">${n1(v)}${inv===undefined||inv===false?' %':''}</span>`;};
const planPill=(ist,plan)=>{if(!plan)return'';const d=(ist-plan)/Math.abs(plan)*100;return`<span class="pill ${d>=0?'p-g':'p-r'}">${d>=0?'+':''}${n1(d)} % zum Plan ${fmK(plan)}</span>`;};

// ── Filter und Navigation ────────────────────────────────────────────────
function rFilter(){
  const el=document.getElementById('filters');if(!el)return;
  const rawMonths=new Set(D.raw.map(r=>r.month).filter(Boolean).map(m=>MN[m-1]));
  const bwaMonths=new Set([...getBWAMonths(D.bwaK).map(x=>x.month),...getBWAMonths(D.bwaP).map(x=>x.month)]);
  const avail=new Set([...bwaMonths,...rawMonths]);
  let h='';
  const jNow=new Date().getFullYear();if(jNow>JAHR_START){h+='<div class="seg">';for(let j=JAHR_START;j<=jNow;j++)h+=`<button class="${+aJ===j?'a':''}" onclick="setJ(${j})">${j}</button>`;h+='</div>';}
  h+='<div class="seg">';
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
  // Praxismanagement hat eigene Filter (Betrieb, Zeitraum); die globale Leiste ausblenden.
  const fl=document.getElementById('filters');if(fl)fl.style.display=p.id==='praxis'?'none':'';
  if(p.id==='praxis'){el.innerHTML=pPraxis();try{rPraxis();}catch(e){console.warn('Praxis:',e);}try{pmAbgleich();}catch(e){}window.scrollTo({top:0});return;}
  el.innerHTML=p.id==='uebersicht'?pUebersicht():p.id==='erbracht'?pErbracht():p.id==='abgerechnet'?pAbgerechnet():p.id==='vorschau'?pVorschau():p.id==='planist'?pPlanIst():p.id==='auslastung'?pAuslastung():p.id==='termine'?pTermine():p.id==='therapeuten'?pTherapeuten():p.id==='krankenstand'?pKrankenstand():p.id==='bwa'?pBwa():p.id==='cashflow'?pCashflow():p.id==='liquiditaet'?pLiquiditaet():pAlt(p);
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
  // Vorjahr im gleichen Zeitraum; im laufenden Monat nur bis zum heutigen Tag.
  const vj=(()=>{const vjRows=(D.rawVJ||[]).filter(r=>monthNums.includes(r.month)&&tvRowPasst(r,theraNames));if(!vjRows.length)return null;const h0=new Date();const lfdM=!istVorjahr()?h0.getMonth()+1:0;let sum=0;vjRows.forEach(r=>{if(r.month===lfdM){let tag=null;if(r.datum)tag=new Date(r.datum).getDate();else if(r.dateKey)tag=+String(r.dateKey).split('-')[2];if(tag&&tag>h0.getDate())return;}sum+=r.price;});return sum>0?sum:null;})();
  const vjPill=vj?`<div class="s">Vorjahr ${cockpitJahr()-1}: <b>${eur0(vj)}</b> <span class="pill ${bis>=vj?'p-g':'p-r'}">${bis>=vj?'+':''}${n0((bis-vj)/vj*100)} %</span>${!istVorjahr()?' (bis heute)':''}</div>`:'';
  const amp=v=>v>=65?'c-g':v>=56?'c-a':'c-r';
  let h=`<section class="sec"><div class="sec-h"><h2>Umsatz erbracht</h2><span class="sub">${esc(zeitraumLabel())} · ${esc(sn(aS))}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Umsatz erbracht</div><div class="v">${eur0(ges)}</div><div class="s">davon <b>${eur0(bis)}</b> bereits erbracht · <b>${eur0(zuk)}</b> geplant bis Monatsende</div>${vjPill}${planEin?`<div class="s">${planPill(ges,planEin)}</div>`:''}</div>`;
  const sites=sitesAktiv().filter(s=>bySite[s]);
  if(sites.length>1)h+=`<div class="kpi"><div class="l">Nach Standort</div>${sites.map(s=>`<div class="s" style="display:flex;justify-content:space-between;gap:8px;margin-top:6px">${siteTag(s)}<b>${eur0(bySite[s])}</b></div>`).join('')}</div>`;
  h+=`<div class="kpi"><div class="l">€ je Vertragsstunde</div><div class="v ${amp(ephV)}">${n1(ephV)} €</div><div class="s">Umsatz ÷ Soll-Stunden (${n0(std.soll)} h) · Ziel ≥ 65</div></div>`;
  h+=`<div class="kpi"><div class="l">€ je anwesender Stunde</div><div class="v ${amp(ephA)}">${n1(ephA)} €</div><div class="s">ohne Urlaub, Krankheit, Fortbildung (${n0(std.anw)} h)</div></div>`;
  h+='</div>';
  if(D.dateienJahr&&D.dateienJahr.fehlt.length){const nm={kpi:'Weekly KPI Tracker KIMOJO',kpiPhfip:'Weekly KPI Tracker PF im Park',planK:'Planung KIMOJO',planP:'Planung PF im Park'};h+=`<p class="hint c-a">Für ${cockpitJahr()} fehlt: ${esc(D.dateienJahr.fehlt.map(k=>nm[k]||k).join(', '))}. Das Cockpit sucht im Ordner der 2026er-Datei nach demselben Namen mit „${cockpitJahr()}“; liegt die Datei anders, muss sie einmal eingetragen werden.</p>`;}
  if(D.thevea&&D.thevea.bis)h+=`<p class="hint">Stattgefunden bis ${D.thevea.bis.toLocaleDateString('de-DE')} · Kitzingen aus Medifox ohne Club, T-RENA und Präventionskurse.</p>`;
  return h+'</section>';
}

// 2 · Terminanfragen aus dem Weekly Tracker: „Termine vereinbart“ je Tag
//     und davon Neuanfragen. Eine leere Zeile ist kein Tag mit null Terminen.
let anfrTag=null;// gewählter Tag im Block Terminanfragen (null = letzter Eintrag)
function anfrQuellen(){const tt=D.trackerTage||{};return[{site:'KIMOJO Physio',d:tt.physio||[]},{site:'KIMOJO Ergo',d:tt.ergo||[]},{site:'PF im Park',d:tt.phfip||[]}].filter(q=>sitesAktiv().includes(q.site));}
function anfrTage(){const h0s=ymdP(heute());return[...new Set(anfrQuellen().flatMap(q=>q.d.filter(x=>x.ds<=h0s&&(x.vereinbart!=null||x.neu!=null)).map(x=>x.ds)))].sort();}
function anfrSchritt(dir){const t=anfrTage();if(!t.length)return;let i=t.indexOf(anfrTag||t[t.length-1]);if(i<0)i=t.length-1;i=Math.max(0,Math.min(t.length-1,i+dir));anfrTag=i===t.length-1?null:t[i];const el=document.getElementById('secAnfr');if(el)el.outerHTML=secAnfragen();}
function secAnfragen(){
  const quellen=anfrQuellen();
  const months=getActiveMonths(),zr=new Set(tageImZeitraum(months));
  const h0=heute(),h0s=ymdP(h0);
  let h=`<section class="sec" id="secAnfr"><div class="sec-h"><h2>Terminanfragen</h2><span class="sub">Termine vereinbart · davon Neuanfragen</span></div>`;
  if(!quellen.some(q=>q.d.length))return h+'<div class="empty">Keine Tracker-Einträge für die aktuelle Auswahl.</div></section>';
  const tage=anfrTage(),sel=anfrTag&&tage.includes(anfrTag)?anfrTag:tage[tage.length-1];
  const iSel=tage.indexOf(sel),selD=sel?ausYmd(sel):h0;
  // Woche des gewählten Tages (Mo bis So, höchstens bis heute) und die Woche davor
  const wMo=ymdP(montag(selD)),wSo=ymdP(plusTage(montag(selD),6)),vMo=ymdP(plusTage(montag(selD),-7)),vSo=ymdP(plusTage(montag(selD),-1));
  const aktWoche=wMo===ymdP(montag(h0));
  const sum=(arr,f)=>arr.reduce((s,x)=>s+(x[f]||0),0);
  const istWerktag=ds=>{const d=ausYmd(ds).getDay();return d>=1&&d<=5;};
  const tot={tag:0,neuTag:0,wo:0,neuWo:0,vw:0,neuVw:0,zr:0,neuZr:0,oWo:0,hatO:false,tageZr:0,tWo:0,tVw:0};
  let rowsH='';
  quellen.forEach(q=>{
    const t=q.d.find(x=>x.ds===sel);
    const wo=q.d.filter(x=>x.ds>=wMo&&x.ds<=wSo&&x.ds<=h0s),vw=q.d.filter(x=>x.ds>=vMo&&x.ds<=vSo);
    const inZr=q.d.filter(x=>x.ds<=h0s&&zr.has(x.ds)&&x.vereinbart!=null);
    // ø je Woche = Termine je erfasstem Werktag × 5. Angebrochene Wochen am
    // Monatsrand und Feiertage drücken den Wert so nicht.
    const wt=new Set(inZr.filter(x=>istWerktag(x.ds)).map(x=>x.ds)).size;
    const oWo=wt?sum(inZr,'vereinbart')/wt*5:null;
    tot.tag+=t?t.vereinbart||0:0;tot.neuTag+=t?t.neu||0:0;tot.wo+=sum(wo,'vereinbart');tot.neuWo+=sum(wo,'neu');tot.vw+=sum(vw,'vereinbart');tot.neuVw+=sum(vw,'neu');tot.zr+=sum(inZr,'vereinbart');tot.neuZr+=sum(inZr,'neu');if(oWo!=null){tot.oWo+=oWo;tot.hatO=true;}tot.tageZr=Math.max(tot.tageZr,wt);tot.tWo=Math.max(tot.tWo,new Set(wo.filter(x=>x.vereinbart!=null&&istWerktag(x.ds)).map(x=>x.ds)).size);tot.tVw=Math.max(tot.tVw,new Set(vw.filter(x=>x.vereinbart!=null&&istWerktag(x.ds)).map(x=>x.ds)).size);
    rowsH+=`<tr><td>${siteTag(q.site)}</td><td class="r"><b>${t&&t.vereinbart!=null?n0(t.vereinbart):'—'}</b></td><td class="r">${t&&t.neu!=null?n0(t.neu):'—'}</td><td class="r"><b>${n0(sum(wo,'vereinbart'))}</b> <span class="c-m">(${n0(sum(wo,'neu'))})</span></td><td class="r">${n0(sum(vw,'vereinbart'))} <span class="c-m">(${n0(sum(vw,'neu'))})</span></td><td class="r"><b>${oWo==null?'—':n1(oWo)}</b></td><td class="r">${n0(sum(inZr,'neu'))}</td></tr>`;
  });
  const pfeil=(dir,ok)=>`<button class="btn" style="padding:2px 9px;font-size:15px;line-height:1.2${ok?'':';opacity:.35;cursor:default'}" ${ok?`onclick="anfrSchritt(${dir})"`:'disabled'} aria-label="${dir<0?'Vortag':'Nächster Tag'}">${dir<0?'‹':'›'}</button>`;
  const tagLabel=sel?fDat(selD):'—';
  const kw=sel?tvWoche(selD):null;
  const oTag=tot.tWo?tot.wo/tot.tWo:null,oTagV=tot.tVw?tot.vw/tot.tVw:null;
  const delta=(a,b)=>a==null||b==null||!b?'':`<span class="pill ${a>=b?'p-g':'p-r'}" style="margin-left:6px">${a>=b?'+':''}${n0((a-b)/b*100)} %</span>`;
  const wLabel=aktWoche?'diese Woche':'KW '+kw;
  h+=`<div class="grid">`+
    `<div class="kpi"><div class="l" style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span>${sel===tage[tage.length-1]?'Letzter Tag':'Tag'}</span><span style="display:flex;align-items:center;gap:6px">${pfeil(-1,iSel>0)}<span style="text-transform:none;letter-spacing:0;color:var(--dark)">${esc(tagLabel)}</span>${pfeil(1,iSel<tage.length-1)}</span></div><div class="v">${n0(tot.tag)}</div><div class="s">davon <b>${n0(tot.neuTag)}</b> Neuanfragen</div></div>`+
    `<div class="kpi"><div class="l">ø Anfragen je Tag · ${esc(wLabel)}</div><div class="v">${oTag==null?'—':n1(oTag)}${delta(oTag,oTagV)}</div><div class="s">Vorwoche <b>${oTagV==null?'—':n1(oTagV)}</b> je Tag · ${tot.tWo} Werktag${tot.tWo===1?'':'e'} erfasst</div></div>`+
    `<div class="kpi"><div class="l">Anfragen · ${esc(wLabel)}</div><div class="v">${n0(tot.wo)}</div><div class="s">Vorwoche <b>${n0(tot.vw)}</b>${aktWoche?' · Woche läuft noch':''}</div></div>`+
    `<div class="kpi"><div class="l">Neuanfragen · ${esc(wLabel)}</div><div class="v">${n0(tot.neuWo)}${delta(tot.tWo?tot.neuWo/tot.tWo:null,tot.tVw?tot.neuVw/tot.tVw:null)}</div><div class="s">Vorwoche <b>${n0(tot.neuVw)}</b> · ${esc(zeitraumLabel())}: ${n0(tot.neuZr)}</div></div>`+
    `</div>`;
  h+=`<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Standort</th><th class="r">${esc(tagLabel)}</th><th class="r">davon neu</th><th class="r">${aktWoche?'Diese Woche':'KW '+kw} (neu)</th><th class="r">Vorwoche (neu)</th><th class="r">ø je Woche</th><th class="r">Neuanfragen Zeitraum</th></tr></thead><tbody>${rowsH}</tbody></table></div>`;
  const letzter=tage[tage.length-1];
  if(letzter&&letzter<ymdP(plusTage(h0,-14)))h+=`<p class="hint c-r">Der Tracker ist seit dem ${esc(fDat(ausYmd(letzter)))} nicht mehr gepflegt – die Werte oben sind entsprechend alt.</p>`;
  h+=`<p class="hint">Quelle: Weekly KPI Tracker, Spalten „Termine vereinbart“ und „davon Neuaufnahmen/Neuanfragen“ je Tag. Mit den Pfeilen wechselst du den Tag; die Kacheln zeigen die Kalenderwoche dieses Tages und klein die Vorwoche. ø je Tag = Anfragen der Woche ÷ Werktage mit Eintrag, so ist eine laufende Woche mit der Vorwoche vergleichbar; die Prozentangabe vergleicht je Tag. In der Tabelle: ø je Woche = Anfragen im Zeitraum ÷ Werktage mit Eintrag × 5. Tage ohne Eintrag fehlen und zählen nicht als null.</p>`;
  return h+'</section>';
}

// 3 · Club-Abschlüsse aus den MyWellness-Gesprächen (1.–3. Gespräch).
function secClub(){
  const mw=(D.mw||[]).filter(mwPasst);
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1),jahr=cockpitJahr();
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
  const jahr=cockpitJahr();
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
  const months=getActiveMonths(),monthNums=months.map(m=>MN.indexOf(m)+1),jahr=cockpitJahr();
  const M={},P={},RE={};
  const mk=(o,k,init)=>o[k]||(o[k]=init());
  const mAgg=(s,m)=>({standort:s,month:m,quelle:null,beh:0,bruttoBeh:0,brutto:0,gkv:0,bg:0,privat:0,privatN:0,ausfall:0,zuz:0,zuzEst:0,netto:0,offen:0,offenN:0,kalender:0});
  const pAgg=(s,n)=>({standort:s,name:n,quelle:null,beh:0,brutto:0,zuz:0,zuzEst:false,netto:0,offen:0});
  // thevea-Statistik
  ((D.abg&&D.abg.rows)||[]).forEach(r=>{
    if(r.jahr!==jahr||!monthNums.includes(r.month)||!matchS(r.standort))return;
    const m=mk(M,r.standort+'|'+r.month,()=>mAgg(r.standort,r.month));m.quelle='thevea';m.beh+=r.beh;m.bruttoBeh+=r.brutto;m.brutto+=r.brutto;m.gkv+=r.brutto;m.zuz+=r.zuzahlung;m.netto+=r.netto;
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
  // Medifox (Kitzingen, KIMOJO vor dem Cutover): Rechnungsübersicht nach
  // Belegdatum. Kasse = GKV-Anteil der Kasse, Zuzahlung = Patientenanteil,
  // beide zusammen sind der GKV-Brutto; Privat/Selbstzahler/Barverkauf = privat.
  // Storno- und Korrekturbelege gehen mit ihrem (negativen) Betrag ein,
  // Mahnungen nicht.
  const mrSite=pre=>pre==='PHFIP'?'PF im Park':'KIMOJO (Medifox)';
  const mrPasst=pre=>pre==='PHFIP'?matchS('PF im Park'):(matchS('KIMOJO Physio')||matchS('KIMOJO Ergo'));
  const MR_ART={Kasse:'gkv',BG:'bg',Privat:'privat',Selbstzahler:'privat',Barverkauf:'privat',Rechnungskorrektur:'privat',Zuzahlung:'zuz',Ausfall:'ausfall'};
  ((D.rechnungen&&D.rechnungen.alle)||[]).forEach(r=>{
    if(r.jahr!==jahr||!monthNums.includes(r.month)||!mrPasst(r.prefix)||/mahnung/i.test(r.belegtyp)||/mahnung/i.test(r.typ))return;
    const art=MR_ART[r.typ];if(!art)return;
    const s=mrSite(r.prefix),m=mk(M,s+'|'+r.month,()=>mAgg(s,r.month));m.quelle=m.quelle&&m.quelle!=='medifox'?m.quelle:'medifox';
    if(art==='ausfall'){m.ausfall+=r.brutto;return;}
    m.brutto+=r.brutto;m.nRe=(m.nRe||0)+1;
    if(art==='zuz')m.zuz+=r.brutto;else m[art]+=r.brutto;
    if(art==='privat')m.privatN++;
  });
  // Erbracht und noch nicht abgerechnet je Leistungsmonat aus den Medifox-Zeilen
  const theraNames=new Set(D.ctrl.filter(t=>matchS(t.s)).map(t=>t.n));
  const h0=ymdP(heute());const pad=k=>{const q=String(k).split('-');return q.length===3?q[0]+'-'+q[1].padStart(2,'0')+'-'+q[2].padStart(2,'0'):'';};
  D.raw.forEach(r=>{
    if(r.src==='thevea'||!r.month||!monthNums.includes(r.month)||!tvRowPasst(r,theraNames)||tvIstKurs(r))return;
    if(abgMedifoxArt(r)==='ausfall'||!r.dateKey||pad(r.dateKey)>h0)return;
    const s=rowSite(r)==='PF im Park'?'PF im Park':'KIMOJO (Medifox)';
    const m=mk(M,s+'|'+r.month,()=>mAgg(s,r.month));if(!m.quelle)m.quelle='medifox';
    m.erbMedifox=(m.erbMedifox||0)+r.price;if(!r.billed){m.offen+=r.price;m.offenN++;}
  });
  Object.values(M).forEach(m=>{if(m.quelle==='medifox')m.netto=m.brutto-m.zuz;});
  // Kalenderwert (Seite Erbracht) für thevea-Monate als Bezugsgröße
  erbrachtZeilen().forEach(r=>{const m=M[r.standort+'|'+r.month];if(m&&m.quelle==='thevea')m.kalender+=r.price;});
  Object.values(M).forEach(m=>{if(m.quelle==='thevea'){m.offen=Math.max(0,m.kalender-m.brutto);}else{m.kalender=m.erbMedifox||0;}});
  return{months,monthNums,M:Object.values(M),P:Object.values(P),RE:Object.values(RE)};
}
function pAbgerechnet(){
  const {months,monthNums,M,P,RE}=abgDaten();
  const sub=`${esc(zeitraumLabel())} · ${esc(sn(aS))}`;
  if(!M.length)return`<section class="sec"><div class="sec-h"><h2>Abgerechnete Leistungen</h2><span class="sub">${sub}</span></div><div class="empty">Keine abgerechneten Leistungen im gewählten Zeitraum.</div></section>`;
  const S=(arr,k)=>arr.reduce((t,x)=>t+(x[k]||0),0);
  const oe=x=>n1(x)+' €';
  const tot={beh:S(M,'beh'),bruttoBeh:S(M,'bruttoBeh'),brutto:S(M,'brutto'),gkv:S(M,'gkv'),bg:S(M,'bg'),privat:S(M,'privat'),privatN:S(M,'privatN'),ausfall:S(M,'ausfall'),zuz:S(M,'zuz'),zuzEst:S(M,'zuzEst'),netto:S(M,'netto'),offen:S(M,'offen'),kalender:S(M,'kalender')};
  let standTxt='';{const st=(D.abg&&D.abg.stand)||{};const bis=Object.keys(st).filter(k=>matchS(k.split('|')[0])).map(k=>st[k].bis).filter(Boolean).sort().pop();if(bis)standTxt=' · thevea abgerechnet bis '+ausYmd(bis).toLocaleDateString('de-DE');}
  let h=`<section class="sec"><div class="sec-h"><h2>Abgerechnete Leistungen</h2><span class="sub">${sub}${standTxt}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Abgerechnet brutto</div><div class="v">${eur0(tot.brutto)}</div><div class="s">${tot.beh?`${n0(tot.beh)} Behandlungen (thevea) · ø <b>${oe(tot.bruttoBeh/tot.beh)}</b> je Behandlung`:`${n0(S(M,'nRe'))} Rechnungen`}</div></div>`;
  h+=`<div class="kpi"><div class="l">Privatleistungen</div><div class="v">${eur0(tot.privat)}</div><div class="s">${n1(tot.brutto?tot.privat/tot.brutto*100:0)} % des Brutto · GKV/BG <b>${eur0(tot.gkv+tot.bg)}</b></div></div>`;
  h+=`<div class="kpi"><div class="l">Zuzahlungen</div><div class="v">${eur0(tot.zuz)}</div><div class="s">Netto nach Zuzahlung <b>${eur0(tot.netto)}</b> · ${n1(tot.brutto?tot.zuz/tot.brutto*100:0)} % des Brutto</div></div>`;
  const nurThevea=M.every(m=>m.quelle==='thevea');const theveaM=M.filter(m=>m.quelle==='thevea');const tKal=S(theveaM,'kalender'),tBr=S(theveaM,'brutto');
  const quote=tKal>0?tBr/tKal*100:null;
  h+=`<div class="kpi"><div class="l">Noch nicht abgerechnet</div><div class="v ${tot.offen>0?'c-a':'c-g'}">${eur0(tot.offen)}</div><div class="s">${nurThevea?`abgerechnet <b>${quote==null?'—':n0(quote)+' %'}</b> von ${eur0(tot.kalender)} erbracht`:`erbracht, noch ohne Rechnung${quote!=null?` · thevea abgerechnet <b>${n0(quote)} %</b>`:''}`}</div></div>`;
  h+='</div>';
  // Nach Standort
  const bySite={};M.forEach(m=>{const a=bySite[m.standort]||(bySite[m.standort]={standort:m.standort,beh:0,bruttoBeh:0,brutto:0,gkv:0,bg:0,privat:0,zuz:0,zuzEst:0,netto:0,ausfall:0,offen:0,kalender:0,quellen:new Set()});['beh','bruttoBeh','brutto','gkv','bg','privat','zuz','zuzEst','netto','ausfall','offen','kalender'].forEach(k=>a[k]+=m[k]);a.quellen.add(m.quelle);});
  const sites=Object.values(bySite);
  const qTag=q=>q.has('thevea')&&q.has('medifox')?'thevea + Medifox-Rechnungen':q.has('thevea')?'thevea':'Medifox-Rechnungen';
  if(sites.length>1)h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Standort</th><th>Quelle</th><th class="r">Beh.</th><th class="r">Brutto</th><th class="r">GKV / BG</th><th class="r">Privat</th><th class="r">Zuzahlung</th><th class="r">Netto</th><th class="r">Ausfall</th><th class="r">Offen</th></tr></thead><tbody>'+sites.map(a=>`<tr><td>${siteTag(a.standort)}</td><td class="c-m">${qTag(a.quellen)}</td><td class="r">${a.beh?n0(a.beh):'—'}</td><td class="r"><b>${eur0(a.brutto)}</b></td><td class="r">${eur0(a.gkv+a.bg)}</td><td class="r">${eur0(a.privat)}</td><td class="r">${eur0(a.zuz)}${a.zuzEst?'*':''}</td><td class="r">${eur0(a.netto)}</td><td class="r c-m">${eur0(a.ausfall)}</td><td class="r c-a">${eur0(a.offen)}</td></tr>`).join('')+'</tbody></table></div>';
  h+=`<p class="hint">KIMOJO ab dem Cutover aus der thevea-Statistik „Umsatz abgerechnete Verordnungen“ nach Abrechnungsdatum (inklusive Privat- und Beihilferezepte, Zuzahlung laut thevea); der Privatanteil kommt aus den Privat- und Selbstzahlerrechnungen desselben Monats. PF im Park und KIMOJO vor dem Cutover aus der Medifox-Rechnungsübersicht nach Belegdatum: Kasse + BG = GKV/BG, Privat/Selbstzahler/Barverkauf = Privat, Zuzahlungsrechnungen = Zuzahlung; Storno- und Korrekturbelege mindern den Monat, in dem sie gebucht sind, Mahnungen zählen nicht. „KIMOJO (Medifox)“ ist Physio und Ergo zusammen, weil die Rechnungen keinen Bereich tragen. Ausfallrechnungen stehen neben dem Brutto.${D.rechnungen&&D.rechnungen.bis?` <b>Medifox-Rechnungen liegen bis ${ausYmd(D.rechnungen.bis).toLocaleDateString('de-DE')} vor</b>; der Flow „Medifox Rechnungen“ holt jede Nacht alle Monate des laufenden Jahres in den Ordner Controlling/Medifox Rechnungen.`:''}</p></section>`;
  // Nach Monat
  const byM={};M.forEach(m=>{const a=byM[m.month]||(byM[m.month]={mf:false,beh:0,bruttoBeh:0,brutto:0,gkv:0,bg:0,privat:0,zuz:0,zuzEst:0,netto:0,ausfall:0,offen:0,kalender:0});['beh','bruttoBeh','brutto','gkv','bg','privat','zuz','zuzEst','netto','ausfall','offen','kalender'].forEach(k=>a[k]+=m[k]);if(m.quelle!=='thevea')a.mf=true;});
  const zeile=(label,a,sum)=>{const q=!a.mf&&a.kalender>0?a.brutto/a.kalender*100:null;return`<tr${sum?' class="sum"':''}><td>${esc(label)}</td><td class="r">${a.beh?n0(a.beh):'—'}</td><td class="r"><b>${eur0(a.brutto)}</b></td><td class="r">${eur0(a.gkv+a.bg)}</td><td class="r">${eur0(a.privat)}</td><td class="r">${eur0(a.zuz)}${a.zuzEst?'*':''}</td><td class="r">${eur0(a.netto)}</td><td class="r c-m">${eur0(a.ausfall)}</td><td class="r">${eur0(a.offen)}</td><td class="r">${q==null?'—':`<span class="pill ${q>=95?'p-g':q>=80?'p-a':'p-r'}">${n0(q)} %</span>`}</td></tr>`;};
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Monat</h2><span class="sub">thevea nach Abrechnungsdatum · Medifox nach Belegdatum · Offen nach Leistungsmonat</span></div><div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Beh.</th><th class="r">Brutto</th><th class="r">GKV / BG</th><th class="r">Privat</th><th class="r">Zuzahlung</th><th class="r">Netto</th><th class="r">Ausfall</th><th class="r">Offen</th><th class="r">Quote</th></tr></thead><tbody>`;
  monthNums.forEach(mi=>{const a=byM[mi];if(!a)return;h+=zeile(MN[mi-1],a,false);});
  tot.mf=!nurThevea;h+=zeile('Summe',tot,true)+'</tbody></table></div><p class="hint">Offen = erbrachter Wert, der noch nicht abgerechnet ist (thevea: Kalenderwert der Seite Erbracht minus Abrechnung; Medifox: Leistungen bis heute ohne Kennzeichen „Abgerechnet“, nach Leistungsmonat). Quote = abgerechnet ÷ erbracht, nur für thevea; bei Medifox liegt die Rechnung meist im Folgemonat der Leistung, eine Monatsquote wäre dort irreführend.</p></section>';
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
  h+='</tbody></table></div><p class="hint">Je Person nur aus der thevea-Statistik (Privatanteil dort nicht je Person ausweisbar). Die Medifox-Rechnungsübersicht trägt keine Therapeut:in, deshalb fehlen PF im Park und KIMOJO vor dem Cutover hier.</p></section>';
  return h;
}

// ── Praxismanagement ─────────────────────────────────────────────────────
// Patientenchecker-Kennzahlen (Auslastung, Lücken, Telefonie, Aufgaben …).
// Rechnung und Darstellung kommen unverändert aus dem gemeinsamen Datenteil
// (rPraxis schreibt in #praxisBody); das Aussehen steht in styles.css unter
// „Praxismanagement“ und gilt nur innerhalb von #praxisBody.
function pPraxis(){
  return`<section class="sec"><div class="sec-h"><h2>Praxismanagement</h2><span class="sub">Hat das Praxismanagement dafür gesorgt, dass die Praxis organisatorisch sauber und wirtschaftlich gut gelaufen ist? Sechs Kennzahlen, darunter der Drill-down.</span></div><div id="praxisBody"></div></section>`;
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
  const jahr=cockpitJahr(),feier=tvFeiertage(jahr);
  const arbeitstage=mi=>{let n=0;const tg=new Date(jahr,mi,0).getDate();for(let d=1;d<=tg;d++){const dt=new Date(jahr,mi-1,d),y=ymdP(dt);if(y>h0)break;if(dt.getDay()===0||dt.getDay()===6||feier.has(y))continue;n++;}return n;};
  Object.keys(KS_CUTOVER).forEach(site=>{if(!matchS(site))return;monthNums.forEach(mi=>{if(mi>=KS_CUTOVER[site])return;const k=site+'|'+mi;const ss=S[k]||(S[k]=mAgg());const personen=D.ctrl.filter(t=>t.s===site);let sollStd=0,n=0;personen.forEach(t=>{const st=tvStdMonat(t,MN[mi-1]);if(st.soll>0){sollStd+=st.soll;n++;}});const at=arbeitstage(mi);if(!n||!at){delete S[k];return;}ss.quelle='tracker';ss.sollStd=sollStd*(at/arbeitstage0(mi));ss.sollTage=n*at;ss.personen=new Set();ss.krankTage=ss.tracker;ss.krankStd=ss.sollTage?ss.tracker*(ss.sollStd/ss.sollTage):0;});});
  function arbeitstage0(mi){let n=0;const tg=new Date(jahr,mi,0).getDate();for(let d=1;d<=tg;d++){const dt=new Date(jahr,mi-1,d),y=ymdP(dt);if(dt.getDay()===0||dt.getDay()===6||feier.has(y))continue;n++;}return n;}
  // Monatswerte neu aus den Standortwerten summieren (nach dem Tracker-Tausch)
  const M2={};Object.keys(S).forEach(k=>{const m=+k.split('|')[1];const ss=S[k];const mm=M2[m]||(M2[m]={sollTage:0,sollStd:0,krankTage:0,krankStd:0,personen:new Set(),quellen:new Set()});mm.sollTage+=ss.sollTage;mm.sollStd+=ss.sollStd;mm.krankTage+=ss.krankTage;mm.krankStd+=ss.krankStd;ss.personen.forEach(n=>mm.personen.add(n));mm.quellen.add(ss.quelle);});
  return{months,monthNums,P,M:M2,S,h0};
}
// Planwert: 15 Krankheitstage je Mitarbeiter:in und Jahr bei einer 5-Tage-Woche.
// Umgerechnet auf die Soll-Arbeitstage: 15 ÷ Arbeitstage Mo–Fr des Jahres ohne
// Feiertage. Teilzeit mit weniger Tagen bekommt anteilig weniger Plantage.
const KS_PLAN_JAHR=15;
function ksPlanQuote(){const j=cockpitJahr(),f=tvFeiertage(j);let n=0;for(let d=new Date(j,0,1);d.getFullYear()===j;d.setDate(d.getDate()+1)){const w=d.getDay();if(w===0||w===6||f.has(tvYmd(d)))continue;n++;}return n?KS_PLAN_JAHR/n:0;}
function ksPlanPill(ist,plan){if(!plan)return'<span class="pill p-n">—</span>';const d=ist-plan,rel=d/plan;if(Math.abs(rel)<=0.1)return`<span class="pill p-a">im Plan</span>`;return`<span class="pill ${d>0?'p-r':'p-g'}">${d>0?'+':''}${n1(d)} Tage</span>`;}
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
  const pq=ksPlanQuote(),planTage=sollTage*pq;
  h+=`<div class="kpi"><div class="l">Krankheitstage gegen Plan</div><div class="v">${n0(krankTage)} <span class="c-m" style="font-size:16px">/ ${n1(planTage)}</span></div><div class="s">${ksPlanPill(krankTage,planTage)} Plan ${KS_PLAN_JAHR} Tage je MA und Jahr (${n1(pq*100)} % der Soll-Tage)</div></div>`;
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
  h+=`<section class="sec"><div class="sec-h"><h2>Nach Monat</h2><span class="sub">Soll-Tage und Krankheitstage aller Personen des Standortfilters</span></div><div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Soll-Tage</th><th class="r">Krank-Tage</th><th class="r">Krank-Std.</th><th class="r">Quote</th><th class="r">Plan-Tage</th><th class="r">gegen Plan</th><th class="r">Betroffene</th><th style="min-width:110px"></th><th>Quelle</th></tr></thead><tbody>`;
  const mx=Math.max(...Object.values(M).map(m=>m.sollStd?m.krankStd/m.sollStd*100:0),1);
  monthNums.forEach(mi=>{const m=M[mi];if(!m||!m.sollTage)return;const q=m.sollStd?m.krankStd/m.sollStd*100:null;h+=`<tr><td>${MN[mi-1]}</td><td class="r">${n0(m.sollTage)}</td><td class="r"><b>${n0(m.krankTage)}</b></td><td class="r">${n0(m.krankStd)}</td><td class="r">${pill(q)}</td><td class="r c-m">${n1(m.sollTage*pq)}</td><td class="r">${ksPlanPill(m.krankTage,m.sollTage*pq)}</td><td class="r">${m.personen.size||'—'}</td><td><div class="bar"><i style="width:${q==null?0:q/mx*100}%;background:${q<=4?'var(--green)':q<=7?'var(--amber)':'var(--red)'}"></i></div></td><td class="c-m">${qTxt(m.quellen)}</td></tr>`;});
  h+=`<tr class="sum"><td>Summe</td><td class="r">${n0(sollTage)}</td><td class="r">${n0(krankTage)}</td><td class="r">${n0(krankStd)}</td><td class="r">${pill(quote)}</td><td class="r">${n1(planTage)}</td><td class="r">${ksPlanPill(krankTage,planTage)}</td><td class="r">${betroffen||'—'}</td><td></td><td></td></tr></tbody></table></div><p class="hint">Plan-Tage = Soll-Arbeitstage des Monats × ${KS_PLAN_JAHR} ÷ ${n0(KS_PLAN_JAHR/pq)} Arbeitstage im Jahr, also ${KS_PLAN_JAHR} Krankheitstage je Vollzeitkraft und Jahr, anteilig für Teilzeit. „im Plan“ = höchstens 10 % Abweichung; rot = mehr Krankheitstage als geplant, grün = weniger.</p></section>`;
  // Aktuell krank
  if(heuteKrank.length){
    h+=`<section class="sec"><div class="sec-h"><h2>Aktuell krank</h2><span class="sub">Stand heute</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th>Seit</th><th>Gemeldet bis</th><th class="r">Tage in dieser Episode</th></tr></thead><tbody>`;
    heuteKrank.forEach(p=>{const seit=ausYmd(p.seit),tage=Math.round((ausYmd(h0)-seit)/864e5)+1;h+=`<tr><td><b>${esc(p.name)}</b></td><td>${siteTag(p.standort)}</td><td>${seit.toLocaleDateString('de-DE')}</td><td>${p.bis?ausYmd(p.bis).toLocaleDateString('de-DE'):'<span class="c-m">offen</span>'}</td><td class="r">${tage}</td></tr>`;});
    h+='</tbody></table></div></section>';
  }
  // Je Person
  const tl=P.filter(p=>p.krankTage>0).sort((a,b)=>(b.sollStd?b.krankStd/b.sollStd:0)-(a.sollStd?a.krankStd/a.sollStd:0));
  const ohne=P.length-tl.length;
  h+=`<section class="sec"><div class="sec-h"><h2>Je Therapeut:in</h2><span class="sub">${tl.length} Personen mit Krankheitstagen · ${ohne} ohne</span></div><div class="tbl-wrap"><table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Soll-Tage</th><th class="r">Krank-Tage</th><th class="r">Krank-Std.</th><th class="r">Quote</th><th class="r">gegen Plan</th><th class="r">Episoden</th><th>Zuletzt</th><th class="r">Urlaub</th><th class="r">Fortb.</th></tr></thead><tbody>`;
  tl.forEach(p=>{const q=p.sollStd?p.krankStd/p.sollStd*100:null;h+=`<tr><td><b>${esc(p.name)}</b></td><td>${siteTag(p.standort)}</td><td class="r">${n0(p.sollTage)}</td><td class="r"><b>${n0(p.krankTage)}</b></td><td class="r">${n0(p.krankStd)}</td><td class="r">${pill(q)}</td><td class="r">${ksPlanPill(p.krankTage,p.sollTage*pq)}</td><td class="r">${p.episoden}</td><td>${p.letzte?ausYmd(p.letzte).toLocaleDateString('de-DE'):'—'}</td><td class="r c-m">${n0(p.urlaub)}</td><td class="r c-m">${n0(p.fortb)}</td></tr>`;});
  h+='</tbody></table></div><p class="hint">Nur Personen mit Krankheitstagen im Zeitraum; Werneck erst ab dem thevea-Cutover personenscharf, die Tracker-Krankheitstage davor stehen nur in den Monats- und Standortwerten. Episoden = zusammenhängende Krankmeldungen, Urlaub und Fortbildung als Arbeitstage zum Vergleich.</p></section>';
  return h;
}

// ── BWA ──────────────────────────────────────────────────────────────────
// DATEV-BWA je Monat und Betrieb (D.bwaK KIMOJO GmbH, D.bwaP PF im Park).
// Zeilen und Konten kommen aus d.voll (bwaVoll in data.js), die Plan-Spalte
// der BWA liefert den Plan je Kostenart; die Gesamtwerte vergleichen
// zusätzlich mit der internen Planung (planK/planP wie auf Plan vs. Ist).
const BWA_ENT=[{k:'bwaK',pl:'planK',l:'KIMOJO GmbH',sub:'Physio und Ergo · Werneck',sites:['KIMOJO Physio','KIMOJO Ergo'],col:'var(--primary)'},{k:'bwaP',pl:'planP',l:'PF im Park',sub:'Physio und Fitness im Park · Kitzingen',sites:['PF im Park'],col:'var(--teal)'}];
function bwaToggle(id){const el=document.getElementById(id);if(el)el.style.display=el.style.display==='none'?'':'none';}
function bwaSumme(bwa,months){
  const S={z:{},kat:{},umsatz:{},monate:[],fehlt:[]};
  months.forEach(m=>{const d=getBWA(bwa,m);if(!d||!d.voll){S.fehlt.push(m);return;}S.monate.push(m);
    Object.entries(d.voll.z).forEach(([c,x])=>{const a=S.z[c]||(S.z[c]={n:x.n,ist:0,plan:0,pm:0});a.ist+=x.ist;a.plan+=x.plan;if(x.plan)a.pm++;});
    d.voll.kat.forEach(k=>{const a=S.kat[k.code]||(S.kat[k.code]={code:k.code,n:k.n,ist:0,plan:0,pm:0,items:{}});a.ist+=k.ist;a.plan+=k.plan;if(k.plan)a.pm++;k.items.forEach(i=>{const b=a.items[i.konto+'|'+i.n]||(a.items[i.konto+'|'+i.n]={konto:i.konto,n:i.n,ist:0,plan:0});b.ist+=i.ist;b.plan+=i.plan;});});
    d.voll.umsatz.forEach(i=>{const b=S.umsatz[i.konto+'|'+i.n]||(S.umsatz[i.konto+'|'+i.n]={konto:i.konto,n:i.n,ist:0,plan:0});b.ist+=i.ist;b.plan+=i.plan;});
  });
  return S;
}
function pBwa(){
  const months=getActiveMonths();
  const ents=BWA_ENT.filter(e=>e.sites.some(s=>matchS(s)));
  const sub=`${esc(zeitraumLabel())} · ${esc(sn(aS))}`;
  const z=(S,c)=>(S.z[c]&&S.z[c].ist)||0,zp=(S,c)=>(S.z[c]&&S.z[c].pm===S.monate.length&&S.z[c].plan)||0,kp=(S,x)=>(x.pm===S.monate.length&&x.plan)||0;
  const planInt=(e,key,S)=>{const p=D[e.pl]&&D[e.pl].dashboard;if(!p)return 0;let v=0;S.monate.forEach(m=>{v+=p.therapie[key+'_'+m]||0;});return v;};
  const dPill=(ist,plan,inv)=>{if(!plan)return'<span class="pill p-n">kein Plan</span>';const d=(ist-plan)/Math.abs(plan)*100;const gut=inv?d<=0:d>=0;return`<span class="pill ${gut?'p-g':'p-r'}">${d>=0?'+':''}${n1(d)} %</span>`;};
  let h='';
  const data=ents.map(e=>({e,S:bwaSumme(D[e.k]||{},months)}));
  if(!data.some(x=>x.S.monate.length))return`<section class="sec"><div class="sec-h"><h2>BWA</h2><span class="sub">${sub}</span></div><div class="empty">Für den gewählten Zeitraum liegt noch keine BWA vor.</div></section>`;
  // Übersicht über alle gewählten Betriebe
  const tot={umsatz:0,kosten:0,personal:0,betrieb:0,ergebnis:0,pUmsatz:0,pKosten:0,pGewinn:0};
  data.forEach(({e,S})=>{tot.umsatz+=z(S,'1006');tot.kosten+=z(S,'1294');tot.personal+=z(S,'1164');tot.betrieb+=z(S,'1304');tot.ergebnis+=z(S,'1374');tot.pUmsatz+=planInt(e,'einnahmen',S);tot.pKosten+=planInt(e,'kosten',S);tot.pGewinn+=planInt(e,'gewinn',S);});
  const marge=tot.umsatz?tot.ergebnis/tot.umsatz*100:null,pq=tot.umsatz?tot.personal/tot.umsatz*100:null;
  const fehlt=[...new Set(data.flatMap(x=>x.S.fehlt))];
  h+=`<section class="sec"><div class="sec-h"><h2>BWA</h2><span class="sub">${sub} · ${data.map(x=>x.e.l+': '+(x.S.monate.length?x.S.monate[0]+(x.S.monate.length>1?' – '+x.S.monate[x.S.monate.length-1]:''):'keine BWA')).join(' · ')}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Umsatzerlöse</div><div class="v">${eur0(tot.umsatz)}</div><div class="s">${dPill(tot.umsatz,tot.pUmsatz,false)} interne Planung ${tot.pUmsatz?fmK(tot.pUmsatz):'—'}</div></div>`;
  h+=`<div class="kpi"><div class="l">Gesamtkosten</div><div class="v">${eur0(tot.kosten)}</div><div class="s">${dPill(tot.kosten,tot.pKosten,true)} Plan ${tot.pKosten?fmK(tot.pKosten):'—'} · Personalquote <b>${pctS(pq)}</b></div></div>`;
  h+=`<div class="kpi"><div class="l">Ergebnis vor Steuern</div><div class="v ${tot.ergebnis>=0?'c-g':'c-r'}">${eur0(tot.ergebnis)}</div><div class="s">${dPill(tot.ergebnis,tot.pGewinn,false)} Plan ${tot.pGewinn?fmK(tot.pGewinn):'—'}</div></div>`;
  h+=`<div class="kpi"><div class="l">Umsatzrendite</div><div class="v ${marge==null?'':marge>=20?'c-g':marge>=10?'c-a':'c-r'}">${pctS(marge)}</div><div class="s">Ergebnis vor Steuern ÷ Umsatz · Betriebsergebnis ${eur0(tot.betrieb)}</div></div>`;
  h+='</div>';
  if(data.length>1)h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Betrieb</th><th>BWA-Monate</th><th class="r">Umsatz</th><th class="r">Personal</th><th class="r">Gesamtkosten</th><th class="r">Ergebnis v. St.</th><th class="r">Rendite</th><th class="r">Personalquote</th></tr></thead><tbody>'+data.map(({e,S})=>{const u=z(S,'1006'),k=z(S,'1294'),p=z(S,'1164'),g=z(S,'1374');return`<tr><td><span class="site"><span class="dot" style="background:${e.col}"></span>${esc(e.l)}</span></td><td class="c-m">${S.monate.length?S.monate.join(', '):'—'}</td><td class="r"><b>${eur0(u)}</b></td><td class="r">${eur0(p)}</td><td class="r">${eur0(k)}</td><td class="r ${g>=0?'c-g':'c-r'}"><b>${eur0(g)}</b></td><td class="r">${pctS(u?g/u*100:null)}</td><td class="r">${pctS(u?p/u*100:null)}</td></tr>`;}).join('')+'</tbody></table></div>';
  h+=`<p class="hint">Quelle: DATEV-BWA (Soll-/Ist-Vergleich) je Monatsblatt, BWA KIMOJO.xlsx und BWA PHFIP.xlsx. Die Kacheln vergleichen mit der internen Planung (Dashboard-Plan wie auf Plan vs. Ist, nur für Monate mit BWA); die Kostenarten unten mit der Plan-Spalte der BWA selbst, sofern jeder BWA-Monat einen Plan trägt.${fehlt.length?` Ohne BWA im Zeitraum: ${esc(fehlt.join(', '))}.`:''}</p></section>`;
  // Je Betrieb: Erfolgsrechnung und Kostenarten mit Konten
  let uid=0;
  data.forEach(({e,S})=>{
    if(!S.monate.length)return;
    const u=z(S,'1006'),k=z(S,'1294');
    h+=`<section class="sec"><div class="sec-h"><h2><span class="site"><span class="dot" style="background:${e.col}"></span>${esc(e.l)}</span></h2><span class="sub">${esc(e.sub)} · ${S.monate.length} Monat${S.monate.length>1?'e':''}</span></div>`;
    // Erfolgsrechnung
    const er=[['1006','Umsatzerlöse',false],['1124','Sonstige betriebliche Erlöse',false],['1152','Betrieblicher Rohertrag',false],['1294','Gesamtkosten',true],['1304','Betriebsergebnis',false],['1333','Anderer Aufwand (Zinsen, neutral)',true],['1364','Anderer Ertrag',false],['1374','Ergebnis vor Steuern',false]];
    h+='<div class="tbl-wrap"><table><thead><tr><th>Erfolgsrechnung</th><th class="r">Ist</th><th class="r">% Umsatz</th><th class="r">Plan (BWA)</th><th class="r">Abweichung</th></tr></thead><tbody>';
    er.forEach(([c,l,inv])=>{if(!S.z[c])return;const ist=z(S,c),pl=zp(S,c);const fett=/^(1152|1294|1304|1374)$/.test(c);h+=`<tr${fett?' class="sum"':''}><td>${esc(l)}</td><td class="r">${fett?'<b>'+eur0(ist)+'</b>':eur0(ist)}</td><td class="r c-m">${u?n1(ist/u*100)+' %':'—'}</td><td class="r c-m">${pl?eur0(pl):'—'}</td><td class="r">${pl?dPill(ist,pl,inv):''}</td></tr>`;});
    h+='</tbody></table></div>';
    // Umsatzkonten
    const uk=Object.values(S.umsatz).filter(i=>Math.abs(i.ist)>=1).sort((a,b)=>Math.abs(b.ist)-Math.abs(a.ist));
    if(uk.length>1)h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Umsatzkonto</th><th class="r">Ist</th><th class="r">Anteil</th></tr></thead><tbody>'+uk.map(i=>`<tr><td><span class="c-m">${esc(i.konto)}</span> ${esc(i.n)}</td><td class="r">${eur0(i.ist)}</td><td class="r c-m">${u?n1(i.ist/u*100)+' %':'—'}</td></tr>`).join('')+'</tbody></table></div>';
    // Kostenarten mit aufklappbaren Konten
    const kats=Object.values(S.kat).filter(x=>Math.abs(x.ist)>=1||x.plan).sort((a,b)=>b.ist-a.ist);
    const mx=Math.max(...kats.map(x=>x.ist),1);
    h+=`<div class="sec-h" style="margin-top:18px"><h2 style="font-size:14px">Kostenarten</h2><span class="sub">Zeile anklicken für die Konten</span></div><div class="tbl-wrap"><table><thead><tr><th>Kostenart</th><th class="r">Ist</th><th class="r">% Kosten</th><th class="r">% Umsatz</th><th class="r">Plan (BWA)</th><th class="r">Abweichung</th><th style="min-width:110px"></th></tr></thead><tbody>`;
    kats.forEach(x=>{const id='bwa'+(++uid);const items=Object.values(x.items).filter(i=>Math.abs(i.ist)>=1||i.plan).sort((a,b)=>Math.abs(b.ist)-Math.abs(a.ist));
      const xp=kp(S,x);h+=`<tr style="cursor:pointer" onclick="bwaToggle('${id}')"><td><b>${esc(x.n)}</b></td><td class="r"><b>${eur0(x.ist)}</b></td><td class="r c-m">${k?n1(x.ist/k*100)+' %':'—'}</td><td class="r c-m">${u?n1(x.ist/u*100)+' %':'—'}</td><td class="r c-m">${xp?eur0(xp):'—'}</td><td class="r">${xp?dPill(x.ist,xp,true):'<span class="pill p-n">kein Plan</span>'}</td><td><div class="bar"><i style="width:${Math.max(0,x.ist)/mx*100}%;background:${e.col}"></i></div></td></tr>`;
      if(items.length)h+=`<tr id="${id}" style="display:none"><td colspan="7" style="padding:0 0 8px 0;background:var(--bg)"><table style="min-width:0;margin:0"><tbody>${items.map(i=>`<tr><td style="padding-left:28px"><span class="c-m">${esc(i.konto)}</span> ${esc(i.n)}</td><td class="r">${eur0(i.ist)}</td><td class="r c-m">${x.ist?n1(i.ist/x.ist*100)+' %':'—'}</td><td class="r c-m">${i.plan?eur0(i.plan):''}</td><td></td><td></td><td></td></tr>`).join('')}</tbody></table></td></tr>`;});
    h+=`<tr class="sum"><td>Gesamtkosten</td><td class="r">${eur0(k)}</td><td class="r">100 %</td><td class="r">${u?n1(k/u*100)+' %':'—'}</td><td class="r">${zp(S,'1294')?eur0(zp(S,'1294')):'—'}</td><td class="r">${zp(S,'1294')?dPill(k,zp(S,'1294'),true):''}</td><td></td></tr></tbody></table></div>`;
    // Monatsverlauf
    const ms=months.filter(m=>getBWA(D[e.k]||{},m));
    if(ms.length>1){
      h+=`<div class="sec-h" style="margin-top:18px"><h2 style="font-size:14px">Nach Monat</h2><span class="sub">Ist je BWA-Monat</span></div><div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Umsatz</th><th class="r">Personal</th><th class="r">Sachkosten</th><th class="r">Gesamtkosten</th><th class="r">Ergebnis v. St.</th><th class="r">Rendite</th><th class="r">Personalquote</th></tr></thead><tbody>`;
      ms.forEach(m=>{const d=getBWA(D[e.k],m);const v=d.voll&&d.voll.z||{};const g=c=>(v[c]&&v[c].ist)||0;const um=g('1006'),pe=g('1164'),ko=g('1294'),eg=g('1374');h+=`<tr><td>${m}</td><td class="r"><b>${eur0(um)}</b></td><td class="r">${eur0(pe)}</td><td class="r">${eur0(ko-pe)}</td><td class="r">${eur0(ko)}</td><td class="r ${eg>=0?'c-g':'c-r'}">${eur0(eg)}</td><td class="r">${pctS(um?eg/um*100:null)}</td><td class="r">${pctS(um?pe/um*100:null)}</td></tr>`;});
      h+=`<tr class="sum"><td>Summe</td><td class="r">${eur0(u)}</td><td class="r">${eur0(z(S,'1164'))}</td><td class="r">${eur0(k-z(S,'1164'))}</td><td class="r">${eur0(k)}</td><td class="r ${z(S,'1374')>=0?'c-g':'c-r'}">${eur0(z(S,'1374'))}</td><td class="r">${pctS(u?z(S,'1374')/u*100:null)}</td><td class="r">${pctS(u?z(S,'1164')/u*100:null)}</td></tr></tbody></table></div>`;
    }
    h+='</section>';
  });
  return h;
}

// ── Cashflow ─────────────────────────────────────────────────────────────
// Kontoauszüge je Betrieb (D.bankK/D.bankP aus KIMOJO Bank.xlsx / PHFIP Bank.xlsx,
// Monatswerte plus `voll` aus bankVoll: Herkunft der Einzahlungen, Verwendung
// der Auszahlungen, Saldo je Monatsende).
const BANK_ENT=[{k:'bankK',l:'KIMOJO GmbH',pre:'KIMOJO',sites:['KIMOJO Physio','KIMOJO Ergo'],col:'var(--primary)'},{k:'bankP',l:'PF im Park',pre:'PHFIP',sites:['PF im Park'],col:'var(--teal)'}];
const fDatU=d=>d?new Date(d).toLocaleDateString('de-DE',{timeZone:'UTC'}):'—';
const katName=(side,k)=>{const l=(side==='ein'?BANK_EIN:BANK_AUS).find(x=>x[0]===k);return l?l[1]:k;};
function bankDaten(months){
  return BANK_ENT.filter(e=>e.sites.some(s=>matchS(s))).map(e=>{
    const b=D[e.k]||{},v=b.voll,ms=months.filter(m=>b[m]);
    const agg={ein:0,aus:0,kat:{ein:{},aus:{}}};
    ms.forEach(m=>{const x=b[m];agg.ein+=x.ein;agg.aus+=x.aus;const vm=v&&v.monate[m];if(vm)['ein','aus'].forEach(sd=>Object.entries(vm.kat[sd]).forEach(([k,val])=>{agg.kat[sd][k]=(agg.kat[sd][k]||0)+val;}));});
    const last=ms.length?ms[ms.length-1]:null;
    return{e,b,v,ms,agg,last,saldo:last?b[last].saldo:null,saldoDatum:v&&last&&v.monate[last]?v.monate[last].saldoDatum:null};
  });
}
function linienChart(labels,series){
  const n=labels.length;if(n<2)return'';
  const W=720,H=180,pd={t:14,r:16,b:24,l:64},cw=W-pd.l-pd.r,ch=H-pd.t-pd.b;
  const all=series.flatMap(s=>s.vals.filter(v=>v!=null));if(!all.length)return'';
  let mn=Math.min(0,...all),mx=Math.max(...all);if(mx===mn)mx=mn+1;
  const x=i=>pd.l+i/(n-1)*cw,y=v=>pd.t+(1-(v-mn)/(mx-mn))*ch;
  let h=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;font-family:${SVGF}">`;
  for(let i=0;i<=4;i++){const v=mn+(mx-mn)*i/4,yy=y(v);h+=`<line x1="${pd.l}" x2="${W-pd.r}" y1="${yy}" y2="${yy}" stroke="var(--border)" stroke-width="1"/><text x="${pd.l-6}" y="${yy+4}" text-anchor="end" font-size="10" fill="var(--faint)">${fmK(v)}</text>`;}
  if(mn<0)h+=`<line x1="${pd.l}" x2="${W-pd.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
  labels.forEach((l,i)=>{h+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(l)}</text>`;});
  series.forEach(s=>{const pts=s.vals.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);if(pts.length<2)return;h+=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${s.col}" stroke-width="${s.dash?1.5:2.5}"${s.dash?' stroke-dasharray="6 4"':''} stroke-linejoin="round"/>`;if(!s.dash)pts.forEach(p=>{h+=`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.col}"/>`;});});
  return h+'</svg>';
}
function pCashflow(){
  const months=getActiveMonths(),data=bankDaten(months);
  const sub=`${esc(zeitraumLabel())} · ${esc(sn(aS))}`;
  if(!data.some(x=>x.ms.length))return`<section class="sec"><div class="sec-h"><h2>Cashflow</h2><span class="sub">${sub}</span></div><div class="empty">Für den gewählten Zeitraum liegen keine Kontoauszüge vor.</div></section>`;
  const S=k=>data.reduce((t,x)=>t+x.agg[k],0);const ein=S('ein'),aus=S('aus'),netto=ein+aus;
  const saldo=data.reduce((t,x)=>t+(x.saldo||0),0);const stand=data.map(x=>x.saldoDatum).filter(Boolean).sort((a,b)=>b-a)[0];
  const bis=data.map(x=>x.v&&x.v.bis).filter(Boolean).sort((a,b)=>b-a)[0];
  let h=`<section class="sec"><div class="sec-h"><h2>Cashflow</h2><span class="sub">${sub}${bis?' · Buchungen bis '+fDatU(bis):''}</span></div><div class="grid">`;
  h+=`<div class="kpi big"><div class="l">Netto-Cashflow</div><div class="v ${netto>=0?'c-g':'c-r'}">${(netto>=0?'+':'')+eur0(netto)}</div><div class="s">Einzahlungen minus Auszahlungen im Zeitraum</div></div>`;
  h+=`<div class="kpi"><div class="l">Einzahlungen</div><div class="v c-g">${eur0(ein)}</div><div class="s">davon Kassen und Abrechnungszentren <b>${eur0(data.reduce((t,x)=>t+(x.agg.kat.ein.kassen||0),0))}</b></div></div>`;
  h+=`<div class="kpi"><div class="l">Auszahlungen</div><div class="v c-r">${eur0(aus)}</div><div class="s">davon Löhne und Gehälter <b>${eur0(data.reduce((t,x)=>t+(x.agg.kat.aus.gehalt||0),0))}</b></div></div>`;
  h+=`<div class="kpi"><div class="l">Kontostand</div><div class="v">${eur0(saldo)}</div><div class="s">${stand?'Stand '+fDatU(stand):'letzter Monat im Zeitraum'} · ${data.length>1?'beide Konten':esc(data[0].e.l)}</div></div>`;
  h+='</div>';
  if(data.length>1)h+='<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Betrieb</th><th>Monate</th><th class="r">Einzahlungen</th><th class="r">Auszahlungen</th><th class="r">Netto</th><th class="r">Kontostand</th><th>Stand</th></tr></thead><tbody>'+data.map(x=>`<tr><td><span class="site"><span class="dot" style="background:${x.e.col}"></span>${esc(x.e.l)}</span></td><td class="c-m">${x.ms.length?x.ms[0]+(x.ms.length>1?' – '+x.ms[x.ms.length-1]:''):'—'}</td><td class="r c-g">${eur0(x.agg.ein)}</td><td class="r c-r">${eur0(x.agg.aus)}</td><td class="r ${x.agg.ein+x.agg.aus>=0?'c-g':'c-r'}"><b>${eur0(x.agg.ein+x.agg.aus)}</b></td><td class="r"><b>${x.saldo==null?'—':eur0(x.saldo)}</b></td><td class="c-m">${fDatU(x.saldoDatum)}</td></tr>`).join('')+'</tbody></table></div>';
  // Saldo-Verlauf
  const lab=months.filter(m=>data.some(x=>x.b[m]));
  if(lab.length>1)h+='<div style="margin-top:14px">'+linienChart(lab,data.map(x=>({col:x.e.col,vals:lab.map(m=>x.b[m]?x.b[m].saldo:null)})))+'</div><p class="hint">Kontostand am letzten Buchungstag des Monats je Konto.</p>';
  h+=`<p class="hint">Quelle: ${D.bankAbruf?'automatischer Bankabruf (Enable Banking, dreimal täglich), für die Zeit davor die Kontoauszug-Exporte der VR-Bank.':'Kontoauszug-Exporte der VR-Bank (KIMOJO Bank.xlsx, PHFIP Bank.xlsx), manuell abgelegt – der Stand entspricht dem letzten Buchungstag im Export.'} Einzahlungen und Auszahlungen sind nach Zahlungsbeteiligtem und Verwendungszweck zugeordnet; interne Umbuchungen zwischen den Konten und Gesellschaftern stehen gesondert.</p></section>`;
  data.forEach(x=>{
    if(!x.ms.length)return;
    h+=`<section class="sec"><div class="sec-h"><h2><span class="site"><span class="dot" style="background:${x.e.col}"></span>${esc(x.e.l)}</span></h2><span class="sub">${x.v&&x.v.iban?'IBAN …'+esc(String(x.v.iban).slice(-6))+' · ':x.v&&x.v.konten>1?x.v.konten+' Konten · ':''}${x.ms.length} Monat${x.ms.length>1?'e':''}</span></div>`;
    h+='<div class="tbl-wrap"><table><thead><tr><th>Monat</th><th class="r">Einzahlungen</th><th class="r">Auszahlungen</th><th class="r">Netto</th><th class="r">Kontostand Ende</th></tr></thead><tbody>';
    x.ms.forEach(m=>{const d=x.b[m];h+=`<tr><td>${m}</td><td class="r c-g">${eur0(d.ein)}</td><td class="r c-r">${eur0(d.aus)}</td><td class="r ${d.ein+d.aus>=0?'c-g':'c-r'}"><b>${eur0(d.ein+d.aus)}</b></td><td class="r">${eur0(d.saldo)}</td></tr>`;});
    h+=`<tr class="sum"><td>Summe</td><td class="r c-g">${eur0(x.agg.ein)}</td><td class="r c-r">${eur0(x.agg.aus)}</td><td class="r ${x.agg.ein+x.agg.aus>=0?'c-g':'c-r'}">${eur0(x.agg.ein+x.agg.aus)}</td><td class="r">${x.saldo==null?'—':eur0(x.saldo)}</td></tr></tbody></table></div>`;
    if(x.v){
      const tab=(side,title,col)=>{const ent=Object.entries(x.agg.kat[side]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));const tot=ent.reduce((t,e)=>t+e[1],0);const mx=Math.max(...ent.map(e=>Math.abs(e[1])),1);return`<div><div class="sec-h" style="margin:14px 0 8px"><h2 style="font-size:14px">${title}</h2></div><div class="tbl-wrap"><table style="min-width:0"><tbody>${ent.map(([k,v])=>`<tr><td>${esc(katName(side,k))}</td><td class="r"><b>${eur0(v)}</b></td><td class="r c-m">${tot?n0(v/tot*100)+' %':''}</td><td style="min-width:90px"><div class="bar"><i style="width:${Math.abs(v)/mx*100}%;background:${col}"></i></div></td></tr>`).join('')}</tbody></table></div></div>`;};
      h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">'+tab('ein','Woher kommt das Geld','var(--green)')+tab('aus','Wohin geht das Geld','var(--red)')+'</div>';
      const top=(side,title)=>{const ent=Object.entries(x.v.partner[side]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,8);return`<div><div class="sec-h" style="margin:14px 0 8px"><h2 style="font-size:14px">${title}</h2><span class="sub">alle Buchungen ${fDatU(x.v.von)} – ${fDatU(x.v.bis)}</span></div><div class="tbl-wrap"><table style="min-width:0"><tbody>${ent.map(([n,v])=>`<tr><td>${esc(n)}</td><td class="r"><b>${eur0(v)}</b></td></tr>`).join('')}</tbody></table></div></div>`;};
      h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">'+top('ein','Größte Zahler')+top('aus','Größte Empfänger')+'</div>';
    }
    h+='</section>';
  });
  return h;
}

// ── Liquidität ───────────────────────────────────────────────────────────
// Drei Stufen: Bankguthaben (letzter Kontostand), plus offene Forderungen
// (Medifox-Rechnungsübersicht nach Kostenträgertyp, thevea-Rechnungen Privat,
// Zuzahlung, Ausfall), plus erbrachte, noch nicht abgerechnete Leistungen
// (Medifox-Zeilen ohne „Abgerechnet", KIMOJO Kalenderwert minus thevea-Abrechnung).
function liqOffen(){
  const out={},RZ=liqRezepte(liqTag(heute()));
  RZ.liste.forEach(z=>{if(z.zweifel||!z.erb||!matchS(z.site))return;
    const o=out[z.site]||(out[z.site]={offen:0,n:0,quelle:z.src==='thevea'?'thevea: offene Rezepte laut Verordnungswert-Prognose':'Medifox: Einheiten ohne Kennzeichen „Abgerechnet“, je Patient und Verordnungsdatum'});o.offen+=z.erb;o.n++;});
  return out;
}
// ── Liquiditätsvorschau (13 Wochen) ──────────────────────────────────────
// Start: Kontostand aller Konten des Betriebs (Bankabruf, sonst letzter Export).
// Vorschau nur aus der Bankhistorie der letzten sechs Monate:
//  · wiederkehrend: gleicher Zahlungsbeteiligter in festem Rhythmus (monatlich,
//    zwei- oder dreimonatlich) → nächste Termine mit dem Median der letzten drei Beträge
//  · laufend: Zahler mit mehreren Buchungen je Monat (z. B. Abrechnungszentren)
//    → Summe der letzten 13 Wochen gleichmäßig auf die Werktage
//  · übrige Buchungen → Durchschnitt je Kategorie der letzten 13 Wochen;
//    große Einzelbeträge (Einmaleffekte) werden nicht fortgeschrieben.
// Umbuchungen zwischen eigenen Konten (und in der Gesamtsicht zwischen KIMOJO
// und PF im Park) fallen heraus. Mindestbestand = ein Monat Fixkosten (BWA:
// Gesamtkosten ohne Abschreibungen, Durchschnitt der letzten drei Monate).
const LIQ_WOCHEN=13,LIQ_TAG=864e5;
const liqTag=d=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
const liqHeute=()=>{const d=new Date();return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));};
const liqMontag=d=>{const x=liqTag(d);x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return x;};
const liqPlus=(d,n)=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x;};
const liqMI=d=>d.getUTCFullYear()*12+d.getUTCMonth();
const liqMedian=a=>{const s=[...a].sort((x,y)=>x-y),n=s.length;return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):0;};
const liqWerktag=d=>d.getUTCDay()!==0&&d.getUTCDay()!==6;
const liqKW=d=>{const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/LIQ_TAG+1)/7);};
const fDM=d=>String(d.getUTCDate()).padStart(2,'0')+'.'+String(d.getUTCMonth()+1).padStart(2,'0')+'.';
const LIQ_BETRIEB={KIMOJO:{l:'KIMOJO GmbH',col:'var(--primary)'},PHFIP:{l:'PF im Park',col:'var(--teal)'}};
const LIQ_FREMD={KIMOJO:/physio und fitness|im park|phfip/i,PHFIP:/kimojo/i};
function liqBetriebe(){return aS==='Alle'?['KIMOJO','PHFIP']:aS==='PF im Park'?['PHFIP']:['KIMOJO'];}
function liqKey(x){
  if(x.b<0&&!x.n&&/sammel/i.test(x.t))return'-sammel';
  const n=String(x.n||x.t||'').toLowerCase().replace(/[^a-zäöüß ]/g,' ').replace(/\b(gmbh|eg|ag|kg|ev|mbh|und|co|se|ug)\b/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,3).join(' ');
  // Sozialversicherung: Kassen ändern den Namen (BARMER → BARMER Hauptverwaltung), erstes Wort reicht
  return(x.b>0?'+':'-')+(bankKat(x)==='sv'?n.split(' ')[0]:n||'?');
}
function liqIntern(x,betriebe,eigene){
  if(x.pIban&&eigene.has(x.pIban))return true;
  return betriebe.length>1&&LIQ_FREMD[x._b]&&LIQ_FREMD[x._b].test(x.n);
}
function liqFixkosten(betriebe,H){
  const det=[];let wert=0;
  betriebe.forEach(b=>{const bwa=D[b==='KIMOJO'?'bwaK':'bwaP']||{};
    const ms=MN.filter(m=>{const x=getBWA(bwa,m);return x&&x.voll&&x.voll.z&&x.voll.z['1294']&&x.voll.z['1294'].ist;}).slice(-3);
    if(!ms.length)return;const v=ms.map(m=>{const z=getBWA(bwa,m).voll.z;return(z['1294'].ist||0)-((z['1248']&&z['1248'].ist)||0);});
    const avg=v.reduce((t,x)=>t+x,0)/v.length;wert+=avg;det.push({b,ms,avg});});
  if(!det.length&&H){// ohne BWA: durchschnittliche Auszahlungen je Monat laut Bank
    const aus=-H.filter(x=>x.b<0).reduce((t,x)=>t+x.b,0)/3;return{wert:aus,det:[],quelle:'Auszahlungen ø Monat (Bank, 13 Wochen)'};}
  return{wert,det,quelle:'BWA: Gesamtkosten ohne Abschreibungen, ø '+(det[0]?det[0].ms.join(', '):'')};
}
// ── Einzahlungen aus Abrechnung und Terminkalender ───────────────────────
// Statt der Bankhistorie kommen die Einnahmen aus Behandlungen aus vier Quellen:
//  1. abgerechnet, offen: Rechnungsdatum + Zahlungsziel (28 Tage). Überfällige bis
//     90 Tage kommen in den nächsten zwei Wochen, ältere gelten als zweifelhaft.
//     thevea-Kassenabrechnung: abgerechnet (netto) minus Eingänge von opta data.
//  2.–3. je Rezept: abgerechnet wird ein Rezept, wenn es fertig ist. Bezahlt wird es
//     nach dem letzten Termin + Abrechnungsabstand + Zahlungsziel: die schon erbrachten
//     Einheiten voll, geplante und noch nicht terminierte Einheiten mal Realisierungsquote.
//  4. neue Rezepte, die noch nicht im Kalender stehen: Lücke zum Ø der letzten 8 Wochen
//     je Werktag, bezahlt nach der üblichen Restlaufzeit eines Rezepts + Abstand + Ziel
const LIQ_ZAHLZIEL=28,LIQ_QUOTE=0.9,LIQ_ZWEIFEL=90;
const LIQ_PL={re_k:'Abgerechnet: Kassen und BG',re_p:'Abgerechnet: Zuzahlung und Privat',erb:'Erbracht, Rezept noch nicht abgerechnet',kal:'Laufende Rezepte: geplante und offene Einheiten',hoch:'Neue Rezepte (Ø der letzten 8 Wochen)'};
const LIQ_RE_NR=/\b(re|rechnung|rg|rnr|rech)\b|[A-Z]{1,3}-?20\d\d-\d+|\b20\d\d-\d{3,6}\b/i;
// Bankeingänge, die die Abrechnungssicht ersetzt (Kassen, BG, Patientenrechnungen)
function liqIstLeistung(x){if(x.b<=0)return false;const k=bankKat(x);return k==='kassen'||k==='bg'||(k==='sonst'&&LIQ_RE_NR.test(x.z));}
function liqBetriebVonSite(s){return s==='PF im Park'?'PHFIP':'KIMOJO';}
// thevea-Kassenabrechnung (über opta data): abgerechnet netto minus Privat- und
// Beihilferezepte (die laufen als Privatrechnung an den Patienten und stehen dort
// schon als Forderung) minus Eingänge von opta data
function liqTheveaKassenOffen(stand){
  const rows=(D.abg&&D.abg.rows)||[],abgN=rows.reduce((t,r)=>t+(r.netto||0),0),erst=rows.map(r=>r.ym).sort()[0];
  if(!erst)return{offen:0,abg:0,ein:0,privat:0};const ab=new Date(erst+'-01T00:00:00Z');
  const privat=((D.re&&D.re.rows)||[]).filter(r=>!r.storno&&/^Privat/i.test(r.artName)&&r.ym>=erst).reduce((t,r)=>t+r.brutto,0);
  const ein=(D.konten||[]).filter(k=>k.betrieb==='KIMOJO').flatMap(k=>k.tx).filter(x=>x.b>0&&/opta data/i.test(x.n)&&x.d>=ab&&(!stand||x.d<=stand)).reduce((t,x)=>t+x.b,0);
  return{offen:Math.max(0,abgN-privat-ein),abg:abgN,ein,privat};
}
// Rezepte aus dem Kalender. thevea: Rezeptnummer am Termin, offen ist ein Rezept, solange
// es in der Verordnungswert-Prognose steht (Wert erbracht/offen und Einheiten von dort).
// Medifox: Rezept = Patient + Verordnungsdatum, offen sind Einheiten ohne „Abgerechnet“.
// Abrechnungsabstand je Betrieb (vom letzten Termin bis zur Rechnung): Wert der fertigen,
// noch nicht abgerechneten Rezepte geteilt durch den Ø erbrachten Wert je Kalendertag
// (Warteschlange: Bestand / Durchsatz), 3–42 Tage. Restlaufzeit: wie lange
// es von einer Behandlung bis zum letzten Termin ihres Rezepts dauert (abgeschlossene Rezepte).
let liqRzCache=null;
function liqRezepte(hs){
  const key=hs.getTime()+'|'+D.raw.length;if(liqRzCache&&liqRzCache.key===key)return liqRzCache.wert;
  const plus=liqPlus,med=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)];};
  const pad=k=>{const p=String(k).split('-');return p.length===3?p[0]+'-'+p[1].padStart(2,'0')+'-'+p[2].padStart(2,'0'):k;};
  const tag=r=>r.src==='thevea'?(r.datum?liqTag(new Date(r.datum)):null):(r.dateKey?(x=>x?liqTag(x):null)(bankDatum(pad(r.dateKey))):null);
  const vo=(D.thevea&&D.thevea.voOffen)||{},G=new Map(),hist={};let n=0;
  const vor56=plus(hs,-56),vor180=plus(hs,-180);
  D.raw.forEach(r=>{
    if(tvIstKurs(r)||r.kind==='ausfall'||r.kind==='reserviert'||(r.src!=='thevea'&&abgMedifoxArt(r)==='ausfall'))return;
    const d=tag(r);if(!d)return;const site=rowSite(r),betrieb=liqBetriebVonSite(site),p=r.price||0;
    if(d<=hs&&r.src==='thevea'&&r.kind!=='erbracht')return;
    if(d<=hs&&d>vor56){const h=hist[betrieb]||(hist[betrieb]={erb56:0});h.erb56+=p;}
    const k=r.src==='thevea'?(r.vo?'tv|'+r.vo:'x|'+(n++)):(r.patient&&r.vo?'mf|'+r.filiale+'|'+r.patient+'|'+r.vo:'x|'+(n++));
    const z=G.get(k)||(G.set(k,{key:k,src:r.src,vo:r.vo,site,betrieb,past:[],fut:[]}),G.get(k));
    (d<=hs?z.past:z.fut).push({d,p,billed:r.billed});
  });
  const liste=[],stat={},alle=[...G.values()];
  // Takt und Restlaufzeit aus abgeschlossenen Rezepten
  const lueck=[],restB={};
  alle.forEach(z=>{
    const ds=[...new Set(z.past.concat(z.fut).map(x=>+x.d))].sort((a,b)=>a-b);
    z.takt=med(ds.slice(1).map((t,i)=>(t-ds[i])/LIQ_TAG).filter(x=>x>0&&x<=28));if(z.takt)lueck.push(z.takt);
    if(!z.fut.length&&z.past.length>=2){const e=Math.max(...z.past.map(x=>+x.d));const R=restB[z.betrieb]||(restB[z.betrieb]={s:0,w:0});z.past.forEach(x=>{R.s+=(e-x.d)/LIQ_TAG*x.p;R.w+=x.p;});}
  });
  const taktG=med(lueck)||7;
  // Medifox kennt die Einheiten je Rezept nicht: typische Zahl aus abgeschlossenen, abgerechneten Rezepten
  const nTyp={};['KIMOJO','PHFIP'].forEach(b=>{nTyp[b]=med(alle.filter(z=>z.src!=='thevea'&&z.betrieb===b&&!z.fut.length&&z.past.length>=2&&z.past.every(x=>x.billed)).map(z=>z.past.length))||6;});
  // Ende des Medifox-Kalenders je Betrieb: wer dort noch Termine hat, läuft wahrscheinlich weiter
  const kalEnde={};alle.filter(z=>z.src!=='thevea').forEach(z=>z.fut.forEach(x=>{if(!kalEnde[z.betrieb]||x.d>kalEnde[z.betrieb])kalEnde[z.betrieb]=x.d;}));let nRand=0;
  alle.forEach(z=>{
    const lastP=z.past.length?new Date(Math.max(...z.past.map(x=>+x.d))):null,lastF=z.fut.length?new Date(Math.max(...z.fut.map(x=>+x.d))):null;
    let erb=0,plan=z.fut.reduce((t,x)=>t+x.p,0),fehlt=0,missing=0,unit=0;
    if(z.src==='thevea'){
      const nd=vo[z.vo];if(!nd&&!z.fut.length)return;
      if(nd){const e=+nd.behandlungseinheitenErbracht||0,g=+nd.behandlungseinheitenGesamt||0;erb=parseFloat(nd.wertErbrachteBehandlungen)||0;
        unit=g>e?(parseFloat(nd.erwarteterWertOffeneBehandlungen)||0)/(g-e):0;if(unit>0)plan=z.fut.length*unit;missing=Math.max(0,g-e-z.fut.length);}
    }else{
      erb=z.past.filter(x=>!x.billed&&x.d>vor180).reduce((t,x)=>t+x.p,0);
      if(!erb&&!z.fut.length)return;
      // läuft das Rezept noch, fehlen bis zur typischen Länge noch Einheiten (Kalender reicht nur ~4 Wochen)
      if(z.fut.length){const alleE=z.past.concat(z.fut);missing=Math.max(0,nTyp[z.betrieb]-alleE.length);unit=alleE.reduce((t,x)=>t+x.p,0)/alleE.length;
        // letzter Termin in der letzten Kalenderwoche: Ende unbekannt, 1–4 weitere Einheiten (verteilt)
        if(kalEnde[z.betrieb]&&lastF>=plus(kalEnde[z.betrieb],-7))missing=Math.max(missing,1+(nRand++)%4);}
    }
    const takt=z.takt||taktG;
    let ende=lastF||lastP;
    if(missing>0&&unit>0){
      if(lastF||(lastP&&(hs-lastP)/LIQ_TAG<=21)){const ab=lastF||(lastP>hs?lastP:hs);ende=plus(ab,Math.round(missing*takt));fehlt=missing*unit;}
    }
    if(!ende)return;
    const fertig=!z.fut.length&&!fehlt,alter=fertig?Math.round((hs-ende)/LIQ_TAG):0;
    // geplante und noch nicht terminierte Einheiten nach Tag (für die Auffüllung neuer Rezepte)
    const tage=z.fut.map(x=>[x.d,unit>0?unit:x.p]);if(fehlt){const ab=lastF||hs;for(let i=1;i<=missing;i++)tage.push([plus(ab,Math.round(i*takt)),unit]);}
    liste.push({key:z.key,site:z.site,betrieb:z.betrieb,src:z.src,erb,plan,fehlt,ende,fertig,alter,zweifel:fertig&&alter>LIQ_ZWEIFEL,tage});
  });
  ['KIMOJO','PHFIP'].forEach(b=>{
    const w=liste.filter(z=>z.betrieb===b&&z.fertig&&!z.zweifel),wert=w.reduce((t,z)=>t+z.erb,0);
    const wt56=[...Array(56)].map((_,i)=>plus(hs,-i)).filter(liqWerktag).length||40,hochTag=((hist[b]||{}).erb56||0)/wt56;
    const lag=Math.round(Math.min(42,Math.max(3,hochTag?wert/(hochTag*5/7):14)));
    const R=restB[b],rest=R&&R.w?Math.round(R.s/R.w):14;
    const kal=[...G.values()].filter(z=>z.betrieb===b).flatMap(z=>z.fut.map(x=>+x.d));
    stat[b]={lag,rest,hochTag,kalBis:kal.length?new Date(Math.max(...kal)):null,nWarten:w.length,wartet:wert};
  });
  // fertige Rezepte, die schon länger als üblich warten, verteilen sich auf die nächsten Abrechnungstage
  const nAlt={};liste.forEach(z=>{const lag=stat[z.betrieb].lag;let ab=plus(z.ende,lag);
    if(z.fertig&&ab<=hs){const i=nAlt[z.betrieb]=(nAlt[z.betrieb]||0)+1;ab=plus(hs,1+i%lag);}
    z.abrechnung=ab;z.zahlung=plus(ab,LIQ_ZAHLZIEL);});
  const wert={liste,stat};liqRzCache={key,wert};return wert;
}
function liqPipeline(betrieb,stand,ende){
  const ev=[],info={offen:{re_k:0,re_p:0},zweifel:0,zweifelN:0,erb:0,kal:0,kalBis:null,hochTag:0};
  const hs=liqTag(stand);
  const plus=(d,n)=>liqPlus(d,n),dat=s=>{const d=bankDatum(s);return d?liqTag(d):null;};
  const add=(d,b,k)=>{if(b)ev.push({d,b,k});};
  const verteile=(von,tage,b,k)=>{const ds=[];for(let i=0;i<tage;i++){const d=plus(von,i);if(liqWerktag(d))ds.push(d);}ds.forEach(d=>add(d,b/ds.length,k));};
  // Nur noch nicht fällige Rechnungen zählen. Überfällige sind oft schon bezahlt, aber im
  // System nicht ausgebucht (Medifox Juli/August), sie stehen getrennt zur Prüfung.
  const offeneRechnung=(datum,betrag,k)=>{
    if(!datum||betrag<=0.005)return;const f=plus(datum,LIQ_ZAHLZIEL);
    if(f<=hs){info.zweifel+=betrag;info.zweifelN++;return;}
    info.offen[k]+=betrag;add(f,betrag,k);
  };
  // 1a Medifox-Rechnungsübersicht (KIMOJO vor dem Cutover, PF im Park)
  const pre=betrieb==='PHFIP'?'PHFIP':'KIMOJO';
  ((D.rechnungen&&D.rechnungen.alle)||[]).forEach(r=>{
    if(r.prefix!==pre||r.storniert||/mahnung/i.test(r.belegtyp)||/mahnung/i.test(r.typ)||!(r.saldo>0))return;
    offeneRechnung(dat(r.datum),r.saldo,(r.typ==='Kasse'||r.typ==='BG')?'re_k':'re_p');
  });
  if(betrieb==='KIMOJO'){
    // 1b thevea Zuzahlungs- und Privatrechnungen
    ((D.re&&D.re.rows)||[]).forEach(r=>{if(r.storno)return;offeneRechnung(dat(r.datum),r.brutto-(r.bezahlt||0),'re_p');});
    // 1c thevea-Kassenabrechnung über opta data: abgerechnet minus bereits eingegangen
    const tk=liqTheveaKassenOffen(stand);info.offen.re_k+=tk.offen;verteile(plus(hs,1),30,tk.offen,'re_k');
    info.optaAbg=tk.abg;info.optaEin=tk.ein;
  }
  // 2–4 je Rezept (liqRezepte)
  const RZ=liqRezepte(hs),st=RZ.stat[betrieb]||{lag:14,rest:14,hochTag:0,kalBis:null};
  const plan={};const planAdd=(d,b)=>{const k=d.toISOString().slice(0,10);plan[k]=(plan[k]||0)+b;};
  info.lag=st.lag;info.rest=st.rest;info.hochTag=st.hochTag;info.kalBis=st.kalBis;info.nRz=0;info.nFertig=0;info.erbZweifel=0;
  RZ.liste.filter(z=>z.betrieb===betrieb).forEach(z=>{
    if(z.zweifel){info.erbZweifel+=z.erb;return;}
    info.nRz++;if(z.fertig)info.nFertig++;
    info.erb+=z.erb;add(z.zahlung,z.erb,'erb');
    const k=(z.plan+z.fehlt)*LIQ_QUOTE;info.kal+=k;add(z.zahlung,k,'kal');
    z.tage.forEach(([d,b])=>planAdd(d,b*LIQ_QUOTE));
  });
  // neue Rezepte: je Werktag die Lücke zwischen Geplantem und dem Ø der letzten 8 Wochen
  for(let d=plus(hs,1);plus(d,st.rest+st.lag+LIQ_ZAHLZIEL)<=ende;d=plus(d,1)){
    if(!liqWerktag(d))continue;const pv=plan[d.toISOString().slice(0,10)]||0;
    if(st.hochTag>pv)add(plus(d,st.rest+st.lag+LIQ_ZAHLZIEL),st.hochTag-pv,'hoch');
  }
  return{ev,info};
}

function liqPrognose(betriebe){
  const konten=(D.konten||[]).filter(k=>betriebe.includes(k.betrieb)&&k.saldoDatum);
  if(!konten.length)return null;
  const eigene=new Set(konten.map(k=>k.iban));
  const stand=liqTag(konten.reduce((m,k)=>!m||k.saldoDatum>m?k.saldoDatum:m,null));
  const start=konten.reduce((t,k)=>t+(k.saldo||0),0),kredit=konten.reduce((t,k)=>t+(k.kreditlinie||0),0);
  const von91=liqPlus(stand,-91),von183=liqPlus(stand,-183);
  const H=konten.flatMap(k=>k.tx.filter(x=>x.d>von183&&x.d<=stand).map(x=>Object.assign({_b:k.betrieb},x))).filter(x=>!liqIntern(x,betriebe,eigene)&&!liqIstLeistung(x));
  const H91=H.filter(x=>x.d>von91);
  const w0=liqMontag(stand),wochen=[...Array(LIQ_WOCHEN)].map((_,i)=>({von:liqPlus(w0,7*i),bis:liqPlus(w0,7*i+6),ein:0,aus:0,kat:{ein:{},aus:{}}}));
  const ende=wochen[LIQ_WOCHEN-1].bis,met={},termine=[],einmal=[];
  const buche=(d,betrag,kat,art)=>{if(d<=stand||d>ende||!betrag)return;const w=wochen[Math.floor((d-w0)/LIQ_TAG/7)];if(!w)return;const sd=betrag>0?'ein':'aus';w[sd]+=betrag;w.kat[sd][kat]=(w.kat[sd][kat]||0)+betrag;const m=met[sd+'|'+kat]||(met[sd+'|'+kat]={sd,kat,summe:0,art:{}});m.summe+=betrag;m.art[art]=(m.art[art]||0)+betrag;};
  const werktageVor=[...Array(91)].map((_,i)=>liqPlus(stand,-i)).filter(liqWerktag).length||65;
  const kuenftigeWerktage=[];for(let d=liqPlus(stand,1);d<=ende;d=liqPlus(d,1))if(liqWerktag(d))kuenftigeWerktage.push(d);
  const ausMonat=-H91.filter(x=>x.b<0).reduce((t,x)=>t+x.b,0)/3,grenze=Math.max(5000,Math.round(ausMonat*0.1/1000)*1000);
  const rest={};
  const G={};H.forEach(x=>{const k=x._b+liqKey(x);(G[k]=G[k]||[]).push(x);});
  Object.values(G).forEach(l=>{
    l.sort((a,b)=>a.d-b.d);const last=l[l.length-1],kat=bankKat(last);
    const name=last.n||(/sammel/i.test(last.t)?'Sammelüberweisung (Gehälter)':last.t)||'ohne Namen';
    const mon=[...new Set(l.map(x=>liqMI(x.d)))].sort((a,b)=>a-b),dm=mon.length,cnt=l.length;
    // Umbuchungen, Einlagen und Steuererstattungen werden nicht fortgeschrieben;
    // Zahlungen an Gesellschafter nur, wenn sie in festem Rhythmus kommen.
    const person=kat==='intern'&&last.b<0&&/br[äa]tz/i.test(name);
    const nieFort=x=>{einmal.push(Object.assign({kat:bankKat(x),grund:kat==='intern'?'Umbuchung, Gesellschafter':'Erstattung'},x));};
    if((kat==='intern'&&!person)||(kat==='finanzamt'&&last.b>0)){l.filter(x=>x.d>von91).forEach(nieFort);return;}
    // große Einzelbeträge zählen nie als laufend oder Durchschnitt
    const gross=x=>x.b<=-grenze&&kat!=='gehalt'&&kat!=='sv';
    const invest=kat==='invest';
    // laufend: mehrere Buchungen je Monat
    if(cnt>=4&&cnt/dm>1.34&&!person&&!invest){
      if((stand-last.d)/LIQ_TAG>35)return;
      l.filter(x=>x.d>von91&&gross(x)).forEach(x=>einmal.push(Object.assign({kat,grund:'Einzelbetrag ab '+eur0(grenze)},x)));
      const s=l.filter(x=>x.d>von91&&!gross(x)).reduce((t,x)=>t+x.b,0)/werktageVor;
      kuenftigeWerktage.forEach(d=>buche(d,s,kat,'laufend'));return;
    }
    // wiederkehrend in festem Rhythmus
    if(dm>=2){
      const gaps=[];for(let i=1;i<dm;i++)gaps.push(mon[i]-mon[i-1]);
      const g=Math.round(liqMedian(gaps));
      // neu begonnene Monatszahlung: zwei Monate in Folge, gleicher Betrag (±10 %)
      const l2=l.filter(x=>!gross(x)),neuMonat=dm===2&&g===1&&l2.length===2&&Math.abs(l2[1].b-l2[0].b)<=Math.abs(l2[0].b)*0.1;
      // zwei- oder dreimonatlich mit nur zwei Zahlungen nur bei ähnlichem Betrag (±20 %), sonst sind es meist Teilrechnungen
      const aehnlich=dm>2||(l2.length>=2&&Math.abs(l2[l2.length-1].b-l2[l2.length-2].b)<=Math.abs(l2[l2.length-2].b)*0.2);
      if(((g===1&&(dm>=3||neuMonat))||((g===2||g===3)&&dm>=2&&aehnlich))&&gaps.filter(x=>x===g).length>=Math.ceil(gaps.length*0.6)){
        if(liqMI(stand)-liqMI(last.d)>g+1)return;// beendet
        const lr=l.filter(x=>!gross(x)),l3=(lr.length?lr:l).slice(-3),betr=kat==='gehalt'?l3[l3.length-1].b:liqMedian(l3.map(x=>x.b)),tag=Math.round(liqMedian(l3.map(x=>x.d.getUTCDate())));
        l.filter(x=>x.d>von91&&gross(x)&&lr.length).forEach(x=>einmal.push(Object.assign({kat,grund:'Einzelbetrag ab '+eur0(grenze)},x)));
        for(let mi=liqMI(last.d)+g;;mi+=g){
          const y=Math.floor(mi/12),mo=mi%12,ml=new Date(Date.UTC(y,mo+1,0)).getUTCDate();let d=new Date(Date.UTC(y,mo,Math.min(tag,ml)));
          if(d>ende)break;
          if(d<=stand){if((stand-d)/LIQ_TAG>10)continue;d=liqPlus(stand,1);}
          while(!liqWerktag(d))d=liqPlus(d,1);
          buche(d,betr,kat,'wiederkehrend');if(d<=ende)termine.push({d,b:betr,kat,name,g,n:cnt});
        }
        return;
      }
    }
    // übrige: Durchschnitt je Kategorie, Einmaleffekte ausgenommen
    l.filter(x=>x.d>von91).forEach(x=>{if(person){nieFort(x);return;}if(invest){einmal.push(Object.assign({kat,grund:'Investition'},x));return;}if(gross(x)){einmal.push(Object.assign({kat,grund:'Einzelbetrag ab '+eur0(grenze)},x));return;}const k=(x.b>0?'ein':'aus')+'|'+kat;rest[k]=(rest[k]||0)+x.b;});
  });
  Object.entries(rest).forEach(([k,s])=>{const kat=k.split('|')[1],t=s/werktageVor;kuenftigeWerktage.forEach(d=>buche(d,t,kat,'Durchschnitt'));});
  // Einnahmen aus Behandlungen: Abrechnung und Terminkalender je Betrieb
  const pl={};betriebe.forEach(b=>{const x=liqPipeline(b,stand,ende);pl[b]=x.info;x.ev.forEach(e=>buche(e.d,e.b,LIQ_PL[e.k],e.k));});
  let lauf=start;wochen.forEach(w=>{w.anfang=lauf;lauf+=w.ein+w.aus;w.ende=lauf;});
  const tief=wochen.reduce((m,w)=>!m||w.ende<m.ende?w:m,null);
  const fix=liqFixkosten(betriebe,H91);
  return{betriebe,konten,stand,start,kredit,wochen,tief,fix,pl,termine:termine.sort((a,b)=>a.d-b.d),met:Object.values(met),einmal:einmal.sort((a,b)=>Math.abs(b.b)-Math.abs(a.b)),grenze,alter:Math.round((liqHeute()-stand)/LIQ_TAG)};
}
const liqStatus=(v,fix)=>v<0?'<span class="pill p-r">Unterdeckung</span>':v<fix?'<span class="pill p-a">unter Mindestbestand</span>':'<span class="pill p-g">ausreichend</span>';
const liqName=bs=>bs.length>1?'BM Group':LIQ_BETRIEB[bs[0]].l;
const LIQ_ART={wiederkehrend:'feste Termine',laufend:'laufend je Werktag',Durchschnitt:'ø der letzten 13 Wochen',re_k:'Rechnungsdatum + 28 Tage',re_p:'Rechnungsdatum + 28 Tage',erb:'nächste Abrechnung + 28 Tage',kal:'Termin + Abrechnung + 28 Tage, 90 %',hoch:'Tage mit weniger Terminen als üblich'};
function liqVorschau(){
  const bs=liqBetriebe(),P=liqPrognose(bs);
  if(!P)return`<section class="sec"><div class="sec-h"><h2>Liquiditätsvorschau</h2></div><div class="empty">Für ${esc(liqName(bs))} liegen noch keine Kontodaten vor.</div></section>`;
  const fix=P.fix.wert,w=P.wochen,kwL=x=>'KW '+liqKW(x.von);
  let h='';
  // Hinweise zu Aktualität und Freigabe
  const notes=[];
  if(P.alter>3)notes.push(['r',`Kontostand vom ${fDatU(P.stand)} (vor ${n0(P.alter)} Tagen). ${D.bankAbruf?'Der Bankabruf hat seitdem nichts geliefert, bitte das Protokoll prüfen.':'Der automatische Bankabruf ist noch nicht eingerichtet, die Vorschau beginnt deshalb beim letzten Export.'}`]);
  else P.konten.forEach(k=>{const t=Math.round((P.stand-liqTag(k.saldoDatum))/LIQ_TAG);if(t>3)notes.push(['a',`${esc(k.name||'Konto')} …${esc(k.iban.slice(-6))}: Kontostand vom ${fDatU(k.saldoDatum)} (${esc(k.quelle)}), älter als die übrigen Konten.`]);});
  P.konten.forEach(k=>{if(k.hinweis&&!k.fehler)notes.push(['a',`${esc(k.name||'Konto')} …${esc(k.iban.slice(-6))}: ${esc(k.hinweis)} (${k.abruf?k.abruf.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'—'}).`]);if(k.fehler)notes.push(['r',`${esc(k.name||'Konto')} …${esc(k.iban.slice(-6))}: ${esc(k.fehler)}.`]);else if(k.gueltigBis){const t=Math.round((k.gueltigBis-new Date())/LIQ_TAG);if(t<=14)notes.push(['a',`Die Bankfreigabe für ${esc(k.name||'Konto')} …${esc(k.iban.slice(-6))} endet ${t<0?'ist abgelaufen':'in '+n0(t)+' Tagen'} (${fDatU(k.gueltigBis)}). Im Terminal erneuern: python3 bank_abruf.py verbinden`]);}});
  const sub=`${esc(liqName(bs))} · Start ${fDatU(P.stand)} · ${LIQ_WOCHEN} Wochen bis ${fDatU(w[LIQ_WOCHEN-1].bis)}`;
  h+=`<section class="sec"><div class="sec-h"><h2>Liquiditätsvorschau</h2><span class="sub">${sub}</span></div>`;
  notes.forEach(([c,t])=>{h+=`<div class="note${c==='r'?' r':''}">${t}</div>`;});
  h+='<div class="grid" style="margin-top:12px">';
  h+=`<div class="kpi big"><div class="l">Kontostand</div><div class="v">${eur0(P.start)}</div><div class="s">${P.konten.length>1?P.konten.length+' Konten':'1 Konto'} · Stand ${fDatU(P.stand)}${P.kredit?` · mit Kreditlinie <b>${eur0(P.start+P.kredit)}</b>`:''}</div></div>`;
  h+=`<div class="kpi"><div class="l">Tiefster Stand · ${kwL(P.tief)}</div><div class="v ${P.tief.ende<0?'c-r':P.tief.ende<fix?'c-a':'c-g'}">${eur0(P.tief.ende)}</div><div class="s">${liqStatus(P.tief.ende,fix)} Woche ${fDatU(P.tief.von)} – ${fDatU(P.tief.bis)}</div></div>`;
  h+=`<div class="kpi"><div class="l">In ${LIQ_WOCHEN} Wochen</div><div class="v ${w[LIQ_WOCHEN-1].ende>=P.start?'c-g':'c-r'}">${eur0(w[LIQ_WOCHEN-1].ende)}</div><div class="s">${w[LIQ_WOCHEN-1].ende-P.start>=0?'+':''}${eur0(w[LIQ_WOCHEN-1].ende-P.start)} gegenüber heute</div></div>`;
  h+=`<div class="kpi"><div class="l">Mindestbestand</div><div class="v">${eur0(fix)}</div><div class="s">1 Monat Fixkosten · ${esc(P.fix.det.length?'BWA ohne Abschreibungen':'Auszahlungen ø Monat')}</div></div>`;
  h+='</div>';
  const R=liqReserve(),res=P.start+R.ford+R.offSum;
  h+='<div class="grid" style="margin-top:12px">';
  h+=`<div class="kpi"><div class="l">Offene Forderungen</div><div class="v" style="color:var(--blue)">${eur0(R.ford)}</div><div class="s">${n0(R.nRe)} Rechnungen gestellt, noch nicht bezahlt</div></div>`;
  h+=`<div class="kpi"><div class="l">Erbracht, nicht abgerechnet</div><div class="v c-a">${eur0(R.offSum)}</div><div class="s">Leistungen bis heute ohne Rechnung</div></div>`;
  h+=`<div class="kpi"><div class="l">Liquiditätsreserve</div><div class="v">${eur0(res)}</div><div class="s">Kontostand + Forderungen + Unabgerechnet</div></div>`;
  h+='</div>';
  const plI=Object.values(P.pl||{}),zw=plI.reduce((t,i)=>t+(i.zweifel||0),0),zwN=plI.reduce((t,i)=>t+(i.zweifelN||0),0);
  h+=`<p class="hint">Forderungen, unabgerechnete Leistungen und der Terminkalender stecken in der Wochenvorschau: Rechnungen kommen 28 Tage nach Rechnungsdatum, Leistungen je Rezept: nach dem letzten Termin, dem Abrechnungsabstand und 28 Tagen.${zw?` Nicht eingerechnet sind ${n0(zwN)} überfällige Rechnungen über ${eur0(zw)}: Sie sind oft schon bezahlt und im System nicht ausgebucht, der Abgleich mit der Bank folgt mit der Mahnliste.`:''} Einzelheiten stehen unter dem Wochenverlauf.</p>`;
  h+='<div style="margin-top:14px">'+linienChart(w.map(kwL),[{col:'var(--primary)',vals:w.map(x=>x.ende)},{col:'var(--amber)',vals:w.map(()=>fix),dash:true}].concat(P.kredit?[{col:'var(--red)',vals:w.map(()=>-P.kredit),dash:true}]:[]))+'</div>';
  h+=`<p class="hint">Linie: Kontostand am Wochenende. Gestrichelt: Mindestbestand${P.kredit?' und Grenze der Kreditlinie':''}.</p>`;
  // Wochentabelle
  h+='<div class="tbl-wrap" style="margin-top:6px"><table><thead><tr><th>Woche</th><th>Zeitraum</th><th class="r">Anfang</th><th class="r">Einzahlungen</th><th class="r">Auszahlungen</th><th class="r">Ende</th><th class="r">Abstand zum Mindestbestand</th><th></th></tr></thead><tbody>';
  w.forEach((x,i)=>{h+=`<tr${x===P.tief?' style="background:var(--fill)"':''}><td><b>${kwL(x)}</b>${i===0?' <span class="c-m">(ab '+fDM(liqPlus(P.stand,1))+')</span>':''}</td><td class="c-m">${fDM(x.von)} – ${fDM(x.bis)}</td><td class="r">${eur0(x.anfang)}</td><td class="r c-g">${eur0(x.ein)}</td><td class="r c-r">${eur0(x.aus)}</td><td class="r"><b>${eur0(x.ende)}</b></td><td class="r ${x.ende-fix>=0?'c-g':'c-r'}">${x.ende-fix>=0?'+':''}${eur0(x.ende-fix)}</td><td>${liqStatus(x.ende,fix)}</td></tr>`;});
  const sE=w.reduce((t,x)=>t+x.ein,0),sA=w.reduce((t,x)=>t+x.aus,0);
  h+=`<tr class="sum"><td colspan="3">${LIQ_WOCHEN} Wochen</td><td class="r">${eur0(sE)}</td><td class="r">${eur0(sA)}</td><td class="r">${eur0(w[LIQ_WOCHEN-1].ende)}</td><td colspan="2"></td></tr></tbody></table></div>`;
  h+='</section>';
  h+=R.htmlFord+R.htmlOff;
  // Je Betrieb
  if(bs.length>1){
    const rows=[['KIMOJO'],['PHFIP'],['KIMOJO','PHFIP']].map(b=>({b,p:b.length>1?P:liqPrognose(b)})).filter(x=>x.p);
    h+=`<section class="sec"><div class="sec-h"><h2>Je Betrieb</h2><span class="sub">Gesamt ohne Umbuchungen zwischen den Betrieben</span></div><div class="tbl-wrap"><table><thead><tr><th>Betrieb</th><th class="r">Kontostand</th><th>Stand</th><th class="r">Tiefster Stand</th><th>Woche</th><th class="r">In ${LIQ_WOCHEN} Wochen</th><th class="r">Mindestbestand</th><th></th></tr></thead><tbody>`;
    rows.forEach(({b,p})=>{const nm=b.length>1?'BM Group gesamt':`<span class="site"><span class="dot" style="background:${LIQ_BETRIEB[b[0]].col}"></span>${esc(LIQ_BETRIEB[b[0]].l)}</span>`;h+=`<tr${b.length>1?' class="sum"':''}><td>${nm}</td><td class="r">${eur0(p.start)}</td><td class="c-m">${fDatU(p.stand)}</td><td class="r"><b>${eur0(p.tief.ende)}</b></td><td>${kwL(p.tief)}</td><td class="r">${eur0(p.wochen[LIQ_WOCHEN-1].ende)}</td><td class="r">${eur0(p.fix.wert)}</td><td>${liqStatus(p.tief.ende,p.fix.wert)}</td></tr>`;});
    h+='</tbody></table></div></section>';
  }
  // Zusammensetzung
  const zeile=sd=>P.met.filter(m=>m.sd===sd).sort((a,b)=>Math.abs(b.summe)-Math.abs(a.summe)).map(m=>`<tr><td>${esc(katName(sd,m.kat))}</td><td class="r ${sd==='ein'?'c-g':'c-r'}"><b>${eur0(m.summe)}</b></td><td class="r">${eur0(m.summe/LIQ_WOCHEN)}</td><td class="c-m">${Object.entries(m.art).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).map(([a])=>LIQ_ART[a]).join(', ')}</td></tr>`).join('');
  h+=`<section class="sec"><div class="sec-h"><h2>Woraus die Vorschau besteht</h2><span class="sub">${LIQ_WOCHEN} Wochen je Kategorie</span></div><div class="tbl-wrap"><table><thead><tr><th>Kategorie</th><th class="r">${LIQ_WOCHEN} Wochen</th><th class="r">ø Woche</th><th>Herleitung</th></tr></thead><tbody><tr class="sum"><td colspan="4">Einzahlungen</td></tr>${zeile('ein')}<tr class="sum"><td colspan="4">Auszahlungen</td></tr>${zeile('aus')}</tbody></table></div>`;
  h+=`<p class="hint">Einnahmen aus Behandlungen: noch nicht fällige Rechnungen zum Rechnungsdatum + 28 Tage (überfällige zählen nicht), die thevea-Kassenabrechnung als abgerechnet minus Eingänge von opta data, verteilt auf 30 Tage, je Rezept die erbrachten Einheiten voll und die geplanten und noch nicht terminierten Einheiten mit 90 %, bezahlt nach dem letzten Termin des Rezepts + Abrechnungsabstand + 28 Tage, und für neue Rezepte die Lücke zum Ø der letzten 8 Wochen je Werktag nach der üblichen Restlaufzeit. ${Object.entries(P.pl||{}).map(([b,i])=>`${LIQ_BETRIEB[b].l}: ${n0(i.nRz)} offene Rezepte, davon ${n0(i.nFertig)} fertig und nicht abgerechnet; Abrechnungsabstand ${i.lag} Tage nach dem letzten Termin, Restlaufzeit ${i.rest} Tage, Ø ${eur0(i.hochTag)} je Werktag${i.erbZweifel>0.5?`, ${eur0(i.erbZweifel)} aus Rezepten, die seit über ${LIQ_ZWEIFEL} Tagen fertig sind, nicht eingerechnet`:''}.`).join(' ')} Alle übrigen Zahlungen aus den Bankbuchungen der letzten sechs Monate bis ${fDatU(P.stand)}. Feste Termine: gleicher Zahlungsbeteiligter mindestens dreimal monatlich (neue Verträge: zweimal in Folge mit gleichem Betrag) oder zweimal im Zwei- bis Dreimonatsrhythmus, Betrag als Median der letzten drei Zahlungen. Laufend: Zahler mit mehreren Buchungen je Monat, verteilt auf die Werktage. Alles Übrige als Durchschnitt der letzten 13 Wochen. Nicht fortgeschrieben werden einzelne Auszahlungen ab ${eur0(P.grenze)} (außer Gehältern und Sozialversicherung), Investitionen ohne festen Rhythmus, Umbuchungen zwischen eigenen Konten und Betrieben, Einlagen und Steuererstattungen. Zahlungen an Gesellschafter zählen nur, wenn sie in festem Rhythmus kommen.</p></section>`;
  // Feste Termine
  const TMIN=500,tGross=P.termine.filter(t=>Math.abs(t.b)>=TMIN),tKlein=P.termine.length-tGross.length;
  if(tGross.length){
    const tt=tGross.slice(0,60);
    h+=`<section class="sec"><div class="sec-h"><h2>Erwartete feste Zahlungen</h2><span class="sub">${tGross.length} Termine ab ${eur0(TMIN)} in ${LIQ_WOCHEN} Wochen</span></div><div class="tbl-wrap"><table><thead><tr><th>Datum</th><th>Woche</th><th>Zahlungsbeteiligter</th><th>Kategorie</th><th>Rhythmus</th><th class="r">Betrag</th></tr></thead><tbody>${tt.map(t=>`<tr><td>${fDatU(t.d)}</td><td class="c-m">KW ${liqKW(t.d)}</td><td>${esc(t.name)}</td><td class="c-m">${esc(katName(t.b>0?'ein':'aus',t.kat))}</td><td class="c-m">${t.g===1?'monatlich':t.g===2?'alle 2 Monate':'quartalsweise'}</td><td class="r ${t.b>0?'c-g':'c-r'}"><b>${eur0(t.b)}</b></td></tr>`).join('')}</tbody></table></div><p class="hint">${tGross.length>tt.length?`Die ersten ${tt.length} Termine. `:''}${tKlein?`Dazu ${n0(tKlein)} kleinere feste Zahlungen unter ${eur0(TMIN)} (meist Patienten), zusammen ${eur0(P.termine.filter(t=>Math.abs(t.b)<TMIN).reduce((s,t)=>s+t.b,0))}; sie sind in der Vorschau enthalten.`:''}</p></section>`;
  }
  // Darlehen und Kreditlinie
  const darl=[...new Map(P.termine.filter(t=>t.kat==='darlehen').map(t=>[t.name,t])).values()];
  const bwaFin=bs.map(b=>{const bwa=D[b==='KIMOJO'?'bwaK':'bwaP']||{};const ms=MN.filter(m=>{const x=getBWA(bwa,m);return x&&x.voll&&x.voll.z;}).slice(-3);if(!ms.length)return null;const g=c=>ms.reduce((t,m)=>t+((getBWA(bwa,m).voll.z[c]||{}).ist||0),0)/ms.length;return{b,ms,tilg:g('1670'),zins:-g('1676')};}).filter(Boolean);
  h+=`<section class="sec"><div class="sec-h"><h2>Darlehen und Kreditlinie</h2></div><div class="grid">`;
  h+=`<div class="kpi"><div class="l">Kreditlinie</div><div class="v">${P.kredit?eur0(P.kredit):'—'}</div><div class="s">${P.kredit?'von der Bank gemeldet':'von der Bank nicht übermittelt'}</div></div>`;
  bwaFin.forEach(x=>{h+=`<div class="kpi"><div class="l">Tilgung + Zinsen ø Monat · ${esc(LIQ_BETRIEB[x.b].l)}</div><div class="v">${eur0(x.tilg+Math.abs(x.zins))}</div><div class="s">Tilgung <b>${eur0(x.tilg)}</b> · Zinsen <b>${eur0(Math.abs(x.zins))}</b> · BWA ${esc(x.ms.join(', '))}</div></div>`;});
  h+='</div>';
  if(darl.length)h+=`<div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Darlehen, Leasing</th><th>Rhythmus</th><th>Nächste Fälligkeit</th><th class="r">Rate</th></tr></thead><tbody>${darl.map(t=>`<tr><td>${esc(t.name)}</td><td class="c-m">${t.g===1?'monatlich':t.g===2?'alle 2 Monate':'quartalsweise'}</td><td>${fDatU(t.d)}</td><td class="r c-r"><b>${eur0(t.b)}</b></td></tr>`).join('')}</tbody></table></div>`;
  h+='<p class="hint">Raten aus den wiederkehrenden Bankbuchungen der Kategorie Darlehen, Leasing und Zinsen. Tilgung und Zinsen laut Kapitalflussrechnung der BWA.</p></section>';
  // Einmaleffekte
  if(P.einmal.length)h+=`<section class="sec"><div class="sec-h"><h2>Nicht fortgeschrieben</h2><span class="sub">letzte 13 Wochen · ${P.einmal.length} Buchungen · ${eur0(P.einmal.reduce((t,x)=>t+x.b,0))}</span></div><div class="tbl-wrap"><table><thead><tr><th>Datum</th><th>Zahlungsbeteiligter</th><th>Grund</th><th class="r">Betrag</th></tr></thead><tbody>${P.einmal.slice(0,15).map(x=>`<tr><td>${fDatU(x.d)}</td><td>${esc(x.n||x.t||'—')}</td><td class="c-m">${esc(x.grund)}</td><td class="r ${x.b>0?'c-g':'c-r'}">${eur0(x.b)}</td></tr>`).join('')}</tbody></table></div></section>`;
  // Konten
  const alleK=(D.konten||[]).filter(k=>bs.includes(k.betrieb)||!k.betrieb);
  h+=`<section class="sec"><div class="sec-h"><h2>Konten</h2><span class="sub">${D.bankAbruf&&D.bankAbruf.stand?'letzter Bankabruf '+D.bankAbruf.stand.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'Bankabruf noch nicht eingerichtet'}</span></div><div class="tbl-wrap"><table><thead><tr><th>Konto</th><th>Betrieb</th><th class="r">Kontostand</th><th>Stand</th><th class="r">Kreditlinie</th><th>Quelle</th><th>Freigabe bis</th></tr></thead><tbody>${alleK.map(k=>`<tr><td>${esc(k.name||'Konto')} <span class="c-m">…${esc(k.iban.slice(-6))}</span>${k.bank?'<br><span class="c-m" style="font-size:12px">'+esc(k.bank)+'</span>':''}</td><td>${k.betrieb?esc(LIQ_BETRIEB[k.betrieb].l):'<span class="pill p-a">nicht zugeordnet</span>'}</td><td class="r"><b>${k.saldo==null?'—':eur0(k.saldo)}</b></td><td class="c-m">${fDatU(k.saldoDatum)}</td><td class="r">${k.kreditlinie?eur0(k.kreditlinie):'—'}</td><td class="c-m">${esc(k.quelle)}</td><td class="c-m">${k.gueltigBis?fDatU(k.gueltigBis):'—'}</td></tr>`).join('')}</tbody></table></div>`;
  if(alleK.some(k=>!k.betrieb))h+='<p class="hint">Nicht zugeordnete Konten zählen in keiner Vorschau. Zuordnung über „betriebe“ in ~/.bankabruf/config.json (IBAN → KIMOJO oder PHFIP).</p>';
  h+='</section>';
  return h;
}
function pLiquiditaet(){const bs=liqBetriebe();if(liqPrognose(bs))return liqVorschau();const R=liqReserve();return liqVorschau()+R.htmlFord+R.htmlOff;}

// Forderungen und unabgerechnete Leistungen; die Vorschau zeigt die Summen oben
// und die beiden Tabellen direkt unter dem Wochenverlauf.
function liqReserve(){
  const ents=BANK_ENT.filter(e=>e.sites.some(s=>matchS(s)));
  // Stufe 1: Bank, letzter vorhandener Kontostand
  const bank=ents.map(e=>{const b=D[e.k]||{};const ms=MN.filter(m=>b[m]);const last=ms.length?ms[ms.length-1]:null;return{e,saldo:last?b[last].saldo:0,last,datum:b.voll&&last&&b.voll.monate[last]?b.voll.monate[last].saldoDatum:null};});
  const bankSum=bank.reduce((t,x)=>t+x.saldo,0);const bankStand=bank.map(x=>x.datum).filter(Boolean).sort((a,b)=>b-a)[0];
  // Stufe 2: Forderungen
  const R=D.rechnungen||{byPT:{}};const pts=Object.values(R.byPT||{}).filter(x=>ents.some(e=>e.pre===x.prefix));
  const medifoxFord=pts.reduce((t,x)=>t+x.saldo,0),medifoxN=pts.reduce((t,x)=>t+x.count,0);
  const reOffen={};((D.re&&D.re.rows)||[]).forEach(r=>{if(r.storno||!matchS(r.standort))return;const off=r.brutto-r.bezahlt;if(off<=0.005)return;const a=reOffen[r.artName]||(reOffen[r.artName]={n:0,offen:0});a.n++;a.offen+=off;});
  const tvK=ents.some(e=>e.pre==='KIMOJO')?liqTheveaKassenOffen():{offen:0};if(tvK.offen>0)reOffen['Kassen über opta data (abgerechnet ohne Privatrezepte minus Eingang)']={n:0,offen:tvK.offen};
  const theveaFord=Object.values(reOffen).reduce((t,x)=>t+x.offen,0),theveaN=Object.values(reOffen).reduce((t,x)=>t+x.n,0);
  const ford=medifoxFord+theveaFord;
  // Stufe 3: Unabgerechnet
  const off=liqOffen();const offSum=Object.values(off).reduce((t,x)=>t+x.offen,0);
  const total=bankSum+ford+offSum;
  let h='';
  // II Forderungen
  h+=`<section class="sec"><div class="sec-h"><h2>Offene Forderungen</h2><span class="sub">Medifox-Rechnungsübersicht und thevea-Rechnungen · <a href="theke.html" target="_blank" rel="noopener">Mahnliste der Theke öffnen ↗</a></span></div><div class="tbl-wrap"><table><thead><tr><th>Quelle</th><th>Betrieb</th><th>Art</th><th class="r">Rechnungen</th><th class="r">Offen</th><th style="min-width:110px"></th></tr></thead><tbody>`;
  const mxF=Math.max(...pts.map(x=>x.saldo),...Object.values(reOffen).map(x=>x.offen),1);
  pts.sort((a,b)=>b.saldo-a.saldo).forEach(x=>{const e=BANK_ENT.find(e=>e.pre===x.prefix);h+=`<tr><td class="c-m">Medifox</td><td><span class="site"><span class="dot" style="background:${e.col}"></span>${esc(e.l)}</span></td><td>${esc(x.typ)}</td><td class="r">${n0(x.count)}</td><td class="r"><b>${eur0(x.saldo)}</b></td><td><div class="bar"><i style="width:${x.saldo/mxF*100}%;background:var(--blue)"></i></div></td></tr>`;});
  Object.entries(reOffen).sort((a,b)=>b[1].offen-a[1].offen).forEach(([art,x])=>{h+=`<tr><td class="c-m">thevea</td><td><span class="site"><span class="dot" style="background:var(--primary)"></span>KIMOJO GmbH</span></td><td>${esc(art)}</td><td class="r">${n0(x.n)}</td><td class="r"><b>${eur0(x.offen)}</b></td><td><div class="bar"><i style="width:${x.offen/mxF*100}%;background:var(--blue)"></i></div></td></tr>`;});
  h+=`<tr class="sum"><td colspan="3">Summe</td><td class="r">${n0(medifoxN+theveaN)}</td><td class="r">${eur0(ford)}</td><td></td></tr></tbody></table></div><p class="hint">Medifox: Rechnungen mit offenem Saldo aus der Rechnungsübersicht (Nummern mit „K-“ gehören zu Kitzingen, ohne Präfix zu KIMOJO vor dem Cutover). thevea: nicht stornierte Rechnungen mit Restbetrag (Betrag minus Zahlungseingang). thevea-Kassen: in thevea abgerechnete Verordnungen (ohne Zuzahlung, ohne Privat- und Beihilferezepte, die als Privatrechnung oben stehen) minus Eingänge von opta data auf dem KIMOJO-Konto. Überfällige Rechnungen sind häufig schon bezahlt und nur nicht ausgebucht, in der Vorschau zählen nur noch nicht fällige.</p></section>`;
  const htmlFord=h;h='';
  // III Unabgerechnet
  const offE=Object.entries(off).sort((a,b)=>b[1].offen-a[1].offen);const mxO=Math.max(...offE.map(x=>x[1].offen),1);
  h+=`<section class="sec"><div class="sec-h"><h2>Erbracht, noch nicht abgerechnet</h2><span class="sub">bis heute</span></div><div class="tbl-wrap"><table><thead><tr><th>Standort</th><th class="r">Offen</th><th style="min-width:110px"></th><th>Quelle</th></tr></thead><tbody>${offE.map(([s,x])=>`<tr><td>${siteTag(s)}</td><td class="r"><b>${eur0(x.offen)}</b></td><td><div class="bar"><i style="width:${x.offen/mxO*100}%;background:var(--amber)"></i></div></td><td class="c-m">${esc(x.quelle)}</td></tr>`).join('')}<tr class="sum"><td>Summe</td><td class="r">${eur0(offSum)}</td><td></td><td></td></tr></tbody></table></div><p class="hint">Je Rezept: KIMOJO aus der thevea-Verordnungswert-Prognose (Wert der erbrachten Behandlungen aller noch nicht abgerechneten Rezepte), PF im Park aus Medifox (Einheiten ohne Kennzeichen „Abgerechnet“, Rezept = Patient + Verordnungsdatum; ohne Club, T-RENA, Kurse, Ausfall). Die meisten Rezepte laufen noch und werden erst abgerechnet, wenn sie fertig sind. Rezepte, die seit über 90 Tagen fertig und nicht abgerechnet sind, zählen nicht mit.</p></section>`;
  return{bankSum,ford,offSum,total,nRe:medifoxN+theveaN,htmlFord,htmlOff:h};
}

// ── Jahresvorschau ───────────────────────────────────────────────────────
// Rollierende Planung: abgeschlossene Monate mit Ist (BWA), laufender und
// künftige Monate mit Plan. Der Zeitraumfilter spielt hier keine Rolle, der
// Standortfilter schon. Erbracht ist die Kalendersicht als zweite Ist-Spur.
let fcMode='einnahmen';
function setFC(m){fcMode=m;rPage();}
function vorschauDaten(){
  const now=new Date(),cur=istVorjahr()?12:now.getMonth();
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
  const data=vorschauDaten(),cur=istVorjahr()?12:new Date().getMonth();
  const sum=(k,src)=>data.reduce((s,d)=>s+d[src][k],0);
  const fc={ein:sum('ein','fc'),kosten:sum('kosten','fc'),gewinn:sum('gewinn','fc'),erbracht:sum('erbracht','fc')},pl={ein:sum('ein','plan'),kosten:sum('kosten','plan'),gewinn:sum('gewinn','plan')};
  const istM=data.filter(d=>d.useIst);
  const trend=k=>istM.length?istM.reduce((s,d)=>s+d.fc[k],0)/istM.length*12:null;
  const delta=(ist,plan,inv)=>{if(!plan)return'';const d=(ist-plan)/Math.abs(plan)*100;const ok=inv?d<=0:d>=0;return`<span class="pill ${ok?'p-g':'p-r'}">${d>=0?'+':''}${n1(d)} % zum Plan</span>`;};
  const lastIst=data.reduce((l,d)=>d.useIst?d.i:l,-1);const istBis=lastIst>=0?'Jan – '+MN[lastIst]:'—';const fehlt=data.filter(d=>d.i<cur&&!d.useIst).map(d=>d.m);
  let h=`<section class="sec"><div class="sec-h"><h2>Jahresvorschau ${cockpitJahr()}</h2><span class="sub">Ist ${istBis} (BWA) + Plan ${MN[cur]} – Dez · ${esc(sn(aS))}${fehlt.length?' · BWA fehlt für '+fehlt.join(', ')+' (Plan eingesetzt)':''}</span></div><div class="grid g3">`;
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
  const W=720,H=220,pd={t:22,r:70,b:26,l:56},cw=W-pd.l-pd.r,ch=H-pd.t-pd.b,cur=istVorjahr()?12:new Date().getMonth();
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
  const ymds=[...new Set([...Object.keys(byD),...Object.keys(tag).filter(y=>{const mi=+y.slice(5,7);return getActiveMonths().includes(MN[mi-1])&&y.slice(0,4)==String(cockpitJahr());})])].sort();
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
