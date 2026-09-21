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
var HANG_S=1.5;              /* quanto vale ancora come pianto un frame forte senza tono */
var FLOOR_S=30;               /* memoria del rumore di fondo */
var SENS=[['bassa','+14 dB sul fondo',14],['media','+10 dB sul fondo',10],['alta','+7 dB sul fondo',7]];
var F0_LO=250,F0_HI=750;      /* il pianto di un neonato sta qui; la voce di un adulto molto più in basso */

/* ---------- impostazioni, solo su questo dispositivo ---------- */
var st={on:false,sens:1,audio:true};
(function(){try{var o=JSON.parse(API.lsGet(KEY)||'{}');st.on=!!o.on;st.sens=(o.sens>=0&&o.sens<=2)?o.sens:1;if(o.audio!==undefined)st.audio=!!o.audio;}catch(e){}})();
function save(){API.lsSet(KEY,JSON.stringify(st));}
function sens(){return SENS[st.sens]||SENS[1];}

/* ---------- diario degli episodi (solo su questo dispositivo) ----------
   Un pianto sentito ma non segnato non lascia traccia da nessuna parte: senza questo elenco non si capisce
   se l'episodio è stato scartato perché corto, unito al precedente o fermato dal tetto orario. */
var LOGKEY='alan.ascolto.log',LOG=[],LOG_MAX=12;
(function(){try{var a=JSON.parse(API.lsGet(LOGKEY)||'[]');if(a&&a.length)LOG=a.slice(0,LOG_MAX);}catch(e){}})();
function logSave(){try{API.lsSet(LOGKEY,JSON.stringify(LOG));}catch(e){}}
function logAdd(o){LOG.unshift(o);if(LOG.length>LOG_MAX)LOG.length=LOG_MAX;logSave();}
function logAudio(id,kb){for(var i=0;i<LOG.length;i++)if(LOG[i].id===id){LOG[i].kb=kb;logSave();return;}}

/* ---------- rilevatore (niente microfono qui dentro: riceve i frame, così si può provare) ---------- */
var floorBuf=[],floorI=0,win=[],ep=null,last=null,hour=[],lastLevel=0,lastFloor=0,lastCry=false,guess=null,guessAt=0;
var statBuf=[],statI=0,STAT_N=Math.round(FLOOR_S*1000/FRAME);
function reset(){floorBuf=[];floorI=0;win=[];ep=null;last=null;hour=[];lastLevel=0;lastFloor=0;lastCry=false;guess=null;guessAt=0;statBuf=[];statI=0;}
function db(x){return 20*Math.log(Math.max(1e-6,x))/Math.LN10;}
/* rumore di fondo: il 25° percentile degli ultimi FLOOR_S secondi. Non la media né la mediana, perché un pianto lungo
   le trascinerebbe verso l'alto e il rilevatore diventerebbe sordo a metà pianto. */
function floorDb(){
  if(!floorBuf.length)return -60;
  var a=floorBuf.slice().sort(function(x,y){return x-y;});
  return a[Math.floor(a.length*0.25)];
}
/* un frame "da pianto": più forte del fondo di quanto dice la sensibilità, con un tono acuto e tenuto */
function loud(f,fl){var lv=db(f.rms);return lv>=fl+sens()[2]&&lv>=-46;}  /* -46 dBFS: sotto è fruscio */
function pitched(f){return !!(f.f0&&f.f0>=F0_LO&&f.f0<=F0_HI);}
function isCry(f,fl){return loud(f,fl)&&pitched(f);}
/* Nitidezza dell'episodio: quanto il pianto stacca dal rumore intorno. Serve a tenere l'audio solo dei pianti chiari,
   quelli che ha senso riascoltare: 0 = confuso, 1 = pulito. */
function clarity(e2){
  if(!e2||!e2.frames.length)return 0;
  /* solo i frame fino all'ultimo pianto: gli 8 s di quiete che chiudono l'episodio non sono confusione */
  var fl=e2.floor,cryN=0,sum=0,n=0,fs=e2.frames.filter(function(f){return f.t<=e2.lastCry;});
  fs.forEach(function(f){
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
  var fl=floorDb(),cry=isCry(f,fl),lo=loud(f,fl);
  statBuf[statI%STAT_N]={lv:lv,p:pitched(f)?1:0,l:lo?1:0};statI++;
  lastLevel=lv;lastFloor=fl;lastCry=cry;
  win.push({t:now,cry:cry,f:f});
  var from=now-WIN_S*1000;
  while(win.length&&win[0].t<from)win.shift();
  if(!ep){
    var on=0,first=null;
    win.forEach(function(w){if(w.cry){on+=FRAME;if(first==null)first=w.t;}});
    /* l'episodio comincia dal primo frame di pianto della finestra, non dall'inizio della finestra */
    if(on>=ON_S*1000){
      ep={start:first,lastCry:now,pitchAt:now,frames:win.filter(function(w){return w.t>=first;}).map(function(w){return w.f;}),floor:fl};
      guess=null;guessAt=0;recStart();
    }
    return null;
  }
  ep.frames.push(f);
  /* dentro l'episodio il tono non si trova a ogni frame (respiri, singhiozzi, distanza): un frame forte vale come
     pianto se un tono c'era da meno di HANG_S. Senza questa coda un pianto vero si chiudeva lungo un secondo. */
  if(cry){ep.lastCry=now;ep.pitchAt=now;}
  else if(lo&&now-ep.pitchAt<=HANG_S*1000)ep.lastCry=now;
  /* l'ipotesi si aggiorna una volta al secondo, così la schermata dice subito cosa potrebbe essere */
  if(now-guessAt>=1000){guessAt=now;guess=liveGuess();}
  if(now-ep.lastCry>=OFF_S*1000)return close(now);
  return null;
}
/* numeri dell'episodio, quelli che servono a capire perché è finito come è finito */
function epStats(fs,fl){
  var n=fs.length,cry=0,pit=0,sum=0;
  fs.forEach(function(f){
    if(pitched(f))pit++;
    if(isCry(f,fl)){cry++;sum+=db(f.rms)-fl;}
  });
  return {n:n,pit:pit,cry:cry,over:cry?sum/cry:0};
}
function logRow(e2,durMs,ex,out,id,keep){
  return {t:e2.start,dur:Math.round(durMs/100)/10,out:out,id:id||null,
    tono:ex.n?Math.round(ex.pit/ex.n*100):0,over:Math.round(ex.over),fl:Math.round(e2.floor),
    nit:Math.round(clarity(e2)*100)/100,keep:!!keep,kb:0};
}
/* com'è il suono adesso: serve a guardare la schermata mentre piange e capire se il microfono lo sente */
function liveStats(){
  var n=statBuf.length;if(!n)return null;
  var peak=-120,p=0,l=0,i;
  for(i=0;i<n;i++){if(statBuf[i].lv>peak)peak=statBuf[i].lv;p+=statBuf[i].p;l+=statBuf[i].l;}
  return {fl:floorDb(),thr:floorDb()+sens()[2],peak:peak,tono:p/n,forte:l/n,n:n};
}
/* chiude l'episodio: crea (o allunga) la voce del pianto */
function close(now){
  var e2=ep;ep=null;guess=null;
  var blob=recStop();
  if(!e2)return null;
  var durMs=e2.lastCry-e2.start;
  /* i frame del pianto vero: la quiete finale serviva solo a capire che era finito */
  var frames=e2.frames.filter(function(f){return f.t<=e2.lastCry;}),ex=epStats(frames,e2.floor);
  if(durMs<MIN_S*1000){logAdd(logRow(e2,durMs,ex,'corto'));X.refresh();return null;}
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
      var keep=blob&&!ev.audio&&isClear(e2);
      if(blob){if(keep)keepAudio(ev,blob);else audioLog='audio non tenuto (già presente o poco nitido)';}
      logAdd(logRow(e2,durMs,ex,'unito',ev.id,keep));
      X.refresh();return ev;
    }
  }
  if(inHour(now)>=MAX_HOUR){logAdd(logRow(e2,durMs,ex,'tetto'));X.refresh();return null;}
  var c=API.context(e2.start);
  var e={id:API.uid(),k:'cry',t:e2.start,dur:durMs/1000,who:API.who(),label:null,
    ctx:API.snapshot(c),bins:API.bins(c),feat:feat,audio:false,auto:true,clarity:Math.round(clarity(e2)*100)/100};
  API.events().push(e);API.touched(e);
  var keep2=blob&&isClear(e2);
  if(blob){if(keep2)keepAudio(e,blob);else audioLog='pianto poco nitido o corto: audio non tenuto';}
  logAdd(logRow(e2,durMs,ex,'salvato',e.id,keep2));
  hour.push(now);last={id:e.id,end:e2.lastCry};
  /* se nessun pianto è in attesa e questo è abbastanza lungo da valere la domanda (soglia in app.js), lo diventa */
  var S=API.state();if(!S.openCry&&API.askExplain(e))S.openCry=e.id;
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
        logAudio(e.id,Math.round(blob.size/1024));
        refresh();
      });
    });
  }).catch(function(x){audioLog='audio non salvato: '+(x&&x.message?x.message:x);refresh();});
}
function setAudio(on){st.audio=!!on;save();refresh();}

/* ---------- microfono ---------- */
var stream=null,ctx=null,an=null,tbuf=null,fbuf=null,timer=null,lock=null,err=null,started=0;
var graph=null,micTry=0,micLive=0,micNote='';
function running(){return !!timer;}
function stopMic(){
  if(timer){clearInterval(timer);timer=null;}
  if(ep)close(Date.now());else recStop();
  if(graph){try{API.micGraphStop(graph);}catch(e3){}graph=null;}
  if(stream){try{stream.getTracks().forEach(function(t){t.stop();});}catch(e){}stream=null;}
  if(ctx&&typeof ctx.close==='function'){try{ctx.close();}catch(e2){}}
  ctx=null;an=null;micTry=0;micLive=0;micNote='';
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
      attach(0);
      reset();started=Date.now();
      timer=setInterval(tick,FRAME);
      keepAwake();refresh();
    },function(e){
      err='Permesso microfono negato. Impostazioni → Safari → Microfono, poi riapri l\'app.';
      st.on=false;save();refresh();
    });
}
/* Collegamento al motore audio, con la scala di ripieghi di app.js: traccia clonata, traccia originale,
   contesto nuovo. Su iPad il primo modo a volte resta muto e senza questo l'ascolto non sente nulla. */
function attach(mode){
  if(!stream)return;
  try{
    if(graph){API.micGraphStop(graph);graph=null;an=null;}
    if(mode===2){
      var AC=window.AudioContext||window.webkitAudioContext;
      try{if(ctx&&ctx.close)ctx.close();}catch(e2){}
      ctx=new AC();
      if(ctx.resume)try{ctx.resume();}catch(e3){}
    }
    graph=API.micGraph(ctx,stream,mode||0);
    an=graph.an;tbuf=graph.tbuf;fbuf=graph.fbuf;
    micTry=mode||0;micLive=0;
    if(ctx.state!=='running'&&ctx.resume)try{ctx.resume();}catch(e4){}
  }catch(e){an=null;err='Microfono non collegato al motore audio.';}
}
/* niente segnale = tutti i campioni esattamente a zero: un microfono vero non è mai muto così */
function micWatch(f){
  if(f.rms>0){micLive++;if(micLive===1&&micTry)micNote=MIC_NOTE[micTry];return;}
  if(micLive||micTry>=2||!started)return;
  if(Date.now()-started>=1500*(micTry+1))attach(micTry+1);
}
var MIC_NOTE=['','collegato con la traccia originale','motore audio ricreato dopo il permesso'];
var frames=0;
function tick(){
  if(!an)return;
  var f=API.analyseFrame(an,tbuf,fbuf,ctx.sampleRate);
  f.t=Date.now();
  micWatch(f);
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
  if(!micLive&&started&&Date.now()-started>4500)return 'il microfono non arriva al motore audio';
  if(ep)return 'sta piangendo… '+(guessText()||'');
  return 'in ascolto · fondo '+Math.round(lastFloor)+' dB'+(micNote?' · '+micNote:'');
}
function summary(){
  var c=todayCries(),auto=c.filter(function(e){return e.auto;}).length;
  return c.length+(c.length===1?' pianto oggi':' pianti oggi')+(auto?' · '+auto+(auto===1?' sentito':' sentiti')+' dall\'app':'');
}
/* riga dei numeri sotto la barra: fondo, soglia, picco e quanto spesso si trova un tono da pianto */
function statLine(){
  if(!running())return '';
  var v=liveStats();
  if(!v||v.n<10)return '<p class="hint as-num">sto misurando il rumore di fondo…</p>';
  return '<p class="hint as-num">fondo '+Math.round(v.fl)+' dB · soglia '+Math.round(v.thr)+' dB · picco '+Math.round(v.peak)+
    ' dB · tono da pianto nel '+Math.round(v.tono*100)+'% degli ultimi 30 s</p>';
}
var OUT={salvato:'segnato',unito:'unito al pianto di poco prima',corto:'troppo corto, non segnato',tetto:'troppi episodi in un\'ora, non segnato'};
/* elenco degli episodi sentiti: l'unico modo per sapere perché un pianto non è finito nel diario */
function logCard(){
  var h='<h2>Ultimi episodi sentiti</h2>';
  if(!LOG.length)return h+'<p class="hint">Ancora nessuno. Un pianto si segna quando finisce, cioè dopo '+OFF_S+' s di quiete: mentre piange non è ancora nel diario.</p>';
  h+='<div class="as-eps">';
  LOG.forEach(function(r){
    h+='<div class="as-ep"><div class="as-ep-h"><b>'+API.fmtTime(r.t)+'</b><span>'+r.dur+' s · '+(OUT[r.out]||r.out)+
      (r.out==='salvato'||r.out==='unito'?(r.keep?' · audio'+(r.kb?' '+r.kb+' kB':' in arrivo'):' · senza audio'):'')+'</span></div>'+
      '<small>tono nel '+r.tono+'% dei frame · '+(r.over>0?'+'+r.over:''+r.over)+' dB sul fondo ('+r.fl+' dB) · nitidezza '+String(r.nit).replace('.',',')+'</small></div>';
  });
  h+='</div><p class="hint">Un pianto si segna quando finisce, dopo '+OFF_S+' s di quiete, e solo se dura almeno '+MIN_S+' s. L\'audio si tiene solo se il pianto è nitido e lungo almeno '+CLEAR_S+' s.</p>';
  return h;
}
function open(){window.A.flow('ascolto',null,{});}
function render(){
  var h='<div class="bar">'+API.backBtn()+'<div class="title">Ascolto del pianto</div></div>';
  h+='<button class="btn huge as-main'+(running()?' on':'')+'" onclick="AlanExt.ascolto.toggle()">'+(st.on?'Spegni l\'ascolto':'Accendi l\'ascolto')+'<small id="asState">'+API.esc(stateText())+'</small></button>';
  if(err)h+='<p class="hint as-err">'+API.esc(err)+'</p>';
  h+='<div class="as-meter"><i id="asLevel" style="width:'+meterPct()+'%"></i></div>';
  h+=statLine();
  h+='<p class="st-read">'+API.esc(summary())+'</p>';
  h+=liveBox();
  h+='<h2>Quanto orecchio</h2><div class="seg wide">'+SENS.map(function(s,i){return '<button class="'+(i===st.sens?'on':'')+'" onclick="AlanExt.ascolto.setSens('+i+')">'+s[0]+'</button>';}).join('')+'</div>';
  h+='<p class="hint as-hint">'+API.esc(sens()[1])+': conta solo quello che supera il rumore di fondo di tanto. Con il rumore bianco acceso il fondo si alza da solo, quindi va bene lo stesso.</p>';
  h+='<h2>Audio</h2><button class="rm-sw" role="switch" aria-checked="'+(st.audio?'true':'false')+'" onclick="AlanExt.ascolto.setAudio('+(st.audio?'false':'true')+')"><span class="rm-sw-t">Tieni l\'audio dei pianti nitidi<small>solo quelli chiari e lunghi almeno '+CLEAR_S+' s, da riascoltare per capire</small></span><i></i></button>';
  if(audioLog)h+='<p class="hint as-log">Audio: '+API.esc(audioLog)+'</p>';
  h+=logCard();
  h+='<div class="spacer"></div><button class="btn ghost" onclick="AlanExt.ascolto.dark()">Schermo scuro</button>';
  h+='<p class="hint">Funziona solo con l\'app aperta e lo schermo acceso: il telefono spegne il microfono appena esci o si blocca lo schermo. Tienilo in carica vicino al lettino. Il microfono resta aperto e il permesso si dà una volta per apertura dell\'app. Dell\'audio si tiene solo quello dei pianti nitidi, e solo se l\'interruttore qui sopra è acceso: di ogni pianto restano comunque l\'ora, la durata e l\'impronta del suono, come nei pianti registrati a mano.</p>';
  return h;
}
/* schermata nera per la notte: solo ora e stato, niente luce. Si tocca dove si vuole per tornare all'app. */
var darkT=null;
function dark(){
  window.A.flow('ascoltodark',null,{});
  /* l'orologio va avanti anche con l'ascolto spento: l'intervallo si spegne da solo quando si esce */
  if(darkT)clearInterval(darkT);
  darkT=setInterval(function(){
    var f=API.flow();
    if(!f||f.type!=='ascoltodark'){clearInterval(darkT);darkT=null;return;}
    var ck=API.q('#asClock');if(ck)ck.textContent=API.fmtTime(Date.now());
    var s2=API.q('#asState');if(s2)s2.textContent=stateText();
  },10000);
}
function renderDark(){
  return '<div class="as-dark" onclick="A.home()"><div class="as-clock" id="asClock">'+API.fmtTime(Date.now())+'</div>'+
    '<div class="as-st" id="asState">'+API.esc(stateText())+'</div><div class="as-sum">'+API.esc(summary())+'</div>'+
    '<div class="hint">tocca dove vuoi per tornare all\'app</div></div>';
}
X.flow('ascolto',{render:render,finish:function(){return false;}});
X.flow('ascoltodark',{render:renderDark,finish:function(){return false;}});

/* riga in Home quando è acceso, e scheda in Altro */
X.home('ascolto',function(){
  if(!st.on)return '';
  return '<div class="nz-card on as-row"><button class="nz-txt" onclick="AlanExt.ascolto.open()"><b>Ascolto del pianto</b><span>'+API.esc(stateText()+' · '+summary())+'</span></button>'+
    '<button class="nz-btn" onclick="AlanExt.ascolto.dark()">Scuro</button>'+
    '<button class="nz-btn ghost" onclick="AlanExt.ascolto.toggle()">Spegni</button></div>';
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
  log:function(){return LOG;},liveStats:liveStats,statLine:statLine,logCard:logCard,HANG_S:HANG_S,
  setStream:function(s){stream=s;},clarity:clarity,isClear:isClear,liveGuess:liveGuess,guessText:guessText,liveBox:liveBox,guess:function(){return guess;},setAudio:setAudio,CLEAR:CLEAR,CLEAR_S:CLEAR_S};
X.refresh();
})();
