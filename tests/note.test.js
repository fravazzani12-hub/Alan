// Estensione note: nota su una voce del diario (tap sulla riga, percorso con textarea, Salva/Togli), chi l'ha scritta,
// sync via touched, scheda Note in Salute con la scelta della voce, sezione Note nel report. node tests/note.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const H=36e5,MIN=6e4;
(async()=>{
  const app=await boot({ext:['note','report']});const {A,S,T,txt}=app;
  const X=window.AlanExt,N=X.note,API=X.api;
  const screen=()=>String(app.els['#screenInner']._h);
  const diary=()=>String(app.els['#diary']._h);
  assert.ok(N&&typeof N.set==='function'&&typeof N.all==='function','namespace AlanExt.note');
  assert.strictEqual(T('EXT.rows.length'),1,'decoratore delle righe registrato');
  assert.ok(T('EXT.flows.note')&&T('EXT.flows.diario'),'percorsi registrati');
  assert.strictEqual(T('EXT.slots.salute.length'),1,'scheda in Salute');
  // --- pulizia del testo: spazi, a capo, limite
  assert.strictEqual(N.clean('  ciao   mondo \n\n  seconda  '),'ciao mondo\nseconda');
  assert.strictEqual(N.clean(null),'');assert.strictEqual(N.clean('x'.repeat(300)).length,N.MAX);
  // --- senza note: diario con righe toccabili e suggerimento; scheda Salute con il testo di attesa
  const now=Date.now();let n=0;
  const add=(e)=>{e.id=e.id||('n'+(++n));e.who=e.who||'Fabio';e._updated=new Date(now-H).toISOString();S.events.push(e);return e;};
  const f=add({k:'feed',t:now-2*H,prep:120,ml:100});const d=add({k:'diaper',t:now-H,pipi:'normale',cacca:'poca',who:'Ilaria'});
  add({k:'appt',t:now+3*864e5,kind:'vaccino',title:'Vaccino'});add({k:'sleep',t:now-4*864e5});
  T('renderHome()');
  assert.ok(/class="row tap"/.test(diary()),'righe toccabili');assert.ok(new RegExp("onclick=\"AlanExt.note.open\\('"+f.id+"'\\)\"").test(diary()),'tap apre la nota');
  assert.ok(/nt-hint/.test(String(app.els['#home-note']._h))&&/Tutto il diario/.test(String(app.els['#home-note']._h)),'suggerimento finché non c\'è nessuna nota, più Tutto il diario');
  assert.ok(!/class="nt"/.test(diary()),'nessuna nota mostrata');
  T('renderHealth()');const sal=String(app.els['#health']._h);
  assert.ok(/<h3>Note<\/h3>/.test(sal)&&/riepilogo per il pediatra/.test(sal)&&/Scrivi una nota nel diario/.test(sal),'scheda vuota con il pulsante');
  assert.strictEqual(N.all().length,0);
  // --- percorso: apre sulla voce, salva, la voce ha nota e autore, _updated fresco, diario aggiornato
  N.open(f.id);
  assert.ok(/<div class="title">Nota<\/div>/.test(screen())&&/Aggiungi una nota/.test(screen())&&/id="ntTxt"/.test(screen())&&/Pappa/.test(screen()),screen());
  assert.ok(!/Togli la nota/.test(screen()),'senza nota niente Togli');
  N.typed('  ha bevuto piano,   sembrava stanco ');
  assert.strictEqual(app.els['#ntCount'].textContent,'32');
  A.finish('save');
  assert.strictEqual(f.note,'ha bevuto piano, sembrava stanco');assert.strictEqual(f.noteBy,'Io','chi scrive = profilo corrente');
  assert.ok(f._updated>new Date(now-MIN).toISOString(),'touched: timestamp fresco');
  assert.strictEqual(app.T('flow'),null,'schermata chiusa');
  assert.ok(/class="nt">ha bevuto piano, sembrava stanco/.test(diary()),'nota sotto la voce: '+diary());
  assert.ok(/— Io</.test(diary()),'autore diverso da chi ha registrato');
  assert.ok(!/nt-hint/.test(String(app.els['#home-note']._h))&&/Tutto il diario/.test(String(app.els['#home-note']._h)),'suggerimento sparito, pulsante resta');
  assert.deepStrictEqual(N.all().map(e=>e.id),[f.id]);
  // --- stesso testo: nessuna modifica; modifica; togli
  const u1=f._updated;assert.strictEqual(N.set(f.id,'ha bevuto piano, sembrava stanco'),null);assert.strictEqual(f._updated,u1);
  N.open(f.id);assert.ok(/Modifica la nota/.test(screen())&&/Togli la nota/.test(screen())&&/Scritta da Io/.test(screen()));
  assert.ok(/>ha bevuto piano, sembrava stanco</.test(screen()),'testo precompilato');
  A.finish('clear');assert.strictEqual(f.note,undefined);assert.strictEqual(f.noteBy,undefined);assert.strictEqual(N.all().length,0);
  // --- nota da textarea (senza typed): legge il valore del campo; limite 200; voce inesistente
  N.open(d.id);app.els['#ntTxt'].value='cacca verde e liquida';A.finish('save');assert.strictEqual(d.note,'cacca verde e liquida');
  assert.strictEqual(N.set(d.id,'y'.repeat(500)),true);assert.strictEqual(d.note.length,200);
  assert.strictEqual(N.set('nope','x'),false);
  N.open('nope');assert.ok(/non c'è più/.test(screen()));
  // --- tutto il diario: 7 giornate alla volta, dal più recente, per giorno, senza visite; "Giorni precedenti" se c'è altro
  N.set(d.id,'cacca verde e liquida');
  let rec=N.recent(now,3);assert.deepStrictEqual(rec.map(e=>e.id),[d.id,f.id],'ultime 3 giornate dal più nuovo, senza visita e senza la nanna di 4 giorni fa');
  assert.strictEqual(N.recent(now).length,3,'7 giornate: anche la nanna di 4 giorni fa');assert.strictEqual(N.recent(now,7).length,3);
  add({k:'feed',t:now-20*864e5,prep:120,ml:80});
  assert.ok(N.older(now,7)&&!N.older(now,30),'c\'è una voce prima di 7 giorni, non prima di 30');
  N.openDiary();assert.ok(/<div class="title">Tutto il diario<\/div>/.test(screen())&&/anche a distanza di giorni/.test(screen()),screen());
  assert.strictEqual((screen().match(/class="row nt-row"/g)||[]).length,3,'tre voci nelle 7 giornate');
  assert.ok(/<h4 class="nt-day">Oggi<\/h4>/.test(screen()),'intestazione del giorno');assert.strictEqual((screen().match(/nt-day/g)||[]).length,2,'due giornate');
  assert.ok(/class="nt">cacca verde e liquida/.test(screen()),'la nota esistente si vede');assert.ok(/Giorni precedenti/.test(screen()),'c\'è altro prima');
  N.more();assert.strictEqual(app.T('flow').data.days,14);assert.ok(/Giorni precedenti/.test(screen()),'ancora una voce oltre i 14 giorni');
  N.more();assert.strictEqual(app.T('flow').data.days,21);assert.strictEqual((screen().match(/class="row nt-row"/g)||[]).length,4,'a 21 giorni c\'è anche la pappa vecchia');assert.ok(!/Giorni precedenti/.test(screen()),'niente più da caricare');
  A.home();S.events.length=0;N.openDiary();assert.ok(/ancora vuoto/.test(screen()));A.home();
  // --- scheda Salute con le note, dalla più recente, al massimo 20 più "altre"
  for(let i=0;i<23;i++)add({k:'feed',t:now-(i+1)*H,prep:120,ml:90,note:'nota '+i,noteBy:'Fabio'});
  assert.strictEqual(N.all().length,23);assert.strictEqual(N.all()[0].note,'nota 0');
  const card=N.card();assert.strictEqual((card.match(/class="row nt-row"/g)||[]).length,20);assert.ok(/e altre 3 più vecchie/.test(card),card.slice(-200));
  assert.ok(/class="nt">nota 0</.test(card)&&!/— Fabio/.test(card),'autore uguale a chi ha registrato: non ripetuto');
  // --- report: sezione Note con data, voce, testo e chi
  S.events.length=0;
  add({k:'feed',t:now-3*H,prep:120,ml:100,note:'ha bevuto piano',noteBy:'Ilaria'});add({k:'diaper',t:now-2*H,pipi:'poca',cacca:'no'});
  const R=X.report;const r=R.compute(7,now);
  assert.ok(Array.isArray(r.notes)&&r.notes.length===1,'una nota nel periodo');assert.strictEqual(r.notes[0].text,'ha bevuto piano');assert.strictEqual(r.notes[0].who,'Ilaria');assert.ok(/^Pappa 100 ml su 120$/.test(r.notes[0].what),r.notes[0].what);
  const secs=R.sections(r);const ns=secs.find(s=>s.id==='note');assert.ok(ns&&ns.blocks.length===1&&ns.blocks[0].list,'sezione Note in lista');
  assert.strictEqual(ns.blocks[0].rows[0][1],'ha bevuto piano (Ilaria)');assert.ok(/ · Pappa 100 ml su 120$/.test(ns.blocks[0].rows[0][0]));
  const t=R.text(7,now);assert.ok(/NOTE\n/.test(t)&&/ha bevuto piano \(Ilaria\)/.test(t),'testo del report: '+t.slice(-300));
  assert.ok(/Nessuna nota nel periodo/.test(R.text(7,now-10*864e5)));
  console.log('note ok');
})().catch(e=>{console.error(e);process.exit(1);});
