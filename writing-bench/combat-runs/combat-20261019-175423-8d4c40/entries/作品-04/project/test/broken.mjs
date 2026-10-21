import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(700);
await page.evaluate(() => {
  Game.spawnQueue.length=0; Game.enemies.forEach(e=>e.dead=true); Game.enemies.length=0;
  Game.spawnEnemy('warden'); Game.spawnEnemy('warden'); Game.spawnEnemy('brute');
  const p = Game.player; p.x = 400;
  Game.enemies.forEach((e,i)=>{ e.x = 560 + i*120; e.facing=-1; e.atkCd=99; e.hp=999; e.maxHp=999; e.state='chase'; });
  const [a,b,c] = Game.enemies;
  // a: one leg, b: no arms + head missing, c: both legs missing
  a.limbs.legR.attached = false;
  b.limbs.armR.attached = false; b.limbs.armL.attached = false; b.limbs.head.attached = false;
  c.limbs.legR.attached = false; c.limbs.legL.attached = false;
  Camera.zoom = 1.75; Camera.x = 430;
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/workspace/test/broken1.png' });
await page.waitForTimeout(500);
await page.screenshot({ path: '/workspace/test/broken2.png' });
await browser.close();
