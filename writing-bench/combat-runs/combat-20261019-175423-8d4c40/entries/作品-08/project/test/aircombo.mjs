import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true, executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(700); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
const dbg=()=>page.evaluate(()=>window.__combatDebug());
const held=new Set();
async function setH(c,on){if(on&&!held.has(c)){held.add(c);await page.keyboard.down(c);}if(!on&&held.has(c)){held.delete(c);await page.keyboard.up(c);}}
async function close(range=80,max=7000){const t0=Date.now();while(Date.now()-t0<max){const d=await dbg();const alive=d.enemies.filter(e=>e.alive&&e.spawnT<=0);if(!alive.length){await page.waitForTimeout(80);continue;}const near=alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];const dx=near.x-d.player.x;if(Math.abs(dx)>range){await setH(dx>0?"KeyD":"KeyA",true);await setH(dx>0?"KeyA":"KeyD",false);await page.waitForTimeout(45);}else{for(const c of [...held])await setH(c,false);return near;}}for(const c of [...held])await setH(c,false);return null;}
let launched=false, airHit=false, slam=false, shot=false;
for(let attempt=0; attempt<10 && !slam; attempt++){
  const near=await close(85);
  if(!near) continue;
  const d0=await dbg();
  if(d0.player.dead) break;
  // face
  const code=near.x>d0.player.x?"KeyD":"KeyA";
  await page.keyboard.down(code); await page.waitForTimeout(35); await page.keyboard.up(code);
  const before=(await page.evaluate(()=>window.combatBenchState())).hitCount;
  await page.keyboard.press("KeyJ"); await page.waitForTimeout(90);
  await page.keyboard.press("KeyJ"); await page.waitForTimeout(90);
  await page.keyboard.press("KeyJ"); await page.waitForTimeout(110);
  const d1=await dbg();
  const e1=d1.enemies.filter(e=>e.alive).sort((a,b)=>Math.abs(a.x-d1.player.x)-Math.abs(b.x-d1.player.x))[0];
  if(e1 && e1.y < 430) launched=true;
  await page.keyboard.down("Space"); await page.waitForTimeout(160); await page.keyboard.up("Space"); await page.waitForTimeout(80);
  const d2=await dbg();
  if(!d2.player.grounded){ await page.keyboard.press("KeyJ"); await page.waitForTimeout(90); await page.keyboard.press("KeyJ"); await page.waitForTimeout(90); }
  const d3=await dbg();
  if(!d3.player.grounded){ await page.keyboard.down("KeyK"); await page.waitForTimeout(60); await page.keyboard.up("KeyK"); await page.waitForTimeout(250); slam=true; if(!shot){shot=true; await page.screenshot({path:"/workspace/test/shot-aircombo.png"});} }
  const after=(await page.evaluate(()=>window.combatBenchState())).hitCount;
  console.log("attempt",attempt,"hitDelta",after-before,"player",d3.player.state,"grounded",d3.player.grounded,"enemyY",e1?e1.y.toFixed(0):"-","launched",launched);
  await page.waitForTimeout(350);
}
console.log("RESULT",{launched,airHit,slam},"state",await page.evaluate(()=>window.combatBenchState()),"errors",errors);
await browser.close();
