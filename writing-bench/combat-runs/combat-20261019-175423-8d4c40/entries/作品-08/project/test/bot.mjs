import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push("console: " + msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.stack));

await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(600);
console.log("state title:", await page.evaluate(() => window.combatBenchState()));
console.log("readonly descriptor:", await page.evaluate(() => {
  const d = Object.getOwnPropertyDescriptor(window, "combatBenchState");
  const before = window.combatBenchState;
  try { window.combatBenchState = 123; } catch (e) {}
  const after = window.combatBenchState;
  return { writable: d && d.writable, configurable: d && d.configurable, same: before === after, type: typeof after };
}));

await page.keyboard.press("Enter");
await page.waitForTimeout(200);

const held = new Set();
async function setHeld(code, on) {
  if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); }
  if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); }
}
async function releaseAll() {
  for (const k of [...held]) await setHeld(k, false);
}

let lastHit = 0;
let lastBreak = 0;
let shotCount = 0;
let sawWindup = false;
let sawParry = false;
let sawWave2 = false;
const t0 = Date.now();

while (Date.now() - t0 < 38000) {
  const dbg = await page.evaluate(() => window.__combatDebug());
  const state = await page.evaluate(() => window.combatBenchState());
  if (dbg.mode === "over" || state.playerAlive === false) {
    console.log("PLAYER DEAD at wave", dbg.wave, state);
    break;
  }
  if (dbg.wave >= 2 && !sawWave2) {
    sawWave2 = true;
    console.log("REACHED WAVE 2", state, "t=", dbg.time.toFixed(1));
    await page.screenshot({ path: "/workspace/test/shot-wave2.png" });
  }
  if (state.hitCount > lastHit) {
    lastHit = state.hitCount;
    if (shotCount < 3) {
      await page.screenshot({ path: `/workspace/test/shot-hit${shotCount}.png` });
      shotCount++;
    }
  }
  if (state.limbBreakCount > lastBreak) {
    lastBreak = state.limbBreakCount;
    console.log("LIMB BREAK", lastBreak, "state", state, "player", dbg.player.state);
    if (lastBreak <= 2) await page.screenshot({ path: `/workspace/test/shot-break${lastBreak}.png` });
  }
  const alive = dbg.enemies.filter((e) => e.alive);
  if (!alive.length) { await setHeld("KeyD", false); await setHeld("KeyA", false); await page.waitForTimeout(80); continue; }
  let near = alive[0];
  let nd = Math.abs(near.x - dbg.player.x);
  for (const e of alive) {
    const d = Math.abs(e.x - dbg.player.x);
    if (d < nd) { nd = d; near = e; }
  }
  const dir = near.x > dbg.player.x ? "KeyD" : "KeyA";
  const other = dir === "KeyD" ? "KeyA" : "KeyD";
  const windup = alive.filter((e) => e.windup != null && e.windup > 0.6 && Math.abs(e.x - dbg.player.x) < 170);
  if (windup.length && !sawWindup) {
    sawWindup = true;
    console.log("WINDUP SEEN", windup.map((e) => [e.type, e.atkKind, e.windup?.toFixed(2)]));
    await page.screenshot({ path: "/workspace/test/shot-windup.png" });
  }
  if (windup.length && !sawParry && dbg.player.state !== "attack" && dbg.player.state !== "parry") {
    await setHeld(dir, false); await setHeld(other, false);
    await page.keyboard.press("KeyI");
    await page.waitForTimeout(120);
    sawParry = true;
    const after = await page.evaluate(() => window.__combatDebug());
    console.log("PARRY ATTEMPT slowmo", after.timeScale, "player", after.player.state);
    await page.screenshot({ path: "/workspace/test/shot-parry.png" });
    continue;
  }
  if (nd > 115) {
    await setHeld(dir, true); await setHeld(other, false);
    if (nd > 260 && Math.random() < 0.25) { await page.keyboard.press("KeyL"); await page.waitForTimeout(120); }
    else if (Math.random() < 0.06) await page.keyboard.press("Space");
    await page.waitForTimeout(55);
  } else {
    await setHeld(dir, false); await setHeld(other, false);
    if (dbg.player.atk == null) {
      if (Math.random() < 0.2) { await page.keyboard.down("KeyK"); await page.waitForTimeout(180); await page.keyboard.up("KeyK"); }
      else await page.keyboard.press("KeyJ");
    } else {
      await page.keyboard.press("KeyJ");
    }
    if (Math.random() < 0.1) await page.keyboard.press("Space");
    await page.waitForTimeout(70);
  }
}
await releaseAll();
const finalDbg = await page.evaluate(() => window.__combatDebug());
const finalState = await page.evaluate(() => window.combatBenchState());
console.log("FINAL", finalState);
console.log("FINAL DBG", JSON.stringify({ wave: finalDbg.wave, mode: finalDbg.mode, enemies: finalDbg.enemies, player: finalDbg.player }, null, 1));
await page.screenshot({ path: "/workspace/test/shot-final.png" });
console.log("ERRORS", errors);
await browser.close();
