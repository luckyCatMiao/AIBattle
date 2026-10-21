/**
 * Self-test: drives the real game in a headless browser and asserts the
 * required mechanics actually work. Not part of the shipped file.
 */
const { chromium } = require('/tmp/pwtest/node_modules/playwright-core');
const EXE = '/tmp/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const FILE = 'file:///workspace/game.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '   -> ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(FILE);
  await page.waitForTimeout(500);

  // ---------- 1. Boot & state API ----------
  console.log('\n[1] Boot / state API');
  let s = await page.evaluate(() => window.combatBenchState());
  check('combatBenchState() exists and returns fields', s && 'ready' in s && 'playerAlive' in s && 'enemyCount' in s && 'hitCount' in s && 'limbBreakCount' in s && 'playing' in s, s);
  check('ready at boot', s.ready === true);
  check('not playing before Enter', s.playing === false);

  // ---------- 2. Start / first seconds ----------
  console.log('\n[2] Start flow');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  s = await page.evaluate(() => window.combatBenchState());
  check('Enter starts the fight', s.playing === true);
  check('player alive', s.playerAlive === true);

  // ---------- 3. Movement ----------
  console.log('\n[3] Movement / jump / dash');
  const x0 = await page.evaluate(() => Game.player.x);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => Game.player.x);
  check('D moves the player right', x1 > x0 + 20, { x0, x1 });
  await page.keyboard.down('KeyA'); await page.waitForTimeout(300); await page.keyboard.up('KeyA');
  const x2 = await page.evaluate(() => Game.player.x);
  check('A moves the player left', x2 < x1 - 10, { x1, x2 });

  const yGround = await page.evaluate(() => Game.player.y);
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const air = await page.evaluate(() => ({ y: Game.player.y, on: Game.player.onGround, vy: Game.player.vy }));
  check('Space jumps', air.y < yGround - 20 && !air.on, air);
  await page.waitForTimeout(900);

  const xBeforeDash = await page.evaluate(() => Game.player.x);
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(200);
  const xAfterDash = await page.evaluate(() => Game.player.x);
  check('L dashes', Math.abs(xAfterDash - xBeforeDash) > 60, { xBeforeDash, xAfterDash });

  // ---------- 4. Attacks & hits ----------
  console.log('\n[4] Attacks hit enemies');
  await page.evaluate(() => {
    Game.enemies.length = 0; Game.spawnQueue.length = 0; Game.wave = 99; Game.bannerT = 0;
    Game.player.x = 0; Game.player.facing = 1; Game.player.hp = 100;
    const e = new Enemy('husk', 110); e.state = 'chase'; e.cooldown = 999;
    Game.enemies.push(e);
  });
  await page.waitForTimeout(200);
  const hits0 = (await page.evaluate(() => window.combatBenchState())).hitCount;
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(140); }
  await page.waitForTimeout(300);
  s = await page.evaluate(() => window.combatBenchState());
  check('J light chain deals hits', s.hitCount > hits0, s);

  // heavy / charged attack
  const hpBefore = await page.evaluate(() => Game.enemies[0].hp);
  await page.evaluate(() => { Game.player.x = Game.enemies[0].x - 100; Game.player.facing = 1; });
  await page.keyboard.down('KeyK'); await page.waitForTimeout(520); await page.keyboard.up('KeyK');
  await page.waitForTimeout(400);
  const hpAfter = await page.evaluate(() => Game.enemies[0] ? Game.enemies[0].hp : 0);
  check('K charged heavy damages', hpAfter < hpBefore, { hpBefore, hpAfter });

  // ---------- 5. Limb breaks ----------
  console.log('\n[5] Limb destruction');
  await page.evaluate(() => {
    Game.enemies.length = 0; Game.player.x = 0; Game.player.hp = 100;
    const e = new Enemy('warden', 110); e.state = 'chase'; e.cooldown = 999; Game.enemies.push(e);
    // soften limbs so the test can verify the real break path quickly
    for (const k in e.limbs) e.limbs[k].hp = 12;
  });
  const lb0 = (await page.evaluate(() => window.combatBenchState())).limbBreakCount;
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { if (Game.enemies[0]) { Game.player.x = Game.enemies[0].x - 105; Game.player.facing = 1; } });
    await page.keyboard.down('KeyK'); await page.waitForTimeout(520); await page.keyboard.up('KeyK');
    await page.waitForTimeout(420);
  }
  s = await page.evaluate(() => window.combatBenchState());
  const limbs = await page.evaluate(() => Game.enemies[0] ? Game.enemies[0].limbs : null);
  const anyBroken = limbs && Object.values(limbs).some(l => l.broken);
  check('limbBreakCount increments', s.limbBreakCount > lb0, { lb0, now: s.limbBreakCount });
  check('an enemy limb is actually severed', !!anyBroken, limbs);

  // ---------- 6. Enemy variety & aggression ----------
  console.log('\n[6] Enemy behaviour');
  await page.evaluate(() => {
    Game.enemies.length = 0; Game.spawnQueue.length = 0; Game.player.hp = 100; Game.player.invuln = 0;
    Game.player.x = 0;
    for (const [k, x] of [['husk', 220], ['stalker', -220], ['warden', 380]]) {
      const e = new Enemy(k, x); e.cooldown = 0.1; Game.enemies.push(e);
    }
  });
  const kinds = await page.evaluate(() => [...new Set(Game.enemies.map(e => e.kind))].sort());
  check('at least two distinct enemy types exist', kinds.length >= 2, kinds);
  // idle for a while: enemies must approach and attack
  const seen = await page.evaluate(() => {
    window.__seen = { tell: 0, attack: 0, moved: 0 };
    window.__startX = Game.enemies.map(e => e.x);
    return true;
  });
  await page.waitForTimeout(4200);
  const aggro = await page.evaluate(() => {
    const moved = Game.enemies.some((e, i) => Math.abs(e.x - window.__startX[i]) > 40);
    const attacked = Game.enemies.some(e => e.state === 'attack' || e.state === 'tell' || e.state === 'recover');
    return { moved, attacked, states: Game.enemies.map(e => e.state) };
  });
  check('enemies actively approach', aggro.moved, aggro);
  check('enemies wind up and attack', aggro.attacked, aggro);

  const hpMid = await page.evaluate(() => Game.player.hp);
  check('idle player takes damage from enemies', hpMid < 100, hpMid);

  // ---------- 7. Player damage / death / restart ----------
  console.log('\n[7] Damage, death, restart');
  await page.evaluate(() => { Game.player.hp = 1; Game.player.invuln = 0; Game.enemies.forEach(e => { e.cooldown = 0; }); });
  await page.waitForTimeout(2600);
  s = await page.evaluate(() => window.combatBenchState());
  check('player can die', s.playerAlive === false, s);
  check('playing false after death', s.playing === false);
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  s = await page.evaluate(() => window.combatBenchState());
  check('R restarts instantly', s.playerAlive === true && s.playing === true && s.enemyCount >= 0, s);
  check('restart clears counters', s.hitCount === 0 && s.limbBreakCount === 0, s);

  // ---------- 8. Waves / continuous play ----------
  console.log('\n[8] Waves');
  await page.waitForTimeout(1500);
  const w = await page.evaluate(() => ({ wave: Game.wave, count: Game.enemies.length }));
  check('first wave spawns enemies within seconds', w.count > 0, w);
  check('wave counter advanced', w.wave >= 1, w);

  // ---------- 9. Audio ----------
  console.log('\n[9] Audio + mute');
  const audio = await page.evaluate(() => ({ ctx: !!Sfx.ctx, muted: Sfx.muted, state: Sfx.ctx && Sfx.ctx.state }));
  check('AudioContext created after a key press', audio.ctx === true, audio);
  const muteBtn = await page.$('#btnMute');
  check('mute button exists', !!muteBtn);
  if (muteBtn) {
    await muteBtn.click();
    await page.waitForTimeout(150);
    const muted = await page.evaluate(() => Sfx.muted);
    check('mute button toggles audio', muted === true, muted);
    await muteBtn.click();
    await page.waitForTimeout(100);
    const unmuted = await page.evaluate(() => Sfx.muted);
    check('mute button toggles back', unmuted === false, unmuted);
  }

  // ---------- 10. Pause & focus loss ----------
  console.log('\n[10] Pause / focus');
  await page.evaluate(() => { Game.pause(); });
  await page.waitForTimeout(150);
  s = await page.evaluate(() => window.combatBenchState());
  check('pause stops play', s.playing === false, s);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  s = await page.evaluate(() => window.combatBenchState());
  check('Esc resumes', s.playing === true, s);

  // blur clears held keys
  await page.keyboard.down('KeyD');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const cleared = await page.evaluate(() => Input.down['KeyD'] === false);
  check('focus loss clears held keys', cleared);
  await page.keyboard.up('KeyD');

  // ---------- 11. Rendering sanity ----------
  console.log('\n[11] Render sanity');
  const px = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(400, 500, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  check('canvas draws non-black pixels', px.some(v => v > 8), px);
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollHeight <= window.innerHeight + 2;
  });
  check('page does not scroll', overflow);

  // ---------- 12. Long-run stability ----------
  console.log('\n[12] Stability');
  const t0 = Date.now();
  let frames0 = await page.evaluate(() => Game.frame);
  while (Date.now() - t0 < 6000) {
    await page.evaluate(() => { if (Game.state === 'dead') Game.restart(); });
    await page.keyboard.press(Math.random() < 0.75 ? 'KeyJ' : 'KeyL');
    await page.waitForTimeout(90);
  }
  const frames1 = await page.evaluate(() => Game.frame);
  check('render loop keeps running', frames1 > frames0 + 60, { frames0, frames1 });
  const fps = (frames1 - frames0) / ((Date.now() - t0) / 1000);
  console.log('       ~' + fps.toFixed(1) + ' fps under load');
  check('no runtime errors', errors.length === 0, errors.slice(0, 5));

  console.log('\n=========================================');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('=========================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
