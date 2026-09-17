// Estensione timer: cronometro della pappa al biberon da timestamp, ripartenza dopo la chiusura, voce con durata, statistiche. node tests/timer.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4;
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
(async()=>{
  const app=await boot({ext:['timer']});const {A,S,T,txt}=app;
  const X=window.AlanExt,TM=X.timer,API=X.api;
  const home=()=>String(app.els['#home-timer']._h);
  assert.ok(TM&&typeof TM.start==='function','namespace AlanExt.timer');
  assert.strictEqual(TM.switchSide,undefined,'niente lati: solo biberon');assert.strictEqual(TM.ask,undefined);
  // --- Home senza cronometro: un solo pulsante di avvio
  T('renderHome()');
  assert.ok(/Cronometro/.test(home())&&/Inizia la pappa/.test(home()),home());assert.ok(!/Seno|Tiralatte/.test(home()));
  assert.strictEqual(TM.get(),null);
  // --- avvio: stato in localStorage, riquadro vivo con Fine e Annulla
  TM.start();let t=TM.get();assert.ok(t&&t.start>0);assert.strictEqual(JSON.parse(app.store['alan.timer']).start,t.start);
  assert.ok(/Pappa in corso/.test(home())&&/id="tmClock"/.test(home())&&/>Fine</.test(home())&&/Annulla senza salvare/.test(home()));
  const s0=t.start;TM.start();assert.strictEqual(TM.get().start,s0,'un secondo avvio non sovrascrive');
  // --- tempi dai timestamp (stato iniettato come dopo una riapertura): 12 min
  let now=Date.now(),start=now-12*MIN;
  API.lsSet('alan.timer',JSON.stringify({start:start}));
  t=TM.get();near(TM.elapsed(t),720,2,'trascorso');
  assert.strictEqual(TM.fmtClock(720),'12:00');assert.strictEqual(TM.fmtClock(5),'00:05');assert.strictEqual(TM.fmtClock(3725),'1:02:05');
  T('renderHome()');assert.ok(/12:0/.test(home()),'riapertura: riparte dal tempo giusto '+home());
  document.querySelector('#tmClock');app.els['#tmClock'].textContent='';TM.tick();assert.ok(/^12:0/.test(app.els['#tmClock'].textContent),'tick aggiorna solo il testo');
  // --- annulla: niente voce
  const nEv=S.events.length;TM.cancel();assert.strictEqual(TM.get(),null);assert.strictEqual(S.events.length,nEv);
  T('renderHome()');assert.ok(/Inizia la pappa/.test(home()));
  // --- fine: apre il percorso Pappa con "quando" dall'inizio; la voce riceve durata e sorgente; spiega un pianto aperto
  TM.start();t=TM.get();start=Date.now()-10*MIN;t.start=start;API.lsSet('alan.timer',JSON.stringify(t));
  S.events.push({id:'c1',k:'cry',t:start-2*MIN,who:'Fabio',label:null,ctx:{},bins:{f:-1,a:-1,h:1},feat:null,audio:false});S.openCry='c1';
  TM.stop();
  const fl=T('flow');assert.ok(fl&&fl.type==='feed','percorso Pappa aperto');assert.strictEqual(fl.data.src,'biberon');near(fl.data.dur,600,2,'durata precompilata');assert.strictEqual(fl.off,10,'quando = 10 min fa');
  assert.ok(/Quanto hai preparato/.test(txt('#screenInner')));assert.ok(TM.pending(),'in attesa della voce');assert.strictEqual(TM.get(),null,'cronometro chiuso');
  A.pick('prep',120);A.finish(100);
  await new Promise(r=>setTimeout(r,250));
  let f=S.events.filter(e=>e.k==='feed'&&e.ml===100).pop();assert.ok(f);near(f.t,start,1000,'t = inizio della pappa');
  assert.strictEqual(f.src,'biberon');near(f.dur,600,2,'durata sulla voce');assert.strictEqual(TM.pending(),null,'niente più in attesa');
  assert.strictEqual(S.events.find(e=>e.id==='c1').label,'fame','la pappa spiega il pianto aperto');
  assert.ok(API.fedFeed(f));assert.ok(!API.fedFeed({k:'feed',ml:0,dur:900}),'senza ml non vale come pappa');
  assert.ok(/Pappa 100 ml su 120/.test(txt('#diary')),txt('#diary'));
  // --- in attesa scaduta (oltre 6 h) si dimentica; una voce già con durata non si sovrascrive
  API.lsSet('alan.timer.pending',JSON.stringify({start:Date.now()-7*36e5,dur:300,at:new Date().toISOString()}));TM.adopt();assert.strictEqual(TM.pending(),null);
  // --- Pattern: solo con pappe cronometrate; media, corta/lunga, ml al minuto
  T('renderStats()');let st=txt('#stats');assert.ok(/Quanto dura la pappa/.test(st),st);assert.ok(/In media 10 min su 1 pappa cronometrata/.test(st),st);
  S.events.push({id:'b1',k:'feed',t:now-8*36e5,who:'Fabio',prep:120,ml:120,src:'biberon',dur:1200});
  T('renderStats()');st=txt('#stats');assert.ok(/su 2 pappe cronometrate/.test(st)&&/10 min \/ 20 min/.test(st),st);assert.ok(/Ritmo (8|8\.\d|8,\d) ml al minuto/.test(st.replace(',','.')),st);
  S.events.splice(0);T('renderStats()');assert.ok(!/Quanto dura la pappa/.test(txt('#stats')),'senza dati niente riquadro');
  console.log('timer ok');
})().catch(e=>{console.error(e);process.exit(1);});
