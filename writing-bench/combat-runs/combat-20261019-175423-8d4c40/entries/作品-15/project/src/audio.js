class Synth {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; }
  unlock() {
    try {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : .35;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -15;
        compressor.ratio.value = 5;
        this.master.connect(compressor); compressor.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (_) { this.ctx = null; }
  }
  toggle() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : .35, this.ctx.currentTime, .03);
    return this.muted;
  }
  tone(freq, end, dur, gain, type = 'sine', delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(15, end), t + dur);
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(gain, t + .006);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
  }
  hiss(dur, gain, freq = 1500, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay, n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = .7;
    g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(gain, t + .006);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random() * .3); n.stop(t + dur);
  }
  play(name, power = 1) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || -10) < (name === 'hit' ? .025 : .045)) return;
    this.last[name] = now;
    switch (name) {
      case 'swing': this.hiss(.11, .24, 1700); this.tone(300, 90, .11, .08, 'triangle'); break;
      case 'heavy': this.hiss(.24, .34, 850); this.tone(230, 45, .22, .2, 'sawtooth'); break;
      case 'hit': this.hiss(.075, .55, 2700); this.tone(150 * power, 42, .115, .48); this.tone(840, 370, .055, .15, 'square'); break;
      case 'crush': this.hiss(.18, .65, 1400); this.tone(120, 28, .25, .65); this.tone(650, 180, .16, .13, 'sawtooth'); break;
      case 'break': this.hiss(.25, .5, 3200); this.tone(930, 310, .23, .13, 'square'); this.tone(130, 30, .3, .5); break;
      case 'dash': this.hiss(.17, .28, 2300); this.tone(470, 95, .16, .15, 'triangle'); break;
      case 'jump': this.hiss(.09, .1, 700); this.tone(150, 380, .13, .09, 'triangle'); break;
      case 'land': this.hiss(.13, .2, 460); this.tone(70, 30, .12, .15); break;
      case 'hurt': this.hiss(.2, .4, 700); this.tone(230, 50, .23, .3, 'sawtooth'); break;
      case 'lift': this.tone(120, 700, .23, .19, 'triangle'); this.hiss(.22, .24, 2200); break;
      case 'charge': this.tone(220, 880, .5, .07, 'triangle'); break;
      case 'ready': this.tone(640, 650, .09, .13, 'sine'); this.tone(960, 980, .17, .1, 'sine', .08); break;
      case 'kill': this.tone(410, 80, .26, .16, 'triangle'); this.hiss(.25, .25, 600); break;
      case 'wave': this.tone(140, 140, .35, .13, 'triangle'); this.tone(210, 210, .5, .1, 'sine', .15); break;
      case 'perfect': this.tone(1050, 1600, .15, .12); this.tone(720, 1440, .22, .11, 'triangle', .03); break;
      case 'vortexCast': this.tone(160, 780, .23, .2, 'sine'); this.hiss(.18, .18, 1700); break;
      case 'vortexHit': this.tone(720, 80, .45, .25, 'triangle'); this.hiss(.35, .28, 900); break;
      case 'pierceCast': this.tone(480, 1400, .12, .13, 'triangle'); break;
      case 'pierceHit': this.hiss(.18, .4, 3300); this.tone(900, 140, .18, .18, 'sawtooth'); break;
      case 'pierceBreak': this.tone(1200, 210, .15, .18, 'square'); this.tone(130, 32, .22, .45); break;
      case 'orbitCast': this.tone(440, 660, .15, .12); this.tone(554, 830, .2, .1, 'triangle', .04); break;
      case 'orbitHit': this.hiss(.25, .2, 2300); this.tone(740, 370, .24, .13, 'triangle'); break;
      case 'verdictCast': this.tone(110, 290, .48, .23, 'sawtooth'); this.tone(220, 580, .45, .12, 'triangle'); break;
      case 'verdictHit': this.tone(85, 22, .5, .65); this.hiss(.36, .6, 900); this.tone(1250, 210, .26, .15, 'square'); break;
    }
  }
}
const audio = new Synth();
