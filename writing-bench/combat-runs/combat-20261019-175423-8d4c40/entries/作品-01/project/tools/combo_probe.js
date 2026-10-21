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
D.startGame();
for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
w.player.combo=7; w.player.comboTimer=2.0;
ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
D.drawWorld(ctx,w);D.drawHUD(ctx,w);
const px=ctx.getImageData(830,150,140,80).data;
let bright=0,maxc=0;
for(let i=0;i<px.length;i+=4){const v=px[i]+px[i+1]+px[i+2]; if(v>maxc)maxc=v; if(v>180)bright++;}
console.log('bright pixels in combo area:',bright,'max sum:',maxc);
ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
// draw text alone
ctx.textAlign='right';ctx.textBaseline='middle';
ctx.font='900 52px "Trebuchet MS",sans-serif';
ctx.fillStyle='#ff0000';
ctx.fillText('7',900,184);
const px2=ctx.getImageData(830,150,140,80).data;let r=0;
for(let i=0;i<px2.length;i+=4) if(px2[i]>100) r++;
console.log('plain red digit pixels:',r);
fs.writeFileSync('/tmp/shots/combo_probe.png',canvas.toBuffer('image/png'));
