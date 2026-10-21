import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
await page.evaluate(() => { Game.spawnQueue.length = 0; Game.enemies.forEach(e => { e.x = 760; e.state='chase'; e.atkCd=99; }); Game.player.x = 500; });
await page.waitForTimeout(900);
const names = ['light1','light2','light3','heavy','charge1','charge2','air1','air2'];
for (const n of names) {
  await page.evaluate((n) => { Game.player.startAttack(n); }, n);
  await page.waitForTimeout(95);
  await page.screenshot({ path: `/workspace/test/p_${n}.png`, clip: { x: 250, y: 260, width: 420, height: 280 } });
  await page.waitForTimeout(500);
}
await browser.close();
