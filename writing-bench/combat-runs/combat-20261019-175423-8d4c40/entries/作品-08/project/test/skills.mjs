import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true, executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(700); await page.keyboard.press("Enter"); await page.waitForTimeout(900);
const dbg=()=>page.evaluate(()=>window.__combatDebug());
const st=()=>page.evaluate(()=>window.combatBenchState());
const held=new Set();
async function setH(c,on){ if(on&&!held.has(c)){held.add(c);await page.keyboard.down(c);} if(!on&&held.has(c)){held.delete(c);await page.keyboard.up(c);} }
async function approach(maxMs=6000){
  const t0=Date.now();
  while(Date.now()-t0<maxMs){
    const d=await dbg();
    const alive=d.enemies.filter(e=>e.alive&&e.spawnT<=0);
    if(!alive.length){ await page.waitForTimeout(100); continue; }
    const near=alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
    const dx=near.x-d.player.x;
    if(Math.abs(dx)>105){ await setH(dx>0?"KeyD":"KeyA",true); await setH(dx>0?"KeyA":"KeyD",false); await page.waitForTimeout(45); }
    else { for(const c of [...held]) await setH(c,false); return near; }
  }
  for(const c of [...held]) await setH(c,false); return null;
}
async function useSkill(key, waitAfter=120, shotName=null){
  const before=await st();
  const pBefore=(await dbg()).player;
  await page.keyboard.press(key);
  await page.waitForTimeout(waitAfter);
  const d=await dbg();
  if(shotName) await page.screenshot({path:`/workspace/test/${shotName}`});
  console.log(key,"before",{x:pBefore.x.toFixed(0),cd:pBefore.skillCd},"active",d.player.state,d.player.skill,"cd",d.player.skillCd,"hits",(await st()).hitCount-before.hitCount,"breaks",(await st()).limbBreakCount-before.limbBreakCount);
  return {before,d};
}
// skill 1 near enemy
await approach(5000);
await useSkill("Digit1", 220, "skill1.png");
await page.waitForTimeout(700);
console.log("S1 done", (await dbg()).player.state, (await dbg()).player.skillCd, await st());
// denial while on cooldown
await page.waitForTimeout(600);
await useSkill("Digit1", 160);
await page.waitForTimeout(200);
// skill 2
await approach(4000);
const x0=(await dbg()).player.x;
await useSkill("Digit2", 200, "skill2.png");
const x1=(await dbg()).player.x;
await page.waitForTimeout(600);
console.log("S2 blink dx", (x1-x0).toFixed(0), (await dbg()).player.state, (await dbg()).player.skillCd);
// skill 3
await useSkill("Digit3", 650, "skill3.png");
await page.waitForTimeout(1100);
console.log("S3 done", (await dbg()).player.state, (await dbg()).player.skillCd, await st());
// skill 4: face nearest
const near=await approach(4000);
if(near){ const d=await dbg(); const dir=near.x>d.player.x?"KeyD":"KeyA"; await page.keyboard.down(dir); await page.waitForTimeout(40); await page.keyboard.up(dir); }
await useSkill("Digit4", 470, "skill4.png");
await page.waitForTimeout(600);
console.log("S4 done", (await dbg()).player.state, (await dbg()).player.skillCd, await st());
await page.waitForTimeout(500);
await page.screenshot({path:"/workspace/test/skills-final.png"});
console.log("ERRORS",errors);
await browser.close();
