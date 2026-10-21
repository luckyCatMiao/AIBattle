/* =========================================================
   绯月 · 断刃  —  procedural audio (WebAudio, no assets)
   ========================================================= */
const Sfx = (function () {
  let ctx = null, master = null, ambient = null;
  let muted = false;
  let noiseBuf = null;
  let timers = [];

  function makeNoise() {
    const len = Math.floor(ctx.sampleRate * 0.7);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.75;
      master.connect(ctx.destination);
      noiseBuf = makeNoise();
      startAmbient();
    } catch (e) { ctx = null; }
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone(freq, dur, vol, type, slideTo, delay, dest) {
    if (!ctx) return;
    const t0 = now() + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) {
      try { o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur); } catch (e) {}
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function noise(dur, vol, f0, f1, q, delay, dest) {
    if (!ctx || !noiseBuf) return;
    const t0 = now() + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) {
      try { f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur); } catch (e) {}
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function startAmbient() {
    // Low, sparse ritual ambience: a breathing drone and distant wooden pulse.
    const g = ctx.createGain();
    g.gain.value = 0.055;
    g.connect(master);
    const freqs = [55, 82.41, 110.2];
    freqs.forEach((fr, i) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = fr;
      og.gain.value = i === 0 ? 0.55 : 0.16;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.023;
      lg.gain.value = og.gain.value * 0.45;
      lfo.connect(lg); lg.connect(og.gain);
      lfo.start();
      o.connect(og); og.connect(g); o.start();
    });

    timers.push(setInterval(() => {
      if (!ctx || muted) return;
      // taiko pulse
      const t = 0.13 + Math.random() * 0.04;
      tone(64, 0.36, 0.09, 'sine', 38, 0);
      noise(0.09, 0.035, 220, 90, 0.8, 0);
      if (Math.random() < 0.35) {
        tone(392, 0.9, 0.02, 'sine', 391, 0.2);
        tone(587.3, 0.8, 0.012, 'sine', 586, 0.22);
      }
    }, 1650));

    timers.push(setInterval(() => {
      if (!ctx || muted) return;
      tone(880, 1.6, 0.016, 'sine', 878, 0);
      tone(1318.5, 1.5, 0.008, 'sine', 1316, 0.02);
    }, 9000));
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.75, now(), 0.05);
    return muted;
  }

  return {
    init,
    setMuted,
    isMuted: () => muted,
    isReady: () => !!ctx,
    swing(heavy) {
      if (!ctx) return;
      noise(heavy ? 0.26 : 0.15, heavy ? 0.2 : 0.12, heavy ? 1500 : 2600, 260, 0.9, 0);
      if (heavy) tone(180, 0.22, 0.05, 'sawtooth', 60, 0);
    },
    hit(power) {
      if (!ctx) return;
      const p = Math.max(0, Math.min(1, power));
      noise(0.055 + p * 0.05, 0.22 + p * 0.14, 2400 - p * 900, 500, 0.8, 0);
      tone(165 - p * 60, 0.11 + p * 0.09, 0.2 + p * 0.15, 'sine', 52, 0);
      tone(720 + p * 300, 0.045, 0.07, 'square', 300, 0);
    },
    heavyHit() {
      if (!ctx) return;
      noise(0.16, 0.34, 900, 110, 0.7, 0);
      tone(96, 0.3, 0.35, 'sine', 34, 0);
      tone(220, 0.12, 0.12, 'square', 70, 0.005);
    },
    sever() {
      if (!ctx) return;
      noise(0.2, 0.24, 3200, 700, 2.2, 0);
      tone(340, 0.2, 0.12, 'square', 90, 0);
      tone(1200, 0.18, 0.05, 'sine', 260, 0.02);
    },
    parry() {
      if (!ctx) return;
      tone(1480, 0.32, 0.16, 'sine', 1460, 0);
      tone(2220, 0.26, 0.09, 'sine', 2200, 0.008);
      tone(2960, 0.16, 0.04, 'sine', 2940, 0.015);
      noise(0.12, 0.12, 5000, 2200, 2.5, 0);
      tone(90, 0.35, 0.12, 'sine', 40, 0.02);
    },
    dash() {
      if (!ctx) return;
      noise(0.2, 0.11, 1400, 180, 0.7, 0);
    },
    jump() {
      if (!ctx) return;
      tone(360, 0.09, 0.06, 'triangle', 620, 0);
    },
    land() {
      if (!ctx) return;
      tone(110, 0.13, 0.09, 'sine', 45, 0);
      noise(0.07, 0.05, 500, 140, 0.8, 0);
    },
    hurt() {
      if (!ctx) return;
      tone(210, 0.28, 0.13, 'sawtooth', 60, 0);
      noise(0.16, 0.13, 1000, 200, 0.7, 0);
    },
    orb() {
      if (!ctx) return;
      tone(520, 0.18, 0.05, 'sine', 880, 0);
    },
    reflect() {
      if (!ctx) return;
      tone(1040, 0.25, 0.1, 'sine', 1900, 0);
      noise(0.1, 0.08, 4000, 1600, 2, 0);
    },
    kill() {
      if (!ctx) return;
      tone(140, 0.55, 0.12, 'sawtooth', 38, 0);
      noise(0.35, 0.16, 1600, 90, 0.6, 0);
      tone(66, 0.4, 0.2, 'sine', 30, 0.02);
    },
    wave() {
      if (!ctx) return;
      tone(587, 1.1, 0.06, 'sine', 585, 0);
      tone(880, 1.0, 0.04, 'sine', 878, 0.03);
      tone(1174, 0.9, 0.02, 'sine', 1172, 0.06);
      tone(72, 0.5, 0.16, 'sine', 40, 0);
    },
    select() {
      if (!ctx) return;
      tone(660, 0.08, 0.06, 'triangle', 990, 0);
    },
    charge(level) {
      if (!ctx) return;
      tone(220 + level * 520, 0.12, 0.035, 'sine', 300 + level * 700, 0);
    },
    parryFail() {
      if (!ctx) return;
      tone(140, 0.1, 0.05, 'square', 90, 0);
    },
    skill(i) {
      if (!ctx) return;
      if (i === 0) {
        // moon wheel: spiral whoosh + bell
        noise(0.34, 0.2, 2000, 300, 1.4, 0);
        tone(392, 0.5, 0.09, 'sine', 784, 0.02);
        tone(784, 0.42, 0.05, 'sine', 1568, 0.06);
      } else if (i === 1) {
        // shadow rend: fast descending zing + delayed cut
        noise(0.22, 0.18, 3200, 500, 2.0, 0);
        tone(1200, 0.2, 0.1, 'sawtooth', 220, 0.01);
        noise(0.14, 0.22, 900, 120, 0.8, 0.24);
        tone(90, 0.28, 0.2, 'sine', 40, 0.24);
      } else if (i === 2) {
        // blade rain: metallic chimes falling
        for (let k = 0; k < 5; k++) tone(1500 - k * 140, 0.18, 0.05, 'triangle', 900 - k * 90, k * 0.09);
        noise(0.3, 0.1, 4200, 1400, 2.2, 0.02);
      } else {
        // ultimate: rising roar into a huge cut
        tone(55, 1.3, 0.22, 'sawtooth', 220, 0);
        noise(1.1, 0.16, 220, 2600, 0.7, 0);
        tone(1760, 0.7, 0.05, 'sine', 880, 0.55);
        noise(0.4, 0.3, 1800, 60, 0.6, 0.62);
        tone(70, 0.8, 0.3, 'sine', 28, 0.62);
      }
    }
  };
})();
