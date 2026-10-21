import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(500);
const candidates = JSON.parse(process.argv[2] || '[]');
await page.evaluate((cands) => {
  const c = document.getElementById('game'); const ctx = c.getContext('2d');
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#0b0c16;display:flex;flex-wrap:wrap;gap:0';
  for (const cand of cands) {
    const cv = document.createElement('canvas'); cv.width = 330; cv.height = 360;
    cv.style.cssText = 'background:linear-gradient(#141a2c,#090a12);';
    document.body.appendChild(cv);
    const g = cv.getContext('2d');
    g.scale(2.6, 2.6);
    const p = new Player(64, 133);
    p.state = 'idle';
    p.ribbon = new Ribbon(11, 10, '#e8324f', '#4a0714');
    p.ribbon.init = false;
    const base = basePose();
    Object.assign(base, cand.pose || {}); if (cand.named) Object.assign(base, JSON.parse(JSON.stringify(POSE[cand.named])));
    p.poseOverride = base;
    const sk = p.solve(base);
    // draw minimal skeleton using player draw with override
    p.pose = () => sk;
    g.fillStyle = '#0b0c16'; g.fillRect(0, 0, 330, 360);
    p.draw(g);
    g.fillStyle = '#ff0'; g.fillRect(sk.swordTip.x - 2, sk.swordTip.y - 2, 4, 4);
    g.fillStyle = '#9fe'; g.font = '7px monospace'; g.fillText(cand.name, 4, 8);
  }
}, candidates);
await page.screenshot({ path: '/workspace/test/posegrid.png', fullPage: true });
await browser.close();
