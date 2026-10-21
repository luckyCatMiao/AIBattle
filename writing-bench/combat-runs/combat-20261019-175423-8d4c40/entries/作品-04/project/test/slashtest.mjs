import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(500);
await page.evaluate(() => { Game.spawnQueue.length = 0; Game.enemies.length = 0;
  FX.clear();
  FX.slash(480, 300, 0.35, 60, 2.4, 0.17, 'rgba(255,0,0,', 3);
  // prevent fade: freeze game
  Game.playing = false; Game.started = true;
});
await page.waitForTimeout(60);
await page.screenshot({ path: '/workspace/test/sl.png' });
await browser.close();
