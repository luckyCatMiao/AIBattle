'use strict';
// ---------------------------------------------------------------------------
// Procedural audio: every sound is synthesized with WebAudio, no assets.
// ---------------------------------------------------------------------------
const Sound = (() => {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let comp = null;
  let ready = false;
  let muted = false;
  let noiseBuf = null;
  let lastPlay = new Map();

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.15;
      comp.connect(master);
      master.connect(ctx.destination);

      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(comp);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(comp);

      // white noise buffer for impacts / slides
      const len = Math.floor(ctx.sampleRate * 1.2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02; // slight pink tint
        d[i] = last * 3.2 + w * 0.35;
      }
      ready = true;
      startMusic();
    } catch (e) { ctx = null; }
  }

  function resume() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function now() { return ctx.currentTime; }

  function throttle(key, ms) {
    const t = performance.now();
    const last = lastPlay.get(key) || 0;
    if (t - last < ms) return false;
    lastPlay.set(key, t);
    return true;
  }

  // one-shot oscillator
  function osc(type, f0, f1, dur, gain, opts = {}) {
    if (!ready || muted) return;
    const t = now() + (opts.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * (opts.pitchTime || 1));
    if (opts.detune) o.detune.value = opts.detune;
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(opts.pan, -1, 1);
      g.connect(p); p.connect(sfxBus);
    } else g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
    return g;
  }

  // noise burst through a filter
  function noise(dur, gain, filt, freq0, freq1, opts = {}) {
    if (!ready || muted) return;
    const t = now() + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = opts.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = filt;
    f.frequency.setValueAtTime(freq0, t);
    if (freq1 && freq1 !== freq0) f.frequency.exponentialRampToValueAtTime(freq1, t + dur * (opts.sweepTime || 1));
    f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(opts.pan, -1, 1);
      g.connect(p); p.connect(sfxBus);
    } else g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // ---------- SFX library ----------
  const SFX = {
    // light slash: airy whistle + sharp tick
    slash(power = 1, pan = 0, delay = 0) {
      if (!ready || muted) return;
      const p = power;
      noise(0.07 + 0.04 * p, 0.30 * p, 'bandpass', 1400 + 400 * p, 700, { q: 1.6, pan, delay, rate: 1.1 + p * 0.3 });
      osc('triangle', 900 * p, 260, 0.09, 0.05 * p, { pan, delay });
      noise(0.05, 0.12, 'highpass', 4200, 2400, { pan, delay });
    },
    heavyWind(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.22, 0.22, 'bandpass', 500, 1600, { q: 1.2, pan, delay, attack: 0.08 });
      osc('sawtooth', 140, 70, 0.24, 0.045, { pan, delay, attack: 0.06 });
    },
    hitLight(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.10, 0.55, 'bandpass', 2600, 900, { q: 1.1, pan, delay });
      osc('triangle', 420, 120, 0.10, 0.30, { pan, delay });
      noise(0.035, 0.30, 'highpass', 6000, 4200, { pan, delay });
    },
    hitHeavy(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.20, 0.68, 'lowpass', 3200, 240, { q: 0.9, pan, delay });
      osc('sine', 160, 44, 0.30, 0.55, { pan, delay });
      noise(0.05, 0.45, 'highpass', 5200, 3000, { pan, delay });
    },
    hitCrit(pan = 0, delay = 0) {
      if (!ready || muted) return;
      osc('square', 1250, 620, 0.13, 0.16, { pan, delay });
      osc('triangle', 2100, 1100, 0.10, 0.10, { pan, delay });
      noise(0.12, 0.42, 'bandpass', 4200, 1400, { q: 2.0, pan, delay });
      osc('sine', 190, 40, 0.32, 0.42, { pan, delay });
    },
    limbBreak(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.26, 0.55, 'bandpass', 1700, 320, { q: 1.0, pan, delay });
      osc('square', 260, 70, 0.16, 0.16, { pan, delay });
      osc('sawtooth', 95, 42, 0.30, 0.12, { pan, delay });
      noise(0.06, 0.35, 'highpass', 7000, 3800, { pan, delay });
    },
    parry(pan = 0, delay = 0) {
      if (!ready || muted) return;
      osc('sine', 2600, 1400, 0.22, 0.20, { pan, delay });
      osc('sine', 3900, 2400, 0.18, 0.12, { pan, delay });
      osc('triangle', 1250, 900, 0.30, 0.10, { pan, delay });
      noise(0.16, 0.26, 'highpass', 6500, 3000, { pan, delay });
    },
    deflected(pan = 0, delay = 0) {
      if (!ready || muted) return;
      osc('square', 340, 700, 0.06, 0.10, { pan, delay });
      noise(0.08, 0.18, 'highpass', 3000, 1800, { pan, delay });
    },
    dash(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.22, 0.30, 'bandpass', 450, 3400, { q: 0.7, pan, delay, attack: 0.05, sweepTime: 0.8 });
      osc('sine', 110, 240, 0.16, 0.07, { pan, delay });
    },
    jump(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.14, 0.12, 'bandpass', 900, 2600, { q: 0.8, pan, delay, attack: 0.02 });
      osc('triangle', 220, 460, 0.10, 0.06, { pan, delay });
    },
    land(power = 1, pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.12 + power * 0.1, 0.24 * power, 'lowpass', 900, 160, { q: 0.7, pan, delay });
      osc('sine', 120, 48, 0.14, 0.20 * power, { pan, delay });
    },
    hurt(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.24, 0.34, 'lowpass', 1800, 300, { pan, delay });
      osc('sawtooth', 220, 70, 0.24, 0.14, { pan, delay });
      osc('sine', 90, 50, 0.32, 0.24, { pan, delay });
    },
    enemyWindup(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.30, 0.15, 'bandpass', 320, 900, { q: 2.4, pan, delay, attack: 0.12 });
      osc('sawtooth', 85, 150, 0.28, 0.05, { pan, delay, attack: 0.1 });
    },
    enemySwing(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.14, 0.24, 'bandpass', 700, 260, { q: 1.0, pan, delay });
    },
    enemyDie(pan = 0, delay = 0) {
      if (!ready || muted) return;
      noise(0.7, 0.30, 'lowpass', 2200, 120, { q: 0.8, pan, delay });
      osc('sawtooth', 150, 34, 0.6, 0.16, { pan, delay });
      osc('sine', 70, 30, 0.7, 0.2, { pan, delay });
    },
    overdrive(pan = 0, delay = 0) {
      if (!ready || muted) return;
      osc('sawtooth', 70, 280, 0.5, 0.14, { pan, delay, attack: 0.1 });
      noise(0.5, 0.26, 'bandpass', 600, 4200, { q: 0.8, pan, delay, attack: 0.15 });
    },
    bell(ch = 0, delay = 0) {
      if (!ready || muted) return;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      const base = freqs[ch % freqs.length];
      osc('sine', base, base, 0.6, 0.10, { delay });
      osc('sine', base * 2, base * 2, 0.4, 0.05, { delay });
    },
    uiClick(delay = 0) {
      if (!ready || muted) return;
      osc('triangle', 700, 520, 0.05, 0.08, { delay });
    },
    start(delay = 0) {
      if (!ready || muted) return;
      osc('sine', 196, 196, 0.8, 0.15, { delay });
      osc('sine', 293.66, 293.66, 0.8, 0.12, { delay: delay + 0.03 });
      osc('sine', 392, 392, 1.1, 0.10, { delay: delay + 0.06 });
      noise(0.6, 0.12, 'bandpass', 500, 3000, { q: 0.7, delay, attack: 0.2 });
    },
    wave(delay = 0) {
      if (!ready || muted) return;
      osc('sawtooth', 60, 180, 0.9, 0.10, { delay, attack: 0.2 });
      osc('sine', 400, 800, 0.6, 0.10, { delay: delay + 0.1 });
    },
    heartbeat(pan = 0) {
      if (!ready || muted) return;
      osc('sine', 70, 40, 0.18, 0.16, { pan });
    },
  };

  // ---------- Ambient music: slow taiko pulse + drone ----------
  let musicTimer = null;
  let beatIdx = 0;
  function startMusic() {
    if (!ctx || musicTimer) return;
    const scale = [0, 3, 5, 7, 10];
    const root = 55;
    let next = ctx.currentTime + 0.5;

    function scheduleBeat() {
      if (!ctx) return;
      const t = next;
      // low drone chord every 8 beats
      if (beatIdx % 8 === 0) {
        const freqs = [root, root * 2, root * 3 * 1.0];
        freqs.forEach((f, i) => {
          const o = ctx.createOscillator(); const g = ctx.createGain(); const f2 = ctx.createBiquadFilter();
          o.type = i === 0 ? 'sawtooth' : 'sine';
          o.frequency.value = f * (1 + (i === 1 ? 0.002 : 0));
          f2.type = 'lowpass'; f2.frequency.value = 260;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.045 / (i + 1), t + 1.4);
          g.gain.linearRampToValueAtTime(0.0001, t + 4.4);
          o.connect(f2); f2.connect(g); g.connect(musicBus);
          o.start(t); o.stop(t + 4.6);
        });
      }
      // taiko pulse
      if (beatIdx % 2 === 0) {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(96, t);
        o.frequency.exponentialRampToValueAtTime(44, t + 0.18);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.20, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
        o.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + 0.34);
        // click
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.type = 'triangle'; o2.frequency.setValueAtTime(1400, t);
        g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.05, t + 0.003);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o2.connect(g2); g2.connect(musicBus); o2.start(t); o2.stop(t + 0.08);
      }
      // sparse melodic plucks
      if (beatIdx % 8 === 3 || beatIdx % 8 === 6) {
        const n = scale[Math.floor(Math.random() * scale.length)];
        const f = 220 * Math.pow(2, n / 12);
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 1.3);
      }
      beatIdx++;
      next += 0.46;
      const delayMs = Math.max(20, (next - ctx.currentTime - 0.25) * 1000);
      musicTimer = setTimeout(scheduleBeat, delayMs);
    }
    scheduleBeat();
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.02);
    return muted;
  }
  function toggleMuted() { return setMuted(!muted); }

  // duck music slightly during big hits
  function duck(amount = 0.5, dur = 0.3) {
    if (!musicBus || !ready) return;
    const t = ctx.currentTime;
    const cur = musicBus.gain.value;
    musicBus.gain.setValueAtTime(cur, t);
    musicBus.gain.linearRampToValueAtTime(0.32 * amount, t + 0.05);
    musicBus.gain.linearRampToValueAtTime(0.32, t + dur);
  }

  return {
    init, resume, SFX, setMuted, toggleMuted, duck,
    getMasterGain() { return master ? master.gain.value : -1; },
    get muted() { return muted; },
    get ready() { return ready; },
    get ctx() { return ctx; },
  };
})();
