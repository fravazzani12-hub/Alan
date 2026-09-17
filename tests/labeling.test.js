// Etichettatura automatica del pianto (SPEC §3): finestra [−5 min, +45 min], prima azione, wake e pappa rifiutata non etichettano.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4;
(async()=>{
  const app=await boot();const {A,S}=app;
  const mergeRemote=app.T('mergeRemote');
  let n=0;
  function cry(t){const e={id:'cry'+(n++),k:'cry',t,dur:8,who:'Fabio',label:null,ctx:{},bins:{f:-1,a:-1,h:1},feat:null,audio:false};S.events.push(e);S.openCry=e.id;return e;}
  // pappa entro la finestra → fame
  let c=cry(Date.now()-3*MIN);A.flow('feed');A.pick('prep',120);A.finish(120);
  assert.strictEqual(c.label,'fame');assert.strictEqual(S.openCry,null);
  assert.ok(/era fame/.test(app.els['#toast'].textContent),'toast cita il pianto');
  // pappa rifiutata (0 ml) non etichetta e il pianto resta aperto
  c=cry(Date.now()-2*MIN);A.flow('feed');A.pick('prep',120);A.finish(0);
  assert.strictEqual(c.label,null);assert.strictEqual(S.openCry,c.id);
  // sveglio non etichetta; nanna sì
  A.flow('sleep');A.finish('wake');assert.strictEqual(c.label,null);
  A.flow('sleep');A.finish('sleep');assert.strictEqual(c.label,'sonno');
  // pannolino → cambio, ruttino → aria, coccole → contatto
  c=cry(Date.now()-MIN);A.flow('diaper');A.pick('pipi','poca');A.finish('tanta');assert.strictEqual(c.label,'cambio');
  c=cry(Date.now()-MIN);A.flow('other');A.finish('ruttino');assert.strictEqual(c.label,'aria');
  c=cry(Date.now()-MIN);A.flow('other');A.finish('coccole');assert.strictEqual(c.label,'contatto');
  // fuori finestra: pianto di 50 min fa → nessuna etichetta
  c=cry(Date.now()-50*MIN);A.flow('feed');A.pick('prep',90);A.finish(90);assert.strictEqual(c.label,null);
  S.openCry=null;
  // azione antecedente di più di 5 min (quando = 15 min fa) → nessuna etichetta
  c=cry(Date.now());A.flow('feed');A.setOff(15);A.pick('prep',90);A.finish(90);assert.strictEqual(c.label,null);
  // azione 15 min fa con pianto di 12 min fa → dentro [−5, +45] → etichetta
  c=cry(Date.now()-12*MIN);A.flow('feed');A.setOff(15);A.pick('prep',90);A.finish(90);assert.strictEqual(c.label,'fame');
  // link esplicito dalla schermata del pianto batte openCry
  const a=cry(Date.now()-4*MIN),b=cry(Date.now()-2*MIN);S.openCry=b.id;
  A.flow('diaper',a.id);A.pick('pipi','no');A.finish('poca');assert.strictEqual(a.label,'cambio');assert.strictEqual(b.label,null);assert.strictEqual(S.openCry,b.id);
  // un pianto già spiegato non viene rietichettato
  A.flow('feed',a.id);A.pick('prep',90);A.finish(90);assert.strictEqual(a.label,'cambio');
  // azione che arriva dall'altro telefono etichetta il pianto aperto qui
  S.openCry=b.id;mergeRemote([{id:'rf1',k:'feed',t:Date.now(),who:'Ilaria',prep:120,ml:100,_updated:new Date().toISOString()}]);
  assert.strictEqual(b.label,'fame');assert.strictEqual(S.openCry,null);
  // pianto aperto che arriva dall'altro telefono resta aperto anche qui
  mergeRemote([{id:'rc1',k:'cry',t:Date.now()-60e3,who:'Ilaria',label:null,dur:5,_updated:new Date().toISOString()}]);
  assert.strictEqual(S.openCry,'rc1');
  mergeRemote([{id:'rc2',k:'cry',t:Date.now()-50*MIN,who:'Ilaria',label:null,dur:5,_updated:new Date().toISOString()}]);
  assert.strictEqual(S.openCry,'rc1','un pianto vecchio non sostituisce quello aperto');
  // etichetta a posteriori dal tab Pianti
  A.labelCry('rc1','solo');assert.strictEqual(S.events.find(e=>e.id==='rc1').label,'solo');assert.strictEqual(S.openCry,null);
  console.log('labeling ok');
})().catch(e=>{console.error(e);process.exit(1);});
