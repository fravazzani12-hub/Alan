// Estensione noise: FFT, sintesi con la curva del video (spettro, RMS, loop), WAV, volume nel file, stato, timer, Home e schermata. node tests/noise.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
(async()=>{
  const app=await boot({ext:['noise']});const {A,S,T,txt}=app;
  const X=window.AlanExt,NZ=X.noise,API=X.api;
  // Web Audio finto: grafo, parametri con gli eventi di automazione, sorgenti con start/stop
  class P{constructor(v){this.value=v;this.ev=[];}setValueAtTime(v,t){this.value=v;this.ev.push(['set',v,t]);}linearRampToValueAtTime(v,t){this.value=v;this.ev.push(['ramp',v,t]);}setTargetAtTime(v,t){this.value=v;this.ev.push(['target',v,t]);}}
  class Node{constructor(){this.conns=[];}connect(n){this.conns.push(n);}}
  class Gain extends Node{constructor(){super();this.gain=new P(1);}}
  class Src extends Node{constructor(){super();this.buffer=null;this.loop=false;this.started=null;this.stopped=null;}start(t){this.started=t;}stop(t){this.stopped=t;}}
  class Buf{constructor(c,l,sr){this.numberOfChannels=c;this.length=l;this.sampleRate=sr;this.ch=[new Float32Array(l),new Float32Array(Math.max(1,l))];}copyToChannel(a,i){this.ch[i].set(a);}getChannelData(i){return this.ch[i];}}
  const ctxs=[],log=[];
  window.AudioContext=class{constructor(){this.state='suspended';this.born=Date.now();this.destination=new Node();this.resumed=0;this.silent=0;ctxs.push(this);}
    get currentTime(){return 10+(Date.now()-this.born)/1000;}
    createGain(){return new Gain();}createBufferSource(){return new Src();}
    createBuffer(c,l,sr){if(l===1){this.silent++;log.push('sblocco');}else log.push('rumore');return new Buf(c,l,sr);}
    resume(){this.resumed++;log.push('resume');if(!this.stubborn)this.state='running';return Promise.resolve();}addEventListener(){}};
  // l'elemento <audio> di tenuta: registra play/pause come farebbe il telefono
  const realCreate=document.createElement;
  document.createElement=function(tag){
    const e=realCreate(tag);
    e.play=function(){e.playing=true;log.push('tenuta');return Promise.resolve();};
    e.pause=function(){e.playing=false;};
    e.setAttribute=e.setAttribute||function(){};e.addEventListener=e.addEventListener||function(){};
    return e;
  };
  assert.ok(NZ&&typeof NZ.synth==='function','namespace AlanExt.noise');
  assert.ok(T('EXT.flows.noise'),'percorso registrato');assert.ok(T('EXT.home').some(b=>b.id==='noise'&&b.where==='mid'),'blocco Home mid');
  // --- FFT: confronto con la DFT ingenua su 8 punti, e inversa = identità × N
  const n=8,re=Float64Array.from([1,2,0,-1,3,0.5,-2,1]),im=new Float64Array(n);
  const r2=Float64Array.from(re),i2=new Float64Array(n);NZ.fft(r2,i2,false);
  for(let k=0;k<n;k++){let sr=0,si=0;for(let j=0;j<n;j++){const a=-2*Math.PI*k*j/n;sr+=re[j]*Math.cos(a);si+=re[j]*Math.sin(a);}near(r2[k],sr,1e-9,'re '+k);near(i2[k],si,1e-9,'im '+k);}
  NZ.fft(r2,i2,true);for(let k=0;k<n;k++){near(r2[k]/n,re[k],1e-9,'inversa '+k);near(i2[k],0,1e-9,'inversa im '+k);}
  // --- curve: il video a 570 Hz è il massimo (0 dB), sotto 20 Hz −60, 1,3 kHz circa −17,6; rosa −3 dB/ott, marrone −6 dB/ott
  const cv=NZ.curveOf('video');near(cv(570.2),0,0.01,'massimo');assert.strictEqual(cv(10),-60);near(cv(1280),-17.6,0.05,'taglio');near(NZ.interpLog(NZ.CURVE_VIDEO,Math.sqrt(1015.9*1140.4)),(-9.1-14.4)/2,0.05,'interpolazione in log f');
  const cp=NZ.curveOf('rosa'),cb=NZ.curveOf('marrone');near(cp(2000)-cp(1000),-3.01,0.01,'rosa');near(cb(2000)-cb(1000),-6.02,0.01,'marrone');near(cp(20),0,1e-9);
  assert.ok(cp(20000)<cp(16000)-5,'chiusura sopra 16 kHz');
  near(NZ.curveOf('scuro')(400)-cv(400),-3,1e-9,'scuro: −3 dB a 400 Hz');near(NZ.curveOf('chiaro')(4000)-cv(4000),8,1e-9,'chiaro: +8 dB a 4 kHz');near(NZ.curveOf('scuro')(100),cv(100),1e-9);
  // --- sintesi: 2^14 campioni, RMS 1, media ~0, spettro = curva (rapporti fra bin), gaussiano (curtosi ≈ 3)
  let seed=1;const rand=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
  const N=1<<14,fs=44100,y=NZ.synth('video',14,fs,rand);
  assert.strictEqual(y.length,N);let s=0,m=0;for(let i=0;i<N;i++){s+=y[i]*y[i];m+=y[i];}near(Math.sqrt(s/N),1,1e-4,'RMS 1');near(m/N,0,0.05,'media 0');
  let k4=0;for(let i=0;i<N;i++)k4+=Math.pow(y[i],4);near(k4/N,3,0.4,'curtosi gaussiana');
  const fr=Float64Array.from(y),fi=new Float64Array(N);NZ.fft(fr,fi,false);
  const mag=k=>Math.hypot(fr[k],fi[k]);const bin=f=>Math.round(f*N/fs);
  near(20*Math.log10(mag(bin(1280))/mag(bin(570.2))),cv(1280*0+bin(1280)*fs/N)-cv(bin(570.2)*fs/N),0.05,'spettro: 1,28 kHz vs 570 Hz');
  near(20*Math.log10(mag(bin(8000))/mag(bin(570.2))),cv(bin(8000)*fs/N)-cv(bin(570.2)*fs/N),0.05,'spettro: 8 kHz');
  const ref=mag(bin(570.2));assert.ok(mag(0)<1e-3*ref&&mag(N/2)<1e-3*ref,'niente continua né Nyquist');assert.ok(mag(bin(10))<2e-3*ref,'niente sotto 20 Hz (−60 dB)');
  // due chiamate danno canali diversi (fasi diverse)
  const y2=NZ.synth('video',14,fs,rand);let c=0;for(let i=0;i<N;i++)c+=y[i]*y2[i];near(c/N,0,0.05,'canali indipendenti');
  // --- WAV: intestazione, dimensione, guadagno del livello (4 = −15 dBFS RMS), clip ai limiti
  const L=NZ.synth('rosa',12,fs,rand),R=NZ.synth('rosa',12,fs,rand),buf=NZ.wav(L,R,NZ.gainDb(4)),v=new DataView(buf);
  const str=(p,l)=>String.fromCharCode(...new Uint8Array(buf,p,l));
  assert.strictEqual(buf.byteLength,44+4096*4);assert.strictEqual(str(0,4),'RIFF');assert.strictEqual(str(8,4),'WAVE');assert.strictEqual(str(36,4),'data');
  assert.strictEqual(v.getUint32(4,true),36+4096*4);assert.strictEqual(v.getUint16(22,true),2);assert.strictEqual(v.getUint32(24,true),44100);assert.strictEqual(v.getUint16(34,true),16);assert.strictEqual(v.getUint32(40,true),4096*4);
  let ss=0;for(let i=0;i<4096;i++){const x=v.getInt16(44+i*4,true)/32768;ss+=x*x;}near(20*Math.log10(Math.sqrt(ss/4096)),-15,0.2,'livello 4 = −15 dBFS');
  assert.strictEqual(NZ.gainDb(1),-31);assert.strictEqual(NZ.gainDb(5),-12);assert.strictEqual(NZ.gainDb(9),-12,'livello fuori scala → 5');
  const big=NZ.wav(Float32Array.from([10,-10]),Float32Array.from([0,0]),0);assert.strictEqual(new DataView(big).getInt16(44,true),32767);assert.strictEqual(new DataView(big).getInt16(48,true),-32768);
  // --- stato: default, cambio e persistenza; valori non validi ignorati
  assert.deepStrictEqual(NZ.state(),{type:'video',vol:4,timer:0});
  NZ.setType('rosa');NZ.setVol(2);NZ.setTimer(60);assert.deepStrictEqual(JSON.parse(app.store['alan.noise']),{type:'rosa',vol:2,timer:60});
  NZ.setType('x');NZ.setVol(9);NZ.setTimer(7);assert.deepStrictEqual(NZ.state(),{type:'rosa',vol:2,timer:60});
  assert.strictEqual(NZ.summary(),'Rosa · volume 2 · spegne dopo 1 h');
  // --- Home: riga con riassunto e Avvia (da fermo: il tap sul suono ha avviato l'anteprima, qui la fermiamo); schermata con suoni, volumi, timer e nota
  assert.ok(NZ.isPlaying(),'setType da fermo avvia l\'anteprima');NZ.stop();T('renderHome()');let home=String(app.els['#home-noise']._h);
  assert.ok(/Rumore bianco/.test(home)&&/Rosa · volume 2/.test(home)&&ctxs[0].resumed>=1&&/>Avvia</.test(home)&&!/nz-card on/.test(home),home);
  NZ.open();let sc=String(app.els['#screenInner']._h);
  assert.ok(/<div class="title">Rumore bianco<\/div>/.test(sc)&&/nz-main/.test(sc)&&/>Avvia</.test(sc),sc.slice(0,300));
  assert.strictEqual((sc.match(/class="nz-type( on)?"/g)||[]).length,5,'cinque suoni');assert.ok(/nz-type on"[^>]*setType\('rosa'\)/.test(sc),'rosa selezionato');
  assert.ok(/American Academy of Pediatrics/.test(sc)&&/2 metri/.test(sc),'nota su distanza e volume');
  assert.ok(/class="on" onclick="AlanExt.noise.setVol\('2'\)/.test(sc)&&/class="on" onclick="AlanExt.noise.setTimer\('60'\)/.test(sc),'volume e timer evidenziati');
  // --- tap su un suono da fermo: parte subito in anteprima (2^PREVIEW_LOG_N) e la schermata si ridisegna con la scelta
  assert.strictEqual(NZ.LOG_N,20);assert.strictEqual(NZ.PREVIEW_LOG_N,18);assert.strictEqual(NZ.TINY_LOG_N,14);assert.deepStrictEqual(NZ.LEVELS,[14,18,20]);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const t1=Date.now();NZ.setType('marrone');const dtp=Date.now()-t1;
  assert.ok(NZ.isPlaying(),'in riproduzione');assert.ok(NZ.buffers().type==='marrone'&&NZ.buffers().level===0&&NZ.buffers().L.length===(1<<14),'a freddo parte l\'anello corto');
  assert.strictEqual(ctxs.length,1,'un solo AudioContext');let v1=NZ.voice();assert.ok(v1&&v1.type==='marrone'&&!v1.full&&v1.src.loop===true&&v1.src.started>=10,'sorgente in loop avviata');
  assert.strictEqual(v1.src.buffer.length,1<<14);assert.strictEqual(v1.src.buffer.sampleRate,44100);assert.strictEqual(v1.src.buffer.ch[0][5],NZ.buffers().L[5],'campioni copiati');
  const master=v1.g.conns[0];assert.ok(master.conns[0]===ctxs[0].destination,'voce → master → uscita');near(master.gain.value,NZ.gainLin(),1e-12,'volume dal GainNode');
  assert.ok(dtp<150,'avvio istantaneo nel tocco: '+dtp+' ms');console.log('  avvio a freddo in '+dtp+' ms');
  assert.ok(/anteprima/.test(NZ.status()));
  // l'ordine che iPadOS pretende: elemento quasi silenzioso, sorgente muta di sblocco, resume, poi il rumore
  assert.ok(NZ.keep()&&NZ.keep().playing,'elemento di tenuta avviato');
  assert.ok(ctxs[0].silent>=1,'sorgente muta di un campione per lo sblocco');
  assert.ok(ctxs[0].resumed>=1,'resume dentro il tocco');
  assert.deepStrictEqual(log.slice(0,4),['tenuta','sblocco','resume','rumore'],'ordine dell\'avvio su iPad: '+log.join(' → '));
  sc=String(app.els['#screenInner']._h);assert.ok(/nz-type on"[^>]*setType\('marrone'\)/.test(sc)&&/>Stop</.test(sc),'schermata ridisegnata subito con Marrone e Stop');
  NZ.setVol(3);sc=String(app.els['#screenInner']._h);assert.ok(/class="on" onclick="AlanExt.noise.setVol\('3'\)/.test(sc),'volume ridisegnato');assert.ok(NZ.isPlaying());
  assert.strictEqual(NZ.voice(),v1,'cambio volume: stessa sorgente, nessun riavvio');near(master.gain.value,Math.pow(10,-20/20),1e-12,'−20 dBFS');assert.strictEqual(master.gain.ev[master.gain.ev.length-1][0],'target','volume in dissolvenza');
  assert.ok(/Livello 3: −5 dB rispetto all'originale/.test(sc),'dB relativi: '+sc.match(/Livello[^<]*/));
  NZ.stop();assert.strictEqual(NZ.voice(),null);assert.ok(v1.src.stopped>v1.src.started,'stop: la sorgente si ferma dopo la dissolvenza');
  NZ.setVol(5);assert.ok(NZ.isPlaying(),'tap sul volume da fermo: anteprima');assert.ok(/Livello 5: \+3 dB rispetto all'originale/.test(String(app.els['#screenInner']._h)));NZ.setVol(4);assert.ok(/Livello 4: come l'originale/.test(String(app.els['#screenInner']._h)));assert.strictEqual(NZ.volText(1),'Livello 1: −16 dB rispetto all\'originale');
  v1=NZ.voice();
  NZ.setTimer(120);sc=String(app.els['#screenInner']._h);assert.ok(/class="on" onclick="AlanExt.noise.setTimer\('120'\)/.test(sc),'timer ridisegnato');
  // --- upgrade in sottofondo: dopo un attimo arriva la versione lunga dello stesso suono, senza fermarsi
  const t0=Date.now();await wait(400);
  assert.strictEqual(NZ.buffers().level,1,'primo scalino: anteprima');assert.strictEqual(NZ.voice().src.buffer.length,1<<18);
  let spin=0;while(!NZ.buffers().full&&spin++<60)await wait(100);const dt=Date.now()-t0;
  assert.ok(NZ.buffers().full&&NZ.buffers().type==='marrone'&&NZ.buffers().L.length===(1<<20),'buffer lungo 2^20 dopo l\'upgrade');assert.ok(NZ.isPlaying());assert.ok(!/anteprima/.test(NZ.status()));
  const v2=NZ.voice();assert.ok(v2!==v1&&v2.full&&v2.src.buffer.length===(1<<20),'nuova voce lunga');
  assert.deepStrictEqual(v2.g.gain.ev.slice(0,2).map(e=>e[0]),['set','ramp'],'la nuova entra in dissolvenza');assert.strictEqual(v1.g.gain.ev[v1.g.gain.ev.length-1][0],'ramp');assert.ok(v1.src.stopped>v1.src.started,'la vecchia esce dopo la dissolvenza');
  assert.ok(/Ventilatore/.test(String(app.els['#screenInner']._h))&&!/Come il video/.test(String(app.els['#screenInner']._h)),'nome nuovo');
  console.log('  upgrade a 2×2^20 in '+dt+' ms');
  // cambio suono a riproduzione in corso: di nuovo anteprima, poi upgrade; stop prima dell'upgrade lo annulla
  NZ.prewarm(-1);NZ.setType('video');assert.ok(!NZ.buffers().full&&NZ.buffers().type==='video'&&NZ.buffers().level===0,'nuovo suono: di nuovo dall\'anello corto');assert.ok(NZ.voice().type==='video'&&v2.src.stopped>0,'cambio suono in dissolvenza');NZ.stop();await wait(3000);assert.ok(!NZ.buffers().full,'fermo: niente upgrade');assert.ok(!NZ.isPlaying());
  // --- avvio con timer
  NZ.setType('video');NZ.setTimer(30);NZ.stop();NZ.start();
  assert.ok(NZ.isPlaying(),'in riproduzione');near(NZ.endAt()-Date.now(),30*60e3,2000,'timer 30 min');assert.ok(/In riproduzione · si spegne alle/.test(NZ.status()));
  T('renderHome()');home=String(app.els['#home-noise']._h);assert.ok(/nz-card on/.test(home)&&/>Stop</.test(home)&&/si spegne alle/.test(home));
  const B=NZ.buffers().L;NZ.setVol(4);assert.strictEqual(NZ.buffers().L,B,'cambio volume: stessi campioni');assert.ok(NZ.isPlaying());
  let sp2=0;while(!NZ.buffers().full&&sp2++<60)await wait(100);assert.ok(NZ.buffers().full&&NZ.buffers().L.length===(1<<20),'upgrade anche dopo Avvia');
  NZ.setTimer(0);assert.strictEqual(NZ.endAt(),null,'sempre acceso');NZ.setTimer(60);assert.ok(NZ.endAt()>Date.now());
  NZ.check();assert.ok(NZ.isPlaying(),'prima della scadenza resta acceso');
  // scadenza simulata
  const realNow=Date.now;Date.now=()=>realNow()+61*60e3;NZ.check();Date.now=realNow;assert.ok(!NZ.isPlaying(),'alla scadenza si spegne');assert.strictEqual(NZ.endAt(),null);
  NZ.start();NZ.stop();assert.ok(!NZ.isPlaying());NZ.toggle();assert.ok(NZ.isPlaying());assert.ok(NZ.buffers().full&&NZ.voice().full,'suono lungo già pronto: parte diretto');NZ.toggle();assert.ok(!NZ.isPlaying());
  // --- il primo tocco nell'app sblocca il motore in anticipo, prima ancora di toccare Avvia
  assert.ok(NZ.primed(),'sbloccato al primo avvio');
  // --- iPad: se il motore non parte davvero, dopo 1,2 s il rumore passa al lettore; quando riparte torna all'anello
  const c0=ctxs[0];c0.stubborn=true;c0.state='suspended';
  NZ.setTimer(0);NZ.open();NZ.start();
  assert.strictEqual(NZ.mode(),'wa','all\'inizio prova con il motore');assert.ok(!NZ.isBlocked());
  const r0=c0.resumed;await wait(900);
  assert.ok(c0.resumed>r0,'riprova a sbloccare da solo');assert.strictEqual(NZ.mode(),'wa','prima di 1,2 s non molla');
  await wait(700);
  assert.strictEqual(NZ.mode(),'el','passa al lettore');assert.ok(NZ.isPlaying(),'e il suono c\'è');
  assert.ok(NZ.keep().playing&&NZ.keep().loop===true,'il lettore suona il rumore in anello');
  assert.strictEqual(NZ.voice(),null,'il motore è zitto');
  assert.ok(/dal lettore/.test(NZ.status()),NZ.status());
  assert.ok(/non ha sbloccato il motore audio/.test(String(app.els['#screenInner']._h)),'spiegazione in schermata');
  // sul lettore il volume si cambia rifacendo il file (iOS ignora audio.volume)
  const src0=NZ.keep().src;NZ.setVol(2);assert.strictEqual(NZ.mode(),'el');assert.notStrictEqual(NZ.keep().src,src0,'nuovo file con il volume nuovo');
  // il motore riparte: torna l'anello continuo e la tenuta quasi silenziosa
  c0.stubborn=false;c0.state='running';await wait(1200);
  assert.strictEqual(NZ.mode(),'wa','tornato al motore');assert.ok(NZ.voice()&&NZ.voice().src.loop===true);
  assert.ok(!/dal lettore/.test(NZ.status())&&!/non ha sbloccato/.test(String(app.els['#screenInner']._h)));
  NZ.stop();A.home();
  A.home();
  console.log('noise ok');
})().catch(e=>{console.error(e);process.exit(1);});
