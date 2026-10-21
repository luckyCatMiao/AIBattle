import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { launch, inspectable } from './browser.mjs';
const html = await readFile(new URL('../game.html',import.meta.url),'utf8');
const browser = await launch();
const page = await browser.newPage({viewport:{width:1280,height:720}});
const errors=[], requests=[], results=[];
page.on('pageerror',e=>errors.push(e.stack));
page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const wait=ms=>page.waitForTimeout(ms);
const state=()=>page.evaluate(()=>window.__inspectCombat());
async function restart(){await page.keyboard.press('r');await wait(60);}
async function until(fn,timeout=7000){await page.waitForFunction(fn,null,{timeout,polling:20});}
async function test(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name);}
try {
  await page.setContent(inspectable(html));await page.evaluate(()=>document.fonts.ready);
  await test('就绪、离线资源、只读状态接口',async()=>{
    const s=await page.evaluate(()=>combatBenchState());assert.equal(s.ready,true);assert.equal(s.playing,false);assert.equal(s.hitCount,0);assert.equal(s.enemyCount,3);
    const d=await page.evaluate(()=>{const p=Object.getOwnPropertyDescriptor(window,'combatBenchState');return {writable:p.writable,configurable:p.configurable};});assert.deepEqual(d,{writable:false,configurable:false});
    assert(await page.evaluate(()=>document.fonts.check('12px FoundryCJK')));
  });
  await test('开始、移动、二段跳和无命中不停顿',async()=>{
    await page.keyboard.press('Enter');await wait(60);const x=(await state()).player.x;
    await page.keyboard.down('a');await wait(180);await page.keyboard.up('a');assert((await state()).player.x<x-30);
    await page.keyboard.press('Space');await wait(160);const y=(await state()).player.y;assert(y<500);
    await page.keyboard.press('Space');await wait(80);assert((await state()).player.vy<0);assert.equal((await state()).player.airJump,false);
    await restart();await page.keyboard.press('j');await wait(110);assert.equal((await state()).freeze,0);assert.equal((await page.evaluate(()=>combatBenchState())).hitCount,0);
  });
  await test('蓄力重击真实断臂、飞散肢体与差异顿帧',async()=>{
    await restart();await page.keyboard.down('d');await wait(320);await page.keyboard.up('d');
    await page.keyboard.down('k');await wait(560);assert.equal((await state()).player.chargeReady,true);await page.keyboard.up('k');
    await until(()=>combatBenchState().limbBreakCount>0);
    const s=await state();assert(s.enemies.some(e=>!e.arm));assert(s.debris.some(d=>d.type==='arm'));assert(s.freeze>.04);assert(s.player.hp>0);
    await page.screenshot({path:'/workspace/tests/charged.png'});
  });
  await test('挑空、空中追击、下劈断腿并改变机动',async()=>{
    await restart();await wait(950);await page.keyboard.down('d');await wait(220);await page.keyboard.up('d');await page.keyboard.press('i');await wait(290);
    let s=await state();assert(s.player.y<530);assert(s.enemies.some(e=>e.y<530));assert(s.player.core<100);
    await page.keyboard.press('k');await until(()=>window.__inspectCombat().enemies.some(e=>!e.leg));
    s=await state();assert(s.debris.some(d=>d.type==='leg'));assert(s.enemies.some(e=>!e.leg&&!e.dead));
    await wait(350);await page.screenshot({path:'/workspace/tests/slam.png'});
  });
  await test('闪身取消和冷却、敌人前兆与玩家受伤',async()=>{
    await restart();await page.keyboard.press('j');await wait(55);await page.keyboard.press('l');await wait(40);
    let s=await state();assert.equal(s.player.action,'dash');assert(s.player.invuln>0);assert(s.player.dashCD>0);
    await restart();await until(()=>window.__inspectCombat().enemies.some(e=>e.state==='windup'));
    s=await state();assert(s.enemies.some(e=>e.state==='windup'&&e.t<.8));
    await until(()=>window.__inspectCombat().player.hp<120);assert((await state()).player.invuln>0);
  });
  await test('连续战斗、连击、击杀与第二波刷新',async()=>{
    await restart();await page.keyboard.down('j');await until(()=>window.__inspectCombat().wave>=2,17000);await page.keyboard.up('j');
    const s=await state();assert(s.kills>=3);assert((await page.evaluate(()=>combatBenchState())).hitCount>10);
    await wait(700);assert((await page.evaluate(()=>combatBenchState())).enemyCount>0);
    await page.screenshot({path:'/workspace/tests/wave2.png'});
  });
  await test('失焦清空输入、暂停及恢复',async()=>{
    await restart();await page.keyboard.down('d');await wait(80);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('d');
    const before=await state();assert.equal(before.mode,'paused');assert.equal(before.keys.length,0);await wait(200);assert.equal((await state()).player.x,before.player.x);
    await page.keyboard.press('Enter');await wait(180);const after=await state();assert.equal(after.mode,'playing');assert(Math.abs(after.player.x-before.player.x)<25);
  });
  await test('静音按钮、按键防滚动和最小视口布局',async()=>{
    await page.locator('#muteBtn').click();assert.equal(await page.locator('#muteBtn').textContent(),'声音 OFF');await page.locator('#muteBtn').click();
    await page.setViewportSize({width:960,height:540});await wait(150);
    const boxes=await page.locator('#controls>div').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,right:r.right,y:r.y,bottom:r.bottom};}));
    assert(boxes.every(b=>b.x>=0&&b.right<=960&&b.y>=0&&b.bottom<=540));
    await page.screenshot({path:'/workspace/tests/960x540.png'});
    const prevented=await page.evaluate(()=>['Space','ArrowLeft','ArrowRight','KeyJ','KeyK','KeyL','KeyI'].map(code=>{const e=new KeyboardEvent('keydown',{code,cancelable:true});window.dispatchEvent(e);window.dispatchEvent(new KeyboardEvent('keyup',{code}));return e.defaultPrevented;}));assert(prevented.every(Boolean));
    await page.setViewportSize({width:1920,height:800});await wait(100);await page.screenshot({path:'/workspace/tests/widescreen.png'});
    await page.setViewportSize({width:1280,height:720});
  });
  await test('自然死亡、一键重开和状态清零',async()=>{
    await restart();await until(()=>!combatBenchState().playerAlive,45000);await wait(1200);assert.equal((await state()).mode,'dead');assert.equal(await page.locator('#hpText').textContent(),'0 / 120');
    await page.screenshot({path:'/workspace/tests/death.png'});
    await page.keyboard.press('Enter');await wait(90);const s=await page.evaluate(()=>combatBenchState());assert.equal(s.playerAlive,true);assert.equal(s.playing,true);assert.equal(s.hitCount,0);assert.equal(s.limbBreakCount,0);
  });
  await test('allow-scripts 无同源沙箱、无音频回退与文件直接打开',async()=>{
    const sandbox=await browser.newPage({viewport:{width:1280,height:720}});sandbox.on('pageerror',e=>errors.push(e.stack));
    await sandbox.setContent('<iframe sandbox="allow-scripts" style="border:0;width:960px;height:540px"></iframe>');
    const frame=sandbox.frames()[1];
    const silent=html.replace("'use strict';","window.AudioContext=undefined;window.webkitAudioContext=undefined;'use strict';");
    await sandbox.locator('iframe').evaluate((node,content)=>node.srcdoc=content,silent);
    await frame.waitForFunction(()=>typeof combatBenchState==='function');await frame.locator('#startBtn').click();
    await frame.locator('body').press('j');await sandbox.waitForTimeout(200);assert.equal(await frame.evaluate(()=>combatBenchState().playing),true);await sandbox.close();
    const direct=await browser.newPage();direct.on('pageerror',e=>errors.push(e.stack));await direct.goto('file:///workspace/game.html');await direct.keyboard.press('Enter');await direct.waitForTimeout(250);assert.equal(await direct.evaluate(()=>combatBenchState().playing),true);await direct.close();
  });
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(requests.length,0,'External requests: '+requests);
  console.log('ALL TESTS PASSED: '+results.length+'; page errors: 0; external resource requests: 0');
} catch(e) {
  results.push({status:'failed',message:e.stack});console.error(e);process.exitCode=1;
  await page.screenshot({path:'/workspace/tests/failure.png'}).catch(()=>{});
} finally {
  await writeFile('/workspace/tests/results.json',JSON.stringify({results,errors,requests},null,2));await browser.close();
}
