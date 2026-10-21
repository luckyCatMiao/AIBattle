// ============================================================================
// input.js — 键盘输入。阻止游戏按键滚动页面；失焦时清空按键避免卡键。
// ============================================================================

class Input {
  constructor() {
    this.keys = {};       // 当前按住
    this.buffer = {};     // 本帧“按下”脉冲（消费式）
    this._onDown = (e) => this._down(e);
    this._onUp = (e) => this._up(e);
    this._onBlur = () => this.clear();
    this.attached = false;
  }

  attach(target) {
    if (this.attached) return;
    this.attached = true;
    this.target = target || window;
    this.target.addEventListener('keydown', this._onDown);
    this.target.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener('keydown', this._onDown);
    this.target.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
    this.clear();
  }

  _down(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
      if (e.repeat) return;
      if (!this.keys[e.code]) this.buffer[e.code] = true;
      this.keys[e.code] = true;
    }
  }

  _up(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
      this.keys[e.code] = false;
    }
  }

  clear() {
    this.keys = {};
    this.buffer = {};
  }

  isDown(code) { return !!this.keys[code]; }

  // 消费式按下检测
  pressed(code) {
    if (this.buffer[code]) {
      this.buffer[code] = false;
      return true;
    }
    return false;
  }

  // 清掉所有尚未消费的按下脉冲（切场景时用）
  flush() { this.buffer = {}; }

  moveAxis() {
    let a = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) a -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) a += 1;
    return a;
  }
}

const GAME_KEYS = new Set([
  'KeyA', 'KeyD', 'KeyS', 'KeyW',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'KeyR', 'Enter',
  'KeyU', 'KeyO', 'KeyP', 'KeyQ',
]);
