// Estrattore di feature (SPEC §4.4) su frame sintetici: le 12 componenti riflettono il segnale costruito.
'use strict';
const assert=require('assert');
const {boot,synth}=require('./stub');
(async()=>{
  const app=await boot();const features=app.T('features');
  const close=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
  // fame: F0 420 Hz, raffiche 900 ms, pause 500 ms, frame ogni 50 ms
  const f=features(synth('fame',10,{seed:1}));
  assert.ok(f&&Array.isArray(f.vec)&&f.vec.length===12,'vec[12]');
  close(f.vec[0],900/1400,0.08,'quota attiva ≈ burst/(burst+pause)');
  close(f.vec[1],420,15,'F0 media');assert.strictEqual(f.meanF0,f.vec[1]);
  assert.ok(f.vec[2]>5&&f.vec[2]<30,'sd F0 dal jitter ±30: '+f.vec[2]);
  assert.ok(f.vec[3]>20&&f.vec[3]<60,'p90−p10 F0: '+f.vec[3]);
  close(f.vec[4],0.06,0.01,'RMS media');assert.ok(f.vec[5]>0&&f.vec[5]<0.3,'cv RMS');
  close(f.vec[6],10/1.4,1.2,'raffiche ogni 10 s');close(f.bursts10,f.vec[6],1e-9,'bursts10 = vec[6]');
  assert.ok(f.vec[7]>=750&&f.vec[7]<=950,'durata media raffica (l\'ultima è troncata): '+f.vec[7]);close(f.vec[8],500,60,'durata media pausa');
  close(f.vec[9],1650,200,'centroide');close(f.vec[10],850,60,'ZCR');
  close(f.voiced,f.vec[0],0.05,'voce ≈ quota attiva (ogni frame attivo ha F0)');
  close(f.durS,10,0.1,'durata');
  // sonno: tono più basso, raffiche corte e pause lunghe → quota attiva minore
  const s=features(synth('sonno',10,{seed:2}));
  assert.ok(s.vec[1]<f.vec[1]-40,'sonno più grave');assert.ok(s.vec[0]<f.vec[0]-0.1,'sonno meno attivo');assert.ok(s.vec[7]>=480&&s.vec[7]<=640,'raffica sonno: '+s.vec[7]);close(s.vec[8],900,80,'pausa sonno');
  // pendenza: F0 che sale dentro ogni raffica → vec[11] > 0; che scende → < 0
  const up=features(synth('cambio',10,{seed:3,jitter:0,slope:200})),down=features(synth('cambio',10,{seed:3,jitter:0,slope:-200}));
  assert.ok(up.vec[11]>20,'pendenza positiva: '+up.vec[11]);assert.ok(down.vec[11]<-20,'pendenza negativa: '+down.vec[11]);assert.ok(Math.abs(up.vec[11]+down.vec[11])<1e-9,'simmetrica');
  // troppo corto o tutto silenzio → null (niente impronta)
  assert.strictEqual(features(synth('fame',0.5)),null,'<16 frame');
  const silent=[];for(let i=0;i<100;i++)silent.push({t:i*50,rms:0.001,f0:null,zcr:100,cent:300});
  assert.strictEqual(features(silent),null,'silenzio');
  // soglia adattiva: un segnale debole ma sopra 0,006 resta attivo
  const weak=synth('fame',6,{seed:4}).map(fr=>({...fr,rms:fr.rms>0.01?0.012:0.001}));
  const w=features(weak);assert.ok(w&&w.vec[0]>0.5,'segnale debole ancora attivo');
  // soglia: senza F0 nei frame attivi la voce è 0 ma le raffiche restano
  const nof0=synth('fame',6,{seed:5}).map(fr=>({...fr,f0:null}));
  const n=features(nof0);assert.strictEqual(n.vec[1],0);assert.strictEqual(n.voiced,0);assert.ok(n.vec[6]>4);
  // --- collegamento del microfono al motore audio (iPad: il Web Audio resta muto se il grafo non arriva
  //     all'uscita o se la stessa MediaStream alimenta anche il registratore)
  const micGraph=app.T('micGraph'),micGraphStop=app.T('micGraphStop');
  global.MediaStream=class{constructor(ts){this.ts=ts;}getAudioTracks(){return this.ts;}getTracks(){return this.ts;}};
  const mkTrack=()=>{const t={stopped:false,clones:0,stop(){t.stopped=true;},clone(){t.clones++;const c=mkTrack();c.clone_of=t;return c;}};return t;};
  const mkCtx=()=>{
    const log=[],node=k=>({kind:k,connect(d){log.push(k+'>'+d.kind);},disconnect(){log.push(k+' via');}});
    const dest=node('uscita');
    return {state:'running',destination:dest,log,
      createMediaStreamSource(ms){const n=node('mic');n.ms=ms;return n;},
      createAnalyser(){const n=node('analisi');n.fftSize=0;n.smoothingTimeConstant=1;Object.defineProperty(n,'frequencyBinCount',{get(){return n.fftSize/2;}});return n;},
      createGain(){const n=node('guadagno');n.gain={value:1};return n;}};
  };
  let tr=mkTrack(),ms={getAudioTracks:()=>[tr],getTracks:()=>[tr]},ctx=mkCtx();
  let g=micGraph(ctx,ms,0);
  assert.ok(g.src.ms instanceof MediaStream&&g.src.ms.getAudioTracks()[0].clone_of===tr,'modo 0: il motore audio sente una traccia clonata');
  assert.strictEqual(g.an.fftSize,2048);assert.strictEqual(g.an.smoothingTimeConstant,0);
  assert.strictEqual(g.sink.gain.value,0,'il ritorno verso l\'uscita è muto');
  assert.deepStrictEqual(ctx.log,['mic>analisi','analisi>guadagno','guadagno>uscita'],'il grafo arriva all\'uscita: '+ctx.log);
  assert.strictEqual(g.tbuf.length,2048);assert.strictEqual(g.fbuf.length,1024);
  micGraphStop(g);
  assert.ok(g.own.getAudioTracks()[0].stopped,'lo stop chiude la traccia clonata');
  assert.strictEqual(tr.stopped,false,'la traccia del registratore resta viva');
  assert.ok(ctx.log.slice(3).join(' ').includes('mic via'),'i nodi vengono staccati');
  // modo 1: stessa MediaStream del registratore, nessun clone da chiudere
  tr=mkTrack();ms={getAudioTracks:()=>[tr],getTracks:()=>[tr]};ctx=mkCtx();
  g=micGraph(ctx,ms,1);
  assert.strictEqual(g.src.ms,ms,'modo 1: traccia originale');assert.strictEqual(tr.clones,0);
  assert.strictEqual(g.own,null);
  assert.deepStrictEqual(ctx.log,['mic>analisi','analisi>guadagno','guadagno>uscita']);
  micGraphStop(g);assert.strictEqual(tr.stopped,false,'lo stop non spegne il microfono del registratore');
  assert.strictEqual(micGraph(null,ms,0),null);assert.strictEqual(micGraph(ctx,null,0),null);
  delete global.MediaStream;
  console.log('features ok');
})().catch(e=>{console.error(e);process.exit(1);});
