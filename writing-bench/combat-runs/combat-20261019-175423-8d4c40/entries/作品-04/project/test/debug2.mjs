import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const st = () => page.evaluate(() => window.combatBenchState());
const dump = () => page.evaluate(() => ({
  p: { x: Math.round(Game.player.x), st: Game.player.state, face: Game.player.facing, act: Game.player.act && Game.player.act.name, hitstop: +Game.hitstop.toFixed(3), hs: Game.hitCount },
  e: Game.enemies.map(e => ({ x: Math.round(e.x), st: e.state, hp: Math.round(e.hp), d: Math.round(Math.abs(e.x - Game.player.x)) }))
}));
console.log('settled', JSON.stringify(await dump()));
// move toward nearest enemy
for (let k = 0; k < 8; k++) {
  const d = await page.evaluate(() => { const e = Game.enemies[0]; return e ? e.x - Game.player.x : 0; });
  if (Math.abs(d) > 60) {
    const key = d > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key); await page.waitForTimeout(Math.min(600, Math.abs(d) / 320 * 1000)); await page.keyboard.up(key);
  }
}
console.log('close', JSON.stringify(await dump()));
for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(220); }
console.log('after combo', JSON.stringify(await dump()), JSON.stringify(await st()));
await page.screenshot({ path: '/workspace/test/dbg2.png' });
await browser.close();
