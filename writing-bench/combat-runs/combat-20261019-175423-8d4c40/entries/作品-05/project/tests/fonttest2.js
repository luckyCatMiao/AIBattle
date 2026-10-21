const { chromium } = require('/tmp/pw/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(2000);
  await p.screenshot({ path: '/workspace/tests/05_title_late.png' });
  await b.close();
})();
