// Estensione ascolto: il rilevatore del pianto (soglia relativa al rumore di fondo, inizio e fine dell'episodio,
// unione dei vicini, tetto all'ora) e la voce cry che ne nasce. node tests/ascolto.test.js
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
(async()=>{
  const app=await boot({ext:['ascolto']});const {A,S,T,txt}=app;
  const X=window.AlanExt,AS=X.ascolto,API=X.api;
  const F=AS.FRAME;
  // un frame finto: livello in dBFS e tono (null = suono senza tono, come un fruscio)
  const frame=(t,lvDb,f0)=>({t,rms:Math.pow(10,lvDb/20),zcr:1500,cent:1800,f0:f0||null});
  // manda `secs` secondi di suono e torna l'ultima voce creata
  const feed=(from,secs,lvDb,f0)=>{
    let out=null;
    for(let i=0;i<Math.round(secs*1000/F);i++){const t=from+i*F;const r=AS.push(frame(t,lvDb,f0),t);if(r)out=r;}
    return out;
  };
  const cries=()=>S.events.filter(e=>e.k==='cry');

  assert.ok(AS&&typeof AS.push==='function','namespace AlanExt.ascolto');
  assert.ok(T('EXT.flows.ascolto')&&T('EXT.flows.ascoltodark'),'schermate registrate');
  assert.ok(T('EXT.slots.altro').length>=1,'scheda in Altro');
  // --- spento di suo, e solo su questo dispositivo
  assert.deepStrictEqual(AS.state(),{on:false,sens:1,audio:false});
  assert.strictEqual(app.store['alan.ascolto'],undefined,'niente da salvare finché non si tocca');
  AS.setSens(2);assert.deepStrictEqual(JSON.parse(app.store['alan.ascolto']),{on:false,sens:2,audio:false});
  assert.strictEqual(AS.sens()[2],7,'orecchio alto: +7 dB sul fondo');
  AS.setSens(9);assert.strictEqual(AS.state().sens,2,'valore fuori scala ignorato');
  AS.setSens(1);
  // --- decibel e regola del frame "da pianto"
  near(AS.db(1),0,1e-9,'0 dBFS');near(AS.db(0.1),-20,1e-9,'−20 dBFS');
  assert.ok(AS.isCry(frame(0,-30,400),-50),'forte sul fondo e acuto: pianto');
  assert.ok(!AS.isCry(frame(0,-30,150),-50),'voce di un adulto: no');
  assert.ok(!AS.isCry(frame(0,-30,null),-50),'suono senza tono: no');
  assert.ok(!AS.isCry(frame(0,-45,400),-50),'poco sopra il fondo: no');
  assert.ok(!AS.isCry(frame(0,-50,400),-70),'troppo piano in assoluto: no');
  // --- 30 s di fondo silenzioso: nessun episodio, il fondo si impara
  AS.reset();S.events.length=0;
  const t0=Date.now()-3600e3;
  assert.strictEqual(feed(t0,30,-52,null),null,'il fondo non fa pianti');
  near(AS.floorDb(),-52,0.5,'fondo imparato');
  assert.strictEqual(AS.episode(),null);assert.strictEqual(cries().length,0);
  // --- un pianto di 5 s: l'episodio si apre dopo ON_S e si chiude dopo OFF_S di quiete
  let t=t0+30e3;
  feed(t,1,-28,420);assert.strictEqual(AS.episode(),null,'un secondo solo non basta');
  feed(t+1e3,0.5,-28,420);assert.ok(AS.episode(),'dopo 1,2 s di pianto l\'episodio è aperto');
  assert.strictEqual(AS.episode().start,t,'comincia dal primo frame di pianto, non dall\'inizio della finestra');
  feed(t+1.5e3,3.5,-28,420);assert.ok(AS.episode(),'mentre piange resta aperto');
  assert.strictEqual(cries().length,0,'niente voce finché non finisce');
  let ev=feed(t+5e3,OFFS(),-52,null);
  function OFFS(){return AS.OFF_S+1;}
  assert.ok(ev&&ev.k==='cry','la voce nasce alla fine');
  assert.strictEqual(cries().length,1);
  near(ev.dur,5,0.6,'durata del pianto');
  assert.strictEqual(ev.t,t,'comincia quando è cominciato');
  assert.strictEqual(ev.auto,true,'segnato come sentito dall\'app');assert.strictEqual(ev.audio,false,'nessun audio salvato');
  assert.strictEqual(ev.label,null);assert.ok(ev.ctx&&ev.bins,'contesto e bin come nei pianti a mano');
  assert.ok(ev.feat&&ev.feat.vec.length===12,'impronta acustica con le 12 misure');
  near(ev.feat.meanF0,420,1,'tono medio');
  assert.ok(ev._updated,'passa da touched: si sincronizza');
  assert.strictEqual(S.openCry,ev.id,'resta in attesa di spiegazione: dal telefono si compila');
  // --- un pianto poco dopo si unisce al precedente invece di fare una voce nuova
  let t2=t+5e3+OFFS()*1000+20e3;
  feed(t2,4,-28,420);feed(t2+4e3,OFFS(),-52,null);
  assert.strictEqual(cries().length,1,'unito');
  near(cries()[0].dur,(t2+4e3-t)/1000,1,'la durata arriva fino alla fine del secondo');
  // --- più tardi è un pianto nuovo
  let t3=t2+4e3+120e3;
  feed(t3,4,-28,420);feed(t3+4e3,OFFS(),-52,null);
  assert.strictEqual(cries().length,2,'oltre un minuto: voce nuova');
  // --- un grido di un secondo non è un pianto
  let t4=t3+4e3+200e3;
  feed(t4,1.5,-28,420);feed(t4+1.5e3,OFFS(),-52,null);
  assert.strictEqual(cries().length,2,'troppo corto: ignorato');
  // --- un pianto lungo non deve far salire il fondo contro se stesso (il rilevatore non diventa sordo a metà)
  AS.reset();S.events.length=0;S.openCry=null;
  const tl=t0+3*3600e3;
  feed(tl,10,-52,null);
  const flBefore=AS.floorDb();
  feed(tl+10e3,25,-28,420);
  near(AS.floorDb(),flBefore,1,'durante il pianto il fondo resta quello di prima');
  let evl=feed(tl+35e3,OFFS(),-52,null);
  assert.ok(evl,'il pianto lungo si chiude');
  near(evl.dur,25,1,'durata intera, non troncata');
  // --- con il rumore bianco acceso il fondo si alza e lo stesso livello non basta più
  AS.reset();S.events.length=0;S.openCry=null;
  const tn=t0+2*3600e3;
  feed(tn,30,-26,null);                       /* fondo alto: rumore bianco */
  near(AS.floorDb(),-26,0.5,'fondo alto imparato');
  feed(tn+30e3,4,-28,420);feed(tn+34e3,OFFS(),-26,null);
  assert.strictEqual(cries().length,0,'sotto il fondo: non è pianto');
  feed(tn+60e3,4,-12,420);let ev2=feed(tn+64e3,OFFS(),-26,null);
  assert.ok(ev2&&cries().length===1,'un pianto vero sopra il rumore si sente lo stesso');
  // --- tetto di episodi all'ora
  AS.reset();S.events.length=0;
  let tc=t0+4*3600e3;
  for(let i=0;i<AS.MAX_HOUR+3;i++){
    const s=tc+i*120e3;
    feed(s,30,-52,null);feed(s+30e3,4,-28,420);feed(s+34e3,OFFS(),-52,null);
  }
  assert.strictEqual(cries().length,AS.MAX_HOUR,'oltre il tetto non aggiunge più voci');
  // --- schermate e riga in Home
  S.events.length=0;AS.reset();
  T('renderHome()');assert.strictEqual(String(app.els['#home-ascolto']._h),'','spento: nessuna riga in Home');
  AS.state().on=true;T('renderHome()');
  assert.ok(/Ascolto del pianto/.test(String(app.els['#home-ascolto']._h))&&/Spegni/.test(String(app.els['#home-ascolto']._h)));
  AS.state().on=false;
  AS.open();let sc=String(app.els['#screenInner']._h);
  assert.ok(/<div class="title">Ascolto del pianto<\/div>/.test(sc)&&/Accendi l'ascolto/.test(sc)&&/as-meter/.test(sc),sc.slice(0,300));
  assert.ok(/id="asLevel" style="width:0%"/.test(sc),'spento: barra del livello vuota');assert.strictEqual(AS.meterPct(),0);
  assert.ok(/Quanto orecchio/.test(sc)&&(sc.match(/AlanExt.ascolto.setSens/g)||[]).length===3,'tre sensibilità');
  assert.ok(/solo con l'app aperta e lo schermo acceso/.test(sc)&&/permesso si dà una volta per apertura/.test(sc),'i limiti scritti chiaro');
  assert.ok(/Non viene salvato nessun audio/.test(sc));
  AS.dark();assert.ok(/as-dark/.test(String(app.els['#screenInner']._h))&&/as-clock/.test(String(app.els['#screenInner']._h)),'schermo scuro');
  A.home();
  // --- in Altro: interruttore
  T('fillExtAltro()');const alt=String(app.els['#extAltro']._h);
  assert.ok(/Ascolto del pianto/.test(alt)&&/role="switch"/.test(alt)&&/Nessun audio salvato/.test(alt),alt.slice(0,300));
  console.log('ascolto ok');
})().catch(e=>{console.error(e);process.exit(1);});
