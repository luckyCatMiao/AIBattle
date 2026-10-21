const fs=require('fs');
const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');
const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');
let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();',
 '  window.__debug={world:world,input:input,startGame:startGame,restartGame:restartGame,drawWorld:drawWorld,drawHUD:drawHUD};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540; const canvas=createCanvas(W,H); const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},removeEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx},focus(){},blur(){}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
const winL={};
global.window={addEventListener(t,f){(winL[t]=winL[t]||[]).push(f)},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0; global.performance={now:()=>TIME};
global.requestAnimationFrame=()=>1; global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world;
const shot=n=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,canvas.width,canvas.height);D.drawWorld(ctx,w);D.drawHUD(ctx,w);fs.writeFileSync('/tmp/shots/'+n+'.png',canvas.toBuffer('image/png'));};
D.startGame();
for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
const e=w.spawnEnemy('gnawer',1);
w.player.x=e.x-72; w.player.facing=1;
// step through light attack frame by frame, shoot at the moment of the swing
w.player.tryAttack('L1',false);
for(let i=0;i<9;i++){TIME+=16;w.update(1/120);}
shot('i01_light_swing');
for(let i=0;i<3;i++){TIME+=16;w.update(1/120);}
shot('i02_light_after');
// heavy charged swing
w.player.x=e.x-74; w.player.facing=1; w.player.lastChargeLevel=3;
w.player.tryAttack('H3',true);
for(let i=0;i<15;i++){TIME+=16;w.update(1/120);}
shot('i03_heavy_swing');
// wait until a limb severs; capture the frame with most severed pieces in air
let best=0,bestT=0;
for(let i=0;i<60;i++){TIME+=16;w.update(1/120); const n=w.severed.filter(s=>!s.rest).length; if(n>best){best=n;bestT=i;}}
// re-run to capture that frame
D.restartGame();
for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
const e2=w.spawnEnemy('samurai',1);
w.player.x=e2.x-76; w.player.facing=1; w.player.lastChargeLevel=3;
w.player.tryAttack('H3',true);
for(let i=0;i<30;i++){TIME+=16;w.update(1/120);}
// force sever on arm to guarantee the visual
const arm=e2.getLimb('armR');
arm.hp=1; w.player.world && null;
e2.takeHit(arm,{dmg:40,dir:1,kb:600,lift:200,heavy:true,x:w.player.x,y:arm.y,limbMul:3});
w.freeze=0;
for(let i=0;i<5;i++){TIME+=16;w.update(1/120);}
shot('i04_sever_frame');
// puppet orb + charge aura
w.player.charging=true; w.player.chargeT=1.3; w.player.x=520; w.player.y=470;
w.spawnEnemy('puppet',1);
for(let i=0;i<120;i++){TIME+=16;w.update(1/120);}
w.spawnOrb(w.enemies.find(x=>x.typeKey==='puppet'&&!x.dead)||w.enemies[0],1);
for(let i=0;i<8;i++){TIME+=16;w.update(1/120);}
shot('i05_charge_orb');
console.log('impact frames written; severed at best frame',best,'freeze',w.freeze);
