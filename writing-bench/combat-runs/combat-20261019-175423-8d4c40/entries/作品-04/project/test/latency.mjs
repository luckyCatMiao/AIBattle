import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
await page.evaluate(() => { Game.spawnQueue.length=0; Game.enemies.length=0; window.__press=null; window.__react=null;
  window.addEventListener('keydown', e=>{ if(e.code==='KeyJ'){ window.__press = performance.now(); window.__react=null; } }, true);
  const tick=()=>{ if (window.__press && !window.__react && Game.player.state==='attack') window.__react = performance.now(); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
});
for (let i=0;i<6;i++){
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(420);
  console.log(i, JSON.stringify(await page.evaluate(()=>window.__press && window.__react ? +(window.__react-window.__press).toFixed(1) : null)));
}
await browser.close();
