import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
const dump = () => page.evaluate(() => ({
  p: { x: Math.round(Game.player.x), st: Game.player.state, face: Game.player.facing, act: Game.player.act && Game.player.act.name, t: Game.player.act && +Game.player.act.t.toFixed(3), hitstop: +Game.hitstop.toFixed(3), playing: Game.playing, hit: Game.hitCount },
  e: Game.enemies.map(e => ({ x: Math.round(e.x), st: e.state, hp: Math.round(e.hp), dead: e.dead }))
}));
console.log('before', JSON.stringify(await dump()));
await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
console.log('after move', JSON.stringify(await dump()));
await page.keyboard.press('KeyJ');
await page.waitForTimeout(30);
console.log('t+30', JSON.stringify(await dump()));
await page.waitForTimeout(70);
console.log('t+100', JSON.stringify(await dump()));
await page.waitForTimeout(200);
console.log('t+300', JSON.stringify(await dump()));
await page.keyboard.press('KeyJ'); await page.waitForTimeout(120);
await page.keyboard.press('KeyJ'); await page.waitForTimeout(100);
await page.keyboard.press('KeyJ'); await page.waitForTimeout(200);
console.log('after 3 more', JSON.stringify(await dump()));
await page.screenshot({ path: '/workspace/test/dbg.png' });
await browser.close();
