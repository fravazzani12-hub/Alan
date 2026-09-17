// Salute: curve OMS (LMS → percentile), grafico, misure, temperatura, medicine, visite (+ .ics, tappe), riepilogo della notte, rigurgito.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5;
(async()=>{
  const app=await boot();const {A,S,T,txt}=app;
  const pctOf=T('pctOf'),xOfZ=T('xOfZ'),lmsAt=T('lmsAt'),niceTicks=T('niceTicks'),growthChart=T('growthChart'),nightSummary=T('nightSummary'),icsFor=T('icsFor'),milestonesDue=T('milestonesDue'),nextAppt=T('nextAppt'),describe=T('describe');
  S.settings.birth='2026-08-20';
  // --- OMS: valori noti delle tabelle (maschi): mediana a 0 giorni 3,35 kg, a 365 giorni 9,65 kg, lunghezza 49,9 → 75,7 cm
  assert.ok(Math.abs(lmsAt('wfa',0)[1]-3.3464)<1e-6);assert.ok(Math.abs(lmsAt('wfa',364)[1]-9.646)<0.05,'mediana 12 mesi');
  assert.strictEqual(pctOf('wfa',0,3.3464),50);assert.strictEqual(pctOf('lhfa',0,49.8842),50);
  assert.ok(pctOf('wfa',30,4.5)>=50&&pctOf('wfa',30,4.5)<=56,'4,5 kg a 1 mese ≈ 53°');
  assert.ok(pctOf('wfa',30,3.4)<=5,'3,4 kg a 1 mese è basso');assert.ok(pctOf('wfa',30,5.7)>=95,'5,7 kg a 1 mese è alto');
  assert.strictEqual(pctOf('wfa',0,0),null,'valore nullo');assert.ok(lmsAt('wfa',5000),'oltre la tabella: ultimo valore');
  // interpolazione fra campioni settimanali: monotona
  assert.ok(lmsAt('wfa',3)[1]>lmsAt('wfa',0)[1]&&lmsAt('wfa',3)[1]<lmsAt('wfa',7)[1]);
  // percentile → valore → percentile chiude il cerchio
  for(const p of [3,15,50,85,97]){const v=xOfZ('wfa',60,T('ZP')[p]);assert.strictEqual(pctOf('wfa',60,v),p);}
  assert.deepStrictEqual(niceTicks(2.7,6.2,4),[3,4,5,6]);
  // --- grafico: senza misure ha bande e mediana, con misure ha i punti e l'etichetta dell'ultimo
  let svg=growthChart('w');assert.ok(/class="band b1"/.test(svg)&&/class="mid"/.test(svg)&&/mesi/.test(svg));assert.ok(!/class="pt/.test(svg));
  // --- percorso misure: peso con stepper, lunghezza saltata, cranio saltato, "ieri"
  A.flow('measure');assert.ok(/Peso\?/.test(txt('#screenInner')));
  A.hstep('w',100);A.hstep('w',-10);assert.strictEqual(app.T('flow').data.w,3590);
  A.hdate(T('isoDay')(Date.now()-864e5));A.hkeep('w');assert.ok(/Lunghezza\?/.test(txt('#screenInner')));A.hskip('l');A.hskip('hc');
  assert.ok(/Salvo peso 3,59 kg/.test(txt('#screenInner')));assert.ok(/percentile OMS/.test(txt('#screenInner')));
  A.finish(1);
  let m=S.events.filter(e=>e.k==='measure');assert.strictEqual(m.length,1);assert.strictEqual(m[0].w,3590);assert.strictEqual(m[0].l,undefined);
  assert.strictEqual(T('dayKey')(m[0].t),T('dayKey')(Date.now()-864e5),'data = ieri');assert.ok(/percentile/.test(app.els['#toast'].textContent));
  S.events.push({id:'m0',k:'measure',t:Date.now()-8*864e5,who:'Fabio',w:3300,l:50});
  svg=growthChart('w');assert.strictEqual((svg.match(/class="pt/g)||[]).length,2);
  assert.ok(/>4,0</.test(svg)&&/>6,0</.test(svg)&&!/>0,0</.test(svg),'asse del peso in kg attorno ai valori OMS (2–8 kg), non a zero');
  // la mediana a 0 mesi (3,35 kg) sta sotto il punto di Alan a 0 giorni (3,30 kg)? no: 3,30 < 3,35, quindi il punto è più in basso (y maggiore)
  const midY=+svg.match(/class="mid" d="M[\d.]+ ([\d.]+)/)[1],ptY=+svg.match(/class="pt" cx="[\d.]+" cy="([\d.]+)"/)[1];assert.ok(ptY>midY&&ptY-midY<12,'punto 3,30 kg appena sotto la mediana 3,35: '+midY+' vs '+ptY);assert.ok(/class="pt last"/.test(svg)&&/3,59 kg/.test(svg)&&/class="me"/.test(svg));
  assert.ok(/\+290 g in 7 giorni \(290 g a settimana\)/.test(T('growthHero')('w')),T('growthHero')('w'));
  assert.ok(/Ancora nessuna misura/.test(T('growthHero')('hc')));
  // --- temperatura: chip, stepper, avviso sotto i 3 mesi solo da 38
  A.flow('temp');A.htemp(37.5);assert.ok(!/Febbre/.test(txt('#screenInner')));A.htemp(38.2);assert.ok(/Febbre: temperatura rettale/.test(txt('#screenInner')));
  A.finish(38.2);const tt=S.events.filter(e=>e.k==='temp');assert.strictEqual(tt.length,1);assert.strictEqual(tt[0].c,38.2);assert.strictEqual(app.els['#toast'].textContent,'Temperatura 38,2 °C');
  assert.deepStrictEqual(describe(tt[0],null),['Temperatura','<span class="detail">38,2 °C</span>']);
  // --- medicine: vitamina D con un tap, "altro" con nome; riga in Home
  assert.strictEqual(app.T('everMed')('vitd'),false);
  T('renderHealthLine()');assert.strictEqual(app.els['#healthLine']._h,'','niente vitamina D finché non la usate');
  A.flow('med');A.hmed('vitd');let meds=S.events.filter(e=>e.k==='med');assert.strictEqual(meds.length,1);assert.strictEqual(meds[0].name,'Vitamina D');
  T('renderHealthLine()');assert.ok(/✓ Vitamina D/.test(app.els['#healthLine']._h));
  A.flow('med');A.hmed('altro');assert.ok(/Quale\?/.test(txt('#screenInner')));app.T('flow').data.name='Gocce';A.finish('altro');
  meds=S.events.filter(e=>e.k==='med');assert.strictEqual(meds[1].name,'Gocce');assert.strictEqual(meds[1].what,'altro');
  A.flow('med');A.hmed('altro');A.finish('altro');assert.strictEqual(S.events.filter(e=>e.k==='med').length,2,'senza nome non salva');
  // --- visite: percorso, prossima, .ics, fatta; il vaccino dei 3 mesi copre la tappa
  A.flow('appt');A.hset('kind','vaccino');app.T('flow').step=1;T('renderFlow()');assert.ok(/Vaccino/.test(txt('#screenInner')));
  app.T('flow').data.date='2026-11-20';app.T('flow').data.time='10:30';app.T('flow').data.place='ASL Nord';A.finish(1);
  const ap=S.events.filter(e=>e.k==='appt');assert.strictEqual(ap.length,1);assert.strictEqual(new Date(ap[0].t).getHours(),10);assert.strictEqual(ap[0].title,'Vaccino');assert.strictEqual(ap[0].done,false);
  assert.strictEqual(nextAppt().id,ap[0].id);
  const ics=icsFor(ap[0]);assert.ok(/BEGIN:VCALENDAR/.test(ics)&&/DTSTART:20261120T/.test(ics)&&/SUMMARY:Alan · Vaccino/.test(ics)&&/LOCATION:ASL Nord/.test(ics)&&/TRIGGER:-P1D/.test(ics));
  const due=milestonesDue();assert.ok(due.length>=1&&due.length<=4);assert.ok(!due.some(s=>s.kind==='vaccino'&&s.months===3),'tappa dei 3 mesi coperta dal vaccino programmato');
  assert.ok(due.some(s=>s.kind==='bilancio'),'bilancio suggerito');
  T('renderHealthLine()');assert.ok(!/Vaccino/.test(app.els['#healthLine']._h),'in Home solo se entro 14 giorni');
  A.apptDone(ap[0].id);assert.strictEqual(ap[0].done,true);assert.strictEqual(nextAppt(),null);
  T('renderDiary()');assert.ok(!/Visita/.test(txt('#diary')),'le visite non stanno nel diario');assert.ok(/Misure/.test(txt('#diary'))&&/Vitamina D/.test(txt('#diary')));
  // --- riepilogo della notte (22–7): conta pappe, cambi, pianti, sonno; niente nel pomeriggio
  const day=new Date();day.setHours(9,0,0,0);const now9=day.getTime(),n0=now9-2*H; // 07:00
  S.events.push({id:'n1',k:'feed',t:n0-6*H,who:'Ilaria',prep:120,ml:100},{id:'n2',k:'feed',t:n0-2*H,who:'Fabio',prep:120,ml:90},{id:'n3',k:'diaper',t:n0-2*H+5*MIN,who:'Fabio',pipi:'tanta',cacca:'no'},{id:'n4',k:'cry',t:n0-6*H-3*MIN,who:'Ilaria',label:'fame',dur:9},{id:'n5',k:'sleep',t:n0-8*H,who:'Ilaria'},{id:'n6',k:'wake',t:n0-6*H-5*MIN,who:'Ilaria'},{id:'n7',k:'sleep',t:n0-5.5*H,who:'Ilaria'},{id:'n8',k:'wake',t:n0-2.2*H,who:'Fabio'});
  const ns=nightSummary(now9);assert.ok(ns);assert.strictEqual(ns.feeds,2);assert.strictEqual(ns.ml,190);assert.strictEqual(ns.diapers,1);assert.strictEqual(ns.cries,1);assert.deepStrictEqual(ns.cryLabels,['fame']);
  assert.ok(Math.abs(ns.sleep-(1.9*H+3.3*H))<2*MIN,'sonno nella finestra: '+ns.sleep/H);assert.deepStrictEqual(ns.whos,{Ilaria:1,Fabio:2},'solo pappe, cambi, altro e medicine contano come alzata');
  const pm=new Date();pm.setHours(15,0,0,0);assert.strictEqual(nightSummary(pm.getTime()),null);
  // --- rigurgito: spiega un pianto aperto come aria; conteggio in Pattern
  S.events.push({id:'cr',k:'cry',t:Date.now()-2*MIN,who:'Fabio',label:null,ctx:{},bins:{f:-1,a:-1,h:1},feat:null,audio:false});S.openCry='cr';
  S.events.push({id:'f9',k:'feed',t:Date.now()-10*MIN,who:'Fabio',prep:120,ml:100});
  A.flow('other');assert.ok(/Rigurgito/.test(txt('#screenInner')));A.finish('rigurgito');
  assert.strictEqual(S.events.find(e=>e.id==='cr').label,'aria');
  T('renderStats()');assert.ok(/Rigurgiti 1 1 entro 30 min da una pappa/.test(txt('#stats')),txt('#stats').slice(0,300));
  // --- pannello: si disegna con tutto dentro, nessun errore
  T('renderHealth()');const hh=txt('#health');assert.ok(/Crescita/.test(hh)&&/Vitamina D data/.test(hh)&&/38,2 °C/.test(hh)&&/Tappe in arrivo/.test(hh)&&/1 visita fatta/.test(hh));
  console.log('health ok');
})().catch(e=>{console.error(e);process.exit(1);});
