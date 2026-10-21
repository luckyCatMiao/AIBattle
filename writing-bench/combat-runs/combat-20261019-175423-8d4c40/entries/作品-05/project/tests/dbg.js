const { chromium } = require('/tmp/pw/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  for (let i=0;i<6;i++){
    await p.waitForTimeout(500);
    console.log(i, JSON.stringify(await p.evaluate(()=>window.__dbg())));
  }
  console.log('errs', errs);
  await b.close();
})();
