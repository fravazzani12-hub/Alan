// Modifica di una voce del diario: ora, valori per tipo, nota, elimina; diario raggruppato per giorno e riga toccabile;
// scheda "Prossime tappe" e resoconto della notte. node tests/edit.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const H=36e5,MIN=6e4,DAY=864e5;
(async()=>{
  const app=await boot({ext:['note']});const {A,S,T,txt}=app;
  const API=window.AlanExt.api;
  const screen=()=>String(app.els['#screenInner']._h);
  const diary=()=>String(app.els['#diary']._h);
  const now=Date.now();let n=0;
  const add=(e)=>{e.id=e.id||('e'+(++n));e.who=e.who||'Fabio';e._updated=new Date(now-DAY).toISOString();S.events.push(e);return e;};
  const isoDay=t=>T('isoDay')(t);
  const hhmm=t=>{const d=new Date(t);return T('pad')(d.getHours())+':'+T('pad')(d.getMinutes());};

  // --- diario: una intestazione per giornata, righe toccabili con pallino e chi, niente pulsante elimina
  const f=add({k:'feed',t:now-3*H,prep:120,ml:100});
  const d=add({k:'diaper',t:now-2*H,pipi:'tanta',cacca:'no',who:'Ilaria'});
  add({k:'other',t:now-26*H,what:'ruttino'});
  add({k:'appt',t:now+3*DAY,kind:'vaccino',title:'Esavalente',done:false});
  T('renderHome()');
  let h=diary();
  assert.ok(/<h4 class="dy-head">Oggi<\/h4>/.test(h)&&/<h4 class="dy-head">Ieri<\/h4>/.test(h),'giornate: '+h);
  assert.strictEqual((h.match(/dy-head/g)||[]).length,2,'due giornate');
  assert.ok(new RegExp('<button class="row tap" onclick="A.edit\\(\''+f.id+'\'\\)"').test(h),'riga toccabile');
  assert.ok(!/class="del"/.test(h),'niente X: si elimina dalla modifica');
  assert.ok(/--dc:var\(--c-fame\)/.test(h)&&/--dc:var\(--c-cambio\)/.test(h)&&/--dc:var\(--c-aria\)/.test(h),'pallino del tipo');
  assert.ok(/class="who">Ilaria</.test(h)&&/class="chev">›</.test(h));
  assert.ok(!/Esavalente/.test(h),'le visite restano fuori dal diario');
  // --- apertura: intestazione, quando, campi della pappa, nota
  A.edit(f.id);
  let sc=screen();
  assert.ok(/<div class="title">Modifica<\/div>/.test(sc)&&/Pappa/.test(sc)&&/registrata da Fabio/.test(sc),sc.slice(0,400));
  assert.ok(/Quando/.test(sc)&&new RegExp('type="date" value="'+isoDay(f.t)+'"').test(sc)&&new RegExp('type="time" value="'+hhmm(f.t)+'"').test(sc),'data e ora precompilate');
  assert.ok(/>Preparato</.test(sc)&&/>Bevuto</.test(sc)&&/>120 ml</.test(sc)&&/>100 ml</.test(sc),'valori attuali');
  assert.ok(/>Durata</.test(sc)&&/>—</.test(sc),'durata modificabile anche se non c\'era');
  assert.ok(/id="edNote"/.test(sc)&&/Salva le modifiche/.test(sc)&&/Elimina la voce/.test(sc));
  // --- stepper: ±50 e ±10, con i limiti
  A.editStep('ml',10);assert.strictEqual(app.T('flow').data.v.ml,110);
  A.editStep('ml',-50);assert.strictEqual(app.T('flow').data.v.ml,60);
  A.editStep('ml',-500);assert.strictEqual(app.T('flow').data.v.ml,0,'non scende sotto zero');
  A.editStep('ml',10);
  // --- ora: cambio del giorno e dell'ora; valori non validi ignorati
  A.editTime('bad');assert.strictEqual(app.T('flow').data.tm,hhmm(f.t),'ora non valida ignorata');
  A.editDay('2026-13-99');assert.strictEqual(app.T('flow').data.day,isoDay(f.t));
  const day=isoDay(now-DAY);A.editDay(day);A.editTime('07:05');
  A.editNote('  ha bevuto   piano ');
  assert.strictEqual(app.els['#edCount'].textContent,'15');
  const before=f._updated;
  A.finish('save');
  assert.strictEqual(app.T('flow'),null,'schermata chiusa');
  assert.strictEqual(f.ml,10);assert.strictEqual(f.prep,120);
  assert.strictEqual(new Date(f.t).getHours(),7);assert.strictEqual(new Date(f.t).getMinutes(),5);assert.strictEqual(isoDay(f.t),day,'spostata a ieri');
  assert.strictEqual(f.note,'ha bevuto piano');assert.strictEqual(f.noteBy,'Io');
  assert.ok(f._updated>before,'touched: la modifica si sincronizza');
  assert.strictEqual(app.els['#toast'].textContent,'Voce aggiornata');
  assert.ok(/class="nt">ha bevuto piano/.test(diary()),'la nota si vede nel diario');
  // --- durata aggiunta a posteriori a una pappa che non ce l'aveva
  A.edit(f.id);A.editStep('dur',60);A.editStep('dur',300);
  assert.ok(/>16 min</.test(screen()),'da 10 min di partenza: '+screen().match(/Durata[\s\S]{0,200}/));
  A.finish('save');assert.strictEqual(f.dur,960);
  A.edit(f.id);A.editClear('dur');A.finish('save');assert.strictEqual(f.dur,undefined,'si può togliere');
  // --- nessuna modifica: niente touched
  const u1=f._updated;
  A.edit(f.id);A.finish('save');
  assert.strictEqual(f._updated,u1,'nessuna modifica: timestamp invariato');assert.strictEqual(app.els['#toast'].textContent,'Nessuna modifica');
  // --- ml oltre il preparato: il preparato si adegua
  A.edit(f.id);A.editStep('ml',50);A.editStep('ml',50);A.editStep('ml',50);A.editStep('ml',50);A.finish('save');
  assert.strictEqual(f.ml,210);assert.strictEqual(f.prep,210,'preparato allineato ai ml bevuti');
  // --- pannolino: quattro scelte per pipì e cacca, il valore vecchio "si" si legge come normale
  d.pipi='si';
  A.edit(d.id);sc=screen();
  assert.ok(/>Pipì</.test(sc)&&/>Cacca</.test(sc)&&(sc.match(/class="seg wide"/g)||[]).length===2);
  assert.ok(/class="on" onclick="A.editPick\('pipi','normale'\)/.test(sc),'"si" già selezionato come normale');
  A.editPick('cacca','poca');A.finish('save');
  assert.strictEqual(d.cacca,'poca');assert.strictEqual(d.pipi,'normale','il valore vecchio si normalizza al salvataggio');
  // --- altre voci: temperatura, medicina, misure (con "togli")
  const tp=add({k:'temp',t:now-4*H,c:37.2});
  A.edit(tp.id);assert.ok(/37,2 °C/.test(screen()));A.editStep('c',0.1);A.editStep('c',1);A.finish('save');
  assert.ok(Math.abs(tp.c-38.3)<1e-9,'temperatura '+tp.c);
  const md=add({k:'med',t:now-5*H,what:'vitd',name:'Vitamina D'});
  A.edit(md.id);assert.ok(/class="on" onclick="A.editPick\('what','vitd'\)/.test(screen()));A.editPick('what','probiotico');A.finish('save');
  assert.strictEqual(md.what,'probiotico');
  const ms=add({k:'measure',t:now-6*H,w:4200,l:54});
  A.edit(ms.id);sc=screen();assert.ok(/4,20 kg/.test(sc)&&/54 cm/.test(sc)&&/Togli lunghezza/.test(sc));
  A.editStep('w',100);A.editClear('l');A.finish('save');
  assert.strictEqual(ms.w,4300);assert.strictEqual(ms.l,undefined,'lunghezza tolta');
  // --- nanna: solo ora e nota; un pianto va alla sua schermata
  const sl=add({k:'sleep',t:now-7*H});
  A.edit(sl.id);assert.ok(!/class="stepper"/.test(screen())&&/Quando/.test(screen())&&/id="edNote"/.test(screen()));A.home();
  const cr=add({k:'cry',t:now-8*H,label:null,ctx:{},bins:{f:-1,a:-1,h:1},feat:null,audio:false});
  A.edit(cr.id);assert.ok(app.T('flow')&&app.T('flow').type==='crydetail','il pianto apre la sua schermata');A.home();
  // --- elimina dalla modifica
  const n0=S.events.length;
  A.edit(tp.id);A.finish('del');
  assert.strictEqual(S.events.length,n0-1);assert.ok(!S.events.some(e=>e.id===tp.id));assert.strictEqual(app.T('flow'),null);
  // --- voce sparita nel frattempo
  A.edit(tp.id);assert.strictEqual(app.T('flow'),null);assert.strictEqual(app.els['#toast'].textContent,'Questa voce non c\'è più');
  console.log('edit ok');
})().catch(e=>{console.error(e);process.exit(1);});
