// Estensione svezzamento: card in Salute prima/dopo i 120 giorni, percorso "food" completo, suggeriti senza i già provati. node tests/svezzamento.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const DAY=864e5,MIN=6e4;
(async()=>{
  const app=await boot({ext:['svezzamento']});const {A,S,T,txt}=app;
  const X=window.AlanExt,SV=X.svezzamento,API=X.api;
  const health=()=>String(app.els['#health']._h);
  const screen=()=>String(app.els['#screenInner']._h);
  const wait=()=>new Promise(r=>setTimeout(r,120));
  assert.ok(SV&&Array.isArray(SV.groups)&&typeof SV.tried==='function'&&typeof SV.suggested==='function','namespace AlanExt.svezzamento');
  assert.deepStrictEqual(SV.groups.map(g=>g.key),['cereali','verdure','frutta','proteine','latticini']);
  SV.groups.forEach(g=>assert.ok(g.items.length>=5&&g.items.every(n=>n.length<=24),'gruppo '+g.key));
  // --- prima dei 120 giorni: card discreta, nessun pulsante né chip
  S.settings.birth=API.isoDay(Date.now()-100*DAY);
  assert.strictEqual(SV.active(),false);
  T('renderHealth()');let h=health();
  assert.ok(/sv-soon/.test(h)&&/Svezzamento/.test(h)&&/verso i 4 mesi/.test(h),h);
  assert.ok(!/Nuovo alimento/.test(h)&&!/svezzamento\.start/.test(h),'prima dei 4 mesi niente percorso');
  assert.strictEqual(txt('#health').indexOf('Zucca'),-1);
  // --- dai 120 giorni: card piena, vuota, con "Nuovo alimento", suggeriti a gruppi e promemoria neutro
  S.settings.birth=API.isoDay(Date.now()-120*DAY);
  assert.strictEqual(SV.active(),true);
  T('renderHealth()');h=health();
  assert.ok(!/sv-soon/.test(h)&&/Nuovo alimento/.test(h)&&/Nessun alimento ancora registrato/.test(h),h);
  assert.ok(/un alimento nuovo alla volta/.test(h),'promemoria');
  assert.ok(!/sv-tog/.test(h),'senza alimenti niente elenco completo');
  ['Cereali e creme','Verdure','Frutta','Carne, pesce, uova e legumi','Latticini'].forEach(l=>assert.ok(h.indexOf(l)>=0,'gruppo '+l));
  assert.ok(/svezzamento\.start\('verdure',4\)/.test(h),'chip Zucca (indice 4 delle verdure)');
  assert.ok(/>\+6</.test(h),'le verdure oltre le prime 6 stanno in un chip +N: '+h.match(/>\+\d+</g));
  assert.ok(!/color:#|background:#/.test(h),'nessun colore fisso');
  let sg=SV.suggested();assert.strictEqual(sg.length,5);assert.strictEqual(sg[1].items.length,12);assert.strictEqual(sg[1].tried,0);
  // --- percorso da chip: "Zucca" precompilata → si parte dal quanto
  SV.start('verdure',4);
  let f=T('flow');assert.ok(f&&f.type==='food','percorso food aperto');assert.strictEqual(f.data.name,'Zucca');assert.strictEqual(f.data.group,'verdure');assert.strictEqual(f.step,1);
  assert.ok(/Quanto ne ha mangiato\?/.test(screen())&&/Assaggio/.test(screen())&&/>Poco</.test(screen())&&/>Tutto</.test(screen()),screen());
  assert.ok(/Quando/.test(screen())&&/adesso/.test(screen()),'riga del quando');
  assert.ok(/class="title">Zucca</.test(screen()),'il titolo è l\'alimento');
  SV.amount('assaggio');f=T('flow');assert.strictEqual(f.data.amount,'assaggio');assert.strictEqual(f.step,2);
  assert.ok(/Com'è andata\?/.test(screen())&&/A\.finish\('bene'\)/.test(screen())&&/A\.finish\('nongradito'\)/.test(screen())&&/svezzamento\.react\(\)/.test(screen()),screen());
  assert.ok(/Zucca · assaggio/.test(screen()));
  A.setOff(30);
  const n0=S.events.length;A.finish('bene');
  assert.strictEqual(T('flow'),null,'percorso chiuso');assert.strictEqual(S.events.length,n0+1);
  let e=S.events[S.events.length-1];
  assert.strictEqual(e.k,'food');assert.strictEqual(e.name,'Zucca');assert.strictEqual(e.group,'verdure');assert.strictEqual(e.amount,'assaggio');assert.strictEqual(e.reaction,'bene');assert.strictEqual(e.note,'');
  assert.ok(e.id&&e.who&&e._updated,'id, chi, _updated');
  assert.ok(Math.abs(e.t-(Date.now()-30*MIN))<2000,'t = 30 min fa');
  assert.strictEqual(app.els['#toast'].textContent,'Zucca · assaggio · bene');
  assert.deepStrictEqual(T('describe')(e,null),['Zucca','<span class="detail">assaggio · bene</span>']);
  assert.ok(/Zucca assaggio · bene/.test(txt('#diary')),txt('#diary'));
  // i suggeriti non contengono più la zucca (confronto senza maiuscole)
  sg=SV.suggested();assert.strictEqual(sg[1].items.indexOf('Zucca'),-1);assert.strictEqual(sg[1].items.length,11);assert.strictEqual(sg[1].tried,1);
  let tr=SV.tried();assert.strictEqual(tr.length,1);assert.strictEqual(tr[0].name,'Zucca');assert.strictEqual(tr[0].n,1);assert.strictEqual(tr[0].reaction,'bene');
  // --- "Nuovo alimento": passo 1 con i suggeriti (senza Zucca), i già provati per riprovare, e "altro" con nome libero
  SV.open();f=T('flow');assert.strictEqual(f.step,0);
  let s=screen();assert.ok(/Cosa ha assaggiato\?/.test(s)&&/Già provati/.test(s)&&/scrivo io il nome/.test(s),s);
  assert.ok(/sv-again[^>]*>Zucca</.test(s),'la zucca sta tra i già provati');
  assert.strictEqual((s.match(/>Zucca</g)||[]).length,1,'la zucca non è più tra i suggeriti');
  assert.ok(/svezzamento\.pick\(0\)/.test(s)&&/>Crema di riso</.test(s));
  SV.pick(0);f=T('flow');assert.strictEqual(f.data.name,'Crema di riso');assert.strictEqual(f.data.group,'cereali');assert.strictEqual(f.step,1);
  SV.back();assert.strictEqual(T('flow').step,0);
  SV.custom();assert.ok(/Quale alimento\?/.test(screen())&&/id="svName"/.test(screen()),screen());
  SV.next();assert.strictEqual(T('flow').step,0,'senza nome non avanza');assert.strictEqual(app.els['#toast'].textContent,'Scrivi il nome dell\'alimento');
  SV.name('  Pastina con  zucchine ');SV.next();f=T('flow');assert.strictEqual(f.data.name,'Pastina con zucchine');assert.strictEqual(f.data.group,'altro');assert.strictEqual(f.step,1);
  SV.amount('poco');
  // "Reazione" chiede una nota breve e salva con A.finish('reazione')
  SV.react();f=T('flow');assert.strictEqual(f.step,3);assert.strictEqual(f.data.reaction,'reazione');assert.ok(/Cosa hai notato\?/.test(screen())&&/id="svNote"/.test(screen())&&/A\.finish\('reazione'\)/.test(screen()),screen());
  SV.back();assert.strictEqual(T('flow').step,2);assert.strictEqual(T('flow').data.reaction,null);SV.react();
  SV.note(' puntini rossi sul mento ');A.finish('reazione');
  e=S.events[S.events.length-1];assert.strictEqual(e.name,'Pastina con zucchine');assert.strictEqual(e.group,'altro');assert.strictEqual(e.amount,'poco');assert.strictEqual(e.reaction,'reazione');assert.strictEqual(e.note,'puntini rossi sul mento');
  assert.deepStrictEqual(T('describe')(e,null),['Pastina con zucchine','<span class="detail">poco · reazione · puntini rossi sul mento</span>']);
  // la nota resta solo con "reazione"; il nome vince sui caratteri speciali (escape nel diario)
  A.flow('food',null,{name:'Pera <bio> & "co"',group:'frutta'});T('flow').data.note='da ignorare';SV.amount('tutto');A.finish('nongradito');
  e=S.events[S.events.length-1];assert.strictEqual(e.note,'');assert.strictEqual(e.reaction,'nongradito');
  assert.strictEqual(T('describe')(e,null)[0],'Pera &lt;bio&gt; &amp; &quot;co&quot;');
  // valori fuori elenco: niente da salvare
  A.flow('food',null,{name:'',group:'frutta'});const nBefore=S.events.length;A.finish('bene');assert.strictEqual(S.events.length,nBefore,'senza nome niente');assert.strictEqual(app.els['#toast'].textContent,'Niente da salvare');
  A.flow('food',null,{name:'Mela',group:'frutta'});A.finish('boh');assert.strictEqual(S.events.length,nBefore,'reazione sconosciuta: niente');A.home();
  // --- riepilogo: conteggi e ultimi tre
  S.events.push({id:'x1',k:'food',t:Date.now()-2*DAY,who:'Ilaria',name:'zucca',group:'verdure',amount:'tutto',reaction:'nongradito',note:''});
  S.events.push({id:'x2',k:'food',t:Date.now()-5*DAY,who:'Ilaria',name:'Carota',group:'verdure',amount:'assaggio',reaction:'nongradito',note:''});
  tr=SV.tried();assert.strictEqual(tr.length,4,'zucca e Zucca sono lo stesso alimento');
  const z=tr.find(x=>x.key==='zucca');assert.strictEqual(z.n,2);assert.strictEqual(z.reaction,'bene','vale l\'ultima prova');assert.strictEqual(z.name,'Zucca');
  // Pera e Pastina sono di "adesso" (stesso istante possibile), Zucca di 30 min fa, Carota di 5 giorni fa
  const keys=tr.map(x=>x.key);assert.deepStrictEqual(keys.slice(0,2).sort(),['pastina con zucchine','pera <bio> & "co"'],'dall\'ultima prova');assert.deepStrictEqual(keys.slice(2),['zucca','carota']);
  let sm=SV.summary();assert.strictEqual(sm.n,4);assert.strictEqual(sm.retry,2,'Pera e Carota da riprovare');assert.strictEqual(sm.react,1);assert.strictEqual(sm.last.length,3);
  T('renderHealth()');h=health();
  assert.ok(/<b>4<\/b> alimenti provati, 2 da riprovare, 1 con reazione/.test(h),h);
  assert.ok(/sv-tog/.test(h)&&/Tutti gli alimenti provati \(4\)/.test(h)&&/aria-expanded="false"/.test(h));
  assert.ok(/puntini rossi sul mento/.test(h),'la nota è nella riga');
  assert.ok(/svezzamento\.del\('/.test(h),'elimina dalla riga');
  assert.strictEqual((h.match(/class="row sv-row"/g)||[]).length,3,'solo gli ultimi tre');
  T('showView("salute")');SV.toggleList();h=health();assert.ok(/aria-expanded="true"/.test(h));assert.strictEqual((h.match(/class="row sv-row"/g)||[]).length,7,'3 ultimi + 4 distinti');
  assert.ok(/Zucca <span class="detail">2 volte<\/span>/.test(h),h);
  assert.ok(/1 su 12 provato/.test(h)||/2 su 12 provati/.test(h),'contatore del gruppo: '+h.match(/\d+ su 12 provat\w+/));
  assert.ok(/2 su 12 provati/.test(h));
  SV.toggleList();assert.ok(/aria-expanded="false"/.test(health()));
  // --- suggeriti: tutti provati in un gruppo → "Tutti provati."
  SV.groups[4].items.forEach((n,i)=>S.events.push({id:'l'+i,k:'food',t:Date.now()-DAY,who:'Fabio',name:n.toUpperCase(),group:'latticini',amount:'poco',reaction:'bene',note:''}));
  sg=SV.suggested();assert.deepStrictEqual(sg[4].items,[]);assert.strictEqual(sg[4].tried,5);
  T('renderHealth()');assert.ok(/Tutti provati\./.test(health()));
  // --- cambio dall'altro telefono: la card di Salute si ridisegna solo se cambia qualcosa
  T('showView("salute")');app.els['#health']._h='SEGNAPOSTO';SV.check();assert.strictEqual(health(),'SEGNAPOSTO','stessa firma: nessun ridisegno');
  S.events.push({id:'r1',k:'food',t:Date.now(),who:'Ilaria',name:'Banana',group:'frutta',amount:'tutto',reaction:'bene',note:''});
  SV.check();assert.ok(/Banana/.test(health()),'nuovo alimento: ridisegno');
  T('showView("oggi")');
  // il diario nasconde nulla: la voce food è visibile con nome e dettaglio
  T('renderHome()');assert.ok(/Banana tutto · bene/.test(txt('#diary')),txt('#diary'));
  // --- sotto i 120 giorni ma con alimenti già registrati (data di nascita corretta dopo): la card resta piena
  S.settings.birth=API.isoDay(Date.now()-100*DAY);assert.strictEqual(SV.active(),true);
  T('renderHealth()');assert.ok(/Nuovo alimento/.test(health()));
  console.log('svezzamento ok');
})().catch(e=>{console.error(e);process.exit(1);});
