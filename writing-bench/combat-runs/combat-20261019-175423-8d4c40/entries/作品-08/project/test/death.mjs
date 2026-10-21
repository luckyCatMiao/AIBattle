import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(700);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);

console.log("keys:", await page.evaluate(() => Object.keys(window.combatBenchState())));
console.log("prevent Space:", await page.evaluate(() => {
  const e = new KeyboardEvent("keydown", { code: "Space", cancelable: true, bubbles: true });
  const r = window.dispatchEvent(e);
  return { dispatchResult: r, defaultPrevented: e.defaultPrevented };
}));

// mute toggle
const muteInitial = await page.locator("#mute").textContent();
await page.locator("#mute").click();
const muteOff = await page.locator("#mute").textContent();
await page.locator("#mute").click();
const muteOn = await page.locator("#mute").textContent();
console.log("mute:", muteInitial, "->", muteOff, "->", muteOn);

// stand still and get hit
let shotHalf = false;
let over = false;
const t0 = Date.now();
let lastHp = 100;
while (Date.now() - t0 < 55000) {
  const dbg = await page.evaluate(() => window.__combatDebug());
  const st = await page.evaluate(() => window.combatBenchState());
  const hp = dbg.player ? dbg.player.hp : 0;
  if (hp !== lastHp) {
    console.log("hp", hp.toFixed(1), "wave", dbg.wave, "enemies", dbg.enemies.filter(e => e.alive).length, "states", dbg.enemies.filter(e=>e.alive).map(e=>e.state+":"+(e.atkKind||"")), "t", dbg.time.toFixed(1));
    lastHp = hp;
  }
  if (!shotHalf && hp < 55 && hp > 0) {
    shotHalf = true;
    await page.screenshot({ path: "/workspace/test/shot-hurt.png" });
  }
  if (dbg.mode === "over") { over = true; console.log("OVER at t", dbg.time.toFixed(1), st); break; }
  await page.waitForTimeout(250);
}
if (over) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/workspace/test/shot-death.png" });
  console.log("dead state:", await page.evaluate(() => window.combatBenchState()));
  // restart with R
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(350);
  console.log("after R:", await page.evaluate(() => window.combatBenchState()), await page.evaluate(() => window.__combatDebug().player));
  await page.screenshot({ path: "/workspace/test/shot-restart.png" });
}
console.log("ERRORS", errors);
await browser.close();
