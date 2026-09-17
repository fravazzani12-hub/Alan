/* Estensione "svezzamento": alimenti provati, da attivare verso i 4–6 mesi.
   Evento salvato: food {name, group (cereali/verdure/frutta/proteine/latticini/altro), amount (assaggio/poco/tutto),
   reaction (bene/nongradito/reazione), note (solo con "reazione")}; t dal "quando" del percorso.
   Salute: prima dei 120 giorni (e senza alimenti già registrati) una card discreta; poi riepilogo, ultimi tre assaggi,
   "Nuovo alimento", elenco completo dei provati (a richiesta) e i suggeriti a gruppi come chip: il tap apre il percorso già
   con l'alimento scelto. I gruppi sono elenchi di nomi, senza date né ordini: l'unico promemoria è "un alimento nuovo alla volta".
   Nessun giudizio: "da riprovare" conta gli alimenti la cui ultima prova è "non gradito", "con reazione" quelli con "reazione". */
(function(){
'use strict';
var X=window.AlanExt,API=X.api;
var ACTIVE_DAYS=120,CARD_MAX=6,LAST_N=3,NAME_MAX=40,NOTE_MAX=120;
var GROUPS=[
  {key:'cereali',label:'Cereali e creme',color:'var(--c-fame)',items:['Crema di riso','Crema di mais e tapioca','Semolino','Crema multicereali','Pastina','Avena']},
  {key:'verdure',label:'Verdure',color:'var(--c-cambio)',items:['Brodo vegetale','Zucchina','Carota','Patata','Zucca','Finocchio','Broccolo','Spinaci','Piselli','Fagiolini','Cavolfiore','Lattuga']},
  {key:'frutta',label:'Frutta',color:'var(--c-contatto)',items:['Mela','Pera','Banana','Prugna','Pesca','Albicocca','Avocado','Kiwi']},
  {key:'proteine',label:'Carne, pesce, uova e legumi',color:'var(--c-aria)',items:['Pollo','Tacchino','Coniglio','Manzo','Merluzzo','Platessa','Salmone','Uovo','Lenticchie','Ceci','Fagioli']},
  {key:'latticini',label:'Latticini',color:'var(--c-sonno)',items:['Parmigiano','Yogurt bianco','Ricotta','Formaggino','Crescenza']}
];
var AMOUNT={assaggio:['Assaggio','un cucchiaino'],poco:['Poco','qualche cucchiaio'],tutto:['Tutto','la porzione']};
var REACTION={bene:['Bene','tutto ok','var(--c-cambio)'],nongradito:['Non gradito','sputato o rifiutato','var(--c-fame)'],reazione:['Reazione','scrivi cosa hai notato','var(--c-contatto)']};
var listOpen=false,choices=[],lastSig=null;

/* ---------- dati ---------- */
function norm(s){return String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();}
function clean(s,max){return String(s==null?'':s).replace(/\s+/g,' ').trim().slice(0,max);}
function groupOf(key){for(var i=0;i<GROUPS.length;i++)if(GROUPS[i].key===key)return GROUPS[i];return null;}
/* nome dell'elenco che corrisponde a una chiave normalizzata, o null */
function canon(k){for(var i=0;i<GROUPS.length;i++)for(var j=0;j<GROUPS[i].items.length;j++)if(norm(GROUPS[i].items[j])===k)return GROUPS[i].items[j];return null;}
function groupLabel(key){var g=groupOf(key);return g?g.label:'Altro';}
function groupColor(key){var g=groupOf(key);return g?g.color:'var(--muted)';}
function foods(){return API.sorted().filter(function(e){return e.k==='food'&&e.name;});}
/* alimenti distinti (nome normalizzato), ognuno con numero di prove, prima e ultima; ordinati dall'ultima prova */
function tried(){
  var by={},out=[];
  foods().forEach(function(e){
    var k=norm(e.name);if(!k)return;
    var f=by[k];
    if(!f){f=by[k]={key:k,name:clean(e.name,NAME_MAX),group:e.group||'altro',n:0,first:e.t,last:null,reaction:null,note:'',events:[]};out.push(f);}
    f.n++;f.events.push(e);f.last=e.t;f.reaction=e.reaction||null;f.note=e.reaction==='reazione'?(e.note||''):'';
    f.name=canon(k)||clean(e.name,NAME_MAX); /* grafia dell'elenco se c'è, altrimenti l'ultima scritta */
    if(e.group&&(!f.group||f.group==='altro'))f.group=e.group;
  });
  return out.sort(function(a,b){return (b.last-a.last)||(a.key<b.key?-1:(a.key>b.key?1:0));});
}
function triedKeys(){var o={};tried().forEach(function(f){o[f.key]=true;});return o;}
/* suggeriti a gruppi, senza quelli già provati */
function suggested(){
  var tk=triedKeys();
  return GROUPS.map(function(g){
    var items=g.items.filter(function(n){return !tk[norm(n)];});
    return {key:g.key,label:g.label,color:g.color,items:items,total:g.items.length,tried:g.items.length-items.length};
  });
}
function summary(){
  var all=tried(),retry=0,react=0;
  all.forEach(function(f){if(f.reaction==='nongradito')retry++;else if(f.reaction==='reazione')react++;});
  return {n:all.length,retry:retry,react:react,last:foods().slice(-LAST_N).reverse()};
}
function active(){return API.ageDays()>=ACTIVE_DAYS||foods().length>0;}
function amountTxt(a){return AMOUNT[a]?AMOUNT[a][0].toLowerCase():'';}
function reactionTxt(r){return REACTION[r]?REACTION[r][0].toLowerCase():'';}
function detailTxt(e){var bits=[];if(amountTxt(e.amount))bits.push(amountTxt(e.amount));if(reactionTxt(e.reaction))bits.push(reactionTxt(e.reaction));if(e.reaction==='reazione'&&e.note)bits.push(e.note);return bits.join(' · ');}

/* ---------- percorso ---------- */
function repaint(){var f=API.flow();if(f&&f.type==='food')API.q('#screenInner').innerHTML=render(f);}
function cur(){var f=API.flow();return f&&f.type==='food'?f:null;}
function open(data){
  data=data||{};
  window.A.flow('food',null,{name:data.name||'',group:data.group||''});
  var f=cur();if(!f)return;
  if(f.data.name){f.step=1;repaint();}
}
/* chip in Salute: gruppo + indice nell'elenco, così i nomi non passano da onclick */
function start(gkey,idx){var g=groupOf(gkey);if(!g||!g.items[idx])return;open({name:g.items[idx],group:g.key});}
function pick(i){var f=cur(),c=choices[i];if(!f||!c)return;f.data.name=c.name;f.data.group=c.group;f.data.custom=false;f.step=1;repaint();}
/* il nome scritto a mano resta se si torna qui; quello di un chip scelto prima no */
function custom(){var f=cur();if(!f)return;if(f.data.group!=='altro')f.data.name='';f.data.custom=true;repaint();focus('#svName');}
function uncustom(){var f=cur();if(!f)return;f.data.custom=false;repaint();}
function name(v){var f=cur();if(f)f.data.name=v;}
function next(){
  var f=cur();if(!f)return;
  var n=clean(f.data.name,NAME_MAX);
  if(!n){API.toast('Scrivi il nome dell\'alimento');return;}
  f.data.name=n;f.data.group='altro';f.data.custom=false;f.step=1;repaint();
}
function amount(a){var f=cur();if(!f||!AMOUNT[a])return;f.data.amount=a;f.step=2;repaint();}
function react(){var f=cur();if(!f)return;f.data.reaction='reazione';f.step=3;repaint();focus('#svNote');}
function note(v){var f=cur();if(f)f.data.note=v;}
function back(){var f=cur();if(!f)return;if(f.step===3){f.data.reaction=null;f.step=2;}else if(f.step>0)f.step--;repaint();}
function focus(sel){var i=API.q(sel);if(i&&i.focus)try{i.focus();}catch(e){}}
function chip(i,c){return '<button class="sv-g'+(c.again?' sv-again':'')+'" style="--gc:'+groupColor(c.group)+'" onclick="AlanExt.svezzamento.pick('+i+')">'+API.esc(c.name)+'</button>';}
function renderName(d){
  var h='';
  if(d.custom){
    h+='<h2>Quale alimento?</h2><label class="f" for="svName">Nome</label><input class="f" id="svName" type="text" maxlength="'+NAME_MAX+'" value="'+API.esc(d.name||'')+'" placeholder="es. Pastina con zucchine" oninput="AlanExt.svezzamento.name(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();AlanExt.svezzamento.next();}">';
    h+='<div class="spacer"></div><button class="btn" onclick="AlanExt.svezzamento.next()">Avanti</button><button class="btn ghost" onclick="AlanExt.svezzamento.uncustom()">Torna all\'elenco</button>';
    return h;
  }
  choices=[];
  h+='<h2>Cosa ha assaggiato?</h2>';
  suggested().forEach(function(g){
    if(!g.items.length)return;
    h+='<div class="sv-grp"><div class="sv-glbl">'+API.esc(g.label)+'</div><div class="chips">';
    g.items.forEach(function(n){choices.push({name:n,group:g.key});h+=chip(choices.length-1,choices[choices.length-1]);});
    h+='</div></div>';
  });
  var again=tried();
  if(again.length){
    h+='<div class="sv-grp"><div class="sv-glbl">Già provati <span class="hint">tocca per riprovare</span></div><div class="chips">';
    again.forEach(function(f){choices.push({name:f.name,group:f.group,again:true});h+=chip(choices.length-1,choices[choices.length-1]);});
    h+='</div></div>';
  }
  h+='<div class="spacer"></div><button class="btn ghost" onclick="AlanExt.svezzamento.custom()">Altro: scrivo io il nome</button>';
  return h;
}
function render(flow){
  var d=flow.data||{},h='<div class="bar">'+API.backBtn()+'<div class="title">'+(d.name&&flow.step>0?API.esc(d.name):'Alimento')+'</div></div>'+API.whenRow();
  if(flow.step===0)return h+renderName(d);
  if(flow.step===1){
    h+='<h2>Quanto ne ha mangiato?</h2><div class="grid3">'+Object.keys(AMOUNT).map(function(a){return '<button class="'+(d.amount===a?'on':'')+'" onclick="AlanExt.svezzamento.amount(\''+a+'\')">'+AMOUNT[a][0]+'<small>'+AMOUNT[a][1]+'</small></button>';}).join('')+'</div>';
    return h+'<div class="spacer"></div><button class="btn ghost" onclick="AlanExt.svezzamento.back()">Cambia alimento</button>';
  }
  if(flow.step===2){
    h+='<h2>Com\'è andata?</h2><div class="grid3 sv-how">';
    h+='<button style="--hc:'+REACTION.bene[2]+'" onclick="A.finish(\'bene\')">'+REACTION.bene[0]+'<small>'+REACTION.bene[1]+'</small></button>';
    h+='<button style="--hc:'+REACTION.nongradito[2]+'" onclick="A.finish(\'nongradito\')">'+REACTION.nongradito[0]+'<small>'+REACTION.nongradito[1]+'</small></button>';
    h+='<button style="--hc:'+REACTION.reazione[2]+'" onclick="AlanExt.svezzamento.react()">'+REACTION.reazione[0]+'<small>'+REACTION.reazione[1]+'</small></button>';
    h+='</div><p class="hint">'+API.esc(d.name)+' · '+amountTxt(d.amount)+'</p>';
    return h+'<button class="btn ghost" onclick="AlanExt.svezzamento.back()">Indietro</button>';
  }
  h+='<h2>Cosa hai notato?</h2><label class="f" for="svNote">Nota breve (facoltativa)</label><input class="f" id="svNote" type="text" maxlength="'+NOTE_MAX+'" value="'+API.esc(d.note||'')+'" placeholder="es. puntini rossi sul mento" oninput="AlanExt.svezzamento.note(this.value)">';
  h+='<p class="hint">La nota resta nel diario e sull\'altro telefono.</p><div class="spacer"></div>';
  h+='<button class="btn huge" onclick="A.finish(\'reazione\')">Salva</button><button class="btn ghost" onclick="AlanExt.svezzamento.back()">Indietro</button>';
  return h;
}
X.flow('food',{
  render:function(flow){return render(flow);},
  finish:function(flow,val){
    var d=flow.data||{},n=clean(d.name,NAME_MAX);
    if(!n)return null;
    var r=REACTION[val]?val:(REACTION[d.reaction]?d.reaction:null);
    if(!r)return null;
    var a=AMOUNT[d.amount]?d.amount:'assaggio';
    var e={k:'food',name:n,group:groupOf(d.group)?d.group:'altro',amount:a,reaction:r,note:r==='reazione'?clean(d.note,NOTE_MAX):''};
    return {e:e,msg:n+' · '+amountTxt(a)+' · '+reactionTxt(r)};
  }
});
X.describe('food',function(e){return [API.esc(e.name||'Alimento'),'<span class="detail">'+API.esc(detailTxt(e))+'</span>'];});

/* ---------- Salute ---------- */
function del(id){window.A.del(id);X.refresh();}
function toggleList(){listOpen=!listOpen;X.refresh();}
function foodRow(e){
  var r=REACTION[e.reaction];
  return '<div class="row sv-row"><div class="time"><small>'+API.fmtDate(e.t)+'</small></div><div class="what">'+API.esc(e.name)+' <span class="detail">'+amountTxt(e.amount)+'</span>'+(r?' <span class="tag" style="--hc:'+r[2]+'">'+r[0]+'</span>':'')+(e.reaction==='reazione'&&e.note?'<span class="who">'+API.esc(e.note)+'</span>':'')+(e.who?'<span class="who">'+API.esc(e.who)+'</span>':'')+'</div><button class="del" aria-label="Elimina" onclick="AlanExt.svezzamento.del(\''+e.id+'\')">×</button></div>';
}
function triedRow(f){
  var r=REACTION[f.reaction];
  return '<div class="row sv-row"><div class="time"><small>'+API.fmtDate(f.last)+'</small></div><div class="what">'+API.esc(f.name)+' <span class="detail">'+(f.n===1?'1 volta':f.n+' volte')+'</span>'+(r?' <span class="tag" style="--hc:'+r[2]+'">'+r[0]+'</span>':'')+(f.note?'<span class="who">'+API.esc(f.note)+'</span>':'')+'<span class="who">'+API.esc(groupLabel(f.group))+'</span></div><span></span></div>';
}
function card(){
  if(!active())return '<div class="card sv-card sv-soon"><h3>Svezzamento</h3><p class="hint">Si attiva verso i 4 mesi: qui segnerai gli alimenti provati e com\'è andata, uno alla volta.</p></div>';
  var s=summary(),h='<div class="card sv-card"><h3>Svezzamento</h3>';
  if(s.n){
    var bits=[];if(s.retry)bits.push(s.retry+' da riprovare');if(s.react)bits.push(s.react+' con reazione');
    h+='<div class="sv-sum"><b>'+s.n+'</b> '+(s.n===1?'alimento provato':'alimenti provati')+(bits.length?', '+bits.join(', '):'')+'</div>';
    h+='<div class="list">'+s.last.map(foodRow).join('')+'</div>';
  }else h+='<p class="hint">Nessun alimento ancora registrato. Ogni assaggio resta nel diario e sull\'altro telefono.</p>';
  h+='<div class="spacer"></div><button class="btn" onclick="AlanExt.svezzamento.open()">Nuovo alimento</button>';
  if(s.n>LAST_N||(s.n&&listOpen)){
    h+='<button class="sv-tog" aria-expanded="'+(listOpen?'true':'false')+'" onclick="AlanExt.svezzamento.toggleList()"><span>Tutti gli alimenti provati ('+s.n+')</span><span class="sv-chev">'+(listOpen?'▴':'▾')+'</span></button>';
    if(listOpen)h+='<div class="list">'+tried().map(triedRow).join('')+'</div>';
  }
  var sg=suggested(),any=false;
  sg.forEach(function(g){
    var shown=g.items.slice(0,CARD_MAX),more=g.items.length-shown.length;
    h+='<div class="sv-grp"><div class="sv-glbl"><span>'+API.esc(g.label)+'</span><span>'+(g.tried?g.tried+' su '+g.total+(g.tried===1?' provato':' provati'):'')+'</span></div>';
    if(!g.items.length){h+='<p class="hint sv-all">Tutti provati.</p></div>';return;}
    any=true;h+='<div class="chips">';
    shown.forEach(function(n){var idx=groupOf(g.key).items.indexOf(n);h+='<button class="sv-g" style="--gc:'+g.color+'" onclick="AlanExt.svezzamento.start(\''+g.key+'\','+idx+')">'+API.esc(n)+'</button>';});
    if(more>0)h+='<button class="sv-more" onclick="AlanExt.svezzamento.open()">+'+more+'</button>';
    h+='</div></div>';
  });
  h+='<p class="hint sv-memo">'+(any?'Tocca un alimento per registrarlo. ':'')+'Promemoria: un alimento nuovo alla volta.</p>';
  return h+'</div>';
}
function sig(){var f=foods();return f.length+'|'+(f.length?f[f.length-1].id+':'+(f[f.length-1]._updated||''):'')+'|'+API.ageDays();}
function check(){
  if(API.flow())return;
  var s=sig();if(s===lastSig)return;lastSig=s;
  if(API.curView()==='salute')X.refresh();
}

X.slot('salute',function(){lastSig=sig();return card();});
X.on('change',function(){try{check();}catch(e){}});
X.svezzamento={groups:GROUPS,AMOUNT:AMOUNT,REACTION:REACTION,ACTIVE_DAYS:ACTIVE_DAYS,tried:tried,suggested:suggested,summary:summary,active:active,card:card,render:render,describe:detailTxt,
  open:open,start:start,pick:pick,custom:custom,uncustom:uncustom,name:name,next:next,amount:amount,react:react,note:note,back:back,del:del,toggleList:toggleList,check:check};
X.refresh();
})();
