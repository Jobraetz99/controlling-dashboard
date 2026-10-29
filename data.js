// data.js — Datenzugriff und Berechnungen des BM-Group-Dashboards.
// Erzeugt aus dashboard.html (Config, Auth, Graph, thevea-Modul, Lader, Parser,
// Plan- und Monatshelfer) plus data_ext.js (MyWellness, Tagesauslastung). Nicht von Hand ändern.

// ═══ CONFIG ═══
const MSAL_CONFIG={auth:{clientId:"9fe9cda7-79c3-4d06-82dc-372715bb8086",authority:"https://login.microsoftonline.com/3e5c8d47-8ccc-42f6-877d-0d0e72972e39",redirectUri:window.location.origin+window.location.pathname.replace(/(neu\/|alt\/)?(index\.html)?$/,'')},cache:{cacheLocation:"sessionStorage"}};
const LR={scopes:["Files.Read","Sites.Read.All"]};
const msal_app=new msal.PublicClientApplication(MSAL_CONFIG);
const SITE=`kimojophysiotherapie.sharepoint.com`,SPATH=`/sites/KIMOJOManagement`;
const PHFIP_SITE={host:'kimojophysiotherapie.sharepoint.com',path:'/sites/PfFiP-TeamPortal'};
const KPI_PHFIP_ID='770759B1-D4F0-48A1-804B-7EB765D00E5F';
const FILES={
  kpi:'a9b8cad6-e1bd-414d-8aaf-503a0e18822f',
  medifoxF1:'7BB83665-B91D-4E99-9FDB-E6CBA0496721',
  medifoxF2:'C7C25E25-8770-4123-B0F0-39B550252905',
  medifoxF3:'C3F9A7D3-452D-4ED5-8C3B-602BB7910A2F',
  medifoxF4:'6230A887-EE13-4FA7-86DA-C1FDBEE62B5F',
  bwaK:'EEE9DBB4-A663-4A58-9E80-0E155B44D938',
  bwaP:'09CE1ACC-AE3C-4A0A-A7B6-FFFE6FB22C04',
  bankK:'65B46DB5-34A8-4D10-9343-B556B19A22D6',
  bankP:'B53B0F06-2604-43E1-A4B5-E204F986C081',
  planK:'FE3CC1BF-F19E-4AD4-8D5C-C8E79756622C',
  planP:'0479CA17-C22A-4A0B-87F2-F11EA7FF9CFD',
  rechnungen:'D8CC52C7-9EE7-4CA1-ABB4-F520769C8078',
  krankenstand:'F0E4C01E-14F3-4FF2-9380-329672BEEEB4'
};
const CC={"KIMOJO Physio":"var(--primary)","KIMOJO Ergo":"var(--accent)","KIMOJO Gesamt":"var(--primary)","PF im Park":"var(--teal)"};
// Schriftkennung für SVG-Beschriftungen — ohne Anführungszeichen, damit sie
// in Attributwerten innerhalb von Template-Literalen keine Quotes bricht.
const SVGF='-apple-system,BlinkMacSystemFont,Inter,sans-serif';
const fm=n=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n);
const fmK=n=>{const a=Math.abs(n);if(a>=1000)return(n<0?'-':'')+Math.round(a/1000).toLocaleString('de-DE')+'k €';return fm(n);};
const sn=s=>s==="Physio und Fitness im Park"?"PF im Park":s;
function matchS(therapistStandort){
  if(aS==='Alle')return true;
  if(aS==='KIMOJO Gesamt')return therapistStandort==='KIMOJO Physio'||therapistStandort==='KIMOJO Ergo';
  return therapistStandort===aS;
}
let driveId,phfipDriveId,aM='YTD',aS='Alle';
let D={bwaK:{},bwaP:{},bankK:{},bankP:{},ctrl:[],raw:[],planK:{},planP:{},auslK:[],auslP:[],
       kenn:null,trackerTage:{physio:[],ergo:[]}};
let selectedAuslKW=0;

// ═══ AUTH ═══
async function signIn(){try{document.getElementById('er').style.display='none';const r=await msal_app.loginPopup(LR);msal_app.setActiveAccount(r.account);await loadAll();}catch(e){document.getElementById('er').textContent=e.message;document.getElementById('er').style.display='block';}}
function signOut(){msal_app.logoutPopup();document.getElementById('db').style.display='none';document.getElementById('lo').style.display='flex';}
async function getToken(){const a=msal_app.getActiveAccount();try{return(await msal_app.acquireTokenSilent({...LR,account:a})).accessToken;}catch(e){return(await msal_app.acquireTokenPopup(LR)).accessToken;}}
msal_app.initialize().then(async()=>{const a=msal_app.getAllAccounts();if(a.length>0){msal_app.setActiveAccount(a[0]);await loadAll();}});

// ═══ API HELPERS ═══
const gql=u=>fetch(u,{headers:{Authorization:'Bearer '+window._token}}).then(r=>r.ok?r.json():null);
async function getSheet(fileId,sheetName){
  const r=await gql(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange`);
  return r?r.values:null;
}
async function getSheetNames(fileId){
  const r=await gql(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}/workbook/worksheets`);
  return r?r.value.map(s=>s.name):[];
}
async function getFileContent(fileId){
  const r=await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}/content`,{headers:{Authorization:'Bearer '+window._token}});
  return r.ok?r.text():null;
}

// ═══ THEVEA UMSATZ ═══════════════════════════════════════════════════════════
// Erbrachter Umsatz aus dem thevea-Kalender für Werneck Physio (_wp) und
// Werneck Ergo (_we). Die Exporte schreibt Power Automate nach
// /12_Code/Patientenchecker/Dateien Export/, die Verordnungswert-Prognose
// samt thevea-Umsatzstatistik nach /12_Code/Controlling/thevea/.
//
// Bewertet wird jeder Patiententermin, jeder Kalender-Slot einzeln (zwei
// 20-Minuten-Termine sind zwei Einheiten). Der Preis kommt in dieser
// Reihenfolge:
//   1. thevea-eigener Wert je Einheit aus der Verordnungswert-Prognose
//      (wertErbrachteBehandlungen ÷ erbrachte Einheiten). Das ist der echte
//      Preis dieser Verordnung — auch für Privat, Beihilfe und BG, und mit der
//      Hausbesuchspauschale, die thevea dort schon mitrechnet.
//   2. Heilmittel direkt am Termin (erweiterter Export) → GKV-Preisliste 2026,
//      plus Hausbesuchspauschale je Besuch.
//   3. Heilmittel aus der Verordnungsübersicht → GKV-Preisliste.
//   4. Standardsatz Krankengymnastik. Wird gezählt und ausgewiesen, damit
//      sichtbar bleibt, wie viel der Zahl auf Annahme beruht.
// Ohne Verordnung ist der Termin eine Reservierung: 20 Min = KG, 30 Min =
// MLD-30, 45 Min = MLD-45 aus der GKV-Liste; andere Längen als Vielfache
// von 20 Min KG (40 Min = zwei KG). Fehlt die Endzeit (alter Export), gelten 20 Minuten.
// Status: STATTGEFUNDEN = erbracht; ohne Status = offen und zählt mit
// Planwert; AUSGEFALLEN/ABGESAGT = Ausfallrechnung in Höhe des
// Heilmittelwerts. SonstigerTermin (Blocker, Pausen, Kurse) zählt nicht.
// Ab dem Cutover ersetzt thevea die Medifox-Zeilen von KIMOJO; davor bleibt
// Medifox die Quelle.
const TV_DIR='/12_Code/Patientenchecker/Dateien Export/';
const TV_PROG_DIR='/12_Code/Controlling/thevea/';
const TV_LOCS=[
  {suf:'wp',standort:'KIMOJO Physio',cutover:'2026-07-27',prog:'thevea-physio-',hb:{weg:22.78,heim:13.09}},
  {suf:'we',standort:'KIMOJO Ergo',  cutover:'2026-08-01',prog:'thevea-ergo-',  hb:{weg:28.69,heim:18.71}}
];
// Wie viele Monatsdateien der Prognose geladen werden. Jede Datei kennt nur
// die zu ihrem Zeitpunkt laufenden Rezepte; zusammen decken sie auch die
// inzwischen abgeschlossenen ab. Neuere Datei gewinnt bei gleicher VO.
const TV_PROG_MONATE=8;
// GKV-Preisliste Physio ab 01.01.2026, Ergo ab 01.07.2026 — dieselben Sätze
// wie im Patientenchecker (werneck.html, HB_PREISE). Reihenfolge entscheidet:
// Das allgemeine KG steht zuletzt, sonst schluckt es KG-Gerät und KG-ZNS.
const TV_GKV=[
  [/zns|bobath|vojta|pnf/i,                   47.06],
  [/(mld|lymphdrainage)[\s\S]*?\b60\b/i,      71.94],
  [/(mld|lymphdrainage)[\s\S]*?\b45\b/i,      53.94],
  [/mld|lymphdrainage/i,                      35.97],
  [/manuelle\s*therapie|\bmt\b/i,             35.59],
  [/bewegungsbad/i,                           33.87],
  [/\bgruppe\b/i,                              8.43],
  [/traktion/i,                                8.63],
  [/hirnleistung|neuropsycholog|\bhlt\b/i,    59.27],
  [/psychisch[\s-]*funktionell|\bpfb\b/i,     98.79],
  [/sensomotorisch|\bspb\b/i,                 79.03],
  [/motorisch[\s-]*funktionell|\bmfb\b/i,     59.27],
  [/ger(ä|ae)t|\bkgg\b/i,                     55.81],
  [/erstbefund|diagnostik/i,                  36.61],
  [/warmpack/i,                               16.16],
  [/hei(ß|ss)e\s*rolle/i,                     13.47],
  [/wärme|heißluft/i,                          7.43],
  [/krankengymnastik|\bkg\b|blanko/i,         29.63]
];
const TV_STANDARD=29.63;
const TV_ABGESAGT=/ABGESAGT|ABSAGE|STORN|AUSGEFALLEN|ENTFALLEN|NICHT.?ERSCHIENEN|CANCEL/i;
// Eine Reservierung ist ein Patiententermin ohne Rezept — aber nur bei
// jemandem, der behandelt. Club-Trainer:innen tragen Einweisungen und
// Beratungen ebenfalls als Patiententermin ohne Rezept ein; das sind keine
// freigehaltenen Behandlungsplätze. Als Behandler:in gilt, wer im
// Historienfenster mindestens so viele Termine mit Verordnung hat.
const TV_BEHANDLER_MIN=10;
function tvGkvPreis(txt){const t=String(txt||'');for(const[re,p]of TV_GKV)if(re.test(t))return p;return null;}
function tvReservPreis(min){
  if(!(min>0))min=20;
  if(min<=20)return 29.63;
  if(min===30)return 35.97;
  if(min===45)return 53.94;
  return Math.ceil(min/20)*29.63;
}
function tvNorm(s){return String(s||'').replace(/ß/g,'ss').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
// thevea nennt „Angelina Schmitt", die Team-Tabelle „Schmitt, Angie". Gleicher
// Nachname und gleicher Vornamen-Anfang reichen, wenn der Treffer eindeutig
// ist; sonst bleibt der thevea-Name stehen und der Therapeut erscheint ohne
// Stundenbezug.
function tvCtrlName(vn,nn,ctrl){
  const key=String(nn||'').trim()+', '+String(vn||'').trim();
  const nnN=tvNorm(nn),vnN=tvNorm(vn);
  // Das Ergo-Konto in thevea kürzt Nachnamen auf die Initiale („B., Tabea");
  // dann entscheidet der Vorname und der Anfangsbuchstabe des Nachnamens.
  const initial=/^[a-z]\.$/.test(nnN)?nnN.charAt(0):null;
  const hits=(ctrl||[]).filter(t=>{
    const m=String(t.n||'').split(',');if(m.length<2)return false;
    const cn=tvNorm(m[0]),cv=tvNorm(m[1]);
    if(initial)return cn.charAt(0)===initial&&cv===vnN;
    if(cn!==nnN)return false;
    return cv.slice(0,3)===vnN.slice(0,3);
  });
  return hits.length===1?hits[0].n:key;
}
// Der Name, unter dem eine Person überall erscheint, ist der aus dem Export:
// „Schmitt, Angelina", so wie thevea sie führt. Nur wo thevea den Nachnamen auf
// die Initiale kürzt („B., Tabea", Ergo-Konto), hilft der Weekly Tracker mit dem
// vollen Namen aus — wenn er eindeutig ist.
function tvKanon(vn,nn,ctrl){
  if(/^[a-z]\.$/.test(tvNorm(nn)))return tvCtrlName(vn,nn,ctrl);
  return String(nn||'').trim()+', '+String(vn||'').trim();
}
function tvWoche(d){
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dn=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-dn+3);
  const fw=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  return 1+Math.round(((t-fw)/864e5-3+(fw.getUTCDay()+6)%7)/7);
}
function tvVoMap(ueb){
  const m={};const nodes=ueb&&ueb.data&&ueb.data.verordnungUebersicht&&ueb.data.verordnungUebersicht.nodes||[];
  nodes.forEach(n=>{if(n&&n.id!=null)m[n.id]=n;});return m;
}
function tvDetMap(det){
  const m={};(Array.isArray(det)?det:(det?[det]:[])).forEach(ch=>{const d=ch&&ch.data;if(!d)return;
    Object.keys(d).forEach(k=>{const v=d[k];if(v&&typeof v==='object'&&v.id!=null)m[v.id]=v;});});
  return m;
}
function tvProgMap(files){
  const m={};
  (files||[]).forEach(f=>{
    const nodes=f&&f.prognose&&f.prognose.data&&f.prognose.data.verordnungswertPrognoseStatistik&&f.prognose.data.verordnungswertPrognoseStatistik.nodes||[];
    nodes.forEach(n=>{
      const e=+n.behandlungseinheitenErbracht||0,g=+n.behandlungseinheitenGesamt||0;
      let u=null;
      if(e>0)u=parseFloat(n.wertErbrachteBehandlungen)/e;
      else if(g>0)u=parseFloat(n.erwarteterGesamtwert)/g;
      if(u!=null&&isFinite(u)&&u>0)m[n.verordnungId]={unit:u,hm:n.heilmittel||''};
    });
  });
  return m;
}
function tvStatAgg(){return{n:0,erbracht:0,offen:0,ausfall:0,reserviert:0,gesamt:0,nErbracht:0,nOffen:0,nAusfall:0,nReserviert:0,nThevea:0,nGkv:0,nGeschaetzt:0};}
function tvBerechne(loc,hist,voUeb,voDet,prog,ctrl,jahr){
  const termine=hist&&hist.data&&hist.data.termine||(Array.isArray(hist)?hist:[]);
  const cut=new Date(loc.cutover+'T00:00:00');
  const rows=[],stat={},hbSeen={},personen={};
  const voJe={};termine.forEach(t=>{if(t&&t.__typename==='PatientenTermin'&&t.terminVerordnung&&t.terminVerordnung.id!=null){const id=t.mitarbeiter&&t.mitarbeiter.person&&t.mitarbeiter.person.id;voJe[id]=(voJe[id]||0)+1;}});
  termine.forEach(t=>{
    if(!t||t.__typename!=='PatientenTermin')return;
    const d=new Date(t.from);if(isNaN(d)||d<cut||d.getFullYear()!==jahr)return;
    const month=d.getMonth()+1;
    let durMin=null;if(t.until){const u=new Date(t.until);if(!isNaN(u))durMin=Math.round((u-d)/6e4);}
    const st=String(t.status||'');
    const p=t.mitarbeiter&&t.mitarbeiter.person||{};
    const vo=t.terminVerordnung;
    let kind,price,quelle,hm;
    if(!vo||vo.id==null){
      if((voJe[p.id]||0)<TV_BEHANDLER_MIN){
        // Kein Behandler: Termin ohne Rezept wird nicht bewertet, nur gezählt.
        const s0=stat[month]||(stat[month]=tvStatAgg());s0.nUngewertet=(s0.nUngewertet||0)+1;return;
      }
      kind='reserviert';price=tvReservPreis(durMin);quelle='reserviert';hm='Reservierung '+(durMin>0?durMin:20)+' Min';
    }else{
      kind=TV_ABGESAGT.test(st)?'ausfall':st==='STATTGEFUNDEN'?'erbracht':'offen';
      // Der erweiterte Export liefert die Heilmittel der Verordnung als Liste
      // (z. B. MT und Wärme auf einem Rezept). Welches davon der Slot ist, sagt
      // thevea nicht; bewertet wird das erste, die Beschriftung nennt alle.
      const pr=prog[vo.id],ueb=voUeb[vo.id];
      const hmL=Array.isArray(vo.heilmittel)?vo.heilmittel.filter(Boolean):(vo.heilmittel?[vo.heilmittel]:[]);
      const hmT=hmL[0]||null;
      hm=(hmL.length?hmL.map(h=>h.abkuerzung||h.name||'').filter(Boolean).join(';'):'')||(ueb&&ueb.heilmittel)||(pr&&pr.hm)||'';
      if(pr){price=pr.unit;quelle='thevea';}
      else{
        const g=tvGkvPreis(hmT?(hmT.abkuerzung||hmT.name):hm);
        if(g!=null){price=g;quelle='gkv';}else{price=TV_STANDARD;quelle='geschaetzt';}
        // Hausbesuchspauschale je Besuch: Patient, Tag, Therapeut — einmal,
        // auch wenn im Besuch zwei Leistungen stehen. Ohne Angabe, ob Heim
        // oder Wohnung, gilt der niedrigere Heim-Satz.
        const hb=hmL.some(h=>h&&h.hausbesuch)||t.patientenTerminArt==='HAUSBESUCH'||!!(voDet[vo.id]&&voDet[vo.id].hausbesuch);
        if(hb){const k=t.patientId+'|'+d.toDateString()+'|'+p.id;if(!hbSeen[k]){hbSeen[k]=1;price+=loc.hb.heim;}}
      }
    }
    const s=stat[month]||(stat[month]=tvStatAgg());
    s.n++;s.gesamt+=price;s[kind]+=price;s['n'+kind.charAt(0).toUpperCase()+kind.slice(1)]++;
    if(quelle==='thevea')s.nThevea++;else if(quelle==='gkv')s.nGkv++;else if(quelle==='geschaetzt')s.nGeschaetzt++;
    // Der Ergo-Export führt (noch) keinen Mitarbeiter am Termin; die Zeile
    // bleibt dann dem Standort zugeordnet, nur ohne Therapeut.
    const name=(p.vorname||p.nachname)?tvKanon(p.vorname,p.nachname,ctrl):loc.standort+' · ohne Therapeut';
    if(p.id!=null&&!personen[p.id])personen[p.id]={id:p.id,vn:p.vorname||'',nn:p.nachname||'',name,standort:loc.standort,suf:loc.suf};
    rows.push({name,maId:p.id,month,week:tvWoche(d),price,billed:true,
      wd:(d.getDay()+6)%7,startMin:d.getHours()*60+d.getMinutes(),durMin:durMin>0?durMin:20,
      dateKey:d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(),filiale:'KIMOJO',standort:loc.standort,
      src:'thevea',kind,quelle,hm:hm||'—',status:st,datum:d});
  });
  return{rows,stat,personen};
}
// Standortfilter für Umsatzzeilen: thevea-Zeilen kennen ihren Standort,
// Medifox-Zeilen nur den Namen, der über die Team-Tabelle zugeordnet wird.
function tvRowPasst(r,theraNames){
  if(aS==='Alle')return true;
  if(r.standort)return matchS(r.standort);
  // Medifox ist seit dem Cutover nur noch Kitzingen: PHFIP-Zeilen gehören zu
  // PF im Park, egal wie die Teams-Tabelle die Person führt. Alte
  // KIMOJO-Zeilen (vor dem Cutover) laufen weiter über den Namen.
  if(r.filiale==='PHFIP')return matchS('PF im Park');
  if(aS==='PF im Park')return false;
  return theraNames.has(r.name)||aS==='KIMOJO Gesamt';
}
async function tvLaden(){
  const jahr=cockpitJahr();
  const j=new Date(),monate=[];
  for(let i=TV_PROG_MONATE-1;i>=0;i--){const d=new Date(j.getFullYear(),j.getMonth()-i,1);monate.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
  const L=f=>loadJSONPfad(f).catch(()=>null);
  D.thevea={rows:[],stat:{},statistik:{},fehlt:[],ok:false,bis:null,medifoxEntfernt:0,personen:{}};
  const az={},abwes={};const f4P=L(TV_AZ_F4_VOLL).then(v=>Array.isArray(v)&&v.length?v:L(TV_AZ_F4));
  const [uebAlt,uebWp]=await Promise.all([L(TV_DIR+'Verordnungsuebersicht.json'),L(TV_DIR+'vo_uebersicht_wp.json')]);
  for(const loc of TV_LOCS){
    let [hist,uebLoc,det,...progs]=await Promise.all([
      L(TV_DIR+'termine_historie_'+loc.suf+'.json'),
      loc.suf==='wp'?Promise.resolve(uebWp||uebAlt):L(TV_DIR+'vo_uebersicht_'+loc.suf+'.json'),
      L(TV_DIR+'verordnung_details_'+loc.suf+'.json'),
      ...monate.map(m=>L(TV_PROG_DIR+loc.prog+m+'.json'))
    ]);
    az[loc.suf]=await L(TV_DIR+'arbeitszeiten_roh_'+loc.suf+'.json');
    // Monatsarchiv (Flow „Cockpit Monatsarchiv“): Termine, die aus dem
    // 180-Tage-Fenster von thevea gefallen sind, und frühere Arbeitszeit-
    // Datensätze. Solange ein Termin im Live-Export liegt, gilt die Live-Fassung;
    // ein archivierter Termin im Live-Zeitraum, der live fehlt, wurde gelöscht.
    const arch=typeof tvArchivLaden==='function'?await tvArchivLaden(loc.suf).catch(()=>null):null;
    if(arch&&arch.termine.length){
      const live=(hist&&hist.data&&hist.data.termine)||[];const liveIds=new Set(live.map(t=>t&&t.id));
      const ab=live.reduce((x,t)=>t&&t.from&&(!x||t.from<x)?t.from:x,null);
      const m=new Map();arch.termine.forEach(t=>{if(t&&t.id!=null&&(!ab||t.from<ab||liveIds.has(t.id)))m.set(t.id,t);});
      live.forEach(t=>{if(t&&t.id!=null)m.set(t.id,t);});
      hist={data:{termine:[...m.values()]}};D.thevea.archiv=(D.thevea.archiv||0)+arch.termine.length;
    }
    if(arch&&arch.az.length){
      const m=new Map();arch.az.forEach(r=>{if(r&&r.id!=null)m.set(r.id,Object.assign({},r,{isCurrentlyValid:false}));});
      (az[loc.suf]||[]).forEach(r=>{if(r&&r.id!=null)m.set(r.id,r);});az[loc.suf]=[...m.values()];
    }
    abwes[loc.suf]=(await L(TV_DIR+'abwesenheiten_historie_'+loc.suf+'.json'))||(await L(TV_DIR+'abwesenheiten_roh_'+loc.suf+'.json'))||[];
    if(!hist){D.thevea.fehlt.push('termine_historie_'+loc.suf+'.json');continue;}
    const r=tvBerechne(loc,hist,tvVoMap(uebLoc),tvDetMap(det),tvProgMap(progs),D.ctrl,jahr);
    try{const rv=tvBerechne(loc,hist,tvVoMap(uebLoc),tvDetMap(det),tvProgMap(progs),D.ctrl,jahr-1);D.thevea.rowsVJ=(D.thevea.rowsVJ||[]).concat(rv.rows);}catch(e){}
    D.thevea.rows=D.thevea.rows.concat(r.rows);D.thevea.stat[loc.standort]=r.stat;Object.assign(D.thevea.personen,r.personen);
    // thevea-eigene Umsatzstatistik des jeweiligen Monats als Gegenprobe.
    progs.forEach((f,i)=>{
      const n=f&&f.umsatzAktuellerMonat&&f.umsatzAktuellerMonat.data&&f.umsatzAktuellerMonat.data.umsatzstatistikMitarbeiterBehandlungen&&f.umsatzAktuellerMonat.data.umsatzstatistikMitarbeiterBehandlungen.nodes;
      if(!n)return;
      D.thevea.statistik[loc.standort+'|'+monate[i]]={brutto:n.reduce((s,x)=>s+(parseFloat(x.umsatzBrutto)||0),0),beh:n.reduce((s,x)=>s+(x.anzahlBehandlungen||0),0),stand:f.stand||''};
    });
  }
  const f4=await f4P;
  // Kitzinger Club-/T-RENA-/Präventionszeilen aus den Umsätzen nehmen; der
  // Kitzingen-Block zeigt sie nur noch als Hinweis.
  const extra=r=>r.src!=='thevea'&&String(r.filiale||'')==='PHFIP'&&tvIstKurs(r);
  D.thevea.kitzExtra=D.raw.filter(extra);D.raw=D.raw.filter(r=>!extra(r));
  // Vorjahr für den Vergleich: gleiche Regeln (ohne Kurse, KIMOJO-Medifox nur bis
  // zum Cutover) plus die thevea-Zeilen des Vorjahres aus Live-Export und Archiv.
  {const cutV=new Date(TV_LOCS[0].cutover+'T00:00:00');D.rawVJ=(D.rawVJ||[]).filter(r=>!extra(r)).filter(r=>{if(r.src==='thevea')return false;if(!String(r.filiale||'').startsWith('KIMOJO')||!r.dateKey)return true;const q=r.dateKey.split('-');return new Date(+q[0],+q[1]-1,+q[2])<cutV;}).concat(D.thevea.rowsVJ||[]);}
  if(!D.thevea.rows.length){try{tvStammdaten(jahr,az,f4,abwes);}catch(e){console.warn('Stammdaten:',e);}return;}
  const cut=new Date(TV_LOCS[0].cutover+'T00:00:00');
  const vorher=D.raw.length;
  D.raw=D.raw.filter(r=>{
    if(r.src==='thevea')return false;
    if(!String(r.filiale||'').startsWith('KIMOJO')||!r.dateKey)return true;
    const p=r.dateKey.split('-');return new Date(+p[0],+p[1]-1,+p[2])<cut;
  });
  D.thevea.medifoxEntfernt=vorher-D.raw.length;
  D.raw=D.raw.concat(D.thevea.rows);
  D.thevea.bis=D.thevea.rows.filter(r=>r.kind==='erbracht').reduce((m,r)=>r.datum>m?r.datum:m,null);
  D.thevea.ok=true;
  try{tvStammdaten(jahr,az,f4,abwes);}catch(e){console.warn('Stammdaten:',e);}
  console.log('thevea:',D.thevea.rows.length,'Termine bewertet,',D.thevea.medifoxEntfernt,'Medifox-Zeilen ab Cutover ersetzt');
}
// ── Stammdaten aus den Exporten ──────────────────────────────────────────────
// Namen, Standort und Arbeitszeiten kommen aus thevea (Werneck) und Medifox
// (Kitzingen). Der Weekly Tracker bleibt Rückfall: für Monate, die kein Export
// abdeckt, und für die Planwerte je Person. Damit Medifox-Zeilen aus der Zeit
// vor dem Cutover („Schmitt, Angie") und thevea-Zeilen („Schmitt, Angelina")
// an derselben Person hängen, werden Tracker-Namen auf den Exportnamen
// umgeschrieben; der alte Name bleibt als `plan` für die Plan-Suche erhalten.
const TV_AZ_F4='/12_Code/Controlling/auslastung_historie_f4.json';
const TV_AZ_F4_VOLL='/12_Code/Controlling/auslastung_historie_f4_voll.json';
// ── Soll- und Anwesenheitsstunden ──────────────────────────────────────────
// Vertragsstunde = geplante Arbeitszeit laut Wochentagsmuster an den
// Kalendertagen des Monats, Feiertage (Bayern) abgezogen. Anwesende Stunde =
// Vertragsstunde minus Urlaub, Krankheit, Fortbildung und Sonstiges.
function tvYmd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function tvOstern(j){const a=j%19,b=Math.floor(j/100),c=j%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),ta=((h+l-7*m+114)%31)+1;return new Date(j,mo-1,ta);}
function tvFeiertage(j){
  const f=new Set();
  [j,j+1].forEach(y=>{['01-01','01-06','05-01','08-15','10-03','11-01','12-25','12-26'].forEach(x=>f.add(y+'-'+x));
    const o=tvOstern(y);[-2,1,39,50,60].forEach(n=>{const d=new Date(o);d.setDate(o.getDate()+n);f.add(tvYmd(d));});});
  return f;
}
const TV_WD=['SONNTAG','MONTAG','DIENSTAG','MITTWOCH','DONNERSTAG','FREITAG','SAMSTAG'];
function tvR1(x){return Math.round(x*10)/10;}
// Jahr, das das Cockpit gerade zeigt (Jahresauswahl in app.js: var aJ); ohne
// Auswahl (alte Ansicht) das laufende Kalenderjahr.
function cockpitJahr(){return(typeof aJ!=='undefined'&&aJ)?+aJ:new Date().getFullYear();}
// Stunden eines Monats: aus thevea/Medifox (t.std), sonst Tracker-Wochenstunden × 4,33.
// Ein- und Austritt (t.ab/t.bis, aus dem ersten/letzten Termin in tvStammdaten):
// Monate ganz davor bzw. danach haben kein Soll, der Ein-/Austrittsmonat zählt
// bei Tracker-Stunden anteilig nach Arbeitstagen.
function tvArbeitstage(j,mi,von,bis){const f=tvFeiertage(j),n=new Date(j,mi,0).getDate();let c=0;for(let d=1;d<=n;d++){const dt=new Date(j,mi-1,d),y=tvYmd(dt);if(dt.getDay()===0||dt.getDay()===6||f.has(y))continue;if(von&&y<von)continue;if(bis&&y>bis)continue;c++;}return c;}
function tvStdMonat(t,m){
  const j=cockpitJahr(),mi=MN.indexOf(m)+1,ym=j+'-'+String(mi).padStart(2,'0');
  if(t.ab&&t.ab.slice(0,7)>ym)return{soll:0,anw:0,q:'vorEintritt'};
  if(t.bis&&t.bis.slice(0,7)<ym)return{soll:0,anw:0,q:'nachAustritt'};
  if(t.std&&t.std[m])return t.std[m];
  const wh=(t.mh&&t.mh[m])||t.wh||0;let f=1;
  if(t.ab&&t.ab.slice(0,7)===ym||t.bis&&t.bis.slice(0,7)===ym){const alle=tvArbeitstage(j,mi);f=alle?tvArbeitstage(j,mi,t.ab&&t.ab.slice(0,7)===ym?t.ab:null,t.bis&&t.bis.slice(0,7)===ym?t.bis:null)/alle:1;}
  return{soll:tvR1(wh*4.33*f),anw:tvR1(wh*4.33*f),q:'tracker'};
}
function tvStdSumme(t,months){
  let soll=0,anw=0,tracker=false;
  months.forEach(m=>{const s=tvStdMonat(t,m);soll+=s.soll;anw+=s.anw;if(s.q==='tracker')tracker=true;});
  return{soll:tvR1(soll),anw:tvR1(anw),tracker};
}
function tvSpanMin(a,b){const x=String(a||'').split(':'),y=String(b||'').split(':');return(+y[0]*60+(+y[1]||0))-(+x[0]*60+(+x[1]||0));}
function tvWochenStd(rec){return(rec&&rec.zeitspannen||[]).reduce((s,z)=>s+Math.max(0,tvSpanMin(z.from,z.until)),0)/60;}
// Händische Korrekturen der thevea-Arbeitszeiten. thevea führt Personen mit
// wechselndem freien Tag mit beiden Tagen als Arbeitstag. Die Regel nimmt je
// Kalenderwoche einen der Tage heraus: gerade KW der erste, ungerade KW der
// zweite Tag. Schlüssel = Name wie im Export, klein geschrieben.
const TV_FREI_WECHSEL={'lommel, paulina':['MONTAG','FREITAG']};
function tvFreiWechsel(name){return TV_FREI_WECHSEL[tvNorm(name)]||null;}
// Welcher der beiden Wechseltage in der Woche von dt frei ist: Der Tag mit
// Terminen ist Arbeitstag; sonst gilt ein Tag mit eingetragener Abwesenheit
// (Krankheit, Urlaub) als Arbeitstag; erst wenn beides nichts entscheidet,
// wechselt es nach Kalenderwoche (gerade KW erster Tag frei, ungerade zweiter).
function tvFreierTag(fw,dt,terminTage,abw){
  const mo=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()-((dt.getDay()+6)%7));
  const tagVon=wd=>{const i=TV_WD.indexOf(wd);const d=new Date(mo);d.setDate(mo.getDate()+((i+6)%7));return tvYmd(d);};
  const score=y=>(terminTage&&terminTage.has(y)?2:0)+((abw||[]).some(a=>String(a.from)<=y&&String(a.until)>=y)?1:0);
  const s0=score(tagVon(fw[0])),s1=score(tagVon(fw[1]));
  if(s0>s1)return fw[1];if(s1>s0)return fw[0];
  return fw[tvWoche(dt)%2];
}
function tvWochenStdK(rec,name){
  const w=tvWochenStd(rec),k=tvFreiWechsel(name);if(!k)return w;
  const tag=wd=>(rec&&rec.zeitspannen||[]).filter(z=>z.wochentag===wd).reduce((s,z)=>s+Math.max(0,tvSpanMin(z.from,z.until)),0)/60;
  return w-(tag(k[0])+tag(k[1]))/2;
}
function tvGiltIm(rec,jahr,mi){
  const a=new Date(jahr,mi-1,1),e=new Date(jahr,mi,0,23,59,59);
  const vf=rec.validFrom?new Date(rec.validFrom+'T00:00:00'):null,vu=rec.validUntil?new Date(rec.validUntil+'T23:59:59'):null;
  return(!vf||vf<=e)&&(!vu||vu>=a);
}
function tvStammdaten(jahr,az,f4,abwes){
  abwes=abwes||{};const feier=tvFeiertage(jahr);
  const ctrl=D.ctrl||[];
  // Der Tracker schreibt manche Namen als „Vorname Nachname“ statt
  // „Nachname, Vorname“; beide Formen gelten als dieselbe Person.
  // Namenswechsel (Heirat): Tracker-Name → Name in Medifox/thevea.
  const TV_ALIAS={'mundloch, gernot':'schönfelder, gernot'};
  const kanonN=n=>{let x=String(n||'').trim();if(!x.includes(',')){const i=x.lastIndexOf(' ');if(i>0)x=x.slice(i+1)+', '+x.slice(0,i);}const k=tvNorm(x);return tvNorm(TV_ALIAS[k]||k);};
  const findCtrl=n=>ctrl.find(t=>kanonN(t.n)===kanonN(n));
  const r1=x=>Math.round(x*10)/10;
  // 1. Tracker-Namen auf Exportnamen umschreiben
  const alias={};
  Object.values(D.thevea.personen||{}).forEach(p=>{
    if(/^[a-z]\.$/.test(tvNorm(p.nn)))return;
    const c=tvCtrlName(p.vn,p.nn,ctrl);
    if(c!==p.name&&findCtrl(c))alias[c]=p.name;
  });
  ctrl.forEach(t=>{if(alias[t.n]){t.plan=t.plan||t.n;t.n=alias[t.n];}});
  (D.raw||[]).forEach(r=>{if(r.src!=='thevea'&&alias[r.name])r.name=alias[r.name];});
  // Erster Termin je Person (für Neuzugänge, siehe unten).
  const erster={};(D.thevea.rows||[]).forEach(r=>{const d=r.datum?tvYmd(r.datum):null;if(d&&(!erster[r.name]||d<erster[r.name]))erster[r.name]=d;});
  // Erster und letzter Termin über alle Quellen (Medifox und thevea).
  const tvRowYmd=r=>{if(r.datum)return tvYmd(r.datum);if(r.dateKey){const q=String(r.dateKey).split('-');if(q.length===3)return q[0]+'-'+q[1].padStart(2,'0')+'-'+q[2].padStart(2,'0');}return null;};
  const ersteAll={},letzteAll={},zukunft={};const h0=tvYmd(new Date());let datenAb=null;
  (D.raw||[]).forEach(r=>{const d=tvRowYmd(r);if(!d||!d.startsWith(jahr+'-'))return;if(!datenAb||d<datenAb)datenAb=d;if(!ersteAll[r.name]||d<ersteAll[r.name])ersteAll[r.name]=d;if(d>h0)zukunft[r.name]=true;else if(!letzteAll[r.name]||d>letzteAll[r.name])letzteAll[r.name]=d;});
  const ersteAllP=name=>{const A=String(name||'').split(','),nn=tvNorm(A[0]),vn=tvNorm(A.slice(1).join(','));let best=null;Object.keys(ersteAll).forEach(n=>{const B=String(n).split(','),bn=tvNorm(B[0]),bv=tvNorm(B.slice(1).join(','));const ok=n===name||(bn===nn&&bv.slice(0,3)===vn.slice(0,3))||((/^[a-z]\.$/.test(nn)||/^[a-z]\.$/.test(bn))&&nn.charAt(0)===bn.charAt(0)&&vn.split(' ')[0]===bv.split(' ')[0]);if(ok&&(!best||ersteAll[n]<best))best=ersteAll[n];});return best;};
  // 2. Arbeitszeiten aus thevea (Werneck)
  Object.values(D.thevea.personen||{}).forEach(p=>{
    const recs=(az[p.suf]||[]).filter(r=>r&&r.personId===p.id);if(!recs.length)return;
    let t=findCtrl(p.name);
    // Kitzinger Personal steht in thevea nur mit einem Platzhalter-Eintrag.
    if(t&&t.s&&!/^KIMOJO/.test(t.s))return;
    if(!t){t={n:p.name,s:p.standort,b:p.standort==='KIMOJO Ergo'?'Ergo':'Physio',wh:0,mh:{},quelle:'thevea'};ctrl.push(t);}
    t.mh=t.mh||{};t.std=t.std||{};
    const abw=(abwes[p.suf]||[]).filter(a=>a&&a.personId===p.id);
    const terminTage=new Set((D.thevea.rows||[]).filter(r=>r.name===p.name&&r.datum&&r.kind!=='reserviert').map(r=>tvYmd(r.datum)));
    const ersterStart=recs.map(x=>String(x.validFrom||'')).filter(Boolean).sort()[0]||'';
    for(let mi=1;mi<=12;mi++){
      let recsM=recs.filter(x=>tvGiltIm(x,jahr,mi)).sort((a,b)=>String(b.validFrom||'').localeCompare(String(a.validFrom||'')));
      // Monate vor dem ersten Datensatz: Wer da schon Termine hatte, arbeitete
      // nach demselben Muster – thevea exportiert nur die aktuellen Datensätze.
      if(!recsM.length){const letzterTag=tvYmd(new Date(jahr,mi,0));if(!(erster[p.name]&&erster[p.name]<=letzterTag))continue;recsM=[recs.slice().sort((a,b)=>String(a.validFrom||'').localeCompare(String(b.validFrom||'')))[0]];}
      t.mh[MN[mi-1]]=r1(tvWochenStdK(recsM[0],p.name));
      const tage=new Date(jahr,mi,0).getDate();let soll=0,anw=0;
      for(let d=1;d<=tage;d++){
        const dt=new Date(jahr,mi-1,d),ymd=tvYmd(dt);if(feier.has(ymd))continue;
        // Tage vor dem ersten Arbeitszeit-Datensatz zählen nur, wenn die Person
        // damals schon Termine hatte (Datensatz wurde später neu angelegt);
        // sonst ist es ein Neuzugang und die Tage davor sind keine Vertragszeit.
        let rec=recs.filter(x=>(!x.validFrom||String(x.validFrom)<=ymd)&&(!x.validUntil||String(x.validUntil)>=ymd)).sort((a,b)=>String(b.validFrom||'').localeCompare(String(a.validFrom||'')))[0];
        if(!rec){const eAll=ersteAllP(p.name);const seit=erster[p.name]&&eAll&&mi>=+erster[p.name].slice(5,7)?eAll:erster[p.name];if(ymd<ersterStart&&!(seit&&seit<=ymd))continue;rec=recsM[0];}
        const wd=TV_WD[dt.getDay()];
        let min=(rec.zeitspannen||[]).filter(z=>z.wochentag===wd).reduce((s,z)=>s+Math.max(0,tvSpanMin(z.from,z.until)),0);
        const fw=tvFreiWechsel(p.name);if(fw&&min&&fw.includes(wd)&&wd===tvFreierTag(fw,dt,terminTage,abw))min=0;
        if(!min)continue;soll+=min;
        const ab=abw.find(a=>String(a.from)<=ymd&&String(a.until)>=ymd),da=!ab;if(da)anw+=min;
        (t.tag=t.tag||{})[ymd]={soll:min,anw:da?min:0,grund:ab?String(ab.abwesenheitGrund||'SONSTIGES'):null};
      }
      t.std[MN[mi-1]]={soll:r1(soll/60),anw:r1(anw/60),q:'thevea'};
    }
    const cur=recs.find(r=>r.isCurrentlyValid)||recs[0];t.wh=r1(tvWochenStdK(cur,p.name));t.azQuelle='thevea';
    // Gültiger Arbeitszeit-Datensatz = noch beschäftigt (z. B. Elternzeit, langer Urlaub).
    const heuteY=tvYmd(new Date());if(recs.some(r=>r.isCurrentlyValid&&(!r.validUntil||String(r.validUntil)>=heuteY))||abw.some(a=>String(a.until)>=heuteY))t.aktivAz=true;
  });
  // 3. Arbeitszeiten aus Medifox (Kitzingen): Soll-Wochenstunden aus dem
  //    Wochentagsmuster der Tagesdaten. Je Monat und Wochentag gilt die
  //    häufigste geplante Arbeitszeit (Abwesenheitstage tragen das Soll
  //    weiterhin), die Summe über Mo–So ist die Vertragswoche – dieselbe
  //    Logik wie bei thevea, Urlaub drückt die Stunden nicht.
  const muster={},tage={},hist={},histTage=new Set();
  (Array.isArray(f4)?f4:[]).forEach(day=>{
    const d=String(day&&day.onDay||'');if(!d.startsWith(jahr+'-'))return;const mi=+d.slice(5,7);
    const wd=new Date(d+'T12:00:00').getDay();
    (tage[mi]=tage[mi]||new Set()).add(d);histTage.add(d);
    const gesehen=new Set();
    (day.spalten||[]).forEach(s=>{
      if(!s)return;
      const n=String(s.Nachname||'').trim()+', '+String(s.Vorname||'').trim();if(/club/i.test(n))return;
      const min=(s.Arbeitszeiten||[]).reduce((a,z)=>a+Math.max(0,tvSpanMin(z.Start,z.Ende)),0);
      const m=(muster[n]=muster[n]||{});const mm=(m[mi]=m[mi]||{});const w=(mm[wd]=mm[wd]||[]);
      w.push(min);gesehen.add(n);
      (hist[n]=hist[n]||{})[d]={min,abw:!!s.IstAbwesend,grund:s.IstAbwesend?(/krank/i.test(String(s.Abwesenheitsbezeichnung||''))?'KRANKHEIT':/urlaub/i.test(String(s.Abwesenheitsbezeichnung||''))?'URLAUB':/fortbild/i.test(String(s.Abwesenheitsbezeichnung||''))?'FORTBILDUNG':'SONSTIGES'):null};
    });
    // Wer an diesem Tag keine Spalte hat, arbeitet an diesem Wochentag nicht.
    Object.keys(muster).forEach(n=>{if(gesehen.has(n))return;const mm=(muster[n][mi]=muster[n][mi]||{});(mm[wd]=mm[wd]||[]).push(0);});
  });
  const modus=arr=>{const c={};arr.forEach(v=>{c[v]=(c[v]||0)+1;});return +Object.keys(c).sort((a,b)=>c[b]-c[a]||b-a)[0];};
  // Mindestens drei Wochen Daten, sonst ist das Muster nicht belastbar.
  const voll=mi=>(tage[mi]&&tage[mi].size>=15);
  Object.keys(muster).forEach(n=>{
    let t=findCtrl(n);
    if(!t){t={n,s:'PF im Park',b:'Physio',wh:0,mh:{},quelle:'medifox'};ctrl.push(t);}
    if(t.n!==n){t.plan=t.plan||t.n;t.n=n;}
    // Wer im Medifox-Plan von Kitzingen steht, arbeitet in Kitzingen – auch
    // wenn die Teams-Tabelle die Person noch bei KIMOJO führt.
    if(t.azQuelle!=='thevea')t.s='PF im Park';
    t.mh=t.mh||{};
    const ks=Object.keys(muster[n]).map(Number).filter(voll).sort((a,b)=>b-a);
    if(!ks.length)return;
    let letzte=0;
    ks.forEach(mi=>{
      const mm=muster[n][mi];let soll=0;
      for(let wd=0;wd<7;wd++){if(mm[wd]&&mm[wd].length)soll+=modus(mm[wd]);}
      t.mh[MN[mi-1]]=r1(soll/60);if(!letzte)letzte=t.mh[MN[mi-1]];
    });
    if(letzte)t.wh=letzte;
    t.azQuelle=t.azQuelle?t.azQuelle+'+medifox':'medifox';
    // Monatsstunden: Tage aus der Historie zählen mit ihrem Plan und ihrer
    // Abwesenheit, fehlende Tage (Rest des laufenden Monats) mit dem
    // Wochentagsmuster als anwesend.
    t.std=t.std||{};
    const musterMon=mi=>{const ks2=Object.keys(muster[n]).map(Number).filter(voll).filter(x=>x<=mi).sort((a,b)=>b-a);return ks2.length?muster[n][ks2[0]]:null;};
    Object.keys(muster[n]).map(Number).forEach(mi=>{
      const mm=musterMon(mi)||muster[n][mi];const tageM=new Date(jahr,mi,0).getDate();let soll=0,anw=0,ist=0;
      for(let d=1;d<=tageM;d++){
        const dt=new Date(jahr,mi-1,d),ymd=tvYmd(dt);
        if(histTage.has(ymd)){const h=(hist[n]||{})[ymd];if(!h||!h.min)continue;soll+=h.min;ist++;if(!h.abw)anw+=h.min;(t.tag=t.tag||{})[ymd]={soll:h.min,anw:h.abw?0:h.min,grund:h.grund};continue;}
        if(feier.has(ymd))continue;
        const w=mm&&mm[dt.getDay()];if(!w||!w.length)continue;const min=modus(w);if(!min)continue;soll+=min;anw+=min;(t.tag=t.tag||{})[ymd]={soll:min,anw:min};
      }
      if(soll>0)t.std[MN[mi-1]]={soll:r1(soll/60),anw:r1(anw/60),q:'medifox'};
    });
  });
  // 4. Ein- und Austritt: Wer erst nach den ersten zwei Wochen der Daten den
  //    ersten Termin hat, ist unterjährig eingestiegen; wer seit vier Wochen
  //    keinen Termin und auch keinen künftigen hat, ist ausgeschieden.
  const grenzeAb=datenAb?tvYmd(new Date(new Date(datenAb+'T12:00:00').getTime()+14*864e5)):null;
  const grenzeBis=tvYmd(new Date(Date.now()-28*864e5));
  // Namen aus Medifox („Berlet, Tabea“, „Schmitt, Angie“) und thevea („B., Tabea“,
  // „Schmitt, Angelina“) gelten als dieselbe Person bei gleichem Nachnamen und
  // gleichem Vornamen-Anfang bzw. bei Initiale plus gleichem Vornamen.
  const teile=n=>{const x=String(n||'').split(',');return{nn:tvNorm(x[0]),vn:tvNorm(x.slice(1).join(','))};};
  const gleich=(a,b)=>{if(a===b)return true;const A=teile(a),B=teile(b);if(!A.vn||!B.vn)return false;const ia=/^[a-z]\.$/.test(A.nn),ib=/^[a-z]\.$/.test(B.nn);if(ia||ib)return A.nn.charAt(0)===B.nn.charAt(0)&&A.vn.split(' ')[0]===B.vn.split(' ')[0];return A.nn===B.nn&&A.vn.slice(0,3)===B.vn.slice(0,3);};
  const namen=Object.keys(ersteAll);
  ctrl.forEach(t=>{
    let a=null,b=null,zk=false;
    namen.forEach(n=>{if(!gleich(n,t.n))return;if(!a||ersteAll[n]<a)a=ersteAll[n];if(letzteAll[n]&&(!b||letzteAll[n]>b))b=letzteAll[n];if(zukunft[n])zk=true;});
    t.ab=a&&grenzeAb&&a>grenzeAb?a:null;
    t.bis=b&&!zk&&!t.aktivAz&&b<grenzeBis?b:null;
  });
  D.ctrl=ctrl;
  D.thevea.stammdaten={aliase:Object.keys(alias).length,thevea:ctrl.filter(t=>/thevea/.test(t.azQuelle||'')).length,medifox:ctrl.filter(t=>/medifox/.test(t.azQuelle||'')).length,neu:ctrl.filter(t=>t.quelle).length};
}
function tvHeroSub(filtered,theraNames){
  const tv=filtered.filter(r=>r.src==='thevea'&&tvRowPasst(r,theraNames));
  if(!tv.length)return `<div class="hk-sub">${aM} · aus Praxissoftware</div>`;
  // Oben steht der volle Kalenderwert des Zeitraums. Darunter nur die eine
  // Frage, die dazu zählt: Wie viel davon liegt schon hinter uns, wie viel
  // steht noch im Kalender? Geteilt wird nach Termindatum; Medifox-Zeilen
  // sind immer Vergangenheit. Die feinere Aufteilung (Status, Ausfall,
  // Reservierung) steht im Abschnitt „Umsatz erbracht · thevea-Kalender".
  const jetzt=new Date();let erbracht=0,zukunft=0;
  filtered.forEach(r=>{if(!tvRowPasst(r,theraNames))return;if(r.src==='thevea'&&r.datum>jetzt)zukunft+=r.price;else erbracht+=r.price;});
  const med=filtered.some(r=>r.src!=='thevea'&&tvRowPasst(r,theraNames));
  return `<div class="hk-sub">${aM} · thevea-Kalender${med?' + Medifox':''}</div>`
    +`<div class="hk-sub" style="margin-top:3px">davon ${fm(erbracht)} bereits erbracht · ${fm(zukunft)} in der Zukunft</div>`;
}
function rTV(){
  const el=document.getElementById('tvDiv');if(!el)return;
  const hinweis=t=>'<div class="cd"><p style="font-size:12.5px;color:var(--muted);margin:0">'+t+'</p></div>';
  if(!D.thevea||!D.thevea.ok){el.innerHTML=hinweis('Keine thevea-Historie geladen'+(D.thevea&&D.thevea.fehlt.length?' (fehlt: '+D.thevea.fehlt.join(', ')+')':'')+'.');return;}
  const months=getActiveMonths();const monthNums=months.map(m=>MN.indexOf(m)+1);
  if(aS==='PF im Park'){el.innerHTML=tvKitzingen(months,monthNums)||hinweis('Keine Medifox-Umsätze für PF im Park im gewählten Zeitraum.');return;}
  const theraNames=new Set(D.ctrl.filter(t=>matchS(t.s)).map(t=>t.n));
  const rows=D.thevea.rows.filter(r=>monthNums.includes(r.month)&&tvRowPasst(r,theraNames));
  if(!rows.length){el.innerHTML=hinweis('Keine thevea-Termine im gewählten Zeitraum.')+(aS==='Alle'?tvKitzingen(months,monthNums):'');return;}
  const agg=()=>({n:0,erbracht:0,offen:0,ausfall:0,reserviert:0,gesamt:0,ng:0,nAusfall:0,nReserviert:0});
  const add=(a,r)=>{a.n++;a[r.kind]+=r.price;a.gesamt+=r.price;if(r.quelle==='geschaetzt')a.ng++;if(r.kind==='ausfall')a.nAusfall++;if(r.kind==='reserviert')a.nReserviert++;};
  const byM={},byT={},byH={},tot=agg();
  rows.forEach(r=>{
    add(byM[r.month]||(byM[r.month]=agg()),r);add(tot,r);
    add(byT[r.name]||(byT[r.name]=Object.assign(agg(),{standort:r.standort})),r);
    const h=byH[r.hm]||(byH[r.hm]={n:0,sum:0});h.n++;h.sum+=r.price;
  });
  const jahr=new Date().getFullYear();
  const statistik=mi=>{const ym=jahr+'-'+String(mi).padStart(2,'0');let b=0,has=false;
    TV_LOCS.forEach(l=>{if(!matchS(l.standort))return;const s=D.thevea.statistik[l.standort+'|'+ym];if(s){b+=s.brutto;has=true;}});return has?b:null;};
  let h='<div class="tc"><div class="thd"><h3>Nach Monat</h3><div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<span class="hdr-badge">Jeder Kalender-Slot einzeln</span><span class="hdr-badge">ohne Status = Planwert</span><span class="hdr-badge">Ausfall = Heilmittelwert</span>'
    +(D.thevea.bis?'<span class="hdr-badge">Stattgefunden bis '+D.thevea.bis.toLocaleDateString('de-DE')+'</span>':'')+'</div></div>';
  h+='<table><thead><tr><th>Monat</th><th class="r">Termine</th><th class="r">Stattgefunden</th><th class="r">Ohne Status</th><th class="r">Ausfall</th><th class="r">Reserviert</th><th class="r">Gesamt</th><th class="r">thevea-Abrechnung</th><th class="r">Standardsatz</th></tr></thead><tbody>';
  const zeile=(label,a,st,bold)=>`<tr${bold?' style="font-weight:700"':''}><td>${label}</td><td class="r">${a.n}</td><td class="r">${fm(a.erbracht)}</td><td class="r">${fm(a.offen)}</td><td class="r">${fm(a.ausfall)}<span style="color:var(--faint)"> (${a.nAusfall})</span></td><td class="r">${fm(a.reserviert)}<span style="color:var(--faint)"> (${a.nReserviert})</span></td><td class="r"><b>${fm(a.gesamt)}</b></td><td class="r">${st!=null?fm(st):'—'}</td><td class="r"${a.ng?' style="color:var(--amber)"':''}>${a.ng}</td></tr>`;
  let stSum=0,stHas=false;
  monthNums.forEach(mi=>{const a=byM[mi];if(!a)return;const st=statistik(mi);if(st!=null){stSum+=st;stHas=true;}h+=zeile(MN[mi-1],a,st,false);});
  h+=zeile('Summe',tot,stHas?stSum:null,true)+'</tbody></table>';
  let ungew=0;TV_LOCS.forEach(l=>{if(!matchS(l.standort))return;const st=D.thevea.stat[l.standort]||{};monthNums.forEach(mi=>{ungew+=(st[mi]&&st[mi].nUngewertet)||0;});});
  if(ungew)h+='<p style="font-size:11.5px;color:var(--faint);margin:10px 0 0">'+ungew+' Patiententermine ohne Rezept bei Personen, die nicht behandeln (z. B. Club-Einweisungen, Beratungen), sind nicht als Reservierung gewertet.</p>';
  h+='<p style="font-size:11.5px;color:var(--faint);margin:10px 0 0">„thevea-Abrechnung" ist die Umsatzstatistik brutto aus thevea selbst (Controlling/thevea, Monatsdatei) — sie zählt nur Einheiten, die thevea schon als abgerechnet führt, und liegt deshalb unter dem Kalenderwert; der Kalender zählt jeden Slot, so wie thevea ihn später auch abrechnet. Die Spalte „Standardsatz" nennt Termine, deren Preis weder thevea noch die GKV-Liste kannte.</p></div>';
  // Therapeuten
  const tl=Object.keys(byT).map(n=>Object.assign({name:n},byT[n])).sort((a,b)=>b.gesamt-a.gesamt);
  h+='<div class="tc"><div class="thd"><h3>Nach Therapeut:in</h3><span class="hdr-badge">'+months.join(', ')+'</span></div>';
  h+='<table><thead><tr><th>Therapeut:in</th><th>Standort</th><th class="r">Termine</th><th class="r">Stattgefunden</th><th class="r">Ohne Status</th><th class="r">Ausfall</th><th class="r">Reserviert</th><th class="r">Gesamt</th></tr></thead><tbody>';
  tl.forEach(t=>{h+=`<tr><td>${t.name}</td><td style="color:var(--muted)">${t.standort}</td><td class="r">${t.n}</td><td class="r">${fm(t.erbracht)}</td><td class="r">${fm(t.offen)}</td><td class="r">${fm(t.ausfall)}</td><td class="r">${fm(t.reserviert)}</td><td class="r"><b>${fm(t.gesamt)}</b></td></tr>`;});
  h+='</tbody></table></div>';
  // Heilmittel
  const hl=Object.keys(byH).map(k=>({hm:k,n:byH[k].n,sum:byH[k].sum})).sort((a,b)=>b.sum-a.sum);
  h+='<div class="tc"><div class="thd"><h3>Nach Heilmittel</h3><span class="hdr-badge">'+hl.length+' Positionen</span></div>';
  h+='<table><thead><tr><th>Heilmittel</th><th class="r">Termine</th><th class="r">ø je Termin</th><th class="r">Gesamt</th></tr></thead><tbody>';
  hl.slice(0,25).forEach(x=>{h+=`<tr><td style="white-space:normal;max-width:520px">${x.hm}</td><td class="r">${x.n}</td><td class="r">${fm(x.sum/x.n)}</td><td class="r"><b>${fm(x.sum)}</b></td></tr>`;});
  if(hl.length>25)h+=`<tr><td colspan="4" style="color:var(--faint)">… ${hl.length-25} weitere Positionen</td></tr>`;
  h+='</tbody></table></div>';
  h+='<div class="cd"><div class="ct">So wird gerechnet</div><p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin:0">'
    +'<b>Preis je Termin:</b> zuerst der Wert, den thevea selbst für diese Verordnung ausweist (Verordnungswert-Prognose, inklusive Privat-, Beihilfe- und BG-Sätzen und Hausbesuchspauschale); sonst das Heilmittel nach der GKV-Preisliste 2026 plus Hausbesuchspauschale je Besuch; zuletzt der Standardsatz Krankengymnastik. '
    +'<b>Reservierungen</b> sind Patiententermine ohne Verordnung bei Behandler:innen (mindestens '+TV_BEHANDLER_MIN+' Termine mit Rezept im Zeitfenster; Club-Einweisungen und Beratungen zählen damit nicht): 20 Min = KG 29,63 €, 30 Min = MLD-30 35,97 €, 45 Min = MLD-45 53,94 €, andere Längen als Vielfache von 20 Min KG (40 Min = zwei KG). '
    +'<b>Blocker</b> und andere interne Einträge zählen nicht. <b>Ab 27.07.2026</b> (Ergo 01.08.) ersetzt der thevea-Kalender die Medifox-Exporte für KIMOJO; PF im Park bleibt Medifox.</p></div>';
  if(aS==='Alle')h+=tvKitzingen(months,monthNums);
  el.innerHTML=h;
}
// ── Kitzingen (PF im Park) ───────────────────────────────────────────────────
// PF im Park läuft weiter über Medifox. Der Block zeigt dieselbe Sicht wie für
// Werneck: je Monat und je Mitarbeiter:in. Der Kraft-Präventionskurs zu 120 €
// wird herausgerechnet, weil er kein Behandlungsumsatz ist, sondern ein
// Kursentgelt; er wird daneben als eigene Zahl gezeigt, damit nichts
// stillschweigend verschwindet. Erkannt wird er am Leistungstext, nicht am
// Preis — ein Preis kann sich ändern, der Name des Kurses nicht.
// Kitzingen: Club-Mitgliedschaften, T-RENA-Gruppentraining und Präventionskurse
// sind kein Therapieumsatz und bleiben überall außen vor (auch die
// Sammelspalte „Club, PhFiP" im Medifox-Export).
const TV_KURS=/pr(ä|ae)vention|club|t-?rena/i;
function tvIstKurs(r){return TV_KURS.test(String(r.leistung||''))||TV_KURS.test(String(r.name||''));}
function tvKitzingen(months,monthNums){
  const alle=D.raw.filter(r=>r.src!=='thevea'&&String(r.filiale||'')==='PHFIP'&&monthNums.includes(r.month)).concat((D.thevea.kitzExtra||[]).filter(r=>monthNums.includes(r.month)));
  if(!alle.length)return '';
  const agg=()=>({n:0,sum:0,nKurs:0,kurs:0});
  const add=(a,r)=>{if(tvIstKurs(r)){a.nKurs++;a.kurs+=r.price;}else{a.n++;a.sum+=r.price;}};
  const byM={},byT={},byL={},tot=agg();
  alle.forEach(r=>{add(byM[r.month]||(byM[r.month]=agg()),r);add(tot,r);add(byT[r.name]||(byT[r.name]=agg()),r);
    if(!tvIstKurs(r)){const l=byL[r.leistung||'—']||(byL[r.leistung||'—']={n:0,sum:0});l.n++;l.sum+=r.price;}});
  const z=(label,a,bold)=>`<tr${bold?' style="font-weight:700"':''}><td>${label}</td><td class="r">${a.n}</td><td class="r"><b>${fm(a.sum)}</b></td><td class="r">${a.n?fm(a.sum/a.n):'—'}</td><td class="r" style="color:var(--faint)">${a.nKurs?a.nKurs+' · '+fm(a.kurs):'—'}</td></tr>`;
  let h='<div class="st" style="margin-top:32px">🏋️ Kitzingen · PF im Park · Medifox</div>';
  h+='<div class="tc"><div class="thd"><h3>Nach Monat</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="hdr-badge">ohne Club, T-RENA und Präventionskurse</span><span class="hdr-badge">'+months.join(', ')+'</span></div></div>';
  h+='<table><thead><tr><th>Monat</th><th class="r">Behandlungen</th><th class="r">Umsatz</th><th class="r">ø je Behandlung</th><th class="r">Club / T-RENA / Prävention (nicht enthalten)</th></tr></thead><tbody>';
  monthNums.forEach(mi=>{const a=byM[mi];if(a)h+=z(MN[mi-1],a,false);});
  h+=z('Summe',tot,true)+'</tbody></table></div>';
  const tl=Object.keys(byT).map(n=>Object.assign({name:n},byT[n])).sort((a,b)=>b.sum-a.sum);
  h+='<div class="tc"><div class="thd"><h3>Nach Mitarbeiter:in</h3><span class="hdr-badge">'+tl.length+' Personen</span></div>';
  h+='<table><thead><tr><th>Mitarbeiter:in</th><th class="r">Behandlungen</th><th class="r">Umsatz</th><th class="r">ø je Behandlung</th><th class="r">Club / T-RENA / Prävention (nicht enthalten)</th></tr></thead><tbody>';
  tl.forEach(t=>{h+=z(t.name,t,false);});
  h+=z('Summe',tot,true)+'</tbody></table></div>';
  const ll=Object.keys(byL).map(k=>({l:k,n:byL[k].n,sum:byL[k].sum})).sort((a,b)=>b.sum-a.sum);
  h+='<div class="tc"><div class="thd"><h3>Nach Leistung</h3><span class="hdr-badge">'+ll.length+' Positionen</span></div>';
  h+='<table><thead><tr><th>Leistung</th><th class="r">Behandlungen</th><th class="r">ø je Behandlung</th><th class="r">Umsatz</th></tr></thead><tbody>';
  ll.slice(0,25).forEach(x=>{h+=`<tr><td style="white-space:normal;max-width:520px">${x.l}</td><td class="r">${x.n}</td><td class="r">${fm(x.sum/x.n)}</td><td class="r"><b>${fm(x.sum)}</b></td></tr>`;});
  if(ll.length>25)h+=`<tr><td colspan="4" style="color:var(--faint)">… ${ll.length-25} weitere Positionen</td></tr>`;
  h+='</tbody></table></div>';
  return h;
}
// ═══ /THEVEA UMSATZ ══════════════════════════════════════════════════════════

// ═══ LOAD ALL DATA ═══
async function loadAll(){
  const ld=document.getElementById('ld'),lt=document.getElementById('lt');
  ld.classList.remove('h');document.getElementById('lo').style.display='none';
  try{
    lt.textContent='Verbinde...';window._token=await getToken();
    const site=await gql(`https://graph.microsoft.com/v1.0/sites/${SITE}:${SPATH}`);
    const drive=await gql(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive`);
    driveId=drive.id;
    // Resolve PHFIP drive
    try{const pSite=await gql(`https://graph.microsoft.com/v1.0/sites/${PHFIP_SITE.host}:${PHFIP_SITE.path}`);if(pSite){const pDrive=await gql(`https://graph.microsoft.com/v1.0/sites/${pSite.id}/drive`);if(pDrive)phfipDriveId=pDrive.id;}}catch(e){console.warn('PHFIP site:',e);}

    lt.textContent='Suche Dateien für '+cockpitJahr()+'...';await dateienAufJahrStellen();
    lt.textContent='Lade alle Daten parallel...';

    // ═══ PARALLEL LOADING ═══
    // Group 1: BWA sheets (need sheet names first, but both can run parallel)
    const bwaKSheetsP=getSheetNames(FILES.bwaK);
    const bwaPSheetsP=getSheetNames(FILES.bwaP);

    // Group 2: Direct sheet loads (known sheet names — no getSheetNames needed)
    const ctrlP=getSheet(FILES.kpi,'Teams');
    const medifoxP=[
      {file:FILES.medifoxF1,filiale:'KIMOJO #1'},
      {file:FILES.medifoxF2,filiale:'KIMOJO #2'},
      {file:FILES.medifoxF3,filiale:'KIMOJO #3'},
      {file:FILES.medifoxF4,filiale:'PHFIP'}
    ].map(m=>getSheet(m.file,'Export').then(d=>({d,filiale:m.filiale})).catch(()=>({d:null,filiale:m.filiale})));

    // Group 3: Bank data (parallel)
    const bankKP=loadBank(FILES.bankK);
    const bankPP=loadBank(FILES.bankP);

    // Group 4: Plan data (known sheet names)
    const planDashKP=getSheet(FILES.planK,'Dashboard '+cockpitJahr()).then(r=>r||getSheet(FILES.planK,'Dashboard')).catch(()=>null);
    const planEinKP=getSheet(FILES.planK,'Planeinnahmen').catch(()=>null);
    const planKSheetsP=getSheetNames(FILES.planK).catch(()=>[]);
    const planDashPP=getSheet(FILES.planP,'Dashboard').catch(()=>null);
    const planEinPP=getSheet(FILES.planP,'Planeinnahmen').catch(()=>null);
    const planPSheetsP=getSheetNames(FILES.planP).catch(()=>[]);

    // Group 5: Auslastung (parallel)
    const auslKP=gql(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${FILES.kpi}/workbook/worksheets('Auslastung')/usedRange`).catch(()=>null);
    const auslPP=phfipDriveId&&D.kpiPhfipId?gql(`https://graph.microsoft.com/v1.0/drives/${phfipDriveId}/items/${D.kpiPhfipId}/workbook/worksheets('Auslastung')/usedRange`).catch(()=>null):Promise.resolve(null);

    // Group 5b: Termine (KIMOJO Physio + Ergo + PHFIP Physio)
    const termineKPhysioP=getSheet(FILES.kpi,'KIMOJO KPI Physio').catch(()=>null);
    const termineKErgoP=getSheet(FILES.kpi,'KIMOJO KPI Ergo').then(r=>r||getSheet(FILES.kpi,'KIMOJO KPI E')).catch(()=>null);
    const terminePPhysioP=phfipDriveId&&D.kpiPhfipId?gql(`https://graph.microsoft.com/v1.0/drives/${phfipDriveId}/items/${D.kpiPhfipId}/workbook/worksheets('PhFiP KPI Physio')/usedRange`).then(r=>r?r.values:null).catch(()=>null):Promise.resolve(null);

    // Group 6: Rechnungsübersicht
    const rechnungenP=getSheetNames(FILES.rechnungen).then(sheets=>getSheet(FILES.rechnungen,sheets[0]||'Tabelle1')).catch(()=>null);

    // Group 7: Krankenstand (both sheets in parallel)
    const krankenstandP=getSheet(FILES.krankenstand,'Export').catch(()=>null);
    const krankenstandTWP=getSheet(FILES.krankenstand,'TageWoche').catch(()=>null);

    // ═══ AWAIT ALL ═══
    lt.textContent='Verarbeite BWA...';
    const [bwaKSheets,bwaPSheets]=await Promise.all([bwaKSheetsP,bwaPSheetsP]);

    // BWA sheets need sequential loading per entity (same workbook session)
    D.bwaK={};
    const bwaKLoads=bwaKSheets.map(s=>getSheet(FILES.bwaK,s).then(d=>({s,d})).catch(()=>({s,d:null})));
    const bwaKResults=await Promise.all(bwaKLoads);
    bwaKResults.forEach(({s,d})=>{if(d)D.bwaK[s]=parseBWA(d);});

    D.bwaP={};
    const bwaPLoads=bwaPSheets.map(s=>getSheet(FILES.bwaP,s).then(d=>({s,d})).catch(()=>({s,d:null})));
    const bwaPResults=await Promise.all(bwaPLoads);
    bwaPResults.forEach(({s,d})=>{if(d)D.bwaP[s]=parseBWA(d);});

    lt.textContent='Verarbeite Umsatzdaten...';
    // Bank
    const [bankK,bankP]=await Promise.all([bankKP,bankPP]);
    D.bankK=bankK||{};D.bankP=bankP||{};
    try{await bankKontenAufbauen();}catch(e){console.warn('Bankkonten:',e);D.konten=D.konten||[];}

    // Therapeuten
    const ctrl=await ctrlP;
    if(ctrl)D.ctrl=parseCtrl(ctrl);

    // Medifox parallel
    const medifoxResults=await Promise.all(medifoxP);
    let allRaw=[];
    medifoxResults.forEach(({d,filiale})=>{
      if(d){const parsed=parseRaw(d);parsed.forEach(r=>r.filiale=filiale);allRaw=allRaw.concat(parsed);}
    });
    if(allRaw.length>0){D.rawVJ=allRaw.filter(r=>r.year===cockpitJahr()-1);D.raw=allRaw.filter(r=>!r.year||r.year===cockpitJahr());}
    else{
      // Fallback: KPI Excel
      try{const raw=await getSheet(FILES.kpi,'Rohdaten Umsatz');if(raw){D.raw=parseRaw(raw);D.raw.forEach(r=>r.filiale='KIMOJO');}}catch(e){}
    }

    lt.textContent='Lade thevea-Kalender...';
    try{await tvLaden();}catch(e){console.warn('thevea:',e);}
    lt.textContent='Lade Abrechnung...';
    try{await abgLaden();}catch(e){console.warn('Abgerechnet:',e);D.abg={rows:[],stand:{}};}
    try{await reLaden();}catch(e){console.warn('Rechnungen:',e);D.re={rows:[],stand:{}};}

    lt.textContent='Verarbeite Planungen...';
    // Plan KIMOJO
    try{
      const planDashK=await planDashKP;
      if(planDashK)D.planK.dashboard=parsePlanDashboard(planDashK);
      const planEinK=await planEinKP;
      if(planEinK)D.planK.einnahmen=parsePlanEinnahmen(planEinK);
      const planKSheets=await planKSheetsP;
      const planAusKName=(planKSheets||[]).find(s=>s.trim().toLowerCase()==='planausgaben');
      if(planAusKName){const planAusK=await getSheet(FILES.planK,planAusKName);if(planAusK)D.planK.ausgaben=parsePlanAusgaben(planAusK);}
    }catch(e){console.warn('Plan KIMOJO:',e);}

    // Plan PHFIP
    try{
      const planDashP=await planDashPP;
      if(planDashP)D.planP.dashboard=parsePlanDashboard(planDashP);
      const planEinP=await planEinPP;
      if(planEinP)D.planP.einnahmen=parsePlanEinnahmenPHFIP(planEinP);
      const planPSheets=await planPSheetsP;
      const planAusPName=(planPSheets||[]).find(s=>s.trim().toLowerCase()==='planausgaben');
      if(planAusPName){const planAusP=await getSheet(FILES.planP,planAusPName);if(planAusP)D.planP.ausgaben=parsePlanAusgaben(planAusP);}
    }catch(e){console.warn('Plan PHFIP:',e);}

    // Auslastung
    const auslKR=await auslKP;
    if(auslKR&&auslKR.values)D.auslK=parseAuslastungSheet(auslKR.values);
    const auslPR=await auslPP;
    if(auslPR&&auslPR.values)D.auslP=parseAuslastungSheet(auslPR.values);

    // Termine
    D.termine={kPhysio:[],kErgo:[],pPhysio:[]};
    const tKP=await termineKPhysioP;if(tKP)D.termine.kPhysio=parseTermine(tKP);
    const tKE=await termineKErgoP;if(tKE)D.termine.kErgo=parseTermine(tKE);
    const tPP=await terminePPhysioP;if(tPP)D.termine.pPhysio=parseTermine(tPP);

    // Rechnungsübersicht
    const rechnungenData=await rechnungenP;
    D.rechnungen=rechnungenAgg(await mrZusammen(rechnungenData));if(false){
    if(rechnungenData&&rechnungenData.length>1){
      for(let i=1;i<rechnungenData.length;i++){
        const r=rechnungenData[i];if(!r)continue;
        const saldo=parseFloat(r[17])||0;
        if(saldo===0)continue;
        const typ=String(r[6]||'Unbekannt');
        const nr=String(r[0]||'');
        const prefix=nr.startsWith('K-')?'KIMOJO':'PHFIP';
        D.rechnungen.total+=saldo;D.rechnungen.count++;
        if(!D.rechnungen.byType[typ])D.rechnungen.byType[typ]={count:0,saldo:0};
        D.rechnungen.byType[typ].count++;D.rechnungen.byType[typ].saldo+=saldo;
        if(!D.rechnungen.byPrefix[prefix])D.rechnungen.byPrefix[prefix]={count:0,saldo:0};
        D.rechnungen.byPrefix[prefix].count++;D.rechnungen.byPrefix[prefix].saldo+=saldo;
      }
      }console.log('Rechnungen loaded:',D.rechnungen.count,'offen, Summe:',D.rechnungen.total.toFixed(2));
    }

    // Krankenstand
    const ksData=await krankenstandP;
    const ksTW=await krankenstandTWP;
    D.krankenstand={total:0,count:0,avg:0,basePlan:15,byMA:[],tageWoche:{}};
    // Parse TageWoche first (MA -> Arbeitstage/Woche)
    if(ksTW&&ksTW.length>1){
      for(let i=1;i<ksTW.length;i++){
        const r=ksTW[i];if(!r||!r[0])continue;
        const name=String(r[0]).trim();
        const tw=parseInt(r[1])||5;
        D.krankenstand.tageWoche[name.toLowerCase()]=tw;
      }
    }
    // Parse Krankenstand
    if(ksData&&ksData.length>1){
      for(let i=1;i<ksData.length;i++){
        const r=ksData[i];if(!r||!r[0])continue;
        const name=String(r[0]).trim();
        const days=parseInt(r[1])||0;
        D.krankenstand.byMA.push({name,days});
        D.krankenstand.total+=days;D.krankenstand.count++;
      }
      D.krankenstand.byMA.sort((a,b)=>b.days-a.days);
    }
    // Add MA from TageWoche that aren't in Export (0 Krankentage)
    if(ksTW&&ksTW.length>1){
      const existingNames=new Set(D.krankenstand.byMA.map(m=>m.name.toLowerCase()));
      for(let i=1;i<ksTW.length;i++){
        const r=ksTW[i];if(!r||!r[0])continue;
        const name=String(r[0]).trim();
        if(!existingNames.has(name.toLowerCase())){
          D.krankenstand.byMA.push({name,days:0});
        }
      }
    }
    console.log('Krankenstand loaded:',D.krankenstand.byMA.length,'MA, TageWoche:',Object.keys(D.krankenstand.tageWoche).length);

    const allAuslKWs=[...D.auslK.map(d=>d.kw),...D.auslP.map(d=>d.kw)];
    const curKW=getCurrentKW();
    selectedAuslKW=Math.min(curKW-1,allAuslKWs.length?Math.max(...allAuslKWs):curKW-1);

    // Praxismanagement Werneck. Die Kennzahlendatei ist keine zusaetzliche
    // Quelle, sondern die Messung selbst — sie entsteht im Patientenchecker.
    // Die Tageszeilen des Trackers kommen aus denselben Blaettern, die oben
    // schon fuer die Wochenwerte gelesen wurden; ein zweiter Abruf waere
    // dieselbe Datei ein zweites Mal.
    try{lt.textContent='Lade Praxismanagement...';D.kenn=await kennLade();}
    catch(e){console.warn('Kennzahlen:',e);}
    D.trackerTage={physio:tKP?parseTrackerTage(tKP):[],ergo:tKE?parseTrackerTage(tKE):[],phfip:tPP?parseTrackerTage(tPP):[]};
    try{lt.textContent='Lade Club-Gespräche...';D.mw=await mwLaden();}catch(e){console.warn('MyWellness:',e);D.mw=[];}

    lt.textContent='Aufbau...';
    buildNameMap();
    D.raw.forEach(r=>{if(nameMap[r.name])r.name=nameMap[r.name];});
    document.getElementById('db').style.display='block';
    renderMainTabs();
    RA();
    pmTaktStart();
  }catch(e){console.error(e);document.getElementById('lo').style.display='flex';document.getElementById('er').textContent='Fehler: '+e.message;document.getElementById('er').style.display='block';}
  finally{ld.classList.add('h');}
}
async function refreshData(){await loadAll();}

// ═══ PRAXISMANAGEMENT WERNECK ═══════════════════════════════════════════════
// Zwei Quellen treffen hier zusammen, und sie werden bewusst nicht vermischt:
//
//   1. Die Kennzahlendatei, die der Patientenchecker Werneck nach jedem Laden
//      schreibt. Daraus kommen Auslastung, Lücken, Telefonie, Aufgaben und
//      Rezepte — fertig gerechnet. Hier wird nichts nachgerechnet: Zwei
//      Implementierungen derselben Kennzahl laufen auseinander, und danach
//      traut man keiner von beiden mehr.
//
//   2. Der Weekly KPI Tracker, den das Team von Hand führt. Daraus kommen
//      „Termine vereinbart" und die Neuzugänge. Diese Zahlen stehen in keinem
//      System, sie werden eingetippt — deshalb muss ein leerer Tag auch als
//      leer dastehen und nicht als Null.
//
// Eine Schnittstelle zwischen den Dashboards gibt es nicht und kann es nicht
// geben: Beide sind Browser-Seiten, keine Server. Eine Seite, die niemand offen
// hat, beantwortet keine Anfrage. Die Datei ist die Schnittstelle.
const KENN_DIR='/12_Code/Patientenchecker/Dateien Export/kennzahlen/';

// Quellen und Betriebe sind zwei verschiedene Dinge.
//
// Eine QUELLE ist ein Patientenchecker, also ein Verzeichnis mit
// Kennzahlendateien. Ein BETRIEB ist, was in der Umschaltleiste steht — eine
// Quelle plus, wenn gewünscht, eine Auswahl ihrer Standorte. Werneck schreibt
// eine Datei mit zwei Standorten (`wp`, `we`); daraus werden die zwei Betriebe
// KIMOJO Physio und KIMOJO Ergo, ohne dass am Patientenchecker etwas geändert
// werden muss.
//
// Einen weiteren Betrieb nachzuziehen heißt: Quelle eintragen und `q` beim
// Betrieb setzen. Ein Betrieb ohne angeschlossene Quelle steht als
// „Coming soon" da, statt still zu fehlen.
const PM_QUELLEN=[
  {q:'werneck', dir:KENN_DIR}
];
const PM_BETRIEBE=[
  {k:'alle',     l:'Alle',           q:null,      locs:null},
  {k:'kphysio',  l:'KIMOJO Physio',  q:'werneck', locs:['wp']},
  {k:'kergo',    l:'KIMOJO Ergo',    q:'werneck', locs:['we']},
  {k:'phfip',    l:'PhFiP',          q:null,      locs:null}
];
function pmHatQuelle(b){return!!(b&&b.q&&PM_QUELLEN.some(x=>x.q===b.q));}
let pmBetrieb='alle';
function pmBetriebInfo(k){return PM_BETRIEBE.filter(b=>b.k===(k||pmBetrieb))[0]||PM_BETRIEBE[0];}
function pmSetBetrieb(k){pmBetrieb=k;rPraxis();}

// Die Tage des gewählten Betriebs.
//
// Standorte werden auf `locs` eingeschränkt und behalten beim Zusammenführen
// ihren Betrieb im Schlüssel („kphysio/wp"), weil zwei Betriebe denselben
// Standortschlüssel tragen können und ihre Zahlen sonst stillschweigend
// ineinanderliefen.
//
// Telefonie, Rezepte und Aufgaben hängen dagegen an der QUELLE, nicht am
// Standort: ein Telefon, eine Verordnungsliste, eine Aufgabenliste für beide
// Standorte. Sie werden je Quelle genau einmal übernommen — und wenn die
// Ansicht nur einen Teil der Standorte zeigt, sagt `geteilt`, für welche sie
// in Wahrheit gelten.
function pmQ(){
  const q=D.kenn||{};
  const liste=(pmBetrieb==='alle')?PM_BETRIEBE.filter(pmHatQuelle)
                                  :PM_BETRIEBE.filter(b=>b.k===pmBetrieb&&pmHatQuelle(b));
  // Welche Standorte eine Quelle überhaupt mitbringt — aus den Daten gelesen,
  // nicht aus der Betriebsliste. Kommt in Werneck ein dritter Standort dazu,
  // meldet sich der Hinweis von selbst.
  const hat={},bez={};
  Object.keys(q).forEach(qk=>(q[qk].tage||[]).forEach(t=>Object.keys(t.loc||{}).forEach(k=>{
    (hat[qk]=hat[qk]||{})[k]=1;bez[qk+'/'+k]=(t.loc[k]&&t.loc[k].label)||k;})));
  const proTag={},drin={},gesehen={},mehr=liste.length>1;
  let stand=0;
  liste.forEach(b=>{
    const d=q[b.q];if(!d)return;
    stand=Math.max(stand,d.stand||0);
    const erste=!gesehen[b.q];gesehen[b.q]=1;
    (d.tage||[]).forEach(t=>{
      const z=proTag[t.ds]||(proTag[t.ds]={ds:t.ds,ts:0});
      z.ts=Math.max(z.ts||0,t.ts||0);
      if(erste){
        if(t.tel&&!z.tel)z.tel=t.tel;
        if(t.rez&&!z.rez)z.rez=t.rez;
        if(t.auf&&!z.auf)z.auf=t.auf;
      }
      if(!t.loc)return;
      z.loc=z.loc||{};
      Object.keys(t.loc).forEach(k=>{
        if(b.locs&&b.locs.indexOf(k)<0)return;
        (drin[b.q]=drin[b.q]||{})[k]=1;
        z.loc[mehr?b.k+'/'+k:k]=t.loc[k];
      });
    });
  });
  // Zeigt die Ansicht weniger Standorte, als die Quelle hat, dann beschreiben
  // Telefonie, Rezepte und Aufgaben mehr als das, was oben steht. Das muss
  // dastehen — sonst liest jemand die Annahmequote der ganzen Praxis als die
  // der Ergotherapie.
  let geteilt=null;
  liste.forEach(b=>{
    const a=Object.keys(hat[b.q]||{}),i=Object.keys(drin[b.q]||{});
    if(!a.length||!i.length||i.length>=a.length)return;
    geteilt=(geteilt||[]).concat(a.map(k=>bez[b.q+'/'+k]));
  });
  if(geteilt)geteilt=geteilt.filter((x,n,arr)=>arr.indexOf(x)===n);
  // Eine abgelehnte Fassung muss bis in den Leerzustand durchkommen, sonst
  // steht dort „noch keine Datei", obwohl eine da ist.
  let fremdeFassung=null;
  liste.forEach(b=>{const d=q[b.q];if(d&&d.fremdeFassung!=null)fremdeFassung=d.fremdeFassung;});
  return{stand,fremdeFassung,tage:Object.keys(proTag).sort().map(k=>proTag[k]),geteilt};
}
// „A und B", „A, B und C" — für den Satz, der sagt, wofür eine Zahl gilt.
function pmUnd(l){
  if(!l||!l.length)return'';
  return l.length===1?l[0]:l.slice(0,-1).join(', ')+' und '+l[l.length-1];
}
function pmZusammenHinweis(G){
  return G&&G.length?' · gilt für '+pmUnd(G)+' zusammen':'';
}

// Welche Fassungen der Kennzahlendatei gelesen werden koennen.
//
// Der Patientenchecker schreibt seit dem 22.10.2026 Fassung 5. Sie enthaelt
// dieselben Zahlen wie 4 und zusaetzlich die Liste „ansprechen", die hier
// niemand liest. Eine strikte Gleichheitspruefung hat die Datei deshalb
// verworfen, obwohl sie vollstaendig war — und der Reiter meldete, es gebe
// keine Daten, waehrend 23 Tage danebenlagen.
//
// Darum eine Spanne statt einer Zahl: Ein zusaetzliches Feld ist kein Grund,
// einen Monat wegzuwerfen. Eine Fassung UNTER KENN_V_MIN wird weiterhin
// abgelehnt — dort haben Felder andere Bedeutungen. Eine Fassung ueber
// KENN_V ebenfalls: Was sie bedeutet, weiss diese Datei noch nicht.
const KENN_V=5;
const KENN_V_MIN=4;
// Zielwert für die Telefonannahmequote. Darunter wird der Tag als auffällig
// markiert — nicht als Fehler: Ein einzelner Tag kann an einer Krankmeldung
// hängen. Auffällig heißt „hinschauen", nicht „schlecht".
const PM_ZIEL_QUOTE=80;
// Ab welcher Auslastung der Tag nicht mehr auffällt. 85 %, weil die restlichen
// 15 % Dokumentation, Übergaben und Ausfälle sind — 100 % wären nicht das Ziel,
// sondern ein Zeichen für fehlende Puffer.
const PM_ZIEL_AUSL=85;
// Durchschnittserlös je 20-Minuten-Termin. Eine Hausnummer aus der Praxis, kein
// Buchwert — deshalb steht sie an genau einer Stelle und ist in einer Zeile zu
// ändern. Alles, was in Euro erscheint, hängt an ihr.
const PM_EURO_SLOT=30;
function pmEuro(slots){
  return Math.round(slots*PM_EURO_SLOT).toLocaleString('de-DE')+' €';
}
// Ab wie vielen Werktagen eine Aussage über die Kapazität trägt. Darunter steht
// die Zahl zwar da, aber ohne Empfehlung: Drei Tage sind Wetter, keine Lage.
const PM_MIN_TAGE=10;
const PM_WT=['So','Mo','Di','Mi','Do','Fr','Sa'];

async function loadJSONPfad(f){
  const e=f.split('/').filter(s=>s).map(s=>encodeURIComponent(s)).join('/');
  const r=await fetch('https://graph.microsoft.com/v1.0/drives/'+driveId+'/root:/'+e+':/content',
    {cache:'no-store',headers:{Authorization:'Bearer '+window._token,'Cache-Control':'no-cache'}});
  if(!r.ok)return null;
  return JSON.parse((await r.text()).replace(/^﻿/,''));
}
function kennMonatStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
// Sechs Monate. Mehr braucht die Zeitraumwahl nicht, und sechs kleine Dateien
// parallel zu holen kostet weniger als eine Excel-Tabelle.
const KENN_MONATE=6;
async function kennLade(){
  const aus={};
  for(const qu of PM_QUELLEN)aus[qu.q]=await kennLadeEine(qu.dir);
  return aus;
}
async function kennLadeEine(dir){
  const j=new Date(),monate=[];
  for(let i=KENN_MONATE-1;i>=0;i--)
    monate.push(kennMonatStr(new Date(j.getFullYear(),j.getMonth()-i,1)));
  const dateien=await Promise.all(monate
    .map(m=>loadJSONPfad(dir+'kennzahlen-'+m+'.json').catch(()=>null)));
  const proTag={};let stand=0,fremdeFassung=null;
  dateien.forEach(f=>{
    // Eine Datei aus einer anderen Version wird nicht halb gelesen. Lieber
    // fehlt der Reiter, als dass er Felder zeigt, die etwas anderes bedeuten.
    if(!f||!Array.isArray(f.tage))return;
    if(!(f.v>=KENN_V_MIN&&f.v<=KENN_V)){fremdeFassung=f.v;return;}
    stand=Math.max(stand,Number(f.stand)||0);
    f.tage.forEach(t=>{if(t&&t.ds)proTag[t.ds]=t;});
  });
  return{stand,fremdeFassung,tage:Object.keys(proTag).sort().map(k=>proTag[k])};
}

// Excel liefert Datumswerte als Seriennummer, als ISO-Text oder deutsch
// ausgeschrieben — je nachdem, wie die Zelle formatiert ist. Alle drei Wege
// führen hier auf dieselbe ISO-Zeichenkette.
function xlDatum(dv){
  if(typeof dv==='number'&&dv>40000){
    const d=new Date(Math.round((dv-25569)*86400000));
    return d.toISOString().slice(0,10);
  }
  const s=String(dv==null?'':dv);
  const m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  const g=s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if(g)return g[3]+'-'+String(g[2]).padStart(2,'0')+'-'+String(g[1]).padStart(2,'0');
  return '';
}

// Tageszeilen aus dem Weekly KPI Tracker.
//
// Die beiden Blätter sind NICHT parallel aufgebaut: In Physio steht in Spalte G
// „davon Neuaufnahmen", in Ergo an derselben Stelle „davon Neuanfragen", und wo
// Physio die Anrufquote führt, steht bei Ergo „Abgebrochen". Gelesen wird
// deshalb ausschließlich über die Kopfzeile, nie über den Spaltenbuchstaben —
// sonst zeigt der Reiter irgendwann eine Zahl unter dem falschen Namen.
function parseTrackerTage(rows){
  if(!rows||rows.length<2)return[];
  const hdr=rows[0]||[];
  let cD=-1,cV=-1,cN=-1,cK=-1;
  for(let c=0;c<hdr.length;c++){
    const h=String(hdr[c]||'').toLowerCase().trim();
    if(h==='datum')cD=c;
    if(h.indexOf('termine vereinbart')>=0)cV=c;
    // „Neuaufnahmen" und „Neuanfragen" meinen dasselbe — jemand kommt neu
    // dazu. Sie landen deshalb in derselben Kennzahl und nicht in zwei.
    if(h.indexOf('neuaufnahm')>=0||h.indexOf('neuanfrag')>=0)cN=c;
    if(h.indexOf('krankheitstag')>=0)cK=c;
  }
  if(cD<0||cV<0)return[];
  const zahl=v=>{
    if(v===''||v==null)return null;
    const n=parseFloat(String(v).replace(',','.'));
    return isNaN(n)?null:n;
  };
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];if(!r)continue;
    const ds=xlDatum(r[cD]);if(!ds)continue;
    const v=zahl(r[cV]),n=cN<0?null:zahl(r[cN]),k=cK<0?null:zahl(r[cK]);
    // Eine leere Zeile ist KEIN Tag mit null Terminen, sondern ein Tag ohne
    // Eingabe. Als 0 gezeigt sähe ein vergessener Eintrag aus wie ein
    // katastrophaler Tag — und das ist die gefährlichere Verwechslung.
    if(v===null&&n===null&&k===null)continue;
    out.push({ds,vereinbart:v,neu:n,krank:k});
  }
  return out.sort((a,b)=>a.ds<b.ds?-1:1);
}
function pmTracker(ds){
  const t=(D.trackerTage||{});
  const f=a=>(a||[]).filter(x=>x.ds===ds)[0]||null;
  const p=f(t.physio),e=f(t.ergo);
  if(!p&&!e)return null;
  const sum=k=>{
    const v=[p&&p[k],e&&e[k]].filter(x=>x!=null&&x!==undefined);
    return v.length?v.reduce((a,b)=>a+b,0):null;
  };
  return{vereinbart:sum('vereinbart'),neu:sum('neu'),
         physio:p?p.vereinbart:null,ergo:e?e.vereinbart:null};
}

function pmDatum(ds){
  const d=new Date(ds+'T12:00:00');
  return isNaN(d)?ds:d.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
}
function pmKurz(ds){
  const d=new Date(ds+'T12:00:00');
  return isNaN(d)?ds:d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).replace(',','');
}
const pmLeer='<span style="font-size:15px;font-weight:500;color:var(--faint)">keine Eingabe</span>';
function pmUB(v,gut,mittel){
  if(v==null)return'<span class="ub" style="background:var(--fill);color:var(--faint)">–</span>';
  const k=v>=gut?'ug':v>=mittel?'uy':'ur';
  return'<span class="ub '+k+'">'+Math.round(v)+'%</span>';
}

function pmSum(loc,f){
  let s=0;Object.keys(loc||{}).forEach(k=>{const h=loc[k]&&loc[k].heute;if(h)s+=f(h)||0;});
  return s;
}
function pmStd(m){return m==null?'–':(m/60).toFixed(1).replace('.',',')+' h';}

// ── Zeitraum ───────────────────────────────────────────────────────────────
// Heute, Woche, Monat oder frei gewählt. Zusammengefasst wird nicht naiv:
// Flussgrößen (Anrufe, Patientenzeit, erledigte Aufgaben, freie Minuten)
// werden summiert, Quoten als Verhältnis der Summen gebildet — nie als Schnitt
// der Tagesquoten, sonst zieht ein ruhiger Samstag mit vier Anrufen genauso
// stark wie ein Dienstag mit zweihundert. Bestandsgrößen (offene Arbeit,
// Rezeptrückstand) lassen sich gar nicht summieren: Dieselbe unerledigte
// Aufgabe zählte an jedem Tag erneut. Für sie steht der Durchschnitt, beim
// Rezeptstand der letzte Tag im Bereich.
let pmZeit='tag',pmVon='',pmBis='';
// Der Ankertag. Leer heißt „der jüngste vollständige Tag". Die Pfeile
// verschieben ihn, die Einheit darüber entscheidet, was um ihn herum gezeigt
// wird — ein Tag, seine Woche oder sein Monat.
let pmTag='';
function pmISO(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
  +'-'+String(d.getDate()).padStart(2,'0');}
function pmSetZeit(z){
  // „Heute" heißt heute. Wer von der Wochenansicht zurückkommt, will den
  // aktuellen Tag sehen und nicht den, auf dem er vorhin stehen geblieben ist.
  // Woche und Monat behalten den Anker: Vom 3. aus ist „Woche" dessen Woche.
  if(z==='tag')pmTag='';
  pmZeit=z;rPraxis();
}

// Alle Tage mit vollständigen Zahlen. Danach blättert die Tagesansicht —
// Kalendertage durchzuklicken führte durch Wochenenden, an denen nichts steht.
function pmTageMitDaten(){
  return(pmQ().tage||[])
    .filter(t=>t&&t.loc&&t.auf&&Object.keys(t.loc).length).map(t=>t.ds);
}
// Von wann bis wann reicht die Datei überhaupt? Begrenzt das Blättern, damit
// man nicht endlos in leere Monate hinauswandert.
function pmSpanne(){
  const t=pmQ().tage||[];
  return t.length?{von:t[0].ds,bis:t[t.length-1].ds}:null;
}
// Wohin käme ein Schritt um d Einheiten? Liefert den neuen Ankertag oder '',
// wenn es in diese Richtung nichts mehr gibt.
function pmZiel(d){
  if(pmZeit==='frei')return'';
  if(pmZeit==='tag'){
    const L=pmTageMitDaten();if(!L.length)return'';
    let i=L.indexOf(pmTag||pmLetzterTag());if(i<0)i=L.length-1;
    const j=i+d;
    return(j>=0&&j<L.length)?L[j]:'';
  }
  const sp=pmSpanne();if(!sp)return'';
  const a=new Date(pmBereich().von+'T12:00:00');
  if(pmZeit==='woche')a.setDate(a.getDate()+7*d);else a.setMonth(a.getMonth()+d);
  const neu=pmISO(a);
  // Nur springen, wenn der neue Bereich die vorhandenen Daten überhaupt noch
  // berührt. Sonst stünde man vor einer leeren Seite ohne Weg zurück.
  const merk=pmTag;pmTag=neu;
  const B=pmBereich();pmTag=merk;
  return(B.bis>=sp.von&&B.von<=sp.bis)?neu:'';
}
function pmSchritt(d){const z=pmZiel(d);if(!z)return;pmTag=z;rPraxis();}
function pmSetDatum(welches,v){
  if(welches==='von')pmVon=v;else pmBis=v;
  pmZeit='frei';rPraxis();
}
// Der jüngste Tag, der mehr trägt als Telefonie. Standort- und Aufgabenzahlen
// entstehen nur, während der Patientenchecker offen ist — am Sonntag gibt es
// sie nicht, und dann ist der Freitag der richtige Bezugstag.
function pmLetzterTag(){
  const tage=pmQ().tage||[];
  const voll=tage.filter(t=>t&&t.loc&&t.auf&&Object.keys(t.loc).length);
  if(voll.length)return voll[voll.length-1].ds;
  // Noch kein vollständiger Tag: dann der letzte Tag mit überhaupt Daten.
  // Telefoniezahlen allein sind besser als eine leere Seite — sie kommen aus
  // dem Webex-Export und stehen auch da, wenn niemand das Praxismanagement
  // geöffnet hatte.
  if(tage.length)return tage[tage.length-1].ds;
  return pmISO(new Date());
}
function pmBereich(){
  const l=pmTag||pmLetzterTag(),d=new Date(l+'T12:00:00');
  if(pmZeit==='woche'){
    // Montag bis Sonntag der Woche, in der der letzte vollständige Tag liegt.
    const mo=new Date(d);mo.setDate(d.getDate()-((d.getDay()+6)%7));
    const so=new Date(mo);so.setDate(mo.getDate()+6);
    return{von:pmISO(mo),bis:pmISO(so),label:'Woche '+pmKurz(pmISO(mo))+' – '+pmKurz(pmISO(so))};
  }
  if(pmZeit==='monat'){
    const a=new Date(d.getFullYear(),d.getMonth(),1),e=new Date(d.getFullYear(),d.getMonth()+1,0);
    return{von:pmISO(a),bis:pmISO(e),
      label:d.toLocaleDateString('de-DE',{month:'long',year:'numeric'})};
  }
  if(pmZeit==='frei'){
      const v=pmVon||l,b=pmBis||l;
    const von=v<=b?v:b,bis=v<=b?b:v;
    return{von,bis,label:pmKurz(von)+' – '+pmKurz(bis)};
  }
  return{von:l,bis:l,label:pmDatum(l)};
}
// Wie viele Werktage liegen im Bereich? Nur so lässt sich sagen, ob eine Lücke
// in der Reihe ein Wochenende war oder ein Tag, an dem niemand das Dashboard
// offen hatte.
function pmWerktage(von,bis){
  let n=0;const d=new Date(von+'T12:00:00'),e=new Date(bis+'T12:00:00');
  while(d<=e){const w=d.getDay();if(w>=1&&w<=5)n++;d.setDate(d.getDate()+1);}
  return n;
}

// Auf- und zuklappen. Bewusst ohne Neuzeichnen: Ein rPraxis() würde die ganze
// Seite neu bauen und den Scrollstand mitnehmen.
function pmKlapp(id){
  const e=document.getElementById(id);if(!e)return;
  e.style.display=e.style.display==='none'?'block':'none';
}

function pmAgg(tage){
  const Z={tel:{anrufe:0,ws:0,wsAn:0,absage:0,wollten:0,verloren:0,aus:0},
    telTage:0,locTage:0,aufTage:0,spitze:{},loc:{},th:{},luStd:{},luWt:{},
    rest:0,ueberfaellig:0,ohneZuweisung:0,
    pensum:0,erledigt:0,abgehakt:0,abgelehnt:0,entfallen:0,unsicher:0,
    entschiedenHeute:0,abgelehntHeute:0,rez:null,letzterLoc:''};
  tage.forEach(t=>{
    if(t.tel&&t.tel.anrufe){
      Z.telTage++;
      ['anrufe','ws','wsAn','absage','wollten','verloren','aus'].forEach(k=>Z.tel[k]+=t.tel[k]||0);
      // Problemstunden über den Bereich aufaddieren: Eine Stunde, die an einem
      // Tag auffällt, ist Zufall; dieselbe Stunde an acht Tagen ist ein Muster.
      if(t.tel.spitze)Z.spitze[t.tel.spitze.h]=(Z.spitze[t.tel.spitze.h]||0)+t.tel.spitze.verpasst;
    }
    if(t.loc&&Object.keys(t.loc).length){
      Z.locTage++;Z.letzterLoc=t.ds;
      // Lücken nach Wochentag. Gezählt wird auch, wie oft der Wochentag im
      // Zeitraum vorkam — sonst sieht ein Montag aus drei Wochen dreimal so
      // schlimm aus wie ein einzelner Freitag.
      const wt=PM_WT[new Date(t.ds+'T12:00:00').getDay()];
      const w=Z.luWt[wt]||(Z.luWt[wt]={min:0,tage:0});
      w.tage++;
      Object.keys(t.loc).forEach(k=>{
        const L=t.loc[k],a=L.heute;if(!a)return;
        const z=Z.loc[k]||(Z.loc[k]={label:L.label||k,wm:0,vm:0,pg:0,pm:0,aus:0,ausFahrt:0,
          blk:0,rsv:0,son:0,kggFrei:0,kggMin:0,luecken:0,freiMin:0,slots:0,termine:0,tage:0,th:0,
          hb:{touren:0,min:0,bewertbar:0,bMin:0,bUms:0,unterZiel:0,ohneTermine:0,
              geraten:0,beh:0,ziel:80}});
        ['wm','vm','pg','pm','aus','ausFahrt','blk','rsv','son','kggFrei','kggMin',
         'luecken','freiMin','slots','termine']
          .forEach(f=>z[f]+=a[f]||0);
        z.tage++;z.th=Math.max(z.th,a.th||0);
        if(a.hb){['touren','min','bewertbar','bMin','bUms','unterZiel','ohneTermine','geraten','beh']
          .forEach(f=>z.hb[f]+=a.hb[f]||0);
          if(a.hb.ziel)z.hb.ziel=a.hb.ziel;}
        Object.keys(a.luStd||{}).forEach(hh=>{
          Z.luStd[hh]=(Z.luStd[hh]||0)+(a.luStd[hh]||0);
          w.min+=a.luStd[hh]||0;
        });
        // Die Aufschlüsselung der anderweitigen Zeit über die Tage addieren.
        // Sie steht in der Datei als sortierte Liste [Text, Minuten].
        z.sonDetail=z.sonDetail||{};
        (a.sonDetail||[]).forEach(([k,m])=>{z.sonDetail[k]=(z.sonDetail[k]||0)+m;});
        (a.thListe||[]).forEach(x=>{
          const y=Z.th[x.name]||(Z.th[x.name]={name:x.name,loc:L.label||k,
            wm:0,vm:0,pm:0,aus:0,ausFahrt:0,blk:0,rsv:0,son:0,kggFrei:0,kggMin:0,
            pc:0,n:0,min:0,tage:0,tief:null,hoch:null,touren:[]});
          ['wm','vm','pm','aus','ausFahrt','blk','rsv','son','kggFrei','kggMin','pc','n','min']
            .forEach(f=>y[f]+=x[f]||0);
          y.tage++;
          // Schwächster und bester Tag. Der Schnitt allein verbirgt den
          // Unterschied zwischen „jeden Tag 80 %" und „mal 50, mal 100" — und
          // das sind zwei völlig verschiedene Probleme: das eine ist fehlende
          // Nachfrage, das andere eine ungleichmäßige Terminvergabe.
          // Jede Tour mit ihrem Tag, damit die Aufklappansicht sagen kann,
          // wann sie war.
          (x.touren||[]).forEach(tr=>y.touren.push(Object.assign({ds:t.ds},tr)));
          if(typeof x.auB==='number'){
            y.tief=(y.tief==null||x.auB<y.tief)?x.auB:y.tief;
            y.hoch=(y.hoch==null||x.auB>y.hoch)?x.auB:y.hoch;
          }
        });
      });
    }
    if(t.auf&&t.auf.stand){
      const st=t.auf.stand;
      Z.aufTage++;
      // Pensum und Erledigtes sind Flussgrößen und lassen sich über Tage
      // addieren — anders als der Bestand „noch offen", der gemittelt wird.
      Z.pensum+=st.pensum||0;Z.erledigt+=st.erledigt||0;
      Z.abgehakt+=(st.fertig||0)+(st.abgelehnt||0);
      Z.abgelehnt+=st.abgelehnt||0;Z.entfallen+=st.entfallen||0;
      Z.rest+=st.rest||0;
      if(st.unsicher)Z.unsicher++;
      Z.ueberfaellig+=t.auf.ueberfaellig||0;Z.ohneZuweisung+=t.auf.ohneZuweisung||0;
      if(t.auf.heute){Z.entschiedenHeute+=t.auf.heute.erledigt||0;
        Z.abgelehntHeute+=t.auf.heute.abgelehnt||0;}
    }
    // Rezeptrückstand ist ein Bestand. Der letzte Tag im Bereich gilt —
    // summiert hieße er, dasselbe offene Rezept dreißigmal zu zählen.
    if(t.rez)Z.rez=t.rez;
  });
  const S=f=>Object.keys(Z.loc).reduce((s,k)=>s+Z.loc[k][f],0);
  Z.sWm=S('wm');Z.sVm=S('vm');Z.sPg=S('pg');Z.sPm=S('pm');
  Z.sAus=S('aus');Z.sAusFahrt=S('ausFahrt');Z.sBlk=S('blk');Z.sRsv=S('rsv');Z.sSon=S('son');
  Z.luecken=S('luecken');Z.freiMin=S('freiMin');Z.slots=S('slots');Z.termine=S('termine');
  Z.kggFrei=S('kggFrei');Z.kggMin=S('kggMin');
  Z.hb={touren:0,min:0,bewertbar:0,bMin:0,bUms:0,unterZiel:0,ohneTermine:0,
        geraten:0,beh:0,ziel:80};
  Object.keys(Z.loc).forEach(k=>{const b=Z.loc[k].hb;if(!b)return;
    ['touren','min','bewertbar','bMin','bUms','unterZiel','ohneTermine','geraten','beh']
      .forEach(f=>Z.hb[f]+=b[f]||0);
    if(b.ziel)Z.hb.ziel=b.ziel;});
  Z.hb.eurH=Z.hb.bMin?Math.round(100*60*Z.hb.bUms/Z.hb.bMin)/100:null;
  Z.sVerf=Math.max(0,Z.sWm-Z.sBlk-Z.sRsv);
  Z.ausl=Z.sWm?Math.round(100*Z.sPg/Z.sWm):null;
  Z.auslB=Z.sVerf?Math.round(100*Z.sPg/Z.sVerf):null;
  Z.quote=Z.tel.ws?Math.round(1000*Z.tel.wsAn/Z.tel.ws)/10:null;
  Z.restAvg=Z.aufTage?Math.round(Z.rest/Z.aufTage):null;
  Z.ueberfAvg=Z.aufTage?Math.round(Z.ueberfaellig/Z.aufTage):null;
  Z.ohneZuwAvg=Z.aufTage?Math.round(Z.ohneZuweisung/Z.aufTage):null;
  Z.aufQuote=Z.pensum?Math.round(1000*Z.erledigt/Z.pensum)/10:null;
  // Die Quoten werden hier aus den Bestandteilen gerechnet, NICHT aus dem
  // mitgelieferten Feld. Beides nebeneinander zu zeigen hieße, zwei Zahlen zu
  // zeigen, die auseinanderlaufen können — und genau das ist passiert: Eine
  // Datei, die eine ältere Version des Patientencheckers geschrieben hatte,
  // trug noch eine verplanbare Zeit ohne Abzug der reservierten Plätze. Oben
  // stand 70 %, darunter ergaben dieselben Zeilen 72 %.
  //
  // Aus den Teilen gerechnet kann das nicht mehr vorkommen: Was im Balken
  // steht, ergibt die Prozentzahl daneben. Ändert sich die Definition, gilt sie
  // rückwirkend auch für ältere Dateien.
  Object.keys(Z.loc).forEach(k=>{const z=Z.loc[k];
    z.verf=Math.max(0,z.wm-z.blk-z.rsv);
    z.ausl=z.wm?Math.round(100*z.pg/z.wm):null;
    z.auslB=z.verf?Math.round(100*z.pg/z.verf):null;});
  // Die Quote je Therapeut ebenfalls als Verhältnis der Summen. Der Schnitt
  // seiner Tagesquoten wäre etwas anderes: Ein halber Tag mit einem Termin
  // zählte dort so viel wie ein voller Dienstag.
  Z.thListe=Object.keys(Z.th).map(k=>{const x=Z.th[k];
    x.pg=x.pm+x.aus;
    x.verf=Math.max(0,x.wm-x.blk-x.rsv);
    x.au=x.wm?Math.round(100*x.pg/x.wm):0;
    x.auB=x.verf?Math.round(100*x.pg/x.verf):0;
    // Was an Kapazität liegengeblieben ist, in Terminen: je zwanzig Minuten
    // Lücke einer, je fehlendem KGG-Platz einer. Das ist die Zahl, mit der sich
    // rechnen lässt — Stunden sind abstrakt, Termine nicht.
    x.offeneSlots=Math.floor(x.min/20)+x.kggFrei;
    // Die Tourbilanz dieser Person. Gerechnet wird nur über bewertbare Touren —
    // eine ohne eingetragene Termine sagt nichts über Wirtschaftlichkeit.
    const B=(x.touren||[]).filter(t=>t.bewertbar);
    x.hbTouren=(x.touren||[]).length;
    x.hbMin=B.reduce((s,t)=>s+t.min,0);
    x.hbBeh=B.reduce((s,t)=>s+t.n,0);
    x.hbUms=B.reduce((s,t)=>s+t.ums,0);
    x.hbEurH=x.hbMin?Math.round(100*60*x.hbUms/x.hbMin)/100:null;
    return x;}).sort((a,b)=>a.auB-b.auB);
  const sp=Object.keys(Z.spitze).map(Number).sort((a,b)=>Z.spitze[b]-Z.spitze[a]);
  Z.topSpitze=sp.length?{h:sp[0],verpasst:Z.spitze[sp[0]]}:null;
  return Z;
}

function pmTrackerBereich(von,bis){
  const t=D.trackerTage||{};
  const im=a=>(a||[]).filter(x=>x.ds>=von&&x.ds<=bis);
  const p=im(t.physio),e=im(t.ergo);
  if(!p.length&&!e.length)return null;
  const sum=(a,k)=>a.reduce((s,x)=>s+(x[k]==null?0:x[k]),0);
  return{vereinbart:sum(p,'vereinbart')+sum(e,'vereinbart'),
    neu:sum(p,'neu')+sum(e,'neu'),
    tage:new Set(p.concat(e).map(x=>x.ds)).size};
}

function pmZeitLeiste(B,Z,werktage,tage){
  const b=(k,l)=>'<button class="fb'+(pmZeit===k?' a':'')+'" onclick="pmSetZeit(\''+k+'\')">'+l+'</button>';
  // Pfeile blättern in der gewählten Einheit: einen Tag, eine Woche, einen
  // Monat. Wo es nichts mehr gibt, sind sie blass und tun nichts — ein Pfeil,
  // der ins Leere führt, sieht aus wie ein Fehler.
  const pf=(d,z)=>{
    const geht=!!pmZiel(d);
    return'<button class="fb" onclick="pmSchritt('+d+')"'
      +(geht?'':' disabled style="opacity:.35;cursor:default"')
      +' title="'+(geht?(d<0?'zurück':'vor'):'keine weiteren Daten')+'">'+z+'</button>';
  };
  let h='<div class="flt"><span class="fl">Zeitraum</span>'
    +b('tag','Heute')+b('woche','Woche')+b('monat','Monat')+b('frei','Frei')
    +(pmZeit==='frei'?'':'<span class="sep"></span>'+pf(-1,'‹')+pf(1,'›'))
    +'<span class="sep"></span>'
    +'<input type="date" class="ss" value="'+B.von+'" onchange="pmSetDatum(\'von\',this.value)">'
    +'<span style="color:var(--muted);font-size:12px">bis</span>'
    +'<input type="date" class="ss" value="'+B.bis+'" onchange="pmSetDatum(\'bis\',this.value)">'
    +'</div>';
  // Wie viel vom Bereich wirklich belegt ist. Ohne diese Zeile hielte man eine
  // Monatsauswertung aus drei Tagen für eine Monatsauswertung.
  const fehlt=Math.max(0,werktage-Z.locTage);
  // Wann der Tag zuletzt geschrieben wurde. Wichtig für die Reihe: Schließt um
  // 16 Uhr der Letzte den Browser, friert der Tag auf 16 Uhr ein — die Zahlen
  // sind dann richtig, aber nicht der Tagesabschluss. Ohne diese Angabe wäre
  // das nicht zu erkennen.
  const einTagStand=(B.von===B.bis&&tage.length&&tage[0].ts)
    ?new Date(tage[0].ts).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'';
  h+='<div class="flt" style="margin-top:-10px">'
    +'<span class="hdr-badge">'+B.label+'</span>'
    +(einTagStand?'<span class="hdr-badge">Tagesstand '+einTagStand+' Uhr</span>':'')
    +'<span class="hdr-badge">'+Z.locTage+' von '+werktage+' Werktagen mit Daten</span>'
    +(Z.telTage?'<span class="hdr-badge">'+Z.telTage+' Tage Telefonie</span>':'')
    +(pmQ().stand?'<span class="hdr-badge">Datei geschrieben '
      +new Date(pmQ().stand).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
      +'</span>':'')
    +'</div>';
  if(fehlt>0)h+='<div class="cd" style="margin-bottom:16px;font-size:12.5px;color:var(--muted);line-height:1.7">'
    +'An <b style="color:var(--dark)">'+fehlt+'</b> Werktag'+(fehlt===1?'':'en')+' des Zeitraums liegen keine '
    +'Standort- und Aufgabenzahlen vor. Die entstehen nur, während das Praxismanagement Werneck '
    +'geöffnet ist — an einem solchen Tag wurde es nicht geöffnet. Die Zahlen unten beziehen sich '
    +'auf die '+Z.locTage+' vorhandenen Tage und sind für diese richtig; als Monatsbild sind sie '
    +'unvollständig. Telefoniezahlen sind davon nicht betroffen, sie kommen aus dem Webex-Export.'
    +'</div>';
  return h;
}

// Die Umschaltleiste der Betriebe. Betriebe ohne angeschlossene Quelle tragen
// „Soon" und sind trotzdem anklickbar — die geplante Struktur soll sichtbar
// sein, und wer draufklickt, bekommt zu lesen, was noch fehlt.
function pmBetriebLeiste(){
  let h='<div class="flt"><span class="fl">Betrieb</span>';
  PM_BETRIEBE.forEach(b=>{
    const ohne=b.k!=='alle'&&!pmHatQuelle(b);
    h+='<button class="fb'+(pmBetrieb===b.k?' a':'')+'" onclick="pmSetBetrieb(\''+b.k+'\')">'
      +b.l+(ohne?' <span style="font-size:9.5px;font-weight:600;letter-spacing:.04em;'
        +'text-transform:uppercase;background:var(--fill-hover);color:var(--faint);'
        +'border-radius:100px;padding:1px 6px;margin-left:5px">soon</span>':'')
      +'</button>';
  });
  return h+'</div>';
}

function rPraxis(){
  const el=document.getElementById('praxisBody');if(!el)return;
  const B0=pmBetriebInfo();
  // Ein Betrieb ohne Quelle bekommt keine erfundenen Nullen, sondern den
  // Hinweis, was fehlt.
  if(B0.k!=='alle'&&!pmHatQuelle(B0)){
    el.innerHTML=pmBetriebLeiste()
      +'<div class="soon"><div class="soon-ico">🗂️</div><h3>'+B0.l+' ist noch nicht angeschlossen</h3>'
      +'<p>Für diesen Betrieb schreibt noch kein Patientenchecker eine Kennzahlendatei. '
      +'Sobald es eine gibt, trägt man ihr Verzeichnis in <code>PM_QUELLEN</code> ein und '
      +'setzt <code>q</code> beim Betrieb — '
      +'danach erscheinen hier dieselben Auswertungen wie bei KIMOJO Werneck: Auslastung, '
      +'Lücken, Telefonie, Aufgaben und die Wirtschaftlichkeit der Touren.</p>'
      +'<span class="soon-tag">Coming soon</span></div>';
    return;
  }
  const K=pmQ();
  if(!K||!K.tage||!K.tage.length){
    // Zwei sehr verschiedene Lagen, die frueher beide „keine Datei" hiessen.
    // Die Unterscheidung spart beim naechsten Versionssprung die Sucherei.
    const fv=K&&K.fremdeFassung;
    el.innerHTML=pmBetriebLeiste()+'<div class="soon"><div class="soon-ico">🗂️</div>'
      +(fv!=null
        ?'<h3>Kennzahlen in einer unbekannten Fassung</h3>'
         +'<p>Die Datei <code>kennzahlen-'+kennMonatStr(new Date())+'.json</code> liegt im '
         +'Export-Ordner, ist aber in Fassung <b>'+fv+'</b> geschrieben. Dieses Dashboard liest '
         +'die Fassungen '+KENN_V_MIN+' bis '+KENN_V+'. Der Patientenchecker ist neuer als das '
         +'Controlling — hier muss <code>KENN_V</code> nachgezogen werden.</p>'
         +'<span class="soon-tag">Fassung '+fv+' nicht lesbar</span>'
        :'<h3>Noch keine Kennzahlen</h3>'
         +'<p>Die Datei <code>kennzahlen-'+kennMonatStr(new Date())+'.json</code> liegt noch nicht '
         +'im Export-Ordner. Sie entsteht, sobald das Praxismanagement Werneck einmal geöffnet wurde.</p>'
         +'<span class="soon-tag">Wartet auf Daten</span>')
      +'</div>';
    return;
  }
  const B=pmBereich();
  // Telefon, Verordnungsliste und Aufgabenliste gelten für die ganze Quelle.
  // Zeigt die Ansicht nur einen ihrer Standorte, muss das an jeder Zahl
  // dranstehen, die daraus kommt.
  const zus=pmZusammenHinweis(K.geteilt);
  const tage=K.tage.filter(t=>t&&t.ds>=B.von&&t.ds<=B.bis);
  const Z=pmAgg(tage),werktage=pmWerktage(B.von,B.bis);
  let h=pmBetriebLeiste()+pmZeitLeiste(B,Z,werktage,tage);

  // Bei „Alle" sagen, welche Betriebe noch fehlen — sonst liest sich die Zahl
  // wie das Ergebnis aller Praxen, obwohl nur eine darin steckt.
  const fehlend=PM_BETRIEBE.filter(b=>b.k!=='alle'&&!pmHatQuelle(b));
  if(pmBetrieb==='alle'&&fehlend.length)
    h+='<div class="cd" style="margin-bottom:16px;font-size:12.5px;color:var(--muted);line-height:1.7">'
      +'„Alle“ umfasst derzeit nur <b style="color:var(--dark)">'
      +PM_BETRIEBE.filter(pmHatQuelle).map(b=>b.l).join(', ')+'</b>. Noch nicht angeschlossen: '
      +fehlend.map(b=>b.l).join(', ')+'. Die Zahlen unten beschreiben also nicht das ganze Haus.'
      +'</div>';
  if(!Z.locTage&&!Z.telTage){
    h+='<div class="soon"><div class="soon-ico">📭</div><h3>Keine Daten in diesem Zeitraum</h3>'
      +'<p>Für '+B.label+' liegt in der Kennzahlendatei nichts. Die Reihe beginnt mit dem Tag, '
      +'an dem das Praxismanagement Werneck zum ersten Mal mit dieser Rechnung geladen wurde.</p>'
      +'<span class="soon-tag">Leerer Zeitraum</span></div>';
    el.innerHTML=h;return;
  }
  const tr=pmTrackerBereich(B.von,B.bis);
  const einTag=B.von===B.bis;

  // ── Die sechs. Alles andere ist Drill-down. ───────────────────────────────
  h+='<div class="hero" style="grid-template-columns:repeat(3,1fr)">';
  h+='<div class="hk"><div class="hk-l">Auslastung</div>'
    +'<div class="hk-v">'+(Z.ausl==null?'–':Z.ausl+'%')+'</div>'
    +'<div class="hk-sub">'+pmStd(Z.sPg)+' am Patienten von '+pmStd(Z.sWm)+' Arbeitszeit'
    +(Z.auslB==null?'':' · <b>bereinigt '+Z.auslB+' %</b>')
    +(Z.sRsv?' · '+pmStd(Z.sRsv)+' reserviert':'')+'</div></div>';
  h+='<div class="hk"><div class="hk-l">Offene Lücken</div>'
    +'<div class="hk-v">'+Z.luecken+'</div>'
    +'<div class="hk-sub">'+pmStd(Z.freiMin)+' frei · <b>'+Z.slots+' Termine = '+pmEuro(Z.slots)+'</b>'
    +(Z.kggFrei?' · '+Z.kggFrei+' KGG-Plätze fehlen ('+pmStd(Z.kggMin)+')':'')
    +(einTag?'':' · ø '+Math.round(Z.luecken/Math.max(1,Z.locTage))+' je Tag')+'</div></div>';
  h+='<div class="hk"><div class="hk-l">Telefonannahmequote</div>'
    +'<div class="hk-v">'+(Z.quote==null?'–':Z.quote+'%')+'</div>'
    +'<div class="hk-sub">'+Z.tel.wsAn+' von '+Z.tel.ws+' in der Warteschlange · Ziel '+PM_ZIEL_QUOTE+' %'+zus+'</div></div>';
  h+='<div class="hk"><div class="hk-l">Termine vereinbart</div>'
    +'<div class="hk-v">'+(tr&&tr.vereinbart!=null?tr.vereinbart:pmLeer)+'</div>'
    +'<div class="hk-sub">'+(tr?(tr.neu!=null?'davon '+tr.neu+' neu · ':'')+'an '+tr.tage+' Tag'+(tr.tage===1?'':'en')+' eingetragen'
      :'aus dem Weekly KPI Tracker, von Hand geführt')+'</div></div>';
  // Offene Arbeit ist ein BESTAND, keine Menge, die sich über Tage addiert.
  // Dieselbe unerledigte Aufgabe zählte sonst an jedem Tag erneut. Über einen
  // Zeitraum steht deshalb der Durchschnitt: Wie viel lag typischerweise abends
  // noch da?
  h+='<div class="hk"><div class="hk-l">Offene Arbeit am Tagesende</div>'
    +'<div class="hk-v">'+(Z.restAvg==null?'–':Z.restAvg)+'</div>'
    +'<div class="hk-sub">'+(einTag?'offen und in Bearbeitung':'im Schnitt je Tag')
    +(Z.ueberfAvg?' · <b style="color:var(--primary)">'+Z.ueberfAvg+' überfällig</b>':'')+zus+'</div></div>';
  // Bezugsgröße ist das TAGESPENSUM, nicht der Bestand am Abend. Sonst misst
  // die Quote das Gegenteil: Wer alle Lücken schließt, hätte gar keine
  // Bezugsgröße mehr, weil die Aufgaben mit ihrer Ursache verschwinden.
  h+='<div class="hk"><div class="hk-l">Aufgaben erledigt</div>'
    +'<div class="hk-v">'+(Z.aufQuote==null?'–':Z.aufQuote+'%')+'</div>'
    +'<div class="hk-sub">'+Z.erledigt+' von '+Z.pensum+' des Tagespensums'
    +(Z.entfallen?' · '+Z.entfallen+' durch Erledigen der Ursache':'')
    +(Z.unsicher?' · <b style="color:var(--primary)">Datenlage unvollständig</b>':'')
    +zus+'</div></div>';
  h+='</div>';

  // ── Auffälligkeiten. Die Zeile, die die Führungskraft liest. ─────────────
  // Nicht „wie gut war der Zeitraum" — sondern: Wo lief der Prozess nicht nach
  // Standard, und wo muss jemand hinschauen?
  const auf_=[],zusK=K.geteilt?' ('+pmUnd(K.geteilt)+' zusammen)':'';
  if(Z.quote!=null&&Z.quote<PM_ZIEL_QUOTE){
    let s='Telefonannahmequote <b>'+Z.quote+' %</b> unter dem Ziel von '+PM_ZIEL_QUOTE+' % — '
      +Z.tel.verloren+' Anrufer wollten jemanden sprechen und erreichten niemanden'+zusK+'.';
    if(Z.topSpitze)s+=' Am häufigsten zwischen <b>'+Z.topSpitze.h+' und '+(Z.topSpitze.h+1)
      +' Uhr</b> ('+Z.topSpitze.verpasst+').';
    auf_.push(s);
  }
  Object.keys(Z.loc).forEach(k=>{
    // Gemessen wird an der BEREINIGTEN Quote, und je Standort. An der
    // Bruttoquote stünde jeder mit viel Blocker- und FL-Zeit dauerhaft als
    // auffällig da; über beide Standorte gemittelt verschwände der, bei dem
    // man hinschauen müsste.
    const z=Z.loc[k];
    if(z.auslB==null||z.auslB>=PM_ZIEL_AUSL||!z.luecken)return;
    auf_.push('<b>'+z.label+'</b>: bereinigte Auslastung <b>'+z.auslB+' %</b> bei '+z.luecken
      +' offenen Lücken ('+pmStd(z.freiMin)+', '+z.slots+' Termine) — nicht geschlossen.');
  });
  // Reservierte Plätze sind das Frühwarnsignal für die Rezeptbeschaffung:
  // Der Platz ist vergeben, aber ohne Rezept bringt er nichts. Bleiben viele
  // davon stehen, läuft nicht die Terminvergabe schlecht, sondern das
  // Nachfassen beim Arzt.
  // Gemessen an der ARBEITSZEIT, nicht an der verplanbaren: Reservierte Plätze
  // sind aus letzterer herausgerechnet, der Anteil an ihr wäre also eine Zahl,
  // die sich selbst betrachtet.
  if(Z.sRsv&&Z.sWm&&Z.sRsv/Z.sWm>=0.05)
    auf_.push('<b>'+pmStd(Z.sRsv)+'</b> sind als Platz für Dauerpatienten reserviert, ohne dass ein '
      +'Rezepttermin darauf liegt — '+Math.round(100*Z.sRsv/Z.sWm)+' % der Arbeitszeit. Diese Plätze '
      +'sind aus der verplanbaren Zeit herausgerechnet, verbessern die bereinigte Quote also; '
      +'etwas bringen sie trotzdem erst, wenn das Rezept da ist.');
  // Fehlten an einem Tag Standortdaten, steht „entfallen" zu niedrig und die
  // Erledigungsquote damit auch. Das muss dastehen, sonst wird aus einem
  // Exportproblem ein Vorwurf an das Team.
  if(Z.unsicher)auf_.push('An <b>'+Z.unsicher+'</b> Tag'+(Z.unsicher===1?'':'en')
    +' des Zeitraums fehlten Standortdaten. Aufgaben, die durch Erledigen ihrer Ursache '
    +'verschwunden sind, konnten dort nicht erkannt werden — die Erledigungsquote steht '
    +'zu niedrig, nicht zu hoch.');
  if(Z.ueberfAvg)auf_.push('<b>'+Z.ueberfAvg+'</b> Aufgabe'+(Z.ueberfAvg===1?'':'n')
    +' über die eigene Frist hinaus offen'+(einTag?'':', im Schnitt je Tag')+zusK+'.');
  if(Z.ohneZuwAvg)auf_.push('<b>'+Z.ohneZuwAvg+'</b> offene Aufgabe'+(Z.ohneZuwAvg===1?'':'n')
    +' ohne Zuständigen'+(einTag?' — niemand ist dafür benannt':', im Schnitt je Tag')+zusK+'.');
  if(!tr)auf_.push('Im Weekly KPI Tracker fehlt für diesen Zeitraum jeder Eintrag. '
    +'„Termine vereinbart" steht in keinem System; ohne Eingabe gibt es die Zahl nicht.');
  else if(tr.tage<Z.locTage)auf_.push('Im Weekly KPI Tracker sind nur <b>'+tr.tage+'</b> von '
    +Z.locTage+' Tagen eingetragen — die Terminzahl oben ist entsprechend unvollständig.');
  h+='<div class="st" style="cursor:default">🔎 Auffälligkeiten</div><div class="cd">';
  if(!auf_.length)h+='<div style="font-size:13.5px;color:var(--green);font-weight:600">'
    +'Keine Auffälligkeit — der Zeitraum lief nach Standard.</div>';
  else h+='<div style="font-size:13.5px;line-height:1.75">'
    +auf_.map(s=>'<div style="padding:6px 0;border-bottom:1px solid var(--hairline)">· '+s+'</div>').join('')
    +'</div>';
  h+='</div>';

  // ── Drill-down: Standorte ────────────────────────────────────────────────
  // ── Standorte: der Tag als Rechnung von oben nach unten ──────────────────
  // Eine Tabelle mit zwölf Spalten beantwortet keine Frage. Diese Gliederung
  // beantwortet genau eine: Wofür ist die Kapazität draufgegangen?
  //
  //   Kapazität (= Arbeitszeit)                        100 %
  //     ├─ nicht verfügbar    war nie zu vergeben
  //     └─ verfügbar          davon:
  //          ├─ echte Lücke          ← die Verluste zuerst
  //          ├─ anderweitig genutzt  ← aufklappbar: was genau
  //          ├─ kurze Pausen
  //          └─ am Patienten         ← das Ergebnis zuletzt
  //
  // Die Reihenfolge ist Absicht: Oben steht, was zur Verfügung stand, unten was
  // dabei herauskam, und dazwischen jeder Posten, der es geschmälert hat. Die
  // letzte Zahl ist die bereinigte Auslastung.
  //
  // Die kurzen Pausen stehen mit, weil die Rechnung sonst nicht aufgeht: Eine
  // Unterbrechung unter 20 Minuten gilt nicht als Lücke, sie ist aber Zeit.
  h+='<div class="st" style="cursor:default">🏥 Standorte</div>';
  Object.keys(Z.loc).forEach((k,i)=>{
    const z=Z.loc[k];
    const verf=z.verf;
    const pausen=Math.max(0,verf-z.pg-z.son-z.freiMin);
    const vonKap=m=>z.wm>0?Math.round(100*m/z.wm):0;      // Anteil an der Kapazität
    const vonVerf=m=>verf>0?Math.round(100*m/verf):0;     // Anteil am Verfügbaren
    const br=m=>z.wm>0?(100*m/z.wm).toFixed(2)+'%':'0%';
    const id='pmson'+i;
    h+='<div class="cd" style="margin-bottom:12px">';
    h+='<div class="thd"><h3>'+z.label+'</h3><div>'
      +'<span style="font-size:12px;color:var(--muted);margin-right:8px">bereinigte Auslastung</span>'
      +pmUB(z.auslB,90,80)+'</div></div>';
    // Der Balken liest sich wie die Liste darunter: von links die Posten, die
    // Kapazität gekostet haben, ganz rechts das Ergebnis.
    h+='<div style="display:flex;height:14px;border-radius:100px;overflow:hidden;'
      +'background:var(--fill);margin-bottom:4px">'
      +'<div style="width:'+br(z.blk+z.rsv)+';background:repeating-linear-gradient(45deg,#D8D8DE,#D8D8DE 3px,#EDEDF1 3px,#EDEDF1 6px)" title="nicht verfügbar"></div>'
      +'<div style="width:'+br(z.freiMin)+';background:var(--primary)" title="echte Lücke"></div>'
      +'<div style="width:'+br(z.son)+';background:var(--blue)" title="anderweitig genutzt"></div>'
      +'<div style="width:'+br(pausen)+';background:#C9C9D0" title="kurze Pausen"></div>'
      +'<div style="width:'+br(z.pg)+';background:var(--green)" title="am Patienten"></div>'
      +'</div>';

    const zeile=(txt,min,proz,farbe,extra)=>
      '<div class="bw"'+(extra||'')+'><span>'
      +(farbe?'<span class="sq" style="background:'+farbe+';margin-right:7px"></span>'
             :'<span style="display:inline-block;width:17px"></span>')
      +txt+'</span><span class="vl">'+pmStd(min)
      +(proz==null?'':' <span style="color:var(--muted);font-weight:400">· '+proz+' %</span>')+'</span></div>';

    h+='<div class="bw tt" style="margin-top:8px;padding-top:10px">'
      +'<span>Kapazität</span><span class="vl">'+pmStd(z.wm)
      +' <span style="color:var(--muted);font-weight:400">· 100 %</span></span></div>';
    h+=zeile('<b>nicht verfügbar</b>',z.blk+z.rsv,vonKap(z.blk+z.rsv),'#D8D8DE');
    h+='<div style="margin-left:24px">'
      +zeile('geblockt — FL-Zeit, Inno-Time, Fortbildung',z.blk,null,'')
      +zeile('reserviert — Platz für Dauerpatient, Rezept fehlt',z.rsv,null,'')
      +'</div>';
    h+=zeile('<b>verfügbar</b>',verf,vonKap(verf),'');
    h+='<div style="font-size:11px;color:var(--faint);margin:2px 0 0 24px">'
      +'die folgenden Anteile beziehen sich auf diese '+pmStd(verf)+'</div>';
    h+='<div style="margin-left:24px">'
      +zeile('echte Lücke'+(z.slots?' <span style="color:var(--primary);font-size:11px;font-weight:600">'
        +z.slots+' Termine · '+pmEuro(z.slots)+'</span>':''),
        z.freiMin,vonVerf(z.freiMin),'var(--primary)')
      +zeile('anderweitig genutzt'+(Object.keys(z.sonDetail||{}).length
        ?' <span style="color:var(--blue);font-size:11px;font-weight:600">▸ aufklappen</span>':''),
        z.son,vonVerf(z.son),'var(--blue)',
        Object.keys(z.sonDetail||{}).length
          ?' onclick="pmKlapp(\''+id+'\')" style="cursor:pointer"':'')
      +'<div id="'+id+'" style="display:none;margin-left:24px;padding:8px 0">'
      +(Object.entries(z.sonDetail||{}).sort((a,b)=>b[1]-a[1])
        .map(([t,m])=>'<div class="bw-sub"><span class="s-name">'+t+'</span>'
          +'<span class="s-val">'+pmStd(m)+'</span></div>').join('')||'')
      +'<div style="font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.6">'
      +'Diese Zeit war zu vergeben — es war nur kein Patient da. Was hier als Patientenname steht, '
      +'ist ein benannter Platz für einen Dauerpatienten, dessen Termin noch nicht gebucht ist.'
      +'</div></div>'
      +(pausen>0?zeile('kurze Pausen (unter 20 min, keine Lücke)',pausen,vonVerf(pausen),'#C9C9D0'):'')
      +zeile('<b>am Patienten</b>',z.pg,vonVerf(z.pg),'var(--green)')
      +(z.aus?'<div style="margin-left:24px">'+zeile('davon außer Haus',z.aus,null,'')+'</div>':'')
      +'</div>';
    h+='<div class="bw" style="border:none;padding-top:10px;color:var(--muted);font-size:12px">'
      +'<span>'+z.th+' Therapeuten · '+z.termine+' Termine · '+z.luecken+' Lücken'
      +(z.kggFrei?' · '+z.kggFrei+' KGG-Plätze fehlen':'')+'</span>'
      +'<span>brutto '+(z.ausl==null?'–':z.ausl+' %')+' der Kapazität</span></div>';
    h+='</div>';
  });

  // ── Drill-down: jeder Therapeut einzeln ──────────────────────────────────
  // Die Frage, mit der alles anfing: Wie viel ihrer acht Stunden verbringt
  // Sophia wirklich am Patienten? Sortiert nach der bereinigten Quote, die
  // schwächste oben — dort schaut man zuerst hin.
  if(Z.thListe.length){
    h+='<div class="st" style="cursor:default">👤 Auslastung je Therapeut</div>';
    // Diese Einordnung muss über der Tabelle stehen. Ohne sie liest sich die
    // Liste wie ein Leistungsranking, und das ist sie nicht: Wer unten steht,
    // hat in aller Regel nicht weniger gearbeitet, sondern weniger Termine
    // bekommen. Die Zahl bewertet die Terminvergabe, nicht den Therapeuten.
    h+='<div class="cd" style="margin-bottom:10px;font-size:12.5px;color:var(--muted);line-height:1.7">'
      +'<b style="color:var(--dark)">Was diese Liste misst:</b> ob die verfügbare Zeit gefüllt wurde — '
      +'nicht, wie fleißig jemand war. Wer unten steht, hat meist weniger Termine bekommen, nicht '
      +'weniger gearbeitet. <b style="color:var(--dark)">liegengeblieben</b> rechnet die Lücken in '
      +'Termine um (je 20 min einer, je fehlendem KGG-Platz einer) — das ist die Zahl, mit der sich '
      +'planen lässt.'
      +(einTag?' Ein einzelner Tag ist Zufall; aussagekräftig wird die Reihenfolge erst über zwei '
        +'Wochen. Oben auf „Woche" oder „Monat" umschalten.'
        :' <b style="color:var(--dark)">Spanne</b> ist die schwächste und beste Tagesquote im '
        +'Zeitraum. Eine enge Spanne bei niedrigem Schnitt heißt fehlende Nachfrage; eine weite '
        +'Spanne heißt ungleichmäßige Terminvergabe — zwei verschiedene Probleme.')
      +'</div>';
    h+='<div class="tc"><table><thead><tr><th>Therapeut</th><th>Standort</th>'
      +(einTag?'':'<th class="r">Tage</th>')
      +'<th class="r">Arbeitszeit</th><th class="r">verplanbar</th><th class="r">am Patienten</th>'
      +'<th class="r">außer Haus</th><th class="r">geblockt</th><th class="r">reserviert</th>'
      +'<th class="r">sonstiges</th><th class="r">KGG fehlt</th><th class="r">Termine</th>'
      +'<th class="r">Lücken</th><th class="r">liegengeblieben</th>'
      +(einTag?'':'<th class="r">Spanne</th>')
      +'<th class="r">brutto</th><th class="r">bereinigt</th></tr></thead><tbody>';
    const g=m=>m?pmStd(m):'<span style="color:var(--faint)">–</span>';
    Z.thListe.forEach(x=>{
      h+='<tr><td class="bo">'+x.name+'</td><td>'+x.loc+'</td>'
        +(einTag?'':'<td class="r">'+x.tage+'</td>')
        +'<td class="r">'+pmStd(x.wm)+'</td><td class="r">'+pmStd(x.verf)+'</td>'
        +'<td class="r">'+pmStd(x.pm)+'</td><td class="r">'+g(x.aus)+'</td>'
        +'<td class="r">'+g(x.blk)+'</td><td class="r">'+g(x.rsv)+'</td>'
        +'<td class="r">'+g(x.son)+'</td>'
        +'<td class="r">'+(x.kggFrei?x.kggFrei+' <span style="color:var(--faint)">('+pmStd(x.kggMin)+')</span>':'<span style="color:var(--faint)">–</span>')+'</td>'
        +'<td class="r">'+x.pc+'</td>'
        +'<td class="r">'+(x.n?x.n+' <span style="color:var(--faint)">('+x.min+' min)</span>':'<span style="color:var(--faint)">–</span>')+'</td>'
        +'<td class="r">'+(x.offeneSlots?'<b>'+x.offeneSlots+'</b> <span style="color:var(--faint)">= '+pmEuro(x.offeneSlots)+'</span>':'<span style="color:var(--faint)">–</span>')+'</td>'
        +(einTag?'':'<td class="r">'+(x.tief==null?'<span style="color:var(--faint)">–</span>'
           :x.tief+'–'+x.hoch+' %')+'</td>')
        +'<td class="r">'+pmUB(x.au,85,70)+'</td>'
        +'<td class="r">'+pmUB(x.auB,90,80)+'</td></tr>';
    });
    h+='</tbody></table>'
      +'<div style="font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.7">'
      +'<b>verplanbar</b> ist die Arbeitszeit ohne alles, was nicht zu vergeben war: '
      +'<b>geblockt</b> (FL-Zeit, Inno-Time, interne Fortbildung, Einarbeitung, ganztägige Blocker) '
      +'und <b>reserviert</b> (kurze Blocker — für einen Dauerpatienten freigehaltene Plätze). '
      +'<b>sonstiges</b> bleibt dagegen drin: Besprechungen, Planung und Einweisungen sind das, was '
      +'jemand in einer Lücke erledigt hat, weil kein Patient da war — die Zeit war zu vergeben, sie '
      +'wurde nur anders genutzt. <b>brutto</b> misst gegen die ganze '
      +'Arbeitszeit, <b>bereinigt</b> gegen die verplanbare — nur die zweite Zahl ist ein Urteil '
      +'über die Terminvergabe. <b>KGG fehlt</b> zählt, wie weit eine Gruppenstunde unter dem Soll '
      +'von zwei Personen lag — je fehlender Person eine volle Stunde. Zwei von drei Plätzen gelten '
      +'als voll, der dritte ist Zugabe. Das ist eine andere Größe als eine Zeitlücke: Der Therapeut '
      +'ist dabei beschäftigt, unverkauft ist nur der Platz. Wächst die Spalte <b>sonstiges</b> '
      +'auffällig, fehlt entweder eine Regel oder der Kalender wird nicht gepflegt. '
      +'Über mehrere Tage sind die Quoten das Verhältnis der Summen, nicht der Schnitt der '
      +'Tagesquoten — ein halber Tag zählt sonst so viel wie ein voller.'
      +'</div></div>';
  }

  // ── Drill-down: außer Haus ───────────────────────────────────────────────
  // Hausbesuche und Heime gehören gesondert angeschaut: In der Tourzeit steckt
  // Fahrt- und Rüstzeit, die in der Praxis nicht anfällt. Eine Tour mit 60 %
  // Fahrtanteil ist etwas anderes als ein voller Behandlungstag im Haus, auch
  // wenn beide als „Patientenzeit" in dieselbe Quote laufen.
  if(Z.sAus){
    const anteil=Math.round(100*Z.sAusFahrt/Z.sAus);
    const B=Z.hb,eur=v=>v==null?'–':v.toFixed(2).replace('.',',')+' €';
    h+='<div class="st" style="cursor:default">🚗 Außer Haus</div>';
    h+='<div class="hero" style="grid-template-columns:repeat(3,1fr)">'
      +'<div class="hk"><div class="hk-l">Tourzeit</div><div class="hk-v">'+pmStd(Z.sAus)+'</div>'
        +'<div class="hk-sub">'+Math.round(100*Z.sAus/Math.max(1,Z.sPg))+' % der gesamten Patientenzeit</div></div>'
      +'<div class="hk"><div class="hk-l">davon mit Behandlungseintrag</div>'
        +'<div class="hk-v">'+pmStd(Z.sAus-Z.sAusFahrt)+'</div>'
        +'<div class="hk-sub">'+(100-anteil)+' % der Tourzeit</div></div>'
      // Die Zahl, um die es wirtschaftlich geht: Umsatz je Stunde
      // Therapeutenzeit, Fahrt inbegriffen — gemessen am Ziel aus dem
      // Hausbesuch-Rechner.
      +'<div class="hk"><div class="hk-l">Umsatz je Stunde Tourzeit</div>'
        +'<div class="hk-v"'+(B.eurH!=null&&B.eurH<B.ziel?' style="color:var(--primary)"':'')+'>'
        +eur(B.eurH)+'</div>'
        // Tourzeit ohne Tourdaten heißt nicht „keine Tour", sondern „die Datei
        // ist älter als die Rechnung". Beides als dasselbe zu zeigen schickt
        // jemanden auf die Suche nach einem Fehler, den es nicht gibt.
        +'<div class="hk-sub">'+(B.touren===0?'Kennzahlendatei trägt dafür noch keine Tourdaten'
          :B.eurH==null?'keine bewertbare Tour im Zeitraum'
          :'Ziel '+B.ziel+' € · aus '+B.bewertbar+' von '+B.touren+' Touren')+'</div></div>'
      +'</div>';
    // ── Wer war außer Haus, und was hat es gebracht? ──────────────────────
    // Eine Summe über elf Therapeuten beantwortet die Frage nicht. Hier steht
    // jede Person mit ihren Touren, aufklappbar bis zur einzelnen Tour.
    const hbTh=Z.thListe.filter(x=>x.hbTouren>0)
      .sort((a,b)=>(a.hbEurH==null?1e9:a.hbEurH)-(b.hbEurH==null?1e9:b.hbEurH));
    if(hbTh.length){
      h+='<div class="tc"><table><thead><tr><th>Therapeut</th><th>Standort</th>'
        +'<th class="r">Touren</th><th class="r">Tourzeit</th><th class="r">Behandlungen</th>'
        +'<th class="r">Umsatz</th><th class="r">€ je Stunde</th></tr></thead><tbody>';
      hbTh.forEach((x,i)=>{
        const id='pmhb'+i;
        const unter=x.hbEurH!=null&&x.hbEurH<B.ziel;
        h+='<tr class="t-row-click" onclick="pmKlapp(\''+id+'\')"><td class="bo">'
          +'<span style="color:var(--blue);font-size:11px;margin-right:6px">▸</span>'+x.name+'</td>'
          +'<td>'+x.loc+'</td>'
          +'<td class="r">'+x.hbTouren+'</td>'
          +'<td class="r">'+pmStd(x.hbMin)+'</td>'
          +'<td class="r">'+x.hbBeh+'</td>'
          +'<td class="r">'+Math.round(x.hbUms).toLocaleString('de-DE')+' €</td>'
          +'<td class="r"><b'+(unter?' style="color:var(--primary)"':'')+'>'
          +(x.hbEurH==null?'–':x.hbEurH.toFixed(2).replace('.',',')+' €')+'</b></td></tr>';
        // Die einzelnen Touren. Erst hier sieht man, ob eine schwache Zahl an
        // einer einzelnen langen Fahrt hängt oder am Muster.
        h+='<tr id="'+id+'" style="display:none"><td colspan="7" style="background:var(--bg);padding:10px 14px">';
        x.touren.slice().sort((a,b)=>a.ds<b.ds?-1:1).forEach(t=>{
          h+='<div class="bw-sub"><span class="s-name">'+pmKurz(t.ds)+' · '+t.txt
            +(t.n===0?' <span style="color:var(--amber)">· kein Termin eingetragen</span>'
              :(t.geraten?' <span style="color:var(--amber)">· '+t.geraten+' angenommen</span>':''))
            +'</span>'
            +'<span class="s-pct">'+pmStd(t.min)+'</span>'
            +'<span class="s-pct">'+t.n+' Beh.</span>'
            +'<span class="s-val">'+(t.bewertbar?t.ums+' € · '+t.eurH+' €/h':'–')+'</span></div>';
        });
        h+='</td></tr>';
      });
      h+='</tbody></table></div>';
    }
    // Tourzeit, aber keine Tourdaten: Die Datei wurde von einer älteren Fassung
    // des Patientencheckers geschrieben. Das ist kein Fehler im Dashboard,
    // sondern eine Reihenfolge — und genau das soll dastehen.
    if(!B.touren)h+='<div class="cd" style="font-size:12.5px;line-height:1.7">'
      +'<b style="color:var(--dark)">Für die Wirtschaftlichkeit der Touren fehlen noch die Daten.</b> '
      +'Die Tourzeit oben steht in der Kennzahlendatei, die Tourbilanz noch nicht — die Datei wurde '
      +'geschrieben, bevor diese Rechnung existierte. Sie entsteht, sobald das <b>Praxismanagement '
      +'Werneck</b> einmal geöffnet wurde; danach füllt sich der Abschnitt von selbst, Tag für Tag.'
      +'</div>';
    if(B.touren){
      h+='<div class="cd">';
      h+='<div class="bw tt" style="margin-top:0;padding-top:0;border:none"><span>Touren im Zeitraum</span>'
        +'<span class="vl">'+B.touren+' · '+pmStd(B.min)+'</span></div>';
      h+='<div class="bw"><span>vollständig bewertbar</span><span class="vl">'
        +B.bewertbar+' · '+pmStd(B.bMin)+' · '+Math.round(B.bUms).toLocaleString('de-DE')+' €</span></div>';
      if(B.unterZiel)h+='<div class="bw"><span>davon unter dem Ziel von '+B.ziel+' €/h</span>'
        +'<span class="vl" style="color:var(--primary)">'+B.unterZiel+'</span></div>';
      // Die beiden Zeilen darunter sind keine Wirtschaftlichkeit, sondern
      // Kalenderpflege — und solange sie groß sind, ist die Zahl oben nur ein
      // Ausschnitt. Deshalb stehen sie daneben und nicht im Kleingedruckten.
      if(B.ohneTermine)h+='<div class="bw"><span>nicht bewertbar: kein Termin eingetragen</span>'
        +'<span class="vl" style="color:var(--amber)">'+B.ohneTermine+'</span></div>';
      // Wie viel der Umsatzzahl auf Annahme beruht. Eine Zahl, die zur Hälfte
      // geschätzt ist, soll das sagen — sonst wird aus einer Annahme stillschweigend
      // ein Befund.
      if(B.geraten)h+='<div class="bw"><span>davon mit dem KG-Satz angenommen</span>'
        +'<span class="vl" style="color:var(--amber)">'+B.geraten+' von '+B.beh+' Behandlungen</span></div>';
      h+='<div style="font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.7">'
        +'<b style="color:var(--dark)">Gerechnet wie in deinem Hausbesuch-Rechner:</b> Heilmittel nach '
        +'Preisliste plus Pauschale je Patient (Hausbesuch 22,78 €, Einrichtung 13,09 €), geteilt durch '
        +'die Tourzeit — Fahrt und Rüstzeit also inbegriffen. Genau das ist die Frage: Trägt die Tour, '
        +'wenn man die Wege mitrechnet?<br>'
        +'<b style="color:var(--dark)">Nur rückblickend:</b> Hausbesuche werden nicht im Voraus '
        +'geplant — ein Heimblock für nächste Woche steht im Kalender, die Patienten darin noch nicht. '
        +'Künftige Tage bleiben deshalb außen vor; sie zu bewerten hieße, fehlende Planung als '
        +'fehlenden Umsatz zu zeigen.<br>'
        +'<b style="color:var(--dark)">Nicht bewertbar</b> heißt nicht „unwirtschaftlich". Eine Tour '
        +'ohne eingetragene Termine mit 0 € zu rechnen würde eine Lücke in der Kalenderpflege wie ein '
        +'Ergebnis aussehen lassen.<br>'
        +'<b style="color:var(--dark)">Angenommen</b> heißt: Die Bezeichnung des Termins war leer oder '
        +'stand in keiner Preisliste, gerechnet wurde dann mit dem Satz für allgemeine '
        +'Krankengymnastik (29,63 €). Je kleiner diese Zahl, desto belastbarer die Zahl oben — und '
        +'jede leere Bezeichnung, die jemand ausfüllt, macht sie kleiner.'
        +'</div></div>';
    }
    h+='<div class="cd" style="font-size:12.5px;color:var(--muted);line-height:1.8">'
      +'Die zweite Kachel heißt bewusst nicht „Fahrtzeit". Sie ist die Tourzeit, auf der kein einzelner '
      +'Behandlungstermin liegt — das kann Fahrt und Rüstzeit sein, es kann aber auch Behandlung sein, '
      +'die niemand einzeln eingetragen hat. Welches von beidem, sagen die Daten nicht.'
      +'</div>';
  }

  // ── Wann die Lücken entstehen ────────────────────────────────────────────
  // Die Auswertung, aus der sich direkt etwas tun lässt: Steht freitags ab 15
  // Uhr jede Woche dasselbe Loch, verlegt man Arbeitszeit oder legt einen Kurs
  // hinein. Je Wochentag wird der Schnitt gezeigt, nicht die Summe — sonst
  // sieht ein Montag aus drei Wochen dreimal so schlimm aus wie ein einzelner
  // Freitag.
  const stdK=Object.keys(Z.luStd).map(Number).sort((a,b)=>a-b);
  if(stdK.length){
    const maxS=Math.max.apply(null,stdK.map(hh=>Z.luStd[hh]));
    const wtK=PM_WT.filter(w=>Z.luWt[w]);
    const maxW=wtK.length?Math.max.apply(null,wtK.map(w=>Z.luWt[w].min/Z.luWt[w].tage)):0;
    const balken=(v,max,farbe)=>'<div style="flex:1;height:8px;background:var(--fill);'
      +'border-radius:100px;overflow:hidden;margin:0 10px"><div style="width:'
      +(max>0?Math.round(100*v/max):0)+'%;height:100%;background:'+farbe+'"></div></div>';
    h+='<div class="st" style="cursor:default">⏰ Wann die Lücken entstehen</div>';
    h+='<div class="g2">';
    h+='<div class="cd"><div class="ct">Nach Uhrzeit</div>';
    stdK.forEach(hh=>{
      h+='<div style="display:flex;align-items:center;font-size:12.5px;padding:3px 0">'
        +'<span style="width:52px;color:var(--muted)">'+String(hh).padStart(2,'0')+':00</span>'
        +balken(Z.luStd[hh],maxS,'var(--primary)')
        +'<span style="width:90px;text-align:right;font-feature-settings:&#39;tnum&#39;">'
        +pmStd(Z.luStd[hh])+'</span></div>';
    });
    h+='<div style="font-size:11.5px;color:var(--muted);margin-top:8px">Summe über den Zeitraum. '
      +'Eine Lücke über den Stundenwechsel wird aufgeteilt.</div></div>';
    h+='<div class="cd"><div class="ct">Nach Wochentag · ø je Tag</div>';
    wtK.forEach(w=>{
      const d=Z.luWt[w];
      h+='<div style="display:flex;align-items:center;font-size:12.5px;padding:3px 0">'
        +'<span style="width:52px;color:var(--muted)">'+w+'</span>'
        +balken(d.min/d.tage,maxW,'var(--blue)')
        +'<span style="width:90px;text-align:right;font-feature-settings:&#39;tnum&#39;">'
        +pmStd(d.min/d.tage)+'</span>'
        +'<span style="width:34px;text-align:right;color:var(--faint);font-size:11px">'
        +d.tage+'\u00d7</span></div>';
    });
    h+='<div style="font-size:11.5px;color:var(--muted);margin-top:8px">Durchschnitt je '
      +'Vorkommen des Wochentags — die Zahl rechts sagt, wie oft er im Zeitraum lag.</div></div>';
    h+='</div>';
  }

  // ── Einstellen oder Nachfrage schaffen? ──────────────────────────────────
  // Die strategische Frage, und sie hat genau eine Datengrundlage: die
  // bereinigte Auslastung über einen längeren Zeitraum. Unter PM_MIN_TAGE
  // Werktagen gibt es die Zahl, aber keine Empfehlung — eine
  // Einstellungsentscheidung auf drei Tage zu stützen wäre teurer, als gar
  // keine Zahl zu haben.
  if(Z.auslB!=null){
    const reicht=Z.locTage>=PM_MIN_TAGE;
    const jeTag=Z.locTage?Z.slots/Z.locTage:0;
    let kopf,farbe,text;
    if(Z.auslB>=90){
      kopf='Kapazität wird knapp';farbe='var(--primary)';
      text='Bei <b>'+Z.auslB+' %</b> bereinigter Auslastung ist kaum Luft. Mehr Nachfrage lässt sich '
        +'nicht aufnehmen, Ausfälle schlagen sofort durch, und Wartezeiten kosten Patienten. Das ist '
        +'der Bereich, in dem Einstellen die richtige Antwort ist.';
    }else if(Z.auslB>=80){
      kopf='Gesunder Bereich';farbe='var(--green)';
      text='<b>'+Z.auslB+' %</b> bereinigte Auslastung lässt Raum für Ausfälle und kurzfristige '
        +'Termine, ohne dass Kapazität verfällt. Hier ist weder Einstellen noch eine Marketingaktion '
        +'die naheliegende Antwort — eher die Feinarbeit an den Lücken.';
    }else{
      kopf='Nachfrage fehlt, nicht Kapazität';farbe='var(--amber)';
      text='Bei <b>'+Z.auslB+' %</b> steht Kapazität ungenutzt da. Eine zusätzliche Einstellung würde '
        +'die Lage verschlimmern, nicht verbessern: Die Stunden sind da, die Patienten fehlen. Der '
        +'Hebel liegt bei Terminvergabe, Telefonannahme und Rezeptnachfassen — nicht beim Personal.';
    }
    h+='<div class="st" style="cursor:default">🧭 Einstellen oder Nachfrage schaffen?</div>';
    h+='<div class="cd">';
    h+='<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap">'
      +'<span style="font-size:19px;font-weight:650;letter-spacing:-.022em;color:'+farbe+'">'+kopf+'</span>'
      +'<span style="font-size:12.5px;color:var(--muted)">'+Z.auslB+' % bereinigt über '
      +Z.locTage+' Tag'+(Z.locTage===1?'':'e')+'</span></div>';
    h+='<div style="font-size:13.5px;line-height:1.75">'+text+'</div>';
    h+='<div class="bw" style="margin-top:12px"><span>Liegengebliebene Termine im Zeitraum</span>'
      +'<span class="vl">'+Z.slots+' · '+pmEuro(Z.slots)+'</span></div>';
    if(Z.locTage>1)h+='<div class="bw"><span>im Schnitt je Tag</span><span class="vl">'
      +Math.round(jeTag)+' · '+pmEuro(jeTag)+'</span></div>';
    // Die Hochrechnung erst ab genug Tagen, und ausdrücklich als Hochrechnung.
    if(reicht)h+='<div class="bw tt"><span>hochgerechnet auf 250 Arbeitstage</span>'
      +'<span class="vl">'+pmEuro(jeTag*250)+'</span></div>'
      +'<div style="font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.6">'
      +'Hochgerechnet aus '+Z.locTage+' Tagen zu '+PM_EURO_SLOT+' € je 20-Minuten-Termin. Das ist ein '
      +'Potenzial, kein entgangener Gewinn: Ein Teil dieser Lücken ließe sich auch bei bester '
      +'Terminvergabe nicht füllen.</div>';
    else h+='<div style="font-size:12.5px;color:var(--muted);margin-top:10px;line-height:1.6">'
      +'Für eine Hochrechnung und eine belastbare Empfehlung fehlen Tage: '+Z.locTage+' von '
      +PM_MIN_TAGE+'. Die Zahlen oben stimmen für diesen Zeitraum, aber '+Z.locTage+' Tag'
      +(Z.locTage===1?'':'e')+' sind Wetter, keine Lage.</div>';
    h+='</div>';
  }

  // ── Drill-down: Telefonie Tag für Tag ────────────────────────────────────
  // Telefonie steht für JEDEN Tag in der Datei, auch wenn niemand das
  // Praxismanagement geöffnet hatte: Sie kommt aus dem Webex-Export und wird
  // bei jedem Lauf für den ganzen Monat neu gerechnet. Deshalb ist diese Reihe
  // länger als die Standortzahlen — und deshalb dürfen nachgetragene Gespräche
  // einen Vortag noch korrigieren.
  const telTage=tage.filter(t=>t&&t.tel&&t.tel.anrufe).slice(-31);
  if(telTage.length){
    h+='<div class="st" style="cursor:default">📞 Telefonie · '+telTage.length+' Tage'
      +(K.geteilt?' <span style="font-weight:400;color:var(--muted);font-size:12.5px">· '
        +pmUnd(K.geteilt)+' zusammen</span>':'')+'</div>';
    h+='<div class="tc"><table><thead><tr><th>Tag</th><th class="r">Anrufe</th>'
      +'<th class="r">Warteschlange</th><th class="r">angenommen</th><th class="r">Quote</th>'
      +'<th class="r">verloren</th><th class="r">Problemstunde</th></tr></thead><tbody>';
    telTage.slice().reverse().forEach(t=>{
      const e=t.tel;
      h+='<tr><td class="bo">'+pmKurz(t.ds)+'</td><td class="r">'+e.anrufe+'</td>'
        +'<td class="r">'+e.ws+'</td><td class="r">'+e.wsAn+'</td>'
        +'<td class="r">'+pmUB(e.quote,PM_ZIEL_QUOTE,70)+'</td>'
        +'<td class="r">'+e.verloren+'</td>'
        // Keine Problemstunde unter acht verlorenen Anrufern am Tag: Darunter
        // schlägt eine Stunde mit 2 von 3 die 9-Uhr-Spitze mit 1 von 10, und
        // die „Spitze" ist dann Zufall. Die Datei schreibt sie gar nicht erst.
        +'<td class="r">'+(e.spitze?e.spitze.h+'–'+(e.spitze.h+1)+' Uhr <span style="color:var(--faint)">('+e.spitze.verpasst+')</span>':'<span style="color:var(--faint)">–</span>')+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }

  // ── Drill-down: Rezeptsteuerung ──────────────────────────────────────────
  if(Z.rez){
    const R=Z.rez;
    h+='<div class="st" style="cursor:default">💊 Rezeptsteuerung'
      +(einTag?'':' <span style="font-weight:400;color:var(--muted);font-size:12.5px">· Stand '+pmKurz(Z.letzterLoc)+'</span>')
      +(K.geteilt?' <span style="font-weight:400;color:var(--muted);font-size:12.5px">· '
        +pmUnd(K.geteilt)+' zusammen</span>':'')+'</div>';
    h+='<div class="hero" style="grid-template-columns:repeat(3,1fr)">'
      +'<div class="hk"><div class="hk-l">Fertig, nicht abgerechnet</div><div class="hk-v">'+R.fertig+'</div>'
        +'<div class="hk-sub">'+R.rgOffen+' Rechnungen offen</div></div>'
      +'<div class="hk"><div class="hk-l">Steckengeblieben</div><div class="hk-v">'+R.steck+'</div>'
        +'<div class="hk-sub">'+R.fvo+' Folge-VO offen</div></div>'
      +'<div class="hk"><div class="hk-l">Zuzahlung offen</div><div class="hk-v">'+R.zz+'</div>'
        +'<div class="hk-sub">'+R.zzSum.toLocaleString('de-DE')+' € ausstehend</div></div>'
      +'</div>';
  }

  // ── Was diese Zahlen sind und was nicht ──────────────────────────────────
  h+='<div class="st" style="cursor:default">ℹ️ Woher die Zahlen kommen</div>';
  h+='<div class="cd"><div style="font-size:12.5px;color:var(--muted);line-height:1.8">'
    // Der Doppelquellen-Hinweis muss hier stehen. Im Bereich Finanzen gibt es
    // eine zweite Auslastung — die aus dem Excel-Tracker, je Kalenderwoche.
    // Ohne diesen Satz vergleicht irgendwann jemand die beiden Zahlen und hält
    // den Unterschied für einen Fehler.
    +'<b style="color:var(--dark)">Betrieb</b> schaltet zwischen den Praxen um. <b>KIMOJO Physio</b> '
    +'und <b>KIMOJO Ergo</b> sind die zwei Standorte derselben Kennzahlendatei aus Werneck — '
    +'Auslastung, Lücken, Kapazität, Therapeuten und Touren werden dabei sauber getrennt, weil sie '
    +'je Standort in der Datei stehen. <b>Telefonie, Rezepte und Aufgaben lassen sich nicht trennen</b>: '
    +'Es gibt ein Telefon, eine Verordnungsliste und eine Aufgabenliste für beide. Diese Zahlen stehen '
    +'deshalb unter beiden Betrieben gleich und tragen den Zusatz „zusammen". Das ist keine Lücke in '
    +'den Daten, sondern in der Praxis so.<br>'
    +'<b style="color:var(--dark)">Auslastung</b> ist der <b>Tageswert aus dem thevea-Terminplan</b>: '
    +'gebuchte Patientenzeit geteilt durch Arbeitszeit, über alle Therapeuten zusammen — nicht der '
    +'Schnitt der Einzelquoten. Die Arbeitszeit ist die Wochenvorlage vereinigt mit den tatsächlichen '
    +'Terminen; wer außerhalb seiner Vorlage behandelt, bekommt die Zeit also angerechnet. Jede Minute '
    +'zählt genau einmal: Liegen Einzeltermine in einem Heimblock, ist das eine Zeit, nicht zwei. '
    +'Im Bereich Finanzen steht eine zweite Auslastung — die aus dem Excel-Tracker, je Kalenderwoche. '
    +'Die beiden sind verschieden gerechnet und nicht vergleichbar.<br>'
    +'<b style="color:var(--dark)">Aufgaben</b> werden gegen das <b>Tagespensum</b> gemessen — '
    +'alles, was an dem Tag überhaupt einmal anlag —, nicht gegen den Bestand am Abend. Der Grund: '
    +'Die Aufgabenliste wird gerechnet, nicht gespeichert. Eine Lücke ist eine Aufgabe, weil sie da '
    +'ist; wird sie besetzt, verschwindet sie aus dem Export, statt „abgeschlossen" zu werden. Gegen '
    +'den Abendbestand gemessen stünde, wer zehn von vierundzwanzig Lücken schließt, mit 0 % da — '
    +'und wer alle schließt, hätte gar keine Bezugsgröße mehr. <b>Durch Erledigen der Ursache</b> '
    +'wird deshalb getrennt ausgewiesen. Innerhalb eines Tages ist das fast immer wirklich '
    +'getane Arbeit: Ein Rezeptabbruch braucht in der Praxis mindestens eine Woche, bis er '
    +'abgerechnet und abgeschlossen ist, und fällt deshalb nie am selben Tag aus der Liste. '
    +'Der realistische Gegenfall ist eine kurzfristige Krankmeldung — mit der Schicht '
    +'verschwinden auch die Lücken dieses Therapeuten, ohne dass jemand etwas getan hätte. '
    +'Zusammengezählt wüsste niemand mehr, welcher Teil Arbeit war.<br>'
    +'<b style="color:var(--dark)">Über mehrere Tage</b> werden Mengen summiert und Quoten als '
    +'Verhältnis der Summen gebildet — nie als Schnitt der Tagesquoten, sonst zieht ein ruhiger '
    +'Samstag mit vier Anrufen so stark wie ein Dienstag mit zweihundert. Bestände lassen sich nicht '
    +'summieren: „Offene Arbeit" steht deshalb als Durchschnitt je Tag, der Rezeptrückstand als '
    +'Stand des letzten Tages im Zeitraum.<br>'
    +'<b style="color:var(--dark)">Termine vereinbart</b> und die Neuzugänge kommen aus dem Weekly KPI '
    +'Tracker und werden von Hand eingetragen. Ein Tag ohne Eintrag steht als „keine Eingabe" da und '
    +'nicht als 0 — ein vergessener Eintrag sähe sonst aus wie ein katastrophaler Tag. '
    +'„Neuaufnahmen" (Physio) und „Neuanfragen" (Ergo) bedeuten dasselbe und sind zusammengezählt.<br>'
    +'<b style="color:var(--dark)">Alles übrige</b> kommt aus der Kennzahlendatei, die das '
    +'Praxismanagement Werneck nach jedem Laden schreibt. Jede Zahl ist dieselbe, die dort im Reiter '
    +'steht; hier wird nichts nachgerechnet. Standort- und Aufgabenzahlen entstehen nur, während das '
    +'Dashboard offen ist — fehlt ein Werktag in der Reihe, hat es an dem Tag niemand geöffnet. '
    +'Telefoniezahlen kommen aus dem Webex-Export und werden bei jedem Lauf für den ganzen Monat neu '
    +'gerechnet; nachgetragene Gespräche korrigieren deshalb auch noch einen Vortag.<br>'
    +'<b style="color:var(--dark)">Offene Patientenanfragen</b> fehlen bewusst. Anfragen über WhatsApp '
    +'und das Online-Formular liegen in keiner Datenquelle; eine Zahl dafür wäre geschätzt. '
    +'„Offene Arbeit am Tagesende" ist das, was heute messbar ist.'
    +'</div></div>';

  el.innerHTML=h;
}

// ── Hintergrund-Abgleich des Praxismanagement-Reiters ──────────────────────
// Jede Minute wird nachgesehen, ob der Patientenchecker eine neue
// Kennzahlendatei geschrieben hat. Nachgesehen wird über die
// VERZEICHNISLISTE: ein Feld je Datei entscheidet, ob überhaupt gelesen werden
// muss. Ohne das wären es jede Minute zwei vollständige Dateien, fast immer
// mit demselben Inhalt.
//
// Abgeglichen wird NUR dieser Reiter. Ein vollständiges loadAll() wären drei
// Dutzend Graph-Aufrufe über ein Dutzend Excel-Dateien — für Zahlen, die
// monatlich gebucht und wöchentlich eingetragen werden. Minütlich ändert sich
// allein, was im Praxismanagement passiert.
const PM_TAKT=60000;
let pmStempel=null,pmTakt=null,pmPrueft=false;

// Still, niemals mit Popup: getToken() fragt im Zweifel per Popup nach, und
// das aus einem Hintergrund-Takt wäre falsch — der Browser blockiert es ohne
// Klick, und dem Nutzer spränge es mitten in der Arbeit ins Gesicht.
async function pmTokenStill(){
  try{
    const a=msal_app.getActiveAccount();if(!a)return false;
    const r=await msal_app.acquireTokenSilent({...LR,account:a});
    if(r&&r.accessToken){window._token=r.accessToken;return true;}
  }catch(_){}
  return false;
}

// Ein Finger­abdruck des Ordners: Name und Zeitstempel aller Dateien darin.
// Ändert er sich nicht, ist nichts zu tun.
async function pmOrdnerStempel(){
  const p=KENN_DIR.split('/').filter(s=>s).map(s=>encodeURIComponent(s)).join('/');
  const url='https://graph.microsoft.com/v1.0/drives/'+driveId+'/root:/'+p
    +':/children?$select=name,lastModifiedDateTime&$top=200';
  const hol=()=>fetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+window._token}});
  let r=await hol();
  // Nach einer Stunde ist das Token abgelaufen — der Normalfall an einem
  // Arbeitstag, kein Fehler. Einmal still erneuern und wiederholen.
  if(r.status===401&&await pmTokenStill())r=await hol();
  // 404: Den Ordner gibt es noch nicht. Das ist der Zustand, bevor der
  // Patientenchecker das erste Mal geöffnet wurde.
  if(r.status===404)return'';
  if(!r.ok)return null;
  const j=await r.json();
  return(j.value||[]).map(x=>x.name+'@'+x.lastModifiedDateTime).sort().join('|');
}

async function pmAbgleich(){
  if(pmPrueft||!driveId||!window._token)return false;
  pmPrueft=true;
  try{
    const st=await pmOrdnerStempel();
    if(st===null)return false;
    if(st===pmStempel)return false;
    pmStempel=st;
    D.kenn=await kennLade();
    rPraxis();
    return true;
  }catch(e){console.warn('Praxis-Abgleich:',e);return false;}
  finally{pmPrueft=false;}
}

function pmTaktStart(){
  if(pmTakt)return;
  // Den Stand des ersten Ladens als bekannt vermerken, damit der erste Schlag
  // nicht sofort dieselben Dateien noch einmal holt.
  pmOrdnerStempel().then(st=>{if(st!==null)pmStempel=st;}).catch(()=>{});
  // Ein Reiter im Hintergrund fragt nicht: Dort sieht niemand etwas, und über
  // Nacht offene Reiter würden den Ordner tausendfach abfragen.
  pmTakt=setInterval(()=>{if(!document.hidden)pmAbgleich();},PM_TAKT);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pmAbgleich();});
}

// ═══ PARSERS ═══
function normName(n){n=String(n).trim();if(n.includes(',')){const p=n.split(',');return(p[0].trim()+','+p[1].trim()).toLowerCase();}const p=n.split(/\s+/);if(p.length>=2)return(p[p.length-1]+','+p.slice(0,-1).join(' ')).toLowerCase();return n.toLowerCase();}
let nameMap={};
function buildNameMap(){nameMap={};const tn={};D.ctrl.forEach(t=>{tn[normName(t.n)]=t.n;});const rn=new Set(D.raw.map(r=>r.name));rn.forEach(r=>{const nm=normName(r);if(tn[nm]){nameMap[r]=tn[nm];return;}const pts=r.split(/[,\s]+/);for(const t of Object.keys(tn)){if(pts.some(p=>p.length>2&&t.includes(p.toLowerCase()))){nameMap[r]=tn[t];return;}}});}

function parseBWA(rows){
  const d={umsatz:0,personal:0,raum:0,versicherung:0,fahrzeuge:0,werbung:0,sonstige:0,gesamtkosten:0,ergebnis:0,items:{}};
  let curCat=null;
  for(const r of rows){
    const z=String(r[0]||'').trim(),k=String(r[1]||'').trim(),b=String(r[2]||'').trim();
    let v=parseFloat(r[3])||0;
    if(z==='1006')d.umsatz=v;
    else if(z==='1164'){d.personal=v;curCat='Personal';}
    else if(z==='1190'){d.raum=v;curCat='Raum/Energie';}
    else if(z==='1208'){d.versicherung=v;curCat='Versicherung';}
    else if(z==='1216'){d.fahrzeuge=v;curCat='Fahrzeuge';}
    else if(z==='1224'){d.werbung=v;curCat='Werbung';}
    else if(z==='1264'){d.sonstige=v;curCat='Sonstige';}
    else if(z==='1294')d.gesamtkosten=v;
    else if(z==='1374')d.ergebnis=v;
    else if(z==='1200'||z==='1290')curCat=null;
    if(!z&&k&&curCat&&v!==0){
      if(!d.items[curCat])d.items[curCat]=[];
      d.items[curCat].push({n:b.replace(/^\s+/,''),v});
    }
  }
  try{d.voll=bwaVoll(rows);}catch(e){console.warn('BWA voll:',e);}d.jahr=bwaJahr(rows);
  return d;
}

async function loadBank(fileId){
  // Try XLSX first (via Graph API sheets), then CSV fallback
  try{
    const sheets=await getSheetNames(fileId);
    if(sheets&&sheets.length>0){
      const data=await getSheet(fileId,sheets[0]);
      if(data&&data.length>1){const m=parseBankXLSX(data);try{Object.defineProperty(m,'voll',{value:bankVoll(data),enumerable:false});Object.defineProperty(m,'zeilen',{value:data,enumerable:false});}catch(e){console.warn('Bank voll:',e);}return m;}
    }
  }catch(e){console.log('Bank XLSX failed, trying CSV...',e);}
  try{
    const txt=await getFileContent(fileId);
    if(txt)return parseBankCSV(txt);
  }catch(e){console.warn('Bank CSV also failed:',e);}
  return {};
}
function parseBankXLSX(rows){
  const months={};const MNB=['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  // Find column indices from header row
  const hdr=rows[0]||[];
  let dateCol=-1,betragCol=-1,saldoCol=-1;
  for(let c=0;c<hdr.length;c++){
    const h=String(hdr[c]||'').toLowerCase();
    if(h.includes('buchungstag'))dateCol=c;
    if(h==='betrag')betragCol=c;
    if(h.includes('saldo'))saldoCol=c;
  }
  if(dateCol<0)dateCol=4;if(betragCol<0)betragCol=11;if(saldoCol<0)saldoCol=13;
  console.log('Bank XLSX cols: date='+dateCol+' betrag='+betragCol+' saldo='+saldoCol+' hdrLen='+hdr.length);
  const monthDates={};// track latest date per month for saldo
  for(let i=1;i<rows.length;i++){
    const r=rows[i];if(!r)continue;
    let month=null,dateVal=null;const dv=r[dateCol];
    if(!dv)continue;
    if(typeof dv==='number'&&dv>40000){dateVal=new Date((dv-25569)*86400000);month=dateVal.getUTCMonth()+1;}
    else{const s=String(dv);
      const m=s.match(/(\d{2})\.(\d{2})\.(\d{4})/);if(m){month=parseInt(m[2]);dateVal=new Date(parseInt(m[3]),month-1,parseInt(m[1]));}
      else{const m2=s.match(/(\d{4})-(\d{2})-(\d{2})/);if(m2){month=parseInt(m2[2]);dateVal=new Date(parseInt(m2[1]),month-1,parseInt(m2[3]));}
      else{try{dateVal=new Date(dv);if(!isNaN(dateVal)){month=dateVal.getMonth()+1;}}catch(e){}}}}
    if(!month||month<1||month>12)continue;
    if(dateVal&&!isNaN(dateVal)&&dateVal.getFullYear()!==cockpitJahr()&&dateVal.getUTCFullYear()!==cockpitJahr())continue;
    let betrag=r[betragCol];
    if(typeof betrag==='string')betrag=parseFloat(betrag.replace(/\./g,'').replace(',','.'));
    else betrag=parseFloat(betrag);
    if(isNaN(betrag))continue;
    let saldo=saldoCol<r.length?r[saldoCol]:null;
    if(typeof saldo==='string')saldo=parseFloat(saldo.replace(/\./g,'').replace(',','.'));
    else saldo=parseFloat(saldo);
    if(isNaN(saldo))saldo=null;
    const mn=MNB[month];
    if(!months[mn])months[mn]={ein:0,aus:0,saldo:0};
    if(betrag>0)months[mn].ein+=betrag;else months[mn].aus+=betrag;
    // Use saldo from the first row (which is the latest date in bank exports)
    if(saldo!==null){
      if(!monthDates[mn]){monthDates[mn]=dateVal;months[mn].saldo=saldo;}
      else if(dateVal&&dateVal>=monthDates[mn]){monthDates[mn]=dateVal;months[mn].saldo=saldo;}
    }
  }
  return months;
}
function parseBankCSV(csv){
  const lines=csv.split('\n');
  const months={};
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(';');
    if(cols.length<14)continue;
    const dateStr=cols[4],betragStr=cols[11],saldoStr=cols[13];
    if(!dateStr||!betragStr)continue;
    const m=dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if(!m)continue;
    const month=parseInt(m[2]);
    const betrag=parseFloat(betragStr.replace(/\./g,'').replace(',','.'));
    const saldo=parseFloat(saldoStr.replace(/\./g,'').replace(',','.'));
    if(isNaN(betrag))continue;
    const mn=['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][month];
    if(!months[mn])months[mn]={ein:0,aus:0,saldo:0};
    if(betrag>0)months[mn].ein+=betrag;else months[mn].aus+=betrag;
    months[mn].saldo=saldo;
  }
  return months;
}

// Parse Termine: extract "ø Termine pro Woche" per KW (one value per week)
function parseTermine(rows){
  if(!rows||rows.length<2)return[];
  const hdr=rows[0]||[];
  let avgCol=-1,kwCol=-1,dateCol=-1;
  for(let c=0;c<hdr.length;c++){
    const h=String(hdr[c]||'').toLowerCase();
    if(h.includes('ø termine pro woche')||h.includes('o termine pro woche'))avgCol=c;
    if(h==='kw')kwCol=c;
    if(h==='datum')dateCol=c;
  }
  if(avgCol<0||kwCol<0)return[];
  const byKW={};
  for(let i=1;i<rows.length;i++){
    const r=rows[i];if(!r)continue;
    const v=parseFloat(r[avgCol]);if(isNaN(v))continue;
    const kw=parseInt(r[kwCol]);if(!kw||kw<1||kw>53)continue;
    let dateObj=null;
    const dv=r[dateCol];
    if(typeof dv==='number'&&dv>40000)dateObj=new Date(Math.round((dv-25569)*86400000));
    else if(dv){const s=String(dv);const m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)dateObj=new Date(parseInt(m[1]),parseInt(m[2])-1,parseInt(m[3]));}
    byKW[kw]={kw,avg:v,date:dateObj,month:dateObj?MN[dateObj.getMonth()]:''};
  }
  return Object.values(byKW).sort((a,b)=>a.kw-b.kw);
}

function parseCtrl(rows){
  const t=[];const MNi=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  for(let i=0;i<rows.length;i++){
    const n=String(rows[i][0]||'').trim();
    if(!n||n==='GESAMT'||n==='Therapeut:in'||n.startsWith('Team-Zuordnung')||n.startsWith('Team-Spalte')||n.startsWith('BM ')||n.startsWith('Daten')||n.startsWith('>65')||n.startsWith('Verfügbare')||n.startsWith('Hinweis')||n.startsWith('Anleitung'))continue;
    const s=String(rows[i][2]||'').trim();const b=String(rows[i][3]||'').trim();
    const mh={};for(let mi=0;mi<12;mi++){const v=parseFloat(rows[i][4+mi]);if(!isNaN(v)&&v>0)mh[MNi[mi]]=v;}
    let last=0;MNi.forEach(m=>{if(mh[m])last=mh[m];else if(last>0)mh[m]=last;});
    const w=mh['Jan']||parseFloat(rows[i][4])||0;
    if(w>0||Object.keys(mh).length>0)t.push({n,s,b,wh:w,mh});
  }
  return t;
}

function getWhM(t, months) {
  let tot = 0;
  months.forEach(m => {
    const wh = t.mh && t.mh[m] ? t.mh[m] : (t.wh || 0);
    tot += wh * 4.33;
  });
  return tot;
}
function getWhW(t,months){if(!months.length)return t.wh||0;let s=0,c=0;months.forEach(m=>{const wh=t.mh&&t.mh[m]?t.mh[m]:(t.wh||0);if(wh>0){s+=wh;c++;}});return c>0?s/c:(t.wh||0);}

function parseRaw(rows){
  const d=[];
  function getWeek(dt){const t=new Date(dt.getFullYear(),0,1);const dn=(dt.getDay()+6)%7;dt.setDate(dt.getDate()-dn+3);const fw=new Date(dt.getFullYear(),0,4);return 1+Math.round(((dt-fw)/864e5-3+(fw.getDay()+6)%7)/7);}
  for(let i=1;i<rows.length;i++){
    const r=rows[i],name=r[0],price=parseFloat(r[7])||0;
    if(!name||price<=0)continue;
    let month=null,week=null,dateObj=null;
    const dv=r[1];
    if(typeof dv==='number'&&dv>40000){dateObj=new Date(Math.round((dv-25569)*86400000));month=dateObj.getUTCMonth()+1;}
    else{const s=String(dv),m=s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);if(m){month=parseInt(m[2]);dateObj=new Date(Date.UTC(parseInt(m[3]<100?2000+parseInt(m[3]):m[3]),month-1,parseInt(m[1])));}
    else{const m2=s.match(/(\d{4})-(\d{2})-(\d{2})/);if(m2){month=parseInt(m2[2]);dateObj=new Date(Date.UTC(parseInt(m2[1]),month-1,parseInt(m2[3])));}}}
    const clean=String(name).replace(/\s*\((?:Physio|Ergo)\s*(?:-\s*)?#\d+\)\s*/g,'').replace(/\s+/g,' ').trim();
    const billed=String(r[8]||'').toUpperCase()==='WAHR'||r[8]===true;
    const wd=dateObj?(dateObj.getUTCDay()+6)%7:null;
    if(dateObj)week=getWeek(new Date(dateObj.getTime()));
    let startMin=null,durMin=0;
    const tv=r[2];
    if(typeof tv==='number'){startMin=Math.round(tv*1440);}else{const timeStr=String(tv||'');const tm=timeStr.match(/(\d{1,2}):(\d{2})/);if(tm)startMin=parseInt(tm[1])*60+parseInt(tm[2]);}
    const dv3=r[3];
    if(typeof dv3==='number'){durMin=Math.round(dv3*1440);}else{const durStr=String(dv3||'');const dm=durStr.match(/(\d{1,2}):(\d{2})/);if(dm)durMin=parseInt(dm[1])*60+parseInt(dm[2]);}
    const dateKey=dateObj?(dateObj.getUTCFullYear()+'-'+(dateObj.getUTCMonth()+1)+'-'+dateObj.getUTCDate()):null;
    d.push({name:clean,month,year:dateObj?dateObj.getUTCFullYear():null,week,price,billed,wd,startMin,durMin,dateKey,leistung:String(r[6]||'').trim(),posNr:String(r[5]||'').trim(),patient:String(r[4]||'').trim(),vo:String(r[9]||'').trim()});
  }
  return d;
}

// ═══ PLAN PARSERS ═══
function parsePlanDashboard(rows){
  // Dashboard sheet: rows with Plankosten, Planeinnahmen, Plangewinn, Rentabilität
  // KIMOJO: label at col 0, data at cols 2..13 (Jan..Dez)
  // PHFIP: label at col 1, data at cols 3..14 (1..12)
  const plan={therapie:{},club:{}};
  let section='therapie';
  // Detect format: check if col 0 or col 1 has the labels
  let labelCol=0,dataStart=2;
  for(const r of rows){
    if(String(r[1]||'').trim()==='Plankosten'||String(r[1]||'').trim()==='Plan 26 Therapie'){labelCol=1;dataStart=3;break;}
    if(String(r[0]||'').trim()==='Plankosten'){labelCol=0;dataStart=2;break;}
  }
  for(const r of rows){
    const label=String(r[labelCol]||'').trim();
    if(label==='Club 26'||label==='Plan 25 Club'||label==='Plan 26 Club')section='club';
    if(label==='Therapie 26'||label==='Plan 26 Therapie')section='therapie';
    if(label==='Plankosten'){
      for(let i=0;i<12;i++){plan[section]['kosten_'+MN[i]]=Math.abs(parseFloat(r[dataStart+i])||0);}
    }
    if(label==='Planeinnahmen'){
      for(let i=0;i<12;i++){plan[section]['einnahmen_'+MN[i]]=parseFloat(r[dataStart+i])||0;}
    }
    if(label==='Plangewinn'||label==='Plangewinn DB II'){
      for(let i=0;i<12;i++){plan[section]['gewinn_'+MN[i]]=parseFloat(r[dataStart+i])||0;}
    }
    if(label==='Rentabilität'){
      for(let i=0;i<12;i++){const v=parseFloat(r[dataStart+i]);plan[section]['renta_'+MN[i]]=!isNaN(v)?v:0;}
    }
    if(label==='Davon Personalkosten Plan'||label==='Gesamtkosten Personal'){
      for(let i=0;i<12;i++){plan[section]['personal_'+MN[i]]=parseFloat(r[dataStart+i])||0;}
    }
  }
  return plan;
}

function parsePlanEinnahmen(rows){
  // Per-therapist plan revenue per month (KIMOJO format)
  // Row format: [None, Name, Jan..Dez, Summe]
  const byName={};
  let section='physio';
  for(const r of rows){
    const label=String(r[1]||'').trim();
    if(label==='Ergo'){section='ergo';continue;}
    if(label==='Summe Umsatz'||label==='Summe Umsatz Ergo'||label==='Gesamtumsatz'||label==='Anzahl Physios'||label==='Anzahl Ergos'||label==='Summe Therapeuten'||label==='Einnahmen Physio'||!label)continue;
    const hasVals=[2,3,4,5,6,7,8,9,10,11,12,13].some(i=>parseFloat(r[i])>0);
    if(!hasVals)continue;
    const name=label.replace(/\s+$/,'');
    byName[name]={section};
    for(let i=0;i<12;i++){
      byName[name][MN[i]]=parseFloat(r[2+i])||0;
    }
  }
  return byName;
}

function parsePlanEinnahmenPHFIP(rows){
  // Per-therapist plan revenue (PHFIP format)
  // Row format: [None, Name (with hours info), Jan..Dez, Summe, Stunden]
  const byName={};
  let stopped=false;
  for(const r of rows){
    const label=String(r[1]||'').trim();
    // Stop parsing at "Aktueller Umsatz" section (contains Ist-Werte, not Plan!)
    if(label==='Aktueller Umsatz'||label.startsWith('Aktueller Umsatz')){stopped=true;continue;}
    if(stopped)continue;
    if(!label||label==='Einnahmen Ortsmitte'||label==='Summe Umsatz'||label==='Anzahl Physios'||label.startsWith('Produktverkauf'))continue;
    const hasVals=[2,3,4,5,6,7,8,9,10,11,12,13].some(i=>parseFloat(r[i])>0);
    if(!hasVals)continue;
    // Clean name: remove hours info like "(30h)" or "(40h) geplant am Px 30"
    const name=label.replace(/\s*\([\d]+h\).*$/,'').replace(/\s+$/,'').trim();
    byName[name]={section:'physio'};
    for(let i=0;i<12;i++){
      byName[name][MN[i]]=parseFloat(r[2+i])||0;
    }
  }
  return byName;
}

// ═══ PLAN HELPERS ═══

// Parse Planausgaben and map to BWA categories
function parsePlanAusgaben(rows){
  const cats={Personal:{},Raum:{},Versicherung:{},Fahrzeuge:{},Werbung:{},Sonstige:{}};
  MN.forEach(m=>{Object.keys(cats).forEach(c=>{cats[c][m]=0;});});
  
  // Keyword mapping for Sachkosten -> BWA category
  function mapToCat(name){
    const nl=name.toLowerCase();
    if(nl.includes('werbung')||nl.includes('marketing')||nl.includes('reisekosten'))return'Werbung';
    if(nl.includes('raumkosten')||nl.includes('nebenkosten')||nl.includes('stellplatz')||nl.includes('miete')||nl.includes('kosten für räume'))return'Raum';
    if(nl.includes('versicherung')||nl.includes('beiträge'))return'Versicherung';
    if(nl.includes('fahrzeug'))return'Fahrzeuge';
    return'Sonstige';
  }
  
  let section='sachkosten';
  let nameCol=1,dataStart=3;
  
  for(let ri=0;ri<rows.length;ri++){
    const r=rows[ri];
    const label=String(r[nameCol]||'').trim();
    if(!label)continue;
    const labelL=label.toLowerCase();
    
    // Detect section by known headers
    if(labelL==='planausgaben zentral'||labelL==='planausgaben ortsmitte'){section='sachkosten';continue;}
    if(labelL==='physio'||labelL==='ergo'||labelL.includes('over head')||labelL.includes('overhead')||
       labelL==='personal'||labelL.includes('praxismanag')){section='personal';continue;}
    
    // Skip summary/total rows
    if(labelL.startsWith('summe')||labelL.startsWith('gesamt')||labelL.startsWith('davon')||
       labelL.startsWith('anzahl')||labelL==='summe 1')continue;
    
    // Check if this row has month data (col dataStart..dataStart+11)
    const vals=[];let hasVals=false;
    for(let i=0;i<12;i++){const v=parseFloat(r[dataStart+i])||0;vals.push(v);if(v!==0)hasVals=true;}
    if(!hasVals)continue;
    
    // Check if value in col dataStart is a month header string (not data)
    if(typeof r[dataStart]==='string'&&isNaN(parseFloat(r[dataStart])))continue;
    
    if(section==='personal'){
      for(let i=0;i<12;i++){cats.Personal[MN[i]]+=vals[i];}
    } else {
      const cat=mapToCat(label);
      for(let i=0;i<12;i++){cats[cat][MN[i]]+=vals[i];}
    }
  }
  return cats;
}

function getPlanCatForMonths(months,cat){
  // Sum plan category across both entities for given months
  let total=0;
  const sources=[];
  if(aS==='Alle'||aS==='KIMOJO Gesamt'||aS==='KIMOJO Physio'||aS==='KIMOJO Ergo'){
    if(D.planK.ausgaben)sources.push(D.planK.ausgaben);
  }
  if(aS==='Alle'||aS==='PF im Park'){
    if(D.planP.ausgaben)sources.push(D.planP.ausgaben);
  }
  sources.forEach(src=>{
    if(!src[cat])return;
    months.forEach(m=>{total+=(src[cat][m]||0);});
  });
  return total;
}

function getPlanForMonths(months,key){
  // Sum plan values for active months, respecting standort filter
  let total=0;
  months.forEach(m=>{
    // KIMOJO plan
    if(aS==='Alle'||aS==='KIMOJO Gesamt'||aS==='KIMOJO Physio'||aS==='KIMOJO Ergo'){
      if(D.planK.dashboard){
        total+=(D.planK.dashboard.therapie[key+'_'+m]||0);
      }
    }
    // PHFIP plan
    if(aS==='Alle'||aS==='PF im Park'){
      if(D.planP.dashboard){
        total+=(D.planP.dashboard.therapie[key+'_'+m]||0);
      }
    }
  });
  return total;
}

function getPlanTherapist(name,months){
  // Try to match therapist name from both plan sources
  const allPlans=[];
  if(D.planK.einnahmen)allPlans.push(D.planK.einnahmen);
  if(D.planP.einnahmen)allPlans.push(D.planP.einnahmen);
  
  for(const planEin of allPlans){
    const planNames=Object.keys(planEin).filter(n=>!n.startsWith('Planstelle'));
    // Direct match
    let match=planNames.find(pn=>pn.toLowerCase()===name.toLowerCase());
    if(!match){
      // Fuzzy: match name parts
      const parts=name.split(/[,\s]+/).filter(p=>p.length>2);
      // Try matching with multiple parts first (more specific)
      if(parts.length>=2){
        match=planNames.find(pn=>{
          const pnL=pn.toLowerCase();
          return parts.filter(p=>pnL.includes(p.toLowerCase())).length>=2;
        });
      }
      // Fallback: single part match (only for single-word names like "Yasmin")
      if(!match&&parts.length===1){
        match=planNames.find(pn=>pn.toLowerCase()===parts[0].toLowerCase());
        if(!match)match=planNames.find(pn=>pn.toLowerCase().includes(parts[0].toLowerCase())&&pn.split(/\s+/).length<=2);
      }
      // Last resort: single part of multi-word name, but require it's the surname (first part)
      if(!match&&parts.length>=2){
        const surname=parts[0].toLowerCase();
        match=planNames.find(pn=>pn.toLowerCase().startsWith(surname)||pn.toLowerCase().includes(surname+' ')||pn.toLowerCase().includes(surname+','));
      }
    }
    if(match){
      let total=0;
      months.forEach(m=>{total+=(planEin[match][m]||0);});
      if(total>0)return total;
    }
  }
  return 0;
}

function getPlanTherapistMonth(name,month){
  // Get plan for a single month
  const allPlans=[];
  if(D.planK.einnahmen)allPlans.push(D.planK.einnahmen);
  if(D.planP.einnahmen)allPlans.push(D.planP.einnahmen);
  for(const planEin of allPlans){
    const planNames=Object.keys(planEin).filter(n=>!n.startsWith('Planstelle'));
    let match=planNames.find(pn=>pn.toLowerCase()===name.toLowerCase());
    if(!match){
      const parts=name.split(/[,\s]+/).filter(p=>p.length>2);
      if(parts.length>=2){match=planNames.find(pn=>{const pnL=pn.toLowerCase();return parts.filter(p=>pnL.includes(p.toLowerCase())).length>=2;});}
      if(!match&&parts.length===1){match=planNames.find(pn=>pn.toLowerCase()===parts[0].toLowerCase());if(!match)match=planNames.find(pn=>pn.toLowerCase().includes(parts[0].toLowerCase())&&pn.split(/\s+/).length<=2);}
      if(!match&&parts.length>=2){const surname=parts[0].toLowerCase();match=planNames.find(pn=>pn.toLowerCase().startsWith(surname)||pn.toLowerCase().includes(surname+' ')||pn.toLowerCase().includes(surname+','));}
    }
    if(match){const v=planEin[match][month]||0;if(v>0)return v;}
  }
  return 0;
}

// ═══ MONTH HELPERS ═══
const MN=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
function getMonthFromSheet(name){
  const nl=name.toLowerCase();
  const longMap={januar:'Jan',february:'Feb',februar:'Feb',märz:'Mär',march:'Mär',april:'Apr',mai:'Mai',may:'Mai',juni:'Jun',june:'Jun',juli:'Jul',july:'Jul',august:'Aug',september:'Sep',oktober:'Okt',october:'Okt',november:'Nov',dezember:'Dez',december:'Dez'};
  for(const[long,short] of Object.entries(longMap)){if(nl.includes(long))return short;}
  for(const m of MN){if(name.includes(m)||nl.includes(m.toLowerCase()))return m;}
  const enMap={Jan:'Jan',Feb:'Feb',Mar:'Mär',Apr:'Apr',May:'Mai',Jun:'Jun',Jul:'Jul',Aug:'Aug',Sep:'Sep',Oct:'Okt',Nov:'Nov',Dec:'Dez'};
  for(const[en,de] of Object.entries(enMap)){if(nl.includes(en.toLowerCase()))return de;}
  return null;
}
function getBWAMonths(bwa){return Object.keys(bwa).filter(s=>!bwa[s]||!bwa[s].jahr||bwa[s].jahr===cockpitJahr()).map(s=>({sheet:s,month:getMonthFromSheet(s)})).filter(x=>x.month);}
function getBWA(bwa,month){const entry=getBWAMonths(bwa).find(x=>x.month===month);return entry?bwa[entry.sheet]:null;}
function sumBWA(bwa,months){
  const s={umsatz:0,personal:0,raum:0,versicherung:0,fahrzeuge:0,werbung:0,sonstige:0,gesamtkosten:0,ergebnis:0,items:{}};
  months.forEach(m=>{const d=getBWA(bwa,m);if(!d)return;
    ['umsatz','personal','raum','versicherung','fahrzeuge','werbung','sonstige','gesamtkosten','ergebnis'].forEach(k=>s[k]+=d[k]);
    Object.entries(d.items||{}).forEach(([cat,subs])=>{if(!s.items[cat])s.items[cat]=[];
      subs.forEach(sub=>{const ex=s.items[cat].find(x=>x.n===sub.n);if(ex)ex.v+=sub.v;else s.items[cat].push({...sub});});});});
  return s;
}

// ═══ AUSLASTUNG ═══
function getCurrentKW(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+3-(d.getDay()+6)%7);const w1=new Date(d.getFullYear(),0,4);return 1+Math.round(((d.getTime()-w1.getTime())/864e5-3+(w1.getDay()+6)%7)/7);}
function parseAuslastungSheet(data){
  const kwRow=data[2]||[],monthRow=data[1]||[],physioSum=data[19]||[];
  let ergoSum=null;
  for(let i=21;i<Math.min(data.length,35);i++){if(data[i]&&data[i][0]&&String(data[i][0]).includes('Summe')){ergoSum=data[i];break;}}
  const kws=[];let col=5,lastP=null;
  while(col<kwRow.length){
    const kw=kwRow[col];
    if(kw&&typeof kw==='number'&&kw>0&&kw<53){
      const ac=col+2,pv=physioSum[ac],ev=ergoSum?ergoSum[ac]:null,mo=String(monthRow[col]||'');
      if(pv&&typeof pv==='number'&&pv>0&&pv<=1.5){
        const pp=Math.round(pv*1000)/10;
        const isReal=lastP===null||Math.abs(pp-lastP)>0.01;
        if(!isReal)break;
        lastP=pp;
        kws.push({kw:Math.round(kw),physio:pp,ergo:(ev&&typeof ev==='number'&&ev>0&&ev<=1.5)?Math.round(ev*1000)/10:null,month:mo});
      }
      col+=4;
    }else col++;
  }
  return kws;
}
function changeAuslKW(d){const allKWs=[...D.auslK.map(x=>x.kw),...D.auslP.map(x=>x.kw)];if(!allKWs.length)return;const min=Math.min(...allKWs),max=Math.max(...allKWs);selectedAuslKW=Math.max(min,Math.min(max,selectedAuslKW+d));rAusl();}
function auslColor(v){return v>=90?'var(--green)':v>=80?'var(--amber)':'var(--red)';}
function rAusl(){
  const kD=D.auslK,pD=D.auslP,curKW=getCurrentKW();
  const kwK=kD.find(d=>d.kw===selectedAuslKW),kwP=pD.find(d=>d.kw===selectedAuslKW);
  const month=kwK?kwK.month:kwP?kwP.month:'';
  document.getElementById('auslKWTitle').textContent='KW '+selectedAuslKW;
  document.getElementById('auslKWInfo').textContent=month+' · Aktuelle KW: '+curKW;
  function bar(label,val,dotColor){
    if(val===null||val===undefined)return'<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><span style="font-family:var(--font);font-size:12px;font-weight:700;width:100px">'+label+'</span><span style="color:var(--muted);font-size:12px">Keine Daten</span></div>';
    const w=Math.min(100,Math.max(5,val)),c=auslColor(val);
    return'<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><span style="font-family:var(--font);font-size:12px;font-weight:700;width:100px;display:flex;align-items:center;gap:6px"><span class="dot" style="background:'+dotColor+'"></span>'+label+'</span><div style="flex:1;height:28px;background:#f3f2ef;border-radius:8px;overflow:hidden;position:relative"><div style="height:100%;width:'+w+'%;background:'+c+';border-radius:8px;display:flex;align-items:center;padding:0 10px;font-family:var(--font);font-size:11px;font-weight:800;color:#fff;min-width:40px">'+val+'%</div><div style="position:absolute;top:0;bottom:0;left:90%;width:2px;background:var(--dark);opacity:.15"></div></div><span style="font-family:var(--font);font-size:14px;font-weight:900;width:55px;text-align:right;color:'+c+'">'+val+'%</span></div>';
  }
  const maxKW=curKW-1;
  const kwMonth=month;
  const kMo=kD.filter(d=>d.month===kwMonth&&d.kw<=maxKW),pMo=pD.filter(d=>d.month===kwMonth&&d.kw<=maxKW);
  const kPM=kMo.length?Math.round(kMo.reduce((s,d)=>s+d.physio,0)/kMo.length*10)/10:null;
  const kEM=kMo.filter(d=>d.ergo!==null).length?Math.round(kMo.filter(d=>d.ergo!==null).reduce((s,d)=>s+d.ergo,0)/kMo.filter(d=>d.ergo!==null).length*10)/10:null;
  const pPM=pMo.length?Math.round(pMo.reduce((s,d)=>s+d.physio,0)/pMo.length*10)/10:null;
  const kY=kD.filter(d=>d.kw<=maxKW),pY=pD.filter(d=>d.kw<=maxKW);
  const kPY=kY.length?Math.round(kY.reduce((s,d)=>s+d.physio,0)/kY.length*10)/10:null;
  const kEY=kY.filter(d=>d.ergo!==null).length?Math.round(kY.filter(d=>d.ergo!==null).reduce((s,d)=>s+d.ergo,0)/kY.filter(d=>d.ergo!==null).length*10)/10:null;
  const pPY=pY.length?Math.round(pY.reduce((s,d)=>s+d.physio,0)/pY.length*10)/10:null;
  let h='<div class="hk" style="padding:20px"><div class="hk-l">KW '+selectedAuslKW+' · Aktuell</div>'+bar('KIMOJO Physio',kwK?kwK.physio:null,'var(--red)')+bar('KIMOJO Ergo',kwK?kwK.ergo:null,'var(--accent)')+bar('PHFIP Physio',kwP?kwP.physio:null,'var(--teal)')+'</div>';
  h+='<div class="hk" style="padding:20px"><div class="hk-l">ø '+(kwMonth||'Monat')+'</div>'+bar('KIMOJO Physio',kPM,'var(--red)')+bar('KIMOJO Ergo',kEM,'var(--accent)')+bar('PHFIP Physio',pPM,'var(--teal)')+'</div>';
  h+='<div class="hk" style="padding:20px"><div class="hk-l">ø YTD</div>'+bar('KIMOJO Physio',kPY,'var(--red)')+bar('KIMOJO Ergo',kEY,'var(--accent)')+bar('PHFIP Physio',pPY,'var(--teal)')+'</div>';
  document.getElementById('auslDiv').innerHTML=h;
}


// ═══ AUS DEM RENDER-TEIL ÜBERNOMMEN ═══
function getActiveMonths(){
  if(aM==='AKTUELL'){
    const now=new Date();const currentMonth=cockpitJahr()<now.getFullYear()?11:now.getMonth();// 0-based; abgeschlossenes Jahr = alle Monate
    const rawMonths=new Set(D.raw.map(r=>r.month).filter(Boolean).map(m=>MN[m-1]));
    const bwaMonths=new Set([...getBWAMonths(D.bwaK).map(x=>x.month),...getBWAMonths(D.bwaP).map(x=>x.month)]);
    const all=new Set([...bwaMonths,...rawMonths]);
    return MN.filter((m,i)=>all.has(m)&&i<=currentMonth);// Only up to and including current month
  }
  if(aM==='YTD'){
    const now=new Date();const currentMonth=cockpitJahr()<now.getFullYear()?12:now.getMonth();
    const bwaMonths=new Set([...getBWAMonths(D.bwaK).map(x=>x.month),...getBWAMonths(D.bwaP).map(x=>x.month)]);
    const rawMonths=new Set(D.raw.map(r=>r.month).filter(Boolean).map(m=>MN[m-1]));
    const all=new Set([...bwaMonths,...rawMonths]);
    return MN.filter((m,i)=>all.has(m)&&i<currentMonth);
  }
  return[aM];
}
function renderDelta(ist,plan,invertColors){
  if(!plan||plan===0)return'';
  const delta=ist-plan;
  const pct=((delta/Math.abs(plan))*100).toFixed(1);
  // invertColors: for costs, negative delta (under plan) is good (green)
  const isGood=invertColors?delta<=0:delta>=0;
  const cls=isGood?'delta-pos':'delta-neg';
  const sign=delta>=0?'+':'';
  return`<span class="plan-delta ${cls}">${sign}${pct}%</span>`;
}

// ═══ MYWELLNESS · CLUB-GESPRÄCHE ═══════════════════════════════════════════
// CSV-Exporte aus dem MyWellness-CRM, je Standort ein Unterordner, je Datei
// eine Gesprächsstufe (1./2./3. Gespräch im Dateinamen). Dieselbe Logik wie
// im Verantwortlichen-Dashboard: Ergebnis per Muster erkennen, je Person und
// Stufe zählt der jüngste Stand.
const MW_DIR='/12_Code/Controlling/MyWellness/';
const MW_ERG=[
  {k:'club',    l:'Club-Mitgliedschaft',       ab:true,  re:/club.?mitglied/i},
  {k:'praev8',  l:'Präventionskurs 8 Wochen',  ab:true,  re:/(?=.*pr[aä]vention)(?=.*(^|\D)8(\D|$))/i},
  {k:'praev16', l:'Präventionskurs 16 Wochen', ab:true,  re:/(?=.*pr[aä]vention)(?=.*(^|\D)16(\D|$))/i},
  {k:'rv',      l:'R+V Fit',                   ab:true,  re:/r\s*\+\s*v/i},
  {k:'trena',   l:'T-RENA',                    ab:true,  re:/t-?rena/i},
  {k:'folgeg',  l:'Folgegespräch',             ab:false, re:/folgegespr/i},
  {k:'folgerez',l:'Folgerezept',               ab:false, re:/folgerezept/i},
  {k:'kein',    l:'Kein Interesse',            ab:false, re:/kein\s*interesse|trainiert\s*bereits/i},
  {k:'norueck', l:'Keine Rückmeldung',         ab:false, re:/keine\s*r[üu]ckmeldung/i},
  {k:'ungeeig', l:'Nicht geeignet',            ab:false, re:/nicht\s*geeignet|abgeraten/i},
  {k:'sonst',   l:'Sonstige',                  ab:false, re:/^sonstige/i}
];
const MW_UNBEKANNT={k:'unbekannt',l:'nicht zugeordnet',ab:false};
function mwErg(txt){const s=String(txt||'').replace(/^["\s]+|["\s]+$/g,'');if(!s)return null;return MW_ERG.find(e=>e.re.test(s))||MW_UNBEKANNT;}
function mwStufe(name){const m=String(name||'').match(/(\d)\s*\.\s*gespr/i);return m?+m[1]:null;}
function mwDatum(s){
  const m=String(s||'').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(!m)return null;const j=+m[3]<100?2000+ +m[3]:+m[3];
  const d=new Date(j,+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0));return isNaN(d.getTime())?null:d;
}
function mwCsv(text){
  const rows=[];let f='',row=[],q=false;
  const t=String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;
    else if(c===';'){row.push(f);f='';}
    else if(c==='\n'){row.push(f);f='';if(row.some(x=>x!==''))rows.push(row);row=[];}
    else f+=c;
  }
  row.push(f);if(row.some(x=>x!==''))rows.push(row);
  return rows;
}
function pMW(text,dateiname,standort){
  if(!text)return[];
  const stufe=mwStufe(dateiname);const zeilen=mwCsv(text);if(zeilen.length<2)return[];
  const hdr=zeilen[0].map(h=>String(h||'').replace(/^﻿/,'').replace(/^[":\s]+|[":\s]+$/g,'').toLowerCase());
  const sp=(...n)=>hdr.findIndex(h=>n.some(x=>h.indexOf(x)===0));
  const iD=sp('datum','date'),iN=sp('name'),iM=sp('email','e-mail'),iI=sp('id cloud','idcloud','id');
  let iE=sp('ergebnis','result');if(iE<0)iE=hdr.findIndex((h,i)=>h&&![iD,iN,iM,iI].includes(i));
  if(iD<0||iE<0)return[];
  const out=[];
  for(let r=1;r<zeilen.length;r++){
    const z=zeilen[r];if(!z||!z.length)continue;
    const dt=mwDatum(z[iD]);if(!dt)continue;const e=mwErg(z[iE]);if(!e)continue;
    out.push({dt,stufe,erg:e.k,ab:!!e.ab,name:iN>=0?String(z[iN]||'').trim():'',id:iI>=0?String(z[iI]||'').trim():'',standort:standort||''});
  }
  return out;
}
async function graphKinder(pfad){
  const e=pfad.split('/').filter(s=>s).map(s=>encodeURIComponent(s)).join('/');
  const r=await gql('https://graph.microsoft.com/v1.0/drives/'+driveId+'/root:/'+e+':/children?$top=500');
  return r&&r.value||[];
}
async function graphText(pfad){
  const e=pfad.split('/').filter(s=>s).map(s=>encodeURIComponent(s)).join('/');
  const r=await fetch('https://graph.microsoft.com/v1.0/drives/'+driveId+'/root:/'+e+':/content',{cache:'no-store',headers:{Authorization:'Bearer '+window._token}});
  return r.ok?r.text():null;
}
async function mwLaden(){
  const orte=(await graphKinder(MW_DIR)).filter(k=>k.folder&&!/^paket$/i.test(k.name));
  const alle=[];
  for(const o of orte){
    const dateien=(await graphKinder(MW_DIR+o.name)).filter(k=>k.file&&/\.csv$/i.test(k.name)&&mwStufe(k.name));
    const texte=await Promise.all(dateien.map(f=>graphText(MW_DIR+o.name+'/'+f.name).catch(()=>null)));
    texte.forEach((t,i)=>{alle.push(...pMW(t,dateien[i].name,o.name));});
  }
  const key={};alle.forEach(e=>{const k=(e.id||e.name)+'|'+e.stufe;if(!key[k]||key[k].dt<e.dt)key[k]=e;});
  return Object.values(key).sort((a,b)=>a.dt-b.dt);
}
// Standortfilter für MyWellness-Einträge (Ordnername Werneck/Kitzingen).
function mwPasst(e){
  if(aS==='Alle')return true;
  const kitz=/kitzingen|phfip/i.test(e.standort||'');
  return aS==='PF im Park'?kitz:!kitz;
}

// ═══ AUSLASTUNG JE TAG UND STANDORT ═══════════════════════════════════════
// Gebuchte Patientenminuten eines Tages ÷ anwesende Soll-Minuten der
// Therapeut:innen des Standorts (Vertragszeit ohne Abwesenheiten).
// Ausfälle und Ausfallrechnungen zählen nicht als Buchung.
const AUSL_SITES=['KIMOJO Physio','KIMOJO Ergo','PF im Park'];
function rowSite(r){return r.standort||(r.filiale==='PHFIP'?'PF im Park':'KIMOJO Physio');}
let auslIdx=null,auslIdxRaw=null;
function auslIndex(){
  if(auslIdx&&auslIdxRaw===D.raw)return auslIdx;
  const idx={},bis={};
  D.raw.forEach(r=>{
    if(!r.dateKey||!(r.durMin>0))return;
    const site=rowSite(r);
    if(r.src!=='thevea'){const p=r.dateKey.split('-');const ymd=p[0]+'-'+String(p[1]).padStart(2,'0')+'-'+String(p[2]).padStart(2,'0');if(!bis[site]||ymd>bis[site])bis[site]=ymd;}
    if(r.kind==='ausfall'||/ausfallrechnung/i.test(r.leistung||''))return;
    const k=r.dateKey+'|'+site;idx[k]=(idx[k]||0)+r.durMin;
  });
  auslIdx={idx,bis};auslIdxRaw=D.raw;return auslIdx;
}
function auslTag(ymd,site){
  const {idx,bis}=auslIndex();
  const [y,m,d]=ymd.split('-').map(Number);const dk=y+'-'+m+'-'+d;
  const geb=idx[dk+'|'+site]||0;
  let anw=0,soll=0;D.ctrl.forEach(t=>{if(t.s!==site||!t.tag||!t.tag[ymd])return;anw+=t.tag[ymd].anw;soll+=t.tag[ymd].soll;});
  // Medifox-Zeilen enden mit dem Exportstand: danach gibt es für Kitzingen noch keine Buchungen.
  const offen=site==='PF im Park'&&bis[site]&&ymd>bis[site];
  // Vor dem thevea-Cutover gibt es für Werneck keine Tagesdaten.
  const loc=TV_LOCS.find(l=>l.standort===site);
  const keineDaten=!!(loc&&ymd<loc.cutover);
  return{gebucht:geb,anw,soll,pct:anw>0&&!offen&&!keineDaten?geb/anw*100:null,offen,keineDaten};
}
function auslZeitraum(tage,site){
  let geb=0,anw=0;tage.forEach(ymd=>{const a=auslTag(ymd,site);if(a.pct===null)return;geb+=a.gebucht;anw+=a.anw;});
  return anw>0?geb/anw*100:null;
}

// ═══ THEVEA · ABGERECHNETE VERORDNUNGEN ══════════════════════════════════════
// Die thevea-Statistik „Umsatz abgerechnete Verordnungen" je Mitarbeiter:in,
// nach Abrechnungsdatum. „Thevea Physio Flow" und „Thevea Ergo Flow" schreiben
// jede Nacht die letzten drei Monate als
// Controlling/thevea/thevea-abgerechnet-<physio|ergo>-YYYY-MM.json
// (Schleife „Abgerechnet je Monat", Aktionen HTTP Abgerechnet / Datei Abgerechnet).
const ABG_DIR='/12_Code/Controlling/thevea/';
const ABG_MONATE=14;
const ABG_LOCS=[{standort:'KIMOJO Physio',pre:'thevea-abgerechnet-physio-'},{standort:'KIMOJO Ergo',pre:'thevea-abgerechnet-ergo-'}];
async function abgLaden(){
  const j=new Date(),monate=[];
  for(let i=ABG_MONATE-1;i>=0;i--){const d=new Date(j.getFullYear(),j.getMonth()-i,1);monate.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
  const L=f=>loadJSONPfad(f).catch(()=>null);
  const rows=[],stand={};
  for(const loc of ABG_LOCS){
    const files=await Promise.all(monate.map(m=>L(ABG_DIR+loc.pre+m+'.json')));
    files.forEach((f,i)=>{
      const s=f&&f.data&&f.data.umsatzstatistikMitarbeiterAbgerechneteVerordnungen,nodes=s&&s.nodes;
      if(!nodes)return;
      const ym=monate[i],p=ym.split('-');
      stand[loc.standort+'|'+ym]={stand:f.stand||'',bis:(f.zeitraum&&f.zeitraum.bis)||''};
      nodes.forEach(n=>{
        const beh=+n.anzahlBehandlungen||0,brutto=parseFloat(n.umsatzBrutto)||0;
        if(!beh&&!brutto)return;
        let name;try{name=tvKanon(n.vorname,n.nachname,D.ctrl);}catch(e){name=String(n.nachname||'').trim()+', '+String(n.vorname||'').trim();}
        rows.push({standort:loc.standort,ym,jahr:+p[0],month:+p[1],personId:n.personId,name,beh,brutto,zuzahlung:parseFloat(n.zuzahlung)||0,netto:parseFloat(n.umsatzNetto)||0});
      });
    });
  }
  D.abg={rows,stand};
  return D.abg;
}

// ═══ THEVEA · RECHNUNGEN (PRIVAT, ZUZAHLUNG, AUSFALL) ════════════════════════
// Rechnungsübersicht aus thevea (alle Rechnungen des Kontos), je Nacht komplett
// als Controlling/thevea/thevea-rechnungen-<physio|ergo>.json (Aktionen
// HTTP Rechnungen / Datei Rechnungen). Privat- und Selbstzahlerrechnungen sind
// der Privatanteil der abgerechneten Verordnungen, Zuzahlungsrechnungen zeigen
// den Zahlungseingang der Zuzahlungen.
const RE_LOCS=[{standort:'KIMOJO Physio',datei:'thevea-rechnungen-physio.json'},{standort:'KIMOJO Ergo',datei:'thevea-rechnungen-ergo.json'}];
const RE_ART={Zuzahlungsrechnung:'zuzahlung',Privatrechnung:'privat',Selbstzahlerrechnung:'selbstzahler',Ausfallrechnung:'ausfall'};
async function reLaden(){
  const L=f=>loadJSONPfad(f).catch(()=>null);
  const rows=[],stand={};
  for(const loc of RE_LOCS){
    const f=await L(ABG_DIR+loc.datei);
    const nodes=f&&f.data&&f.data.rechnungUebersicht&&f.data.rechnungUebersicht.nodes;
    if(!nodes)continue;
    stand[loc.standort]=f.stand||'';
    nodes.forEach(n=>{
      const d=String(n.rechnungsdatum||'').slice(0,10),p=d.split('-');
      if(p.length<3)return;
      rows.push({standort:loc.standort,datum:d,ym:d.slice(0,7),jahr:+p[0],month:+p[1],art:RE_ART[n.rechnungsart]||'sonst',artName:n.rechnungsart||'',status:n.rechnungsstatus||'',storno:/Storn|Ausgeb/.test(n.rechnungsstatus||''),brutto:parseFloat(n.gesamtbetragBrutto)||0,bezahlt:parseFloat(n.zahlungsbetrag)||0,nr:n.rechnungsnummer||''});
    });
  }
  D.re={rows,stand};
  return D.re;
}

// ═══ BWA · VOLLSTÄNDIGE ZEILEN ═══════════════════════════════════════════════
// Die DATEV-BWA (Soll-/Ist-Vergleich) je Monatsblatt: alle Zeilen der
// kurzfristigen Erfolgsrechnung mit Ist und Plan (Spalte „Plan“ der BWA) und
// die Konten unter jeder Kostenart. parseBWA hängt das Ergebnis als d.voll an.
const BWA_KOSTEN_CODES=['1164','1190','1200','1208','1216','1224','1232','1240','1248','1256','1264','1290'];
function bwaVoll(rows){
  const z={},kat=[],umsatz=[];let cur=null;
  const num=v=>{if(v==null||v==='')return 0;const n=typeof v==='number'?v:parseFloat(String(v).replace(/\./g,'').replace(',','.'));return isNaN(n)?0:n;};
  for(const r of rows||[]){
    const code=String(r[0]||'').trim(),konto=String(r[1]||'').trim(),name=String(r[2]||'').replace(/\s+/g,' ').trim();
    if(/^\d{4}$/.test(code)){
      z[code]={n:name,ist:num(r[3]),plan:num(r[4])};
      if(BWA_KOSTEN_CODES.includes(code)){cur={code,n:name,ist:num(r[3]),plan:num(r[4]),items:[]};kat.push(cur);}
      else cur=code==='1006'?{code,items:umsatz}:null;
      continue;
    }
    if(!code&&name&&cur&&(num(r[3])!==0||num(r[4])!==0)&&!/ohne konto-zuordnung/i.test(name))cur.items.push({konto,n:name,ist:num(r[3]),plan:num(r[4])});
  }
  return{z,kat,umsatz};
}

// ═══ BANK · BUCHUNGEN NACH HERKUNFT UND VERWENDUNG ═══════════════════════════
// Kontoauszug-Export (VR-Bank) je Betrieb: Buchungstag, Name Zahlungsbeteiligter,
// Buchungstext, Verwendungszweck, Betrag, Saldo nach Buchung. loadBank hängt das
// Ergebnis als nicht aufzählbares Feld `voll` an die Monatswerte.
const BANK_EIN=[
  ['kassen','Krankenkassen und Abrechnungszentren',/krankenkasse|\baok\b|barmer|\bdak\b|techniker|davaso|abrechnungszentrum|iqvia|\bbkk\b|knappschaft|\bikk\b|\bkkh\b|\bhkk\b|\bsbk\b|gkv|big direkt|sozialversicherung|viactiv|pronova|salus|novitas|mhplus|debeka|opta data|noventi|\bazh\b|\brzh\b|optica|\bdzh\b|kubus/i],
  ['bg','Berufsgenossenschaften und Unfallkassen',/berufsgenossenschaft|\bbg\b|\bvbg\b|unfallkasse|bghw|\bbgn\b|bgw/i],
  ['karte','Karten- und Onlinezahlungen',/stripe|sumup|paypal|concardis|payone|zettle|girocard|mollie/i],
  ['finanzamt','Finanzamt und Erstattungen',/finanzamt|finanzkasse|bundeskasse|hauptzollamt/i],
  ['intern','Gesellschafter und interne Umbuchungen',/br[äa]tz|physio und fitness im park|kimojo gmbh|fyzo/i],
  ['sonst','Patienten und Sonstige',/./]
];
const BANK_AUS=[
  ['gehalt','Löhne und Gehälter',(n,bt,vz)=>/sammel/i.test(bt)||/lohn|gehalt|gehälter|verdienst/i.test(vz)||/lohn|gehalt/i.test(n)],
  ['sv','Sozialversicherung',(n,bt,vz)=>/krankenkasse|\baok\b|barmer|techniker|\bbkk\b|\bdak\b|knappschaft|\bikk\b|\bkkh\b|\bhkk\b|minijob|rentenversicherung|berufsgenossenschaft|\bvbg\b|\bsbk\b|debeka bkk|energie-bkk|bahn-bkk/i.test(n)],
  ['steuern','Steuern',(n,bt,vz)=>/finanzamt|finanzkasse|hauptzollamt/i.test(n)||/gewerbesteuer|umsatzsteuer|lohnsteuer|körperschaftsteuer/i.test(vz)],
  ['miete','Miete und Nebenkosten',(n,bt,vz)=>/miete|pacht|nebenkosten/i.test(vz)||/immler|vermiet|hausverwaltung|stadtwerke|energie|strom|gas\b/i.test(n)],
  ['darlehen','Darlehen, Leasing und Zinsen',(n,bt,vz)=>/darlehen|tilgung|kredit|leasing|zins/i.test(n+' '+bt+' '+vz)],
  ['invest','Investitionen und Geräte',(n,bt,vz)=>/technogym|proxomed|gym80|medizintechnik|physiomed|zimmer medizin|ergo-fit|milon/i.test(n)],
  ['intern','Gesellschafter und interne Umbuchungen',(n,bt,vz)=>/br[äa]tz|physio und fitness im park|kimojo gmbh|fyzo/i.test(n)],
  ['bank','Bankgebühren',(n,bt,vz)=>/abschluss|entgelt|gebühr/i.test(bt+' '+vz)&&!n],
  ['sonst','Lieferanten und Sonstige',()=>true]
];
// Buchung je Konto, einheitlich für Excel-Export und Bankabruf:
// {d:Date (UTC), b:Betrag, n:Name Zahlungsbeteiligter, t:Buchungstext, z:Verwendungszweck,
//  s:Saldo nach Buchung oder null, iban:eigenes Konto, pIban:Konto des Zahlungsbeteiligten}
function bankDatum(v){if(v instanceof Date)return v;if(typeof v==='number'&&v>40000)return new Date(Math.round((v-25569)*86400000));const s=String(v||'');let m=s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);if(m)return new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));m=s.match(/(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));const n=parseFloat(s);if(n>40000)return new Date(Math.round((n-25569)*86400000));return null;}
function bankZahl(v){if(v==null||v==='')return NaN;if(typeof v==='number')return v;const s=String(v);return parseFloat(/,\d{1,2}$/.test(s)?s.replace(/\./g,'').replace(',','.'):s);}
function bankTxAusZeilen(rows,ibanVorgabe){
  rows=rows||[];const hdr=rows[0]||[];const col=re=>{for(let c=0;c<hdr.length;c++)if(re.test(String(hdr[c]||'').toLowerCase()))return c;return -1;};
  let cD=col(/buchungstag/),cN=col(/name zahlungsbeteiligter/),cT=col(/buchungstext/),cV=col(/verwendungszweck/),cB=col(/^betrag$/),cS=col(/saldo/),cI=col(/iban auftragskonto/),cP=col(/iban zahlungsbeteiligter/);
  if(cD<0)cD=4;if(cN<0)cN=6;if(cT<0)cT=9;if(cV<0)cV=10;if(cB<0)cB=11;if(cS<0)cS=13;
  const out=[];
  for(let i=1;i<rows.length;i++){const r=rows[i];if(!r)continue;const d=bankDatum(r[cD]);if(!d)continue;const b=bankZahl(r[cB]);if(isNaN(b))continue;const s=bankZahl(r[cS]);
    out.push({d,b,n:String(r[cN]||'').trim(),t:String(r[cT]||'').trim(),z:String(r[cV]||'').trim(),s:isNaN(s)?null:s,iban:String((cI>=0&&r[cI])||ibanVorgabe||'').replace(/\s/g,''),pIban:String((cP>=0&&r[cP])||'').replace(/\s/g,''),q:'export'});}
  return out;
}
function bankKat(x){return x.b>0?(BANK_EIN.find(k=>k[2].test(x.n))||BANK_EIN[BANK_EIN.length-1])[0]:(BANK_AUS.find(k=>k[2](x.n,x.t,x.z))||BANK_AUS[BANK_AUS.length-1])[0];}
// Monatswerte des Cockpit-Jahres aus den Buchungen eines oder mehrerer Konten.
// Kontostand je Monat = Summe der Konten am letzten Buchungstag bis Monatsende.
function bankVollTx(txs){
  const MNB=['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],J=cockpitJahr();
  const out={monate:{},von:null,bis:null,iban:'',kat:{ein:{},aus:{}},partner:{ein:{},aus:{}}};
  const ibans=[...new Set(txs.map(x=>x.iban))];out.iban=ibans.length===1?ibans[0]:'';out.konten=ibans.length;
  for(const x of txs){
    const d=x.d;if(d.getUTCFullYear()!==J)continue;
    if(!out.von||d<out.von)out.von=d;if(!out.bis||d>out.bis)out.bis=d;
    const mn=MNB[d.getUTCMonth()+1];
    const m=out.monate[mn]||(out.monate[mn]={jahr:J,ein:0,aus:0,saldo:null,saldoDatum:null,kat:{ein:{},aus:{}}});
    const k=bankKat(x),side=x.b>0?'ein':'aus';if(x.b>0)m.ein+=x.b;else m.aus+=x.b;
    m.kat[side][k]=(m.kat[side][k]||0)+x.b;out.kat[side][k]=(out.kat[side][k]||0)+x.b;
    const pn=x.n||(/sammel/i.test(x.t)?'Sammelüberweisung (Gehälter)':x.t||'ohne Namen');out.partner[side][pn]=(out.partner[side][pn]||0)+x.b;
  }
  // Salden je Konto zum Monatsende
  const proKonto={};txs.filter(x=>x.s!=null).forEach(x=>(proKonto[x.iban]=proKonto[x.iban]||[]).push(x));
  Object.values(proKonto).forEach(l=>l.sort((a,b)=>a.d-b.d));
  Object.keys(out.monate).forEach(mn=>{const mi=MNB.indexOf(mn),ende=new Date(Date.UTC(J,mi,1));let s=null,sd=null;
    Object.values(proKonto).forEach(l=>{let last=null;for(const x of l){if(x.d<ende)last=x;else break;}if(last){s=(s||0)+last.s;if(!sd||last.d>sd)sd=last.d;}});
    out.monate[mn].saldo=s;out.monate[mn].saldoDatum=sd;});
  return out;
}
function bankVoll(rows){return bankVollTx(bankTxAusZeilen(rows));}
function bankMonate(v){const m={};Object.entries(v.monate).forEach(([k,x])=>{m[k]={ein:x.ein,aus:x.aus,saldo:x.saldo==null?0:x.saldo};});try{Object.defineProperty(m,'voll',{value:v,enumerable:false});}catch(e){}return m;}

// ═══ BANKABRUF (Enable Banking, PSD2) ═══════════════════════════════════════
// Das Skript „Controlling Dashbaord/bankabruf/bank_abruf.py“ läuft auf dem Mac
// dreimal täglich und schreibt nach Controlling/Bank/: konten.json (Salden,
// Kreditlinie, Gültigkeit der Freigabe) und umsaetze_<IBAN>_<JJJJ-MM>.json.
// Die Excel-Exporte (KIMOJO Bank.xlsx, PHFIP Bank.xlsx) füllen die Zeit vor dem
// ersten Abruf je Konto.
const BANK_ORDNER='/12_Code/Controlling/Bank/';
const BANK_IBAN_BETRIEB={'5407389':'KIMOJO','5819601':'PHFIP'};
const BETRIEB_KEY={KIMOJO:'bankK',PHFIP:'bankP'};
function bankBetrieb(iban,inhaber,fest){
  if(fest)return fest;const e=Object.keys(BANK_IBAN_BETRIEB).find(k=>String(iban||'').endsWith(k));if(e)return BANK_IBAN_BETRIEB[e];
  const n=String(inhaber||'').toLowerCase();if(/kimojo/.test(n))return'KIMOJO';if(/im park|phfip|physio und fitness/.test(n))return'PHFIP';return'';
}
async function bankOrdnerLaden(){
  let kinder=[];try{kinder=await graphKinder(BANK_ORDNER);}catch(e){return{meta:null,tx:{}};}
  const namen=(kinder||[]).map(k=>k.name||'');
  const meta=namen.includes('konten.json')?await loadJSONPfad(BANK_ORDNER+'konten.json').catch(()=>null):null;
  const um=namen.filter(n=>/^umsaetze_[A-Z0-9]+_\d{4}-\d{2}\.json$/.test(n));
  const files=await Promise.all(um.map(n=>loadJSONPfad(BANK_ORDNER+n).catch(()=>null)));
  const tx={};
  files.forEach(f=>{if(!f||!f.iban)return;const l=tx[f.iban]||(tx[f.iban]=[]);(f.buchungen||[]).forEach(b=>{const d=bankDatum(b.datum);if(!d||typeof b.betrag!=='number')return;l.push({d,b:b.betrag,n:b.name||'',t:b.text||'',z:b.zweck||'',s:b.saldo==null?null:b.saldo,iban:f.iban,pIban:b.iban_partner||'',q:'abruf',id:b.id});});});
  return{meta,tx};
}
async function bankKontenAufbauen(){
  const ord=await bankOrdnerLaden();const meta=(ord.meta&&ord.meta.konten)||[];
  const K={};
  const konto=(iban,betrieb)=>K[iban]||(K[iban]={iban,betrieb,name:'',bank:'',tx:[],saldo:null,saldoDatum:null,kreditlinie:null,verfuegbar:null,gueltigBis:null,fehler:'',abruf:null,quelle:''});
  // 1. Bankabruf
  meta.forEach(m=>{const k=konto(m.iban,bankBetrieb(m.iban,m.inhaber,m.betrieb));Object.assign(k,{name:m.name||m.produkt||'',bank:m.bank||'',inhaber:m.inhaber||'',saldo:m.saldo==null?null:m.saldo,saldoDatum:bankDatum(m.saldo_datum),kreditlinie:m.kreditlinie==null?null:m.kreditlinie,verfuegbar:m.verfuegbar==null?null:m.verfuegbar,gueltigBis:m.gueltig_bis?new Date(m.gueltig_bis):null,fehler:m.fehler||'',abruf:m.abruf?new Date(m.abruf):null,quelle:'Bankabruf'});});
  Object.entries(ord.tx).forEach(([iban,l])=>{const k=konto(iban,bankBetrieb(iban));k.tx=l;if(!k.quelle)k.quelle='Bankabruf';});
  // 2. Excel-Exporte: nur Buchungen vor dem ersten abgerufenen Tag des Kontos
  for(const [b,key] of Object.entries(BETRIEB_KEY)){
    const rows=D[key]&&D[key].zeilen;if(!rows)continue;
    bankTxAusZeilen(rows).forEach(x=>{const iban=x.iban||('EXPORT-'+b);const k=K[iban]||konto(iban,bankBetrieb(iban)||b);if(!k.ersterAbruf)k.ersterAbruf=k.tx.filter(y=>y.q==='abruf').reduce((m,y)=>!m||y.d<m?y.d:m,null)||new Date(8.64e15);if(x.d<k.ersterAbruf){(k.exp=k.exp||[]).push(x);}});
  }
  Object.values(K).forEach(k=>{
    if(k.exp){k.tx=k.exp.concat(k.tx);if(!k.quelle)k.quelle='Export';else k.quelle+=' + Export';if(!k.name)k.name=(D[BETRIEB_KEY[k.betrieb]]&&D[BETRIEB_KEY[k.betrieb]].zeilen&&D[BETRIEB_KEY[k.betrieb]].zeilen[1]&&D[BETRIEB_KEY[k.betrieb]].zeilen[1][0])||'Girokonto';if(!k.bank){const z=D[BETRIEB_KEY[k.betrieb]]&&D[BETRIEB_KEY[k.betrieb]].zeilen;k.bank=(z&&z[1]&&z[1][3])||'';}}
    delete k.exp;delete k.ersterAbruf;k.tx.sort((a,b)=>a.d-b.d);
    if(k.saldo==null){const l=k.tx.filter(x=>x.s!=null);const x=l[l.length-1];if(x){k.saldo=x.s;k.saldoDatum=x.d;}}
  });
  D.konten=Object.values(K).filter(k=>k.tx.length||k.saldo!=null);
  D.bankAbruf=ord.meta?{stand:ord.meta.stand?new Date(ord.meta.stand):null,quelle:ord.meta.quelle||''}:null;
  // Monatswerte je Betrieb für Cashflow (gleiche Form wie bisher)
  for(const [b,key] of Object.entries(BETRIEB_KEY)){const tx=D.konten.filter(k=>k.betrieb===b).flatMap(k=>k.tx);if(tx.length)D[key]=bankMonate(bankVollTx(tx));}
}
// Medifox-Rechnungsübersicht (Abrechnung → Rechnungsübersicht → Export):
// Rechnungsnummern mit „K-“ gehören zu Kitzingen (PF im Park), Nummern ohne
// Präfix zu KIMOJO. Spalten werden über die Kopfzeile gefunden, damit auch
// Exporte mit anderer Spaltenfolge passen.
const MR_SPALTEN=['Nr','NrClean','Belegdatum','Belegtyp','Verordnungsdatum','Kostentraeger','KostentraegerTyp','Patientennummer','Patient','Brutto','USt','Netto','USt5','USt7','USt16','USt19','Storniert','Saldo'];
const MR_ORDNER='/12_Code/Controlling/Medifox Rechnungen/';
function mrNorm(rows){
  if(!rows||rows.length<2)return[];
  const h=(rows[0]||[]).map(x=>String(x||'').replace(/[^a-z0-9]/gi,'').toLowerCase());
  const idx=MR_SPALTEN.map(n=>h.indexOf(n.toLowerCase()));
  if(idx[0]<0||idx[2]<0||idx[9]<0)return[];
  return rows.slice(1).filter(r=>r&&r[idx[0]]!=null&&r[idx[0]]!=='').map(r=>idx.map(i=>i<0?null:r[i]));
}
function mrDatum(v){
  if(typeof v==='number'&&v>40000){const d=new Date(Math.round((v-25569)*86400000));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
  const s=String(v||'');let m=s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  m=s.match(/(\d{4})-(\d{2})-(\d{2})/);return m?m[1]+'-'+m[2]+'-'+m[3]:null;
}
// Hauptdatei (FILES.rechnungen) plus alle Exporte im Ordner „Medifox Rechnungen“,
// doppelte Belege (gleiche Nummer, Belegtyp, Datum, Betrag) zählen einmal.
// Flow-Export: {monat, rechnungen:[{Nr,Belegdatum,Belegtyp,KostentraegerTyp,Brutto,Storniert,IsMahnung,Saldo}]}
// in die Spaltenfolge MR_SPALTEN bringen.
function mrAusJson(f){
  const arr=Array.isArray(f)?f:(f&&f.rechnungen)||[];
  return arr.filter(r=>r&&r.Nr).map(r=>{const z=new Array(MR_SPALTEN.length).fill(null);z[0]=r.Nr;z[1]=r.Nr;z[2]=r.Belegdatum;z[3]=r.Belegtyp;z[6]=r.KostentraegerTyp;z[9]=r.Brutto!=null?r.Brutto:r.GesamtbetragBrutto;z[16]=(r.Storniert||r.IsStorniert)?'ja':'nein';z[17]=r.Saldo;return z;});
}
async function mrZusammen(hauptRows){
  const alle=[MR_SPALTEN].concat(mrNorm(hauptRows));
  try{
    const kinder=await graphKinder(MR_ORDNER);
    for(const k of kinder.filter(k=>/\.xlsx$/i.test(k.name||''))){try{const sh=await getSheetNames(k.id);const rows=await getSheet(k.id,(sh&&sh[0])||'Tabelle1');mrNorm(rows).forEach(r=>alle.push(r));}catch(e){console.warn('Medifox-Rechnungen',k.name,e);}}
    // JSON-Monatsdateien des Flows „Medifox Rechnungen“ (medifox-rechnungen-YYYY-MM.json)
    const jsons=kinder.filter(k=>/\.json$/i.test(k.name||''));
    const texte=await Promise.all(jsons.map(k=>graphText(MR_ORDNER+k.name).catch(()=>null)));
    texte.forEach(t=>{try{mrAusJson(JSON.parse(String(t||'').replace(/^\uFEFF/,''))).forEach(r=>alle.push(r));}catch(e){}});
  }catch(e){console.warn('Ordner Medifox Rechnungen:',e);}
  const seen=new Set();
  return alle.filter((r,i)=>{if(i===0)return true;const key=[r[0],r[3],mrDatum(r[2]),r[9]].join('|');if(seen.has(key))return false;seen.add(key);return true;});
}
function rechnungenAgg(rows){
  const R={total:0,count:0,byType:{},byPrefix:{},byPT:{},rows:[],alle:[],bis:null};
  if(!rows||rows.length<2)return R;
  for(let i=1;i<rows.length;i++){
    const r=rows[i];if(!r)continue;
    const typ=String(r[6]||'Unbekannt'),nr=String(r[0]||''),prefix=nr.startsWith('K-')?'PHFIP':'KIMOJO';
    const d=mrDatum(r[2]),brutto=parseFloat(r[9])||0,bt=String(r[3]||'');
    if(d){const p=d.split('-');R.alle.push({nr,belegtyp:bt,datum:d,jahr:+p[0],month:+p[1],prefix,typ,brutto,storniert:/^(ja|true|wahr|1)$/i.test(String(r[16]||'')),saldo:parseFloat(r[17])||0});if(!R.bis||d>R.bis)R.bis=d;}
    const saldo=parseFloat(r[17])||0;if(!saldo)continue;
    R.total+=saldo;R.count++;
    (R.byType[typ]=R.byType[typ]||{count:0,saldo:0}).count++;R.byType[typ].saldo+=saldo;
    (R.byPrefix[prefix]=R.byPrefix[prefix]||{count:0,saldo:0}).count++;R.byPrefix[prefix].saldo+=saldo;
    const k=prefix+'|'+typ;(R.byPT[k]=R.byPT[k]||{prefix,typ,count:0,saldo:0}).count++;R.byPT[k].saldo+=saldo;
    R.rows.push({nr,typ,prefix,saldo,datum:String(r[2]||''),kt:String(r[5]||'')});
  }
  return R;
}


// ═══ MONATSARCHIV (thevea) ═══════════════════════════════════════════════════
// Flow „Cockpit Monatsarchiv“ schreibt jede Nacht nach
// Patientenchecker/Dateien Export/archiv/: termine_<wp|we>_YYYY-MM.json (laufender
// Monat, Vormonat, Vor-Vormonat; ältere bleiben eingefroren) und
// arbeitszeiten_<wp|we>_YYYY-MM.json (Arbeitszeit-Datensätze des Monats).
async function tvArchivLaden(suf){
  const dir=TV_DIR+'archiv/';let kinder=[];
  try{kinder=await graphKinder(dir);}catch(e){}
  const namen=(kinder||[]).map(k=>k.name||'');
  const tn=namen.filter(n=>new RegExp('^termine_'+suf+'_\\d{4}-\\d{2}\\.json$').test(n)).sort();
  const an=namen.filter(n=>new RegExp('^arbeitszeiten_'+suf+'_\\d{4}-\\d{2}\\.json$').test(n)).sort();
  const L=f=>loadJSONPfad(dir+f).catch(()=>null);
  const [ts,as]=await Promise.all([Promise.all(tn.map(L)),Promise.all(an.map(L))]);
  return{termine:ts.flatMap(f=>(f&&f.data&&f.data.termine)||[]),az:as.flatMap(f=>Array.isArray(f)?f:[]),dateien:tn.length+an.length};
}

// ═══ DATEIEN JE JAHR ═════════════════════════════════════════════════════════
// Weekly Tracker und Planungen gibt es je Jahr als eigene Datei. Für ein anderes
// Jahr als 2026 sucht das Cockpit im selben Ordner die Datei, deren Name statt
// „2026“ das gewählte Jahr trägt (z. B. „KIMOJO_Weekly KPI Tracker 2027.xlsx“).
// Abweichende Dateien lassen sich hier fest eintragen: FILES_JAHR[2027]={kpi:'<id>'}.
// BWA und Bank bleiben dieselben Dateien; dort zählt das Jahr in den Daten.
const DATEI_JAHR_BASIS=2026;
const FILES_JAHR={};
const DATEIEN_BASIS={kpi:FILES.kpi,planK:FILES.planK,planP:FILES.planP,bwaK:FILES.bwaK,bwaP:FILES.bwaP,bankK:FILES.bankK,bankP:FILES.bankP,kpiPhfip:KPI_PHFIP_ID};
async function dateiFuerJahr(id,jahr,drive){
  if(!id||!drive)return null;if(jahr===DATEI_JAHR_BASIS)return id;
  try{
    const it=await gql('https://graph.microsoft.com/v1.0/drives/'+drive+'/items/'+id+'?$select=name,parentReference');
    if(!it||!it.name||it.name.indexOf(String(DATEI_JAHR_BASIS))<0)return null;
    const nn=it.name.split(String(DATEI_JAHR_BASIS)).join(String(jahr));
    const x=await gql('https://graph.microsoft.com/v1.0/drives/'+drive+'/items/'+it.parentReference.id+':/'+encodeURIComponent(nn));
    return x&&x.id||null;
  }catch(e){return null;}
}
async function dateienAufJahrStellen(){
  const j=cockpitJahr(),fj=FILES_JAHR[j]||{};D.dateienJahr={jahr:j,fehlt:[]};
  for(const k of ['kpi','planK','planP']){
    FILES[k]=fj[k]||await dateiFuerJahr(DATEIEN_BASIS[k],j,driveId);
    if(!FILES[k])D.dateienJahr.fehlt.push(k);
  }
  for(const k of ['bwaK','bwaP','bankK','bankP'])FILES[k]=fj[k]||DATEIEN_BASIS[k];
  D.kpiPhfipId=fj.kpiPhfip||await dateiFuerJahr(DATEIEN_BASIS.kpiPhfip,j,phfipDriveId);
  if(!D.kpiPhfipId)D.dateienJahr.fehlt.push('kpiPhfip');
}
// Jahr aus dem Kopf eines BWA-Blatts („Soll-/Ist-Vergleich Jul 2026“, „Ist Jul/2026“).
function bwaJahr(rows){
  for(const r of (rows||[]).slice(0,4)){const m=String((r||[]).join(' ')).match(/(?:\/|\s)(20\d\d)\b/);if(m)return +m[1];}
  return null;
}
