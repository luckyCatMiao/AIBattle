import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message, e.stack.split('\n')[1]));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
await page.evaluate(() => { Game.spawnQueue.length = 0; Game.enemies.forEach(e => e.atkCd = 99); });
const dump = () => page.evaluate(() => ({ p: { x: Math.round(Game.player.x), st: Game.player.state, hp: Math.round(Game.player.hp), onG: Game.player.onGround }, e: Game.enemies.map(e => ({ x: Math.round(e.x), st: e.state, hp: Math.round(e.hp), arms: e.limbs.armR.attached + '/' + e.limbs.armL.attached, legs: e.limbs.legL.attached + '/' + e.limbs.legR.attached, head: e.limbs.head.attached })), s: window.combatBenchState() }));
console.log('init', JSON.stringify(await dump()));
// jump / double jump / air attack
await page.keyboard.press('Space'); await page.waitForTimeout(150);
console.log('jump', JSON.stringify(await dump()));
await page.keyboard.press('Space'); await page.waitForTimeout(150);
console.log('djump', JSON.stringify(await dump()));
await page.keyboard.press('KeyJ'); await page.waitForTimeout(100);
await page.screenshot({ path: '/workspace/test/f_air.png' });
await page.keyboard.press('KeyJ'); await page.waitForTimeout(120);
await page.waitForTimeout(500);
console.log('landed', JSON.stringify(await dump()));
// dash
await page.keyboard.press('KeyL'); await page.waitForTimeout(60);
await page.screenshot({ path: '/workspace/test/f_dash.png' });
await page.waitForTimeout(300);
console.log('dash', JSON.stringify(await dump()));
// approach and parry test: let enemies attack
await page.evaluate(() => { Game.enemies.forEach(e => { e.atkCd = 0; }); });
await page.waitForTimeout(2500);
console.log('after enemy attacks', JSON.stringify(await dump()));
await page.screenshot({ path: '/workspace/test/f_melee.png' });
await browser.close();
