/* Verify the entire synth graph runs against a WebAudio-like mock without throwing. */
const H = require('./harness_lib.js');
// harness has no AudioContext; install a mock and re-init through the exposed debug path
function mockAudio() {
  const param = () => ({
    value: 0,
    setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {}
  });
  const node = () => ({
    connect() { return this; }, disconnect() {},
    gain: param(), frequency: param(), Q: param(), detune: param(),
    start() {}, stop() {}, type: ''
  });
  class Ctx {
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.state = 'running'; this.destination = node(); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createBuffer(ch, len) { return { getChannelData() { return new Float32Array(len); } }; }
    createStereoPanner() { return node(); }
    resume() { return Promise.resolve(); }
  }
  return Ctx;
}
global.window.AudioContext = mockAudio();
// a second boot of the bundle is not possible here; instead exercise Sfx via a fresh VM of the audio module
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('/workspace/src/audio.js', 'utf8');
const sandbox = { window: global.window, Math, console, setInterval: () => 0, clearInterval() {} };
vm.createContext(sandbox);
vm.runInContext(src + '\nglobalThis.__sfx = Sfx;', sandbox);
const S = sandbox.__sfx;
S.init();
const calls = ['swing','hit','heavyHit','sever','parry','dash','jump','land','hurt','orb','reflect','kill','wave','select','charge','parryFail'];
for (const c of calls) {
  try { S[c](0.7); } catch (e) { throw new Error('sfx ' + c + ' threw: ' + e.message); }
}
S.setMuted(true);
for (const c of calls) S[c](0.7);
S.setMuted(false);
console.log('audio mock: all', calls.length, 'sounds ran, ready=', S.isReady(), 'muted=', S.isMuted());
console.log('AUDIO OK');
