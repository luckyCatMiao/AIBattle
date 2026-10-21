const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld,drawHUD:drawHUD,drawSkillScreenFx:drawSkillScreenFx};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540;const canvas=createCanvas(W,H);const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world,p=w.player;
function shot(n){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);D.drawWorld(ctx,w);D.drawHUD(ctx,w);D.drawSkillScreenFx(ctx,w);fs.writeFileSync('/tmp/shots/'+n+'.png',canvas.toBuffer('image/png'));}
function step(n){for(let i=0;i<n;i++){TIME+=16;w.update(1/120);}}
D.startGame(); step(200);
function setup(){ const arr=[]; for(let i=0;i<3;i++){const e=w.spawnEnemy(i===2?'samurai':'gnawer',1); e.spawnT=0; e.state='idle'; w.enemies.push(); arr.push(e);} return arr; }
let es=setup(); es[0].x=p.x+80; es[1].x=p.x-70; es[2].x=p.x+150; step(4);
// 1 moon wheel mid-swing
p.startSkill(0); step(14); shot('k1_moonwheel'); step(40);
// 2 shadow rend: dash mid-flight and detonation
es=setup(); es[0].x=p.x+80; es[1].x=p.x+140; es[2].x=p.x+200; step(4);
p.skillCd[1]=0; p.startSkill(1); step(8); shot('k2_shadow_dash'); step(16); shot('k3_shadow_detonate'); step(40);
// 3 blade rain: mid fall
es=setup(); es[0].x=p.x+60; es[1].x=p.x-40; step(4);
p.skillCd[2]=0; p.startSkill(2); step(22); shot('k4_bladerain'); step(60);
// 4 ultimate: pulse phase and final slash
es=setup(); es[0].x=p.x+90; es[1].x=p.x-110; es[2].x=p.x+200; step(4);
p.skillCd[3]=0; p.startSkill(3); step(30); shot('k5_ultimate_pulse'); step(120); shot('k6_ultimate_final'); step(60);
console.log('skill shots done; enemy hp', w.enemies.filter(e=>!e.dead).map(e=>e.hp.toFixed(0)).join(','), 'severed', w.severed.length);
