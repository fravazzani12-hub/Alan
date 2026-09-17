/* predict — previsione della prossima nanna, del prossimo risveglio e della prossima pappa.
   Estensione: non tocca app.js. Home (in alto): una riga per la nanna/il risveglio e una per la pappa.
   Pattern: "Ritmo di Alan" (veglia e intervallo pappe degli ultimi 7 giorni contro la norma per età).
   Metodo (SPEC §2 e §5): media delle osservazioni reali degli ultimi 7 giorni, con almeno 4 osservazioni;
   tra 4 e 10 osservazioni la media è mescolata con la norma per età (70% Alan / 30% norma); sotto le 4 vale la norma. */
(function(){'use strict';
var X=window.AlanExt,API=X.api,MIN=API.MIN,H=API.H;
var WINDOW_DAYS=7,MIN_OBS=4,BLEND_UPTO=10,ALAN_W=0.7,NAP_DEFAULT=45;

/* ---------- osservazioni degli ultimi 7 giorni ---------- */
/* veglie: da un risveglio alla nanna successiva (5–240 min); pisolini: da una nanna al risveglio successivo (5–600 min),
   con l'ora in cui è iniziato; intervalli pappe: tra due pappe valide consecutive (0,5–8 h). */
function observations(now){
  var from=now-WINDOW_DAYS*864e5,ev=API.sorted(),awakes=[],naps=[],feeds=[],lastSleep=null,lastWake=null,lastFeed=null;
  for(var i=0;i<ev.length;i++){
    var e=ev[i];if(e.t>now)break;
    if(e.k==='sleep'){
      if(lastWake!=null&&e.t>=from){var aw=(e.t-lastWake)/MIN;if(aw>=5&&aw<=240)awakes.push(aw);}
      lastSleep=e.t;lastWake=null;
    }else if(e.k==='wake'){
      if(lastSleep!=null&&e.t>=from){var np=(e.t-lastSleep)/MIN;if(np>=5&&np<=600)naps.push({min:np,day:isDay(lastSleep)});}
      lastWake=e.t;lastSleep=null;
    }else if(e.k==='feed'&&API.fedFeed(e)){
      if(lastFeed!=null&&e.t>=from){var g=(e.t-lastFeed)/H;if(g>=0.5&&g<=8)feeds.push(g);}
      lastFeed=e.t;
    }
  }
  return {awakes:awakes,naps:naps,feeds:feeds};
}
function isDay(t){var h=new Date(t).getHours();return h>=7&&h<19;}
function avg(a){var s=0;for(var i=0;i<a.length;i++)s+=a[i];return a.length?s/a.length:null;}
/* valore atteso: media di Alan, norma, o misto. n = osservazioni usate. */
function expected(vals,norm){
  var n=vals.length;
  if(n<MIN_OBS)return {value:norm,basis:'norma',n:n,alan:n?avg(vals):null,norm:norm};
  var m=avg(vals);
  if(n<=BLEND_UPTO)return {value:ALAN_W*m+(1-ALAN_W)*norm,basis:'misto',n:n,alan:m,norm:norm};
  return {value:m,basis:'alan',n:n,alan:m,norm:norm};
}
function result(at,now,ex){return {at:at,minutes:Math.round((at-now)/MIN),basis:ex.basis,n:ex.n,expected:ex.value};}

/* ---------- previsioni ---------- */
function nextNap(now){
  now=now||Date.now();
  var c=API.context(now);
  if(c.sleeping||c.wakeT==null)return null;
  var ex=expected(observations(now).awakes,c.n.awakeMin);
  return result(c.wakeT+ex.value*MIN,now,ex);
}
function nextWake(now){
  now=now||Date.now();
  var c=API.context(now);
  if(!c.sleeping||c.sleepT==null)return null;
  var day=isDay(c.sleepT),pool=[],naps=observations(now).naps;
  for(var i=0;i<naps.length;i++)if(naps[i].day===day)pool.push(naps[i].min);
  var ex;
  if(day)ex=expected(pool,NAP_DEFAULT);
  else{if(pool.length<MIN_OBS)return null;ex={value:avg(pool),basis:'alan',n:pool.length,alan:avg(pool),norm:null};}
  return result(c.sleepT+ex.value*MIN,now,ex);
}
function nextFeed(now){
  now=now||Date.now();
  var c=API.context(now);
  if(c.lastFeedT==null)return null;
  var set=API.settings().feedH,ex;
  if(set>0)ex={value:set,basis:'impostato',n:0,alan:null,norm:set};
  else ex=expected(observations(now).feeds,c.n.feedH);
  return result(c.lastFeedT+ex.value*H,now,ex);
}

/* ---------- testo ---------- */
/* "tra 25 min" nel futuro, "tra poco" sotto i 5 minuti, "da 12 min" se il momento è già passato (nessun allarme) */
function rel(p,now){
  var d=p.at-now;
  if(d>=5*MIN)return 'tra '+API.fmtDur(d);
  if(d>=0)return 'tra poco';
  return 'da '+API.fmtDur(-d);
}
/* frase intera: "Probabile nanna tra 25 min" nel futuro, "Nanna attesa da 12 min" se è passato */
var PHRASE={nanna:['Probabile nanna','Nanna attesa'],risveglio:['Probabile risveglio','Risveglio atteso'],pappa:['Pappa prevista','Pappa attesa']};
function phrase(kind,p,now){return PHRASE[kind][p.at-now>=0?0:1]+' '+rel(p,now);}
function fmtH(h){var r=Math.round(h*10)/10;return String(r).replace('.',',')+' h';}
function basisText(ex,name){
  if(ex.basis==='impostato')return 'intervallo scelto da voi';
  if(ex.basis==='norma')return 'norma per età';
  if(ex.basis==='misto')return 'ritmo di '+name+' e norma';
  return 'ritmo di '+name;
}
function rowHtml(cls,onclick,text,when){
  return '<button class="pd-row '+cls+'" onclick="'+onclick+'"><i></i><span class="pd-txt">'+text+'</span><span class="pd-when">'+when+'</span></button>';
}
function homeHtml(){
  var now=Date.now(),h='',c=API.context(now);
  if(c.sleeping){
    var w=nextWake(now);
    if(w)h+=rowHtml('pd-sonno','A.flow(\'sleep\')',phrase('risveglio',w,now),'verso le '+API.fmtTime(w.at));
  }else{
    var np=nextNap(now);
    if(np)h+=rowHtml('pd-sonno','A.flow(\'sleep\')',phrase('nanna',np,now),'verso le '+API.fmtTime(np.at));
  }
  var f=nextFeed(now);
  if(f)h+=rowHtml('pd-fame','A.flow(\'feed\')',phrase('pappa',f,now),'verso le '+API.fmtTime(f.at));
  if(!h){
    /* un accenno solo finché non c'è ancora nessuna pappa né nanna registrata */
    if(!API.events().length||c.lastFeedT!=null||c.sleepT!=null||c.wakeT!=null)return '';
    return '<div class="pd"><div class="pd-empty">Dopo la prima pappa e la prima nanna qui compare quando aspettarsi le prossime.</div></div>';
  }
  return '<div class="pd">'+h+'</div>';
}

/* ---------- Pattern: ritmo di Alan ---------- */
function statsHtml(){
  var now=Date.now(),o=observations(now),n=API.norms(API.ageDays()),name=API.esc(API.settings().name||'Alan');
  var aw=expected(o.awakes,n.awakeMin),fd=expected(o.feeds,n.feedH),dn=[],nn=[];
  for(var i=0;i<o.naps.length;i++)(o.naps[i].day?dn:nn).push(o.naps[i].min);
  var h='<div class="card pd-card"><h3>Ritmo di '+name+'</h3><p class="hint">Ultimi 7 giorni, confrontati con la norma per la sua età. Sono le basi delle previsioni in Home.</p><div class="kv">';
  h+='<div>Veglia</div><div>'+(aw.alan!=null?API.fmtDur(aw.alan*MIN):'—')+' <span class="m">norma ~'+n.awakeMin+' min · '+obs(aw.n,'veglia','veglie')+'</span></div>';
  h+='<div>Tra una pappa e l\'altra</div><div>'+(fd.alan!=null?API.fmtDur(fd.alan*H):'—')+' <span class="m">norma ~'+fmtH(n.feedH)+' · '+obs(fd.n,'intervallo','intervalli')+'</span></div>';
  h+='<div>Pisolino di giorno</div><div>'+(dn.length?API.fmtDur(avg(dn)*MIN):'—')+' <span class="m">'+obs(dn.length,'pisolino','pisolini')+'</span></div>';
  h+='<div>Sonno di notte</div><div>'+(nn.length?API.fmtDur(avg(nn)*MIN):'—')+' <span class="m">'+obs(nn.length,'tratta','tratte')+'</span></div>';
  h+='</div>';
  var lines=[];
  if(aw.alan!=null&&aw.n>=MIN_OBS)lines.push(delta(aw.alan-n.awakeMin,'Veglia'));
  if(fd.alan!=null&&fd.n>=MIN_OBS)lines.push(delta((fd.alan-n.feedH)*60,'Intervallo tra le pappe'));
  h+='<p class="hint pd-basis">Previsioni: nanna su '+basisText(aw,name)+', pappa su '+basisText(fd,name)+'.'+(lines.length?' '+lines.join(' '):'')+'</p>';
  return h+'</div>';
}
function obs(n,s,p){return n+' '+(n===1?s:p);}
function delta(d,lead){
  var r=Math.round(d);
  if(Math.abs(r)<3)return lead+': in linea con la norma.';
  return lead+': '+Math.abs(r)+' min '+(r>0?'più':'meno')+' della norma.';
}

/* ---------- registrazioni ---------- */
X.home('predict',homeHtml,'top');
X.slot('stats',statsHtml);
X.predict={nextNap:nextNap,nextFeed:nextFeed,nextWake:nextWake,observations:observations,expected:expected,rel:rel,phrase:phrase};
/* i minuti passano anche senza nuove voci: la riga si aggiorna da sola ogni minuto, solo in Home e fuori dai percorsi */
setInterval(function(){
  if(API.flow()||API.curView()!=='oggi')return;
  var el=document.getElementById('home-predict');if(!el)return;
  try{el.innerHTML=homeHtml();}catch(e){}
},60000);
X.refresh();
})();
