'use strict';
// ---------------------------------------------------------------------------
// Input: keyboard state + buffered actions
// ---------------------------------------------------------------------------
const Input = (() => {
  const held = new Set();
  const pressed = [];          // queue of action names, consumed by game
  const pressedThisFrame = {};
  let anyInput = false;
  let muted = false;

  const KEYMAP = {
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    Space: 'jump',
    KeyJ: 'light',
    KeyK: 'heavy',
    KeyL: 'dash',
    KeyI: 'manual',
    KeyR: 'skill3',        // 裂空斩 (hold to charge)
    KeyF: 'skill1',        // 千刃风暴
    KeyQ: 'skill2',        // 断界一闪
    KeyU: 'skill4',        // 终式·万刃归一
    KeyT: 'restart',       // restart moved to T (R is now a skill)
    Backspace: 'restart',
    Enter: 'confirm',
    Escape: 'pause',
    NumpadEnter: 'confirm',
  };
  const GAME_CODES = new Set([
    'KeyA','KeyD','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
    'Space','KeyJ','KeyK','KeyL','KeyI','KeyF','KeyQ','KeyR','KeyU','KeyT','Backspace','Enter','NumpadEnter',
  ]);

  const down = new Set(); // physical codes currently held
  const buffered = [];    // {action, t}
  const BUFFER_TIME = 0.16;
  let enabled = true;

  function actionFor(e) {
    const a = KEYMAP[e.code];
    if (a) return a;
    // fallback for layouts / repeated events
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') return 'left';
    if (k === 'd' || k === 'arrowright') return 'right';
    if (k === 'w' || k === 'arrowup') return 'up';
    if (k === 's' || k === 'arrowdown') return 'down';
    if (k === ' ' || e.code === 'Space') return 'jump';
    if (k === 'j') return 'light';
    if (k === 'k') return 'heavy';
    if (k === 'l') return 'dash';
    if (k === 'i') return 'manual';
    if (k === 'r') return 'skill3';
    if (k === 'f') return 'skill1';
    if (k === 'q') return 'skill2';
    if (k === 'u') return 'skill4';
    if (k === 't' || k === 'backspace') return 'restart';
    if (k === 'enter') return 'confirm';
    return null;
  }

  function onKeyDown(e) {
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Backspace') {
      // prevent page scroll for gameplay keys even before start
      if (GAME_CODES.has(e.code) || e.code === 'Tab') e.preventDefault();
    }
    const a = actionFor(e);
    if (GAME_CODES.has(e.code)) e.preventDefault();
    if (!a) return;
    if (GAME_CODES.has(e.code)) e.preventDefault();
    anyInput = true;
    if (e.repeat) return;
    down.add(e.code);
    // find best code for action-hold tracking using e.code primarily
    buffer(a);
  }

  function onKeyUp(e) {
    down.delete(e.code);
    if (GAME_CODES.has(e.code)) e.preventDefault();
  }

  function buffer(action) {
    buffered.push({ action, t: 0 });
    if (buffered.length > 24) buffered.shift();
  }

  function clearAll() {
    down.clear();
    buffered.length = 0;
  }

  function heldAction(a) {
    // check any physical code mapped to this action
    for (const code of down) {
      if (KEYMAP[code] === a) return true;
    }
    return false;
  }

  function axisX() {
    let x = 0;
    if (heldAction('left')) x -= 1;
    if (heldAction('right')) x += 1;
    return x;
  }

  // Called by game each frame: returns action if a buffered press exists (consumes)
  function consume(action) {
    for (let i = 0; i < buffered.length; i++) {
      if (buffered[i].action === action && buffered[i].t <= BUFFER_TIME) {
        buffered.splice(i, 1);
        return true;
      }
    }
    return false;
  }
  function peek(action) {
    for (let i = 0; i < buffered.length; i++) {
      if (buffered[i].action === action && buffered[i].t <= BUFFER_TIME) return buffered[i].t;
    }
    return -1;
  }
  function consumeAny(actions) {
    for (const a of actions) if (consume(a)) return a;
    return null;
  }
  function clearBuffer(action) {
    for (let i = buffered.length - 1; i >= 0; i--) if (!action || buffered[i].action === action) buffered.splice(i, 1);
  }

  function update(dt) {
    for (const b of buffered) b.t += dt;
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', () => clearAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });

  return {
    axisX, consume, consumeAny, peek, clearAll, clearBuffer, update, heldAction,
    buffer, get anyInput() { return anyInput; },
    get enabled() { return enabled; }, set enabled(v) { enabled = v; },
  };
})();
