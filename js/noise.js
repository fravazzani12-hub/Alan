/* Estensione "noise": rumore bianco per la nanna, generato nel telefono (nessun file, nessun YouTube, funziona offline).
   Il suono "Come il video" ricalca lo spettro misurato dalla registrazione del video che Fabio e Ilaria usano (curva a
   1/6 di ottava, CURVE_VIDEO, differenza per banda < 0,2 dB); le varianti sono la stessa curva più scura o più chiara e i
   classici rosa e marrone. Sintesi: spettro con quelle ampiezze e fasi casuali → IFFT (2^LOG_N campioni a 44,1 kHz, 47,6 s)
   → rumore gaussiano stazionario con loop perfetto (circolare), due canali indipendenti come nel video. Volume in 5 livelli dal
   GainNode: il 4 è il livello del video (−15 dBFS RMS) a parità di volume del telefono. wav() resta per il keepalive e i test.
   Riproduzione con Web Audio (AudioBufferSourceNode in loop: nessuno stacco al riavvio del loop, dissolvenza incrociata
   fra un anello e l'altro e fra un suono e l'altro, volume dal GainNode senza ricodificare) più un <audio> quasi silenzioso
   in loop che tiene viva la sessione audio a schermo bloccato e porta i controlli della Media Session; timer di spegnimento
   controllato ogni 15 s e su 'timeupdate' del keepalive. Nel tocco parte l'anello corto (sintesi istantanea) e le versioni
   più lunghe arrivano dopo, in dissolvenza. Impostazioni in localStorage
   (alan.noise), solo locali. Nessun consiglio clinico: la nota in schermata riporta l'indicazione dell'AAP (volume e distanza). */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
/* tre lunghezze dell'anello: LEVELS[0] parte dentro il tocco anche a freddo (istantanea), poi si sale in dissolvenza */
var KEY='alan.noise',FS=44100,LEVELS=[14,18,20],LOG_N=LEVELS[2],PREVIEW_LOG_N=LEVELS[1],TINY_LOG_N=LEVELS[0],BASE_DB=-15;
var CURVE_VIDEO=[[20,-6.9],[22.4,-6.8],[25.2,-7],[28.3,-6.7],[31.7,-6.6],[35.6,-6.7],[40,-6.9],[44.9,-7.1],[50.4,-7.3],[56.6,-5.4],[63.5,-2.3],[71.3,-1.9],[80,-5.2],[89.8,-6.6],[100.8,-6.3],[113.1,-6.5],[127,-5.5],[142.5,-4.6],[160,-3.4],[179.6,-2.3],[201.6,-1.7],[226.3,-3.1],[254,-4.2],[285.1,-3.5],[320,-2.8],[359.2,-2.9],[403.2,-2.7],[452.5,-3.6],[508,-2.1],[570.2,0],[640,-2.2],[718.4,-3.3],[806.3,-3.5],[905.1,-3.4],[1015.9,-9.1],[1140.4,-14.4],[1280,-17.6],[1436.8,-19.4],[1612.7,-20.1],[1810.2,-19.8],[2031.9,-19.2],[2280.7,-21.4],[2560,-25.5],[2873.5,-27],[3225.4,-28.8],[3620.4,-30.3],[4063.7,-30.3],[4561.4,-28.9],[5120,-27],[5747,-28.2],[6450.8,-32.5],[7240.8,-33.2],[8127.5,-32.8],[9122.8,-33.2],[10240,-33.5],[11494,-34.1],[12901.6,-34.1],[14481.5,-33.9],[16255,-39.2],[18245.6,-52.7],[20480,-99.5]];
var TYPES=[['video','Ventilatore','il vostro suono per la nanna'],['scuro','Ventilatore scuro','lo stesso, con meno alte'],['chiaro','Ventilatore chiaro','lo stesso, con più alte'],['rosa','Rosa','pioggia fitta, tutte le frequenze'],['marrone','Marrone','cascata lontana, più grave']];
var VOL_DB=[-16,-10,-5,0,3];/* livello 1..5: il 4 è il livello dell'originale (il video) */
var TIMERS=[[0,'Sempre'],[30,'30 min'],[60,'1 h'],[120,'2 h'],[480,'8 h']];

/* ---------- curve (dB relativi in funzione della frequenza) ---------- */
function interpLog(tab,f){
  var lf=Math.log(f);if(lf<=Math.log(tab[0][0]))return tab[0][1];
  for(var i=1;i<tab.length;i++){var a=Math.log(tab[i-1][0]),b=Math.log(tab[i][0]);if(lf<=b){var t=(lf-a)/(b-a);return tab[i-1][1]+(tab[i][1]-tab[i-1][1])*t;}}
  return tab[tab.length-1][1];
}
function oct(f,f0){return Math.log(f/f0)/Math.LN2;}
function curveOf(type){
  var top=function(f){return f>16000?-24*oct(f,16000):0;};/* stessa chiusura in alto del video, per i classici */
  if(type==='scuro')return function(f){return f<20?-60:interpLog(CURVE_VIDEO,f)-(f>200?3*oct(f,200):0);};
  if(type==='chiaro')return function(f){return f<20?-60:interpLog(CURVE_VIDEO,f)+(f>1000?4*oct(f,1000):0);};
  if(type==='rosa')return function(f){return f<20?-60:-10*Math.log(f/20)/Math.LN10+top(f);};
  if(type==='marrone')return function(f){return f<20?-60:-20*Math.log(f/20)/Math.LN10+top(f);};
  return function(f){return f<20?-60:interpLog(CURVE_VIDEO,f);};
}
function typeOf(id){for(var i=0;i<TYPES.length;i++)if(TYPES[i][0]===id)return TYPES[i];return TYPES[0];}

/* ---------- FFT radix-2 in place (sign −1 diretta, +1 inversa senza 1/N) ---------- */
function fft(re,im,inverse){
  var n=re.length,i,j,k,m,s=inverse?1:-1;
  for(i=1,j=0;i<n;i++){for(k=n>>1;j&k;k>>=1)j^=k;j|=k;if(i<j){var tr=re[i];re[i]=re[j];re[j]=tr;var ti=im[i];im[i]=im[j];im[j]=ti;}}
  for(m=2;m<=n;m<<=1){
    var h=m>>1,ang=s*2*Math.PI/m,wr=Math.cos(ang),wi=Math.sin(ang);
    for(k=0;k<n;k+=m){
      var cr=1,ci=0;
      for(j=0;j<h;j++){
        var a=k+j,b=a+h,xr=re[b]*cr-im[b]*ci,xi=re[b]*ci+im[b]*cr;
        re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;
        var t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;
      }
    }
  }
}
/* un canale di rumore con la curva scelta: RMS = 1, loop circolare perfetto. rand = generatore [0,1) (Math.random) */
function synth(type,logN,fs,rand){
  logN=logN||LOG_N;fs=fs||FS;rand=rand||Math.random;
  var n=1<<logN,re=new Float32Array(n),im=new Float32Array(n),curve=curveOf(type),k,f,mag,ph;
  for(k=1;k<n/2;k++){
    f=k*fs/n;mag=Math.pow(10,curve(f)/20);ph=rand()*2*Math.PI;
    re[k]=mag*Math.cos(ph);im[k]=mag*Math.sin(ph);re[n-k]=re[k];im[n-k]=-im[k];
  }
  fft(re,im,true);
  var s=0;for(k=0;k<n;k++)s+=re[k]*re[k];var g=1/Math.sqrt(s/n);
  for(k=0;k<n;k++)re[k]*=g;
  return re;
}
/* WAV 16 bit stereo con il guadagno del livello scelto (BASE_DB + VOL_DB[lvl−1]); torna un ArrayBuffer */
function wav(L,R,gainDb,fs){
  fs=fs||FS;var n=L.length,g=Math.pow(10,gainDb/20)*32767,buf=new ArrayBuffer(44+n*4),v=new DataView(buf),i,o=44,x;
  var str=function(p,s){for(var j=0;j<s.length;j++)v.setUint8(p+j,s.charCodeAt(j));};
  str(0,'RIFF');v.setUint32(4,36+n*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
  v.setUint32(24,fs,true);v.setUint32(28,fs*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*4,true);
  for(i=0;i<n;i++){x=L[i]*g;x=x>32767?32767:(x<-32768?-32768:x);v.setInt16(o,x,true);x=R[i]*g;x=x>32767?32767:(x<-32768?-32768:x);v.setInt16(o+2,x,true);o+=4;}
  return buf;
}
function gainDb(lvl){return BASE_DB+VOL_DB[Math.max(1,Math.min(5,lvl))-1];}

/* ---------- stato ---------- */
var st={type:'video',vol:4,timer:0};
(function(){try{var o=JSON.parse(API.lsGet(KEY)||'{}');if(typeOf(o.type)[0]===o.type)st.type=o.type;if(o.vol>=1&&o.vol<=5)st.vol=o.vol;if(TIMERS.some(function(t){return t[0]===o.timer;}))st.timer=o.timer;}catch(e){}})();
function save(){API.lsSet(KEY,JSON.stringify(st));}
var buf={type:null,L:null,R:null,level:-1,full:false},playing=false,endAt=null,tick=null,prepT=null,upT=null,wT=null,gen=0,blocked=false;
/* Web Audio: ctx → master (volume) ← voce corrente (gain per la dissolvenza) ← sorgente in loop; keep = <audio> silenzioso in
   loop che tiene viva la sessione audio a schermo bloccato e porta i controlli della Media Session */
var ctx=null,master=null,cur=null,keep=null,keepUrl=null,FADE=0.4;

/* buffer del suono al livello chiesto (0 corto e istantaneo, 1 anteprima, 2 lungo): non si scende mai di livello */
function ensure(type,level){
  if(level==null)level=2;if(level===true)level=2;if(level===false)level=1;
  var have=(buf.type===type&&buf.L)?buf.level:-1;
  if(have>=level)return buf;
  var ln=LEVELS[level];
  buf={type:type,L:synth(type,ln),R:synth(type,ln),level:level,full:level>=2};
  return buf;
}
function gainLin(){return Math.pow(10,gainDb(st.vol)/20);}
function context(){
  if(ctx)return ctx;
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  try{ctx=new AC();}catch(e){return null;}
  master=ctx.createGain();master.gain.value=gainLin();master.connect(ctx.destination);
  if(ctx.addEventListener)ctx.addEventListener('statechange',function(){if(playing&&ctx.state!=='running')resume();});
  return ctx;
}
function resume(){if(ctx&&ctx.state!=='running'&&typeof ctx.resume==='function'){try{var p=ctx.resume();if(p&&p.then)p.then(null,function(){});}catch(e){}}}
/* sblocco alla maniera di iOS: una sorgente muta di un campione fatta partire dentro il tocco. Senza questa, su iPad il
   contesto resta sospeso e il suono si sente solo tornando nell'app (quando il sistema lo riprende da solo). */
function unlock(){
  if(!ctx)return;
  try{var b=ctx.createBuffer(1,1,FS),s=ctx.createBufferSource();s.buffer=b;s.connect(ctx.destination);if(typeof s.start==='function')s.start(0);}catch(e){}
}
function toAudioBuffer(b){
  var ab=ctx.createBuffer(2,b.L.length,FS);
  if(typeof ab.copyToChannel==='function'){ab.copyToChannel(b.L,0);ab.copyToChannel(b.R,1);}
  else{ab.getChannelData(0).set(b.L);ab.getChannelData(1).set(b.R);}
  return ab;
}
/* fa partire una voce con il buffer corrente; se ce n'è già una, dissolvenza incrociata a potenza costante (mai uno stacco) */
function voice(b){
  var c=context();if(!c)return false;
  var g=c.createGain(),src=c.createBufferSource(),t=c.currentTime,old=cur;
  src.buffer=toAudioBuffer(b);src.loop=true;src.connect(g);g.connect(master);
  if(old){
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+FADE);
    old.g.gain.setValueAtTime(1,t);old.g.gain.linearRampToValueAtTime(0,t+FADE);
    try{old.src.stop(t+FADE+0.05);}catch(e){}
  }else g.gain.setValueAtTime(1,t);
  src.start(t);cur={src:src,g:g,type:b.type,full:!!b.full,level:b.level==null?(b.full?2:1):b.level};
  return true;
}
/* un secondo di rumore a −90 dB (uno o due LSB: inudibile) invece del silenzio assoluto: iOS tiene viva la sessione
   audio solo se l'elemento sta davvero suonando qualcosa */
function silence(){
  if(keepUrl)return keepUrl;
  var n=FS,L=new Float32Array(n),R=new Float32Array(n),i;
  for(i=0;i<n;i++){L[i]=Math.random()*2-1;R[i]=Math.random()*2-1;}
  try{keepUrl=URL.createObjectURL(new Blob([wav(L,R,-90)],{type:'audio/wav'}));}catch(e){keepUrl=null;}
  return keepUrl;
}
function keepalive(){
  if(!keep){
    keep=document.createElement('audio');keep.loop=true;if(keep.setAttribute)keep.setAttribute('playsinline','');
    var u=silence();if(u)keep.src=u;
    if(keep.addEventListener){keep.addEventListener('timeupdate',check);keep.addEventListener('pause',function(){if(playing&&!keep.ended){stop();}});}
  }
  if(typeof keep.play==='function'){try{var p=keep.play();if(p&&p.then)p.then(null,function(){});}catch(e){}}
  return keep;
}
function mediaSession(){
  try{
    var ms=navigator.mediaSession;if(!ms)return;
    if(window.MediaMetadata)ms.metadata=new MediaMetadata({title:'Rumore bianco · '+typeOf(st.type)[1],artist:'Alan — cosa vuole?'});
    ms.setActionHandler('pause',function(){stop();});ms.setActionHandler('stop',function(){stop();});ms.setActionHandler('play',function(){start();});
    if(ms.playbackState!==undefined)ms.playbackState='playing';
  }catch(e){}
}
function clearTimer(){endAt=null;if(tick){clearInterval(tick);tick=null;}}
function check(){if(playing&&endAt&&Date.now()>=endAt){stop();API.toast('Rumore bianco spento');}}
/* Avvio, tutto dentro il tocco e nell'ordine che iPadOS pretende: elemento silenzioso (cambia la sessione audio), sblocco
   con una sorgente muta, resume, e solo allora il rumore. A freddo parte l'anello corto (sintesi istantanea): niente
   attese nel gesto. Le versioni più lunghe arrivano dopo, in dissolvenza. */
function start(){
  var c=context();
  if(!c){API.toast('Questo browser non riproduce il suono');return;}
  keepalive();unlock();resume();
  var b=ensure(st.type,0);
  master.gain.setTargetAtTime(gainLin(),c.currentTime,0.05);
  if(!cur||cur.type!==b.type||b.level>(cur.level==null?-1:cur.level))voice(b);
  playing=true;
  if(st.timer){endAt=Date.now()+st.timer*60e3;if(!tick)tick=setInterval(check,15000);}else clearTimer();
  mediaSession();watch();refresh();
  if(buf.level<2)upgrade();
}
/* sale al livello successivo (corto → anteprima → lungo) con una dissolvenza per volta */
function upgrade(){
  var my=++gen,type=st.type;if(upT)clearTimeout(upT);
  var step=function(level,delay){
    upT=setTimeout(function(){
      upT=null;if(!playing||my!==gen||st.type!==type)return;
      try{ensure(type,level);}catch(e){return;}
      if(!playing||my!==gen||st.type!==type)return;
      voice(buf);refresh();
      if(level<2)step(level+1,700);
    },delay);
  };
  step(buf.level<1?1:2,buf.level<1?250:700);
}
/* controlla che il contesto sia partito davvero: se resta sospeso riprova, e dopo tre tentativi lo dice in schermata
   (su iPad può servire un secondo tocco). Qualsiasi tocco nella pagina intanto riprova a sbloccarlo. */
function watch(){
  if(wT)clearTimeout(wT);
  var tries=0;
  var tick2=function(){
    wT=null;if(!playing||!ctx)return;
    if(ctx.state==='running'){if(blocked){blocked=false;refresh();}return;}
    resume();tries++;
    if(ctx.state==='running'){if(blocked){blocked=false;refresh();}return;}
    if(tries>=3&&!blocked){blocked=true;refresh();}
    wT=setTimeout(tick2,400);
  };
  wT=setTimeout(tick2,300);
}
function isBlocked(){return blocked;}
function stop(){
  playing=false;clearTimer();gen++;blocked=false;
  if(wT){clearTimeout(wT);wT=null;}
  if(cur){try{var t=ctx.currentTime;cur.g.gain.setValueAtTime(cur.g.gain.value,t);cur.g.gain.linearRampToValueAtTime(0,t+0.15);cur.src.stop(t+0.2);}catch(e){}cur=null;}
  if(keep){try{keep.pause();}catch(e2){}}
  try{if(navigator.mediaSession&&navigator.mediaSession.playbackState!==undefined)navigator.mediaSession.playbackState='paused';}catch(e3){}
  refresh();
}
/* ridisegna la schermata se è aperta, e la Home */
function refresh(){var f=API.flow();if(f&&f.type==='noise'){var el=API.q('#screenInner');if(el)el.innerHTML=render();}X.refresh();}
function toggle(){if(playing)stop();else start();}
function isPlaying(){return playing;}
/* il tap su un suono o su un volume lo fa sentire subito; il timer si applica al volo */
function setType(t){if(typeOf(t)[0]!==t)return;st.type=t;save();start();}
function setVol(v){v=+v;if(!(v>=1&&v<=5))return;st.vol=v;save();start();}
function setTimer(m){m=+m;if(!TIMERS.some(function(t){return t[0]===m;}))return;st.timer=m;save();if(playing){if(m){endAt=Date.now()+m*60e3;if(!tick)tick=setInterval(check,15000);}else clearTimer();}refresh();}
/* prepara il suono salvato qualche secondo dopo l'avvio, così il primo tap parte già lungo. Se la pagina non è in primo
   piano si rimanda: la sintesi occupa il telefono e non deve capitare mentre si tocca Avvia. */
function prewarm(ms){
  if(prepT)clearTimeout(prepT);prepT=null;if(ms<0)return;
  prepT=setTimeout(function(){
    prepT=null;
    if(document.hidden){prewarm(8000);return;}
    try{if(!playing)ensure(st.type,2);}catch(e){}
  },ms==null?4000:ms);
}
/* tornando in primo piano, se il contesto è stato sospeso dal sistema lo riprende; e finché è bloccato, ci riprova a
   ogni tocco nella pagina (su iPad il primo gesto utile può essere un altro) */
if(document.addEventListener){
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&playing){resume();watch();}});
  var retry=function(){if(playing&&ctx&&ctx.state!=='running')resume();};
  document.addEventListener('touchend',retry,true);
  document.addEventListener('click',retry,true);
}

/* ---------- testi ---------- */
/* livello in dB rispetto al video (livello 4); l'assoluto alla culla dipende dal telefono e dalla distanza */
function volText(lvl){var d=VOL_DB[lvl-1];return 'Livello '+lvl+': '+(d===0?'come l\'originale':(d>0?'+':'−')+Math.abs(d)+' dB rispetto all\'originale');}
function timerLabel(m){for(var i=0;i<TIMERS.length;i++)if(TIMERS[i][0]===m)return TIMERS[i][1];return 'Sempre';}
function summary(){return typeOf(st.type)[1]+' · volume '+st.vol+' · '+(st.timer?'spegne dopo '+timerLabel(st.timer):'sempre acceso');}
function status(){
  if(!playing)return '';
  if(blocked)return 'In attesa: tocca ancora Avvia';
  return (endAt?'In riproduzione · si spegne alle '+API.fmtTime(endAt):'In riproduzione')+(cur&&cur.full?'':' · anteprima');
}
function open(){window.A.flow('noise',null,{});}

/* ---------- Home (blocco 'mid', sopra a "Piange") ---------- */
X.home('noise',function(){
  var h='<div class="nz-card'+(playing?' on':'')+'"><button class="nz-txt" onclick="AlanExt.noise.open()" aria-label="Regola il rumore bianco"><b>Rumore bianco</b><span>'+API.esc(playing?status():summary())+'</span></button>';
  h+='<button class="nz-btn" onclick="AlanExt.noise.toggle()">'+(playing?'Stop':'Avvia')+'</button></div>';
  return h;
},'mid');

/* ---------- schermata ---------- */
function chips(items,cur,fn){return '<div class="seg wide nz-seg">'+items.map(function(it){return '<button class="'+(it[0]===cur?'on':'')+'" onclick="AlanExt.noise.'+fn+'(\'' +it[0]+'\')">'+it[1]+'</button>';}).join('')+'</div>';}
function render(){
  var h='<div class="bar">'+API.backBtn()+'<div class="title">Rumore bianco</div></div>';
  h+='<button class="btn huge nz-main'+(playing?' on':'')+'" onclick="AlanExt.noise.toggle()">'+(playing?'Stop':'Avvia')+'<small>'+API.esc(playing?status():summary())+'</small></button>';
  h+='<h2>Suono <span class="hint">tocca per sentirlo</span></h2><div class="nz-types">'+TYPES.map(function(t){return '<button class="nz-type'+(t[0]===st.type?' on':'')+'" onclick="AlanExt.noise.setType(\''+t[0]+'\')"><b>'+t[1]+'</b><small>'+t[2]+'</small></button>';}).join('')+'</div>';
  h+='<h2>Volume <span class="hint">tocca per sentirlo</span></h2>'+chips([1,2,3,4,5].map(function(v){return [v,String(v)];}),st.vol,'setVol');
  h+='<p class="hint nz-hint">'+API.esc(volText(st.vol))+', a parità di volume del telefono. Quanto arriva alla culla dipende dal telefono e dalla distanza: misuralo una volta con un\'app fonometro.</p>';
  h+='<h2>Si spegne da solo</h2>'+chips(TIMERS,st.timer,'setTimer');
  if(blocked)h+='<p class="hint nz-blocked">Il telefono non ha ancora sbloccato l\'audio: tocca di nuovo Avvia. Su iPad capita al primo avvio dopo l\'installazione.</p>';
  h+='<p class="hint">Il suono è generato dal telefono e non si interrompe per la rete. Telefono ad almeno 2 metri dalla culla, mai dentro, e volume basso: è l\'indicazione dell\'American Academy of Pediatrics (non oltre 50 dB all\'orecchio del bambino). Se dall\'app installata il suono si ferma quando blocchi lo schermo, per la notte apri l\'app in Safari o Chrome.</p>';
  return h;
}
X.flow('noise',{render:render,finish:function(){return false;}});

X.noise={KEY:KEY,FS:FS,LEVELS:LEVELS,LOG_N:LOG_N,PREVIEW_LOG_N:PREVIEW_LOG_N,TINY_LOG_N:TINY_LOG_N,BASE_DB:BASE_DB,CURVE_VIDEO:CURVE_VIDEO,TYPES:TYPES,VOL_DB:VOL_DB,TIMERS:TIMERS,
  curveOf:curveOf,interpLog:interpLog,fft:fft,synth:synth,wav:wav,gainDb:gainDb,
  state:function(){return st;},setType:setType,setVol:setVol,setTimer:setTimer,start:start,stop:stop,toggle:toggle,isPlaying:isPlaying,isBlocked:isBlocked,unlock:unlock,watch:watch,endAt:function(){return endAt;},check:check,
  open:open,summary:summary,status:status,volText:volText,render:render,refresh:refresh,prewarm:prewarm,context:function(){return ctx;},voice:function(){return cur;},keep:function(){return keep;},buffers:function(){return buf;},ensure:ensure,gainLin:gainLin};
prewarm();
X.refresh();
})();
