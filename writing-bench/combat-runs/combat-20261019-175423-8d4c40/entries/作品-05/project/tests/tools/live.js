// Live combat capture: spawns the three enemy types and frames the combo window.
const { chromium } = require('/tmp/pw/node_modules/playwright');
const out = process.argv[2] || '/tmp/live';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(450);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    Game.spawnQueue.length = 0; Game.waveActive = false; Game.nextWaveTimer = null;
    Game.enemies = [];
    Player.x = 560; Player.state = 'idle'; Player.facing = 1;
    const a = Game.spawnEnemy('husk'); a.x = Player.x + 96; a.spawnT = 0; a.canAct = false; a.state = 'idle';
    const c = Game.spawnEnemy('spinner'); c.x = Player.x - 190; c.spawnT = 0; c.canAct = false; c.state = 'idle';
    const d = Game.spawnEnemy('slammer'); d.x = Player.x + 330; d.spawnT = 0; d.canAct = false; d.state = 'idle';
    window.__slammer = d;
  });
  await p.waitForTimeout(250);
  await p.screenshot({ path: out + '_idle.png' });
  const seq = [['KeyJ', 110], ['KeyJ', 105], ['KeyJ', 140], ['KeyK', 300], ['KeyL', 120]];
  let n = 0;
  for (const [k, wait] of seq) {
    await p.keyboard.press(k);
    await p.waitForTimeout(wait);
    await p.screenshot({ path: `${out}_${++n}.png` });
  }
  // parry test: force an enemy attack against a raised guard
  await p.evaluate(() => {
    Player.state = 'parry'; Player.parryT = 0.3; Player.parryWindow = 0.18; Player.parryCd = 0;
    const a = Game.enemies[0]; a.x = Player.x + 70; a.state = 'attack'; a.stateT = 0.02; a.facing = -1;
    a.didAttack = false;
  });
  await p.waitForTimeout(90);
  await p.screenshot({ path: `${out}_parry.png` });
  console.log('state', JSON.stringify(await p.evaluate(() => window.combatBenchState())));
  console.log('errors', errs);
  await b.close();
})();
