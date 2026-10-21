const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld,drawHUD:drawHUD,drawSeveredPiece:drawSeveredPiece};\n  requestAnimationFrame(frame);\n})();');
const W=960,H=540;const canvas=createCanvas(W,H);const ctx=canvas.getContext('2d');
function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
vm.runInThisContext(js,{filename:'bundle.js'});
const D=global.window.__debug;
ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0b0710';ctx.fillRect(0,0,W,H);
const types=[['head',200],['armR',420],['armL',620],['legs',820]];
for(const [id,x] of types){
  D.drawSeveredPiece(ctx,{id,x,y:300,rot:0,size:id==='legs'?1.55:id==='head'?1.2:1.5,color:'#3a3f52',darker:'#171a26',accent:'#d8a638',life:1,rest:false});
  ctx.fillStyle='#88ffaa';ctx.font='14px monospace';ctx.textAlign='center';
  ctx.fillText(id,x,360);
}
// second row rotated as resting
for(const [id,x] of types){
  D.drawSeveredPiece(ctx,{id,x,y:460,rot:Math.PI/2,size:id==='legs'?1.55:id==='head'?1.2:1.5,color:'#6b2b3c',darker:'#2a0f18',accent:'#ff6b8a',life:1,rest:true});
}
fs.writeFileSync('/tmp/shots/piece_showcase.png',canvas.toBuffer('image/png'));
console.log('showcase ok');
