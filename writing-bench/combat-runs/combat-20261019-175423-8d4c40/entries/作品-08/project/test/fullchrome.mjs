import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", e => errors.push("pageerror: " + (e.stack || e.message || String(e))));
page.on("crash", () => errors.push("CRASH"));
page.on("requestfailed", r => errors.push("reqfail: " + r.url() + " " + (r.failure()?.errorText || "")));
await page.addInitScript(() => {
  window.__caught = [];
  window.addEventListener("error", (e) => { window.__caught.push("window.error: " + (e.error?.stack || e.message)); });
  window.addEventListener("unhandledrejection", (e) => { window.__caught.push("unhandledrejection: " + (e.reason?.stack || e.reason)); });
});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(1000);
console.log("title", await page.evaluate(() => window.combatBenchState()));
await page.keyboard.press("Enter");
await page.waitForTimeout(2000);
console.log("started", await page.evaluate(() => window.combatBenchState()));
// click mute, unmute
await page.locator("#mute").click();
await page.waitForTimeout(100);
await page.locator("#mute").click();
// random fuzz for 20s
const keys = ["KeyA","KeyD","KeyJ","KeyK","KeyL","KeyI","Space","ArrowLeft","ArrowRight"];
const held = new Set();
for (let i = 0; i < 220; i++) {
  if (Math.random() < 0.2) {
    const k = keys[Math.floor(Math.random()*keys.length)];
    if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } else { held.add(k); await page.keyboard.down(k); }
  }
  if (Math.random() < 0.35) await page.keyboard.press("KeyJ");
  if (Math.random() < 0.12) await page.keyboard.press("KeyK");
  if (Math.random() < 0.12) await page.keyboard.press("KeyL");
  if (Math.random() < 0.08) await page.keyboard.press("KeyI");
  if (Math.random() < 0.08) await page.keyboard.press("Space");
  await page.waitForTimeout(60);
}
for (const k of held) await page.keyboard.up(k);
await page.waitForTimeout(1000);
console.log("after fuzz", await page.evaluate(() => window.combatBenchState()));
console.log("caught", await page.evaluate(() => window.__caught));
await page.screenshot({ path: "/workspace/test/fullchrome.png" });
console.log("ERRORS", errors);
await browser.close();
