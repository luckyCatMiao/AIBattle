/* ============================================================
   Procedural WebAudio sound engine — no external assets
   ============================================================ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.ready = false;
    this.muted = false;
    this.ambientStarted = false;
    this.chargeNodes = null;
    this.lastHit = 0;
  }

  init() {
    if (this.ready) {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2.0);
      this.ready = true;
      this.startAmbient();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch (err) {
      this.ready = false;
    }
  }

  makeNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  ok() {
    return this.ready && this.ctx && !this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, t, 0.025);
    }
    return this.muted;
  }

  setMuted(v) {
    if (this.muted !== v) this.toggleMute();
  }

  /* --- low level helpers --------------------------------- */
  gainNode(peak, attack = 0.005, decay = 0.1, startTime = null) {
    const ctx = this.ctx;
    const t = startTime == null ? ctx.currentTime : startTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.gain.setValueAtTime(0, t + attack + decay + 0.02);
    return g;
  }

  noiseSrc() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  noiseHit(peak, dur, filterType, freqStart, freqEnd, q = 1, delay = 0) {
    if (!this.ok()) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const src = this.noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(Math.max(30, freqStart), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + dur);
      f.Q.value = q;
      const g = this.gainNode(peak, 0.004, dur, t);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t, Math.random() * 1.2);
      src.stop(t + dur + 0.06);
    } catch (e) {}
  }

  tone(type, f0, f1, dur, peak, delay = 0, attack = 0.004) {
    if (!this.ok()) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = this.gainNode(peak, attack, dur, t);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + attack + 0.05);
    } catch (e) {}
  }

  /* --- impacts ------------------------------------------- */
  swing(heavy = false) {
    if (!this.ok()) return;
    if (heavy) {
      this.noiseHit(0.24, 0.3, "bandpass", 240, 1250, 0.7);
      this.noiseHit(0.12, 0.18, "lowpass", 700, 220, 0.5, 0.01);
      this.tone("sine", 140, 70, 0.18, 0.09);
    } else {
      this.noiseHit(0.16, 0.13, "bandpass", 850, 3100, 1.1);
      this.noiseHit(0.07, 0.08, "highpass", 2100, 4200, 0.7, 0.01);
    }
  }

  hit(power = 1) {
    if (!this.ok()) return;
    const t = this.now();
    if (t - this.lastHit < 0.012) return;
    this.lastHit = t;
    const p = clamp(power, 0.4, 2);
    this.tone("sine", 170 + 30 * p, 52, 0.1 + 0.03 * p, 0.32 * p);
    this.tone("triangle", 430 + 90 * p, 180, 0.055, 0.11 * p);
    this.noiseHit(0.2 * p, 0.06, "highpass", 1000, 2600, 0.7);
    this.noiseHit(0.1 * p, 0.13, "bandpass", 500, 240, 1.6, 0.005);
    this.tone("sine", 1500 + 220 * Math.random(), 1050, 0.12, 0.035 * p);
  }

  heavyHit() {
    if (!this.ok()) return;
    this.hit(1.8);
    this.tone("sine", 92, 34, 0.32, 0.42);
    this.noiseHit(0.3, 0.23, "lowpass", 900, 140, 0.8);
    this.noiseHit(0.18, 0.1, "highpass", 1800, 4800, 0.5);
    this.tone("triangle", 310, 120, 0.2, 0.12);
  }

  breakLimb() {
    if (!this.ok()) return;
    this.noiseHit(0.34, 0.09, "highpass", 1600, 5200, 0.6);
    this.noiseHit(0.3, 0.2, "bandpass", 650, 300, 1.4, 0.01);
    this.tone("triangle", 520, 260, 0.16, 0.16);
    this.tone("square", 190, 70, 0.28, 0.08);
    this.noiseHit(0.2, 0.24, "lowpass", 500, 120, 0.7, 0.045);
    this.tone("sine", 1320, 620, 0.38, 0.05, 0.02);
  }

  parry() {
    if (!this.ok()) return;
    this.tone("sine", 2350, 2200, 0.55, 0.2, 0, 0.003);
    this.tone("sine", 3520, 3300, 0.34, 0.11, 0.005);
    this.tone("triangle", 1180, 1150, 0.46, 0.1);
    this.noiseHit(0.17, 0.2, "highpass", 3200, 7000, 0.8);
    this.tone("sine", 180, 80, 0.2, 0.18);
  }

  dash() {
    if (!this.ok()) return;
    this.noiseHit(0.18, 0.17, "bandpass", 2400, 340, 1.2);
    this.noiseHit(0.07, 0.2, "highpass", 3000, 1100, 0.6);
  }

  jump() {
    if (!this.ok()) return;
    this.tone("sine", 280, 480, 0.09, 0.06);
    this.noiseHit(0.045, 0.08, "bandpass", 700, 1400, 0.8);
  }

  doubleJump() {
    if (!this.ok()) return;
    this.tone("sine", 430, 880, 0.15, 0.07);
    this.tone("triangle", 700, 1300, 0.12, 0.035, 0.02);
    this.noiseHit(0.07, 0.14, "bandpass", 1400, 2600, 1.1);
  }

  land(heavy = false) {
    if (!this.ok()) return;
    this.tone("sine", heavy ? 110 : 150, 44, heavy ? 0.2 : 0.1, heavy ? 0.2 : 0.08);
    this.noiseHit(heavy ? 0.14 : 0.06, heavy ? 0.16 : 0.08, "lowpass", 900, 180, 0.7);
  }

  hurt() {
    if (!this.ok()) return;
    this.tone("sawtooth", 170, 62, 0.28, 0.14);
    this.tone("sine", 90, 45, 0.3, 0.2);
    this.noiseHit(0.18, 0.16, "bandpass", 1100, 300, 1.5);
    this.noiseHit(0.1, 0.06, "highpass", 3000, 5000, 0.6);
  }

  death() {
    if (!this.ok()) return;
    this.tone("sine", 120, 32, 1.4, 0.22, 0, 0.02);
    this.tone("triangle", 72, 38, 1.8, 0.15, 0.05);
    this.noiseHit(0.16, 0.7, "lowpass", 620, 90, 0.6, 0.02);
    this.tone("sine", 880, 420, 1.2, 0.045, 0.25);
  }

  kill() {
    if (!this.ok()) return;
    this.tone("sine", 92, 38, 0.5, 0.3);
    this.noiseHit(0.26, 0.28, "lowpass", 1300, 160, 0.7);
    this.tone("sine", 1480, 920, 0.5, 0.055, 0.02);
    this.noiseHit(0.1, 0.3, "highpass", 2400, 6800, 0.8, 0.02);
  }

  telegraph(type) {
    if (!this.ok()) return;
    const f = type === "bolt" ? 520 : type === "rend" ? 380 : 260;
    this.tone("triangle", f, f * 1.28, 0.17, 0.045, 0, 0.03);
    this.noiseHit(0.035, 0.13, "bandpass", f * 2, f * 3, 1.8);
  }

  shoot() {
    if (!this.ok()) return;
    this.tone("triangle", 740, 190, 0.18, 0.1);
    this.noiseHit(0.13, 0.12, "highpass", 2400, 800, 0.7);
    this.tone("sine", 160, 60, 0.16, 0.12);
  }

  deflect() {
    if (!this.ok()) return;
    this.tone("sine", 1700, 900, 0.18, 0.08);
    this.noiseHit(0.1, 0.14, "highpass", 2800, 6000, 0.7);
  }

  heal() {
    if (!this.ok()) return;
    this.tone("sine", 520, 520, 0.35, 0.055, 0);
    this.tone("sine", 780, 780, 0.5, 0.045, 0.09);
    this.tone("sine", 1040, 1040, 0.6, 0.03, 0.18);
  }

  waveClear() {
    if (!this.ok()) return;
    this.tone("sine", 74, 65, 1.6, 0.16, 0, 0.01);
    this.tone("sine", 110, 98, 1.4, 0.08, 0.01);
    this.noiseHit(0.08, 0.8, "lowpass", 800, 120, 0.6);
    this.tone("sine", 1560, 1540, 1.2, 0.028, 0.2);
  }

  waveStart() {
    if (!this.ok()) return;
    this.tone("sine", 88, 70, 1.2, 0.18, 0, 0.02);
    this.tone("triangle", 146, 120, 0.8, 0.06, 0.02);
    this.noiseHit(0.14, 0.5, "lowpass", 1000, 180, 0.7);
    this.tone("sine", 1960, 1900, 0.9, 0.03, 0.15);
  }

  startChime() {
    if (!this.ok()) return;
    this.tone("sine", 660, 660, 0.5, 0.05);
    this.tone("sine", 990, 990, 0.7, 0.035, 0.1);
    this.tone("sine", 1320, 1320, 0.9, 0.022, 0.2);
    this.noiseHit(0.04, 0.4, "highpass", 3000, 6500, 0.8, 0.05);
  }

  chargeStart() {
    if (!this.ok() || this.chargeNodes) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.18);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(240, t);
      f.frequency.linearRampToValueAtTime(1000, t + 0.9);
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.setValueAtTime(55, t);
      o1.frequency.linearRampToValueAtTime(92, t + 1.1);
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.setValueAtTime(110, t);
      o2.frequency.linearRampToValueAtTime(184, t + 1.1);
      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(this.master);
      o1.start(t);
      o2.start(t);
      this.chargeNodes = { g, o1, o2 };
    } catch (e) {}
  }

  chargeStop() {
    if (!this.chargeNodes || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const { g, o1, o2 } = this.chargeNodes;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.03);
      o1.stop(t + 0.2);
      o2.stop(t + 0.2);
    } catch (e) {}
    this.chargeNodes = null;
  }

  chargeFull() {
    if (!this.ok()) return;
    this.tone("sine", 880, 1320, 0.22, 0.045);
    this.tone("sine", 1320, 1760, 0.18, 0.025, 0.02);
  }

  /* --- skill voices -------------------------------------- */
  skillDeny() {
    if (!this.ok()) return;
    this.tone("triangle", 210, 150, 0.08, 0.035);
    this.tone("square", 120, 90, 0.07, 0.02, 0.02);
  }

  skillStart(id) {
    if (!this.ok()) return;
    if (id === 1) {
      this.noiseHit(0.15, 0.34, "bandpass", 550, 2900, 0.9);
      this.tone("sine", 660, 990, 0.36, 0.045);
      this.tone("sine", 1480, 1640, 0.5, 0.022, 0.03);
      this.tone("sine", 1960, 1900, 0.42, 0.016, 0.08);
    } else if (id === 2) {
      this.noiseHit(0.17, 0.26, "bandpass", 3400, 420, 1.15);
      this.tone("sine", 1600, 420, 0.2, 0.05);
      this.tone("sine", 130, 60, 0.28, 0.15);
      this.tone("sine", 2360, 2100, 0.3, 0.018, 0.02);
    } else if (id === 3) {
      this.tone("sine", 98, 72, 1.35, 0.11, 0, 0.02);
      this.tone("sine", 1568, 1568, 1.0, 0.026, 0.12);
      this.tone("sine", 2093, 2093, 0.8, 0.016, 0.24);
      this.noiseHit(0.05, 0.55, "highpass", 3600, 7200, 0.7);
    } else if (id === 4) {
      this.tone("sawtooth", 58, 146, 0.46, 0.05);
      this.tone("sine", 88, 110, 0.5, 0.09, 0, 0.01);
      this.noiseHit(0.1, 0.5, "lowpass", 560, 120, 0.7);
      this.tone("sine", 1760, 1980, 0.35, 0.018, 0.05);
    }
  }

  blinkStep() {
    if (!this.ok()) return;
    this.noiseHit(0.14, 0.18, "highpass", 3600, 900, 0.7);
    this.tone("triangle", 1420, 520, 0.12, 0.055);
  }

  swordRift() {
    if (!this.ok()) return;
    this.tone("sine", 1800, 780, 0.22, 0.045);
    this.noiseHit(0.1, 0.18, "bandpass", 2800, 800, 1.2);
    this.tone("sine", 140, 55, 0.22, 0.17);
  }

  sakuraBloom() {
    if (!this.ok()) return;
    this.tone("sine", 87, 65, 1.5, 0.1);
    this.tone("sine", 1318, 1318, 1.1, 0.02, 0.05);
    this.tone("sine", 1976, 1976, 0.9, 0.014, 0.16);
    this.noiseHit(0.04, 0.7, "highpass", 3200, 7000, 0.7);
  }

  sakuraTick() {
    if (!this.ok()) return;
    this.tone("sine", 1046 + Math.random() * 300, 1046, 0.16, 0.025);
    this.noiseHit(0.035, 0.13, "highpass", 3000, 6000, 0.7);
  }

  sakuraFinal() {
    if (!this.ok()) return;
    this.tone("sine", 120, 48, 0.75, 0.22);
    this.tone("sine", 1568, 2093, 0.55, 0.03);
    this.noiseHit(0.12, 0.5, "bandpass", 1800, 450, 0.8);
  }

  sunderCharge() {
    if (!this.ok()) return;
    this.tone("sawtooth", 70, 170, 0.35, 0.07);
    this.noiseHit(0.08, 0.35, "lowpass", 420, 900, 0.8);
  }

  sunderRelease() {
    if (!this.ok()) return;
    this.tone("sine", 82, 28, 0.72, 0.34);
    this.tone("triangle", 150, 60, 0.5, 0.14);
    this.noiseHit(0.3, 0.42, "lowpass", 2200, 130, 0.7);
    this.noiseHit(0.16, 0.2, "highpass", 2400, 7800, 0.6);
    this.tone("sine", 2400, 1720, 0.35, 0.03);
  }

  startAmbient() {
    if (!this.ready || this.ambientStarted) return;
    this.ambientStarted = true;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, t);
      bus.gain.exponentialRampToValueAtTime(0.5, t + 3.5);
      bus.connect(this.master);
      // low sustained shadow drone
      const droneF = [55, 82.5, 110.2, 164.8];
      droneF.forEach((freq, i) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? "sine" : "triangle";
        o.frequency.value = freq;
        o.detune.value = (i - 1.5) * 4;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.052 : i === 1 ? 0.028 : i === 2 ? 0.012 : 0.006;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.045 + i * 0.017;
        const lfoG = ctx.createGain();
        lfoG.gain.value = g.gain.value * 0.35;
        lfo.connect(lfoG);
        lfoG.connect(g.gain);
        o.connect(g);
        g.connect(bus);
        o.start(t);
        lfo.start(t);
      });
      // wind bed
      const wind = ctx.createBufferSource();
      wind.buffer = this.noiseBuf;
      wind.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = "lowpass";
      wf.frequency.value = 420;
      wf.Q.value = 0.5;
      const wg = ctx.createGain();
      wg.gain.value = 0.022;
      const wlfo = ctx.createOscillator();
      wlfo.frequency.value = 0.07;
      const wlg = ctx.createGain();
      wlg.gain.value = 0.012;
      wlfo.connect(wlg);
      wlg.connect(wg.gain);
      wind.connect(wf);
      wf.connect(wg);
      wg.connect(bus);
      wind.start(t);
      wlfo.start(t);
    } catch (e) {}
  }
}

const audio = new AudioEngine();
