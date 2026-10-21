// Headless smoke + gameplay test for /workspace/game.html
const { chromium } = require('/home/player/pw/node_modules/playwright');
const fs = require('fs');

const OUT = '/workspace/test-out';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });
  await page.goto('file:///workspace/game.html');
  await page.waitForTimeout(900);
  const state0 = await page.evaluate(() => window.combatBenchState());
  console.log('initial state', state0);
  await page.screenshot({ path: OUT + '/01-title.png' });

  await page.mouse.click(640, 400);
  await page.waitForTimeout(1400);
  const state1 = await page.evaluate(() => window.combatBenchState());
  console.log('after start', state1);
  await page.screenshot({ path: OUT + '/02-start.png' });

  // move right and attack a few times
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(160);
    if (i % 4 === 3) await page.screenshot({ path: OUT + `/03-combat-${i}.png` });
  }
  const state2 = await page.evaluate(() => window.combatBenchState());
  console.log('after attacks', state2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/04-after.png' });

  // jump + dash + attack
  await page.keyboard.press('Space');
  await page.waitForTimeout(180);
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(120);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/05-air.png' });

  // hold heavy
  await page.keyboard.down('KeyK');
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/06-charge.png' });
  await page.keyboard.up('KeyK');
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/07-heavy.png' });

  const info = await page.evaluate(() => {
    const g = window.AV && window.AV.game;
    return {
      state: g && g.state,
      player: g && { x: Math.round(g.player.x), y: Math.round(g.player.y), hp: g.player.hp, st: g.player.state },
      enemies: g && g.enemies.map((e) => ({ kind: e.kind, x: Math.round(e.x), hp: Math.round(e.hp), st: e.state, alive: e.alive })),
      stats: g && g.stats,
      fxCount: g && g.fx.list.length,
      audioEnabled: g && g.audio.enabled,
      combo: g && g.combo,
    };
  });
  console.log('info', JSON.stringify(info, null, 2));

  // let it run some seconds to test waves
  await page.waitForTimeout(4000);
  await page.screenshot({ path: OUT + '/08-later.png' });
  const info2 = await page.evaluate(() => {
    const g = window.AV.game;
    return {
      state: g.state, wave: g.wave, enemies: g.enemies.length,
      hp: g.player.hp, combo: g.combo, score: g.score,
      stats: g.stats, queue: g.spawnQueue.length,
    };
  });
  console.log('later', info2);

  if (errors.length) {
    console.log('ERRORS:\n' + errors.join('\n'));
  } else {
    console.log('NO PAGE ERRORS');
  }
  await browser.close();
})();
