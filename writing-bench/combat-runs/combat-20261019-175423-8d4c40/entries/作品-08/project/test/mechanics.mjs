import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForTimeout(120);

const dbg = () => page.evaluate(() => window.__combatDebug());
const state = () => page.evaluate(() => window.combatBenchState());

// --- whiff hitstop test (enemies still materialising far away) ---
await page.evaluate(() => {
  window.__s = [];
  window.__si = setInterval(() => {
    const d = window.__combatDebug();
    window.__s.push({ hs: d.hitStop, h: window.combatBenchState().hitCount });
  }, 8);
});
await page.keyboard.press("KeyJ");
await page.waitForTimeout(500);
let sw = await page.evaluate(() => { clearInterval(window.__si); return window.__s; });
console.log("WHIFF maxHitStop", Math.max(...sw.map(s => s.hs)).toFixed(3), "hitDelta", sw[sw.length-1].h - sw[0].h);

// --- jump / double jump ---
await page.waitForTimeout(150);
const y0 = (await dbg()).player.y;
await page.keyboard.press("Space");
await page.waitForTimeout(160);
const y1 = (await dbg()).player.y;
await page.keyboard.press("Space");
await page.waitForTimeout(230);
const d2 = await dbg();
console.log("JUMP ground", y0.toFixed(0), "after1", y1.toFixed(0), "after2", d2.player.y.toFixed(0), "jumpCount", d2.player.jumpCount, "grounded", d2.player.grounded);

// --- dash i-frames ---
await page.waitForTimeout(700);
await page.keyboard.press("KeyL");
await page.waitForTimeout(45);
const dd = await dbg();
console.log("DASH state", dd.player.state, "iframes", dd.player.iframes.toFixed(3), "airDashUsed", dd.player.airDashUsed);
await page.waitForTimeout(500);

// --- approach nearest enemy ---
const held = new Set();
async function setHeld(code, on) {
  if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); }
  if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); }
}
async function releaseAll() { for (const k of [...held]) await setHeld(k, false); }
async function approach(maxMs = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const d = await dbg();
    if (!d.player || d.player.dead) return false;
    const alive = d.enemies.filter(e => e.alive && e.spawnT <= 0);
    if (!alive.length) { await page.waitForTimeout(100); continue; }
    let near = alive[0];
    for (const e of alive) if (Math.abs(e.x - d.player.x) < Math.abs(near.x - d.player.x)) near = e;
    const dx = near.x - d.player.x;
    if (Math.abs(dx) > 82) {
      await setHeld(dx > 0 ? "KeyD" : "KeyA", true);
      await setHeld(dx > 0 ? "KeyA" : "KeyD", false);
      await page.waitForTimeout(55);
    } else {
      await releaseAll();
      return true;
    }
  }
  await releaseAll();
  return false;
}

let near = await approach(8000);
console.log("APPROACH", near, (await dbg()).player.x.toFixed(0), (await dbg()).enemies.filter(e=>e.alive).map(e=>e.x.toFixed(0)));

// --- light hit + hitstop sample ---
await page.evaluate(() => {
  window.__s2 = [];
  window.__si2 = setInterval(() => {
    const d = window.__combatDebug();
    window.__s2.push({ hs: d.hitStop, h: window.combatBenchState().hitCount });
  }, 8);
});
await page.keyboard.press("KeyJ");
await page.waitForTimeout(700);
sw = await page.evaluate(() => { clearInterval(window.__si2); return window.__s2; });
console.log("LIGHT maxHitStop", Math.max(...sw.map(s => s.hs)).toFixed(3), "hitDelta", sw[sw.length-1].h - sw[0].h, "state", await state());

// --- charged heavy ---
await approach(3000);
await page.keyboard.down("KeyK");
await page.waitForTimeout(900);
const charging = await dbg();
console.log("CHARGE state", charging.player.state, "charge", charging.player.charge.toFixed(2));
await page.evaluate(() => {
  window.__s3 = [];
  window.__si3 = setInterval(() => {
    const d = window.__combatDebug();
    window.__s3.push({ hs: d.hitStop, h: window.combatBenchState().hitCount, b: window.combatBenchState().limbBreakCount });
  }, 8);
});
await page.keyboard.up("KeyK");
await page.waitForTimeout(800);
sw = await page.evaluate(() => { clearInterval(window.__si3); return window.__s3; });
console.log("HEAVY maxHitStop", Math.max(...sw.map(s => s.hs)).toFixed(3), "hitDelta", sw[sw.length-1].h - sw[0].h, "breakDelta", sw[sw.length-1].b - sw[0].b, "player", (await dbg()).player.state);

// sample screenshot mid heavy aftermath
await page.screenshot({ path: "/workspace/test/shot-mechanics.png" });
await releaseAll();
console.log("FINAL", await state());
console.log("ERRORS", errors);
await browser.close();
