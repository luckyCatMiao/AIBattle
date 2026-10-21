const { chromium } = require('/tmp/pwtest/node_modules/playwright-core');
const EXE = '/tmp/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; page.on('pageerror', e=>errs.push(e.message));
  await page.goto('file:///workspace/game.html');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    Game.enemies.length = 0; Game.spawnQueue.length = 0;
    Game.player.x = -260;
    for (const [k,x] of [['husk',-60],['stalker',120],['warden',300]]) {
      const e = new Enemy(k, x); e.state='idle'; e.spawnT=0; e.yOff=0; e.cooldown=99; Game.enemies.push(e);
    }
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/workspace/shots/lineup.png' });
  await page.screenshot({ path: '/workspace/shots/lineup-left.png', clip: {x:0,y:300,width:640,height:420} });
  console.log(errs);
  await browser.close();
})();
