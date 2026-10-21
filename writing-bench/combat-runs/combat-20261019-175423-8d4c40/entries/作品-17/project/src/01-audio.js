/* ============================================================
 * 01-audio.js — WebAudio 合成音效（无外部资源）
 * 首次用户手势后启用；提供静音开关。
 * ============================================================ */
'use strict';

class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.enabled = false;
    this._noiseBuf = null;
    this._lastPlay = {}; // 简单限频，防止同帧叠爆
  }

  // 必须在用户手势中调用
  ensure() {
    if (this.enabled) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 22;
      comp.ratio.value = 8;
      comp.attack.value = 0.002;
      comp.release.value = 0.16;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // 预生成噪声 buffer
      const len = this.ctx.sampleRate * 1.2;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.enabled = true;
    } catch (e) { /* 无音频环境也不阻塞游戏 */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.01);
  }

  _gate(name, minInterval) {
    const t = performance.now();
    if (this._lastPlay[name] && t - this._lastPlay[name] < minInterval) return false;
    this._lastPlay[name] = t;
    return true;
  }

  _noise(dur, { hp = 0, lp = 20000, gain = 0.5, t0 = 0, attack = 0.004, sweepTo = null, sweepT = null, Q = 0.8 } = {}) {
    const c = this.ctx, t = c.currentTime + t0;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.playbackRate.value = rand(0.9, 1.1);
    let node = src;
    if (lp < 20000) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(lp, t); f.Q.value = Q;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + (sweepT || dur));
      node.connect(f); node = f;
    }
    if (hp > 0) {
      const f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.setValueAtTime(hp, t);
      if (sweepTo && lp >= 20000) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + (sweepT || dur));
      node.connect(f); node = f;
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    node.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.4, t0 = 0, slideTo = null, attack = 0.003, curve = 'exp' } = {}) {
    const c = this.ctx, t = c.currentTime + t0;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * rand(0.97, 1.03), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    else g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* ---------- 具体音效 ---------- */
  swing(size = 0) { // 挥砍破空
    if (!this.enabled || !this._gate('swing', 40)) return;
    const big = size >= 2;
    this._noise(big ? 0.22 : 0.13, {
      hp: big ? 500 : 900, gain: big ? 0.5 : 0.3,
      sweepTo: big ? 240 : 420, sweepT: big ? 0.2 : 0.12, Q: 1.4,
    });
  }

  hit(size = 1) { // 命中: 0轻 1中 2重 3蓄力
    if (!this.enabled || !this._gate('hit' + size, 30)) return;
    if (size === 0) {
      this._tone(210, 0.07, { type: 'sine', gain: 0.5, slideTo: 70 });
      this._noise(0.06, { lp: 3800, gain: 0.35 });
    } else if (size === 1) {
      this._tone(170, 0.1, { type: 'sine', gain: 0.62, slideTo: 55 });
      this._noise(0.09, { lp: 3000, gain: 0.42 });
      this._tone(1400, 0.03, { type: 'square', gain: 0.1 });
    } else if (size === 2) {
      this._tone(120, 0.16, { type: 'sine', gain: 0.8, slideTo: 38 });
      this._noise(0.14, { lp: 2200, gain: 0.5 });
      this._tone(900, 0.05, { type: 'square', gain: 0.14, slideTo: 300 });
    } else {
      this._tone(95, 0.24, { type: 'sine', gain: 0.95, slideTo: 30 });
      this._noise(0.2, { lp: 1800, gain: 0.6 });
      this._tone(700, 0.09, { type: 'sawtooth', gain: 0.16, slideTo: 120 });
      this._noise(0.05, { hp: 3000, gain: 0.22 });
    }
  }

  clangArmor() { // 打在霸体上的硬声
    if (!this.enabled || !this._gate('clang', 60)) return;
    this._tone(2400, 0.05, { type: 'square', gain: 0.14, slideTo: 1500 });
    this._noise(0.05, { hp: 2500, gain: 0.2 });
  }

  breakLimb() { // 肢体断裂：木质碎裂
    if (!this.enabled || !this._gate('break', 50)) return;
    this._noise(0.1, { lp: 1600, gain: 0.55 });
    for (let i = 0; i < 4; i++) {
      this._tone(rand(500, 1600), 0.03, { type: 'square', gain: 0.12, t0: i * 0.014 + rand(0, 0.01), slideTo: rand(150, 400) });
    }
    this._tone(90, 0.16, { type: 'sine', gain: 0.5, slideTo: 40 });
  }

  coreShatter() { // 傀儡核心爆碎
    if (!this.enabled || !this._gate('core', 60)) return;
    this._tone(70, 0.35, { type: 'sine', gain: 0.9, slideTo: 26 });
    this._noise(0.3, { lp: 2600, gain: 0.55, sweepTo: 300, sweepT: 0.3 });
    for (let i = 0; i < 6; i++) {
      this._tone(rand(800, 2600), 0.04, { type: 'square', gain: 0.1, t0: 0.02 + i * 0.02, slideTo: rand(200, 600) });
    }
  }

  dash() {
    if (!this.enabled || !this._gate('dash', 90)) return;
    this._noise(0.16, { hp: 1400, gain: 0.26, sweepTo: 5200, sweepT: 0.15, Q: 1.2 });
  }

  jump() {
    if (!this.enabled || !this._gate('jump', 90)) return;
    this._tone(260, 0.09, { type: 'sine', gain: 0.16, slideTo: 460 });
  }

  land(hard = false) {
    if (!this.enabled || !this._gate('land', 120)) return;
    this._tone(hard ? 120 : 90, 0.08, { type: 'sine', gain: hard ? 0.3 : 0.14, slideTo: 45 });
    if (hard) this._noise(0.08, { lp: 900, gain: 0.2 });
  }

  hurt() {
    if (!this.enabled || !this._gate('hurt', 150)) return;
    this._tone(140, 0.18, { type: 'sawtooth', gain: 0.4, slideTo: 50 });
    this._noise(0.12, { lp: 1200, gain: 0.35 });
  }

  enemyWindup() { // 敌人前兆提示音（短促）
    if (!this.enabled || !this._gate('windup', 200)) return;
    this._tone(1150, 0.05, { type: 'square', gain: 0.07, slideTo: 1500 });
  }

  chargeTick(level) { // 蓄力阶段提示
    if (!this.enabled) return;
    this._tone(500 + level * 260, 0.06, { type: 'sine', gain: 0.16, slideTo: 640 + level * 300 });
  }

  slam() { // 空中下劈砸地
    if (!this.enabled || !this._gate('slam', 120)) return;
    this._tone(85, 0.28, { type: 'sine', gain: 0.9, slideTo: 28 });
    this._noise(0.22, { lp: 1400, gain: 0.5 });
  }

  waveStart() {
    if (!this.enabled) return;
    this._tone(160, 0.32, { type: 'sine', gain: 0.55, slideTo: 55 });
    this._tone(320, 0.2, { type: 'sine', gain: 0.25, slideTo: 110, t0: 0.05 });
  }

  uiClick() {
    if (!this.enabled) return;
    this._tone(700, 0.05, { type: 'sine', gain: 0.2, slideTo: 900 });
  }

  gameOver() {
    if (!this.enabled) return;
    this._tone(220, 0.5, { type: 'sawtooth', gain: 0.3, slideTo: 55 });
    this._tone(110, 0.7, { type: 'sine', gain: 0.4, slideTo: 40, t0: 0.1 });
  }

  heal() {
    if (!this.enabled) return;
    this._tone(520, 0.12, { type: 'sine', gain: 0.18, slideTo: 780 });
    this._tone(780, 0.14, { type: 'sine', gain: 0.14, slideTo: 1040, t0: 0.08 });
  }
}

const synth = new Synth();
