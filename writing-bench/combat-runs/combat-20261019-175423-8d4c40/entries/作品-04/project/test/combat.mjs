import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const dump = () => page.evaluate(() => ({
  p: { x: Math.round(Game.player.x), st: Game.player.state, act: Game.player.act && Game.player.act.name, hp: Math.round(Game.player.hp) },
  e: Game.enemies.map(e => ({ x: Math.round(e.x), st: e.state, hp: Math.round(e.hp), armR: e.limbs.armR.attached, legR: e.limbs.legR.attached, head: e.limbs.head.attached })),
  st: window.combatBenchState()
}));
await page.waitForTimeout(2200);
// freeze AI spawns for a focused test
await page.evaluate(() => { Game.spawnQueue.length = 0; });
console.log('start', JSON.stringify(await dump()));
// walk to nearest enemy
for (let k = 0; k < 10; k++) {
  const d = await page.evaluate(() => { const e = Game.enemies.find(e => !e.dead); return e ? e.x - Game.player.x : 0; });
  if (Math.abs(d) < 55) break;
  const key = d > 0 ? 'KeyD' : 'KeyA';
  await page.keyboard.down(key); await page.waitForTimeout(Math.min(500, Math.abs(d) / 330 * 1000 + 40)); await page.keyboard.up(key);
  await page.waitForTimeout(60);
}
console.log('close', JSON.stringify(await dump()));
// J combo x3
for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(190); }
await page.screenshot({ path: '/workspace/test/c_combo.png' });
await page.waitForTimeout(200);
console.log('after J combo', JSON.stringify(await dump()));
// charged K
await page.keyboard.down('KeyK'); await page.waitForTimeout(760); await page.keyboard.up('KeyK');
await page.waitForTimeout(230);
await page.screenshot({ path: '/workspace/test/c_charge.png' });
console.log('after charge', JSON.stringify(await dump()));
await page.waitForTimeout(300);
await page.screenshot({ path: '/workspace/test/c_after.png' });
console.log('settle', JSON.stringify(await dump()));
await browser.close();
