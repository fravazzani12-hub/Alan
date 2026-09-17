/* Estensione "noise": rumore bianco per la nanna, generato nel telefono (nessun file, nessun YouTube, funziona offline).
   Il suono "Come il video" ricalca lo spettro misurato dalla registrazione del video che Fabio e Ilaria usano (curva a
   1/6 di ottava, CURVE_VIDEO, differenza per banda < 0,2 dB); le varianti sono la stessa curva più scura o più chiara e i
   classici rosa e marrone. Sintesi: spettro con quelle ampiezze e fasi casuali → IFFT (2^LOG_N campioni a 44,1 kHz, 47,6 s)
   → rumore gaussiano stazionario con loop perfetto (circolare), due canali indipendenti come nel video. Il volume è dentro
   il file (iOS ignora audio.volume): 5 livelli, il 4 è il livello del video (−15 dBFS RMS) a parità di volume del telefono.
   Riproduzione con un <audio loop>: niente Web Audio, così su Safari/Android continua a schermo bloccato; Media Session per
   i controlli sulla schermata di blocco; timer di spegnimento controllato su 'timeupdate'. Il tap su un suono lo fa partire
   subito in anteprima (2^PREVIEW_LOG_N campioni, ~6 s di loop, sintesi istantanea); la versione lunga si genera dopo in
   sottofondo e sostituisce l'anteprima con un solo cambio di file. Impostazioni in localStorage
   (alan.noise), solo locali. Nessun consiglio clinico: la nota in schermata riporta l'indicazione dell'AAP (volume e distanza). */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var KEY='alan.noise',FS=44100,LOG_N=21,PREVIEW_LOG_N=18,BASE_DB=-15;
var CURVE_VIDEO=[[20,-6.9],[22.4,-6.8],[25.2,-7],[28.3,-6.7],[31.7,-6.6],[35.6,-6.7],[40,-6.9],[44.9,-7.1],[50.4,-7.3],[56.6,-5.4],[63.5,-2.3],[71.3,-1.9],[80,-5.2],[89.8,-6.6],[100.8,-6.3],[113.1,-6.5],[127,-5.5],[142.5,-4.6],[160,-3.4],[179.6,-2.3],[201.6,-1.7],[226.3,-3.1],[254,-4.2],[285.1,-3.5],[320,-2.8],[359.2,-2.9],[403.2,-2.7],[452.5,-3.6],[508,-2.1],[570.2,0],[640,-2.2],[718.4,-3.3],[806.3,-3.5],[905.1,-3.4],[1015.9,-9.1],[1140.4,-14.4],[1280,-17.6],[1436.8,-19.4],[1612.7,-20.1],[1810.2,-19.8],[2031.9,-19.2],[2280.7,-21.4],[2560,-25.5],[2873.5,-27],[3225.4,-28.8],[3620.4,-30.3],[4063.7,-30.3],[4561.4,-28.9],[5120,-27],[5747,-28.2],[6450.8,-32.5],[7240.8,-33.2],[8127.5,-32.8],[9122.8,-33.2],[10240,-33.5],[11494,-34.1],[12901.6,-34.1],[14481.5,-33.9],[16255,-39.2],[18245.6,-52.7],[20480,-99.5]];
var TYPES=[['video','Come il video','la curva del video che usate'],['scuro','Più scuro','come il video, con meno alte'],['chiaro','Più chiaro','come il video, con più alte'],['rosa','Rosa','pioggia fitta, tutte le frequenze'],['marrone','Marrone','cascata lontana, più grave']];
var VOL_DB=[-16,-10,-5,0,3];/* livello 1..5: il 4 è il video */
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
var buf={type:null,L:null,R:null,full:false},audio=null,url=null,playing=false,endAt=null,tick=null,prepT=null,upT=null,gen=0;

/* buffer del suono: full = 2^LOG_N (nanna), altrimenti anteprima 2^PREVIEW_LOG_N; un'anteprima non sostituisce mai un full dello stesso suono */
function ensure(type,full){
  if(buf.type===type&&buf.L&&(buf.full||!full))return buf;
  var ln=full?LOG_N:PREVIEW_LOG_N;buf={type:type,L:synth(type,ln),R:synth(type,ln),full:!!full};return buf;
}
function player(){
  if(audio)return audio;
  audio=document.createElement('audio');audio.loop=true;if(audio.setAttribute)audio.setAttribute('playsinline','');
  if(audio.addEventListener){audio.addEventListener('timeupdate',check);audio.addEventListener('pause',function(){if(playing&&audio.ended===false&&!audio.seeking){/* pausa dai controlli di sistema */playing=false;clearTimer();X.refresh();}});}
  return audio;
}
function load(full){
  var b=ensure(st.type,full),a=player(),data=wav(b.L,b.R,gainDb(st.vol)),u=null;
  try{u=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));}catch(e){}
  if(url){try{URL.revokeObjectURL(url);}catch(e2){}}
  url=u;if(u)a.src=u;
  return a;
}
function mediaSession(){
  try{
    var ms=navigator.mediaSession;if(!ms)return;
    if(window.MediaMetadata)ms.metadata=new MediaMetadata({title:'Rumore bianco · '+typeOf(st.type)[1],artist:'Alan — cosa vuole?'});
    ms.setActionHandler('pause',function(){stop();});ms.setActionHandler('stop',function(){stop();});ms.setActionHandler('play',function(){start();});
  }catch(e){}
}
function clearTimer(){endAt=null;if(tick){clearInterval(tick);tick=null;}}
function check(){if(playing&&endAt&&Date.now()>=endAt){stop();API.toast('Rumore bianco spento');}}
function play(a){if(typeof a.play!=='function')return;try{var p=a.play();if(p&&p.then)p.then(null,function(){playing=false;clearTimer();refresh();API.toast('Il telefono non ha fatto partire il suono: riprova con un tap');});}catch(e){playing=false;}}
/* avvio: tutto sincrono nel tap (iOS pretende play() dentro il gesto). Se il suono lungo non è pronto parte l'anteprima e
   la versione lunga arriva dopo, in sottofondo (upgrade). */
function start(){
  var a=load(false);playing=true;
  if(st.timer){endAt=Date.now()+st.timer*60e3;if(!tick)tick=setInterval(check,15000);}else clearTimer();
  play(a);mediaSession();refresh();
  if(!buf.full)upgrade();
}
function upgrade(){
  var my=++gen,type=st.type;if(upT)clearTimeout(upT);
  upT=setTimeout(function(){
    upT=null;if(!playing||my!==gen||st.type!==type)return;
    try{ensure(type,true);}catch(e){return;}
    if(!playing||my!==gen||st.type!==type)return;
    play(load(true));
  },700);
}
function stop(){
  playing=false;clearTimer();gen++;
  if(audio){try{audio.pause();}catch(e){}}
  refresh();
}
/* ridisegna la schermata se è aperta, e la Home */
function refresh(){var f=API.flow();if(f&&f.type==='noise'){var el=API.q('#screenInner');if(el)el.innerHTML=render();}X.refresh();}
function toggle(){if(playing)stop();else start();}
function isPlaying(){return playing;}
/* il tap su un suono lo fa sentire subito (anteprima); volume e timer si applicano al volo se sta suonando */
function setType(t){if(typeOf(t)[0]!==t)return;st.type=t;save();start();}
function setVol(v){v=+v;if(!(v>=1&&v<=5))return;st.vol=v;save();start();}
function setTimer(m){m=+m;if(!TIMERS.some(function(t){return t[0]===m;}))return;st.timer=m;save();if(playing){if(m){endAt=Date.now()+m*60e3;if(!tick)tick=setInterval(check,15000);}else clearTimer();}refresh();}
/* prepara il suono salvato qualche secondo dopo l'avvio, così il primo tap è immediato e già lungo */
function prewarm(ms){if(prepT)clearTimeout(prepT);prepT=null;if(ms<0)return;prepT=setTimeout(function(){prepT=null;try{if(!playing)ensure(st.type,true);}catch(e){}},ms==null?4000:ms);}

/* ---------- testi ---------- */
/* livello in dB rispetto al video (livello 4); l'assoluto alla culla dipende dal telefono e dalla distanza */
function volText(lvl){var d=VOL_DB[lvl-1];return 'Livello '+lvl+': '+(d===0?'come il video':(d>0?'+':'−')+Math.abs(d)+' dB rispetto al video');}
function timerLabel(m){for(var i=0;i<TIMERS.length;i++)if(TIMERS[i][0]===m)return TIMERS[i][1];return 'Sempre';}
function summary(){return typeOf(st.type)[1]+' · volume '+st.vol+' · '+(st.timer?'spegne dopo '+timerLabel(st.timer):'sempre acceso');}
function status(){if(!playing)return '';return (endAt?'In riproduzione · si spegne alle '+API.fmtTime(endAt):'In riproduzione')+(buf.full?'':' · anteprima');}
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
  h+='<p class="hint">Il suono è generato dal telefono e non si interrompe per la rete. Telefono ad almeno 2 metri dalla culla, mai dentro, e volume basso: è l\'indicazione dell\'American Academy of Pediatrics (non oltre 50 dB all\'orecchio del bambino). Se dall\'app installata il suono si ferma quando blocchi lo schermo, per la notte apri l\'app in Safari o Chrome.</p>';
  return h;
}
X.flow('noise',{render:render,finish:function(){return false;}});

X.noise={KEY:KEY,FS:FS,LOG_N:LOG_N,PREVIEW_LOG_N:PREVIEW_LOG_N,BASE_DB:BASE_DB,CURVE_VIDEO:CURVE_VIDEO,TYPES:TYPES,VOL_DB:VOL_DB,TIMERS:TIMERS,
  curveOf:curveOf,interpLog:interpLog,fft:fft,synth:synth,wav:wav,gainDb:gainDb,
  state:function(){return st;},setType:setType,setVol:setVol,setTimer:setTimer,start:start,stop:stop,toggle:toggle,isPlaying:isPlaying,endAt:function(){return endAt;},check:check,
  open:open,summary:summary,status:status,volText:volText,render:render,refresh:refresh,prewarm:prewarm,player:function(){return audio;},buffers:function(){return buf;},ensure:ensure};
prewarm();
X.refresh();
})();
