/* Attribute the mysterious hollow rounded rectangle: diff a frame with vs without entities. */
const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld,drawHUD:drawHUD};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540;
function mkCanvas(){return createCanvas(W,H);}
const canvas=mkCanvas();const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world;
D.startGame();for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
w.player.x=600;w.player.facing=1;w.player.charging=true;w.player.chargeT=1.25;
w.spawnEnemy('samurai',1);w.spawnEnemy('puppet',1);
for(let i=0;i<12;i++){TIME+=16;w.update(1/120);}
// frame A: everything
ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
D.drawWorld(ctx,w);D.drawHUD(ctx,w);
const A=ctx.getImageData(0,0,W,H).data;
// frame B: entities cleared
const saved={enemies:w.enemies.slice(),severed:w.severed.slice(),orbs:w.orbs.slice()};
w.enemies.length=0;w.severed.length=0;w.orbs.length=0;w.fx.reset();
ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
D.drawWorld(ctx,w);D.drawHUD(ctx,w);
const B=ctx.getImageData(0,0,W,H).data;
w.enemies=saved.enemies;w.severed=saved.severed;w.orbs=saved.orbs;
let minX=1e9,minY=1e9,maxX=-1,maxY=-1,n=0;
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4;
  const d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2]);
  if(d>24){n++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;}
}
console.log('diff pixels',n,'bbox',n?[minX,minY,maxX,maxY]:'none');
console.log('player world',w.player.x.toFixed(0),'cam',w.cam.x.toFixed(0),w.cam.y.toFixed(0));
// Save frame A for viewing
fs.writeFileSync('/tmp/shots/artifact_A.png',canvas.toBuffer('image/png'));
