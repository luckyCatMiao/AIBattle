// ---- boot, main loop, resize, bench state ----
'use strict';
(function () {
  const canvas = document.getElementById('game');
  const muteBtn = document.getElementById('mute');
  Input.init(canvas);
  const game = new Game(canvas);
  window.__game = game; // for debugging (not used by bench)

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    game.resize(w, h, dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function syncMute() {
    muteBtn.textContent = AUDIO.muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', AUDIO.muted);
  }
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    AUDIO.ensure();
    AUDIO.toggleMute();
    syncMute();
  });
  syncMute();

  canvas.addEventListener('pointerdown', () => {
    if (game.state === 'title' || game.state === 'over') game.start();
  });

  // read-only bench state
  window.combatBenchState = function () {
    return {
      ready: !!game.ready,
      playerAlive: game.player ? game.player.state !== 'dead' : false,
      enemyCount: game.enemies.filter(e => e.state !== 'dead').length + game.portals.length,
      hitCount: game.hitCount,
      limbBreakCount: game.limbBreaks,
      playing: game.state === 'playing',
    };
  };

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    // global keys
    if (Input.wasPressed('confirm')) {
      if (game.state === 'title' || game.state === 'over') game.start();
    }
    if (Input.wasPressed('restart')) {
      if (game.state !== 'title') game.start();
    }
    if (Input.wasPressed('mute')) { AUDIO.ensure(); AUDIO.toggleMute(); syncMute(); }
    game.update(dt);
    game.render();
    Input.endFrame();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
