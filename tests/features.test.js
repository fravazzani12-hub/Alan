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
  console.log('features ok');
})().catch(e=>{console.error(e);process.exit(1);});
