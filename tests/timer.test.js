// Estensione timer: cronometro seno/biberon/tiralatte da timestamp, cambio lato, voci salvate, statistiche. node tests/timer.test.js
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
  // --- Home senza cronometro: la riga di avvio con tre pulsanti
  T('renderHome()');
  assert.ok(/Cronometro/.test(home())&&/>Seno</.test(home())&&/>Biberon</.test(home())&&/>Tiralatte</.test(home()),home());
  assert.strictEqual(TM.get(),null);
  // --- Seno chiede subito il lato, con due tap-target grandi e Annulla
  TM.ask();assert.ok(/Quale seno\?/.test(home())&&/Sinistro/.test(home())&&/Destro/.test(home())&&/Annulla/.test(home()));
  TM.unask();assert.ok(/Cronometro/.test(home()));
  TM.ask();TM.start('seno','sinistro');
  let t=TM.get();assert.strictEqual(t.kind,'seno');assert.strictEqual(t.side,'sinistro');assert.strictEqual(t.sides.length,1);assert.strictEqual(t.sides[0].side,'sinistro');assert.strictEqual(t.sides[0].end,null);
  assert.ok(/Seno sinistro/.test(home())&&/id="tmClock"/.test(home())&&/Cambia lato/.test(home())&&/>Fine</.test(home()));
  assert.strictEqual(JSON.parse(app.store['alan.timer']).kind,'seno','stato in localStorage alan.timer');
  // un secondo avvio non sovrascrive quello in corso
  TM.start('biberon');assert.strictEqual(TM.get().kind,'seno');
  // --- tempi calcolati dai timestamp (stato iniettato come dopo una riapertura dell'app): 7 min sinistro + 5 min destro
  let now=Date.now(),start=now-12*MIN;
  API.lsSet('alan.timer',JSON.stringify({kind:'seno',side:'destro',start:start,sides:[{side:'sinistro',start:start,end:start+7*MIN},{side:'destro',start:start+7*MIN,end:null}]}));
  t=TM.get();near(TM.elapsed(t),720,2,'trascorso');
  let tot=TM.totals(t);near(tot.sinistro,420,1,'sinistro');near(tot.destro,300,2,'destro');
  assert.strictEqual(TM.fmtClock(720),'12:00');assert.strictEqual(TM.fmtClock(5),'00:05');assert.strictEqual(TM.fmtClock(3725),'1:02:05');
  T('renderHome()');assert.ok(/Seno destro/.test(home())&&/12:0/.test(home())&&/sinistro 07:00/.test(home()),'riapertura: riparte dal tempo giusto '+home());
  // il tick aggiorna solo i testi via id
  document.querySelector('#tmClock');document.querySelector('#tmSides'); // nello stub gli elementi nascono alla prima querySelector
  app.els['#tmClock'].textContent='';TM.tick();assert.ok(/^12:0/.test(app.els['#tmClock'].textContent),'tick: '+app.els['#tmClock'].textContent);
  assert.ok(/sinistro 07:00 · destro 05:0/.test(app.els['#tmSides'].textContent));
  // --- cambia lato: chiude il segmento aperto e ne apre uno sull'altro lato
  TM.switchSide();t=TM.get();assert.strictEqual(t.side,'sinistro');assert.strictEqual(t.sides.length,3);assert.ok(t.sides[1].end>0);assert.strictEqual(t.sides[2].side,'sinistro');assert.strictEqual(t.sides[2].end,null);
  assert.ok(/Seno sinistro/.test(home())&&/passa a destro/.test(home()));
  // --- fine: feed seno con t = inizio, durate per lato, spiega un pianto aperto (fedFeed vero da 60 s)
  S.events.push({id:'c1',k:'cry',t:start-2*MIN,who:'Fabio',label:null,ctx:{},bins:{f:-1,a:-1,h:1},feat:null,audio:false});S.openCry='c1';
  TM.stop();
  assert.strictEqual(TM.get(),null,'cronometro chiuso');assert.strictEqual(T('flow'),null,'percorso chiuso');
  let f=S.events.filter(e=>e.k==='feed'&&e.src==='seno');assert.strictEqual(f.length,1);f=f[0];
  near(f.dur,720,2,'durata totale');assert.strictEqual(f.side,'entrambi');assert.ok(f.id&&f.who&&f._updated);
  near(f.t,start,1000,'t = inizio');
  assert.strictEqual(f.sides.length,3);assert.strictEqual(f.sides[0].side,'sinistro');near(f.sides[0].dur,420,1,'segmento 1');assert.strictEqual(f.sides[1].side,'destro');near(f.sides[1].dur,300,2,'segmento 2');
  assert.ok(API.fedFeed(f),'seno ≥ 60 s vale come pappa');
  assert.strictEqual(S.events.find(e=>e.id==='c1').label,'fame','il pianto aperto è spiegato dalla poppata');assert.strictEqual(S.openCry,null);
  assert.ok(/Seno: 12 min · sinistro 7 min, destro 5 min/.test(app.els['#toast'].textContent),app.els['#toast'].textContent);
  assert.ok(/Seno 12 min · entrambi/.test(txt('#diary')),txt('#diary'));
  assert.ok(/Ultima pappa/.test(txt('#status'))&&/12 min fa/.test(txt('#status')),'la Home vede la poppata: '+txt('#status'));
  assert.ok(/Cronometro/.test(home()),'dopo la fine torna la riga di avvio');
  // un solo lato → side = quel lato; sotto i 60 s non vale come pappa ma si salva
  API.lsSet('alan.timer',JSON.stringify({kind:'seno',side:'destro',start:Date.now()-40e3,sides:[{side:'destro',start:Date.now()-40e3,end:null}]}));
  TM.stop();f=S.events.filter(e=>e.k==='feed'&&e.src==='seno').pop();assert.strictEqual(f.side,'destro');near(f.dur,40,2,'40 s');assert.ok(!API.fedFeed(f));
  assert.strictEqual(TM.lastSenoSide(),'destro');TM.ask();assert.ok(/Destro<small>l'ultima volta/.test(home()),home());TM.unask();
  // --- annulla senza salvare
  TM.start('tiralatte');assert.ok(TM.get());const nEv=S.events.length;TM.cancel();assert.strictEqual(TM.get(),null);assert.strictEqual(S.events.length,nEv);
  // --- biberon: Fine apre il percorso Pappa con "quando" dall'inizio; la voce riceve durata e sorgente
  TM.start('biberon');t=TM.get();assert.strictEqual(t.kind,'biberon');assert.ok(/Biberon/.test(home())&&!/Cambia lato/.test(home()));
  start=Date.now()-10*MIN;t.start=start;API.lsSet('alan.timer',JSON.stringify(t));
  TM.stop();
  const fl=T('flow');assert.ok(fl&&fl.type==='feed','percorso Pappa aperto');assert.strictEqual(fl.data.src,'biberon');near(fl.data.dur,600,2,'durata precompilata');assert.strictEqual(fl.off,10,'quando = 10 min fa');
  assert.ok(/Quanto hai preparato/.test(txt('#screenInner')));assert.ok(TM.pending(),'in attesa della voce');
  A.pick('prep',120);A.finish(100);
  await new Promise(r=>setTimeout(r,250));
  f=S.events.filter(e=>e.k==='feed'&&e.ml===100).pop();assert.ok(f);near(f.t,start,1000,'t = inizio del biberon');
  assert.strictEqual(f.src,'biberon');near(f.dur,600,2,'durata sulla voce');assert.strictEqual(TM.pending(),null,'niente più in attesa');
  assert.strictEqual(TM.get(),null);
  // --- tiralatte: percorso pump con lato e stepper 0–300 a passi di 10, t = inizio, durata
  start=Date.now()-15*MIN;API.lsSet('alan.timer',JSON.stringify({kind:'tiralatte',side:null,start:start,sides:[]}));
  T('renderHome()');assert.ok(/Tiralatte/.test(home())&&/15:0/.test(home()));
  TM.stop();
  assert.strictEqual(T('flow').type,'pump');assert.ok(/Quanto hai tirato\?/.test(txt('#screenInner'))&&/Cronometro: 15 min/.test(txt('#screenInner')));
  assert.strictEqual(T('flow').data.ml,60,'tipico senza storia = 60');
  TM.step(10);TM.step(10);assert.strictEqual(T('flow').data.ml,80);assert.ok(/Salva 80 ml/.test(txt('#screenInner')));
  for(let i=0;i<40;i++)TM.step(10);assert.strictEqual(T('flow').data.ml,300,'tetto 300');for(let i=0;i<40;i++)TM.step(-10);assert.strictEqual(T('flow').data.ml,0,'pavimento 0');
  TM.step(10);TM.step(10);TM.step(10);TM.step(10);TM.step(10);TM.step(10);TM.step(10);TM.step(10);
  TM.side('sinistro');assert.strictEqual(T('flow').data.side,'sinistro');
  A.finish(1);
  let p=S.events.filter(e=>e.k==='pump');assert.strictEqual(p.length,1);p=p[0];
  assert.strictEqual(p.ml,80);near(p.dur,900,2,'durata');assert.strictEqual(p.side,'sinistro');near(p.t,start,1000,'t = inizio');assert.ok(p.id&&p.who);
  assert.strictEqual(app.els['#toast'].textContent,'Tiralatte: 80 ml in 15 min');
  assert.deepStrictEqual(T('describe')(p,null),['Tiralatte','<span class="detail">80 ml · 15 min · sinistro</span>']);
  assert.ok(/Tiralatte 80 ml · 15 min · sinistro/.test(txt('#diary')),txt('#diary'));
  // tap diretto su un valore rapido: salva subito; il tipico ora è 80
  A.flow('pump',null,{side:'entrambi',ml:TM.typicalPump()});assert.strictEqual(T('flow').data.ml,80);assert.ok(/Quando/.test(txt('#screenInner')),'senza cronometro chiede il quando');
  TM.pick(100);p=S.events.filter(e=>e.k==='pump').pop();assert.strictEqual(p.ml,100);assert.strictEqual(p.dur,null);assert.strictEqual(p.side,'entrambi');
  assert.deepStrictEqual(T('describe')(p,null),['Tiralatte','<span class="detail">100 ml</span>']);
  // --- Pattern: senza dati niente riquadro; con dati minuti al giorno, media, ripartizione, tiralatte
  const keep=S.events.splice(0);
  assert.strictEqual(TM.stats(),'');
  T('renderStats()');assert.ok(!/Allattamento/.test(txt('#stats')));
  now=Date.now();
  S.events.push({id:'s1',k:'feed',t:now-30*MIN,who:'Ilaria',src:'seno',dur:600,side:'entrambi',sides:[{side:'sinistro',dur:360},{side:'destro',dur:240}]});
  S.events.push({id:'s2',k:'feed',t:now-3*36e5,who:'Ilaria',src:'seno',dur:1200,side:'sinistro',sides:[{side:'sinistro',dur:1200}]});
  S.events.push({id:'s3',k:'feed',t:now-2*864e5,who:'Ilaria',src:'seno',dur:900,side:'destro'});
  S.events.push({id:'s0',k:'feed',t:now-9*864e5,who:'Ilaria',src:'seno',dur:3000,side:'destro'});
  S.events.push({id:'p1',k:'pump',t:now-5*36e5,who:'Ilaria',ml:80,dur:900,side:'entrambi'},{id:'p2',k:'pump',t:now-3*864e5,who:'Ilaria',ml:120,dur:1200,side:'entrambi'});
  S.events.push({id:'b1',k:'feed',t:now-8*36e5,who:'Fabio',prep:120,ml:100,src:'biberon',dur:720});
  T('renderStats()');const st=txt('#stats');
  assert.ok(/Allattamento/.test(st),st);
  assert.ok(/Poppate al seno 3 in 7 giorni/.test(st),st);
  assert.ok(/Per poppata 15 min/.test(st),'media (600+1200+900)/3 = 900 s: '+st);
  // sinistro 360+1200 = 1560, destro 240+900 = 1140 → 58% / 42%
  assert.ok(/Sinistro \/ destro 58% \/ 42%/.test(st),st);
  assert.ok(/Tiralatte 200 ml in 2 sessioni, 18 min l'una/.test(st),st);
  assert.ok(/Biberon al cronometro 12 min per pappa, su 1/.test(st),st);
  const h=TM.stats();assert.strictEqual((h.match(/class="tm-day"/g)||[]).length,7,'sette giorni');
  const todayMin=new Date(now).getHours()>=3?30:null; // s1 e s2 oggi se non è notte fonda
  if(todayMin!=null)assert.ok(new RegExp('Oggi.*?'+todayMin+' min').test(h),'oggi 10+20 min: '+h);
  assert.ok(/width:100%/.test(h),'il giorno più lungo riempie la barra');
  S.events.push(...keep);
  console.log('timer ok');
})().catch(e=>{console.error(e);process.exit(1);});
