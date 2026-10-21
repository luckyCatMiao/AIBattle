import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", e => errors.push(e.stack));
page.on("console", m => { if (m.type()==="error") errors.push(m.text()); });
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const held=new Set();
async function setH(c,on){ if(on&&!held.has(c)){held.add(c);await page.keyboard.down(c);} if(!on&&held.has(c)){held.delete(c);await page.keyboard.up(c);} }
let sawRend=false, sawBoltAim=false, eliteShot=false;
const t0=Date.now();
while(Date.now()-t0<30000){
 const d=await page.evaluate(()=>window.__combatDebug());
 if(d.mode!=="play"||!d.player||d.player.dead) break;
 const alive=d.enemies.filter(e=>e.alive&&e.spawnT<=0);
 const rend=alive.find(e=>e.type==="rend");
 if(rend && !sawRend){ sawRend=true; console.log("REND seen at wave",d.wave,"hp",rend.hp.toFixed(0),"state",rend.state); await page.screenshot({path:"/workspace/test/shot-rend.png"}); }
 const bolt=alive.find(e=>e.type==="bolt");
 if(bolt && !sawBoltAim && bolt.state==="windup" && bolt.atkKind==="aim"){ sawBoltAim=true; console.log("BOLT AIM seen", bolt.windup); await page.screenshot({path:"/workspace/test/shot-boltaim.png"}); }
 if(!eliteShot && alive.some(e=>e.type==="axe"&&e.hp>80)){ /* placeholder */ }
 const near=alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
 if(!near){ for(const c of [...held]) await setH(c,false); await page.waitForTimeout(100); continue; }
 const dx=near.x-d.player.x;
 if(Math.abs(dx)>90){ await setH(dx>0?"KeyD":"KeyA",true); await setH(dx>0?"KeyA":"KeyD",false); if(Math.abs(dx)>320) await page.keyboard.press("KeyL"); await page.waitForTimeout(55); }
 else { for(const c of [...held]) await setH(c,false); if(Math.random()<0.12){await page.keyboard.down("KeyK");await page.waitForTimeout(300);await page.keyboard.up("KeyK");} else await page.keyboard.press("KeyJ"); await page.waitForTimeout(70); }
}
for(const c of [...held]) await page.keyboard.up(c);
await page.waitForTimeout(200);
console.log("FINAL",await page.evaluate(()=>window.combatBenchState()), {sawRend,sawBoltAim}, errors);
await browser.close();
