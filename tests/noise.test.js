// Estensione noise: FFT, sintesi con la curva del video (spettro, RMS, loop), WAV, volume nel file, stato, timer, Home e schermata. node tests/noise.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
(async()=>{
  const app=await boot({ext:['noise']});const {A,S,T,txt}=app;
  const X=window.AlanExt,NZ=X.noise,API=X.api;
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
  // --- Home: riga con riassunto e Avvia; schermata con suoni, volumi, timer e nota
  T('renderHome()');let home=String(app.els['#home-noise']._h);
  assert.ok(/Rumore bianco/.test(home)&&/Rosa · volume 2/.test(home)&&/>Avvia</.test(home)&&!/nz-card on/.test(home),home);
  NZ.open();let sc=String(app.els['#screenInner']._h);
  assert.ok(/<div class="title">Rumore bianco<\/div>/.test(sc)&&/nz-main/.test(sc)&&/>Avvia</.test(sc),sc.slice(0,300));
  assert.strictEqual((sc.match(/class="nz-type( on)?"/g)||[]).length,5,'cinque suoni');assert.ok(/nz-type on"[^>]*setType\('rosa'\)/.test(sc),'rosa selezionato');
  assert.ok(/American Academy of Pediatrics/.test(sc)&&/2 metri/.test(sc),'nota su distanza e volume');
  assert.ok(/class="on" onclick="AlanExt.noise.setVol\('2'\)/.test(sc)&&/class="on" onclick="AlanExt.noise.setTimer\('60'\)/.test(sc),'volume e timer evidenziati');
  // --- avvio: sintesi 2^LOG_N (una volta), riproduzione, timer; stop
  assert.strictEqual(NZ.LOG_N,21);
  NZ.setType('video');NZ.setTimer(30);
  const t0=Date.now();NZ.start();const dt=Date.now()-t0;
  assert.ok(NZ.isPlaying(),'in riproduzione');assert.ok(NZ.buffers().type==='video'&&NZ.buffers().L.length===(1<<21),'buffer 2^21');
  assert.ok(dt<6000,'sintesi entro pochi secondi: '+dt+' ms');console.log('  sintesi 2×2^21 in '+dt+' ms');
  near(NZ.endAt()-Date.now(),30*60e3,2000,'timer 30 min');assert.ok(/In riproduzione · si spegne alle/.test(NZ.status()));
  T('renderHome()');home=String(app.els['#home-noise']._h);assert.ok(/nz-card on/.test(home)&&/>Stop</.test(home)&&/si spegne alle/.test(home));
  const B=NZ.buffers().L;NZ.setVol(4);assert.strictEqual(NZ.buffers().L,B,'cambio volume: stessi campioni, nuovo file');assert.ok(NZ.isPlaying());
  NZ.setTimer(0);assert.strictEqual(NZ.endAt(),null,'sempre acceso');NZ.setTimer(60);assert.ok(NZ.endAt()>Date.now());
  NZ.check();assert.ok(NZ.isPlaying(),'prima della scadenza resta acceso');
  // scadenza simulata
  const realNow=Date.now;Date.now=()=>realNow()+61*60e3;NZ.check();Date.now=realNow;assert.ok(!NZ.isPlaying(),'alla scadenza si spegne');assert.strictEqual(NZ.endAt(),null);
  NZ.start();NZ.stop();assert.ok(!NZ.isPlaying());NZ.toggle();assert.ok(NZ.isPlaying());NZ.toggle();assert.ok(!NZ.isPlaying());
  A.home();
  console.log('noise ok');
})().catch(e=>{console.error(e);process.exit(1);});
