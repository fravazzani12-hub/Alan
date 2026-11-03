/* predict — previsione della prossima pappa.
   Estensione: non tocca app.js. Home: una riga nella scheda "Prossime tappe". Pattern: "Ritmo di Alan"
   (intervallo fra le pappe degli ultimi 7 giorni contro la norma per età).
   Metodo (SPEC §2 e §5): media delle osservazioni reali degli ultimi 7 giorni, con almeno 4 osservazioni;
   tra 4 e 10 osservazioni la media è mescolata con la norma per età (70% Alan / 30% norma); sotto le 4 vale la norma. */
(function(){'use strict';
var X=window.AlanExt,API=X.api,MIN=API.MIN,H=API.H;
var WINDOW_DAYS=7,MIN_OBS=4,BLEND_UPTO=10,ALAN_W=0.7;

/* intervalli fra due pappe valide consecutive (0,5–8 h) negli ultimi 7 giorni */
function observations(now){
  var from=now-WINDOW_DAYS*864e5,ev=API.sorted(),feeds=[],lastFeed=null;
  for(var i=0;i<ev.length;i++){
    var e=ev[i];if(e.t>now)break;
    if(e.k==='feed'&&API.fedFeed(e)){
      if(lastFeed!=null&&e.t>=from){var g=(e.t-lastFeed)/H;if(g>=0.5&&g<=8)feeds.push(g);}
      lastFeed=e.t;
    }
  }
  return {feeds:feeds};
}
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
function phrase(kind,p,now){return (p.at-now>=0?'Pappa prevista':'Pappa attesa')+' '+rel(p,now);}
function fmtH(h){var r=Math.round(h*10)/10;return String(r).replace('.',',')+' h';}
function basisText(ex,name){
  if(ex.basis==='impostato')return 'intervallo scelto da voi';
  if(ex.basis==='norma')return 'norma per età';
  if(ex.basis==='misto')return 'ritmo di '+name+' e norma';
  return 'ritmo di '+name;
}
function homeHtml(){
  var now=Date.now(),f=nextFeed(now);
  if(f)return API.nextRow({color:'var(--c-fame)',text:phrase('pappa',f,now),when:'verso le '+API.fmtTime(f.at),onclick:'A.flow(\'feed\')',cls:'pd-fame'});
  if(!API.events().length)return '<div class="pd-empty">Dopo la prima pappa qui compare quando aspettarsi la prossima.</div>';
  return '';
}

/* ---------- Pattern: ritmo di Alan ---------- */
function statsHtml(){
  var now=Date.now(),o=observations(now),n=API.norms(API.ageDays()),name=API.esc(API.settings().name||'Alan');
  var fd=expected(o.feeds,n.feedH);
  var h='<div class="card pd-card"><h3>Ritmo di '+name+'</h3><p class="hint">Ultimi 7 giorni, confrontati con la norma per la sua età. È la base della previsione in Home.</p><div class="kv">';
  h+='<div>Tra una pappa e l\'altra</div><div>'+(fd.alan!=null?API.fmtDur(fd.alan*H):'—')+' <span class="m">norma ~'+fmtH(n.feedH)+' · '+obs(fd.n,'intervallo','intervalli')+'</span></div>';
  h+='</div>';
  var line=(fd.alan!=null&&fd.n>=MIN_OBS)?' '+delta((fd.alan-n.feedH)*60,'Intervallo tra le pappe'):'';
  h+='<p class="hint pd-basis">Previsione su '+basisText(fd,name)+'.'+line+'</p>';
  return h+'</div>';
}
function obs(n,s,p){return n+' '+(n===1?s:p);}
function delta(d,lead){
  var r=Math.round(d);
  if(Math.abs(r)<3)return lead+': in linea con la norma.';
  return lead+': '+Math.abs(r)+' min '+(r>0?'più':'meno')+' della norma.';
}

/* ---------- registrazioni ---------- */
X.slot('next',homeHtml,-20);
X.slot('stats',statsHtml);
X.predict={homeHtml:homeHtml,nextFeed:nextFeed,observations:observations,expected:expected,rel:rel,phrase:phrase};
/* i minuti passano anche senza nuove voci: la riga si aggiorna da sola ogni minuto, solo in Home e fuori dai percorsi */
setInterval(function(){
  if(API.flow()||API.curView()!=='oggi')return;
  try{API.renderNext();}catch(e){}
},60000);
X.refresh();
})();
