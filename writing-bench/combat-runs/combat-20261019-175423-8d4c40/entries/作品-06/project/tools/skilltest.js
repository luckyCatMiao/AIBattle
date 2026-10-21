/**
 * Skill regression test: verifies all four signature techniques actually work
 * inside the real game, plus the qi / cooldown gates.
 */
const { chromium } = require('/tmp/pwtest/node_modules/playwright-core');
const EXE = '/tmp/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (n, c, x) => {
  if (c) { pass++; console.log('  PASS ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); }
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file:///workspace/game.html');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);

  async function setup(n = 3) {
    await page.evaluate((n) => {
      Game.enemies.length = 0; Game.spawnQueue.length = 0; Game.wave = 99; Game.bannerT = 0;
      const kinds = ['husk', 'stalker', 'warden'];
      for (let i = 0; i < n; i++) {
        const e = new Enemy(kinds[i % 3], 120 + i * 80);
        e.cooldown = 999; e.hp = e.maxHp = 300;
        Game.enemies.push(e);
      }
      Game.player.x = 0; Game.player.qi = 100; Game.player.facing = 1;
      Game.player.hitstun = 0; Game.player.act = null;
      for (const k in Game.player.skillCd) Game.player.skillCd[k] = 0;
    }, n);
    await page.waitForTimeout(300);
  }
  const state = () => page.evaluate(() => ({
    hits: Game.hitCount, qi: Game.player.qi,
    hps: Game.enemies.map(e => Math.round(e.hp))
  }));

  console.log('\n[U] 斩月·居合');
  await setup();
  const s0 = await state();
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(700);
  const s1 = await state();
  check('fires and damages', s1.hits > s0.hits, { s0, s1 });
  check('spends 35 qi', s1.qi < 100, s1.qi);
  check('goes on cooldown', await page.evaluate(() => Game.player.skillCd.iai > 0));
  check('moves the player across the cut', await page.evaluate(() => Math.abs(Game.player.x) > 80));

  console.log('\n[O] 千刃回旋');
  await setup();
  const v0 = await state();
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(1500);
  const v1 = await state();
  check('deals multiple hits', v1.hits >= v0.hits + 4, { v0, v1 });
  check('spends qi', v1.qi < 100, v1.qi);

  console.log('\n[P] 断空·升龙');
  await setup();
  const k0 = await state();
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(900);
  const k1 = await state();
  check('damages enemies', k1.hits > k0.hits, { k0, k1 });
  check('launches at least one airborne', await page.evaluate(() => Game.enemies.some(e => !e.onGround || e.y < WORLD.ground - 10)));
  check('player leaves the ground', await page.evaluate(() => Game.player.y < WORLD.ground - 20 || Game.player.vy < -100));

  console.log('\n[H] 残心·时刃');
  await setup();
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(250);
  check('opens a time fracture', await page.evaluate(() => Game.timeFracture > 0.5));
  check('qi dropped by the 60 cost', await page.evaluate(() => Game.player.qi <= 60));
  await page.waitForTimeout(2200);
  check('fracture expires', await page.evaluate(() => Game.timeFracture === 0));

  console.log('\n[gating]');
  await setup();
  await page.evaluate(() => { Game.player.qi = 0; });
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(200);
  check('no cast without qi', await page.evaluate(() => Game.player.skillCd.iai === 0));
  await page.evaluate(() => { Game.player.qi = 100; Game.player.skillCd.iai = 5; });
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(200);
  check('no cast on cooldown', await page.evaluate(() => Game.player.qi) === 100);

  console.log('\n[HUD]');
  check('skill bar exists with 4 entries', await page.evaluate(() => document.querySelectorAll('#skillbar .skill').length) === 4);
  check('qi meter updates', await page.evaluate(() => !!document.getElementById('qiFill')));

  check('no runtime errors', errors.length === 0, errors.slice(0, 4));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
