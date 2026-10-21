import {browser} from './browser.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),html=readFileSync(new URL('game.html',root),'utf8');
const manifest=JSON.parse(readFileSync(new URL('skill_manifest.json',root),'utf8'));
assert.equal(manifest.request_id,'user-four-skills-20261019');assert.equal(manifest.skills.length,4);
const b=await browser(),page=await b.newPage({viewport:{width:1280,height:720}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.stack));await page.clock.install();
const marker='requestAnimationFrame(frame);\n})();';
const observer=`Object.defineProperty(window,'skillInspect',{value:()=>JSON.parse(JSON.stringify({player,enemies,skillObjects:skillObjects.map(o=>({...o,hitOut:o.hitOut?[...o.hitOut]:null,hitBack:o.hitBack?[...o.hitBack]:null})),skillFX,hitCount,limbBreakCount,stop,wave,shots,paused,keys:[...keys]}))});\n`;
await page.setContent(html.replace(marker,observer+marker));await page.evaluate(()=>document.fonts.ready);
const tick=ms=>page.clock.runFor(ms),state=()=>page.evaluate(()=>window.skillInspect());
const press=async key=>{await page.keyboard.press(key);await tick(17);};
const hold=async(key,ms)=>{await page.keyboard.down(key);await tick(ms);await page.keyboard.up(key);};
const reset=async()=>{await press('r');await tick(1000);};
const ok=(name,data={})=>{results.push({name,...data});console.log('PASS',name,data);};
await page.screenshot({path:new URL('skills-title.png',import.meta.url).pathname});
for(let i=0;i<4;i++){
  await reset();if(i===1)await hold('d',260);
  const before=await state();await press(String(i+1));
  let hits=0,freeze=0,broken=0,air=false,out=0,back=0,cast=false,projectile=false;
  for(let j=0;j<160;j++){
    await tick(16);const s=await state();hits=Math.max(hits,s.hitCount);broken=Math.max(broken,s.limbBreakCount);freeze=Math.max(freeze,s.stop);
    cast ||= s.player.skill?.index===i;air ||= s.enemies.some(e=>e.y<515);projectile ||= s.skillObjects.length>0;
    for(const o of s.skillObjects){out=Math.max(out,o.hitOut?.length||0);back=Math.max(back,o.hitBack?.length||0);}
    if(j===(i===0?11:i===1?31:i===2?21:43))await page.screenshot({path:new URL('skill-'+(i+1)+'.png',import.meta.url).pathname});
  }
  const after=await state();assert(cast);assert(hits>0);assert(freeze>0);assert(after.player.skillCD[i]>0);assert(after.player.skillCD.filter((_,j)=>i!==j).every(cd=>cd===0));
  if(i===0){assert(after.player.x>before.player.x+240);assert(broken>0);}
  if(i===1){assert(hits>=3);assert(air);}
  if(i===2){assert(projectile);assert(out>0&&back>0);}
  if(i===3){assert(projectile);assert(broken>0);assert(air);}
  const cd=after.player.skillCD[i];await press(String(i+1));assert((await state()).player.skillCD[i]<=cd);assert.equal((await state()).player.skill,null);
  ok(manifest.skills[i].name+' independently hits; cooldown blocks repeat',{hits,broken,freeze,out,back});
}
// Empty space never produces impact freeze, including the delayed falling blade.
for(let i=0;i<4;i++){
  await reset();await hold('a',70);await press(String(i+1));let hit=false;
  for(let j=0;j<70;j++){await tick(16);const s=await state();if(s.hitCount>0)hit=true;if(!hit&&s.player.hp===100)assert.equal(s.stop,0);}
}
ok('skills do not manufacture hit-stop on a whiff');
// Air casts and original I/J/K actions remain independently available.
for(let i=0;i<4;i++){
  await reset();await press('Space');await tick(160);await press(String(i+1));assert.equal((await state()).player.skill?.index,i);await tick(900);
}
ok('all four skills cast in the air');
await reset();await press('3');await tick(180);await press('l');await tick(160);let s=await state();assert.equal(s.player.skill,null);assert(s.skillObjects.some(o=>o.kind==='swallow'));await tick(1000);assert((await state()).hitCount>0);ok('dash cancels recovery but released blade remains live');
await reset();await press('4');await tick(200);await hold('a',320);await tick(1000);assert((await state()).hitCount>0);ok('delayed nail hits while player moves independently');
await reset();await press('Numpad1');assert((await state()).player.skillCD[0]>0);ok('numeric keypad alias');
await press('r');s=await state();assert(s.player.skillCD.every(cd=>cd===0));assert.equal(s.skillObjects.length,0);assert.equal(s.skillFX.length,0);ok('restart clears active techniques and all cooldowns');
// Mix all four techniques with the original sword loop for several full waves.
await reset();
const casts=[0,0,0,0];
for(let step=0;step<300;step++){
  s=await state();if(s.player.hp<=0)break;
  const target=s.enemies.filter(e=>!e.dead&&e.spawn<=0).sort((a,b)=>Math.abs(a.x-s.player.x)-Math.abs(b.x-s.player.x))[0];
  if(!target){await tick(170);continue;}
  const direction=target.x>s.player.x?'d':'a';await page.keyboard.up(direction==='d'?'a':'d');
  if(Math.abs(target.x-s.player.x)>100){await page.keyboard.down(direction);await page.keyboard.up('j');}
  else{await page.keyboard.down(direction);await tick(17);await page.keyboard.up(direction);await page.keyboard.down('j');}
  if(!s.player.skill&&s.player.hurt<=0){
    const preferred=[3,2,0,1].find(i=>s.player.skillCD[i]<=0&&(i!==1||Math.abs(target.x-s.player.x)<205));
    if(preferred!==undefined){await press(String(preferred+1));await tick(50);if((await state()).player.skillCD[preferred]>0)casts[preferred]++;}
  }
  await tick(160);if((await state()).wave>=4)break;
}
await page.keyboard.up('a');await page.keyboard.up('d');await page.keyboard.up('j');s=await state();assert(s.wave>=3);assert(casts.every(n=>n>0));
ok('four skills mixed with original combat through continuous waves',{wave:s.wave,hitCount:s.hitCount,limbBreakCount:s.limbBreakCount,casts});
await page.screenshot({path:new URL('skills-mixed.png',import.meta.url).pathname});
// Unmodified deliverable, real opaque sandbox, all four separate buttons in normal play.
const sand=await b.newPage({viewport:{width:960,height:540}});sand.on('pageerror',e=>errors.push(e.stack));await sand.clock.install();
let requests=0;await sand.route(/^https?:/,r=>{requests++;r.abort();});
await sand.setContent('<style>html,body{margin:0;width:100%;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts"></iframe>');
await sand.locator('iframe').evaluate((el,h)=>el.srcdoc=h,html);const frame=await(await sand.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>window.combatBenchState);await frame.evaluate(()=>document.fonts.ready);
await sand.screenshot({path:new URL('skills-title-960.png',import.meta.url).pathname});await frame.locator('#start').click();await sand.clock.runFor(1000);
for(let i=1;i<=4;i++){
  await sand.keyboard.press('r');await sand.clock.runFor(1000);if(i===2){await sand.keyboard.down('d');await sand.clock.runFor(250);await sand.keyboard.up('d');}
  await sand.keyboard.press(String(i));await sand.clock.runFor(2200);assert((await frame.evaluate(()=>window.combatBenchState())).hitCount>0);
}
await sand.screenshot({path:new URL('skills-sandbox-960.png',import.meta.url).pathname});
assert.equal(requests,0);assert.equal(errors.length,0,errors.join('\n'));ok('all skills hit in offline allow-scripts sandbox; no runtime errors');
writeFileSync(new URL('skill-results.json',import.meta.url),JSON.stringify({request_id:manifest.request_id,results,errors,networkRequests:requests},null,2));await b.close();
