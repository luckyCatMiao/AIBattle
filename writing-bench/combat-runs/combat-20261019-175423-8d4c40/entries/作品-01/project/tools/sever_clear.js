const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld,drawHUD:drawHUD};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540;const canvas=createCanvas(W,H);const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world;
D.startGame();for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
const e=w.spawnEnemy('samurai',1);e.spawnT=0;e.state='idle';
// place player left, force a limb sever with strong upward+rightward launch into open air
w.player.x=e.x-80;w.player.facing=1;
const arm=e.getLimb('armR'); arm.hp=1;
e.takeHit(arm,{dmg:50,dir:1,kb:700,lift:260,heavy:true,x:w.player.x,y:arm.y,limbMul:4});
w.freeze=0;
// advance until the piece is ~60px above ground and away from the body, then draw
let saved=false;
for(let i=0;i<40 && !saved;i++){TIME+=16;w.update(1/120);
  const s=w.severed[0];
  if(s && !s.rest && s.y < 430 && Math.abs(s.x-e.x)>70){
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
    D.drawWorld(ctx,w);D.drawHUD(ctx,w);
    fs.writeFileSync('/tmp/shots/sever_clear.png',canvas.toBuffer('image/png'));
    console.log('saved frame',i,'piece at',s.x.toFixed(0),s.y.toFixed(0),'rot',s.rot.toFixed(2),'enemy at',e.x.toFixed(0));
    saved=true;
  }
}
if(!saved){const s=w.severed[0];console.log('no clear frame; piece',s&&{x:s.x,y:s.y,rest:s.rest});}
