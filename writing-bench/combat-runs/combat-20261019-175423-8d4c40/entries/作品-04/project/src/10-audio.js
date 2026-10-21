'use strict';
/* ============================================================
   Audio — everything synthesized with WebAudio, no assets.
   ============================================================ */
const Audio_ = {
  ctx: null, master: null, muted: false, unlocked: false,
  unlock() {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.unlocked = true;
      this.noiseBuf = this._makeNoise(1.5);
    } catch (e) { this.ctx = null; }
  },
  _makeNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.01);
    if (this.onToggle) this.onToggle(this.muted);
    return this.muted;
  },
  _now() { return this.ctx.currentTime; },
  _env(gain, t0, peak, attack, decay, curve = 2) {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  },
  noise(dur = 0.2, o = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1200, t0);
    f.frequency.exponentialRampToValueAtTime(o.f1 || 400, t0 + dur);
    f.Q.value = o.q ?? 0.9;
    const g = this.ctx.createGain();
    this._env(g, t0, o.vol ?? 0.3, o.attack ?? 0.004, dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },
  tone(freq, dur = 0.15, o = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this._now() + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, o.vol ?? 0.25, o.attack ?? 0.003, dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },

  swing(level = 0) {
    this.noise(0.16 + level * 0.05, { f0: 2200 + level * 500, f1: 500, vol: 0.16 + level * 0.04, q: 1.2, rate: 1.3 });
  },
  heavySwing() {
    this.noise(0.3, { f0: 900, f1: 180, vol: 0.3, q: 0.8, type: 'lowpass' });
    this.tone(150, 0.22, { type: 'sawtooth', f1: 60, vol: 0.1 });
  },
  hit(power = 1) {
    const v = clamp(power, 0.5, 2);
    this.noise(0.06 + 0.05 * v, { f0: 1800, f1: 300, vol: 0.32 * v, q: 0.7, type: 'lowpass' });
    this.tone(150 / v, 0.13 * v, { type: 'square', f1: 60, vol: 0.14 * v });
    this.tone(900, 0.05, { type: 'triangle', f1: 300, vol: 0.07 * v });
  },
  clash() {
    this.tone(1800, 0.35, { type: 'triangle', f1: 900, vol: 0.2 });
    this.tone(2400, 0.28, { type: 'sine', f1: 1500, vol: 0.12, delay: 0.01 });
    this.noise(0.25, { f0: 5000, f1: 1200, vol: 0.22, q: 4 });
  },
  parry() {
    this.clash();
    this.tone(420, 0.4, { type: 'sine', f1: 210, vol: 0.2, delay: 0.05 });
  },
  break_() {
    this.noise(0.28, { f0: 700, f1: 90, vol: 0.45, q: 0.6, type: 'lowpass' });
    this.tone(110, 0.35, { type: 'sawtooth', f1: 40, vol: 0.22 });
    this.noise(0.18, { f0: 3200, f1: 700, vol: 0.12, q: 2, delay: 0.02 });
    this.tone(600, 0.2, { type: 'square', f1: 120, vol: 0.08, delay: 0.03 });
  },
  jump() { this.noise(0.12, { f0: 900, f1: 300, vol: 0.1, q: 1 }); },
  land() { this.noise(0.14, { f0: 400, f1: 80, vol: 0.18, type: 'lowpass' }); this.tone(80, 0.1, { type: 'sine', f1: 40, vol: 0.12 }); },
  dash() { this.noise(0.22, { f0: 3000, f1: 600, vol: 0.18, q: 0.8 }); },
  hurt() {
    this.tone(220, 0.18, { type: 'sawtooth', f1: 80, vol: 0.18 });
    this.noise(0.12, { f0: 700, f1: 150, vol: 0.2, type: 'lowpass' });
  },
  enemyWarn() { this.tone(520, 0.12, { type: 'triangle', f1: 700, vol: 0.07 }); },
  spawn() { this.tone(140, 0.4, { type: 'sine', f1: 70, vol: 0.12 }); },
  wave() {
    this.tone(330, 0.5, { type: 'triangle', f1: 440, vol: 0.1 });
    this.tone(660, 0.6, { type: 'sine', f1: 880, vol: 0.06, delay: 0.08 });
  },
  death() { this.tone(180, 1.2, { type: 'sawtooth', f1: 40, vol: 0.2 }); }
};
