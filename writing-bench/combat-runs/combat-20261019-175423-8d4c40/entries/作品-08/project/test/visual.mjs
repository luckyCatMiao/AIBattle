import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("console: " + msg.text());
});
page.on("pageerror", (err) => errors.push("pageerror: " + err.stack));

await page.goto("file:///workspace/game.html");
await page.waitForTimeout(700);
console.log("title state", await page.evaluate(() => window.combatBenchState()));
await page.screenshot({ path: "/workspace/test/shot-title.png" });

await page.keyboard.press("Enter");
await page.waitForTimeout(500);
console.log("start state", await page.evaluate(() => window.combatBenchState()));
await page.screenshot({ path: "/workspace/test/shot-start.png" });

// move toward enemies + attack for a while
await page.keyboard.down("KeyD");
await page.waitForTimeout(400);
await page.keyboard.up("KeyD");
for (let i = 0; i < 20; i++) {
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(110);
}
await page.waitForTimeout(400);
console.log("after J", await page.evaluate(() => window.combatBenchState()));
await page.screenshot({ path: "/workspace/test/shot-combat1.png" });

// heavy attacks & movement
for (let i = 0; i < 8; i++) {
  await page.keyboard.down("KeyK");
  await page.waitForTimeout(430);
  await page.keyboard.up("KeyK");
  await page.waitForTimeout(450);
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(260);
}
await page.waitForTimeout(400);
console.log("after K", await page.evaluate(() => window.combatBenchState()));
await page.screenshot({ path: "/workspace/test/shot-combat2.png" });

// let AI act
await page.waitForTimeout(2500);
console.log("idle state", await page.evaluate(() => window.combatBenchState()));
await page.screenshot({ path: "/workspace/test/shot-idle.png" });

console.log("ERRORS", errors);
await browser.close();
