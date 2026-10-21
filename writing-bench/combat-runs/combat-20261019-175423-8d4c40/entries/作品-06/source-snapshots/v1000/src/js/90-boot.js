'use strict';
/* Boot */
(function () {
  function start() {
    try {
      Game.audioEnabled = true;
      Game.init();
      installSkillHooks();
      UI.applyAudio(Game);
      // Death screen buttons
      const r2 = document.getElementById('btnRestart2');
      if (r2) r2.addEventListener('click', () => {
        Sfx.unlock();
        document.getElementById('deathScreen').classList.remove('show');
        Game.restart();
      });
      const br = document.getElementById('btnRestart');
      if (br) br.addEventListener('click', () => { Sfx.unlock(); Game.restart(); });
      // Seed the title scene with a couple of idle enemies for visual interest
      if (typeof TitleScene !== 'undefined') TitleScene.init();
    } catch (err) {
      console.error(err);
      const el = document.getElementById('overlay');
      if (el) el.innerHTML = '<div style="color:#f88;font:14px monospace;padding:40px">启动失败: ' + (err && err.message) + '</div>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
