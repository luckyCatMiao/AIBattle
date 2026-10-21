const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld,drawHUD:drawHUD};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540;const canvas=createCanvas(W,H);const real=canvas.getContext('2d');
const log=[];
const ctx={};
const chain=['save','restore','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','arc','arcTo','ellipse','rect','fill','stroke','fillRect','strokeRect','clip','quadraticCurveTo','bezierCurveTo','setLineDash','clearRect','drawImage','setTransform','resetTransform','measureText','createLinearGradient','createRadialGradient'];
for(const m of chain){ctx[m]=function(...a){ if(m==='fillText'||m==='strokeText'){} return real[m](...a); }; }
ctx.fillText=function(t,x,y){log.push({op:'fill',t:String(t),x,y,font:real.font,fill:String(real.fillStyle),alpha:real.globalAlpha});return real.fillText(t,x,y);};
ctx.strokeText=function(t,x,y){log.push({op:'stroke',t:String(t),x,y,font:real.font,line:real.lineWidth});return real.strokeText(t,x,y);};
const props=['globalAlpha','globalCompositeOperation','fillStyle','strokeStyle','lineWidth','font','textAlign','textBaseline','imageSmoothingEnabled','lineCap','lineJoin','shadowBlur','shadowColor','filter','miterLimit','lineDashOffset'];
for(const p of props){Object.defineProperty(ctx,p,{get(){return real[p]},set(v){real[p]=v}});}
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world;
D.startGame();for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
w.player.combo=12; w.player.comboTimer=2.1;
D.drawHUD(ctx,w);
console.log('fillText/strokeText calls:',log.length);
for(const l of log) console.log(JSON.stringify(l));
