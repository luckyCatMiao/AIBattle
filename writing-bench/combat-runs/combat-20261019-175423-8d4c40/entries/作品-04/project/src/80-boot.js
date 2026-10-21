'use strict';
/* ============================================================
   Boot, buttons, public state API
   ============================================================ */
function buildDOM() {
  const canvas = document.getElementById('game');
  const muteBtn = document.getElementById('muteBtn');
  const fsBtn = document.getElementById('fsBtn');

  const syncMute = () => {
    const muted = Audio_.muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.innerHTML = muted ? '🔇 静音' : '🔊 声音';
    muteBtn.blur();
  };
  Audio_.onToggle = syncMute;
  muteBtn.addEventListener('click', () => { Audio_.unlock(); Audio_.toggleMute(); });
  fsBtn && fsBtn.addEventListener('click', () => {
    /* fullscreen is optional and never forced */
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => { });
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => { });
    fsBtn.blur();
  });

  /* clicking the canvas also starts, unlocks audio */
  canvas.addEventListener('mousedown', () => {
    Audio_.unlock();
    if (!Game.started) Game.startGame();
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  return canvas;
}

window.addEventListener('load', () => {
  const canvas = buildDOM();
  Game.init(canvas);

  /* Public read-only state for the harness */
  const makeState = () => {
    const pl = Game.player;
    const enemyCount = Game.enemies.filter(e => !e.dead && e.hp > 0 && e.state !== 'dying').length;
    const s = {
      ready: !!Game.ready,
      playerAlive: !!(pl && pl.alive),
      enemyCount,
      hitCount: Game.hitCount | 0,
      limbBreakCount: Game.limbBreakCount | 0,
      playing: !!Game.playing
    };
    return Object.freeze(s);
  };
  window.combatBenchState = makeState;
});
