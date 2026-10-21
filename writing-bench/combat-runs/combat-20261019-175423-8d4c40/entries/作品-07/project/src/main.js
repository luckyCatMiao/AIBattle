// ============================================================================
// main.js — 启动、DOM 覆盖层（开始 / 结束）、静音按钮、音频解锁
// ============================================================================

function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  const menuPanel = document.getElementById('menuPanel');
  const overPanel = document.getElementById('overPanel');
  const overlay = document.getElementById('overlay');
  const muteBtn = document.getElementById('muteBtn');
  const startBtn = document.getElementById('startBtn');
  const againBtn = document.getElementById('againBtn');

  // 音频解锁：首次点击 / 按键
  const unlock = () => { game.audio.ensure(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock);

  // 静音
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    game.audio.ensure();
    game.audio.setMuted(!game.audio.muted);
    muteBtn.textContent = game.audio.muted ? '🔇' : '🔊';
  });

  // 鼠标开始（只用于开始 / 静音按钮）
  startBtn.addEventListener('click', () => { game.audio.ensure(); game.audio.ui(); game.startRun(); });
  againBtn.addEventListener('click', () => { game.audio.ensure(); game.audio.ui(); game.startRun(); });

  // 状态 → 覆盖层
  game.onStateChange = (state) => {
    if (state === 'playing') {
      overlay.classList.add('hidden');
    } else if (state === 'gameover') {
      overlay.classList.remove('hidden');
      menuPanel.classList.add('hidden');
      overPanel.classList.remove('hidden');
      const sh = document.getElementById('statHits');
      const sl = document.getElementById('statLimbs');
      if (sh) sh.textContent = game.hitCount;
      if (sl) sl.textContent = game.limbBreakCount;
    } else {
      overlay.classList.remove('hidden');
      menuPanel.classList.remove('hidden');
      overPanel.classList.add('hidden');
    }
  };

  // 只读状态
  window.combatBenchState = () => game.getState();

  // 测试钩子（生产环境不设置 window.__TEST__，不会暴露）
  if (window.__TEST__) window.__game = game;

  game.start();
  game.onStateChange('menu');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
