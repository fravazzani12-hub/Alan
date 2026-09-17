// mergeRemote: last-writer-wins su _updated, soft delete, audio locale mai sovrascritto, impostazioni condivise.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
(async()=>{
  const sent=[];
  const app=await boot({AlanSync:{init:()=>Promise.resolve({ok:true}),upsert:e=>{sent.push(['up',JSON.parse(JSON.stringify(e))]);return Promise.resolve(true);},remove:e=>{sent.push(['rm',e.id,e._updated]);return Promise.resolve(true);},status:()=>({family:'F'}),upsertSettings:s=>{sent.push(['set',JSON.parse(JSON.stringify(s))]);return Promise.resolve(true);},removeAudio:()=>Promise.resolve({}),setPresence(){}}});
  const {S}=app,mergeRemote=app.T('mergeRemote'),mergeRemoteSettings=app.T('mergeRemoteSettings'),byId=app.T('byId');
  const t0=Date.now()-3600e3;
  // nuovo evento remoto: entra con audio=false anche se il jsonb diceva audio true; cloud e mime restano
  mergeRemote([{id:'r1',k:'cry',t:t0,who:'Ilaria',label:'fame',dur:9,audio:true,audioPath:'F/r1.m4a',mime:'audio/mp4',_updated:'2026-09-17T10:00:00.000Z'}]);
  const r1=byId('r1');assert.ok(r1);assert.strictEqual(r1.audio,false);assert.strictEqual(r1.audioPath,'F/r1.m4a');assert.strictEqual(r1.mime,'audio/mp4');assert.strictEqual(r1._deleted,undefined);
  // versione più vecchia: ignorata
  mergeRemote([{id:'r1',k:'cry',t:t0,who:'Ilaria',label:'sonno',_updated:'2026-09-17T09:59:59.999Z'}]);
  assert.strictEqual(byId('r1').label,'fame');
  // stessa versione (eco del proprio upsert): ignorata
  mergeRemote([{id:'r1',k:'cry',t:t0,who:'Ilaria',label:'sonno',_updated:'2026-09-17T10:00:00.000Z'}]);
  assert.strictEqual(byId('r1').label,'fame');
  // versione più nuova: applicata, ma audio locale non toccato
  r1.audio=true;
  mergeRemote([{id:'r1',k:'cry',t:t0,who:'Ilaria',label:'sonno',audio:false,_updated:'2026-09-17T10:00:01.000Z'}]);
  assert.strictEqual(byId('r1').label,'sonno');assert.strictEqual(byId('r1').audio,true);assert.strictEqual(byId('r1')._updated,'2026-09-17T10:00:01.000Z');
  // evento locale senza _updated (vecchia versione dell'app): il remoto vince
  S.events.push({id:'l1',k:'feed',t:t0,who:'Fabio',prep:120,ml:90});
  mergeRemote([{id:'l1',k:'feed',t:t0,who:'Fabio',prep:120,ml:100,_updated:'2026-09-17T10:00:00.000Z'}]);
  assert.strictEqual(byId('l1').ml,100);
  // soft delete: sparisce, chiude il pianto aperto, e la lista viene ridisegnata
  S.openCry='r1';app.els['#diary']._h='';
  mergeRemote([{id:'r1',_deleted:true,_updated:'2026-09-17T10:00:02.000Z'}]);
  assert.strictEqual(byId('r1'),null);assert.strictEqual(S.openCry,null);assert.ok(app.els['#diary']._h.length>0,'diario ridisegnato');
  // soft delete di una voce sconosciuta: nessun effetto, nessun errore
  const before=S.events.length;mergeRemote([{id:'nope',_deleted:true}]);assert.strictEqual(S.events.length,before);
  // cancellazione locale → removed() con _updated fresco (serve al pull incrementale dell'altro telefono)
  app.A.del('l1');const rm=sent.filter(x=>x[0]==='rm')[0];assert.ok(rm&&rm[1]==='l1');assert.ok(Date.now()-Date.parse(rm[2])<2000,'updated_at della cancellazione è adesso');
  assert.strictEqual(byId('l1'),null);
  // impostazioni: server vuoto → si spediscono le locali (una volta sola)
  mergeRemoteSettings(null);mergeRemoteSettings(null);
  assert.strictEqual(sent.filter(x=>x[0]==='set').length,1);assert.ok(S.settings._updated);
  // remoto più nuovo vince e aggiorna l'intestazione; più vecchio no
  const newer=new Date(Date.now()+5000).toISOString();
  mergeRemoteSettings({name:'Alan Jr',birth:'2026-08-01',_updated:newer});
  assert.strictEqual(S.settings.name,'Alan Jr');assert.strictEqual(S.settings.birth,'2026-08-01');assert.strictEqual(app.els['#hName'].textContent,'Alan Jr');
  mergeRemoteSettings({name:'Vecchio',birth:'2026-01-01',_updated:'2026-01-01T00:00:00.000Z'});
  assert.strictEqual(S.settings.name,'Alan Jr');
  // salvataggio locale → upsertSettings con _updated nuovo
  document.querySelector('#sName').value='Alan';document.querySelector('#sBirth').value='2026-08-20';app.A.saveSettings();
  const last=sent.filter(x=>x[0]==='set').pop();assert.strictEqual(last[1].name,'Alan');assert.ok(Date.parse(last[1]._updated)>Date.parse(newer)-10000);
  console.log('merge ok');
})().catch(e=>{console.error(e);process.exit(1);});
