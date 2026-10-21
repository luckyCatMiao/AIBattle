// ---- audio: all sounds synthesized with WebAudio, no assets ----
'use strict';
class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.chargeNodes = null;
    this._beepAlt = false;
  }
  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        // gentle limiter so stacked hits don't clip harshly
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 8;
        this.master.connect(comp); comp.connect(this.ctx.destination);
        // shared noise buffer
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; return false; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  _noise(dur, filterType, freq, q, gain, sweepTo) {
    if (!this.ctx || this.muted) return null;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
    return { src, f, g };
  }
  _tone(type, f0, f1, dur, gain, delay) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // ---------- SFX ----------
  swing(power) { // power 0..1
    const p = clamp(power, 0, 1);
    this._noise(0.1 + p * 0.12, 'bandpass', 2200 - p * 900, 1.2, 0.25 + p * 0.3, 500);
  }
  hitLight() {
    this._noise(0.09, 'lowpass', 3200, 0.8, 0.5, 400);
    this._tone('triangle', 200, 60, 0.1, 0.5);
  }
  hitHeavy() {
    this._noise(0.16, 'lowpass', 2400, 0.8, 0.7, 200);
    this._tone('triangle', 130, 40, 0.2, 0.8);
    this._tone('sine', 60, 30, 0.25, 0.7);
  }
  clang() { // armored deflect
    this._tone('square', 640, 500, 0.06, 0.28);
    this._tone('square', 933, 700, 0.05, 0.2);
    this._noise(0.06, 'highpass', 4000, 1, 0.3);
  }
  limbBreak() {
    this._noise(0.22, 'lowpass', 2600, 1, 0.8, 250);
    this._tone('sawtooth', 240, 45, 0.28, 0.55);
    this._tone('square', 320, 120, 0.1, 0.3);
    this._tone('sine', 90, 35, 0.3, 0.6);
    for (let i = 0; i < 3; i++) this._tone('square', rand(900, 2200), 200, 0.05, 0.12, 0.03 + i * 0.035); // metallic bits
  }
  explosion() {
    this._noise(0.7, 'lowpass', 1400, 0.6, 1.0, 60);
    this._tone('sine', 100, 26, 0.6, 0.9);
    this._tone('sawtooth', 180, 40, 0.3, 0.4);
  }
  jump() { this._tone('sine', 280, 620, 0.1, 0.22); }
  dash() { this._noise(0.16, 'highpass', 900, 0.7, 0.35, 3200); }
  land() { this._noise(0.07, 'lowpass', 900, 0.7, 0.25, 200); }
  shot() {
    this._tone('square', 950, 180, 0.09, 0.3);
    this._noise(0.07, 'highpass', 2600, 1, 0.25);
  }
  boltBreak() { this._tone('square', 1300, 300, 0.06, 0.2); this._noise(0.05, 'highpass', 3000, 1, 0.18); }
  telegraph() { this._tone('square', 1150, 1150, 0.035, 0.16); }
  beep() { // self-destruct alternating
    this._beepAlt = !this._beepAlt;
    this._tone('square', this._beepAlt ? 980 : 1450, 0, 0.09, 0.22);
  }
  hurt() {
    this._tone('sawtooth', 170, 60, 0.18, 0.5);
    this._noise(0.12, 'lowpass', 1200, 0.8, 0.4, 200);
  }
  chargeStart() {
    if (!this.ensure() || this.muted) return;
    this.chargeStop();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(160, t + 0.9);
    const trem = this.ctx.createOscillator(); trem.frequency.value = 26;
    const tg = this.ctx.createGain(); tg.gain.value = 0.5;
    const g = this.ctx.createGain(); g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.14, t + 0.15);
    trem.connect(tg); tg.connect(g.gain);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); trem.start(t);
    this.chargeNodes = { o, trem, g };
  }
  chargeStop() {
    if (this.chargeNodes && this.ctx) {
      const { o, trem, g } = this.chargeNodes;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.stop(t + 0.1); trem.stop(t + 0.1);
      this.chargeNodes = null;
    }
  }
  uiConfirm() { this._tone('sine', 520, 780, 0.09, 0.25); this._tone('sine', 780, 1040, 0.1, 0.2, 0.07); }
  uiMove() { this._tone('sine', 700, 900, 0.04, 0.12); }
  stagger() { this._tone('square', 300, 90, 0.2, 0.3); this._noise(0.15, 'bandpass', 700, 2, 0.3, 200); }
  slam() {
    this._noise(0.25, 'lowpass', 1800, 0.7, 0.8, 100);
    this._tone('sine', 80, 28, 0.3, 0.8);
  }
  gameOver() {
    this._tone('sawtooth', 220, 55, 0.9, 0.4);
    this._tone('sine', 110, 40, 1.1, 0.4, 0.1);
  }
}
const AUDIO = new AudioSys();
