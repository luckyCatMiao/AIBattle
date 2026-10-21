'use strict';
(function(){
/* ============================================================
   斩骸夜行 —— 00 核心层
   工具 / 全局状态 / 画布 / 相机 / 输入 / 音频合成 / 粒子特效
   ============================================================ */

/* ---------------- 工具 ---------------- */
const TAU = Math.PI * 2, PI = Math.PI;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const eo3 = t => 1 - (1 - t) ** 3;      // easeOutCubic
const ei3 = t => t * t * t;             // easeInCubic
const eo2 = t => 1 - (1 - t) * (1 - t); // easeOutQuad
const sgn = v => (v < 0 ? -1 : 1);
const lerpAng = (a, b, t) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return a + d * t; };
function mkSeed(s){ let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function rr(x, y, w, h, r){ // 圆角矩形路径
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function strokeCap(x1, y1, x2, y2, w, col){ // 圆头粗线（肢体绘制用）
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function inRect(px, py, l, t, r, b){ return px >= l && px <= r && py >= t && py <= b; }

/* ---------------- 世界常量 / 全局状态 ---------------- */
const ARENA_W = 2560;          // 场地宽度（世界单位）
const GROUND_Y = 560;          // 地面（脚底 y）
const G = {
  state: 'title',              // title | play | dead
  time: 0, rtime: 0,           // 模拟时间 / 真实时间
  timeScale: 1, tsTarget: 1, slowmoT: 0,
  hitStop: 0,                  // 命中顿帧（秒，真实时间消耗）
  paused: false,               // 失焦暂停
  combo: 0, comboT: 0, comboShowT: 0,
  gauge: 0, gaugeFull: false,  // 剑气槽
  wave: 0, waveState: 'idle', waveT: 0, pending: [], spawnT: 0,
  kills: 0, maxCombo: 0,
  hits: 0, limbBreaks: 0,      // 真实统计（bench 读取）
  skillUses: { parry: 0, blink: 0, storm: 0, fall: 0, parryWins: 0 },
  moonBoost: 0, flashT: 0, flashCol: '255,235,190',
  enemies: [], hitboxes: [], debris: [], shots: [], shocks: [],
  hurtVig: 0, insightT: 0,
  banner: null,                // {text, sub, t, life}
  running: false,
};

/* ---------------- 画布 ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let DPR = 1, CW = 960, CH = 540, viewScale = 1, viewW = 960, viewH = 540;
function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, window.innerWidth || 960);
  const h = Math.max(240, window.innerHeight || 540);
  canvas.width = Math.max(2, Math.round(w * dpr));
  canvas.height = Math.max(2, Math.round(h * dpr));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  DPR = dpr; CW = w; CH = h;
  // 视野：高度基准 640，窄窗时保证横向至少可见 1000
  viewScale = Math.min(h / 640, w / 1000);
  viewW = w / viewScale; viewH = h / viewScale;
}
window.addEventListener('resize', resize);

/* ---------------- 相机 ---------------- */
const cam = {
  x: 520, y: 470, zoom: 1, zoomP: 0,
  trauma: 0, sx: 0, sy: 0, look: 0, vx: 0,
};
function addShake(a, dirX){ cam.trauma = Math.min(1, cam.trauma + a); if (dirX) cam.shakeDir = dirX; }
cam.shakeDir = 0;
function addZoom(p){ cam.zoomP = Math.max(cam.zoomP, p); }
function doHitStop(d){ G.hitStop = Math.min(0.24, Math.max(G.hitStop, d)); }
function slowmo(dur, scale){ G.slowmoT = Math.max(G.slowmoT, dur); G.tsTarget = scale; }

function updateCamera(dt, rdt){
  const p = P;
  // 前瞻
  const lookTgt = p.facing * 74 + clamp(p.vx * 0.14, -60, 60);
  cam.look += (lookTgt - cam.look) * Math.min(1, rdt * 3.2);
  let tx = p.x + cam.look;
  const halfW = viewW / 2 / (cam.zoom || 1);
  if (ARENA_W > halfW * 2) tx = clamp(tx, halfW - 60, ARENA_W - halfW + 60);
  else tx = ARENA_W / 2;
  cam.x += (tx - cam.x) * Math.min(1, rdt * 7.5);
  // 纵向：跟随玩家高度
  let ty = 468;
  if (p.y < GROUND_Y - 150) ty = 468 - (GROUND_Y - 150 - p.y) * 0.55;
  cam.y += (ty - cam.y) * Math.min(1, rdt * 5);
  // 震屏（创伤平方，快速衰减，克制不连续轰屏）
  cam.trauma = Math.max(0, cam.trauma - rdt * 2.6);
  const amp = cam.trauma * cam.trauma * 26;
  cam.sx = rnd(-1, 1) * amp + cam.shakeDir * amp * 0.4;
  cam.sy = rnd(-1, 1) * amp * 0.8;
  cam.shakeDir *= Math.max(0, 1 - rdt * 10);
  // 变焦冲击
  cam.zoomP = Math.max(0, cam.zoomP - rdt * 3.4);
  cam.zoom = 1 + cam.zoomP * cam.zoomP * 0.07;
}

/* ---------------- 输入 ---------------- */
const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyJ: 'atk', KeyK: 'heavy', KeyL: 'dash', KeyI: 'special',
  KeyR: 'restart', Enter: 'confirm', KeyS: 'down', ArrowDown: 'down',
  KeyW: 'up', ArrowUp: 'up', KeyP: 'pause',
  KeyU: 'parry', KeyO: 'blink', KeyH: 'storm', KeyY: 'fall',
};
const held = {};
const buf = [];   // 输入缓冲 {k, t}
let onKeyHook = null;   // 由 game 层注入（开始/重开等）
let onBlurHook = null;

function pushBuf(k){
  buf.push({ k, t: G.rtime });
  if (buf.length > 30) buf.shift();
}
function consume(k, win){
  win = win || 0.17;
  for (let i = 0; i < buf.length; i++){
    if (buf[i].k === k && G.rtime - buf[i].t <= win){ buf.splice(i, 1); return true; }
  }
  return false;
}
function consumeAny(list, win){
  for (const k of list) if (consume(k, win)) return k;
  return null;
}
function purgeBuf(){
  while (buf.length && G.rtime - buf[0].t > 0.4) buf.shift();
}
function clearKeys(){ for (const k in held) held[k] = false; buf.length = 0; }

window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  unlockAudio();
  if (G.paused && k){ if (onKeyHook) onKeyHook('resume'); }
  if (!k) return;
  if (e.cancelable) e.preventDefault();   // 阻止页面滚动等默认行为
  if (e.repeat) return;
  held[k] = true;
  pushBuf(k);
  if (onKeyHook) onKeyHook(k);
}, { passive: false });
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  if (e.cancelable) e.preventDefault();
  held[k] = false;
}, { passive: false });
window.addEventListener('blur', () => {
  clearKeys();
  if (onBlurHook) onBlurHook();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden){ clearKeys(); if (onBlurHook) onBlurHook(); }
});

/* ---------------- 音频（WebAudio 合成） ---------------- */
let actx = null, master = null, muted = false, audioTried = false, noiseBuf = null;
let ambientStarted = false, sfxThisFrame = 0;

function unlockAudio(){
  if (!audioTried){
    audioTried = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC){
        actx = new AC();
        master = actx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        const comp = actx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 8;
        master.connect(comp); comp.connect(actx.destination);
        const len = Math.floor(actx.sampleRate * 1.2);
        noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
    } catch (err){ actx = null; }
  }
  if (actx && actx.state === 'suspended'){ try { actx.resume(); } catch (err){} }
  if (actx && !ambientStarted) startAmbient();
}
function setMuted(m){
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
function tone(o){
  // {type,f,f2,t,v,delay,attack}
  if (!actx || muted) return;
  try {
    const t0 = actx.currentTime + (o.delay || 0);
    const osc = actx.createOscillator(), g = actx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f || 440), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + (o.t || 0.1));
    const atk = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.2), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.t || 0.1));
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + (o.t || 0.1) + 0.03);
  } catch (err){}
}
function noiz(o){
  // {t,v,f,f2,q,delay,type}
  if (!actx || muted || !noiseBuf) return;
  try {
    const t0 = actx.currentTime + (o.delay || 0);
    const src = actx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const flt = actx.createBiquadFilter();
    flt.type = o.type || 'bandpass';
    flt.frequency.setValueAtTime(Math.max(10, o.f || 1000), t0);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t0 + (o.t || 0.1));
    flt.Q.value = o.q === undefined ? 1 : o.q;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.2), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.t || 0.1));
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + (o.t || 0.1) + 0.05);
  } catch (err){}
}
function sfx(name, a){
  if (!actx || muted) return;
  if (sfxThisFrame > 9) return;
  sfxThisFrame++;
  switch (name){
    case 'swing': noiz({ t: 0.09, v: 0.13, f: 650, f2: 2600, q: 0.9 }); break;
    case 'swingHeavy': noiz({ t: 0.17, v: 0.18, f: 260, f2: 1500, q: 0.8 }); tone({ type: 'triangle', f: 140, f2: 60, t: 0.13, v: 0.1 }); break;
    case 'swingUp': noiz({ t: 0.1, v: 0.12, f: 900, f2: 3200, q: 1.2 }); break;
    case 'hit': tone({ f: 175, f2: 55, t: 0.09, v: 0.3 }); noiz({ t: 0.05, v: 0.2, f: 2400, f2: 700, q: 0.7 }); break;
    case 'hitHeavy': tone({ f: 95, f2: 38, t: 0.2, v: 0.42 }); noiz({ t: 0.11, v: 0.26, f: 900, f2: 180, q: 0.6 }); tone({ type: 'square', f: 230, f2: 90, t: 0.06, v: 0.05 }); break;
    case 'crack': noiz({ t: 0.045, v: 0.3, f: 3400, f2: 1100, q: 0.5 }); tone({ type: 'square', f: 430, f2: 55, t: 0.13, v: 0.15 }); noiz({ t: 0.2, v: 0.11, f: 480, f2: 110, q: 0.7, delay: 0.015 }); break;
    case 'shatter': noiz({ t: 0.05, v: 0.3, f: 3000, f2: 900, q: 0.5 }); tone({ type: 'square', f: 380, f2: 50, t: 0.16, v: 0.14 }); noiz({ t: 0.42, v: 0.2, f: 240, f2: 55, q: 0.5, delay: 0.02 }); tone({ f: 70, f2: 32, t: 0.4, v: 0.32, delay: 0.01 }); break;
    case 'parry': tone({ type: 'triangle', f: 320, f2: 150, t: 0.13, v: 0.1 }); break;
    case 'parryWin': tone({ f: 1560, t: 0.3, v: 0.16 }); tone({ f: 2340, t: 0.36, v: 0.09, delay: 0.02 }); noiz({ t: 0.2, v: 0.1, f: 5000, f2: 9000, q: 0.4 }); break;
    case 'blink': noiz({ t: 0.22, v: 0.17, f: 900, f2: 2600, q: 0.7 }); tone({ f: 220, f2: 70, t: 0.2, v: 0.12 }); break;
    case 'multiCut': noiz({ t: 0.08, v: 0.2, f: 2800, f2: 600, q: 0.6 }); tone({ type: 'square', f: 500, f2: 70, t: 0.1, v: 0.12 }); break;
    case 'storm': noiz({ t: 0.5, v: 0.14, f: 700, f2: 2400, q: 0.6 }); break;
    case 'fallCast': tone({ type: 'triangle', f: 120, f2: 420, t: 0.5, v: 0.09 }); break;
    case 'meteor': tone({ f: 60, f2: 28, t: 0.5, v: 0.55 }); noiz({ t: 0.3, v: 0.3, f: 400, f2: 60, q: 0.5 }); noiz({ t: 0.05, v: 0.3, f: 3200, f2: 900, q: 0.5 }); break;
    case 'dash': noiz({ t: 0.15, v: 0.13, f: 420, f2: 2100, q: 0.8 }); break;
    case 'jump': tone({ type: 'triangle', f: 290, f2: 540, t: 0.09, v: 0.06 }); break;
    case 'land': tone({ f: 130, f2: 55, t: 0.08, v: 0.11 }); noiz({ t: 0.06, v: 0.07, f: 420, f2: 130, q: 0.7 }); break;
    case 'slam': tone({ f: 68, f2: 30, t: 0.34, v: 0.5 }); noiz({ t: 0.2, v: 0.28, f: 300, f2: 60, q: 0.5 }); break;
    case 'draw': tone({ type: 'triangle', f: 170, f2: 470, t: 0.34, v: 0.05 }); break;
    case 'bow': tone({ type: 'triangle', f: 270, f2: 170, t: 0.08, v: 0.11 }); noiz({ t: 0.08, v: 0.1, f: 1900, f2: 500, q: 0.8 }); break;
    case 'insight': tone({ f: 1250, t: 0.2, v: 0.13 }); tone({ f: 1878, t: 0.26, v: 0.07, delay: 0.02 }); noiz({ t: 0.3, v: 0.06, f: 5000, f2: 8000, q: 0.4 }); break;
    case 'hurt': tone({ type: 'square', f: 190, f2: 70, t: 0.13, v: 0.13 }); noiz({ t: 0.09, v: 0.16, f: 800, f2: 200, q: 0.6 }); break;
    case 'charge': tone({ type: 'triangle', f: 90 + (a || 0) * 260, f2: 120 + (a || 0) * 500, t: 0.14, v: 0.05 }); break;
    case 'gauge': tone({ f: 660, t: 0.16, v: 0.09 }); tone({ f: 990, t: 0.22, v: 0.08, delay: 0.07 }); break;
    case 'kill': tone({ f: 140, f2: 42, t: 0.24, v: 0.26 }); noiz({ t: 0.3, v: 0.14, f: 700, f2: 120, q: 0.6 }); break;
    case 'spawn': tone({ type: 'triangle', f: 130, f2: 85, t: 0.09, v: 0.08 }); tone({ type: 'triangle', f: 160, f2: 100, t: 0.08, v: 0.06, delay: 0.09 }); break;
    case 'wave': tone({ f: 82, f2: 46, t: 0.4, v: 0.3 }); noiz({ t: 0.24, v: 0.1, f: 350, f2: 90, q: 0.6 }); break;
    case 'start': tone({ f: 74, f2: 40, t: 0.5, v: 0.4 }); noiz({ t: 0.3, v: 0.16, f: 420, f2: 80, q: 0.6 }); tone({ type: 'triangle', f: 520, f2: 780, t: 0.3, v: 0.05, delay: 0.1 }); break;
    case 'bounce': tone({ type: 'triangle', f: 200, f2: 120, t: 0.06, v: 0.06 }); break;
    case 'death': tone({ f: 200, f2: 40, t: 0.9, v: 0.3, type: 'sawtooth' }); noiz({ t: 0.7, v: 0.2, f: 900, f2: 60, q: 0.4 }); break;
  }
}
function startAmbient(){
  if (!actx || ambientStarted) return;
  ambientStarted = true;
  try {
    // 低频风声
    const src = actx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const flt = actx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = 320; flt.Q.value = 0.4;
    const g = actx.createGain(); g.gain.value = 0.028;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = actx.createGain(); lg.gain.value = 0.014;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(); lfo.start();
  } catch (err){}
  schedulePluck();
}
function schedulePluck(){
  // 偶发的三味线式拨弦（五声音阶），极轻
  try {
    if (actx && !muted && G.state === 'play'){
      const scale = [196, 220, 262, 294, 330, 392, 440];
      const f = pick(scale) * (Math.random() < 0.3 ? 2 : 1);
      tone({ type: 'triangle', f: f, f2: f * 0.995, t: 0.9, v: 0.035, attack: 0.002 });
      tone({ type: 'sine', f: f * 2, t: 0.5, v: 0.012, delay: 0.01 });
    }
  } catch (err){}
  setTimeout(schedulePluck, rnd(2600, 7000));
}

/* ---------------- 粒子 / 浮动文字 ---------------- */
const parts = [];
function spawnP(o){
  if (parts.length > 720) parts.splice(0, 50);
  parts.push(Object.assign({ t: 0, g: 0, drag: 0, rot: 0, vr: 0, kind: 'spark', size: 3, life: 0.5, col: '#fff', alpha: 1 }, o));
}
function sparks(x, y, n, dir, col, sp){
  for (let i = 0; i < n; i++){
    const a = dir !== undefined ? dir + rnd(-0.75, 0.75) : rnd(0, TAU);
    const v = (sp || 340) * rnd(0.35, 1.25);
    spawnP({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rnd(0, 80), g: 420, drag: 2.4,
      life: rnd(0.12, 0.3), size: rnd(1.4, 3.4), col: col || (Math.random() < 0.7 ? '#fff3d8' : '#ffb44d') });
  }
}
function chips(x, y, n, col){
  for (let i = 0; i < n; i++){
    const a = rnd(0, TAU);
    spawnP({ kind: 'chip', x, y, vx: Math.cos(a) * rnd(60, 380), vy: Math.sin(a) * rnd(60, 380) - rnd(40, 190), g: 900, drag: 0.6,
      life: rnd(0.5, 1.1), size: rnd(2, 5.5), rot: rnd(0, TAU), vr: rnd(-14, 14), col: col || '#9c6f4a' });
  }
}
function dust(x, y, n, sc, dir){
  for (let i = 0; i < n; i++){
    const a = dir !== undefined ? rnd(-0.6, 0.6) + (dir > 0 ? 0 : PI) : rnd(0, TAU);
    spawnP({ kind: 'dust', x: x + rnd(-10, 10) * (sc || 1), y: y + rnd(-4, 4), vx: Math.cos(a) * rnd(30, 130) * (sc || 1), vy: -rnd(10, 60) * (sc || 1),
      g: -60, drag: 2.2, life: rnd(0.3, 0.7), size: rnd(5, 13) * (sc || 1), col: '188,196,226' });
  }
}
function ring(x, y, r0, r1, life, col, w){
  spawnP({ kind: 'ring', x, y, r0, r1, life, col: col || '255,240,210', size: w || 3, g: 0 });
}
function flashFx(x, y, r, life, col){
  spawnP({ kind: 'flash', x, y, size: r, life: life || 0.14, col: col || '255,235,190' });
}
function cutLine(x, y, ang, len, life, col){
  spawnP({ kind: 'cut', x, y, rot: ang, size: len, life: life || 0.16, col: col || '#ff4d5e', g: 0 });
}
function ember(x, y, n, col){
  for (let i = 0; i < n; i++){
    spawnP({ kind: 'ember', x, y, vx: rnd(-70, 70), vy: rnd(-140, -20), g: -40, drag: 1.6, life: rnd(0.4, 0.9), size: rnd(1.5, 3), col: col || '#ffc861' });
  }
}
function updateParticles(dt){
  for (let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life){ parts.splice(i, 1); continue; }
    if (p.kind === 'ring' || p.kind === 'cut' || p.kind === 'flash' || p.kind === 'crescent') continue;
    p.vy += (p.g || 0) * dt;
    if (p.drag){ p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'chip' || p.kind === 'shard'){
      p.rot += p.vr * dt;
      if (p.y > GROUND_Y){ p.y = GROUND_Y; p.vy *= -0.4; p.vx *= 0.55; p.vr *= 0.5; if (Math.abs(p.vy) < 40) p.vy = 0; }
    }
  }
}
function drawParticles(){
  for (const p of parts){
    const u = p.t / p.life, al = clamp(1 - u, 0, 1);
    switch (p.kind){
      case 'spark': {
        const l = Math.max(3, Math.hypot(p.vx, p.vy) * 0.045);
        const a = Math.atan2(p.vy, p.vx);
        ctx.globalAlpha = al;
        ctx.strokeStyle = p.col; ctx.lineWidth = p.size * al; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(a) * l, p.y - Math.sin(a) * l); ctx.stroke();
        break;
      }
      case 'chip': case 'shard': {
        ctx.globalAlpha = Math.min(1, al * 1.6);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        const s = p.size;
        ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.lineTo(0, -s); ctx.lineTo(s, -s * 0.3); ctx.lineTo(s * 0.6, s * 0.8); ctx.lineTo(-s * 0.7, s * 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'dust': {
        const r = p.size * (0.6 + u * 0.9);
        ctx.globalAlpha = al * 0.24;
        ctx.fillStyle = 'rgb(' + p.col + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        break;
      }
      case 'ring': {
        const r = lerp(p.r0, p.r1, eo3(u));
        ctx.globalAlpha = al * 0.8;
        ctx.strokeStyle = 'rgba(' + p.col + ',' + al + ')';
        ctx.lineWidth = p.size * al + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, r), 0, TAU); ctx.stroke();
        break;
      }
      case 'flash': {
        ctx.globalAlpha = al * 0.85;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, p.size * (0.5 + u)));
        grad.addColorStop(0, 'rgba(' + p.col + ',' + (al * 0.9) + ')');
        grad.addColorStop(1, 'rgba(' + p.col + ',0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + u), 0, TAU); ctx.fill();
        break;
      }
      case 'cut': {
        ctx.globalAlpha = al;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const lg = ctx.createLinearGradient(-p.size / 2, 0, p.size / 2, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(0.5, p.col);
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = lg; ctx.lineWidth = 2.6 * al + 0.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-p.size / 2, 0); ctx.lineTo(p.size / 2, 0); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'ember': {
        ctx.globalAlpha = al * 0.9;
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + al * 0.6), 0, TAU); ctx.fill();
        break;
      }
      case 'crescent': {
        // 满月斩的月牙刀气
        const grow = eo3(Math.min(1, u * 1.6));
        const R = p.size * grow, fade = u < 0.7 ? 1 : (1 - u) / 0.3;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * 0.9;
        const cg = ctx.createLinearGradient(-R, -R, R, R);
        cg.addColorStop(0, 'rgba(255,240,220,0.95)');
        cg.addColorStop(0.5, p.col);
        cg.addColorStop(1, 'rgba(255,110,120,0.1)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(0, 0, R, -PI * 0.42, PI * 0.42);
        ctx.arc(R * 0.42, 0, R * 0.86, PI * 0.36, -PI * 0.36, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

const texts = [];
function addText(x, y, str, col, size, vy, life){
  texts.push({ x, y, str, col: col || '#fff', size: size || 18, vy: vy === undefined ? -46 : vy, t: 0, life: life || 0.8, scale: 0 });
}
function addDmg(x, y, n, big){
  texts.push({ x: x + rnd(-8, 8), y, str: '' + n, col: big ? '#ffd76a' : '#f4e9d8', size: big ? 21 : 14, vy: -60, t: 0, life: big ? 0.85 : 0.6, scale: 0, dmg: true });
}
function updateTexts(dt){
  for (let i = texts.length - 1; i >= 0; i--){
    const t = texts[i];
    t.t += dt; t.y += t.vy * dt; t.vy += 90 * dt;
    if (t.t >= t.life) texts.splice(i, 1);
  }
}
function drawTexts(){
  for (const t of texts){
    const u = t.t / t.life;
    const al = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
    const sc = t.t < 0.12 ? eo3(t.t / 0.12) * (t.dmg ? 1.25 : 1.15) : (t.dmg ? 1 : 1);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(al, 0, 1);
    ctx.font = '700 ' + t.size + 'px "Songti SC","STSong","SimSun",Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(t.str, 1.5, 1.5);
    ctx.fillStyle = t.col;
    ctx.fillText(t.str, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
