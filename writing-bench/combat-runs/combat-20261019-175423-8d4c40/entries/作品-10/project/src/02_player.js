'use strict';
/* ============================================================
   斩骸夜行 —— 02 玩家层
   剑客状态机：连斩 / 蓄力重斩 / 挑空 / 空中连击 / 坠斩 / 影步(看破)
   骨骼姿态 + 双骨IK + 刀光拖尾 + 剑气(破军)
   ============================================================ */

/* ---------------- 招式表 ---------------- */
const MOVES = {
  l1: { dur: 0.34, act: [0.10, 0.21], dmg: 9,  kb: 170, kbY: 0,    hs: 0.045, ox0: 8,  reach: 96,  ly0: -78, ly1: -14, lunge: 250, next: 'l2', sfx: 'swing',        trail: 1 },
  l2: { dur: 0.36, act: [0.09, 0.20], dmg: 10, kb: 195, kbY: -70,  hs: 0.05,  ox0: 8,  reach: 100, ly0: -88, ly1: -18, lunge: 265, next: 'l3', sfx: 'swingUp',      trail: 1 },
  l3: { dur: 0.52, act: [0.13, 0.28], dmg: 15, kb: 345, kbY: -200, hs: 0.07,  ox0: 6,  reach: 116, ly0: -92, ly1: -16, lunge: 305, next: null, sfx: 'swingHeavy',   trail: 2, lift: 1 },
  h1: { dur: 0.62, act: [0.22, 0.33], dmg: 22, kb: 400, kbY: -150, hs: 0.09,  ox0: 4,  reach: 112, ly0: -98, ly1: -4,  lunge: 130, heavy: 1, partMul: 2.2, sfx: 'swingHeavy', trail: 2 },
  h2: { dur: 0.74, act: [0.27, 0.38], dmg: 34, kb: 480, kbY: -310, hs: 0.115, ox0: 4,  reach: 124, ly0: -102, ly1: -2, lunge: 165, heavy: 1, partMul: 3.4, forceLaunch: 1, sfx: 'swingHeavy', trail: 3 },
  h3: { dur: 0.84, act: [0.30, 0.44], dmg: 48, kb: 580, kbY: -430, hs: 0.15,  ox0: 0,  reach: 152, ly0: -110, ly1: 2,   lunge: 215, heavy: 1, partMul: 5, forceLaunch: 1, crescent: 1, sfx: 'swingHeavy', trail: 3 },
  launch: { dur: 0.46, act: [0.10, 0.24], dmg: 12, kb: 90, kbY: -575, hs: 0.055, ox0: -6, reach: 86, ly0: -114, ly1: 10, launcher: 1, rise: -330, lunge: 100, sfx: 'swingUp', trail: 2 },
  a1: { dur: 0.30, act: [0.08, 0.19], dmg: 8,  kb: 130, kbY: -130, hs: 0.04,  ox0: 6,  reach: 92,  ly0: -82, ly1: -8,  next: 'a2', air: 1, sfx: 'swing', trail: 1 },
  a2: { dur: 0.32, act: [0.08, 0.19], dmg: 10, kb: 150, kbY: -160, hs: 0.045, ox0: 6,  reach: 96,  ly0: -88, ly1: -8,  next: 'a3', air: 1, sfx: 'swingUp', trail: 1 },
  a3: { dur: 0.44, act: [0.12, 0.28], dmg: 14, kb: 225, kbY: -250, hs: 0.06,  ox0: 4,  reach: 106, ly0: -94, ly1: -6,  next: null, air: 1, sfx: 'swingHeavy', trail: 2 },
};

/* ---------------- 姿态轨道（局部坐标：x=面朝方向, y=向下） ---------------- */
const TRACKS = {
  l1: [
    { t: 0.00, hx: -20, hy: -4,  ba: -2.2,  lean: -8,  dip: 0, e: 'o' },
    { t: 0.10, hx: -24, hy: -10, ba: -2.55, lean: -13, dip: 2, e: 'l' },
    { t: 0.24, hx: 30,  hy: 6,   ba: 0.15,  lean: 17,  dip: -2, e: 'i' },
    { t: 0.62, hx: 32,  hy: 10,  ba: 0.5,   lean: 12,  dip: 0, e: 'l' },
    { t: 1.00, hx: 10,  hy: 4,   ba: 0.55,  lean: 2,   dip: 0, e: 'o' },
  ],
  l2: [
    { t: 0.00, hx: 14,  hy: 10,  ba: 0.9,   lean: 6,   dip: 0, e: 'o' },
    { t: 0.09, hx: 18,  hy: 15,  ba: 1.2,   lean: 11,  dip: 2, e: 'l' },
    { t: 0.22, hx: -14, hy: -16, ba: -1.95, lean: -15, dip: -2, e: 'i' },
    { t: 0.60, hx: -18, hy: -12, ba: -2.1,  lean: -10, dip: 0, e: 'l' },
    { t: 1.00, hx: 6,   hy: -4,  ba: 0.4,   lean: 0,   dip: 0, e: 'o' },
  ],
  l3: [
    { t: 0.00, hx: 10,  hy: 8,   ba: 0.8,   lean: 4,  dip: 0, e: 'o' },
    { t: 0.13, hx: 17,  hy: 13,  ba: 1.25,  lean: 9,  dip: 3, e: 'l' },
    { t: 0.30, hx: 25,  hy: -6,  ba: -3.6,  lean: 15, dip: -3, e: 'i' },
    { t: 0.48, hx: -18, hy: -4,  ba: -6.05, lean: -11, dip: 0, e: 'l' },
    { t: 1.00, hx: 8,   hy: 4,   ba: 0.55,  lean: 0,  dip: 0, e: 'o' },
  ],
  h1: [
    { t: 0.00, hx: -6, hy: -20, ba: -1.2,  lean: -5,  dip: 0, e: 'o' },
    { t: 0.22, hx: 2,  hy: -36, ba: -1.57, lean: -15, dip: 3, e: 'l' },
    { t: 0.38, hx: 27, hy: 11,  ba: 0.9,   lean: 20,  dip: -3, e: 'i' },
    { t: 0.72, hx: 29, hy: 14,  ba: 1.05,  lean: 14,  dip: 0, e: 'l' },
    { t: 1.00, hx: 10, hy: 6,   ba: 0.6,   lean: 2,   dip: 0, e: 'o' },
  ],
  launch: [
    { t: 0.00, hx: 5,  hy: 16,  ba: 1.3,   lean: 15, dip: 7, e: 'o' },
    { t: 0.10, hx: 10, hy: 21,  ba: 1.5,   lean: 19, dip: 9, e: 'l' },
    { t: 0.26, hx: 18, hy: -25, ba: -1.9,  lean: -12, dip: -10, e: 'i' },
    { t: 0.55, hx: 16, hy: -21, ba: -2.05, lean: -8, dip: -6, e: 'l' },
    { t: 1.00, hx: 8,  hy: 2,   ba: 0.5,   lean: 0,  dip: 0, e: 'o' },
  ],
  a1: [
    { t: 0.00, hx: -16, hy: -6,  ba: -2.15, lean: -7, e: 'o' },
    { t: 0.08, hx: -20, hy: -10, ba: -2.4,  lean: -9, e: 'l' },
    { t: 0.22, hx: 28,  hy: 3,   ba: 0.1,   lean: 11, e: 'i' },
    { t: 1.00, hx: 10,  hy: 2,   ba: 0.5,   lean: 0, e: 'o' },
  ],
  a2: [
    { t: 0.00, hx: 12,  hy: 12, ba: 0.9,  lean: 5, e: 'o' },
    { t: 0.08, hx: 16,  hy: 17, ba: 1.15, lean: 9, e: 'l' },
    { t: 0.22, hx: -10, hy: -19, ba: -1.9, lean: -13, e: 'i' },
    { t: 1.00, hx: 6,   hy: -2, ba: 0.45, lean: 0, e: 'o' },
  ],
  a3: [
    { t: 0.00, hx: 10, hy: 6,  ba: 0.7,  lean: 5, e: 'o' },
    { t: 0.12, hx: 16, hy: 11, ba: 1.1,  lean: 9, e: 'l' },
    { t: 0.30, hx: 22, hy: -8, ba: -3.7, lean: 13, e: 'i' },
    { t: 0.52, hx: -17, hy: -9, ba: -5.5, lean: -9, e: 'l' },
    { t: 1.00, hx: 8,  hy: 4,  ba: 0.5,  lean: 0, e: 'o' },
  ],
};
TRACKS.h2 = TRACKS.h3 = TRACKS.h1;

function sampleTrack(tr, u){
  u = clamp(u, 0, 1);
  let a = tr[0], b = tr[tr.length - 1];
  for (let i = 0; i < tr.length - 1; i++){
    if (u >= tr[i].t && u <= tr[i + 1].t){ a = tr[i]; b = tr[i + 1]; break; }
  }
  const span = Math.max(0.0001, b.t - a.t);
  let t = (u - a.t) / span;
  if (b.e === 'i') t = ei3(t);
  else if (b.e === 'o') t = eo3(t);
  return {
    hx: lerp(a.hx, b.hx, t), hy: lerp(a.hy, b.hy, t),
    ba: lerp(a.ba, b.ba, t), lean: lerp(a.lean, b.lean, t),
    dip: lerp(a.dip || 0, b.dip || 0, t),
  };
}

/* ---------------- 玩家对象 ---------------- */
const P = {
  x: 520, y: GROUND_Y, vx: 0, vy: 0, w: 30, h: 82, facing: 1,
  hp: 100, maxHp: 100, dead: false, deadT: 0,
  state: 'idle', air: false, coyote: 0, jumps: 0,
  move: null, moveT: 0, spawnedHit: false, chain: 0,
  dashT: 0, dashCd: 0, dashInv: 0, dashDir: 1, airDashed: false,
  charging: false, chargeT: 0, chargeTick: 0, chargeFlash: 0,
  diving: false, diveT: 0,
  iFrames: 0, hitstun: 0, landT: 0, landSquash: 0, hitChain: 0, hitChainT: 0,
  skillCd: { parry: 0, blink: 0, storm: 0, fall: 0 },
  parryT: 0, blinkT: 0, blinkDir: 1, blinkHit: null,
  stormT: 0, stormTick: 0, fallPhase: 0, fallT: 0, fallRisen: false,
  riposteT: 0, riposteTarget: null, sheathT: 0,
  runPhase: 0, trail: [], afterimages: [],
  scarf: [], hair: [], kiFlash: 0, hurtFlash: 0,
  lastVy: 0,
};

function resetPlayer(){
  P.x = 520; P.y = GROUND_Y; P.vx = 0; P.vy = 0;
  P.hp = P.maxHp; P.dead = false; P.deadT = 0;
  P.state = 'idle'; P.air = false; P.move = null; P.moveT = 0;
  P.dashT = 0; P.dashCd = 0; P.dashInv = 0; P.charging = false; P.chargeT = 0;
  P.diving = false; P.iFrames = 0; P.hitstun = 0; P.trail.length = 0;
  P.diveHitbox = false; P.hitChain = 0; P.hitChainT = 0;
  P.skillCd.parry = 0; P.skillCd.blink = 0; P.skillCd.storm = 0; P.skillCd.fall = 0;
  P.parryT = 0; P.blinkT = 0; P.blinkHit = null;
  P.stormT = 0; P.stormTick = 0; P.fallPhase = 0; P.fallT = 0; P.fallRisen = false;
  P.riposteT = 0; P.riposteTarget = null; P.sheathT = 0;
  P.afterimages.length = 0; P.jumps = 0; P.airDashed = false;
  P.facing = 1; P.runPhase = 0;
  initScarf();
}
function initScarf(){
  P.scarf = []; P.hair = [];
  for (let i = 0; i < 8; i++) P.scarf.push({ x: P.x, y: P.y - 64, px: P.x, py: P.y - 64 });
  for (let i = 0; i < 4; i++) P.hair.push({ x: P.x, y: P.y - 80, px: P.x, py: P.y - 80 });
}

/* ---------------- 剑气 ---------------- */
function addGauge(n, silent){
  if (G.gaugeFull) return;
  G.gauge = clamp(G.gauge + n, 0, 100);
  if (G.gauge >= 100){
    G.gaugeFull = true;
    P.kiFlash = 0.6;
    sfx('gauge');
    addText(P.x, P.y - 110, '破军就绪', '#ffd76a', 17, -30, 1.1);
  }
}

/* ---------------- 玩家命中盒 ---------------- */
function addPlayerHit(m, extra){
  G.hitboxes.push({
    owner: 'p',
    t: 0, dur: (m.act[1] - m.act[0]) * m.dur + 0.05,
    hit: new Set(), spawnedFx: false,
    rect: function(){
      const f = P.facing;
      const l = P.x + f * m.ox0, r = P.x + f * (m.ox0 + m.reach);
      return { l: Math.min(l, r), r: Math.max(l, r), t: P.y + m.ly0, b: P.y + m.ly1 };
    },
    dmg: m.dmg, kb: m.kb, kbY: m.kbY || 0, hs: m.hs,
    heavy: m.heavy, launcher: m.launcher, lift: m.lift, forceLaunch: m.forceLaunch,
    crescent: m.crescent, partMul: m.partMul || 1, air: m.air,
    extra: extra || null,
  });
}

/* ---------------- 招式启动 ---------------- */
function startMove(name, chainKeep){
  const m = MOVES[name];
  P.move = name; P.moveT = 0; P.spawnedHit = false;
  P.state = 'attack';
  if (!chainKeep) P.chain = 0;
  if (name === 'launch'){
    P.vy = m.rise; P.air = true;
    dust(P.x, P.y, 4, 0.8);
  }
  if (m.air){
    // 空中连击轻微滞空
    P.vy = Math.min(P.vy, -30);
  }
  sfx(m.sfx);
  petalBlast(P.x, P.y - 50, 70, P.facing);
}
function startDash(){
  P.dashT = P.air ? 0.17 : 0.2;
  P.dashDir = (held.left && !held.right) ? -1 : (held.right && !held.left) ? 1 : P.facing;
  P.facing = P.dashDir;
  P.dashCd = 0.42;
  P.dashInv = 0.155;
  P.charging = false;
  P.move = null;
  P.diving = false;
  P.state = 'dash';
  if (P.air) P.airDashed = true;
  sfx('dash');
  dust(P.x, P.y, 4, 0.8, -P.dashDir);
  ring(P.x, P.y - 40, 6, 30, 0.25, '170,190,255', 2);
}
function startCharge(){
  P.charging = true; P.chargeT = 0; P.chargeTick = 0; P.chargeFlash = false; P.move = null; P.state = 'charge';
}
function releaseCharge(){
  const t = P.chargeT;
  P.charging = false;
  let mv = 'h1';
  if (t >= 0.82) mv = 'h3'; else if (t >= 0.34) mv = 'h2';
  startMove(mv);
  if (mv === 'h3'){
    flashFx(P.x + P.facing * 40, P.y - 60, 70, 0.18, '255,220,150');
  }
}
function startDive(){
  P.diving = true; P.diveT = 0; P.move = null; P.state = 'dive';
  P.diveHitbox = false;
  P.vx = P.facing * 250; P.vy = 720;
  sfx('swingHeavy');
  dust(P.x, P.y - 40, 3, 0.6);
}
function triggerInsight(x, y){
  if (G.insightT > 0) return;
  G.insightT = 0.6;
  slowmo(0.55, 0.3);
  sfx('insight');
  addText(P.x, P.y - 108, '看破', '#8fd8ff', 26, -20, 0.9);
  ring(x, y, 8, 70, 0.4, '150,200,255', 3);
  ring(P.x, P.y - 46, 10, 90, 0.5, '120,180,255', 2);
  addGauge(35);
  P.dashCd = 0;
}

/* ---------------- 奥义技能 ---------------- */
function spendGauge(n){
  G.gauge = Math.max(0, G.gauge - n);
  if (G.gauge < 100) G.gaugeFull = false;
}

/* U · 弹反·镜花 —— 架势中被打中则化解并自动拔刀追斩 */
function startParry(){
  const p = P;
  p.skillCd.parry = 2.8;
  p.parryT = 0.36;
  p.move = null; p.charging = false; p.diving = false;
  p.state = 'skill';
  G.skillUses.parry++;
  sfx('parry');
  ring(p.x, p.y - 46, 34, 8, 0.3, '190,220,255', 2);
}
function parrySuccess(src){
  const p = P;
  p.parryT = 0;
  p.iFrames = Math.max(p.iFrames, 0.4);
  p.skillCd.parry = 0.8;   // 成功后快速返还
  G.skillUses.parryWins++;
  doHitStop(0.16);
  slowmo(0.6, 0.3);
  addShake(0.3);
  sfx('parryWin');
  flashFx(p.x, p.y - 50, 90, 0.22, '220,240,255');
  ring(p.x, p.y - 46, 12, 110, 0.45, '200,230,255', 4);
  ring(p.x, p.y - 46, 6, 60, 0.3, '255,255,255', 3);
  cutLine(p.x, p.y - 46, rnd(-0.4, 0.4), 130, 0.24, '#bfe6ff');
  sparks(p.x, p.y - 46, 14, 0, '#dff0ff', 420);
  addText(p.x, p.y - 104, '弹反', '#bfe6ff', 26, -24, 0.9);
  addGauge(25);
  if (src && !src.dead){
    p.riposteT = 0.13;
    p.riposteTarget = src;
  }
}
function doRiposte(e){
  const p = P;
  const dir = sgn(e.x - p.x) || p.facing;
  // 瞬步到目标面前，拔刀一闪
  p.x = clamp(e.x - dir * 58, 50, ARENA_W - 50);
  if (!e.airborne) p.y = Math.min(p.y, GROUND_Y);
  p.facing = dir;
  p.move = null; p.charging = false; p.diving = false;
  p.sheathT = 0.4;
  sfx('multiCut'); sfx('hitHeavy');
  flashFx(e.x, e.y - e.h / 2, 70, 0.16, '255,240,220');
  cutLine(e.x, e.y - e.h * 0.45, dir > 0 ? 0.2 : PI - 0.2, 150, 0.22, '#ff5a66');
  e.staggerT = Math.max(e.staggerT, 0.8);
  damageEnemy(e, {
    rect: () => ({ l: e.x - 60, r: e.x + 60, t: e.y - e.h - 30, b: e.y + 14 }),
    dmg: 26, kb: 300, kbY: -320, hs: 0.13, heavy: 1, partMul: 3, forceLaunch: 1, riposte: 1,
  });
}

/* O · 瞬影·一閃 —— 墨影穿行，路径上的敌人延迟同时受斩 */
function startBlink(){
  const p = P;
  p.skillCd.blink = 5;
  p.blinkT = 0.17;
  p.blinkDir = held.left ? -1 : held.right ? 1 : p.facing;
  p.facing = p.blinkDir;
  p.blinkHit = new Set();
  p.move = null; p.charging = false; p.diving = false; p.dashT = 0;
  p.state = 'skill';
  G.skillUses.blink++;
  sfx('blink');
  spawnAfterimage();
  dust(p.x, p.y, 4, 0.9, -p.blinkDir);
}

/* H · 樱吹雪 —— 消耗剑气的三段回旋 AoE */
function startStorm(){
  const p = P;
  p.skillCd.storm = 9;
  spendGauge(40);
  p.stormT = 0.7; p.stormTick = 0;
  p.move = null; p.charging = false; p.diving = false;
  p.state = 'skill';
  G.skillUses.storm++;
  sfx('storm');
  addText(p.x, p.y - 112, '樱吹雪', '#ffb3c8', 22, -26, 0.9);
  petalBlast(p.x, p.y - 40, 130, 0);
}
function stormTick(tick){
  const p = P;
  sfx(tick === 3 ? 'swingHeavy' : 'swing');
  ring(p.x, p.y - 40, 20, 150, 0.35, '255,235,210', 3);
  petalBlast(p.x, p.y - 40, 150, 0);
  let hitAny = false;
  for (const e of G.enemies){
    if (e.dead) continue;
    if (Math.abs(e.x - p.x) < 150 && Math.abs((e.y - e.h / 2) - (p.y - 40)) < 130){
      damageEnemy(e, {
        rect: () => ({ l: e.x - 50, r: e.x + 50, t: e.y - e.h, b: e.y }),
        dmg: 10, kb: 140, kbY: tick === 3 ? -300 : -90, hs: 0.045, air: 1, partMul: 1.3,
      });
      hitAny = true;
    }
  }
  if (hitAny) doHitStop(0.05);
  if (tick === 3 && hitAny){ addShake(0.22); addZoom(0.4); }
}

/* Y · 落月·断罪 —— 跃起引满月坠落，大范围砸地击飞 */
function startFall(){
  const p = P;
  p.skillCd.fall = 14;
  p.fallPhase = 1; p.fallT = 0; p.fallRisen = false;
  p.move = null; p.charging = false; p.diving = false; p.dashT = 0;
  p.state = 'skill';
  G.skillUses.fall++;
  sfx('fallCast');
  G.moonBoost = 1;
  flashFx(p.x, p.y - 110, 54, 0.3, '255,230,170');
  spawnP({ kind: 'crescent', x: p.x, y: p.y - 128, rot: p.facing > 0 ? -0.35 : PI + 0.35, size: 34, life: 0.32, t: 0, col: '#ffd76a', g: 0 });
}
function removeFallRise(){
  for (let i = G.hitboxes.length - 1; i >= 0; i--) if (G.hitboxes[i].fallrise) G.hitboxes.splice(i, 1);
}
function fallImpact(){
  const p = P;
  p.fallPhase = 0; p.fallRisen = false;
  removeFallRise();
  const floorY = p.y;
  p.vy = 0; p.vx = p.facing * 100; p.air = false;
  p.landSquash = 1; p.landT = 0.2;
  doHitStop(0.16);
  slowmo(0.7, 0.32);
  addShake(0.5, p.facing);
  addZoom(1);
  sfx('meteor');
  G.moonBoost = 1.2;
  G.flashT = 0.22;
  dust(p.x, floorY, 20, 2.2, 0);
  chips(p.x, floorY, 14, '#5a6284');
  ring(p.x, floorY, 12, 200, 0.5, '255,220,160', 5);
  ring(p.x, floorY, 6, 120, 0.35, '255,250,230', 3);
  flashFx(p.x, floorY - 30, 130, 0.25, '255,225,170');
  spawnP({ kind: 'crescent', x: p.x + p.facing * 30, y: floorY - 40, rot: p.facing > 0 ? 0.35 : PI - 0.35, size: 170, life: 0.4, t: 0, col: '#ffcf70', g: 0 });
  let n = 0;
  for (const e of G.enemies){
    if (e.dead) continue;
    if (Math.abs(e.x - p.x) < 205 && Math.abs(e.y - floorY) < 160){
      n++;
      damageEnemy(e, {
        rect: () => ({ l: e.x - 50, r: e.x + 50, t: e.y - e.h, b: e.y }),
        dmg: 26, kb: 420, kbY: -520, hs: 0.08, heavy: 1, partMul: 3.2, forceLaunch: 1, meteor: 1,
      });
    }
  }
  if (n > 0) sfx('shatter');
}

/* ---------------- 玩家受击 ---------------- */
function damagePlayer(dmg, dir, opts){
  opts = opts || {};
  if (P.dead || P.iFrames > 0 || P.dashInv > 0) return;
  P.hp -= dmg;
  // 连锁受击保护：短时间连吃 3 刀则获得摆脱窗口，避免被围死在墙角无限硬直
  P.hitChain = (P.hitChainT > 0 ? P.hitChain : 0) + 1;
  P.hitChainT = 1.6;
  P.iFrames = P.hitChain >= 3 ? 1.5 : 1.0;
  if (P.hitChain >= 3){ P.hitChain = 0; ring(P.x, P.y - 46, 8, 66, 0.4, '255,150,150', 3); }
  P.hitstun = 0.15;
  P.charging = false;
  P.diving = false;
  P.diveHitbox = false;
  P.parryT = 0; P.blinkT = 0; P.stormT = 0; P.fallPhase = 0; P.fallRisen = false;
  P.riposteT = 0; P.riposteTarget = null;
  removeDiveHitbox();
  removeFallRise();
  P.move = null;
  P.state = 'hurt';
  P.vx = dir * (opts.kb || 240);
  if (opts.vy) P.vy = opts.vy; else if (!P.air) P.vy = -170;
  P.air = true;
  G.hurtVig = 1;
  G.hurtFlash = 0.25;
  addShake(0.24, dir);
  doHitStop(0.06);
  sfx('hurt');
  sparks(P.x, P.y - 50, 7, dir, '#ff6b7a', 300);
  G.combo = 0;
  G.gauge = Math.max(0, G.gauge - 22);
  if (P.hp <= 0){
    P.hp = 0;
    P.dead = true; P.deadT = 0;
    P.state = 'dead';
    slowmo(1.2, 0.28);
    addShake(0.5, dir);
    sfx('death');
    sparks(P.x, P.y - 46, 22, dir, '#ff6b7a', 420);
    ring(P.x, P.y - 46, 10, 120, 0.6, '255,110,120', 4);
    G.state = 'dead';
  }
}

/* ---------------- 玩家更新 ---------------- */
function updatePlayer(dt, rdt){
  const p = P;
  // 计时器
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.iFrames = Math.max(0, p.iFrames - dt);
  p.hitstun = Math.max(0, p.hitstun - dt);
  p.landT = Math.max(0, p.landT - dt);
  p.coyote = Math.max(0, p.coyote - dt);
  p.kiFlash = Math.max(0, p.kiFlash - dt);
  p.hurtFlash = Math.max(0, (p.hurtFlash || 0) - dt);
  if (p.hitChainT > 0){ p.hitChainT -= dt; if (p.hitChainT <= 0) p.hitChain = 0; }
  G.insightT = Math.max(0, G.insightT - dt);
  p.landSquash = Math.max(0, p.landSquash - dt * 6);
  p.skillCd.parry = Math.max(0, p.skillCd.parry - dt);
  p.skillCd.blink = Math.max(0, p.skillCd.blink - dt);
  p.skillCd.storm = Math.max(0, p.skillCd.storm - dt);
  p.skillCd.fall = Math.max(0, p.skillCd.fall - dt);
  p.sheathT = Math.max(0, p.sheathT - dt);

  if (p.dead){
    p.deadT += dt;
    // 倒地滑行
    p.vx *= Math.max(0, 1 - dt * 4);
    physicsStep(p, dt, 0);
    updateScarf(dt, rdt);
    return;
  }

  const canAct = p.hitstun <= 0 && p.dashT <= 0 && !p.diving;

  /* --- 冲刺 --- */
  if (p.dashT > 0){
    p.dashT -= dt;
    p.dashInv = Math.max(0, p.dashInv - dt);
    p.vx = p.dashDir * 640;
    p.vy = 0;
    if (Math.random() < 0.9) spawnAfterimage();
    if (p.dashT <= 0){ p.state = p.air ? 'air' : 'idle'; p.vx = p.dashDir * 250; }
    physicsStep(p, dt, 0);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 坠斩 --- */
  if (p.diving){
    p.diveT += dt;
    p.vx = p.facing * 250;
    p.vy = 780;
    if (!p.diveHitbox){
      p.diveHitbox = true;
      G.hitboxes.push({
        owner: 'p', t: 0, dur: 1.2, dive: true, hit: new Set(),
        rect: function(){
          return { l: p.x - 30, r: p.x + 30, t: p.y - 74, b: p.y + 6 };
        },
        dmg: 16, kb: 130, kbY: 0, hs: 0.1, spike: true, partMul: 2.4, heavy: 1,
      });
    }
    if (Math.random() < 0.7) spawnAfterimage();
    if (!p.air || p.diveT > 1.1){
      diveImpact();
    }
    physicsStep(p, dt, 0);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 弹反成功后的追斩 --- */
  if (p.riposteT > 0){
    p.riposteT -= dt;
    if (p.riposteT <= 0){
      const t = p.riposteTarget;
      p.riposteTarget = null;
      if (t && !t.dead) doRiposte(t);
    }
  }

  /* --- 弹反架势 --- */
  if (p.parryT > 0){
    p.parryT -= dt;
    const mv = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    p.vx = mv * 60;
    if (Math.random() < 0.3) spawnP({ kind: 'ember', x: p.x + rnd(-16, 16), y: p.y - rnd(30, 70), vx: 0, vy: -30, g: 0, drag: 1, life: 0.3, size: 1.8, col: '#bfe6ff' });
    if (p.parryT <= 0) p.state = p.air ? 'air' : 'idle';
    physicsStep(p, dt, mv);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 瞬影·一閃 --- */
  if (p.blinkT > 0){
    p.blinkT -= dt;
    p.vx = p.blinkDir * 2300;
    p.vy = 0;
    p.dashInv = Math.max(p.dashInv, 0.05);
    if (Math.random() < 0.95) spawnAfterimage();
    for (let i = 0; i < 2; i++){
      spawnP({ kind: 'spark', x: p.x - p.blinkDir * rnd(0, 34), y: p.y - rnd(10, 70), vx: -p.blinkDir * rnd(200, 420), vy: rnd(-40, 40), g: 0, drag: 3, life: 0.25, size: rnd(1.5, 3), col: '#25304f' });
    }
    // 收集途经敌人并留下斩痕
    for (const e of G.enemies){
      if (e.dead || p.blinkHit.has(e)) continue;
      if (Math.abs(e.x - p.x) < 64 && Math.abs((e.y - e.h / 2) - (p.y - 42)) < 80){
        p.blinkHit.add(e);
        spawnP({ kind: 'cut', x: e.x, y: e.y - e.h * 0.5, rot: rnd(-0.3, 0.3) + (p.blinkDir > 0 ? 0 : PI), size: 90, life: 0.28, t: 0, col: '#ff4d5e', g: 0 });
      }
    }
    // 穿越时斩落箭矢
    for (let j = G.shots.length - 1; j >= 0; j--){
      const s = G.shots[j];
      if (Math.abs(s.x - p.x) < 50 && s.y > p.y - 80 && s.y < p.y + 10){
        sparks(s.x, s.y, 7, 0, '#ffe2b0', 320);
        G.shots.splice(j, 1);
        addGauge(2);
      }
    }
    if (p.blinkT <= 0){
      p.vx = p.blinkDir * 280;
      p.state = p.air ? 'air' : 'idle';
      if (p.blinkHit && p.blinkHit.size){
        doHitStop(0.14);
        slowmo(0.4, 0.4);
        addShake(0.3, p.blinkDir);
        sfx('multiCut'); sfx('hitHeavy');
        flashFx(p.x, p.y - 46, 60, 0.18, '220,235,255');
        addText(p.x, p.y - 108, '一閃', '#cfe0ff', 22, -26, 0.8);
        for (const e of p.blinkHit){
          if (e.dead) continue;
          const dir = sgn(e.x - p.x) || p.blinkDir;
          cutLine(e.x, e.y - e.h * 0.45, dir > 0 ? 0.15 : PI - 0.15, 120, 0.2, '#ff5a66');
          sparks(e.x, e.y - e.h * 0.45, 8, dir, '#ffe2b0', 380);
          damageEnemy(e, {
            rect: () => ({ l: e.x - 46, r: e.x + 46, t: e.y - e.h, b: e.y }),
            dmg: 20, kb: 260, kbY: -190, hs: 0.05, heavy: 1, partMul: 2.4, air: 1,
          });
        }
      }
      p.blinkHit = new Set();
    }
    physicsStep(p, dt, 0);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 樱吹雪 --- */
  if (p.stormT > 0){
    p.stormT -= dt;
    p.iFrames = Math.max(p.iFrames, 0.07);
    p.vx *= Math.max(0, 1 - dt * 8);
    const elapsed = 0.7 - p.stormT;
    for (let k = 1; k <= 3; k++){
      const tt = 0.1 + (k - 1) * 0.2;
      if (elapsed >= tt && p.stormTick < k){ p.stormTick = k; stormTick(k); }
    }
    // 花瓣涡旋
    for (let i = 0; i < 2; i++){
      const a = G.time * 9 + i * PI;
      const r = 90 - (p.stormT * 90);
      spawnP({ kind: 'ember', x: p.x + Math.cos(a) * r, y: p.y - 40 + Math.sin(a) * r * 0.7 - rnd(0, 30), vx: -Math.sin(a) * 180, vy: Math.cos(a) * 130 - 60, g: 0, drag: 1.5, life: 0.3, size: 2.2, col: '#ffb3c8' });
    }
    sampleTrail();
    if (p.stormT <= 0){ p.state = 'idle'; p.stormTick = 0; }
    physicsStep(p, dt, 0);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 落月·断罪 --- */
  if (p.fallPhase > 0){
    p.fallT += dt;
    p.iFrames = Math.max(p.iFrames, 0.06);
    if (p.fallPhase === 1){
      p.vx *= Math.max(0, 1 - dt * 10);
      if (p.fallT > 0.26){
        p.fallPhase = 2; p.fallT = 0;
        p.vy = -640; p.vx = p.facing * 210; p.air = true;
        dust(p.x, p.y, 8, 1.1, 0);
        addShake(0.15);
        sfx('swingUp');
        addText(p.x, p.y - 116, '落月·断罪', '#ffd76a', 20, -20, 1.0);
      }
    } else if (p.fallPhase === 2){
      if (p.fallT > 0.02 && !p.fallRisen){
        p.fallRisen = true;
        G.hitboxes.push({
          owner: 'p', t: 0, dur: 0.34, fallrise: true, hit: new Set(),
          rect: function(){
            return { l: p.x - 44, r: p.x + 44, t: p.y - 120, b: p.y + 8 };
          },
          dmg: 10, kb: 160, kbY: -420, hs: 0.05, launcher: 1, partMul: 1.6,
        });
      }
      if (p.vy > -60 || p.fallT > 0.42){
        p.fallPhase = 3; p.fallT = 0;
        p.vy = 900; p.vx = p.facing * 150;
        sfx('swingHeavy');
        spawnAfterimage();
      }
    } else if (p.fallPhase === 3){
      if (Math.random() < 0.7) spawnAfterimage();
      if (!p.air || p.fallT > 0.6) fallImpact();
    }
    physicsStep(p, dt, 0);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 蓄力 --- */
  if (p.charging){
    p.chargeT += dt;
    p.chargeTick -= dt;
    if (p.chargeTick <= 0){
      p.chargeTick = 0.11;
      sfx('charge', clamp(p.chargeT / 0.85, 0, 1));
      // 汇聚的剑气粒子
      const hx = p.x + p.facing * 4, hy = p.y - 78;
      spawnP({ kind: 'ember', x: hx + rnd(-46, 46), y: hy + rnd(-40, 40), vx: 0, vy: 0, g: 0, drag: 0, life: 0.18, size: rnd(1.6, 3), col: p.chargeT >= 0.82 ? '#ff5a66' : '#9fd8ff' });
    }
    if (p.chargeT >= 0.82 && !p.chargeFlash){ p.chargeFlash = true; flashFx(p.x, p.y - 76, 34, 0.2, '255,110,120'); sfx('gauge'); }
    if (p.chargeT > 1.5){ releaseCharge(); }
    else if (consume('dash', 0.05) && p.dashCd <= 0){ startDash(); }
    else if (!held.heavy){ releaseCharge(); }
    // 蓄力时缓慢移动
    const mv = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    p.vx = mv * 72;
    if (mv) p.facing = mv;
    physicsStep(p, dt, mv);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 攻击进行中 --- */
  if (p.move){
    const m = MOVES[p.move];
    p.moveT += dt;
    const a0 = m.act[0] * m.dur, a1 = m.act[1] * m.dur;
    const inActive = p.moveT >= a0 && p.moveT <= a1 + 0.05;

    if (inActive && !p.spawnedHit){
      p.spawnedHit = true;
      addPlayerHit(m);
      if (m.crescent) spawnCrescentFx();
    }
    // 突进
    if (p.moveT >= a0 - 0.02 && p.moveT <= a1 + 0.04){
      if (!m.air) p.vx = p.facing * (m.lunge || 0);
      else p.vx = lerp(p.vx, p.facing * 150, dt * 4);
    }
    if (!m.air && p.moveT < a0) p.vx *= Math.max(0, 1 - dt * 12);
    // 刀光采样
    if (inActive || (p.moveT > a0 - 0.05 && p.moveT < a0)) sampleTrail();

    // 恢复期取消/连段
    if (p.moveT > a1 + 0.02){
      let chained = false;
      if (m.next && consume('atk', 0.2)){ startMove(m.next, true); chained = true; }
      else if (consume('dash', 0.05) && p.dashCd <= 0){ startDash(); chained = true; }
      else if (!m.air && consume('jump', 0.08)){ doJump(); chained = true; }
      else if (!m.air && consume('special', 0.12)){ startMove('launch'); chained = true; }
      else if (!m.air && consume('heavy', 0.1) && held.heavy){ startCharge(); chained = true; }
      else if (m.air && p.air && consume('heavy', 0.08) && held.heavy){ startDive(); chained = true; }
      else if (consume('parry', 0.1) && p.skillCd.parry <= 0){ startParry(); chained = true; }
      else if (consume('blink', 0.1) && p.skillCd.blink <= 0){ startBlink(); chained = true; }
      else if (consume('storm', 0.1) && p.skillCd.storm <= 0 && !p.air && G.gauge >= 40){ startStorm(); chained = true; }
      else if (consume('fall', 0.1) && p.skillCd.fall <= 0 && !p.air){ startFall(); chained = true; }
      if (!chained && p.moveT >= m.dur){
        p.move = null;
        p.state = p.air ? 'air' : 'idle';
      }
    }
    physicsStep(p, dt, m.air ? ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * 0.5 : 0);
    updateScarf(dt, rdt);
    return;
  }

  /* --- 自由行动 --- */
  if (canAct){
    // 冲刺
    if (consume('dash', 0.08) && p.dashCd <= 0 && !(p.air && p.airDashed)){
      startDash();
      physicsStep(p, dt, 0);
      updateScarf(dt, rdt);
      return;
    }
    // 跳跃
    if (consume('jump', 0.11)){
      if (!p.air || p.coyote > 0){ doJump(); }
      else if (p.jumps < 1){ doJump(true); }
    }
    // 挑空
    if (!p.air && consume('special', 0.1)){
      startMove('launch');
      physicsStep(p, dt, 0);
      updateScarf(dt, rdt);
      return;
    }
    // 奥义技能
    if (consume('parry', 0.1) && p.skillCd.parry <= 0){ startParry(); physicsStep(p, dt, 0); updateScarf(dt, rdt); return; }
    if (consume('blink', 0.1) && p.skillCd.blink <= 0){ startBlink(); physicsStep(p, dt, 0); updateScarf(dt, rdt); return; }
    if (consume('storm', 0.1) && p.skillCd.storm <= 0 && !p.air && G.gauge >= 40){ startStorm(); physicsStep(p, dt, 0); updateScarf(dt, rdt); return; }
    if (consume('fall', 0.1) && p.skillCd.fall <= 0 && !p.air){ startFall(); physicsStep(p, dt, 0); updateScarf(dt, rdt); return; }
    // 重击（地面蓄力重斩 / 空中坠斩）—— 点按即出重斩，按住蓄力
    if (consume('heavy', 0.1)){
      if (p.air){ startDive(); physicsStep(p, dt, 0); updateScarf(dt, rdt); return; }
      startCharge(); physicsStep(p, dt, 0); updateScarf(dt, rdt); return;
    }
    // 轻击
    if (consume('atk', 0.14)){
      startMove(p.air ? 'a1' : 'l1');
      physicsStep(p, dt, 0);
      updateScarf(dt, rdt);
      return;
    }
  }

  // 移动
  const mv = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (p.hitstun <= 0){
    if (mv){
      p.vx += mv * (p.air ? 1700 : 2700) * dt;
      p.vx = clamp(p.vx, -308, 308);
      if (!p.move) p.facing = mv;
    } else {
      p.vx *= Math.max(0, 1 - (p.air ? dt * 1.2 : dt * 11));
      if (Math.abs(p.vx) < 6) p.vx = 0;
    }
  }
  if (!p.move) p.state = p.air ? (Math.abs(p.vy) > 30 ? 'air' : 'air') : (Math.abs(p.vx) > 20 ? 'run' : 'idle');
  if (!p.air && Math.abs(p.vx) > 40 && Math.random() < dt * 6) dust(p.x - p.facing * 8, p.y, 1, 0.5, -p.facing);

  physicsStep(p, dt, mv);
  updateScarf(dt, rdt);
}

function doJump(isDouble){
  const p = P;
  p.vy = isDouble ? -530 : -575;
  p.air = true;
  p.coyote = 0;
  p.jumps = isDouble ? 1 : 0;
  sfx('jump');
  dust(p.x, p.y, 4, 0.7);
  if (isDouble){
    ring(p.x, p.y, 4, 34, 0.3, '170,190,255', 2);
    petalBlast(p.x, p.y, 46, 0);
  }
}

function removeDiveHitbox(){
  for (let i = G.hitboxes.length - 1; i >= 0; i--) if (G.hitboxes[i].dive) G.hitboxes.splice(i, 1);
}
function diveImpact(){
  const p = P;
  p.diving = false;
  p.diveHitbox = false;
  removeDiveHitbox();
  const floorY = p.y;   // 落点（主地面或高台）
  p.vy = 0; p.air = false;
  p.vx = p.facing * 120;
  p.landT = 0.16; p.landSquash = 1;
  sfx('slam');
  addShake(0.3, p.facing);
  doHitStop(0.05);
  dust(p.x, floorY, 12, 1.5, 0);
  ring(p.x, floorY, 10, 120, 0.45, '255,220,170', 4);
  chips(p.x, floorY, 8, '#5a6284');
  // 落地冲击伤害附近地面敌人
  for (const e of G.enemies){
    if (e.dead || e.state === 'spawn') continue;
    if (!e.airborne && Math.abs(e.x - p.x) < 130 && Math.abs(e.y - floorY) < 30){
      damageEnemyLight(e, 8, sgn(e.x - p.x) || 1, e.x, e.y - 20);
    }
  }
}

function physicsStep(p, dt, mv){
  p.lastVy = p.vy;
  if (p.dashT > 0){ /* 冲刺中无重力 */ }
  else p.vy += 1500 * dt;
  p.vy = Math.min(p.vy, 980);
  const prevY = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // 边界
  if (p.x < 40){ p.x = 40; p.vx = Math.max(0, p.vx); }
  if (p.x > ARENA_W - 40){ p.x = ARENA_W - 40; p.vx = Math.min(0, p.vx); }
  // 地面
  let landed = false;
  if (p.y >= GROUND_Y){
    p.y = GROUND_Y;
    landed = true;
  } else if (p.vy > 0){
    // 单向高台
    for (const plat of PLATFORMS){
      if (Math.abs(p.x - plat.x) < plat.w / 2 + 8 && prevY <= plat.y + 1 && p.y >= plat.y && !held.down){
        p.y = plat.y; landed = true; p.onPlatform = plat; break;
      }
    }
  }
  if (landed){
    if (p.air){
      // 落地反馈
      if (p.lastVy > 620 || p.diving){
        dust(p.x, p.y, 8, 1.1, 0);
        addShake(Math.min(0.16, p.lastVy / 6000));
        sfx('land');
        p.landSquash = 1;
      } else if (p.lastVy > 240){
        dust(p.x, p.y, 4, 0.7, 0);
        sfx('land');
        p.landSquash = 0.7;
      }
      p.air = false; p.jumps = 0; p.airDashed = false; p.coyote = 0;
      if (p.state === 'air') p.state = 'idle';
      p.landT = 0.07;
    }
    p.vy = 0;
    p.coyote = 0.09;
  } else {
    if (!p.air && p.vy > 0){ p.air = true; }
  }
  // 跑动相位
  if (!p.air) p.runPhase += Math.abs(p.vx) * dt * 0.052;
  // 站在平台上按下则下落
  if (p.onPlatform && held.down && !p.air){
    p.y += 4; p.air = true; p.vy = 80; p.onPlatform = null;
  }
  if (p.air || Math.abs(p.y - GROUND_Y) > 2) p.onPlatform = null;
}

/* ---------------- 拖尾 / 残影 ---------------- */
let poseCache = null;
function sampleTrail(){
  const p = P, sk = poseCache || computeSkeleton(p);
  p.trail.push({ x1: sk.handX, y1: sk.handY, x2: sk.tipX, y2: sk.tipY, t: G.rtime });
}
function spawnAfterimage(){
  P.afterimages.push({ x: P.x, y: P.y, f: P.facing, t: G.rtime, ba: poseCache ? poseCache.baWorld : 0.5, hx: poseCache ? poseCache.handX : 0, hy: poseCache ? poseCache.handY : 0 });
  if (P.afterimages.length > 14) P.afterimages.shift();
}
function updateScarf(dt, rdt){
  const p = P;
  const sk = poseCache || computeSkeleton(p);
  const nx = sk.neckX, ny = sk.neckY;
  // verlet
  for (let i = 0; i < p.scarf.length; i++){
    const n = p.scarf[i];
    const vx = (n.x - n.px) * 0.86, vy = (n.y - n.py) * 0.86;
    n.px = n.x; n.py = n.y;
    if (i === 0){ n.x = nx - p.facing * 5; n.y = ny + 3; continue; }
    n.x += vx + (-p.facing * (66 + Math.abs(p.vx) * 0.42) + Math.sin(G.time * 8 + i) * 26) * dt;
    n.y += vy + (300 - p.vy * 0.28) * dt;
  }
  for (let i = 1; i < p.scarf.length; i++){
    const a = p.scarf[i - 1], b = p.scarf[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001, target = 7.4;
    const k = (d - target) / d;
    b.x -= dx * k; b.y -= dy * k;
  }
  for (let i = 0; i < p.hair.length; i++){
    const n = p.hair[i];
    const vx = (n.x - n.px) * 0.8, vy = (n.y - n.py) * 0.8;
    n.px = n.x; n.py = n.y;
    if (i === 0){ n.x = sk.headX - p.facing * 7; n.y = sk.headY - 7; continue; }
    n.x += vx - p.facing * 40 * dt;
    n.y += vy + 240 * dt;
  }
  for (let i = 1; i < p.hair.length; i++){
    const a = p.hair[i - 1], b = p.hair[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const k = (d - 6.5) / d;
    b.x -= dx * k; b.y -= dy * k;
  }
}

/* ---------------- 骨骼计算 ---------------- */
function ik(sx, sy, tx, ty, l1, l2, bend){
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const md = l1 + l2 - 0.6;
  if (d > md){ dx *= md / d; dy *= md / d; d = md; }
  if (d < 0.01){ d = 0.01; dx = 0.01; }
  const a = Math.acos(clamp((d * d + l1 * l1 - l2 * l2) / (2 * d * l1), -1, 1));
  const ang = Math.atan2(dy, dx);
  const ea = ang + a * bend;
  return { ex: sx + Math.cos(ea) * l1, ey: sy + Math.sin(ea) * l1, tx: sx + dx, ty: sy + dy };
}

function computeSkeleton(p){
  const f = p.facing;
  let lean = 0, dip = 0, hx = 12, hy = 6, ba = 0.55;
  let armBx = -12, armBy = 8, crouch = 0;

  if (p.dead){
    // 倒地姿态
    lean = -f * 1.1; dip = 30; hx = -20; hy = 26; ba = 2.2; armBx = -24; armBy = 30;
  } else if (p.move){
    const m = MOVES[p.move];
    const tr = sampleTrack(TRACKS[p.move] || TRACKS.l1, p.moveT / m.dur);
    hx = tr.hx; hy = tr.hy; ba = tr.ba; lean = tr.lean * PI / 180; dip = tr.dip;
    armBx = -hx * 0.5; armBy = -hy * 0.4 + 14;
  } else if (p.parryT > 0){
    // 弹反架势：刀竖于身前
    hx = 17; hy = 2; ba = -1.5; lean = 8; dip = 3;
    armBx = -13; armBy = 10;
  } else if (p.blinkT > 0){
    // 瞬影：前倾掠影
    hx = -6; hy = 8; ba = 2.5; lean = 0.5; dip = 2;
    armBx = -18; armBy = 12;
  } else if (p.stormT > 0){
    // 樱吹雪：全身回旋，刀角连续旋转
    hx = 10; hy = -6; ba = -((G.time * 16) % TAU); lean = Math.sin(G.time * 10) * 0.1; dip = -2;
    armBx = -12; armBy = 6;
  } else if (p.fallPhase === 1){
    // 落月蓄势：引刀向上
    hx = 2; hy = -34; ba = -1.7; lean = -10; dip = 8;
    armBx = -14; armBy = 8;
  } else if (p.fallPhase === 2){
    // 升空斩
    hx = 12; hy = -12; ba = -2.3; lean = -14; dip = -6;
    armBx = -16; armBy = -2;
  } else if (p.fallPhase === 3){
    // 坠月
    hx = 16; hy = 18; ba = 1.2; lean = 22; dip = 2;
    armBx = -18; armBy = 14;
  } else if (p.sheathT > 0){
    // 收刀
    hx = 10; hy = 12; ba = 2.5; lean = 4; dip = 2;
    armBx = -12; armBy = 10;
  } else if (p.charging){
    const t = clamp(p.chargeT / 0.85, 0, 1);
    hx = lerp(-10, 6 - Math.sin(p.chargeT * 34) * 2 * t, t);
    hy = lerp(-10, -34, t) + (t > 0.95 ? rnd(-1.5, 1.5) : 0);
    ba = lerp(-1.4, -1.85, t);
    lean = -0.28 * t; dip = 3 * t;
    armBx = -14; armBy = 6;
  } else if (p.dashT > 0 || p.diving){
    lean = f * 0.42; dip = p.diving ? -4 : 4;
    hx = p.diving ? 14 : 18; hy = p.diving ? 22 : -2;
    ba = p.diving ? 1.35 : 0.2;
    armBx = -18; armBy = p.diving ? -14 : 10;
  } else if (p.hitstun > 0){
    lean = -f * 0.3; dip = 4; hx = -16; hy = 4; ba = 1.8; armBx = -20; armBy = 14;
  } else {
    if (p.air){
      lean = clamp(p.vx * f * 0.0008, -0.15, 0.3);
      hx = 14; hy = -8; ba = 0.35;
      armBx = -14; armBy = -2;
      dip = -2;
    } else if (Math.abs(p.vx) > 30){
      lean = f * 0.16;
      hx = 12; hy = 6; ba = 0.6;
      armBx = -12; armBy = 8;
      dip = Math.sin(p.runPhase * 2) * 1.6;
    } else {
      lean = Math.sin(G.time * 1.7) * 0.02;
      hx = 13; hy = 7; ba = 0.62;
      armBx = -11; armBy = 9;
      dip = Math.sin(G.time * 2.2) * 1.2;
    }
  }

  const squash = p.landSquash > 0 ? p.landSquash : 0;
  const sq = 1 - squash * 0.16;
  const feetY = p.y;
  const hipY = feetY - 40 * sq + dip;
  const hipX = p.x;
  const leanR = lean * f;
  const neckX = hipX + Math.sin(leanR) * 34 * f * (lean === 0 ? 0 : 1) + leanR * 14;
  const neckY = hipY - 34 * sq * (1 - Math.abs(leanR) * 0.2);
  // 头
  const headX = neckX + Math.sin(leanR) * 12 * f;
  const headY = neckY - 12 * sq;
  // 手（局部 → 世界）
  const shX = neckX - f * 2, shY = neckY + 5;
  const handLX = shX + f * hx, handLY = shY + hy;
  const armF = ik(shX, shY, handLX, handLY, 15, 15, f > 0 ? 1 : -1);
  const shBX = neckX - f * 5, shBY = neckY + 6;
  const handBLX = shBX + f * armBx, handBLY = shBY + armBy;
  const armB = ik(shBX, shBY, handBLX, handBLY, 14, 14, f > 0 ? 1 : -1);
  // 腿
  let footF, footB;
  if (p.dead){
    footF = { tx: hipX + f * 30, ty: feetY - 2 }; footB = { tx: hipX - f * 10, ty: feetY - 2 };
  } else if (p.air || p.dashT > 0){
    if (p.diving){
      footF = { tx: hipX - f * 14, ty: feetY - 26 }; footB = { tx: hipX - f * 24, ty: feetY - 18 };
    } else if (p.vy < -80){
      footF = { tx: hipX + f * 10, ty: feetY - 22 }; footB = { tx: hipX - f * 12, ty: feetY - 8 };
    } else {
      footF = { tx: hipX + f * 6, ty: feetY - 14 }; footB = { tx: hipX - f * 14, ty: feetY - 4 };
    }
  } else if (Math.abs(p.vx) > 30){
    const ph = p.runPhase;
    footF = { tx: hipX + f * Math.sin(ph) * 17, ty: feetY - Math.max(0, -Math.cos(ph)) * 9 };
    footB = { tx: hipX + f * Math.sin(ph + PI) * 17, ty: feetY - Math.max(0, -Math.cos(ph + PI)) * 9 };
  } else {
    footF = { tx: hipX + f * 7, ty: feetY };
    footB = { tx: hipX - f * 7, ty: feetY };
  }
  const legF = ik(hipX, hipY, footF.tx, footF.ty, 21, 21, f > 0 ? 1 : -1);
  const legB = ik(hipX, hipY, footB.tx, footB.ty, 21, 21, f > 0 ? 1 : -1);

  const baWorld = f > 0 ? ba : PI - ba;
  const tipX = armF.tx + Math.cos(baWorld) * 56;
  const tipY = armF.ty + Math.sin(baWorld) * 56;

  const sk = {
    hipX, hipY, neckX, neckY, headX, headY, shX, shY,
    armF, armB, legF, legB, baWorld, tipX, tipY,
    handX: armF.tx, handY: armF.ty, lean, dip, f,
  };
  poseCache = sk;
  return sk;
}

/* ---------------- 玩家绘制 ---------------- */
function drawPlayer(rt){
  const p = P;
  const sk = computeSkeleton(p);
  const f = p.facing;
  // 受击闪烁（半透明）；死亡后缓慢淡出
  const blink = p.iFrames > 0 && p.hitstun <= 0 && !p.dead && Math.sin(G.rtime * 40) > 0;
  let bodyAlpha = blink ? 0.45 : 1;
  if (p.dead){
    bodyAlpha = clamp(1 - (p.deadT - 1.8) / 0.8, 0, 1);
    if (bodyAlpha <= 0) return;
  }

  // 阴影
  ctx.globalAlpha = bodyAlpha * 0.8;
  drawShadow(p.x, Math.min(p.y, GROUND_Y) === p.y ? p.y : GROUND_Y, 20 * (1 - clamp((GROUND_Y - p.y) / 400, 0, 0.7)));

  // 残影
  for (const a of p.afterimages){
    const age = G.rtime - a.t;
    if (age > 0.24) continue;
    const al = (1 - age / 0.24) * 0.3;
    ctx.globalAlpha = al;
    ctx.fillStyle = '#7ea2ff';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y - 44, 11, 30, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#a8c2ff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(a.hx, a.hy);
    ctx.lineTo(a.hx + Math.cos(a.ba) * 50, a.hy + Math.sin(a.ba) * 50);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  p.afterimages = p.afterimages.filter(a => G.rtime - a.t < 0.3);

  // ---- 围巾（后层）----
  ctx.globalAlpha = bodyAlpha;
  drawScarf();

  // ---- 后臂 ----
  strokeCap(sk.shX - f * 4, sk.shY + 2, sk.armB.ex, sk.armB.ey, 4.4, '#b9bede');
  strokeCap(sk.armB.ex, sk.armB.ey, sk.armB.tx, sk.armB.ty, 3.8, '#cfd3ea');

  // ---- 后腿 ----
  strokeCap(sk.hipX, sk.hipY, sk.legB.ex, sk.legB.ey, 6, '#565b86');
  strokeCap(sk.legB.ex, sk.legB.ey, sk.legB.tx, sk.legB.ty, 5, '#6a6f9d');
  // 后脚
  strokeCap(sk.legB.tx, sk.legB.ty, sk.legB.tx + f * 6, sk.legB.ty - 1, 3.2, '#2c3050');

  // ---- 身体（和服）----
  const bodyLean = sk.lean * f;
  ctx.save();
  ctx.translate(sk.hipX, sk.hipY);
  ctx.rotate(bodyLean * 0.6);
  // 下摆
  const hemSw = clamp(-p.vx * 0.035, -10, 10) + Math.sin(G.time * 6) * 1.6;
  ctx.fillStyle = '#e8e6f4';
  ctx.beginPath();
  ctx.moveTo(-f * 11, -2);
  ctx.quadraticCurveTo(-f * (15 + hemSw * 0.4), 16, -f * (13 + hemSw), 26);
  ctx.lineTo(f * (10 + hemSw * 0.7), 24);
  ctx.quadraticCurveTo(f * 13, 10, f * 11, -2);
  ctx.closePath();
  ctx.fill();
  // 躯干
  const torsoG = ctx.createLinearGradient(0, -40, 0, 4);
  torsoG.addColorStop(0, '#f2f0fa');
  torsoG.addColorStop(1, '#d9d8ec');
  ctx.fillStyle = torsoG;
  ctx.beginPath();
  ctx.moveTo(-f * 10, 0);
  ctx.quadraticCurveTo(-f * 12, -22, -f * 9, -36);
  ctx.lineTo(f * 9, -36);
  ctx.quadraticCurveTo(f * 12, -22, f * 10, 0);
  ctx.closePath();
  ctx.fill();
  // 衣领与腰带
  ctx.strokeStyle = '#3a3f66';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-f * 8, -34); ctx.lineTo(f * 5, -26); ctx.stroke();
  ctx.strokeStyle = '#b8354a';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(-f * 10, -6); ctx.lineTo(f * 10, -6); ctx.stroke();
  ctx.restore();

  // ---- 前腿 ----
  strokeCap(sk.hipX, sk.hipY, sk.legF.ex, sk.legF.ey, 6.4, '#6a6f9d');
  strokeCap(sk.legF.ex, sk.legF.ey, sk.legF.tx, sk.legF.ty, 5.4, '#7d82ad');
  strokeCap(sk.legF.tx, sk.legF.ty, sk.legF.tx + f * 7, sk.legF.ty - 1, 3.4, '#343a5e');

  // ---- 头 ----
  drawHair(sk, f);
  ctx.fillStyle = '#f5d9c4';
  ctx.beginPath(); ctx.arc(sk.headX, sk.headY, 10.5, 0, TAU); ctx.fill();
  // 发髻
  ctx.fillStyle = '#23263f';
  ctx.beginPath(); ctx.arc(sk.headX - f * 3, sk.headY - 9, 5.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(sk.headX - f * 8, sk.headY - 5, 3.6, 0, TAU); ctx.fill();
  // 眼睛（一条利落的线）
  ctx.strokeStyle = '#1c1f33';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(sk.headX + f * 2, sk.headY - 1);
  ctx.lineTo(sk.headX + f * 8, sk.headY - 1 + (p.dead ? 2 : 0));
  ctx.stroke();
  // 红色发饰
  ctx.fillStyle = '#d8354a';
  ctx.beginPath(); ctx.arc(sk.headX - f * 6.5, sk.headY - 11, 2.1, 0, TAU); ctx.fill();

  // ---- 前臂 + 刀 ----
  strokeCap(sk.shX, sk.shY, sk.armF.ex, sk.armF.ey, 4.8, '#d9d8ec');
  strokeCap(sk.armF.ex, sk.armF.ey, sk.handX, sk.handY, 4.2, '#f2f0fa');
  // 手
  ctx.fillStyle = '#f5d9c4';
  ctx.beginPath(); ctx.arc(sk.handX, sk.handY, 3.4, 0, TAU); ctx.fill();
  drawBlade(sk, p);

  ctx.globalAlpha = 1;

  // ---- 刀光拖尾 ----
  drawTrail();
}

function drawBlade(sk, p){
  const a = sk.baWorld;
  const hx = sk.handX, hy = sk.handY;
  const gx = Math.cos(a), gy = Math.sin(a);
  // 柄
  strokeCap(hx - gx * 7, hy - gy * 7, hx, hy, 3.6, '#2b2b3f');
  // 护手
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  ctx.fillStyle = '#c9a44c';
  ctx.fillRect(-1.6, -5.4, 3.2, 10.8);
  ctx.restore();
  // 刃
  const bx = hx + gx * 4, by = hy + gy * 4;
  const tx = hx + gx * 58, ty = hy + gy * 58;
  const glow = p.charging ? clamp(p.chargeT / 0.85, 0, 1) : (p.move ? 1 : 0.25);
  const full = p.charging && p.chargeT >= 0.82;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.28 + glow * 0.45;
  ctx.strokeStyle = full ? '#ff5a66' : '#bcd2ff';
  ctx.lineWidth = 7 + glow * 7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.restore();
  const bg = ctx.createLinearGradient(bx, by, tx, ty);
  bg.addColorStop(0, '#c8d2e8');
  bg.addColorStop(0.55, '#f4f7ff');
  bg.addColorStop(1, '#ffffff');
  ctx.strokeStyle = bg;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
  // 刃尖偶尔闪光
  if (!p.move && Math.random() < 0.012) flashFx(tx, ty, 10, 0.2, '220,235,255');
  // 破军状态红光
  if (G.gaugeFull && !p.charging && Math.random() < 0.3){
    spawnP({ kind: 'ember', x: lerp(bx, tx, Math.random()), y: lerp(by, ty, Math.random()), vx: 0, vy: -20, g: 0, drag: 1, life: 0.3, size: 2, col: '#ff8090' });
  }
}

function drawTrail(){
  const tr = P.trail;
  const cutoff = G.rtime - 0.15;
  while (tr.length && tr[0].t < cutoff) tr.shift();
  if (tr.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < tr.length; i++){
    const a = tr[i - 1], b = tr[i];
    const age = G.rtime - b.t;
    const al = clamp(1 - age / 0.15, 0, 1);
    if (al <= 0) continue;
    // 宽拖尾（朱红）
    ctx.strokeStyle = 'rgba(255,80,100,' + (al * 0.36) + ')';
    ctx.lineWidth = 13 * al;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(b.x1, b.y1); ctx.stroke();
    // 白芯
    ctx.strokeStyle = 'rgba(255,255,255,' + (al * 0.85) + ')';
    ctx.lineWidth = 4.6 * al;
    ctx.beginPath(); ctx.moveTo(a.x2, a.y2); ctx.lineTo(b.x2, b.y2); ctx.stroke();
  }
  ctx.restore();
}

function drawScarf(){
  const s = P.scarf;
  if (s.length < 3) return;
  ctx.beginPath();
  // 一侧
  for (let i = 0; i < s.length; i++){
    const n = s[i];
    const prev = s[Math.max(0, i - 1)], next = s[Math.min(s.length - 1, i + 1)];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    const w = lerp(4.6, 1.2, i / s.length);
    const px = -dy / d * w, py = dx / d * w;
    if (i === 0) ctx.moveTo(n.x + px, n.y + py);
    else ctx.lineTo(n.x + px, n.y + py);
  }
  for (let i = s.length - 1; i >= 0; i--){
    const n = s[i];
    const prev = s[Math.max(0, i - 1)], next = s[Math.min(s.length - 1, i + 1)];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    const w = lerp(4.6, 1.2, i / s.length);
    const px = -dy / d * w, py = dx / d * w;
    ctx.lineTo(n.x - px, n.y - py);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(s[0].x, s[0].y, s[s.length - 1].x, s[s.length - 1].y);
  sg.addColorStop(0, '#e04358');
  sg.addColorStop(1, '#8f2436');
  ctx.fillStyle = sg;
  ctx.fill();
}

function drawHair(sk, f){
  const h = P.hair;
  if (h.length >= 2){
    ctx.strokeStyle = '#23263f';
    ctx.lineWidth = lerp(4, 1.6, 1);
    ctx.lineCap = 'round';
    for (let i = 1; i < h.length; i++){
      ctx.lineWidth = 4.6 - i;
      ctx.beginPath();
      ctx.moveTo(h[i - 1].x, h[i - 1].y);
      ctx.lineTo(h[i].x, h[i].y);
      ctx.stroke();
    }
  }
}

function drawShadow(x, y, r){
  ctx.fillStyle = 'rgba(4,6,14,0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y + 3, r, r * 0.26, 0, 0, TAU);
  ctx.fill();
}

/* 满蓄力“满月斩”的月牙特效 */
function spawnCrescentFx(){
  const x = P.x + P.facing * 74, y = P.y - 52;
  spawnP({ kind: 'crescent', x, y, rot: P.facing > 0 ? 0 : PI, size: 88, life: 0.3, t: 0, col: '#ff5a66', g: 0 });
}
