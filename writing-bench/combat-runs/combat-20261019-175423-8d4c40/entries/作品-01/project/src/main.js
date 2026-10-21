/* =========================================================
   main.js — canvas bootstrap, fixed-step loop, title/death flow
   ========================================================= */
(function boot() {
  const canvasEl = document.getElementById('stage');
  const ctxEl = canvasEl.getContext('2d');
  const muteBtn = document.getElementById('muteBtn');
  const deathPanel = document.getElementById('deathPanel');

  const input = new Input();
  const world = new World();
  world.input = input;

  // expose read-only state hook
  window.combatBenchState = function () {
    try { return world.state(); } catch (e) {
      return { ready: false, playerAlive: false, enemyCount: 0, hitCount: 0, limbBreakCount: 0, playing: false };
    }
  };

  let started = false;
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 120;
  let deathShown = false;
  let startedAt = 0;

  /* ---- responsive canvas, integer-ish scale, letterbox ---- */
  let viewW = 960, viewH = 540, scale = 1;
  function resize() {
    const app = document.getElementById('app');
    const rect = app.getBoundingClientRect();
    const availW = Math.max(320, rect.width);
    const availH = Math.max(240, rect.height);
    // design view is 960x540 but at 16:9 we widen the world view on ultrawide
    const ratio = availW / availH;
    if (ratio >= 16 / 9) {
      viewH = 540;
      viewW = Math.round(540 * ratio);
      viewW = clamp(viewW, 960, 2400);
    } else {
      viewW = 960;
      viewH = clamp(Math.round(960 / ratio), 540, 1080);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.min(availW, availH * (viewW / viewH));
    const cssH = cssW * (viewH / viewW);
    canvasEl.style.width = cssW + 'px';
    canvasEl.style.height = cssH + 'px';
    canvasEl.width = Math.round(cssW * dpr);
    canvasEl.height = Math.round(cssH * dpr);
    scale = (cssW * dpr) / viewW;
    world.cam.resize(viewW, viewH);
  }
  window.addEventListener('resize', resize);
  resize();
  world.cam.resize(viewW, viewH);

  /* ---- first interaction: enable audio ---- */
  function ensureAudio() {
    Sfx.init();
    if (muteBtn) muteBtn.textContent = Sfx.isMuted() ? '♪ 音效 关' : '♪ 音效 开';
  }
  window.addEventListener('pointerdown', ensureAudio, { passive: true });
  window.addEventListener('keydown', ensureAudio, { passive: true });
  window.addEventListener('touchstart', ensureAudio, { passive: true });

  if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ensureAudio();
      const m = Sfx.setMuted(!Sfx.isMuted());
      muteBtn.textContent = m ? '♪ 音效 关' : '♪ 音效 开';
      muteBtn.blur();
    });
    muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /* ---- start / restart ---- */
  function startGame() {
    ensureAudio();
    world.start();
    started = true;
    startedAt = performance.now();
    deathShown = false;
    deathPanel.classList.add('hidden');
    document.getElementById('titlePanel').classList.add('hidden');
    Sfx.select();
  }
  function restartGame() {
    ensureAudio();
    world.restart();
    started = true;
    deathShown = false;
    deathPanel.classList.add('hidden');
    document.getElementById('titlePanel').classList.add('hidden');
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      if (!started) startGame();
      else if (world.player.state === 'dead' || !world.playing) restartGame();
    } else if (e.code === 'KeyR') {
      if (started) restartGame();
    }
  });
  canvasEl.addEventListener('pointerdown', () => {
    ensureAudio();
    if (!started) startGame();
  });

  // pause when tab hidden
  let paused = false;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused) last = performance.now();
  });

  /* ---- render frame ---- */
  function render() {
    const cw = canvasEl.width, ch = canvasEl.height;
    ctxEl.setTransform(1, 0, 0, 1, 0, 0);
    ctxEl.fillStyle = '#07040a';
    ctxEl.fillRect(0, 0, cw, ch);
    ctxEl.setTransform(scale, 0, 0, scale, 0, 0);
    ctxEl.imageSmoothingEnabled = true;

    drawWorld(ctxEl, world);
    if (started) {
      drawHUD(ctxEl, world);
      drawStartHint(ctxEl, world);
      drawSkillScreenFx(ctxEl, world);
    }

    // death DOM panel
    if (started && world.player.state === 'dead' && world.deathT > 0.8 && !deathShown) {
      deathShown = true;
      deathPanel.classList.remove('hidden');
    }
    if (deathShown && world.player.state !== 'dead') {
      deathShown = false;
      deathPanel.classList.add('hidden');
    }
  }

  /* ---- fixed-step loop ---- */
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (paused) return;
    if (dt > 0.1) dt = 0.1; // tab-back / hitch guard
    if (!started) {
      // idle vignette simulation for the title screen
      world.time += dt;
      world.fx.update(dt, false);
      world.cam.update(dt, world);
      // keep a couple of scenic enemies from the title? no — clean arena
      render();
      return;
    }
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 12) {
      // process discrete events that must not be swallowed by hitstop
      handleMetaInput();
      const frozen = world.freeze > 0;
      world.update(STEP);
      // keep buffered attack inputs alive through hit-stop so combos stay responsive
      if (!frozen) input.step();
      acc -= STEP;
      guard++;
    }
    if (guard >= 12) acc = 0;
    render();
  }

  function handleMetaInput() {
    if (world.player.state === 'dead' && world.deathT > 0.5) {
      if (input.consume('restart') || input.consume('confirm')) {
        restartGame();
      }
    }
  }

  // title screen pre-render: show arena with player idle at start position
  world.player.x = 240;
  world.cam.x = 400; world.cam.y = 340;

  requestAnimationFrame(frame);
})();
