import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await page.evaluate(() => { Game.spawnQueue.length = 0; Game.enemies.length = 1; Game.enemies[0].x = Game.player.x + 160; Game.enemies[0].atkCd = 0; Game.enemies[0].state='chase'; Game.enemies[0].facing=-1; });
await page.waitForTimeout(1200);
// wait for windup then parry
for (let i = 0; i < 40; i++) {
  const w = await page.evaluate(() => { const e = Game.enemies[0]; return e && e.state === 'attack' ? (e.attack.t / e.attack.def.active[0]) : -1; });
  if (w > 0.7) { await page.screenshot({ path: '/workspace/test/pr_windup.png' }); break; }
  await page.waitForTimeout(30);
}
await page.keyboard.press('KeyI');
await page.waitForTimeout(120);
const st = await page.evaluate(() => ({ ps: Game.player.state, parry: Game.player.parrySuccess, hit: Game.hitCount, php: Game.player.hp, es: Game.enemies[0].state }));
console.log(JSON.stringify(st));
await page.screenshot({ path: '/workspace/test/pr_parry.png' });
await browser.close();
