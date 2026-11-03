// Pappa: una schermata sola (quando + quanto), scala da 5 ml, rifiutata = 0 ml. node tests/feed.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5;
(async()=>{
  const app=await boot();const {A,S,txt}=app;
  const context=app.T('context'),describe=app.T('describe');
  const now=Date.now();
  S.events.push({id:'f1',k:'feed',t:now-3*H,who:'Fabio',ml:110});
  S.events.push({id:'f0',k:'feed',t:now-20*MIN,who:'Ilaria',ml:0});
  const c=context(now);
  assert.strictEqual(c.lastFeedT,now-3*H,'la pappa rifiutata non è l\'ultima pappa');
  assert.ok(Math.abs(c.sinceFeedH-3)<1e-6);assert.strictEqual(c.lastMl,110);
  assert.strictEqual(describe(S.events[1],null)[0],'Pappa');assert.ok(/rifiutata/.test(describe(S.events[1],null)[1]));
  // --- la schermata: quando, quantità usate, stepper, salva
  A.flow('feed');
  let sc=String(app.els['#screenInner']._h);
  assert.ok(/<div class="title">Pappa<\/div>/.test(sc));
  assert.ok(/Quando/.test(sc)&&/15 min fa/.test(sc)&&/altra ora/.test(sc),'la riga "quando" c\'è');
  assert.ok(!/Finita/.test(sc)&&!/Durata/.test(sc)&&!/preparato/i.test(sc),'niente preparato, durata o ora di fine: '+sc.slice(0,400));
  assert.ok(/Quanto ha bevuto\?/.test(sc));
  assert.ok(/A.stepMl\(-5\)/.test(sc)&&/A.stepMl\(5\)/.test(sc),'i ml si muovono di 5 in 5');
  assert.ok(/A.finish\(110\)/.test(sc),'la quantità di solito è a portata di tap: '+sc.match(/grid3[\s\S]{0,200}/));
  assert.ok(/Non ha bevuto niente/.test(sc));
  // lo stepper parte dal valore tipico e si muove di 5
  assert.ok(/class="val">110 ml</.test(sc),'stepper sul tipico');
  A.stepMl(5);A.stepMl(5);
  sc=String(app.els['#screenInner']._h);
  assert.ok(/class="val">120 ml</.test(sc)&&/Salva 120 ml/.test(sc));
  A.finish(120);
  let f=S.events.filter(e=>e.k==='feed').pop();
  assert.strictEqual(f.ml,120);assert.strictEqual(f.prep,undefined,'niente campo preparato');
  assert.strictEqual(f.dur,undefined,'niente durata');
  assert.strictEqual(app.els['#toast'].textContent,'Pappa: 120 ml');
  assert.ok(/Pappa 120 ml/.test(txt('#diary')));
  // --- "non ha bevuto niente" = 0 ml
  A.flow('feed');A.finish(0);
  f=S.events.filter(e=>e.k==='feed').pop();assert.strictEqual(f.ml,0);
  assert.strictEqual(app.els['#toast'].textContent,'Biberon rifiutato');
  assert.ok(/Pappa rifiutata/.test(txt('#diary')));
  // --- "quando": chip relativi e orario assoluto
  A.flow('feed');A.setOff(30);A.finish(100);
  f=S.events.filter(e=>e.k==='feed').pop();
  assert.ok(Math.abs(Date.now()-30*MIN-f.t)<3000,'trenta minuti fa');
  const atMs=app.T('atToMs'),d=new Date();d.setHours(13,20,0,0);const t1320=d.getTime();
  assert.strictEqual(atMs('13:20',t1320+2*H),t1320,'stesso giorno');
  assert.strictEqual(atMs('13:20',t1320-H),t1320-864e5,'nel futuro → ieri');
  A.flow('feed');A.setAt('13:20');
  assert.ok(/alle 13:20/.test(txt('#screenInner')));
  A.finish(95);
  f=S.events.filter(e=>e.k==='feed').pop();
  assert.strictEqual(new Date(f.t).getHours(),13);assert.strictEqual(new Date(f.t).getMinutes(),20);
  A.setAt('bad');  // fuori da un percorso non deve esplodere
  // --- il riquadro di stato e la riga sotto il pulsante Pappa
  app.T('renderStatus()');
  assert.ok(/Ultima pappa/.test(txt('#status')),txt('#status'));
  assert.ok(/di solito \d+ ml/.test(app.els['#qFeed'].textContent),app.els['#qFeed'].textContent);
  // ml tipico ignora le rifiutate
  assert.ok(app.T('typicalMl')()>0);
  // --- le quantità proposte sono le più usate, di 5 in 5
  const opts=app.T('mlOptions')();
  assert.ok(opts.length>=4&&opts.every(v=>v%5===0),'scala da 5: '+opts.join(','));
  assert.ok(opts[0]>=opts[opts.length-1],'dalla più grande');
  console.log('feed ok');
})().catch(e=>{console.error(e);process.exit(1);});
