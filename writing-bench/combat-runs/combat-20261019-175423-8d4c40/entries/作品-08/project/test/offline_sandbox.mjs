import { chromium, firefox } from "/workspace/.devtools/node_modules/playwright/index.mjs";
import fs from "node:fs";
const html = fs.readFileSync("/workspace/game.html", "utf8");
const results = {};

async function run(name, browserType, launchOpts, sandboxed) {
  const browser = await browserType.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + (e.stack || e.message || String(e))));
  let target = page;
  if (sandboxed) {
    await page.setContent('<!DOCTYPE html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts" style="width:1280px;height:720px;border:0"></iframe></body></html>');
    await page.evaluate((html) => { document.getElementById("f").srcdoc = html; }, html);
    await page.waitForTimeout(1200);
    target = page.frames().find(f => f !== page.mainFrame());
  } else {
    await page.goto("file:///workspace/game.html");
    await page.waitForTimeout(700);
  }
  const before = await target.evaluate(() => window.combatBenchState());
  await target.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", cancelable: true })));
  await target.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Enter", cancelable: true })));
  await page.waitForTimeout(2200);
  // move and attack via synthetic events so it works in sandboxed frame too
  await target.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", cancelable: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", cancelable: true })), 1200);
  });
  await page.waitForTimeout(1250);
  for (let i=0;i<14;i++){
    await target.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyJ", cancelable: true }));
    });
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(600);
  const after = await target.evaluate(() => window.combatBenchState());
  results[name] = { before, after, errors };
  await browser.close();
}

await run("chrome-offline", chromium, { headless: true, executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] }, false);
await run("chrome-offline-sandbox", chromium, { headless: true, executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] }, true);
await run("firefox-offline", firefox, { headless: true }, false);
await run("firefox-offline-sandbox", firefox, { headless: true }, true);
console.log(JSON.stringify(results, null, 1));
