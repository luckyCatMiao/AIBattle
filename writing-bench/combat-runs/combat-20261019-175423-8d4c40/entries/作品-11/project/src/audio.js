// ============================================================
// audio.js — Web Audio 全合成音效 + 轻量打击乐
// ============================================================
class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.last = {}; this.musNext = 0; this.musStep = 0; this.drone = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} } return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const c = new AC();
      this.ctx = c;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.5;
      let tail = this.master;
      if (c.createDynamicsCompressor) {
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 6;
        this.master.connect(comp); comp.connect(c.destination);
      } else this.master.connect(c.destination);
      const len = c.sampleRate | 0;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.musNext = Number.isFinite(c.currentTime) ? c.currentTime : 0;
    } catch (e) { this.ctx = null; }
    return !!this.ctx;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  can(name, gap) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] !== undefined && t - this.last[name] < gap) return false;
    this.last[name] = t; return true;
  }
  osc(type, f0, f1, dur, vol, delay = 0) {
    try {
      f0 = +f0; f1 = +f1; dur = +dur; vol = +vol; delay = +delay;
      if (!Number.isFinite(f0) || !Number.isFinite(f1) || !Number.isFinite(dur) ||
          !Number.isFinite(vol) || !Number.isFinite(delay) || vol <= 0 || dur <= 0) return;
      const c = this.ctx, t0 = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(1, f0), t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) { /* 音频失败不影响游戏 */ }
  }
  nz(dur, vol, fType, f0, f1, q = 0.9, delay = 0) {
    try {
      dur = +dur; vol = +vol; f0 = +f0; f1 = f1 === undefined ? 0 : +f1; q = +q; delay = +delay;
      if (!Number.isFinite(dur) || !Number.isFinite(vol) || !Number.isFinite(f0) ||
          !Number.isFinite(f1) || !Number.isFinite(q) || !Number.isFinite(delay) || vol <= 0 || dur <= 0) return;
      const c = this.ctx, t0 = c.currentTime + delay;
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = fType;
      f.frequency.setValueAtTime(Math.max(20, f0), t0);
      if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t0); s.stop(t0 + dur + 0.03);
    } catch (e) { /* 音频失败不影响游戏 */ }
  }
  // ---------- 游戏音效 ----------
  swing(k) { if (this.can('sw', 0.04)) { const p = 0.8 + k * 0.25; this.nz(0.13, 0.14, 'bandpass', 1500 * p, 260, 1.4); } }
  hit(w) {
    if (!this.can('ht', 0.03)) return;
    if (w <= 1) { this.nz(0.06, 0.24, 'bandpass', 950, 320, 1.0); this.osc('triangle', 230, 90, 0.08, 0.22); }
    else if (w === 2) { this.osc('sine', 150, 42, 0.2, 0.42); this.nz(0.1, 0.28, 'lowpass', 900, 160, 0.7); this.osc('triangle', 320, 90, 0.08, 0.16); }
    else { this.osc('sine', 120, 34, 0.28, 0.5); this.osc('square', 74, 30, 0.24, 0.2); this.nz(0.16, 0.34, 'lowpass', 700, 110, 0.7); }
  }
  breakW() {
    if (!this.can('bk', 0.05)) return;
    this.nz(0.09, 0.3, 'highpass', 1800, 900, 0.6);
    this.osc('triangle', 520, 170, 0.07, 0.24);
    this.nz(0.07, 0.22, 'bandpass', 700, 260, 1.2, 0.045);
    this.osc('square', 260, 120, 0.05, 0.1, 0.02);
  }
  kill() {
    if (!this.can('kl', 0.06)) return;
    this.osc('sine', 170, 28, 0.4, 0.5);
    this.nz(0.24, 0.3, 'bandpass', 600, 90, 0.8);
    this.osc('triangle', 420, 90, 0.14, 0.2);
  }
  dash() { if (this.can('da', 0.08)) this.nz(0.15, 0.11, 'bandpass', 500, 3200, 1.2); }
  jump() { if (this.can('jp', 0.1)) this.nz(0.08, 0.07, 'bandpass', 700, 1500, 1.0); }
  land() { if (this.can('ld', 0.1)) { this.osc('sine', 110, 46, 0.12, 0.22); this.nz(0.06, 0.1, 'lowpass', 500, 180, 0.7); } }
  clack(low) {
    if (!this.can('ck', 0.06)) return;
    const f = low ? 480 : 880;
    this.osc('square', f, f * 0.55, 0.045, 0.11);
    this.osc('square', f * 0.7, f * 0.4, 0.04, 0.08, 0.055);
  }
  hurt() { if (this.can('hu', 0.1)) { this.osc('sawtooth', 210, 55, 0.18, 0.26); this.nz(0.1, 0.2, 'lowpass', 800, 200, 0.7); } }
  needle() { if (this.can('nd', 0.05)) this.nz(0.07, 0.09, 'highpass', 2600, 5000, 0.8); }
  tick() { if (this.can('tk', 0.04)) this.osc('triangle', 1400, 900, 0.05, 0.1); }
  chargeFull() { if (this.can('cf', 0.2)) { this.osc('sine', 640, 1050, 0.14, 0.13); this.osc('sine', 960, 1580, 0.14, 0.07, 0.03); } }
  wave() { if (this.can('wv', 0.3)) { this.osc('sine', 95, 38, 0.35, 0.4); this.nz(0.2, 0.16, 'lowpass', 400, 120, 0.7); this.osc('triangle', 320, 300, 0.3, 0.06, 0.12); } }
  heal() { if (this.can('he', 0.2)) { this.osc('sine', 520, 780, 0.16, 0.09); this.osc('sine', 780, 1040, 0.18, 0.07, 0.1); } }
  uiStart() { if (this.can('ui', 0.2)) { this.osc('triangle', 440, 440, 0.18, 0.12); this.osc('triangle', 660, 660, 0.24, 0.1, 0.09); this.osc('sine', 90, 45, 0.3, 0.3, 0.02); } }
  gib() { if (this.can('gb', 0.07)) { this.osc('triangle', 300, 160, 0.05, 0.08); this.nz(0.04, 0.06, 'bandpass', 600, 300, 1); } }
  // ---------- 技能音效 ----------
  strings(final) {
    if (!this.can('st', 0.04)) return;
    if (final) { this.nz(0.16, 0.26, 'bandpass', 1900, 420, 1.1); this.osc('sine', 130, 40, 0.24, 0.4); }
    else this.nz(0.1, 0.13, 'bandpass', 1800, 520, 1.2);
  }
  blink() {
    if (!this.can('bl', 0.04)) return;
    this.nz(0.09, 0.13, 'bandpass', 2400, 700, 1.5);
    this.osc('triangle', 1300, 480, 0.09, 0.11);
  }
  wave() {
    if (!this.can('wv2', 0.1)) return;
    this.nz(0.26, 0.3, 'bandpass', 900, 190, 0.8);
    this.osc('sawtooth', 230, 70, 0.32, 0.17);
    this.osc('sine', 440, 90, 0.2, 0.1);
  }
  ultRiser() {
    if (!this.can('ur', 0.5)) return;
    this.osc('sawtooth', 90, 640, 0.75, 0.14);
    this.osc('sine', 45, 220, 0.75, 0.2);
    this.nz(0.7, 0.08, 'highpass', 400, 3200, 0.7);
  }
  ultBoom() {
    if (!this.can('ub', 0.3)) return;
    this.osc('sine', 150, 26, 0.55, 0.55);
    this.osc('square', 64, 22, 0.42, 0.24);
    this.nz(0.4, 0.4, 'lowpass', 1000, 70, 0.7);
    this.nz(0.1, 0.28, 'highpass', 2200, 900, 0.6);
  }
  deny() {
    if (!this.can('dn', 0.18)) return;
    this.osc('square', 190, 120, 0.09, 0.09);
  }
  // ---------- 音乐（极简打击乐循环） ----------
  updateMusic(playing, intensity) {
    if (!this.ctx) return;
    try { this._updateMusicInner(playing, intensity); } catch (e) { /* 音频失败不影响游戏 */ }
  }
  _updateMusicInner(playing, intensity) {
    const c = this.ctx;
    if (!Number.isFinite(intensity)) intensity = 0;
    if (!playing || this.muted) {
      if (this.drone) { try { this.drone.g.gain.value = 0.0001; } catch (e) {} }
      this.musNext = c.currentTime; return;
    }
    if (!this.drone) {
      try {
        const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = 55;
        o2.type = 'sawtooth'; o2.frequency.value = 82.5; o2.detune.value = 6;
        f.type = 'lowpass'; f.frequency.value = 160; f.Q.value = 0.6;
        g.gain.value = 0.0001;
        o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
        o.start(); o2.start();
        this.drone = { g, on: false };
      } catch (e) { this.drone = null; }
    }
    if (this.drone) {
      const want = 0.02 + intensity * 0.012;
      const next = this.drone.g.gain.value + (want - this.drone.g.gain.value) * 0.05;
      if (Number.isFinite(next)) this.drone.g.gain.value = next;
    }
    const SPB = 0.22; // 每步时长
    if (this.musNext < c.currentTime) this.musNext = c.currentTime + 0.05;
    while (this.musNext < c.currentTime + 0.3) {
      const s = this.musStep % 8, t0 = this.musNext;
      const drum = (f0, f1, dur, vol, dl) => {
        dl = dl || 0;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t0 + dl);
        o.frequency.exponentialRampToValueAtTime(f1, t0 + dl + dur);
        g.gain.setValueAtTime(vol, t0 + dl);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dl + dur);
        o.connect(g); g.connect(this.master);
        o.start(t0 + dl); o.stop(t0 + dl + dur + 0.02);
      };
      if (s === 0 || s === 4) drum(105, 40, 0.24, 0.24);
      if (s === 6 && intensity > 0.45) drum(160, 66, 0.18, 0.16);
      if (s === 2 || s === 5) {
        const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
        const g = c.createGain();
        g.gain.setValueAtTime(0.035, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t0); src.stop(t0 + 0.07);
      }
      this.musNext += SPB; this.musStep++;
    }
  }
}
