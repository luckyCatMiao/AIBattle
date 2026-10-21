const { chromium } = require('/home/player/pw/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto('file:///workspace/game.html');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__nanLog = [];
    const g = window.AV.game;
    window.__probe = setInterval(() => {
      const bad = [];
      for (const e of g.fx.list) for (const k of ['x', 'y', 'r', 'life', 'angle', 'radius']) if (k in e && !Number.isFinite(e[k])) bad.push([e.k, k, e[k]]);
      for (const d of g.fx.debris) for (const k of ['x', 'y', 'rot', 'vx', 'vy']) if (!Number.isFinite(d[k])) bad.push(['debris', k, d[k]]);
      if (bad.length) window.__nanLog.push(JSON.stringify(bad.slice(0, 4)));
      if (!Number.isFinite(g.player.x) || !Number.isFinite(g.player.y)) window.__nanLog.push('PLAYER ' + g.player.x + ',' + g.player.y + ' st=' + g.player.state + ' atk=' + g.player.attackName);
      for (const e of g.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) window.__nanLog.push('ENEMY ' + e.kind + ' ' + e.x + ',' + e.y);
    }, 50);
  });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(130);
    if (i % 5 === 0) await page.keyboard.press('KeyL');
  }
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => window.__nanLog.slice(0, 20));
  console.log('NaN log:', log);
  const st = await page.evaluate(() => ({ s: window.combatBenchState(), hp: window.AV.game.player.hp, pst: window.AV.game.player.state }));
  console.log(st);
  await browser.close();
})();
