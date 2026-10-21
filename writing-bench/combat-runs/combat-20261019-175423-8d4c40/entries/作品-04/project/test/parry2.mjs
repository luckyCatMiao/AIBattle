import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await page.evaluate(() => {
  Game.spawnQueue.length = 0; Game.enemies.length = 1;
  const e = Game.enemies[0];
  e.x = Game.player.x + 150; e.atkCd = 0; e.state = 'chase'; e.facing = -1;
  window.__log = [];
  const origTake = Game.player.takeDamage.bind(Game.player);
  Game.player.takeDamage = function (...a) { window.__log.push(['take', Game.player.state, Game.player.parryT, Game.player.parryCd]); return origTake(...a); };
});
await page.waitForTimeout(900);
for (let i = 0; i < 60; i++) {
  const w = await page.evaluate(() => { const e = Game.enemies[0]; return e && e.state === 'attack' ? (e.attack.t / e.attack.def.active[0]) : -1; });
  if (w > 0.6 && w < 1) {
    await page.keyboard.press('KeyI');
    await page.evaluate(() => window.__log.push(['pressed', Game.player.state, Game.player.parryT, Game.player.parryCd]));
    break;
  }
  await page.waitForTimeout(20);
}
await page.waitForTimeout(150);
console.log(JSON.stringify(await page.evaluate(() => ({ log: window.__log, ps: Game.player.state, parry: Game.player.parrySuccess, php: Game.player.hp, es: Game.enemies[0].state }))));
await browser.close();
