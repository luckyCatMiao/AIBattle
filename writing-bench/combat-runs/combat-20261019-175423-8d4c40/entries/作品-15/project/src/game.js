const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const sign = (v, fallback = 1) => Math.sign(v) || fallback;
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const FLOOR = 555, WORLD = 2750, GRAVITY = 1750;
let W = 1280, H = 720, dpr = 1, scale = 1;
let mode = 'title', now = 0, worldTime = 0, freeze = 0, shake = 0;
let enemies = [], particles = [], slashes = [], debris = [], texts = [], ghosts = [];
let player, camera = { x: 650, target: 650 }, wave = 1, waveWait = 0, spawnQueue = [];
let hitCount = 0, limbBreakCount = 0, kills = 0, combo = 0, comboTimer = 0, bestCombo = 0;
let noticeTimer = 0, toastTimer = 0, deathTimer = 0, attackSerial = 0, enemySerial = 0;
const keys = new Set(), pressed = new Set();
const input = { attack: null, jump: 0, dash: 0, special: 0, skill: null };
let releasedK = false, frameCost = 0;
const gameKeys = new Set(['KeyA','KeyD','ArrowLeft','ArrowRight','Space','KeyJ','KeyK','KeyL','KeyI','KeyQ','KeyE','KeyU','KeyO','KeyR','Enter','Escape']);

const attacks = {
  cut1: { dur: .32, wind: .065, end: .15, cancel: .17, damage: 17, reach: 115, height: 108, force: 170, stop: .048, limb: 7, pose: 'cut1' },
  cut2: { dur: .34, wind: .075, end: .17, cancel: .19, damage: 21, reach: 125, height: 118, force: 210, stop: .060, limb: 10, pose: 'cut2' },
  cut3: { dur: .48, wind: .13, end: .25, cancel: .32, damage: 33, reach: 151, height: 128, force: 380, stop: .085, limb: 23, pose: 'cut3' },
  heavy: { dur: .56, wind: .14, end: .29, cancel: .39, damage: 39, reach: 143, height: 135, force: 380, stop: .09, limb: 26, pose: 'heavy' },
  charged: { dur: .69, wind: .12, end: .31, cancel: .48, damage: 66, reach: 183, height: 151, force: 530, stop: .125, limb: 65, pose: 'heavy' },
  lift: { dur: .49, wind: .09, end: .23, cancel: .28, damage: 22, reach: 130, height: 165, force: 110, stop: .073, limb: 10, launch: -690, pose: 'lift' },
  air1: { dur: .29, wind: .05, end: .15, cancel: .16, damage: 20, reach: 133, height: 128, force: 90, stop: .055, limb: 12, pose: 'cut1' },
  air2: { dur: .35, wind: .08, end: .2, cancel: .22, damage: 28, reach: 145, height: 142, force: 200, stop: .075, limb: 18, pose: 'cut2' },
  slam: { dur: .75, wind: .09, end: .66, cancel: .7, damage: 44, reach: 125, height: 160, force: 370, stop: .105, limb: 62, pose: 'slam' }
};
function makePlayer() {
  return { x: 950, y: FLOOR, vx: 0, vy: 0, dir: 1, hp: 120, maxHp: 120, core: 100,
    onGround: true, coyote: .1, airJump: true, action: 'idle', t: 0, attack: null,
    chain: 0, chainTime: 0, airChain: 0, charge: 0, chargeReady: false, invuln: 0,
    dashCD: 0, dashT: 0, hurtT: 0, landT: 0, trailT: 0, hitFlash: 0, dead: false,
    comboAssist: 0, perfect: false, slamLanded: false, prevY: FLOOR,
    skill: null, skillCD: { vortex: 0, pierce: 0, orbit: 0, verdict: 0 },
    skillUses: { vortex: 0, pierce: 0, orbit: 0, verdict: 0 } };
}
function reset(start = true) {
  player = makePlayer(); enemies = []; particles = []; slashes = []; debris = []; texts = []; ghosts = [];
  resetSkills();
  hitCount = limbBreakCount = kills = combo = bestCombo = 0; comboTimer = 0; wave = 1; waveWait = 0;
  spawnQueue = []; freeze = shake = worldTime = 0; deathTimer = 0; camera.x = player.x - W * .39;
  camera.target = camera.x; clearInput();
  spawnEnemy('reaver', 1190, 1.1); spawnEnemy('lancer', 1510, 1.5); spawnEnemy('reaver', 680, 1.9);
  mode = start ? 'playing' : 'title';
  $('startScreen').classList.toggle('hidden', start); $('deathScreen').classList.add('hidden'); $('pauseScreen').classList.add('hidden');
  if (start) { audio.unlock(); audio.play('wave'); notify('第一轮 · 熔炉苏醒', 'THE CINDER FOUNDRY', 'J 连斩 · 蓄力 K 断臂 · I 挑空 → 空中 K 断腿', 3.2); }
  updateHUD();
}
function spawnEnemy(type, x, delay = .5) {
  enemies.push({ id: ++enemySerial, type, x: clamp(x, 80, WORLD - 80), y: FLOOR, vx: 0, vy: 0,
    dir: x > player.x ? -1 : 1, hp: type === 'lancer' ? 166 : 128, maxHp: type === 'lancer' ? 166 : 128,
    state: 'spawn', t: 0, cooldown: delay, stun: 0, flash: 0, arm: true, leg: true,
    armHP: type === 'lancer' ? 49 : 43, legHP: 53, dead: false, deathT: 0, hit: false,
    attackDir: 1, land: 0, mark: 0, rag: 0, seed: rand(0, TAU), retreat: 0, perfectTagged: false });
}
function clearInput() {
  keys.clear(); pressed.clear(); input.attack = null; input.skill = null; input.jump = input.dash = input.special = 0; releasedK = true;
}
function notify(main, en = '', sub = '', duration = 2) {
  $('noticeMain').textContent = main; $('noticeEn').textContent = en; $('noticeSub').textContent = sub;
  noticeTimer = duration; $('notice').classList.add('active');
}
function toast(message) { $('toast').textContent = message; toastTimer = 1.8; $('toast').classList.add('show'); }
function pause() {
  if (mode !== 'playing') return;
  mode = 'paused'; clearInput(); $('pauseScreen').classList.remove('hidden');
}
function resume() {
  if (mode !== 'paused') return;
  mode = 'playing'; clearInput(); $('pauseScreen').classList.add('hidden'); audio.unlock();
}
window.addEventListener('keydown', e => {
  if (gameKeys.has(e.code)) e.preventDefault();
  audio.unlock();
  if (e.code === 'Enter' && !e.repeat) {
    if (mode === 'title' || mode === 'dead') reset(true); else if (mode === 'paused') resume();
    return;
  }
  if (e.code === 'KeyR' && !e.repeat) { reset(true); return; }
  if (e.code === 'Escape' && !e.repeat) { mode === 'paused' ? resume() : pause(); return; }
  if (mode !== 'playing') return;
  if (!keys.has(e.code)) {
    pressed.add(e.code);
    if (e.code === 'KeyJ') input.attack = { type: 'light', until: now + .23 };
    if (e.code === 'KeyK') { releasedK = false; input.attack = { type: 'heavy', until: now + .26 }; }
    if (e.code === 'Space') input.jump = now + .19;
    if (e.code === 'KeyL') input.dash = now + .2;
    if (e.code === 'KeyI') input.special = now + .25;
    if (skillKeys[e.code]) input.skill = { name: skillKeys[e.code], until: now + .42 };
  }
  keys.add(e.code);
});
window.addEventListener('keyup', e => { if (gameKeys.has(e.code)) e.preventDefault(); keys.delete(e.code); if (e.code === 'KeyK') releasedK = true; });
window.addEventListener('blur', () => { clearInput(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
$('startBtn').onclick = () => reset(true); $('restartBtn').onclick = () => reset(true); $('resumeBtn').onclick = resume;
$('pauseBtn').onclick = () => mode === 'paused' ? resume() : pause();
$('muteBtn').onclick = () => { audio.unlock(); const muted = audio.toggle(); $('muteBtn').textContent = muted ? '声音 OFF' : '声音 ON'; $('muteBtn').setAttribute('aria-pressed', String(muted)); };
Object.defineProperty(window, 'combatBenchState', { configurable: false, writable: false, value: () => ({
  ready: true, playerAlive: !!player && !player.dead, enemyCount: enemies.filter(e => !e.dead).length,
  hitCount, limbBreakCount, playing: mode === 'playing'
}) });

function puff(x, y, count = 7, color = '#c7b890', speed = 110) {
  for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-speed, speed), vy: rand(-speed, 15), life: rand(.25, .6), max: .6, size: rand(1, 4), color, gravity: 200, kind: 'dust' });
}
function sparks(x, y, dir, power = 1, color = '#ffd79b') {
  for (let i = 0; i < 13 + power * 6; i++) {
    const a = rand(-1.1, 1.1) + (dir < 0 ? Math.PI : 0), s = rand(90, 420) * power;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, life: rand(.12, .4), max: .4, size: rand(1, 2.5), color, gravity: 600, kind: 'spark' });
  }
  particles.push({ x, y, vx: 0, vy: 0, life: .1, max: .1, size: 25 * power, color: '#fff3ca', gravity: 0, kind: 'star' });
}
function impact(stop, amount) { freeze = Math.max(freeze, stop); shake = Math.max(shake, amount); }
function floatText(x, y, text, color = '#f6d19c', size = 16) { texts.push({ x, y, text, color, size, life: .8, max: .8, vy: -38 }); }
function breakLimb(e, which, dir) {
  if (!e[which]) return;
  e[which] = false; limbBreakCount++; e.mark = 1.7;
  const arm = which === 'arm';
  const pose = enemyPose(e), joints = skeleton(pose, e, false);
  const origin = arm ? joints.shoulder : joints.hip;
  const mid = arm ? joints.elbowF : joints.kneeF;
  const tip = arm ? joints.handF : joints.footF;
  const points = [origin, mid, tip].map(p => [(p[0] - origin[0]) * e.dir, p[1] - origin[1]]);
  debris.push({ x: e.x + origin[0] * e.dir, y: e.y + origin[1], vx: dir * rand(220, 380), vy: rand(-530, -370),
    r: 0, vr: dir * rand(5, 11), life: 7, type: arm ? 'arm' : 'leg', points,
    weapon: arm && e.type === 'lancer', swordAngle: pose.sword, color: e.type === 'lancer' ? '#84999c' : '#af7257', bounced: false });
  sparks(e.x + origin[0] * e.dir, e.y + origin[1], dir, 1.15, '#ffd3a0');
  audio.play('break'); impact(.105, 6);
  floatText(e.x, e.y - 135, arm ? '断臂 · 武装解除' : '断腿 · 机动受损', '#f5b279', 12);
  if (arm) { e.state = 'stun'; e.stun = .75; }
  else { e.state = 'stun'; e.stun = .65; e.vx += dir * 130; e.vy = Math.min(e.vy, -160); }
}
function damageEnemy(e, a, damageScale = 1, source = null) {
  if (e.dead) return;
  const p = player, dir = source?.dir ?? p.dir;
  const power = a.power ?? (a === attacks.charged ? 1.45 : a === attacks.slam ? 1.25 : .85);
  e.hp -= Math.round(a.damage * damageScale); hitCount++; combo++; bestCombo = Math.max(bestCombo, combo); comboTimer = 3.2;
  if (!source && p.attack && a.pose !== 'slam') p.t = Math.max(p.t, a.wind + (a.end - a.wind) * .62);
  e.flash = .11; e.stun = a.launch ? .95 : .28 + power * .12; e.state = 'stun'; e.t = 0;
  e.vx = dir * a.force;
  if (a.launch) e.vy = e.leg ? a.launch : a.launch * .87;
  else if (!source && !p.onGround && a !== attacks.slam) { e.vy = -100; e.stun = .7; p.vy = -105; }
  else if (a === attacks.slam || a.part === 'leg') e.vy = -150;
  else if (a === attacks.charged || a === attacks.cut3) e.vy = Math.min(e.vy, -150);
  p.core = Math.min(100, p.core + (source ? 3 : a === attacks.charged ? 13 : 7));
  const y = source ? e.y - (e.leg ? 59 : 38) : clamp(p.y - 63, e.y - 90, e.y - 25);
  sparks(e.x - dir * 8, y, dir, power, a.color ?? '#ffd79b');
  slashes.push({ x: e.x, y, dir, kind: 'impact', life: .16, max: .16, size: 46 * power, angle: rand(-.9, .9) });
  impact(a.stop, a.shake ?? (a === attacks.charged || a === attacks.slam ? 6 : a === attacks.cut3 ? 4 : 2.2));
  audio.play(a.stop > .08 ? 'crush' : 'hit', power);
  const part = a.part ?? (a === attacks.slam ? 'leg' : 'arm');
  if (e[part]) {
    e[part + 'HP'] -= a.limb;
    if (e[part + 'HP'] <= 0) breakLimb(e, part, dir);
  } else if (e.leg && (a === attacks.charged || a === attacks.cut3)) {
    e.legHP -= a.limb * .8; if (e.legHP <= 0) breakLimb(e, 'leg', dir);
  }
  if (e.hp <= 0) killEnemy(e, dir, a);
}
function killEnemy(e, dir, a) {
  e.dead = true; e.deathT = 0; e.state = 'dead'; kills++; e.vx = dir * (a.force + 100); e.vy = Math.min(e.vy, -260);
  if (a === attacks.charged && e.arm) breakLimb(e, 'arm', dir);
  puff(e.x, e.y - 45, 17, '#273f42', 180); sparks(e.x, e.y - 60, dir, 1, '#f0a068'); audio.play('kill');
  player.core = Math.min(100, player.core + 12);
  if (kills % 4 === 0 && player.hp > 0) { player.hp = Math.min(120, player.hp + 12); floatText(player.x, player.y - 125, '+12 修复', '#a4d5b7', 12); }
}
function hurtPlayer(e, damage) {
  const p = player;
  if (p.dead || p.invuln > 0) {
    if (p.action === 'dash' && !e.perfectTagged) {
      e.perfectTagged = true; p.core = Math.min(100, p.core + 15); audio.play('perfect');
      floatText(p.x, p.y - 120, '擦身 · 磁核 +15', '#a4e6e1', 12); sparks(p.x, p.y - 50, p.dir, .65, '#b1eeec');
    }
    return;
  }
  p.hp = Math.max(0, p.hp - damage); p.invuln = 1.05; p.hurtT = .26; p.hitFlash = .16;
  p.action = 'hurt'; p.attack = null; p.skill = null; p.vx = e.attackDir * 290; p.vy = -160;
  p.charge = 0; p.chargeReady = false; p.chain = 0; comboTimer = Math.min(comboTimer, .6);
  sparks(p.x, p.y - 60, e.attackDir, .8, '#ff9779'); impact(.07, 5); audio.play('hurt');
  if (p.hp <= 0) { p.dead = true; p.action = 'dead'; deathTimer = .9; p.vy = -300; }
}
function nearestFront(range = 220) {
  let nearest = null, dist = range;
  for (const e of enemies) if (!e.dead && e.state !== 'spawn' && Math.abs(e.y - player.y) < 130) {
    const dx = e.x - player.x;
    if (Math.abs(dx) < dist && (dx * player.dir > -30 || !keys.has('KeyA') && !keys.has('KeyD') && !keys.has('ArrowLeft') && !keys.has('ArrowRight'))) { nearest = e; dist = Math.abs(dx); }
  }
  return nearest;
}
function beginAttack(name) {
  const p = player, a = attacks[name];
  p.action = 'attack'; p.skill = null; p.t = 0; p.attack = { name, a, id: ++attackSerial, hit: new Set(), swung: false };
  p.slamLanded = false;
  if (name === 'slam') { p.vy = -100; p.vx *= .3; }
  else if (p.onGround) {
    const target = nearestFront(a.reach + 90);
    if (target) { p.dir = sign(target.x - p.x, p.dir); p.comboAssist = clamp(Math.abs(target.x - p.x) - 75, 0, 65); }
    else p.comboAssist = 0;
    p.vx = p.dir * (name === 'charged' ? 160 : name === 'cut3' ? 190 : 95);
  }
  if (name === 'lift') { p.core -= 30; audio.play('lift'); }
  if (name === 'charged') { p.charge = 0; p.chargeReady = false; }
}
function beginDash() {
  const p = player;
  if (p.dead || p.dashCD > 0 || p.hurtT > .12 || p.action === 'skill' && p.skill?.name === 'verdict' && p.skill.t < .59) return false;
  const move = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (move) p.dir = move;
  p.skill = null; p.action = 'dash'; p.t = 0; p.dashT = .19; p.dashCD = .48; p.invuln = Math.max(p.invuln, .24);
  p.attack = null; p.charge = 0; p.vy *= .3; p.vx = p.dir * 830; audio.play('dash');
  puff(p.x - p.dir * 12, p.y - 5, 9, '#88b8b6', 80); return true;
}
function doJump() {
  const p = player;
  if (p.coyote > 0 || p.airJump) {
    const double = p.coyote <= 0;
    if (double) p.airJump = false;
    p.vy = double ? -560 : -650; p.onGround = false; p.coyote = 0;
    if (p.action !== 'attack' || p.t > p.attack.a.cancel) { p.action = 'idle'; p.attack = null; p.skill = null; }
    puff(p.x, p.y, double ? 9 : 6, '#9cb4ac', 100); audio.play('jump'); input.jump = 0; return true;
  }
  return false;
}
function updatePlayer(dt) {
  const p = player; p.prevY = p.y;
  if (input.attack && input.attack.until <= now) input.attack = null;
  p.invuln = Math.max(0, p.invuln - dt); p.dashCD = Math.max(0, p.dashCD - dt); p.hurtT = Math.max(0, p.hurtT - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt); p.landT = Math.max(0, p.landT - dt); p.chainTime -= dt;
  if (p.chainTime <= 0) p.chain = 0;
  if (p.dead) { physicsPlayer(dt); return; }
  p.core = Math.min(100, p.core + dt * 5.5);
  const move = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let canAct = p.action === 'idle' || p.action === 'run' || p.action === 'attack' && p.t >= p.attack.a.cancel || p.action === 'dash' && p.t > .14 || p.action === 'skill' && p.skill && p.skill.t >= skillDefs[p.skill.name].cancel;
  if (input.skill && input.skill.until <= now) input.skill = null;
  if (input.skill && p.hurtT <= .12 && (canAct || p.action === 'charge' || p.action === 'attack' && p.t >= p.attack.a.wind + .055)) {
    const name = input.skill.name; input.skill = null;
    if (beginSkill(name)) canAct = false;
  }
  if (input.dash > now && p.action !== 'charge' && beginDash()) { input.dash = 0; canAct = false; }
  if (p.action === 'charge' && input.dash > now && beginDash()) input.dash = 0;
  if (input.jump > now && p.hurtT <= 0 && p.action !== 'charge' && p.action !== 'dash' && (canAct || p.attack?.name === 'lift' && p.t > .17)) doJump();
  if (canAct && input.special > now) {
    input.special = 0;
    if (p.core >= 30) { beginAttack('lift'); canAct = false; }
    else toast('磁核不足 · 命中可快速恢复');
  }
  if (canAct && input.attack && input.attack.until > now) {
    const type = input.attack.type; input.attack = null;
    if (type === 'heavy') {
      if (!p.onGround) beginAttack('slam');
      else { p.action = 'charge'; p.attack = null; p.charge = 0; p.t = 0; p.chargeReady = false; releasedK = !keys.has('KeyK'); audio.play('charge'); }
    } else {
      const name = p.onGround ? ['cut1','cut2','cut3'][p.chain % 3] : ['air1','air2'][p.airChain++ % 2];
      beginAttack(name); p.chain = (p.chain + 1) % 3; p.chainTime = .8;
    }
    canAct = false;
  }
  if (canAct && keys.has('KeyJ') && !input.attack && p.hurtT <= 0) {
    const name = p.onGround ? ['cut1','cut2','cut3'][p.chain % 3] : ['air1','air2'][p.airChain++ % 2];
    beginAttack(name); p.chain = (p.chain + 1) % 3; p.chainTime = .8; canAct = false;
  }
  if (p.action === 'skill') {
    updateSkillAction(dt);
    if (p.action === 'skill') return;
  }
  if (p.action === 'charge') {
    p.charge += dt; p.t += dt; p.vx *= Math.exp(-dt * 18);
    if (move) p.dir = move;
    if (p.charge >= .48 && !p.chargeReady) { p.chargeReady = true; audio.play('ready'); sparks(p.x + p.dir * 8, p.y - 74, p.dir, .4, '#a5eff1'); }
    if (releasedK || !keys.has('KeyK') || p.charge > 1.45) { const charged = p.charge >= .48; releasedK = false; beginAttack(charged ? 'charged' : 'heavy'); }
  } else if (p.action === 'dash') {
    p.t += dt; p.dashT -= dt; p.vx = p.dir * 830;
    if (p.t % .035 < dt) ghosts.push({ x: p.x, y: p.y, dir: p.dir, pose: playerPose(), life: .2, max: .2 });
    if (p.dashT <= 0) { p.action = 'idle'; p.vx *= .35; }
  } else if (p.action === 'attack') {
    p.t += dt; const at = p.attack, a = at.a;
    if (p.onGround) p.vx *= Math.exp(-dt * 8);
    else if (at.name !== 'slam') p.vx = lerp(p.vx, move * 270, 1 - Math.exp(-dt * 5));
    if (p.t < a.wind && p.comboAssist > 0 && p.onGround) {
      const step = Math.min(p.comboAssist, dt * 480); p.x += p.dir * step; p.comboAssist -= step;
    }
    if (p.t >= a.wind && !at.swung) {
      at.swung = true; audio.play(at.name === 'charged' || at.name === 'heavy' || at.name === 'slam' ? 'heavy' : 'swing');
      slashes.push({ x: p.x, y: p.y - 59, dir: p.dir, kind: at.name, life: .18, max: .18, size: a.reach });
      if (at.name === 'lift') { p.vy = -550; p.onGround = false; p.airJump = true; }
      if (at.name === 'slam') p.vy = 1080;
      if (at.name === 'charged') { p.vx = p.dir * 490; puff(p.x, p.y - 5, 8); }
    }
    if (p.t >= a.wind && p.t <= a.end) {
      for (const e of enemies) {
        if (e.dead || e.state === 'spawn' || at.hit.has(e.id)) continue;
        const dx = (e.x - p.x) * p.dir, ey = e.y - (e.leg ? 55 : 35), py = p.y - 57;
        const vertical = at.name === 'slam' ? ey > py - 70 && ey < py + 130 : Math.abs(ey - py) < a.height * .55 + 36;
        if (dx > -36 && dx < a.reach + 21 && vertical) { at.hit.add(e.id); damageEnemy(e, a); }
      }
    }
    if (at.name === 'slam' && p.onGround && at.swung && !p.slamLanded) landSlam();
    if (p.t >= a.dur && !(at.name === 'slam' && !p.onGround)) { p.action = 'idle'; p.attack = null; }
  } else if (p.hurtT > 0) { p.action = 'hurt'; p.vx *= Math.exp(-dt * 4); }
  else {
    p.action = move ? 'run' : 'idle';
    if (move) p.dir = move;
    p.vx = lerp(p.vx, move * 325, 1 - Math.exp(-dt * (p.onGround ? 24 : 10)));
    if (p.action === 'run' && p.onGround && Math.random() < dt * 12) puff(p.x - p.dir * 13, FLOOR - 2, 1, '#8c9b8a', 35);
  }
  physicsPlayer(dt);
  if (p.action === 'attack' && p.attack?.name === 'slam' && p.onGround && p.attack.swung && !p.slamLanded) landSlam();
}
function physicsPlayer(dt) {
  const p = player;
  if (!p.onGround) p.coyote = Math.max(0, p.coyote - dt); else p.coyote = .1;
  p.x = clamp(p.x + p.vx * dt, 55, WORLD - 55);
  if (p.action !== 'dash') p.vy += GRAVITY * dt * (p.action === 'attack' && !p.onGround && p.attack?.name !== 'slam' ? .58 : 1);
  p.y += p.vy * dt;
  if (p.y >= FLOOR) {
    const falling = p.vy;
    if (!p.onGround && falling > 200) { p.landT = .16; puff(p.x, FLOOR, falling > 800 ? 18 : 7, '#c8c19d', falling > 800 ? 200 : 90); audio.play('land'); }
    p.y = FLOOR; p.vy = 0; p.onGround = true; p.airJump = true; p.airChain = 0;
  } else p.onGround = false;
}
function landSlam() {
  const p = player, at = p.attack;
  p.slamLanded = true; p.t = Math.max(p.t, .53); p.vx = 0;
  slashes.push({ x: p.x + p.dir * 35, y: FLOOR - 4, dir: p.dir, kind: 'ground', life: .35, max: .35, size: 160 });
  puff(p.x + p.dir * 35, FLOOR, 24, '#b6b897', 240); audio.play('crush'); shake = Math.max(shake, 3.5);
  for (const e of enemies) if (!e.dead && e.state !== 'spawn' && !at.hit.has(e.id) && Math.abs(e.x - p.x - p.dir * 35) < 150 && Math.abs(e.y - FLOOR) < 100) {
    at.hit.add(e.id); damageEnemy(e, attacks.slam);
  }
}
function updateEnemies(dt) {
  let attackers = enemies.filter(e => e.state === 'windup' || e.state === 'strike').length;
  for (const e of enemies) {
    e.t += dt; e.flash = Math.max(0, e.flash - dt); e.mark = Math.max(0, e.mark - dt); e.land = Math.max(0, e.land - dt);
    if (e.dead) { e.deathT += dt; e.rag += dt * 2.3; enemyPhysics(e, dt); continue; }
    e.cooldown -= dt;
    const dx = player.x - e.x, dist = Math.abs(dx);
    if (e.state === 'spawn') {
      if (e.t > .58) { e.state = 'approach'; e.t = 0; }
    } else if (e.stun > 0) {
      e.stun -= dt; e.state = 'stun'; e.vx *= Math.exp(-dt * 4.8);
      if (e.stun <= 0 && e.y >= FLOOR - 1) { e.state = 'approach'; e.cooldown = Math.max(e.cooldown, .35); }
    } else if (e.y < FLOOR - 3) {
      e.vx *= Math.exp(-dt * 2);
    } else if (e.state === 'windup') {
      e.vx *= Math.exp(-dt * 18);
      const wind = e.type === 'lancer' && e.arm ? .72 : e.arm ? .58 : .48;
      if (e.t < wind * .58) { e.dir = sign(dx, e.dir); e.attackDir = e.dir; }
      if (e.t >= wind) {
        e.state = 'strike'; e.t = 0; e.hit = false;
        e.vx = e.attackDir * (e.type === 'lancer' && e.arm ? (e.leg ? 620 : 270) : e.arm ? 310 : 230);
        slashes.push({ x: e.x, y: e.y - 57, dir: e.attackDir, kind: 'enemy', life: .18, max: .18, size: e.arm && e.type === 'lancer' ? 128 : 83 });
        audio.play('swing');
      }
    } else if (e.state === 'strike') {
      if (e.t < .17) {
        const reach = e.type === 'lancer' && e.arm ? 129 : e.arm ? 83 : 57;
        const forward = (player.x - e.x) * e.attackDir;
        if (!e.hit && forward > -20 && forward < reach + 16 && Math.abs((player.y - 48) - (e.y - (e.leg ? 55 : 32))) < 63) {
          e.hit = true; hurtPlayer(e, e.arm ? e.type === 'lancer' ? 22 : 17 : 10);
        }
      }
      e.vx *= Math.exp(-dt * 9);
      if (e.t > .24) { e.state = 'recover'; e.t = 0; }
    } else if (e.state === 'recover') {
      e.vx *= Math.exp(-dt * 15);
      if (e.t > (e.arm ? .58 : .42)) { e.state = 'approach'; e.cooldown = rand(.55, .95); }
    } else {
      e.state = 'approach'; e.dir = sign(dx, e.dir);
      const reach = e.type === 'lancer' && e.arm ? 170 : e.arm ? 88 : 64;
      const speed = (e.type === 'lancer' ? 153 : 183) * (e.leg ? 1 : .31);
      const blocking = enemies.some(other => other !== e && !other.dead && other.y > FLOOR - 5 && (other.x - e.x) * e.dir > 0 && Math.abs(other.x - e.x) < 53 && Math.abs(other.x - player.x) < dist);
      let targetSpeed = dist > reach * .87 ? speed * e.dir : 0;
      if (blocking) targetSpeed *= .22;
      if (player.dead) targetSpeed = 0;
      e.vx = lerp(e.vx, targetSpeed, 1 - Math.exp(-dt * 10));
      if (dist < reach + 22 && e.cooldown <= 0 && attackers < 2 && !player.dead && Math.abs(player.y - e.y) < 160) {
        e.state = 'windup'; e.t = 0; e.attackDir = e.dir; e.perfectTagged = false; attackers++;
      }
    }
    enemyPhysics(e, dt);
  }
  enemies = enemies.filter(e => !e.dead || e.deathT < 1.8);
}
function enemyPhysics(e, dt) {
  e.x = clamp(e.x + e.vx * dt, 45, WORLD - 45); e.vy += GRAVITY * dt;
  e.y += e.vy * dt;
  if (e.y >= FLOOR) {
    if (e.vy > 400) { puff(e.x, FLOOR, 8, '#bcae8b', 120); e.land = .18; if (!e.dead) audio.play('land'); }
    e.y = FLOOR; e.vy = 0;
    if (e.dead) e.vx *= Math.exp(-dt * 7);
  }
}
function updateWaves(dt) {
  for (let i = spawnQueue.length - 1; i >= 0; i--) {
    spawnQueue[i].t -= dt;
    if (spawnQueue[i].t <= 0) {
      const s = spawnQueue.splice(i, 1)[0], side = s.side;
      const x = player.x + side * rand(290, 500);
      spawnEnemy(s.type, x, .9);
    }
  }
  if (!enemies.some(e => !e.dead) && !spawnQueue.length) {
    waveWait += dt;
    if (waveWait > 1.25) {
      wave++; waveWait = 0; player.hp = Math.min(120, player.hp + 18); player.core = Math.min(100, player.core + 25);
      const count = Math.min(5, 3 + Math.floor(wave / 3));
      for (let i = 0; i < count; i++) spawnQueue.push({ t: i * .45, type: (i + wave) % 3 === 0 ? 'lancer' : 'reaver', side: i % 2 ? -1 : 1 });
      notify('第 ' + String(wave).padStart(2, '0') + ' 轮 · 锈潮再临', 'REASSEMBLED / RELOADED', '装甲修复 +18 · 磁核补充 +25', 2.4); audio.play('wave');
    }
  }
}
function updateEffects(dt, frozen = false) {
  const fxdt = frozen ? dt * .25 : dt;
  for (const p of particles) { p.life -= fxdt; p.x += p.vx * fxdt; p.y += p.vy * fxdt; p.vy += p.gravity * fxdt; p.vx *= Math.exp(-fxdt * 1.2); }
  particles = particles.filter(p => p.life > 0).slice(-700);
  for (const s of slashes) s.life -= fxdt;
  slashes = slashes.filter(s => s.life > 0);
  for (const g of ghosts) g.life -= fxdt;
  ghosts = ghosts.filter(g => g.life > 0);
  for (const t of texts) { t.life -= dt; t.y += t.vy * dt; }
  texts = texts.filter(t => t.life > 0);
  if (!frozen) for (const d of debris) {
    d.life -= dt; d.vy += GRAVITY * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.vr * dt;
    if (d.y > FLOOR - 6) {
      d.y = FLOOR - 6;
      if (Math.abs(d.vy) > 90) { d.vy *= -.32; d.vx *= .65; d.vr *= .45; if (!d.bounced) { puff(d.x, FLOOR, 5); d.bounced = true; } }
      else { d.vy = 0; d.vx *= Math.exp(-dt * 5); d.vr *= Math.exp(-dt * 5); }
    }
  }
  debris = debris.filter(d => d.life > 0).slice(-40);
  shake *= Math.exp(-dt * 19);
  if (noticeTimer > 0) { noticeTimer -= dt; if (noticeTimer <= 0) $('notice').classList.remove('active'); }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
}
function updateHUD() {
  updateSkillHUD();
  const p = player;
  $('hpFill').style.width = $('hpGhost').style.width = (p.hp / 120 * 100) + '%';
  $('hpText').textContent = Math.ceil(p.hp) + ' / 120'; $('coreFill').style.width = p.core + '%'; $('coreText').textContent = Math.floor(p.core);
  $('waveText').textContent = '第 ' + String(wave).padStart(2, '0') + ' 轮';
  $('enemyText').textContent = enemies.filter(e => !e.dead).length + ' 个信号';
  $('combo').classList.toggle('hidden', combo < 2 || comboTimer <= 0);
  $('comboNum').textContent = combo;
  $('comboRank').textContent = combo >= 30 ? '精 密 拆 解' : combo >= 15 ? '钢 铁 风 暴' : combo >= 7 ? '势 不 可 挡' : '保 持 压 制';
}
function update(dt) {
  if (mode === 'playing') {
    if (freeze > 0) { freeze = Math.max(0, freeze - dt); updateEffects(dt, true); return; }
    worldTime += dt; updatePlayer(dt); updateSkillWorld(dt); updateEnemies(dt); updateEffects(dt); updateWaves(dt);
    comboTimer -= dt; if (comboTimer <= 0) combo = 0;
    if (player.dead) {
      deathTimer -= dt;
      if (deathTimer <= 0) {
        mode = 'dead'; clearInput(); $('deathScreen').classList.remove('hidden');
        $('deathStats').innerHTML = '<span><b>' + kills + '</b>终止信号</span><span><b>' + limbBreakCount + '</b>肢体拆解</span><span><b>' + bestCombo + '</b>最高连击</span>';
      }
    }
    const look = player.dir * 90 + player.vx * .13;
    camera.target = clamp(player.x - W * .48 + look, 0, WORLD - W);
    camera.x = lerp(camera.x, camera.target, 1 - Math.exp(-dt * 5));
    pressed.clear();
  } else if (mode === 'title') { worldTime += dt; updateEffects(dt); }
}
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); scale = window.innerHeight / 720;
  W = window.innerWidth / scale; H = 720;
  canvas.width = Math.round(window.innerWidth * dpr); canvas.height = Math.round(window.innerHeight * dpr);
  if (player) camera.x = clamp(player.x - W * .4, 0, Math.max(0, WORLD - W));
}
window.addEventListener('resize', resize);
