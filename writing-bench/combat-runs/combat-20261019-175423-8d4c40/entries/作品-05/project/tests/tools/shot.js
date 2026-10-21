// Full screenshot + precise crop around the player (canvas coords -> CSS px -> device px).
const { chromium } = require('/tmp/pw/node_modules/playwright');
const fs = require('fs');
(async () => {
  const poseName = process.argv[2] || 'idle';
  const setup = process.argv[3] || '';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  const info = await p.evaluate((args) => {
    const [n, extra] = args;
    Game.spawnQueue.length = 0; Game.waveActive = false; Game.nextWaveTimer = null;
    Game.enemies = []; Player.x = 560; Player.state = 'idle';
    if (extra) eval(extra);
    Player.pose = Object.assign({}, P[n] || P.idle);
    document.getElementById('keys').style.display = 'none';
    Game.render();
    const z = Camera.zoom;
    return { sx: 640 + (Player.x - (640 + Camera.x)) * z, sy: 360 + (WORLD.groundY - (396 + Camera.y)) * z, z };
  }, [poseName, setup]);
  await p.waitForTimeout(100);
  await p.screenshot({ path: '/tmp/full.png' });
  const w0 = Math.round(300 * info.z * 2), h0 = Math.round(260 * info.z * 2);
  const cx = Math.round(info.sx * 2) - Math.round(w0/2), cy = Math.round((info.sy - 110 * info.z) * 2) - Math.round(h0*0.25);
  const w = Math.round(300 * info.z * 2), h = Math.round(260 * info.z * 2);
  fs.writeFileSync('/tmp/crop.json', JSON.stringify({ cx, cy, w, h }));
  console.log(JSON.stringify({ info, cx, cy, w, h, errs }));
  await b.close();
  const { execFileSync } = require('child_process');
})();
