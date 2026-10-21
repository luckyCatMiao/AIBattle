import { webkit } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", e => errors.push("pageerror: " + (e.stack || e.message || String(e))));
await page.addInitScript(() => {
  window.__caught = [];
  window.addEventListener("error", (e) => window.__caught.push("error: " + (e.error?.stack || e.message)));
  window.addEventListener("unhandledrejection", (e) => window.__caught.push("rejection: " + (e.reason?.stack || e.reason)));
});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(1000);
console.log("title", await page.evaluate(() => window.combatBenchState()));
console.log("font", await page.evaluate(() => document.fonts.check('600 16px "CombatSerif"')));
await page.keyboard.press("Enter");
await page.waitForTimeout(2000);
console.log("start", await page.evaluate(() => window.combatBenchState()));
for (let i=0;i<70;i++){
  if (i%4===0) await page.keyboard.press("KeyD");
  await page.keyboard.press("KeyJ");
  if (i%7===0) await page.keyboard.press("KeyK");
  if (i%11===0) await page.keyboard.press("KeyL");
  if (i%13===0) await page.keyboard.press("KeyI");
  if (i%9===0) await page.keyboard.press("Space");
  await page.waitForTimeout(70);
}
await page.waitForTimeout(500);
console.log("combat", await page.evaluate(() => window.combatBenchState()));
await page.screenshot({path:"/workspace/test/webkit.png"});
console.log("caught", await page.evaluate(() => window.__caught));
console.log("ERRORS", errors);
await browser.close();
