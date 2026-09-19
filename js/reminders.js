/* Estensione "reminders": promemoria interni, senza notifiche push.
   In Home (blocco 'mid', sopra a "Piange") al massimo due righe, in quest'ordine:
   1. Bandiera rossa febbre: temperatura ≥ 38 °C nelle ultime 6 ore sotto i 90 giorni (testo identico a quello in Altro, nessun altro copy, non si nasconde).
   2. Visita oggi o domani (prima non fatta), con ora e luogo.
   3. Pappa oltre l'atteso di più di 30 min: informazione neutra ("Ultima pappa 4 h 10 fa, di solito ogni 3 h").
   4. Vitamina D non ancora data oggi dopo le 10, solo se è stata data almeno una volta nei 7 giorni precedenti; "Segna" la registra.
   "Ok" nasconde la riga per oggi (localStorage 'alan.rem.dismissed' = {chiave: giorno}); gli interruttori in Altro stanno in 'alan.rem.cfg'.
   L'ora è iniettabile: AlanExt.reminders.compute(now) restituisce le righe per quell'istante (i test la usano). */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var CFG='alan.rem.cfg',DIS='alan.rem.dismissed',MIN=API.MIN,H=API.H,DAY=864e5,MAX_ROWS=2;
/* testo identico alla bandiera rossa in Altro (index.html) e in Salute: non cambiarlo qui senza cambiarlo là */
var FEVER_TXT='Febbre: temperatura rettale ≥ 38 °C sotto i 3 mesi è sempre urgente, anche senza altri sintomi.';
var SWITCHES=[['appt','Visite','il giorno prima e il giorno stesso, con ora e luogo'],['feed','Pappa in ritardo','quando supera l\'atteso di oltre 30 minuti']];
var lastSig=null,tickId=null;

/* ---------- impostazioni e "Ok" ---------- */
function cfg(){
  var o={appt:true,feed:true};
  try{var s=JSON.parse(API.lsGet(CFG)||'null');if(s&&typeof s==='object')for(var k in o)if(typeof s[k]==='boolean')o[k]=s[k];}catch(e){}
  return o;
}
function setCfg(o){API.lsSet(CFG,JSON.stringify(o));}
function toggle(k){var c=cfg();if(!(k in c))return;c[k]=!c[k];setCfg(c);X.refresh();}
/* solo le voci di oggi: quelle di ieri decadono da sole */
function dismissed(now){
  var out={},day=API.dayKey(now);
  try{var s=JSON.parse(API.lsGet(DIS)||'null');if(s&&typeof s==='object')for(var k in s)if(s[k]===day)out[k]=day;}catch(e){}
  return out;
}
function dismiss(key){var now=Date.now(),d=dismissed(now);d[key]=API.dayKey(now);API.lsSet(DIS,JSON.stringify(d));X.refresh();}

/* ---------- regole (ognuna riceve l'istante e restituisce una riga o null) ---------- */
function ageAt(now){var ad=API.ageDaysAt(now);return ad==null?API.ageDays():ad;}
function feverRow(now){
  if(ageAt(now)>=90)return null;
  var ev=API.events(),hot=null;
  for(var i=0;i<ev.length;i++){var e=ev[i];if(e.k!=='temp'||!(e.c>=38)||e.t>now||now-e.t>6*H)continue;if(!hot||e.t>hot.t)hot=e;}
  if(!hot)return null;
  return {key:'fever',kind:'fever',color:'var(--danger)',text:FEVER_TXT,ok:false};
}
function apptRow(now){
  var a=API.appts(),today=API.dayKey(now),tomorrow=API.dayKey(now+DAY),nx=null;
  for(var i=0;i<a.length;i++)if(!a[i].done&&a[i].t>=now-2*H){nx=a[i];break;}
  if(!nx)return null;
  var d=API.dayKey(nx.t),when=d===today?'Oggi':(d===tomorrow?'Domani':null);
  if(!when)return null;
  var title=nx.title||API.apptKind(nx.kind);
  return {key:'appt:'+nx.id,kind:'appt',color:'var(--c-sonno)',id:nx.id,when:when+' alle '+API.fmtTime(nx.t),title:title,place:nx.place||'',
    text:when+' alle '+API.fmtTime(nx.t)+' · '+title+(nx.place?' · '+nx.place:''),ok:true};
}
function feedRow(now){
  var c=API.context(now);
  if(c.sinceFeedH==null||!c.n||!c.n.feedH)return null;
  if(c.sinceFeedH-c.n.feedH<=0.5)return null;
  if(c.sinceFeedH>12)return null; /* oltre mezza giornata è più probabile che manchi la registrazione: nessun promemoria */
  return {key:'feed:'+c.lastFeedT,kind:'feed',color:'var(--c-fame)',text:'Ultima pappa '+API.fmtDur(c.sinceFeedH*H)+' fa, di solito ogni '+API.fmtDur(c.n.feedH*H),ok:true};
}
function compute(now){
  now=now||Date.now();
  var c=cfg(),d=dismissed(now),rows=[],r;
  r=feverRow(now);if(r)rows.push(r);
  if(c.appt){r=apptRow(now);if(r)rows.push(r);}
  if(c.feed){r=feedRow(now);if(r)rows.push(r);}
  return rows.filter(function(x){return !d[x.key];}).slice(0,MAX_ROWS);
}
function sigOf(rows){return rows.map(function(r){return r.key+'|'+r.text;}).join('\n');}
function keysOf(rows){return rows.map(function(r){return r.key;}).join('\n');}

/* ---------- Home ---------- */
/* una riga della scheda "Prossime tappe" di Home (markup condiviso, API.nextRow) */
function row(r){
  return API.nextRow({color:r.color,cls:'rm-'+r.kind,
    text:r.kind==='appt'?('<b>'+API.esc(r.title)+'</b>'+(r.place?' · '+API.esc(r.place):'')):API.esc(r.text),
    when:r.kind==='appt'?r.when:'',
    onclick:r.kind==='appt'?'AlanExt.reminders.open()':null,
    act:r.ok?'Ok':null,actOnclick:'AlanExt.reminders.dismiss(\''+r.key.replace(/'/g,'')+'\')'});
}
function render(now){return compute(now).map(row).join('');}
function home(){var rows=compute(Date.now());lastSig=sigOf(rows);return rows.map(row).join('');}
function redraw(){home();API.renderNext();}
/* ridisegna solo se il testo cambierebbe: tutta la Home se compare o sparisce una riga, altrimenti solo questo blocco */
function check(){
  if(API.flow())return;
  var rows=compute(Date.now()),sig=sigOf(rows);
  if(sig===lastSig)return;
  var was=lastSig;lastSig=sig;
  if(keysOf(rows)!==keysOfSig(was))X.refresh();else redraw();
}
function keysOfSig(sig){if(!sig)return '';return sig.split('\n').map(function(l){return l.split('|')[0];}).join('\n');}
function ensureTick(){if(tickId==null)tickId=setInterval(check,60000);}

/* ---------- azioni ---------- */
function open(){API.showView('salute');}

/* ---------- Altro: interruttori ---------- */
function settingsCard(){
  var c=cfg(),h='<div class="card rm-cfg"><h3>Promemoria</h3><p class="hint">Righe nella scheda «Prossime tappe» di Oggi. Nessuna notifica: compaiono quando apri l\'app. «Ok» le nasconde fino a domani.</p>';
  SWITCHES.forEach(function(s){
    h+='<button class="rm-sw" role="switch" aria-checked="'+(c[s[0]]?'true':'false')+'" onclick="AlanExt.reminders.toggle(\''+s[0]+'\')"><span class="rm-sw-t">'+API.esc(s[1])+'<small>'+API.esc(s[2])+'</small></span><i></i></button>';
  });
  return h+'</div>';
}

X.slot('next',function(){return home();},0);
X.slot('altro',function(){return settingsCard();});
X.on('change',function(){try{check();}catch(e){}});
X.reminders={CFG:CFG,DIS:DIS,FEVER_TXT:FEVER_TXT,cfg:cfg,setCfg:setCfg,toggle:toggle,dismissed:dismissed,dismiss:dismiss,compute:compute,render:render,home:home,redraw:redraw,check:check,open:open,settingsCard:settingsCard,
  rules:{fever:feverRow,appt:apptRow,feed:feedRow}};
ensureTick();
X.refresh();
})();
