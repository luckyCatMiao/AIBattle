import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message, (e.stack||'').split('\n')[1]));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
await page.evaluate(() => { Game.spawnQueue.length = 0; Game.enemies.forEach(e => { e.dead = true; }); Game.enemies.length = 0; Game.spawnEnemy('thrower'); const e = Game.enemies[0]; e.x = Game.player.x + 320; e.facing = -1; window.__tl = []; });
for (let i = 0; i < 50; i++) {
  const d = await page.evaluate(() => { const e = Game.enemies[0]; return { st: e.state, t: e.attack ? +e.attack.t.toFixed(2) : null, dist: Math.round(Math.abs(e.x - Game.player.x)), cd: +e.atkCd.toFixed(2), orbs: Game.orbs.length }; });
  if (i % 5 === 0) console.log(i, JSON.stringify(d));
  await page.waitForTimeout(100);
}
await page.screenshot({ path: '/workspace/test/th.png' });
await browser.close();
