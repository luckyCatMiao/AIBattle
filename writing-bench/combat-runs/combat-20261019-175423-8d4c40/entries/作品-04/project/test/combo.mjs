import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
await page.evaluate(() => { Game.spawnQueue.length=0; Game.enemies.forEach(e=>e.dead=true); Game.enemies.length=0; Game.spawnEnemy('warden'); const e=Game.enemies[0]; e.x=Game.player.x+80; e.facing=-1; e.atkCd=99; e.hp=999; e.maxHp=999; window.__acts=[]; setInterval(()=>{ const a=Game.player.act; if(a && window.__acts[window.__acts.length-1]!==a.name) window.__acts.push(a.name); }, 16); });
await page.waitForTimeout(500);
// air combo
await page.keyboard.press('Space'); await page.waitForTimeout(140); await page.keyboard.press('KeyJ'); await page.waitForTimeout(90); await page.keyboard.press('KeyJ'); await page.waitForTimeout(500);
console.log('air acts', JSON.stringify(await page.evaluate(()=>window.__acts)));
await page.evaluate(()=>window.__acts=[]);
// ground combo chained fast
for (let i=0;i<6;i++){ await page.keyboard.press('KeyJ'); await page.waitForTimeout(130); }
await page.waitForTimeout(300);
console.log('ground acts', JSON.stringify(await page.evaluate(()=>window.__acts)));
console.log(JSON.stringify(await page.evaluate(()=>window.combatBenchState())));
await browser.close();
