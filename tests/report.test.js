// Estensione report: riepilogo per il pediatra (calcoli su dati finti, testo, schermata, stampa e condivisione guardate). node tests/report.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5,DAY=864e5;
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
const d=(dd,hh,mm)=>new Date(2026,8,dd,hh,mm||0,0,0).getTime(); // settembre 2026, ora locale
(async()=>{
  const app=await boot({ext:['report']});const {A,S,T,txt}=app;
  const X=window.AlanExt,R=X.report,API=X.api;
  assert.ok(R&&typeof R.compute==='function'&&typeof R.text==='function','namespace AlanExt.report');
  S.settings.birth='2026-08-20';S.settings.name='Alan';
  const now=d(17,10,30); // gio 17/9/2026 10:30, 28 giorni di vita
  let id=0;const ev=(o)=>{o.id='r'+(++id);o.who=o.who||'Fabio';S.events.push(o);return o;};
  // --- diario: due giorni completi (15 e 16), più voci di oggi e voci vecchie fuori dal periodo
  // pappe 15/9: biberon 100/120, 120, 90, rifiutato, 100 alle 21 (cronometrato), rifiutato alle 23
  ev({k:'feed',t:d(15,8),prep:120,ml:100,src:'biberon'});ev({k:'feed',t:d(15,11),prep:120,ml:120});ev({k:'feed',t:d(15,14),prep:120,ml:90});
  ev({k:'feed',t:d(15,18),prep:120,ml:0});ev({k:'feed',t:d(15,21),prep:120,ml:100,src:'biberon',dur:600});ev({k:'feed',t:d(15,23),prep:120,ml:0});
  // pappe 16/9: 110, 100, 130, 100
  ev({k:'feed',t:d(16,7),prep:120,ml:110});ev({k:'feed',t:d(16,10,30),prep:120,ml:100});ev({k:'feed',t:d(16,14,30),prep:150,ml:130});ev({k:'feed',t:d(16,20),prep:120,ml:100});
  // sonno: notte 15 (00:30–05:00 = 4 h 30), pisolino 13–14; notte 16 (22:30 del 15 → 06:30 = 8 h), pisolini 9–10 e 15–16:30
  ev({k:'sleep',t:d(15,0,30)});ev({k:'wake',t:d(15,5)});ev({k:'sleep',t:d(15,13)});ev({k:'wake',t:d(15,14)});
  ev({k:'sleep',t:d(15,22,30)});ev({k:'wake',t:d(16,6,30)});ev({k:'sleep',t:d(16,9)});ev({k:'wake',t:d(16,10)});ev({k:'sleep',t:d(16,15)});ev({k:'wake',t:d(16,16,30)});
  // cambi: 6 in due giorni, 5 con pipì, 3 con cacca
  ev({k:'diaper',t:d(15,7),pipi:'tanta',cacca:'no'});ev({k:'diaper',t:d(15,12),pipi:'poca',cacca:'poca'});ev({k:'diaper',t:d(15,19),pipi:'no',cacca:'tanta'});
  ev({k:'diaper',t:d(16,6),pipi:'tanta',cacca:'no'});ev({k:'diaper',t:d(16,13),pipi:'tanta',cacca:'tanta'});ev({k:'diaper',t:d(16,21),pipi:'poca',cacca:'no'});
  // pianti: 5, 4 spiegati (fame 2, sonno 1, da solo 1), uno senza; durate 120/60/90/30
  ev({k:'cry',t:d(15,7,50),label:'fame',dur:120,audio:false});ev({k:'cry',t:d(15,12,50),label:'sonno',dur:60,audio:false});ev({k:'cry',t:d(15,17),label:null,dur:90,audio:false});
  ev({k:'cry',t:d(16,6,50),label:'fame',dur:30,audio:false});ev({k:'cry',t:d(16,18),label:'solo',audio:false});
  // temperature: una ieri, una oggi (entra nell'elenco), una del 1/8 (fuori dai 30 giorni)
  ev({k:'temp',t:d(16,20),c:37.2});ev({k:'temp',t:d(17,8),c:36.8});ev({k:'temp',t:new Date(2026,7,1,8).getTime(),c:37.9});
  // medicine: vitamina D 15, 16 e oggi; paracetamolo una volta
  ev({k:'med',t:d(15,9),what:'vitd',name:'Vitamina D'});ev({k:'med',t:d(16,9),what:'vitd',name:'Vitamina D'});ev({k:'med',t:d(17,9),what:'vitd',name:'Vitamina D'});
  ev({k:'med',t:d(16,21),what:'paracetamolo',name:'Paracetamolo'});
  // visite: una fatta il 10/9, una in programma il 20/10, una passata e non fatta (non compare)
  ev({k:'appt',t:d(10,11),kind:'bilancio',title:'Bilancio 1° mese',place:'Studio dott. Rossi',note:'',done:true});
  ev({k:'appt',t:new Date(2026,9,20,9,0).getTime(),kind:'vaccino',title:'Vaccino',place:'ASL',note:'esavalente',done:false});
  ev({k:'appt',t:d(1,10),kind:'visita',title:'Visita',place:'',note:'',done:false});
  // misure: 6 pesate (a mezzogiorno), l'ultima con lunghezza; nel riepilogo restano le ultime 5
  const noon=(m,dd)=>new Date(2026,m,dd,12,0).getTime();
  ev({k:'measure',t:noon(7,20),w:3400,l:50});ev({k:'measure',t:noon(7,24),w:3300});ev({k:'measure',t:noon(7,27),w:3450});ev({k:'measure',t:noon(7,30),w:3600});
  ev({k:'measure',t:noon(8,3),w:3900,l:52.5});ev({k:'measure',t:noon(8,16),w:4300,l:54.5});

  // ================= compute: 30 giorni =================
  const r=R.compute(30,now);
  assert.strictEqual(r.days,30);assert.strictEqual(r.partial,false);assert.ok(r.hasData);
  assert.strictEqual(r.from,d(-13,0),'dal 18/8 alle 00:00 (17/9 − 30 giorni)');assert.strictEqual(r.to,d(17,0),'fino a oggi alle 00:00 (oggi escluso dalle medie)');
  assert.strictEqual(r.covered,2,'due giorni con almeno una voce (la temperatura del 1/8 è fuori, misure e visite non contano)');
  // intestazione
  assert.strictEqual(r.head.name,'Alan');assert.strictEqual(r.head.birth,'20/08/2026');
  assert.strictEqual(r.head.age,'4 settimane (28 giorni)');assert.strictEqual(r.head.date,'17/09/2026 10:30');
  assert.strictEqual(R.ageAt(d(19,10)),'4 settimane e 2 giorni (30 giorni)');
  // pappe: 8 valide, 850 ml, 2 rifiutati, intervallo medio 4 h 20
  const f=r.feeds;
  assert.strictEqual(f.n,8);assert.strictEqual(f.biberon,8);assert.strictEqual(f.seno,undefined);assert.strictEqual(f.refused,2);
  assert.strictEqual(f.perDay,4);assert.strictEqual(f.ml,850);assert.strictEqual(f.mlPerDay,425);near(f.mlPerFeed,106.25,0.01,'ml per biberon');
  near(f.gap,4.3333*H,MIN,'intervallo medio (3+3+7+3,5+4+5,5)/6 h, la notte di 10 h esclusa');
  // sonno: notti 4 h 30 e 8 h → 6 h 15; 3 pisolini (1,5 al giorno) di 70 min; nelle 24 ore 7 h e 9 h → 8 h
  const s=r.sleep;
  assert.strictEqual(s.nights,2);assert.strictEqual(s.nightMean,6.25*H);
  assert.strictEqual(s.naps,3);assert.strictEqual(s.napsPerDay,1.5);assert.strictEqual(s.napMean,70*MIN);
  assert.strictEqual(s.daysRec,2);assert.strictEqual(s.dayMean,8*H);
  // cambi
  const dp=r.diapers;
  assert.strictEqual(dp.n,6);assert.strictEqual(dp.perDay,3);assert.strictEqual(dp.wet,5);assert.strictEqual(dp.wetPerDay,2.5);assert.strictEqual(dp.poo,3);assert.strictEqual(dp.pooPerDay,1.5);
  // pianti
  const c=r.cries;
  assert.strictEqual(c.n,5);assert.strictEqual(c.perDay,2.5);assert.strictEqual(c.labeled,4);assert.strictEqual(c.unlabeled,1);assert.strictEqual(c.durMean,75);
  assert.deepStrictEqual(c.causes.map(x=>[x.id,x.n,x.pct]),[['fame',2,50],['sonno',1,25],['solo',1,25]]);
  assert.strictEqual(c.causes[2].label,'passato da solo');
  // temperature: oggi compresa, la vecchia no, più recente per prima
  assert.deepStrictEqual(r.temps.map(x=>x.c),[36.8,37.2]);assert.strictEqual(r.tempMax,37.2);
  // medicine
  assert.deepStrictEqual(r.meds.map(m=>[m.name,m.n]),[['Vitamina D',3],['Paracetamolo',1]]);assert.strictEqual(r.meds[0].last,d(17,9));
  // visite
  assert.strictEqual(r.appts.done.length,1);assert.strictEqual(r.appts.done[0].kind,'Bilancio di salute');assert.strictEqual(r.appts.done[0].place,'Studio dott. Rossi');
  assert.strictEqual(r.appts.next.length,1);assert.strictEqual(r.appts.next[0].kind,'Vaccino');assert.strictEqual(r.appts.next[0].note,'esavalente');
  // misure: ultime 5, percentili OMS coerenti con l'app, crescita fra le ultime due pesate
  assert.strictEqual(r.measures.length,5);assert.strictEqual(r.measures[0].w,3300,'la pesata del 20/8 è fuori dalle ultime 5');
  const last=r.measures[4];assert.strictEqual(last.w,4300);assert.strictEqual(last.l,54.5);assert.strictEqual(last.age,'3 sett');
  assert.strictEqual(last.pw,API.pctOf('wfa',API.ageDaysAt(last.t),4.3));assert.strictEqual(last.pl,API.pctOf('lhfa',API.ageDaysAt(last.t),54.5));
  assert.ok(last.pw>=1&&last.pw<=99&&last.pl>=1&&last.pl<=99);
  assert.strictEqual(r.measures[1].l,null);assert.strictEqual(r.measures[1].pl,null);
  assert.deepStrictEqual(r.wGain,{g:400,days:13});

  // ================= finestre diverse =================
  const r7=R.compute(7,now);assert.strictEqual(r7.from,d(10,0));assert.strictEqual(r7.covered,2);assert.strictEqual(r7.feeds.n,8);
  const r1=R.compute(1,now);assert.strictEqual(r1.covered,1);assert.strictEqual(r1.feeds.n,4,'solo il 16');assert.strictEqual(r1.feeds.ml,440);assert.strictEqual(r1.sleep.nights,1);assert.strictEqual(r1.sleep.nightMean,8*H);
  assert.strictEqual(r1.appts.done.length,0,'la visita del 10/9 è fuori da una finestra di un giorno');assert.strictEqual(r1.measures.length,5,'le misure sono sempre le ultime 5');
  assert.strictEqual(R.compute('boh',now).days,30,'periodo non valido → 30');

  // ================= testo =================
  const t=R.text(30,now);
  assert.ok(/^ALAN — RIEPILOGO PER IL PEDIATRA\n/.test(t),t.split('\n')[0]);
  assert.ok(/Nato il 20\/08\/2026 · 4 settimane \(28 giorni\)/.test(t));
  assert.ok(/Riepilogo del 17\/09\/2026 10:30 · ultimi 30 giorni \(dal 18\/8 al 16\/9\), 2 giorni con il diario/.test(t),t);
  ['MISURE','PAPPE','SONNO','CAMBI','PIANTI','TEMPERATURE','MEDICINE','VISITE E VACCINI'].forEach(sec=>assert.ok(t.indexOf('\n'+sec+'\n')>=0,'sezione '+sec));
  assert.ok(/mer 16\/9 · 3 sett · 4,30 kg \(\d+°\) · 54,5 cm \(\d+°\)/.test(t),t);
  assert.ok(/gio 3\/9 · 2 sett · 3,90 kg \(\d+°\) · 52,5 cm/.test(t));
  assert.ok(/Ultimo peso: \+400 g in 13 giorni/.test(t));
  assert.ok(/Pappe al giorno: 4 \(in tutto 8\)/.test(t));assert.ok(/Latte al biberon al giorno: 425 ml/.test(t));assert.ok(/Per biberon: 106 ml, su 8 biberon/.test(t));
  assert.ok(!/seno/.test(t));assert.ok(/Intervallo medio: 4 h 20/.test(t));assert.ok(/Biberon rifiutati: 2/.test(t));
  assert.ok(/Notte \(22–7\), in media: 6 h 15 su 2 notti/.test(t));assert.ok(/Pisolini al giorno: 1,5, di 1 h 10 l'uno/.test(t));assert.ok(/Sonno nelle 24 ore, in media: 8 h su 2 giorni/.test(t));
  assert.ok(/Cambi al giorno: 3 \(in tutto 6\)/.test(t));assert.ok(/Con pipì, al giorno: 2,5/.test(t));assert.ok(/Con cacca, al giorno: 1,5/.test(t));
  assert.ok(/Pipì poca \/ normale \/ tanta: 2 \/ 0 \/ 3/.test(t),'quantità pipì: '+t);assert.ok(/Cacca poca \/ normale \/ tanta: 1 \/ 0 \/ 2/.test(t),'quantità cacca: '+t);
  assert.ok(/Pianti al giorno: 2,5 \(in tutto 5\)/.test(t));assert.ok(/Durata media registrata: 01:15/.test(t));assert.ok(/Senza spiegazione: 1/.test(t));
  assert.ok(/Cosa voleva, sui 4 pianti spiegati:\nFame: 2 \(50%\)\nSonno: 1 \(25%\)\nPassato da solo: 1 \(25%\)/.test(t),t);
  assert.ok(/gio 17\/9 08:00: 36,8 °C\nmer 16\/9 20:00: 37,2 °C\nLa più alta: 37,2 °C\./.test(t),t);
  assert.ok(/Vitamina D: 3 volte, l'ultima gio 17\/9\nParacetamolo: 1 volta, l'ultima mer 16\/9/.test(t));
  assert.ok(/Fatte:\ngio 10\/9: Bilancio di salute · Bilancio 1° mese · Studio dott\. Rossi/.test(t));
  assert.ok(/In programma:\nmar 20\/10 09:00: Vaccino · ASL · esavalente/.test(t),'titolo uguale al tipo non si ripete: '+t);
  assert.ok(!/passato da solo va/.test(t)&&!/bene|poco|troppo/i.test(t)&&!/normale/i.test(t.replace(/poca \/ normale \/ tanta/g,'')),'nessun giudizio nel testo ("normale" solo come quantità del pannolino)');

  // ================= schermata =================
  T('fillExtAltro()');
  let alt=String(app.els['#extAltro']._h);
  assert.ok(/Per il pediatra/.test(alt)&&/Prepara il riepilogo \(30 giorni\)/.test(alt)&&/>7 giorni</.test(alt)&&/>90 giorni</.test(alt),alt);
  assert.ok(/class="on" onclick="AlanExt.report.setPeriod\(30\)"/.test(alt),'30 giorni evidenziato');
  R.setPeriod(7);assert.strictEqual(app.store['alan.report.days'],'7');assert.strictEqual(R.period(),7);
  T('fillExtAltro()');alt=String(app.els['#extAltro']._h);assert.ok(/Prepara il riepilogo \(7 giorni\)/.test(alt)&&/class="on" onclick="AlanExt.report.setPeriod\(7\)"/.test(alt));
  R.setPeriod(12);assert.strictEqual(R.period(),7,'periodo fuori lista ignorato');
  R.open(30,now);
  let fl=T('flow');assert.ok(fl&&fl.type==='report','percorso report aperto');assert.strictEqual(fl.data.days,30);assert.strictEqual(fl.data.now,now);
  let sc=txt('#screenInner'),html=String(app.els['#screenInner']._h);
  assert.ok(/Per il pediatra/.test(sc)&&/Riepilogo del/.test(sc),sc);
  ['Misure','Pappe','Sonno','Cambi','Pianti','Temperature','Medicine','Visite e vaccini'].forEach(sec=>assert.ok(new RegExp('<h3>'+sec+'</h3>').test(html),'sezione '+sec));
  assert.ok(/id="rpPage"/.test(html)&&/class="rp-t"/.test(html)&&/<th>Peso<\/th>/.test(html),'tabella delle misure');assert.ok(/class="rp-kv rp-list"/.test(html)&&/class="rp-kv">/.test(html),'liste e chiave→valore');
  assert.ok(/Stampa o salva PDF/.test(sc)&&/Condividi come testo/.test(sc));
  assert.ok(/Pappe al giorno 4 \(in tutto 8\)/.test(sc),sc);
  assert.ok(/class="on" onclick="AlanExt.report.setPeriod\(30\)"/.test(html),'chip del periodo aperto');
  // cambio periodo dalla schermata: resta aperta con il nuovo periodo, e la scelta è ricordata
  R.setPeriod(90);fl=T('flow');assert.strictEqual(fl.type,'report');assert.strictEqual(fl.data.days,90);assert.strictEqual(R.period(),90);
  assert.ok(/ultimi 90 giorni/.test(txt('#screenInner')));
  // A.finish non salva niente e non chiude
  const nEv=S.events.length;A.finish('x');assert.strictEqual(S.events.length,nEv);assert.ok(T('flow')&&T('flow').type==='report','ancora aperto');
  // il riepilogo aperto si ridisegna a ogni salvataggio o merge
  R.setPeriod(30);assert.strictEqual(T('flow').data.now,now,'setPeriod conserva l\'istante fissato');
  ev({k:'feed',t:d(16,23),prep:120,ml:60});T('extEmit')('change');
  assert.ok(/Pappe al giorno 4,5 \(in tutto 9\)/.test(txt('#screenInner')),txt('#screenInner'));
  S.events.pop();
  A.home();assert.strictEqual(T('flow'),null);

  // ================= stampa e condivisione (senza window.print né navigator.share nello stub) =================
  assert.strictEqual(typeof window.print,'undefined');
  assert.strictEqual(R.print(),false);assert.ok(/Condividi come testo/.test(app.els['#toast'].textContent));
  let printed=0;window.print=()=>{printed++;};
  assert.strictEqual(R.print(),true);assert.strictEqual(printed,1);
  delete window.print;
  assert.strictEqual(R.share(),'none','senza share né appunti');assert.ok(/non disponibile/.test(app.els['#toast'].textContent));
  let shared=null;navigator.share=(o)=>{shared=o;return Promise.resolve();};
  R.open(30,now);
  const btn={innerHTML:'Condividi come testo',classList:{add(){},remove(){}},disabled:false};
  assert.strictEqual(R.share(btn),'share');assert.ok(btn.disabled,'pulsante in attesa');
  await new Promise(r=>setTimeout(r,20));
  assert.ok(!btn.disabled,'pulsante libero');assert.strictEqual(shared.title,'Riepilogo per il pediatra · Alan');
  assert.ok(/^ALAN — RIEPILOGO PER IL PEDIATRA/.test(shared.text)&&/\nPAPPE\n/.test(shared.text)&&/ultimi 30 giorni/.test(shared.text));
  delete navigator.share;
  let clip=null;navigator.clipboard={writeText:(s)=>{clip=s;return Promise.resolve();}};
  assert.strictEqual(R.share(),'clipboard');await new Promise(r=>setTimeout(r,20));
  assert.ok(/RIEPILOGO PER IL PEDIATRA/.test(clip)&&/copiato/.test(app.els['#toast'].textContent));
  delete navigator.clipboard;A.home();

  // ================= diario cominciato oggi: vale la sola giornata =================
  const keep=S.events.splice(0);
  ev({k:'feed',t:d(17,8),prep:120,ml:100});ev({k:'diaper',t:d(17,8,30),pipi:'tanta',cacca:'no'});
  const rp=R.compute(30,now);
  assert.strictEqual(rp.partial,true);assert.strictEqual(rp.covered,1);assert.strictEqual(rp.feeds.n,1);assert.strictEqual(rp.diapers.perDay,1);
  assert.ok(/solo oggi, dalle 00:00 alle 10:30/.test(R.text(30,now)));
  // ================= vuoto =================
  S.events.splice(0);
  const re=R.compute(30,now);
  assert.strictEqual(re.hasData,false);assert.strictEqual(re.covered,0);assert.strictEqual(re.feeds.perDay,null);assert.strictEqual(re.measures.length,0);
  const te=R.text(30,now);
  assert.ok(/Nessuna misura registrata/.test(te)&&/Nessuna pappa registrata nel periodo/.test(te)&&/Nessun pianto registrato/.test(te)&&/Nessuna visita registrata/.test(te));
  R.open(7,now);assert.ok(/non ha ancora voci in questo periodo/.test(txt('#screenInner')));A.home();
  S.events.push(...keep);
  console.log('report ok');
})().catch(e=>{console.error(e);process.exit(1);});
