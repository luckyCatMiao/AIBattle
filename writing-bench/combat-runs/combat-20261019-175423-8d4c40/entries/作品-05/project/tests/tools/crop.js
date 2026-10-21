// Save the full scene plus a 2x crop around the player, using canvas coordinates.
const { chromium } = require('/tmp/pw/node_modules/playwright');
(async () => {
  const poseName = process.argv[2] || 'idle';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  await p.evaluate((n) => {
    Game.spawnQueue.length = 0; Game.waveActive = false; Game.nextWaveTimer = null;
    Game.enemies = []; Player.x = 560; Player.state = 'idle';
    Player.pose = Object.assign({}, P[n] || P.idle);
    document.getElementById('keys').style.display = 'none';
    // draw the world into an offscreen canvas and crop precisely
    Game.render();
    const src = document.getElementById('game');
    const c2 = document.createElement('canvas');
    c2.width = 440; c2.height = 360;
    const g = c2.getContext('2d');
    const z = Camera.zoom, camx = 640 + Camera.x, camy = 396 + Camera.y;
    // scene->screen: sx = 640 + (x-camx)*z ; sy = 360 + (y-camy)*z
    const sx = 640 + (Player.x - camx) * z - 220;
    const sy = 360 + (WORLD.groundY - 150 - camy) * z;
    g.drawImage(src, sx, sy, 440, 360, 0, 0, 440, 360);
    const d = document.createElement('div');
    d.id = 'cropper';
    d.style.cssText = 'position:fixed;left:0;top:0;width:440px;height:360px;z-index:99999;background:#000';
    c2.style.cssText = 'width:440px;height:360px;image-rendering:auto';
    d.appendChild(c2); document.body.appendChild(d);
  }, poseName);
  await p.screenshot({ path: `/workspace/tests/shots/${poseName}.png`, clip: { x: 0, y: 0, width: 440, height: 360 } });
  await b.close();
})();
