/* Estensione "note": una nota libera (fino a 200 caratteri) su qualsiasi voce del diario: pappa, cambio, nanna, pianto,
   misura, temperatura, medicina, altro. La nota vive sulla voce stessa (e.note, e.noteBy = chi l'ha scritta) e viaggia
   con la voce nel sync (data jsonb, LWW sull'intera voce). Dove si scrive: tap sulla descrizione di una riga del diario
   in Oggi, oppure dalla scheda "Note" in Salute (elenco delle note, "Scrivi una nota" con la scelta della voce fra le
   ultime tre giornate). Il riepilogo per il pediatra riporta le note del periodo (js/report.js). Nessun consiglio. */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var MAX=200,PICK_DAYS=3,LIST_MAX=20;

function text(e){return (e&&typeof e.note==='string')?e.note.trim():'';}
function has(e){return !!text(e);}
function clean(s){return String(s==null?'':s).replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim().slice(0,MAX);}
function by(e){return e.noteBy||'';}
/* voci del diario che si possono annotare: come in Home, senza visite e senza le voci nascoste delle estensioni */
function notable(e){return !!e&&e.k!=='appt'&&!X.isHidden(e.k);}
function plainDesc(e){var d=API.describe(e);return (d[0]+' '+String(d[1]||'').replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim();}
function when(e){return (API.dayKey(e.t)===API.dayKey(Date.now())?'oggi':API.dayLabel(e.t))+' '+API.fmtTime(e.t);}

/* imposta o toglie la nota; torna true se qualcosa è cambiato, null se uguale, false se la voce non esiste */
function set(id,val){
  var e=API.byId(id);if(!e)return false;
  var v=clean(val);if(v===text(e))return null;
  if(v){e.note=v;e.noteBy=API.who()||'';}else{delete e.note;delete e.noteBy;}
  API.touched(e);API.save();
  return true;
}
/* tutte le voci con una nota, dalla più recente */
function all(){return API.events().filter(function(e){return notable(e)&&has(e);}).sort(function(a,b){return b.t-a.t;});}
/* voci delle ultime PICK_DAYS giornate (oggi compresa), dalla più recente: da qui si sceglie cosa annotare */
function recent(now){
  now=now||Date.now();var d=new Date(now);d.setHours(0,0,0,0);var from=d.getTime()-(PICK_DAYS-1)*864e5;
  return API.events().filter(function(e){return notable(e)&&e.t>=from&&e.t<=now+60e3;}).sort(function(a,b){return b.t-a.t;});
}

/* ---------- percorso "note": una voce, una casella di testo, Salva / Togli ---------- */
function bar(title){return '<div class="bar">'+API.backBtn()+'<div class="title">'+title+'</div></div>';}
function renderNote(flow){
  var e=API.byId(flow.data.id);
  if(!e)return bar('Nota')+'<p class="hint">Questa voce non c\'è più.</p>';
  var d=API.describe(e),val=flow.data.text!=null?flow.data.text:text(e);
  var h=bar('Nota');
  h+='<div class="nt-ev"><div class="what">'+d[0]+' '+d[1]+'</div><div class="hint">'+API.esc(when(e))+(e.who?' · '+API.esc(e.who):'')+'</div></div>';
  h+='<h2>'+(has(e)?'Modifica la nota':'Aggiungi una nota')+'</h2>';
  h+='<textarea class="f nt-ta" id="ntTxt" maxlength="'+MAX+'" rows="4" placeholder="es. cacca verde e liquida · sembrava infastidito · ha bevuto piano" oninput="AlanExt.note.typed(this.value)">'+API.esc(val)+'</textarea>';
  h+='<p class="hint nt-count"><span id="ntCount">'+val.length+'</span>/'+MAX+'</p>';
  if(has(e)&&by(e))h+='<p class="hint">Scritta da '+API.esc(by(e))+'.</p>';
  h+='<div class="spacer"></div><button class="btn" onclick="A.finish(\'save\')">Salva la nota</button>';
  if(has(e))h+='<button class="btn warn" onclick="A.finish(\'clear\')">Togli la nota</button>';
  return h;
}
function finishNote(flow,val){
  var id=flow.data.id,v;
  if(val==='clear')v='';else{var ta=API.q('#ntTxt');v=flow.data.text!=null?flow.data.text:(ta&&ta.value!=null?ta.value:text(API.byId(id)));}
  var r=set(id,v);
  if(r===false){API.toast('Questa voce non c\'è più');API.home();return false;}
  API.home();X.refresh();
  API.toast(r===null?'Nessuna modifica':(v?'Nota salvata':'Nota tolta'));
  return false;
}
function typed(v){var f=API.flow();if(f&&f.type==='note')f.data.text=v;var c=API.q('#ntCount');if(c)c.textContent=String(clean(v).length);}
function open(id){window.A.flow('note',null,{id:id});}

/* ---------- percorso "notepick": scegli la voce da annotare fra le ultime giornate ---------- */
function rowHtml(e,showDay){
  var d=API.describe(e),t=text(e);
  return '<button class="row nt-row" onclick="AlanExt.note.open(\''+e.id+'\')"><div class="time">'+(showDay?'<small>'+API.esc(API.dayKey(e.t)===API.dayKey(Date.now())?'oggi':API.dayLabel(e.t))+'</small><br>':'')+API.fmtTime(e.t)+'</div><div class="what">'+d[0]+' '+d[1]+(e.who?'<span class="who">'+API.esc(e.who)+'</span>':'')+(t?'<span class="nt">'+API.esc(t)+(by(e)&&by(e)!==e.who?' <i>— '+API.esc(by(e))+'</i>':'')+'</span>':'')+'</div><span class="nt-go">›</span></button>';
}
function renderPick(){
  var list=recent(),h=bar('Scrivi una nota');
  if(!list.length)return h+'<p class="hint">Nessuna voce negli ultimi '+PICK_DAYS+' giorni. Registra qualcosa in Oggi e poi tocca la riga per scriverci una nota.</p>';
  h+='<h2>Su quale voce?</h2><div class="list nt-list">'+list.map(function(e){return rowHtml(e,true);}).join('')+'</div>';
  return h;
}
X.flow('note',{render:renderNote,finish:finishNote});
X.flow('notepick',{render:renderPick,finish:function(){return false;}});

/* ---------- diario in Oggi: tap sulla riga, nota sotto la descrizione ---------- */
X.row(function(e){
  if(!notable(e))return null;
  var t=text(e);
  return {tap:"AlanExt.note.open('"+e.id+"')",html:t?'<span class="nt">'+API.esc(t)+(by(e)&&by(e)!==e.who?' <i>— '+API.esc(by(e))+'</i>':'')+'</span>':''};
});
/* suggerimento in fondo al diario finché non esiste nessuna nota */
X.home('note',function(){
  if(all().length||!API.events().some(notable))return '';
  return '<p class="hint nt-hint">Tocca una voce per scriverci una nota (come stava, cosa hai notato).</p>';
},'bottom');

/* ---------- scheda "Note" in Salute ---------- */
function card(){
  var list=all(),h='<div class="card nt-card"><h3>Note</h3>';
  if(!list.length)h+='<p class="hint">Un appunto su una pappa, un cambio, un pianto: come stava, cosa hai notato. Le note compaiono qui e nel riepilogo per il pediatra.</p>';
  else{
    h+='<div class="list nt-list">'+list.slice(0,LIST_MAX).map(function(e){return rowHtml(e,true);}).join('')+'</div>';
    if(list.length>LIST_MAX)h+='<p class="hint">e altre '+(list.length-LIST_MAX)+' più vecchie, nel riepilogo per il pediatra.</p>';
  }
  h+='<div class="spacer"></div><button class="btn ghost" onclick="A.flow(\'notepick\')">Scrivi una nota</button></div>';
  return h;
}
X.slot('salute',function(){return card();});

X.note={MAX:MAX,PICK_DAYS:PICK_DAYS,LIST_MAX:LIST_MAX,text:text,has:has,clean:clean,set:set,all:all,recent:recent,open:open,typed:typed,card:card,plainDesc:plainDesc};
X.refresh();
})();
