/* Sync con Supabase: opzionale. Se js/config.js non è compilato, l'app resta locale.
   Accesso con email e password: gli utenti si creano nella dashboard Supabase (Authentication → Users), nessuna email in gioco.
   Modello: tabella events (una riga per voce del diario), soft delete, last-writer-wins su updated_at.
   Gli audio dei pianti vanno nel bucket privato Storage "cries" (<family_id>/<event_id>.<ext>) e si scaricano on-demand.
   Presence sul canale realtime della famiglia: chi ha l'app aperta risulta "online" nell'intestazione. */
window.AlanSync=(function(){
  'use strict';
  var CFG=window.ALAN_CONFIG||{};
  var sb=null,session=null,familyId=null,channel=null,onEvents=null,onStatus=null,lastSync=null,flushing=false;
  var OUTBOX='alan.outbox',SINCE='alan.sync.since',SKIP=['id','t','k','who','audio','mime','_deleted','_updated','_up'];
  var online={};
  function nameFromSession(){if(!session||!session.user)return null;var u=session.user,m=u.user_metadata||{};if(m.name)return m.name;var lp=(u.email||'').split('@')[0];return lp?lp.charAt(0).toUpperCase()+lp.slice(1):null;}

  function available(){return !!(window.supabase&&CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&CFG.SUPABASE_URL.indexOf('INSERISCI')<0);}
  function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function outboxGet(){try{return JSON.parse(lsGet(OUTBOX)||'[]');}catch(e){return [];}}
  function outboxSet(a){lsSet(OUTBOX,JSON.stringify(a));}
  function notify(){if(onStatus)try{onStatus();}catch(e){}}

  function rowToEvent(r){
    var e={id:r.id,t:Number(r.t),k:r.k,who:r.who||'',_updated:r.updated_at};
    var d=r.data||{};for(var k in d)e[k]=d[k];
    if(r.deleted)e._deleted=true;
    return e;
  }
  function eventToRow(e,deleted){
    var data={};for(var k in e)if(SKIP.indexOf(k)<0)data[k]=e[k];
    return {id:e.id,family_id:familyId,t:e.t,k:e.k,who:e.who||null,data:data,deleted:!!deleted,updated_at:e._updated||new Date().toISOString()};
  }

  async function init(opts){
    onEvents=opts.onEvents;onStatus=opts.onStatus||null;
    if(!available())return {ok:false,reason:'noconfig'};
    sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
    var got=await sb.auth.getSession();session=got&&got.data?got.data.session:null;
    sb.auth.onAuthStateChange(function(ev,s){session=s;if(s&&!familyId)start();if(!s){familyId=null;online={};if(channel){try{sb.removeChannel(channel);}catch(e){}channel=null;}}notify();});
    if(session)await start();
    return {ok:true,signedIn:!!session};
  }
  async function start(){
    familyId=await loadFamily();notify();
    if(!familyId)return;
    await pullAll();subscribe();flush();
  }
  async function loadFamily(){
    var r=await sb.from('family_members').select('family_id').limit(1);
    return r&&r.data&&r.data[0]?r.data[0].family_id:null;
  }
  async function pullAll(){
    if(!familyId)return;
    var since=lsGet(SINCE);
    var q=sb.from('events').select('*').eq('family_id',familyId);
    if(since)q=q.gt('updated_at',since);
    var r=await q.order('updated_at',{ascending:true}).limit(5000);
    if(r.error||!r.data)return;
    if(r.data.length){onEvents(r.data.map(rowToEvent));lsSet(SINCE,r.data[r.data.length-1].updated_at);}
    lastSync=Date.now();notify();
  }
  function subscribe(){
    if(channel)return;
    var myKey=session&&session.user?session.user.id:('anon-'+Math.random().toString(36).slice(2));
    channel=sb.channel('family-'+familyId,{config:{presence:{key:myKey}}})
      .on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'family_id=eq.'+familyId},function(p){
        var row=p['new']&&p['new'].id?p['new']:p.old;
        if(row&&row.id){onEvents([rowToEvent(row)]);if(row.updated_at)lsSet(SINCE,row.updated_at);lastSync=Date.now();notify();}
      })
      .on('presence',{event:'sync'},function(){
        var st=channel.presenceState(),o={};
        for(var k in st)(st[k]||[]).forEach(function(pr){if(pr&&pr.name)o[pr.name]=true;});
        online=o;notify();
      })
      .subscribe(function(status){
        if(status==='SUBSCRIBED'){var n=nameFromSession();if(n)channel.track({name:n,at:Date.now()});}
      });
  }
  function extFor(mime){mime=mime||'';if(mime.indexOf('mp4')>=0)return 'm4a';if(mime.indexOf('webm')>=0)return 'webm';if(mime.indexOf('ogg')>=0)return 'ogg';return 'bin';}
  async function uploadAudio(id,blob,mime){
    if(!sb||!familyId)return null;
    var path=familyId+'/'+id+'.'+extFor(mime);
    var r=await sb.storage.from('cries').upload(path,blob,{contentType:mime||'application/octet-stream',upsert:true});
    if(r.error)return {error:r.error.message};
    return {path:path};
  }
  async function downloadAudio(path){
    if(!sb||!familyId)return null;
    var r=await sb.storage.from('cries').download(path);
    return r.error?null:r.data;
  }
  async function send(e,deleted){
    if(!sb||!familyId){queue(e,deleted);return false;}
    var r=await sb.from('events').upsert(eventToRow(e,deleted),{onConflict:'id'});
    if(r.error){queue(e,deleted);return false;}
    lastSync=Date.now();notify();return true;
  }
  function queue(e,deleted){
    var ob=outboxGet().filter(function(x){return x.e.id!==e.id;});
    ob.push({e:e,deleted:!!deleted});outboxSet(ob);
  }
  async function flush(){
    if(flushing||!sb||!familyId)return;flushing=true;
    var ob=outboxGet(),rest=[];
    for(var i=0;i<ob.length;i++){
      var r=await sb.from('events').upsert(eventToRow(ob[i].e,ob[i].deleted),{onConflict:'id'});
      if(r.error)rest.push(ob[i]);
    }
    outboxSet(rest);flushing=false;
  }
  function upsert(e){return send(e,false);}
  function remove(e){return send(e,true);}
  async function signIn(email,password){return sb.auth.signInWithPassword({email:email,password:password});}
  async function signOut(){familyId=null;return sb.auth.signOut();}
  function status(){return {available:available(),signedIn:!!session,email:session&&session.user?session.user.email:null,name:nameFromSession(),family:familyId,online:online,lastSync:lastSync,pending:outboxGet().length};}

  if(typeof window!=='undefined'){
    window.addEventListener('online',function(){flush();pullAll();});
    document.addEventListener('visibilitychange',function(){if(!document.hidden){flush();pullAll();}});
  }
  return {init:init,upsert:upsert,remove:remove,pullAll:pullAll,signIn:signIn,signOut:signOut,status:status,uploadAudio:uploadAudio,downloadAudio:downloadAudio};
})();
