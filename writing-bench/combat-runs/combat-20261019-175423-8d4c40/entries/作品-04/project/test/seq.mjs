import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.evaluate(() => {
  Game.spawnQueue.length = 0; Game.enemies.forEach(e => e.dead = true); Game.enemies.length = 0;
  Game.spawnEnemy('warden'); const e = Game.enemies[0];
  e.x = Game.player.x + 95; e.facing = -1; e.atkCd = 99; e.state = 'chase';
});
await page.waitForTimeout(500);
await page.keyboard.press('KeyJ');
for (let i = 0; i < 6; i++) { await page.screenshot({ path: `/workspace/test/s${i}.png` }); await page.waitForTimeout(45); }
await browser.close();
