const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld,drawHUD:drawHUD};\n  requestAnimationFrame(frame);\n})();');
const W=1600,H=900;const canvas=createCanvas(W,H);const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world;
D.startGame();
for(const t of ['gnawer','samurai','puppet']) w.spawnEnemy(t,1);
for(let i=0;i<60;i++){TIME+=16;w.update(1/120);}
// warm up
for(let i=0;i<20;i++){ctx.setTransform(1,0,0,1,0,0);D.drawWorld(ctx,w);D.drawHUD(ctx,w);}
const N=120;
const t0=process.hrtime.bigint();
for(let i=0;i<N;i++){ctx.setTransform(1,0,0,1,0,0);D.drawWorld(ctx,w);D.drawHUD(ctx,w);}
const t1=process.hrtime.bigint();
const simT0=process.hrtime.bigint();
for(let i=0;i<N;i++){w.update(1/120);}
const simT1=process.hrtime.bigint();
console.log('draw', (Number(t1-t0)/1e6/N).toFixed(2)+'ms/frame at 1600x900');
console.log('sim ', (Number(simT1-simT0)/1e6/N).toFixed(3)+'ms/step');
