// Pappa rifiutata (ml = 0): non conta come ultima pappa, non etichetta, compare come "rifiutata".
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5;
(async()=>{
  const app=await boot();const {A,S,txt}=app;
  const context=app.T('context'),describe=app.T('describe'),modelScores=app.T('modelScores'),snapshot=app.T('snapshot');
  const now=Date.now();
  S.events.push({id:'f1',k:'feed',t:now-3*H,who:'Fabio',prep:120,ml:110});
  S.events.push({id:'f0',k:'feed',t:now-20*MIN,who:'Ilaria',prep:120,ml:0});
  const c=context(now);
  assert.strictEqual(c.lastFeedT,now-3*H,'la pappa rifiutata non è l\'ultima pappa');
  assert.ok(Math.abs(c.sinceFeedH-3)<1e-6);assert.strictEqual(c.lastMl,110);
  assert.strictEqual(describe(S.events[1],null)[0],'Pappa');assert.ok(/rifiutata \(120 ml\)/.test(describe(S.events[1],null)[1]));
  // il modello vede 3 h dall'ultima vera pappa: fame alta
  const s=modelScores(snapshot(c));const best=Object.keys(s).reduce((a,b)=>s[a]>s[b]?a:b);assert.strictEqual(best,'fame');
  // dal percorso a tap: "Niente" salva ml 0, non etichetta il pianto aperto, toast "Biberon rifiutato"
  S.events.push({id:'c1',k:'cry',t:now-2*MIN,who:'Fabio',label:null,ctx:{},bins:{f:0,a:0,h:0},feat:null,audio:false});S.openCry='c1';
  A.flow('feed');A.pick('prep',120);
  assert.ok(/Niente rifiutato/.test(txt('#screenInner')));
  A.finish(0);
  const f=S.events.filter(e=>e.k==='feed').pop();assert.strictEqual(f.ml,0);assert.strictEqual(f.prep,120);
  assert.strictEqual(S.events.find(e=>e.id==='c1').label,null);assert.strictEqual(S.openCry,'c1');
  assert.strictEqual(app.els['#toast'].textContent,'Biberon rifiutato');
  assert.ok(/Pappa rifiutata \(120 ml\)/.test(txt('#diary')));
  // il riquadro di stato mostra ancora la pappa vera di 3 h fa
  assert.ok(/Ultima pappa 3 h fa 110 ml/.test(txt('#status')),txt('#status'));
  // ml tipico ignora le rifiutate
  assert.strictEqual(app.T('typicalMl')(),110);
  // dopo una pappa vera il pianto si spiega
  A.flow('feed');A.pick('prep',120);A.finish(60);
  assert.strictEqual(S.events.find(e=>e.id==='c1').label,'fame');
  // "altra ora": inizio 13:20 e fine 13:48 di oggi → t alle 13:20, dur 28 min; un orario nel futuro vale per ieri; senza fine niente durata
  const atMs=app.T('atToMs'),H2=36e5;
  const d=new Date();d.setHours(13,20,0,0);const t1320=d.getTime();
  assert.strictEqual(atMs('13:20',t1320+2*H2),t1320,'stesso giorno');assert.strictEqual(atMs('13:20',t1320-H2),t1320-864e5,'nel futuro → ieri');assert.strictEqual(atMs('13:20',t1320+3*MIN),t1320,'entro 5 min va bene');
  A.flow('feed');assert.ok(/altra ora/.test(txt('#screenInner')));A.setAt('13:20');assert.ok(/alle 13:20/.test(txt('#screenInner'))&&/Finita/.test(txt('#screenInner')));
  A.setEnd('13:48');assert.ok(/28 min/.test(txt('#screenInner')),txt('#screenInner'));
  A.pick('prep',120);A.finish(115);
  let fe=S.events.filter(e=>e.k==='feed').pop();assert.strictEqual(fe.ml,115);assert.strictEqual(fe.dur,28*60);assert.strictEqual(fe.src,'biberon');
  assert.strictEqual(new Date(fe.t).getHours(),13);assert.strictEqual(new Date(fe.t).getMinutes(),20);assert.ok(fe.t<=Date.now()+5*MIN);
  A.flow('feed');A.setAt('23:50');A.setEnd('00:10');assert.ok(/20 min/.test(txt('#screenInner')),'fine oltre la mezzanotte');A.setOff(15);assert.strictEqual(app.T('flow').at,null,'un chip normale annulla l\'orario');
  A.pick('prep',120);A.finish(100);fe=S.events.filter(e=>e.k==='feed').pop();assert.strictEqual(fe.dur,undefined);
  A.flow('diaper');A.setAt('bad');assert.strictEqual(app.T('flow').at,null);A.setAt('08:05');A.pick('pipi','si');A.finish('no');
  const dp=S.events.filter(e=>e.k==='diaper').pop();assert.strictEqual(new Date(dp.t).getMinutes(),5);assert.strictEqual(dp.dur,undefined,'la fine c\'è solo per la pappa');
  // i preparati includono 115 e 125
  A.flow('feed');assert.ok(/115 ml/.test(txt('#screenInner'))&&/125 ml/.test(txt('#screenInner')));A.home();
  console.log('feed ok');
})().catch(e=>{console.error(e);process.exit(1);});
