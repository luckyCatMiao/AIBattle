import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", m => { if (m.type()==="error") errors.push(m.text()); });
page.on("pageerror", e => errors.push(e.stack));
await page.addInitScript(() => {
  delete window.AudioContext;
  delete window.webkitAudioContext;
});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(800);
console.log("noaudio title", await page.evaluate(() => window.combatBenchState()));
await page.keyboard.press("Enter");
await page.waitForTimeout(1600);
// combo attacks near enemy using debug-free movement
await page.keyboard.down("KeyD");
await page.waitForTimeout(1400);
await page.keyboard.up("KeyD");
for (let i=0;i<10;i++){ await page.keyboard.press("KeyJ"); await page.waitForTimeout(90); }
await page.waitForTimeout(500);
console.log("noaudio play", await page.evaluate(() => window.combatBenchState()));
await page.screenshot({ path: "/workspace/test/shot-noaudio.png" });
console.log("mute text before", await page.locator("#mute").textContent());
await page.locator("#mute").click();
console.log("mute text after", await page.locator("#mute").textContent());
console.log("ERRORS", errors);
await browser.close();
