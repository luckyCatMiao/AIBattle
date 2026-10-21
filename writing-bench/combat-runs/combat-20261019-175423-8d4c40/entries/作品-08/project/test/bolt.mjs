import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
const dbg = () => page.evaluate(() => window.__combatDebug());
const st = () => page.evaluate(() => window.combatBenchState());
const held = new Set();
async function setHeld(c, on) { if (on && !held.has(c)) { held.add(c); await page.keyboard.down(c); } if (!on && held.has(c)) { held.delete(c); await page.keyboard.up(c); } }
async function rel() { for (const k of [...held]) await setHeld(k, false); }
let boltSeen = false;
let boltFired = false;
let parryAttempts = 0;
let reflectSeen = false;
let lastParryTry = 0;
let lastProjCount = 0;
const types = new Set();
const t0 = Date.now();
let mode = "killWave1";
while (Date.now() - t0 < 45000) {
  const d = await dbg();
  if (d.mode === "over" || !d.player || d.player.dead) { console.log("dead", d.wave); break; }
  const alive = d.enemies.filter(e => e.alive && e.spawnT <= 0);
  const bolt = alive.find(e => e.type === "bolt");
  const others = alive.filter(e => e.type !== "bolt");
  for (const pr of d.projectiles) types.add(pr.type);
  if (d.projectiles.some(p => p.type === "reflect")) reflectSeen = true;
  if (d.projectiles.some(p => p.type === "bolt")) boltFired = true;
  if (d.wave === 1) {
    if (!alive.length) { await rel(); await page.waitForTimeout(80); continue; }
    const near = alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
    const dx = near.x - d.player.x;
    if (Math.abs(dx) > 90) {
      await setHeld(dx > 0 ? "KeyD" : "KeyA", true);
      await setHeld(dx > 0 ? "KeyA" : "KeyD", false);
      if (Math.abs(dx) > 320) await page.keyboard.press("KeyL");
      await page.waitForTimeout(60);
    } else {
      await rel();
      if (d.player.state === "idle" && near.state !== "windup") await page.keyboard.press("KeyJ");
      else await page.keyboard.press("KeyJ");
      if (Math.random() < 0.08) { await page.keyboard.down("KeyK"); await page.waitForTimeout(220); await page.keyboard.up("KeyK"); }
      await page.waitForTimeout(70);
    }
    continue;
  }
  // wave 2+
  if (bolt) boltSeen = true;
  if (others.length > 0 && mode === "killWave1") {
    // clear the axe first
    const near = others.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
    const dx = near.x - d.player.x;
    if (Math.abs(dx) > 90) {
      await setHeld(dx > 0 ? "KeyD" : "KeyA", true);
      await setHeld(dx > 0 ? "KeyA" : "KeyD", false);
      await page.waitForTimeout(55);
    } else {
      await rel();
      await page.keyboard.press("KeyJ");
      await page.waitForTimeout(75);
    }
    continue;
  }
  if (others.length === 0 && bolt) {
    mode = "observeBolt";
    await rel();
    const dx = bolt.x - d.player.x;
    const ad = Math.abs(dx);
    // Stay at 230-300 distance, dodging any incoming bolt with parry
    const incoming = d.projectiles.find(p => p.type === "bolt" && (d.player.x - p.x) * p.vx > 0 && Math.abs(p.x - d.player.x) < 150);
    if (incoming) {
      const now = Date.now();
      if (d.player.state === "idle" && now - lastParryTry > 700) {
        lastParryTry = now;
        parryAttempts++;
        console.log("PARRY BOLT attempt", parryAttempts, "dist", Math.abs(incoming.x - d.player.x).toFixed(0), "player", d.player.state, "hp", d.player.hp);
        await page.evaluate(() => {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyI", cancelable: true }));
          setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyI", cancelable: true })), 25);
        });
        await page.waitForTimeout(120);
        const after = await dbg();
        if (after.projectiles.some(p => p.type === "reflect")) reflectSeen = true;
        console.log("  after parry: timeScale", after.timeScale.toFixed(2), "proj", after.projectiles.map(p=>p.type), "hp", after.player.hp.toFixed(0), "enemyStun", after.enemies.map(e=>e.stun.toFixed(2)));
      } else if (d.player.state !== "idle" && d.player.state !== "parry") {
        // wait for recovery, don't get clipped if possible
      }
      await page.waitForTimeout(25);
      continue;
    }
    if (ad > 310) { await setHeld(dx > 0 ? "KeyD" : "KeyA", true); await page.waitForTimeout(55); }
    else if (ad < 210) { await setHeld(dx > 0 ? "KeyA" : "KeyD", true); await page.waitForTimeout(55); }
    else { await rel(); await page.waitForTimeout(45); }
    if (d.player.hp < 25) break;
    continue;
  }
  await rel();
  await page.waitForTimeout(80);
  if (d.wave >= 2 && !bolt) { /* next wave may have no bolt; keep going */ }
  if (d.wave >= 3) break;
}
console.log("RESULT", { boltSeen, boltFired, parryAttempts, reflectSeen, types: [...types], state: await st(), wave: (await dbg()).wave, hp: (await dbg()).player.hp });
console.log("dbg enemies", JSON.stringify((await dbg()).enemies.filter(e=>e.alive).map(e=>({type:e.type,hp:e.hp,state:e.state,canShoot:e.canShoot,broken:e.broken}))));
await page.screenshot({ path: "/workspace/test/shot-bolt.png" });
console.log("ERRORS", errors);
await browser.close();
