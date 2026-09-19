// Estensione reminders: regole con ora finta (compute(now)), Home, "Ok" per oggi, interruttori in Altro. node tests/reminders.test.js
'use strict';
const assert=require('assert');
const fs=require('fs');
const {boot}=require('./stub');
const MIN=6e4,H=36e5,DAY=864e5;
(async()=>{
  const app=await boot({ext:['reminders']});const {A,S,T,txt}=app;
  const X=window.AlanExt,RM=X.reminders,API=X.api;
  const home=()=>String(app.els['#next']._h);
  const keys=rows=>rows.map(r=>r.key.split(':')[0]);
  assert.ok(RM&&typeof RM.compute==='function','namespace AlanExt.reminders');
  // ora finta: oggi alle 11:00 (dopo le 10, stesso giorno di Date.now() così "Ok" e le regole parlano dello stesso giorno)
  const d0=new Date();d0.setHours(11,0,0,0);const NOW=d0.getTime();
  const at=(h,m)=>{const d=new Date(NOW);d.setHours(h,m,0,0);return d.getTime();};
  S.settings.birth=API.isoDay(NOW-40*DAY); // 40 giorni: sotto i 90, pappe attese ogni 3 h
  // --- stato vuoto: nessuna riga, blocco vuoto in Home
  assert.deepStrictEqual(RM.compute(NOW),[]);
  T('renderHome()');assert.strictEqual(home(),'');
  // --- (4) febbre: testo identico alla bandiera rossa in index.html, senza altro e senza "Ok"
  const html=fs.readFileSync(__dirname+'/../index.html','utf8');
  assert.ok(html.indexOf(RM.FEVER_TXT)>=0,'il testo della bandiera rossa è quello di index.html');
  S.events.push({id:'t1',k:'temp',t:NOW-2*H,who:'Ilaria',c:38.2});
  let rows=RM.compute(NOW);assert.deepStrictEqual(keys(rows),['fever']);assert.strictEqual(rows[0].text,RM.FEVER_TXT);assert.strictEqual(rows[0].ok,false);
  let h=RM.render(NOW);assert.ok(/nx-row rm-fever/.test(h)&&h.indexOf(API.esc(RM.FEVER_TXT))>=0,h);assert.ok(!/nx-act/.test(h),'la bandiera rossa non ha pulsanti');
  assert.ok(/--pc:var\(--danger\)/.test(h));
  S.events[0].t=NOW-7*H;assert.deepStrictEqual(RM.compute(NOW),[],'oltre 6 ore niente');
  S.events[0].t=NOW-2*H;S.events[0].c=37.9;assert.deepStrictEqual(RM.compute(NOW),[],'sotto 38 niente');
  S.events[0].c=38;S.settings.birth=API.isoDay(NOW-100*DAY);assert.deepStrictEqual(RM.compute(NOW),[],'dai 90 giorni niente');
  S.settings.birth=API.isoDay(NOW-40*DAY);assert.deepStrictEqual(keys(RM.compute(NOW)),['fever'],'38,0 a 40 giorni sì');
  S.events.splice(0);
  // --- (2) visita domani/oggi con ora e luogo
  const tom=new Date(NOW+DAY);tom.setHours(10,30,0,0);
  S.events.push({id:'a1',k:'appt',t:tom.getTime(),who:'Fabio',kind:'bilancio',title:'Bilancio di salute',place:'Pediatra, via Roma 3',note:'',done:false});
  rows=RM.compute(NOW);assert.deepStrictEqual(keys(rows),['appt']);assert.strictEqual(rows[0].key,'appt:a1');
  assert.strictEqual(rows[0].text,'Domani alle 10:30 · Bilancio di salute · Pediatra, via Roma 3');
  h=RM.render(NOW);assert.ok(/<b>Bilancio di salute<\/b> · Pediatra, via Roma 3/.test(h)&&/class="nx-when">Domani alle 10:30</.test(h),h);
  assert.ok(/AlanExt\.reminders\.open\(\)/.test(h),'tocca il testo → Salute');assert.ok(/nx-act/.test(h)&&/dismiss\('appt:a1'\)/.test(h),'Ok nasconde');
  S.events[0].t=at(16,0);rows=RM.compute(NOW);assert.strictEqual(rows[0].text,'Oggi alle 16:00 · Bilancio di salute · Pediatra, via Roma 3');
  S.events[0].t=at(9,30);assert.deepStrictEqual(keys(RM.compute(NOW)),['appt'],'passata da meno di 2 ore: ancora oggi');
  S.events[0].t=at(8,30);assert.deepStrictEqual(RM.compute(NOW),[],'passata da più di 2 ore: niente');
  S.events[0].t=NOW+3*DAY;assert.deepStrictEqual(RM.compute(NOW),[],'fra 3 giorni niente');
  S.events[0].t=tom.getTime();S.events[0].done=true;assert.deepStrictEqual(RM.compute(NOW),[],'fatta: niente');
  S.events[0].done=false;S.events[0].place='';S.events[0].title='';rows=RM.compute(NOW);assert.strictEqual(rows[0].text,'Domani alle 10:30 · Bilancio di salute','senza titolo vale il tipo, senza luogo niente puntino');
  assert.ok(!/<small>/.test(RM.render(NOW)));
  RM.open();assert.strictEqual(T('curView'),'salute');T('showView("oggi")');
  S.events.splice(0);
  // --- (3) pappa in ritardo: informazione neutra, solo oltre 30 min dall'atteso
  S.events.push({id:'f1',k:'feed',t:NOW-(4*H+10*MIN),who:'Fabio',prep:120,ml:100});
  rows=RM.compute(NOW);assert.deepStrictEqual(keys(rows),['feed']);assert.strictEqual(rows[0].key,'feed:'+S.events[0].t);
  assert.strictEqual(rows[0].text,'Ultima pappa 4 h 10 fa, di solito ogni 3 h');assert.strictEqual(rows[0].ok,true);
  h=RM.render(NOW);assert.ok(/--pc:var\(--c-fame\)/.test(h)&&/>Ok</.test(h),h);
  S.events[0].t=NOW-3*H-20*MIN;assert.deepStrictEqual(RM.compute(NOW),[],'20 min oltre: niente');
  S.events[0].t=NOW-3*H-31*MIN;assert.strictEqual(RM.compute(NOW)[0].text,'Ultima pappa 3 h 31 fa, di solito ogni 3 h');
  S.events[0].t=NOW-13*H;assert.deepStrictEqual(RM.compute(NOW),[],'oltre 12 ore: probabile registrazione mancante');
  S.events[0].t=NOW-4*H;S.events[0].ml=0;assert.deepStrictEqual(RM.compute(NOW),[],'biberon rifiutato non è l\'ultima pappa');
  S.events[0].ml=100;S.events[0].t=NOW-(4*H+10*MIN);S.settings.birth=API.isoDay(NOW-80*DAY);assert.strictEqual(RM.compute(NOW)[0].text,'Ultima pappa 4 h 10 fa, di solito ogni 3 h 30','norma a 11 settimane');
  S.settings.birth=API.isoDay(NOW-40*DAY);
  S.events.push({id:'s1',k:'feed',t:NOW-4*H+5*MIN,who:'Ilaria',prep:120,ml:100,src:'biberon',dur:600});
  assert.strictEqual(RM.compute(NOW)[0].text,'Ultima pappa 3 h 55 fa, di solito ogni 3 h','la pappa cronometrata vale come le altre');
  S.events.splice(0);
  // --- la vitamina D non è più un promemoria: la riga sta sempre nella scheda "Prossime tappe" (app.js)
  assert.strictEqual(RM.rules.vitd,undefined,'niente regola vitamina D');
  S.events.push({id:'v1',k:'med',t:NOW-2*DAY,who:'Ilaria',what:'vitd',name:'Vitamina D'});
  assert.deepStrictEqual(RM.compute(NOW),[],'la vitamina D non genera promemoria');
  T('renderNext()');assert.ok(/Vitamina D di oggi/.test(home())&&/A.quickMed\('vitd'/.test(home()),'riga di casa con Segna: '+home());
  S.events.splice(0);
  // --- ordine e massimo due righe: febbre, visita, pappa
  S.events.push({id:'t1',k:'temp',t:NOW-H,who:'Ilaria',c:38.5});
  S.events.push({id:'a1',k:'appt',t:tom.getTime(),who:'Fabio',kind:'vaccino',title:'Esavalente',place:'ASL',done:false});
  S.events.push({id:'f1',k:'feed',t:NOW-5*H,who:'Fabio',prep:120,ml:100});
  rows=RM.compute(NOW);assert.strictEqual(rows.length,2);assert.deepStrictEqual(keys(rows),['fever','appt']);
  S.events.splice(0,1);assert.deepStrictEqual(keys(RM.compute(NOW)),['appt','feed']);
  S.events.splice(0,1);assert.deepStrictEqual(keys(RM.compute(NOW)),['feed']);
  h=RM.render(NOW);assert.strictEqual((h.match(/class="nx-row/g)||[]).length,1);
  // --- "Ok" nasconde per oggi: chiave → giorno in alan.rem.dismissed, domani decade
  const fkey='feed:'+S.events[0].t;
  RM.dismiss(fkey);
  assert.strictEqual(JSON.parse(app.store['alan.rem.dismissed'])[fkey],API.dayKey(NOW));
  assert.deepStrictEqual(RM.compute(NOW),[]);
  assert.deepStrictEqual(RM.dismissed(NOW+DAY),{},'domani la riga torna');assert.deepStrictEqual(RM.compute(NOW+DAY),[],'(domani la pappa è a 29 h: oltre il tetto)');
  app.store['alan.rem.dismissed']=JSON.stringify({[fkey]:API.dayKey(NOW-DAY)});
  assert.deepStrictEqual(keys(RM.compute(NOW)),['feed'],'una voce di ieri non nasconde più');
  app.store['alan.rem.dismissed']='{non json';assert.deepStrictEqual(keys(RM.compute(NOW)),['feed'],'valore rotto: come vuoto');
  delete app.store['alan.rem.dismissed'];
  // una nuova pappa cambia la chiave: il promemoria torna anche se quello di prima era stato nascosto
  RM.dismiss(fkey);S.events.push({id:'f2',k:'feed',t:NOW-4*H,who:'Fabio',prep:120,ml:100});assert.deepStrictEqual(keys(RM.compute(NOW)),['feed']);
  S.events.pop();delete app.store['alan.rem.dismissed'];
  // --- interruttori in Altro: salvati in alan.rem.cfg, spengono la regola
  assert.deepStrictEqual(RM.cfg(),{appt:true,feed:true});
  T('fillExtAltro()');let alt=txt('#extAltro');assert.ok(/Promemoria/.test(alt)&&/Visite/.test(alt)&&/Pappa in ritardo/.test(alt)&&!/Vitamina D/.test(alt),alt);
  assert.strictEqual((String(app.els['#extAltro']._h).match(/role="switch"/g)||[]).length,2);assert.strictEqual((String(app.els['#extAltro']._h).match(/aria-checked="true"/g)||[]).length,2);
  RM.toggle('feed');assert.strictEqual(RM.cfg().feed,false);assert.deepStrictEqual(JSON.parse(app.store['alan.rem.cfg']),{appt:true,feed:false});
  assert.deepStrictEqual(RM.compute(NOW),[]);
  assert.ok(/aria-checked="false"/.test(RM.settingsCard())&&(RM.settingsCard().match(/aria-checked="true"/g)||[]).length===1);
  RM.toggle('nonEsiste');assert.deepStrictEqual(RM.cfg(),{appt:true,feed:false});
  S.events.push({id:'a1',k:'appt',t:tom.getTime(),who:'Fabio',kind:'visita',title:'Ecografia anche',place:'',done:false});
  assert.deepStrictEqual(keys(RM.compute(NOW)),['appt']);RM.toggle('appt');assert.deepStrictEqual(RM.compute(NOW),[]);
  S.events.push({id:'t1',k:'temp',t:NOW-H,who:'Ilaria',c:39});assert.deepStrictEqual(keys(RM.compute(NOW)),['fever'],'la bandiera rossa non ha interruttore');
  app.store['alan.rem.cfg']='{"feed":"sì"}';assert.deepStrictEqual(RM.cfg(),{appt:true,feed:true},'valori non booleani → predefiniti');
  delete app.store['alan.rem.cfg'];S.events.splice(0);
  // --- Home vera (ora reale): la riga pappa sta nella scheda "Prossime tappe" e sparisce dopo "Ok" con ridisegno
  const real=Date.now();S.events.push({id:'f1',k:'feed',t:real-(4*H+10*MIN),who:'Fabio',prep:120,ml:100});
  T('renderHome()');assert.ok(/nx-row rm-feed/.test(home())&&/Ultima pappa 4 h 10 fa, di solito ogni 3 h/.test(home()),home());
  assert.ok(/Prossime tappe/.test(home())&&/>Ok</.test(home()));
  RM.dismiss('feed:'+(real-(4*H+10*MIN)));assert.ok(!/rm-feed/.test(home()),'dopo Ok la riga sparisce');
  delete app.store['alan.rem.dismissed'];
  // check(): ridisegna solo se cambia qualcosa
  T('renderHome()');assert.ok(/rm-feed/.test(home()));
  app.els['#next']._h='SEGNAPOSTO';RM.check();assert.strictEqual(home(),'SEGNAPOSTO','testo uguale: nessun ridisegno');
  S.events[0].t-=MIN;RM.check();assert.ok(/4 h 11 fa/.test(home()),'solo il testo cambia: ridisegna il blocco '+home());
  S.events.splice(0);app.els['#diary']._h='';RM.check();assert.ok(!/rm-feed/.test(home()));assert.ok(/Ancora vuoto/.test(txt('#diary')),'la riga sparisce: si ridisegna tutta la Home');
  console.log('reminders ok');
})().catch(e=>{console.error(e);process.exit(1);});
