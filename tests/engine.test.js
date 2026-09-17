// Harness a stub DOM per il motore: node tests/engine.test.js
// stubs
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}};
const els={};
function mk(){return {classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelectorAll:()=>[],style:{},_h:'',set innerHTML(v){this._h=v},get innerHTML(){return this._h},textContent:'',value:'',scrollTop:0,set outerHTML(v){this._h=v}};}
global.document={querySelector:s=>els[s]||(els[s]=mk()),querySelectorAll:()=>[],addEventListener(){}};
global.window={confirm:()=>true,scrollTo(){},indexedDB:undefined,addEventListener(){}};
global.navigator={};
global.TextEncoder=require('util').TextEncoder; global.TextDecoder=require('util').TextDecoder;
global.btoa=s=>Buffer.from(s,'binary').toString('base64'); global.atob=s=>Buffer.from(s,'base64').toString('binary');
global.setInterval=()=>1; global.clearInterval=()=>{};
const src=require('fs').readFileSync(__dirname+'/../js/app.js','utf8').replace('window.A=A;','window.A=A;window.__T=function(n){return eval(n);};');
eval(src);
const A=window.A;
(async()=>{
 await new Promise(r=>setTimeout(r,200));
 const txt=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 // synthetic frames generator: label-dependent acoustic profile
 function synth(label, seconds=8){
   const frames=[]; const base={fame:{f0:420,burst:900,pause:500},sonno:{f0:350,burst:600,pause:900},cambio:{f0:480,burst:1200,pause:400}}[label];
   let t=0, on=true, left=base.burst;
   while(t<seconds*1000){ const on_=on; frames.push({t, rms:on_?0.05+Math.random()*0.02:0.003, f0:on_?base.f0+(Math.random()-0.5)*60:null, zcr:on_?800+Math.random()*100:200, cent:on_?1500+Math.random()*300:400}); t+=50; left-=50; if(left<=0){on=!on; left=on?base.burst:base.pause;} }
   return frames;
 }
  const T=window.__T; const features=T('features'), hypotheses=T('hypotheses'), accuracy=T('accuracy'), S=T('S'), context=T('context'), snapshot=T('snapshot'), bins=T('bins'), audioVote=T('audioVote');
 // build dataset of 12 labeled cries with synthetic features and random contexts
 const labels=['fame','sonno','cambio'];
 for(let i=0;i<12;i++){ const l=labels[i%3]; const f=features(synth(l)); const t=Date.now()-(i+1)*3*3600e3; const c=context(t); S.events.push({id:'c'+i,k:'cry',t,dur:8,label:l,ctx:snapshot(c),bins:bins(c),feat:f,audio:false}); }
 console.log('feat vec example', features(synth('fame')).vec.map(x=>+x.toFixed(2)));
 const acc=accuracy(); console.log('accuracy', JSON.stringify(acc));
 const v=audioVote(features(synth('sonno')).vec,null); console.log('vote for synthetic sonno', JSON.stringify(v.p), 'nearest', v.nearest.map(x=>x.label));
 // now the flows
 A.flow('feed'); console.log('FEED0:',txt(els['#screenInner']._h).slice(0,200));
 A.pick('prep',90); console.log('FEED1:',txt(els['#screenInner']._h).slice(0,120));
 A.finish(80); console.log('diary:',txt(els['#diary']._h).slice(0,120));
 A.flow('diaper'); A.pick('pipi','tanta'); A.finish('no'); console.log('diary:',txt(els['#diary']._h).slice(0,120));
 A.flow('sleep'); console.log('SLEEP:',txt(els['#screenInner']._h).slice(0,120)); A.finish('sleep');
 A.flow('sleep'); A.finish('wake');
 // cry without mic: openCry → startRec sets nomic
 A.openCry(); console.log('CRY:',txt(els['#screenInner']._h).slice(0,300));
 A.stopRec(); await new Promise(r=>setTimeout(r,50));
 console.log('AFTER:',txt(els['#screenInner']._h).slice(0,200));
 console.log('openCry', S.openCry);
 A.flow('feed', S.openCry); A.pick('prep',120); A.finish(120);
 console.log('toast:',els['#toast'].textContent);
 console.log('labeled last cry:', S.events.filter(e=>e.k==='cry').slice(-1)[0].label);
 T('renderCries()'); console.log('CRIES:',txt(els['#cries']._h).slice(0,300));
 T('renderStats()'); console.log('STATS:',txt(els['#stats']._h).slice(0,400));
 A.exportData(); console.log('export len', (els['#impTxt'].value||'').length);
})();
