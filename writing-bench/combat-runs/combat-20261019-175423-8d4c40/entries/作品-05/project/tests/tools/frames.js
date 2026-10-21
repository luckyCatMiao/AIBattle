// Usage: node frames.js <name> [actions...]
// Captures a tight crop around the player for art review.
const { chromium } = require('/tmp/pw/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    Game.spawnQueue.length = 0; Game.waveActive = false; Game.nextWaveTimer = null;
    Game.enemies = []; Player.x = 560; Player.state = 'idle';
    const d = document.getElementById('keys'); if (d) d.style.display = 'none';
  });
  const setup = process.argv[2] || 'idle';
  const cropW = +(process.argv[3] || 380), cropH = +(process.argv[4] || 300);
  await p.evaluate((s) => { Player.pose = Object.assign({}, P[s] || P.idle); }, setup);
  await p.waitForTimeout(80);
  const cut = await p.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); return { x: c.width / 1280, left: c.left, top: c.top }; });
  const camx = await p.evaluate(() => { const z = Camera.zoom; const fx = 640 + Camera.x; return .5 * 1280 - fx * z; });
  const px = await p.evaluate(() => Player.x);
  await p.screenshot({ path: `/workspace/tests/shots/${setup}.png`, clip: { x: cut.left + (640 + camx + px * 1) * cut.x - cropW / 2, y: cut.top + 470 * cut.x, width: cropW, height: cropH } });
  if (errs.length) console.log('ERR', errs);
  await b.close();
})();
