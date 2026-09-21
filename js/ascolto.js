/* Estensione "ascolto": l'app sente il pianto e lo segna da sola. Serve a sapere quante volte piange, con che tono e
   per quanto, senza dover pensare a far partire la registrazione mentre si consola un bambino che piange.
   Pensata per un dispositivo dedicato (l'iPad nella stanza), in carica e con l'app aperta: Safari chiude il microfono
   appena l'app va in secondo piano o lo schermo si blocca, quindi l'ascolto vive solo mentre la schermata è davanti.
   Interruttore per dispositivo (localStorage `alan.ascolto`, mai sincronizzato): sugli altri telefoni resta spento.
   Come funziona: un solo microfono aperto (un permesso per apertura dell'app, non uno per pianto) → AnalyserNode →
   un frame ogni FRAME ms con le stesse misure dei pianti registrati a mano (API.analyseFrame). La soglia è relativa al
   rumore di fondo del momento (mediana mobile degli ultimi 30 s), così il rumore bianco acceso non conta come pianto.
   Un episodio comincia dopo ON_S secondi di suono "da pianto" dentro una finestra, finisce dopo OFF_S di quiete; alla
   fine nasce una normale voce `cry` con l'impronta acustica (API.features), la durata, `auto:true` e nessun audio:
   servono i numeri, non la registrazione. Due episodi vicini si uniscono. Nessun giudizio, nessuna soglia clinica. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var KEY='alan.ascolto',MIN=API.MIN;
var FRAME=50;                 /* un'analisi ogni 50 ms */
var WIN_S=2.5,ON_S=1.2,OFF_S=8,MIN_S=3,MERGE_S=60,MAX_HOUR=20;
var FLOOR_S=30;               /* memoria del rumore di fondo */
var SENS=[['bassa','+14 dB sul fondo',14],['media','+10 dB sul fondo',10],['alta','+7 dB sul fondo',7]];
var F0_LO=250,F0_HI=750;      /* il pianto di un neonato sta qui; la voce di un adulto molto più in basso */

/* ---------- impostazioni, solo su questo dispositivo ---------- */
var st={on:false,sens:1,audio:false};
(function(){try{var o=JSON.parse(API.lsGet(KEY)||'{}');st.on=!!o.on;st.sens=(o.sens>=0&&o.sens<=2)?o.sens:1;st.audio=!!o.audio;}catch(e){}})();
function save(){API.lsSet(KEY,JSON.stringify(st));}
function sens(){return SENS[st.sens]||SENS[1];}

/* ---------- rilevatore (niente microfono qui dentro: riceve i frame, così si può provare) ---------- */
var floorBuf=[],floorI=0,win=[],ep=null,last=null,hour=[],lastLevel=0,lastFloor=0,lastCry=false;
function reset(){floorBuf=[];floorI=0;win=[];ep=null;last=null;hour=[];lastLevel=0;lastFloor=0;lastCry=false;}
function db(x){return 20*Math.log(Math.max(1e-6,x))/Math.LN10;}
/* rumore di fondo: il 25° percentile degli ultimi FLOOR_S secondi. Non la media né la mediana, perché un pianto lungo
   le trascinerebbe verso l'alto e il rilevatore diventerebbe sordo a metà pianto. */
function floorDb(){
  if(!floorBuf.length)return -60;
  var a=floorBuf.slice().sort(function(x,y){return x-y;});
  return a[Math.floor(a.length*0.25)];
}
/* un frame "da pianto": più forte del fondo di quanto dice la sensibilità, con un tono acuto e tenuto */
function isCry(f,fl){
  var lv=db(f.rms);
  if(lv<fl+sens()[2])return false;
  if(lv<-46)return false;                       /* troppo piano in assoluto: è fruscio */
  return !!(f.f0&&f.f0>=F0_LO&&f.f0<=F0_HI);
}
/* quanti episodi nell'ultima ora (tetto contro i falsi allarmi a raffica) */
function inHour(now){hour=hour.filter(function(t){return now-t<36e5;});return hour.length;}
/* Riceve un frame {t,rms,zcr,cent,f0} e l'istante; torna l'evento creato quando un episodio si chiude. */
function push(f,now){
  now=now||f.t;
  var lv=db(f.rms);
  /* il fondo si impara solo mentre non sta piangendo: altrimenti il pianto alzerebbe la soglia contro se stesso */
  if(!ep){floorBuf[floorI%Math.round(FLOOR_S*1000/FRAME)]=lv;floorI++;}
  var fl=floorDb(),cry=isCry(f,fl);
  lastLevel=lv;lastFloor=fl;lastCry=cry;
  win.push({t:now,cry:cry,f:f});
  var from=now-WIN_S*1000;
  while(win.length&&win[0].t<from)win.shift();
  if(!ep){
    var on=0,first=null;
    win.forEach(function(w){if(w.cry){on+=FRAME;if(first==null)first=w.t;}});
    /* l'episodio comincia dal primo frame di pianto della finestra, non dall'inizio della finestra */
    if(on>=ON_S*1000)ep={start:first,lastCry:now,frames:win.filter(function(w){return w.t>=first;}).map(function(w){return w.f;})};
    return null;
  }
  ep.frames.push(f);
  if(cry)ep.lastCry=now;
  if(now-ep.lastCry>=OFF_S*1000)return close(now);
  return null;
}
/* chiude l'episodio: crea (o allunga) la voce del pianto */
function close(now){
  var e2=ep;ep=null;if(!e2)return null;
  var durMs=e2.lastCry-e2.start;
  if(durMs<MIN_S*1000)return null;
  var frames=e2.frames.filter(function(f){return f.t<=e2.lastCry;});
  /* i frame arrivano con il tempo dell'analisi: features() vuole t in millisecondi dall'inizio */
  var base=frames.length?frames[0].t:0,fr=frames.map(function(f){return {t:f.t-base,rms:f.rms,zcr:f.zcr,cent:f.cent,f0:f.f0};});
  var feat=API.features(fr);
  /* unione con il pianto di poco prima, così una crisi con pause non diventa dieci voci */
  if(last&&e2.start-last.end<=MERGE_S*1000){
    var ev=API.byId(last.id);
    if(ev){
      ev.dur=(e2.lastCry-ev.t)/1000;
      if(feat)ev.feat=feat;
      API.touched(ev);API.save();last.end=e2.lastCry;
      X.refresh();return ev;
    }
  }
  if(inHour(now)>=MAX_HOUR)return null;
  var c=API.context(e2.start);
  var e={id:API.uid(),k:'cry',t:e2.start,dur:durMs/1000,who:API.who(),label:null,
    ctx:API.snapshot(c),bins:API.bins(c),feat:feat,audio:false,auto:true};
  API.events().push(e);API.touched(e);
  hour.push(now);last={id:e.id,end:e2.lastCry};
  /* se nessun pianto è in attesa di spiegazione, questo lo diventa: dal telefono basta registrare cosa avete fatto */
  var S=API.state();if(!S.openCry)S.openCry=e.id;
  API.save();X.refresh();
  return e;
}

/* ---------- microfono ---------- */
var stream=null,ctx=null,an=null,tbuf=null,fbuf=null,timer=null,lock=null,err=null,started=0;
function running(){return !!timer;}
function stopMic(){
  if(timer){clearInterval(timer);timer=null;}
  if(ep)close(Date.now());
  if(stream){try{stream.getTracks().forEach(function(t){t.stop();});}catch(e){}stream=null;}
  if(ctx&&typeof ctx.close==='function'){try{ctx.close();}catch(e2){}}
  ctx=null;an=null;
  releaseLock();
}
function releaseLock(){if(lock){try{lock.release();}catch(e){}lock=null;}}
function keepAwake(){
  try{
    if(!navigator.wakeLock||!navigator.wakeLock.request)return;
    navigator.wakeLock.request('screen').then(function(l){lock=l;},function(){});
  }catch(e){}
}
/* avvio: getUserMedia dentro il tocco; un solo permesso per apertura dell'app */
function startMic(){
  err=null;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){err='Questo browser non dà il microfono alle pagine web.';X.refresh();return;}
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){err='Questo browser non ha il motore audio.';X.refresh();return;}
  try{ctx=new AC();}catch(e){err='Motore audio non disponibile.';X.refresh();return;}
  if(ctx.resume)try{ctx.resume();}catch(e2){}
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})
    .catch(function(){return navigator.mediaDevices.getUserMedia({audio:true});})
    .then(function(s){
      stream=s;
      var src=ctx.createMediaStreamSource(s);
      an=ctx.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=0;
      src.connect(an);
      tbuf=new Float32Array(an.fftSize);fbuf=new Uint8Array(an.frequencyBinCount);
      reset();started=Date.now();
      timer=setInterval(tick,FRAME);
      keepAwake();X.refresh();
    },function(e){
      err='Permesso microfono negato. Impostazioni → Safari → Microfono, poi riapri l\'app.';
      st.on=false;save();X.refresh();
    });
}
var frames=0;
function tick(){
  if(!an)return;
  var f=API.analyseFrame(an,tbuf,fbuf,ctx.sampleRate);
  f.t=Date.now();
  push(f,f.t);
  /* il disegno costa: la barra quattro volte al secondo, testo e orologio una */
  if(frames%4===0){var el=API.q('#asLevel');if(el&&el.style)el.style.width=meterPct()+'%';}
  if(frames%20===0){
    var s2=API.q('#asState');if(s2)s2.textContent=stateText();
    var ck=API.q('#asClock');if(ck)ck.textContent=API.fmtTime(Date.now());
  }
  frames++;
}
function setOn(on,tap){
  st.on=!!on;save();
  if(st.on){if(tap!==false)startMic();}
  else stopMic();
  X.refresh();
}
function toggle(){setOn(!st.on);}
function setSens(i){i=+i;if(!(i>=0&&i<=2))return;st.sens=i;save();X.refresh();}

/* ---------- testi e schermate ---------- */
function todayCries(){
  var d=new Date();d.setHours(0,0,0,0);var from=d.getTime();
  return API.events().filter(function(e){return e.k==='cry'&&e.t>=from;});
}
/* barra del livello: vuota quando il microfono non sta ascoltando */
function meterPct(){return running()?Math.max(0,Math.min(100,(lastLevel+60)/60*100)):0;}
function stateText(){
  if(!running())return st.on?'microfono in attesa…':'spento';
  if(ep)return 'sta piangendo…';
  return 'in ascolto · fondo '+Math.round(lastFloor)+' dB';
}
function summary(){
  var c=todayCries(),auto=c.filter(function(e){return e.auto;}).length;
  return c.length+(c.length===1?' pianto oggi':' pianti oggi')+(auto?' · '+auto+' sentiti dall\'app':'');
}
function open(){window.A.flow('ascolto',null,{});}
function render(){
  var h='<div class="bar">'+API.backBtn()+'<div class="title">Ascolto del pianto</div></div>';
  h+='<button class="btn huge as-main'+(running()?' on':'')+'" onclick="AlanExt.ascolto.toggle()">'+(st.on?'Spegni l\'ascolto':'Accendi l\'ascolto')+'<small id="asState">'+API.esc(stateText())+'</small></button>';
  if(err)h+='<p class="hint as-err">'+API.esc(err)+'</p>';
  h+='<div class="as-meter"><i id="asLevel" style="width:'+meterPct()+'%"></i></div>';
  h+='<p class="st-read">'+API.esc(summary())+'</p>';
  h+='<h2>Quanto orecchio</h2><div class="seg wide">'+SENS.map(function(s,i){return '<button class="'+(i===st.sens?'on':'')+'" onclick="AlanExt.ascolto.setSens('+i+')">'+s[0]+'</button>';}).join('')+'</div>';
  h+='<p class="hint as-hint">'+API.esc(sens()[1])+': conta solo quello che supera il rumore di fondo di tanto. Con il rumore bianco acceso il fondo si alza da solo, quindi va bene lo stesso.</p>';
  h+='<div class="spacer"></div><button class="btn ghost" onclick="AlanExt.ascolto.dark()">Schermo scuro</button>';
  h+='<p class="hint">Funziona solo con l\'app aperta e lo schermo acceso: il telefono spegne il microfono appena esci o si blocca lo schermo. Tienilo in carica vicino al lettino. Il microfono resta aperto e il permesso si dà una volta per apertura dell\'app. Non viene salvato nessun audio: solo l\'ora, la durata e l\'impronta del suono, come nei pianti registrati a mano.</p>';
  return h;
}
/* schermata nera per la notte: solo ora e stato, niente luce */
function dark(){window.A.flow('ascoltodark',null,{});}
function renderDark(){
  return '<div class="as-dark" onclick="A.home()"><div class="as-clock" id="asClock">'+API.fmtTime(Date.now())+'</div>'+
    '<div class="as-st" id="asState">'+API.esc(stateText())+'</div><div class="as-sum">'+API.esc(summary())+'</div>'+
    '<div class="hint">tocca per uscire</div></div>';
}
X.flow('ascolto',{render:render,finish:function(){return false;}});
X.flow('ascoltodark',{render:renderDark,finish:function(){return false;}});

/* riga in Home quando è acceso, e scheda in Altro */
X.home('ascolto',function(){
  if(!st.on)return '';
  return '<div class="nz-card on"><button class="nz-txt" onclick="AlanExt.ascolto.open()"><b>Ascolto del pianto</b><span>'+API.esc(stateText()+' · '+summary())+'</span></button>'+
    '<button class="nz-btn" onclick="AlanExt.ascolto.toggle()">Spegni</button></div>';
},'mid');
X.slot('altro',function(){
  var h='<div class="card as-card"><h3>Ascolto del pianto</h3>';
  h+='<p class="hint">Su un dispositivo lasciato nella stanza, l\'app sente il pianto e lo segna da sola: quante volte, a che ora, per quanto e con che tono. Nessun audio salvato. Solo su questo dispositivo: sugli altri resta spento.</p>';
  h+='<button class="rm-sw" role="switch" aria-checked="'+(st.on?'true':'false')+'" onclick="AlanExt.ascolto.toggle()"><span class="rm-sw-t">Ascolta il pianto<small>'+API.esc(st.on?stateText():'spento')+'</small></span><i></i></button>';
  h+='<div class="spacer"></div><button class="btn ghost" onclick="AlanExt.ascolto.open()">Apri l\'ascolto</button>';
  return h+'</div>';
});
/* tornando in primo piano il microfono va riacceso: iOS l'ha chiuso uscendo */
if(document.addEventListener)document.addEventListener('visibilitychange',function(){
  if(document.hidden){if(running())stopMic();}
  else if(st.on&&!running()){/* serve un tocco: lo dice la schermata */X.refresh();}
});

X.ascolto={KEY:KEY,FRAME:FRAME,WIN_S:WIN_S,ON_S:ON_S,OFF_S:OFF_S,MIN_S:MIN_S,MERGE_S:MERGE_S,MAX_HOUR:MAX_HOUR,SENS:SENS,F0_LO:F0_LO,F0_HI:F0_HI,
  state:function(){return st;},setOn:setOn,toggle:toggle,setSens:setSens,sens:sens,save:save,
  push:push,close:close,reset:reset,isCry:isCry,floorDb:floorDb,db:db,episode:function(){return ep;},inHour:inHour,
  running:running,startMic:startMic,stopMic:stopMic,open:open,dark:dark,render:render,renderDark:renderDark,
  stateText:stateText,summary:summary,todayCries:todayCries,meterPct:meterPct};
X.refresh();
})();
