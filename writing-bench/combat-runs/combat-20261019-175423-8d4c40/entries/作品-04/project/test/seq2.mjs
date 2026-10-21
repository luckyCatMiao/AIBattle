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
  e.x = Game.player.x + 90; e.facing = -1; e.atkCd = 99; e.state = 'chase';
  Camera.zoom = 2.0;
});
await page.waitForTimeout(400);
await page.keyboard.press('KeyJ');
const clip = { x: 330, y: 240, width: 440, height: 250 };
for (let i = 0; i < 5; i++) { await page.screenshot({ path: `/workspace/test/q${i}.png`, clip }); await page.waitForTimeout(40); }
await browser.close();
