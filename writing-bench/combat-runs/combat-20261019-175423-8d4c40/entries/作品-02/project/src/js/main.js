'use strict';
// ---------------------------------------------------------------------------
// BOOT — canvas sizing, main loop, HUD buttons, public state API
// ---------------------------------------------------------------------------
(function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.__game = game;

  // -------------------- sizing --------------------
  function resize() {
    const wrap = document.getElementById('stage');
    const w = Math.max(320, wrap.clientWidth);
    const h = Math.max(240, wrap.clientHeight);
    game.canvas.style.width = w + 'px';
    game.canvas.style.height = h + 'px';
    game.resize();
  }
  window.addEventListener('resize', resize);
  resize();
  // After fonts / layout
  requestAnimationFrame(resize);

  // -------------------- mute button --------------------
  const muteBtn = document.getElementById('mute');
  function updateMuteBtn() {
    const muted = Sound.muted;
    muteBtn.textContent = muted ? '🔇 静音' : '🔊 音效';
    muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    muteBtn.classList.toggle('off', muted);
  }
  muteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Sound.resume();
    Sound.toggleMuted();
    updateMuteBtn();
    if (!Sound.muted) Sound.SFX.uiClick();
    muteBtn.blur();
  });

  // -------------------- start on click --------------------
  const stage = document.getElementById('stage');
  const startOverlay = document.getElementById('startOverlay');
  function beginGame() {
    Sound.resume();
    if (game.state === 'title' || game.state === 'over') {
      game.startGame();
    }
    startOverlay.classList.add('hidden');
    canvas.focus && canvas.focus();
    Sound.SFX.uiClick();
  }
  startOverlay.addEventListener('click', beginGame);
  // Game asks the shell to begin (keeps DOM overlay + audio in one place)
  game.onStartRequest = beginGame;
  game.onRestartRequest = beginGame;

  // Clicking the canvas while on title also starts (allowed: only start button / mute need mouse)
  canvas.addEventListener('pointerdown', () => {
    Sound.resume();
    if (game.state === 'title' || game.state === 'over') beginGame();
  });

  // -------------------- keyboard: unlock audio + stop page scroll --------------------
  // Gameplay key routing (start / restart / pause) lives in Game.update so it is
  // driven by the same buffered input as everything else.
  window.addEventListener('keydown', (e) => {
    Sound.resume();
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' ||
        e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'KeyR' || e.code === 'Escape') {
      e.preventDefault();
    }
  }, { passive: false });
  // Block page scroll on the wheel over the stage too (no zooming the doc)
  stage.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  window.addEventListener('contextmenu', (e) => {
    if (e.target && e.target.id === 'game') e.preventDefault();
  });

  // -------------------- main loop --------------------
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.05); // clamp tab-switch spikes

    // lightweight adaptive quality
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 1.4) {
      const fps = fpsFrames / fpsAcc;
      game.lowFps = fps < 44;
      fpsAcc = 0; fpsFrames = 0;
    }

    // update title/over prompt visibility
    if (game.state === 'over' && !startOverlay.classList.contains('hidden')) {
      // keep hidden on game over; click canvas restarts
    }

    game.update(dt);
    game.render();

    // HUD state attr for tests
    document.body.dataset.state = game.state;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // -------------------- public read-only state --------------------
  window.combatBenchState = function () {
    const p = game.player;
    return {
      ready: true,
      playerAlive: !!(p && p.alive),
      enemyCount: game.enemies.filter(e => !e.dead).length,
      hitCount: game.hitCount,
      limbBreakCount: game.limbBreakCount,
      playing: game.state === 'playing',
    };
  };

  // Prevent stuck keys when window loses focus
  window.addEventListener('blur', () => {
    Input.clearAll();
  });

  // Debug-friendly: expose config toggles (not used by scoring)
  window.__combatDebug = {
    game,
    start: beginGame,
    press(action) { Input.buffer(action); },
    sound() { return { ready: Sound.ready, muted: Sound.muted, gain: Sound.getMasterGain() }; },
    attack(name) { const P = { l1: P_L1, l2: P_L2, l3: P_L3, l4: P_L4, heavy: P_HEAVY, charged: P_CHARGE }[name]; game.player.beginAttack(P); },
    setState: (s) => { if (s === 'playing') beginGame(); },
    // test helpers (never used by normal play)
    clearEnemies() { game.enemies.length = 0; game.spawnQueue.length = 0; },
    spawn(type, dx) {
      const e = game.spawnEnemy(type, game.player.x + dx);
      e.state = 'idle'; e.stateT = 0; e.spawnT = 1; e.alpha = 1;
      return e;
    },
    freezeAI(v) { game.aiFrozen = v; },
    setPlayerX(x) { game.player.x = x; game.camera.x = x; },
    step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) { game.update(dt); game.render(); } },
    info() {
      const p = game.player;
      return {
        t: game.time, state: p.state, attack: p.attack ? { name: p.attack.def.name, t: +p.attack.t.toFixed(3) } : null,
        hitstop: +game.hitstop.toFixed(3), combo: game.comboCount, hitCount: game.hitCount, limb: game.limbBreakCount,
        playerHp: p.hp, enemies: game.enemies.map(e => ({ type: e.type, hp: Math.round(e.hp), state: e.state, parts: Object.fromEntries(Object.entries(e.parts).map(([k, v]) => [k, v.broken ? 'X' : Math.round(v.hp)])) })),
        debris: game.debris.length, particles: game.particles.list.length, trauma: +game.camera.trauma.toFixed(2),
      };
    },
  };
})();
