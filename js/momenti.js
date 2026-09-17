/* Estensione "momenti": la tab Momenti, un album di famiglia dentro l'app.
   Eventi salvati (piatti, sincronizzati come tutti gli altri):
     moment {kind:'first', code, title}                  una prima volta; t = mezzogiorno del giorno scelto (oggi = adesso)
     moment {kind:'photo'|'story', text, photo, photoPath, mime}  un momento raccontato, con o senza foto
     letter {text}                                       una lettera di un genitore ("cosa vorrei ricordare di questa settimana")
   Foto: ridimensionate sul telefono (lato lungo ≤ 1280 px, JPEG 0,82) e salvate in IndexedDB (store files, {buf,mime});
   poi caricate nel bucket con lo stesso giro dell'audio dei pianti: coda in localStorage 'alan.momenti.outbox', riprova su
   'change', al ritorno della rete e all'apertura. e.photo=true dice che il momento ha una foto; se la foto è sul telefono lo
   si scopre con fileGet quando si apre la griglia; sull'altro telefono si scarica al primo tap e resta in files.
   Nessun range d'età "atteso" per le prime volte, nessun confronto: solo quando è successo e a che età. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var OUTBOX='alan.momenti.outbox',MAX_SIDE=1280,QUALITY=0.82,CAPTION_MAX=80,LETTER_MAX=4000,STORY_N=5,H=API.H,DAY=864e5;
var FIRSTS=[
  ['sorriso','Primo sorriso'],['risata','Prima risata'],['notte5','Prima notte di 5 ore'],['pancia','Prima volta a pancia in giù con la testa su'],
  ['bagnetto','Primo bagnetto'],['passeggiata','Prima passeggiata'],['vocalizzo','Primo vocalizzo'],['presa','Prima presa di un oggetto'],
  ['cucchiaio','Prima pappa con il cucchiaio'],['dentino','Primo dentino'],['gira','Si gira da solo'],['seduto','Sta seduto'],
  ['gattona','Gattona'],['parole','Prime parole'],['passi','Primi passi']
];
var PHRASES=[
  'Le giornate sono lunghe, le settimane volano.',
  'Ogni notte è diversa da quella prima.',
  'Il tempo si misura a pappe e pisolini.',
  'Un sorriso alle tre di notte non si dimentica.',
  'Le mani afferrano tutto, soprattutto i capelli.',
  'Il silenzio, quando arriva, si sente.',
  'Cresce mentre dorme. Anche mentre non dorme.',
  'Ci sono giorni in cui la doccia è un traguardo.',
  'La tutina di ieri oggi è già un po\' stretta.',
  'Nessuno sa bene come si fa, e intanto si fa.',
  'Il primo mese non finisce mai; poi è finito.',
  'Ogni pianto ha un motivo, anche quando non lo capiamo.',
  'Le nonne lo sapevano già.',
  'Il caffè si beve tiepido, ma si beve.',
  'Così piccolo, e occupa tutta la casa.',
  'Ci sono sere in cui basta il suo respiro.',
  'Un ruttino può essere la notizia della giornata.',
  'Le foto di oggi tra un anno sembreranno di un altro bambino.',
  'Di notte si impara quello che non è scritto da nessuna parte.',
  'Il mondo intero sta in una stanza con la luce bassa.'
];
var known={},urls={},uploading={},pending=null,lastSig=null,checking=false;

/* ---------- testo ---------- */
function clean(s,max){return String(s==null?'':s).replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').trim().slice(0,max);}
function babyName(){return API.settings().name||'Alan';}
function dayOfYear(d){d=d||new Date();return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,1))/DAY);}
/* la frase del giorno dipende solo dal giorno dell'anno: uguale sui due telefoni, cambia a mezzanotte */
function phrase(d){return PHRASES[dayOfYear(d)%PHRASES.length];}
function ageWords(days){
  if(days==null)return '';
  if(days<=0)return 'il primo giorno';
  if(days<7)return 'a '+days+(days===1?' giorno':' giorni');
  var w=Math.floor(days/7),r=days%7,s='a '+w+(w===1?' settimana':' settimane');
  if(r)s+=' e '+r+(r===1?' giorno':' giorni');
  return s;
}
function ageAt(t){return ageWords(API.ageDaysAt(t));}
function headline(){
  var a=API.ageStr(),n=babyName();
  if(!a)return API.esc(n);
  if(a==='in arrivo')return API.esc(n)+' è in arrivo';
  return API.esc(n)+' oggi ha '+API.esc(a);
}
/* t del "quando": oggi = adesso, un altro giorno = mezzogiorno */
function tOf(date){var now=Date.now();if(!date||date===API.isoDay(now))return now;var n=API.noon(date);return n==null||n>now?now:n;}
function firstOf(code){for(var i=0;i<FIRSTS.length;i++)if(FIRSTS[i][0]===code)return {code:FIRSTS[i][0],title:FIRSTS[i][1]};return null;}

/* ---------- dati ---------- */
function moments(){return API.sorted().filter(function(e){return e.k==='moment';});}
function letters(){return API.sorted().filter(function(e){return e.k==='letter'&&e.text;}).reverse();}
function photos(){return moments().filter(function(e){return e.photo;}).reverse();}
function stories(){return moments().filter(function(e){return e.kind!=='first'&&e.text;}).reverse();}
/* prime volte: fatte in ordine di data (una per tappa, la più vecchia se registrata due volte), poi quelle da fare in ordine di elenco */
function firsts(){
  var by={};
  moments().forEach(function(e){if(e.kind!=='first'||!e.code)return;if(!by[e.code]||e.t<by[e.code].t)by[e.code]=e;});
  var done=[],todo=[];
  FIRSTS.forEach(function(f){var e=by[f[0]];if(e)done.push({code:f[0],title:f[1],e:e,age:ageAt(e.t)});else todo.push({code:f[0],title:f[1]});});
  done.sort(function(a,b){return a.e.t-b.e.t;});
  return {done:done,todo:todo};
}
/* ultimi 7 giorni: fatti, non giudizi. Notti = finestre 22–7 come il riepilogo in Home. */
function week(now){
  now=now||Date.now();var from=now-7*DAY,ev=API.sorted();
  var inW=ev.filter(function(e){return e.t>=from&&e.t<=now;});
  var feeds=inW.filter(function(e){return e.k==='feed'&&API.fedFeed(e);}).length;
  var cries=inW.filter(function(e){return e.k==='cry';}),explained=cries.filter(function(e){return !!e.label;}).length;
  var mom=inW.filter(function(e){return e.k==='moment';}).length,let_=inW.filter(function(e){return e.k==='letter';}).length;
  var d=new Date(now),today7=new Date(d.getFullYear(),d.getMonth(),d.getDate(),7,0,0).getTime();
  var nights=[],k;
  for(k=0;k<7;k++){var end7=today7-k*DAY,start=end7-9*H,end=Math.min(end7,now);if(start<end)nights.push({start:start,end:end,sleep:0});}
  var cur=null;
  ev.forEach(function(e){
    if(e.k==='sleep'){cur=e.t;return;}
    if(e.k!=='wake'||cur==null)return;
    nights.forEach(function(n){var a=Math.max(cur,n.start),b=Math.min(e.t,n.end);if(b>a)n.sleep+=b-a;});cur=null;
  });
  if(cur!=null)nights.forEach(function(n){var a=Math.max(cur,n.start),b=Math.min(now,n.end);if(b>a)n.sleep+=b-a;});
  var slept=nights.filter(function(n){return n.sleep>0;}),avg=null;
  if(slept.length)avg=slept.reduce(function(s,n){return s+n.sleep;},0)/slept.length;
  var ups={},total=0;
  nights.forEach(function(n){ev.forEach(function(e){if(e.t<n.start||e.t>n.end)return;if(!(e.k==='feed'||e.k==='diaper'||e.k==='other'||e.k==='med'))return;if(!e.who||e.who==='Io')return;ups[e.who]=(ups[e.who]||0)+1;total++;});});
  return {feeds:feeds,cries:cries.length,explained:explained,moments:mom,letters:let_,sleepAvg:avg,nights:slept.length,ups:ups,upsTotal:total};
}
function teamText(w){
  var names=Object.keys(w.ups).sort(function(a,b){return w.ups[b]-w.ups[a]||(a<b?-1:1);});
  if(!names.length)return 'Nessuna alzata notturna registrata negli ultimi sette giorni.';
  var parts=names.map(function(n){return API.esc(n)+' '+w.ups[n];}).join(', ');
  if(names.length===1)return w.ups[names[0]]===1?'Di notte un\'alzata sola, di '+API.esc(names[0])+'.':'Di notte '+w.ups[names[0]]+' alzate, tutte di '+API.esc(names[0])+'.';
  return 'Di notte vi siete alzati '+w.upsTotal+' volte in tutto: '+parts+'. Squadra.';
}

/* ---------- foto: ridimensionamento (sostituibile: AlanExt.momenti.resize) ---------- */
function resize(file){
  return new Promise(function(res,rej){
    if(typeof URL==='undefined'||!URL.createObjectURL||typeof Image==='undefined'){rej(new Error('immagini non supportate'));return;}
    var url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){
      var w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,s=Math.min(1,MAX_SIDE/Math.max(w,h,1));
      var cw=Math.max(1,Math.round(w*s)),ch=Math.max(1,Math.round(h*s)),c=document.createElement('canvas');
      c.width=cw;c.height=ch;
      try{c.getContext('2d').drawImage(img,0,0,cw,ch);}catch(e){URL.revokeObjectURL(url);rej(e);return;}
      URL.revokeObjectURL(url);
      var done=function(blob){if(!blob){rej(new Error('canvas vuoto'));return;}API.blobToBuf(blob).then(function(buf){res({buf:buf,mime:'image/jpeg',w:cw,h:ch});},rej);};
      try{if(c.toBlob)c.toBlob(done,'image/jpeg',QUALITY);else done(dataUrlBlob(c.toDataURL('image/jpeg',QUALITY)));}catch(e){rej(e);}
    };
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('immagine non leggibile'));};
    img.src=url;
  });
}
function dataUrlBlob(du){var b=atob(du.split(',')[1]),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Blob([a],{type:'image/jpeg'});}
function objUrl(buf,mime){try{if(typeof URL==='undefined'||!URL.createObjectURL)return null;return URL.createObjectURL(new Blob([buf],{type:mime||'image/jpeg'}));}catch(e){return null;}}
function urlFor(id,v){if(urls[id])return urls[id];var u=v&&v.buf?objUrl(v.buf,v.mime):null;if(u)urls[id]=u;return u;}

/* ---------- foto: archivio locale e coda verso il cloud ---------- */
function outbox(){try{var a=JSON.parse(API.lsGet(OUTBOX)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function setOutbox(a){API.lsSet(OUTBOX,JSON.stringify(a));}
function dropOut(id){setOutbox(outbox().filter(function(x){return x!==id;}));}
function queue(id){var ob=outbox();if(ob.indexOf(id)<0){ob.push(id);setOutbox(ob);}flush();}
function storePhoto(e,p){
  return API.filePut(e.id,{buf:p.buf,mime:p.mime||'image/jpeg'}).then(function(ok){
    known[e.id]=ok?'local':'none';if(ok&&p.url)urls[e.id]=p.url;
    if(!ok){API.toast('Foto non salvata sul telefono');return false;}
    queue(e.id);repaintAlbum();return true;
  });
}
function flush(){
  var ob=outbox();if(!ob.length)return Promise.resolve(0);
  if(!API.syncReady())return Promise.resolve(0);
  var n=0;
  return Promise.all(ob.map(function(id){
    if(uploading[id])return null;
    var e=API.byId(id);
    if(!e){dropOut(id);return null;}
    if(e.photoPath){dropOut(id);return null;}
    uploading[id]=true;
    return API.fileGet(id).then(function(v){
      if(!v||!v.buf){dropOut(id);return null;}
      var mime=v.mime||'image/jpeg',blob=new Blob([v.buf],{type:mime});
      return API.cloudUpload(id,blob,mime).then(function(r){
        if(!r||r.error||!r.path){API.lsSet('alan.momenti.lastUpload',r&&r.error?String(r.error):'nessuna risposta');return null;}
        e.photoPath=r.path;e.mime=mime;API.touched(e);API.save();dropOut(id);n++;return r.path;
      });
    }).catch(function(){return null;}).then(function(r){delete uploading[id];return r;});
  })).then(function(){return n;});
}
/* controlla quali foto sono sul telefono (una volta per id), poi ridisegna la griglia se qualcosa è cambiato */
function checkLocal(){
  var ids=photos().map(function(e){return e.id;}).filter(function(id){return !known[id];});
  if(!ids.length||checking)return Promise.resolve(false);
  checking=true;
  return Promise.all(ids.map(function(id){return API.fileGet(id).then(function(v){known[id]=v&&v.buf?'local':(API.byId(id)&&API.byId(id).photoPath?'remote':'none');if(v&&v.buf)urlFor(id,v);},function(){known[id]='none';});})).then(function(){checking=false;repaintAlbum();return true;},function(){checking=false;});
}
function download(id,btn){
  var e=API.byId(id);if(!e||!e.photoPath)return Promise.resolve(false);
  if(!API.syncReady()){var st=API.sync()?API.sync().status():null;API.toast(st&&st.signedIn?'Non collegato: riprova con la rete':'Serve l\'accesso in Altro → Account');return Promise.resolve(false);}
  API.busy(btn,true,'…');
  return API.cloudDownload(e.photoPath).then(function(r){
    if(!r||r.error||!r.data)throw new Error(r&&r.error&&r.error.message?r.error.message:'risposta vuota');
    return API.blobToBuf(r.data).then(function(buf){var mime=e.mime||r.data.type||'image/jpeg';return API.filePut(id,{buf:buf,mime:mime}).then(function(ok){known[id]='local';urlFor(id,{buf:buf,mime:mime});return ok;});});
  }).then(function(){API.busy(btn,false);repaintAlbum();return true;},function(err){API.busy(btn,false);known[id]='remote';API.toast('Foto non scaricata: '+(err&&err.message?err.message:'errore'));return false;});
}
function fileBlob(id){return API.fileGet(id).then(function(v){return v&&v.buf?new Blob([v.buf],{type:v.mime||'image/jpeg'}):null;});}
/* condivisione (sostituibile): File via navigator.share se il sistema lo accetta, altrimenti download */
function shareFile(blob,name,title){
  try{
    if(typeof navigator!=='undefined'&&navigator.canShare&&typeof File!=='undefined'){
      var f=new File([blob],name,{type:blob.type||'image/jpeg'});
      if(navigator.canShare({files:[f]}))return navigator.share({files:[f],title:title}).then(function(){return 'share';},function(){return 'cancel';});
    }
  }catch(e){}
  if(typeof URL==='undefined'||!URL.createObjectURL)return Promise.resolve('none');
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){try{URL.revokeObjectURL(a.href);a.remove();}catch(e){}},2000);
  return Promise.resolve('download');
}

/* ---------- azioni ---------- */
function cur(type){var f=API.flow();return f&&f.type===type?f:null;}
function repaint(){var f=API.flow();if(f&&X.momenti.flows[f.type])API.q('#screenInner').innerHTML=X.momenti.flows[f.type].render(f,API);}
function repaintAlbum(){if(API.flow()||API.curView()!=='momenti')return;var el=document.getElementById?document.getElementById('mo-album'):null;if(el)el.innerHTML=albumInner();else render();}
function first(code){if(!firstOf(code))return;pending=null;window.A.flow('moment',null,{kind:'first',code:code});}
function tell(){pending=null;window.A.flow('moment',null,{kind:'photo',text:''});}
function write(){window.A.flow('letter',null,{text:''});}
function caption(v){var f=cur('moment');if(f)f.data.text=String(v==null?'':v).slice(0,CAPTION_MAX);}
function text(v){var f=cur('letter');if(f)f.data.text=String(v==null?'':v).slice(0,LETTER_MAX);}
function pick(input){
  var f=cur('moment'),file=input&&input.files&&input.files[0];
  if(!f||!file)return Promise.resolve(false);
  pending={busy:true};repaint();
  return X.momenti.resize(file).then(function(r){
    if(!cur('moment')){pending=null;return false;}
    pending={buf:r.buf,mime:r.mime||'image/jpeg',w:r.w,h:r.h,kb:Math.round((r.buf.byteLength||0)/1024),url:objUrl(r.buf,r.mime)};
    repaint();return true;
  },function(err){pending=null;API.toast('Non riesco a leggere la foto'+(err&&err.message?': '+err.message:''));repaint();return false;});
}
function unpick(){if(pending&&pending.url&&typeof URL!=='undefined'&&URL.revokeObjectURL)try{URL.revokeObjectURL(pending.url);}catch(e){}pending=null;repaint();}
function openPhoto(id,btn){
  var e=API.byId(id);if(!e)return Promise.resolve(false);
  if(known[id]==='local'){window.A.flow('momentview',null,{id:id});return Promise.resolve(true);}
  if(!e.photoPath){API.toast(e.photo?'La foto è ancora sull\'altro telefono: arriva alla prossima rete':'Nessuna foto per questo momento');return Promise.resolve(false);}
  return download(id,btn).then(function(ok){if(ok)window.A.flow('momentview',null,{id:id});return ok;});
}
function openLetter(id){if(API.byId(id))window.A.flow('letterview',null,{id:id});}
function share(btn){
  var f=cur('momentview'),e=f?API.byId(f.data.id):null;if(!e)return Promise.resolve('none');
  API.busy(btn,true,'…');
  return fileBlob(e.id).then(function(b){
    if(!b){API.busy(btn,false);API.toast('Foto non presente su questo telefono');return 'none';}
    return X.momenti.shareFile(b,'alan-'+API.isoDay(e.t)+'.jpg',(e.text||babyName())).then(function(r){API.busy(btn,false);if(r==='download')API.toast('Foto salvata');else if(r==='none')API.toast('Condivisione non disponibile');return r;});
  }).catch(function(){API.busy(btn,false);return 'none';});
}
function del(id){
  var e=API.byId(id);if(!e)return false;
  if(!window.confirm(e.k==='letter'?'Eliminare questa lettera?':'Eliminare questo momento?'))return false;
  var S=API.state();S.events=S.events.filter(function(x){return x.id!==id;});
  API.removed(e);
  if(e.k==='moment'&&e.photo){API.fileDel(id);dropOut(id);if(e.photoPath)API.cloudRemove(e.photoPath);delete known[id];delete urls[id];}
  API.save();
  if(API.flow())window.A.home();
  X.refresh();return true;
}

/* ---------- percorsi ---------- */
function bar(title){return '<div class="bar">'+API.backBtn()+'<div class="title">'+title+'</div></div>';}
function renderMoment(flow){
  var d=flow.data||{};
  if(d.kind==='first'){
    var f=firstOf(d.code);if(!f)return bar('Prime volte')+'<p class="hint">Tappa sconosciuta.</p>';
    var t=tOf(d.date);
    return bar('Prime volte')+'<h2>'+API.esc(f.title)+'</h2>'+API.dayChips()+'<p class="hint">'+API.esc(babyName())+' '+API.esc(ageAt(t))+'.</p><div class="spacer"></div><button class="btn huge" onclick="A.finish(\'save\')">È successo!</button>';
  }
  var h=bar('Un momento')+API.dayChips();
  h+='<h2>La foto</h2>';
  if(pending&&pending.busy)h+='<div class="mo-prev mo-busy"><span>Preparo la foto…</span></div>';
  else if(pending&&pending.buf)h+='<div class="mo-prev">'+(pending.url?'<img src="'+pending.url+'" alt="">':'<span>Foto pronta'+(pending.kb?' · '+pending.kb+' kB':'')+'</span>')+'</div><button class="btn ghost" onclick="AlanExt.momenti.unpick()">Cambia foto</button>';
  else h+='<div class="grid2 mo-pick"><label><input type="file" accept="image/*" capture="environment" onchange="AlanExt.momenti.pick(this)">Scatta<small>con la fotocamera</small></label><label><input type="file" accept="image/*" onchange="AlanExt.momenti.pick(this)">Dalla galleria<small>una foto già fatta</small></label></div><p class="hint">La foto è facoltativa: anche due parole sono un momento.</p>';
  h+='<h2>Due parole</h2><input class="f" id="moCaption" type="text" maxlength="'+CAPTION_MAX+'" value="'+API.esc(d.text||'')+'" placeholder="es. la prima volta al parco" oninput="AlanExt.momenti.caption(this.value)">';
  h+='<div class="spacer"></div><button class="btn" onclick="A.finish(\'save\')">Salva il momento</button>';
  return h;
}
function finishMoment(flow){
  var d=flow.data||{};
  if(d.kind==='first'){
    var f=firstOf(d.code);if(!f)return null;
    var t=tOf(d.date);
    return {e:{k:'moment',kind:'first',code:f.code,title:f.title},t:t,msg:f.title+' · '+ageAt(t)};
  }
  var txt=clean(d.text,CAPTION_MAX);
  if(pending&&pending.busy){API.toast('Un attimo, preparo la foto…');return false;}
  var ph=pending&&pending.buf?pending:null;
  if(!ph&&!txt){API.toast('Aggiungi una foto o due parole');return false;}
  var e={k:'moment',kind:ph?'photo':'story',text:txt,photo:!!ph};
  if(ph){pending=null;setTimeout(function(){if(e.id)storePhoto(e,ph);},0);}
  return {e:e,t:tOf(d.date),msg:ph?'Momento salvato: la foto viaggia verso l\'altro telefono':'Momento salvato'};
}
function renderView(flow){
  var e=API.byId(flow.data.id);if(!e)return bar('Momento')+'<p class="hint">Momento non trovato.</p>';
  var u=urls[e.id],h=bar(API.esc(API.fmtDate(e.t)))+'<div class="mo-view">';
  h+=u?'<img src="'+u+'" alt="'+API.esc(e.text||'')+'">':'<div class="mo-noimg">Foto sul telefono</div>';
  if(e.text)h+='<p class="mo-cap">'+API.esc(e.text)+'</p>';
  h+='<p class="mo-meta">'+API.esc(babyName())+' '+API.esc(ageAt(e.t))+(e.who?' · scattata da '+API.esc(e.who):'')+' · '+API.fmtTime(e.t)+'</p></div>';
  h+='<div class="spacer"></div><button class="btn" onclick="AlanExt.momenti.share(this)">Condividi</button><button class="btn ghost mo-del" onclick="AlanExt.momenti.del(\''+e.id+'\')">Elimina</button>';
  return h;
}
function renderLetter(flow){
  var d=flow.data||{};
  return bar('Lettera')+'<h2>Cosa vorrei ricordare di questa settimana</h2><textarea class="f mo-ta" id="moLetter" maxlength="'+LETTER_MAX+'" rows="9" placeholder="Scrivi liberamente: resta qui, per voi." oninput="AlanExt.momenti.text(this.value)">'+API.esc(d.text||'')+'</textarea><p class="hint">Firmata da '+API.esc(API.who())+', con la data di oggi.</p><div class="spacer"></div><button class="btn" onclick="A.finish(\'save\')">Salva la lettera</button>';
}
function finishLetter(flow){
  var txt=clean((flow.data||{}).text,LETTER_MAX);
  if(!txt){API.toast('Scrivi qualcosa prima di salvare');return false;}
  return {e:{k:'letter',text:txt},msg:'Lettera salvata'};
}
function renderLetterView(flow){
  var e=API.byId(flow.data.id);if(!e)return bar('Lettera')+'<p class="hint">Lettera non trovata.</p>';
  return bar(API.esc(API.fmtDate(e.t)))+'<div class="mo-letter"><p class="mo-meta">'+API.esc(e.who||'')+' · '+API.esc(babyName())+' '+API.esc(ageAt(e.t))+'</p><div class="mo-text">'+API.esc(e.text)+'</div></div><div class="spacer"></div><button class="btn ghost mo-del" onclick="AlanExt.momenti.del(\''+e.id+'\')">Elimina</button>';
}
var FLOWS={
  moment:{render:renderMoment,finish:finishMoment},
  momentview:{render:renderView,finish:function(){return false;}},
  letter:{render:renderLetter,finish:finishLetter},
  letterview:{render:renderLetterView,finish:function(){return false;}}
};
Object.keys(FLOWS).forEach(function(k){X.flow(k,FLOWS[k]);});
X.hide('moment');X.hide('letter');

/* ---------- tab ---------- */
function firstsHtml(){
  var f=firsts(),h='<div class="card mo-card"><h3>Prime volte</h3>';
  if(!f.done.length)h+='<p class="hint">Quando succede, tocca la tappa: resta qui con la data e l\'età.</p>';
  h+='<div class="mo-firsts">';
  f.done.forEach(function(d){
    h+='<div class="mo-first mo-done"><span class="mo-tick">✓</span><div class="mo-ft"><b>'+API.esc(d.title)+'</b><span>'+API.esc(d.age)+' · '+API.esc(API.fmtDate(d.e.t))+(d.e.who?' · '+API.esc(d.e.who):'')+'</span></div><button class="mo-x" aria-label="Elimina" onclick="AlanExt.momenti.del(\''+d.e.id+'\')">×</button></div>';
  });
  f.todo.forEach(function(d){
    h+='<div class="mo-first"><div class="mo-ft"><b>'+API.esc(d.title)+'</b></div><button class="mo-go" onclick="AlanExt.momenti.first(\''+d.code+'\')">È successo!</button></div>';
  });
  return h+'</div></div>';
}
function cell(e){
  var st=known[e.id],u=st==='local'?urls[e.id]:null,cap=API.esc(e.text||API.fmtDate(e.t));
  if(st==='local')return '<button class="mo-cell mo-local" aria-label="'+cap+'" onclick="AlanExt.momenti.openPhoto(\''+e.id+'\',this)">'+(u?'<img src="'+u+'" alt="">':'<span>'+cap+'</span>')+'</button>';
  if(st==='remote'||(!st&&e.photoPath))return '<button class="mo-cell mo-dl" onclick="AlanExt.momenti.openPhoto(\''+e.id+'\',this)"><span>tocca per scaricare</span><small>'+API.esc(API.fmtDate(e.t))+'</small></button>';
  if(st==='none'&&!e.photoPath)return '<button class="mo-cell mo-wait" onclick="AlanExt.momenti.openPhoto(\''+e.id+'\',this)"><span>in arrivo</span><small>dall\'altro telefono</small></button>';
  return '<button class="mo-cell" onclick="AlanExt.momenti.openPhoto(\''+e.id+'\',this)"><small>'+API.esc(API.fmtDate(e.t))+'</small></button>';
}
function albumInner(){
  var ph=photos(),h='';
  if(!ph.length)h+='<p class="hint">Ancora nessuna foto. Le foto restano sui vostri telefoni e nel vostro spazio, in piccolo: circa un quarto di megabyte l\'una.</p>';
  else h+='<div class="mo-grid">'+ph.map(cell).join('')+'</div>';
  var st=stories().slice(0,STORY_N);
  if(st.length){
    h+='<div class="mo-stories">';
    st.forEach(function(e){h+='<div class="mo-story"><div class="mo-sd">'+API.esc(API.fmtDate(e.t))+'<br><small>'+API.esc(ageAt(e.t))+'</small></div><div class="mo-st">'+API.esc(e.text)+(e.who?'<span class="who">'+API.esc(e.who)+'</span>':'')+'</div><button class="mo-x" aria-label="Elimina" onclick="AlanExt.momenti.del(\''+e.id+'\')">×</button></div>';});
    h+='</div>';
  }
  return h;
}
function albumHtml(){
  return '<div class="card mo-card"><h3>Album</h3><div id="mo-album">'+albumInner()+'</div><div class="spacer"></div><button class="btn" onclick="AlanExt.momenti.tell()">Racconta un momento</button></div>';
}
function weekHtml(){
  var w=week(),h='<div class="card mo-card mo-week"><h3>Questa settimana in numeri</h3><p class="hint">Gli ultimi sette giorni, così come li avete scritti.</p><div class="mo-nums">';
  h+='<div><b>'+w.feeds+'</b><span>'+(w.feeds===1?'pappa':'pappe')+'</span></div>';
  h+='<div><b>'+(w.sleepAvg!=null?API.fmtDur(w.sleepAvg):'—')+'</b><span>di sonno a notte'+(w.nights?'<br><small>media su '+w.nights+(w.nights===1?' notte':' notti')+'</small>':'')+'</span></div>';
  h+='<div><b>'+(w.cries?w.explained+' su '+w.cries:'0')+'</b><span>'+(w.cries?'pianti spiegati':'pianti')+'</span></div>';
  h+='<div><b>'+w.moments+'</b><span>'+(w.moments===1?'momento':'momenti')+(w.letters?'<br><small>'+w.letters+(w.letters===1?' lettera':' lettere')+'</small>':'')+'</span></div>';
  h+='</div><p class="mo-team">'+teamText(w)+'</p></div>';
  return h;
}
function lettersHtml(){
  var ls=letters(),h='<div class="card mo-card"><h3>Lettere</h3><p class="hint">Cosa vorrei ricordare di questa settimana: una pagina per ciascuno, quando va.</p>';
  if(ls.length){
    h+='<div class="mo-letters">';
    ls.forEach(function(e){var line=clean(e.text.split('\n')[0],70);h+='<button class="mo-lrow" onclick="AlanExt.momenti.openLetter(\''+e.id+'\')"><div class="mo-sd">'+API.esc(API.fmtDate(e.t))+'<br><small>'+API.esc(e.who||'')+'</small></div><div class="mo-st">'+API.esc(line)+(line.length<e.text.length?'…':'')+'</div><span class="mo-chev">›</span></button>';});
    h+='</div>';
  }
  return h+'<div class="spacer"></div><button class="btn ghost" onclick="AlanExt.momenti.write()">Scrivi una lettera</button></div>';
}
function page(){
  return '<div class="mo-head"><div class="mo-kicker">Momenti di famiglia</div><h2 class="mo-age">'+headline()+'</h2><p class="mo-line">'+API.esc(phrase())+'</p></div>'+firstsHtml()+albumHtml()+weekHtml()+lettersHtml();
}
function sig(){var m=API.events().filter(function(e){return e.k==='moment'||e.k==='letter';}),last=null;m.forEach(function(e){if(!last||(e._updated||'')>(last._updated||''))last=e;});return m.length+'|'+(last?last.id+':'+(last._updated||''):'')+'|'+API.settings().birth+'|'+API.dayKey(Date.now());}
function render(){
  lastSig=sig();
  var el=API.q('#momenti');if(el)el.innerHTML=page();
  checkLocal();
}
X.tab('momenti',function(){render();});
X.on('change',function(){
  try{
    if(outbox().length)flush();
    if(API.curView()==='momenti'&&!API.flow()&&sig()!==lastSig)X.refresh();
  }catch(e){}
});
try{window.addEventListener('online',function(){setTimeout(flush,1500);});}catch(e){}
try{document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(flush,1500);});}catch(e){}
setTimeout(flush,1500);

X.momenti={FIRSTS:FIRSTS,PHRASES:PHRASES,OUTBOX:OUTBOX,MAX_SIDE:MAX_SIDE,QUALITY:QUALITY,CAPTION_MAX:CAPTION_MAX,LETTER_MAX:LETTER_MAX,flows:FLOWS,
  phrase:phrase,dayOfYear:dayOfYear,ageWords:ageWords,ageAt:ageAt,headline:headline,tOf:tOf,firsts:firsts,week:week,teamText:teamText,moments:moments,letters:letters,photos:photos,stories:stories,
  resize:resize,shareFile:shareFile,objUrl:objUrl,outbox:outbox,flush:flush,checkLocal:checkLocal,download:download,known:known,urls:urls,
  page:page,render:render,first:first,tell:tell,write:write,caption:caption,text:text,pick:pick,unpick:unpick,openPhoto:openPhoto,openLetter:openLetter,share:share,del:del};
X.refresh();
})();
