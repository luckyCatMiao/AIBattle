'use strict';
const audioErrors = [];
// harness-audio.js — 真实 AudioContext 桩：像 Chrome 一样对非有限 AudioParam 参数抛 TypeError
// 用于让 harness/fuzz 覆盖全部音频路径
'use strict';

function chkFinite(v, method, kind) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    audioErrors.push(`${method}(${kind})=${v}`);
    throw new TypeError(`Failed to execute '${method}' on 'AudioParam': The provided ${kind} value is non-finite`);
  }
}

class FakeParam {
  constructor(name) { this._v = 0; this._name = name || 'setValueAtTime'; }
  get value() { return this._v; }
  set value(x) { chkFinite(x, this._name || 'setValueAtTime', 'double'); this._v = x; }
  setValueAtTime(x, t) { chkFinite(x, 'setValueAtTime', 'double'); chkFinite(t, 'setValueAtTime', 'time'); this._v = x; }
  linearRampToValueAtTime(x, t) { chkFinite(x, 'linearRampToValueAtTime', 'double'); chkFinite(t, 'linearRampToValueAtTime', 'time'); this._v = x; }
  exponentialRampToValueAtTime(x, t) {
    chkFinite(x, 'exponentialRampToValueAtTime', 'double');
    chkFinite(t, 'exponentialRampToValueAtTime', 'time');
    if (x === 0) throw new RangeError('exponentialRampToValueAtTime: 0 is out of range');
    this._v = x;
  }
  setTargetAtTime(x, t, tc) { chkFinite(x, 'setTargetAtTime', 'double'); chkFinite(t, 'setTargetAtTime', 'time'); chkFinite(tc, 'setTargetAtTime', 'timeConstant'); }
  cancelScheduledEvents() {}
  cancelAndHoldAtTime() {}
}

class FakeNode {
  constructor(ctx) { this.ctx = ctx; this._params = {}; }
  connect() { return this; }
  disconnect() {}
}

class FakeOscillator extends FakeNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'sine';
    this.frequency = new FakeParam();
    this.detune = new FakeParam();
    this._started = false;
  }
  start(t) { if (t !== undefined) chkFinite(t, 'start', 'time'); this._started = true; }
  stop(t) { if (t !== undefined) chkFinite(t, 'stop', 'time'); }
}

class FakeBufferSource extends FakeNode {
  constructor(ctx) { super(ctx); this.buffer = null; this.loop = false; this.playbackRate = new FakeParam(); }
  start(t) { if (t !== undefined) chkFinite(t, 'start', 'time'); if (!this.buffer) throw new TypeError('invalid buffer'); }
  stop(t) { if (t !== undefined) chkFinite(t, 'stop', 'time'); }
}

class FakeGain extends FakeNode {
  constructor(ctx) { super(ctx); this.gain = new FakeParam(); }
}

class FakeBiquad extends FakeNode {
  constructor(ctx) { super(ctx); this.type = 'lowpass'; this.frequency = new FakeParam(); this.Q = new FakeParam(); this.detune = new FakeParam(); }
}

class FakeCompressor extends FakeNode {
  constructor(ctx) {
    super(ctx);
    this.threshold = new FakeParam(); this.knee = new FakeParam(); this.ratio = new FakeParam();
    this.attack = new FakeParam(); this.release = new FakeParam();
  }
}

class FakeStereoPanner extends FakeNode {
  constructor(ctx) { super(ctx); this.pan = new FakeParam(); }
}

class FakeAudioBuffer {
  constructor(len) { this._d = new Float32Array(len); }
  getChannelData() { return this._d; }
}

let LAST_CTX = null;
class FakeAudioContext {
  constructor() {
    LAST_CTX = this;
    this.state = 'running';
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.destination = new FakeNode(this);
    this._nodes = 0;
  }
  get currentTime() { return this._t !== undefined ? this._t : 0; }
  set currentTime(x) { chkFinite(x, 'currentTime', 'double'); this._t = x; }
  createGain() { return new FakeGain(this); }
  createOscillator() { return new FakeOscillator(this); }
  createBufferSource() { return new FakeBufferSource(this); }
  createBiquadFilter() { return new FakeBiquad(this); }
  createDynamicsCompressor() { return new FakeCompressor(this); }
  createStereoPanner() { return new FakeStereoPanner(this); }
  createBuffer(ch, len, rate) { return new FakeAudioBuffer(len); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

module.exports = { FakeAudioContext, FakeParam, lastContext: () => LAST_CTX, audioErrors };
