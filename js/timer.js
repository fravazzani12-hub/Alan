/* Estensione "timer": cronometro della pappa al biberon.
   Stato volatile in localStorage 'alan.timer' = {start}: il tempo si calcola sempre dai timestamp, così sopravvive alla
   chiusura dell'app e al cambio di tab. A "Fine" si apre il percorso Pappa già puntato sull'inizio; la voce salvata riceve
   la durata (dur, secondi) e src 'biberon'. In Pattern: durata media delle pappe che ce l'hanno (cronometro o scelta a mano). Nessun giudizio. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var KEY='alan.timer',PKEY='alan.timer.pending',MIN=API.MIN,DAY=864e5;
var tickId=null;

/* ---------- stato ---------- */
function get(){try{var o=JSON.parse(API.lsGet(KEY)||'null');if(o&&o.start>0)return o;}catch(e){}return null;}
function set(o){if(o)API.lsSet(KEY,JSON.stringify(o));else{try{localStorage.removeItem(KEY);}catch(e){API.lsSet(KEY,'');}}}
function pending(){try{var o=JSON.parse(API.lsGet(PKEY)||'null');if(o&&o.start)return o;}catch(e){}return null;}
function setPending(o){if(o)API.lsSet(PKEY,JSON.stringify(o));else{try{localStorage.removeItem(PKEY);}catch(e){API.lsSet(PKEY,'');}}}
function elapsed(t,now){return Math.max(0,Math.round(((now||Date.now())-t.start)/1000));}
function fmtClock(sec){sec=Math.max(0,Math.floor(sec));var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+':':'')+API.pad(m)+':'+API.pad(s);}
function fmtMin(sec){return Math.round(sec/60)+' min';}

/* ---------- azioni ---------- */
function start(){
  if(get())return;
  setPending(null);set({start:Date.now()});ensureTick();redraw();
}
function cancel(){
  var t=get();if(!t)return;
  if(!window.confirm('Fermare il cronometro senza salvare?'))return;
  set(null);ensureTick();redraw();
}
function stop(){
  var t=get();if(!t)return;
  var now=Date.now(),dur=elapsed(t,now);
  set(null);ensureTick();
  /* il percorso Pappa chiede ml preparati e bevuti; durata e sorgente vengono aggiunte alla voce appena salvata */
  setPending({start:t.start,dur:dur,at:new Date().toISOString()});
  window.A.flow('feed',null,{src:'biberon',dur:dur});
  var mins=Math.round((now-t.start)/MIN);if(mins>0)window.A.setOff(mins);
}

/* ---------- Home ---------- */
function redraw(){var el=document.getElementById?document.getElementById('home-timer'):null;if(el)el.innerHTML=home();}
function live(t){
  var h='<div class="tm-live" style="--tc:var(--c-fame)">';
  h+='<div class="tm-head"><span class="tm-kind">Pappa in corso</span><span class="tm-since">dalle '+API.fmtTime(t.start)+'</span></div>';
  h+='<div class="tm-clock" id="tmClock">'+fmtClock(elapsed(t))+'</div>';
  h+='<div class="tm-acts one"><button class="tm-end" onclick="AlanExt.timer.stop()">Fine<small>poi i ml</small></button></div>';
  h+='<button class="tm-cancel" onclick="AlanExt.timer.cancel()">Annulla senza salvare</button></div>';
  return h;
}
function startRow(){
  return '<div class="tm-start"><span class="tm-lbl">Cronometro</span><button onclick="AlanExt.timer.start()">Inizia la pappa<small>a fine pappa chiede i ml</small></button></div>';
}
function home(){var t=get();ensureTick();if(t)return live(t);return startRow();}
/* ogni secondo aggiorna solo il testo del cronometro, mai tutta la Home */
function tick(){
  var t=get();if(!t){ensureTick();return;}
  var c=document.getElementById?document.getElementById('tmClock'):null;if(c)c.textContent=fmtClock(elapsed(t));
}
function ensureTick(){var on=!!get();if(on&&tickId==null)tickId=setInterval(tick,1000);else if(!on&&tickId!=null){clearInterval(tickId);tickId=null;}}

/* la voce salvata dal percorso Pappa riceve durata e sorgente dal cronometro appena chiuso */
function adopt(){
  var p=pending();if(!p)return;
  if(Date.now()-p.start>6*3600e3){setPending(null);return;}
  var ev=API.events(),best=null;
  for(var i=ev.length-1;i>=0;i--){var e=ev[i];if(e.k!=='feed'||!e._updated||e._updated<p.at)continue;if(e.t<p.start-5*MIN)continue;best=e;break;}
  if(!best)return;
  setPending(null);
  if(best.dur)return;
  best.dur=p.dur;best.src='biberon';API.touched(best);API.save();
}
X.on('change',function(){try{adopt();}catch(e){}});

/* ---------- Pattern: durata delle pappe negli ultimi 7 giorni (cronometrate o con la durata scelta a mano) ---------- */
function stats(){
  var now=Date.now(),from=now-7*DAY,ev=API.sorted().filter(function(e){return e.t>=from&&e.t<=now;});
  var bib=ev.filter(function(e){return e.k==='feed'&&e.dur>0;});
  if(!bib.length)return '';
  var durs=bib.map(function(e){return e.dur;}),mx=Math.max.apply(null,durs),mn=Math.min.apply(null,durs);
  var h='<div class="card"><h3>Quanto dura la pappa</h3><div class="kv">';
  h+='<div>In media</div><div>'+fmtMin(API.mean(durs))+' <span class="m">su '+bib.length+(bib.length===1?' pappa':' pappe')+' con la durata'+'</span></div>';
  if(bib.length>1)h+='<div>La più corta / la più lunga</div><div>'+fmtMin(mn)+' / '+fmtMin(mx)+'</div>';
  var withMl=bib.filter(function(e){return e.ml>0;});
  if(withMl.length)h+='<div>Ritmo</div><div>'+Math.round(API.mean(withMl.map(function(e){return e.ml/(e.dur/60);}))*10)/10+' ml al minuto</div>';
  return h+'</div></div>';
}

X.home('timer',function(){return home();},'top');
X.slot('stats',function(){return stats();});
X.timer={KEY:KEY,PKEY:PKEY,get:get,set:set,pending:pending,start:start,stop:stop,cancel:cancel,elapsed:elapsed,fmtClock:fmtClock,home:home,redraw:redraw,tick:tick,adopt:adopt,stats:stats};
ensureTick();
X.refresh();
})();
