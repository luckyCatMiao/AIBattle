'use strict';
// ---------------------------------------------------------------------------
// HUD overlay: start screen (DOM), mute button, canvas frame styling
// All gameplay rendering lives in the canvas; DOM is only for the title/start
// affordance and the mute control, per the "mouse only for buttons" rule.
// ---------------------------------------------------------------------------
(function hud() {
  const overlay = document.getElementById('startOverlay');
  if (!overlay) return;

  const titleEl = document.createElement('div');
  titleEl.className = 'start-title';
  titleEl.innerHTML = '<span class="seal">断</span><span class="jp">断縁傀儡</span>';
  overlay.appendChild(titleEl);

  const sub = document.createElement('div');
  sub.className = 'start-sub';
  sub.textContent = 'KIRI DOLLS — BLADE TRIAL';
  overlay.appendChild(sub);

  const btn = document.createElement('button');
  btn.className = 'start-btn';
  btn.id = 'startBtn';
  btn.type = 'button';
  btn.innerHTML = '<span class="key">ENTER</span> 开 始 试 炼';
  overlay.appendChild(btn);

  const hint = document.createElement('div');
  hint.className = 'start-hint';
  hint.innerHTML = '按住 K 蓄力 · I 精准弹反 · 斩向关节可断肢';
  overlay.appendChild(hint);

  // clicking anywhere on overlay starts
  overlay.addEventListener('click', () => {
    document.getElementById('stage').dispatchEvent(new CustomEvent('startRequest'));
  });

  // set body class when overlay hidden
  const obs = new MutationObserver(() => {
    document.body.classList.toggle('in-game', overlay.classList.contains('hidden'));
  });
  obs.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  document.body.classList.toggle('in-game', overlay.classList.contains('hidden'));
})();
