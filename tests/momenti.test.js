// Estensione momenti: intestazione e frase del giorno, prime volte (età, ordine, doppioni), numeri della settimana,
// lettere con chi, foto in coda verso il cloud (mock) e stato locale/remoto dell'album. node tests/momenti.test.js
'use strict';
const assert=require('assert');
const fs=require('fs');
const {boot}=require('./stub');
const DAY=864e5,H=36e5;
(async()=>{
  const app=await boot({ext:['momenti']});const {A,S,T,txt}=app;
  const X=window.AlanExt,M=X.momenti,API=X.api;
  const tab=()=>String(app.els['#momenti']._h);
  const screen=()=>String(app.els['#screenInner']._h);
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms||120));
  /* aspetta che una condizione diventi vera invece di sperare in un ritardo fisso (le suite girano anche sotto carico) */
  const until=async(fn,msg)=>{for(let i=0;i<60;i++){if(fn())return;await wait(30);}assert.ok(false,msg||'condizione mai vera');};
  const src=fs.readFileSync(__dirname+'/../js/momenti.js','utf8');
  let seq=0;const add=(e)=>{e.id=e.id||('t'+(++seq));e._updated=new Date().toISOString();S.events.push(e);return e;};

  assert.ok(M&&Array.isArray(M.FIRSTS)&&typeof M.firsts==='function'&&typeof M.week==='function','namespace AlanExt.momenti');
  assert.ok(!/Math\.random/.test(src),'niente Math.random nel disegno');
  // --- frase del giorno: deterministica dal giorno dell'anno, 20 frasi brevi e diverse
  assert.strictEqual(M.PHRASES.length,20);
  assert.strictEqual(new Set(M.PHRASES).size,20,'frasi tutte diverse');
  M.PHRASES.forEach(p=>assert.ok(p.length>=20&&p.length<=72,'frase breve: '+p));
  assert.strictEqual(M.dayOfYear(new Date(2026,0,1)),0);assert.strictEqual(M.dayOfYear(new Date(2026,11,31)),364);
  assert.strictEqual(M.phrase(new Date(2026,0,1)),M.PHRASES[0]);
  assert.strictEqual(M.phrase(new Date(2026,0,1)),M.phrase(new Date(2026,0,1)),'stessa frase nello stesso giorno');
  assert.strictEqual(M.phrase(new Date(2026,0,1)),M.phrase(new Date(2026,0,21)),'ciclo di 20 giorni');
  assert.notStrictEqual(M.phrase(new Date(2026,0,1)),M.phrase(new Date(2026,0,2)));
  assert.strictEqual(M.phrase(new Date(2026,2,10)),M.PHRASES[M.dayOfYear(new Date(2026,2,10))%20]);
  // --- età a parole
  assert.strictEqual(M.ageWords(0),'il primo giorno');assert.strictEqual(M.ageWords(1),'a 1 giorno');assert.strictEqual(M.ageWords(4),'a 4 giorni');
  assert.strictEqual(M.ageWords(7),'a 1 settimana');assert.strictEqual(M.ageWords(14),'a 2 settimane');assert.strictEqual(M.ageWords(44),'a 6 settimane e 2 giorni');assert.strictEqual(M.ageWords(8),'a 1 settimana e 1 giorno');
  // --- intestazione: nome, età di oggi, frase del giorno; senza data di nascita solo il nome
  S.settings.name='Alan';S.settings.birth='';
  API.showView('momenti');await wait();
  assert.ok(/mo-head/.test(tab())&&/Momenti di famiglia/.test(tab()),tab().slice(0,200));
  assert.ok(/class="mo-age">Alan</.test(tab()),'senza nascita solo il nome');
  S.settings.birth=API.isoDay(Date.now()-44*DAY);
  API.showView('momenti');await wait();
  assert.ok(/Alan oggi ha 6 settimane e 2 giorni/.test(tab()),tab().match(/mo-age[^<]*/));
  assert.ok(tab().indexOf(M.phrase())>=0,'frase di oggi');
  assert.ok(/Prime volte/.test(tab())&&/Album/.test(tab())&&/Questa settimana in numeri/.test(tab())&&/Lettere/.test(tab()),'le cinque sezioni');
  assert.strictEqual((tab().match(/momenti\.first\('/g)||[]).length,15,'15 tappe da fare');
  assert.ok(!/color:#|background:#/.test(tab()),'nessun colore fisso');
  // --- prime volte: percorso con data, età calcolata, ordine cronologico delle fatte, doppioni ignorati
  M.first('sorriso');
  let f=T('flow');assert.ok(f&&f.type==='moment'&&f.data.kind==='first'&&f.data.code==='sorriso','percorso aperto');
  assert.ok(/Primo sorriso/.test(screen())&&/Quando/.test(screen())&&/A\.hdate\(/.test(screen())&&/A\.finish\('save'\)/.test(screen()),screen());
  A.hdate(API.isoDay(Date.now()-30*DAY));
  assert.ok(/Alan a 2 settimane\./.test(screen()),'anteprima dell\'età: '+screen().match(/hint">[^<]*/));
  let n0=S.events.length;A.finish('save');
  assert.strictEqual(T('flow'),null);assert.strictEqual(S.events.length,n0+1);
  let e=S.events[S.events.length-1];
  assert.strictEqual(e.k,'moment');assert.strictEqual(e.kind,'first');assert.strictEqual(e.code,'sorriso');assert.strictEqual(e.title,'Primo sorriso');
  assert.ok(e.id&&e.who&&e._updated,'id, chi, _updated');
  assert.strictEqual(e.t,API.noon(API.isoDay(Date.now()-30*DAY)),'t = mezzogiorno del giorno scelto');
  assert.strictEqual(app.els['#toast'].textContent,'Primo sorriso · a 2 settimane');
  add({k:'moment',kind:'first',code:'risata',title:'Prima risata',t:API.noon(API.isoDay(Date.now()-10*DAY)),who:'Ilaria'});
  add({k:'moment',kind:'first',code:'bagnetto',title:'Primo bagnetto',t:API.noon(API.isoDay(Date.now()-40*DAY)),who:'Fabio'});
  add({k:'moment',kind:'first',code:'sorriso',title:'Primo sorriso',t:API.noon(API.isoDay(Date.now()-20*DAY)),who:'Fabio'});
  let fs_=M.firsts();
  assert.deepStrictEqual(fs_.done.map(d=>d.code),['bagnetto','sorriso','risata'],'fatte in ordine di data, una per tappa');
  assert.deepStrictEqual(fs_.done.map(d=>d.age),['a 4 giorni','a 2 settimane','a 4 settimane e 6 giorni']);
  assert.strictEqual(fs_.done[1].e.id,e.id,'del doppione resta la più vecchia');
  assert.strictEqual(fs_.todo.length,12);assert.strictEqual(fs_.todo[0].code,'notte5');assert.ok(fs_.todo.every(d=>['sorriso','risata','bagnetto'].indexOf(d.code)<0));
  await wait();
  let h=tab();
  assert.ok(h.indexOf('mo-done')<h.indexOf('momenti.first('),'le fatte stanno sopra le da fare');
  assert.ok(/Primo bagnetto<\/b><span>a 4 giorni · /.test(h)&&/Fabio/.test(h),'data ed età sulla riga');
  assert.ok(!/atteso|di solito|in ritardo|presto/.test(h),'nessun confronto con età attese');
  assert.ok(!/Primo sorriso/.test(String(app.els['#diary']._h)),'i momenti non stanno nel diario');
  // eliminazione di una tappa
  const bag=fs_.done[0].e.id;assert.strictEqual(M.del(bag),true);
  assert.ok(!S.events.some(x=>x.id===bag));assert.strictEqual(M.firsts().done.length,2);
  // --- questa settimana in numeri (notti = 22–7): la notte tra l'altro ieri e ieri è sempre tutta passata
  // "adesso" fisso alle 14 di oggi: così le voci di poche ore fa non finiscono mai nella finestra di notte 22–7
  const d=new Date(),y7=new Date(d.getFullYear(),d.getMonth(),d.getDate()-1,7,0,0).getTime(),now=new Date(d.getFullYear(),d.getMonth(),d.getDate(),14,0,0).getTime();
  const realNow=Date.now;Date.now=()=>now;
  add({k:'sleep',t:y7-8*H,who:'Ilaria'});add({k:'wake',t:y7-2*H,who:'Ilaria'});
  add({k:'feed',prep:120,ml:90,t:y7-5*H,who:'Fabio'});add({k:'diaper',pipi:'normale',cacca:'no',t:y7-4*H,who:'Fabio'});add({k:'feed',prep:120,ml:100,t:y7-3*H,who:'Ilaria'});
  add({k:'feed',prep:120,ml:110,t:now-2*H,who:'Ilaria'});add({k:'feed',prep:120,ml:0,t:now-1*H,who:'Ilaria'});add({k:'feed',prep:120,ml:100,t:now-10*DAY,who:'Fabio'});
  add({k:'cry',dur:40,label:'fame',t:now-3*H,who:'Fabio'});add({k:'cry',dur:20,label:null,t:now-4*H,who:'Fabio'});
  add({k:'moment',kind:'story',text:'Prima volta al parco',t:now-5*H,who:'Ilaria'});
  let w=M.week(now);
  assert.strictEqual(w.feeds,3,'pappe bevute negli ultimi 7 giorni');
  assert.strictEqual(w.cries,2);assert.strictEqual(w.explained,1);
  assert.strictEqual(w.moments,1);assert.strictEqual(w.letters,0);
  assert.strictEqual(w.nights,1);assert.strictEqual(w.sleepAvg,6*H,'sei ore nella finestra 22–7');
  assert.deepStrictEqual(w.ups,{Fabio:2,Ilaria:1});assert.strictEqual(w.upsTotal,3);
  assert.strictEqual(M.teamText(w),'Di notte vi siete alzati 3 volte in tutto: Fabio 2, Ilaria 1. Squadra.');
  assert.strictEqual(M.teamText({ups:{},upsTotal:0}),'Nessuna alzata notturna registrata negli ultimi sette giorni.');
  assert.strictEqual(M.teamText({ups:{Ilaria:1},upsTotal:1}),'Di notte un\'alzata sola, di Ilaria.');
  assert.strictEqual(M.teamText({ups:{Ilaria:4},upsTotal:4}),'Di notte 4 alzate, tutte di Ilaria.');
  assert.ok(!/alzato|alzata /.test(M.teamText({ups:{Ilaria:4},upsTotal:4})),'nessun genere indovinato');
  API.showView('momenti');await wait();h=tab();
  assert.ok(/<b>3<\/b><span>pappe/.test(h)&&/<b>6 h<\/b><span>di sonno a notte/.test(h)&&/<b>1 su 2<\/b><span>pianti spiegati/.test(h),h.match(/mo-nums[\s\S]*?<\/div><p/));
  assert.ok(/Squadra\./.test(h)&&!/classifica|meglio|peggio/.test(h),'squadra, non classifica');
  assert.ok(/mo-story/.test(h)&&/Prima volta al parco/.test(h),'i racconti senza foto restano visibili');
  Date.now=realNow;
  // --- lettera: tastiera ammessa, salvata con chi, elenco e apertura
  T('who="Ilaria"');
  M.write();f=T('flow');assert.ok(f&&f.type==='letter');
  assert.ok(/<textarea[^>]*id="moLetter"/.test(screen())&&/Firmata da Ilaria/.test(screen())&&/Cosa vorrei ricordare di questa settimana/.test(screen()),screen());
  n0=S.events.length;A.finish('save');
  assert.ok(T('flow'),'vuota: resta aperta');assert.strictEqual(S.events.length,n0);assert.strictEqual(app.els['#toast'].textContent,'Scrivi qualcosa prima di salvare');
  M.text('Ciao Alan,\r\nquesta settimana hai riso   per la prima volta.  ');
  A.finish('save');
  assert.strictEqual(T('flow'),null);assert.strictEqual(S.events.length,n0+1);
  e=S.events[S.events.length-1];
  assert.strictEqual(e.k,'letter');assert.strictEqual(e.who,'Ilaria');assert.strictEqual(e.text,'Ciao Alan,\nquesta settimana hai riso per la prima volta.');
  assert.ok(Math.abs(e.t-Date.now())<2000,'la lettera ha la data di oggi');
  assert.strictEqual(app.els['#toast'].textContent,'Lettera salvata');
  await wait();h=tab();
  assert.ok(/mo-lrow/.test(h)&&/Ciao Alan,…/.test(h)&&/<small>Ilaria<\/small>/.test(h),'elenco lettere ridisegnato dal hook change: '+h.match(/mo-letters[\s\S]*?<\/div><\/div>/));
  assert.ok(!/Ciao Alan/.test(String(app.els['#diary']._h)),'le lettere non stanno nel diario');
  assert.strictEqual(M.letters()[0].id,e.id);assert.strictEqual(M.week(Date.now()).letters,1);
  M.openLetter(e.id);f=T('flow');assert.ok(f&&f.type==='letterview');
  assert.ok(/questa settimana hai riso per la prima volta\./.test(screen())&&/Ilaria · Alan a 6 settimane e 2 giorni/.test(screen()),screen());
  A.home();
  // --- foto: ridimensionamento sostituito, archivio in memoria, coda verso il cloud finché non si è collegati
  const files={};const calls={put:[],del:[],up:[],rm:[]};
  API.fileGet=async id=>files[id];API.filePut=async(id,v)=>{files[id]=v;calls.put.push(id);return true;};API.fileDel=async id=>{delete files[id];calls.del.push(id);return true;};
  M.resize=async file=>({buf:new ArrayBuffer(2048),mime:'image/jpeg',w:1280,h:960});
  let ready=false;API.syncReady=()=>ready;
  API.cloudUpload=async(id,blob,mime)=>{calls.up.push([id,mime,blob&&blob.size]);return ready?{path:'fam/'+id+'.bin',error:null}:{path:null,error:'non collegato'};};
  API.cloudRemove=async p=>{calls.rm.push(p);return {};};
  M.tell();f=T('flow');assert.ok(f&&f.type==='moment'&&f.data.kind==='photo');
  let s=screen();
  assert.ok(/type="file" accept="image\/\*" capture="environment"/.test(s)&&/Dalla galleria/.test(s)&&/id="moCaption"/.test(s)&&/A\.hdate\(/.test(s),s);
  n0=S.events.length;A.finish('save');
  assert.ok(T('flow')&&S.events.length===n0,'senza foto né parole non salva');assert.strictEqual(app.els['#toast'].textContent,'Aggiungi una foto o due parole');
  assert.strictEqual(await M.pick({files:[{name:'a.jpg',size:5e6,type:'image/jpeg'}]}),true);
  assert.ok(/<img src="blob:/.test(screen())&&/Cambia foto/.test(screen()),'anteprima della foto: '+screen().match(/mo-prev[\s\S]{0,80}/));
  M.caption('Il primo bagnetto  di Alan');A.hdate(API.isoDay(Date.now()-1*DAY));
  A.finish('save');await wait(30);
  assert.strictEqual(T('flow'),null);assert.strictEqual(S.events.length,n0+1);
  e=S.events[S.events.length-1];
  assert.strictEqual(e.k,'moment');assert.strictEqual(e.kind,'photo');assert.strictEqual(e.photo,true);assert.strictEqual(e.text,'Il primo bagnetto di Alan');assert.strictEqual(e.who,'Ilaria');
  assert.strictEqual(e.t,API.noon(API.isoDay(Date.now()-DAY)));
  assert.ok(files[e.id]&&files[e.id].buf.byteLength===2048&&files[e.id].mime==='image/jpeg','foto in files come {buf,mime}');
  assert.ok(!/AZ|buf/.test(app.store['alan.v2']||'')||!(app.store['alan.v2']||'').includes('"buf"'),'niente foto in localStorage');
  assert.deepStrictEqual(M.outbox(),[e.id],'in coda finché non si è collegati');
  assert.strictEqual(e.photoPath,undefined);assert.strictEqual(calls.up.length,0,'senza collegamento non prova nemmeno');
  assert.strictEqual(M.known[e.id],'local');
  await wait();h=tab();
  assert.ok(new RegExp('mo-cell mo-local" aria-label="Il primo bagnetto di Alan" onclick="AlanExt\\.momenti\\.openPhoto\\(\''+e.id+'\'').test(h),'cella locale nell\'album: '+h.match(/mo-grid[\s\S]*?<\/div>/));
  // si collega: la coda parte, l'evento riceve photoPath e viaggia via touched
  ready=true;assert.strictEqual(await M.flush(),1);
  assert.strictEqual(e.photoPath,'fam/'+e.id+'.bin');assert.strictEqual(e.mime,'image/jpeg');
  assert.deepStrictEqual(calls.up,[[e.id,'image/jpeg',2048]]);assert.deepStrictEqual(M.outbox(),[]);
  assert.strictEqual(await M.flush(),0,'coda vuota');
  // --- foto dell'altro telefono: segnaposto, poi download al primo tap e visore
  const r=add({k:'moment',kind:'photo',text:'Al parco',photo:true,photoPath:'fam/r1.bin',mime:'image/jpeg',t:now-6*H,who:'Fabio',id:'r1'});
  API.showView('momenti');await wait();h=tab();
  assert.strictEqual(M.known.r1,'remote');
  assert.ok(/mo-cell mo-dl" onclick="AlanExt\.momenti\.openPhoto\('r1',this\)"><span>tocca per scaricare<\/span>/.test(h),h.match(/mo-grid[\s\S]*?<\/div>/));
  assert.ok(h.indexOf('r1')<h.indexOf(e.id),'album dalla più recente');
  let dl=[];API.cloudDownload=async p=>{dl.push(p);return {data:{arrayBuffer:async()=>new ArrayBuffer(777),type:'image/jpeg'},error:null};};
  assert.strictEqual(await M.openPhoto('r1'),true);
  assert.deepStrictEqual(dl,['fam/r1.bin']);assert.ok(files.r1&&files.r1.buf.byteLength===777,'scaricata e messa in files');assert.strictEqual(M.known.r1,'local');
  f=T('flow');assert.ok(f&&f.type==='momentview'&&f.data.id==='r1','visore aperto');
  s=screen();assert.ok(/Al parco/.test(s)&&/scattata da Fabio/.test(s)&&/Alan a 6 settimane e 2 giorni/.test(s)&&/momenti\.share\(this\)/.test(s)&&/momenti\.del\('r1'\)/.test(s),s);
  let shared=[];M.shareFile=async(blob,name,title)=>{shared.push([blob.size,name,title]);return 'share';};
  assert.strictEqual(await M.share(),'share');assert.deepStrictEqual(shared,[[777,'alan-'+API.isoDay(r.t)+'.jpg','Al parco']]);
  A.finish('share');assert.ok(T('flow'),'il visore non salva nulla');
  // il secondo tap apre senza scaricare di nuovo
  A.home();dl=[];assert.strictEqual(await M.openPhoto('r1'),true);assert.deepStrictEqual(dl,[]);
  // --- elimina dal visore: evento, file locale, oggetto nel cloud, coda
  assert.strictEqual(M.del('r1'),true);
  assert.strictEqual(T('flow'),null);assert.ok(!S.events.some(x=>x.id==='r1'));assert.deepStrictEqual(calls.del,['r1']);assert.deepStrictEqual(calls.rm,['fam/r1.bin']);assert.strictEqual(M.known.r1,undefined);
  await until(()=>!/r1/.test(tab().match(/mo-grid[\s\S]*?<\/div>/)||''),'album ridisegnato senza la foto eliminata');
  // --- foto non ancora caricata dall'altro telefono: segnaposto "in arrivo", il tap avvisa
  add({k:'moment',kind:'photo',text:'Nonna',photo:true,t:now-7*H,who:'Fabio',id:'r2'});
  API.showView('momenti');await wait();
  assert.strictEqual(M.known.r2,'none');assert.ok(/mo-cell mo-wait[^>]*><span>in arrivo<\/span>/.test(tab()),tab().match(/mo-grid[\s\S]*?<\/div>/));
  assert.strictEqual(await M.openPhoto('r2'),false);assert.ok(/ancora sull'altro telefono/.test(app.els['#toast'].textContent));
  // --- il ridimensionamento fallisce: niente foto, il percorso resta aperto e lo dice
  M.resize=async()=>{throw new Error('troppo grande');};
  M.tell();assert.strictEqual(await M.pick({files:[{name:'b.jpg'}]}),false);
  assert.ok(/Non riesco a leggere la foto: troppo grande/.test(app.els['#toast'].textContent));assert.ok(/Scatta/.test(screen()),'torna alla scelta');
  A.home();
  console.log('momenti ok');
})().catch(e=>{console.error(e);process.exit(1);});
