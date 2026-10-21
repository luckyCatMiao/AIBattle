import {browser,gameURL} from './browser.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url), b=await browser();
const errors=[],results=[];
const page=await b.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',e=>errors.push(e.stack));
await page.clock.install();
// Read-only test instrumentation lives in this test copy only, not in game.html.
const html=readFileSync(new URL('game.html',root),'utf8');
const marker='requestAnimationFrame(frame);\n})();';
const instrument=`Object.defineProperty(window,'inspectCombat',{value:()=>JSON.parse(JSON.stringify({player,enemies,shots,stop,shake,wave,cam,paused,keys:[...keys],debris,arcs,audioState:audio?.state,muted,combo,hitCount,limbBreakCount}))});\n`;
assert(html.includes(marker));
await page.setContent(html.replace(marker,instrument+marker));
await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(80);
const state=()=>page.evaluate(()=>window.inspectCombat());
const bench=()=>page.evaluate(()=>window.combatBenchState());
const tick=ms=>page.clock.runFor(ms);
const press=async key=>{await page.keyboard.press(key);await tick(17);};
const hold=async(key,ms)=>{await page.keyboard.down(key);await tick(ms);await page.keyboard.up(key);};
const reset=async()=>{await press('r');await tick(1000);};
function ok(name,extra){results.push({name,...extra});console.log('PASS',name,extra||'');}
await press('Enter');await tick(1000);
assert((await bench()).playing);assert.equal((await bench()).enemyCount,3);ok('start and first wave');
let s=await state(),x=s.player.x;
await hold('d',200);assert((await state()).player.x>x+25);ok('horizontal movement');
await press('Space');await tick(130);let y=(await state()).player.y;
await press('Space');await tick(130);assert((await state()).player.y<y);ok('double jump');
await reset();
// A lone empty swing cannot create hit stop.
await hold('a',550);await press('j');await tick(80);
s=await state();if(s.hitCount===0)assert.equal(s.stop,0);ok('whiff does not freeze');
await reset();
await hold('d',260);await page.keyboard.down('j');
let stopSeen=false,freezeVerified=false,maxStop=0;
for(let i=0;i<190;i++){
  await tick(16);s=await state();
  if(s.stop>.018){stopSeen=true;maxStop=Math.max(maxStop,s.stop);const before=s;await tick(16);const after=await state();if(after.stop>0){assert.equal(after.player.x,before.player.x);assert.equal(after.player.action?.t,before.player.action?.t);freezeVerified=true;}}
}
await page.keyboard.up('j');
assert(stopSeen&&freezeVerified);assert((await bench()).hitCount>=3);assert((await bench()).limbBreakCount>=1);
ok('light combo, real contact freeze and limb break',{maxStop,...await bench()});
await reset();await hold('d',250);await page.keyboard.down('k');await tick(570);
s=await state();assert(s.player.charging&&s.player.charge>=.46);await page.keyboard.up('k');
let chargeStop=0,brokenSurvivor=false;
for(let i=0;i<55;i++){await tick(16);s=await state();chargeStop=Math.max(chargeStop,s.stop);brokenSurvivor ||= s.enemies.some(e=>!e.arm&&!e.dead&&e.hp>0);}
assert(chargeStop>=.1);assert(brokenSurvivor);assert(s.debris.some(d=>d.part==='arm'));ok('charged strike breaks a living weapon arm',{chargeStop});
await reset();await hold('d',300);await press('i');
let airborne=false,airHits=false;
for(let i=0;i<30;i++){await tick(16);s=await state();airborne ||= s.enemies.some(e=>e.y<520);}
await page.keyboard.down('j');await tick(450);await page.keyboard.up('j');s=await state();airHits=s.hitCount>1;
await press('k');await tick(700);assert(airborne);assert(airHits);ok('launcher and aerial follow-up');
await reset();const beforeDash=await state();await press('l');await tick(65);s=await state();assert(s.player.x>beforeDash.player.x+45);assert(s.player.invul>0);assert(s.player.dashStock===1);await tick(1100);assert.equal((await state()).player.dashStock,2);ok('dash movement, invulnerability and recharge');
await reset();await page.keyboard.down('d');await tick(90);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));s=await state();assert(s.paused&&s.keys.length===0);x=s.player.x;await tick(700);assert.equal((await state()).player.x,x);await page.keyboard.up('d');await press('Enter');await tick(250);assert(!(await state()).paused);ok('focus loss clears input and pauses');
await page.locator('#sound').click();assert((await state()).muted);await page.locator('#sound').click();assert(!(await state()).muted);ok('audio unlock and mute',{audioState:(await state()).audioState});
// An unattended player must take damage and die, then R must restore all real counters.
await reset();await tick(28000);s=await state();assert.equal((await bench()).playerAlive,false);assert.equal((await bench()).playing,false);ok('active enemies can kill the player');
await press('r');assert.deepEqual(await bench(),{ready:true,playerAlive:true,enemyCount:3,hitCount:0,limbBreakCount:0,playing:true});ok('one-key death restart resets real state');
// Fight continuously via ordinary key events; telemetry only selects directions.
await tick(900);
for(let i=0;i<200;i++){
  s=await state();if(!s.player.hp)break;
  const target=s.enemies.filter(e=>!e.dead).sort((a,b)=>Math.abs(a.x-s.player.x)-Math.abs(b.x-s.player.x))[0];
  if(!target){await tick(250);continue;}
  const dir=target.x>s.player.x?'d':'a',other=dir==='d'?'a':'d';await page.keyboard.up(other);
  if(Math.abs(target.x-s.player.x)>102){await page.keyboard.down(dir);await page.keyboard.up('j');}
  else{await page.keyboard.down(dir);await tick(17);await page.keyboard.up(dir);await page.keyboard.down('j');if(i%5===0){await page.keyboard.up('j');await hold('k',120);}}
  if(target.state==='wind'&&target.t>target.wind*.65&&s.player.dashStock>0)await press('l');
  await tick(140);if((await state()).wave>=3)break;
}
await page.keyboard.up('a');await page.keyboard.up('d');await page.keyboard.up('j');
s=await state();assert(s.wave>=2);assert(s.enemies.some(e=>e.type==='brute')||s.wave>=3);ok('continuous waves and heavy enemy',{wave:s.wave,...await bench()});
await page.screenshot({path:new URL('extended-combat.png',import.meta.url).pathname});
// Actual untouched deliverable in an opaque-origin allow-scripts iframe, offline.
const sand=await b.newPage({viewport:{width:960,height:540}});sand.on('pageerror',e=>errors.push(e.stack));
let remote=0;await sand.route('https://**',r=>{remote++;r.abort();});await sand.route('http://**',r=>{remote++;r.abort();});
await sand.setContent('<style>html,body{margin:0;width:100%;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts"></iframe>');
await sand.locator('iframe').evaluate((el,h)=>el.srcdoc=h,html);
const frame=await (await sand.locator('iframe').elementHandle()).contentFrame();
await frame.waitForFunction(()=>!!window.combatBenchState);await frame.locator('#start').click();await sand.waitForTimeout(300);
assert((await frame.evaluate(()=>window.combatBenchState())).playing);assert.equal(remote,0);
await sand.keyboard.down('d');await sand.waitForTimeout(260);await sand.keyboard.up('d');await sand.keyboard.down('j');await sand.waitForTimeout(1800);await sand.keyboard.up('j');
assert((await frame.evaluate(()=>window.combatBenchState())).hitCount>0);
await sand.screenshot({path:new URL('sandbox-960.png',import.meta.url).pathname});ok('offline opaque-origin sandbox, 960×540 and real combat');
await sand.setViewportSize({width:1920,height:800});await sand.waitForTimeout(200);await sand.screenshot({path:new URL('wide-1920.png',import.meta.url).pathname});ok('wide aspect ratio');
assert.equal(errors.length,0,errors.join('\n'));ok('no browser runtime errors');
writeFileSync(new URL('results.json',import.meta.url),JSON.stringify({results,errors,remoteRequests:remote},null,2));
await b.close();
