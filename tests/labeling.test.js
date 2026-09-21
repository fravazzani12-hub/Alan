// Etichettatura automatica del pianto (SPEC §3): finestra [−5 min, +45 min], prima azione, wake e pappa rifiutata non etichettano.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4;
(async()=>{
  const app=await boot();const {A,S,T}=app;
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
  // --- banner del pianto aperto: ipotesi e cosa provare, con i percorsi che lo spiegano registrando
  S.openCry=null;
  S.events.push({id:'fb',k:'feed',t:Date.now()-4*36e5,who:'Fabio',prep:120,ml:100});
  const bc=cry(Date.now()-3*MIN);
  T('renderStatus()');let bn=String(app.els['#openCryBanner']._h);
  assert.ok(/class="banner"/.test(bn)&&/Pianto delle /.test(bn),bn.slice(0,200));
  assert.ok(/probabilmente [a-zà-ù \/]+ \(\d+%\) · prova:/.test(bn),'ipotesi con la percentuale: '+bn.match(/<span>[^<]*/));
  assert.ok(bn.indexOf("A.flow('")>=0&&bn.indexOf("','"+bc.id+"')")>=0,'i pulsanti aprono i percorsi legati a questo pianto');
  assert.ok(/>Da solo</.test(bn),'resta "Da solo"');
  bc.auto=true;T('renderStatus()');assert.ok(/sentito dall'app/.test(String(app.els['#openCryBanner']._h)),'i pianti automatici si riconoscono');
  bc.label='fame';T('renderStatus()');assert.strictEqual(String(app.els['#openCryBanner']._h),'','spiegato: il banner sparisce');
  S.events.pop();S.openCry=null;
  // --- associare a mano un'azione registrata dopo: è l'ordine vero (prima si consola, poi si scrive)
  S.events.length=0;S.openCry=null;
  const t0=Date.now();
  const cl=cry(t0-40*MIN);
  const fd={id:'ef',k:'feed',t:t0-20*MIN,who:'Fabio',prep:120,ml:100};
  const dp={id:'ed',k:'diaper',t:t0-10*MIN,who:'Ilaria',pipi:'normale',cacca:'no'};
  const old={id:'eo',k:'feed',t:t0-3*36e5,who:'Fabio',prep:120,ml:90};
  const far={id:'ex',k:'feed',t:t0+2*36e5,who:'Fabio',prep:120,ml:90};
  S.events.push(fd,dp,old,far);
  const cand=T('explainers')(cl);
  assert.deepStrictEqual(cand.map(e=>e.id),['ef','ed'],'solo le azioni da 5 min prima a 90 dopo, in ordine');
  A.cryDetail(cl.id);let sc=String(app.els['#screenInner']._h);
  assert.ok(/Cosa avete fatto dopo/.test(sc)&&/anche a distanza di ore/.test(sc),'la schermata invita ad associare quando si vuole');
  assert.ok(sc.indexOf("A.explainWith('"+cl.id+"','ef')")>=0&&sc.indexOf("A.explainWith('"+cl.id+"','ed')")>=0,'una riga per azione');
  assert.ok(/Pappa/.test(sc)&&/Fame/.test(sc),'accanto all\'azione la causa che assegnerebbe');
  A.explainWith(cl.id,'ed');
  assert.strictEqual(cl.label,'cambio','la causa viene dall\'azione scelta');
  assert.strictEqual(cl.by,'ed','resta scritto con quale azione');
  assert.strictEqual(S.openCry,null,'non resta in attesa');
  assert.ok(/^Pianto spiegato: pannolino \(cambio delle \d\d:\d\d\)$/.test(app.els['#toast'].textContent),app.els['#toast'].textContent);
  assert.ok(/class="row tap on"/.test(String(app.els['#screenInner']._h)),'la scelta resta segnata');
  A.explainWith(cl.id,'ef');assert.strictEqual(cl.label,'fame','si può cambiare idea');assert.strictEqual(cl.by,'ef');
  A.home();
  // --- "Dopo": il banner si toglie di mezzo ma il pianto resta e l'azione successiva lo spiega lo stesso
  S.events.length=0;const c2=cry(Date.now()-10*MIN);
  T('renderStatus()');assert.ok(/class="banner"/.test(String(app.els['#openCryBanner']._h)));
  A.laterCry();
  assert.strictEqual(String(app.els['#openCryBanner']._h),'','banner nascosto');
  assert.strictEqual(S.openCry,c2.id,'ma il pianto resta in attesa');
  assert.ok(+app.store['alan.cry.later']>Date.now()+36e5,'nascosto per un paio d\'ore');
  A.flow('feed');A.pick('prep',120);A.finish(100);
  assert.strictEqual(c2.label,'fame','registrando dopo, si spiega da solo');
  // --- più pianti da spiegare: il banner lo dice e porta ai Pianti
  S.events.length=0;app.store['alan.cry.later']='0';
  const p1=cry(Date.now()-2*36e5),p2=cry(Date.now()-36e5),p3=cry(Date.now()-20*MIN);
  S.openCry=p3.id;
  assert.deepStrictEqual(T('pendingCries')().map(e=>e.id),[p3.id,p2.id,p1.id],'dal più recente, ultime 24 ore');
  T('renderStatus()');const bn2=String(app.els['#openCryBanner']._h);
  assert.ok(/3 pianti da spiegare · falli con calma/.test(bn2)&&/A.goCries\(\)/.test(bn2),bn2.slice(-260));
  S.events.length=0;S.openCry=null;
  // azione antecedente di più di 5 min (quando = 15 min fa) → nessuna etichetta
  c=cry(Date.now());A.flow('feed');A.setOff(15);A.pick('prep',90);A.finish(90);assert.strictEqual(c.label,null);
  // azione 15 min fa con pianto di 12 min fa → dentro [−5, +45] → etichetta
  c=cry(Date.now()-12*MIN);A.flow('feed');A.setOff(15);A.pick('prep',90);A.finish(90);assert.strictEqual(c.label,'fame');
  // link esplicito dalla schermata del pianto batte openCry
  const a=cry(Date.now()-4*MIN),b=cry(Date.now()-2*MIN);S.openCry=b.id;
  A.flow('diaper',a.id);A.pick('pipi','no');A.finish('normale');assert.strictEqual(a.label,'cambio');assert.strictEqual(b.label,null);assert.strictEqual(S.openCry,b.id);
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
