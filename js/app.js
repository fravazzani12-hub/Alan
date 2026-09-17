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
var OTHER=[['ruttino','Ruttino','aria'],['massaggio','Massaggio pancia','aria'],['ciuccio','Ciuccio','contatto'],['coccole','Coccole','contatto'],['passeggiata','Passeggiata','contatto'],['bagnetto','Bagnetto','contatto']];
var LVL={no:'no',poca:'poca',tanta:'tanta'};

/* ---------- storage: IndexedDB with localStorage fallback ---------- */
var db=null;
function openDb(){
  return new Promise(function(res){
    if(!window.indexedDB){res(null);return;}
    try{
      var r=indexedDB.open('alan-v2',1);
      r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');if(!d.objectStoreNames.contains('audio'))d.createObjectStore('audio');};
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
      else if(e.k==='diaper'){n.k='diaper';n.pipi=(e.kind==='pipi'||e.kind==='entrambi')?'tanta':'no';n.cacca=(e.kind==='cacca'||e.kind==='entrambi')?'tanta':'no';}
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
function removed(e){if(window.AlanSync)AlanSync.remove(e);}
function mergeRemote(list){
  var changed=false;
  list.forEach(function(r){
    var cur=byId(r.id);
    if(r._deleted){if(cur){S.events=S.events.filter(function(x){return x.id!==r.id;});if(cur.k==='cry')idbDel('audio',r.id);if(S.openCry===r.id)S.openCry=null;changed=true;}return;}
    if(!cur){var n={};for(var k in r)if(k!=='_deleted')n[k]=r[k];n.audio=false;S.events.push(n);changed=true;return;}
    if(cur._updated&&r._updated&&r._updated<=cur._updated)return;
    for(var k2 in r)if(k2!=='_deleted'&&k2!=='audio'&&k2!=='mime')cur[k2]=r[k2];
    if(cur.k==='cry'&&cur.label&&S.openCry===cur.id)S.openCry=null;
    changed=true;
  });
  if(changed){save();if(!flow)renderHome();renderCries();}
}
window.AlanApp={mergeRemote:mergeRemote,events:function(){return S.events;},refresh:function(){renderHome();renderCries();renderAccount();}};

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
function norms(ad){var w=ad/7;return {feedH:w<6?3:(w<12?3.5:4),awakeMin:w<4?55:(w<8?70:(w<12?85:105))};}
function context(now){
  var ev=sorted().filter(function(e){return e.t<=now;});
  var lastFeed=null,lastDiaper=null,lastSleep=null,lastWake=null;
  ev.forEach(function(e){if(e.k==='feed'){if(e.ml>0)lastFeed=e;}else if(e.k==='diaper')lastDiaper=e;else if(e.k==='sleep')lastSleep=e;else if(e.k==='wake')lastWake=e;});
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

/* ---------- recorder ---------- */
var preCtx=null;
function makeCtx(){try{var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;var c=new AC();if(c.state==='suspended')c.resume();return c;}catch(e){return null;}}
function startRec(){
  rec={t:Date.now(),frames:[],chunks:[],blob:null,mime:'',status:'starting',err:null,stream:null,ctx:preCtx,an:null,mr:null,timer:null,stopped:false,mrErr:null};
  preCtx=null;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){rec.status='nomic';rec.err='Questo browser non espone il microfono.';return;}
  var cons={audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
  navigator.mediaDevices.getUserMedia(cons).catch(function(){return navigator.mediaDevices.getUserMedia({audio:true});}).then(function(stream){
    if(!rec||rec.stopped){stream.getTracks().forEach(function(t){t.stop();});return;}
    rec.stream=stream;
    var ctx=rec.ctx||makeCtx();rec.ctx=ctx;
    if(!ctx){rec.status='denied';rec.err='AudioContext non disponibile.';renderCry();return;}
    var src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=0;src.connect(an);rec.an=an;
    var sr=ctx.sampleRate,tbuf=new Float32Array(an.fftSize),fbuf=new Uint8Array(an.frequencyBinCount);
    try{
      var mime=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].filter(function(m){return window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m);})[0];
      if(window.MediaRecorder){var mr=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);rec.mime=mr.mimeType||mime||'';mr.ondataavailable=function(e){if(e.data&&e.data.size)rec.chunks.push(e.data);};mr.start(1000);rec.mr=mr;}
    }catch(e){rec.mr=null;rec.mrErr=(e&&e.message)||'MediaRecorder non parte';}
    if(!rec.mr&&!rec.mrErr)rec.mrErr='MediaRecorder non supportato';
    rec.status='live';rec.t=Date.now();
    if(ctx.state==='suspended')ctx.resume().catch(function(){});
    rec.timer=setInterval(function(){
      if(!rec||rec.stopped)return;
      var fr=analyseFrame(an,tbuf,fbuf,sr);fr.t=Date.now()-rec.t;rec.frames.push(fr);
      var m=$('#meter');if(m)m.style.width=Math.min(100,Math.round(fr.rms*400))+'%';
      if(fr.t>=30000)A.stopRec();
    },50);
    renderCry();
  }).catch(function(err){
    if(!rec)return;
    rec.status='denied';rec.err=(err&&err.name==='NotAllowedError')?'Microfono non consentito in questa finestra.':'Microfono non disponibile ('+(err&&err.name||'errore')+').';
    renderCry();
  });
}
function finishRec(){
  return new Promise(function(res){
    if(!rec){res();return;}
    rec.stopped=true;clearInterval(rec.timer);
    var done=function(){
      try{if(rec.stream)rec.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
      try{if(rec.ctx)rec.ctx.close();}catch(e){}
      if(rec.chunks.length)rec.blob=new Blob(rec.chunks,{type:rec.mime||'audio/webm'});
      res();
    };
    if(rec.mr&&rec.mr.state!=='inactive'){rec.mr.onstop=done;try{rec.mr.stop();}catch(e){done();}}
    else done();
  });
}

/* ---------- cry flow ---------- */
A.openCry=function(){
  if(S.openCry&&byId(S.openCry)){flow={type:'cry',phase:'after',id:S.openCry};showScreen();renderCry();return;}
  flow={type:'cry',phase:'rec',id:null,liveHy:null};
  preCtx=makeCtx();
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
    var info={mime:rec?rec.mime:'',bytes:rec&&rec.blob?rec.blob.size:0,frames:rec?rec.frames.length:0,err:rec?(rec.err||rec.mrErr||null):'nessuna registrazione'};
    var e={id:uid(),k:'cry',t:startT,dur:(now-startT)/1000,who:who,label:null,ctx:snapshot(c),bins:bins(c),feat:feat,audio:!!(rec&&rec.blob),mime:rec?rec.mime:'',rec:info};
    S.events.push(e);S.openCry=e.id;touched(e);save();
    lsSet('alan.lastRec',JSON.stringify(info));
    if(rec&&rec.blob){
      var blob=rec.blob,mime=rec.mime;
      blob.arrayBuffer().then(function(buf){return idbPut('audio',e.id,{buf:buf,mime:mime});}).then(function(ok){if(!ok){e.audio=false;save();toast('Audio non salvato sul telefono');}else{uploadPending();}}).catch(function(){e.audio=false;save();});
      toast('Pianto salvato · audio '+Math.round(blob.size/1024)+' KB'+(feat?'':' · troppo corto per l\'impronta'));
    }else toast('Pianto salvato senza audio: '+(info.err||'nessun dato dal microfono'));
    rec=null;flow.phase='after';flow.id=e.id;renderCry();renderHome();
  });
};
A.cancelCry=function(){
  clearInterval(flow&&flow.liveT);
  if(rec){rec.stopped=true;clearInterval(rec.timer);try{if(rec.stream)rec.stream.getTracks().forEach(function(t){t.stop();});if(rec.ctx)rec.ctx.close();}catch(e){}rec=null;}
  if(flow&&flow.id){var id=flow.id,ce=byId(id);S.events=S.events.filter(function(e){return e.id!==id;});idbDel('audio',id);if(S.openCry===id)S.openCry=null;if(ce)removed(ce);save();}
  A.home();toast('Pianto cancellato');
};
A.labelCry=function(id,label){
  var e=byId(id);if(!e)return;
  e.label=label;if(S.openCry===id)S.openCry=null;touched(e);save();
  toast('Segnato: '+LABELS[label]);
};
A.solo=function(){if(flow&&flow.id)A.labelCry(flow.id,'solo');A.home();};
A.soloOpen=function(){if(S.openCry)A.labelCry(S.openCry,'solo');renderHome();};
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
A.flow=function(type,linkId){
  flow={type:type,step:0,off:0,data:{},link:linkId||null};
  showScreen();renderFlow();
};
A.setOff=function(o){if(flow){flow.off=o;renderFlow();}};
A.pick=function(key,val){if(!flow)return;flow.data[key]=val;flow.step++;renderFlow();}
A.stepPrep=function(d){if(!flow)return;flow.data.prepCustom=Math.max(10,Math.min(400,(flow.data.prepCustom||typicalPrep())+d));renderFlow();};
A.home=function(){
  if(flow&&flow.type==='cry'&&flow.phase==='rec'){A.cancelCry();return;}
  flow=null;$('#screen').classList.remove('on');renderHome();renderCries();
};
function showScreen(){$('#screen').classList.add('on');$('#screen').scrollTop=0;}
function whenRow(){
  var opts=[[0,'adesso'],[15,'15 min fa'],[30,'30 min fa'],[60,'1 h fa']];
  return '<div class="when"><span>Quando</span>'+opts.map(function(o){return '<button class="'+(flow.off===o[0]?'on':'')+'" onclick="A.setOff('+o[0]+')">'+o[1]+'</button>';}).join('')+'</div>';
}
function backBtn(){return '<button class="back" onclick="A.home()" aria-label="Indietro">‹</button>';}
function renderFlow(){
  if(!flow||flow.type==='cry')return;
  var el=$('#screenInner'),h='',d=flow.data,tp=typicalPrep();
  if(flow.type==='feed'){
    h+='<div class="bar">'+backBtn()+'<div class="title">Pappa</div></div>'+whenRow();
    if(flow.step===0){
      var opts=[60,90,120,150,180,210];
      h+='<h2>Quanto hai preparato?</h2><div class="grid3">'+opts.map(function(m){return '<button class="'+(Math.round(tp)===m?'on':'')+'" onclick="A.pick(\'prep\','+m+')">'+m+'<small>ml</small></button>';}).join('')+'</div>';
      var cv=d.prepCustom||tp;
      h+='<div class="stepper"><button onclick="A.stepPrep(-10)">−10</button><div class="val">'+cv+' ml</div><button onclick="A.stepPrep(10)">+10</button></div><button class="btn ghost" onclick="A.pick(\'prep\','+cv+')">Avanti con '+cv+' ml</button>';
    }else{
      var prep=d.prep,vals=[];for(var v=prep;v>0;v-=10)vals.push(v);vals.push(0);
      h+='<h2>Quanto ne ha bevuto? <span style="font-size:15px;color:var(--muted);font-weight:400">su '+prep+' ml</span></h2><div class="grid3">'+vals.map(function(v){return '<button onclick="A.finish('+v+')">'+(v===prep?'Tutto<small>'+v+' ml</small>':(v===0?'Niente<small>rifiutato</small>':v+'<small>ml</small>'))+'</button>';}).join('')+'</div>';
    }
  }else if(flow.type==='diaper'){
    h+='<div class="bar">'+backBtn()+'<div class="title">Pannolino</div></div>'+whenRow();
    if(flow.step===0)h+='<h2>Pipì?</h2><div class="grid3">'+['no','poca','tanta'].map(function(o){return '<button onclick="A.pick(\'pipi\',\''+o+'\')">'+LVL[o].charAt(0).toUpperCase()+LVL[o].slice(1)+'</button>';}).join('')+'</div>';
    else h+='<h2>Cacca?</h2><div class="grid3">'+['no','poca','tanta'].map(function(o){return '<button onclick="A.finish(\''+o+'\')">'+LVL[o].charAt(0).toUpperCase()+LVL[o].slice(1)+'</button>';}).join('')+'</div>';
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
  el.innerHTML=h;
}
A.finish=function(val){
  if(!flow)return;
  var t=Date.now()-flow.off*MIN,d=flow.data,e=null,label=null,msg='';
  if(flow.type==='feed'){var ml=Number(val);e={k:'feed',prep:d.prep,ml:ml};label=ml>0?'fame':null;msg=ml>0?'Pappa: '+ml+' ml su '+d.prep:'Biberon rifiutato';}
  else if(flow.type==='diaper'){e={k:'diaper',pipi:d.pipi,cacca:val};label='cambio';msg='Cambio: pipì '+LVL[d.pipi]+', cacca '+LVL[val];}
  else if(flow.type==='sleep'){e={k:val};label=val==='sleep'?'sonno':null;msg=val==='sleep'?'Buona nanna':'Si è svegliato';}
  else if(flow.type==='other'){var o=OTHER.filter(function(x){return x[0]===val;})[0];e={k:'other',what:val};label=o?o[2]:'contatto';msg=o?o[1]+' registrato':'Registrato';}
  if(!e)return;
  e.id=uid();e.t=t;e.who=who;S.events.push(e);touched(e);
  var linked=null;
  if(label){
    var cid=flow.link||S.openCry;
    var cry=cid?byId(cid):null;
    if(cry&&cry.k==='cry'&&!cry.label&&t>=cry.t-5*MIN&&t-cry.t<=45*MIN){cry.label=label;linked=cry;touched(cry);if(S.openCry===cry.id)S.openCry=null;}
  }
  save();
  flow=null;$('#screen').classList.remove('on');renderHome();
  toast(linked?msg+' · il pianto delle '+fmtTime(linked.t)+' era '+LABELS[label]:msg);
};

/* ---------- home ---------- */
function statusTile(lbl,big,sub,color,warn,onclick){return '<button class="'+(warn?'warn':'')+'" style="--tc:'+color+'" onclick="'+onclick+'"><div class="lbl">'+lbl+'</div><div class="big">'+big+'</div><div class="sub">'+sub+'</div></button>';}
function knownNames(){
  var names={};names[who]=true;
  S.events.forEach(function(e){if(e.who)names[e.who]=true;});
  if(window.AlanSync){var st=AlanSync.status();if(st.name)names[st.name]=true;for(var n in (st.online||{}))names[n]=true;}
  delete names['Io'];
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
  if(oc&&!oc.label){bn.innerHTML='<div class="banner"><div>Pianto delle '+fmtTime(oc.t)+' senza spiegazione: la prossima cosa che registri lo etichetta.</div><button onclick="A.soloOpen()">Da solo</button></div>';}
  else{bn.innerHTML='';if(oc&&oc.label)S.openCry=null;}
  $('#qSleep').innerHTML=c.sleeping?'Sveglio<small>si è svegliato</small>':'Nanna<small>si è addormentato</small>';
  var tp=typicalPrep();$('#qFeed').textContent='di solito '+Math.round(tp)+' ml';
}
function describe(e,prev){
  if(e.k==='feed')return ['Pappa','<span class="detail">'+(e.ml>0?e.ml+' ml'+(e.prep&&e.ml<e.prep?' su '+e.prep:''):'rifiutata'+(e.prep?' ('+e.prep+' ml)':''))+'</span>'];
  if(e.k==='diaper')return ['Cambio','<span class="detail">pipì '+LVL[e.pipi]+', cacca '+LVL[e.cacca]+'</span>'];
  if(e.k==='sleep')return ['Nanna',''];
  if(e.k==='wake'){var d='';if(prev&&prev.k==='sleep')d='<span class="detail">ha dormito '+fmtDur(e.t-prev.t)+'</span>';return ['Sveglio',d];}
  if(e.k==='other'){var o=OTHER.filter(function(x){return x[0]===e.what;})[0];return [o?o[1]:'Altro',''];}
  if(e.k==='cry'){var d2=e.label?LABELS[e.label]:'senza spiegazione';if(e.dur)d2+=' · '+fmtSec(e.dur);return ['Pianto','<span class="detail">'+d2+'</span>'];}
  return [e.k,''];
}
function renderDiary(){
  var ev=sorted(),vis=ev.slice(-10);
  if(!vis.length){$('#diary').innerHTML='<div class="list"><div class="empty">Ancora vuoto. Tocca Pappa, Pannolino o Nanna: due tap e la voce è registrata.</div></div>';return;}
  var h='<div class="list">';
  for(var i=vis.length-1;i>=0;i--){
    var e=vis[i],prev=null;for(var j=ev.indexOf(e)-1;j>=0;j--){if(ev[j].k==='sleep'||ev[j].k==='wake'){prev=ev[j];break;}}
    var d=describe(e,prev);
    h+='<div class="row"><div class="time">'+(dayKey(e.t)===dayKey(Date.now())?'':'<small>'+dayLabel(e.t)+'</small><br>')+fmtTime(e.t)+'</div><div class="what">'+d[0]+' '+d[1]+(e.who?'<span class="who">'+esc(e.who)+'</span>':'')+'</div><button class="del" aria-label="Elimina" onclick="A.del(\''+e.id+'\')">×</button></div>';
  }
  $('#diary').innerHTML=h+'</div>';
}
A.del=function(id){
  if(!window.confirm('Eliminare questa voce?'))return;
  var e=byId(id);S.events=S.events.filter(function(x){return x.id!==id;});
  if(e)removed(e);
  if(e&&e.k==='cry')idbDel('audio',id);
  if(S.openCry===id)S.openCry=null;save();renderHome();renderCries();
};
function renderHome(){renderHeader();renderStatus();renderDiary();}

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
      h+='<div class="row" onclick="A.cryDetail(\''+e.id+'\')"><div class="time">'+(dayKey(e.t)===dayKey(Date.now())?'':'<small>'+dayLabel(e.t)+'</small><br>')+fmtTime(e.t)+'</div><div class="what">'+tag+' <span class="detail">'+det+'</span></div>'+((e.audio||e.audioPath)?'<button class="play" aria-label="Ascolta" onclick="event.stopPropagation();A.play(\''+e.id+'\')">▶</button>':'<span></span>')+'</div>';
    });
    h+='</div>';
  }
  el.innerHTML=h;
}
function toBlob(r){if(!r)return null;if(r instanceof Blob)return r;if(r.buf)return new Blob([r.buf],{type:r.mime||'audio/mp4'});return null;}
function playBlob(blob){
  if(playing){try{playing.pause();}catch(e){}playing=null;}
  var url=URL.createObjectURL(blob),a=new Audio(url);playing=a;
  a.onended=function(){URL.revokeObjectURL(url);};
  a.play().catch(function(){toast('Il browser non riproduce questo formato ('+(blob.type||'?')+')');});
}
A.play=function(id){
  var e=byId(id);
  idbGet('audio',id).then(function(r){
    var blob=toBlob(r);
    if(blob){playBlob(blob);return;}
    if(e&&e.audioPath&&window.AlanSync){
      toast('Scarico l\'audio…');
      AlanSync.downloadAudio(e.audioPath).then(function(b){
        if(!b){toast('Audio non scaricabile');return;}
        b.arrayBuffer().then(function(buf){idbPut('audio',id,{buf:buf,mime:b.type});});
        playBlob(b);
      });
      return;
    }
    toast('Audio non presente su questo telefono');
  });
};
function uploadPending(){
  if(!window.AlanSync)return;
  var st=AlanSync.status();if(!st.family)return;
  S.events.forEach(function(e){
    if(e.k!=='cry'||!e.audio||e.audioPath||e._up)return;
    e._up=true;
    idbGet('audio',e.id).then(function(r){
      var blob=toBlob(r);if(!blob){e._up=false;return;}
      AlanSync.uploadAudio(e.id,blob,r.mime||e.mime).then(function(u){
        e._up=false;
        if(u&&u.path){e.audioPath=u.path;touched(e);save();renderCries();}
        else if(u&&u.error)lsSet('alan.lastUpload',u.error);
      });
    });
  });
}
A.cryDetail=function(id){
  var e=byId(id);if(!e)return;
  flow={type:'crydetail',id:id};showScreen();
  var h='<div class="bar">'+backBtn()+'<div class="title">Pianto delle '+fmtTime(e.t)+' · '+dayLabel(e.t)+'</div></div>';
  if(e.audio||e.audioPath)h+='<button class="btn ghost" onclick="A.play(\''+id+'\')">▶ Ascolta</button><div class="spacer"></div>';
  if(e.rec)h+='<p class="hint">Registrazione: '+(e.rec.bytes?Math.round(e.rec.bytes/1024)+' KB, '+esc(e.rec.mime||'?'):'nessun audio')+' · '+e.rec.frames+' campioni'+(e.rec.err?' · '+esc(e.rec.err):'')+(e.audioPath?' · in cloud':' · solo su questo telefono')+'</p>';
  h+=hypList(hypotheses(e.ctx||snapshot(context(e.t)),e.bins||bins(context(e.t)),e.feat?e.feat.vec:null));
  h+='<h2 style="font-size:18px">Spiegazione</h2><div class="chips">'+['fame','sonno','cambio','aria','contatto','solo'].map(function(l){return '<button class="'+(e.label===l?'on':'')+'" onclick="A.labelCry(\''+id+'\',\''+l+'\');A.cryDetail(\''+id+'\')">'+LABELS[l]+'</button>';}).join('')+'</div>';
  if(e.feat)h+='<p class="hint">Tono medio '+Math.round(e.feat.meanF0)+' Hz (variazione ±'+Math.round(e.feat.sdF0)+') · intensità '+Math.round(e.feat.meanRms*1000)/10+' · '+Math.round(e.feat.bursts10*10)/10+' raffiche/10 s, lunghe in media '+Math.round(e.feat.meanBurst)+' ms con pause di '+Math.round(e.feat.meanPause)+' ms · voce nel '+Math.round(e.feat.voiced*100)+'% del tempo.</p>';
  h+='<div class="spacer"></div><button class="btn warn" onclick="A.del(\''+id+'\');A.home()">Elimina questo pianto</button>';
  $('#screenInner').innerHTML=h;
};

/* ---------- pattern tab ---------- */
function renderStats(){
  var now=Date.now(),ev=sorted(),h='';
  var d1=ev.filter(function(e){return e.t>=now-864e5;}),d7=ev.filter(function(e){return e.t>=now-7*864e5;});
  var feeds1=d1.filter(function(e){return e.k==='feed';}),ml1=feeds1.reduce(function(s,e){return s+(e.ml||0);},0);
  var diap1=d1.filter(function(e){return e.k==='diaper';}),poop1=diap1.filter(function(e){return e.cacca&&e.cacca!=='no';}).length,wet1=diap1.filter(function(e){return e.pipi&&e.pipi!=='no';}).length;
  var cries1=d1.filter(function(e){return e.k==='cry';}).length;
  var sleep1=0,curS=null;
  ev.forEach(function(e){if(e.k==='sleep')curS=e.t;else if(e.k==='wake'&&curS!=null){var a=Math.max(curS,now-864e5),b=Math.min(e.t,now);if(b>a)sleep1+=b-a;curS=null;}});
  if(curS!=null){var a2=Math.max(curS,now-864e5);if(now>a2)sleep1+=now-a2;}
  h+='<div class="card"><h3>Ultime 24 ore</h3><div class="kv"><div>Pappe</div><div>'+feeds1.length+' <span class="m">'+ml1+' ml</span></div><div>Sonno totale</div><div>'+fmtDur(sleep1)+'</div><div>Cambi</div><div>'+diap1.length+' <span class="m">'+wet1+' pipì · '+poop1+' cacca</span></div><div>Pianti registrati</div><div>'+cries1+'</div></div></div>';
  var feeds7=d7.filter(function(e){return e.k==='feed';}),ints=[];for(var i=1;i<feeds7.length;i++){var g=(feeds7[i].t-feeds7[i-1].t)/H;if(g>0.5&&g<8)ints.push(g);}
  var mls=feeds7.filter(function(e){return e.ml;}).map(function(e){return e.ml;});
  var days7=Math.min(7,Math.max(1,(now-(ev.length?ev[0].t:now))/864e5));
  var awakes=[],naps=[],ls=null,lw=null;
  d7.forEach(function(e){if(e.k==='sleep'){if(lw!=null){var aw=(e.t-lw)/MIN;if(aw>5&&aw<240)awakes.push(aw);}ls=e.t;}else if(e.k==='wake'){if(ls!=null){var np=(e.t-ls)/MIN;if(np>5&&np<600)naps.push(np);}lw=e.t;}});
  var n=norms(ageDays());
  h+='<div class="card"><h3>Ultimi 7 giorni</h3><div class="kv">';
  h+='<div>Tra una pappa e l\'altra</div><div>'+(mean(ints)!=null?fmtDur(mean(ints)*H):'—')+' <span class="m">atteso ~'+n.feedH+' h</span></div>';
  h+='<div>Per pappa</div><div>'+(mean(mls)!=null?Math.round(mean(mls))+' ml':'—')+'</div>';
  h+='<div>Al giorno</div><div>'+(mls.length?Math.round(mls.reduce(function(s,x){return s+x;},0)/days7)+' ml':'—')+'</div>';
  h+='<div>Veglia media</div><div>'+(mean(awakes)!=null?fmtDur(mean(awakes)*MIN):'—')+' <span class="m">finestra ~'+n.awakeMin+' min</span></div>';
  h+='<div>Pisolino medio</div><div>'+(mean(naps)!=null?fmtDur(mean(naps)*MIN):'—')+'</div>';
  h+='<div>Pianti al giorno</div><div>'+(Math.round(d7.filter(function(e){return e.k==='cry';}).length/days7*10)/10)+'</div></div></div>';
  var g2=outcomeCounts(null);
  h+='<div class="card"><h3>Perché piangeva</h3>';
  if(!g2.n)h+='<p class="hint">Nessun pianto spiegato ancora. Registra il pianto, poi fai la cosa giusta: la registrazione dell\'azione lo spiega.</p>';
  else{
    var mx=0;CAUSES.forEach(function(c){mx=Math.max(mx,g2.c[c.id]);});
    CAUSES.forEach(function(c){h+='<div class="obar" style="--hc:'+c.c+'"><div class="l">'+c.label+'</div><div class="b"><i style="width:'+(mx?Math.round(g2.c[c.id]/mx*100):0)+'%"></i></div><div class="n">'+g2.c[c.id]+'</div></div>';});
    var solo=S.events.filter(function(e){return e.k==='cry'&&e.label==='solo';}).length;if(solo)h+='<p class="hint">Più '+solo+' passati da soli.</p>';
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
  }
  h+='</div>';
  $('#stats').innerHTML=h;
}

/* ---------- settings, mic, storage ---------- */
function fillSettings(){$('#sName').value=S.settings.name||'';$('#sBirth').value=S.settings.birth||'';renderMicInfo();renderAccount();}
function renderAccount(){
  var el=$('#account');if(!el)return;
  if(!window.AlanSync){el.innerHTML='<p class="hint">Sync non caricato.</p>';return;}
  var st=AlanSync.status(),h='';
  if(!st.available){el.innerHTML='<p class="hint">Sync non configurato: compila js/config.js con URL e chiave anon del progetto Supabase (vedi README).</p>';return;}
  if(!st.signedIn){
    h+='<p class="hint">Accedi con l\'email e la password che avete impostato su Supabase. Si fa una volta sola per telefono.</p>';
    h+='<label class="f" for="accEmail">Email</label><input class="f" id="accEmail" type="email" inputmode="email" autocomplete="username" value="'+esc(lsGet('alan.email')||'')+'">';
    h+='<label class="f" for="accPass">Password</label><input class="f" id="accPass" type="password" autocomplete="current-password"><div class="spacer"></div>';
    h+='<button class="btn" onclick="A.login()">Accedi</button>';
  }else{
    h+='<div class="kv"><div>Account</div><div>'+esc(st.name||'')+' <span class="m">'+esc(st.email||'')+'</span></div><div>Famiglia</div><div>'+(st.family?'collegata':'non ancora')+'</div><div>Ultimo sync</div><div>'+(st.lastSync?fmtTime(st.lastSync):'—')+'</div></div>';
    if(!st.family)h+='<p class="hint">Questo account non è ancora in una famiglia: esegui il blocco SQL finale di supabase/schema.sql e tocca "Sincronizza adesso".</p>';
    h+='<div class="spacer"></div><button class="btn ghost" onclick="A.syncNow()">Sincronizza adesso</button><div class="spacer"></div><button class="btn ghost" onclick="A.signOut()">Esci</button>';
  }
  el.innerHTML=h;
}
A.login=function(){var em=($('#accEmail').value||'').trim(),pw=$('#accPass').value||'';if(!em||!pw){toast('Servono email e password');return;}AlanSync.signIn(em,pw).then(function(r){if(r&&r.error)toast('Accesso rifiutato: '+r.error.message);else{lsSet('alan.email',em);toast('Accesso fatto');setTimeout(renderAccount,800);}});};
A.syncNow=function(){AlanSync.pullAll().then(function(){toast('Sincronizzato');renderAccount();});};
A.signOut=function(){AlanSync.signOut().then(function(){toast('Uscito');renderAccount();});};
function renderMicInfo(){
  var el=$('#micInfo'),parts=[];
  parts.push(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia?'Microfono: disponibile nel browser (il permesso viene chiesto al primo pianto).':'Microfono: non esposto da questo browser.');
  parts.push(window.MediaRecorder?'Registrazione audio: supportata.':'Registrazione audio: non supportata, salvo solo l\'impronta.');
  parts.push(db?'Archivio: IndexedDB.':'Archivio: memoria del browser (senza audio).');
  var cries=S.events.filter(function(e){return e.k==='cry';}).length,withA=S.events.filter(function(e){return e.k==='cry'&&e.audio;}).length;
  parts.push('Pianti: '+cries+', con audio: '+withA+'.');
  var lr=null;try{lr=JSON.parse(lsGet('alan.lastRec')||'null');}catch(e){}
  if(lr)parts.push('Ultima registrazione: '+(lr.bytes?Math.round(lr.bytes/1024)+' KB, '+esc(lr.mime||'?'):'nessun audio')+', '+lr.frames+' campioni'+(lr.err?', errore: '+esc(lr.err):'')+'.');
  var lu=lsGet('alan.lastUpload');if(lu)parts.push('Ultimo errore di upload: '+esc(lu)+'.');
  parts.push('Formati registrabili: '+(window.MediaRecorder&&MediaRecorder.isTypeSupported?['audio/mp4','audio/webm','audio/ogg'].filter(function(m){return MediaRecorder.isTypeSupported(m);}).join(', ')||'nessuno':'n/d')+'.');
  el.innerHTML=parts.join('<br>');
  if(navigator.storage&&navigator.storage.estimate)navigator.storage.estimate().then(function(q){if(q&&q.usage!=null)el.innerHTML+='<br>Spazio usato: '+Math.round(q.usage/1048576*10)/10+' MB'+(q.quota?' su '+Math.round(q.quota/1048576)+' MB':'')+'.';});
}
A.testMic=function(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Microfono non esposto da questo browser');return;}
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){s.getTracks().forEach(function(t){t.stop();});toast('Microfono ok');}).catch(function(e){toast(e&&e.name==='NotAllowedError'?'Microfono bloccato in questa finestra':'Microfono non disponibile: '+(e&&e.name));});
};
A.saveSettings=function(){S.settings.name=$('#sName').value.trim()||'Alan';S.settings.birth=$('#sBirth').value||S.settings.birth;save();toast('Impostazioni salvate');renderHome();};
A.resetAll=function(){
  if(!window.confirm('Cancellare diario, pianti e audio su questo telefono? Non si può annullare.'))return;
  S.events.filter(function(e){return e.k==='cry';}).forEach(function(e){idbDel('audio',e.id);});
  S.events=[];S.openCry=null;save();try{localStorage.removeItem(LSV1);localStorage.removeItem('alan.sync.since');}catch(e){}renderHome();toast('Dati cancellati da questo telefono');
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
      if(o.v===1){var n={id:e.id,t:e.t,who:e.who||''};if(e.k==='feed'){n.k='feed';n.prep=e.ml;n.ml=e.ml;}else if(e.k==='diaper'){n.k='diaper';n.pipi=(e.kind!=='cacca')?'tanta':'no';n.cacca=(e.kind==='cacca'||e.kind==='entrambi')?'tanta':'no';}else if(e.k==='sleep'||e.k==='wake'){n.k=e.k;}else if(e.k==='burp'){n.k='other';n.what='ruttino';}else if(e.k==='cry'){n.k='cry';n.label=e.out==='coccole'?'contatto':(e.out||null);n.bins=e.bins;n.ctx=e.ctx;n.dur=e.end?(e.end-e.t)/1000:null;}else return;e=n;}
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

/* ---------- nav & init ---------- */
function showView(v){
  var tabs=document.querySelectorAll('nav.tabs button');for(var i=0;i<tabs.length;i++)tabs[i].classList.toggle('on',tabs[i].getAttribute('data-v')===v);
  ['oggi','pianti','pattern','altro'].forEach(function(x){$('#v-'+x).classList.toggle('on',x===v);});
  if(v==='pianti')renderCries();if(v==='pattern')renderStats();if(v==='altro')fillSettings();
  window.scrollTo(0,0);
}
load().then(function(){
  document.querySelectorAll('nav.tabs button').forEach(function(b){b.addEventListener('click',function(){showView(b.getAttribute('data-v'));});});
  renderHome();
  if(window.AlanSync)AlanSync.init({onEvents:mergeRemote,onStatus:function(){var st=AlanSync.status();if(st.name&&st.name!==who){who=st.name;lsSet(WHOKEY,who);}renderHeader();renderAccount();uploadPending();}}).then(function(){var st=AlanSync.status();if(st.name){who=st.name;lsSet(WHOKEY,who);}renderHeader();renderAccount();});
  setInterval(function(){if(!flow)renderStatus();},30000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&!flow)renderHome();});
});
})();
