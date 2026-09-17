/* Estensione "stats": statistiche della settimana in Pattern (slot 'stats'), tre grafici SVG inline responsive
   (viewBox 360 di larghezza, stesse classi .gc .grid .lbl del grafico di crescita, colori dai token via --hc).
   1. Sonno per notte: ore dormite (Nanna → Sveglio) nelle ultime 7 notti complete, dalle 22 alle 7; media tratteggiata.
      Una notte senza sonno segnato non fa media e si vede come "—".
   2. Latte al giorno: ml dei biberon negli ultimi 7 giorni (oggi in corso, più chiaro, fuori dalla media).
   3. Quando mangia: una riga per giorno (dal più vecchio a oggi), un pallino per pappa sull'asse delle 24 ore,
      i pianti come tacche rosse, la notte 22–7 in ombra.
   4. Pannolini: due grafici (pipì e cacca), una barra per giorno con i cambi in cui c'era, divisa per quantità
      (poca chiara, normale media, tanta piena); media tratteggiata sui giorni interi.
   Solo calcoli sugli eventi (nessuno stato proprio), letture fattuali: mai giudizi. Calcoli esposti su AlanExt.stats. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var MIN=API.MIN,H=API.H;
var WD=['dom','lun','mar','mer','gio','ven','sab'];
var NIGHT_START=22,NIGHT_END=7;

/* ---------- date e formati ---------- */
function at(base,dOff,hour){var d=new Date(base);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+dOff,hour,0,0,0).getTime();}
function wd(t){return WD[new Date(t).getDay()];}
function dayName(t,now){var k=API.dayKey(t);if(k===API.dayKey(now))return 'oggi';if(k===API.dayKey(at(now,-1,12)))return 'ieri';return wd(t);}
function fmtH(ms){var m=Math.round(ms/MIN);if(m<1)return '0';var h=Math.floor(m/60),r=m%60;if(!h)return r+' min';return r?h+'h'+API.pad(r):h+' h';}
function hourOf(t){var d=new Date(t);return d.getHours()+d.getMinutes()/60;}
/* un decimale con la virgola, senza ",0" */
function dec1(x){var r=Math.round(x*10)/10;return String(r).replace('.',',');}
function plural(n,s,p,shown){return (shown!=null?shown:n)+' '+(n===1?s:p);}
function f1(x){return (Math.round(x*10)/10).toFixed(1);}

/* intervalli di sonno [a,b] dai tap Nanna/Sveglio; una nanna ancora aperta arriva fino ad adesso */
function sleepSpans(ev,now){
  var out=[],cur=null;
  ev.forEach(function(e){if(e.k==='sleep')cur=e.t;else if(e.k==='wake'&&cur!=null){if(e.t>cur)out.push([cur,e.t]);cur=null;}});
  if(cur!=null&&now>cur)out.push([cur,now]);
  return out;
}
function overlap(spans,a,b){var s=0;spans.forEach(function(p){var x=Math.max(p[0],a),y=Math.min(p[1],b);if(y>x)s+=y-x;});return s;}

/* ---------- calcoli ---------- */
/* Ultime 7 notti complete (22–7), dalla più vecchia all'ultima. La notte in corso non compare (la riassume la Home).
   rec = c'è sonno segnato nella finestra; la media è solo sulle notti rec. */
function nights(now){
  now=now||Date.now();
  var ev=API.sorted(),spans=sleepSpans(ev,now);
  var shift=at(now,0,NIGHT_END)>now?1:0,list=[];
  for(var i=6;i>=0;i--){
    var end=at(now,-i-shift,NIGHT_END),start=at(now,-i-shift-1,NIGHT_START);
    var inW=ev.filter(function(e){return e.t>=start&&e.t<=end;});
    var sleep=overlap(spans,start,end);
    var feeds=inW.filter(API.fedFeed).length,cries=inW.filter(function(e){return e.k==='cry';}).length;
    list.push({start:start,end:end,label:dayName(start,now),sleep:sleep,feeds:feeds,cries:cries,rec:sleep>0});
  }
  var rec=list.filter(function(n){return n.rec;});
  return {nights:list,recorded:rec.length,mean:rec.length?API.mean(rec.map(function(n){return n.sleep;})):null};
}
/* Ultimi 7 giorni dal più vecchio a oggi (in corso): ml dei biberon e numero di biberon. La media è sui giorni interi con
   almeno una pappa; se esiste solo oggi, su oggi. mode: 'ml' se c'è latte, altrimenti null. */
function milkPerDay(now){
  now=now||Date.now();
  var ev=API.sorted(),list=[];
  for(var i=6;i>=0;i--){
    var start=at(now,-i,0),end=i?at(now,-i+1,0):now;
    var f=ev.filter(function(e){return e.k==='feed'&&e.t>=start&&e.t<end;});
    var ml=0,n=0;
    f.forEach(function(e){if(e.ml>0){ml+=e.ml;n++;}});
    list.push({start:start,end:end,label:dayName(start,now),ml:ml,n:n,partial:!i});
  }
  var anyMl=list.some(function(d){return d.ml>0;});
  var mode=anyMl?'ml':null;
  var full=list.filter(function(d){return !d.partial&&d.ml>0;});
  if(!full.length&&list[6].ml>0)full=[list[6]];
  var avg=function(key){return full.length?API.mean(full.map(function(d){return d[key];})):null;};
  return {days:list,mode:mode,meanMl:anyMl?avg('ml'):null,mean:mode==='ml'?avg('ml'):null,daysUsed:full.length};
}
/* Ultimi 7 giorni dal più vecchio a oggi: pappe (ora decimale 0–24, sorgente, ml) e pianti. perDay = media sui giorni interi con
   pappe (o su oggi se è l'unico); meanGap = intervallo medio fra pappe consecutive nella finestra, fra 30 min e 8 h. */
function feedTimes(now){
  now=now||Date.now();
  var ev=API.sorted(),list=[],all=[],nCries=0;
  for(var i=6;i>=0;i--){
    var start=at(now,-i,0),end=i?at(now,-i+1,0):now;
    var feeds=[],cries=[];
    ev.forEach(function(e){if(e.t<start||e.t>=end)return;if(API.fedFeed(e))feeds.push({t:e.t,h:hourOf(e.t),ml:e.ml||0});else if(e.k==='cry')cries.push({t:e.t,h:hourOf(e.t)});});
    list.push({start:start,end:end,label:dayName(start,now),feeds:feeds,cries:cries,partial:!i});
    nCries+=cries.length;
  }
  ev.forEach(function(e){if(e.t>=list[0].start&&e.t<=now&&API.fedFeed(e))all.push(e.t);});
  var gaps=[];for(var j=1;j<all.length;j++){var g=(all[j]-all[j-1])/H;if(g>0.5&&g<8)gaps.push(g);}
  var full=list.filter(function(d){return !d.partial&&d.feeds.length;});
  if(!full.length&&list[6].feeds.length)full=[list[6]];
  return {days:list,nFeeds:all.length,nCries:nCries,perDay:full.length?API.mean(full.map(function(d){return d.feeds.length;})):null,meanGap:gaps.length?API.mean(gaps)*H:null};
}

/* Ultimi 7 giorni dal più vecchio a oggi: cambi e, per pipì e cacca, quanti con poca/normale/tanta (i valori vecchi si
   normalizzano con API.lvlKey). La media è sui giorni interi con almeno un cambio; se esiste solo oggi, su oggi. */
function diapersPerDay(now){
  now=now||Date.now();
  var ev=API.sorted(),list=[],tot={pipi:{poca:0,normale:0,tanta:0,tot:0},cacca:{poca:0,normale:0,tanta:0,tot:0}},n=0;
  var blank=function(){return {poca:0,normale:0,tanta:0,tot:0};};
  for(var i=6;i>=0;i--){
    var start=at(now,-i,0),end=i?at(now,-i+1,0):now,d={start:start,end:end,label:dayName(start,now),partial:!i,n:0,pipi:blank(),cacca:blank()};
    ev.forEach(function(e){
      if(e.k!=='diaper'||e.t<start||e.t>=end)return;
      d.n++;
      ['pipi','cacca'].forEach(function(k){var l=API.lvlKey(e[k]);if(l==='no')return;d[k][l]++;d[k].tot++;tot[k][l]++;tot[k].tot++;});
    });
    n+=d.n;list.push(d);
  }
  var full=list.filter(function(d){return !d.partial&&d.n>0;});
  if(!full.length&&list[6].n>0)full=[list[6]];
  var avg=function(f){return full.length?API.mean(full.map(f)):null;};
  return {days:list,n:n,pipi:tot.pipi,cacca:tot.cacca,daysUsed:full.length,
    perDay:avg(function(d){return d.n;}),wetPerDay:avg(function(d){return d.pipi.tot;}),pooPerDay:avg(function(d){return d.cacca.tot;})};
}

/* ---------- disegno ---------- */
/* grafico a barre: items [{label,sub,value,partial,rec}], fmt(v) etichetta sopra la barra, axis(v) etichette a sinistra,
   unit = unità scritta una volta sopra l'asse, mean = linea tratteggiata con "media" nel margine destro (mai sopra una barra).
   Le etichette dei valori hanno un alone del colore della superficie per restare leggibili sopra le barre. */
function bars(o){
  var W=360,L=44,R=o.mean!=null?38:14,T=20,B=o.sub?42:28,Hh=160+B,items=o.items,n=items.length;
  var max=0;items.forEach(function(it){if(it.rec&&it.value>max)max=it.value;});if(o.mean!=null&&o.mean>max)max=o.mean;
  if(max<=0)max=o.minMax||1;max*=1.12;
  var ticks=API.niceTicks(0,max,3);
  var slot=(W-L-R)/n,bw=Math.min(30,slot*0.62);
  var sy=function(v){return T+(Hh-T-B)*(1-v/max);},sx=function(i){return L+slot*(i+0.5);};
  var h='<svg class="gc st-chart" viewBox="0 0 '+W+' '+Hh+'" style="--hc:'+o.color+'" role="img" aria-label="'+API.esc(o.aria)+'">';
  ticks.forEach(function(v){var y=sy(v);if(y<T-1)return;h+='<line class="grid" x1="'+L+'" y1="'+f1(y)+'" x2="'+(W-R)+'" y2="'+f1(y)+'"/><text class="lbl" x="'+(L-6)+'" y="'+f1(y+4)+'" text-anchor="end">'+API.esc(o.axis(v))+'</text>';});
  h+='<line class="grid st-base" x1="'+L+'" y1="'+f1(sy(0))+'" x2="'+(W-R)+'" y2="'+f1(sy(0))+'"/>';
  if(o.unit)h+='<text class="lbl" x="'+L+'" y="'+(T-8)+'">'+API.esc(o.unit)+'</text>';
  items.forEach(function(it,i){
    var x=sx(i),y0=sy(0);
    if(it.rec){
      var y=sy(it.value),hb=Math.max(0,y0-y);
      if(hb<2&&it.value>0)hb=2;
      h+='<rect class="st-bar'+(it.partial?' part':'')+'" x="'+f1(x-bw/2)+'" y="'+f1(y0-hb)+'" width="'+f1(bw)+'" height="'+f1(hb)+'" rx="3"/>';
      h+='<text class="st-val" x="'+f1(x)+'" y="'+f1(y0-hb-5)+'" text-anchor="middle">'+API.esc(o.fmt(it.value))+'</text>';
    }else h+='<text class="st-val none" x="'+f1(x)+'" y="'+f1(y0-6)+'" text-anchor="middle">—</text>';
    h+='<text class="lbl'+(it.partial?' st-now':'')+'" x="'+f1(x)+'" y="'+(Hh-B+16)+'" text-anchor="middle">'+API.esc(it.label)+'</text>';
    if(o.sub&&it.sub)h+='<text class="st-sub" x="'+f1(x)+'" y="'+(Hh-B+31)+'" text-anchor="middle">'+API.esc(it.sub)+'</text>';
  });
  if(o.mean!=null){var ym=sy(o.mean);h+='<line class="st-mean" x1="'+L+'" y1="'+f1(ym)+'" x2="'+(W-R)+'" y2="'+f1(ym)+'"/><text class="st-sub st-meanlbl" x="'+(W-R+5)+'" y="'+f1(ym+4)+'">media</text>';}
  return h+'</svg>';
}
/* barre impilate: items [{label,partial,segs:{poca,normale,tanta}}]; ogni segmento ha la classe del suo livello (tonalità del
   colore --hc), il totale sta sopra la barra; mean = linea tratteggiata "media" */
function stacked(o){
  var W=360,L=30,R=o.mean!=null?38:14,T=18,B=26,Hh=118+B,items=o.items,n=items.length;
  var max=0;items.forEach(function(it){var v=it.segs.poca+it.segs.normale+it.segs.tanta;if(v>max)max=v;});if(o.mean!=null&&o.mean>max)max=o.mean;
  if(max<=0)max=1;max*=1.15;
  var ticks=API.niceTicks(0,max,3).filter(function(v){return v===Math.round(v);});
  var slot=(W-L-R)/n,bw=Math.min(30,slot*0.62);
  var sy=function(v){return T+(Hh-T-B)*(1-v/max);},sx=function(i){return L+slot*(i+0.5);};
  var h='<svg class="gc st-chart" viewBox="0 0 '+W+' '+Hh+'" style="--hc:'+o.color+'" role="img" aria-label="'+API.esc(o.aria)+'">';
  ticks.forEach(function(v){var y=sy(v);if(y<T-1)return;h+='<line class="grid" x1="'+L+'" y1="'+f1(y)+'" x2="'+(W-R)+'" y2="'+f1(y)+'"/><text class="lbl" x="'+(L-6)+'" y="'+f1(y+4)+'" text-anchor="end">'+v+'</text>';});
  h+='<line class="grid st-base" x1="'+L+'" y1="'+f1(sy(0))+'" x2="'+(W-R)+'" y2="'+f1(sy(0))+'"/>';
  items.forEach(function(it,i){
    var x=sx(i),y0=sy(0),acc=0,total=it.segs.poca+it.segs.normale+it.segs.tanta;
    API.LVL_ORDER.forEach(function(l){
      var v=it.segs[l];if(!v)return;
      var y1=sy(acc),y2=sy(acc+v);acc+=v;
      h+='<rect class="st-seg '+l+(it.partial?' part':'')+'" x="'+f1(x-bw/2)+'" y="'+f1(y2)+'" width="'+f1(bw)+'" height="'+f1(Math.max(1,y1-y2))+'"/>';
    });
    if(total)h+='<text class="st-val" x="'+f1(x)+'" y="'+f1(sy(total)-5)+'" text-anchor="middle">'+total+'</text>';
    else h+='<text class="st-val none" x="'+f1(x)+'" y="'+f1(y0-6)+'" text-anchor="middle">0</text>';
    h+='<text class="lbl'+(it.partial?' st-now':'')+'" x="'+f1(x)+'" y="'+(Hh-B+16)+'" text-anchor="middle">'+API.esc(it.label)+'</text>';
  });
  if(o.mean!=null){var ym=sy(o.mean);h+='<line class="st-mean" x1="'+L+'" y1="'+f1(ym)+'" x2="'+(W-R)+'" y2="'+f1(ym)+'"/><text class="st-sub st-meanlbl" x="'+(W-R+5)+'" y="'+f1(ym+4)+'">media</text>';}
  return h+'</svg>';
}
/* ritmo: una riga per giorno (dal più vecchio a oggi), ore 0–24 da sinistra a destra, notte (22–7) in ombra leggera */
function rhythm(ft,now){
  var W=360,L=40,R=12,T=22,rowH=26,n=ft.days.length,Hh=T+rowH*n+8;
  var sx=function(hr){return L+(W-L-R)*hr/24;},ry=function(i){return T+rowH*(i+0.5);};
  var h='<svg class="gc st-chart" viewBox="0 0 '+W+' '+Hh+'" style="--hc:var(--c-fame)" role="img" aria-label="Quando mangia: pappe e pianti giorno per giorno sulle 24 ore">';
  h+='<rect class="st-night" x="'+f1(sx(0))+'" y="'+T+'" width="'+f1(sx(NIGHT_END)-sx(0))+'" height="'+(rowH*n)+'"/><rect class="st-night" x="'+f1(sx(NIGHT_START))+'" y="'+T+'" width="'+f1(sx(24)-sx(NIGHT_START))+'" height="'+(rowH*n)+'"/>';
  for(var hr=0;hr<=24;hr+=3){var x=sx(hr);h+='<line class="grid" x1="'+f1(x)+'" y1="'+T+'" x2="'+f1(x)+'" y2="'+(T+rowH*n)+'"/>';if(hr%6===0)h+='<text class="lbl" x="'+f1(x)+'" y="'+(T-8)+'" text-anchor="'+(hr===0?'start':(hr===24?'end':'middle'))+'">'+hr+'</text>';}
  ft.days.forEach(function(d,i){
    var y=ry(i);
    h+='<line class="grid st-row" x1="'+L+'" y1="'+f1(y)+'" x2="'+(W-R)+'" y2="'+f1(y)+'"/>';
    h+='<text class="lbl'+(d.partial?' st-now':'')+'" x="'+(L-8)+'" y="'+f1(y+4)+'" text-anchor="end">'+API.esc(d.label)+'</text>';
    d.cries.forEach(function(c){var x=sx(c.h);h+='<line class="st-cry" x1="'+f1(x)+'" y1="'+f1(y-11)+'" x2="'+f1(x)+'" y2="'+f1(y-5)+'"/>';});
    d.feeds.forEach(function(f){h+='<circle class="st-feed" cx="'+f1(sx(f.h))+'" cy="'+f1(y+2)+'" r="5"/>';});
    if(d.partial){var xn=sx(hourOf(Math.max(d.start,Math.min(now,d.end))));h+='<line class="st-nowline" x1="'+f1(xn)+'" y1="'+f1(y-10)+'" x2="'+f1(xn)+'" y2="'+f1(y+11)+'"/>';}
  });
  return h+'</svg>';
}

/* ---------- schede ---------- */
function sleepCard(now){
  now=now||Date.now();
  var d=nights(now),h='<div class="card st-card"><h3>Sonno per notte</h3>';
  if(!d.recorded)return h+'<p class="hint st-wait">Qui compare quanto ha dormito ogni notte, dalle 22 alle 7, dopo le prime nanne segnate con Nanna e Sveglio.</p></div>';
  h+='<div class="st-g">'+bars({items:d.nights.map(function(n){return {label:n.label,value:n.sleep,rec:n.rec};}),color:'var(--c-sonno)',mean:d.mean,minMax:H,fmt:fmtH,axis:function(v){return Math.round(v/H)+' h';},aria:'Sonno per notte, ultime 7 notti'})+'</div>';
  h+='<p class="st-read"><b>in media '+API.fmtDur(d.mean)+'</b> a notte, su '+plural(d.recorded,'notte','notti')+(d.recorded<7?' con il sonno segnato':'')+'</p>';
  h+='<p class="hint">Ogni barra è una notte dalle 22 alle 7, sotto il giorno in cui è cominciata; la linea tratteggiata è la media. Conta solo il sonno segnato con Nanna e Sveglio: "—" è una notte senza nanne segnate.</p>';
  return h+'</div>';
}
function milkCard(now){
  now=now||Date.now();
  var d=milkPerDay(now),h='<div class="card st-card"><h3>Latte al giorno</h3>';
  if(!d.mode)return h+'<p class="hint st-wait">Qui compaiono i ml bevuti ogni giorno dopo le prime pappe registrate.</p></div>';
  h+='<div class="st-g">'+bars({items:d.days.map(function(x){return {label:x.label,value:x.ml,rec:true,partial:x.partial,sub:''};}),sub:false,color:'var(--c-fame)',mean:d.mean,minMax:100,
    fmt:function(v){return String(Math.round(v));},axis:function(v){return String(Math.round(v));},unit:'ml',aria:'Latte al giorno, ultimi 7 giorni'})+'</div>';
  var days=plural(d.daysUsed,'giorno','giorni');
  h+='<p class="st-read"><b>in media '+Math.round(d.mean)+' ml</b> al giorno, su '+days+'</p>';
  h+='<p class="hint">Barre = ml bevuti. Oggi è in corso (barra più chiara) e non entra nella media.</p>';
  return h+'</div>';
}
function feedCard(now){
  now=now||Date.now();
  var d=feedTimes(now),h='<div class="card st-card"><h3>Quando mangia</h3>';
  if(!d.nFeeds)return h+'<p class="hint st-wait">Qui vedrai a che ora mangia, giorno per giorno, dopo le prime pappe registrate.</p></div>';
  h+='<div class="st-g">'+rhythm(d,now)+'</div>';
  var bits=['<b>in media '+plural(d.perDay,'pappa','pappe',dec1(d.perDay))+'</b> al giorno'];
  if(d.meanGap!=null)bits.push('una ogni '+API.fmtDur(d.meanGap));
  if(d.nCries)bits.push(plural(d.nCries,'pianto','pianti')+' in 7 giorni');
  h+='<p class="st-read">'+bits.join(' · ')+'</p>';
  h+='<p class="st-legend"><span class="st-k"><i class="dot"></i>pappa</span><span class="st-k"><i class="tick"></i>pianto</span><span class="st-k"><i class="night"></i>notte 22–7</span></p>';
  return h+'</div>';
}
function lvlLine(t){var bits=[];API.LVL_ORDER.forEach(function(l){if(t[l])bits.push(t[l]+' '+API.LVL[l]);});return bits.join(' · ');}
function diaperCard(now){
  now=now||Date.now();
  var d=diapersPerDay(now),h='<div class="card st-card"><h3>Pannolini</h3>';
  if(!d.n)return h+'<p class="hint st-wait">Qui compaiono, giorno per giorno, i cambi con pipì e con cacca e quanta ne ha fatta, dopo i primi pannolini registrati.</p></div>';
  var days=plural(d.daysUsed,'giorno','giorni');
  h+='<p class="st-read"><b>in media '+plural(d.perDay,'cambio','cambi',dec1(d.perDay))+'</b> al giorno, su '+days+'</p>';
  [['pipi','Pipì',d.wetPerDay,'var(--c-sonno)'],['cacca','Cacca',d.pooPerDay,'var(--c-cambio)']].forEach(function(r){
    var k=r[0],t=d[k];
    h+='<h4 class="st-h4">'+r[1]+'</h4><div class="st-g">'+stacked({items:d.days.map(function(x){return {label:x.label,partial:x.partial,segs:x[k]};}),color:r[3],mean:r[2],aria:r[1]+' al giorno, ultimi 7 giorni, per quantità'})+'</div>';
    h+='<p class="st-read">'+(r[2]!=null?'<b>'+dec1(r[2])+' al giorno</b>':'<b>0 al giorno</b>')+(t.tot?' · '+lvlLine(t)+' in 7 giorni':'')+'</p>';
  });
  h+='<p class="st-legend"><span class="st-k"><i class="lv poca"></i>poca</span><span class="st-k"><i class="lv normale"></i>normale</span><span class="st-k"><i class="lv tanta"></i>tanta</span></p>';
  h+='<p class="hint">Ogni barra è un giorno: i cambi in cui c\'era pipì o cacca, divisi per quanta ne ha fatta. Oggi è in corso (barra più chiara) e non entra nella media. Solo conteggi, nessuna soglia.</p>';
  return h+'</div>';
}
function render(now){now=now||Date.now();return sleepCard(now)+milkCard(now)+feedCard(now)+diaperCard(now);}

X.slot('stats',function(){return render();});
X.stats={nights:nights,milkPerDay:milkPerDay,feedTimes:feedTimes,diapersPerDay:diapersPerDay,sleepCard:sleepCard,milkCard:milkCard,feedCard:feedCard,diaperCard:diaperCard,render:render,fmtH:fmtH,dec1:dec1,sleepSpans:sleepSpans};
X.refresh();
})();
