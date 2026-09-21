(function(){
'use strict';
var MIN=6e4, H=36e5;
var LSKEY='alan.v2', LSV1='alan.v1', WHOKEY='alan.who';
var S={settings:{name:'Alan',birth:'2026-08-20'},events:[],openCry:null};
var who='Io', A={}; window.A=A;
var flow=null, rec=null, playing=null;
var CAUSES=[
  {id:'fame',label:'Fame',c:'var(--c-fame)'},
  {id:'sonno',label:'Sonno',c:'var(--c-sonno)'},
  {id:'cambio',label:'Pannolino',c:'var(--c-cambio)'},
  {id:'aria',label:'Aria / pancia',c:'var(--c-aria)'},
  {id:'contatto',label:'Contatto / altro',c:'var(--c-contatto)'}
];
var LABELS={fame:'fame',sonno:'sonno',cambio:'pannolino',aria:'aria / pancia',contatto:'contatto',solo:'passato da solo'};
var OTHER=[['ruttino','Ruttino','aria'],['rigurgito','Rigurgito','aria'],['massaggio','Massaggio pancia','aria'],['ciuccio','Ciuccio','contatto'],['coccole','Coccole','contatto'],['passeggiata','Passeggiata','contatto'],['bagnetto','Bagnetto','contatto']];
/* pipì/cacca: no, poca, normale, tanta. 'si' è il valore della versione 12 e si legge come normale. */
var LVL={no:'no',poca:'poca',normale:'normale',tanta:'tanta',si:'normale'};
var LVL_ORDER=['poca','normale','tanta'];
/* Cosa si può provare per ciascuna causa: apre il percorso normale, che registrando spiega anche il pianto.
   Sono le azioni della giornata, non consigli: la causa resta un'ipotesi misurata sui vostri dati. */
var TRY={fame:['feed','Pappa'],sonno:['sleep','Nanna'],cambio:['diaper','Pannolino'],aria:['other','Ruttino o massaggio'],contatto:['other','Coccole o ciuccio']};
/* nota libera su una voce del diario: la scrive la schermata di modifica, la mostra js/note.js */
var NOTE_MAX=200;
var BANNER_HIDE='alan.cry.later';
function noteClean(s){return String(s==null?'':s).replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').replace(/^\s+|\s+$/g,'').slice(0,NOTE_MAX);}
function lvlKey(v){return v==='si'?'normale':(LVL[v]?v:'no');}

/* ---------- storage: IndexedDB with localStorage fallback ---------- */
var db=null;
function openDb(){
  return new Promise(function(res){
    if(!window.indexedDB){res(null);return;}
    try{
      var r=indexedDB.open('alan-v2',2);
      r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');if(!d.objectStoreNames.contains('audio'))d.createObjectStore('audio');if(!d.objectStoreNames.contains('files'))d.createObjectStore('files');};
      r.onsuccess=function(){res(r.result);};
      r.onerror=function(){res(null);};
      r.onblocked=function(){res(null);};
    }catch(e){res(null);}
  });
}
function idbGet(store,key){return new Promise(function(res){if(!db){res(undefined);return;}try{var t=db.transaction(store,'readonly').objectStore(store).get(key);t.onsuccess=function(){res(t.result);};t.onerror=function(){res(undefined);};}catch(e){res(undefined);}});}
function idbPut(store,key,val){return new Promise(function(res){if(!db){res(false);return;}try{var t=db.transaction(store,'readwrite');t.objectStore(store).put(val,key);t.oncomplete=function(){res(true);};t.onerror=function(){res(false);};}catch(e){res(false);}});}
function idbDel(store,key){return new Promise(function(res){if(!db){res(false);return;}try{var t=db.transaction(store,'readwrite');t.objectStore(store).delete(key);t.oncomplete=function(){res(true);};t.onerror=function(){res(false);};}catch(e){res(false);}});}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
var saveT=null;
function save(){
  clearTimeout(saveT);
  saveT=setTimeout(function(){
    var json=JSON.stringify(S);
    idbPut('kv','state',json).then(function(ok){if(!ok&&!lsSet(LSKEY,json))toast('Non riesco a salvare i dati');});
    lsSet(LSKEY,json);
    extEmit('change');
  },80);
}
function migrateV1(){
  var raw=lsGet(LSV1); if(!raw)return;
  try{
    var o=JSON.parse(raw); if(!o||!Array.isArray(o.events))return;
    if(o.settings){if(o.settings.name)S.settings.name=o.settings.name;if(o.settings.birth)S.settings.birth=o.settings.birth;}
    o.events.forEach(function(e){
      if(!e||!e.id||!e.t)return;
      var n={id:e.id,t:e.t,who:e.who||''};
      if(e.k==='feed'){n.k='feed';n.prep=e.ml||null;n.ml=e.ml||null;}
      else if(e.k==='diaper'){n.k='diaper';n.pipi=(e.kind==='pipi'||e.kind==='entrambi')?'normale':'no';n.cacca=(e.kind==='cacca'||e.kind==='entrambi')?'normale':'no';}
      else if(e.k==='sleep'||e.k==='wake'){n.k=e.k;}
      else if(e.k==='burp'){n.k='other';n.what='ruttino';}
      else if(e.k==='cry'){n.k='cry';n.dur=e.end?(e.end-e.t)/1000:null;n.label=e.out==='coccole'?'contatto':(e.out||null);n.bins=e.bins||null;n.ctx=e.ctx||null;n.feat=null;n.audio=false;}
      else return;
      S.events.push(n);
    });
  }catch(e){}
}
function load(){
  return openDb().then(function(d){
    db=d;
    return idbGet('kv','state');
  }).then(function(raw){
    if(!raw)raw=lsGet(LSKEY);
    if(raw){try{var o=JSON.parse(raw);if(o.settings)for(var k in o.settings)S.settings[k]=o.settings[k];S.events=Array.isArray(o.events)?o.events:[];S.openCry=o.openCry||null;}catch(e){}}
    else{migrateV1();save();}
    who=lsGet(WHOKEY)||'Io';
  });
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
/* ---------- sync hooks (js/sync.js, optional) ---------- */
function touched(e){e._updated=new Date().toISOString();if(window.AlanSync)AlanSync.upsert(e);}
function removed(e){e._updated=new Date().toISOString();if(window.AlanSync)AlanSync.remove(e);}
/* Regola di SPEC §3: la prima azione registrata in [cry.t − 5 min, cry.t + 45 min] spiega il pianto aperto.
   Vale sia per le azioni fatte su questo telefono (A.finish) sia per quelle che arrivano dall'altro (mergeRemote). */
/* una pappa "vale" se ha ml > 0 (biberon rifiutato = 0 non conta) */
function fedFeed(e){return e.k==='feed'&&e.ml>0;}
function labelFor(e){
  if(e.k==='feed')return fedFeed(e)?'fame':null;
  if(e.k==='sleep')return 'sonno';
  if(e.k==='diaper')return 'cambio';
  if(e.k==='other'){var o=OTHER.filter(function(x){return x[0]===e.what;})[0];return o?o[2]:'contatto';}
  return null;
}
/* Le azioni registrate intorno a un pianto che possono spiegarlo: da 5 minuti prima a 90 dopo. Serve ad associare a mano
   quando l'azione si registra dopo, che è come va di solito: prima si consola, poi si scrive. */
function explainers(cry){
  if(!cry)return [];
  return sorted().filter(function(e){
    return e.id!==cry.id&&labelFor(e)&&e.t>=cry.t-5*MIN&&e.t-cry.t<=90*MIN;
  });
}
/* pianti senza spiegazione delle ultime 24 ore, dal più recente */
function pendingCries(now){
  now=now||Date.now();
  return sorted().filter(function(e){return e.k==='cry'&&!e.label&&now-e.t<=24*H;}).reverse();
}
function tryLabelOpenCry(e,linkId){
  var label=labelFor(e);if(!label)return null;
  var cid=linkId||S.openCry,cry=cid?byId(cid):null;
  if(cry&&cry.k==='cry'&&!cry.label&&e.t>=cry.t-5*MIN&&e.t-cry.t<=45*MIN){cry.label=label;touched(cry);if(S.openCry===cry.id)S.openCry=null;return cry;}
  return null;
}
function mergeRemote(list){
  var changed=false;
  list.forEach(function(r){
    var cur=byId(r.id);
    if(r._deleted){
      if(cur){S.events=S.events.filter(function(x){return x.id!==r.id;});if(cur.k==='cry'){idbDel('audio',r.id);setAudioOutbox(audioOutbox().filter(function(x){return x!==r.id;}));}if(S.openCry===r.id)S.openCry=null;changed=true;}
      return;
    }
    if(!cur){
      var n={};for(var k in r)if(k!=='_deleted')n[k]=r[k];n.audio=false;S.events.push(n);changed=true;
      /* un pianto aperto registrato dall'altro telefono resta aperto anche qui: la prossima azione lo spiega da entrambi */
      if(n.k==='cry'&&!n.label&&!S.openCry&&Date.now()-n.t<=45*MIN)S.openCry=n.id;
      else if(n.k!=='cry')tryLabelOpenCry(n,null);
      return;
    }
    if(cur._updated&&r._updated&&r._updated<=cur._updated)return;
    for(var k2 in r)if(k2!=='_deleted'&&k2!=='audio')cur[k2]=r[k2];
    if(cur.k==='cry'&&cur.label&&S.openCry===cur.id)S.openCry=null;
    changed=true;
  });
  if(changed){save();refreshViews();}
}
function refreshViews(){
  extEmit('change');
  if(!flow)renderHome();
  renderCries();
  var pat=$('#v-pattern');if(pat&&pat.classList.contains('on'))renderStats();
  var sal=$('#v-salute');if(sal&&sal.classList.contains('on'))renderHealth();
  if(flow&&flow.type==='cry'&&flow.phase==='after')renderCry();
}
/* impostazioni condivise: last-writer-wins su _updated; se il server non ha nulla, vincono quelle locali */
var settingsPushed=false;
function mergeRemoteSettings(r){
  if(!r){if(!settingsPushed&&(S.settings.name||S.settings.birth)){settingsPushed=true;pushSettings();}return;}
  if(S.settings._updated&&r._updated&&r._updated<=S.settings._updated)return;
  var fh=r.feedH>0?r.feedH:null;
  var changed=(r.name&&r.name!==S.settings.name)||(r.birth&&r.birth!==S.settings.birth)||(r.feedH!==undefined&&fh!==(S.settings.feedH||null));
  if(r.name)S.settings.name=r.name;if(r.birth)S.settings.birth=r.birth;if(r.feedH!==undefined)S.settings.feedH=fh;S.settings._updated=r._updated||S.settings._updated;
  save();renderHeader();
  if(changed){if(!flow)renderHome();var alt=$('#v-altro');if(alt&&alt.classList.contains('on'))fillSettings();toast('Impostazioni aggiornate dall\'altro telefono');}
}
function pushSettings(){
  if(!S.settings._updated)S.settings._updated=new Date().toISOString();
  if(window.AlanSync)AlanSync.upsertSettings(S.settings);
}
window.AlanApp={mergeRemote:mergeRemote,events:function(){return S.events;},refresh:function(){renderHome();renderCries();renderAccount();}};

/* ---------- diagnostica: ogni passo del percorso audio lascia una riga leggibile in Altro ---------- */
var DIAGKEY='alan.diag';
var DIAG_STEPS=[['mic','Microfono nel browser'],['ctx','Motore audio (AudioContext) acceso nel tap'],['perm','Permesso microfono'],['rec','Registratore (MediaRecorder)'],['frames','Analisi in tempo reale'],['data','Dati audio registrati'],['feat','Impronta acustica'],['idb','Salvataggio sul telefono (IndexedDB)'],['up','Invio all\'altro telefono (cloud)'],['dl','Scaricamento dal cloud'],['play','Riascolto']];
var DIAG=(function(){try{var o=JSON.parse(lsGet(DIAGKEY)||'null');if(o&&o.steps)return o;}catch(e){}return {steps:[],at:null};})();
function diag(step,ok,detail){
  var it={s:step,ok:ok,d:detail||'',t:Date.now()},i;
  for(i=0;i<DIAG.steps.length;i++)if(DIAG.steps[i].s===step)break;
  if(i<DIAG.steps.length)DIAG.steps[i]=it;else DIAG.steps.push(it);
  lsSet(DIAGKEY,JSON.stringify(DIAG));
  if(!flow)renderDiag();
}
function diagReset(){DIAG.steps=DIAG.steps.filter(function(x){return x.s==='dl'||x.s==='play';});DIAG.at=Date.now();lsSet(DIAGKEY,JSON.stringify(DIAG));}
function diagGet(step){for(var i=0;i<DIAG.steps.length;i++)if(DIAG.steps[i].s===step)return DIAG.steps[i];return null;}
function errStr(err){if(!err)return 'errore';return (err.name||'')+(err.message?(err.name?': ':'')+err.message:'')||String(err);}
/* audio in IndexedDB come {buf:ArrayBuffer,mime}: i Blob dentro IndexedDB su iOS si sono rivelati fragili */
function blobToBuf(blob){return new Promise(function(res,rej){try{if(blob.arrayBuffer){blob.arrayBuffer().then(res,rej);return;}var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.onerror=function(){rej(fr.error||new Error('FileReader'));};fr.readAsArrayBuffer(blob);}catch(e){rej(e);}});}
function audioPut(id,buf,mime){return idbPut('audio',id,{buf:buf,mime:mime||''});}
function audioGet(id){
  return idbGet('audio',id).then(function(v){
    if(!v)return null;
    if(v.buf)return {buf:v.buf,mime:v.mime||'',blob:new Blob([v.buf],{type:v.mime||''})};
    if(typeof Blob!=='undefined'&&v instanceof Blob)return {buf:null,mime:v.type||'',blob:v};
    return null;
  });
}
function busy(btn,on,label){
  if(!btn)return;
  if(on){if(btn._lbl==null)btn._lbl=btn.innerHTML;btn.disabled=true;btn.classList.add('busy');if(label)btn.textContent=label;}
  else{btn.disabled=false;btn.classList.remove('busy');if(btn._lbl!=null){btn.innerHTML=btn._lbl;btn._lbl=null;}}
}

/* ---------- helpers ---------- */
function $(s){return document.querySelector(s);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function pad(n){return String(n).padStart(2,'0');}
function fmtDur(ms){if(ms<0)ms=0;var m=Math.round(ms/MIN);if(m<60)return m+' min';var h=Math.floor(m/60),r=m%60;return r?h+' h '+pad(r):h+' h';}
function fmtSec(s){s=Math.max(0,Math.round(s));return pad(Math.floor(s/60))+':'+pad(s%60);}
function fmtTime(t){var d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes());}
function dayKey(t){var d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function dayLabel(t){var k=dayKey(t),today=dayKey(Date.now()),y=dayKey(Date.now()-864e5);if(k===today)return 'Oggi';if(k===y)return 'Ieri';var d=new Date(t);return ['dom','lun','mar','mer','gio','ven','sab'][d.getDay()]+' '+d.getDate()+'/'+(d.getMonth()+1);}
function birthMs(){var b=new Date(S.settings.birth+'T00:00:00');return isNaN(b)?null:b.getTime();}
function ageDays(){var b=birthMs();if(b==null)return 30;return Math.max(0,Math.floor((Date.now()-b)/864e5));}
function ageStr(){var b=birthMs();if(b==null)return '';var d=Math.floor((Date.now()-b)/864e5);if(d<0)return 'in arrivo';var w=Math.floor(d/7),r=d%7,s='';if(w)s+=w+(w===1?' settimana':' settimane');if(w&&r)s+=' e ';if(r||!w)s+=r+(r===1?' giorno':' giorni');return s;}
function sorted(){return S.events.slice().sort(function(a,b){return a.t-b.t;});}
function mean(a){return a.length?a.reduce(function(s,x){return s+x;},0)/a.length:null;}
function sd(a){if(a.length<2)return 0;var m=mean(a);return Math.sqrt(a.reduce(function(s,x){return s+(x-m)*(x-m);},0)/(a.length-1));}
function pct(a,p){if(!a.length)return null;var b=a.slice().sort(function(x,y){return x-y;});var i=Math.min(b.length-1,Math.max(0,Math.round(p*(b.length-1))));return b[i];}
function median(a){return pct(a,0.5);}
function typicalMl(){var f=sorted().filter(function(e){return e.k==='feed'&&e.ml;}).slice(-10).map(function(e){return e.ml;});return median(f);}
function typicalPrep(){var f=sorted().filter(function(e){return e.k==='feed'&&e.prep;}).slice(-6).map(function(e){return e.prep;});return median(f)||90;}
function toast(msg){var t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('on');},2400);}
function cause(id){for(var i=0;i<CAUSES.length;i++)if(CAUSES[i].id===id)return CAUSES[i];return null;}
function byId(id){for(var i=0;i<S.events.length;i++)if(S.events[i].id===id)return S.events[i];return null;}

/* ---------- norms & context ---------- */
/* norme per età; se i genitori hanno scelto un intervallo pappe (Impostazioni), quello vale per tutti (modello, riquadri, previsioni, promemoria) */
function norms(ad){var w=ad/7,o={feedH:w<6?3:(w<12?3.5:4),awakeMin:w<4?55:(w<8?70:(w<12?85:105))};if(S.settings.feedH>0)o.feedH=S.settings.feedH;return o;}
function context(now){
  var ev=sorted().filter(function(e){return e.t<=now;});
  var lastFeed=null,lastDiaper=null,lastSleep=null,lastWake=null;
  ev.forEach(function(e){if(e.k==='feed'){if(fedFeed(e))lastFeed=e;}else if(e.k==='diaper')lastDiaper=e;else if(e.k==='sleep')lastSleep=e;else if(e.k==='wake')lastWake=e;});
  var sleeping=!!(lastSleep&&(!lastWake||lastSleep.t>lastWake.t));
  var awakeMin=null,sleepingMin=null,lastNapMin=null;
  if(sleeping)sleepingMin=(now-lastSleep.t)/MIN;
  else if(lastWake){awakeMin=(now-lastWake.t)/MIN;if(lastSleep&&lastSleep.t<lastWake.t)lastNapMin=(lastWake.t-lastSleep.t)/MIN;}
  var ad=ageDays();
  return {now:now,ad:ad,n:norms(ad),
    sinceFeedH:lastFeed?(now-lastFeed.t)/H:null,lastMl:lastFeed?lastFeed.ml:null,lastPrep:lastFeed?lastFeed.prep:null,lastFeedT:lastFeed?lastFeed.t:null,
    sinceDiaperH:lastDiaper?(now-lastDiaper.t)/H:null,lastDiaper:lastDiaper,
    sleeping:sleeping,sleepingMin:sleepingMin,awakeMin:awakeMin,lastNapMin:lastNapMin,wakeT:lastWake?lastWake.t:null,sleepT:lastSleep?lastSleep.t:null,
    hour:new Date(now).getHours(),typicalMl:typicalMl()};
}
function snapshot(c){return {sinceFeedH:c.sinceFeedH,lastMl:c.lastMl,lastPrep:c.lastPrep,typicalMl:c.typicalMl,sinceDiaperH:c.sinceDiaperH,awakeMin:c.awakeMin,lastNapMin:c.lastNapMin,hour:c.hour,ad:c.ad,n:c.n};}
function bins(c){
  var f=-1,a=-1;
  if(c.sinceFeedH!=null){var r=c.sinceFeedH/c.n.feedH;f=r<0.5?0:(r<0.85?1:(r<1.15?2:3));}
  if(c.awakeMin!=null){var q=c.awakeMin/c.n.awakeMin;a=q<0.5?0:(q<1?1:2);}
  return {f:f,a:a,h:c.hour<6?0:(c.hour<12?1:(c.hour<17?2:3))};
}

/* ---------- context model ---------- */
function sig(x){return 1/(1+Math.exp(-x));}
function modelScores(c){
  if(!c.n)c.n=norms(c.ad!=null?c.ad:30);
  var s={},expH=c.n.feedH;
  if(c.sinceFeedH==null)s.fame=0.45;
  else{
    if(c.lastMl&&c.typicalMl&&c.lastMl<0.7*c.typicalMl)expH*=0.75;
    if(c.lastPrep&&c.lastMl!=null){var dr=c.lastMl/c.lastPrep;if(dr<0.4)expH*=0.7;else if(dr<0.7)expH*=0.85;}
    s.fame=0.05+0.9*sig((c.sinceFeedH/expH-0.75)*8);
  }
  if(c.awakeMin==null)s.sonno=0.35;
  else{s.sonno=0.05+0.85*sig((c.awakeMin/c.n.awakeMin-0.8)*6);if(c.awakeMin<10&&c.lastNapMin!=null&&c.lastNapMin<40)s.sonno=Math.max(s.sonno,0.55);}
  s.cambio=0.08+(c.sinceDiaperH==null?0.15:0.45*sig((c.sinceDiaperH/2.5-1)*4));
  if(c.sinceFeedH!=null&&c.sinceFeedH<0.5)s.cambio+=0.2;
  s.aria=0.05+((c.sinceFeedH!=null&&c.sinceFeedH<0.75)?0.35*(1-c.sinceFeedH/0.75):0);
  s.contatto=(c.hour>=17&&c.hour<23)?0.35:0.18;
  var tot=0;for(var k in s)tot+=s[k];for(var k2 in s)s[k2]/=tot;
  return s;
}
function labeledCries(){return S.events.filter(function(e){return e.k==='cry'&&e.label&&cause(e.label);});}
function outcomeCounts(filter){var c={fame:0,sonno:0,cambio:0,aria:0,contatto:0},n=0;labeledCries().forEach(function(e){if(filter&&!filter(e))return;c[e.label]++;n++;});return {c:c,n:n};}
function contextPosterior(snap,b,excludeId){
  var m=modelScores(snap);
  var g=outcomeCounts(function(e){return e.id!==excludeId;});
  var sim=outcomeCounts(function(e){return e.id!==excludeId&&e.bins&&e.bins.f===b.f&&e.bins.a===b.a;});
  var p={};
  CAUSES.forEach(function(c){var gc=(g.c[c.id]+6*m[c.id])/(g.n+6);p[c.id]=(sim.c[c.id]+4*gc)/(sim.n+4);});
  return {p:p,model:m,simN:sim.n,sim:sim.c,globalN:g.n};
}
function why(id,c){
  if(!c.n)c.n=norms(c.ad!=null?c.ad:30);
  var n=c.n;
  if(id==='fame'){if(c.sinceFeedH==null)return 'nessuna pappa registrata';var s='ultima pappa '+fmtDur(c.sinceFeedH*H)+' fa'+(c.lastMl?' ('+c.lastMl+' ml'+(c.lastPrep&&c.lastMl<c.lastPrep?' su '+c.lastPrep:'')+')':'');return s+' · a questa età circa ogni '+n.feedH+' h';}
  if(id==='sonno'){if(c.awakeMin==null)return 'nessuna nanna registrata';if(c.awakeMin<10&&c.lastNapMin!=null&&c.lastNapMin<40)return 'sveglio dopo un pisolino di soli '+Math.round(c.lastNapMin)+' min';return 'sveglio da '+fmtDur(c.awakeMin*MIN)+' · finestra di veglia ~'+n.awakeMin+' min';}
  if(id==='cambio'){var s2=c.sinceDiaperH==null?'nessun cambio registrato':'ultimo cambio '+fmtDur(c.sinceDiaperH*H)+' fa';if(c.sinceFeedH!=null&&c.sinceFeedH<0.5)s2+=' · subito dopo la pappa';return s2;}
  if(id==='aria'){return (c.sinceFeedH!=null&&c.sinceFeedH<0.75)?'pappa finita da '+fmtDur(c.sinceFeedH*H):'lontano dalla pappa';}
  if(id==='contatto'){return (c.hour>=17&&c.hour<23)?'fascia serale: orario tipico del pianto senza causa (picco a 6–8 settimane)':'nessun segnale specifico';}
  return '';
}

/* ---------- audio model: k-NN on acoustic fingerprints ---------- */
function audioSet(excludeId){return labeledCries().filter(function(e){return e.feat&&e.feat.vec&&e.id!==excludeId;});}
function zstats(set,extra){
  var d=extra?extra.length:set[0].feat.vec.length,mu=[],sg=[];
  for(var i=0;i<d;i++){var col=set.map(function(e){return e.feat.vec[i];});if(extra)col.push(extra[i]);var m=mean(col)||0,s=sd(col)||1;mu.push(m);sg.push(s>1e-6?s:1);}
  return {mu:mu,sg:sg};
}
function dist(a,b,z){var s=0;for(var i=0;i<a.length;i++){var x=(a[i]-z.mu[i])/z.sg[i]-(b[i]-z.mu[i])/z.sg[i];s+=x*x;}return Math.sqrt(s/a.length);}
function audioVote(vec,excludeId){
  var set=audioSet(excludeId);if(set.length<3||!vec)return null;
  var z=zstats(set,vec);
  var ds=set.map(function(e){return {id:e.id,label:e.label,d:dist(vec,e.feat.vec,z),t:e.t};}).sort(function(x,y){return x.d-y.d;});
  var k=Math.min(5,ds.length),p={fame:0,sonno:0,cambio:0,aria:0,contatto:0},tot=0;
  for(var i=0;i<k;i++){var w=1/(ds[i].d+0.35);p[ds[i].label]+=w;tot+=w;}
  for(var c in p)p[c]=(p[c]+0.02*tot)/(tot*1.1);
  return {p:p,n:set.length,nearest:ds.slice(0,3),meanD:mean(ds.slice(0,k).map(function(x){return x.d;}))};
}
function accuracy(){
  var set=labeledCries(),ctxOk=0,ctxN=0,audOk=0,audN=0,bothOk=0,bothN=0,cnt={};
  set.forEach(function(e){cnt[e.label]=(cnt[e.label]||0)+1;});
  var maj=0;for(var c in cnt)maj=Math.max(maj,cnt[c]);
  var base=set.length?maj/set.length:0;
  set.forEach(function(e){
    var cp=null,ap=null;
    if(e.ctx&&e.bins){cp=contextPosterior(e.ctx,e.bins,e.id).p;ctxN++;if(argmax(cp)===e.label)ctxOk++;}
    if(e.feat&&e.feat.vec){var v=audioVote(e.feat.vec,e.id);if(v){ap=v.p;audN++;if(argmax(ap)===e.label)audOk++;}}
    if(cp&&ap){bothN++;if(argmax(fuseRaw(cp,ap,0.5))===e.label)bothOk++;}
  });
  return {n:set.length,base:base,ctx:ctxN?ctxOk/ctxN:null,ctxN:ctxN,aud:audN?audOk/audN:null,audN:audN,both:bothN?bothOk/bothN:null,bothN:bothN};
}
function argmax(p){var b=null;for(var k in p)if(b==null||p[k]>p[b])b=k;return b;}
function fuseRaw(cp,ap,w){var p={},tot=0;for(var k in cp){p[k]=Math.pow(cp[k],1-w)*Math.pow(Math.max(ap[k],0.02),w);tot+=p[k];}for(var k2 in p)p[k2]/=tot;return p;}
function audioWeight(){
  var acc=accuracy();
  if(!acc.audN)return {w:0,calib:0,acc:acc};
  var base=Math.min(0.6,acc.audN/(acc.audN+12)),calib;
  if(acc.audN<8)calib=0.5;
  else calib=Math.max(0,Math.min(1,(acc.aud-acc.base)/0.3));
  return {w:base*calib,calib:calib,acc:acc};
}
function hypotheses(snap,b,vec){
  var cx=contextPosterior(snap,b,null),av=vec?audioVote(vec,null):null,aw=av?audioWeight():{w:0,calib:0};
  var p=av?fuseRaw(cx.p,av.p,aw.w):cx.p;
  var list=CAUSES.map(function(c){return {id:c.id,label:c.label,c:c.c,p:p[c.id],ctxP:cx.p[c.id],audP:av?av.p[c.id]:null,why:why(c.id,snap),simN:cx.simN,simC:cx.sim[c.id]};}).sort(function(x,y){return y.p-x.p;});
  return {list:list,simN:cx.simN,audio:av,w:aw.w,calib:aw.calib};
}

/* ---------- acoustic feature extraction ---------- */
function pitchAC(buf,sr){
  var n=buf.length,r0=0,i;for(i=0;i<n;i++)r0+=buf[i]*buf[i];r0/=n;
  if(r0<4e-5)return null;
  var minLag=Math.floor(sr/1000),maxLag=Math.min(n-64,Math.floor(sr/150)),best=-1,bestLag=-1,lag;
  for(lag=minLag;lag<=maxLag;lag+=1){var s=0;for(i=0;i<n-lag;i+=2)s+=buf[i]*buf[i+lag];s/=((n-lag)/2);if(s>best){best=s;bestLag=lag;}}
  if(bestLag<0||best/r0<0.45)return null;
  return sr/bestLag;
}
function analyseFrame(an,tbuf,fbuf,sr){
  an.getFloatTimeDomainData(tbuf);
  var n=tbuf.length,rms=0,zc=0,i;
  for(i=0;i<n;i++){rms+=tbuf[i]*tbuf[i];if(i&&(tbuf[i]>=0)!==(tbuf[i-1]>=0))zc++;}
  rms=Math.sqrt(rms/n);
  an.getByteFrequencyData(fbuf);
  var binHz=sr/(2*fbuf.length),maxBin=Math.min(fbuf.length,Math.floor(5000/binHz)),num=0,den=0;
  for(i=1;i<maxBin;i++){num+=fbuf[i]*i*binHz;den+=fbuf[i];}
  return {rms:rms,zcr:zc/n*sr/2,cent:den?num/den:0,f0:pitchAC(tbuf,sr)};
}
function features(frames){
  if(frames.length<16)return null;
  var rmsArr=frames.map(function(f){return f.rms;}),p95=pct(rmsArr,0.95),thr=Math.max(0.006,p95*0.25);
  var act=frames.map(function(f){return f.rms>thr;});
  var actFr=frames.filter(function(f,i){return act[i];});
  if(actFr.length<6)return null;
  var voiced=actFr.filter(function(f){return f.f0;}),f0s=voiced.map(function(f){return f.f0;});
  var meanF0=mean(f0s)||0,sdF0=sd(f0s),rangeF0=f0s.length>3?pct(f0s,0.9)-pct(f0s,0.1):0;
  var actRms=actFr.map(function(f){return f.rms;}),meanRms=mean(actRms)||0,rmsCV=meanRms?sd(actRms)/meanRms:0;
  var bursts=[],pauses=[],cur=null,pau=null,i;
  for(i=0;i<frames.length;i++){
    if(act[i]){if(cur==null)cur=frames[i].t;if(pau!=null){pauses.push(frames[i].t-pau);pau=null;}}
    else{if(cur!=null){bursts.push(frames[i].t-cur);cur=null;}if(pau==null)pau=frames[i].t;}
  }
  if(cur!=null)bursts.push(frames[frames.length-1].t-cur);
  bursts=bursts.filter(function(x){return x>=120;});pauses=pauses.filter(function(x){return x>=120;});
  var durS=Math.max(1,(frames[frames.length-1].t-frames[0].t)/1000);
  var slopes=[],run=[];
  for(i=0;i<=frames.length;i++){
    var f=frames[i];
    if(f&&act[i]&&f.f0)run.push(f);
    else{if(run.length>=4){var xs=run.map(function(r){return (r.t-run[0].t)/1000;}),ys=run.map(function(r){return r.f0;}),mx=mean(xs),my=mean(ys),num=0,den=0;for(var j=0;j<xs.length;j++){num+=(xs[j]-mx)*(ys[j]-my);den+=(xs[j]-mx)*(xs[j]-mx);}if(den>0)slopes.push(num/den);}run=[];}
  }
  var vec=[actFr.length/frames.length,meanF0,sdF0,rangeF0,meanRms,rmsCV,bursts.length/durS*10,mean(bursts)||0,mean(pauses)||0,mean(actFr.map(function(f){return f.cent;}))||0,mean(actFr.map(function(f){return f.zcr;}))||0,mean(slopes)||0];
  return {vec:vec,durS:durS,meanF0:meanF0,sdF0:sdF0,meanRms:meanRms,bursts10:bursts.length/durS*10,meanBurst:mean(bursts)||0,meanPause:mean(pauses)||0,voiced:f0s.length/frames.length,cent:vec[9]};
}

/* ---------- recorder ----------
   Ordine pensato per iOS (PWA da Safari): l'AudioContext nasce e viene ripreso DENTRO il tap, prima di getUserMedia
   (fuori dal gesto resterebbe sospeso); il MediaRecorder parte senza timeslice (su Safari i pezzi intermedi in
   audio/mp4 non sono affidabili); l'audio finisce in IndexedDB come {buf,mime}. Ogni passo scrive in diag(). */
function startRec(){
  diagReset();
  rec={t:Date.now(),frames:[],chunks:[],blob:null,mime:'',status:'starting',err:null,stream:null,ctx:null,an:null,src:null,mr:null,timer:null,stopped:false,retried:false,bytes:0};
  var hasMic=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  diag('mic',hasMic,hasMic?'getUserMedia disponibile':'navigator.mediaDevices.getUserMedia assente'+(isStandalone()?' (app installata: serve iOS 14.3 o più recente)':''));
  if(!hasMic){rec.status='nomic';rec.err='Questo browser non espone il microfono.';return;}
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)diag('ctx',false,'Web Audio non disponibile: registro senza impronta');
  else{
    try{
      rec.ctx=new AC();
      if(rec.ctx.state!=='running'&&rec.ctx.resume)rec.ctx.resume().catch(function(){});
      diag('ctx',true,'stato '+rec.ctx.state+', '+rec.ctx.sampleRate+' Hz');
      rec.ctx.onstatechange=function(){var c=rec&&rec.ctx;if(!c)return;if(!rec.stopped&&c.state!=='running'&&c.resume)c.resume().catch(function(){});diag('ctx',c.state==='running',(c.state==='running'?'in funzione':'stato '+c.state)+', '+c.sampleRate+' Hz');};
    }catch(e){rec.ctx=null;diag('ctx',false,errStr(e));}
  }
  var cons={audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
  navigator.mediaDevices.getUserMedia(cons).catch(function(){return navigator.mediaDevices.getUserMedia({audio:true});}).then(function(stream){
    if(!rec||rec.stopped){stream.getTracks().forEach(function(t){t.stop();});return;}
    rec.stream=stream;
    var tr=stream.getAudioTracks()[0],ts=null;try{ts=tr&&tr.getSettings?tr.getSettings():null;}catch(e){}
    diag('perm',true,'ok'+(tr&&tr.label?', '+tr.label:'')+(ts&&ts.sampleRate?', '+ts.sampleRate+' Hz':''));
    attachAnalyser();
    try{
      var cands=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      var mime=window.MediaRecorder&&MediaRecorder.isTypeSupported?cands.filter(function(m){return MediaRecorder.isTypeSupported(m);})[0]:'';
      if(!window.MediaRecorder){diag('rec',false,'MediaRecorder assente: salvo solo l\'impronta');}
      else{
        var mr=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
        rec.mime=mr.mimeType||mime||'';
        mr.ondataavailable=function(ev){if(ev.data&&ev.data.size){rec.chunks.push(ev.data);rec.bytes+=ev.data.size;}};
        mr.onerror=function(ev){diag('rec',false,'errore durante la registrazione: '+errStr(ev&&ev.error));};
        mr.start();rec.mr=mr;
        diag('rec',true,'in corso, formato '+(rec.mime||'predefinito del browser'));
      }
    }catch(e){rec.mr=null;diag('rec',false,errStr(e));}
    rec.status='live';rec.t=Date.now();
    rec.timer=setInterval(function(){
      if(!rec||rec.stopped)return;
      var fr=rec.an?analyseFrame(rec.an,rec.tbuf,rec.fbuf,rec.ctx.sampleRate):{rms:0,zcr:0,cent:0,f0:null};
      fr.t=Date.now()-rec.t;rec.frames.push(fr);
      var m=$('#meter');if(m)m.style.width=Math.min(100,Math.round(fr.rms*400))+'%';
      if(rec.frames.length%20===0)framesDiag();
      if(fr.t>=30000)A.stopRec();
    },50);
    renderCry();
  }).catch(function(err){
    if(!rec)return;
    rec.status='denied';
    rec.err=(err&&err.name==='NotAllowedError')?'Microfono non consentito in questa finestra.':'Microfono non disponibile ('+(err&&err.name||'errore')+').';
    diag('perm',false,errStr(err)+(err&&err.name==='NotAllowedError'?' (Impostazioni iPhone → Safari → Microfono, oppure riapri l\'app da Safari e reinstallala)':''));
    renderCry();
  });
}
function attachAnalyser(){
  if(!rec||!rec.ctx||!rec.stream)return;
  try{
    if(rec.src){try{rec.src.disconnect();}catch(e){}}
    var an=rec.ctx.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=0;
    rec.src=rec.ctx.createMediaStreamSource(rec.stream);rec.src.connect(an);rec.an=an;
    rec.tbuf=new Float32Array(an.fftSize);rec.fbuf=new Uint8Array(an.frequencyBinCount);
    if(rec.ctx.state!=='running'&&rec.ctx.resume)rec.ctx.resume().catch(function(){});
  }catch(e){rec.an=null;diag('ctx',false,'collegamento del microfono al motore audio fallito: '+errStr(e));}
}
function framesDiag(){
  if(!rec)return;
  var n=rec.frames.length,act=0,voiced=0,i;
  for(i=0;i<n;i++){if(rec.frames[i].rms>0.004)act++;if(rec.frames[i].f0)voiced++;}
  var el=(Date.now()-rec.t)/1000;
  if(!rec.an){diag('frames',false,'nessun motore audio: l\'impronta non si calcola');return;}
  if(act===0&&el>=2&&!rec.retried){
    /* iOS a volte cambia frequenza di campionamento quando parte il microfono e il contesto resta muto: ricollego una volta */
    rec.retried=true;
    try{if(rec.ctx.state!=='running'&&rec.ctx.resume)rec.ctx.resume();}catch(e){}
    attachAnalyser();
    diag('frames',null,'silenzio nei primi '+Math.round(el)+' s (contesto '+rec.ctx.state+'): ricollego il microfono al motore audio');
    return;
  }
  diag('frames',act>0?true:(el<2?null:false),n+' frame, '+act+' con suono, tono trovato in '+voiced+(act===0&&el>=2?' · il motore audio non riceve segnale (contesto '+rec.ctx.state+')':''));
}
function finishRec(){
  return new Promise(function(res){
    if(!rec){res();return;}
    rec.stopped=true;clearInterval(rec.timer);
    var done=function(){
      try{if(rec.stream)rec.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
      try{if(rec.ctx)rec.ctx.close();}catch(e){}
      if(rec.chunks.length){rec.blob=new Blob(rec.chunks,{type:rec.mime||(rec.chunks[0]&&rec.chunks[0].type)||'audio/mp4'});if(!rec.mime)rec.mime=rec.blob.type||'';}
      if(rec.mr)diag('data',!!rec.blob,rec.blob?Math.round(rec.blob.size/1024)+' kB, '+rec.chunks.length+(rec.chunks.length===1?' blocco':' blocchi')+', '+(rec.mime||'tipo sconosciuto'):'il registratore non ha consegnato dati');
      framesDiag();
      res();
    };
    if(rec.mr&&rec.mr.state!=='inactive'){
      var t=setTimeout(function(){diag('data',false,'il registratore non si è fermato entro 3 s');done();},3000);
      rec.mr.onstop=function(){clearTimeout(t);done();};
      try{rec.mr.stop();}catch(e){clearTimeout(t);done();}
    }
    else done();
  });
}
function isStandalone(){try{return navigator.standalone===true||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);}catch(e){return false;}}

/* ---------- cry flow ---------- */
A.openCry=function(){
  if(S.openCry&&byId(S.openCry)){flow={type:'cry',phase:'after',id:S.openCry};showScreen();renderCry();return;}
  flow={type:'cry',phase:'rec',id:null,liveHy:null};
  showScreen();renderCry();startRec();
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}
  flow.liveT=setInterval(function(){if(flow&&flow.type==='cry'&&flow.phase==='rec')renderCry(true);},1000);
};
A.stopRec=function(){
  if(!flow||flow.type!=='cry'||flow.phase!=='rec'||flow.stopping)return;
  flow.stopping=true;clearInterval(flow.liveT);
  var startT=rec?rec.t:Date.now();
  finishRec().then(function(){
    var now=Date.now(),c=context(startT);
    if(c.sleeping){var w=({id:uid(),k:'wake',t:startT,who:who});S.events.push(w);touched(w);c=context(startT);}
    var feat=rec?features(rec.frames):null;
    if(rec)diag('feat',!!feat,feat?'tono medio '+Math.round(feat.meanF0)+' Hz, '+Math.round(feat.bursts10*10)/10+' raffiche/10 s':(rec.frames.length<16?'registrazione troppo corta ('+rec.frames.length+' frame)':'troppo poco suono sopra la soglia'));
    var recErr=null;if(rec){var dr=diagGet('rec'),dp=diagGet('perm');recErr=rec.err||(dp&&dp.ok===false?dp.d:null)||(dr&&dr.ok===false?dr.d:null);}
    var info={mime:rec?rec.mime:'',bytes:rec&&rec.blob?rec.blob.size:0,frames:rec?rec.frames.length:0,err:rec?recErr:'nessuna registrazione'};
    var e={id:uid(),k:'cry',t:startT,dur:(now-startT)/1000,who:who,label:null,ctx:snapshot(c),bins:bins(c),feat:feat,audio:!!(rec&&rec.blob),mime:rec?rec.mime:'',rec:info};
    S.events.push(e);S.openCry=e.id;touched(e);save();
    var blob=rec&&rec.blob,mime=rec?rec.mime:'';
    if(blob)toast('Pianto salvato · audio '+Math.round(blob.size/1024)+' kB'+(feat?'':' · troppo corto per l\'impronta'));
    else toast('Pianto salvato senza audio'+(info.err?': '+info.err:''));
    rec=null;flow.phase='after';flow.id=e.id;renderCry();renderHome();
    if(blob)storeAudio(e,blob,mime);
    else if(diagGet('rec')&&diagGet('rec').ok!==false)diag('idb',null,'niente audio da salvare');
  });
};
function storeAudio(e,blob,mime){
  blobToBuf(blob).then(function(buf){
    return audioPut(e.id,buf,mime).then(function(ok){
      if(!ok){e.audio=false;save();diag('idb',false,'IndexedDB non ha accettato il file'+(db?'':' (database non aperto)'));renderCry();return;}
      diag('idb',true,Math.round(buf.byteLength/1024)+' kB, '+(mime||'tipo sconosciuto'));
      queueUpload(e.id);
    });
  }).catch(function(err){e.audio=false;save();diag('idb',false,'lettura del file fallita: '+errStr(err));renderCry();});
}
/* upload nel bucket "cries": subito se collegati, altrimenti resta in coda (alan.audio.outbox) finché non torna la rete */
var AUDIO_OUTBOX='alan.audio.outbox',uploading={};
function audioOutbox(){try{return JSON.parse(lsGet(AUDIO_OUTBOX)||'[]');}catch(e){return [];}}
function setAudioOutbox(a){lsSet(AUDIO_OUTBOX,JSON.stringify(a));}
function queueUpload(id){var ob=audioOutbox();if(ob.indexOf(id)<0){ob.push(id);setAudioOutbox(ob);}flushAudio();}
function syncReady(){return !!(window.AlanSync&&AlanSync.status().family);}
function flushAudio(){
  var ob=audioOutbox();if(!ob.length)return;
  if(!syncReady()){var st=window.AlanSync?AlanSync.status():null;diag('up',null,!st||!st.available?(st&&st.configured&&!st.lib?'libreria di sync non caricata: riprovo alla prossima apertura':'sync non configurato: l\'audio resta su questo telefono'):(!st.signedIn?'non hai fatto l\'accesso: l\'audio resta su questo telefono':'in attesa del collegamento'));renderCry();return;}
  ob.forEach(function(id){
    if(uploading[id])return;
    var e=byId(id);
    if(!e){setAudioOutbox(audioOutbox().filter(function(x){return x!==id;}));return;}
    uploading[id]=true;renderCry();
    audioGet(id).then(function(a){
      if(!a){setAudioOutbox(audioOutbox().filter(function(x){return x!==id;}));diag('up',false,'file non trovato sul telefono');return;}
      var mime=a.mime||e.mime||'application/octet-stream';
      diag('up',null,'invio in corso…');
      return AlanSync.uploadAudio(id,a.blob,mime).then(function(r){
        if(!r||r.error||!r.path){var msg=r&&r.error?String(r.error):'nessuna risposta';diag('up',false,msg+(msg.indexOf('ucket')>=0?' (bucket "cries" mancante: esegui il blocco 5 di supabase/schema.sql)':''));lsSet('alan.lastUpload',msg);return;}
        e.audioPath=r.path;e.mime=mime;touched(e);save();
        setAudioOutbox(audioOutbox().filter(function(x){return x!==id;}));
        diag('up',true,r.path+' caricato'+(a.blob&&a.blob.size?', '+Math.round(a.blob.size/1024)+' kB':''));
      });
    }).catch(function(err){diag('up',false,errStr(err));}).then(function(){delete uploading[id];renderCry();renderCries();});
  });
}
function audioStatusLine(e){
  if(!e)return '';
  var st;
  if(e.audio)st='Audio salvato su questo telefono';
  else if(e.audioPath)st='Audio sull\'altro telefono (si scarica al primo ascolto)';
  else{var d=diagGet('idb'),r=diagGet('rec');st=(r&&r.ok===false)?'Senza audio: '+r.d:((d&&d.ok===false)?'Audio non salvato: '+d.d:'Senza audio');}
  if(e.audio){
    if(e.audioPath)st+=' · condiviso con l\'altro telefono';
    else if(uploading[e.id])st+=' · invio in corso…';
    else if(audioOutbox().indexOf(e.id)>=0){var u=diagGet('up');st+=' · '+(u&&u.ok===false?'invio fallito, riprovo: '+u.d:(u&&u.d?u.d:'invio in attesa'));}
  }
  return '<p class="hint" id="audioSt">'+esc(st)+'</p>';
}
A.cancelCry=function(){
  clearInterval(flow&&flow.liveT);
  if(rec){rec.stopped=true;clearInterval(rec.timer);try{if(rec.stream)rec.stream.getTracks().forEach(function(t){t.stop();});if(rec.ctx)rec.ctx.close();}catch(e){}rec=null;}
  if(flow&&flow.id){var id=flow.id,ce=byId(id);S.events=S.events.filter(function(e){return e.id!==id;});dropAudio(ce||{id:id});if(S.openCry===id)S.openCry=null;if(ce)removed(ce);save();}
  flow=null;A.home();toast('Pianto cancellato');
};
function dropAudio(e){
  if(!e)return;
  idbDel('audio',e.id);setAudioOutbox(audioOutbox().filter(function(x){return x!==e.id;}));
  if(e.audioPath&&window.AlanSync)AlanSync.removeAudio(e.audioPath).catch(function(){});
}
A.labelCry=function(id,label){
  var e=byId(id);if(!e)return;
  e.label=label;if(S.openCry===id)S.openCry=null;touched(e);save();
  toast('Segnato: '+LABELS[label]);
};
A.solo=function(){if(flow&&flow.id)A.labelCry(flow.id,'solo');A.home();};
A.soloOpen=function(){if(S.openCry)A.labelCry(S.openCry,'solo');renderHome();};
/* spiega un pianto con un'azione già nel diario: la causa è quella dell'azione, e resta scritto con quale */
A.explainWith=function(cid,eid){
  var cry=byId(cid),ev=byId(eid);if(!cry||!ev)return;
  var label=labelFor(ev);if(!label)return;
  cry.label=label;cry.by=ev.id;touched(cry);
  if(S.openCry===cry.id)S.openCry=null;
  save();renderHome();renderCries();
  toast('Pianto spiegato: '+LABELS[label].toLowerCase()+' ('+describe(ev,null)[0].toLowerCase()+' delle '+fmtTime(ev.t)+')');
  A.cryDetail(cid);
};
/* nasconde il banner per un paio d'ore senza spiegare niente: il pianto resta lì e si cataloga con calma */
A.laterCry=function(){lsSet(BANNER_HIDE,String(Date.now()+2*H));renderHome();};
A.leaveOpen=function(){A.home();};
function renderCry(liveOnly){
  if(!flow||flow.type!=='cry')return;
  var el=$('#screenInner'),h='';
  if(flow.phase==='rec'){
    var st=rec?rec.status:'nomic',elapsed=rec?(Date.now()-rec.t)/1000:0;
    var live=st==='live';
    h+='<div class="bar"><button class="back" onclick="A.cancelCry()" aria-label="Annulla">×</button><div class="title">Sta piangendo</div></div>';
    h+='<div class="rec"><div class="dot '+(live?'live':'off')+'"></div><div class="t">'+fmtSec(live?elapsed:0)+'</div><div class="meter"><i id="meter"></i></div>';
    if(st==='starting')h+='<div class="st">Sto accendendo il microfono…</div>';
    else if(st==='live')h+='<div class="st">Registro fino a 30 secondi. Ferma quando vuoi: bastano 5–10 secondi di pianto.</div>';
    else h+='<div class="st">'+esc(rec?rec.err:'Microfono non disponibile.')+' Il pianto viene segnato lo stesso, solo senza impronta acustica.</div>';
    h+='</div>';
    var c=context(rec?rec.t:Date.now()),snap=snapshot(c),b=bins(c);
    var vec=null,note='';
    if(live&&rec.frames.length>=80){var f=features(rec.frames);if(f)vec=f.vec;}
    var hy=hypotheses(snap,b,vec);
    if(live&&!vec)note='Dopo 4–5 secondi confronto anche il suono con i pianti già registrati.';
    else if(vec&&!hy.audio)note='Ascolto in corso. Servono almeno 3 pianti etichettati per confrontare il suono: per ora conta solo il contesto.';
    else if(vec&&hy.audio)note='Suono confrontato con '+hy.audio.n+' pianti etichettati (peso '+Math.round(hy.w*100)+'%).';
    h+=hypList(hy);
    if(note)h+='<p class="hint">'+note+'</p>';
    h+='<button class="btn huge" onclick="A.stopRec()">'+(live?'Ferma e salva':'Salva il pianto')+'</button>';
  }else{
    var e=byId(flow.id);if(!e){A.home();return;}
    h+='<div class="bar"><button class="back" onclick="A.leaveOpen()" aria-label="Chiudi">×</button><div class="title">Pianto delle '+fmtTime(e.t)+'</div></div>';
    var hy2=hypotheses(e.ctx,e.bins,e.feat?e.feat.vec:null);
    h+=hypList(hy2);
    if(e.feat)h+='<p class="hint">Impronta: tono medio '+Math.round(e.feat.meanF0)+' Hz · '+Math.round(e.feat.bursts10*10)/10+' raffiche ogni 10 s · voce nel '+Math.round(e.feat.voiced*100)+'% del tempo'+(hy2.audio?' · pianti simili: '+hy2.audio.nearest.map(function(x){return LABELS[x.label]+' '+fmtTime(x.t);}).join(', '):'')+'.</p>';
    h+=audioStatusLine(e);
    h+='<div class="note">Adesso fai quello che ti sembra giusto. Quello che registri da qui spiega questo pianto.</div>';
    h+='<div class="grid2">';
    h+='<button style="border-bottom:4px solid var(--c-fame)" onclick="A.flow(\'feed\',\''+e.id+'\')">Pappa</button>';
    h+='<button style="border-bottom:4px solid var(--c-sonno)" onclick="A.flow(\'sleep\',\''+e.id+'\')">Nanna</button>';
    h+='<button style="border-bottom:4px solid var(--c-cambio)" onclick="A.flow(\'diaper\',\''+e.id+'\')">Pannolino</button>';
    h+='<button style="border-bottom:4px solid var(--c-contatto)" onclick="A.flow(\'other\',\''+e.id+'\')">Altro</button>';
    h+='</div><div class="spacer"></div>';
    h+='<button class="btn ghost" onclick="A.solo()">Si è calmato da solo</button>';
    h+='<button class="btn ghost" onclick="A.leaveOpen()">Decido dopo</button>';
    h+='<button class="btn warn" onclick="A.cancelCry()">Falso allarme, cancella</button>';
  }
  if(liveOnly){var box=$('#hyBox');if(box){var c2=context(rec?rec.t:Date.now());var v2=null;if(rec&&rec.status==='live'&&rec.frames.length>=80){var f2=features(rec.frames);if(f2)v2=f2.vec;}box.outerHTML=hypList(hypotheses(snapshot(c2),bins(c2),v2));var tt=$('#recT');if(tt&&rec)tt.textContent=fmtSec((Date.now()-rec.t)/1000);}return;}
  el.innerHTML=h.replace('<div class="t">','<div class="t" id="recT">');
}
function hypList(hy){
  var h='<div id="hyBox">';
  hy.list.forEach(function(x){
    h+='<div class="hyp" style="--hc:'+x.c+'"><div class="h"><span class="name">'+x.label+'</span><span class="pct">'+Math.round(x.p*100)+'%</span></div>';
    h+='<div class="bar2"><i style="width:'+Math.max(3,Math.round(x.p*100))+'%"></i>'+(x.audP!=null&&hy.w>0?'<em style="left:'+Math.round(x.ctxP*100)+'%" title="solo contesto"></em>':'')+'</div>';
    h+='<div class="why">'+esc(x.why)+(hy.simN?' · in '+hy.simN+' episodi simili: '+x.simC:'')+(x.audP!=null&&hy.w>0?' · suono '+Math.round(x.audP*100)+'%':'')+'</div></div>';
  });
  return h+'</div>';
}

/* ---------- tap flows ---------- */
A.flow=function(type,linkId,data){
  flow={type:type,step:0,off:0,data:data||{},link:linkId||null};
  showScreen();renderFlow();
};
A.setOff=function(o){if(flow){flow.off=o;flow.at=null;flow.end=null;renderFlow();}};
/* "altra ora": orario di inizio scritto con il selettore (HH:MM); se è nel futuro di oltre 5 minuti vale per ieri.
   Solo per la Pappa anche "finita alle": la differenza diventa la durata (dur, secondi). */
A.setAt=function(v){if(!flow)return;flow.at=/^\d{2}:\d{2}$/.test(v||'')?v:null;if(!flow.at)flow.end=null;renderFlow();};
A.setEnd=function(v){if(!flow)return;flow.end=/^\d{2}:\d{2}$/.test(v||'')?v:null;renderFlow();};
function atToMs(hhmm,now){
  now=now||Date.now();var p=hhmm.split(':'),d=new Date(now);d.setHours(+p[0],+p[1],0,0);
  var t=d.getTime();if(t>now+5*MIN)t-=864e5;return t;
}
function flowTime(){
  if(!flow||!flow.at)return null;
  var t=atToMs(flow.at),dur=null;
  if(flow.end){var e=atToMs(flow.end,t+12*H);if(e<t)e+=864e5;dur=Math.round((e-t)/1000);if(dur<=0||dur>6*3600)dur=null;}
  return {t:t,dur:dur};
}
A.pick=function(key,val){if(!flow)return;flow.data[key]=val;flow.step++;renderFlow();}
A.stepPrep=function(d){if(!flow)return;flow.data.prepCustom=Math.max(10,Math.min(400,(flow.data.prepCustom||typicalPrep())+d));renderFlow();};
A.home=function(){
  if(flow&&flow.type==='cry'&&flow.phase==='rec'){A.cancelCry();return;}
  flow=null;$('#screen').classList.remove('on');renderHome();renderCries();
};
function showScreen(){$('#screen').classList.add('on');$('#screen').scrollTop=0;}
function whenRow(){
  var opts=[[0,'adesso'],[15,'15 min fa'],[30,'30 min fa'],[60,'1 h fa']],at=flow.at||null;
  var h='<div class="when"><span>Quando</span>'+opts.map(function(o){return '<button class="'+(!at&&flow.off===o[0]?'on':'')+'" onclick="A.setOff('+o[0]+')">'+o[1]+'</button>';}).join('');
  h+='<label class="datechip'+(at?' on':'')+'">'+(at?'alle '+esc(at):'altra ora')+'<input type="time" value="'+esc(at||fmtTime(Date.now()))+'" onchange="A.setAt(this.value)" aria-label="Orario di inizio"></label></div>';
  if(at&&flow.type==='feed'){
    var ft=flowTime();
    h+='<div class="when"><span>Finita</span><label class="datechip'+(flow.end?' on':'')+'">'+(flow.end?'alle '+esc(flow.end):'quando è finita?')+'<input type="time" value="'+esc(flow.end||at)+'" onchange="A.setEnd(this.value)" aria-label="Orario di fine"></label>'+(ft&&ft.dur?'<span>'+Math.round(ft.dur/60)+' min</span>':'')+'</div>';
  }
  return h;
}
/* "Durata": un tap per avere il tempo della pappa anche senza cronometro. Se la durata arriva dal cronometro o dall'ora
   di fine, la riga la mostra e basta. */
var DURS=[5,10,15,20,30,45];
function durRow(){
  /* flow.data.dur arriva dal cronometro in secondi; la scelta a mano sta in durMin (minuti) */
  var ft=flowTime(),fixed=(ft&&ft.dur)?ft.dur:(flow.data.dur||null);
  if(fixed)return '<div class="when"><span>Durata</span><button class="on" disabled>'+Math.round(fixed/60)+' min</button></div>';
  var cur=flow.data.durMin||0;
  return '<div class="when"><span>Durata</span>'+DURS.map(function(m){return '<button class="'+(cur===m?'on':'')+'" onclick="A.setDur('+m+')">'+m+'</button>';}).join('')+'<button onclick="A.setDur(0)">non lo so</button></div>';
}
A.setDur=function(m){if(!flow)return;flow.data.durMin=(flow.data.durMin===m?0:m)||0;renderFlow();};
function backBtn(){return '<button class="back" onclick="A.home()" aria-label="Indietro">‹</button>';}
function renderFlow(){
  if(!flow||flow.type==='cry')return;
  var el=$('#screenInner'),h='',d=flow.data,tp=typicalPrep();
  if(flow.type==='feed'){
    h+='<div class="bar">'+backBtn()+'<div class="title">Pappa</div></div>'+whenRow();
    if(flow.step===0){
      var opts=[60,90,115,120,125,150,180,210];
      h+='<h2>Quanto hai preparato?</h2><div class="grid3">'+opts.map(function(m){return '<button class="'+(Math.round(tp)===m?'on':'')+'" onclick="A.pick(\'prep\','+m+')">'+m+'<small>ml</small></button>';}).join('')+'</div>';
      var cv=d.prepCustom||tp;
      h+='<div class="stepper"><button onclick="A.stepPrep(-10)">−10</button><div class="val">'+cv+' ml</div><button onclick="A.stepPrep(10)">+10</button></div><button class="btn ghost" onclick="A.pick(\'prep\','+cv+')">Avanti con '+cv+' ml</button>';
    }else{
      var prep=d.prep,vals=[];for(var v=prep;v>0;v-=10)vals.push(v);vals.push(0);
      h+=durRow();
      h+='<h2>Quanto ne ha bevuto? <span style="font-size:15px;color:var(--muted);font-weight:400">su '+prep+' ml</span></h2><div class="grid3">'+vals.map(function(v){return '<button onclick="A.finish('+v+')">'+(v===prep?'Tutto<small>'+v+' ml</small>':(v===0?'Niente<small>rifiutato</small>':v+'<small>ml</small>'))+'</button>';}).join('')+'</div>';
    }
  }else if(flow.type==='diaper'){
    h+='<div class="bar">'+backBtn()+'<div class="title">Pannolino</div></div>'+whenRow();
    if(flow.step===0)h+='<h2>Pipì?</h2><div class="grid2">'+['poca','normale','tanta','no'].map(function(o){return '<button onclick="A.pick(\'pipi\',\''+o+'\')">'+LVL[o].charAt(0).toUpperCase()+LVL[o].slice(1)+'</button>';}).join('')+'</div>';
    else h+='<h2>Cacca?</h2><div class="grid2">'+['poca','normale','tanta','no'].map(function(o){return '<button onclick="A.finish(\''+o+'\')">'+LVL[o].charAt(0).toUpperCase()+LVL[o].slice(1)+'</button>';}).join('')+'</div>';
  }else if(flow.type==='sleep'){
    var c=context(Date.now());
    h+='<div class="bar">'+backBtn()+'<div class="title">Nanna</div></div>'+whenRow();
    if(c.sleeping)h+='<h2>Dorme da '+fmtDur(c.sleepingMin*MIN)+'</h2><button class="btn huge" onclick="A.finish(\'wake\')">Si è svegliato</button>';
    else h+='<h2>'+(c.awakeMin!=null?'Sveglio da '+fmtDur(c.awakeMin*MIN):'Nessuna nanna registrata')+'</h2><button class="btn huge" onclick="A.finish(\'sleep\')">Si è addormentato</button>';
    if(flow.link)h+='<div class="spacer"></div><p class="hint">Se il pianto era sonno ma non si è ancora addormentato, torna indietro e scegli "Decido dopo": lo colleghi quando dorme.</p>';
  }else if(flow.type==='other'){
    h+='<div class="bar">'+backBtn()+'<div class="title">Altro</div></div>'+whenRow();
    h+='<h2>Cosa hai fatto?</h2><div class="grid2">'+OTHER.map(function(o){return '<button style="border-bottom:4px solid var(--c-'+o[2]+')" onclick="A.finish(\''+o[0]+'\')">'+o[1]+'</button>';}).join('')+'</div>';
  }
  if(HEALTH_TYPES[flow.type])h=renderHealthFlow();
  else if(flow.type==='edit')h=renderEdit();
  if(EXT.flows[flow.type])h=EXT.flows[flow.type].render(flow,API);
  el.innerHTML=h;
}
A.finish=function(val){
  if(!flow)return;
  if(flow.type==='edit'){editSave(val);return;}
  var t=Date.now()-flow.off*MIN,d=flow.data,e=null,msg='',ft=flowTime();
  if(ft)t=ft.t;
  if(flow.type==='feed'){var ml=Number(val);e={k:'feed',prep:d.prep,ml:ml};msg=ml>0?'Pappa: '+ml+' ml su '+d.prep:'Biberon rifiutato';}
  else if(flow.type==='diaper'){e={k:'diaper',pipi:d.pipi,cacca:val};msg='Cambio: pipì '+LVL[d.pipi]+', cacca '+LVL[val];}
  else if(flow.type==='sleep'){e={k:val};msg=val==='sleep'?'Buona nanna':'Si è svegliato';}
  else if(flow.type==='other'){var o=OTHER.filter(function(x){return x[0]===val;})[0];e={k:'other',what:val};msg=o?o[1]+' registrato':'Registrato';}
  else if(HEALTH_TYPES[flow.type]){var hr=healthFinish(val);if(!hr){toast('Niente da salvare');return;}e=hr.e;t=hr.t;msg=hr.msg;}
  else if(EXT.flows[flow.type]){var xr=EXT.flows[flow.type].finish(flow,val,API);if(xr===false){return;}if(!xr||!xr.e){toast('Niente da salvare');return;}e=xr.e;if(xr.t)t=xr.t;msg=xr.msg||'Salvato';}
  if(!e)return;
  if(e.k==='feed'){
    var fdur=(ft&&ft.dur)?ft.dur:(d.dur||(d.durMin?d.durMin*60:0));
    if(fdur>0){e.dur=fdur;e.src='biberon';}
  }
  e.id=uid();e.t=t;e.who=who;S.events.push(e);touched(e);
  var linked=tryLabelOpenCry(e,flow.link);
  save();
  flow=null;$('#screen').classList.remove('on');renderHome();
  var vs=$('#v-salute');if(vs&&vs.classList.contains('on'))renderHealth();
  toast(linked?msg+' · il pianto delle '+fmtTime(linked.t)+' era '+LABELS[linked.label]:msg);
};

/* ---------- home ---------- */
function statusTile(lbl,big,sub,color,warn,onclick){return '<button class="'+(warn?'warn':'')+'" style="--tc:'+color+'" onclick="'+onclick+'"><div class="lbl">'+lbl+'</div><div class="big">'+big+'</div><div class="sub">'+sub+'</div></button>';}
/* intestazione: una pillola per genitore, pallino verde se ha l'app aperta (presence). I nomi vengono dal profilo
   dell'utente loggato (blocco 7 dello schema), dalle voci del diario e da chi è collegato adesso. */
function knownNames(){
  var names={};if(who&&who!=='Io')names[who]=true;
  S.events.forEach(function(e){if(e.who&&e.who!=='Io')names[e.who]=true;});
  if(window.AlanSync){var st=AlanSync.status();if(st.name)names[st.name]=true;for(var n in (st.online||{}))if(n&&n!=='?')names[n]=true;}
  return Object.keys(names).sort();
}
function renderHeader(){
  $('#hName').textContent=S.settings.name||'Alan';$('#hAge').textContent=ageStr();
  var st=window.AlanSync?AlanSync.status():{},online=st.online||{},me=st.name||null,h='';
  knownNames().forEach(function(n){h+='<span class="pill'+(online[n]?' on':'')+(n===me?' me':'')+'"><i></i>'+esc(n)+'</span>';});
  if(!h)h='<span class="pill"><i></i>'+esc(who)+'</span>';
  $('#presence').innerHTML=h;
}
function renderStatus(){
  var now=Date.now(),c=context(now),h='';
  h+=statusTile('Ultima pappa',c.lastFeedT?fmtDur(now-c.lastFeedT)+' fa':'—',c.lastFeedT?(c.lastMl?c.lastMl+' ml, '+fmtTime(c.lastFeedT):fmtTime(c.lastFeedT)):'nessuna','var(--c-fame)',c.sinceFeedH!=null&&c.sinceFeedH>c.n.feedH,'A.flow(\'feed\')');
  if(c.sleeping)h+=statusTile('Dorme da',fmtDur(c.sleepingMin*MIN),'dalle '+fmtTime(c.sleepT),'var(--c-sonno)',false,'A.flow(\'sleep\')');
  else h+=statusTile('Sveglio da',c.awakeMin!=null?fmtDur(c.awakeMin*MIN):'—',c.awakeMin!=null?'finestra ~'+c.n.awakeMin+' min':'nessuna nanna','var(--c-sonno)',c.awakeMin!=null&&c.awakeMin>c.n.awakeMin,'A.flow(\'sleep\')');
  var ld=c.lastDiaper;
  h+=statusTile('Ultimo cambio',c.sinceDiaperH!=null?fmtDur(c.sinceDiaperH*H)+' fa':'—',ld?('pipì '+LVL[ld.pipi]+', cacca '+LVL[ld.cacca]):'nessuno','var(--c-cambio)',c.sinceDiaperH!=null&&c.sinceDiaperH>3,'A.flow(\'diaper\')');
  $('#status').innerHTML=h;
  var oc=S.openCry?byId(S.openCry):null,bn=$('#openCryBanner');
  var hideUntil=+(lsGet(BANNER_HIDE)||0);
  if(oc&&!oc.label&&Date.now()>=hideUntil){
    var hy=null;try{hy=hypotheses(oc.ctx||snapshot(context(oc.t)),oc.bins||bins(context(oc.t)),oc.feat?oc.feat.vec:null);}catch(e9){}
    var top=hy&&hy.list.length?hy.list.slice(0,2):[];
    var bh='<div class="banner"><div class="bn-txt"><b>Pianto delle '+fmtTime(oc.t)+'</b>'+(oc.auto?' <span class="tag-auto">sentito dall\'app</span>':'');
    bh+=top.length?'<span>probabilmente '+esc(top[0].label.toLowerCase())+' ('+Math.round(top[0].p*100)+'%) · prova:</span>':'<span>senza spiegazione: la prossima cosa che registri lo etichetta.</span>';
    bh+='</div><div class="bn-acts">';
    top.forEach(function(x){var t=TRY[x.id];if(t)bh+='<button onclick="A.flow(\''+t[0]+'\',\''+oc.id+'\')">'+esc(t[1])+'</button>';});
    bh+='<button class="ghost" onclick="A.soloOpen()">Da solo</button><button class="ghost" onclick="A.laterCry()">Dopo</button></div>';
    var pend=pendingCries().length;
    if(pend>1)bh+='<button class="bn-more" onclick="A.goCries()">'+pend+' pianti da spiegare · falli con calma</button>';
    bh+='</div>';
    bn.innerHTML=bh;
  }
  else{bn.innerHTML='';if(oc&&oc.label)S.openCry=null;}
  if(oc&&oc.label)lsSet(BANNER_HIDE,'0');
  $('#qSleep').innerHTML=c.sleeping?'Sveglio<small>si è svegliato</small>':'Nanna<small>si è addormentato</small>';
  var tp=typicalPrep();$('#qFeed').textContent='di solito '+Math.round(tp)+' ml';
}
function describe(e,prev){
  if(EXT.describe[e.k])return EXT.describe[e.k](e,API);
  if(e.k==='feed')return ['Pappa','<span class="detail">'+(e.ml>0?e.ml+' ml'+(e.prep&&e.ml<e.prep?' su '+e.prep:''):'rifiutata'+(e.prep?' ('+e.prep+' ml)':''))+'</span>'];
  if(e.k==='diaper')return ['Cambio','<span class="detail">pipì '+LVL[e.pipi]+', cacca '+LVL[e.cacca]+'</span>'];
  if(e.k==='sleep')return ['Nanna',''];
  if(e.k==='wake'){var d='';if(prev&&prev.k==='sleep')d='<span class="detail">ha dormito '+fmtDur(e.t-prev.t)+'</span>';return ['Sveglio',d];}
  if(e.k==='other'){var o=OTHER.filter(function(x){return x[0]===e.what;})[0];return [o?o[1]:'Altro',''];}
  if(e.k==='cry'){var d2=e.label?LABELS[e.label]:'senza spiegazione';if(e.dur)d2+=' · '+fmtSec(e.dur);return ['Pianto','<span class="detail">'+d2+'</span>'];}
  if(e.k==='measure'){var mp=[];if(e.w!=null)mp.push(METRICS.w.fmt(e.w));if(e.l!=null)mp.push(METRICS.l.fmt(e.l));return ['Misure','<span class="detail">'+esc(mp.join(' · '))+'</span>'];}
  if(e.k==='temp')return ['Temperatura','<span class="detail">'+fmtTemp(e.c)+'</span>'];
  if(e.k==='med')return [esc(medName(e)),''];
  if(e.k==='appt')return ['Visita','<span class="detail">'+esc(e.title||apptKind(e.kind))+'</span>'];
  return [e.k,''];
}
/* colore della voce nel diario: lo stesso dei riquadri di Home */
function kindDot(e){
  if(e.k==='feed')return 'var(--c-fame)';
  if(e.k==='diaper')return 'var(--c-cambio)';
  if(e.k==='sleep'||e.k==='wake')return 'var(--c-sonno)';
  if(e.k==='cry')return 'var(--danger)';
  if(e.k==='other'){var o=OTHER.filter(function(x){return x[0]===e.what;})[0];return o&&o[2]==='aria'?'var(--c-aria)':'var(--c-contatto)';}
  return 'var(--muted)';
}
/* intestazione della giornata nel diario */
function dayHead(t){var k=dayKey(t),n=Date.now();if(k===dayKey(n))return 'Oggi';if(k===dayKey(n-864e5))return 'Ieri';return dayLabel(t);}
/* una riga del diario: ora, pallino del tipo, descrizione (più la nota dalle estensioni), chi. Il tocco apre la modifica. */
function diaryRow(e,prev,noWho){
  var d=describe(e,prev),x=extRow(e);
  return '<button class="row tap" onclick="A.edit(\''+e.id+'\')"><div class="time">'+fmtTime(e.t)+'</div>'+
    '<div class="what"><i class="dot" style="--dc:'+kindDot(e)+'"></i>'+d[0]+' '+d[1]+x+'</div>'+
    '<span class="meta">'+(!noWho&&e.who?'<span class="who">'+esc(e.who)+'</span>':'')+'<span class="chev">›</span></span></button>';
}
function renderDiary(){
  var ev=sorted().filter(function(e){return e.k!=='appt'&&!EXT.hidden[e.k];}),vis=ev.slice(-12);
  if(!vis.length){$('#diary').innerHTML='<div class="list"><div class="empty">Ancora vuoto. Tocca Pappa, Pannolino o Nanna: due tap e la voce è registrata.</div></div>';return;}
  var h='',day=null;
  for(var i=vis.length-1;i>=0;i--){
    var e=vis[i],prev=null;for(var j=ev.indexOf(e)-1;j>=0;j--){if(ev[j].k==='sleep'||ev[j].k==='wake'){prev=ev[j];break;}}
    var k=dayKey(e.t);
    if(k!==day){if(day!==null)h+='</div>';h+='<h4 class="dy-head">'+esc(dayHead(e.t))+'</h4><div class="list">';day=k;}
    h+=diaryRow(e,prev);
  }
  $('#diary').innerHTML=h+'</div>';
}
/* ---------- modifica di una voce del diario ---------- */
/* Campi modificabili per tipo: 'chips' = scelte a tap, 'step' = numero con ±. Le voci delle estensioni (food, moment,
   lettera) qui cambiano solo ora e nota: il resto lo gestisce l'estensione che le ha create. */
function editFields(e){
  var lv=[['poca','Poca'],['normale','Normale'],['tanta','Tanta'],['no','No']];
  if(e.k==='feed')return [{key:'prep',label:'Preparato',type:'step',steps:[50,10],min:0,max:400,fmt:function(v){return (v||0)+' ml';}},
                          {key:'ml',label:'Bevuto',type:'step',steps:[50,10],min:0,max:400,fmt:function(v){return (v||0)+' ml';}},
                          {key:'dur',label:'Durata',type:'step',steps:[300,60],min:60,max:7200,start:600,fmt:function(v){return Math.round(v/60)+' min';},nullable:true}];
  if(e.k==='diaper')return [{key:'pipi',label:'Pipì',type:'chips',opts:lv,norm:lvlKey},{key:'cacca',label:'Cacca',type:'chips',opts:lv,norm:lvlKey}];
  if(e.k==='other')return [{key:'what',label:'Cosa',type:'chips',opts:OTHER.map(function(o){return [o[0],o[1]];})}];
  if(e.k==='temp')return [{key:'c',label:'Temperatura',type:'step',steps:[1,0.1],min:33,max:43,fmt:fmtTemp}];
  if(e.k==='med')return [{key:'what',label:'Medicina',type:'chips',opts:MEDS}];
  if(e.k==='measure')return [{key:'w',label:METRICS.w.label,type:'step',steps:[100,10],min:METRICS.w.min,max:METRICS.w.max,start:METRICS.w.start,fmt:METRICS.w.fmt,nullable:true},
                             {key:'l',label:METRICS.l.label,type:'step',steps:[1,0.5],min:METRICS.l.min,max:METRICS.l.max,start:METRICS.l.start,fmt:METRICS.l.fmt,nullable:true}];
  return [];
}
A.edit=function(id){
  var e=byId(id);if(!e){toast('Questa voce non c\'è più');return;}
  if(e.k==='cry'){A.cryDetail(id);return;}
  var d=new Date(e.t),v={};
  editFields(e).forEach(function(f){var x=e[f.key];v[f.key]=f.norm?f.norm(x):(x==null?null:x);});
  flow={type:'edit',step:0,off:0,data:{id:id,day:isoDay(e.t),tm:pad(d.getHours())+':'+pad(d.getMinutes()),v:v,note:(typeof e.note==='string'?e.note:'')},link:null};
  showScreen();renderFlow();
};
/* giorno valido davvero: "2026-02-31" e "2026-13-01" sono scritti bene ma non esistono */
function validDay(day){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day||'');if(!m)return false;
  var y=+m[1],mo=+m[2]-1,da=+m[3],x=new Date(y,mo,da);
  return x.getFullYear()===y&&x.getMonth()===mo&&x.getDate()===da;
}
function validTime(tm){var m=/^(\d{2}):(\d{2})$/.exec(tm||'');return !!m&&+m[1]<24&&+m[2]<60;}
A.editDay=function(day){if(!flow||flow.type!=='edit')return;if(validDay(day))flow.data.day=day;renderFlow();};
A.editTime=function(tm){if(!flow||flow.type!=='edit')return;if(validTime(tm))flow.data.tm=tm;renderFlow();};
A.editPick=function(key,val){if(!flow||flow.type!=='edit')return;flow.data.v[key]=val;renderFlow();};
A.editStep=function(key,d){
  if(!flow||flow.type!=='edit')return;
  var e=byId(flow.data.id);if(!e)return;
  var f=editFields(e).filter(function(x){return x.key===key;})[0];if(!f)return;
  var cur=flow.data.v[key];if(cur==null)cur=f.start!=null?f.start:f.min;
  var v=Math.round((cur+d)*1000)/1000;
  flow.data.v[key]=Math.max(f.min,Math.min(f.max,v));renderFlow();
};
A.editClear=function(key){if(!flow||flow.type!=='edit')return;flow.data.v[key]=null;renderFlow();};
A.editNote=function(v){if(!flow||flow.type!=='edit')return;flow.data.note=v;var c=$('#edCount');if(c)c.textContent=String(noteClean(v).length);};
/* istante scelto con la data e l'ora della schermata; null se non è valido */
function editTime(){
  var d=flow.data,m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d.day||''),h=/^(\d{2}):(\d{2})$/.exec(d.tm||'');
  if(!m||!h||!validDay(d.day)||!validTime(d.tm))return null;
  var x=new Date(+m[1],+m[2]-1,+m[3],+h[1],+h[2],0,0).getTime();
  return isNaN(x)?null:x;
}
function editStepper(f,v){
  var b=function(d){return '<button onclick="A.editStep(\''+f.key+'\','+d+')">'+(d>0?'+':'−')+String(Math.abs(d)).replace('.',',')+'</button>';};
  return '<div class="stepper"><div class="col">'+b(-f.steps[0])+b(-f.steps[1])+'</div><div class="val">'+esc(v==null?'—':f.fmt(v))+'</div><div class="col">'+b(f.steps[1])+b(f.steps[0])+'</div></div>'+
    (f.nullable&&v!=null?'<button class="ed-clear" onclick="A.editClear(\''+f.key+'\')">Togli '+esc(f.label.toLowerCase())+'</button>':'');
}
function renderEdit(){
  var d=flow.data,e=byId(d.id);
  if(!e)return '<div class="bar">'+backBtn()+'<div class="title">Modifica</div></div><p class="hint">Questa voce non c\'è più.</p>';
  var ds=describe(e,null),t=editTime();
  var h='<div class="bar">'+backBtn()+'<div class="title">Modifica</div></div>';
  h+='<div class="ed-ev"><i class="dot" style="--dc:'+kindDot(e)+'"></i><div><div class="what">'+ds[0]+' '+ds[1]+'</div><div class="hint">registrata'+(e.who?' da '+esc(e.who):'')+'</div></div></div>';
  h+='<h2>Quando</h2><div class="ed-when">';
  h+='<label class="datechip on">'+esc(t?fmtDate(t):d.day)+'<input type="date" value="'+esc(d.day)+'" onchange="A.editDay(this.value)" aria-label="Giorno"></label>';
  h+='<label class="datechip on">'+esc(d.tm)+'<input type="time" value="'+esc(d.tm)+'" onchange="A.editTime(this.value)" aria-label="Ora"></label></div>';
  editFields(e).forEach(function(f){
    var v=d.v[f.key];
    h+='<h2>'+esc(f.label)+'</h2>';
    if(f.type==='chips')h+='<div class="seg wide">'+f.opts.map(function(o){return '<button class="'+(o[0]===v?'on':'')+'" onclick="A.editPick(\''+f.key+'\',\''+o[0]+'\')">'+esc(o[1])+'</button>';}).join('')+'</div>';
    else h+=editStepper(f,v);
  });
  h+='<h2>Nota</h2><textarea class="f ed-ta" id="edNote" maxlength="'+NOTE_MAX+'" rows="3" placeholder="es. ha bevuto piano · cacca verde" oninput="A.editNote(this.value)">'+esc(d.note)+'</textarea>';
  h+='<p class="hint ed-count"><span id="edCount">'+noteClean(d.note).length+'</span>/'+NOTE_MAX+'</p>';
  h+='<div class="spacer"></div><button class="btn" onclick="A.finish(\'save\')">Salva le modifiche</button>';
  h+='<button class="btn warn" onclick="A.finish(\'del\')">Elimina la voce</button>';
  return h;
}
/* salva (o elimina) la voce aperta in modifica; torna sempre a Home */
function editSave(val){
  var d=flow.data,e=byId(d.id);
  if(!e){toast('Questa voce non c\'è più');A.home();return;}
  if(val==='del'){var id=d.id;flow=null;$('#screen').classList.remove('on');A.del(id);return;}
  var t=editTime();
  if(t==null){toast('Data o ora non valide');return;}
  var ch=false;
  if(Math.abs(t-e.t)>=1000){e.t=t;ch=true;}
  editFields(e).forEach(function(f){
    /* confronto con il valore grezzo: così una voce vecchia (per esempio pipì "si") si normalizza quando la si modifica */
    var nv=d.v[f.key],old=e[f.key];
    if(nv===old||(nv==null&&old==null))return;
    if(nv==null)delete e[f.key];else e[f.key]=nv;
    ch=true;
  });
  var note=noteClean(d.note),had=typeof e.note==='string'?e.note:'';
  if(note!==had){if(note){e.note=note;e.noteBy=who;}else{delete e.note;delete e.noteBy;}ch=true;}
  if(e.k==='feed'&&e.ml>e.prep)e.prep=e.ml;
  if(ch){touched(e);save();}
  flow=null;$('#screen').classList.remove('on');
  renderHome();renderCries();refreshViews();
  toast(ch?'Voce aggiornata':'Nessuna modifica');
}
A.del=function(id){
  if(!window.confirm('Eliminare questa voce?'))return;
  var e=byId(id);S.events=S.events.filter(function(x){return x.id!==id;});
  if(e)removed(e);
  if(e&&e.k==='cry')dropAudio(e);
  if(S.openCry===id)S.openCry=null;save();renderHome();renderCries();
};
function renderHome(){renderHeader();renderStatus();renderNext();renderNight();renderDiary();renderExtHome();}

/* ---------- cries tab ---------- */
function renderCries(){
  var el=$('#cries');if(!el)return;
  var acc=accuracy(),h='';
  h+='<div class="card"><h3>Quanto ci azzecca</h3>';
  if(acc.n<4)h+='<p class="hint">Servono almeno 4 pianti con una spiegazione per misurarlo. Ogni pianto spiegato da un\'azione successiva conta.</p>';
  else{
    var f=function(x){return x==null?'—':Math.round(x*100)+'%';};
    h+='<div class="kv"><div>Solo contesto</div><div>'+f(acc.ctx)+' <span class="m">su '+acc.ctxN+'</span></div>';
    h+='<div>Solo suono</div><div>'+f(acc.aud)+' <span class="m">su '+acc.audN+'</span></div>';
    h+='<div>Insieme</div><div>'+f(acc.both)+' <span class="m">su '+acc.bothN+'</span></div>';
    h+='<div>Tirando a indovinare</div><div>'+f(acc.base)+' <span class="m">causa più frequente</span></div></div>';
    var aw=audioWeight();
    h+='<p class="hint">Misurato a posteriori: per ogni pianto, l\'app prova a indovinarlo usando solo gli altri. Peso attuale del suono nelle ipotesi: '+Math.round(aw.w*100)+'%'+(acc.audN>=8&&aw.calib===0?' (il suono per ora non batte il caso, quindi è escluso)':'')+'.</p>';
  }
  h+='</div>';
  var cries=sorted().filter(function(e){return e.k==='cry';}).reverse();
  if(!cries.length){h+='<div class="list"><div class="empty">Nessun pianto registrato. Alla prossima crisi tocca "Piange".</div></div>';}
  else{
    h+='<div class="list">';
    cries.slice(0,60).forEach(function(e){
      var tag=e.label?'<span class="tag" style="--hc:'+(cause(e.label)?cause(e.label).c:'var(--muted)')+'">'+LABELS[e.label]+'</span>':'<span class="tag" style="--hc:var(--muted)">?</span>';
      var det=(e.dur?fmtSec(e.dur):'')+(e.feat?' · '+Math.round(e.feat.meanF0)+' Hz · '+Math.round(e.feat.bursts10*10)/10+' raffiche/10 s':((e.audio||e.audioPath)?' · troppo corto per l\'impronta':' · senza audio'));
      h+='<div class="row" onclick="A.cryDetail(\''+e.id+'\')"><div class="time">'+(dayKey(e.t)===dayKey(Date.now())?'':'<small>'+dayLabel(e.t)+'</small><br>')+fmtTime(e.t)+'</div><div class="what">'+tag+' <span class="detail">'+det+'</span></div>'+(e.audio||e.audioPath?'<button class="play'+(e.audio?'':' cloud')+'" aria-label="'+(e.audio?'Ascolta':'Scarica e ascolta')+'" onclick="event.stopPropagation();A.play(\''+e.id+'\',this)">▶</button>':'<span></span>')+'</div>';
    });
    h+='</div>';
  }
  el.innerHTML=h;
}
/* Riascolto. iOS lascia partire l'audio solo da un tap: l'elemento viene "sbloccato" subito con un wav muto,
   poi riceve la sorgente vera quando arriva da IndexedDB o dal cloud. */
var player=null,SILENT='data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';
function getPlayer(){if(!player){player=new Audio();player.setAttribute('playsinline','');player.preload='auto';}return player;}
A.play=function(id,btn){
  var e=byId(id),p=getPlayer(),objUrl=null;
  try{p.pause();}catch(_){}
  try{p.src=SILENT;var pr=p.play();if(pr&&pr.catch)pr.catch(function(){});}catch(_){}
  busy(btn,true,e&&!e.audio?'…':null);
  audioGet(id).then(function(a){
    if(a)return a;
    if(!e||!e.audioPath)return null;
    if(!syncReady()){diag('dl',false,'non collegato al cloud');toast(window.AlanSync&&AlanSync.status().signedIn?'Non collegato: riprova con la rete':'Serve l\'accesso in Altro → Account');return null;}
    diag('dl',null,'scarico '+e.audioPath+'…');
    return AlanSync.downloadAudio(e.audioPath).then(function(r){
      if(r.error||!r.data){diag('dl',false,errStr(r.error||{message:'risposta vuota'}));toast('Audio non scaricato');return null;}
      return blobToBuf(r.data).then(function(buf){
        var mime=e.mime||r.data.type||'audio/mp4';
        return audioPut(id,buf,mime).then(function(ok){
          e.audio=!!ok;save();diag('dl',true,Math.round(buf.byteLength/1024)+' kB'+(ok?', salvato sul telefono':', non salvato sul telefono'));
          if(!flow)renderCries();
          return {buf:buf,mime:mime,blob:new Blob([buf],{type:mime})};
        });
      });
    });
  }).then(function(a){
    busy(btn,false);
    if(!a){if(e&&!e.audioPath)toast('Audio non presente su questo telefono');return;}
    try{p.pause();}catch(_){}
    objUrl=URL.createObjectURL(a.blob);p.src=objUrl;
    p.onended=function(){if(objUrl)URL.revokeObjectURL(objUrl);objUrl=null;};
    p.onerror=function(){diag('play',false,'il browser non riproduce '+(a.mime||'questo formato'));toast('Il browser non riproduce questo formato');};
    var pr=p.play();
    if(pr&&pr.then)pr.then(function(){diag('play',true,'in riproduzione, '+(a.mime||'formato sconosciuto'));},function(err){diag('play',false,errStr(err));toast(err&&err.name==='NotAllowedError'?'Tocca di nuovo ▶ per ascoltare':'Il browser non riproduce questo formato');});
  }).catch(function(err){busy(btn,false);diag('dl',false,errStr(err));toast('Audio non disponibile: '+errStr(err));});
};
A.cryDetail=function(id){
  var e=byId(id);if(!e)return;
  flow={type:'crydetail',id:id};showScreen();
  var h='<div class="bar">'+backBtn()+'<div class="title">Pianto delle '+fmtTime(e.t)+' · '+dayLabel(e.t)+'</div></div>';
  if(e.audio||e.audioPath)h+='<button class="btn ghost" onclick="A.play(\''+id+'\',this)">▶ '+(e.audio?'Ascolta':'Scarica e ascolta')+'</button><div class="spacer"></div>';
  if(e.rec)h+='<p class="hint">Registrazione: '+(e.rec.bytes?Math.round(e.rec.bytes/1024)+' kB, '+esc(e.rec.mime||'?'):'nessun audio')+' · '+e.rec.frames+' campioni'+(e.rec.err?' · '+esc(e.rec.err):'')+(e.audioPath?' · in cloud':(e.audio?' · solo su questo telefono':''))+'</p>';
  h+=hypList(hypotheses(e.ctx||snapshot(context(e.t)),e.bins||bins(context(e.t)),e.feat?e.feat.vec:null));
  var cand=explainers(e);
  if(cand.length){
    h+='<h2 style="font-size:18px">Cosa avete fatto dopo</h2><p class="hint">Tocca l\'azione che lo ha calmato: la spiegazione la prende da lì. Si può fare quando vuoi, anche a distanza di ore.</p><div class="list">';
    cand.forEach(function(x){
      var d=describe(x,null),lb=labelFor(x),mine=(e.by===x.id);
      h+='<button class="row tap'+(mine?' on':'')+'" onclick="A.explainWith(\''+id+'\',\''+x.id+'\')"><div class="time">'+fmtTime(x.t)+'</div>'+
        '<div class="what"><i class="dot" style="--dc:'+kindDot(x)+'"></i>'+d[0]+' '+d[1]+'</div>'+
        '<span class="meta"><span class="who">'+esc(LABELS[lb])+'</span><span class="chev">'+(mine?'✓':'›')+'</span></span></button>';
    });
    h+='</div>';
  }
  h+='<h2 style="font-size:18px">Spiegazione</h2><div class="chips">'+['fame','sonno','cambio','aria','contatto','solo'].map(function(l){return '<button class="'+(e.label===l?'on':'')+'" onclick="A.labelCry(\''+id+'\',\''+l+'\');A.cryDetail(\''+id+'\')">'+LABELS[l]+'</button>';}).join('')+'</div>';
  if(e.feat)h+='<p class="hint">Tono medio '+Math.round(e.feat.meanF0)+' Hz (variazione ±'+Math.round(e.feat.sdF0)+') · intensità '+Math.round(e.feat.meanRms*1000)/10+' · '+Math.round(e.feat.bursts10*10)/10+' raffiche/10 s, lunghe in media '+Math.round(e.feat.meanBurst)+' ms con pause di '+Math.round(e.feat.meanPause)+' ms · voce nel '+Math.round(e.feat.voiced*100)+'% del tempo.</p>';
  h+='<div class="spacer"></div><button class="btn warn" onclick="A.del(\''+id+'\');A.home()">Elimina questo pianto</button>';
  $('#screenInner').innerHTML=h;
};

/* ---------- pattern tab ---------- */
/* Pattern: prima le schede delle estensioni (La settimana, Pappa, Nanna, Pannolini, Ritmo, cronometro), poi "Perché piangeva"
   con le tabelle di dettaglio (fasce orarie, contesto → causa, suono → causa) a scomparsa. */
var statsDetailsOpen=false;
A.statsDetails=function(){statsDetailsOpen=!statsDetailsOpen;renderStats();};
function renderStats(){
  var now=Date.now(),h='';
  var n=norms(ageDays());
  h+=extHtml('stats');
  var g2=outcomeCounts(null);
  h+='<div class="card"><h3>Perché piangeva</h3>';
  if(!g2.n)h+='<p class="hint">Nessun pianto spiegato ancora. Registra il pianto, poi fai la cosa giusta: la registrazione dell\'azione lo spiega.</p>';
  else{
    var mx=0;CAUSES.forEach(function(c){mx=Math.max(mx,g2.c[c.id]);});
    CAUSES.forEach(function(c){h+='<div class="obar" style="--hc:'+c.c+'"><div class="l">'+c.label+'</div><div class="b"><i style="width:'+(mx?Math.round(g2.c[c.id]/mx*100):0)+'%"></i></div><div class="n">'+g2.c[c.id]+'</div></div>';});
    var solo=S.events.filter(function(e){return e.k==='cry'&&e.label==='solo';}).length;if(solo)h+='<p class="hint">Più '+solo+' passati da soli.</p>';
    h+='<button class="st-more" aria-expanded="'+(statsDetailsOpen?'true':'false')+'" onclick="A.statsDetails()">'+(statsDetailsOpen?'Nascondi i dettagli':'Dettagli: fasce orarie, contesto e suono')+'</button><div class="st-details"'+(statsDetailsOpen?'':' hidden')+'>';
    var bands=['notte 0–6','mattina 6–12','pomeriggio 12–17','sera 17–24'];
    h+='<h3 style="margin-top:14px">Per fascia oraria</h3><table><tr><th>Fascia</th><th class="n">Ep.</th><th>Più frequente</th></tr>';
    for(var bi=0;bi<4;bi++){var oc=outcomeCounts(function(e){return e.bins&&e.bins.h===bi;});if(!oc.n)continue;var best=argmax(oc.c);h+='<tr><td>'+bands[bi]+'</td><td class="n">'+oc.n+'</td><td>'+cause(best).label+' ('+oc.c[best]+'/'+oc.n+')</td></tr>';}
    h+='</table>';
    var fh=n.feedH,aw2=n.awakeMin,fH=function(x){return fmtDur(x*H);};
    var fl=['pappa meno di '+fH(0.5*fh)+' fa','pappa da '+fH(0.5*fh)+' a '+fH(0.85*fh)+' fa','pappa da '+fH(0.85*fh)+' a '+fH(1.15*fh)+' fa','pappa oltre '+fH(1.15*fh)+' fa'];
    var al=['sveglio meno di '+Math.round(0.5*aw2)+' min','sveglio '+Math.round(0.5*aw2)+'–'+aw2+' min','sveglio oltre '+aw2+' min'];
    var rows='';
    for(var f=-1;f<4;f++)for(var a=-1;a<3;a++){(function(f,a){var oc2=outcomeCounts(function(e){return e.bins&&e.bins.f===f&&e.bins.a===a;});if(oc2.n<2)return;var b2=argmax(oc2.c);rows+='<tr><td>'+(f<0?'pappa non registrata':fl[f])+' · '+(a<0?'nanna non registrata':al[a])+'</td><td class="n">'+oc2.n+'</td><td>'+cause(b2).label+' ('+oc2.c[b2]+'/'+oc2.n+')</td></tr>';})(f,a);}
    if(rows)h+='<h3 style="margin-top:14px">Contesto → causa</h3><table><tr><th>Contesto</th><th class="n">Ep.</th><th>Esito</th></tr>'+rows+'</table>';
    var withF=labeledCries().filter(function(e){return e.feat;});
    if(withF.length>=4){
      h+='<h3 style="margin-top:14px">Suono → causa</h3><p class="hint">Medie dell\'impronta acustica per spiegazione. Se le righe si somigliano, il suono non distingue le cause.</p><table><tr><th>Causa</th><th class="n">Ep.</th><th class="n">Tono Hz</th><th class="n">Raffiche/10 s</th><th class="n">Voce %</th></tr>';
      CAUSES.forEach(function(c){var s=withF.filter(function(e){return e.label===c.id;});if(!s.length)return;h+='<tr><td>'+c.label+'</td><td class="n">'+s.length+'</td><td class="n">'+Math.round(mean(s.map(function(e){return e.feat.meanF0;})))+'</td><td class="n">'+(Math.round(mean(s.map(function(e){return e.feat.bursts10;}))*10)/10)+'</td><td class="n">'+Math.round(mean(s.map(function(e){return e.feat.voiced;}))*100)+'</td></tr>';});
      h+='</table>';
    }
    h+='</div>';
  }
  h+='</div>';
  $('#stats').innerHTML=h;
}

/* ---------- settings, mic, storage ---------- */
function fillFeedSeg(){var seg=$('#feedSeg');if(!seg)return;var cur=S.settings.feedH>0?String(S.settings.feedH):'auto',bs=seg.querySelectorAll('button');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].getAttribute('data-h')===cur);}
A.setFeedH=function(v){var n=Number(v);S.settings.feedH=n>0?n:null;S.settings._updated=new Date().toISOString();save();pushSettings();fillFeedSeg();renderHome();toast(n>0?'Pappa prevista ogni '+fmtDur(n*H):'Intervallo pappe automatico per età');};
function fillSettings(){$('#sName').value=S.settings.name||'';$('#sBirth').value=S.settings.birth||'';fillFeedSeg();applyTheme(themePref());renderDiag();renderAccount();fillExtAltro();}
function renderAccount(){
  var el=$('#account');if(!el)return;
  if(!window.AlanSync){el.innerHTML='<p class="hint">Sync non caricato.</p>';return;}
  var st=AlanSync.status(),h='';
  if(!st.available){el.innerHTML='<p class="hint">'+(st.configured&&!st.lib?'La libreria di sync (supabase-js) non si è caricata: controlla la rete e riapri l\'app.':'Sync non configurato: compila js/config.js con URL e chiave anon del progetto Supabase (vedi README).')+'</p>';return;}
  if(!st.signedIn){
    h+='<p class="hint">Accedi con l\'email e la password che avete impostato su Supabase. Si fa una volta sola per telefono.</p>';
    h+='<label class="f" for="accEmail">Email</label><input class="f" id="accEmail" type="email" inputmode="email" autocomplete="username" value="'+esc(lsGet('alan.email')||'')+'">';
    h+='<label class="f" for="accPass">Password</label><input class="f" id="accPass" type="password" autocomplete="current-password"><div class="spacer"></div>';
    h+='<button class="btn" onclick="A.login(this)">Accedi</button>';
  }else{
    var live=st.channel==='SUBSCRIBED'?'in ascolto':(st.channel==='off'||st.channel==='joining'?'in collegamento…':'interrotto, riprovo');
    var other=st.others&&st.others.length?st.others.map(function(o){return esc(o.name||o.who||'altro telefono');}).join(', ')+' adesso':'non collegato adesso';
    h+='<div class="kv"><div>Account</div><div>'+esc(st.name||'')+' <span class="m">'+esc(st.email||'')+'</span></div><div>Famiglia</div><div>'+(st.family?'collegata':'non ancora')+'</div><div>Ultimo sync</div><div>'+(st.lastSync?fmtTime(st.lastSync):'—')+'</div>';
    h+='<div>Tempo reale</div><div>'+(st.family?live:'—')+'</div><div>Altro telefono</div><div>'+(st.family?other:'—')+'</div>';
    if(st.pending)h+='<div>Da inviare</div><div>'+st.pending+' voci</div>';
    h+='</div>';
    if(st.lastError)h+='<p class="hint">Ultimo errore ('+esc(st.lastError.where)+', '+fmtTime(st.lastError.at)+'): '+esc(st.lastError.msg)+'</p>';
    if(!st.family)h+='<p class="hint">Questo account non è ancora in una famiglia: esegui il blocco SQL finale di supabase/schema.sql e tocca "Sincronizza adesso".</p>';
    h+='<div class="spacer"></div><button class="btn ghost" onclick="A.syncNow(this)">Sincronizza adesso</button><div class="spacer"></div><button class="btn ghost" onclick="A.signOut(this)">Esci</button>';
  }
  el.innerHTML=h;
}
A.login=function(btn){
  var em=($('#accEmail').value||'').trim(),pw=$('#accPass').value||'';
  if(!em||!pw){toast('Servono email e password');return;}
  busy(btn,true,'Accedo…');
  AlanSync.signIn(em,pw).then(function(r){
    if(r&&r.error){busy(btn,false);toast('Accesso rifiutato: '+(r.error.message==='Invalid login credentials'?'email o password sbagliate':r.error.message));}
    else{lsSet('alan.email',em);toast('Accesso fatto');setTimeout(renderAccount,800);}
  },function(err){busy(btn,false);toast('Accesso non riuscito: '+errStr(err));});
};
A.syncNow=function(btn){busy(btn,true,'Sincronizzo…');AlanSync.flush().then(function(){return AlanSync.pullAll();}).then(function(ok){busy(btn,false);toast(ok?'Sincronizzato':'Sync non riuscito, riprovo più tardi');renderAccount();flushAudio();},function(){busy(btn,false);toast('Sync non riuscito');});};
A.signOut=function(btn){busy(btn,true,'Esco…');AlanSync.signOut().then(function(){toast('Uscito');renderAccount();},function(){busy(btn,false);toast('Uscita non riuscita');});};
function renderDiag(){
  var el=$('#diag');if(!el)return;
  var h='<div class="diag">',env=[];
  env.push(['Versione app',swVersion?swVersion:('serviceWorker' in navigator?'in attesa del service worker':'senza service worker')]);
  env.push(['Modalità',isStandalone()?'app installata (icona in Home)':'nel browser']);
  env.push(['Sistema',uaShort()]);
  var mr=window.MediaRecorder,ok=function(m){try{return mr&&mr.isTypeSupported&&mr.isTypeSupported(m);}catch(e){return false;}};
  env.push(['Formati registrabili',mr?[['audio/mp4','mp4'],['audio/webm;codecs=opus','webm']].filter(function(x){return ok(x[0]);}).map(function(x){return x[1];}).join(', ')||'nessuno dichiarato (uso il predefinito)':'MediaRecorder assente']);
  env.push(['Archivio',db?'IndexedDB attivo':'IndexedDB non disponibile (solo memoria del browser, senza audio)']);
  var cries=S.events.filter(function(e){return e.k==='cry';}),withA=cries.filter(function(e){return e.audio;}).length,inCloud=cries.filter(function(e){return e.audioPath;}).length;
  env.push(['Pianti',cries.length+' · con audio qui: '+withA+' · nel cloud: '+inCloud+(audioOutbox().length?' · da inviare: '+audioOutbox().length:'')]);
  if(window.AlanSync){var st=AlanSync.status();env.push(['Sync',!st.available?(st.configured&&!st.lib?'libreria non caricata (rete?)':'non configurato'):(!st.signedIn?'non collegato (fai l\'accesso)':(!st.family?'account senza famiglia':'famiglia ok · tempo reale '+(st.channel==='SUBSCRIBED'?'attivo':st.channel.toLowerCase())+(st.pending?' · '+st.pending+' voci da inviare':'')))]);}
  env.push(['Spazio usato','<span id="diagSpace">…</span>']);
  h+='<div class="kv small">'+env.map(function(x){return '<div>'+x[0]+'</div><div>'+x[1]+'</div>';}).join('')+'</div>';
  h+='<h4>Ultima registrazione'+(DIAG.at?' · '+fmtTime(DIAG.at)+(dayKey(DIAG.at)!==dayKey(Date.now())?' '+dayLabel(DIAG.at):''):'')+'</h4>';
  DIAG_STEPS.forEach(function(st){
    var it=diagGet(st[0]),cls=!it||it.ok==null?'na':(it.ok?'ok':'ko'),sym=!it?'–':(it.ok==null?'…':(it.ok?'✓':'✗'));
    h+='<div class="it '+cls+'"><div class="sym">'+sym+'</div><div><div>'+st[1]+'</div>'+(it?'<div class="d">'+esc(it.d)+'</div>':'<div class="d">non eseguito</div>')+'</div></div>';
  });
  h+='</div>';
  el.innerHTML=h;
  if(navigator.storage&&navigator.storage.estimate)navigator.storage.estimate().then(function(q){var sp=$('#diagSpace');if(sp&&q&&q.usage!=null)sp.textContent=Math.round(q.usage/1048576*10)/10+' MB'+(q.quota?' su '+Math.round(q.quota/1048576)+' MB':'');},function(){});
  else{var sp=$('#diagSpace');if(sp)sp.textContent='non misurabile';}
}
function uaShort(){
  var u=navigator.userAgent||'',m;
  if((m=u.match(/iPhone OS (\d+)[_.](\d+)/)))return 'iPhone, iOS '+m[1]+'.'+m[2]+(u.indexOf('CriOS')>=0?', Chrome':', Safari');
  if((m=u.match(/iPad|Macintosh/))&&navigator.maxTouchPoints>1)return 'iPad, Safari';
  if((m=u.match(/Android (\d+(\.\d+)?)/)))return 'Android '+m[1]+(u.indexOf('Chrome')>=0?', Chrome':'');
  return (u.split(') ')[0]||u).slice(0,60);
}
function diagText(){
  var lines=['Diagnostica Alan · '+new Date().toLocaleString('it-IT')];
  var el=$('#diag');if(el)lines.push(String(el.textContent||'').replace(/\s+/g,' ').trim());
  DIAG_STEPS.forEach(function(st){var it=diagGet(st[0]);lines.push((!it?'– ':(it.ok==null?'… ':(it.ok?'✓ ':'✗ ')))+st[1]+': '+(it?it.d:'non eseguito'));});
  if(window.AlanSync){var s2=AlanSync.status();if(s2.lastError)lines.push('Ultimo errore sync ('+s2.lastError.where+'): '+s2.lastError.msg);}
  lines.push(navigator.userAgent||'');
  return lines.join('\n');
}
A.copyDiag=function(btn){
  var txt=diagText();
  var fallback=function(){var ta=$('#impTxt');if(ta){ta.value=txt;toast('Testo messo nel riquadro "Incolla qui un codice"');}else toast('Copia non riuscita');};
  if(navigator.share){navigator.share({text:txt}).then(function(){toast('Diagnostica condivisa');},function(){if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){toast('Diagnostica copiata');},fallback);else fallback();});return;}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){toast('Diagnostica copiata');},fallback);else fallback();
};
A.testMic=function(btn){
  var hasMic=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  diag('mic',hasMic,hasMic?'getUserMedia disponibile':'navigator.mediaDevices.getUserMedia assente');
  if(!hasMic){toast('Microfono non esposto da questo browser');return;}
  busy(btn,true,'Chiedo il permesso…');
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){
    var tr=s.getAudioTracks()[0];diag('perm',true,'ok (prova)'+(tr&&tr.label?', '+tr.label:''));
    s.getTracks().forEach(function(t){t.stop();});busy(btn,false);toast('Microfono ok');
  }).catch(function(e){busy(btn,false);diag('perm',false,errStr(e)+' (prova)');toast(e&&e.name==='NotAllowedError'?'Microfono bloccato in questa finestra':'Microfono non disponibile: '+(e&&e.name));});
};
/* tema: auto (segue il sistema), chiaro, scuro. Salvato in localStorage e applicato prima del primo disegno (script inline in index.html). */
var THEMEKEY='alan.theme';
function applyTheme(t){
  try{var root=document.documentElement;if(t==='light'||t==='dark')root.setAttribute('data-theme',t);else root.removeAttribute('data-theme');}catch(e){}
  try{var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#11151C':(t==='light'?'#F0B040':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'#11151C':'#F0B040')));}catch(e){}
  var seg=$('#themeSeg');if(seg){var bs=seg.querySelectorAll('button');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].getAttribute('data-t')===(t||'auto'));}
}
function themePref(){var t=lsGet(THEMEKEY);return t==='light'||t==='dark'?t:'auto';}
A.setTheme=function(t){t=t==='light'||t==='dark'?t:'auto';if(t==='auto'){try{localStorage.removeItem(THEMEKEY);}catch(e){}}else lsSet(THEMEKEY,t);applyTheme(t);toast(t==='auto'?'Tema come il sistema':(t==='dark'?'Tema scuro':'Tema chiaro'));};
A.saveSettings=function(){S.settings.name=$('#sName').value.trim()||'Alan';S.settings.birth=$('#sBirth').value||S.settings.birth;S.settings._updated=new Date().toISOString();save();pushSettings();toast('Impostazioni salvate');renderHome();};
A.resetAll=function(){
  if(!window.confirm('Cancellare diario, pianti e audio su questo telefono? Non si può annullare.'))return;
  S.events.filter(function(e){return e.k==='cry';}).forEach(function(e){idbDel('audio',e.id);});
  S.events=[];S.openCry=null;save();try{localStorage.removeItem(LSV1);localStorage.removeItem('alan.sync.since');localStorage.removeItem(AUDIO_OUTBOX);}catch(e){}renderHome();toast('Dati cancellati da questo telefono');
};

/* ---------- export / import ---------- */
function b64enc(u8){var s='';for(var i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s);}
function b64dec(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
A.exportData=function(){
  var slim=S.events.map(function(e){var c={};for(var k in e)if(k!=='audio'&&k!=='mime')c[k]=e[k];return c;});
  var json=JSON.stringify({v:2,settings:S.settings,events:slim});
  var showCode=function(code){$('#impTxt').value=code;toast('Codice qui sotto: copialo e invialo');};
  var copy=function(code){if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(code).then(function(){toast('Codice copiato: incollalo su WhatsApp');},function(){showCode(code);});else showCode(code);};
  var done=function(code){var msg='Diario di '+(S.settings.name||'Alan')+' da '+who+' ('+S.events.length+' voci). Incolla in Altro → Importa:\n'+code;if(navigator.share)navigator.share({text:msg}).catch(function(){copy(code);});else copy(code);};
  var bytes=new TextEncoder().encode(json);
  if(window.CompressionStream){try{new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(function(buf){done('AZ2:'+b64enc(new Uint8Array(buf)));}).catch(function(){done('AZ0:'+b64enc(bytes));});return;}catch(e){}}
  done('AZ0:'+b64enc(bytes));
};
A.importData=function(){
  var raw=$('#impTxt').value.trim(),m=raw.match(/AZ([012]):([A-Za-z0-9+\/=]+)/);
  if(!m){toast('Codice non riconosciuto');return;}
  var finish=function(json){
    var o;try{o=JSON.parse(json);}catch(e){toast('Codice danneggiato');return;}
    if(!o||!Array.isArray(o.events)){toast('Codice non valido');return;}
    var have={};S.events.forEach(function(e){have[e.id]=e;});
    var added=0,upd=0;
    o.events.forEach(function(e){
      if(!e||!e.id||!e.k||!e.t)return;
      if(o.v===1){var n={id:e.id,t:e.t,who:e.who||''};if(e.k==='feed'){n.k='feed';n.prep=e.ml;n.ml=e.ml;}else if(e.k==='diaper'){n.k='diaper';n.pipi=(e.kind!=='cacca')?'normale':'no';n.cacca=(e.kind==='cacca'||e.kind==='entrambi')?'normale':'no';}else if(e.k==='sleep'||e.k==='wake'){n.k=e.k;}else if(e.k==='burp'){n.k='other';n.what='ruttino';}else if(e.k==='cry'){n.k='cry';n.label=e.out==='coccole'?'contatto':(e.out||null);n.bins=e.bins;n.ctx=e.ctx;n.dur=e.end?(e.end-e.t)/1000:null;}else return;e=n;}
      var cur=have[e.id];
      if(!cur){if(e.k==='cry')e.audio=false;S.events.push(e);have[e.id]=e;added++;}
      else if(e.k==='cry'&&e.label&&!cur.label){cur.label=e.label;upd++;}
    });
    if(o.settings&&o.settings.birth&&!S.settings.birth)S.settings.birth=o.settings.birth;
    if(S.openCry){var oc=byId(S.openCry);if(!oc||oc.label)S.openCry=null;}
    save();renderHome();renderCries();$('#impTxt').value='';
    toast('Uniti: '+added+' nuove voci'+(upd?', '+upd+' spiegazioni aggiornate':''));
  };
  var bytes;try{bytes=b64dec(m[2]);}catch(e){toast('Codice danneggiato');return;}
  if(m[1]==='0'){finish(new TextDecoder().decode(bytes));return;}
  if(!window.DecompressionStream){toast('Questo browser non legge il codice compresso');return;}
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(function(buf){finish(new TextDecoder().decode(new Uint8Array(buf)));}).catch(function(){toast('Codice danneggiato');});
};

/* ---------- salute: crescita OMS (peso, lunghezza), vitamina D e medicine, temperatura, visite e vaccini ---------- */
var HEALTH_TYPES={measure:1,temp:1,med:1,appt:1};
var MEDS=[['vitd','Vitamina D'],['probiotico','Probiotico'],['simeticone','Simeticone'],['paracetamolo','Paracetamolo'],['altro','Altro']];
var APPT_KINDS=[['bilancio','Bilancio di salute'],['vaccino','Vaccino'],['visita','Visita specialistica'],['esame','Esame'],['altro','Altro']];
/* Tappe: calendario vaccinale nazionale e bilanci di salute (mesi di età). Sono suggerimenti: le date le fissano ASL e pediatra. */
var MILESTONES=[[1,'bilancio','Bilancio di salute del 1° mese'],[3,'vaccino','Esavalente 1ª · pneumococco 1ª · rotavirus 1ª · meningococco B 1ª'],[3,'bilancio','Bilancio di salute (2–3 mesi)'],[4,'vaccino','Meningococco B 2ª · rotavirus 2ª'],[5,'vaccino','Esavalente 2ª · pneumococco 2ª'],[6,'vaccino','Meningococco B 3ª'],[6,'bilancio','Bilancio di salute (5–6 mesi)'],[9,'bilancio','Bilancio di salute (8–9 mesi)'],[11,'vaccino','Esavalente 3ª · pneumococco 3ª'],[12,'bilancio','Bilancio di salute (12 mesi)'],[13,'vaccino','MPRV · meningococco ACWY · meningococco B 4ª']];
var METRICS={
  w:{key:'wfa',label:'Peso',c:'var(--c-fame)',toX:function(v){return v/1000;},fmt:function(v){return (v/1000).toFixed(v%10?3:2).replace('.',',')+' kg';},axis:function(v){return v.toFixed(1).replace('.',',');},step:[100,10],min:1500,max:20000,start:3500,unit:'g'},
  l:{key:'lhfa',label:'Lunghezza',c:'var(--c-sonno)',toX:function(v){return v;},fmt:function(v){return String(v).replace('.',',')+' cm';},axis:function(v){return String(Math.round(v));},step:[1,0.5],min:35,max:100,start:50,unit:'cm'}
};
var ZP={3:-1.8808,15:-1.0364,50:0,85:1.0364,97:1.8808};
var healthMetric='w';

/* --- OMS: LMS interpolati sulle tabelle campionate a 7 giorni (js/who.js) --- */
function lmsAt(key,days){
  var T=window.WHO_BOYS;if(!T||!T[key])return null;
  var rows=T[key],st=T.stepDays,i=days/st,i0=Math.floor(i);
  if(i0<0)i0=0;if(i0>=rows.length-1)return rows[rows.length-1];
  var f=i-i0,a=rows[i0],b=rows[i0+1];
  return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
}
function zOf(key,days,x){var p=lmsAt(key,days);if(!p||!(x>0))return null;var L=p[0],M=p[1],S=p[2];return Math.abs(L)<1e-6?Math.log(x/M)/S:(Math.pow(x/M,L)-1)/(L*S);}
function xOfZ(key,days,z){var p=lmsAt(key,days);if(!p)return null;var L=p[0],M=p[1],S=p[2];return Math.abs(L)<1e-6?M*Math.exp(S*z):M*Math.pow(1+L*S*z,1/L);}
function erf(x){var s=x<0?-1:1;x=Math.abs(x);var t=1/(1+0.3275911*x);var y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return s*y;}
function phi(z){return 0.5*(1+erf(z/Math.SQRT2));}
function pctOf(key,days,x){var z=zOf(key,days,x);if(z==null)return null;var p=Math.round(phi(z)*100);return Math.max(1,Math.min(99,p));}
function ageDaysAt(t){var b=birthMs();return b==null?null:Math.max(0,Math.floor((t-b)/864e5));}
function ordPct(p){return p==null?'—':p+'°';}

function measures(metric){return sorted().filter(function(e){return e.k==='measure'&&(!metric||e[metric]!=null);});}
function todayMeds(what){var k=dayKey(Date.now());return S.events.filter(function(e){return e.k==='med'&&(!what||e.what===what)&&dayKey(e.t)===k;});}
function everMed(what){for(var i=0;i<S.events.length;i++)if(S.events[i].k==='med'&&S.events[i].what===what)return true;return false;}
function appts(){return S.events.filter(function(e){return e.k==='appt';}).sort(function(a,b){return a.t-b.t;});}
function nextAppt(){var now=Date.now()-2*H,a=appts();for(var i=0;i<a.length;i++)if(!a[i].done&&a[i].t>=now)return a[i];return null;}
function apptKind(k){for(var i=0;i<APPT_KINDS.length;i++)if(APPT_KINDS[i][0]===k)return APPT_KINDS[i][1];return 'Visita';}
function medName(e){if(e.name)return e.name;for(var i=0;i<MEDS.length;i++)if(MEDS[i][0]===e.what)return MEDS[i][1];return 'Medicina';}
function fmtDate(t){var d=new Date(t);return ['dom','lun','mar','mer','gio','ven','sab'][d.getDay()]+' '+d.getDate()+'/'+(d.getMonth()+1)+(d.getFullYear()!==new Date().getFullYear()?'/'+d.getFullYear():'');}
function inDays(t){var d=Math.round((t-Date.now())/864e5);if(d<0)return Math.abs(d)===1?'ieri':Math.abs(d)+' giorni fa';if(d===0)return 'oggi';if(d===1)return 'domani';return 'tra '+d+' giorni';}
function fmtTemp(c){return c.toFixed(1).replace('.',',')+' °C';}
function isoDay(t){var d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function noon(iso){var d=new Date(iso+'T12:00:00');return isNaN(d)?null:d.getTime();}

/* --- grafico di crescita: bande dei percentili OMS e traiettoria di Alan (SVG inline, colori dai token CSS) --- */
function growthChart(metric){
  var m=METRICS[metric],ms=measures(metric),b=birthMs();
  if(b==null||!window.WHO_BOYS)return '<p class="hint">Per il grafico serve la data di nascita (Altro → Impostazioni).</p>';
  var nowD=ageDays(),lastD=ms.length?ageDaysAt(ms[ms.length-1].t):0;
  var maxD=Math.min(728,Math.max(120,nowD+30,lastD+30));
  var W=360,Hh=236,L=36,R=28,T=14,B=28,i,d,p;
  /* le curve OMS sono già nell'unità del grafico (kg, cm); le misure di Alan passano da toX (grammi → kg) */
  var y0=xOfZ(m.key,0,ZP[3]),y1=xOfZ(m.key,maxD,ZP[97]);
  ms.forEach(function(e){var v=m.toX(e[metric]);if(v<y0)y0=v;if(v>y1)y1=v;});
  var span=y1-y0;y0-=span*0.06;y1+=span*0.06;
  var sx=function(dd){return L+(W-L-R)*dd/maxD;},sy=function(v){return T+(Hh-T-B)*(1-(v-y0)/(y1-y0));};
  var curves={},keys=[3,15,50,85,97];
  keys.forEach(function(pp){var pts=[];for(d=0;d<=maxD;d+=7){pts.push([sx(d),sy(xOfZ(m.key,d,ZP[pp]))]);}if(d-7<maxD)pts.push([sx(maxD),sy(xOfZ(m.key,maxD,ZP[pp]))]);curves[pp]=pts;});
  var path=function(pts){return pts.map(function(q,j){return (j?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1);}).join(' ');};
  var band=function(lo,hi){var back=curves[hi].slice().reverse();return path(curves[lo])+' '+back.map(function(q){return 'L'+q[0].toFixed(1)+' '+q[1].toFixed(1);}).join(' ')+' Z';};
  var h='<svg class="gc" viewBox="0 0 '+W+' '+Hh+'" style="--hc:'+m.c+'" role="img" aria-label="Curva di crescita: '+m.label+'">';
  /* griglia mesi */
  var stepM=maxD>400?2:1,md=30.4375;
  for(i=0;i*md<=maxD;i+=stepM){var x=sx(i*md);h+='<line class="grid" x1="'+x.toFixed(1)+'" y1="'+T+'" x2="'+x.toFixed(1)+'" y2="'+(Hh-B)+'"/>';h+='<text class="lbl" x="'+x.toFixed(1)+'" y="'+(Hh-B+16)+'" text-anchor="middle">'+i+'</text>';}
  h+='<text class="lbl" x="'+(W-R)+'" y="'+(Hh-4)+'" text-anchor="end">mesi</text>';
  /* griglia valori */
  var ticks=niceTicks(y0,y1,4);
  ticks.forEach(function(v){var y=sy(v);h+='<line class="grid" x1="'+L+'" y1="'+y.toFixed(1)+'" x2="'+(W-R)+'" y2="'+y.toFixed(1)+'"/>';h+='<text class="lbl" x="'+(L-6)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end">'+m.axis(v)+'</text>';});
  h+='<path class="band b1" d="'+band(3,97)+'"/><path class="band b2" d="'+band(15,85)+'"/>';
  h+='<path class="mid" d="'+path(curves[50])+'"/>';
  keys.forEach(function(pp){var q=curves[pp][curves[pp].length-1];h+='<text class="plbl" x="'+(q[0]+4).toFixed(1)+'" y="'+(q[1]+4).toFixed(1)+'">'+pp+'</text>';});
  /* Alan */
  if(ms.length){
    var pts=ms.map(function(e){return [sx(ageDaysAt(e.t)),sy(m.toX(e[metric]))];});
    if(pts.length>1)h+='<path class="me" d="'+path(pts)+'"/>';
    pts.forEach(function(q,j){var last=j===pts.length-1;h+='<circle class="pt'+(last?' last':'')+'" cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="'+(last?6:3.5)+'"/>';});
    var lastE=ms[ms.length-1],lq=pts[pts.length-1],anchor=lq[0]>W-90?'end':'start',lx=lq[0]+(anchor==='end'?-10:10);
    h+='<text class="me-lbl" x="'+lx.toFixed(1)+'" y="'+(lq[1]-10).toFixed(1)+'" text-anchor="'+anchor+'">'+esc(m.fmt(lastE[metric]))+'</text>';
  }
  return h+'</svg>';
}
function niceTicks(a,b,n){var span=b-a,raw=span/n,mag=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10)),r=raw/mag,st=r<1.5?1:(r<3.5?2:(r<7.5?5:10));st*=mag;var out=[],v=Math.ceil(a/st)*st;for(;v<=b+1e-9;v+=st)out.push(Math.round(v*1000)/1000);return out;}

function growthHero(metric){
  var m=METRICS[metric],ms=measures(metric);
  if(!ms.length)return '<p class="hint">Ancora nessuna misura di '+m.label.toLowerCase()+'. Alla prossima pesata tocca "Registra".</p>';
  var last=ms[ms.length-1],prev=ms.length>1?ms[ms.length-2]:null,dAge=ageDaysAt(last.t),pct=pctOf(m.key,dAge,m.toX(last[metric]));
  var h='<div class="hero" style="--hc:'+m.c+'"><div class="big">'+esc(m.fmt(last[metric]))+'</div><div class="pct"><b>'+ordPct(pct)+'</b> percentile</div></div>';
  var sub=fmtDate(last.t)+(dAge!=null?' · '+Math.floor(dAge/7)+' settimane':'');
  if(prev){var dd=Math.max(1,Math.round((last.t-prev.t)/864e5)),diff=last[metric]-prev[metric];
    var per=metric==='w'?Math.round(diff/dd*7)+' g a settimana':(Math.round(diff/dd*7*10)/10).toFixed(1).replace('.',',')+' cm a settimana';
    var dtxt=metric==='w'?(diff>=0?'+':'−')+Math.abs(Math.round(diff))+' g':(diff>=0?'+':'−')+Math.abs(Math.round(diff*10)/10).toString().replace('.',',')+' cm';
    sub+=' · '+dtxt+' in '+dd+(dd===1?' giorno':' giorni')+' ('+per+')';}
  return h+'<p class="hint">'+esc(sub)+'</p>';
}
A.setMetric=function(mm){healthMetric=mm;renderHealth();};

/* --- pannello Salute --- */
function renderHealth(){
  var el=$('#health');if(!el)return;
  var h='',m=METRICS[healthMetric];
  /* crescita */
  h+='<div class="card"><div class="cardhead"><h3>Crescita</h3><div class="seg small">'+['w','l'].map(function(k){return '<button class="'+(k===healthMetric?'on':'')+'" onclick="A.setMetric(\''+k+'\')">'+METRICS[k].label+'</button>';}).join('')+'</div></div>';
  h+=growthHero(healthMetric)+'<div class="growth">'+growthChart(healthMetric)+'</div>';
  h+='<p class="hint">Bande: 3°–97° e 15°–85° percentile, linea tratteggiata = mediana. Standard OMS 2006, maschi. Il percentile lo conferma il pediatra.</p>';
  h+='<button class="btn" onclick="A.flow(\'measure\')">Registra peso e misure</button>';
  var ms=measures().slice(-6).reverse();
  if(ms.length){h+='<div class="spacer"></div><div class="list">';ms.forEach(function(e){var parts=[];if(e.w!=null)parts.push(METRICS.w.fmt(e.w));if(e.l!=null)parts.push(METRICS.l.fmt(e.l));var dA=ageDaysAt(e.t);h+='<div class="row"><div class="time"><small>'+fmtDate(e.t)+'</small></div><div class="what">'+esc(parts.join(' · '))+'<span class="who">'+(dA!=null?Math.floor(dA/7)+' sett'+(e.w!=null?' · '+ordPct(pctOf('wfa',dA,e.w/1000))+' peso':''):'')+'</span></div><button class="del" aria-label="Elimina" onclick="A.del(\''+e.id+'\');renderHealth()">×</button></div>';});h+='</div>';}
  h+='</div>';
  /* vitamina D e medicine */
  var vd=todayMeds('vitd'),vdLast=vd.length?vd[vd.length-1]:null;
  h+='<div class="card"><h3>Vitamina D e medicine</h3>';
  h+=vdLast?'<div class="done"><span class="tick">✓</span><div><b>Vitamina D data</b><br><span class="hint">alle '+fmtTime(vdLast.t)+(vdLast.who?' da '+esc(vdLast.who):'')+'</span></div></div>':'<button class="btn vitd" onclick="A.quickMed(\'vitd\',this)">Vitamina D data adesso</button>';
  h+='<div class="dots" aria-label="Ultimi 7 giorni">';
  for(var i=6;i>=0;i--){var day=Date.now()-i*864e5,k=dayKey(day),got=S.events.some(function(e){return e.k==='med'&&e.what==='vitd'&&dayKey(e.t)===k;});h+='<span class="'+(got?'on':'')+'" title="'+fmtDate(day)+'">'+['D','L','M','M','G','V','S'][new Date(day).getDay()]+'</span>';}
  h+='</div>';
  var others=todayMeds().filter(function(e){return e.what!=='vitd';});
  if(others.length)h+='<p class="hint">Oggi anche: '+others.map(function(e){return esc(medName(e))+' ('+fmtTime(e.t)+')';}).join(', ')+'.</p>';
  h+='<div class="spacer"></div><button class="btn ghost" onclick="A.flow(\'med\')">Altra medicina</button></div>';
  /* temperatura */
  var temps=sorted().filter(function(e){return e.k==='temp';}),lt=temps.length?temps[temps.length-1]:null;
  h+='<div class="card"><h3>Temperatura</h3>';
  if(lt){var hot=lt.c>=38;h+='<div class="hero" style="--hc:'+(hot?'var(--danger)':'var(--c-cambio)')+'"><div class="big">'+fmtTemp(lt.c)+'</div><div class="pct">'+(dayKey(lt.t)===dayKey(Date.now())?'oggi alle '+fmtTime(lt.t):fmtDate(lt.t)+' '+fmtTime(lt.t))+'</div></div>';
    if(hot&&ageDays()<90)h+='<div class="callout">Febbre: temperatura rettale ≥ 38 °C sotto i 3 mesi è sempre urgente, anche senza altri sintomi.</div>';}
  else h+='<p class="hint">Nessuna misurazione. Registra la temperatura quando la misuri: resta nel diario e sull\'altro telefono.</p>';
  h+='<button class="btn ghost" onclick="A.flow(\'temp\')">Registra la temperatura</button>';
  if(temps.length>1){h+='<div class="spacer"></div><div class="list">';temps.slice(-5).reverse().forEach(function(e){h+='<div class="row"><div class="time"><small>'+fmtDate(e.t)+'</small><br>'+fmtTime(e.t)+'</div><div class="what">'+fmtTemp(e.c)+'</div><button class="del" aria-label="Elimina" onclick="A.del(\''+e.id+'\');renderHealth()">×</button></div>';});h+='</div>';}
  h+='</div>';
  /* visite e vaccini */
  h+='<div class="card"><h3>Visite e vaccini</h3>';
  var nx=nextAppt(),all=appts(),up=all.filter(function(e){return !e.done&&e.t>=Date.now()-2*H;}),past=all.filter(function(e){return e.done||e.t<Date.now()-2*H;});
  if(nx)h+='<div class="next" style="--hc:'+kindColor(nx.kind)+'"><div class="when">'+esc(inDays(nx.t))+'</div><div class="ttl">'+esc(nx.title||apptKind(nx.kind))+'</div><div class="hint">'+fmtDate(nx.t)+' alle '+fmtTime(nx.t)+(nx.place?' · '+esc(nx.place):'')+'</div></div>';
  else h+='<p class="hint">Nessuna visita programmata.</p>';
  if(up.length){h+='<div class="list">';up.forEach(function(e){h+='<div class="row appt"><div class="time"><small>'+fmtDate(e.t)+'</small><br>'+fmtTime(e.t)+'</div><div class="what"><span class="tag" style="--hc:'+kindColor(e.kind)+'">'+esc(apptKind(e.kind))+'</span> '+esc(e.title||'')+(e.place?'<span class="who">'+esc(e.place)+'</span>':'')+(e.note?'<span class="who">'+esc(e.note)+'</span>':'')+'<div class="acts"><button onclick="A.ics(\''+e.id+'\')">Nel calendario</button><button onclick="A.apptDone(\''+e.id+'\')">Fatta</button><button onclick="A.del(\''+e.id+'\');renderHealth()">Elimina</button></div></div></div>';});h+='</div>';}
  h+='<div class="spacer"></div><button class="btn" onclick="A.flow(\'appt\')">Aggiungi visita o vaccino</button>';
  var due=milestonesDue();
  if(due.length){h+='<h4>Tappe in arrivo <span class="hint">(calendario vaccinale nazionale e bilanci di salute: le date le fissano ASL e pediatra)</span></h4><div class="list">';
    due.forEach(function(s){h+='<div class="row appt"><div class="time"><small>'+s.months+' '+(s.months===1?'mese':'mesi')+'</small><br><small>'+fmtDate(s.at)+'</small></div><div class="what"><span class="tag" style="--hc:'+kindColor(s.kind)+'">'+esc(apptKind(s.kind))+'</span> '+esc(s.title)+'<div class="acts"><button onclick="A.planMilestone('+s.idx+')">Programma</button></div></div></div>';});
    h+='</div>';}
  if(past.length)h+='<p class="hint">'+past.length+(past.length===1?' visita fatta':' visite fatte')+'.</p>';
  h+='</div>';
  h+=extHtml('salute');
  el.innerHTML=h;
}
function kindColor(k){return k==='vaccino'?'var(--c-aria)':(k==='bilancio'?'var(--c-cambio)':(k==='esame'?'var(--c-sonno)':'var(--c-contatto)'));}
function milestonesDue(){
  var b=birthMs();if(b==null)return [];
  var out=[],now=Date.now(),all=appts();
  MILESTONES.forEach(function(ms,idx){
    var at=b+ms[0]*30.4375*864e5;
    if(at<now-45*864e5)return;
    var covered=all.some(function(e){return e.kind===ms[1]&&Math.abs(e.t-at)<45*864e5;});
    if(!covered)out.push({idx:idx,months:ms[0],kind:ms[1],title:ms[2],at:at});
  });
  return out.slice(0,4);
}
A.planMilestone=function(idx){var ms=MILESTONES[idx];if(!ms)return;var b=birthMs()||Date.now();flow={type:'appt',step:1,off:0,data:{kind:ms[1],title:ms[2],date:isoDay(b+ms[0]*30.4375*864e5),time:'10:00'},link:null};showScreen();renderFlow();};
A.apptDone=function(id){var e=byId(id);if(!e)return;e.done=!e.done;touched(e);save();renderHealth();renderHome();toast(e.done?'Segnata come fatta':'Rimessa tra le prossime');};
A.quickMed=function(what,btn){var e={id:uid(),k:'med',t:Date.now(),who:who,what:what,name:medName({what:what})};S.events.push(e);touched(e);save();toast(medName(e)+' segnata');renderHealth();renderHome();};

/* file .ics: su iPhone si apre in Calendario; nell'app installata prova prima la condivisione */
function icsFor(e){
  var dt=function(t){var d=new Date(t);return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+'T'+pad(d.getUTCHours())+pad(d.getUTCMinutes())+'00Z';};
  var tx=function(s){return String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/[,;]/g,function(c){return '\\'+c;});};
  var title=(S.settings.name||'Alan')+' · '+(e.title||apptKind(e.kind));
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Alan cosa vuole//IT','BEGIN:VEVENT','UID:alan-'+e.id+'@alan','DTSTAMP:'+dt(Date.now()),'DTSTART:'+dt(e.t),'DTEND:'+dt(e.t+45*MIN),'SUMMARY:'+tx(title),'LOCATION:'+tx(e.place),'DESCRIPTION:'+tx(e.note),'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:'+tx('Domani: '+title),'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
}
A.ics=function(id){
  var e=byId(id);if(!e)return;
  var txt=icsFor(e),blob=new Blob([txt],{type:'text/calendar;charset=utf-8'}),name='alan-'+(e.kind||'visita')+'.ics';
  try{if(navigator.canShare&&window.File){var f=new File([blob],name,{type:'text/calendar'});if(navigator.canShare({files:[f]})){navigator.share({files:[f],title:e.title||apptKind(e.kind)}).catch(function(){});return;}}}catch(err){}
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
};

/* --- percorsi a tap della Salute --- */
function lastMeasure(metric){var ms=measures(metric);return ms.length?ms[ms.length-1][metric]:null;}
function fmtStep(metric,v){return METRICS[metric].fmt(v);}
A.hstep=function(key,delta){if(!flow)return;var m=METRICS[key],cur=flow.data[key]!=null?flow.data[key]:(lastMeasure(key)||m.start);var v=Math.round((cur+delta)*100)/100;flow.data[key]=Math.max(m.min,Math.min(m.max,v));renderFlow();};
A.hkeep=function(key){if(!flow)return;if(flow.data[key]==null)flow.data[key]=lastMeasure(key)||METRICS[key].start;flow.step++;renderFlow();};
A.hskip=function(key){if(!flow)return;flow.data[key]=null;flow.step++;renderFlow();};
A.hdate=function(v){if(!flow)return;flow.data.date=v;renderFlow();};
A.htemp=function(v){if(!flow)return;flow.data.c=Math.round(Math.max(34,Math.min(42,v))*10)/10;renderFlow();};
A.hset=function(k,v){if(!flow)return;flow.data[k]=v;renderFlow();};
A.hmed=function(what){if(!flow)return;flow.data.what=what;if(what==='altro'){flow.step=1;renderFlow();}else A.finish(what);};
function dayChips(){
  var d=flow.data.date||isoDay(Date.now()),opts=[[0,'oggi'],[1,'ieri'],[2,'2 giorni fa'],[3,'3 giorni fa'],[4,'4 giorni fa'],[5,'5 giorni fa'],[6,'6 giorni fa'],[7,'una settimana fa']],h='<div class="when"><span>Quando</span>';
  opts.forEach(function(o){var v=isoDay(Date.now()-o[0]*864e5);h+='<button class="'+(d===v?'on':'')+'" onclick="A.hdate(\''+v+'\')">'+o[1]+'</button>';});
  h+='<label class="datechip'+(opts.every(function(o){return isoDay(Date.now()-o[0]*864e5)!==d;})?' on':'')+'">altra<input type="date" value="'+esc(d)+'" max="'+isoDay(Date.now())+'" onchange="A.hdate(this.value)"></label></div>';
  return h;
}
/* stepper con valore toccabile: il tap apre un campo numerico per il valore esatto (grammi interi o cm con un decimale) */
function stepper(key){
  var m=METRICS[key],v=flow.data[key]!=null?flow.data[key]:(lastMeasure(key)||m.start),big=m.step[0],small=m.step[1];
  var b=function(d){return '<button onclick="A.hstep(\''+key+'\','+d+')">'+(d>0?'+':'−')+Math.abs(d)+'</button>';};
  if(flow.data.exact===key){
    var isW=key==='w';
    return '<div class="exact"><label class="f" for="exactIn">'+m.label+' esatt'+(isW?'o':'a')+' in '+m.unit+'</label><div class="two"><input class="f" id="exactIn" type="number" inputmode="'+(isW?'numeric':'decimal')+'" step="'+(isW?'1':'0.1')+'" min="'+m.min+'" max="'+m.max+'" value="'+(isW?Math.round(v):v)+'" onchange="A.hexactSet(\''+key+'\',this.value)" oninput="A.hexactSet(\''+key+'\',this.value,true)"><button class="btn ghost" onclick="A.hexact(null)">Fatto</button></div><p class="hint">Vale il numero scritto: '+esc(m.fmt(v))+'</p></div>';
  }
  return '<div class="stepper"><div class="col">'+b(-big)+b(-small)+'</div><button class="val tap" onclick="A.hexact(\''+key+'\')" aria-label="Scrivi il valore esatto">'+esc(m.fmt(v))+'<small>tocca per scrivere</small></button><div class="col">'+b(small)+b(big)+'</div></div>';
}
A.hexact=function(key){if(!flow)return;flow.data.exact=key||null;renderFlow();if(key){var i=$('#exactIn');if(i&&i.focus)try{i.focus();i.select&&i.select();}catch(e){}}};
A.hexactSet=function(key,val,quiet){if(!flow)return;var m=METRICS[key],n=Number(String(val).replace(',','.'));if(!isFinite(n))return;n=key==='w'?Math.round(n):Math.round(n*10)/10;if(n<m.min||n>m.max)return;flow.data[key]=n;if(!quiet)renderFlow();else{var hint=$('#screenInner .exact .hint');if(hint)hint.textContent='Vale il numero scritto: '+m.fmt(n);}};
function renderHealthFlow(){
  var d=flow.data,h='';
  if(flow.type==='measure'){
    var steps=['w','l'],key=steps[flow.step];
    h+='<div class="bar">'+backBtn()+'<div class="title">Peso e misure</div></div>'+dayChips();
    if(key){var m=METRICS[key],last=lastMeasure(key);
      h+='<h2>'+m.label+'?</h2>'+stepper(key)+(last!=null?'<p class="hint">Ultima misura: '+esc(m.fmt(last))+'</p>':'');
      h+='<button class="btn" onclick="A.hkeep(\''+key+'\')">Avanti</button><button class="btn ghost" onclick="A.hskip(\''+key+'\')">Non l\'ho misurat'+(key==='w'?'o':'a')+'</button>';
    }else{
      var parts=[];steps.forEach(function(k){if(d[k]!=null)parts.push(METRICS[k].label.toLowerCase()+' '+METRICS[k].fmt(d[k]));});
      h+='<h2>Salvo '+(parts.length?esc(parts.join(', ')):'nessuna misura')+'</h2>';
      if(d.w!=null){var dA=ageDaysAt(noon(d.date||isoDay(Date.now()))||Date.now());if(dA!=null)h+='<p class="hint">Peso al '+ordPct(pctOf('wfa',dA,d.w/1000))+' percentile OMS a '+Math.floor(dA/7)+' settimane.</p>';}
      h+=parts.length?'<button class="btn huge" onclick="A.finish(1)">Salva</button>':'<button class="btn ghost" onclick="A.home()">Chiudi</button>';
    }
  }else if(flow.type==='temp'){
    var c=d.c!=null?d.c:37.0;
    h+='<div class="bar">'+backBtn()+'<div class="title">Temperatura</div></div>'+whenRow();
    h+='<h2>Quanto segna?</h2><div class="chips">'+[36,36.5,37,37.5,38,38.5,39,39.5].map(function(v){return '<button class="'+(Math.abs(c-v)<0.05?'on':'')+'" onclick="A.htemp('+v+')">'+fmtTemp(v)+'</button>';}).join('')+'</div>';
    h+='<div class="stepper"><button onclick="A.htemp('+(c-0.1)+')">−0,1</button><div class="val" style="--hc:'+(c>=38?'var(--danger)':'var(--text)')+';color:var(--hc)">'+fmtTemp(c)+'</div><button onclick="A.htemp('+(c+0.1)+')">+0,1</button></div>';
    if(c>=38&&ageDays()<90)h+='<div class="callout">Febbre: temperatura rettale ≥ 38 °C sotto i 3 mesi è sempre urgente, anche senza altri sintomi.</div>';
    h+='<button class="btn huge" onclick="A.finish('+c+')">Salva '+fmtTemp(c)+'</button>';
  }else if(flow.type==='med'){
    h+='<div class="bar">'+backBtn()+'<div class="title">Medicina</div></div>'+whenRow();
    if(flow.step===0)h+='<h2>Cosa hai dato?</h2><div class="grid2">'+MEDS.map(function(o){return '<button onclick="A.hmed(\''+o[0]+'\')">'+o[1]+'</button>';}).join('')+'</div>';
    else h+='<h2>Quale?</h2><label class="f" for="medName">Nome</label><input class="f" id="medName" type="text" value="'+esc(d.name||'')+'" oninput="flow&&(flow.data.name=this.value)"><div class="spacer"></div><button class="btn huge" onclick="A.finish(\'altro\')">Salva</button>';
  }else if(flow.type==='appt'){
    h+='<div class="bar">'+backBtn()+'<div class="title">Visita o vaccino</div></div>';
    if(flow.step===0)h+='<h2>Che cos\'è?</h2><div class="grid2">'+APPT_KINDS.map(function(o){return '<button style="border-bottom:4px solid '+kindColor(o[0])+'" onclick="A.hset(\'kind\',\''+o[0]+'\');flow.step=1;renderFlow()">'+o[1]+'</button>';}).join('')+'</div>';
    else{
      h+='<h2>'+esc(apptKind(d.kind))+'</h2>';
      h+='<label class="f" for="apTitle">Titolo</label><input class="f" id="apTitle" type="text" value="'+esc(d.title||'')+'" placeholder="'+esc(apptKind(d.kind))+'" oninput="flow&&(flow.data.title=this.value)">';
      h+='<div class="two"><div><label class="f" for="apDate">Giorno</label><input class="f" id="apDate" type="date" value="'+esc(d.date||isoDay(Date.now()+7*864e5))+'" onchange="flow&&(flow.data.date=this.value)"></div><div><label class="f" for="apTime">Ora</label><input class="f" id="apTime" type="time" value="'+esc(d.time||'10:00')+'" onchange="flow&&(flow.data.time=this.value)"></div></div>';
      h+='<label class="f" for="apPlace">Dove (facoltativo)</label><input class="f" id="apPlace" type="text" value="'+esc(d.place||'')+'" oninput="flow&&(flow.data.place=this.value)">';
      h+='<label class="f" for="apNote">Nota (facoltativo)</label><input class="f" id="apNote" type="text" value="'+esc(d.note||'')+'" oninput="flow&&(flow.data.note=this.value)">';
      h+='<div class="spacer"></div><button class="btn huge" onclick="A.finish(1)">Salva</button>';
    }
  }
  return h;
}
function healthFinish(val){
  var d=flow.data,t=Date.now()-flow.off*MIN;
  if(flow.type==='measure'){
    var e={k:'measure'};if(d.w!=null)e.w=Math.round(d.w);if(d.l!=null)e.l=d.l;
    if(e.w==null&&e.l==null)return null;
    var at=noon(d.date||isoDay(Date.now()))||Date.now();if(dayKey(at)===dayKey(Date.now()))at=Math.min(Date.now(),at+(Date.now()-noon(isoDay(Date.now()))));
    var msg='Misure salvate'+(e.w!=null?' · peso al '+ordPct(pctOf('wfa',ageDaysAt(at)||0,e.w/1000))+' percentile':'');
    return {e:e,t:at,msg:msg};
  }
  if(flow.type==='temp'){var c=Math.round(Number(val)*10)/10;if(!(c>30&&c<45))return null;return {e:{k:'temp',c:c},t:t,msg:'Temperatura '+fmtTemp(c)};}
  if(flow.type==='med'){var what=val||d.what,name=what==='altro'?(d.name||'').trim():medName({what:what});if(!name)return null;return {e:{k:'med',what:what,name:name},t:t,msg:name+' segnata'};}
  if(flow.type==='appt'){
    var at2=new Date((d.date||isoDay(Date.now()+7*864e5))+'T'+(d.time||'10:00')+':00').getTime();if(isNaN(at2))return null;
    return {e:{k:'appt',kind:d.kind||'visita',title:(d.title||'').trim()||apptKind(d.kind),place:(d.place||'').trim(),note:(d.note||'').trim(),done:false},t:at2,msg:apptKind(d.kind)+' '+inDays(at2)};
  }
  return null;
}

/* --- Home: riga salute (vitamina D, prossima visita) e riepilogo della notte --- */
/* Riga della scheda "Prossime tappe": pallino del colore della cosa, testo (html già pronto), quando a destra e
   un'azione opzionale. La usano anche predict.js e reminders.js (API.nextRow), così le righe sono tutte uguali. */
function nextRow(o){
  var inner='<i style="--pc:'+(o.color||'var(--muted)')+'"></i><span class="nx-txt">'+o.text+'</span>'+(o.when?'<span class="nx-when">'+esc(o.when)+'</span>':'');
  var main=o.onclick?'<button class="nx-main" onclick="'+o.onclick+'">'+inner+'</button>':'<div class="nx-main">'+inner+'</div>';
  return '<div class="nx-row'+(o.cls?' '+o.cls:'')+'">'+main+(o.act?'<button class="nx-act" onclick="'+o.actOnclick+'">'+esc(o.act)+'</button>':'')+'</div>';
}
/* riga di casa: la vitamina D di oggi. Le visite le annunciano i promemoria (oggi e domani) e la tab Salute: qui non si
   ripetono. Le previsioni e i promemoria arrivano dalle estensioni, nello stesso formato. */
function coreNextRows(){
  if(!everMed('vitd'))return '';
  var vd=todayMeds('vitd');
  return vd.length?nextRow({color:'var(--c-cambio)',text:'Vitamina D data oggi',when:fmtTime(vd[vd.length-1].t),cls:'done'})
                  :nextRow({color:'var(--c-cambio)',text:'Vitamina D di oggi',when:'non ancora',act:'Segna',actOnclick:'A.quickMed(\'vitd\',this)'});
}
/* "Prossime tappe": una sola scheda con previsioni (predict), promemoria (reminders), vitamina D e visite */
function renderNext(){
  var el=$('#next');if(!el)return;
  var rows=extHtml('next')+coreNextRows();
  el.innerHTML=rows?'<div class="card nx"><h3>Prossime tappe</h3>'+rows+'</div>':'';
}
A.goHealth=function(){showView('salute');};
A.goCries=function(){showView('pianti');};
function nightWindow(now){var d=new Date(now);var end=new Date(d.getFullYear(),d.getMonth(),d.getDate(),7,0,0).getTime();if(now<end)end=now;var start=end-9*H;return {start:start,end:end};}
/* Riepilogo di una finestra notturna qualsiasi (start–end): pappe, ml, cambi, pianti, sonno e tratto più lungo, risvegli,
   note e alzate per genitore. Lo usano il riquadro in Home (la notte appena passata) e il diario notturno in Pattern. */
function nightStats(start,end,now){
  now=now||Date.now();
  var w={start:start,end:end},ev=sorted(),inW=ev.filter(function(e){return e.t>=w.start&&e.t<=w.end&&e.k!=='appt'&&e.k!=='measure';});
  var feeds=inW.filter(function(e){return e.k==='feed';}),ml=feeds.reduce(function(s,e){return s+(e.ml||0);},0);
  var diapers=inW.filter(function(e){return e.k==='diaper';}).length,cries=inW.filter(function(e){return e.k==='cry';});
  var sleep=0,cur=null;ev.forEach(function(e){if(e.k==='sleep')cur=e.t;else if(e.k==='wake'&&cur!=null){var a=Math.max(cur,w.start),b=Math.min(e.t,w.end);if(b>a)sleep+=b-a;cur=null;}});
  if(cur!=null){var a2=Math.max(cur,w.start),b2=Math.min(now,w.end);if(b2>a2)sleep+=b2-a2;}
  var whos={};inW.forEach(function(e){if(e.who&&e.who!=='Io'&&(e.k==='feed'||e.k==='diaper'||e.k==='other'||e.k==='med'))whos[e.who]=(whos[e.who]||0)+1;});
  /* tratto di sonno più lungo dentro la finestra, risvegli segnati e note scritte stanotte: servono al resoconto */
  var best=null,c2=null;
  ev.forEach(function(e){
    if(e.k==='sleep'){c2=e.t;return;}
    if(e.k!=='wake'||c2==null)return;
    var a=Math.max(c2,w.start),b=Math.min(e.t,w.end);if(b>a&&(!best||b-a>best.dur))best={dur:b-a,start:a};c2=null;
  });
  if(c2!=null){var a3=Math.max(c2,w.start),b3=Math.min(now,w.end);if(b3>a3&&(!best||b3-a3>best.dur))best={dur:b3-a3,start:a3};}
  var poo=inW.filter(function(e){return e.k==='diaper'&&lvlKey(e.cacca)!=='no';}).length;
  var notes=inW.filter(function(e){return typeof e.note==='string'&&e.note.trim();});
  return {start:w.start,end:w.end,feeds:feeds.length,ml:ml,diapers:diapers,poo:poo,cries:cries.length,cryLabels:cries.map(function(c){return c.label?LABELS[c.label]:'?';}),
    sleep:sleep,longest:best,wakes:inW.filter(function(e){return e.k==='wake';}).length,notes:notes,whos:whos,list:inW};
}
/* la notte appena passata, solo di mattina (5–13) e solo se c'è qualcosa dentro */
function nightSummary(now){
  now=now||Date.now();var hr=new Date(now).getHours();if(hr<5||hr>=13)return null;
  var w=nightWindow(now),n=nightStats(w.start,w.end,now);
  return n.list.length?n:null;
}
var nightOpen=false;
A.toggleNight=function(){nightOpen=!nightOpen;renderNight();};
/* Resoconto della notte in frasi, per chi si è svegliato senza averla vissuta: solo fatti, nessun giudizio. */
function nightStory(n){
  var name=esc(S.settings.name||'Alan'),p=[];
  if(n.sleep>0){
    var s='Stanotte '+name+' ha dormito '+fmtDur(n.sleep)+' in tutto';
    if(n.longest&&n.longest.dur<n.sleep)s+=', il tratto più lungo '+fmtDur(n.longest.dur)+' dalle '+fmtTime(n.longest.start);
    else if(n.longest)s+=', dalle '+fmtTime(n.longest.start);
    p.push(s+'.');
    if(n.wakes>1)p.push('Si è svegliato '+n.wakes+' volte.');
  }else p.push('Stanotte nessuna nanna segnata con Nanna e Sveglio.');
  if(n.feeds)p.push('Ha mangiato '+(n.feeds===1?'una volta':n.feeds+' volte')+(n.ml?', '+n.ml+' ml in tutto':'')+'.');
  if(n.diapers)p.push(n.diapers===1?('Un cambio'+(n.poo?', con cacca':'')+'.'):(n.diapers+' cambi'+(n.poo?', '+n.poo+' con cacca':'')+'.'));
  if(n.cries){
    var lab={},bits=[];n.cryLabels.forEach(function(l){lab[l]=(lab[l]||0)+1;});
    for(var k in lab)if(k!=='?')bits.push(lab[k]+' '+k.toLowerCase());
    p.push((n.cries===1?'Un pianto':n.cries+' pianti')+(bits.length?' ('+esc(bits.join(', '))+')':'')+'.');
  }
  var ws=Object.keys(n.whos);
  if(ws.length)p.push('Alzate: '+ws.map(function(k){return esc(k)+' '+n.whos[k];}).join(', ')+'.');
  return p.join(' ');
}
function renderNight(){
  var el=$('#night');if(!el)return;
  var n=nightSummary();if(!n){el.innerHTML='';return;}
  var bits=[];bits.push(n.feeds+(n.feeds===1?' pappa':' pappe')+(n.ml?' ('+n.ml+' ml)':''));bits.push(n.diapers+(n.diapers===1?' cambio':' cambi'));if(n.cries)bits.push(n.cries+(n.cries===1?' pianto':' pianti'));bits.push('dormito '+fmtDur(n.sleep));
  var h='<div class="night'+(nightOpen?' open':'')+'"><button class="nh" onclick="A.toggleNight()" aria-expanded="'+(nightOpen?'true':'false')+'"><div><div class="lbl">Com\'è andata stanotte <span class="hint">'+fmtTime(n.start)+'–'+fmtTime(n.end)+'</span></div><div class="sum">'+esc(bits.join(' · '))+'</div><div class="hint">'+(nightOpen?'tocca per chiudere':'tocca per il resoconto')+'</div></div><span class="chev">'+(nightOpen?'▴':'▾')+'</span></button>';
  if(nightOpen){
    h+='<div class="ng-body"><p class="ng-story">'+nightStory(n)+'</p>';
    h+='<div class="ng-nums">'+[['Dormito',fmtDur(n.sleep)],['Pappe',n.feeds+(n.ml?' <small>'+n.ml+' ml</small>':'')],['Cambi',n.diapers+(n.poo?' <small>'+n.poo+' con cacca</small>':'')],['Pianti',String(n.cries)]].map(function(x){return '<div><div class="l">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>';}).join('')+'</div>';
    if(n.notes.length)h+='<p class="ng-notes">'+n.notes.map(function(e){return '<span>'+fmtTime(e.t)+' '+esc(describe(e,null)[0])+': «'+esc(e.note.trim())+'»</span>';}).join('')+'</p>';
    h+='</div><div class="list">';
    n.list.slice().reverse().forEach(function(e){h+=diaryRow(e,null,true);});
    h+='</div>';
  }
  el.innerHTML=h+'</div>';
}

/* ---------- estensioni: ogni funzione aggiuntiva vive in js/<nome>.js e si registra su window.AlanExt ----------
   Contratto: le estensioni NON toccano app.js. Registrano percorsi a tap (flow), blocchi in Home (home), tab intere (tab),
   riquadri in Pattern/Salute/Altro (slot), descrizioni nel diario (describe), voci da nascondere nel diario (hide),
   e reagiscono a 'change' (ogni salvataggio o merge). Tutto ciò che serve dall'app passa da API. */
var EXT={flows:{},home:[],tabs:{},slots:{},describe:{},hidden:{},hooks:{},rows:[]},extReady=false;
/* decorazione delle righe del diario: ogni funzione registrata con AlanExt.row torna html da aggiungere in fondo alla riga */
function extRow(e){var out='';for(var i=0;i<EXT.rows.length;i++){try{var r=EXT.rows[i](e,API);if(r)out+=(typeof r==='string'?r:(r.html||''));}catch(x){}}return out;}
function extEmit(evt){var hs=EXT.hooks[evt]||[];for(var i=0;i<hs.length;i++){try{hs[i](API);}catch(e){}}}
function extHtml(slot){var fs=(EXT.slots[slot]||[]).slice().sort(function(a,b){return (a.prio||0)-(b.prio||0);}),out='';for(var i=0;i<fs.length;i++){try{out+=fs[i].fn(API)||'';}catch(e){}}return out;}
function renderExtHome(){
  for(var i=0;i<EXT.home.length;i++){var b=EXT.home[i],host=$('#'+(b.where==='top'?'extTop':(b.where==='bottom'?'extBottom':'extMid')));if(!host)continue;
    var el=document.getElementById?document.getElementById('home-'+b.id):null;
    if(!el){el=document.createElement('div');el.id='home-'+b.id;host.appendChild(el);}
    try{el.innerHTML=b.fn(API)||'';}catch(e){el.innerHTML='';}}
}
var API={
  MIN:MIN,H:H,LABELS:LABELS,CAUSES:CAUSES,OTHER:OTHER,LVL:LVL,LVL_ORDER:LVL_ORDER,lvlKey:lvlKey,METRICS:METRICS,MILESTONES:MILESTONES,APPT_KINDS:APPT_KINDS,MEDS:MEDS,
  state:function(){return S;},events:function(){return S.events;},settings:function(){return S.settings;},who:function(){return who;},flow:function(){return flow;},
  touched:touched,removed:removed,save:save,uid:uid,byId:byId,sorted:sorted,context:context,snapshot:snapshot,norms:norms,ageDays:ageDays,ageDaysAt:ageDaysAt,ageStr:ageStr,birthMs:birthMs,
  fedFeed:fedFeed,explainers:explainers,pendingCries:pendingCries,typicalPrep:typicalPrep,typicalMl:typicalMl,labeledCries:labeledCries,hypotheses:hypotheses,analyseFrame:analyseFrame,features:features,bins:bins,nightSummary:nightSummary,nightStats:nightStats,nightStory:nightStory,nightWindow:nightWindow,diaryRow:diaryRow,measures:measures,pctOf:pctOf,xOfZ:xOfZ,appts:appts,nextAppt:nextAppt,todayMeds:todayMeds,medName:medName,apptKind:apptKind,milestonesDue:milestonesDue,
  fmtTime:fmtTime,fmtDur:fmtDur,fmtSec:fmtSec,fmtDate:fmtDate,fmtTemp:fmtTemp,dayKey:dayKey,dayLabel:dayLabel,isoDay:isoDay,noon:noon,inDays:inDays,pad:pad,esc:esc,mean:mean,median:median,pct:pct,niceTicks:niceTicks,
  toast:toast,busy:busy,showScreen:showScreen,backBtn:backBtn,whenRow:whenRow,dayChips:dayChips,nextRow:nextRow,queueUpload:queueUpload,TRY:TRY,renderNext:renderNext,noteClean:noteClean,NOTE_MAX:NOTE_MAX,home:function(){A.home();},renderHome:renderHome,renderStatus:renderStatus,refreshViews:refreshViews,showView:showView,curView:function(){return curView;},describe:describe,
  q:function(s){return $(s);},lsGet:lsGet,lsSet:lsSet,
  fileGet:function(k){return idbGet('files',k);},filePut:function(k,v){return idbPut('files',k,v);},fileDel:function(k){return idbDel('files',k);},
  blobToBuf:blobToBuf,audioGet:audioGet,audioPut:audioPut,
  sync:function(){return window.AlanSync||null;},syncReady:syncReady,cloudUpload:function(id,blob,mime){return window.AlanSync?AlanSync.uploadAudio(id,blob,mime):Promise.resolve({path:null,error:'non collegato'});},cloudDownload:function(path){return window.AlanSync?AlanSync.downloadAudio(path):Promise.resolve({data:null,error:{message:'non collegato'}});},cloudRemove:function(path){return window.AlanSync?AlanSync.removeAudio(path):Promise.resolve({});},
  diag:diag,isStandalone:isStandalone,openCry:function(){A.openCry();}
};
window.AlanExt={
  flow:function(type,def){EXT.flows[type]=def;},
  home:function(id,fn,where){EXT.home.push({id:id,fn:fn,where:where||'mid'});},
  tab:function(id,fn){EXT.tabs[id]=fn;},
  slot:function(name,fn,prio){(EXT.slots[name]=EXT.slots[name]||[]).push({fn:fn,prio:prio||0});},
  describe:function(k,fn){EXT.describe[k]=fn;},
  row:function(fn){EXT.rows.push(fn);},
  hide:function(k){EXT.hidden[k]=true;},
  isHidden:function(k){return !!EXT.hidden[k];},
  on:function(evt,fn){(EXT.hooks[evt]=EXT.hooks[evt]||[]).push(fn);},
  api:API,
  refresh:function(){if(!extReady)return;if(!flow)renderHome();if(curView==='pattern')renderStats();else if(curView==='salute')renderHealth();else if(curView==='altro')fillExtAltro();else if(EXT.tabs[curView])try{EXT.tabs[curView](API);}catch(e){}}
};

/* ---------- aggiornamenti (service worker) ---------- */
var swReg=null,swVersion=null,swWaiting=null,swReloading=false;
function initUpdates(){
  if(!('serviceWorker' in navigator))return;
  var hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    /* al primo install non c'era un controller: non ricaricare. Dopo un aggiornamento sì. */
    if(!hadController){hadController=true;askVersion();return;}
    if(swReloading)return;swReloading=true;location.reload();
  });
  navigator.serviceWorker.addEventListener('message',function(e){if(e.data&&e.data.type==='VERSION'){swVersion=e.data.version;renderVersion();}});
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(function(reg){
    swReg=reg;
    if(reg.waiting&&navigator.serviceWorker.controller)showUpdate(reg.waiting);
    reg.addEventListener('updatefound',function(){
      var nw=reg.installing;if(!nw)return;
      nw.addEventListener('statechange',function(){if(nw.state==='installed'&&navigator.serviceWorker.controller)showUpdate(nw);});
    });
    askVersion();
  }).catch(function(){});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)checkUpdate();});
  setInterval(checkUpdate,3600e3);
}
function checkUpdate(){if(swReg)swReg.update().catch(function(){});}
function askVersion(){
  var c=navigator.serviceWorker&&navigator.serviceWorker.controller;if(!c||!window.MessageChannel)return;
  var mc=new MessageChannel();mc.port1.onmessage=function(e){if(e.data&&e.data.version){swVersion=e.data.version;renderVersion();}};
  try{c.postMessage({type:'GET_VERSION'},[mc.port2]);}catch(e){}
}
function renderVersion(){if(!flow)renderDiag();}
function showUpdate(worker){
  swWaiting=worker;
  var b=$('#updBanner');if(!b)return;
  b.innerHTML='<button onclick="A.applyUpdate(this)">Nuova versione, tocca per aggiornare</button>';b.classList.add('on');
  try{document.body.classList.add('upd-on');}catch(e){}
}
A.applyUpdate=function(btn){
  var w=swWaiting||(swReg&&swReg.waiting);
  if(btn){btn.disabled=true;btn.textContent='Aggiorno…';}
  if(!w){location.reload();return;}
  try{w.postMessage({type:'SKIP_WAITING'});}catch(e){location.reload();return;}
  /* se controllerchange non arriva (worker già attivo altrove), ricarica comunque */
  setTimeout(function(){if(!swReloading){swReloading=true;location.reload();}},4000);
};

/* ---------- nav & init ---------- */
function showView(v){
  var tabs=document.querySelectorAll('nav.tabs button');for(var i=0;i<tabs.length;i++)tabs[i].classList.toggle('on',tabs[i].getAttribute('data-v')===v);
  ['oggi','pianti','pattern','salute','altro'].concat(Object.keys(EXT.tabs)).forEach(function(x){var el=$('#v-'+x);if(el)el.classList.toggle('on',x===v);});
  if(v==='pianti')renderCries();if(v==='pattern')renderStats();if(v==='salute')renderHealth();if(v==='altro')fillSettings();
  if(EXT.tabs[v])try{EXT.tabs[v](API);}catch(e){}
  curView=v;
  window.scrollTo(0,0);
}
var curView='oggi';
function fillExtAltro(){var el=$('#extAltro');if(el)el.innerHTML=extHtml('altro');}
/* Il nome arriva dal profilo al login. Al PRIMO passaggio da "Io" al nome, le voci registrate su questo telefono senza
   accesso vengono intestate al nome (sono ancora tutte locali: il pull dell'altro telefono avviene dopo). */
function syncWho(){
  if(!window.AlanSync)return;
  var st=AlanSync.status();
  if(st.name&&st.name!==who){var wasAnon=(!who||who==='Io');who=st.name;lsSet(WHOKEY,who);if(wasAnon)adoptName(who);}
}
function adoptName(name){
  var n=0;
  S.events.forEach(function(e){if(!e.who||e.who==='Io'){e.who=name;touched(e);n++;}});
  if(!n)return;
  save();if(!flow)renderHome();
  toast((n===1?'La voce registrata':'Le '+n+' voci registrate')+' senza accesso '+(n===1?'è':'sono')+' ora di '+name);
}
load().then(function(){
  document.querySelectorAll('nav.tabs button').forEach(function(b){b.addEventListener('click',function(){showView(b.getAttribute('data-v'));});});
  applyTheme(themePref());extReady=true;renderHome();initUpdates();
  try{if(/[?&]cry=1/.test(location.search)){history.replaceState(null,'',location.pathname);A.openCry();}}catch(e){}
  if(window.AlanSync){AlanSync.setPresence({who:who,at:Date.now()});AlanSync.init({onEvents:mergeRemote,onSettings:mergeRemoteSettings,onStatus:function(){syncWho();renderHeader();renderAccount();},onReady:flushAudio}).then(function(){syncWho();renderHeader();renderAccount();flushAudio();});}
  window.addEventListener('online',function(){setTimeout(flushAudio,1500);});
  setInterval(function(){if(!flow)renderStatus();},30000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){if(!flow)renderHome();setTimeout(flushAudio,1500);}});
});
})();
