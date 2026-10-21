const { chromium } = require('/tmp/pw/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
  // walk toward the nearest enemy
  const near = await p.evaluate(() => {
    const P = Game.player; const e = Game.enemies.filter(e=>!e.dead)[0];
    return e ? Math.sign(e.x - P.x) : 1;
  });
  const key = near > 0 ? 'KeyD' : 'KeyA';
  await p.keyboard.down(key);
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(120);
    await p.keyboard.press('KeyJ');
  }
  await p.keyboard.up(key);
  console.log(JSON.stringify(await p.evaluate(() => window.__dbg())));
  console.log(JSON.stringify(await p.evaluate(() => window.combatBenchState())));
  await p.screenshot({ path: '/workspace/tests/10_fight.png' });
  console.log('errors', errs);
  await b.close();
})();
