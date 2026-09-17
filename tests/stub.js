// Stub DOM condiviso dai test del motore: carica js/app.js senza browser.
// Uso: const {boot}=require('./stub'); const app=await boot();
//   app.A       → API pubblica (window.A)
//   app.T(expr) → valuta un'espressione dentro la closure di app.js (funzioni private: features, context, mergeRemote…)
//   app.S       → stato (S.events, S.settings, S.openCry)
//   app.txt(sel)→ testo (senza tag) dell'elemento stub
'use strict';
const fs=require('fs');
function mk(){return {classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelectorAll:()=>[],style:{},_h:'',set innerHTML(v){this._h=v},get innerHTML(){return this._h},textContent:'',value:'',scrollTop:0,set outerHTML(v){this._h=v},getAttribute(){return null},disabled:false};}
function boot(opts){
  opts=opts||{};
  const store={};
  global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
  const els={};
  global.document={querySelector:s=>els[s]||(els[s]=mk()),querySelectorAll:()=>[],addEventListener(){},hidden:false};
  global.window={confirm:()=>true,scrollTo(){},indexedDB:undefined,addEventListener(){},matchMedia:()=>({matches:false})};
  if(opts.AlanSync){global.window.AlanSync=opts.AlanSync;global.AlanSync=opts.AlanSync;}else{delete global.AlanSync;}
  Object.defineProperty(global,'navigator',{value:{userAgent:'test'},configurable:true,writable:true});
  global.TextEncoder=require('util').TextEncoder;global.TextDecoder=require('util').TextDecoder;
  global.btoa=s=>Buffer.from(s,'binary').toString('base64');global.atob=s=>Buffer.from(s,'base64').toString('binary');
  global.setInterval=()=>1;global.clearInterval=()=>{};
  global.Blob=class{constructor(parts,o){this.parts=parts;this.type=(o&&o.type)||'';this.size=parts.reduce((s,p)=>s+(p.byteLength||p.length||0),0);}};
  const src=fs.readFileSync(__dirname+'/../js/app.js','utf8').replace('window.A=A;','window.A=A;window.__T=function(n){return eval(n);};');
  eval(src);
  return new Promise(res=>setTimeout(()=>{
    const T=window.__T;
    res({A:window.A,T:T,S:T('S'),els:els,store:store,txt:sel=>String((els[sel]||{})._h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()});
  },80));
}
// frame sintetici per l'estrattore: profilo acustico che dipende dalla causa
function synth(label,seconds,opt){
  seconds=seconds||8;opt=opt||{};
  const base={fame:{f0:420,burst:900,pause:500},sonno:{f0:350,burst:600,pause:900},cambio:{f0:480,burst:1200,pause:400}}[label];
  const frames=[];let t=0,on=true,left=base.burst,rnd=opt.seed!=null?mulberry(opt.seed):Math.random;
  while(t<seconds*1000){
    const slope=opt.slope||0;
    frames.push({t,rms:on?0.05+rnd()*0.02:0.003,f0:on?base.f0+(rnd()-0.5)*(opt.jitter!=null?opt.jitter:60)+slope*(t%base.burst)/1000:null,zcr:on?800+rnd()*100:200,cent:on?1500+rnd()*300:400});
    t+=50;left-=50;if(left<=0){on=!on;left=on?base.burst:base.pause;}
  }
  return frames;
}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
module.exports={boot,synth};
