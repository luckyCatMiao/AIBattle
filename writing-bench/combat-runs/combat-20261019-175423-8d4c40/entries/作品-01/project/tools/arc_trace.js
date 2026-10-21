const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540;const canvas=createCanvas(W,H);const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug,w=D.world;
D.startGame();
for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
const e=w.spawnEnemy('samurai',1);e.spawnT=0;e.state='idle';
w.player.x=e.x-90;w.player.facing=1;
w.player.tryAttack('H3',true);
const a=w.fx.arclights[0];
console.log('arc', JSON.stringify(a));
console.log('player', w.player.x, w.player.y, 'camera', w.cam.x, w.cam.y, 'zoom', w.cam.zoom, 'vw', w.cam.vw, w.cam.vh);
const sx = a.x - w.cam.x + w.cam.vw/2, sy = a.y - w.cam.y + w.cam.vh/2;
console.log('arc screen approx', sx.toFixed(1), sy.toFixed(1), 'radius', a.radius);
// draw ONLY the fx to isolate
ctx.setTransform(1,0,0,1,0,0);
ctx.fillStyle='#101018';ctx.fillRect(0,0,W,H);
ctx.save();
w.cam.apply(ctx);
ctx.save();ctx.globalCompositeOperation='lighter';
// replicate fx arc loop manually via fx.draw
w.fx.draw(ctx, true);
ctx.restore();
ctx.restore();
fs.writeFileSync('/tmp/shots/arc_isolated.png',canvas.toBuffer('image/png'));
console.log('isolated fx drawn; parts',w.fx.parts.length,'arcs',w.fx.arclights.length);
