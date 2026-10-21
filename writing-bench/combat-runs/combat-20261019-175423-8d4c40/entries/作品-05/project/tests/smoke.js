const { chromium } = require('/tmp/pw/node_modules/playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));

  await page.goto('file:///workspace/game.html');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/workspace/tests/01_title.png' });

  console.log('state@title', await page.evaluate(() => window.combatBenchState()));

  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('state@start', await page.evaluate(() => window.combatBenchState()));
  await page.screenshot({ path: '/workspace/tests/02_start.png' });

  // walk right and attack
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  await page.screenshot({ path: '/workspace/tests/03_walk.png' });

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(160);
  }
  console.log('state@afteratk', await page.evaluate(() => window.combatBenchState()));
  await page.screenshot({ path: '/workspace/tests/04_attack.png' });

  // find nearest enemy info via debug hook
  const info = await page.evaluate(() => {
    // @ts-ignore
    if (!window.__dbg) return null;
    return window.__dbg();
  });
  console.log('dbg', JSON.stringify(info));

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
