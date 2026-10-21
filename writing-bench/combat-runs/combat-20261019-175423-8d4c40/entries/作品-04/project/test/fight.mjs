import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(2600);
await page.evaluate(() => { Game.wave = 3; Game.spawnQueue.length = 0; Game.enemies.forEach(e=>e.dead=true); Game.enemies.length=0; Game.spawnEnemy('warden'); Game.spawnEnemy('thrower'); Game.spawnEnemy('brute'); Game.enemies.forEach((e,i)=>{ e.x = Game.player.x + 120 + i*130; e.facing=-1; }); });
await page.waitForTimeout(1600);
await page.screenshot({ path: '/workspace/test/fight0.png' });
for (let k=0;k<3;k++){
  await page.keyboard.down('KeyD'); await page.waitForTimeout(220); await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(150);
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(160);
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(250);
}
await page.screenshot({ path: '/workspace/test/fight1.png' });
await page.keyboard.down('KeyK'); await page.waitForTimeout(800); await page.keyboard.up('KeyK'); await page.waitForTimeout(260);
await page.screenshot({ path: '/workspace/test/fight2.png' });
console.log(JSON.stringify(await page.evaluate(()=>window.combatBenchState())));
await browser.close();
