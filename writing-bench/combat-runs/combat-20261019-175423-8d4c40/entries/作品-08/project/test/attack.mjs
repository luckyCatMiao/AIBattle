import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.stack));
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const dbg = () => page.evaluate(() => window.__combatDebug());
const st = () => page.evaluate(() => window.combatBenchState());
const held = new Set();
async function setHeld(code, on) { if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); } if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); } }
async function rel() { for (const k of [...held]) await setHeld(k, false); }
async function waitClose(range = 100, maxMs = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const d = await dbg();
    if (!d.player || d.player.dead) return null;
    const alive = d.enemies.filter(e => e.alive && e.spawnT <= 0);
    if (!alive.length) { await page.waitForTimeout(80); continue; }
    let near = alive[0];
    for (const e of alive) if (Math.abs(e.x - d.player.x) < Math.abs(near.x - d.player.x)) near = e;
    const dx = near.x - d.player.x;
    if (Math.abs(dx) > range) {
      await setHeld(dx > 0 ? "KeyD" : "KeyA", true);
      await setHeld(dx > 0 ? "KeyA" : "KeyD", false);
      await page.waitForTimeout(45);
    } else {
      await rel();
      await page.waitForTimeout(60);
      const d2 = await dbg();
      let n2 = d2.enemies.filter(e => e.alive && e.spawnT <= 0).sort((a,b)=>Math.abs(a.x-d2.player.x)-Math.abs(b.x-d2.player.x))[0];
      return n2 || null;
    }
  }
  await rel();
  return null;
}
async function startSampler() {
  await page.evaluate(() => {
    window.__ss = [];
    if (window.__si) clearInterval(window.__si);
    window.__si = setInterval(() => {
      const d = window.__combatDebug();
      const s = window.combatBenchState();
      window.__ss.push({ t: performance.now(), hs: d.hitStop, ts: d.timeScale, h: s.hitCount, b: s.limbBreakCount, ps: d.player.state, php: d.player.hp });
    }, 6);
  });
}
async function stopSampler() {
  return page.evaluate(() => { clearInterval(window.__si); return window.__ss; });
}
async function tryLight() {
  for (let i = 0; i < 14; i++) {
    const d = await dbg();
    if (d.player.dead) return null;
    const alive = d.enemies.filter(e => e.alive && e.spawnT <= 0);
    if (!alive.length) { await page.waitForTimeout(120); continue; }
    const near = alive.sort((a,b)=>Math.abs(a.x-d.player.x)-Math.abs(b.x-d.player.x))[0];
    const dist = Math.abs(near.x - d.player.x);
    if (d.player.state !== "idle" || dist > 100 || near.state === "windup" || near.state === "attack" || near.state === "leap") {
      await waitClose(85, 1200);
      continue;
    }
    // face enemy with a short tap
    const code = near.x > d.player.x ? "KeyD" : "KeyA";
    await page.keyboard.down(code);
    await page.waitForTimeout(35);
    await page.keyboard.up(code);
    const p0 = await page.evaluate(() => window.combatBenchState());
    await startSampler();
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(500);
    const samples = await stopSampler();
    const maxHs = Math.max(...samples.map(s => s.hs));
    const dh = samples[samples.length-1].h - p0.hitCount;
    const db = samples[samples.length-1].b - p0.limbBreakCount;
    console.log("LIGHT try", i, "dist", dist.toFixed(0), "near", near.type, near.state, "hitDelta", dh, "breakDelta", db, "maxHitStop", maxHs.toFixed(3), "hpDelta", (samples[samples.length-1].php - 100).toFixed(0));
    if (dh > 0) return { dh, db, maxHs, samples };
    await page.waitForTimeout(150);
  }
  return null;
}
const light = await tryLight();
await page.screenshot({ path: "/workspace/test/shot-light.png" });

// heavy charged attempt
let heavyResult = null;
for (let attempt = 0; attempt < 5 && !heavyResult; attempt++) {
  await waitClose(120, 3000);
  const d = await dbg();
  if (d.player.dead) break;
  if (d.player.state !== "idle") { await page.waitForTimeout(200); continue; }
  await page.keyboard.down("KeyK");
  await page.waitForTimeout(820);
  const ch = await dbg();
  const before = await st();
  await startSampler();
  await page.keyboard.up("KeyK");
  await page.waitForTimeout(700);
  const samples = await stopSampler();
  const dh = samples[samples.length-1].h - before.hitCount;
  const db = samples[samples.length-1].b - before.limbBreakCount;
  const maxHs = Math.max(...samples.map(s => s.hs));
  console.log("HEAVY try", attempt, "charge", ch.player.charge.toFixed(2), "state", ch.player.state, "hitDelta", dh, "breakDelta", db, "maxHitStop", maxHs.toFixed(3), "hs-seq", [...new Set(samples.filter(s=>s.hs>0).map(s=>s.hs.toFixed(3)))].slice(0,8));
  if (dh > 0) { heavyResult = { dh, db, maxHs, samples }; await page.screenshot({ path: "/workspace/test/shot-heavy.png" }); }
  else { await page.waitForTimeout(400); }
}
console.log("RESULT light", light && { dh: light.dh, db: light.db, maxHs: light.maxHs }, "heavy", heavyResult && { dh: heavyResult.dh, db: heavyResult.db, maxHs: heavyResult.maxHs });
console.log("FINAL", await st());
console.log("ERRORS", errors);
await browser.close();
