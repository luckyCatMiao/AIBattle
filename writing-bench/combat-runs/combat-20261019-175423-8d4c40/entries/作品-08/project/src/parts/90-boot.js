/* ============================================================
   Boot: sizing, read-only state API, main loop
   ============================================================ */
function resize() {
  const w = Math.max(1, window.innerWidth || 960);
  const h = Math.max(1, window.innerHeight || 540);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxDpr = Math.sqrt(MAX_DPR_PIXELS / Math.max(1, w * h));
  dpr = Math.min(dpr, Math.max(0.75, maxDpr));
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  view.scale = Math.min(h / DESIGN_H, w / DESIGN_W);
  view.viewW = w / view.scale;
  view.viewH = h / view.scale;
  view.camY = DESIGN_H - view.viewH;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.imageSmoothingEnabled = true;
  if (game.player) {
    game.camera.x = clamp(game.camera.x, cameraMinX(), cameraMaxX());
    game.camera.targetX = clamp(game.camera.targetX, cameraMinX(), cameraMaxX());
  }
}

function boot() {
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("load", resize);
  // Layout can settle after the script runs in embedded/iframe contexts.
  setTimeout(resize, 80);
  setTimeout(resize, 500);

  game.player = createPlayer(WORLD_W / 2);
  game.player.facing = -1;
  game.camera.x = clamp(
    game.player.x - view.viewW * 0.90,
    cameraMinX(),
    cameraMaxX()
  );
  game.camera.targetX = game.camera.x;
  game.ready = true;

  if (game.pendingStart) {
    game.pendingStart = false;
    startGame();
  }

  requestAnimationFrame(frame);
}

let lastFrameTime = 0;
let firstFrame = true;

function frame(now) {
  if (firstFrame) {
    lastFrameTime = now;
    firstFrame = false;
  }
  let raw = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (!isFinite(raw) || raw < 0) raw = 0;
  raw = Math.min(raw, 0.05);

  updateRealTime(raw);

  if (game.hitStop > 0.0001) {
    game.hitStop = Math.max(0, game.hitStop - raw);
  } else {
    const sdt = raw * game.timeScale;
    accumulator += sdt;
    let steps = 0;
    while (accumulator >= STEP && steps < 8) {
      stepGame(STEP);
      accumulator -= STEP;
      steps++;
    }
    if (steps >= 8) accumulator = 0;
  }

  render();
  requestAnimationFrame(frame);
}

/* opt-in read-only debug snapshot for automated playtests (?debug=1) */
if (typeof location !== "undefined" && /[?&]debug=1(?:&|$)/.test(location.search)) {
  try {
    Object.defineProperty(window, "__combatDebug", {
      value: function () {
        const p = game.player;
        return {
          mode: game.mode,
          time: game.time,
          wave: game.wave,
          wavePhase: game.wavePhase,
          waveRemaining: game.waveRemaining,
          pending: game.pendingSpawns.length,
          player: p
            ? {
                x: p.x, y: p.y, hp: p.hp, state: p.state, facing: p.facing,
                grounded: p.grounded, iframes: p.iframes, dead: p.dead,
                jumpCount: p.jumpCount, airDashUsed: p.airDashUsed,
                atk: p.atk ? { kind: p.atk.kind, t: p.atk.t, def: p.atk.def.pose } : null,
                charge: p.state === "charge" ? p.chargeLevel : 0,
                parryT: p.state === "parry" ? p.parryT : null,
                skill: p.skill ? { id: p.skill.id, t: p.skill.t, released: !!p.skill.released, blinked: !!p.skill.blinked } : null,
                skillCd: p.skillCd ? { 1: p.skillCd[1], 2: p.skillCd[2], 3: p.skillCd[3], 4: p.skillCd[4] } : null,
              }
            : null,
          enemies: game.enemies.map((e) => ({
            id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, alive: e.alive,
            state: e.state, stun: e.stun, spawnT: e.spawnT,
            windup: e.state === "windup" && e.atk ? e.atk.t / Math.max(0.001, e.atk.windup) : null,
            atkKind: e.atk ? e.atk.kind : null,
            broken: Object.keys(e.parts).filter((k) => e.parts[k].broken),
            arms: e.arms, legs: e.legsCount, canShoot: e.canShoot,
          })),
          projectiles: game.projectiles.map((pr) => ({ type: pr.type, x: pr.x, y: pr.y, vx: pr.vx })),
          skillFxCount: game.skillFx.length,
          hitStop: game.hitStop,
          timeScale: game.timeScale,
        };
      },
      writable: false,
      configurable: false,
    });
  } catch (e) {}
}

/* read-only telemetry API */
function combatBenchState() {
  const p = game.player;
  return {
    ready: game.ready === true,
    playerAlive: game.mode !== "title" && !!(p && !p.dead && p.hp > 0),
    enemyCount: aliveEnemies(),
    hitCount: game.hitCount | 0,
    limbBreakCount: game.limbBreakCount | 0,
    playing: game.mode === "play" && !!(p && !p.dead && p.hp > 0),
  };
}
try {
  Object.defineProperty(window, "combatBenchState", {
    value: combatBenchState,
    writable: false,
    configurable: false,
    enumerable: true,
  });
} catch (err) {
  window.combatBenchState = combatBenchState;
}

/*
 * Boot immediately so window.combatBenchState() is usable as soon as the
 * script has parsed. The embedded font is warm-loaded in parallel; canvas
 * text falls back gracefully for the first frames if decoding is slow.
 */
let bootStarted = false;
function startBoot() {
  if (bootStarted) return;
  bootStarted = true;
  try {
    boot();
  } catch (err) {
    bootStarted = false;
    // A transient first-frame failure (font/canvas warm-up) should not leave
    // the player on a blank screen or permanently un-ready game.
    setTimeout(() => {
      try {
        startBoot();
      } catch (e2) {}
    }, 250);
  }
}
try {
  if (document.fonts && typeof document.fonts.load === "function") {
    try {
      const fontPromise = document.fonts.load('600 16px "CombatSerif"');
      if (fontPromise && typeof fontPromise.catch === "function") {
        fontPromise.catch(() => {});
      }
    } catch (e) {}
  }
} catch (e) {}
setTimeout(() => {
  // Redundant kick: guarantees a live scene even if a font promise stalls.
  startBoot();
}, 1800);
startBoot();
