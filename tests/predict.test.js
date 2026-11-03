// predict: la prossima pappa. Intervalli regolari → minuti e orario; pochi dati → norma per età; intervallo scelto → vince.
'use strict';
const assert=require('assert');
const {boot}=require('./stub');
const MIN=6e4,H=36e5;
(async()=>{
  const app=await boot({ext:['predict']});const {A,S,T,txt}=app;
  const P=window.AlanExt.predict;
  assert.ok(P&&P.nextFeed&&P.observations&&P.expected,'esposto su window.AlanExt.predict');
  S.settings.birth='2026-08-20';
  const norm=T('norms')(T('ageDays')());
  const d=new Date();d.setHours(14,0,0,0);const now=d.getTime();
  let n=0;const add=(t,ml)=>{S.events.push({id:'p'+(n++),k:'feed',t:t,who:'Fabio',ml:ml==null?100:ml});};
  const reset=()=>{S.events.length=0;n=0;};
  const realNow=Date.now;Date.now=()=>now;

  // --- nessun dato: niente previsione
  reset();
  assert.strictEqual(P.nextFeed(now),null);
  assert.ok(/Dopo la prima pappa/.test(P.homeHtml()),'un accenno e basta');

  // --- una pappa sola: vale la norma per età
  reset();add(now-2*H);
  let f=P.nextFeed(now);
  assert.strictEqual(f.basis,'norma');
  assert.strictEqual(f.at,now-2*H+norm.feedH*H,'ultima pappa + norma');
  assert.strictEqual(f.minutes,Math.round((f.at-now)/MIN));

  // --- intervalli regolari da 3 h: con 4–10 osservazioni il valore è misto (70% Alan / 30% norma)
  reset();
  for(let i=6;i>=0;i--)add(now-i*3*H);
  const o=P.observations(now);
  assert.strictEqual(o.feeds.length,6,'sei intervalli');assert.ok(o.feeds.every(x=>Math.abs(x-3)<1e-9));
  f=P.nextFeed(now);
  assert.strictEqual(f.basis,'misto');assert.strictEqual(f.n,6);
  const exp=0.7*3+0.3*norm.feedH;
  assert.ok(Math.abs(f.at-(now+exp*H))<1000,'ultima pappa + valore misto');

  // --- oltre 10 osservazioni: solo il ritmo di Alan
  reset();
  for(let i=12;i>=0;i--)add(now-i*3*H);
  f=P.nextFeed(now);
  assert.strictEqual(f.basis,'alan');assert.ok(Math.abs(f.at-(now+3*H))<1000);

  // --- le pappe rifiutate non contano come pappa
  reset();add(now-3*H);add(now-10*MIN,0);
  f=P.nextFeed(now);
  assert.ok(Math.abs(f.at-(now-3*H+norm.feedH*H))<1000,'il biberon rifiutato non sposta la previsione');

  // --- intervallo scelto in Impostazioni: vince su tutto
  reset();for(let i=6;i>=0;i--)add(now-i*3*H);
  S.settings.feedH=4;
  f=P.nextFeed(now);
  assert.strictEqual(f.basis,'impostato');assert.ok(Math.abs(f.at-(now+4*H))<1000);
  S.settings.feedH=null;

  // --- testo: "tra …" nel futuro, "da …" se è passato, mai allarmi
  reset();add(now-30*MIN);
  let h=P.homeHtml();
  assert.ok(/Pappa prevista tra /.test(h),h);
  assert.ok(/verso le \d\d:\d\d/.test(h)&&/A\.flow\('feed'\)/.test(h),'orario e tap → percorso: '+h);
  reset();add(now-6*H);
  h=P.homeHtml();
  assert.ok(/Pappa attesa da /.test(h)&&!/ritardo|allarme|dovrebbe/.test(h),h);
  // sotto i 5 minuti: "tra poco"
  assert.strictEqual(P.rel({at:now+2*MIN},now),'tra poco');

  // --- Pattern: scheda del ritmo
  reset();for(let i=6;i>=0;i--)add(now-i*3*H);
  T('renderStats()');
  const st=txt('#stats');
  assert.ok(/Ritmo di Alan/.test(st)&&/Tra una pappa e l'altra/.test(st),st.slice(0,200));
  assert.ok(!/Veglia/.test(st)&&!/Pisolino/.test(st)&&!/Sonno/.test(st),'niente più nanne: '+st.slice(0,300));
  Date.now=realNow;
  console.log('predict ok');
})().catch(e=>{console.error(e);process.exit(1);});
