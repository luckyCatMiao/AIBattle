import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", m => { if (m.type()==="error") errors.push(m.text()); });
page.on("pageerror", e => errors.push(e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const dbg = () => page.evaluate(() => window.__combatDebug());
const st = () => page.evaluate(() => window.combatBenchState());
const held = new Set();
async function setHeld(c,on){ if(on&&!held.has(c)){held.add(c);await page.keyboard.down(c);} if(!on&&held.has(c)){held.delete(c);await page.keyboard.up(c);} }
async function rel(){ for(const k of [...held]) await setHeld(k,false); }
async function close(range=100, maxMs=8000){
  const t0=Date.now();
  while(Date.now()-t0<maxMs){
    const d=await dbg();
    const alive=d.enemies.filter(e=>e.alive&&e.spawnT<=0);
    if(!alive.length){ await page.waitForTimeout(100); continue; }
    const near=alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
    const dx=near.x-d.player.x;
    if(Math.abs(dx)>range){
      await setHeld(dx>0?"KeyD":"KeyA",true); await setHeld(dx>0?"KeyA":"KeyD",false);
      await page.waitForTimeout(50);
    } else { await rel(); return near; }
  }
  await rel(); return null;
}
let result=null;
for(let attempt=0; attempt<8 && !result; attempt++){
  const near=await close(85,4000);
  const d=await dbg();
  if(!near||!d.player||d.player.dead) break;
  const code = near.x>d.player.x?"KeyD":"KeyA";
  await page.keyboard.down(code); await page.waitForTimeout(40); await page.keyboard.up(code);
  const b0=(await st()).limbBreakCount;
  await page.keyboard.press("KeyK");
  // wait up to 1s for a break
  const t0=Date.now();
  while(Date.now()-t0<1000){
    const s=await st();
    if(s.limbBreakCount>b0){ result=s; break; }
    await page.waitForTimeout(25);
  }
  if(result){
    await page.waitForTimeout(40);
    await page.screenshot({path:"/workspace/test/shot-limbbreak-early.png"});
    await page.waitForTimeout(380);
    await page.screenshot({path:"/workspace/test/shot-limbbreak-late.png"});
    console.log("BREAK", result, "debug", JSON.stringify((await dbg()).enemies.filter(e=>e.alive).map(e=>({type:e.type,hp:e.hp.toFixed(1),broken:e.broken,arms:e.arms,legs:e.legs}))));
  } else {
    await page.waitForTimeout(300);
  }
}
await rel();
console.log("state", await st(), "errors", errors);
await browser.close();
