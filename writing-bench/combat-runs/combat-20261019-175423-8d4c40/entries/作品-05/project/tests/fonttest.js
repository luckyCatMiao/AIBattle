const { chromium } = require('/tmp/pw/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 400 } });
  p.on('console', m=>console.log('C:', m.text()));
  await p.goto('file:///workspace/game.html');
  await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    await document.fonts.ready;
    const out = {};
    out.status = [...document.fonts].map(f=>({fam:f.family, st:f.status}));
    try { out.load = await document.fonts.load('40px RivenSerif', '裂'); } catch(e) { out.loadErr = e.message; }
    out.check = document.fonts.check('40px RivenSerif', '裂');
    const c=document.createElement('canvas'); const x=c.getContext('2d');
    x.font='40px RivenSerif'; out.w1=x.measureText('裂').width;
    x.font='40px monospace'; out.w2=x.measureText('裂').width;
    x.font = '40px RivenSerif'; out.w3 = x.measureText('A').width;
    x.font = '40px monospace'; out.w4 = x.measureText('A').width;
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
