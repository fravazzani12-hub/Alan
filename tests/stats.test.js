// stats: la settimana (riquadri), pappa (quando mangia, ore abituali, quanto beve), cacca; SVG con marche giuste; attesa senza dati.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5;
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
const count=(html,re)=>(String(html).match(re)||[]).length;
(async()=>{
  const app=await boot({ext:['stats']});const {S,T}=app;
  const X=window.AlanExt,ST=X.stats;
  assert.ok(ST&&typeof ST.milkPerDay==='function'&&typeof ST.feedTimes==='function'&&typeof ST.diapersPerDay==='function'&&typeof ST.usual==='function'&&typeof ST.week==='function','esposto su window.AlanExt.stats');
  assert.ok(typeof ST.nights==='undefined'&&typeof ST.sleepCard==='undefined'&&typeof ST.nightsCard==='undefined','niente più nanne né diario notturno');
  assert.strictEqual(T('EXT.slots.stats.length'),1,'registrato nello slot stats di Pattern');
  // "adesso" fisso: oggi alle 14:00 locali
  const d0=new Date();d0.setHours(14,0,0,0);const now=d0.getTime();
  const at=(dOff,hour,min)=>{const d=new Date(now);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+dOff,hour,min||0,0,0).getTime();};
  const realNow=Date.now;Date.now=()=>now;
  let n=0;const add=(k,t,extra)=>{const e=Object.assign({id:'s'+(n++),k,t,who:'Fabio'},extra||{});S.events.push(e);return e;};
  const reset=()=>{S.events.length=0;n=0;};
  const stats=()=>{T('renderStats()');return String(app.els['#stats']._h);};

  // --- senza dati: tre schede con il testo di attesa, nessun grafico
  reset();
  let mk=ST.milkPerDay(now);assert.strictEqual(mk.days.length,7);assert.strictEqual(mk.mode,null);assert.strictEqual(mk.mean,null);
  let ft=ST.feedTimes(now);assert.strictEqual(ft.days.length,7);assert.strictEqual(ft.nFeeds,0);
  let html=stats();
  assert.ok(/La settimana di Alan/.test(html)&&/<h3>Pappa<\/h3>/.test(html)&&/<h3>Cacca<\/h3>/.test(html),'tre schede');
  assert.ok(!/Nanna/.test(html)&&!/Diario notturno/.test(html)&&!/piangeva/.test(html)&&!/Pannolini/.test(html),'niente nanne, notti o pianti: '+html.slice(0,300));
  let dp=ST.diapersPerDay(now);assert.strictEqual(dp.days.length,7);assert.strictEqual(dp.n,0);assert.strictEqual(dp.perDay,null);
  let wk=ST.week(now);assert.strictEqual(wk.any,false);assert.strictEqual(wk.feedsPerDay,null);assert.strictEqual(ST.usual(now).times.length,0);
  assert.strictEqual(count(html,/st-wait/g),3,'tre testi di attesa');assert.strictEqual(count(html,/st-chart/g),0,'nessun grafico');

  // --- 7 giorni finti. Biberon alle 2 (80 ml) e 8/11/14/17/20 (100 ml) → 580 ml; biberon alle 23:00 (60 ml) nei giorni
  //     dispari; giorno 4: biberon rifiutato (0 ml). Oggi (in corso, ore 14): biberon alle 2, 8, 11 → 280 ml.
  reset();
  for(let d=7;d>=1;d--){
    [2,8,11,14,17,20].forEach(hr=>add('feed',at(-d,hr),{ml:hr===2?80:100}));
    if(d%2)add('feed',at(-d,23),{ml:60});
    if(d===4)add('feed',at(-d,5),{ml:0});
  }
  [2,8,11].forEach(hr=>add('feed',at(0,hr),{ml:hr===2?80:100}));

  // latte al giorno: 6 giorni interi (d=6..1) + oggi in corso; media sui giorni interi
  mk=ST.milkPerDay(now);
  assert.strictEqual(mk.mode,'ml');assert.strictEqual(mk.days.length,7);assert.strictEqual(mk.daysUsed,6);
  mk.days.slice(0,6).forEach((x,j)=>{const d=6-j;assert.strictEqual(x.ml,d%2?640:580,'ml giorno d='+d);assert.strictEqual(x.n,d%2?7:6);assert.ok(!x.partial);});
  assert.strictEqual(mk.days[6].label,'oggi');assert.ok(mk.days[6].partial);assert.strictEqual(mk.days[6].ml,280);
  assert.strictEqual(mk.mean,610);
  let fc0=ST.feedCard(now);const mSvg=fc0.match(/<h4 class="st-h4">Quanto beve<\/h4><div class="st-g">(<svg[\s\S]*?<\/svg>)/)[1];
  assert.strictEqual(count(mSvg,/<path class="st-bar/g),7,'7 barre');assert.strictEqual(count(mSvg,/<path class="st-bar part"/g),1,'oggi più chiaro');
  assert.ok(/<b>in media 610 ml<\/b> al giorno, su 6 giorni/.test(fc0),fc0);
  assert.ok(/ieri · 640 ml in 7 pappe/.test(mSvg),'tooltip con ml e pappe');

  // quando mangia: 7 righe dal più vecchio a oggi
  ft=ST.feedTimes(now);
  assert.strictEqual(ft.days.length,7);assert.strictEqual(ft.days[6].label,'oggi');assert.ok(ft.days[6].partial);assert.strictEqual(ft.days[5].label,'ieri');
  ft.days.slice(0,6).forEach((x,j)=>{const d=6-j;assert.strictEqual(x.feeds.filter(f=>f.fed).length,d%2?7:6,'pappe d='+d);});
  assert.strictEqual(ft.days[6].feeds.length,3);
  assert.strictEqual(ft.nFeeds,42);near(ft.perDay,6.5,1e-9,'pappe al giorno');
  assert.strictEqual(ft.days[5].feeds.filter(f=>f.h===23).length,1,'biberon delle 23 ieri');
  assert.strictEqual(ft.days[6].feeds[0].h,2);assert.strictEqual(ft.days[6].feeds[2].h,11);
  assert.strictEqual(ft.maxMl,100);
  assert.ok(!('sleeps' in ft.days[0])&&!('cries' in ft.days[0]),'niente nanne né pianti nei dati del grafico');
  let fc=ST.feedCard(now);const tl=fc.match(/<h4 class="st-h4">Quando mangia<\/h4><div class="st-g">(<svg[\s\S]*?<\/svg>)/)[1];
  assert.strictEqual(count(tl,/class="st-feedbar"/g),42,'una barretta per pappa');assert.strictEqual(count(tl,/class="st-refused"/g),1,'la rifiutata come quadratino');
  assert.strictEqual(count(tl,/class="st-sleep"/g),0,'niente fasce di nanna');assert.strictEqual(count(tl,/class="st-nowline"/g),1,'segno di adesso su oggi');
  assert.strictEqual(count(tl,/class="st-night"/g),2,'notte 22–7 in ombra');
  assert.ok(/Pappa ieri 23:00 · 60 ml/.test(tl),'tooltip delle pappe');
  assert.ok(/<b>di solito verso le 2, 8, 11, 14, 17, 20 e 23<\/b> · in media 6,5 pappe al giorno · una ogni \d+ h \d+/.test(fc),fc.match(/st-read">[^<]*<b>[^<]*/));
  assert.ok(/st-legend/.test(fc)&&/pappa/.test(fc)&&!/nanna/.test(fc)&&/Le ore delle pappe/.test(fc)&&count(fc,/class="st-pk"/g)===7,'profilo delle ore con 7 momenti abituali, senza nanne');
  // ore abituali e profilo
  let us=ST.usual(now);assert.strictEqual(us.daysN,7);assert.deepStrictEqual(us.times.map(t=>ST.fmtClock(t.h)),['2','8','11','14','17','20','23']);
  let hg=ST.histogram(now);assert.strictEqual(hg.bins.reduce((a,b)=>a+b,0),42,'tutte le pappe nel profilo');assert.strictEqual(hg.bins[16],7,'alle 8 tutti i giorni');
  assert.strictEqual(ST.fmtClock(13.6),'13:30');assert.strictEqual(ST.fmtClock(23.9),'0');
  assert.strictEqual(ST.usualText({times:[{h:2},{h:14.5}]}),'di solito verso le 2 e 14:30');

  // la settimana: tre riquadri
  wk=ST.week(now);assert.ok(wk.any);assert.strictEqual(wk.daysUsed,6);near(wk.feedsPerDay,6.5,1e-9,'pappe al giorno');assert.strictEqual(wk.mlPerDay,610);
  assert.strictEqual(wk.today.feeds,3);assert.strictEqual(wk.today.ml,280);
  assert.ok(!('cries' in wk)&&!('nightMean' in wk),'niente pianti né notti nei numeri della settimana');
  let wc=ST.weekCard(now);assert.ok(/La settimana di Alan/.test(wc)&&count(wc,/class="st-tile"/g)===3,'tre riquadri');
  assert.ok(/>6,5 <small>al giorno<\/small></.test(wc)&&/>610 <small>ml al giorno<\/small></.test(wc),wc);
  assert.ok(/<b>Oggi<\/b> 3 pappe \(280 ml\) · 0 cacche</.test(wc),'riga di oggi: '+wc.match(/<b>Oggi[^<]*<\/b>[^<]*/));
  assert.strictEqual(count(wc,/<svg class="st-spark"/g),3,'tre linee di andamento');assert.ok(/sui 6 giorni interi/.test(wc));
  assert.ok(ST.sparkline([1,null,3],false).indexOf('polyline')<0&&/circle/.test(ST.sparkline([1,null,3],false)),'buchi: nessun tratto, solo l\'ultimo punto');

  // --- cacca: solo la quantità, niente pipì. d=6..1 due cacche al giorno, giorno 4 una terza con il vecchio "si"
  for(let d=7;d>=1;d--){add('diaper',at(-d,12),{cacca:'poca'});add('diaper',at(-d,19),{cacca:'normale'});if(d===4)add('diaper',at(-d,22),{cacca:'si'});}
  add('diaper',at(0,6),{cacca:'no'});add('diaper',at(0,11),{cacca:'normale'});
  dp=ST.diapersPerDay(now);
  assert.strictEqual(dp.days.length,7);assert.strictEqual(dp.n,14,'cacche nella finestra (giorno 7 escluso, "no" non conta)');assert.strictEqual(dp.daysUsed,6);
  dp.days.slice(0,6).forEach((x,j)=>{const d=6-j;assert.strictEqual(x.n,d===4?3:2,'cacche d='+d);assert.strictEqual(x.cacca.poca,1);});
  assert.strictEqual(dp.days[2].cacca.normale,2,'il vecchio "si" conta come normale');
  assert.strictEqual(dp.days[6].label,'oggi');assert.ok(dp.days[6].partial);assert.strictEqual(dp.days[6].n,1,'il cambio senza cacca non conta');
  near(dp.pooPerDay,13/6,1e-9,'cacche al giorno');
  assert.deepStrictEqual(dp.cacca,{poca:6,normale:8,tanta:0,tot:14});
  assert.ok(!('pipi' in dp),'niente più pipì');
  let dc=ST.diaperCard(now);
  assert.strictEqual(count(dc,/<svg/g),1,'un grafico solo');assert.strictEqual(count(dc,/class="st-mean"/g),1);
  assert.strictEqual(count(dc,/class="st-seg poca/g),6,'segmenti poca');
  assert.ok(/<b>2,2 al giorno<\/b>, su 6 giorni · 6 poca · 8 normale in 7 giorni/.test(dc),'lettura: '+dc.match(/st-read">[\s\S]{0,120}/));
  assert.ok(/st-legend/.test(dc)&&!/Pipì/.test(dc));assert.ok(!/NaN|undefined/.test(dc));
  assert.ok(!/bene|poco|troppo|giusto|regolare/.test(dc),'nessun giudizio');

  // tutto insieme in Pattern
  html=stats();
  assert.strictEqual(count(html,/st-chart/g),4,'quattro grafici: quando mangia, ore, quanto beve, cacca');
  assert.strictEqual(count(html,/st-wait/g),0);
  assert.ok(/viewBox="0 0 360 /.test(html),'viewBox 360 di larghezza');assert.ok(!/NaN|undefined/.test(html));
  assert.ok(/in media 610 ml/.test(html)&&/in media 6,5 pappe/.test(html));
  S.events=S.events.filter(e=>e.k!=='diaper');

  // --- tre giorni di soli biberon: barre in ml, media sui giorni interi
  reset();
  for(let d=3;d>=1;d--){add('feed',at(-d,8),{ml:100});add('feed',at(-d,12),{ml:120});}
  mk=ST.milkPerDay(now);
  assert.strictEqual(mk.mode,'ml');assert.strictEqual(mk.mean,220);assert.strictEqual(mk.daysUsed,3);
  fc=ST.feedCard(now);assert.ok(/<b>in media 220 ml<\/b> al giorno, su 3 giorni/.test(fc),fc);
  ft=ST.feedTimes(now);assert.strictEqual(ft.nFeeds,6);assert.strictEqual(ft.perDay,2);
  assert.deepStrictEqual(ST.usual(now).times.map(t=>ST.fmtClock(t.h)),['8','12'],'due momenti abituali');
  // pappa rifiutata non fa pappa
  add('feed',at(0,9),{ml:0});
  ft=ST.feedTimes(now);assert.strictEqual(ft.nFeeds,6);mk=ST.milkPerDay(now);assert.strictEqual(mk.days[6].ml,0);

  // --- solo oggi: la media è su oggi
  reset();add('feed',at(0,8),{ml:110});add('feed',at(0,12),{ml:90});
  mk=ST.milkPerDay(now);assert.strictEqual(mk.mean,200);assert.strictEqual(mk.daysUsed,1);
  ft=ST.feedTimes(now);assert.strictEqual(ft.perDay,2);near(ft.meanGap,4*H,1,'un solo intervallo');
  assert.strictEqual(ST.usual(now).times.length,0,'con due sole pappe nessun momento abituale');
  // rigurgiti nella scheda Pappa
  add('other',at(0,8,20),{what:'rigurgito'});add('other',at(-1,15),{what:'rigurgito'});
  wk=ST.week(now);assert.strictEqual(wk.rig,2);assert.strictEqual(wk.rigFeed,1);assert.ok(/Rigurgiti: 2 in 7 giorni, 1 entro 30 min da una pappa/.test(ST.feedCard(now)));

  // --- formati
  assert.strictEqual(ST.fmtH(0),'0');assert.strictEqual(ST.fmtH(45*MIN),'45 min');assert.strictEqual(ST.fmtH(8*H),'8 h');
  assert.strictEqual(ST.dec1(6.5),'6,5');assert.strictEqual(ST.dec1(2),'2');

  Date.now=realNow;
  console.log('stats ok');
})().catch(e=>{console.error(e);process.exit(1);});
