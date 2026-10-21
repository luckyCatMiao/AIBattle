import puppeteer from 'puppeteer';
const EXE = '/workspace/test/.chrome-cache/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('file:///workspace/game.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 500));
await page.keyboard.press('Enter');
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
    for (const e of alive) { const d = Math.abs(e.x - p.x); if (d < nd) { nd = d; n = e; } }
    const dx = n.x - p.x, adx = Math.abs(dx);
    hold('KeyD', dx > 80);
    hold('KeyA', dx < -80);
    if (p.state === 'charge') { if (p.charge >= 1) hold('KeyK', false); return; }
    if (p.state !== 'free') return;
    if (adx < 95) {
      if (n.staggerT > 0) { hold('KeyK', true); return; }
      tap('KeyJ');
    }
  }, 50);
});
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const st = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const alive = g.enemies.filter(e => e.state !== 'dead' && e.state !== 'spawn');
    const n = alive.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    return {
      t: g.time.toFixed(1), hp: p.hp, pst: p.state, px: Math.round(p.x),
      ex: n ? Math.round(n.x) : null, et: n ? n.type : null, es: n ? n.state : null,
      ed: n ? Math.abs(Math.round(n.x - p.x)) : null,
      hits: g.hitCount, limbs: g.limbBreaks, kills: g.kills, stag: n ? +n.staggerT.toFixed(1) : 0,
      broken: n ? Object.keys(n.broken).filter(k => n.broken[k]).join('+') : '',
      facing: p.facing, en: alive.length,
    };
  });
  console.log(JSON.stringify(st));
}
await browser.close();
