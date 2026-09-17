/* Service worker: cache della shell per aprire l'app anche offline. Le chiamate a Supabase non passano di qui. */
var CACHE='alan-shell-v3';
var SHELL=['./','./index.html','./css/app.css?v=3','./js/config.js?v=3','./js/sync.js?v=3','./js/app.js?v=3','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL);}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  var url=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  if(url.origin!==self.location.origin){return;}
  e.respondWith(fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}).then(function(r){var copy=r.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy);});return r;}).catch(function(){return caches.match(e.request).then(function(m){return m||caches.match('./index.html');});}));
});
