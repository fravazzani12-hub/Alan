/* Service worker: cache della shell (cache-first, così l'app parte anche offline) e aggiornamento esplicito.
   A OGNI RELEASE ALZA VERSION: è l'unico numero da cambiare. Il nuovo worker si installa e resta "in attesa";
   la pagina lo vede e mostra il banner "Nuova versione, tocca per aggiornare"; al tocco riceve SKIP_WAITING,
   si attiva, e la pagina si ricarica leggendo i file freschi. Le chiamate a Supabase non passano di qui. */
var VERSION='20';
var CACHE='alan-shell-'+VERSION;
var SHELL=['./','./index.html','./css/app.css','./js/who.js','./js/config.js','./js/sync.js','./js/app.js','./js/timer.js','./js/predict.js','./js/reminders.js','./js/stats.js','./js/report.js','./js/svezzamento.js','./js/momenti.js','./js/note.js','./js/noise.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];

function fresh(u){try{return new Request(u,{cache:'reload'});}catch(e){return u;}}
self.addEventListener('install',function(e){
  /* cache:'reload' salta la cache HTTP del browser: i file in cache sono davvero quelli di questa versione */
  e.waitUntil(caches.open(CACHE).then(function(c){return Promise.all(SHELL.map(function(u){return c.add(fresh(u));}));}));
  /* niente skipWaiting qui: l'attivazione parte dal tocco sul banner */
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('message',function(e){
  var d=e.data||{};
  if(d.type==='SKIP_WAITING'){self.skipWaiting();}
  else if(d.type==='GET_VERSION'){
    var msg={type:'VERSION',version:VERSION};
    if(e.ports&&e.ports[0])e.ports[0].postMessage(msg);else if(e.source)e.source.postMessage(msg);
  }
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  var key=e.request.mode==='navigate'?'./index.html':e.request;
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(key,{ignoreSearch:true}).then(function(m){
      if(m)return m;
      return fetch(e.request).then(function(r){if(r&&r.ok)c.put(e.request,r.clone());return r;});
    });
  }).catch(function(){return caches.match('./index.html');}));
});
