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
// let one real update settle limb positions before forcing the sever
for(let i=0;i<3;i++){TIME+=16;w.update(1/120);}
w.player.x=e.x-78;w.player.facing=1;
e.facing=-1; // facing the player so the right arm is on screen
e.updateLimbPositions();
const arm=e.getLimb('armR'); arm.hp=1;
const before={x:arm.x,y:arm.y};
e.takeHit(arm,{dmg:60,dir:1,kb:650,lift:240,heavy:true,x:w.player.x,y:arm.y,limbMul:4});
w.freeze=0;
const saved=[];
for(let i=0;i<24;i++){
  TIME+=16;w.update(1/120);
  const s=w.severed[0];
  if(s&&!s.rest&&i%3===0){
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
    D.drawWorld(ctx,w);D.drawHUD(ctx,w);
    fs.writeFileSync('/tmp/shots/sv_'+i+'.png',canvas.toBuffer('image/png'));
    saved.push([i,Math.round(s.x),Math.round(s.y),s.rot.toFixed(1),s.rest]);
  }
}
console.log('limb before',JSON.stringify(before),'frames',JSON.stringify(saved));
