/* Estensione "timer": cronometro per pappa al biberon, allattamento al seno (con lati) e tiralatte.
   Stato volatile in localStorage 'alan.timer' = {kind, side, start, sides:[{side,start,end}]}: il tempo si calcola
   sempre dai timestamp, così sopravvive alla chiusura dell'app e al cambio di tab.
   Eventi salvati: feed {src:'seno', dur (s), side, sides:[{side,dur}]}, feed {src:'biberon', dur} (via percorso Pappa),
   pump {ml, dur, side}. Nessun giudizio: solo tempi e quantità. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var KEY='alan.timer',PKEY='alan.timer.pending',MIN=API.MIN,DAY=864e5;
var KIND={seno:'Seno',biberon:'Biberon',tiralatte:'Tiralatte'};
var COLOR={seno:'var(--c-fame)',biberon:'var(--c-fame)',tiralatte:'var(--c-aria)'};
var PUMP_QUICK=[40,60,80,100,120,150];
var asking=false,tickId=null;

/* ---------- stato ---------- */
function get(){try{var o=JSON.parse(API.lsGet(KEY)||'null');if(o&&KIND[o.kind]&&o.start)return o;}catch(e){}return null;}
function set(o){if(o)API.lsSet(KEY,JSON.stringify(o));else{try{localStorage.removeItem(KEY);}catch(e){API.lsSet(KEY,'');}}}
function pending(){try{var o=JSON.parse(API.lsGet(PKEY)||'null');if(o&&o.start)return o;}catch(e){}return null;}
function setPending(o){if(o)API.lsSet(PKEY,JSON.stringify(o));else{try{localStorage.removeItem(PKEY);}catch(e){API.lsSet(PKEY,'');}}}
function other(side){return side==='sinistro'?'destro':'sinistro';}
function elapsed(t,now){return Math.max(0,Math.round(((now||Date.now())-t.start)/1000));}
/* segmenti per lato in ordine, durate in secondi; il segmento aperto arriva fino ad adesso */
function segments(t,now){
  now=now||Date.now();var out=[];
  (t.sides||[]).forEach(function(s){if(!s||!s.side||!s.start)return;var d=Math.max(0,Math.round(((s.end||now)-s.start)/1000));out.push({side:s.side,dur:d});});
  return out;
}
function totals(t,now){var o={sinistro:0,destro:0};segments(t,now).forEach(function(s){if(o[s.side]!=null)o[s.side]+=s.dur;});return o;}
function fmtClock(sec){sec=Math.max(0,Math.floor(sec));var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+':':'')+API.pad(m)+':'+API.pad(s);}
function fmtMin(sec){return Math.round(sec/60)+' min';}
function lastSenoSide(){
  var ev=API.sorted();
  for(var i=ev.length-1;i>=0;i--){var e=ev[i];if(e.k!=='feed'||e.src!=='seno')continue;if(e.sides&&e.sides.length)return e.sides[e.sides.length-1].side||null;if(e.side==='sinistro'||e.side==='destro')return e.side;return null;}
  return null;
}
function typicalPump(){var ml=API.sorted().filter(function(e){return e.k==='pump'&&e.ml>0;}).slice(-6).map(function(e){return e.ml;});return API.median(ml)||60;}

/* ---------- azioni ---------- */
function start(kind,side){
  if(!KIND[kind]||get())return;
  var now=Date.now(),t={kind:kind,side:null,start:now,sides:[]};
  if(kind==='seno'){side=side==='destro'?'destro':'sinistro';t.side=side;t.sides=[{side:side,start:now,end:null}];}
  asking=false;setPending(null);set(t);ensureTick();redraw();
}
function switchSide(){
  var t=get();if(!t||t.kind!=='seno')return;
  var now=Date.now(),cur=t.sides[t.sides.length-1];
  if(cur&&!cur.end)cur.end=now;
  t.side=other(t.side);t.sides.push({side:t.side,start:now,end:null});
  set(t);redraw();
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
  if(t.kind==='seno'){
    var segs=segments(t,now),tot=totals(t,now),side=tot.sinistro&&tot.destro?'entrambi':(tot.destro?'destro':'sinistro');
    window.A.flow('seno',null,{start:t.start,dur:dur,side:side,sides:segs});
    window.A.finish(1);
  }else if(t.kind==='biberon'){
    /* il percorso Pappa esistente chiede ml preparati e bevuti; durata e sorgente vengono aggiunte alla voce appena salvata */
    setPending({start:t.start,dur:dur,at:new Date().toISOString()});
    window.A.flow('feed',null,{src:'biberon',dur:dur});
    var mins=Math.round((now-t.start)/MIN);if(mins>0)window.A.setOff(mins);
  }else{
    window.A.flow('pump',null,{start:t.start,dur:dur,side:'entrambi',ml:typicalPump()});
  }
}
function ask(){if(get())return;asking=true;redraw();}
function unask(){asking=false;redraw();}

/* ---------- Home ---------- */
function redraw(){var el=document.getElementById?document.getElementById('home-timer'):null;if(el)el.innerHTML=home();}
function sidesText(t){var o=totals(t);return 'sinistro '+fmtClock(o.sinistro)+' · destro '+fmtClock(o.destro);}
function kindLabel(t){return t.kind==='seno'?'Seno '+t.side:KIND[t.kind];}
function live(t){
  var h='<div class="tm-live" style="--tc:'+COLOR[t.kind]+'">';
  h+='<div class="tm-head"><span class="tm-kind">'+API.esc(kindLabel(t))+'</span><span class="tm-since">dalle '+API.fmtTime(t.start)+'</span></div>';
  h+='<div class="tm-clock" id="tmClock">'+fmtClock(elapsed(t))+'</div>';
  h+='<div class="tm-sides" id="tmSides">'+(t.kind==='seno'?sidesText(t):'')+'</div>';
  h+='<div class="tm-acts'+(t.kind==='seno'?'':' one')+'">';
  if(t.kind==='seno')h+='<button class="tm-alt" onclick="AlanExt.timer.switchSide()">Cambia lato<small>passa a '+other(t.side)+'</small></button>';
  h+='<button class="tm-end" onclick="AlanExt.timer.stop()">Fine</button></div>';
  h+='<button class="tm-cancel" onclick="AlanExt.timer.cancel()">Annulla senza salvare</button></div>';
  return h;
}
function pick(){
  var last=lastSenoSide();
  var b=function(s){return '<button onclick="AlanExt.timer.start(\'seno\',\''+s+'\')">'+s.charAt(0).toUpperCase()+s.slice(1)+'<small>'+(last===s?'l\'ultima volta':'&nbsp;')+'</small></button>';};
  return '<div class="tm-pick"><div class="tm-q">Quale seno?</div><div class="tm-two">'+b('sinistro')+b('destro')+'</div><button class="tm-cancel" onclick="AlanExt.timer.unask()">Annulla</button></div>';
}
function startRow(){
  return '<div class="tm-start"><span class="tm-lbl">Cronometro</span><button onclick="AlanExt.timer.ask()">Seno</button><button onclick="AlanExt.timer.start(\'biberon\')">Biberon</button><button onclick="AlanExt.timer.start(\'tiralatte\')">Tiralatte</button></div>';
}
function home(){var t=get();ensureTick();if(t)return live(t);if(asking)return pick();return startRow();}
/* ogni secondo aggiorna solo i testi del cronometro, mai tutta la Home */
function tick(){
  var t=get();if(!t){ensureTick();return;}
  var c=document.getElementById?document.getElementById('tmClock'):null;if(c)c.textContent=fmtClock(elapsed(t));
  var s=document.getElementById?document.getElementById('tmSides'):null;if(s&&t.kind==='seno')s.textContent=sidesText(t);
}
function ensureTick(){var on=!!get();if(on&&tickId==null)tickId=setInterval(tick,1000);else if(!on&&tickId!=null){clearInterval(tickId);tickId=null;}}

/* ---------- percorsi ---------- */
/* seno: il salvataggio passa da qui così la voce riceve id, chi, e spiega un eventuale pianto aperto */
X.flow('seno',{
  render:function(flow,API){
    var d=flow.data||{},h='<div class="bar">'+API.backBtn()+'<div class="title">Seno</div></div>';
    h+='<h2>'+(d.dur?fmtMin(d.dur):'Nessun cronometro')+'</h2>';
    if(d.sides&&d.sides.length)h+='<p class="hint">'+API.esc(d.sides.map(function(s){return s.side+' '+fmtMin(s.dur);}).join(' · '))+'</p>';
    if(d.start)h+='<p class="hint">Iniziato alle '+API.fmtTime(d.start)+'</p>';
    return h+'<button class="btn huge" onclick="A.finish(1)">Salva</button>';
  },
  finish:function(flow,val,API){
    var d=flow.data||{};if(!d.dur)return null;
    var e={k:'feed',src:'seno',dur:d.dur,side:d.side||'entrambi',sides:d.sides||[]};
    var tot={sinistro:0,destro:0};e.sides.forEach(function(s){if(tot[s.side]!=null)tot[s.side]+=s.dur;});
    var msg='Seno: '+fmtMin(d.dur);
    if(tot.sinistro&&tot.destro)msg+=' · sinistro '+fmtMin(tot.sinistro)+', destro '+fmtMin(tot.destro);else msg+=' · '+e.side;
    return {e:e,t:d.start||null,msg:msg};
  }
});
function renderPump(flow){
  var d=flow.data,ml=d.ml||0,tp=typicalPump();
  var h='<div class="bar">'+API.backBtn()+'<div class="title">Tiralatte</div></div>';
  if(!d.start)h+=API.whenRow();
  h+='<h2>Quanto hai tirato?</h2>';
  if(d.dur)h+='<p class="hint">Cronometro: '+fmtMin(d.dur)+', dalle '+API.fmtTime(d.start)+'</p>';
  h+='<div class="chips">'+['sinistro','destro','entrambi'].map(function(s){return '<button class="'+(d.side===s?'on':'')+'" onclick="AlanExt.timer.side(\''+s+'\')">'+s.charAt(0).toUpperCase()+s.slice(1)+'</button>';}).join('')+'</div>';
  h+='<div class="grid3">'+PUMP_QUICK.map(function(v){return '<button class="'+(Math.round(tp)===v?'on':'')+'" onclick="AlanExt.timer.pick('+v+')">'+v+'<small>ml</small></button>';}).join('')+'</div>';
  h+='<div class="stepper"><button onclick="AlanExt.timer.step(-10)">−10</button><div class="val" id="tmMl">'+ml+' ml</div><button onclick="AlanExt.timer.step(10)">+10</button></div>';
  h+='<button class="btn" onclick="A.finish(1)">Salva '+ml+' ml</button>';
  return h;
}
function repaint(){var f=API.flow();if(f&&f.type==='pump')API.q('#screenInner').innerHTML=renderPump(f);}
function step(d){var f=API.flow();if(!f||f.type!=='pump')return;f.data.ml=Math.max(0,Math.min(300,(f.data.ml||0)+d));repaint();}
function side(s){var f=API.flow();if(!f||f.type!=='pump')return;f.data.side=s;repaint();}
function pickMl(v){var f=API.flow();if(!f||f.type!=='pump')return;f.data.ml=v;window.A.finish(1);}
X.flow('pump',{
  render:function(flow){return renderPump(flow);},
  finish:function(flow,val,API){
    var d=flow.data||{},ml=Math.max(0,Math.min(300,Math.round(d.ml||0)));
    var e={k:'pump',ml:ml,dur:d.dur||null,side:d.side||'entrambi'};
    return {e:e,t:d.start||null,msg:'Tiralatte: '+ml+' ml'+(d.dur?' in '+fmtMin(d.dur):'')};
  }
});
X.describe('pump',function(e,API){
  var bits=[e.ml+' ml'];if(e.dur)bits.push(fmtMin(e.dur));if(e.side==='sinistro'||e.side==='destro')bits.push(e.side);
  return ['Tiralatte','<span class="detail">'+API.esc(bits.join(' · '))+'</span>'];
});

/* biberon: la voce salvata dal percorso Pappa riceve durata e sorgente dal cronometro appena chiuso */
function adopt(){
  var p=pending();if(!p)return;
  if(Date.now()-p.start>6*3600e3){setPending(null);return;}
  var ev=API.events(),best=null;
  for(var i=ev.length-1;i>=0;i--){var e=ev[i];if(e.k!=='feed'||e.src==='seno'||!e._updated||e._updated<p.at)continue;if(e.t<p.start-5*MIN)continue;best=e;break;}
  if(!best)return;
  setPending(null);
  if(best.dur)return;
  best.dur=p.dur;best.src='biberon';API.touched(best);API.save();
}
X.on('change',function(){try{adopt();}catch(e){}});

/* ---------- Pattern: allattamento negli ultimi 7 giorni ---------- */
function stats(){
  var now=Date.now(),from=now-7*DAY,ev=API.sorted().filter(function(e){return e.t>=from&&e.t<=now;});
  var seno=ev.filter(function(e){return e.k==='feed'&&e.src==='seno'&&e.dur>0;});
  var bib=ev.filter(function(e){return e.k==='feed'&&e.src==='biberon'&&e.dur>0;});
  var pumps=ev.filter(function(e){return e.k==='pump';});
  if(!seno.length&&!pumps.length&&!bib.length)return '';
  var h='<div class="card"><h3>Allattamento</h3>';
  if(seno.length){
    var days=[],mx=0,d0=new Date(now);d0.setHours(0,0,0,0);
    for(var i=6;i>=0;i--){var t0=d0.getTime()-i*DAY,k=API.dayKey(t0),m=0;seno.forEach(function(e){if(API.dayKey(e.t)===k)m+=e.dur/60;});m=Math.round(m);mx=Math.max(mx,m);days.push({t:t0,m:m});}
    days.forEach(function(d){h+='<div class="tm-day"><div class="l">'+API.esc(API.dayLabel(d.t))+'</div><div class="b"><i style="width:'+(mx?Math.round(d.m/mx*100):0)+'%"></i></div><div class="n">'+(d.m?d.m+' min':'—')+'</div></div>';});
    var tot={sinistro:0,destro:0};
    seno.forEach(function(e){if(e.sides&&e.sides.length)e.sides.forEach(function(s){if(tot[s.side]!=null)tot[s.side]+=s.dur||0;});else if(tot[e.side]!=null)tot[e.side]+=e.dur;});
    var known=tot.sinistro+tot.destro;
    h+='<div class="kv"><div>Poppate al seno</div><div>'+seno.length+' <span class="m">in 7 giorni</span></div>';
    h+='<div>Per poppata</div><div>'+fmtMin(API.mean(seno.map(function(e){return e.dur;})))+'</div>';
    if(known){var pl=Math.round(tot.sinistro/known*100);h+='<div>Sinistro / destro</div><div>'+pl+'% / '+(100-pl)+'%</div>';}
    h+='</div>';
    if(known)h+='<div class="tm-split"><i class="l" style="width:'+Math.round(tot.sinistro/known*100)+'%"></i><i class="r" style="width:'+(100-Math.round(tot.sinistro/known*100))+'%"></i></div>';
  }
  if(bib.length||pumps.length){
    h+='<div class="kv"'+(seno.length?' style="margin-top:8px"':'')+'>';
    if(bib.length)h+='<div>Biberon al cronometro</div><div>'+fmtMin(API.mean(bib.map(function(e){return e.dur;})))+' <span class="m">per pappa, su '+bib.length+'</span></div>';
    if(pumps.length){var pml=pumps.reduce(function(s,e){return s+(e.ml||0);},0),pd=pumps.filter(function(e){return e.dur>0;});h+='<div>Tiralatte</div><div>'+pml+' ml <span class="m">in '+pumps.length+(pumps.length===1?' sessione':' sessioni')+(pd.length?', '+fmtMin(API.mean(pd.map(function(e){return e.dur;})))+' l\'una':'')+'</span></div>';}
    h+='</div>';
  }
  return h+'</div>';
}

X.home('timer',function(){return home();},'top');
X.slot('stats',function(){return stats();});
X.timer={KEY:KEY,PKEY:PKEY,get:get,set:set,pending:pending,start:start,switchSide:switchSide,stop:stop,cancel:cancel,ask:ask,unask:unask,
  elapsed:elapsed,segments:segments,totals:totals,fmtClock:fmtClock,home:home,redraw:redraw,tick:tick,step:step,side:side,pick:pickMl,adopt:adopt,stats:stats,typicalPump:typicalPump,lastSenoSide:lastSenoSide};
ensureTick();
X.refresh();
})();
