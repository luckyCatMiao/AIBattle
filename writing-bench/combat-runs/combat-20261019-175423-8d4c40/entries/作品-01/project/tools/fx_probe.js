const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,input:input,startGame:startGame,restartGame:restartGame,drawWorld:drawWorld,drawHUD:drawHUD};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540;const canvas=createCanvas(W,H);const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},removeEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx},focus(){},blur(){}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world;
const shot=n=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,canvas.width,canvas.height);D.drawWorld(ctx,w);D.drawHUD(ctx,w);fs.writeFileSync('/tmp/shots/'+n+'.png',canvas.toBuffer('image/png'));};
D.startGame();
for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
const e=w.spawnEnemy('samurai',1); e.spawnT=0;e.state='idle';
w.player.x=e.x-90;w.player.facing=1;
console.log('before attack arcs',w.fx.arclights.length,'streaks',w.fx.streaks.length,'parts',w.fx.parts.length);
w.player.tryAttack('H3',true);
console.log('after tryAttack arcs',w.fx.arclights.length,JSON.stringify(w.fx.arclights[0]));
shot('f01_tick0');
TIME+=16;w.update(1/120);
console.log('tick1 arcs',w.fx.arclights.length,'t',w.fx.arclights[0]&&w.fx.arclights[0].t);
shot('f02_tick1');
for(let i=0;i<4;i++){TIME+=16;w.update(1/120);}
console.log('tick5 arcs',w.fx.arclights.length,'hitCount',w.stats.hitCount,'freeze',w.freeze);
shot('f03_tick5');
for(let i=0;i<10;i++){TIME+=16;w.update(1/120);}
console.log('tick15 arcs',w.fx.arclights.length);
shot('f04_tick15');
