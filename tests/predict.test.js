// predict: prossima nanna / risveglio / pappa. Veglie regolari → minuti e orario; pochi dati → norma; dorme → risveglio.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5;
(async()=>{
  const app=await boot({ext:['predict']});const {A,S,T,txt}=app;
  const P=window.AlanExt.predict;
  assert.ok(P&&P.nextNap&&P.nextFeed&&P.nextWake,'esposto su window.AlanExt.predict');
  S.settings.birth='2026-08-20'; // 4 settimane: finestra 55→70 min secondo l'età reale al momento del test
  const norm=T('norms')(T('ageDays')());
  // "adesso" fisso: oggi alle 14:00, così gli orari sono prevedibili
  const d=new Date();d.setHours(14,0,0,0);const now=d.getTime();
  let n=0;const add=(k,t,extra)=>{const e=Object.assign({id:'p'+(n++),k,t,who:'Fabio'},extra||{});S.events.push(e);return e;};
  const reset=()=>{S.events.length=0;n=0;};

  // --- nessun dato: niente previsioni, Home vuota
  reset();
  assert.strictEqual(P.nextNap(now),null);assert.strictEqual(P.nextFeed(now),null);assert.strictEqual(P.nextWake(now),null);
  const realNow=Date.now;Date.now=()=>now;
  T('renderHome()');assert.strictEqual(app.els['#home-predict']._h,'','vuoto senza voci');
  add('diaper',now-H,{pipi:'si',cacca:'no'});T('renderHome()');assert.ok(/pd-empty/.test(app.els['#home-predict']._h),'con voci ma senza pappe né nanne: un accenno');

  // --- pochi dati (1 veglia, 1 pappa): la norma per età
  reset();
  add('sleep',now-3*H);add('wake',now-2*H);add('sleep',now-80*MIN);add('wake',now-30*MIN);
  add('feed',now-90*MIN,{prep:120,ml:110});
  let np=P.nextNap(now);
  assert.strictEqual(np.basis,'norma');assert.strictEqual(np.n,1);
  assert.strictEqual(np.at,now-30*MIN+norm.awakeMin*MIN,'sveglio da 30 min + finestra per età');
  assert.strictEqual(np.minutes,norm.awakeMin-30);
  let f=P.nextFeed(now);
  assert.strictEqual(f.basis,'norma');assert.strictEqual(f.n,0);
  assert.strictEqual(f.at,now-90*MIN+norm.feedH*H);assert.strictEqual(f.minutes,Math.round(norm.feedH*60-90));
  assert.strictEqual(P.nextWake(now),null,'sveglio: niente risveglio');

  // --- veglie regolari di 90 min per 3 giorni (12 osservazioni → solo il ritmo di Alan), pappe ogni 2,5 h (11 intervalli)
  reset();
  for(let day=3;day>=1;day--){
    const d0=new Date(now-day*864e5);d0.setHours(8,0,0,0);let t=d0.getTime();
    for(let i=0;i<4;i++){add('wake',t);add('sleep',t+90*MIN);t+=150*MIN;} // 90 sveglio, 60 dorme
    add('wake',t);
  }
  const feedT=[];for(let i=11;i>=0;i--){feedT.push(now-40*MIN-i*150*MIN);}
  feedT.forEach(t=>add('feed',t,{prep:120,ml:100}));
  add('sleep',now-3*H);add('wake',now-25*MIN);
  const o=P.observations(now);
  assert.strictEqual(o.awakes.length,12,'12 veglie');assert.ok(o.awakes.every(x=>x===90));
  assert.strictEqual(o.naps.length,12+1,'12 pisolini da 60 + quello di stamattina');
  assert.strictEqual(o.feeds.length,11);assert.ok(o.feeds.every(x=>Math.abs(x-2.5)<1e-9));
  np=P.nextNap(now);
  assert.strictEqual(np.basis,'alan');assert.strictEqual(np.n,12);
  assert.strictEqual(np.minutes,65,'sveglio da 25 su 90 → tra 65');assert.strictEqual(np.at,now+65*MIN);
  assert.strictEqual(T('fmtTime')(np.at),'15:05');
  f=P.nextFeed(now);
  assert.strictEqual(f.basis,'alan');assert.strictEqual(f.n,11);
  assert.strictEqual(f.minutes,110,'ultima pappa 40 min fa, ogni 2,5 h → tra 110');assert.strictEqual(T('fmtTime')(f.at),'15:50');
  // Home: due righe, colori per causa, orari
  T('renderHome()');let h=app.els['#home-predict']._h;
  assert.ok(/pd-row pd-sonno/.test(h)&&/pd-row pd-fame/.test(h),'due righe');
  assert.ok(/Probabile nanna tra 1 h 05/.test(h)&&/verso le 15:05/.test(h),h);
  assert.ok(/Pappa prevista tra 1 h 50/.test(h)&&/verso le 15:50/.test(h),h);
  assert.ok(/A\.flow\('sleep'\)/.test(h)&&/A\.flow\('feed'\)/.test(h),'tap → percorso');
  assert.ok(!/undefined|NaN/.test(h));

  // --- blend 70/30 con 4–10 osservazioni
  reset();
  for(let i=6;i>=1;i--){add('wake',now-i*3*H);add('sleep',now-i*3*H+100*MIN);} // 6 veglie da 100 min
  add('wake',now-10*MIN);
  np=P.nextNap(now);
  assert.strictEqual(np.basis,'misto');assert.strictEqual(np.n,6);
  const exp=0.7*100+0.3*norm.awakeMin;
  assert.strictEqual(np.at,now-10*MIN+exp*MIN);assert.strictEqual(np.minutes,Math.round(exp-10));
  // 4 osservazioni bastano per il misto, 3 no
  reset();for(let i=4;i>=1;i--){add('wake',now-i*3*H);add('sleep',now-i*3*H+100*MIN);}add('wake',now-10*MIN);
  assert.strictEqual(P.nextNap(now).basis,'misto');
  reset();for(let i=3;i>=1;i--){add('wake',now-i*3*H);add('sleep',now-i*3*H+100*MIN);}add('wake',now-10*MIN);
  assert.strictEqual(P.nextNap(now).basis,'norma');
  // veglie fuori range (3 min, 5 h) e più vecchie di 7 giorni non contano
  reset();
  add('wake',now-9*864e5);add('sleep',now-9*864e5+90*MIN);
  add('wake',now-5*H);add('sleep',now-5*H+3*MIN);add('wake',now-4*H);add('sleep',now-4*H+5*H+MIN);add('wake',now-10*MIN);
  assert.strictEqual(P.observations(now).awakes.length,0);

  // --- pappe: solo quelle valide (ml>0), intervalli 0,5–8 h
  reset();
  add('feed',now-10*H,{prep:120,ml:100});add('feed',now-9*H,{prep:120,ml:0});add('feed',now-7*H,{prep:120,ml:100});
  add('feed',now-6*H-50*MIN,{prep:120,ml:100}); // 10 min dopo: sotto 0,5 h
  add('feed',now-4*H,{prep:120,ml:80});add('feed',now-3*H,{prep:120,ml:0}); // rifiutata: non vale
  add('feed',now-H,{prep:120,ml:90});
  const of=P.observations(now).feeds;
  assert.deepStrictEqual(of.map(x=>Math.round(x*100)/100),[3,2.83,3],'10→7 h (la rifiutata non conta), 6:50→4 h, 4→1 h (rifiutata saltata)');
  f=P.nextFeed(now);assert.strictEqual(f.basis,'norma');assert.strictEqual(f.n,3);assert.strictEqual(f.at,now-H+norm.feedH*H);
  // intervallo scelto dai genitori: vince su tutto
  S.settings.feedH=4;f=P.nextFeed(now);assert.strictEqual(f.basis,'impostato');assert.strictEqual(f.at,now-H+4*H);assert.strictEqual(f.minutes,180);
  assert.strictEqual(window.AlanExt.api.norms(30).feedH,4,'anche le norme lo usano');S.settings.feedH=null;assert.strictEqual(window.AlanExt.api.norms(30).feedH,3);

  // --- "tra poco" sotto i 5 minuti, "da N min" se passato, senza allarmi
  reset();
  add('wake',now-(norm.awakeMin-3)*MIN);add('feed',now-(norm.feedH*60+12)*MIN,{prep:120,ml:100});
  np=P.nextNap(now);assert.strictEqual(np.minutes,3);assert.strictEqual(P.rel(np,now),'tra poco');
  assert.strictEqual(P.phrase('nanna',np,now),'Probabile nanna tra poco');
  f=P.nextFeed(now);assert.strictEqual(f.minutes,-12);assert.strictEqual(P.rel(f,now),'da 12 min');
  assert.strictEqual(P.phrase('pappa',f,now),'Pappa attesa da 12 min');
  T('renderHome()');h=app.els['#home-predict']._h;
  assert.ok(/Probabile nanna tra poco/.test(h)&&/Pappa attesa da 12 min/.test(h),h);assert.ok(!/warn|danger/.test(h));
  assert.strictEqual(P.rel({at:now+125*MIN},now),'tra 2 h 05');

  // --- dorme di giorno: risveglio dalla media dei pisolini di giorno (45 min se pochi)
  reset();
  add('feed',now-H,{prep:120,ml:100});add('sleep',now-20*MIN);
  let w=P.nextWake(now);
  assert.strictEqual(w.basis,'norma');assert.strictEqual(w.n,0);assert.strictEqual(w.minutes,25,'45 min di pisolino − 20 dormiti');
  assert.strictEqual(P.nextNap(now),null,'dorme: niente nanna');
  T('renderHome()');h=app.els['#home-predict']._h;
  assert.ok(/Probabile risveglio tra 25 min/.test(h)&&/verso le 14:25/.test(h),h);assert.ok(/Pappa prevista/.test(h));
  // 12 pisolini di giorno da 40 min negli ultimi giorni → ritmo di Alan
  reset();
  for(let day=3;day>=1;day--){const d0=new Date(now-day*864e5);d0.setHours(9,0,0,0);let t=d0.getTime();for(let i=0;i<4;i++){add('sleep',t);add('wake',t+40*MIN);t+=2*H;}}
  add('sleep',now-30*MIN);
  w=P.nextWake(now);assert.strictEqual(w.basis,'alan');assert.strictEqual(w.n,12);assert.strictEqual(w.minutes,10);assert.strictEqual(T('fmtTime')(w.at),'14:10');
  // di notte: le tratte di notte fanno pool a sé; con meno di 4 non si azzarda
  reset();
  const night=new Date(now);night.setHours(23,0,0,0);const nowN=night.getTime();
  add('sleep',nowN-30*MIN);
  assert.strictEqual(P.nextWake(nowN),null,'notte senza storia: niente previsione');
  for(let day=4;day>=1;day--){const d0=new Date(nowN-day*864e5);d0.setHours(21,0,0,0);add('sleep',d0.getTime());add('wake',d0.getTime()+3*H);}
  w=P.nextWake(nowN);assert.strictEqual(w.basis,'alan');assert.strictEqual(w.n,4);assert.strictEqual(w.minutes,150,'3 h di tratta − 30 min');
  const dayNaps=P.observations(nowN).naps.filter(x=>x.day).length;assert.strictEqual(dayNaps,0,'le tratte iniziate alle 21 sono di notte');

  // --- Pattern: "Ritmo di Alan" con osservazioni e norma
  reset();
  for(let i=12;i>=1;i--){add('wake',now-i*3*H);add('sleep',now-i*3*H+(norm.awakeMin+20)*MIN);}
  add('wake',now-10*MIN);
  for(let i=11;i>=0;i--)add('feed',now-40*MIN-i*150*MIN,{prep:120,ml:100});
  T('renderStats()');const st=txt('#stats');
  assert.ok(/Ritmo di Alan/.test(st),st.slice(-400));
  assert.ok(new RegExp('Veglia '+T('fmtDur')((norm.awakeMin+20)*MIN)+' norma ~'+norm.awakeMin+' min · 12 veglie').test(st),st.slice(-500));
  assert.ok(/Tra una pappa e l'altra 2 h 30 norma ~[\d,]+ h · 11 intervalli/.test(st),st.slice(-500));
  assert.ok(/Previsioni: nanna su ritmo di Alan, pappa su ritmo di Alan\./.test(st));
  assert.ok(/Veglia: 20 min più della norma\./.test(st),st.slice(-300));
  assert.ok(new RegExp('Intervallo tra le pappe: '+Math.round(norm.feedH*60-150)+' min meno della norma\\.').test(st),st.slice(-300));
  S.settings.name='Alan';
  reset();T('renderStats()');assert.ok(/Ritmo di Alan Ultimi 7 giorni.*Veglia — norma/.test(txt('#stats')),'senza dati resta leggibile');
  assert.ok(/Previsioni: nanna su norma per età, pappa su norma per età\./.test(txt('#stats')));
  Date.now=realNow;
  console.log('predict ok');
})().catch(e=>{console.error(e);process.exit(1);});
