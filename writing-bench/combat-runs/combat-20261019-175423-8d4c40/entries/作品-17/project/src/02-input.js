/* ============================================================
 * 02-input.js — 键盘输入：缓冲、防页面滚动、失焦清空
 * ============================================================ */
'use strict';

const KEYMAP = {
  left:   ['KeyA', 'ArrowLeft'],
  right:  ['KeyD', 'ArrowRight'],
  up:     ['KeyW', 'ArrowUp'],
  down:   ['KeyS', 'ArrowDown'],
  jump:   ['Space'],
  atk:    ['KeyJ'],
  heavy:  ['KeyK'],
  dash:   ['KeyL'],
  special:['KeyI'],
  restart:['KeyR'],
  start:  ['Enter', 'NumpadEnter'],
};

// 需要拦截默认行为（防滚动）的键
const GAME_CODES = new Set([
  'KeyA', 'KeyD', 'KeyW', 'KeyS',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'KeyR',
  'Enter', 'NumpadEnter',
]);

class Input {
  constructor() {
    this.downCodes = new Set();      // 当前按住
    this.pressBuf = {};              // action -> 剩余缓冲时间
    this.BUF_TIME = 0.16;
    this.anyKeyThisFrame = false;
  }

  attach(target) {
    target.addEventListener('keydown', (e) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.downCodes.add(e.code);
      for (const act in KEYMAP) {
        if (KEYMAP[act].includes(e.code)) this.pressBuf[act] = this.BUF_TIME;
      }
      this.anyKeyThisFrame = true;
    });
    target.addEventListener('keyup', (e) => {
      this.downCodes.delete(e.code);
    });
    // 失焦/切页时清空，防止按键卡死
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }

  clear() {
    this.downCodes.clear();
    this.pressBuf = {};
  }

  // 每帧结尾调用，衰减缓冲
  update(dt) {
    for (const act in this.pressBuf) {
      this.pressBuf[act] -= dt;
      if (this.pressBuf[act] <= 0) delete this.pressBuf[act];
    }
    this.anyKeyThisFrame = false;
  }

  down(action) {
    return KEYMAP[action].some(c => this.downCodes.has(c));
  }

  pressed(action) { // 是否处于缓冲窗口内
    return this.pressBuf[action] !== undefined;
  }

  consume(action) {
    if (this.pressBuf[action] !== undefined) {
      delete this.pressBuf[action];
      return true;
    }
    return false;
  }

  get axisX() {
    return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
  }
}

const input = new Input();
