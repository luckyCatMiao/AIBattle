import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const errs = [];
page.on('pageerror', e => errs.push('ERR ' + e.message + ' @' + (e.stack||'').split('\n')[1]));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
let deaths = 0;
for (let i = 0; i < 150; i++) {
  const info = await page.evaluate(() => {
    const p = Game.player;
    const alive = Game.enemies.filter(e => e.alive);
    let best = null, bd = 1e9;
    for (const e of alive) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; best = e; } }
    return { px: p.x, pst: p.state, hp: p.hp, alive: p.alive, ex: best ? best.x : null, est: best ? best.state : null, eat: best && best.attack ? best.attack.t / best.attack.def.active[0] : -1, wave: Game.wave, es: window.combatBenchState() };
  });
  if (!info.alive) { deaths++; console.log('DIED at', i, JSON.stringify(info.es)); await page.screenshot({ path: '/workspace/test/lb_death.png' }); await page.keyboard.press('KeyR'); await page.waitForTimeout(800); continue; }
  if (info.ex != null) {
    // parry when attack is winding up
    if (info.eat > 0.55 && info.eat < 0.95 && Math.random() < 0.5) { await page.keyboard.press('KeyI'); await page.waitForTimeout(60); await page.keyboard.press('KeyJ'); }
    else {
      const d = info.ex - info.px;
      if (Math.abs(d) > 70) { const k = d > 0 ? 'KeyD' : 'KeyA'; await page.keyboard.down(k); await page.waitForTimeout(90); await page.keyboard.up(k); }
      const r = Math.random();
      if (r < 0.45) await page.keyboard.press('KeyJ');
      else if (r < 0.55) { await page.keyboard.down('KeyK'); await page.waitForTimeout(300 + Math.random()*600); await page.keyboard.up('KeyK'); }
      else if (r < 0.63) await page.keyboard.press('KeyL');
      else if (r < 0.7) { await page.keyboard.press('Space'); await page.waitForTimeout(60); await page.keyboard.press('KeyJ'); }
    }
  }
  await page.waitForTimeout(100);
  if (i % 30 === 29) {
    console.log(i, JSON.stringify(await page.evaluate(() => ({ ...window.combatBenchState(), wave: Game.wave, hp: Math.round(Game.player.hp), fps: '?' }))));
    await page.screenshot({ path: `/workspace/test/lb_${i}.png` });
  }
}
console.log('deaths', deaths, 'errors', errs.slice(0, 4));
console.log(JSON.stringify(await page.evaluate(() => window.combatBenchState())));
await browser.close();
