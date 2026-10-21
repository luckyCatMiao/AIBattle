import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { launch, inspectable } from './browser.mjs';
const html=await readFile(new URL('../game.html',import.meta.url),'utf8');
const browser=await launch(),page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.stack));
const wait=ms=>page.waitForTimeout(ms),state=()=>page.evaluate(()=>__inspectCombat());
const bench=()=>page.evaluate(()=>combatBenchState());
async function restart(delay=900){await page.keyboard.press('r');await wait(delay);}
async function test(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name);}
try{
  await page.setContent(inspectable(html));await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'/workspace/tests/skills-title.png'});
  await test('Q 缚星磁涡：独立聚敌伤害、实况位移、连斩衔接',async()=>{
    await page.keyboard.press('Enter');await wait(900);const before=await state();
    await page.keyboard.press('q');await page.waitForFunction(()=>combatBenchState().hitCount>0);await wait(180);
    let s=await state();assert.equal(s.player.skillUses.vortex,1);assert(s.player.skillCD.vortex>0);assert(s.skillObjects.some(o=>o.kind==='vortex'));
    const id=before.enemies[0].id,original=before.enemies[0].x-before.player.x,after=s.enemies.find(e=>e.id===id);assert(Math.abs(after.x-s.player.x)<Math.abs(original));
    await page.screenshot({path:'/workspace/tests/skill-Q.png'});
    await page.keyboard.down('j');await wait(1000);await page.keyboard.up('j');assert((await bench()).hitCount>2);
  });
  await test('E 裂轨一闪：穿阵、延迟爆裂、断臂和无敌窗口',async()=>{
    await restart(700);const x=(await state()).player.x;await page.keyboard.press('e');await wait(140);let s=await state();assert(s.player.invuln>0);assert.equal(s.player.skillUses.pierce,1);
    await wait(190);s=await state();assert(s.player.x>x+180);assert(s.skillObjects.some(o=>o.kind==='rupture')||s.skillFX.some(f=>f.kind==='mark'));
    await page.screenshot({path:'/workspace/tests/skill-E.png'});
    await page.waitForFunction(()=>combatBenchState().limbBreakCount>0);assert((await state()).enemies.some(e=>!e.arm));assert((await bench()).hitCount>=2);
  });
  await test('U 双月回轮：两侧飞刃、真实命中、出手后自由行动',async()=>{
    await restart();await page.keyboard.press('u');await wait(220);let s=await state();assert.equal(s.skillObjects.filter(o=>o.kind==='moon').length,2);assert.equal(s.player.skillUses.orbit,1);
    await page.screenshot({path:'/workspace/tests/skill-U.png'});await wait(220);const x=(await state()).player.x;
    await page.keyboard.down('d');await wait(180);await page.keyboard.up('d');assert((await state()).player.x>x+25);
    await wait(900);assert((await bench()).hitCount>=2);assert(!(await state()).skillObjects.some(o=>o.kind==='moon'));
  });
  await test('O 天炉裁决：空中锻刃、落地范围断腿、重命中顿帧',async()=>{
    await restart();await page.keyboard.press('o');await wait(300);let s=await state();assert(s.player.y<450);assert.equal(s.player.skillUses.verdict,1);assert(s.player.invuln>0);
    await page.screenshot({path:'/workspace/tests/skill-O-rise.png'});
    await page.waitForFunction(()=>combatBenchState().limbBreakCount>0);s=await state();assert(s.enemies.some(e=>!e.leg));assert(s.freeze>.04);assert.equal(s.player.y,555);
    await page.screenshot({path:'/workspace/tests/skill-O-hit.png'});
  });
  await test('四招独立冷却、重按不重复释放、可互相取消与接原招',async()=>{
    await restart(700);await page.keyboard.press('q');await wait(650);await page.keyboard.press('q');await wait(100);assert.equal((await state()).player.skillUses.vortex,1);
    await page.keyboard.press('u');await wait(480);assert.equal((await state()).player.skillUses.orbit,1);
    await page.keyboard.press('e');await wait(700);assert.equal((await state()).player.skillUses.pierce,1);
    await page.keyboard.press('o');await wait(1100);assert.equal((await state()).player.skillUses.verdict,1);
    await page.keyboard.down('j');await wait(260);await page.keyboard.up('j');assert.equal((await state()).player.action,'attack');
    assert.equal(await page.locator('#skillDeck .skill-slot').count(),4);
  });
  await test('空中触发四招、清空失焦输入与重开清除持续技能',async()=>{
    for(const [key,name] of [['q','vortex'],['e','pierce'],['u','orbit'],['o','verdict']]){
      await restart(200);await page.keyboard.press('Space');await wait(140);await page.keyboard.press(key);await wait(200);assert.equal((await state()).player.skillUses[name],1);assert(Number.isFinite((await state()).player.y));
    }
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await state()).mode,'paused');assert.equal((await state()).input.skill,null);await page.keyboard.press('Enter');
    await restart(80);assert.equal((await state()).skillObjects.length,0);assert(Object.values((await state()).player.skillUses).every(n=>n===0));
  });
  await test('最小视口技能操作可见、技能按键阻止默认事件',async()=>{
    await page.setViewportSize({width:960,height:540});await wait(100);const rects=await page.locator('#skillDeck .skill-slot').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,right:r.right,top:r.top,bottom:r.bottom};}));assert(rects.every(r=>r.x>=0&&r.right<=960&&r.top>0&&r.bottom<540));
    await page.screenshot({path:'/workspace/tests/skills-960x540.png'});
    assert((await page.evaluate(()=>['KeyQ','KeyE','KeyU','KeyO'].map(code=>{const e=new KeyboardEvent('keydown',{code,cancelable:true});window.dispatchEvent(e);window.dispatchEvent(new KeyboardEvent('keyup',{code}));return e.defaultPrevented;}))).every(Boolean));
  });
  assert.equal(errors.length,0,errors.join('\n'));console.log('ALL SKILL TESTS PASSED; page errors: 0');
}catch(e){results.push({status:'failed',message:e.stack});console.error(e);console.log(JSON.stringify(await state(),null,2));process.exitCode=1;await page.screenshot({path:'/workspace/tests/skills-failure.png'}).catch(()=>{});}
finally{await writeFile('/workspace/tests/skills-results.json',JSON.stringify({results,errors},null,2));await browser.close();}
