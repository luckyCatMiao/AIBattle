'use strict';
/* ============================================================
   斩骸夜行 —— 03 敌人层
   木偶刀客 / 木偶弓手 / 重锤傀儡
   分段肢体（头/双臂/双腿）可被打断飞散，断肢改变行为
   ============================================================ */

const ENEMY_CFG = {
  blade:  { w: 36, h: 92,  hp: 46,  speed: 95, poise: 30,  dmg: 12, name: '刀偶' },
  archer: { w: 32, h: 84,  hp: 34,  speed: 82, poise: 18,  dmg: 9,  name: '弓偶' },
  brute:  { w: 56, h: 140, hp: 132, speed: 54, poise: 130, dmg: 18, name: '锤傀儡' },
};

function spawnEnemy(type, x, opts){
  opts = opts || {};
  const c = ENEMY_CFG[type];
  const scale = 1 + Math.max(0, G.wave - 7) * 0.07;
  const e = {
    type, cfg: c,
    x, y: (opts.platformY || GROUND_Y) - 250,
    vx: 0, vy: 0, w: c.w, h: c.h,
    hp: Math.round(c.hp * scale), maxHp: Math.round(c.hp * scale),
    dmg: Math.round(c.dmg * (1 + Math.max(0, G.wave - 7) * 0.05)),
    facing: x > P.x ? -1 : 1,
    state: 'spawn', stateT: 0, t: 0,
    cd: rnd(0.4, 1.1), flash: 0, flinchT: 0,
    airborne: false, launched: false, rot: 0, vr: 0,
    poise: 0, staggerT: 0, lieT: 0,
    walkPhase: 0, hpShowT: 0, frenzy: false, jumpCd: 0, recoil: 0, bounced: false,
    attackKind: null, windupDur: 0, telegraphed: false,
    swTrail: [], dead: false, aimAng: 0, hitDone: false,
    platformY: opts.platformY || null,
    parts: {
      head:  { alive: true, hp: 26 },
      armL:  { alive: true, hp: 30 },
      armR:  { alive: true, hp: 34 },
      legL:  { alive: true, hp: 30 },
      legR:  { alive: true, hp: 30 },
    },
    weaponArm: 'armR',
    legsBroken: 0, armsBroken: 0,
  };
  if (type === 'brute'){ e.parts.armR.hp = 46; e.parts.armL.hp = 42; e.parts.legL.hp = 44; e.parts.legR.hp = 44; e.parts.head.hp = 34; }
  if (opts.platformY){ e.platformY = opts.platformY; e.platformX = opts.platformX || x; e.platformHalf = opts.platformHalf || 90; }
  G.enemies.push(e);
  dust(x, opts.platformY || GROUND_Y, 4, 0.8, 0);
  return e;
}

function enemyHasWeapon(e){
  return e.parts[e.weaponArm] && e.parts[e.weaponArm].alive;
}
function enemySpeedMul(e){
  let m = 1;
  if (e.legsBroken === 1) m *= 0.5;
  if (e.legsBroken >= 2) m *= 0.22;
  if (e.frenzy) m *= 1.4;
  return m;
}

/* ---------------- 断肢 ---------------- */
function limbPoly(kind, s){
  // 相对断口的局部多边形（带锯齿断口）
  const p = {
    arm:  [[-5, -6], [2, -8], [7, -3], [4, 3], [1, 8], [-3, 6]],
    leg:  [[-6, -7], [3, -9], [8, -3], [5, 4], [2, 9], [-4, 7]],
    head: [[-9, -8], [9, -8], [10, 2], [4, 7], [-3, 9], [-10, 3]],
  }[kind];
  return p.map(q => [q[0] * s, q[1] * s]);
}
function breakPart(e, name, dir, cx, cy){
  const part = e.parts[name];
  if (!part || !part.alive) return;
  part.alive = false;
  G.limbBreaks++;
  doHitStop(0.12);
  addShake(0.3, dir);
  sfx('crack');
  cutLine(cx, cy, rnd(-0.6, 0.6) + (dir > 0 ? 0.4 : PI - 0.4), rnd(60, 110), 0.2, '#ff4d5e');
  chips(cx, cy, 9, '#9c6f4a');
  sparks(cx, cy, 8, dir, '#ffd9a0', 380);
  flashFx(cx, cy, 34, 0.16, '255,210,160');
  addText(cx, cy - 26, '断', '#ff5a66', 24, -30, 0.7);
  addGauge(10);

  // 断肢飞散
  const kind = name === 'head' ? 'head' : (name === 'armL' || name === 'armR') ? 'arm' : 'leg';
  const s = e.type === 'brute' ? 1.5 : 1;
  const pts = limbPoly(kind, s);
  spawnDebrisPoly(cx, cy, pts, dir * rnd(160, 340), -rnd(260, 460), '#8a6244', '#3c2a1e', kind !== 'arm');

  // 武器随手臂脱落
  if (name === e.weaponArm){
    dropWeapon(e, cx, cy, dir);
    addText(e.x, e.y - e.h - 22, e.type === 'archer' ? '弓断' : '缴械', '#ffd76a', 15, -26, 0.9);
  }
  // 能力结算
  e.armsBroken = (e.parts.armL.alive ? 0 : 1) + (e.parts.armR.alive ? 0 : 1);
  e.legsBroken = (e.parts.legL.alive ? 0 : 1) + (e.parts.legR.alive ? 0 : 1);
  if (name === 'head'){
    e.frenzy = true;
    e.staggerT = Math.max(e.staggerT, 0.85);
    addText(e.x, e.y - e.h - 20, '狂乱', '#ff8066', 15, -26, 0.9);
  } else {
    e.staggerT = Math.max(e.staggerT, 0.7);
  }
  // 打断当前攻击
  if (e.state === 'windup' || e.state === 'attack'){
    e.state = 'stagger'; e.stateT = 0;
    for (let i = G.hitboxes.length - 1; i >= 0; i--) if (G.hitboxes[i].src === e) G.hitboxes.splice(i, 1);
  }
}
function dropWeapon(e, cx, cy, dir){
  const pts = e.type === 'archer'
    ? [[-16, -2], [10, -14], [16, -10], [-10, 4]]
    : e.type === 'brute'
      ? [[-22, -3], [14, -8], [22, -2], [16, 8], [-18, 5]]
      : [[-14, -2], [26, -4], [30, 1], [12, 4], [-12, 3]];
  spawnDebrisPoly(cx, cy - 10, pts, dir * rnd(80, 220), -rnd(240, 400), '#6a4c34', '#2b1d12', true);
}

/* ---------------- 死亡：整体碎裂 ---------------- */
function killEnemy(e, dir){
  if (e.dead) return;
  e.dead = true;
  G.kills++;
  addGauge(12);
  sfx('shatter');
  doHitStop(0.16);
  addShake(0.42, dir);
  const cx = e.x, cy = e.y - e.h * 0.5;
  // 全部残余肢体爆散
  const names = { head: 'head', armL: 'arm', armR: 'arm', legL: 'leg', legR: 'leg' };
  for (const n in e.parts){
    if (!e.parts[n].alive) continue;
    const kind = names[n];
    const off = { head: [0, -e.h * 0.86], armL: [-e.w * 0.5, -e.h * 0.66], armR: [e.w * 0.5, -e.h * 0.66], legL: [-e.w * 0.25, -e.h * 0.18], legR: [e.w * 0.25, -e.h * 0.18] }[n];
    const s = e.type === 'brute' ? 1.5 : 1;
    spawnDebrisPoly(e.x + off[0], e.y + off[1], limbPoly(kind, s),
      (off[0] * 3 + dir * rnd(120, 300)), -rnd(260, 520), '#8a6244', '#3c2a1e', true);
  }
  if (enemyHasWeapon(e)) dropWeapon(e, e.x + e.facing * e.w * 0.5, e.y - e.h * 0.6, dir);
  // 躯干碎块
  for (let i = 0; i < 10; i++){
    spawnP({ kind: 'shard', x: e.x + rnd(-14, 14), y: cy + rnd(-20, 20), vx: dir * rnd(60, 420) + rnd(-140, 140), vy: -rnd(120, 480), g: 1000, drag: 0.4, life: rnd(0.6, 1.2), size: rnd(4, 9), rot: rnd(0, TAU), vr: rnd(-16, 16), col: '#75523a' });
  }
  chips(cx, cy, 16, '#9c6f4a');
  sparks(cx, cy, 16, dir, '#ffe2b0', 460);
  flashFx(cx, cy, 66, 0.22, '255,220,170');
  ring(cx, cy, 12, 110, 0.4, '255,190,140', 4);
  dust(e.x, e.y, 8, 1.2, dir);
  // 终结时刻的慢镜（重敌或清波）
  const aliveLeft = G.enemies.filter(x => !x.dead).length - 1;
  if (e.type === 'brute' || aliveLeft <= 0) slowmo(0.42, 0.35);
  else slowmo(0.14, 0.55);
  for (let i = G.hitboxes.length - 1; i >= 0; i--) if (G.hitboxes[i].src === e) G.hitboxes.splice(i, 1);
}

/* ---------------- 受击结算 ---------------- */
function pickPart(e, hy){
  const r = (e.y - hy) / e.h;   // 0 脚 → 1 头
  if (r > 0.8) return e.parts.head.alive ? 'head' : null;
  if (r > 0.42){
    const arms = [];
    if (e.parts.armL.alive) arms.push('armL');
    if (e.parts.armR.alive) arms.push('armR');
    if (!arms.length) return null;
    // 攻击来自正面时更常打断持械臂
    if (arms.includes(e.weaponArm) && Math.random() < 0.62) return e.weaponArm;
    return pick(arms);
  }
  const legs = [];
  if (e.parts.legL.alive) legs.push('legL');
  if (e.parts.legR.alive) legs.push('legR');
  return legs.length ? pick(legs) : null;
}

function damageEnemy(e, hb){
  if (e.dead) return;
  const rect = hb.rect();
  const cx = clamp((rect.l + rect.r) / 2, e.x - e.w / 2, e.x + e.w / 2);
  const cy = clamp((rect.t + rect.b) / 2, e.y - e.h, e.y);
  let dmg = hb.dmg;
  const dir = sgn(e.x - P.x) || P.facing;

  // 破军（剑气满时下一次命中强化）
  let wasPojun = false;
  if (G.gaugeFull){
    G.gaugeFull = false; G.gauge = 0;
    dmg *= 2.2;
    wasPojun = true;
    flashFx(cx, cy, 80, 0.25, '255,120,130');
    ring(cx, cy, 10, 150, 0.45, '255,110,120', 5);
    sparks(cx, cy, 18, dir, '#ff8090', 520);
    addText(cx, cy - 44, '破军', '#ff5a66', 27, -34, 1);
    sfx('hitHeavy');
  }
  if (e.airborne) dmg *= 1.15;
  if (e.frenzy) dmg *= 1.4;

  e.hp -= dmg;
  e.hpShowT = 3.2;
  e.flash = 0.09;
  G.hits++;
  G.combo++;
  G.comboT = 2.2;
  G.comboShowT = 1.5;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  comboPop = 1;
  addGauge(hb.heavy ? 5 : 2.2);

  // 反馈分级
  const hs = hb.hs + (hb.heavy ? 0.01 : 0);
  doHitStop(hs);
  addShake(hb.heavy ? 0.26 : 0.1, dir);
  if (hb.heavy){ sfx('hitHeavy'); addZoom(0.5); } else sfx('hit');
  sparks(cx, cy, hb.heavy ? 12 : 7, dir, '#ffe2b0', hb.heavy ? 460 : 340);
  chips(cx, cy, hb.heavy ? 7 : 4);
  flashFx(cx, cy, hb.heavy ? 42 : 26, 0.12, '255,235,190');
  cutLine(cx, cy, rnd(-0.5, 0.5) + (dir > 0 ? 0.3 : PI - 0.3), rnd(36, 70), 0.14, '#ffd9a0');
  petalBlast(cx, cy, 60, dir);
  if (dmg >= 15 || hb.heavy) addDmg(cx, cy - e.h * 0.6, Math.round(dmg), dmg >= 26);

  // 击退 / 击飞
  e.vx = dir * hb.kb * (e.type === 'brute' ? 0.45 : 1);
  if (hb.spike && e.airborne){
    e.vy = 1050; e.launched = false; e.airborne = true;
    doHitStop(0.1); addShake(0.2, dir);
  } else if (hb.kbY){
    const canLift = e.type !== 'brute' || hb.forceLaunch;
    if (canLift){
      e.vy = -hb.kbY * (e.type === 'brute' ? 0.55 : 1);
      e.airborne = true;
      e.launched = !!hb.launcher || !!hb.forceLaunch;
      e.vr = dir * rnd(3.5, 7);
    }
  } else if (e.airborne && hb.air){
    // 空中连击滞空
    e.vy = Math.min(e.vy, -170);
    e.launched = true;
  }

  // 韧性 / 硬直
  const poiseDmg = dmg * (hb.heavy ? 2.2 : 1);
  e.poise += poiseDmg;
  e.flinchT = 0.15;
  if (e.poise >= e.cfg.poise || (e.state !== 'attack' && hb.heavy && e.type !== 'brute')){
    e.poise = 0;
    e.slamPending = undefined;
    e.staggerT = Math.max(e.staggerT, e.type === 'brute' ? 0.6 : 0.5);
    if (e.state === 'windup' || e.state === 'attack'){
      for (let i = G.hitboxes.length - 1; i >= 0; i--) if (G.hitboxes[i].src === e) G.hitboxes.splice(i, 1);
    }
  }

  // 肢体部位损伤（连段第 4 击加成 → 连段打断）
  let broke = false;
  const partName = pickPart(e, cy);
  if (partName){
    const comboBonus = (G.combo % 4 === 0) ? 1.6 : 1;
    e.parts[partName].hp -= dmg * (hb.partMul || 1) * comboBonus;
    if (e.parts[partName].hp <= 0){
      breakPart(e, partName, dir, cx, cy);
      broke = true;
    }
  }
  // 破军 / 满蓄力重斩 / 弹反追斩 / 落月：必断最脆弱的存活肢体
  if (!broke && (wasPojun || hb.riposte || hb.meteor || dmg >= 45)){
    let weakest = null;
    for (const n of ['armR', 'armL', 'legL', 'legR', 'head']){
      if (e.parts[n].alive && (!weakest || e.parts[n].hp < e.parts[weakest].hp)) weakest = n;
    }
    if (weakest){
      breakPart(e, weakest, dir, cx + rnd(-10, 10), cy + rnd(-14, 8));
    }
  }

  if (e.hp <= 0) killEnemy(e, dir);
}

function damageEnemyLight(e, dmg, dir, cx, cy){
  if (e.dead) return;
  e.hp -= dmg;
  e.hpShowT = 3;
  e.flash = 0.07;
  e.flinchT = 0.12;
  e.vx += dir * 120;
  if (e.type !== 'brute'){ e.vy = Math.min(e.vy, -120); e.airborne = true; e.launched = true; }
  sparks(cx, cy, 4, dir, '#ffe2b0', 260);
  chips(cx, cy, 3);
  if (e.hp <= 0) killEnemy(e, dir);
}

/* ---------------- 敌人 AI ---------------- */
function updateEnemies(dt){
  const p = P;
  for (let i = G.enemies.length - 1; i >= 0; i--){
    const e = G.enemies[i];
    if (e.dead){ G.enemies.splice(i, 1); continue; }
    e.t += dt;
    e.stateT += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.flinchT = Math.max(0, e.flinchT - dt);
    e.hpShowT = Math.max(0, e.hpShowT - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.jumpCd = Math.max(0, (e.jumpCd || 0) - dt);
    e.recoil = Math.max(0, (e.recoil || 0) - dt);
    e.poise = Math.max(0, e.poise - dt * 24);
    // 拖尾衰减
    while (e.swTrail.length && G.rtime - e.swTrail[0].t > 0.16) e.swTrail.shift();

    const dx = p.x - e.x;
    const adx = Math.abs(dx);

    /* --- 出生空降 --- */
    if (e.state === 'spawn'){
      e.vy += 1300 * dt;
      e.y += e.vy * dt;
      e.rot = Math.sin(e.t * 6) * 0.1;
      const floor = e.platformY || GROUND_Y;
      if (e.y >= floor){
        e.y = floor; e.vy = 0; e.rot = 0;
        e.state = 'crouch'; e.stateT = 0;
        dust(e.x, e.y, 7, 1.1, 0);
        addShake(0.1);
        sfx('spawn');
        ring(e.x, e.y, 6, 46, 0.3, '200,180,140', 2);
      }
      continue;
    }
    if (e.state === 'crouch'){
      if (e.stateT > 0.26){ e.state = 'idle'; e.stateT = 0; }
      continue;
    }

    /* --- 被击飞 / 倒地 --- */
    if (e.airborne){
      e.vy += (e.launched ? 760 : 1300) * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= Math.max(0, 1 - dt * 0.8);
      e.rot += e.vr * dt;
      if (e.launched) e.vr *= Math.max(0, 1 - dt * 0.4);
      // 平台判定：仍在平台范围内则落回平台，否则落到地面
      let land = GROUND_Y;
      if (e.platformY && Math.abs(e.x - e.platformX) < (e.platformHalf || 90)) land = e.platformY;
      if (e.y >= land){
        e.y = land;
        if (Math.abs(e.vy) > 430 && !e.bounced && e.type !== 'brute'){
          e.vy *= -0.32; e.bounced = true;
          dust(e.x, e.y, 5, 1, 0); sfx('bounce'); addShake(0.12);
        } else {
          e.vy = 0; e.bounced = false;
          e.airborne = false; e.launched = false; e.vr = 0;
          dust(e.x, e.y, 5, 1, 0);
          if (e.type === 'brute'){ e.rot = 0; e.staggerT = Math.max(e.staggerT, 0.6); e.state = 'idle'; addShake(0.2); sfx('land'); }
          else { e.state = 'lie'; e.stateT = 0; e.rot = (e.rot > 0 ? 1 : -1) * PI / 2; }
        }
      }
      continue;
    }
    if (e.state === 'lie'){
      e.vx *= Math.max(0, 1 - dt * 6);
      if (e.stateT > 0.5){ e.state = 'getup'; e.stateT = 0; }
      continue;
    }
    if (e.state === 'getup'){
      e.rot = lerp(e.rot, 0, Math.min(1, e.stateT / 0.4));
      if (e.stateT > 0.42){ e.rot = 0; e.state = 'idle'; e.stateT = 0; e.cd = Math.max(e.cd, 0.4); }
      continue;
    }
    if (e.state === 'stagger' || e.staggerT > 0){
      e.staggerT -= dt;
      e.state = 'stagger';
      e.vx *= Math.max(0, 1 - dt * 5);
      e.x += e.vx * dt;
      if (e.staggerT <= 0){ e.state = 'idle'; e.stateT = 0; }
      continue;
    }

    /* --- 硬直打断攻击姿态 --- */
    e.rot = lerp(e.rot, 0, Math.min(1, dt * 8));

    const spd = e.cfg.speed * enemySpeedMul(e);

    /* ===================== 类型行为 ===================== */
    if (e.type === 'blade') updateBlade(e, dt, dx, adx, spd);
    else if (e.type === 'archer') updateArcher(e, dt, dx, adx, spd);
    else updateBrute(e, dt, dx, adx, spd);

    /* --- 公共物理 --- */
    if (e.state === 'walk' || e.state === 'idle'){
      e.x += e.vx * dt;
      e.walkPhase += Math.abs(e.vx) * dt * 0.06;
      if (Math.abs(e.vx) > 30 && Math.random() < dt * 4) dust(e.x - sgn(e.vx) * 8, e.y, 1, 0.5, -sgn(e.vx));
    } else if (e.state === 'lunge'){
      e.x += e.vx * dt;
      e.walkPhase += Math.abs(e.vx) * dt * 0.09;
    } else if (e.state === 'windup' || e.state === 'recover' || e.state === 'attack'){
      e.vx *= Math.max(0, 1 - dt * 6);
      e.x += e.vx * dt;
    }
    // 走出平台边缘 → 落下
    if (!e.airborne && e.platformY && Math.abs(e.x - e.platformX) > (e.platformHalf || 90) + 6){
      e.airborne = true;
      e.platformY = null;
      e.vy = 40;
    }
    // 边界
    e.x = clamp(e.x, 60, ARENA_W - 60);
    // 同伴间轻微排开
    for (const o of G.enemies){
      if (o === e || o.dead || o.airborne) continue;
      const d = e.x - o.x;
      const minD = (e.w + o.w) * 0.4;
      if (Math.abs(d) < minD && Math.abs(e.y - o.y) < 40){
        e.x += sgn(d || 1) * 30 * dt;
      }
    }
  }
}

/* ---------- 刀偶 ---------- */
function updateBlade(e, dt, dx, adx, spd){
  const p = P;
  const weapon = enemyHasWeapon(e);
  if (p.dead){
    if (e.state !== 'idle' && e.state !== 'walk'){ e.state = 'idle'; e.stateT = 0; }
    e.vx = 0;
    if (adx > 90){ e.state = 'walk'; e.vx = sgn(dx) * spd * 0.5; e.facing = sgn(dx) || 1; }
    else e.facing = sgn(dx) || 1;
    return;
  }
  switch (e.state){
    case 'idle': case 'walk': {
      e.facing = sgn(dx) || 1;
      // 玩家在头顶的高台上 → 跳
      if (p.y < e.y - 70 && adx < 150 && !e.airborne && e.jumpCd <= 0 && Math.random() < dt * 2){
        e.vy = -560; e.airborne = true; e.vx = sgn(dx) * 180; e.jumpCd = 1.6;
        dust(e.x, e.y, 4, 0.8, 0);
        return;
      }
      const range = weapon ? 72 : 46;
      if (adx > range){
        e.state = 'walk';
        e.vx = sgn(dx) * spd;
      } else {
        e.vx *= 0.8;
        if (e.cd <= 0){
          e.state = 'windup';
          e.stateT = 0;
          e.attackKind = weapon ? (p.y < e.y - 55 && adx < 120 ? 'upslash' : 'slash') : 'lunge';
          e.windupDur = weapon ? (e.frenzy ? 0.34 : 0.55) : 0.4;
          if (!e.telegraphed){ e.telegraphed = true; sfx('draw'); }
        } else e.state = 'idle';
      }
      break;
    }
    case 'windup': {
      // 前摇 65% 后锁方向（可被绕后）
      if (e.stateT < e.windupDur * 0.65) e.facing = sgn(dx) || 1;
      if (e.attackKind === 'lunge'){
        e.vx = -e.facing * 60; // 后撤蓄力
      }
      if (e.stateT >= e.windupDur){
        e.state = e.attackKind === 'lunge' ? 'lunge' : 'attack';
        e.stateT = 0;
        e.hitDone = false;
        e.swTrail.length = 0;
        if (e.attackKind === 'lunge'){
          e.vx = e.facing * 430;
          addEnemyHit(e, { ox0: -e.w * 0.4, reach: e.w * 0.9, ly0: -e.h * 0.85, ly1: 0, dur: 0.34, dmg: Math.round(e.dmg * 0.85), kb: 330, vy: -240 });
          dust(e.x, e.y, 4, 0.8, e.facing);
        } else if (e.attackKind === 'upslash'){
          sfx('swingUp');
          addEnemyHit(e, { ox0: -10, reach: 108, ly0: -e.h - 60, ly1: -10, dur: 0.15, dmg: e.dmg, kb: 220, vy: -420 });
        } else {
          sfx('swing');
          addEnemyHit(e, { ox0: 6, reach: 100, ly0: -e.h * 0.82, ly1: -6, dur: 0.14, dmg: e.dmg, kb: 270, vy: -180 });
        }
      }
      break;
    }
    case 'attack': {
      sampleEnemyTrail(e);
      if (e.stateT > 0.24){ e.state = 'recover'; e.stateT = 0; e.cd = rnd(1.0, 1.6) * (e.frenzy ? 0.6 : 1); e.telegraphed = false; }
      break;
    }
    case 'lunge': {
      sampleEnemyTrail(e);
      if (e.stateT > 0.34){ e.state = 'recover'; e.stateT = 0; e.cd = rnd(1.3, 1.9); e.telegraphed = false; e.vx = 0; }
      break;
    }
    case 'recover': {
      if (e.stateT > (enemyHasWeapon(e) ? 0.55 : 0.5)){ e.state = 'idle'; e.stateT = 0; }
      break;
    }
  }
}

/* ---------- 弓偶 ---------- */
function updateArcher(e, dt, dx, adx, spd){
  const p = P;
  if (p.dead){ e.vx = 0; e.facing = sgn(dx) || 1; if (e.state !== 'idle'){ e.state = 'idle'; e.stateT = 0; } return; }
  const weapon = enemyHasWeapon(e);
  switch (e.state){
    case 'idle': case 'walk': {
      e.facing = sgn(dx) || 1;
      if (!weapon){
        // 断弓后转为近战扑咬
        if (adx > 52){ e.state = 'walk'; e.vx = sgn(dx) * spd * 1.15; }
        else if (e.cd <= 0){
          e.state = 'windup'; e.stateT = 0; e.attackKind = 'claw'; e.windupDur = e.frenzy ? 0.26 : 0.42;
          if (!e.telegraphed){ e.telegraphed = true; sfx('draw'); }
        } else { e.state = 'idle'; e.vx *= 0.8; }
        break;
      }
      // 保持距离带
      if (adx < 240){
        e.state = 'walk';
        e.vx = -sgn(dx) * spd * 1.2;
        // 太近 → 后跳
        if (adx < 130 && e.cd <= 0.2 && !e.airborne && Math.random() < dt * 3){
          e.vy = -380; e.airborne = true; e.vx = -sgn(dx) * 260; e.jumpCd = 1;
          dust(e.x, e.y, 4, 0.8, 0);
        }
      } else if (adx > 520){
        e.state = 'walk'; e.vx = sgn(dx) * spd;
      } else {
        e.state = 'idle'; e.vx *= 0.8;
        if (e.cd <= 0){
          e.state = 'windup'; e.stateT = 0; e.attackKind = 'shoot'; e.windupDur = e.frenzy ? 0.5 : 0.75;
          if (!e.telegraphed){ e.telegraphed = true; sfx('draw'); }
        }
      }
      break;
    }
    case 'windup': {
      if (e.stateT < e.windupDur * 0.7){ e.facing = sgn(dx) || 1; e.aimAng = Math.atan2((p.y - 42) - (e.y - e.h * 0.72), (p.x - e.x) * e.facing); }
      if (e.stateT >= e.windupDur){
        e.state = 'recover'; e.stateT = 0; e.hitDone = false;
        e.cd = rnd(1.9, 2.7) * (e.frenzy ? 0.65 : 1);
        e.telegraphed = false;
        if (e.attackKind === 'shoot'){
          spawnBolt(e.x + e.facing * 18, e.y - e.h * 0.72, p.x, p.y - 42, e.dmg);
          e.recoil = 0.14;
        } else {
          sfx('swing');
          addEnemyHit(e, { ox0: 2, reach: 66, ly0: -e.h * 0.8, ly1: -4, dur: 0.13, dmg: Math.round(e.dmg * 0.9), kb: 240, vy: -160 });
          e.state = 'attack';
        }
      }
      break;
    }
    case 'attack': {
      sampleEnemyTrail(e);
      if (e.stateT > 0.2){ e.state = 'recover'; e.stateT = 0; }
      break;
    }
    case 'recover': {
      if (e.stateT > 0.55){ e.state = 'idle'; e.stateT = 0; }
      break;
    }
  }
}

/* ---------- 锤傀儡 ---------- */
function updateBrute(e, dt, dx, adx, spd){
  const p = P;
  const weapon = enemyHasWeapon(e);
  if (p.dead){ e.vx = 0; e.facing = sgn(dx) || 1; if (e.state !== 'idle'){ e.state = 'idle'; e.stateT = 0; } return; }
  switch (e.state){
    case 'idle': case 'walk': {
      e.facing = sgn(dx) || 1;
      const range = weapon ? 128 : 62;
      if (adx > range){
        e.state = 'walk'; e.vx = sgn(dx) * spd * (e.legsBroken >= 2 ? 0 : 1);
        if (e.legsBroken >= 2) e.vx = 0;
      } else {
        e.vx *= 0.8;
        if (e.cd <= 0){
          e.state = 'windup'; e.stateT = 0;
          // 玩家在身后 → 横扫
          const behind = (p.x - e.x) * e.facing < 0;
          e.attackKind = weapon ? (behind ? 'sweep' : 'slam') : 'charge';
          e.windupDur = weapon ? (e.attackKind === 'slam' ? 0.88 : 0.6) : 0.5;
          if (!e.telegraphed){ e.telegraphed = true; sfx('draw'); }
        } else e.state = 'idle';
      }
      break;
    }
    case 'windup': {
      if (e.stateT < e.windupDur * 0.7) e.facing = sgn(dx) || 1;
      if (e.stateT >= e.windupDur){
        e.stateT = 0; e.hitDone = false; e.telegraphed = false;
        e.swTrail.length = 0;
        if (e.attackKind === 'slam'){
          e.state = 'attack';
          addEnemyHit(e, { ox0: 10, reach: 128, ly0: -e.h * 0.95, ly1: 0, dur: 0.17, dmg: e.dmg, kb: 420, vy: -330 });
          sfx('swingHeavy');
          // 落锤瞬间：延迟到攻击帧中段生成冲击波
          e.slamPending = 0.09;
        } else if (e.attackKind === 'sweep'){
          e.state = 'attack';
          addEnemyHit(e, { ox0: -e.w * 1.9, reach: e.w * 1.9 + 40, ly0: -e.h * 0.85, ly1: -8, dur: 0.15, dmg: Math.round(e.dmg * 0.8), kb: 360, vy: -220 });
          sfx('swingHeavy');
        } else {
          e.state = 'lunge';
          e.vx = e.facing * 300;
          addEnemyHit(e, { ox0: -e.w * 0.5, reach: e.w, ly0: -e.h * 0.9, ly1: 0, dur: 0.5, dmg: Math.round(e.dmg * 0.75), kb: 380, vy: -200 });
          dust(e.x, e.y, 6, 1.2, e.facing);
        }
      }
      break;
    }
    case 'attack': {
      sampleEnemyTrail(e);
      if (e.slamPending !== undefined){
        e.slamPending -= dt;
        if (e.slamPending <= 0){
          e.slamPending = undefined;
          const ix = e.x + e.facing * 96;
          sfx('slam');
          addShake(0.34, e.facing);
          doHitStop(0.03);
          dust(ix, GROUND_Y, 12, 1.6, e.facing);
          chips(ix, GROUND_Y, 8, '#5a6284');
          ring(ix, GROUND_Y, 8, 90, 0.4, '255,190,130', 4);
          spawnShock(ix, 1, Math.round(e.dmg * 0.55), true);
          spawnShock(ix, -1, Math.round(e.dmg * 0.55), true);
        }
      }
      if (e.stateT > 0.3){ e.state = 'recover'; e.stateT = 0; e.cd = rnd(2.2, 3.0); }
      break;
    }
    case 'lunge': {
      if (e.stateT > 0.42){ e.state = 'recover'; e.stateT = 0; e.cd = rnd(1.8, 2.4); e.vx = 0; }
      break;
    }
    case 'recover': {
      if (e.stateT > 1.0){ e.state = 'idle'; e.stateT = 0; }
      break;
    }
  }
}

/* ---------------- 敌方命中盒 ---------------- */
function addEnemyHit(e, o){
  G.hitboxes.push({
    owner: 'e', src: e, t: 0, dur: o.dur, hit: new Set(),
    dmg: o.dmg, kb: o.kb, vy: o.vy,
    ox0: o.ox0, reach: o.reach, ly0: o.ly0, ly1: o.ly1,
    rect: function(){
      const f = e.facing;
      const l = e.x + f * o.ox0, r = e.x + f * (o.ox0 + o.reach);
      return { l: Math.min(l, r), r: Math.max(l, r), t: e.y + o.ly0, b: e.y + o.ly1 };
    },
  });
}

function sampleEnemyTrail(e){
  const w = enemyWeaponTip(e);
  if (!w) return;
  e.swTrail.push({ x: w.x, y: w.y, t: G.rtime });
  if (e.swTrail.length > 10) e.swTrail.shift();
}

/* ---------------- 敌人绘制 ---------------- */
function enemyWeaponTip(e){
  if (e.state !== 'windup' && e.state !== 'attack') return null;
  const f = e.facing;
  const a = enemyWeaponAngle(e);
  const len = e.type === 'brute' ? 62 : 46;
  const hx = e.x + f * e.w * 0.42;
  const hy = e.y - e.h * 0.64;
  return { x: hx + Math.cos(a) * len * f, y: hy + Math.sin(a) * len };
}
function enemyWeaponAngle(e){
  // 局部方向角（0=面朝前方水平, PI/2=正下）
  const rest = 0.62 + Math.sin(e.t * 2.2) * 0.08;
  if (e.state === 'windup'){
    const u = clamp(e.stateT / Math.max(0.001, e.windupDur), 0, 1);
    if (e.attackKind === 'shoot') return e.aimAng || rest;
    if (e.attackKind === 'upslash') return lerp(rest, -2.2, eo2(u));
    if (e.attackKind === 'slam' || e.attackKind === 'sweep') return lerp(rest, -2.5, eo2(u));
    if (e.attackKind === 'claw') return lerp(rest, -1.5, eo2(u));
    return lerp(rest, -2.0, eo2(u)); // 冲撞前倾
  }
  if (e.state === 'attack'){
    const u = clamp(e.stateT / 0.2, 0, 1);
    if (e.attackKind === 'upslash') return lerp(-2.2, -0.2, eo3(u));
    if (e.attackKind === 'slam') return lerp(-2.5, 1.15, eo3(u));
    if (e.attackKind === 'sweep') return lerp(-2.5, 0.9, eo3(u));
    if (e.attackKind === 'claw') return lerp(-1.5, 0.6, eo3(u));
    return lerp(-2.0, 0.7, eo3(u));
  }
  if (e.state === 'lunge') return 0.15;
  return rest;
}

function drawEnemies(rt){
  for (const e of G.enemies){
    // 阴影
    const groundDist = clamp((GROUND_Y - e.y) / 420, 0, 0.75);
    drawShadow(e.x, e.platformY || GROUND_Y, e.w * 0.6 * (1 - groundDist * 0.6));
    ctx.save();
    ctx.translate(e.x, e.y - e.h / 2);
    ctx.rotate(e.rot);
    ctx.translate(0, e.h / 2);
    ctx.scale(e.facing, 1);
    drawEnemyBody(e);
    ctx.restore();

    // 武器挥舞拖尾（世界坐标）
    if (e.swTrail.length > 1){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < e.swTrail.length; i++){
        const a = e.swTrail[i - 1], b = e.swTrail[i];
        const al = clamp(1 - (G.rtime - b.t) / 0.16, 0, 1);
        if (al <= 0) continue;
        ctx.strokeStyle = 'rgba(255,120,90,' + (al * 0.5) + ')';
        ctx.lineWidth = 9 * al;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }

    // 血条（受击后短暂显示）
    if (e.hpShowT > 0 && !e.dead){
      const w = e.type === 'brute' ? 64 : 44;
      const y = e.y - e.h - 14 - (e.rot !== 0 ? 6 : 0);
      ctx.globalAlpha = clamp(e.hpShowT, 0, 1) * 0.9;
      ctx.fillStyle = 'rgba(8,10,20,0.75)';
      ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 6);
      const frac = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = frac > 0.5 ? '#e0564f' : frac > 0.25 ? '#e08a4f' : '#ffd76a';
      ctx.fillRect(e.x - w / 2, y, w * frac, 4);
      ctx.globalAlpha = 1;
    }
  }
}

function drawEnemyBody(e){
  const big = e.type === 'brute';
  const h = e.h, w = e.w;
  const flash = e.flash > 0;
  const frenzy = e.frenzy;
  const wood = flash ? '#ffffff' : frenzy ? '#7a4433' : '#6b4a34';
  const woodD = flash ? '#e8e8e8' : '#4c3122';
  const woodL = flash ? '#ffffff' : '#8a6244';
  const rope = flash ? '#ffffff' : '#c9b48a';
  const lean = (e.flinchT > 0 ? -Math.sin(e.flinchT / 0.15 * PI) * 0.18 : 0) +
    (e.state === 'windup' ? -0.12 * clamp(e.stateT / e.windupDur, 0, 1) : 0) +
    (e.state === 'attack' ? 0.2 : 0) +
    (e.state === 'stagger' ? Math.sin(e.t * 20) * 0.14 : 0);
  const crouch = e.state === 'crouch' ? 0.8 : 1;
  const hipY = -h * 0.42 * crouch;
  const breath = Math.sin(e.t * 2.4) * 1.2;

  ctx.rotate(lean * e.facing * 0.5);

  // ---- 腿 ----
  const legSwing = (e.state === 'walk' || e.state === 'lunge') ? Math.sin(e.walkPhase) * 0.5 : 0;
  drawLimbSeg(e, 'legR', { x: w * 0.22, y: hipY }, PI / 2 + legSwing, h * 0.42, 6.5, wood, woodD, big);
  drawLimbSeg(e, 'legL', { x: -w * 0.2, y: hipY }, PI / 2 - legSwing, h * 0.42, 6, woodD, wood, big);

  // ---- 后臂 ----
  drawLimbSeg(e, 'armL', { x: -w * 0.32, y: hipY - h * 0.22 + breath }, PI / 2 + 0.3 - legSwing * 0.4, h * 0.34, 5, woodD, wood, big);

  // ---- 躯干 ----
  const tg = ctx.createLinearGradient(0, hipY - h * 0.3, 0, hipY + 8);
  tg.addColorStop(0, flash ? '#fff' : frenzy ? '#8a4a36' : '#7d583e');
  tg.addColorStop(1, flash ? '#ddd' : woodD);
  ctx.fillStyle = tg;
  rr(-w * 0.36, hipY - h * 0.3, w * 0.72, h * 0.32, 7);
  ctx.fill();
  ctx.strokeStyle = flash ? '#bbb' : '#33241a';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 漆纹带
  ctx.fillStyle = flash ? '#ccc' : '#40261a';
  ctx.fillRect(-w * 0.36, hipY - h * 0.12, w * 0.72, 5);
  if (big){
    ctx.fillStyle = flash ? '#ddd' : '#55607a';
    ctx.fillRect(-w * 0.36, hipY - h * 0.27, w * 0.72, 6);
    ctx.fillStyle = flash ? '#fff' : '#8d99b5';
    ctx.beginPath(); ctx.arc(-w * 0.18, hipY - h * 0.24, 2.6, 0, TAU); ctx.arc(w * 0.18, hipY - h * 0.24, 2.6, 0, TAU); ctx.fill();
  }
  // 中心注连绳结
  ctx.fillStyle = rope;
  ctx.beginPath(); ctx.arc(0, hipY - h * 0.14, 3.4, 0, TAU); ctx.fill();
  // 受损裂纹
  if (!flash && e.hp < e.maxHp * 0.5){
    ctx.strokeStyle = 'rgba(20,10,6,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, hipY - h * 0.26);
    ctx.lineTo(-w * 0.06, hipY - h * 0.16);
    ctx.lineTo(-w * 0.16, hipY - h * 0.05);
    ctx.stroke();
  }

  // ---- 头 ----
  const headY = hipY - h * 0.3 - h * 0.13 + breath * 0.4;
  if (e.parts.head.alive){
    ctx.fillStyle = flash ? '#fff' : wood;
    rr(-w * 0.24, headY - h * 0.12, w * 0.48, h * 0.24, 5);
    ctx.fill();
    ctx.strokeStyle = flash ? '#bbb' : '#33241a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 面板
    ctx.fillStyle = flash ? '#eee' : '#ded6c2';
    rr(-w * 0.16, headY - h * 0.07, w * 0.34, h * 0.15, 3);
    ctx.fill();
    // 红色役纹
    ctx.strokeStyle = frenzy || e.state === 'windup' ? '#ff3030' : '#c22e3d';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, headY - h * 0.02); ctx.lineTo(w * 0.06, headY - h * 0.02);
    ctx.stroke();
    // 眼
    const eyeCol = e.state === 'windup' || frenzy ? '#ff4040' : '#ffb84d';
    const eyeGlow = e.state === 'windup' ? 0.6 + Math.sin(e.t * 24) * 0.4 : 0.5;
    ctx.fillStyle = eyeCol;
    ctx.globalAlpha = eyeGlow + 0.3;
    ctx.beginPath(); ctx.arc(-w * 0.07, headY + h * 0.015, 2.4, 0, TAU); ctx.arc(w * 0.09, headY + h * 0.015, 2.4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // 头角/顶髻
    ctx.fillStyle = flash ? '#ddd' : '#3c2a1e';
    if (big){
      ctx.beginPath();
      ctx.moveTo(-w * 0.2, headY - h * 0.1);
      ctx.lineTo(-w * 0.34, headY - h * 0.24);
      ctx.lineTo(-w * 0.12, headY - h * 0.12);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.2, headY - h * 0.1);
      ctx.lineTo(w * 0.34, headY - h * 0.24);
      ctx.lineTo(w * 0.12, headY - h * 0.12);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, headY - h * 0.13, 3.6, 0, TAU); ctx.fill();
    }
  } else {
    // 断头残颈（锯齿）
    ctx.fillStyle = flash ? '#eee' : woodD;
    ctx.beginPath();
    ctx.moveTo(-w * 0.14, hipY - h * 0.3);
    ctx.lineTo(-w * 0.05, hipY - h * 0.36);
    ctx.lineTo(w * 0.04, hipY - h * 0.3);
    ctx.lineTo(w * 0.12, hipY - h * 0.33);
    ctx.lineTo(w * 0.14, hipY - h * 0.28);
    ctx.lineTo(-w * 0.14, hipY - h * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,40,50,0.8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // ---- 前臂 + 武器 ----
  const armAng = enemyWeaponAngle(e);
  drawLimbSeg(e, 'armR', { x: w * 0.34, y: hipY - h * 0.22 + breath }, armAng, h * 0.36, 5.4, wood, woodL, big);
  if (enemyHasWeapon(e)){
    drawEnemyWeapon(e, w * 0.34 + Math.cos(armAng) * h * 0.33, hipY - h * 0.22 + breath + Math.sin(armAng) * h * 0.33, armAng);
  }

  /* ---- 前兆提示（红光/凝光/危险弧） ---- */
  if (e.state === 'windup'){
    const u = clamp(e.stateT / Math.max(0.001, e.windupDur), 0, 1);
    if (u > 0.45){
      ctx.globalAlpha = (u - 0.45) / 0.55 * 0.4;
      ctx.strokeStyle = '#ff4646';
      ctx.lineWidth = 2.4;
      if (e.attackKind === 'slam'){
        // 落锤地面危险区
        ctx.beginPath();
        ctx.moveTo(w * 0.5, -h * 0.5);
        ctx.lineTo(w * 0.5 + 120, -h * 0.5);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,70,70,0.16)';
        ctx.fillRect(w * 0.5, -h * 0.5, 128, h * 0.5);
      } else if (e.attackKind === 'upslash'){
        ctx.beginPath();
        ctx.arc(w * 0.3, -h * 0.4, 70, -PI / 2, 0.2);
        ctx.stroke();
      } else if (e.attackKind === 'shoot'){
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(w * 0.5, -h * 0.62);
        ctx.lineTo(w * 0.5 + 200, -h * 0.62 + Math.tan(e.aimAng) * 200);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.attackKind === 'sweep'){
        ctx.beginPath();
        ctx.arc(0, -h * 0.4, w * 1.6, PI * 0.6, PI * 1.5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(w * 0.2, -h * 0.45, 78, -1.1, 0.9);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawLimbSeg(e, name, origin, dirAng, len, thick, colU, colL, big){
  const part = e.parts[name];
  const sc = big ? 1.5 : 1;
  const bend = name[0] === 'l' ? 0.3 : -0.24; // 膝盖朝前 / 手肘朝后
  if (part.alive){
    const mx = origin.x + Math.cos(dirAng) * len * 0.52;
    const my = origin.y + Math.sin(dirAng) * len * 0.52;
    const d2 = dirAng + bend;
    const ex = mx + Math.cos(d2) * len * 0.46;
    const ey = my + Math.sin(d2) * len * 0.46;
    strokeCap(origin.x, origin.y, mx, my, thick * sc, colU);
    strokeCap(mx, my, ex, ey, thick * 0.85 * sc, colL);
    // 关节绳结
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#c9b48a';
    ctx.beginPath(); ctx.arc(mx, my, thick * 0.5 * sc, 0, TAU); ctx.fill();
    if (name[0] === 'l'){
      ctx.fillStyle = '#2c2036';
      ctx.beginPath(); ctx.ellipse(ex + Math.cos(d2) * 3 * sc, ey + 2, 5.5 * sc, 3 * sc, 0, 0, TAU); ctx.fill();
    }
  } else {
    // 断肢残桩（锯齿断口）
    const ex = origin.x + Math.cos(dirAng) * len * 0.3;
    const ey = origin.y + Math.sin(dirAng) * len * 0.3;
    strokeCap(origin.x, origin.y, ex, ey, thick * 0.85 * sc, colU);
    ctx.fillStyle = colU;
    ctx.beginPath();
    ctx.moveTo(ex, ey - thick * 0.5 * sc);
    ctx.lineTo(ex + 3.2, ey - 1);
    ctx.lineTo(ex + 1.4, ey + thick * 0.5 * sc);
    ctx.lineTo(ex - 3, ey + thick * 0.3 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,40,50,0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawEnemyWeapon(e, hx, hy, ang){
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  if (e.type === 'archer'){
    // 弓
    ctx.strokeStyle = '#3c2a1e';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(0, 0, 20, -PI / 2 + 0.35, PI / 2 - 0.35);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,215,190,0.85)';
    ctx.lineWidth = 1.2;
    const pull = e.state === 'windup' ? clamp(e.stateT / e.windupDur, 0, 1) * 9 : 0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(-PI / 2 + 0.35) * 20, Math.sin(-PI / 2 + 0.35) * 20);
    ctx.lineTo(-pull, 0);
    ctx.lineTo(Math.cos(PI / 2 - 0.35) * 20, Math.sin(PI / 2 - 0.35) * 20);
    ctx.stroke();
    if (pull > 1){
      ctx.strokeStyle = '#e8dcc8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-pull, 0); ctx.lineTo(16, 0); ctx.stroke();
    }
  } else if (e.type === 'brute'){
    // 重锤
    ctx.fillStyle = '#4a3626';
    ctx.fillRect(-6, -3, 52, 6);
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#55607a';
    rr(40, -14, 22, 28, 4); ctx.fill();
    ctx.strokeStyle = '#2c3247';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#8d99b5';
    ctx.fillRect(44, -9, 4, 18);
  } else {
    // 木刀
    ctx.strokeStyle = '#3c2a1e';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-2, 0); ctx.stroke();
    ctx.fillStyle = '#c9b48a';
    ctx.fillRect(-2, -4, 3, 8);
    ctx.strokeStyle = e.flash > 0 ? '#fff' : '#b3502f';
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(46, -2); ctx.stroke();
  }
  ctx.restore();
}
