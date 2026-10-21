import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(700);
await page.evaluate(() => { Game.spawnQueue.length=0; Game.enemies.length=0; Game.player.x = 900; Camera.x=700; Camera.zoom=2.4; });
await page.waitForTimeout(300);
await page.keyboard.down('KeyD');
for (let i=0;i<6;i++){ await page.waitForTimeout(90); await page.screenshot({ path: `/workspace/test/run${i}.png`, clip:{x:250,y:280,width:420,height:240} }); }
await page.keyboard.up('KeyD');
await browser.close();
