/* Estensione "report": riepilogo per il pediatra, da stampare o salvare in PDF dal telefono, o da mandare come testo.
   Altro (slot 'altro'): card "Per il pediatra" con chip 7/30/90 giorni (scelta in localStorage 'alan.report.days') e il
   pulsante "Prepara il riepilogo (N giorni)". Il riepilogo è un percorso a schermo intero ('report', finish ritorna false:
   non salva niente) con intestazione, misure con percentile OMS (ultime 5, in tabella: più leggibile in stampa del grafico),
   pappe, sonno, cambi, pianti con le cause in %, temperature, medicine, visite fatte e in programma.
   Periodo = gli ultimi N giorni completi (oggi escluso dalle medie); se il diario è cominciato oggi vale la sola giornata di
   oggi. Le medie al giorno dividono per i giorni del periodo con almeno una voce nel diario, mai per giorni vuoti.
   Gli elenchi (misure, temperature, medicine, visite) arrivano fino ad adesso. Numeri come fatti, nessun giudizio.
   Calcoli e testo esposti su AlanExt.report.compute(days,now) / .text(days,now) per i test. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var H=API.H,DAY=864e5;
var KEY='alan.report.days',PERIODS=[7,30,90],DEF=30;
var NIGHT_START=22,NIGHT_END=7,MAX_MEASURES=5,MAX_NEXT=5;
var DIARY_KINDS={feed:1,diaper:1,sleep:1,wake:1,other:1,cry:1,temp:1,med:1};
var CAUSE_ORDER=['fame','sonno','cambio','aria','contatto','solo'];

/* ---------- date e formati ---------- */
function at(base,dOff,hour){var d=new Date(base);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+dOff,hour,0,0,0).getTime();}
function dec1(x){return String(Math.round(x*10)/10).replace('.',',');}
function dmy(t){var d=new Date(t);return API.pad(d.getDate())+'/'+API.pad(d.getMonth()+1)+'/'+d.getFullYear();}
function dm(t){var d=new Date(t);return d.getDate()+'/'+(d.getMonth()+1);}
function ord(p){return p==null?'—':p+'°';}
function plural(n,s,p,shown){return (shown!=null?shown:n)+' '+(n===1?s:p);}
function birthLabel(){var b=String(API.settings().birth||'');var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(b);return m?m[3]+'/'+m[2]+'/'+m[1]:b;}
/* età a un istante dato (ageStr dell'app usa sempre adesso) */
function ageAt(now){
  var b=API.birthMs();if(b==null)return '';
  var d=Math.floor((now-b)/DAY);if(d<0)return 'in arrivo';
  var w=Math.floor(d/7),r=d%7,s='';
  if(w)s+=plural(w,'settimana','settimane');if(w&&r)s+=' e ';if(r||!w)s+=plural(r,'giorno','giorni');
  return s+(w?' ('+plural(d,'giorno','giorni')+')':'');
}
function weeksAt(t){var a=API.ageDaysAt(t);return a==null?'':Math.floor(a/7)+' sett';}
function fmtH(ms){return ms==null?'—':API.fmtDur(ms);}
function sum(a){var s=0;for(var i=0;i<a.length;i++)s+=a[i];return s;}
function mean(a){return a.length?sum(a)/a.length:null;}

/* ---------- periodo scelto ---------- */
function period(){var v=Number(API.lsGet(KEY));return PERIODS.indexOf(v)>=0?v:DEF;}
function setPeriod(d){
  d=Number(d);if(PERIODS.indexOf(d)<0)return;
  API.lsSet(KEY,String(d));
  var f=API.flow();
  if(f&&f.type==='report')open(d,f.data&&f.data.now);else X.refresh();
}

/* ---------- sonno: intervalli [inizio,fine] dai tap Nanna/Sveglio; una nanna aperta arriva fino ad adesso ---------- */
function sleepSpans(ev,now){
  var out=[],cur=null;
  ev.forEach(function(e){if(e.t>now)return;if(e.k==='sleep')cur=e.t;else if(e.k==='wake'&&cur!=null){if(e.t>cur)out.push([cur,e.t]);cur=null;}});
  if(cur!=null&&now>cur)out.push([cur,now]);
  return out;
}
function overlap(spans,a,b){var s=0;spans.forEach(function(p){var x=Math.max(p[0],a),y=Math.min(p[1],b);if(y>x)s+=y-x;});return s;}

/* ---------- calcoli ---------- */
function compute(days,now){
  days=Math.max(1,Math.round(Number(days)))||DEF;
  now=now||Date.now();
  var all=API.sorted().filter(function(e){return e.t<=now;});
  var diary=all.filter(function(e){return DIARY_KINDS[e.k];});
  var from=at(now,-days,0),to=at(now,0,0),partial=false;
  var inW=diary.filter(function(e){return e.t>=from&&e.t<to;});
  if(!inW.length){var today=diary.filter(function(e){return e.t>=to;});if(today.length){from=to;to=now;inW=today;partial=true;}}
  /* giorni del periodo con il diario: quelli con almeno una voce (misure e visite non contano); un giorno senza voci
     non abbassa le medie, che sia prima dell'inizio del diario o un giorno dimenticato */
  var logged={},dayList=[];
  inW.forEach(function(e){logged[API.dayKey(e.t)]=true;});
  if(partial)dayList.push({s:from,e:now,i:0});
  else for(var i=-days;i<0;i++){var ds=at(now,i,0);if(logged[API.dayKey(ds)])dayList.push({s:ds,e:at(now,i+1,0),i:i});}
  var covered=dayList.length;
  var per=function(n){return covered?n/covered:null;};

  /* pappe */
  var fed=inW.filter(API.fedFeed),bib=[],refused=0;
  inW.forEach(function(e){if(e.k!=='feed')return;if(e.ml>0)bib.push(e.ml);else refused++;});
  var gaps=[];for(var j=1;j<fed.length;j++){var g=fed[j].t-fed[j-1].t;if(g>0.5*H&&g<8*H)gaps.push(g);}
  var feeds={n:fed.length,biberon:bib.length,refused:refused,perDay:per(fed.length),ml:sum(bib),mlPerDay:bib.length?per(sum(bib)):null,mlPerFeed:mean(bib),gap:mean(gaps)};

  /* sonno: notti 22–7 che finiscono nei giorni del periodo, pisolini (nanne iniziate tra le 7 e le 22), totale per giornata */
  var spans=sleepSpans(all,now),nights=[],naps=[],totals=[];
  dayList.forEach(function(d){var ns=at(now,d.i-1,NIGHT_START),ne=Math.min(at(now,d.i,NIGHT_END),now);var s=overlap(spans,ns,ne);if(s>0)nights.push(s);var tot=overlap(spans,d.s,d.e);if(tot>0)totals.push(tot);});
  spans.forEach(function(p){if(p[0]<from||p[0]>=to)return;var hr=new Date(p[0]).getHours();if(hr>=NIGHT_END&&hr<NIGHT_START)naps.push(p[1]-p[0]);});
  var sleep={nights:nights.length,nightMean:mean(nights),naps:naps.length,napsPerDay:per(naps.length),napMean:mean(naps),daysRec:totals.length,dayMean:mean(totals)};

  /* cambi */
  var dp=inW.filter(function(e){return e.k==='diaper';}),wet=0,poo=0;
  dp.forEach(function(e){if(e.pipi&&e.pipi!=='no')wet++;if(e.cacca&&e.cacca!=='no')poo++;});
  var diapers={n:dp.length,perDay:per(dp.length),wet:wet,wetPerDay:per(wet),poo:poo,pooPerDay:per(poo)};

  /* pianti: cause in % sui pianti spiegati ("passato da solo" compreso) */
  var cr=inW.filter(function(e){return e.k==='cry';}),counts={},labeled=0,durs=[];
  cr.forEach(function(e){if(e.dur>0)durs.push(e.dur);if(e.label&&API.LABELS[e.label]){labeled++;counts[e.label]=(counts[e.label]||0)+1;}});
  var causes=[];CAUSE_ORDER.forEach(function(id){if(counts[id])causes.push({id:id,label:API.LABELS[id],n:counts[id],pct:Math.round(counts[id]/labeled*100)});});
  causes.sort(function(a,b){return b.n-a.n;});
  var cries={n:cr.length,perDay:per(cr.length),labeled:labeled,unlabeled:cr.length-labeled,causes:causes,durMean:mean(durs)};

  /* temperature e medicine: dal primo giorno del periodo fino ad adesso */
  var temps=all.filter(function(e){return e.k==='temp'&&e.t>=from;}).map(function(e){return {t:e.t,c:e.c};}).reverse();
  var tmax=null;temps.forEach(function(x){if(tmax==null||x.c>tmax)tmax=x.c;});
  var byMed={},meds=[];
  all.forEach(function(e){if(e.k!=='med'||e.t<from)return;var n=API.medName(e);if(!byMed[n]){byMed[n]={name:n,n:0,last:e.t};meds.push(byMed[n]);}byMed[n].n++;if(e.t>byMed[n].last)byMed[n].last=e.t;});
  meds.sort(function(a,b){return b.n-a.n||(a.name<b.name?-1:1);});

  /* visite: fatte nel periodo, in programma da adesso */
  var ap=API.appts(),done=[],next=[];
  ap.forEach(function(e){var row={t:e.t,kind:API.apptKind(e.kind),title:e.title||'',place:e.place||'',note:e.note||''};if(e.done){if(e.t>=from)done.push(row);}else if(e.t>=now-2*H&&next.length<MAX_NEXT)next.push(row);});

  /* misure: le ultime 5 di sempre, percentile OMS all'età della misura */
  var ms=API.measures().filter(function(e){return e.t<=now;}).slice(-MAX_MEASURES).map(function(e){
    var a=API.ageDaysAt(e.t);
    return {t:e.t,age:weeksAt(e.t),w:e.w!=null?e.w:null,l:e.l!=null?e.l:null,pw:e.w!=null&&a!=null?API.pctOf('wfa',a,e.w/1000):null,pl:e.l!=null&&a!=null?API.pctOf('lhfa',a,e.l):null};
  });
  var withW=ms.filter(function(m){return m.w!=null;}),wGain=null;
  if(withW.length>=2){var a1=withW[withW.length-2],a2=withW[withW.length-1];wGain={g:a2.w-a1.w,days:Math.round((a2.t-a1.t)/DAY)};}

  return {days:days,now:now,from:from,to:to,partial:partial,covered:covered,hasData:covered>0,
    head:{name:API.settings().name||'Alan',birth:birthLabel(),age:ageAt(now),date:dmy(now)+' '+API.fmtTime(now)},
    measures:ms,wGain:wGain,feeds:feeds,sleep:sleep,diapers:diapers,cries:cries,temps:temps,tempMax:tmax,meds:meds,appts:{done:done,next:next}};
}

/* ---------- modello delle sezioni: una sola fonte per html e testo ----------
   sezione = {title, note?, empty?, blocks:[{sub?, head?, rows:[[celle]]}]}; un blocco con head è una tabella, senza head
   una lista chiave → valore (2 celle). Le celle sono testo semplice (l'escape lo fa chi disegna). */
function periodLine(r){
  if(r.partial)return 'solo oggi, dalle 00:00 alle '+API.fmtTime(r.now)+' (il diario è cominciato oggi)';
  var s='ultimi '+plural(r.days,'giorno','giorni')+' (dal '+dm(r.from)+' al '+dm(r.to-1)+')';
  if(r.covered&&r.covered<r.days)s+=', '+plural(r.covered,'giorno con il diario','giorni con il diario');
  return s;
}
function sections(r){
  var out=[],f=r.feeds,s=r.sleep,d=r.diapers,c=r.cries;
  /* misure */
  var mrows=r.measures.map(function(m){return [API.fmtDate(m.t),m.age,m.w!=null?API.METRICS.w.fmt(m.w)+' ('+ord(m.pw)+')':'—',m.l!=null?API.METRICS.l.fmt(m.l)+' ('+ord(m.pl)+')':'—'];});
  out.push({title:'Misure',id:'misure',note:mrows.length?'In parentesi il percentile OMS 2006 (maschi) all\'età della misura'+(r.wGain?'. Ultimo peso: '+(r.wGain.g>=0?'+':'−')+Math.abs(r.wGain.g)+' g in '+plural(r.wGain.days,'giorno','giorni'):'')+'.':null,
    empty:'Nessuna misura registrata.',blocks:mrows.length?[{head:['Data','Età','Peso','Lunghezza'],rows:mrows}]:[]});
  /* pappe */
  var frows=[];
  if(f.n){
    frows.push(['Pappe al giorno',dec1(f.perDay)+' (in tutto '+f.n+')']);
    if(f.mlPerDay!=null)frows.push(['Latte al biberon al giorno',Math.round(f.mlPerDay)+' ml']);
    if(f.mlPerFeed!=null)frows.push(['Per biberon',Math.round(f.mlPerFeed)+' ml, su '+plural(f.biberon,'biberon','biberon')]);
    if(f.gap!=null)frows.push(['Intervallo medio',fmtH(f.gap)]);
    if(f.refused)frows.push(['Biberon rifiutati',String(f.refused)]);
  }
  out.push({title:'Pappe',id:'pappe',empty:'Nessuna pappa registrata nel periodo.',blocks:frows.length?[{rows:frows}]:[]});
  /* sonno */
  var srows=[];
  if(s.nights)srows.push(['Notte (22–7), in media',fmtH(s.nightMean)+' su '+plural(s.nights,'notte','notti')]);
  if(s.naps)srows.push(['Pisolini al giorno',dec1(s.napsPerDay)+', di '+fmtH(s.napMean)+' l\'uno']);
  if(s.daysRec)srows.push(['Sonno nelle 24 ore, in media',fmtH(s.dayMean)+' su '+plural(s.daysRec,'giorno','giorni')]);
  out.push({title:'Sonno',id:'sonno',note:srows.length?'Conta solo il sonno segnato con Nanna e Sveglio.':null,empty:'Nessuna nanna registrata nel periodo.',blocks:srows.length?[{rows:srows}]:[]});
  /* cambi */
  var drows=[];
  if(d.n){drows.push(['Cambi al giorno',dec1(d.perDay)+' (in tutto '+d.n+')']);drows.push(['Con pipì, al giorno',dec1(d.wetPerDay)]);drows.push(['Con cacca, al giorno',dec1(d.pooPerDay)]);}
  out.push({title:'Cambi',id:'cambi',empty:'Nessun cambio registrato nel periodo.',blocks:drows.length?[{rows:drows}]:[]});
  /* pianti */
  var crows=[],cause=[];
  if(c.n){
    crows.push(['Pianti al giorno',dec1(c.perDay)+' (in tutto '+c.n+')']);
    if(c.durMean!=null)crows.push(['Durata media registrata',API.fmtSec(c.durMean)]);
    if(c.unlabeled)crows.push(['Senza spiegazione',String(c.unlabeled)]);
    c.causes.forEach(function(x){cause.push([x.label.charAt(0).toUpperCase()+x.label.slice(1),x.n+' ('+x.pct+'%)']);});
  }
  var cblocks=[];if(crows.length)cblocks.push({rows:crows});if(cause.length)cblocks.push({sub:'Cosa voleva, sui '+plural(c.labeled,'pianto spiegato','pianti spiegati'),rows:cause});
  out.push({title:'Pianti',id:'pianti',empty:'Nessun pianto registrato nel periodo.',blocks:cblocks});
  /* temperature */
  var trows=r.temps.map(function(x){return [API.fmtDate(x.t)+' '+API.fmtTime(x.t),API.fmtTemp(x.c)];});
  out.push({title:'Temperature',id:'temperature',note:trows.length>1?'La più alta: '+API.fmtTemp(r.tempMax)+'.':null,empty:'Nessuna temperatura registrata nel periodo.',blocks:trows.length?[{list:true,rows:trows}]:[]});
  /* medicine */
  var mdrows=r.meds.map(function(m){return [m.name,plural(m.n,'volta','volte')+', l\'ultima '+API.fmtDate(m.last)];});
  out.push({title:'Medicine',id:'medicine',empty:'Nessuna medicina registrata nel periodo.',blocks:mdrows.length?[{list:true,rows:mdrows}]:[]});
  /* visite */
  var vrow=function(a){var bits=[a.kind];if(a.title&&a.title!==a.kind)bits.push(a.title);if(a.place)bits.push(a.place);if(a.note)bits.push(a.note);return bits.join(' · ');};
  var vblocks=[];
  if(r.appts.done.length)vblocks.push({sub:'Fatte',list:true,rows:r.appts.done.map(function(a){return [API.fmtDate(a.t),vrow(a)];})});
  if(r.appts.next.length)vblocks.push({sub:'In programma',list:true,rows:r.appts.next.map(function(a){return [API.fmtDate(a.t)+' '+API.fmtTime(a.t),vrow(a)];})});
  out.push({title:'Visite e vaccini',id:'visite',empty:'Nessuna visita registrata.',blocks:vblocks});
  return out;
}

/* ---------- testo (condivisione) ---------- */
function text(days,now){
  var r=compute(days,now),L=[];
  L.push(r.head.name.toUpperCase()+' — RIEPILOGO PER IL PEDIATRA');
  L.push((r.head.birth?'Nato il '+r.head.birth:'')+(r.head.birth&&r.head.age?' · ':'')+r.head.age);
  L.push('Riepilogo del '+r.head.date+' · '+periodLine(r));
  sections(r).forEach(function(s){
    L.push('');L.push(s.title.toUpperCase());
    if(!s.blocks.length){L.push(s.empty);}
    s.blocks.forEach(function(b){
      if(b.sub)L.push(b.sub+':');
      b.rows.forEach(function(row){L.push(b.head?row.join(' · '):row[0]+': '+row[1]);});
    });
    if(s.note)L.push(s.note);
  });
  L.push('');L.push('Dati registrati dai genitori con l\'app Alan. Nessuna valutazione: i numeri sono quelli del diario.');
  return L.join('\n');
}

/* ---------- html ---------- */
function chips(cur){
  return '<div class="chips rp-chips">'+PERIODS.map(function(p){return '<button class="'+(p===cur?'on':'')+'" onclick="AlanExt.report.setPeriod('+p+')">'+p+' giorni</button>';}).join('')+'</div>';
}
function block(b){
  var h='';
  if(b.sub)h+='<div class="rp-sub2">'+API.esc(b.sub)+'</div>';
  if(b.head){
    h+='<table class="rp-t"><thead><tr>'+b.head.map(function(c){return '<th>'+API.esc(c)+'</th>';}).join('')+'</tr></thead><tbody>';
    b.rows.forEach(function(row){h+='<tr>'+row.map(function(c,i){return '<td'+(i===0?' class="d"':'')+'>'+API.esc(c)+'</td>';}).join('')+'</tr>';});
    h+='</tbody></table>';
  }else{
    h+='<div class="rp-kv'+(b.list?' rp-list':'')+'">'+b.rows.map(function(row){return '<div>'+API.esc(row[0])+'</div><div>'+API.esc(row[1])+'</div>';}).join('')+'</div>';
  }
  return h;
}
function page(r){
  var h='<div class="bar">'+API.backBtn()+'<div class="title">Per il pediatra</div></div>';
  h+=chips(r.days);
  h+='<div class="rp-page" id="rpPage">';
  h+='<div class="rp-head"><div class="rp-name">'+API.esc(r.head.name)+'</div>';
  h+='<div class="rp-sub">'+(r.head.birth?'nato il '+API.esc(r.head.birth):'')+(r.head.birth&&r.head.age?' · ':'')+API.esc(r.head.age)+'</div>';
  h+='<div class="rp-sub">Riepilogo del '+API.esc(r.head.date)+'<br>'+API.esc(periodLine(r))+'</div></div>';
  if(!r.hasData)h+='<p class="hint rp-none">Il diario non ha ancora voci in questo periodo: le medie compaiono dopo i primi giorni registrati. Misure e visite, se ci sono, sono qui sotto.</p>';
  sections(r).forEach(function(s){
    h+='<section class="rp-sec" id="rp-'+s.id+'"><h3>'+API.esc(s.title)+'</h3>';
    if(!s.blocks.length)h+='<p class="rp-none">'+API.esc(s.empty)+'</p>';
    s.blocks.forEach(function(b){h+=block(b);});
    if(s.note)h+='<p class="rp-note">'+API.esc(s.note)+'</p>';
    h+='</section>';
  });
  h+='<p class="rp-foot">Dati registrati dai genitori con l\'app Alan. Nessuna valutazione: i numeri sono quelli del diario.</p>';
  h+='</div>';
  h+='<div class="rp-acts"><button class="btn" onclick="AlanExt.report.print()">Stampa o salva PDF</button><button class="btn ghost" onclick="AlanExt.report.share(this)">Condividi come testo</button></div>';
  h+='<p class="hint rp-hint">Su iPhone, dalla stampa scegli «Salva in File» o condividi il PDF. Se la stampa non parte, «Condividi come testo» manda lo stesso riepilogo in un messaggio.</p>';
  return h;
}
function render(flow){var d=flow.data||{};return page(compute(d.days||period(),d.now||Date.now()));}
/* now è facoltativo (i test fissano l'istante); nell'app vale adesso */
function open(days,now){days=Number(days);if(PERIODS.indexOf(days)<0)days=period();var data={days:days};if(now)data.now=now;window.A.flow('report',null,data);}
/* ridisegna il riepilogo aperto (dopo un salvataggio o un merge dall'altro telefono) */
function redraw(){var f=API.flow();if(!f||f.type!=='report')return;var el=API.q('#screenInner');if(el)el.innerHTML=render(f);}

/* ---------- stampa e condivisione ---------- */
function print(){
  if(typeof window.print!=='function'){API.toast('La stampa non è disponibile qui: usa «Condividi come testo»');return false;}
  try{document.body.classList.add('rp-print');}catch(e){}
  try{window.print();}catch(e){API.toast('La stampa non è partita: usa «Condividi come testo»');unmark();return false;}
  /* app installata su iPhone: la finestra di stampa a volte non si apre; il testo condiviso è la via sicura */
  try{if(API.isStandalone()&&/iPhone|iPad|iPod/.test(navigator.userAgent||''))API.toast('Se la stampa non si apre, usa «Condividi come testo»');}catch(e){}
  return true;
}
function unmark(){try{document.body.classList.remove('rp-print');}catch(e){}}
function currentDays(){var f=API.flow();return f&&f.type==='report'&&f.data&&f.data.days?f.data.days:period();}
function share(btn){
  var f=API.flow(),txt=text(currentDays(),f&&f.data&&f.data.now?f.data.now:Date.now());
  var title='Riepilogo per il pediatra · '+(API.settings().name||'Alan');
  var nav=typeof navigator!=='undefined'?navigator:{};
  if(typeof nav.share==='function'){
    API.busy(btn,true,'Condivido…');
    var done=function(){API.busy(btn,false);};
    try{nav.share({title:title,text:txt}).then(done,done);}catch(e){done();return copy(txt);}
    return 'share';
  }
  return copy(txt);
}
function copy(txt){
  var nav=typeof navigator!=='undefined'?navigator:{};
  if(nav.clipboard&&typeof nav.clipboard.writeText==='function'){
    nav.clipboard.writeText(txt).then(function(){API.toast('Testo copiato: incollalo in un messaggio al pediatra');},function(){API.toast('Non riesco a copiare il testo su questo telefono');});
    return 'clipboard';
  }
  API.toast('Condivisione non disponibile su questo telefono');
  return 'none';
}

/* ---------- Altro ---------- */
function card(){
  var p=period();
  var h='<div class="card rp-card"><h3>Per il pediatra</h3>';
  h+='<p class="hint">Misure con percentile, pappe, sonno, cambi, pianti, temperature, medicine e visite in una pagina: da stampare, salvare in PDF o mandare come testo.</p>';
  h+=chips(p);
  h+='<button class="btn" onclick="AlanExt.report.open('+p+')">Prepara il riepilogo ('+p+' giorni)</button></div>';
  return h;
}

X.flow('report',{render:render,finish:function(flow,val){if(val==='print')print();else if(val==='share')share();return false;}});
X.slot('altro',function(){return card();});
X.on('change',function(){try{redraw();}catch(e){}});
try{window.addEventListener('afterprint',unmark);}catch(e){}
X.report={KEY:KEY,PERIODS:PERIODS,compute:compute,text:text,sections:sections,page:page,render:render,card:card,open:open,redraw:redraw,period:period,setPeriod:setPeriod,print:print,share:share,copy:copy,ageAt:ageAt,dec1:dec1,sleepSpans:sleepSpans};
X.refresh();
})();
