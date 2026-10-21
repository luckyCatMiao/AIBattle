import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(500);
await page.evaluate(() => { Game.spawnQueue.length=0; Game.enemies.forEach(e=>e.dead=true); Game.enemies.length=0; Game.spawnEnemy('warden'); const e=Game.enemies[0]; e.x=Game.player.x+74; e.facing=-1; e.atkCd=99; e.hp=999; e.maxHp=999; window.__r=[]; });
await page.waitForTimeout(400);
// do 12 J presses and log limb hp each
for (let i=0;i<10;i++){
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(180);
  const st = await page.evaluate(()=>{const e=Game.enemies[0]; if(!e) return null; return {i:0, st:e.state, limbs:Object.fromEntries(Object.entries(e.limbs).map(([k,v])=>[k,Math.round(v.hp)+ (v.attached?'':'x')])), br:Game.limbBreakCount};});
  console.log(i, JSON.stringify(st));
}
await page.screenshot({ path:'/workspace/test/dmg.png'});
await browser.close();
