// js/sync.js contro un client Supabase simulato: conversioni, pull a pagine, outbox, soft delete, presence, impostazioni, storage.
'use strict';
const assert=require('assert');
const fs=require('fs');
const store={};global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
global.document={addEventListener(){},hidden:false};Object.defineProperty(global,'navigator',{value:{},configurable:true,writable:true});
const calls=[];let failNext=false;
const rows=[];for(let i=0;i<1203;i++)rows.push({id:'r'+i,family_id:'F',t:1000+i,k:'feed',who:'Ilaria',data:{ml:90,prep:120},deleted:false,updated_at:'2026-09-17T10:00:'+String(Math.floor(i/60)).padStart(2,'0')+'.'+String(i%60).padStart(2,'0')+'0000+00:00'});
function table(t){const o={_since:null,_lim:null,select(){calls.push([t,'select']);return o},eq(){return o},gt(k,v){o._since=v;return o},order(){return o},maybeSingle(){return Promise.resolve({data:store.__settings||null,error:null})},
  limit(n){o._lim=n;if(t==='family_members')return Promise.resolve({data:[{family_id:'F'}],error:null});const out=rows.filter(r=>!o._since||r.updated_at>o._since).slice(0,n);return Promise.resolve({data:out,error:null});},
  upsert(row,opt){calls.push([t,'upsert',row,opt]);if(failNext){failNext=false;return Promise.resolve({data:null,error:{message:'rete'}});}if(t==='family_settings')store.__settings=row;return Promise.resolve({data:null,error:null});}};return o;}
const ch={state:'closed',_on:{},on(type,f,cb){ch._on[type==='postgres_changes'?f.table:type]=cb;return ch},subscribe(cb){ch._cb=cb;setTimeout(()=>{ch.state='joined';cb('SUBSCRIBED')},5);return ch},presenceState(){return {u1:[{name:'Fabio'}],u2:[{name:'Ilaria',at:1}]}},track(m){calls.push(['track',m]);return Promise.resolve('ok')}};
const bucket={};
global.window={ALAN_CONFIG:{SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k'},addEventListener(){},supabase:{createClient(url,key,opts){calls.push(['client',url,opts]);return {from:table,
  auth:{getSession:()=>Promise.resolve({data:{session:{user:{id:'u1',email:'f@x',user_metadata:{name:'Fabio'}}}}}),onAuthStateChange(cb){setTimeout(()=>cb('INITIAL_SESSION',{user:{id:'u1',email:'f@x',user_metadata:{name:'Fabio'}}}),1)},signInWithPassword:a=>Promise.resolve({data:{},error:a.password==='bad'?{message:'Invalid login credentials'}:null}),signOut:()=>Promise.resolve({})},
  channel(name,cfg){calls.push(['channel',name,cfg]);return ch},removeChannel(){calls.push(['removeChannel'])},
  storage:{from(b){return {upload(p,body,o){bucket[p]={body,o};return Promise.resolve({data:{path:p},error:null})},download(p){return Promise.resolve(bucket[p]?{data:{size:bucket[p].body.length,type:bucket[p].o.contentType},error:null}:{data:null,error:{message:'Object not found'}})},remove(ps){ps.forEach(p=>delete bucket[p]);return Promise.resolve({data:[],error:null})}}}}}}}};
eval(fs.readFileSync(__dirname+'/../js/sync.js','utf8'));
const Sync=window.AlanSync;
(async()=>{
  const got=[],settings=[];
  const r=await Sync.init({onEvents:l=>got.push(...l),onSettings:s=>settings.push(s),onStatus(){},onReady(){calls.push(['ready'])}});
  await new Promise(r=>setTimeout(r,40));
  assert.deepStrictEqual(r,{ok:true,signedIn:true});
  // conversione righe: updated_at di Postgres normalizzato a ISO con millisecondi, who vuoto → '', deleted → _deleted
  const e=Sync._rowToEvent({id:'x',t:'5',k:'cry',who:null,data:{label:'fame',audio:true,mime:'audio/mp4'},deleted:true,updated_at:'2026-09-17T10:00:00.123456+00:00'});
  assert.deepStrictEqual(e,{id:'x',t:5,k:'cry',who:'',_updated:'2026-09-17T10:00:00.123Z',label:'fame',mime:'audio/mp4',_deleted:true});
  const row=Sync._eventToRow({id:'x',t:5,k:'cry',who:'Fabio',label:null,audio:true,audioPath:'F/x.m4a',mime:'audio/mp4',_updated:'2026-09-17T11:00:00.000Z',_deleted:true},false);
  assert.deepStrictEqual(row,{id:'x',family_id:'F',t:5,k:'cry',who:'Fabio',data:{label:null,audioPath:'F/x.m4a',mime:'audio/mp4'},deleted:false,updated_at:'2026-09-17T11:00:00.000Z'});
  // pull a pagine da 1000: 1203 righe in 2 pagine (+ una vuota o corta), cursore salvato
  assert.ok(got.length>=1203,'righe ricevute: '+got.length);
  assert.ok(calls.filter(c=>c[0]==='events'&&c[1]==='select').length>=2);
  assert.strictEqual(store['alan.sync.since'],rows[rows.length-1].updated_at);
  // canale: presence + postgres_changes su events e family_settings, presence tracciata dopo SUBSCRIBED
  Sync.setPresence({who:'Fabio',at:1});
  const chc=calls.find(c=>c[0]==='channel');assert.strictEqual(chc[1],'family-F');assert.strictEqual(chc[2].config.presence.key,'u1');
  assert.ok(ch._on.events&&ch._on.family_settings&&ch._on.presence);
  ch._on.presence();assert.deepStrictEqual(Sync.status().others,[{name:'Ilaria',at:1}]);assert.deepStrictEqual(Sync.status().online,{Fabio:true,Ilaria:true});
  assert.strictEqual(Sync.status().name,'Fabio','nome dal profilo (user_metadata.name)');
  const tr=calls.find(c=>c[0]==='track');assert.strictEqual(tr[1].name,'Fabio');
  assert.strictEqual(Sync.status().channel,'SUBSCRIBED');assert.ok(calls.some(c=>c[0]==='ready'));
  // riga realtime: UPDATE con deleted → evento _deleted; DELETE hard → _deleted
  got.length=0;
  ch._on.events({eventType:'UPDATE',new:{id:'z',family_id:'F',t:9,k:'feed',data:{},deleted:true,updated_at:'2026-09-17T12:00:00+00:00'}});
  ch._on.events({eventType:'DELETE',old:{id:'w'}});
  assert.strictEqual(got[0]._deleted,true);assert.strictEqual(got[0]._updated,'2026-09-17T12:00:00.000Z');assert.strictEqual(got[1].id,'w');assert.strictEqual(got[1]._deleted,true);
  assert.strictEqual(store['alan.sync.since'],'2026-09-17T12:00:00+00:00');
  // upsert ok → nessuna coda; errore → in outbox; flush la svuota
  await Sync.upsert({id:'a',t:1,k:'feed',ml:90,_updated:'2026-09-17T13:00:00.000Z'});assert.strictEqual(Sync.status().pending,0);
  failNext=true;const ok=await Sync.upsert({id:'b',t:2,k:'feed',ml:90});assert.strictEqual(ok,false);assert.strictEqual(Sync.status().pending,1);assert.strictEqual(Sync.status().lastError.where,'invio');
  await Sync.flush();assert.strictEqual(Sync.status().pending,0);
  // remove: deleted=true con updated_at fresco anche se l'evento ne aveva uno vecchio
  await Sync.remove({id:'a',t:1,k:'feed',_updated:'2020-01-01T00:00:00.000Z'});
  const rm=calls.filter(c=>c[1]==='upsert').pop();assert.strictEqual(rm[2].deleted,true);assert.ok(Date.now()-Date.parse(rm[2].updated_at)<2000);assert.deepStrictEqual(rm[3],{onConflict:'id'});
  // impostazioni: pull (server vuoto → null), upsert → riga con family_id, realtime → onSettings
  assert.strictEqual(settings[0],null);
  await Sync.upsertSettings({name:'Alan',birth:'2026-08-20',_updated:'2026-09-17T14:00:00.000Z'});
  const su=calls.filter(c=>c[0]==='family_settings'&&c[1]==='upsert').pop();assert.deepStrictEqual(su[2],{name:'Alan',birth:'2026-08-20',feed_h:null,updated_at:'2026-09-17T14:00:00.000Z',family_id:'F'});assert.deepStrictEqual(su[3],{onConflict:'family_id'});
  await Sync.pullSettings();assert.deepStrictEqual(settings.pop(),{name:'Alan',birth:'2026-08-20',feedH:null,_updated:'2026-09-17T14:00:00.000Z'});
  await Sync.upsertSettings({name:'Alan',birth:'2026-08-20',feedH:4,_updated:'2026-09-17T14:30:00.000Z'});
  assert.strictEqual(calls.filter(c=>c[0]==='family_settings'&&c[1]==='upsert').pop()[2].feed_h,4);
  await Sync.pullSettings();assert.strictEqual(settings.pop().feedH,4);
  ch._on.family_settings({eventType:'UPDATE',new:{family_id:'F',name:'Alan Jr',birth:'2026-08-01',feed_h:'3.5',updated_at:'2026-09-17T15:00:00+00:00'}});
  assert.deepStrictEqual(settings.pop(),{name:'Alan Jr',birth:'2026-08-01',feedH:3.5,_updated:'2026-09-17T15:00:00.000Z'});
  ch._on.family_settings({eventType:'UPDATE',new:{family_id:'F',name:'Alan Jr',birth:'2026-08-01',updated_at:'2026-09-17T15:01:00+00:00'}});
  assert.strictEqual(settings.pop().feedH,undefined,'senza colonna feed_h il campo non c\'è');
  // storage: percorso <family>/<nome>, contentType, download e rimozione
  const up=await Sync.uploadAudio('c1','BYTES','audio/mp4');assert.strictEqual(up.error,null);assert.strictEqual(up.path,'F/c1.m4a');assert.ok(bucket['F/c1.m4a']);assert.strictEqual(bucket['F/c1.m4a'].o.contentType,'audio/mp4');assert.strictEqual(bucket['F/c1.m4a'].o.upsert,true);
  assert.strictEqual((await Sync.uploadAudio('c2','B','audio/webm;codecs=opus')).path,'F/c2.webm');
  const dl=await Sync.downloadAudio('F/c1.m4a');assert.strictEqual(dl.data.type,'audio/mp4');
  await Sync.removeAudio('F/c1.m4a');assert.strictEqual(bucket['F/c1.m4a'],undefined);
  const miss=await Sync.downloadAudio('F/c1.m4a');assert.ok(miss.error);assert.strictEqual(Sync.status().lastError.where,'audio');
  // accesso rifiutato → errore riportato
  const bad=await Sync.signIn('f@x','bad');assert.strictEqual(bad.error.message,'Invalid login credentials');
  // signOut: canale rimosso, famiglia dimenticata; upsert successivi vanno in coda
  await Sync.signOut();assert.ok(calls.some(c=>c[0]==='removeChannel'));assert.strictEqual(Sync.status().family,null);
  await Sync.upsert({id:'q',t:1,k:'feed'});assert.strictEqual(Sync.status().pending,1);
  console.log('sync ok');
})().catch(e=>{console.error(e);process.exit(1);});
