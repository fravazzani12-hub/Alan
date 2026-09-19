/* Estensione "stats": la tab Pattern leggibile a colpo d'occhio (slot 'stats', per primo). Quattro schede, SVG inline
   responsive (viewBox largo 360, classi .gc .grid .lbl del grafico di crescita, colori solo dai token via --hc):
   1. La settimana: quattro riquadri (pappe, sonno di notte, cambi, pianti) con la media dei 7 giorni interi e una
      linea di andamento giorno per giorno.
   2. Pappa: "Quando mangia" = una riga per giorno sulle 24 ore, le pappe come barrette (più alte = più ml), le nanne
      segnate come fasce azzurre, la notte 22–7 in ombra; "Le ore delle pappe" = profilo delle 24 ore sui 7 giorni con
      i momenti abituali evidenziati; "Quanto beve" = ml al giorno, media sui giorni interi.
   3. Nanna: ore dormite per notte (22–7) nelle ultime 7 notti complete, media sulle notti con sonno segnato.
   4. Pannolini: pipì e cacca al giorno, divisi per quantità (poca/normale/tanta).
   Marche sottili, griglia solida e leggera, etichette solo dove servono (massimo, oggi), tocco su una barra = toast
   con il dettaglio. Solo calcoli sugli eventi (nessuno stato proprio), letture fattuali: mai giudizi. Calcoli su AlanExt.stats. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var MIN=API.MIN,H=API.H,DAY=864e5;
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
/* ora decimale → "2", "13:30" (al mezz'ora) */
function fmtClock(h){var m=Math.round(h*2)/2;m=((m%24)+24)%24;var hh=Math.floor(m),mm=m-hh;return mm?hh+':30':String(hh);}
function jsq(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,'\\\'');}
function say(text){API.toast(text);}

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
    var start=at(now,-i,0),end=i?at(now,-i+1,0):now+1;
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
/* Ultimi 7 giorni dal più vecchio a oggi: pappe (ora decimale 0–24, ml), pianti, nanne segnate come intervalli in ore
   [a,b] ritagliati sulla giornata. perDay = media sui giorni interi con pappe (o su oggi se è l'unico); meanGap = intervallo
   medio fra pappe consecutive nella finestra, fra 30 min e 8 h. */
function feedTimes(now){
  now=now||Date.now();
  var ev=API.sorted(),spans=sleepSpans(ev,now),list=[],all=[],nCries=0,maxMl=0;
  for(var i=6;i>=0;i--){
    var start=at(now,-i,0),end=i?at(now,-i+1,0):now+1,dayEnd=at(now,-i+1,0);
    var feeds=[],cries=[],sleeps=[];
    ev.forEach(function(e){if(e.t<start||e.t>=end)return;if(e.k==='feed'){feeds.push({t:e.t,h:hourOf(e.t),ml:e.ml||0,fed:API.fedFeed(e)});if(e.ml>maxMl)maxMl=e.ml;}else if(e.k==='cry')cries.push({t:e.t,h:hourOf(e.t)});});
    spans.forEach(function(p){var a=Math.max(p[0],start),b=Math.min(p[1],end);if(b>a)sleeps.push([(a-start)/H,(b-start)/H]);});
    list.push({start:start,end:end,dayEnd:dayEnd,label:dayName(start,now),feeds:feeds,cries:cries,sleeps:sleeps,partial:!i});
    nCries+=cries.length;
  }
  ev.forEach(function(e){if(e.t>=list[0].start&&e.t<=now&&API.fedFeed(e))all.push(e.t);});
  var gaps=[];for(var j=1;j<all.length;j++){var g=(all[j]-all[j-1])/H;if(g>0.5&&g<8)gaps.push(g);}
  var full=list.filter(function(d){return !d.partial&&d.feeds.some(function(f){return f.fed;});});
  if(!full.length&&list[6].feeds.some(function(f){return f.fed;}))full=[list[6]];
  return {days:list,nFeeds:all.length,nCries:nCries,maxMl:maxMl,perDay:full.length?API.mean(full.map(function(d){return d.feeds.filter(function(f){return f.fed;}).length;})):null,meanGap:gaps.length?API.mean(gaps)*H:null};
}
/* Profilo delle 24 ore: quante pappe (ml > 0) in ogni mezz'ora sui 7 giorni, e la versione lisciata (media mobile su 3) */
function histogram(now){
  var ft=feedTimes(now),bins=[],sm=[],i;
  for(i=0;i<48;i++)bins.push(0);
  ft.days.forEach(function(d){d.feeds.forEach(function(f){if(f.fed)bins[Math.min(47,Math.floor(f.h*2))]++;});});
  for(i=0;i<48;i++)sm.push((bins[(i+47)%48]+bins[i]+bins[(i+1)%48])/3);
  return {bins:bins,smooth:sm,n:ft.nFeeds};
}
/* I momenti abituali: le pappe (ml > 0) dei 7 giorni raggruppate per ora (un gruppo nuovo quando il salto supera 1,5 h,
   con il giro della mezzanotte); un gruppo vale se ha almeno 2 pappe e almeno il 40% dei giorni con pappe. */
function usual(now){
  var ft=feedTimes(now),hs=[],daysN=0;
  ft.days.forEach(function(d){var any=false;d.feeds.forEach(function(f){if(f.fed){hs.push(f.h);any=true;}});if(any)daysN++;});
  hs.sort(function(a,b){return a-b;});
  if(hs.length<2)return {times:[],daysN:daysN,n:hs.length};
  var cl=[],cur=[hs[0]],i;
  for(i=1;i<hs.length;i++){if(hs[i]-hs[i-1]>1.5){cl.push(cur);cur=[];}cur.push(hs[i]);}
  cl.push(cur);
  if(cl.length>1){var first=cl[0],last=cl[cl.length-1];if(24-last[last.length-1]+first[0]<=1.5){cl.pop();cl.shift();cl.push(last.concat(first.map(function(h){return h+24;})));}}
  var need=Math.max(2,Math.ceil(daysN*0.4)),times=[];
  cl.forEach(function(c){if(c.length<need)return;var m=API.mean(c)%24;times.push({h:m,n:c.length});});
  times.sort(function(a,b){return a.h-b.h;});
  return {times:times,daysN:daysN,n:hs.length};
}
/* Ultimi 7 giorni dal più vecchio a oggi: cambi e, per pipì e cacca, quanti con poca/normale/tanta (i valori vecchi si
   normalizzano con API.lvlKey). La media è sui giorni interi con almeno un cambio; se esiste solo oggi, su oggi. */
function diapersPerDay(now){
  now=now||Date.now();
  var ev=API.sorted(),list=[],tot={pipi:{poca:0,normale:0,tanta:0,tot:0},cacca:{poca:0,normale:0,tanta:0,tot:0}},n=0;
  var blank=function(){return {poca:0,normale:0,tanta:0,tot:0};};
  for(var i=6;i>=0;i--){
    var start=at(now,-i,0),end=i?at(now,-i+1,0):now+1,d={start:start,end:end,label:dayName(start,now),partial:!i,n:0,pipi:blank(),cacca:blank()};
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
/* La settimana in numeri: per ciascuno degli ultimi 7 giorni pappe, ml, cambi, cacca, pianti, rigurgiti; medie sui giorni
   interi con almeno una voce di diario (o su oggi se è l'unico); notti da nights(). */
function week(now){
  now=now||Date.now();
  var ev=API.sorted(),list=[],any=false;
  for(var i=6;i>=0;i--){
    var start=at(now,-i,0),end=i?at(now,-i+1,0):now+1,d={label:dayName(start,now),partial:!i,feeds:0,ml:0,diapers:0,poo:0,cries:0,rig:0,rigFeed:0,events:0};
    ev.forEach(function(e){
      if(e.t<start||e.t>=end||e.k==='appt'||e.k==='measure')return;
      d.events++;
      if(API.fedFeed(e)){d.feeds++;d.ml+=e.ml;}
      else if(e.k==='diaper'){d.diapers++;if(API.lvlKey(e.cacca)!=='no')d.poo++;}
      else if(e.k==='cry')d.cries++;
      else if(e.k==='other'&&e.what==='rigurgito'){d.rig++;if(ev.some(function(f){return f.k==='feed'&&e.t-f.t>=0&&e.t-f.t<=30*MIN;}))d.rigFeed++;}
    });
    if(d.events)any=true;list.push(d);
  }
  var full=list.filter(function(d){return !d.partial&&d.events>0;});
  if(!full.length&&list[6].events)full=[list[6]];
  var avg=function(k){return full.length?API.mean(full.map(function(d){return d[k];})):null;};
  var sum=function(k){return list.reduce(function(s,d){return s+d[k];},0);};
  var ng=nights(now);
  return {days:list,any:any,daysUsed:full.length,feedsPerDay:avg('feeds'),mlPerDay:avg('ml'),diapersPerDay:avg('diapers'),pooPerDay:avg('poo'),criesPerDay:avg('cries'),
    cries:sum('cries'),rig:sum('rig'),rigFeed:sum('rigFeed'),nightMean:ng.mean,nightsRec:ng.recorded,nights:ng.nights,today:list[6]};
}

/* ---------- disegno ---------- */
function topRound(x,y,w,h,r){r=Math.min(r,h/2,w/2);if(h<=0)return '';return 'M'+f1(x)+' '+f1(y+h)+'V'+f1(y+r)+'Q'+f1(x)+' '+f1(y)+' '+f1(x+r)+' '+f1(y)+'H'+f1(x+w-r)+'Q'+f1(x+w)+' '+f1(y)+' '+f1(x+w)+' '+f1(y+r)+'V'+f1(y+h)+'Z';}
function tip(text){return '<title>'+API.esc(text)+'</title>';}
function tapAttr(text){return ' onclick="AlanExt.stats.say(\''+API.esc(jsq(text))+'\')" role="button" tabindex="0"';}
/* grafico a barre: items [{label,value,partial,rec,tip}], fmt(v) etichetta della barra, axis(v) etichette a sinistra,
   unit sopra l'asse, mean = riga sottile con "media N" a destra. Etichette solo su massimo, minimo e oggi (o l'ultimo);
   ogni barra ha il suo tooltip e il tap dice il valore. Barre ≤ 22 px, cima arrotondata, base piatta. */
function bars(o){
  var W=360,L=42,R=o.mean!=null?66:12,T=18,B=26,Hh=124+B,items=o.items,n=items.length;
  var max=0,imax=-1,imin=-1,vmin=Infinity;items.forEach(function(it,i){if(!it.rec)return;if(it.value>max){max=it.value;imax=i;}if(it.value<vmin){vmin=it.value;imin=i;}});if(o.mean!=null&&o.mean>max)max=o.mean;
  if(max<=0)max=o.minMax||1;max*=1.12;
  var ticks=API.niceTicks(0,max,3);
  var slot=(W-L-R)/n,bw=Math.min(22,slot*0.55);
  var sy=function(v){return T+(Hh-T-B)*(1-v/max);},sx=function(i){return L+slot*(i+0.5);};
  var h='<svg class="gc st-chart" viewBox="0 0 '+W+' '+Hh+'" style="--hc:'+o.color+'" role="img" aria-label="'+API.esc(o.aria)+'">';
  ticks.forEach(function(v){var y=sy(v);if(y<T-1)return;h+='<line class="grid" x1="'+L+'" y1="'+f1(y)+'" x2="'+(W-R)+'" y2="'+f1(y)+'"/><text class="lbl" x="'+(L-6)+'" y="'+f1(y+4)+'" text-anchor="end">'+API.esc(o.axis(v))+'</text>';});
  h+='<line class="grid st-base" x1="'+L+'" y1="'+f1(sy(0))+'" x2="'+(W-R)+'" y2="'+f1(sy(0))+'"/>';
  if(o.unit)h+='<text class="lbl" x="'+L+'" y="'+(T-8)+'">'+API.esc(o.unit)+'</text>';
  var last=-1;items.forEach(function(it,i){if(it.rec)last=i;});
  items.forEach(function(it,i){
    var x=sx(i),y0=sy(0),t=it.tip||(it.label+' · '+o.fmt(it.value));
    h+='<g'+tapAttr(t)+'>'+tip(t)+'<rect class="st-hit" x="'+f1(x-slot/2)+'" y="'+T+'" width="'+f1(slot)+'" height="'+f1(Hh-T-B)+'"/>';
    if(it.rec){
      var y=sy(it.value),hb=Math.max(0,y0-y);
      if(hb<2&&it.value>0)hb=2;
      h+='<path class="st-bar'+(it.partial?' part':'')+'" d="'+topRound(x-bw/2,y0-hb,bw,hb,4)+'"/>';
      if(it.value>0&&(i===imax||i===imin||it.partial||i===last))h+='<text class="st-val" x="'+f1(x)+'" y="'+f1(y0-hb-5)+'" text-anchor="middle">'+API.esc(o.fmt(it.value))+'</text>';
    }else h+='<text class="st-val none" x="'+f1(x)+'" y="'+f1(y0-6)+'" text-anchor="middle">—</text>';
    h+='<text class="lbl'+(it.partial?' st-now':'')+'" x="'+f1(x)+'" y="'+(Hh-B+16)+'" text-anchor="middle">'+API.esc(it.label)+'</text></g>';
  });
  if(o.mean!=null){var ym=sy(o.mean);h+='<line class="st-mean" x1="'+L+'" y1="'+f1(ym)+'" x2="'+(W-R)+'" y2="'+f1(ym)+'"/><text class="st-sub st-meanlbl" x="'+(W-R+5)+'" y="'+f1(ym+4)+'">media '+API.esc(o.fmt(o.mean))+'</text>';}
  return h+'</svg>';
}
/* barre impilate: items [{label,partial,segs:{poca,normale,tanta}}]; segmenti separati da 2 px di superficie, totale sopra
   il massimo e oggi; tap = dettaglio dei livelli */
function stacked(o){
  var W=360,L=30,R=o.mean!=null?66:12,T=18,B=26,Hh=106+B,items=o.items,n=items.length;
  var max=0,imax=-1;items.forEach(function(it,i){var v=it.segs.poca+it.segs.normale+it.segs.tanta;if(v>max){max=v;imax=i;}});if(o.mean!=null&&o.mean>max)max=o.mean;
  if(max<=0)max=1;max*=1.15;
  var ticks=API.niceTicks(0,max,3).filter(function(v){return v===Math.round(v);});
  var slot=(W-L-R)/n,bw=Math.min(22,slot*0.55);
  var sy=function(v){return T+(Hh-T-B)*(1-v/max);},sx=function(i){return L+slot*(i+0.5);};
  var h='<svg class="gc st-chart" viewBox="0 0 '+W+' '+Hh+'" style="--hc:'+o.color+'" role="img" aria-label="'+API.esc(o.aria)+'">';
  ticks.forEach(function(v){var y=sy(v);if(y<T-1)return;h+='<line class="grid" x1="'+L+'" y1="'+f1(y)+'" x2="'+(W-R)+'" y2="'+f1(y)+'"/><text class="lbl" x="'+(L-6)+'" y="'+f1(y+4)+'" text-anchor="end">'+v+'</text>';});
  h+='<line class="grid st-base" x1="'+L+'" y1="'+f1(sy(0))+'" x2="'+(W-R)+'" y2="'+f1(sy(0))+'"/>';
  items.forEach(function(it,i){
    var x=sx(i),y0=sy(0),acc=0,total=it.segs.poca+it.segs.normale+it.segs.tanta,bits=[];
    API.LVL_ORDER.forEach(function(l){if(it.segs[l])bits.push(it.segs[l]+' '+API.LVL[l]);});
    var t=it.label+' · '+total+(bits.length?' ('+bits.join(', ')+')':'');
    h+='<g'+tapAttr(t)+'>'+tip(t)+'<rect class="st-hit" x="'+f1(x-slot/2)+'" y="'+T+'" width="'+f1(slot)+'" height="'+f1(Hh-T-B)+'"/>';
    API.LVL_ORDER.forEach(function(l){
      var v=it.segs[l];if(!v)return;
      var y1=sy(acc),y2=sy(acc+v),top=acc+v>=total-1e-9;acc+=v;
      var gap=acc-v>0?2:0;
      if(top)h+='<path class="st-seg '+l+(it.partial?' part':'')+'" d="'+topRound(x-bw/2,y2,bw,Math.max(1,y1-y2-gap),4)+'"/>';
      else h+='<rect class="st-seg '+l+(it.partial?' part':'')+'" x="'+f1(x-bw/2)+'" y="'+f1(y2)+'" width="'+f1(bw)+'" height="'+f1(Math.max(1,y1-y2-gap))+'"/>';
    });
    if(total&&(i===imax||it.partial))h+='<text class="st-val" x="'+f1(x)+'" y="'+f1(sy(total)-5)+'" text-anchor="middle">'+total+'</text>';
    h+='<text class="lbl'+(it.partial?' st-now':'')+'" x="'+f1(x)+'" y="'+(Hh-B+16)+'" text-anchor="middle">'+API.esc(it.label)+'</text></g>';
  });
  if(o.mean!=null){var ym=sy(o.mean);h+='<line class="st-mean" x1="'+L+'" y1="'+f1(ym)+'" x2="'+(W-R)+'" y2="'+f1(ym)+'"/><text class="st-sub st-meanlbl" x="'+(W-R+5)+'" y="'+f1(ym+4)+'">media '+dec1(o.mean)+'</text>';}
  return h+'</svg>';
}
/* quando mangia: una riga per giorno (dal più vecchio a oggi), ore 0–24, notte 22–7 in ombra, nanne come fasce,
   pappe come barrette alte in proporzione ai ml (rifiutata = quadratino vuoto), segno sull'ora attuale nella riga di oggi */
function timeline(ft,now){
  var W=360,L=38,R=10,T=20,rowH=30,n=ft.days.length,Hh=T+rowH*n+4,maxMl=ft.maxMl||1;
  var sx=function(hr){return L+(W-L-R)*hr/24;},top=function(i){return T+rowH*i;};
  var h='<svg class="gc st-chart" viewBox="0 0 '+W+' '+Hh+'" style="--hc:var(--ch-fame)" role="img" aria-label="Quando mangia: pappe e nanne giorno per giorno sulle 24 ore">';
  h+='<rect class="st-night" x="'+f1(sx(0))+'" y="'+T+'" width="'+f1(sx(NIGHT_END)-sx(0))+'" height="'+(rowH*n)+'"/><rect class="st-night" x="'+f1(sx(NIGHT_START))+'" y="'+T+'" width="'+f1(sx(24)-sx(NIGHT_START))+'" height="'+(rowH*n)+'"/>';
  for(var hr=0;hr<=24;hr+=6){var x=sx(hr);h+='<line class="grid" x1="'+f1(x)+'" y1="'+T+'" x2="'+f1(x)+'" y2="'+(T+rowH*n)+'"/><text class="lbl" x="'+f1(x)+'" y="'+(T-7)+'" text-anchor="'+(hr===0?'start':(hr===24?'end':'middle'))+'">'+hr+'</text>';}
  ft.days.forEach(function(d,i){
    var y0=top(i),base=y0+rowH-5;
    h+='<line class="grid st-row" x1="'+L+'" y1="'+f1(base)+'" x2="'+(W-R)+'" y2="'+f1(base)+'"/>';
    h+='<text class="lbl'+(d.partial?' st-now':'')+'" x="'+(L-7)+'" y="'+f1(y0+rowH/2+4)+'" text-anchor="end">'+API.esc(d.label)+'</text>';
    d.sleeps.forEach(function(s){var w=Math.max(2,sx(s[1])-sx(s[0]));var t='Nanna '+d.label+' '+fmtClock(s[0])+' → '+fmtClock(s[1])+' · '+API.fmtDur((s[1]-s[0])*H);h+='<rect class="st-sleep" x="'+f1(sx(s[0]))+'" y="'+f1(y0+8)+'" width="'+f1(w)+'" height="'+(rowH-14)+'" rx="4"'+tapAttr(t)+'>'+tip(t)+'</rect>';});
    d.feeds.forEach(function(f){
      var x=sx(f.h),t='Pappa '+d.label+' '+API.fmtTime(f.t)+' · '+(f.fed?f.ml+' ml':'rifiutata');
      h+='<g'+tapAttr(t)+'>'+tip(t)+'<rect class="st-hit" x="'+f1(x-12)+'" y="'+f1(y0)+'" width="24" height="'+rowH+'"/>';
      if(f.fed){var hb=6+14*f.ml/maxMl;h+='<path class="st-feedbar" d="'+topRound(x-2.5,base-hb,5,hb,2)+'"/>';}
      else h+='<rect class="st-refused" x="'+f1(x-2.5)+'" y="'+f1(base-6)+'" width="5" height="5"/>';
      h+='</g>';
    });
    if(d.partial){var xn=sx(hourOf(Math.max(d.start,Math.min(now,d.end))));h+='<line class="st-nowline" x1="'+f1(xn)+'" y1="'+f1(y0+3)+'" x2="'+f1(xn)+'" y2="'+f1(base)+'"/>';}
  });
  return h+'</svg>';
}
/* le ore delle pappe: profilo lisciato delle 24 ore (area + linea) e i momenti abituali con l'ora scritta sopra */
function usualChart(hist,us){
  var W=360,L=14,R=14,T=22,B=22,Hh=70+B,max=0,i;
  hist.smooth.forEach(function(v){if(v>max)max=v;});if(max<=0)max=1;
  var sx=function(hr){return L+(W-L-R)*hr/24;},sy=function(v){return T+(Hh-T-B)*(1-v/max);};
  var h='<svg class="gc st-chart" viewBox="0 0 '+W+' '+Hh+'" style="--hc:var(--ch-fame)" role="img" aria-label="Le ore delle pappe negli ultimi 7 giorni">';
  h+='<rect class="st-night" x="'+f1(sx(0))+'" y="'+T+'" width="'+f1(sx(NIGHT_END)-sx(0))+'" height="'+(Hh-T-B)+'"/><rect class="st-night" x="'+f1(sx(NIGHT_START))+'" y="'+T+'" width="'+f1(sx(24)-sx(NIGHT_START))+'" height="'+(Hh-T-B)+'"/>';
  for(var hr=0;hr<=24;hr+=6){var x=sx(hr);h+='<line class="grid" x1="'+f1(x)+'" y1="'+T+'" x2="'+f1(x)+'" y2="'+f1(Hh-B)+'"/><text class="lbl" x="'+f1(x)+'" y="'+(Hh-B+15)+'" text-anchor="'+(hr===0?'start':(hr===24?'end':'middle'))+'">'+hr+'</text>';}
  var pts=[];for(i=0;i<=48;i++){var v=hist.smooth[i%48];pts.push(f1(sx(i/2))+' '+f1(sy(v)));}
  h+='<path class="st-area" d="M'+f1(sx(0))+' '+f1(sy(0))+' L'+pts.join(' L')+' L'+f1(sx(24))+' '+f1(sy(0))+'Z"/><path class="st-line" d="M'+pts.join(' L')+'"/>';
  var lastX=-1e9,lift=0;
  us.times.forEach(function(t){
    var x=sx(t.h),y=sy(hist.smooth[Math.min(47,Math.floor(t.h*2))]),txt=fmtClock(t.h);
    lift=(x-lastX<34)?(lift?0:12):0;lastX=x;
    h+='<circle class="st-pk" cx="'+f1(x)+'" cy="'+f1(y)+'" r="4"/><text class="st-val" x="'+f1(x)+'" y="'+f1(T-6-lift)+'" text-anchor="middle">'+txt+'</text>';
  });
  return h+'</svg>';
}
/* linea di andamento per i riquadri della settimana: 7 valori (null = non registrato), ultimo punto evidenziato */
function sparkline(vals,partialLast){
  var W=100,Hh=26,n=vals.length,max=0,min=Infinity,pts=[],i;
  vals.forEach(function(v){if(v==null)return;if(v>max)max=v;if(v<min)min=v;});
  if(!isFinite(min))return '';
  if(max===min){max=min+1;min=Math.max(0,min-1);}
  var sx=function(i){return 4+(W-8)*i/(n-1);},sy=function(v){return 3+(Hh-6)*(1-(v-min)/(max-min));};
  var run=[];
  vals.forEach(function(v,i){if(v==null){if(run.length)pts.push(run);run=[];return;}run.push(f1(sx(i))+','+f1(sy(v)));});
  if(run.length)pts.push(run);
  var h='<svg class="st-spark" viewBox="0 0 '+W+' '+Hh+'" aria-hidden="true">';
  pts.forEach(function(r){if(r.length>1)h+='<polyline points="'+r.join(' ')+'"/>';});
  for(i=n-1;i>=0;i--)if(vals[i]!=null){h+='<circle cx="'+f1(sx(i))+'" cy="'+f1(sy(vals[i]))+'" r="3"'+(partialLast&&i===n-1?' class="part"':'')+'/>';break;}
  return h+'</svg>';
}

/* ---------- schede ---------- */
function tile(label,value,sub,spark){return '<div class="st-tile"><div class="st-tl">'+label+'</div><div class="st-tv">'+value+'</div><div class="st-ts">'+sub+'</div>'+spark+'</div>';}
function weekCard(now){
  now=now||Date.now();
  var w=week(now),name=API.esc((API.settings().name||'Alan')),h='<div class="card st-card"><h3>La settimana di '+name+'</h3>';
  if(!w.any)return h+'<p class="hint st-wait">Qui compaiono le medie della settimana (pappe, sonno di notte, cambi, pianti) dopo le prime voci registrate.</p></div>';
  var d=w.days,v=function(k){return d.map(function(x){return x[k];});};
  var full=d.filter(function(x){return !x.partial;});
  h+='<div class="st-kpi">';
  h+=tile('Pappe',w.feedsPerDay!=null?dec1(w.feedsPerDay)+' <small>al giorno</small>':'—',w.mlPerDay?Math.round(w.mlPerDay)+' ml al giorno':'',sparkline(v(w.mlPerDay?'ml':'feeds'),true));
  h+=tile('Sonno di notte',w.nightMean!=null?fmtH(w.nightMean):'—',w.nightsRec?'su '+plural(w.nightsRec,'notte segnata','notti segnate'):'nessuna nanna segnata',sparkline(w.nights.map(function(n){return n.rec?n.sleep/H:null;}),false));
  h+=tile('Cambi',w.diapersPerDay!=null?dec1(w.diapersPerDay)+' <small>al giorno</small>':'—',w.pooPerDay!=null?dec1(w.pooPerDay)+' con cacca':'',sparkline(v('diapers'),true));
  h+=tile('Pianti',w.criesPerDay!=null?dec1(w.criesPerDay)+' <small>al giorno</small>':'—',plural(w.cries,'pianto','pianti')+' in 7 giorni',sparkline(v('cries'),true));
  h+='</div>';
  var td=w.today;
  h+='<p class="st-read"><b>Oggi</b> '+plural(td.feeds,'pappa','pappe')+(td.ml?' ('+td.ml+' ml)':'')+' · '+plural(td.diapers,'cambio','cambi')+' · '+plural(td.cries,'pianto','pianti')+'</p>';
  h+='<p class="hint">Medie sui '+plural(w.daysUsed,'giorno intero','giorni interi')+' con qualcosa di registrato; oggi non entra nelle medie. La linea è l\'andamento giorno per giorno.</p>';
  return h+'</div>';
}
function usualText(us){
  if(!us.times.length)return '';
  var t=us.times.map(function(x){return fmtClock(x.h);});
  var s=t.length>1?t.slice(0,-1).join(', ')+' e '+t[t.length-1]:t[0];
  return 'di solito verso le '+s;
}
function feedCard(now){
  now=now||Date.now();
  var ft=feedTimes(now),h='<div class="card st-card"><h3>Pappa</h3>';
  if(!ft.nFeeds)return h+'<p class="hint st-wait">Qui vedrai a che ora mangia e quanto beve, giorno per giorno, dopo le prime pappe registrate.</p></div>';
  var us=usual(now),hist=histogram(now),mk=milkPerDay(now),w=week(now);
  h+='<h4 class="st-h4">Quando mangia</h4><div class="st-g">'+timeline(ft,now)+'</div>';
  h+='<p class="st-legend"><span class="st-k"><i class="bar"></i>pappa (più alta = più ml)</span><span class="st-k"><i class="band"></i>nanna</span><span class="st-k"><i class="night"></i>notte 22–7</span></p>';
  var bits=[];
  if(us.times.length)bits.push('<b>'+usualText(us)+'</b>');
  bits.push('in media '+plural(ft.perDay,'pappa','pappe',dec1(ft.perDay))+' al giorno');
  if(ft.meanGap!=null)bits.push('una ogni '+API.fmtDur(ft.meanGap));
  h+='<p class="st-read">'+bits.join(' · ')+'</p>';
  h+='<h4 class="st-h4">Le ore delle pappe <span class="hint">sui 7 giorni</span></h4><div class="st-g">'+usualChart(hist,us)+'</div>';
  if(mk.mode){
    h+='<h4 class="st-h4">Quanto beve</h4><div class="st-g">'+bars({items:mk.days.map(function(x){return {label:x.label,value:x.ml,rec:true,partial:x.partial,tip:x.label+' · '+x.ml+' ml in '+plural(x.n,'pappa','pappe')};}),color:'var(--ch-fame)',mean:mk.mean,minMax:100,
      fmt:function(v){return String(Math.round(v));},axis:function(v){return String(Math.round(v));},unit:'ml',aria:'Latte al giorno, ultimi 7 giorni'})+'</div>';
    h+='<p class="st-read"><b>in media '+Math.round(mk.mean)+' ml</b> al giorno, su '+plural(mk.daysUsed,'giorno','giorni')+'</p>';
  }
  if(w.rig)h+='<p class="st-read st-small">Rigurgiti: '+w.rig+' in 7 giorni, '+w.rigFeed+' entro 30 min da una pappa.</p>';
  h+='<p class="hint">Ogni riga è un giorno sulle 24 ore. Il profilo sotto somma i 7 giorni: le gobbe sono le ore in cui mangia di solito. Tocca una barra per il dettaglio.</p>';
  return h+'</div>';
}
function sleepCard(now){
  now=now||Date.now();
  var d=nights(now),h='<div class="card st-card"><h3>Nanna</h3>';
  if(!d.recorded)return h+'<p class="hint st-wait">Qui compare quanto ha dormito ogni notte, dalle 22 alle 7, dopo le prime nanne segnate con Nanna e Sveglio.</p></div>';
  h+='<h4 class="st-h4">Sonno per notte</h4><div class="st-g">'+bars({items:d.nights.map(function(n){return {label:n.label,value:n.sleep,rec:n.rec,tip:'notte di '+n.label+' · '+(n.rec?fmtH(n.sleep):'sonno non segnato')};}),color:'var(--c-sonno)',mean:d.mean,minMax:H,fmt:fmtH,axis:function(v){return Math.round(v/H)+' h';},aria:'Sonno per notte, ultime 7 notti'})+'</div>';
  h+='<p class="st-read"><b>in media '+API.fmtDur(d.mean)+'</b> a notte, su '+plural(d.recorded,'notte','notti')+(d.recorded<7?' con il sonno segnato':'')+'</p>';
  h+='<p class="hint">Ogni barra è una notte dalle 22 alle 7, sotto il giorno in cui è cominciata. Conta solo il sonno segnato con Nanna e Sveglio: "—" è una notte senza nanne segnate.</p>';
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
function render(now){now=now||Date.now();return weekCard(now)+feedCard(now)+sleepCard(now)+diaperCard(now);}

X.slot('stats',function(){return render();},-10);
X.stats={nights:nights,milkPerDay:milkPerDay,feedTimes:feedTimes,histogram:histogram,usual:usual,diapersPerDay:diapersPerDay,week:week,
  weekCard:weekCard,feedCard:feedCard,sleepCard:sleepCard,diaperCard:diaperCard,render:render,say:say,
  fmtH:fmtH,dec1:dec1,fmtClock:fmtClock,usualText:usualText,sleepSpans:sleepSpans,sparkline:sparkline};
X.refresh();
})();
