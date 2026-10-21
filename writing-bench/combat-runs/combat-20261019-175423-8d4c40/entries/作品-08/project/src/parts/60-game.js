/* ============================================================
   Game flow, waves, camera, main fixed-step update
   ============================================================ */
let accumulator = 0;

function startGame() {
  audio.init();
  audio.chargeStop();
  audio.startChime();

  game.mode = "play";
  game.time = 0;
  game.hitStop = 0;
  game.timeScale = 1;
  game.slowmo = 0;
  game.flash = 0;
  game.hurtVignette = 0;
  game.lowHpPulse = 0;
  game.dying = false;
  game.deathTimer = 0;
  game.deathHold = 0;
  game.overTimer = 0;
  game.introFade = 1;

  game.player = createPlayer(WORLD_W / 2);
  game.enemies = [];
  game.projectiles = [];
  game.debris = [];
  game.particles = [];
  game.particlesBack = [];
  game.decals = [];
  game.afterimages = [];
  game.floaters = [];
  game.slashes = [];
  game.skillFx = [];
  game.portals = [];
  game.pendingSpawns = [];
  game.banners = [];
  game.attackerCount = 0;

  game.kills = 0;
  game.hitCount = 0;
  game.limbBreakCount = 0;
  game.combo = 0;
  game.comboTimer = 0;
  game.comboPop = 0;
  game.maxCombo = 0;
  game.rank = "";
  game.rankPop = 0;
  game.wave = 0;
  game.wavePhase = "none";
  game.waveTimer = 0;
  game.clearTimer = 0;
  game.waveRemaining = 0;
  game.hintTimer = 9;
  game.lastPlayerHitAt = -99;
  game.lastLimbLabelAt = -99;
  game.lastPoiseLabelAt = -99;

  game.camera.shakeAmp = 0;
  game.camera.shakeT = 0;
  game.camera.x = clamp(game.player.x - view.viewW / 2, cameraMinX(), cameraMaxX());
  game.camera.targetX = game.camera.x;

  clearInputState();
  accumulator = 0;

  startWave(1);
}

function cameraMinX() {
  return view.viewW >= WORLD_W ? (WORLD_W - view.viewW) / 2 : 0;
}

function cameraMaxX() {
  return view.viewW >= WORLD_W ? (WORLD_W - view.viewW) / 2 : WORLD_W - view.viewW;
}

function aliveEnemies() {
  let n = 0;
  for (const e of game.enemies) if (e.alive) n++;
  return n;
}

function buildWaveList(n) {
  let list;
  if (n === 1) list = ["axe", "axe"];
  else if (n === 2) list = ["axe", "bolt"];
  else if (n === 3) list = ["rend", "axe", "bolt"];
  else if (n === 4) list = ["axe", "axe", "bolt", "rend"];
  else {
    const count = Math.min(6, 3 + Math.floor(n / 3));
    const pool = ["axe", "bolt", "rend"];
    list = [];
    for (let i = 0; i < count; i++) list.push(pick(pool));
    if (!list.includes("bolt")) list[randInt(0, list.length - 1)] = "bolt";
    if (!list.includes("rend")) list[randInt(0, list.length - 1)] = "rend";
  }
  return list;
}

function waveSubtitle(n) {
  if (n === 1) return "裂斧傀 · 重劈可弹";
  if (n === 2) return "弦弩傀 · 弩矢可弹反";
  if (n === 3) return "疾爪傀 · 扑击有隙";
  if (n === 4) return "四面皆傀 · 斩其关节";
  return "月下无尽 · 斩之";
}

function startWave(n) {
  game.wave = n;
  game.wavePhase = "fight";
  game.waveTimer = 0;
  game.clearTimer = 0;
  const list = buildWaveList(n);
  const eliteIndex = n % 4 === 0 ? list.length - 1 : -1;
  game.pendingSpawns = list.map((type, i) => ({
    type,
    delay: 0.35 + i * 0.72,
    side: i % 2 === 0 ? 1 : -1,
    elite: i === eliteIndex,
  }));
  game.waveRemaining = list.length;
  addBanner(`第${cnNum(n)}阵`, waveSubtitle(n), 2.0, n % 4 === 0 ? "#ffd37a" : "#f0dcb4");
  audio.waveStart();
  game.hintTimer = Math.max(game.hintTimer || 0, n === 1 ? 8 : 0);
}

function updateWaves(dt) {
  if (game.mode !== "play") return;
  if (!game.dying) {
    for (const sp of game.pendingSpawns) {
      sp.delay -= dt;
      if (sp.delay <= 0) {
        if (aliveEnemies() < 4) {
          spawnWaveEnemy(sp);
          sp.done = true;
        } else {
          sp.delay = 0.45;
        }
      }
    }
    game.pendingSpawns = game.pendingSpawns.filter((s) => !s.done);
  }

  const alive = aliveEnemies();
  game.waveRemaining = alive + game.pendingSpawns.length;

  if (game.wavePhase === "fight" && !game.dying) {
    if (alive === 0 && game.pendingSpawns.length === 0) {
      game.wavePhase = "clear";
      game.clearTimer = 1.9;
      healPlayer(14, true);
      addBanner("阵破", "月华入息 · 命息回复", 1.8, "#bfe9c9");
      audio.waveClear();
      screenFlash(0.025);
    }
  } else if (game.wavePhase === "clear") {
    game.clearTimer -= dt;
    if (game.clearTimer <= 0) {
      startWave(game.wave + 1);
    }
  }
}

function spawnWaveEnemy(sp) {
  const p = game.player;
  if (!p) return;
  const baseDist = rand(285, 345);
  let x = p.x + sp.side * baseDist;
  x = clamp(x, 90, WORLD_W - 90);
  if (Math.abs(x - p.x) < 190) {
    x = clamp(p.x - sp.side * 230, 90, WORLD_W - 90);
  }
  spawnEnemy(sp.type, x, { elite: sp.elite });
}

function addBanner(text, sub, life = 1.6, color = "#f0dcb4") {
  game.banners.push({ text, sub, life, maxLife: life, color });
  if (game.banners.length > 3) game.banners.shift();
}

function updateBanners(dt) {
  for (let i = game.banners.length - 1; i >= 0; i--) {
    game.banners[i].life -= dt;
    if (game.banners[i].life <= 0) game.banners.splice(i, 1);
  }
}

const RANK_TABLE = [
  [22, "SS", "#ffe08a"],
  [15, "S", "#ffd070"],
  [10, "A", "#ff9a72"],
  [6, "B", "#ffb4c0"],
  [3, "C", "#cfe0d8"],
  [1, "D", "#9fb4b8"],
];
function updateRank() {
  let rank = "";
  for (const [threshold, letter] of RANK_TABLE) {
    if (game.combo >= threshold) {
      rank = letter;
      break;
    }
  }
  if (rank !== game.rank) {
    if (rank) game.rankPop = 1;
    game.rank = rank;
  }
}

function updateComboTimers(dt) {
  if (game.combo > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.combo = 0;
      game.rank = "";
      game.comboTimer = 0;
    }
  }
  game.comboPop = Math.max(0, game.comboPop - dt * 5.5);
  game.rankPop = Math.max(0, game.rankPop - dt * 4);
  updateBanners(dt);
}

function updateCamera(dt, snap = false) {
  const p = game.player;
  if (!p) return;
  let target;
  if (game.mode === "title") {
    target = p.x - view.viewW * 0.90;
  } else {
    target = p.x + p.facing * 46 + clamp(p.vx * 0.18, -90, 90) - view.viewW / 2;
  }
  target = clamp(target, cameraMinX(), cameraMaxX());
  game.camera.targetX = target;
  if (snap) {
    game.camera.x = target;
  } else {
    const lam = p.state === "dash" ? 10 : 6.5;
    game.camera.x = damp(game.camera.x, target, lam, dt);
  }
  game.camera.x = clamp(game.camera.x, cameraMinX(), cameraMaxX());
}

function updateRealTime(dt) {
  game.realTime += dt;
  const cam = game.camera;
  cam.shakeT += dt;
  if (cam.shakeAmp > 0.02) {
    cam.shakeAmp *= Math.exp(-dt * 9.5);
    if (cam.shakeAmp < 0.02) cam.shakeAmp = 0;
  } else {
    cam.shakeAmp = 0;
  }
  const t = cam.shakeT;
  cam.shakeX = (Math.sin(t * 111) * 0.62 + Math.sin(t * 73 + 1.7) * 0.38) * cam.shakeAmp;
  cam.shakeY = (Math.sin(t * 97 + 2.1) * 0.55 + Math.sin(t * 61 + 0.4) * 0.3) * cam.shakeAmp;

  game.flash = Math.max(0, game.flash - dt * 4.8);
  game.introFade = Math.max(0, game.introFade - dt * 4.5);
  game.hurtVignette = Math.max(0, game.hurtVignette - dt * 2.2);
  game.lowHpPulse += dt;
  if (game.slowmo > 0) {
    game.slowmo -= dt;
    game.timeScale = Math.min(game.timeScale, 0.34);
  } else {
    game.timeScale = damp(game.timeScale, 1, 7, dt);
    if (game.timeScale > 0.995) game.timeScale = 1;
  }
  if (game.mode === "over") game.overTimer = (game.overTimer || 0) + dt;
}

function stepGame(dt) {
  game.time += dt;

  if (game.mode === "title") {
    const p = game.player;
    if (p) {
      p.animTime += dt;
      updateScarf(p, dt);
    }
    updateEffects(dt);
    updateCamera(dt);
  } else if (game.mode === "over") {
    const p = game.player;
    if (p) {
      p.animTime += dt;
      p.deadT += dt;
      updateScarf(p, dt);
    }
    updateEffects(dt);
    updateCamera(dt);
  } else {
    // ---------- play ----------
    if (game.player) updatePlayer(game.player, dt);
    updateEnemyList(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateWaves(dt);
    updateComboTimers(dt);
    game.hintTimer = Math.max(0, (game.hintTimer || 0) - dt);
    updateCamera(dt);

    if (game.dying) {
      game.deathTimer += dt;
      if (game.deathTimer >= 1.55) {
        game.mode = "over";
        game.overTimer = 0;
      }
    } else if (game.player && game.player.dead) {
      game.dying = true;
      game.deathTimer = 0;
    }

    if (game.player) {
      if (game.player.hp > 0 && game.player.comboTimer > 0) {
        // combo timer bookkeeping handled above
      }
    }
  }

  // clean up any dead projectiles removed out of bounds already handled
  // consume discrete press flags
  for (const k in input.pressed) input.pressed[k] = false;
}
