/* =========================================================
   裂帛 RIVEN — 音效 (WebAudio 实时合成, 无外部资源)
   ========================================================= */
const Sfx = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let started = false;
  let lastAt = Object.create(null);
  let drone = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.16;
    master.connect(comp).connect(ctx.destination);
    // 1s noise buffer
    const len = Math.floor(ctx.sampleRate * 1.0);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  function gate(name, ms) {
    const now = performance.now();
    if (lastAt[name] && now - lastAt[name] < ms) return false;
    lastAt[name] = now;
    return true;
  }

  function noise(dur, o = {}) {
    const c = ensure(); if (!c || muted) return null;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.Q.value = o.q == null ? 1 : o.q;
    const t = c.currentTime;
    f.frequency.setValueAtTime(o.f || 1200, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + dur);
    const g = c.createGain();
    const peak = (o.gain == null ? 0.3 : o.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.02);
    return { g, f };
  }

  function tone(type, f0, f1, dur, o = {}) {
    const c = ensure(); if (!c || muted) return null;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * (o.fdur || 1));
    const g = c.createGain();
    const peak = o.gain == null ? 0.2 : o.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.filter) {
      const bf = c.createBiquadFilter();
      bf.type = o.filter;
      bf.frequency.value = o.ff || 2000;
      bf.Q.value = o.fq || 1;
      node.connect(bf); node = bf;
    }
    node.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const api = {
    unlock,
    get ready() { return !!ctx && started && !muted; },
    isMuted() { return muted; },
    setMuted(m) {
      muted = m;
      if (master && ctx) {
        master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
      }
    },
    swing(kind) {
      if (!ctx || muted) return;
      if (!gate('swing' + kind, 26)) return;
      if (kind === 'heavy') {
        noise(0.22, { f: 2400, f2: 180, q: 0.9, gain: 0.34, a: 0.002 });
        tone('sawtooth', 180, 60, 0.15, { gain: 0.06, filter: 'lowpass', ff: 700 });
      } else if (kind === 'air') {
        noise(0.1, { f: 3200, f2: 900, q: 1.4, gain: 0.13 });
      } else if (kind === 'special') {
        noise(0.3, { f: 5200, f2: 700, q: 2.4, gain: 0.2 });
        tone('triangle', 1600, 3400, 0.25, { gain: 0.05 });
      } else {
        noise(0.12, { f: 2600, f2: 700, q: 1.2, gain: 0.19 });
      }
    },
    hit(power) {
      if (!ctx || muted) return;
      if (!gate('hit' + power, 18)) return;
      const p = power || 1;
      // low body
      tone('sine', 160 * (1 / p) + 40, 38, 0.14 + 0.05 * p, { gain: 0.28 + 0.06 * p });
      // click
      noise(0.05, { f: 3800, f2: 1200, q: 0.8, gain: 0.18 + 0.06 * p, a: 0.001 });
      // metal ring
      tone('triangle', 1250 + Math.random() * 500, 900, 0.12, { gain: 0.055 });
      tone('square', 2400 + Math.random() * 600, 1600, 0.07, { gain: 0.022 });
      if (p >= 2.2) {
        noise(0.24, { f: 900, f2: 80, q: 0.6, gain: 0.3, a: 0.002 });
        tone('sine', 70, 32, 0.32, { gain: 0.26 });
      }
    },
    sever() {
      if (!ctx || muted) return;
      if (!gate('sever', 30)) return;
      // crack
      noise(0.06, { f: 3000, f2: 600, q: 1.6, gain: 0.34, a: 0.001 });
      noise(0.18, { f: 1500, f2: 300, q: 0.7, gain: 0.18, a: 0.01 });
      tone('square', 420, 90, 0.18, { gain: 0.08, filter: 'lowpass', ff: 1400 });
      tone('sine', 110, 42, 0.22, { gain: 0.2 });
      // shards
      for (let i = 0; i < 3; i++) {
        tone('triangle', 1800 + Math.random() * 2200, 900, 0.06 + Math.random() * 0.05,
          { gain: 0.025, delay: 0.02 + i * 0.035 });
      }
    },
    parry() {
      if (!ctx || muted) return;
      if (!gate('parry', 60)) return;
      noise(0.18, { f: 600, f2: 6000, q: 2.2, gain: 0.2, a: 0.002 });
      tone('sine', 2100, 2100, 0.7, { gain: 0.16 });
      tone('sine', 3170, 3170, 0.55, { gain: 0.08 });
      tone('sine', 1050, 1050, 0.9, { gain: 0.1 });
      tone('triangle', 420, 220, 0.3, { gain: 0.12 });
    },
    dash() {
      if (!ctx || muted) return;
      if (!gate('dash', 60)) return;
      noise(0.2, { f: 300, f2: 2600, q: 0.8, gain: 0.16, a: 0.01 });
      tone('sine', 90, 200, 0.16, { gain: 0.05 });
    },
    jump() {
      if (!ctx || muted) return;
      if (!gate('jump', 50)) return;
      noise(0.08, { f: 800, f2: 2000, q: 1.0, gain: 0.07 });
      tone('sine', 220, 340, 0.08, { gain: 0.03 });
    },
    land() {
      if (!ctx || muted) return;
      if (!gate('land', 50)) return;
      tone('sine', 90, 45, 0.12, { gain: 0.14 });
      noise(0.09, { f: 500, f2: 120, q: 0.8, gain: 0.12 });
    },
    hurt() {
      if (!ctx || muted) return;
      tone('sawtooth', 180, 70, 0.24, { gain: 0.15, filter: 'lowpass', ff: 900 });
      noise(0.2, { f: 1200, f2: 200, q: 0.8, gain: 0.2 });
    },
    telegraph() {
      if (!ctx || muted) return;
      if (!gate('tele', 110)) return;
      const c = ctx; const t = c.currentTime;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(720, t + 0.35);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.45);
    },
    slam() {
      if (!ctx || muted) return;
      if (!gate('slam', 60)) return;
      tone('sine', 80, 28, 0.4, { gain: 0.34 });
      noise(0.35, { f: 700, f2: 60, q: 0.5, gain: 0.3, a: 0.002 });
    },
    kill() {
      if (!ctx || muted) return;
      tone('sine', 130, 35, 0.35, { gain: 0.2 });
      noise(0.3, { f: 2000, f2: 150, q: 0.6, gain: 0.18 });
    },
    echo() { // 断肢时的空灵回响
      if (!ctx || muted) return;
      tone('sine', 1320, 660, 0.5, { gain: 0.035 });
      tone('sine', 1980, 990, 0.4, { gain: 0.02, delay: 0.04 });
    },
    wave() {
      if (!ctx || muted) return;
      tone('sine', 110, 110, 1.4, { gain: 0.05 });
      tone('sine', 165, 165, 1.2, { gain: 0.03, delay: 0.05 });
      noise(0.7, { f: 5000, f2: 1200, q: 1.2, gain: 0.04, a: 0.2 });
    },
    droneStart() {
      if (!ctx || muted || drone) return;
      const c = ctx;
      drone = c.createGain();
      drone.gain.value = 0;
      drone.gain.setTargetAtTime(0.045, c.currentTime, 1.2);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 2;
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.6;
      const o3 = c.createOscillator(); o3.type = 'sine'; o3.frequency.value = 55.4;
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
      const lfoG = c.createGain(); lfoG.gain.value = 90;
      lfo.connect(lfoG).connect(lp.frequency);
      o1.connect(lp); o2.connect(lp); o3.connect(lp);
      lp.connect(drone).connect(master);
      o1.start(); o2.start(); o3.start(); lfo.start();
      drone._nodes = [o1, o2, o3, lfo];
    },
    droneStop() {
      if (!drone) return;
      const d = drone; drone = null;
      try {
        d.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        setTimeout(() => d._nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 800);
      } catch (e) {}
    },
  };
  return api;
})();
