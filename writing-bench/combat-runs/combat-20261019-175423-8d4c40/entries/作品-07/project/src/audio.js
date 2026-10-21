// ============================================================================
// audio.js — 纯 Web Audio 合成音效（挥击 / 命中 / 断肢 / 冲刺 / 跳跃等）
// 首次用户手势后 ensure() 才创建 AudioContext；静音由 master gain 控制。
// ============================================================================

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.ambientNodes = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this._makeNoise();
    this._startAmbience();
  }

  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  now() { return this.ctx.currentTime; }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.now(), 0.02);
    }
  }

  // 通用包络
  _env(g, t0, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _noiseSource(loop) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = !!loop;
    return src;
  }

  // ---- 挥击（whoosh） ----
  swing(strength = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const src = this._noiseSource(false);
    src.playbackRate.value = 0.6 + Math.random() * 0.5;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    const f0 = 500 + 420 * strength;
    bp.frequency.setValueAtTime(f0 * 0.7, t);
    bp.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + 0.05);
    bp.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.14);
    const g = this.ctx.createGain();
    this._env(g, t, 0.22 * strength, 0.02, 0.13);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.18);
  }

  // ---- 命中（有力度差别） ----
  hit(strength = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    // 低频闷响
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 + 90 * strength, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.10);
    const og = this.ctx.createGain();
    this._env(og, t, 0.5 * strength, 0.004, 0.12);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.16);
    // 高频碎裂噪声
    const n = this._noiseSource(false);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1600;
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.28 * strength, 0.002, 0.06);
    n.connect(hp); hp.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.09);
  }

  // ---- 断肢：金属崩裂 ----
  breakLimb() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    // 金属碰撞泛音
    const freqs = [880, 1320, 1760, 2210, 2870];
    for (let i = 0; i < freqs.length; i++) {
      const o = this.ctx.createOscillator();
      o.type = i % 2 ? 'square' : 'triangle';
      o.frequency.value = freqs[i] * rand(0.98, 1.02);
      const g = this.ctx.createGain();
      this._env(g, t, 0.16 / (1 + i * 0.4), 0.002, 0.12 + i * 0.02);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.2);
    }
    const n = this._noiseSource(false);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.4, 0.002, 0.18);
    n.connect(hp); hp.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.2);
  }

  // ---- 死亡爆炸 ----
  explode() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    const og = this.ctx.createGain();
    this._env(og, t, 0.7, 0.005, 0.4);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.45);
    const n = this._noiseSource(false);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.55, 0.005, 0.32);
    n.connect(lp); lp.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.36);
  }

  // ---- 冲刺 ----
  dash() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const n = this._noiseSource(false);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
    const g = this.ctx.createGain();
    this._env(g, t, 0.22, 0.02, 0.12);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.16);
  }

  jump() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.09);
    const g = this.ctx.createGain();
    this._env(g, t, 0.1, 0.01, 0.1);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.12);
  }

  land(strength = 0.4) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    const g = this.ctx.createGain();
    this._env(g, t, 0.28 * strength, 0.004, 0.09);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.1);
  }

  hurt() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = this.ctx.createGain();
    this._env(g, t, 0.3, 0.005, 0.17);
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  enemyWindup() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.14);
    const g = this.ctx.createGain();
    this._env(g, t, 0.07, 0.01, 0.14);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.16);
  }

  enemySlash() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const n = this._noiseSource(false);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(1200, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.1);
    const g = this.ctx.createGain();
    this._env(g, t, 0.3, 0.005, 0.1);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.12);
  }

  shoot() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.18);
    const g = this.ctx.createGain();
    this._env(g, t, 0.2, 0.005, 0.2);
    o.connect(bp); bp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }

  ui() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.setValueAtTime(780, t + 0.06);
    const g = this.ctx.createGain();
    this._env(g, t, 0.14, 0.008, 0.1);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.14);
  }

  // ---- 技能：一闪·居合 ----
  iai() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const n = this._noiseSource(false);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.14);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.26);
    const g = this.ctx.createGain();
    this._env(g, t, 0.34, 0.015, 0.26);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.3);
    // 金属清音
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1320, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
    const og = this.ctx.createGain();
    this._env(og, t, 0.12, 0.004, 0.2);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }

  // ---- 技能：影舞·分身斩 ----
  clone() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * 0.05;
      const n = this._noiseSource(false);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(600, t0);
      bp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.06);
      bp.frequency.exponentialRampToValueAtTime(400, t0 + 0.12);
      const g = this.ctx.createGain();
      this._env(g, t0, 0.2, 0.01, 0.12);
      n.connect(bp); bp.connect(g); g.connect(this.master);
      n.start(t0); n.stop(t0 + 0.15);
    }
  }

  // ---- 技能：雷葬·天罚（雷鸣） ----
  lightning() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    // 低频轰鸣
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.5);
    const og = this.ctx.createGain();
    this._env(og, t, 0.55, 0.006, 0.5);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.55);
    // 爆裂噪声
    const n = this._noiseSource(false);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.5, 0.002, 0.22);
    n.connect(lp); lp.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.25);
  }

  // ---- 技能：残响·时滞（冲击波） ----
  nova() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const og = this.ctx.createGain();
    this._env(og, t, 0.5, 0.01, 0.42);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.46);
    // 高频余韵
    const o2 = this.ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(880, t);
    o2.frequency.exponentialRampToValueAtTime(220, t + 0.3);
    const g2 = this.ctx.createGain();
    this._env(g2, t, 0.1, 0.01, 0.3);
    o2.connect(g2); g2.connect(this.master);
    o2.start(t); o2.stop(t + 0.34);
  }

  // ---- 环境底噪（风 + 低频轰鸣），非常轻 ----
  _startAmbience() {
    if (!this.ctx) return;
    const t = this.now();
    const wind = this._noiseSource(true);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const wg = this.ctx.createGain(); wg.gain.value = 0.045;
    // 缓慢起伏
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(wg.gain);
    wind.connect(lp); lp.connect(wg); wg.connect(this.master);
    wind.start(t); lfo.start(t);

    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth'; drone.frequency.value = 55;
    const drone2 = this.ctx.createOscillator();
    drone2.type = 'sawtooth'; drone2.frequency.value = 55.6;
    const dg = this.ctx.createGain(); dg.gain.value = 0.018;
    const dlp = this.ctx.createBiquadFilter();
    dlp.type = 'lowpass'; dlp.frequency.value = 240;
    drone.connect(dlp); drone2.connect(dlp); dlp.connect(dg); dg.connect(this.master);
    drone.start(t); drone2.start(t);
    this.ambientNodes = [wind, lfo, drone, drone2];
  }
}
