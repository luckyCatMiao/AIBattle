import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", e => errors.push("pageerror: " + (e.stack || e.message || String(e))));
page.on("crash", () => errors.push("CRASH"));
await page.addInitScript(() => {
  window.__caught = [];
  window.addEventListener("error", (e) => window.__caught.push("error: " + (e.error?.stack || e.message)));
  window.addEventListener("unhandledrejection", (e) => window.__caught.push("rejection: " + (e.reason?.stack || e.reason)));
});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(900);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const keys = ["KeyA","KeyD","KeyJ","KeyK","KeyL","KeyI","Space","ArrowLeft","ArrowRight","Digit1","Digit2","Digit3","Digit4"];
const held = new Set();
const sizes = [[960,540],[1280,720],[1024,768],[1920,800],[800,600]];
const start = Date.now();
let iter=0;
while (Date.now() - start < 75000) {
  iter++;
  if (iter % 90 === 0) {
    const s = sizes[(iter/90|0)%sizes.length];
    await page.setViewportSize({width:s[0],height:s[1]});
  }
  if (iter % 150 === 0) {
    // restart occasionally
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(200);
  }
  if (iter % 75 === 0) {
    await page.locator("#mute").click().catch(()=>{});
  }
  if (iter % 200 === 0) {
    // click canvas during play (should not break)
    await page.mouse.click(400, 300);
  }
  const k = keys[(Math.random()*keys.length)|0];
  if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } else if (Math.random()<0.5) { held.add(k); await page.keyboard.down(k); }
  if (Math.random()<0.3) await page.keyboard.press("KeyJ");
  if (Math.random()<0.15) await page.keyboard.press("KeyK");
  if (Math.random()<0.12) await page.keyboard.press("KeyL");
  if (Math.random()<0.1) await page.keyboard.press("KeyI");
  if (Math.random()<0.1) await page.keyboard.press("Space");
  if (Math.random()<0.03) await page.keyboard.press("Enter");
  if (Math.random()<0.16) await page.keyboard.press("Digit"+(1+((Math.random()*4)|0)));
  await page.waitForTimeout(45);
}
for (const k of [...held]) { try { await page.keyboard.up(k); } catch(e){} }
await page.waitForTimeout(500);
const st = await page.evaluate(() => window.combatBenchState());
const dbg = await page.evaluate(() => window.__combatDebug());
const caught = await page.evaluate(() => window.__caught);
console.log("iterations",iter,"state",st);
console.log("mode",dbg.mode,"wave",dbg.wave,"enemies",dbg.enemies.length,"player",dbg.player&&dbg.player.state,"hp",dbg.player&&dbg.player.hp);
console.log("CAUGHT",caught);
console.log("ERRORS",errors);
await page.screenshot({path:"/workspace/test/stress.png"});
await browser.close();
