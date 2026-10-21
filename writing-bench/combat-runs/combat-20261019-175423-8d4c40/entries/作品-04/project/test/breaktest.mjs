import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(600);
await page.evaluate(() => { Game.spawnQueue.length = 0; Game.enemies.forEach(e=>e.dead=true); Game.enemies.length=0; Game.spawnEnemy('warden'); const e=Game.enemies[0]; e.x = Game.player.x + 74; e.facing=-1; e.atkCd=99; e.hp=999; e.maxHp=999; });
await page.waitForTimeout(400);
// heavy low hit to legs
await page.keyboard.down('KeyK'); await page.waitForTimeout(700); await page.keyboard.up('KeyK');
await page.waitForTimeout(160);
const r = await page.evaluate(() => { const e = Game.enemies[0]; return { break: Game.limbBreakCount, limbs: Object.fromEntries(Object.entries(e.limbs).map(([k,v])=>[k,{hp:Math.round(v.hp),on:v.attached}])), limbsArr: Game.limbs.length }; });
console.log(JSON.stringify(r));
await page.screenshot({ path: '/workspace/test/br1.png' });
await page.waitForTimeout(500);
await page.screenshot({ path: '/workspace/test/br2.png' });
// hit again high
await page.keyboard.press('KeyJ'); await page.waitForTimeout(300);
await page.keyboard.press('KeyJ'); await page.waitForTimeout(300);
await page.screenshot({ path: '/workspace/test/br3.png' });
console.log(JSON.stringify(await page.evaluate(() => { const e = Game.enemies[0]; return { break: Game.limbBreakCount, d: !!e, limbs: e ? Object.fromEntries(Object.entries(e.limbs).map(([k,v])=>[k,v.attached])) : null }; })));
await browser.close();
