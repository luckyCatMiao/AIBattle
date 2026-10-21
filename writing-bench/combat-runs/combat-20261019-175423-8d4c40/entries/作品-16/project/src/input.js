// ---- keyboard input ----
'use strict';
const KEYMAP = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  light: ['KeyJ'],
  heavy: ['KeyK'],
  dash: ['KeyL'],
  special: ['KeyI'],
  restart: ['KeyR'],
  confirm: ['Enter'],
  mute: ['KeyM'],
};
const GAME_CODES = new Set();
for (const k in KEYMAP) KEYMAP[k].forEach(c => GAME_CODES.add(c));
GAME_CODES.add('ArrowUp'); GAME_CODES.add('ArrowDown'); // keep page still

const Input = {
  down: Object.create(null),     // code -> bool
  pressed: Object.create(null),  // code -> bool (consumed per frame)
  init(canvas) {
    window.addEventListener('keydown', e => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.down[e.code] = true;
        this.pressed[e.code] = true;
        AUDIO.ensure(); // first gesture unlocks audio
      }
    });
    window.addEventListener('keyup', e => { this.down[e.code] = false; });
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearAll(); });
    canvas.addEventListener('pointerdown', () => { AUDIO.ensure(); });
  },
  clearAll() {
    for (const k in this.down) this.down[k] = false;
    for (const k in this.pressed) this.pressed[k] = false;
  },
  isDown(action) {
    const codes = KEYMAP[action];
    for (let i = 0; i < codes.length; i++) if (this.down[codes[i]]) return true;
    return false;
  },
  wasPressed(action) {
    const codes = KEYMAP[action];
    for (let i = 0; i < codes.length; i++) if (this.pressed[codes[i]]) return true;
    return false;
  },
  endFrame() {
    for (const k in this.pressed) this.pressed[k] = false;
  },
};
