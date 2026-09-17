// Motore: dataset sintetico, precisione LOO, voto acustico, percorsi a tap. node tests/engine.test.js
'use strict';
const assert=require('assert');
const {boot,synth}=require('./stub');
(async()=>{
  const app=await boot();const {A,T,S,txt}=app;
  const features=T('features'),accuracy=T('accuracy'),context=T('context'),snapshot=T('snapshot'),bins=T('bins'),audioVote=T('audioVote'),hypotheses=T('hypotheses');
  const labels=['fame','sonno','cambio'];
  for(let i=0;i<30;i++){const l=labels[i%3];const f=features(synth(l,8,{seed:i}));const t=Date.now()-(i+1)*3*3600e3;const c=context(t);S.events.push({id:'c'+i,k:'cry',t,dur:8,label:l,ctx:snapshot(c),bins:bins(c),feat:f,audio:false});}
  const acc=accuracy();
  assert.strictEqual(acc.n,30);assert.strictEqual(acc.audN,30);assert.strictEqual(acc.ctxN,30);
  assert.ok(acc.aud>=0.8,'il suono sintetico separa le tre cause (LOO): '+acc.aud);
  assert.ok(acc.both!=null&&acc.ctx!=null,'LOO calcolata anche per contesto e insieme');
  assert.ok(Math.abs(acc.base-1/3)<1e-9,'baseline = causa più frequente');
  const v=audioVote(features(synth('sonno',8,{seed:99})).vec,null);
  assert.strictEqual(v.n,30);assert.strictEqual(Object.keys(v.p).sort().join(),'aria,cambio,contatto,fame,sonno');
  assert.strictEqual(v.nearest.length,3);assert.ok(v.meanD>0);
  const sum=Object.values(v.p).reduce((s,x)=>s+x,0);assert.ok(Math.abs(sum-1)<1e-9,'voto normalizzato');
  assert.ok(Object.values(v.p).every(x=>x>0),'smoothing: nessuna causa a zero');
  // su 30 pianti nuovi (10 per causa) il k-NN ne riconosce almeno 25
  let okv=0;for(let s=100;s<110;s++)for(const l of labels){const vv=audioVote(features(synth(l,8,{seed:s})).vec,null);if(Object.keys(vv.p).reduce((a,b)=>vv.p[a]>vv.p[b]?a:b)===l)okv++;}
  assert.ok(okv>=25,'k-NN su pianti nuovi: '+okv+'/30');
  // con meno di 3 pianti etichettati con impronta il voto non esiste
  assert.strictEqual(audioVote(v&&features(synth('fame',8)).vec,null)!==null,true);
  const saved=S.events.splice(0);S.events.push(saved[0],saved[1]);assert.strictEqual(audioVote(features(synth('fame',8)).vec,null),null);S.events.push(...saved.slice(2));
  // fusione: con vec le ipotesi cambiano rispetto al solo contesto, senza vec coincidono
  const c=context(Date.now()),h0=hypotheses(snapshot(c),bins(c),null),h1=hypotheses(snapshot(c),bins(c),v&&features(synth('sonno',8,{seed:5})).vec);
  assert.strictEqual(h0.w,0);assert.ok(h1.w>0&&h1.w<=0.6,'peso del suono in (0, 0.6]: '+h1.w);
  assert.ok(Math.abs(h0.list.reduce((s,x)=>s+x.p,0)-1)<1e-9);
  // percorsi a tap
  A.flow('feed');assert.ok(/Quanto hai preparato/.test(txt('#screenInner')));
  A.pick('prep',90);assert.ok(/Quanto ne ha bevuto/.test(txt('#screenInner')));assert.ok(/Niente rifiutato/.test(txt('#screenInner')));
  A.finish(80);assert.ok(/Pappa 80 ml su 90/.test(txt('#diary')));
  A.flow('diaper');let dh=app.els['#screenInner']._h;assert.ok(/Pipì\?/.test(dh)&&/>Poca</.test(dh)&&/>Normale</.test(dh)&&/>Tanta</.test(dh)&&/>No</.test(dh)&&!/>Sì</.test(dh),'quattro scelte: poca, normale, tanta, no');A.pick('pipi','normale');assert.ok(/Cacca\?/.test(txt('#screenInner')));A.finish('no');assert.ok(/Cambio pipì normale, cacca no/.test(txt('#diary')));
  S.events.push({id:'dold',k:'diaper',t:Date.now()-2*60000,who:'Ilaria',pipi:'si',cacca:'tanta'});T('renderDiary()');assert.ok(/Cambio pipì normale, cacca tanta/.test(txt('#diary')),'il vecchio sì si legge come normale');
  assert.strictEqual(T('lvlKey')('si'),'normale');assert.strictEqual(T('lvlKey')('poca'),'poca');assert.strictEqual(T('lvlKey')(undefined),'no');
  A.flow('sleep');assert.ok(/Si è addormentato/.test(txt('#screenInner')));A.finish('sleep');
  A.flow('sleep');assert.ok(/Dorme da/.test(txt('#screenInner')));A.finish('wake');
  assert.ok(/Sveglio ha dormito/.test(txt('#diary')));
  // pianto senza microfono: viene comunque salvato e resta aperto
  A.openCry();assert.ok(/Microfono non disponibile|non espone/.test(txt('#screenInner')));
  A.stopRec();await new Promise(r=>setTimeout(r,30));
  assert.ok(S.openCry,'pianto aperto');assert.ok(/Pianto delle/.test(txt('#screenInner')));
  A.leaveOpen();
  T('renderCries()');assert.ok(/Quanto ci azzecca/.test(txt('#cries')));
  T('renderStats()');assert.ok(/Ultime 24 ore/.test(txt('#stats'))&&/Perché piangeva/.test(txt('#stats')));
  A.exportData();assert.ok(/^AZ[02]:/.test(app.els['#impTxt'].value),'export produce un codice');
  console.log('engine ok · precisione LOO suono '+Math.round(acc.aud*100)+'%, peso suono '+Math.round(h1.w*100)+'%');
})().catch(e=>{console.error(e);process.exit(1);});
