// Targeted mechanic verification: launcher, slam, bolt slash, self-destruct, limb effects
import puppeteer from 'puppeteer';
const EXE = '/workspace/test/.chrome-cache/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = [];
const check = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== undefined ? '  ' + JSON.stringify(x) : ''}`); if (!c) failures.push(n); };

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('file:///workspace/game.html', { waitUntil: 'load' });
await sleep(500);
await page.keyboard.press('Enter');
await sleep(1200);

const kd = c => page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })), c);
const ku = c => page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), c);

// clear field and set up a blade enemy right in front
await page.evaluate(() => {
  const g = window.__game;
  g.enemies.length = 0; g.portals.length = 0; g.spawnT = 999;
  g.player.x = 1700; g.player.vx = 0; g.player.facing = 1;
  const e = new Enemy('blade', 1760, g);
  e.state = 'chase'; e.cooldown = 999;
  g.enemies.push(e);
});

// --- launcher pops enemy airborne ---
await kd('KeyI'); await sleep(400); await ku('KeyI');
const launched = await page.evaluate(() => {
  const e = window.__game.enemies[0];
  return { state: e.state, vy: e.vy, y: e.y, stagger: e.staggerT };
});
check('launcher pops enemy airborne', launched.state === 'juggle' || launched.vy < 0 || launched.stagger > 0, launched);
await sleep(1200);

// --- air slam after jump ---
await page.evaluate(() => { const g = window.__game; const e = g.enemies[0]; if (e) { e.x = g.player.x + 40; e.state = 'chase'; e.staggerT = 1; e.vy = 0; e.y = g.groundY; } });
await kd('Space'); await sleep(80); await ku('Space');
await sleep(120);
const slamHits0 = await page.evaluate(() => window.__game.hitCount);
await kd('KeyI'); await sleep(700); await ku('KeyI'); await sleep(600);
const slamRes = await page.evaluate(() => ({ hits: window.__game.hitCount, py: window.__game.player.y, pst: window.__game.player.state }));
check('air slam lands and hits', slamRes.hits > slamHits0 && slamRes.py >= 618, slamRes);
await sleep(800);

// --- bolt can be slashed ---
await page.evaluate(() => {
  const g = window.__game;
  g.enemies.length = 0;
  const e = new Enemy('gunner', g.player.x + 200, g);
  e.state = 'chase'; e.cooldown = 0.1; e.broken.armL = true;
  g.enemies.push(e);
  g.bolts.push({ x: g.player.x + 60, y: g.player.y - 40, vx: -0.01, vy: 0, dmg: 9, age: 0 });
});
await sleep(150);
const boltsBefore = await page.evaluate(() => window.__game.bolts.length);
await kd('KeyJ'); await sleep(500); await ku('KeyJ');
const boltRes = await page.evaluate(() => ({ bolts: window.__game.bolts.length, hits: window.__game.hitCount }));
check('bolt exists before slash', boltsBefore >= 1, boltsBefore);
check('slash destroys bolt (弹反)', boltRes.bolts === 0 && boltRes.hits > 0, boltRes);

// --- both arms broken => self-destruct => explosion kills enemy ---
await page.evaluate(() => {
  const g = window.__game;
  g.enemies.length = 0; g.bolts.length = 0;
  const e = new Enemy('blade', g.player.x + 150, g);
  e.state = 'chase';
  g.enemies.push(e);
  e.breakLimb('armR', g, true);
  e.breakLimb('armL', g, true);
});
const sdState = await page.evaluate(() => window.__game.enemies[0] ? window.__game.enemies[0].state : 'gone');
check('both arms broken triggers self-destruct', sdState === 'selfdestruct', sdState);
const kills0 = await page.evaluate(() => window.__game.kills);
await sleep(3200);
const afterSD = await page.evaluate(() => ({ kills: window.__game.kills, n: window.__game.enemies.length }));
check('self-destruct explodes and kills', afterSD.kills > kills0 || afterSD.n === 0, afterSD);

// --- leg break slows enemy ---
const legRes = await page.evaluate(() => {
  const g = window.__game;
  const e = new Enemy('blade', 800, g);
  e.state = 'chase';
  const full = e.speedMult;
  e.broken.legL = true;
  const one = e.speedMult;
  e.broken.legR = true;
  const two = e.speedMult;
  return { full, one, two };
});
check('leg breaks slow enemy', legRes.one < legRes.full && legRes.two < legRes.one, legRes);

// --- head break breaks aim ---
const headRes = await page.evaluate(() => {
  const g = window.__game;
  const e = new Enemy('blade', 800, g);
  g.player.x = 900;
  e.aimAt(g); const a1 = e.aimDx;
  let wrong = 0;
  e.broken.head = true;
  for (let i = 0; i < 20; i++) { e.aimAt(g); if (e.aimDx !== 1) wrong++; }
  return { a1, wrong };
});
check('headless enemy aims erratically', headRes.wrong > 0, headRes);

// --- hammer armor: light hit clangs and deals reduced damage ---
const armorRes = await page.evaluate(() => {
  const g = window.__game;
  const e = new Enemy('hammer', 800, g);
  e.state = 'chase';
  const hp0 = e.hp;
  const r1 = e.takeHit({ dmg: 10, poise: 13, kx: 0, ky: 0, dirX: 1 }, g);
  const lightDmg = hp0 - e.hp;
  const hp1 = e.hp;
  const r2 = e.takeHit({ dmg: 10, poise: 50, kx: 0, ky: 0, dirX: 1, heavy: true, breakPart: true }, g);
  const heavyDmg = hp1 - e.hp;
  g.enemies.length = 0;
  return { lightDmg, heavyDmg, clang: r1.clang };
});
check('armored enemy: light damage reduced', armorRes.lightDmg < armorRes.heavyDmg && armorRes.clang, armorRes);

// --- dash i-frames avoid damage ---
const dashRes = await page.evaluate(() => {
  const g = window.__game;
  g.player.state = 'dash'; g.player.dashT = 0.1; g.player.invulnT = 0;
  const hp0 = g.player.hp;
  const took = g.player.takeHit(10, 1, g);
  g.player.state = 'free'; g.player.dashT = 0;
  return { took, hp: g.player.hp === hp0 };
});
check('dash i-frames avoid damage', dashRes.took === false && dashRes.hp, dashRes);

check('no runtime errors', errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL MECHANIC CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
