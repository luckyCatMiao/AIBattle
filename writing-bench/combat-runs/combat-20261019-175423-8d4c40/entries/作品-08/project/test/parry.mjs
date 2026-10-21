import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(600);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);

let attempts = 0;
let successes = 0;
let shot = false;
const t0 = Date.now();
while (Date.now() - t0 < 30000 && successes < 2) {
  const dbg = await page.evaluate(() => window.__combatDebug());
  if (dbg.mode !== "play" || !dbg.player || dbg.player.dead) break;
  const alive = dbg.enemies.filter((e) => e.alive && (e.state === "windup" || e.state === "attack"));
  let target = null;
  for (const e of alive) {
    const d = Math.abs(e.x - dbg.player.x);
    if (e.state === "windup" && e.windup > 0.7 && e.windup < 0.98 && d < 165) target = e;
  }
  if (target && dbg.player.state !== "parry" && dbg.player.state !== "attack" && dbg.player.state !== "hurt") {
    attempts++;
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyI", cancelable: true }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyI", cancelable: true })), 25);
    });
    await page.waitForTimeout(90);
    const after = await page.evaluate(() => window.__combatDebug());
    const stunned = after.enemies.filter(e => e.stun > 0.4).length;
    const slow = after.timeScale < 0.95;
    const parryState = after.player.state;
    console.log("attempt", attempts, "target", target.type, target.windup.toFixed(2), "-> state", parryState, "timeScale", after.timeScale.toFixed(2), "stunned", stunned, "hp", after.player.hp.toFixed(1));
    if ((slow || stunned > 0) && after.player.hp >= dbg.player.hp) {
      successes++;
      if (!shot) { shot = true; await page.screenshot({ path: "/workspace/test/shot-parry-success.png" }); }
    } else {
      await page.waitForTimeout(180);
    }
  } else {
    await page.waitForTimeout(25);
  }
}
console.log("RESULT attempts", attempts, "successes", successes, "state", await page.evaluate(() => window.combatBenchState()));
console.log("ERRORS", errors);
await browser.close();
