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
w.player.x=e.x-74;w.player.facing=1;w.player.lastChargeLevel=3;
const arm=e.getLimb('armR'); arm.hp=1;
e.takeHit(arm,{dmg:40,dir:1,kb:700,lift:220,heavy:true,x:w.player.x,y:arm.y,limbMul:3});
w.freeze=0;
const shots=[];
for(let i=0;i<14;i++){TIME+=16;w.update(1/120);
  const air=w.severed.filter(s=>!s.rest&&s.y<430);
  if(air.length){shots.push(i);
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
    D.drawWorld(ctx,w);D.drawHUD(ctx,w);
    fs.writeFileSync('/tmp/shots/sever_'+i+'.png',canvas.toBuffer('image/png'));}
}
console.log('frames with airborne severed limbs:',shots.join(',')||'none','total severed',w.severed.length);
