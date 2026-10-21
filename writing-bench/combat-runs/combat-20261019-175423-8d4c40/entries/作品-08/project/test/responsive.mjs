import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(650);

// click to start (mouse only path)
await page.mouse.click(640, 360);
await page.waitForTimeout(900);
console.log("after click start", await page.evaluate(() => window.combatBenchState()));

const dbg = () => page.evaluate(() => window.__combatDebug());
const held = new Set();
async function setHeld(c, on) { if (on && !held.has(c)) { held.add(c); await page.keyboard.down(c); } if (!on && held.has(c)) { held.delete(c); await page.keyboard.up(c); } }
async function rel() { for (const k of [...held]) await setHeld(k, false); }

// approach and fight for a bit
for (let i = 0; i < 70; i++) {
  const d = await dbg();
  const alive = d.enemies.filter(e => e.alive && e.spawnT <= 0);
  if (!alive.length) { await rel(); await page.waitForTimeout(100); continue; }
  const near = alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
  const dx = near.x - d.player.x;
  if (Math.abs(dx) > 90) {
    await setHeld(dx > 0 ? "KeyD" : "KeyA", true);
    await setHeld(dx > 0 ? "KeyA" : "KeyD", false);
    await page.waitForTimeout(55);
  } else {
    await rel();
    if (d.player.state === "idle") await page.keyboard.press("KeyJ");
    else await page.keyboard.press("KeyJ");
    await page.waitForTimeout(75);
  }
  if (i === 40) { await page.screenshot({ path: "/workspace/test/shot-1280.png" }); }
  if (i === 55) { await page.screenshot({ path: "/workspace/test/shot-1280b.png" }); }
}
await rel();
console.log("state after fight", await page.evaluate(() => window.combatBenchState()));

async function shotAt(w, h, name) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(450);
  const dims = await page.evaluate(() => {
    const c = document.getElementById("game");
    return { cw: c.width, ch: c.height, sw: c.style.width, sh: c.style.height, dpr: window.devicePixelRatio, state: window.combatBenchState() };
  });
  console.log("viewport", w, h, dims);
  await page.screenshot({ path: `/workspace/test/${name}` });
}

await shotAt(960, 540, "shot-960.png");
await shotAt(1920, 800, "shot-1920x800.png");
await shotAt(1024, 768, "shot-1024x768.png");
await shotAt(1280, 720, "shot-1280c.png");

// blur clears input test
const x0 = (await dbg()).player.x;
await page.keyboard.down("KeyD");
await page.waitForTimeout(220);
const x1 = (await dbg()).player.x;
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.waitForTimeout(450);
const x2 = (await dbg()).player.x;
await page.keyboard.up("KeyD");
await page.waitForTimeout(250);
const x3 = (await dbg()).player.x;
console.log("BLUR input clear: move", (x1 - x0).toFixed(1), "after blur drift", (x2 - x1).toFixed(1), "after wait", (x3 - x2).toFixed(1));

console.log("ERRORS", errors);
await browser.close();
