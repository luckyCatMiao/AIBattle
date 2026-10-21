import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(800);
const st = () => page.evaluate(() => window.combatBenchState());
const dbg = () => page.evaluate(() => window.__combatDebug());
console.log("TITLE", await st());
await page.keyboard.press("Enter");
await page.waitForTimeout(2000);
console.log("START", await st());
const held = new Set();
async function setHeld(c,on){ if(on&&!held.has(c)){held.add(c);await page.keyboard.down(c);} if(!on&&held.has(c)){held.delete(c);await page.keyboard.up(c);} }
const t0=Date.now();
while(Date.now()-t0<13000){
  const d=await dbg();
  if(d.mode!=="play"||d.player.dead) break;
  const alive=d.enemies.filter(e=>e.alive&&e.spawnT<=0);
  if(!alive.length){ for(const c of [...held]) await setHeld(c,false); await page.waitForTimeout(120); continue; }
  const near=alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
  const dx=near.x-d.player.x;
  if(Math.abs(dx)>90){
    await setHeld(dx>0?"KeyD":"KeyA",true); await setHeld(dx>0?"KeyA":"KeyD",false);
    await page.waitForTimeout(55);
  } else {
    for(const c of [...held]) await setHeld(c,false);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(75);
  }
}
for(const c of [...held]) await page.keyboard.up(c);
await page.waitForTimeout(200);
const combatState = await st();
console.log("COMBAT", combatState);

await page.keyboard.press("KeyR");
await page.waitForTimeout(400);
console.log("RESTART-R", await st());

// stand still until dead
let over = false;
const t1=Date.now();
let lastHp=100;
while(Date.now()-t1<35000){
  const d=await dbg();
  if(d.mode==="over"){over=true;break;}
  if(d.player && d.player.dead) over=true;
  if(d.player && d.player.hp !== lastHp){ lastHp=d.player.hp; }
  await page.waitForTimeout(300);
}
await page.waitForTimeout(600);
console.log("DEAD", over, await st());
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
console.log("RESTART-ENTER", await st());
console.log("ERRORS", errors);
await browser.close();
