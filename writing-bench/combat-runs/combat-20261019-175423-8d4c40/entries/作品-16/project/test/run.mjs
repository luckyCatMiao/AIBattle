// Headless self-test for game.html
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';

const EXE = '/workspace/test/.chrome-cache/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const URL = 'file:///workspace/game.html';
mkdirSync('/workspace/test/shots', { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = [];
function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  (' + JSON.stringify(extra) + ')' : ''}`);
  if (!cond) failures.push(name);
}

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await sleep(800);

const bench = () => page.evaluate(() => window.combatBenchState());

// 1. initial state
let s = await bench();
check('ready on load', s.ready === true, s);
check('not playing on load', s.playing === false, s);
check('player alive on load', s.playerAlive === true, s);
await page.screenshot({ path: '/workspace/test/shots/1_title.png' });

// 2. start with Enter
await page.keyboard.press('Enter');
await sleep(2500);
s = await bench();
check('playing after Enter', s.playing === true, s);
check('enemies spawned quickly', s.enemyCount >= 1, s);

// helper: steering driver inside the page
await page.evaluate(() => {
  window.__drv = { mode: 'fight', keys: {} };
});

const key = async (code, down) => {
  if (down) await page.keyboard.down(code); else await page.keyboard.up(code);
};

// 3. drive combat: in-page autopilot dispatching real keyboard events at 50ms
await page.evaluate(() => {
  const kd = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
  const ku = c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
  const held = {};
  const hold = (c, on) => { if (on && !held[c]) { kd(c); held[c] = true; } else if (!on && held[c]) { ku(c); held[c] = false; } };
  const tap = c => { kd(c); setTimeout(() => ku(c), 30); };
  window.__ap = setInterval(() => {
    const g = window.__game;
    if (!g || g.state !== 'playing') return;
    const p = g.player;
    const alive = g.enemies.filter(e => e.state !== 'dead' && e.state !== 'spawn');
    if (!alive.length) { hold('KeyA', false); hold('KeyD', false); return; }
    let n = alive[0], nd = 1e9;
    for (const e of alive) { const d = Math.abs(e.x - p.x) + (e.state === 'selfdestruct' ? 900 : 0); if (d < nd) { nd = d; n = e; } }
    const dx = n.x - p.x, adx = Math.abs(dx);
    // steer
    hold('KeyD', dx > 80);
    hold('KeyA', dx < -80);
    // dodge telegraphed attacks nearby
    if (n.state === 'telegraph' && adx < 170 && p.dashCD <= 0 && p.state === 'free' && Math.random() < 0.3) tap('KeyL');
    if (p.state === 'dead') return;
    if (p.state === 'charge') {
      if (p.charge >= 1) hold('KeyK', false);
      return;
    }
    if (p.state !== 'free') return;
    if (adx < 95) {
      if (n.staggerT > 0) { hold('KeyK', true); return; } // charge heavy to sever
      tap('KeyJ');
      if (Math.random() < 0.06) tap('KeyI');
    } else if (n.staggerT > 0 && adx < 240) {
      hold('KeyK', true); // start charging, heavy lunge will close the gap
    } else if (adx < 260 && Math.random() < 0.05) {
      tap('KeyL');
    }
    if (Math.random() < 0.01) tap('Space');
  }, 50);
});
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
await sleepMs(20000);
await page.screenshot({ path: '/workspace/test/shots/2_combat.png' });
s = await bench();
check('landed hits in combat', s.hitCount > 5, s);
check('limb breaks happened', s.limbBreakCount > 0, s);

// 4. keep fighting for variety
await sleepMs(20000);
await page.screenshot({ path: '/workspace/test/shots/3_combat2.png' });
await page.evaluate(() => clearInterval(window.__ap));
s = await bench();
console.log('state after 40s:', JSON.stringify(s));
check('sustained combat works', s.hitCount > 15, s);

// 5. player death & restart flow
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => { const g = window.__game; g.player.invulnT = 0; g.player.dashT = 0; g.player.takeHit(999, 1, g); });
  await sleep(120);
  if (!(await bench()).playerAlive) break;
}
s = await bench();
check('playerAlive false after fatal hit', s.playerAlive === false, s);
await sleep(1800);
await page.screenshot({ path: '/workspace/test/shots/4_over.png' });
await page.keyboard.press('KeyR');
await sleep(400);
s = await bench();
check('restart works with R', s.playing === true && s.playerAlive === true && s.hitCount === 0, s);

// 6. mute toggle & page scroll prevention
await page.keyboard.press('KeyM');
await sleep(150);
const muted = await page.evaluate(() => AUDIO.muted);
check('M toggles mute', muted === true, muted);
await page.keyboard.press('KeyM');
const scrolled = await page.evaluate(() => window.scrollY === 0 && document.body.scrollTop === 0);
check('no page scroll from game keys', scrolled);

// 7. blur clears keys
await page.keyboard.down('KeyD');
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
const keyCleared = await page.evaluate(() => Input.isDown('right') === false);
check('blur clears held keys', keyCleared);

// 8. small viewport 960x540 sanity
await page.setViewport({ width: 960, height: 540 });
await sleep(500);
await page.screenshot({ path: '/workspace/test/shots/5_small.png' });
check('still playing at 960x540', (await bench()).playing === true);

// 9. errors
check('no runtime errors', errors.length === 0, errors.slice(0, 5));

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURES: ${failures.join(', ')}` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
