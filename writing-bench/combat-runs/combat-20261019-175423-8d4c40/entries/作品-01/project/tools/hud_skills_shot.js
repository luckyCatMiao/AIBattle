const fs=require('fs');const {createCanvas}=require('/tmp/cv/node_modules/@napi-rs/canvas');const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.replace('  requestAnimationFrame(frame);\n})();','  window.__debug={world:world,startGame:startGame,drawWorld:drawWorld,drawHUD:drawHUD};\n  requestAnimationFrame(frame);\n})();');
for (const [W,H,name] of [[960,540,'hud_960'],[1280,540,'hud_wide']]) {
  const canvas=createCanvas(W,H);const ctx=canvas.getContext('2d');
  function el(x){return Object.assign({style:{},textContent:'',width:W,height:H,classList:{add(){},remove(){},contains(){return false}},addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:W,height:H}},getContext(){return ctx}},x||{});}
  const els={stage:el(),app:el(),muteBtn:el(),deathPanel:el(),titlePanel:el()};
  global.window={addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:W,innerHeight:H};
  global.document={getElementById(id){return els[id]||el()},addEventListener(){},hidden:false,documentElement:el()};
  let TIME=0;global.performance={now:()=>TIME};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  delete require.cache[require.resolve('/tmp/bundle.js')];
  const code = js.replace('requestAnimationFrame(frame);\n})();','requestAnimationFrame(frame);\n})();');
  vm.runInThisContext(code,{filename:'bundle_'+W+'.js'});
  const D=global.window.__debug,w=D.world,p=w.player;
  w.cam.resize(W,H);
  D.startGame();
  for(let i=0;i<200;i++){TIME+=16;w.update(1/120);}
  // put skills on varied cooldowns
  p.skillCd[0]=3.2; p.skillCd[1]=0; p.skillCd[2]=6.1; p.skillCd[3]=18.4;
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#07040a';ctx.fillRect(0,0,W,H);
  D.drawWorld(ctx,w);D.drawHUD(ctx,w);
  fs.writeFileSync('/tmp/shots/'+name+'.png',canvas.toBuffer('image/png'));
  console.log(name,'ok');
}
