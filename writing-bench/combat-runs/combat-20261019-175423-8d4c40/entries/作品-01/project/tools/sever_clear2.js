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
w.player.x=e.x-80;w.player.facing=1;
const arm=e.getLimb('armR'); arm.hp=1;
e.takeHit(arm,{dmg:50,dir:1,kb:700,lift:260,heavy:true,x:w.player.x,y:arm.y,limbMul:4});
w.freeze=0;
const frames=[];
for(let i=0;i<26;i++){TIME+=16;w.update(1/120);
  const s=w.severed[0];
  if(s&&!s.rest){
    w.cam.x=e.x-40; w.cam.y=300; w.cam.zoom=1; w.cam.offX=0; w.cam.offY=0;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
    D.drawWorld(ctx,w);D.drawHUD(ctx,w);
    const name='/tmp/shots/sev2_'+i+'.png';
    fs.writeFileSync(name,canvas.toBuffer('image/png'));
    frames.push([i,Math.round(s.x),Math.round(s.y)]);
  }
}
console.log('frames',JSON.stringify(frames.slice(0,8)),'... total',frames.length);
