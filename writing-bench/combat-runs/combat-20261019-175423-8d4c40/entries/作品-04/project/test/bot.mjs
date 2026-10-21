import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message, (e.stack||'').split('\n')[1]));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.evaluate(() => {
  window.__fps = []; let last = performance.now();
  const tick = t => { window.__fps.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const keys = ['KeyJ','KeyJ','KeyJ','KeyK','KeyL','KeyI','KeyJ'];
for (let i = 0; i < 60; i++) {
  // approach nearest
  const d = await page.evaluate(() => { const e = Game.enemies.find(e => !e.dead && e.state !== 'dying'); return e ? e.x - Game.player.x : 0; });
  if (Math.abs(d) > 80) { const k = d > 0 ? 'KeyD' : 'KeyA'; await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); }
  if (i % 7 === 3) { await page.keyboard.down('KeyK'); await page.waitForTimeout(400 + Math.random()*500); await page.keyboard.up('KeyK'); }
  else if (i % 11 === 5) { await page.keyboard.press('KeyL'); }
  else if (i % 13 === 9) { await page.keyboard.press('KeyI'); }
  else if (i % 9 === 2) { await page.keyboard.press('Space'); await page.waitForTimeout(100); await page.keyboard.press('KeyJ'); }
  else { await page.keyboard.press(keys[i % keys.length]); }
  await page.waitForTimeout(150 + Math.random() * 150);
  if (i % 15 === 14) {
    const st = await page.evaluate(() => ({s: window.combatBenchState(), wave: Game.wave, php: Math.round(Game.player.hp), fps: window.__fps.length ? (1000/(window.__fps.reduce((a,b)=>a+b,0)/window.__fps.length)).toFixed(1) : '?'}));
    console.log(i, JSON.stringify(st));
    await page.screenshot({ path: `/workspace/test/b_${i}.png` });
  }
}
await page.waitForTimeout(800);
console.log('final', JSON.stringify(await page.evaluate(() => ({s: window.combatBenchState(), wave: Game.wave, limbs: Game.limbs.length, parts: FX.parts.length, enemies: Game.enemies.length}))));
await page.screenshot({ path: '/workspace/test/b_final.png' });
await browser.close();
