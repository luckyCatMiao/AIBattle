import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
import fs from "node:fs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.stack));
const html = fs.readFileSync("/workspace/game.html", "utf8");
await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#111"><iframe id="f" sandbox="allow-scripts" style="width:1280px;height:720px;border:0;display:block"></iframe></body></html>`);
await page.evaluate((html) => { document.getElementById("f").srcdoc = html; }, html);
await page.waitForTimeout(1400);
const frame = page.frames().find(f => f !== page.mainFrame());
console.log("frames", page.frames().length, !!frame);
console.log("in iframe state", await frame.evaluate(() => window.combatBenchState()));
console.log("font loaded", await frame.evaluate(async () => {
  try { await document.fonts.ready; return document.fonts.check('600 16px "CombatSerif"'); } catch (e) { return "err " + e.message; }
}));
await frame.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", cancelable: true })));
await page.waitForTimeout(2200);
console.log("after Enter", await frame.evaluate(() => window.combatBenchState()));
await frame.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", cancelable: true }));
});
await page.waitForTimeout(500);
await frame.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", cancelable: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyJ", cancelable: true }));
});
await page.waitForTimeout(1100);
console.log("after input", await frame.evaluate(() => window.combatBenchState()));
await page.screenshot({ path: "/workspace/test/shot-sandbox.png" });
console.log("ERRORS", errors);
await browser.close();
