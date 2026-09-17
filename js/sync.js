/* Sync con Supabase (supabase-js v2, UMD): opzionale. Se js/config.js non è compilato, l'app resta locale.
   Accesso con email e password: gli utenti si creano nella dashboard Supabase (Authentication → Users), nessuna email in gioco.
   Modello: tabella events (una riga per voce del diario), soft delete, last-writer-wins su updated_at.
   Contratto con app.js: ogni mutazione locale passa da upsert(e)/remove(e); le righe remote entrano da opts.onEvents(list),
   già convertite in eventi piatti (campo _updated = ISO UTC con millisecondi, _deleted = true per il soft delete).
   Impostazioni (nome, nascita): tabella family_settings, una riga per famiglia, stesso last-writer-wins; entrano da opts.onSettings(row|null).
   Audio dei pianti: bucket privato "cries", oggetto <family_id>/<id>.<ext>; upload dopo il salvataggio, download on-demand. */
window.AlanSync=(function(){
  'use strict';
  var CFG=window.ALAN_CONFIG||{};
  var sb=null,session=null,familyId=null,channel=null,onEvents=null,onStatus=null,onReady=null,onSettings=null,lastSync=null,flushing=false;
  var starting=false,chanStatus='off',lastError=null,others=[],online={},presenceMeta=null,retryT=null,retryMs=2000;
  /* nome mostrato: user_metadata.name (blocco 7 dello schema), altrimenti la parte locale dell'email */
  function nameFromSession(){if(!session||!session.user)return null;var u=session.user,m=u.user_metadata||{};if(m.name)return m.name;var lp=(u.email||'').split('@')[0];return lp?lp.charAt(0).toUpperCase()+lp.slice(1):null;}
  var OUTBOX='alan.outbox',SINCE='alan.sync.since',SETBOX='alan.settings.outbox',PAGE=1000;
  var SKIP=['id','t','k','who','audio','_deleted','_updated'];

  function configured(){return !!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&CFG.SUPABASE_URL.indexOf('INSERISCI')<0);}
  function available(){return !!(window.supabase&&configured());}
  function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function outboxGet(){try{return JSON.parse(lsGet(OUTBOX)||'[]');}catch(e){return [];}}
  function outboxSet(a){lsSet(OUTBOX,JSON.stringify(a));}
  function notify(){if(onStatus)try{onStatus();}catch(e){}}
  function fail(where,err){lastError={where:where,msg:err&&(err.message||err.error_description||String(err))||'errore',at:Date.now()};notify();}
  /* Postgres restituisce timestamptz come "2026-09-17T10:00:00.123456+00:00", il client genera "2026-09-17T10:00:00.123Z":
     confrontati come stringhe darebbero l'ordine sbagliato. Si normalizza tutto a ISO UTC con millisecondi. */
  function isoMs(v){if(!v)return null;var d=new Date(v);return isNaN(d)?null:d.toISOString();}

  function rowToEvent(r){
    var e={id:r.id,t:Number(r.t),k:r.k,who:r.who||'',_updated:isoMs(r.updated_at)};
    var d=r.data||{};for(var k in d)if(SKIP.indexOf(k)<0)e[k]=d[k];
    if(r.deleted)e._deleted=true;
    return e;
  }
  function eventToRow(e,deleted){
    var data={};for(var k in e)if(SKIP.indexOf(k)<0)data[k]=e[k];
    return {id:e.id,family_id:familyId,t:e.t,k:e.k,who:e.who||null,data:data,deleted:!!deleted,updated_at:e._updated||new Date().toISOString()};
  }

  async function init(opts){
    onEvents=opts.onEvents;onStatus=opts.onStatus||null;onReady=opts.onReady||null;onSettings=opts.onSettings||null;
    if(!available())return {ok:false,reason:'noconfig'};
    sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    var got=await sb.auth.getSession();session=got&&got.data?got.data.session:null;
    /* Il callback gira dentro il lock dell'auth: qualsiasi chiamata a sb.* qui dentro può bloccarsi (deadlock documentato).
       Si rimanda tutto a un tick successivo. */
    sb.auth.onAuthStateChange(function(ev,s){
      session=s;
      setTimeout(function(){
        if(s&&!familyId)start();
        if(!s)stopChannel();
        notify();
      },0);
    });
    if(session)await start();
    return {ok:true,signedIn:!!session};
  }
  async function start(){
    if(starting||familyId)return;starting=true;
    try{
      familyId=await loadFamily();notify();
      if(!familyId)return;
      await pullAll();await pullSettings();subscribe();await flush();
      if(onReady)try{onReady();}catch(e){}
    }finally{starting=false;}
  }
  async function loadFamily(){
    var r=await sb.from('family_members').select('family_id').limit(1);
    if(r.error){fail('famiglia',r.error);return null;}
    return r.data&&r.data[0]?r.data[0].family_id:null;
  }
  /* Pull incrementale per updated_at, a pagine: PostgREST non restituisce più di 1000 righe per chiamata. */
  async function pullAll(){
    if(!sb||!familyId)return false;
    var since=lsGet(SINCE),got=0;
    for(var guard=0;guard<50;guard++){
      var q=sb.from('events').select('*').eq('family_id',familyId);
      if(since)q=q.gt('updated_at',since);
      var r=await q.order('updated_at',{ascending:true}).limit(PAGE);
      if(r.error){fail('pull',r.error);return false;}
      if(!r.data||!r.data.length)break;
      onEvents(r.data.map(rowToEvent));
      since=r.data[r.data.length-1].updated_at;lsSet(SINCE,since);got+=r.data.length;
      if(r.data.length<PAGE)break;
    }
    lastSync=Date.now();notify();return true;
  }
  function settingsRowToObj(r){if(!r)return null;var o={name:r.name,birth:r.birth,_updated:isoMs(r.updated_at)};if(r.feed_h!==undefined)o.feedH=r.feed_h!=null?Number(r.feed_h):null;return o;}
  async function pullSettings(){
    if(!sb||!familyId||!onSettings)return;
    var r=await sb.from('family_settings').select('*').eq('family_id',familyId).maybeSingle();
    if(r.error){fail('impostazioni',r.error);return;}
    try{onSettings(settingsRowToObj(r.data));}catch(e){}
  }
  async function upsertSettings(st){
    var row={name:st.name||null,birth:st.birth||null,feed_h:st.feedH>0?st.feedH:null,updated_at:st._updated||new Date().toISOString()};
    if(!sb||!familyId){lsSet(SETBOX,JSON.stringify(row));return false;}
    row.family_id=familyId;
    var r=await sb.from('family_settings').upsert(row,{onConflict:'family_id'});
    /* schema non ancora aggiornato (colonna feed_h assente): salva almeno nome e data */
    if(r.error&&/feed_h/.test(String(r.error.message||''))){var row2={};for(var k in row)if(k!=='feed_h')row2[k]=row[k];r=await sb.from('family_settings').upsert(row2,{onConflict:'family_id'});if(!r.error)fail('impostazioni',{message:'intervallo pappe non condiviso: esegui supabase/schema.sql (colonna feed_h)'});}
    if(r.error){fail('impostazioni',r.error);lsSet(SETBOX,JSON.stringify(row));return false;}
    try{localStorage.removeItem(SETBOX);}catch(e){}
    lastSync=Date.now();notify();return true;
  }
  function onSettingsRow(p){
    var row=p['new']&&p['new'].family_id?p['new']:null;
    if(row&&onSettings){try{onSettings(settingsRowToObj(row));}catch(e){}}
  }
  function onRow(p){
    var row;
    if(p.eventType==='DELETE'){row=p.old&&p.old.id?{id:p.old.id,deleted:true,t:0}:null;}
    else row=p['new']&&p['new'].id?p['new']:null;
    if(!row)return;
    onEvents([rowToEvent(row)]);
    if(row.updated_at)lsSet(SINCE,row.updated_at);
    lastSync=Date.now();notify();
  }
  function stopChannel(){
    clearTimeout(retryT);retryT=null;
    var c=channel;channel=null;familyId=null;chanStatus='off';others=[];online={};
    if(c){try{sb.removeChannel(c);}catch(e){}}
  }
  function subscribe(){
    if(!sb||!familyId)return;
    if(channel){try{sb.removeChannel(channel);}catch(e){}channel=null;}
    clearTimeout(retryT);retryT=null;
    var key=session&&session.user?session.user.id:('anon-'+Math.random().toString(36).slice(2));
    var ch=sb.channel('family-'+familyId,{config:{presence:{key:key}}});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'family_id=eq.'+familyId},onRow)
      .on('postgres_changes',{event:'*',schema:'public',table:'family_settings',filter:'family_id=eq.'+familyId},onSettingsRow)
      .on('presence',{event:'sync'},function(){
        var st=ch.presenceState(),list=[],o={};
        for(var k in st){if(!st[k]||!st[k].length)continue;var last=st[k][st[k].length-1];if(last&&last.name)o[last.name]=true;if(k!==key)list.push(last);}
        others=list;online=o;notify();
      })
      .subscribe(function(status,err){
        chanStatus=status||'?';
        if(status==='SUBSCRIBED'){retryMs=2000;ch.track(presencePayload()).catch(function(){});pullAll();pullSettings();}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){if(err)fail('realtime',err);scheduleRetry();}
        else if(status==='CLOSED'){if(channel===ch)scheduleRetry();}
        notify();
      });
    channel=ch;chanStatus='joining';
  }
  function scheduleRetry(){
    if(retryT||!familyId)return;
    retryT=setTimeout(function(){retryT=null;if(familyId&&!(channel&&channel.state==='joined'))subscribe();},retryMs);
    retryMs=Math.min(60000,retryMs*2);
  }
  function presencePayload(){var n=nameFromSession()||(presenceMeta&&presenceMeta.who)||'?';return {name:n,who:n,at:Date.now()};}
  function setPresence(meta){
    presenceMeta=meta;
    if(channel&&channel.state==='joined')channel.track(presencePayload()).catch(function(){});
  }
  async function send(e,deleted){
    if(!sb||!familyId){queue(e,deleted);return false;}
    var r=await sb.from('events').upsert(eventToRow(e,deleted),{onConflict:'id'});
    if(r.error){fail('invio',r.error);queue(e,deleted);return false;}
    lastSync=Date.now();notify();return true;
  }
  function queue(e,deleted){
    var ob=outboxGet().filter(function(x){return x.e.id!==e.id;});
    ob.push({e:e,deleted:!!deleted});outboxSet(ob);notify();
  }
  async function flush(){
    if(flushing||!sb||!familyId)return;flushing=true;
    try{
      var ob=outboxGet(),rest=[];
      for(var i=0;i<ob.length;i++){
        var r=await sb.from('events').upsert(eventToRow(ob[i].e,ob[i].deleted),{onConflict:'id'});
        if(r.error){fail('invio',r.error);rest.push(ob[i]);}
      }
      outboxSet(rest);if(ob.length&&!rest.length)lastSync=Date.now();
      var pend=null;try{pend=JSON.parse(lsGet(SETBOX)||'null');}catch(e){}
      if(pend)await upsertSettings({name:pend.name,birth:pend.birth,feedH:pend.feed_h,_updated:pend.updated_at});
    }finally{flushing=false;notify();}
  }
  function upsert(e){return send(e,false);}
  /* La cancellazione è una modifica: updated_at deve essere adesso, altrimenti il pull incrementale dell'altro telefono
     (gt updated_at) non la vedrebbe mai se perde il messaggio realtime. */
  function remove(e){var c={};for(var k in e)c[k]=e[k];c._updated=new Date().toISOString();return send(c,true);}
  /* Storage: oggetto <family_id>/<id>.<ext>; il percorso completo viene salvato nell'evento come e.audioPath. */
  function extFor(mime){mime=String(mime||'').toLowerCase();if(mime.indexOf('mp4')>=0||mime.indexOf('aac')>=0)return 'm4a';if(mime.indexOf('webm')>=0)return 'webm';if(mime.indexOf('ogg')>=0)return 'ogg';if(mime.indexOf('wav')>=0)return 'wav';return 'bin';}
  async function uploadAudio(id,body,mime){
    if(!sb||!familyId)return {path:null,error:'non collegato'};
    var path=familyId+'/'+id+'.'+extFor(mime);
    var r=await sb.storage.from('cries').upload(path,body,{contentType:mime||'application/octet-stream',upsert:true});
    if(r.error){fail('audio',r.error);return {path:null,error:r.error.message||String(r.error)};}
    return {path:path,error:null};
  }
  async function downloadAudio(path){
    if(!sb||!familyId)return {data:null,error:{message:'non collegato'}};
    var r=await sb.storage.from('cries').download(path);
    if(r.error)fail('audio',r.error);
    return r;
  }
  async function removeAudio(path){
    if(!sb||!familyId)return {data:null,error:{message:'non collegato'}};
    return sb.storage.from('cries').remove([path]);
  }
  async function signIn(email,password){
    if(!sb)return {error:{message:'sync non configurato'}};
    var r=await sb.auth.signInWithPassword({email:email,password:password});
    if(r.error)fail('accesso',r.error);
    return r;
  }
  async function signOut(){if(!sb)return;stopChannel();return sb.auth.signOut();}
  function status(){
    return {available:available(),configured:configured(),lib:!!window.supabase,signedIn:!!session,email:session&&session.user?session.user.email:null,name:nameFromSession(),online:online,userId:session&&session.user?session.user.id:null,
      family:familyId,lastSync:lastSync,pending:outboxGet().length,channel:chanStatus,channelState:channel?channel.state:null,others:others,lastError:lastError};
  }
  function wake(){
    if(!sb||!familyId)return;
    flush();pullAll();pullSettings();
    if(!channel||channel.state!=='joined')subscribe();
  }

  if(typeof window!=='undefined'){
    window.addEventListener('online',wake);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)wake();});
  }
  return {init:init,upsert:upsert,remove:remove,pullAll:pullAll,pullSettings:pullSettings,upsertSettings:upsertSettings,flush:flush,signIn:signIn,signOut:signOut,status:status,setPresence:setPresence,wake:wake,
    uploadAudio:uploadAudio,downloadAudio:downloadAudio,removeAudio:removeAudio,
    _rowToEvent:rowToEvent,_eventToRow:eventToRow};
})();
