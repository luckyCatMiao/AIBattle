const { chromium } = require('/tmp/pw/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    Game.state = 'paused';
    const cv = document.createElement('canvas');
    cv.width = 1400; cv.height = 900;
    cv.style.cssText = 'position:fixed;left:0;top:0;width:1400px;height:900px;z-index:99999;';
    document.body.appendChild(cv);
    const c = cv.getContext('2d');
    c.fillStyle = '#15161d'; c.fillRect(0, 0, 1400, 900);
    c.strokeStyle = '#23252e';
    for (let x = 0; x <= 1400; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 900); c.stroke(); }
    c.strokeStyle = '#2c2f3a';
    for (let y = 0; y <= 900; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(1400, y); c.stroke(); }
    const names = ['idle','runA','runB','atk1a','atk1b','atk2a','atk2b','atk3a','atk3b','chg2','hvyB','airA','airB','dashA','dashB','parryA','parryB','hurt','jumpUp','jumpFall','plunge','plungeB','land'];
    names.forEach((n, i) => {
      const col = i % 6, row = Math.floor(i / 6);
      Player.x = 100 + col * 220;
      Player.y = 145 + row * 150;
      Player.facing = 1;
      Player.__drawShadow = false;
      Player.pose = Object.assign({}, P[n]);
      Player.draw(c, Game);
      c.fillStyle = '#8c93a6'; c.font = '13px monospace';
      c.fillText(n, Player.x - 30, Player.y + 36);
    });
    Player.__drawShadow = true;
  });
  await p.waitForTimeout(150);
  await p.screenshot({ path: '/workspace/tests/11_poses.png' });
  await b.close();
})();
