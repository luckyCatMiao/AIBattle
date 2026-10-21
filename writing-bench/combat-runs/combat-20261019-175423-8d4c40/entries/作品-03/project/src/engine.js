(function (AV) {
  "use strict";

  // ---------------------------------------------------------------- utilities
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
  const randInt = (a, b) => Math.floor(b + Math.random() * (a - b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const sign = (v) => (v < 0 ? -1 : 1);
  const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInCubic = (t) => t * t * t;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const angleLerp = (a, b, t) => {
    let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * t;
  };

  AV.util = { TAU, clamp, lerp, rand, randInt, pick, sign, approach, easeOutCubic, easeInCubic, easeInOutCubic, easeOutQuint, easeOutBack, angleLerp };

  // ------------------------------------------------------------------- input
  const GAME_KEYS = new Set([
    "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "Space", "KeyJ", "KeyK", "KeyL", "KeyI",
    "KeyQ", "KeyR", "Enter", "KeyM", "KeyP", "Escape", "ShiftLeft", "ShiftRight",
  ]);

  const Input = {
    down: new Set(),
    pressed: new Set(),
    released: new Set(),
    anyKeyPressed: false,
    pointerPressed: false,
    lastInputTime: 0,
    mouseX: 0,
    mouseY: 0,
    mouseLeft: false,
    mouseRight: false,
    mouseMiddle: false,
    mouseLeftPressed: false,
    mouseRightPressed: false,
    mouseMiddlePressed: false,
    init(canvas) {
      window.addEventListener("keydown", (e) => {
        if (GAME_KEYS.has(e.code)) e.preventDefault();
        if (e.repeat) return;
        this.down.add(e.code);
        this.pressed.add(e.code);
        this.anyKeyPressed = true;
        this.lastInputTime = performance.now();
      }, { passive: false });

      window.addEventListener("keyup", (e) => {
        if (GAME_KEYS.has(e.code)) e.preventDefault();
        this.down.delete(e.code);
        this.released.add(e.code);
      }, { passive: false });

      window.addEventListener("blur", () => this.clear());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.clear();
      });

      canvas.addEventListener("pointermove", (e) => {
        const rect = canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
      });

      canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.pointerPressed = true;
        this.anyKeyPressed = true;
        this.lastInputTime = performance.now();
        if (e.button === 0) { this.mouseLeft = true; this.mouseLeftPressed = true; }
        if (e.button === 1) { this.mouseMiddle = true; this.mouseMiddlePressed = true; }
        if (e.button === 2) { this.mouseRight = true; this.mouseRightPressed = true; }
      });
      canvas.addEventListener("pointerup", (e) => {
        if (e.button === 0) this.mouseLeft = false;
        if (e.button === 1) this.mouseMiddle = false;
        if (e.button === 2) this.mouseRight = false;
      });
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    },
    clear() {
      this.down.clear();
      this.pressed.clear();
      this.released.clear();
      this.mouseLeft = false;
      this.mouseRight = false;
      this.mouseMiddle = false;
      this.mouseLeftPressed = false;
      this.mouseRightPressed = false;
      this.mouseMiddlePressed = false;
    },
    endFrame() {
      this.pressed.clear();
      this.released.clear();
      this.anyKeyPressed = false;
      this.pointerPressed = false;
      this.mouseLeftPressed = false;
      this.mouseRightPressed = false;
      this.mouseMiddlePressed = false;
    },
    isDown(...codes) {
      for (const c of codes) if (this.down.has(c)) return true;
      return false;
    },
    wasPressed(...codes) {
      for (const c of codes) if (this.pressed.has(c)) return true;
      return false;
    },
  };
  AV.Input = Input;

  // ------------------------------------------------------------------- audio
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
      this.noiseBuf = null;
      this.chargeOsc = null;
      this.chargeGain = null;
      this.chargeFilter = null;
      this.droneStarted = false;
      this.lastCrackle = 0;
      this.enabled = false;
    }

    ensure() {
      if (this.enabled) return true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.75;
        this.master.connect(this.ctx.destination);

        const len = Math.floor(this.ctx.sampleRate * 1.2);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this.enabled = true;
        if (this.ctx.state === "suspended") this.ctx.resume();
        return true;
      } catch (err) {
        this.enabled = false;
        return false;
      }
    }

    resume() {
      if (!this.ensure()) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (!this.droneStarted) this.startDrone();
    }

    setMuted(m) {
      this.muted = m;
      if (this.master && this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(m ? 0 : 0.75, t, 0.03);
      }
      if (m) this.stopChargeHum();
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    noiseSource(playbackRate = 1) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = playbackRate;
      return src;
    }

    envGain(t0, attack, decay, peak) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      return g;
    }

    tone(type, f0, f1, dur, peak, delay = 0, pan = 0) {
      if (!this.enabled || this.muted) return;
      try {
        const t = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        osc.connect(g);
        if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.master); }
        else g.connect(this.master);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      } catch (e) { /* audio must never break gameplay */ }
    }

    noise({ dur = 0.15, peak = 0.25, type = "bandpass", f0 = 1200, f1 = 600, q = 1, delay = 0, rate = 1, pan = 0 } = {}) {
      if (!this.enabled || this.muted) return;
      try {
        const t = this.ctx.currentTime + delay;
        const src = this.noiseSource(rate);
        const flt = this.ctx.createBiquadFilter();
        flt.type = type;
        flt.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
        flt.Q.value = q;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(flt);
        flt.connect(g);
        if (this.ctx.createStereoPanner) {
          const p = this.ctx.createStereoPanner();
          p.pan.value = clamp(pan, -1, 1);
          g.connect(p);
          p.connect(this.master);
        } else g.connect(this.master);
        src.start(t, Math.random() * 0.2);
        src.stop(t + dur + 0.03);
      } catch (e) { /* ignore */ }
    }

    swing(power = 1) {
      if (!this.enabled || this.muted) return;
      const p = clamp(power, 0.4, 2);
      this.noise({ dur: 0.1 + 0.05 * p, peak: 0.11 * p, type: "bandpass", f0: 900 + 500 * p, f1: 2600 + 900 * p, q: 0.9 });
      this.noise({ dur: 0.07, peak: 0.06 * p, type: "highpass", f0: 3200, f1: 5200, q: 0.6, delay: 0.015 });
      this.tone("sine", 380 + 120 * p, 220, 0.09, 0.03, 0, 0.1);
    }

    hit(force = 1) {
      if (!this.enabled || this.muted) return;
      const f = clamp(force, 0.5, 3);
      this.tone("sine", 150 * f, 44, 0.16 + 0.06 * f, 0.34, 0, 0.1);
      this.tone("triangle", 220, 90, 0.1, 0.12, 0, -0.1);
      this.noise({ dur: 0.09 + 0.03 * f, peak: 0.16, type: "bandpass", f0: 420, f1: 180, q: 0.7 });
      this.noise({ dur: 0.05, peak: 0.08, type: "highpass", f0: 2600, f1: 3200, q: 0.8, delay: 0.005 });
      const base = 2400 + rand(1400);
      this.tone("triangle", base, base * 0.72, 0.22, 0.035, 0.008, -0.15);
      this.tone("sine", base * 1.5, base * 1.2, 0.14, 0.02, 0.01, 0.2);
    }

    heavy(level = 1) {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 110, 30, 0.32 + 0.08 * level, 0.42, 0, 0);
      this.noise({ dur: 0.22, peak: 0.24, type: "lowpass", f0: 900, f1: 120, q: 1.2 });
      this.noise({ dur: 0.08, peak: 0.13, type: "bandpass", f0: 3400, f1: 1200, q: 1 });
      this.tone("triangle", 1400, 620, 0.28, 0.06, 0.01, -0.25);
      this.tone("triangle", 1970, 900, 0.22, 0.04, 0.015, 0.25);
    }

    parry() {
      if (!this.enabled || this.muted) return;
      const t = this.now();
      this.noise({ dur: 0.05, peak: 0.2, type: "highpass", f0: 3800, f1: 6000, q: 0.7 });
      this.tone("sine", 1568, 1568, 1.1, 0.1, 0, -0.2);
      this.tone("sine", 2093, 2093, 0.95, 0.075, 0.004, 0.2);
      this.tone("sine", 3136, 2900, 0.7, 0.045, 0.01, 0);
      this.tone("triangle", 784, 740, 0.5, 0.05, 0.02);
      this.noise({ dur: 0.32, peak: 0.08, type: "bandpass", f0: 5200, f1: 2200, q: 2.5, delay: 0.03 });
      this.tone("sine", 90, 55, 0.25, 0.18, 0);
    }

    dash() {
      if (!this.enabled || this.muted) return;
      this.noise({ dur: 0.2, peak: 0.16, type: "bandpass", f0: 3200, f1: 300, q: 1.4 });
      this.noise({ dur: 0.08, peak: 0.07, type: "highpass", f0: 5200, f1: 1800, q: 0.8, delay: 0.02 });
      this.tone("sine", 600, 200, 0.12, 0.02);
    }

    iaidoCharge() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 1600, 2400, 0.42, 0.05, 0, -0.2);
      this.tone("sine", 2400, 3600, 0.38, 0.035, 0.02, 0.2);
      this.noise({ dur: 0.5, peak: 0.07, type: "bandpass", f0: 800, f1: 3600, q: 2, delay: 0.02 });
      this.tone("triangle", 130, 190, 0.4, 0.06);
    }

    iaidoStep() {
      if (!this.enabled || this.muted) return;
      this.noise({ dur: 0.09, peak: 0.2, type: "highpass", f0: 4200, f1: 7000, q: 0.8 });
      this.tone("sine", 2600, 900, 0.24, 0.07, 0, 0.1);
      this.tone("sine", 88, 44, 0.3, 0.2);
      this.noise({ dur: 0.26, peak: 0.11, type: "bandpass", f0: 5200, f1: 1800, q: 1.4, delay: 0.03 });
    }

    storm() {
      if (!this.enabled || this.muted) return;
      this.noise({ dur: 0.65, peak: 0.13, type: "bandpass", f0: 1800, f1: 3400, q: 1.6 });
      this.noise({ dur: 0.55, peak: 0.09, type: "bandpass", f0: 2600, f1: 6000, q: 2.4, delay: 0.06 });
      this.tone("sine", 240, 120, 0.5, 0.09);
      this.tone("triangle", 900, 1600, 0.4, 0.035, 0.03);
    }

    shadowSummon() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 520, 140, 0.5, 0.08, 0, -0.25);
      this.tone("sine", 780, 260, 0.44, 0.05, 0.02, 0.25);
      this.tone("triangle", 1560, 980, 0.3, 0.03, 0.04);
      this.noise({ dur: 0.4, peak: 0.08, type: "bandpass", f0: 600, f1: 2600, q: 2.2 });
    }

    shadowStrike() {
      if (!this.enabled || this.muted) return;
      this.noise({ dur: 0.13, peak: 0.16, type: "bandpass", f0: 2400, f1: 900, q: 1.1 });
      this.tone("triangle", 1200, 500, 0.18, 0.05, 0, 0.2);
      this.tone("sine", 120, 60, 0.2, 0.14);
    }

    execution() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 70, 30, 0.75, 0.4);
      this.tone("triangle", 210, 84, 0.6, 0.12, 0.02);
      this.noise({ dur: 0.5, peak: 0.2, type: "lowpass", f0: 700, f1: 90, q: 1.1, delay: 0.03 });
      this.tone("sine", 1800, 300, 0.5, 0.05, 0.06, -0.2);
      this.tone("sine", 2400, 380, 0.44, 0.035, 0.08, 0.2);
    }

    jump() {
      if (!this.enabled || this.muted) return;
      this.noise({ dur: 0.12, peak: 0.08, type: "bandpass", f0: 700, f1: 1600, q: 1.1 });
      this.tone("sine", 300, 470, 0.13, 0.035);
    }

    land() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 95, 40, 0.18, 0.22);
      this.noise({ dur: 0.14, peak: 0.1, type: "lowpass", f0: 1100, f1: 180, q: 0.8 });
    }

    limbBreak() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 82, 36, 0.36, 0.36);
      for (let i = 0; i < 4; i++) {
        this.tone("square", rand(1400, 700), rand(500, 180), 0.07, 0.028, i * 0.026 + rand(0.02), rand(0.5, -0.5));
      }
      this.noise({ dur: 0.3, peak: 0.24, type: "bandpass", f0: 1700, f1: 260, q: 0.8 });
      this.noise({ dur: 0.12, peak: 0.12, type: "highpass", f0: 4200, f1: 2600, q: 0.8, delay: 0.02 });
    }

    parryReady() {
      if (!this.enabled || this.muted) return;
      this.noise({ dur: 0.14, peak: 0.05, type: "bandpass", f0: 1200, f1: 3200, q: 3 });
    }

    death() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 220, 55, 1.4, 0.2, 0);
      this.tone("triangle", 330, 110, 1.1, 0.08, 0.05);
      this.noise({ dur: 0.9, peak: 0.12, type: "lowpass", f0: 900, f1: 80, q: 0.7 });
    }

    enemyDie() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 120, 34, 0.5, 0.25);
      this.noise({ dur: 0.4, peak: 0.18, type: "bandpass", f0: 1400, f1: 200, q: 0.7 });
    }

    wave() {
      if (!this.enabled || this.muted) return;
      this.tone("sine", 196, 196, 1.6, 0.09, 0);
      this.tone("sine", 294, 294, 1.3, 0.05, 0.02);
      this.tone("sine", 392, 392, 1.1, 0.03, 0.04);
      this.noise({ dur: 0.5, peak: 0.05, type: "bandpass", f0: 2400, f1: 900, q: 3, delay: 0.03 });
    }

    startChargeHum() {
      if (!this.enabled || this.muted || this.chargeOsc) return;
      try {
        const t = this.now();
        const osc = this.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(70, t);
        const flt = this.ctx.createBiquadFilter();
        flt.type = "bandpass";
        flt.frequency.value = 400;
        flt.Q.value = 4;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.18);
        osc.connect(flt); flt.connect(g); g.connect(this.master);
        osc.start(t);
        this.chargeOsc = osc; this.chargeGain = g; this.chargeFilter = flt;
      } catch (e) { /* ignore */ }
    }

    updateChargeHum(progress) {
      if (!this.chargeOsc) return;
      try {
        const t = this.now();
        this.chargeOsc.frequency.setTargetAtTime(70 + progress * 130, t, 0.05);
        this.chargeFilter.frequency.setTargetAtTime(300 + progress * 1500, t, 0.05);
        this.chargeGain.gain.setTargetAtTime(0.03 + progress * 0.05, t, 0.06);
      } catch (e) { /* ignore */ }
    }

    stopChargeHum() {
      if (!this.chargeOsc) return;
      try {
        const t = this.now();
        this.chargeGain.gain.cancelScheduledValues(t);
        this.chargeGain.gain.setTargetAtTime(0.0001, t, 0.03);
        this.chargeOsc.stop(t + 0.15);
      } catch (e) { /* ignore */ }
      this.chargeOsc = null; this.chargeGain = null; this.chargeFilter = null;
    }

    startDrone() {
      this.droneStarted = true;
      try {
        const t = this.now();
        const g = this.ctx.createGain();
        g.gain.value = 0.035;
        const flt = this.ctx.createBiquadFilter();
        flt.type = "lowpass";
        flt.frequency.value = 260;
        const a = this.ctx.createOscillator();
        a.type = "sawtooth"; a.frequency.value = 42;
        const b = this.ctx.createOscillator();
        b.type = "sine"; b.frequency.value = 63.5;
        const c = this.ctx.createOscillator();
        c.type = "sine"; c.frequency.value = 127.3;
        const cg = this.ctx.createGain(); cg.gain.value = 0.25;
        a.connect(flt); b.connect(flt); c.connect(cg); cg.connect(flt);
        flt.connect(g); g.connect(this.master);
        a.start(t); b.start(t); c.start(t);
      } catch (e) { /* ignore */ }
    }

    tick(realDt) {
      if (!this.enabled || this.muted) return;
      this.lastCrackle -= realDt;
      if (this.lastCrackle <= 0) {
        this.lastCrackle = rand(2.8, 1.1);
        try {
          this.noise({ dur: 0.045, peak: 0.02, type: "bandpass", f0: rand(2200, 700), f1: 300, q: 2 });
        } catch (e) { /* ignore */ }
      }
    }
  }
  AV.AudioEngine = AudioEngine;

  // ------------------------------------------------------------------ effects
  // Effects are updated with real dt even while hitstop freezes the world.
  class Effects {
    constructor() {
      this.list = [];
      this.dust = [];
      this.debris = [];
      this.texts = [];
      this.ghosts = [];
      this.flash = 0;
      this.flashColor = "255,255,255";
      this.max = 700;
    }
    clear() {
      this.list.length = 0;
      this.dust.length = 0;
      this.debris.length = 0;
      this.texts.length = 0;
      this.ghosts.length = 0;
      this.flash = 0;
    }
    add(e) {
      if (this.list.length >= this.max) this.list.shift();
      this.list.push(e);
      return e;
    }
    spark(x, y, dirx, diry, opts = {}) {
      const n = opts.count || 8;
      for (let i = 0; i < n; i++) {
        const ang = Math.atan2(diry, dirx) + rand(1.15, -1.15) * (opts.spread == null ? 1 : opts.spread);
        const spd = rand(opts.speed == null ? 520 : opts.speed, 90) * rand(1.3, 0.6);
        this.add({
          k: "spark", x, y,
          vx: Math.cos(ang) * spd + (opts.vx || 0),
          vy: Math.sin(ang) * spd + (opts.vy || 0),
          life: rand(opts.life || 0.4, 0.14),
          max: opts.life || 0.4,
          size: rand(2.4, 0.9) * (opts.scale || 1),
          grav: opts.grav == null ? 1400 : opts.grav,
          color: opts.color || pick(["#ffe7b0", "#ffb45e", "#ffffff", "#9ff6ff"]),
          drag: opts.drag == null ? 2.4 : opts.drag,
        });
      }
    }
    emberBurst(x, y, n = 10, color = "#ffb35c", speed = 260) {
      for (let i = 0; i < n; i++) {
        const a = rand(TAU, 0);
        const s = rand(speed, 40);
        this.add({
          k: "ember", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
          life: rand(1.4, 0.6), max: 1.4, size: rand(3, 1), color, grav: -30, drag: 0.9,
        });
      }
    }
    slash(x, y, angle, radius, opts = {}) {
      this.add({
        k: "slash", x, y, angle, radius,
        arc: opts.arc == null ? 2.1 : opts.arc,
        life: opts.life || 0.22, max: opts.life || 0.22,
        width: opts.width || 10,
        color: opts.color || "#a8f7ff",
        glow: opts.glow == null ? 1 : opts.glow,
        flip: opts.flip || 1,
        follow: opts.follow || null,
        ox: opts.ox || 0, oy: opts.oy || 0,
        rot: opts.rot || 0,
        grow: opts.grow == null ? 60 : opts.grow,
      });
    }
    ring(x, y, opts = {}) {
      this.add({
        k: "ring", x, y, r: opts.r0 || 8, r1: opts.r1 || 90,
        life: opts.life || 0.32, max: opts.life || 0.32,
        width: opts.width || 3, color: opts.color || "#ffd6a0",
        squash: opts.squash == null ? 0.42 : opts.squash,
        rot: opts.rot || 0,
      });
    }
    flashBurst(x, y, opts = {}) {
      this.add({
        k: "flash", x, y, r: opts.r || 60, life: opts.life || 0.14, max: opts.life || 0.14,
        color: opts.color || "#ffffff",
      });
    }
    impact(x, y, dirx, force = 1, color) {
      this.spark(x, y, dirx, -0.35, { count: 8 + (force * 5 | 0), speed: 380 + force * 200, spread: 0.9, life: 0.36, scale: 0.8 + force * 0.25, color });
      this.flashBurst(x, y, { r: 28 + force * 18, color: color || "#fff6df" });
      this.ring(x, y, { r1: 36 + force * 26, width: 2.5 + force, color: "#ffd9a0", life: 0.2, squash: 0.55 });
    }
    dustPuff(x, y, count = 6, dir = 0, power = 1) {
      for (let i = 0; i < count; i++) {
        this.add({
          k: "dust", x: x + rand(20, -20), y: y + rand(4, -4),
          vx: rand(140, -140) * power + dir * 70, vy: rand(-10, -110) * power,
          life: rand(0.7, 0.35), max: 0.7, size: rand(10, 3) * power, color: "#7d7266", grav: -30, drag: 2.2,
        });
      }
    }
    text(x, y, str, opts = {}) {
      this.texts.push({
        x, y, str,
        vx: opts.vx == null ? rand(50, -50) : opts.vx,
        vy: opts.vy == null ? -140 : opts.vy,
        life: opts.life || 0.7, max: opts.life || 0.7,
        size: opts.size || 22, color: opts.color || "#fff2d6",
        weight: opts.weight || 700,
        font: opts.font || "ui",
        glow: opts.glow || 0,
        align: opts.align || "center",
        gravity: opts.gravity == null ? 260 : opts.gravity,
      });
    }
    limb(x, y, part, opts) {
      const ghost = {
        k: "limb", x, y, vx: opts.vx || 0, vy: opts.vy || 0,
        rot: opts.rot || 0, spin: opts.spin || 0,
        life: opts.life || 2.4, max: opts.life || 2.4,
        part, flip: opts.flip || 1, bounce: 0, trail: opts.trail || false,
      };
      this.debris.push(ghost);
      return ghost;
    }
    ghost(x, y, pose, facing, opts = {}) {
      this.ghosts.push({
        x, y, pose, facing,
        life: opts.life || 0.3, max: opts.life || 0.3,
        color: opts.color || "#7cf3ff", alpha: opts.alpha || 0.4,
      });
    }
    screenFlash(alpha, color = "255,255,255") {
      this.flash = Math.max(this.flash, alpha);
      this.flashColor = color;
    }

    update(dt) {
      this.flash = Math.max(0, this.flash - dt * 3.2);
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        e.life -= dt;
        if (e.life <= 0) { this.list.splice(i, 1); continue; }
        if (e.k === "spark" || e.k === "ember" || e.k === "dust") {
          e.vy += e.grav * dt;
          const d = Math.exp(-e.drag * dt);
          e.vx *= d;
          e.vy *= e.k === "dust" ? d : e.vy * 0 + e.vy * d;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.k === "spark" && e.y > 0.5) { e.y = 0.5; e.vy *= -0.32; e.vx *= 0.7; }
        }
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        if (t.life <= 0) { this.texts.splice(i, 1); continue; }
        t.vy += t.gravity * dt * (t.life < t.max * 0.5 ? 1 : 0.3);
        t.x += t.vx * dt;
        t.y += t.vy * dt;
      }
      for (let i = this.ghosts.length - 1; i >= 0; i--) {
        const g = this.ghosts[i];
        g.life -= dt;
        if (g.life <= 0) this.ghosts.splice(i, 1);
      }
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.life -= dt;
        d.vy += 1900 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.spin * dt;
        if (d.y > -2 && d.vy > 0) {
          if (d.bounce < 2) {
            d.y = -2;
            d.vy *= -0.34;
            d.vx *= 0.55;
            d.spin *= 0.4;
            d.bounce++;
            if (Math.abs(d.vy) < 60) d.vy = 0;
            this.dustPuff(d.x, 0, 3, 0, 0.5);
          } else {
            d.y = -2;
            d.vy = 0; d.vx *= Math.exp(-6 * dt); d.spin *= Math.exp(-6 * dt);
          }
        }
        if (d.life <= 0) this.debris.splice(i, 1);
      }
    }
  }
  AV.Effects = Effects;

  // ------------------------------------------------------------------- camera
  class Camera {
    constructor() {
      this.x = 640;
      this.y = -170;
      this.zoom = 1;
      this.targetZoom = 1;
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.ox = 0; this.oy = 0;
      this.lookAhead = 0;
      this.punch = 0;
      this.freeze = 0;
      this.w = 1280; this.h = 720;
    }
    update(dt, player, arenaW) {
      const p = player;
      const look = p.facing * clamp(70 + Math.abs(p.vx) * 0.12, 70, 150);
      this.lookAhead = lerp(this.lookAhead, look, 1 - Math.exp(-dt * 3.2));
      const targetX = p.x + this.lookAhead;
      const targetY = p.y - 150 + clamp((p.y + 150) * 0.3, -90, 60);
      this.x = lerp(this.x, targetX, 1 - Math.exp(-dt * 5.4));
      this.y = lerp(this.y, targetY, 1 - Math.exp(-dt * 4));
      this.zoom = lerp(this.zoom, this.targetZoom + this.punch, 1 - Math.exp(-dt * 7));
      this.punch *= Math.exp(-dt * 8);

      const halfW = this.w / 2 / this.zoom;
      const halfH = this.h / 2 / this.zoom;
      const minX = halfW - 40;
      const maxX = arenaW - halfW + 40;
      if (minX > maxX) this.x = arenaW / 2;
      else this.x = clamp(this.x, minX, maxX);
      this.y = clamp(this.y, -halfH + 70, -halfH + 180);

      this.shake *= Math.exp(-dt * 9);
      if (this.shake < 0.05) this.shake = 0;
      this.shakeX = rand(1, -1) * this.shake;
      this.shakeY = rand(1, -1) * this.shake * 0.7;
    }
    addShake(v) {
      this.shake = Math.min(16, this.shake + v);
    }
    punchZoom(v) {
      this.punch = Math.min(0.06, this.punch + v);
    }
  }
  AV.Camera = Camera;
})(window.AV = window.AV || {});
