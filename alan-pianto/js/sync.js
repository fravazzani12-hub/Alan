/* Sync con Supabase: opzionale. Se js/config.js non è compilato, l'app resta locale.
   Modello: tabella events (una riga per voce del diario), soft delete, last-writer-wins su updated_at.
   L'audio dei pianti NON viene sincronizzato (resta in IndexedDB del telefono che ha registrato). */
window.AlanSync=(function(){
  'use strict';
  var CFG=window.ALAN_CONFIG||{};
  var sb=null,session=null,familyId=null,channel=null,onEvents=null,onStatus=null,lastSync=null,flushing=false;
  var OUTBOX='alan.outbox',SINCE='alan.sync.since',SKIP=['id','t','k','who','audio','mime','_deleted','_updated'];

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
    sb.auth.onAuthStateChange(function(ev,s){session=s;if(s&&!familyId)start();if(!s){familyId=null;if(channel){try{sb.removeChannel(channel);}catch(e){}channel=null;}}notify();});
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
    channel=sb.channel('events-'+familyId)
      .on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'family_id=eq.'+familyId},function(p){
        var row=p['new']&&p['new'].id?p['new']:p.old;
        if(row&&row.id){onEvents([rowToEvent(row)]);if(row.updated_at)lsSet(SINCE,row.updated_at);lastSync=Date.now();notify();}
      })
      .subscribe();
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
  async function signIn(email){return sb.auth.signInWithOtp({email:email,options:{shouldCreateUser:true}});}
  async function verify(email,token){return sb.auth.verifyOtp({email:email,token:token,type:'email'});}
  async function signOut(){familyId=null;return sb.auth.signOut();}
  function status(){return {available:available(),signedIn:!!session,email:session&&session.user?session.user.email:null,family:familyId,lastSync:lastSync,pending:outboxGet().length};}

  if(typeof window!=='undefined'){
    window.addEventListener('online',function(){flush();pullAll();});
    document.addEventListener('visibilitychange',function(){if(!document.hidden){flush();pullAll();}});
  }
  return {init:init,upsert:upsert,remove:remove,pullAll:pullAll,signIn:signIn,verify:verify,signOut:signOut,status:status};
})();
