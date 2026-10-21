import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", m => { if (m.type()==="error") errors.push(m.text()); });
page.on("pageerror", e => errors.push(e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.__s=[]; window.__si=setInterval(()=>{ const d=window.__combatDebug(); const s=window.combatBenchState(); window.__s.push({hs:d.hitStop,h:s.hitCount,b:s.limbBreakCount,hp:s.playerAlive?d.player.hp:0}); },6);
});
const held = new Set();
async function setHeld(c,on){ if(on&&!held.has(c)){held.add(c);await page.keyboard.down(c);} if(!on&&held.has(c)){held.delete(c);await page.keyboard.up(c);} }
const t0=Date.now();
while(Date.now()-t0<9000){
  const d=await page.evaluate(()=>window.__combatDebug());
  const alive=d.enemies.filter(e=>e.alive&&e.spawnT<=0);
  if(!alive.length){ await page.waitForTimeout(80); continue; }
  const near=alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
  const dx=near.x-d.player.x;
  if(Math.abs(dx)>80){
    await setHeld(dx>0?"KeyD":"KeyA",true); await setHeld(dx>0?"KeyA":"KeyD",false);
    await page.waitForTimeout(45);
  } else {
    await setHeld("KeyA",false); await setHeld("KeyD",false);
    if(Math.random()<0.1){ await page.keyboard.down("KeyK"); await page.waitForTimeout(120); await page.keyboard.up("KeyK"); }
    else await page.keyboard.press("KeyJ");
    await page.waitForTimeout(65);
  }
}
for(const c of [...held]) await page.keyboard.up(c);
await page.waitForTimeout(200);
const samples=await page.evaluate(()=>{clearInterval(window.__si);return window.__s;});
const hits = await page.evaluate(()=>window.combatBenchState());
let prevH=samples[0].h, hitWindows=[];
for(let i=1;i<samples.length;i++){
  if(samples[i].h>prevH){ hitWindows.push({delta:samples[i].h-prevH, hs:samples[i].hs, b:samples[i].b}); prevH=samples[i].h; }
}
console.log("FINAL", hits);
console.log("SAMPLES", samples.length, "maxHitStop", Math.max(...samples.map(s=>s.hs)).toFixed(3));
console.log("HIT EVENTS first 15", hitWindows.slice(0,15));
console.log("positive-hitstop samples", samples.filter(s=>s.hs>0).length, "breaks", hits.limbBreakCount, "errors", errors);
console.log("hitstop values", [...new Set(samples.filter(s=>s.hs>0).map(s=>s.hs.toFixed(3)))].slice(0,20));
await page.screenshot({path:"/workspace/test/shot-hitstop.png"});
await browser.close();
