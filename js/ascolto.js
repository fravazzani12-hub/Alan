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
var CLEAR=0.55,CLEAR_S=5;     /* audio tenuto solo se il pianto è nitido e dura almeno tanto */
var WIN_S=2.5,ON_S=1.2,OFF_S=8,MIN_S=3,MERGE_S=60,MAX_HOUR=20;
var FLOOR_S=30;               /* memoria del rumore di fondo */
var SENS=[['bassa','+14 dB sul fondo',14],['media','+10 dB sul fondo',10],['alta','+7 dB sul fondo',7]];
var F0_LO=250,F0_HI=750;      /* il pianto di un neonato sta qui; la voce di un adulto molto più in basso */

/* ---------- impostazioni, solo su questo dispositivo ---------- */
var st={on:false,sens:1,audio:true};
(function(){try{var o=JSON.parse(API.lsGet(KEY)||'{}');st.on=!!o.on;st.sens=(o.sens>=0&&o.sens<=2)?o.sens:1;if(o.audio!==undefined)st.audio=!!o.audio;}catch(e){}})();
function save(){API.lsSet(KEY,JSON.stringify(st));}
function sens(){return SENS[st.sens]||SENS[1];}

/* ---------- rilevatore (niente microfono qui dentro: riceve i frame, così si può provare) ---------- */
var floorBuf=[],floorI=0,win=[],ep=null,last=null,hour=[],lastLevel=0,lastFloor=0,lastCry=false,guess=null,guessAt=0;
function reset(){floorBuf=[];floorI=0;win=[];ep=null;last=null;hour=[];lastLevel=0;lastFloor=0;lastCry=false;guess=null;guessAt=0;}
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
/* Nitidezza dell'episodio: quanto il pianto stacca dal rumore intorno. Serve a tenere l'audio solo dei pianti chiari,
   quelli che ha senso riascoltare: 0 = confuso, 1 = pulito. */
function clarity(e2){
  if(!e2||!e2.frames.length)return 0;
  var fl=e2.floor,cryN=0,sum=0,n=0;
  e2.frames.forEach(function(f){
    var lv=db(f.rms);n++;
    if(f.f0&&f.f0>=F0_LO&&f.f0<=F0_HI&&lv>=fl+sens()[2]){cryN++;sum+=lv-fl;}
  });
  if(!cryN||!n)return 0;
  var share=cryN/n,over=sum/cryN;               /* quanto spesso è pianto e di quanto supera il fondo */
  return Math.max(0,Math.min(1,(share/0.5)*0.5+(Math.min(over,24)/24)*0.5))*(share>=0.25?1:0);
}
function isClear(e2){return clarity(e2)>=CLEAR&&(e2.lastCry-e2.start)>=CLEAR_S*1000;}
/* ipotesi in tempo reale mentre piange: le stesse dell'app, sui frame raccolti fin qui */
function liveGuess(){
  if(!ep)return null;
  var base=ep.frames.length?ep.frames[0].t:0;
  var fr=ep.frames.map(function(f){return {t:f.t-base,rms:f.rms,zcr:f.zcr,cent:f.cent,f0:f.f0};});
  var feat=null;try{feat=API.features(fr);}catch(e){}
  var c=API.context(ep.start);
  try{return API.hypotheses(API.snapshot(c),API.bins(c),feat?feat.vec:null);}catch(e2){return null;}
}
/* riquadro dal vivo mentre piange: le due ipotesi più probabili e il percorso da provare (che registrando lo spiega) */
function liveBox(){
  if(!ep||!guess||!guess.list.length)return '';
  var h='<div class="as-live"><div class="as-live-h">Sta piangendo</div>';
  guess.list.slice(0,2).forEach(function(x){
    h+='<div class="as-g" style="--hc:'+x.c+'"><i></i><b>'+API.esc(x.label)+'</b><span>'+Math.round(x.p*100)+'%</span></div>';
  });
  var t=API.TRY[guess.list[0].id];
  if(t)h+='<button class="btn as-try" onclick="A.flow(\''+t[0]+'\')">Prova: '+API.esc(t[1])+'</button>';
  h+='<p class="hint">Ipotesi sui vostri dati, non una diagnosi. Registrando quello che fate, il pianto resta spiegato.</p></div>';
  return h;
}
function guessText(){
  var hy=guess;if(!hy||!hy.list.length)return '';
  var x=hy.list[0];
  return 'probabilmente '+x.label.toLowerCase()+' '+Math.round(x.p*100)+'%';
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
    if(on>=ON_S*1000){
      ep={start:first,lastCry:now,frames:win.filter(function(w){return w.t>=first;}).map(function(w){return w.f;}),floor:fl};
      guess=null;guessAt=0;recStart();
    }
    return null;
  }
  ep.frames.push(f);
  if(cry)ep.lastCry=now;
  /* l'ipotesi si aggiorna una volta al secondo, così la schermata dice subito cosa potrebbe essere */
  if(now-guessAt>=1000){guessAt=now;guess=liveGuess();}
  if(now-ep.lastCry>=OFF_S*1000)return close(now);
  return null;
}
/* chiude l'episodio: crea (o allunga) la voce del pianto */
function close(now){
  var e2=ep;ep=null;guess=null;
  var blob=recStop();
  if(!e2)return null;
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
      if(blob){if(!ev.audio&&isClear(e2))keepAudio(ev,blob);else audioLog='audio non tenuto (già presente o poco nitido)';}
      X.refresh();return ev;
    }
  }
  if(inHour(now)>=MAX_HOUR)return null;
  var c=API.context(e2.start);
  var e={id:API.uid(),k:'cry',t:e2.start,dur:durMs/1000,who:API.who(),label:null,
    ctx:API.snapshot(c),bins:API.bins(c),feat:feat,audio:false,auto:true,clarity:Math.round(clarity(e2)*100)/100};
  API.events().push(e);API.touched(e);
  if(blob){if(isClear(e2))keepAudio(e,blob);else audioLog='pianto poco nitido o corto: audio non tenuto';}
  hour.push(now);last={id:e.id,end:e2.lastCry};
  /* se nessun pianto è in attesa di spiegazione, questo lo diventa: dal telefono basta registrare cosa avete fatto */
  var S=API.state();if(!S.openCry)S.openCry=e.id;
  API.save();X.refresh();
  return e;
}

/* ---------- audio dei pianti nitidi ----------
   Si registra mentre l'episodio è aperto, ma si tiene solo se alla fine il pianto risulta nitido (isClear): gli altri
   si buttano, così restano da riascoltare solo quelli utili a capire. Salvataggio e invio sono quelli dell'app. */
var mr=null,audioLog='';
function recStart(){
  if(!st.audio){audioLog='audio spento';return;}
  if(!stream){audioLog='microfono non aperto';return;}
  var MR=window.MediaRecorder;
  if(!MR){audioLog='questo browser non registra (MediaRecorder assente)';return;}
  try{
    var cands=['audio/mp4','audio/webm;codecs=opus','audio/webm'],mime='';
    if(MR.isTypeSupported)mime=cands.filter(function(m){return MR.isTypeSupported(m);})[0]||'';
    mr=mime?new MR(stream,{mimeType:mime}):new MR(stream);
    /* i pezzi vanno in un array legato a QUESTA registrazione: l'ultimo arriva dopo stop(), quindi non si può
       sostituire l'array mentre si chiude (era il motivo per cui l'audio restava vuoto) */
    var cs=mr._cs=[];
    mr.ondataavailable=function(ev){if(ev.data&&ev.data.size)cs.push(ev.data);};
    mr.start();                                   /* senza timeslice: su Safari i pezzi intermedi non si riaprono */
    audioLog='registro in '+(mime||'formato predefinito')+'…';
  }catch(e){mr=null;audioLog='registratore non partito: '+(e&&e.message?e.message:e);}
}
/* ferma la registrazione e torna il blob quando è pronto (la promessa si risolve dopo, keepAudio la aspetta) */
function recStop(){
  if(!mr)return null;
  var m=mr,cs=m._cs||[];mr=null;
  var p=new Promise(function(res){
    var done=function(){
      var type=(m.mimeType||'audio/mp4');
      try{res(cs.length?new Blob(cs,{type:type}):null);}catch(e){res(null);}
    };
    m.onstop=done;
    try{if(m.state!=='inactive')m.stop();else done();}catch(e){done();}
  });
  return {promise:p,mime:m.mimeType||''};
}
/* tiene l'audio sulla voce: in locale e, se c'è la famiglia, in coda verso il cloud come i pianti registrati a mano */
function keepAudio(e,rec){
  if(!rec||!rec.promise){audioLog='nessuna registrazione da salvare';return;}
  rec.promise.then(function(blob){
    if(!blob||!blob.size){audioLog='registrazione vuota';refresh();return;}
    return API.blobToBuf(blob).then(function(bufr){
      return API.audioPut(e.id,bufr,blob.type||rec.mime||'').then(function(){
        e.audio=true;e.mime=blob.type||rec.mime||'';
        API.touched(e);API.save();
        try{API.queueUpload(e.id);}catch(x){}
        audioLog='audio tenuto · '+Math.round(blob.size/1024)+' kB';
        refresh();
      });
    });
  }).catch(function(x){audioLog='audio non salvato: '+(x&&x.message?x.message:x);refresh();});
}
function setAudio(on){st.audio=!!on;save();refresh();}

/* ---------- microfono ---------- */
var stream=null,ctx=null,an=null,tbuf=null,fbuf=null,timer=null,lock=null,err=null,started=0;
function running(){return !!timer;}
function stopMic(){
  if(timer){clearInterval(timer);timer=null;}
  if(ep)close(Date.now());else recStop();
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
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){err='Questo browser non dà il microfono alle pagine web.';refresh();return;}
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){err='Questo browser non ha il motore audio.';refresh();return;}
  try{ctx=new AC();}catch(e){err='Motore audio non disponibile.';refresh();return;}
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
      keepAwake();refresh();
    },function(e){
      err='Permesso microfono negato. Impostazioni → Safari → Microfono, poi riapri l\'app.';
      st.on=false;save();refresh();
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
    /* mentre piange la schermata si ridisegna una volta al secondo: le ipotesi cambiano man mano che il suono arriva */
    var f=API.flow(),el=f?API.q('#screenInner'):null;
    if(ep&&el&&f.type==='ascolto')el.innerHTML=render();
    else if(ep&&el&&f.type==='ascoltodark')el.innerHTML=renderDark();
    else{
      var s2=API.q('#asState');if(s2)s2.textContent=stateText();
      var ck=API.q('#asClock');if(ck)ck.textContent=API.fmtTime(Date.now());
    }
  }
  frames++;
}
/* ridisegna la schermata dell'ascolto se è aperta, e il resto dell'app */
function refresh(){
  var f=API.flow(),el=f?API.q('#screenInner'):null;
  if(el&&f.type==='ascolto')el.innerHTML=render();
  else if(el&&f.type==='ascoltodark')el.innerHTML=renderDark();
  X.refresh();
}
function setOn(on,tap){
  st.on=!!on;save();
  if(st.on){if(tap!==false)startMic();}
  else stopMic();
  refresh();
}
function toggle(){setOn(!st.on);}
function setSens(i){i=+i;if(!(i>=0&&i<=2))return;st.sens=i;save();refresh();}

/* ---------- testi e schermate ---------- */
function todayCries(){
  var d=new Date();d.setHours(0,0,0,0);var from=d.getTime();
  return API.events().filter(function(e){return e.k==='cry'&&e.t>=from;});
}
/* barra del livello: vuota quando il microfono non sta ascoltando */
function meterPct(){return running()?Math.max(0,Math.min(100,(lastLevel+60)/60*100)):0;}
function stateText(){
  if(!running())return st.on?'microfono in attesa…':'spento';
  if(ep)return 'sta piangendo… '+(guessText()||'');
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
  h+=liveBox();
  h+='<h2>Quanto orecchio</h2><div class="seg wide">'+SENS.map(function(s,i){return '<button class="'+(i===st.sens?'on':'')+'" onclick="AlanExt.ascolto.setSens('+i+')">'+s[0]+'</button>';}).join('')+'</div>';
  h+='<p class="hint as-hint">'+API.esc(sens()[1])+': conta solo quello che supera il rumore di fondo di tanto. Con il rumore bianco acceso il fondo si alza da solo, quindi va bene lo stesso.</p>';
  h+='<h2>Audio</h2><button class="rm-sw" role="switch" aria-checked="'+(st.audio?'true':'false')+'" onclick="AlanExt.ascolto.setAudio('+(st.audio?'false':'true')+')"><span class="rm-sw-t">Tieni l\'audio dei pianti nitidi<small>solo quelli chiari e lunghi almeno '+CLEAR_S+' s, da riascoltare per capire</small></span><i></i></button>';
  if(audioLog)h+='<p class="hint as-log">Audio: '+API.esc(audioLog)+'</p>';
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
  refresh:refresh,stateText:stateText,summary:summary,todayCries:todayCries,meterPct:meterPct,
  audioLog:function(){return audioLog;},recStart:recStart,recStop:recStop,keepAudio:keepAudio,
  setStream:function(s){stream=s;},clarity:clarity,isClear:isClear,liveGuess:liveGuess,guessText:guessText,liveBox:liveBox,guess:function(){return guess;},setAudio:setAudio,CLEAR:CLEAR,CLEAR_S:CLEAR_S};
X.refresh();
})();
