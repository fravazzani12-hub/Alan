// stats: sonno per notte (22–7), latte al giorno, ritmo delle pappe su 7 giorni; SVG con barre/pallini giusti; attesa senza dati.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5;
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' vs '+b);
const count=(html,re)=>(String(html).match(re)||[]).length;
(async()=>{
  const app=await boot({ext:['stats']});const {S,T}=app;
  const X=window.AlanExt,ST=X.stats;
  assert.ok(ST&&typeof ST.nights==='function'&&typeof ST.milkPerDay==='function'&&typeof ST.feedTimes==='function'&&typeof ST.diapersPerDay==='function','esposto su window.AlanExt.stats');
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
  let ng=ST.nights(now);assert.strictEqual(ng.nights.length,7);assert.strictEqual(ng.recorded,0);assert.strictEqual(ng.mean,null);
  let mk=ST.milkPerDay(now);assert.strictEqual(mk.days.length,7);assert.strictEqual(mk.mode,null);assert.strictEqual(mk.mean,null);
  let ft=ST.feedTimes(now);assert.strictEqual(ft.days.length,7);assert.strictEqual(ft.nFeeds,0);assert.strictEqual(ft.perDay,null);
  let html=stats();
  assert.ok(/Sonno per notte/.test(html)&&/Latte al giorno/.test(html)&&/Quando mangia/.test(html)&&/Pannolini/.test(html),'quattro titoli');
  let dp=ST.diapersPerDay(now);assert.strictEqual(dp.days.length,7);assert.strictEqual(dp.n,0);assert.strictEqual(dp.perDay,null);
  assert.strictEqual(count(html,/st-wait/g),4,'quattro testi di attesa');assert.strictEqual(count(html,/st-chart/g),0,'nessun grafico');

  // --- 7 giorni finti. Notte d (1..7): Nanna alle 22:00 + d·10 min, Sveglio alle 07:30 → nella finestra 22–7 dorme 9 h − d·10 min.
  //     Pisolino 13–14 (non conta). Biberon alle 2 (80 ml) e 8/11/14/17/20 (100 ml) → 580 ml; biberon alle 23:00 (60 ml) nei giorni dispari;
  //     giorno 4: biberon rifiutato (0 ml). Pianti alle 9:30 e 16:00.
  //     Oggi (in corso, ore 14): biberon alle 2, 8, 11 → 280 ml, un pianto alle 10.
  reset();
  for(let d=7;d>=1;d--){
    add('sleep',at(-d,22)+d*10*MIN);add('wake',at(-d+1,7,30));
    add('sleep',at(-d,13));add('wake',at(-d,14));
    [2,8,11,14,17,20].forEach(hr=>add('feed',at(-d,hr),{prep:hr===2?100:120,ml:hr===2?80:100,src:'biberon'}));
    if(d%2)add('feed',at(-d,23),{prep:90,ml:60,src:'biberon'});
    if(d===4)add('feed',at(-d,5),{prep:100,ml:0,src:'biberon'});
    add('cry',at(-d,9,30),{dur:40,label:'fame'});add('cry',at(-d,16),{dur:20,label:null});
  }
  [2,8,11].forEach(hr=>add('feed',at(0,hr),{prep:120,ml:hr===2?80:100,src:'biberon'}));add('cry',at(0,10),{dur:30,label:null});

  // sonno per notte: dalla più vecchia (d=7) all'ultima (d=1, "ieri"), media su 7 notti
  ng=ST.nights(now);
  assert.strictEqual(ng.nights.length,7);assert.strictEqual(ng.recorded,7);
  ng.nights.forEach((x,j)=>{const d=7-j;near(x.sleep,9*H-d*10*MIN,1,'notte d='+d);assert.ok(x.rec);assert.strictEqual(x.start,at(-d,22));assert.strictEqual(x.end,at(-d+1,7));});
  assert.strictEqual(ng.nights[6].label,'ieri');assert.strictEqual(ng.nights[5].label,['dom','lun','mar','mer','gio','ven','sab'][new Date(at(-2,22)).getDay()]);
  near(ng.mean,9*H-40*MIN,1,'media 8 h 20');
  assert.strictEqual(ng.nights[6].feeds,2,'stanotte: biberon alle 23 + alle 2');assert.strictEqual(ng.nights[5].feeds,1,'notte pari: solo il biberon delle 2');assert.strictEqual(ng.nights[6].cries,0);
  let sc=ST.sleepCard(now);
  assert.strictEqual(count(sc,/<rect class="st-bar/g),7,'7 barre');assert.strictEqual(count(sc,/class="st-mean"/g),1,'linea della media');
  assert.ok(/7h50/.test(sc)&&/8h50/.test(sc),'etichette sopra le barre: '+sc);
  assert.ok(/<b>in media 8 h 20<\/b> a notte, su 7 notti</.test(sc),'lettura fattuale: '+sc);
  assert.ok(!/st-wait/.test(sc)&&!/NaN|undefined/.test(sc));

  // latte al giorno: 6 giorni interi (d=6..1) + oggi in corso; media sui giorni interi
  mk=ST.milkPerDay(now);
  assert.strictEqual(mk.mode,'ml');assert.strictEqual(mk.days.length,7);assert.strictEqual(mk.daysUsed,6);
  mk.days.slice(0,6).forEach((x,j)=>{const d=6-j;assert.strictEqual(x.ml,d%2?640:580,'ml giorno d='+d);assert.strictEqual(x.n,d%2?7:6);assert.ok(!x.partial);});
  assert.strictEqual(mk.days[6].label,'oggi');assert.ok(mk.days[6].partial);assert.strictEqual(mk.days[6].ml,280);assert.strictEqual(mk.days[6].n,3);
  assert.strictEqual(mk.meanMl,610);assert.strictEqual(mk.mean,610);
  let mc=ST.milkCard(now);
  assert.strictEqual(count(mc,/<rect class="st-bar/g),7,'7 barre');assert.strictEqual(count(mc,/<rect class="st-bar part"/g),1,'oggi più chiaro');
  assert.ok(!/seno/.test(mc),'niente seno');
  assert.ok(/<b>in media 610 ml<\/b> al giorno, su 6 giorni/.test(mc),mc);
  const msvg=mc.match(/<svg[\s\S]*<\/svg>/)[0];assert.ok(/>580</.test(msvg)&&/>640</.test(msvg)&&/>280</.test(msvg)&&count(msvg,/>ml</g)===1&&!/ ml</.test(msvg),'valori, unità una volta sopra l\'asse: '+msvg);

  // quando mangia: 7 righe dal più vecchio a oggi, pappe e pianti nella finestra (giorno 7 escluso)
  ft=ST.feedTimes(now);
  assert.strictEqual(ft.days.length,7);assert.strictEqual(ft.days[6].label,'oggi');assert.ok(ft.days[6].partial);assert.strictEqual(ft.days[5].label,'ieri');
  ft.days.slice(0,6).forEach((x,j)=>{const d=6-j;assert.strictEqual(x.feeds.length,d%2?7:6,'pappe d='+d);assert.strictEqual(x.cries.length,2);});
  assert.strictEqual(ft.days[6].feeds.length,3);assert.strictEqual(ft.days[6].cries.length,1);
  assert.strictEqual(ft.nFeeds,42);assert.strictEqual(ft.nCries,13);near(ft.perDay,6.5,1e-9,'pappe al giorno');
  assert.strictEqual(ft.days[5].feeds.filter(f=>f.h===23).length,1,'biberon delle 23 ieri');
  assert.strictEqual(ft.days[6].feeds[0].h,2);assert.strictEqual(ft.days[6].feeds[2].h,11);
  // intervallo medio: stessa regola documentata (fra pappe consecutive, 30 min – 8 h)
  const all=S.events.filter(e=>e.t>=at(-6,0)&&e.t<=now&&e.ml>0).map(e=>e.t).sort((a,b)=>a-b);
  const gaps=[];for(let j=1;j<all.length;j++){const g=(all[j]-all[j-1])/H;if(g>0.5&&g<8)gaps.push(g);}
  near(ft.meanGap,gaps.reduce((s,x)=>s+x,0)/gaps.length*H,1,'intervallo medio');
  let fc=ST.feedCard(now);
  assert.strictEqual(count(fc,/<circle class="st-feed/g),42,'un pallino per pappa');assert.strictEqual(count(fc,/seno/g),0,'niente seno');
  assert.strictEqual(count(fc,/class="st-cry"/g),13,'una tacca per pianto');assert.strictEqual(count(fc,/class="st-nowline"/g),1,'segno di adesso su oggi');
  assert.strictEqual(count(fc,/class="st-night"/g),2,'notte 22–7 in ombra');
  assert.ok(/<b>in media 6,5 pappe<\/b> al giorno · una ogni \d+ h \d+ · 13 pianti in 7 giorni/.test(fc),fc);
  assert.ok(/st-legend/.test(fc)&&/pappa/.test(fc)&&/pianto/.test(fc));

  // pannolini: giorni interi d=6..1 con 3 cambi (pipì tanta+cacca no, pipì normale+cacca poca, pipì poca+cacca normale), giorno 4 un quarto cambio
  //     con i valori vecchi (pipi 'si' → normale, cacca 'tanta'); oggi 2 cambi (pipì normale senza cacca, entrambi normali)
  for(let d=7;d>=1;d--){add('diaper',at(-d,7),{pipi:'tanta',cacca:'no'});add('diaper',at(-d,12),{pipi:'normale',cacca:'poca'});add('diaper',at(-d,19),{pipi:'poca',cacca:'normale'});if(d===4)add('diaper',at(-d,22),{pipi:'si',cacca:'tanta'});}
  add('diaper',at(0,6),{pipi:'normale',cacca:'no'});add('diaper',at(0,11),{pipi:'normale',cacca:'normale'});
  dp=ST.diapersPerDay(now);
  assert.strictEqual(dp.days.length,7);assert.strictEqual(dp.n,21,'cambi nella finestra (giorno 7 escluso)');assert.strictEqual(dp.daysUsed,6);
  dp.days.slice(0,6).forEach((x,j)=>{const d=6-j;assert.strictEqual(x.n,d===4?4:3,'cambi d='+d);assert.strictEqual(x.pipi.tot,d===4?4:3);assert.strictEqual(x.cacca.tot,d===4?3:2);assert.strictEqual(x.pipi.tanta,1);assert.strictEqual(x.cacca.poca,1);});
  assert.strictEqual(dp.days[2].pipi.normale,2,'il vecchio "si" conta come normale');assert.strictEqual(dp.days[2].cacca.tanta,1);
  assert.strictEqual(dp.days[6].label,'oggi');assert.ok(dp.days[6].partial);assert.strictEqual(dp.days[6].n,2);assert.strictEqual(dp.days[6].pipi.normale,2);assert.strictEqual(dp.days[6].cacca.tot,1);
  near(dp.perDay,19/6,1e-9,'cambi al giorno');near(dp.wetPerDay,19/6,1e-9,'con pipì al giorno');near(dp.pooPerDay,13/6,1e-9,'con cacca al giorno');
  assert.deepStrictEqual(dp.pipi,{poca:6,normale:9,tanta:6,tot:21});assert.deepStrictEqual(dp.cacca,{poca:6,normale:7,tanta:1,tot:14});
  let dc=ST.diaperCard(now);
  assert.strictEqual(count(dc,/<svg/g),2,'due grafici: pipì e cacca');assert.strictEqual(count(dc,/class="st-mean"/g),2,'una media per grafico');
  assert.strictEqual(count(dc,/class="st-seg poca/g),6+6,'segmenti poca');assert.strictEqual(count(dc,/class="st-seg tanta/g),6+1,'segmenti tanta');assert.strictEqual(count(dc,/class="st-seg [a-z]+ part"/g),2,'oggi più chiaro');
  assert.ok(/<b>in media 3,2 cambi<\/b> al giorno, su 6 giorni/.test(dc),dc);
  assert.ok(/<b>3,2 al giorno<\/b> · 6 poca · 9 normale · 6 tanta in 7 giorni/.test(dc),'lettura pipì: '+dc);
  assert.ok(/<b>2,2 al giorno<\/b> · 6 poca · 7 normale · 1 tanta in 7 giorni/.test(dc),'lettura cacca: '+dc);
  assert.ok(/st-legend/.test(dc)&&/poca<\/span>/.test(dc)&&/tanta<\/span>/.test(dc));assert.ok(!/NaN|undefined/.test(dc));
  assert.ok(!/bene|poco|troppo|giusto|regolare/.test(dc),'nessun giudizio');

  // tutto insieme in Pattern
  html=stats();
  assert.strictEqual(count(html,/st-chart/g),5,'cinque grafici');assert.strictEqual(count(html,/st-wait/g),0);
  assert.ok(/viewBox="0 0 360 /.test(html),'viewBox 360 di larghezza');assert.ok(!/NaN|undefined/.test(html));
  assert.ok(/in media 8 h 20/.test(html)&&/in media 610 ml/.test(html)&&/in media 6,5 pappe/.test(html)&&/in media 3,2 cambi/.test(html));
  S.events=S.events.filter(e=>e.k!=='diaper');

  // --- una notte senza nanne segnate: "—", esclusa dalla media
  S.events=S.events.filter(e=>!((e.k==='sleep'&&e.t===at(-3,22)+30*MIN)||(e.k==='wake'&&e.t===at(-2,7,30))));
  ng=ST.nights(now);
  assert.strictEqual(ng.recorded,6);assert.ok(!ng.nights[4].rec,'notte d=3 non registrata');assert.strictEqual(ng.nights[4].sleep,0);
  near(ng.mean,(63*H-280*MIN-(9*H-30*MIN))/6,1,'media senza la notte mancante');
  sc=ST.sleepCard(now);assert.strictEqual(count(sc,/<rect class="st-bar/g),6);assert.ok(/none"[^>]*>—</.test(sc),'trattino per la notte mancante');
  assert.ok(/su 6 notti con il sonno segnato/.test(sc),sc);

  // --- nanna ancora aperta: conta fino ad adesso; prima delle 7 l'ultima notte è quella già finita
  reset();add('sleep',at(-1,23));
  ng=ST.nights(now);near(ng.nights[6].sleep,8*H,1,'23 → 7');assert.strictEqual(ng.recorded,1);
  const now3=at(0,3);ng=ST.nights(now3);
  assert.strictEqual(ng.nights[6].end,at(-1,7),'alle 3 di notte l\'ultima notte completa è finita ieri alle 7');assert.strictEqual(ng.recorded,0);
  T('renderStats()');assert.ok(/st-wait/.test(String(app.els['#stats']._h)));

  // --- tre giorni di soli biberon: barre in ml, media sui giorni interi
  reset();
  for(let d=3;d>=1;d--){add('feed',at(-d,8),{prep:120,ml:100});add('feed',at(-d,12),{prep:120,ml:120});}
  mk=ST.milkPerDay(now);
  assert.strictEqual(mk.mode,'ml');assert.strictEqual(mk.mean,220);assert.strictEqual(mk.meanMl,220);assert.strictEqual(mk.daysUsed,3);
  mc=ST.milkCard(now);assert.ok(/<b>in media 220 ml<\/b> al giorno, su 3 giorni/.test(mc),mc);
  assert.strictEqual(count(mc,/<rect class="st-bar/g),7);
  ft=ST.feedTimes(now);assert.strictEqual(ft.nFeeds,6);assert.strictEqual(ft.perDay,2);
  fc=ST.feedCard(now);assert.strictEqual(count(fc,/<circle class="st-feed"/g),6);
  // pappa rifiutata non fa pappa
  add('feed',at(0,9),{prep:100,ml:0,src:'biberon'});
  ft=ST.feedTimes(now);assert.strictEqual(ft.nFeeds,6);mk=ST.milkPerDay(now);assert.strictEqual(mk.days[6].ml,0);

  // --- solo oggi: la media è su oggi
  reset();add('feed',at(0,8),{prep:120,ml:110,src:'biberon'});add('feed',at(0,12),{prep:120,ml:90});
  mk=ST.milkPerDay(now);assert.strictEqual(mk.mode,'ml');assert.strictEqual(mk.mean,200);assert.strictEqual(mk.daysUsed,1);
  ft=ST.feedTimes(now);assert.strictEqual(ft.perDay,2);near(ft.meanGap,4*H,1,'un solo intervallo');
  assert.ok(/in media 200 ml/.test(ST.milkCard(now))&&/in media 2 pappe/.test(ST.feedCard(now)));

  // --- formati
  assert.strictEqual(ST.fmtH(0),'0');assert.strictEqual(ST.fmtH(45*MIN),'45 min');assert.strictEqual(ST.fmtH(8*H),'8 h');assert.strictEqual(ST.fmtH(9*H+5*MIN),'9h05');
  assert.strictEqual(ST.dec1(6.5),'6,5');assert.strictEqual(ST.dec1(2),'2');assert.strictEqual(ST.dec1(0.46),'0,5');

  Date.now=realNow;
  console.log('stats ok');
})().catch(e=>{console.error(e);process.exit(1);});
