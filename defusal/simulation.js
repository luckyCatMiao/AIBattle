'use strict';
/* 爆破模式 / BOMB DEFUSAL — 帧精确裁判。
 * 2 队 × 5 个单位；单位视野独立（视锥 + 近身 + 墙体遮挡）。
 * 每回合开始为购买阶段（CS 式经济）；武器不在场上刷新。
 *
 * 时间单位：1 物理帧 = 1/20 秒。一次决策窗口 = 20 帧 = 1 秒。
 */
const catalog = require('./catalog');
const { rules, weapons, buyable, SITES, SPAWNS, buildMap, auditMap, siteAt, EMPTY, WALL } = catalog;

const DT = 1 / rules.hz;
const FRAMES_PER_DECISION = rules.decisionFrames;
const W = rules.width, H = rules.height;
const ROUND_LIMIT_TICKS = Math.round(rules.roundTimeLimit * rules.hz);
const BOMB_TICKS = Math.round(rules.bombTimer * rules.hz);
const PLANT_TICKS = Math.round(rules.plantTime * rules.hz);
const DEFUSE_TICKS = Math.round(rules.defuseTime * rules.hz);
const DEFUSE_KIT_TICKS = Math.round(rules.defuseKitTime * rules.hz);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const tileIndex = (x, y) => y * W + x;

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, t: Math.round(g.now * 1000) / 1000, frame: g.roundFrames, type, ...data });
}

const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const DIR_KEYS = Object.keys(DIRS);

const angleDiff = (a, b) => {
  let d = (a - b + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return Math.abs(d - Math.PI);
};
const angleOf = (x, y) => Math.atan2(y, x);
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

/* ============================ 世界构造 ============================ */

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('爆破模式必须是两名选手');
  const g = {
    id, seed, status: 'playing', phase: 'buy',
    winner: null, reason: '', eventId: 0,
    players: players.map((p, i) => {
      if (!p || typeof p.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(p.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(p.name).slice(0, 32), kind: p.kind, wins: 0, side: 'attack' };
    }),
    round: 1, roundFrames: 0, tick: 0, now: 0,
    roundWins: [0, 0], sides: { 0: 'attack', 1: 'defend' },
    tiles: buildMap(seed), mapAudit: null,
    units: [], bullets: [], bomb: null, buyReady: [false, false], buys: [],
    roundLog: [], events: [], halftimeDone: false,
    nextBulletId: 0,
    rng: makeRng(seed * 7919 + 17),
  };
  g.mapAudit = auditMap(g.tiles);
  g.units = [];
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < rules.teamSize; i++) g.units.push(makeUnit(g, team, i, 0, 0, false));
  }
  startRound(g);
  return g;
}

function makeUnit(g, team, index, tx, ty, survived) {
  const w = weapons.pistol;
  return {
    id: 't' + team + 'u' + index,
    team, index,
    name: g.players[team].name + ' #' + (index + 1),
    x: tx + 0.5, y: ty + 0.5,
    facing: { x: 0, y: team === 0 ? -1 : 1 },
    hp: rules.maxHp, armor: 0, alive: true, survived,
    weapon: 'pistol', mag: w.mag, reserve: w.reserve, reloadUntil: 0, fireCd: 0,
    money: rules.startingMoney, kit: false,
    kills: 0, deaths: 0,
    held: { dir: 'N', aim: null }, inputHistory: [],
    plantProgress: 0, defuseProgress: 0,
  };
}

function resetEconomy(g) {
  for (const u of g.units) {
    u.money = rules.startingMoney;
    u.weapon = 'pistol';
    u.armor = 0;
    u.kit = false;
    u.survived = false;
    const w = weapons.pistol;
    u.mag = w.mag; u.reserve = w.reserve;
  }
  emit(g, 'halftime', { text: '半场交换：经济与武器重置' });
}

function startRound(g) {
  if (g.round === rules.halftimeRound + 1 && !g.halftimeDone) {
    g.halftimeDone = true;
    resetEconomy(g);
  }
  if (!g.tiles) g.tiles = buildMap(g.seed);
  if (!g.mapAudit) g.mapAudit = auditMap(g.tiles);
  g.bullets.length = 0;
  const teamSide = g.round <= rules.halftimeRound ? ['attack', 'defend'] : ['defend', 'attack'];
  g.sides = { 0: teamSide[0], 1: teamSide[1] };
  for (const p of g.players) p.side = g.sides[p.id];
  g.phase = 'buy';
  g.roundFrames = 0;
  g.buyReady = [false, false];
  g.bomb = { state: 'carried', carrier: null, x: 0, y: 0, site: null, timer: 0, defuseProgress: 0, defuserId: null };
  for (const u of g.units) {
    if (!u.survived) {
      u.weapon = 'pistol'; u.armor = 0; u.kit = false;
    }
    const w = weapons[u.weapon];
    u.mag = w.mag; u.reserve = w.reserve;
    u.hp = rules.maxHp; u.alive = true;
    u.reloadUntil = 0; u.fireCd = 0;
    u.plantProgress = 0; u.defuseProgress = 0;
    u.held = { dir: 'N', aim: null }; u.inputHistory = [];
    u.botPath = null; u.botPathKey = null;
    const spawns = g.sides[u.team] === 'attack' ? SPAWNS.attack : SPAWNS.defend;
    const [tx, ty] = spawns[u.index];
    u.x = tx + 0.5; u.y = ty + 0.5;
    u.facing = { x: 0, y: g.sides[u.team] === 'attack' ? -1 : 1 };
  }
  const attacker = g.units.find(u => u.team === 0 && u.index === 0 && g.sides[u.team] === 'attack')
    || g.units.find(u => g.sides[u.team] === 'attack' && u.index === 0);
  g.bomb.carrier = attacker.id;
  g.bomb.x = attacker.x; g.bomb.y = attacker.y;
  emit(g, 'round', { text: `第 ${g.round} 回合 · ${g.players[0].name} ${g.sides[0] === 'attack' ? '进攻' : '防守'} · ${g.players[1].name} ${g.sides[1] === 'attack' ? '进攻' : '防守'}` });
}

/* ============================ 地图 / 视野 ============================ */

const tileAt = (g, x, y) => inBounds(Math.floor(x), Math.floor(y)) ? g.tiles[tileIndex(Math.floor(x), Math.floor(y))] : WALL;

function circleHitsWall(g, x, y, r) {
  const minX = Math.floor(x - r), maxX = Math.floor(x + r);
  const minY = Math.floor(y - r), maxY = Math.floor(y + r);
  for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) {
    if (!inBounds(tx, ty) || g.tiles[tileIndex(tx, ty)] !== WALL) continue;
    const cx = clamp(x, tx, tx + 1), cy = clamp(y, ty, ty + 1);
    if (dist2(x, y, cx, cy) < r * r) return true;
  }
  return false;
}

function lineOfSight(g, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return true;
  const steps = Math.max(1, Math.ceil(dist / 0.1));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (tileAt(g, x1 + dx * t, y1 + dy * t) === WALL) return false;
  }
  return true;
}

function canSeePosition(g, u, x, y) {
  const d = Math.hypot(x - u.x, y - u.y);
  if (d > rules.visionRange) return false;
  if (!lineOfSight(g, u.x, u.y, x, y)) return false;
  if (d <= rules.proximity) return true;
  const facingAngle = angleOf(u.facing.x, u.facing.y);
  return angleDiff(angleOf(x - u.x, y - u.y), facingAngle) <= rules.visionHalfAngle;
}

function canSee(g, u, e) {
  return e.alive && e.team !== u.team && canSeePosition(g, u, e.x, e.y);
}

function canFire(g, u, e) {
  if (!e.alive || e.team === u.team) return false;
  const w = weapons[u.weapon];
  const d = Math.hypot(e.x - u.x, e.y - u.y);
  if (d > w.range) return false;
  if (!lineOfSight(g, u.x, u.y, e.x, e.y)) return false;
  const facingAngle = angleOf(u.facing.x, u.facing.y);
  return angleDiff(angleOf(e.x - u.x, e.y - u.y), facingAngle) <= rules.visionHalfAngle;
}

function visibleEnemies(g, u) {
  return g.units.filter(e => canSee(g, u, e)).map(e => ({
    id: e.id, team: e.team, index: e.index, x: round3(e.x), y: round3(e.y),
    facing: { ...e.facing }, weapon: e.weapon,
  }));
}

const round3 = v => Math.round(v * 1000) / 1000;

/* ============================ 输入 ============================ */

function normalizeUnitInput(raw) {
  if (raw === null || raw === undefined) return { dir: 'N', aim: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw Error('每个单位的输入必须是对象');
  const dir = raw.dir === null || raw.dir === undefined ? 'N' : String(raw.dir).toUpperCase();
  const aimRaw = raw.aim === null || raw.aim === undefined ? null : String(raw.aim).toUpperCase();
  if (!Object.hasOwn(DIRS, dir)) throw Error('非法移动方向：' + raw.dir);
  if (aimRaw !== null && !Object.hasOwn(DIRS, aimRaw)) throw Error('非法瞄准方向：' + raw.aim);
  return { dir, aim: aimRaw === 'N' ? null : aimRaw };
}

function normalizeFrame(raw) {
  const out = Array.from({ length: rules.teamSize }, () => ({ dir: 'N', aim: null }));
  if (raw === null || raw === undefined) return out;
  if (Array.isArray(raw)) {
    for (let i = 0; i < rules.teamSize; i++) out[i] = normalizeUnitInput(raw[i]);
    return out;
  }
  if (typeof raw === 'object') {
    // 不应把单个单位的 {dir,aim} 误当成 5 单位映射
    if (Object.hasOwn(raw, 'dir') || Object.hasOwn(raw, 'aim')) throw Error('每一帧必须是 5 个单位的输入数组');
    for (let i = 0; i < rules.teamSize; i++) {
      const v = Object.hasOwn(raw, i) ? raw[i] : raw[String(i)];
      out[i] = normalizeUnitInput(v);
    }
    return out;
  }
  throw Error('每一帧必须是 5 个单位的输入数组');
}

function submitWindow(g, team, inputs) {
  if (g.status !== 'playing') throw Error('对局已结束');
  if (g.phase !== 'live') throw Error('当前不是比赛阶段');
  if (!Array.isArray(inputs)) throw Error('inputs 必须是数组');
  if (inputs.length > FRAMES_PER_DECISION) throw Error(`一个决策窗口最多 ${FRAMES_PER_DECISION} 帧输入`);
  const norm = [];
  for (let i = 0; i < FRAMES_PER_DECISION; i++) norm.push(normalizeFrame(inputs[i]));
  return norm;
}

function pushInput(u, input) {
  u.inputHistory.push(input);
  if (u.inputHistory.length > 8) u.inputHistory.shift();
  u.held = input;
}

/* ============================ 购买 ============================ */

function submitBuys(g, team, purchases) {
  if (g.status !== 'playing') throw Error('对局已结束');
  if (g.phase !== 'buy') throw Error('当前不是购买阶段');
  if (g.buyReady[team]) throw Error('该队伍本回合已提交购买');
  if (!Array.isArray(purchases)) throw Error('buys 必须是数组');
  const applied = [];
  for (const p of purchases.slice(0, rules.teamSize * 4)) {
    if (!p || typeof p !== 'object') continue;
    const u = g.units.find(x => x.team === team && x.index === Number(p.unit));
    if (!u || !u.alive) continue;
    if (p.weapon && p.weapon !== 'pistol' && Object.hasOwn(weapons, p.weapon)) {
      const w = weapons[p.weapon];
      if (u.money >= w.cost) {
        u.money -= w.cost;
        u.weapon = p.weapon; u.mag = w.mag; u.reserve = w.reserve; u.reloadUntil = 0; u.fireCd = 0;
        applied.push({ unit: u.index, weapon: p.weapon, cost: w.cost });
      }
    }
    if (p.armor && u.armor < rules.maxHp && u.money >= rules.armorPrice) {
      u.money -= rules.armorPrice; u.armor = rules.maxHp;
      applied.push({ unit: u.index, armor: rules.armorPrice });
    }
    if (p.kit && g.sides[team] === 'defend' && !u.kit && u.money >= rules.kitPrice) {
      u.money -= rules.kitPrice; u.kit = true;
      applied.push({ unit: u.index, kit: rules.kitPrice });
    }
  }
  g.buyReady[team] = true;
  g.buys.push({ round: g.round, team, purchases: purchases.slice(0, rules.teamSize * 4), applied });
  if (g.buyReady[0] && g.buyReady[1]) {
    g.phase = 'live';
    g.roundFrames = 0;
    for (const u of g.units) { u.fireCd = 0; u.reloadUntil = 0; }
    emit(g, 'live', { text: '购买结束，回合开始' });
  }
  return applied;
}

function botBuy(g, team) {
  const out = [];
  for (const u of g.units.filter(x => x.team === team)) {
    const p = { unit: u.index };
    const cur = weapons[u.weapon];
    let choice = null;
    if (u.money >= weapons.rifle.cost && (u.weapon === 'pistol' || cur.cost < weapons.rifle.cost)) choice = 'rifle';
    else if (u.money >= weapons.smg.cost && (u.weapon === 'pistol' || cur.cost < weapons.smg.cost)) choice = 'smg';
    else if (u.money >= weapons.shotgun.cost && u.weapon === 'pistol') choice = 'shotgun';
    else if (u.money >= weapons.pdw.cost && u.weapon === 'pistol') choice = 'pdw';
    if (choice) p.weapon = choice;
    const spent = p.weapon ? weapons[p.weapon].cost : 0;
    if (u.money - spent >= rules.armorPrice && u.armor < rules.maxHp) p.armor = true;
    if (g.sides[team] === 'defend' && u.money - spent >= rules.kitPrice && !u.kit) p.kit = true;
    if (p.weapon || p.armor || p.kit) out.push(p);
  }
  return out;
}

/* ============================ 战斗 ============================ */

function startReload(g, u) {
  const w = weapons[u.weapon];
  if (u.mag >= w.mag || u.reserve <= 0 || u.reloadUntil > 0) return;
  u.reloadUntil = g.tick + Math.max(1, Math.round(w.reload * rules.hz));
}

function fireAt(g, u, target) {
  const w = weapons[u.weapon];
  if (u.mag <= 0 || g.tick < u.reloadUntil) return;
  u.mag--;
  u.fireCd = Math.max(1, Math.round(w.interval * rules.hz));
  const base = Math.atan2(target.y - u.y, target.x - u.x);
  const spread = w.spread * Math.PI / 180;
  for (let i = 0; i < (w.pellets || 1); i++) {
    const angle = base + (g.rng() * 2 - 1) * spread;
    spawnProjectile(g, u, angle, w);
  }
  if (u.mag <= 0) startReload(g, u);
}

// 所有武器都发射可见的实体子弹；速度刻意低于/接近角色移动速度，可被走位躲开。
function spawnProjectile(g, u, angle, w) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const speed = w.speed / rules.hz;
  const muzzle = rules.unitRadius + 0.08;
  g.bullets.push({
    id: 'b' + (g.nextBulletId = (g.nextBulletId || 0) + 1),
    unit: u.id, team: u.team, weapon: u.weapon,
    x: u.x + cos * muzzle, y: u.y + sin * muzzle,
    vx: cos * speed, vy: sin * speed,
    r: 0.10, damage: w.damage,
    ttl: Math.max(1, Math.round(w.range / w.speed * rules.hz)),
  });
  emit(g, 'shot', { owner: u.team, unit: u.id, from: { x: round3(u.x), y: round3(u.y) }, angle: round3(angle), weapon: u.weapon });
}

function updateBullets(g) {
  const survivors = [];
  for (const b of g.bullets) {
    const speed = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil(speed / 0.10));
    let hit = false;
    for (let s = 0; s < steps && !hit; s++) {
      b.x += b.vx / steps;
      b.y += b.vy / steps;
      if (!inBounds(Math.floor(b.x), Math.floor(b.y)) || tileAt(g, b.x, b.y) === WALL) { hit = true; break; }
      for (const e of g.units) {
        if (!e.alive || e.team === b.team) continue;
        if (dist2(b.x, b.y, e.x, e.y) <= (b.r + rules.unitRadius) ** 2) {
          const shooter = g.units.find(x => x.id === b.unit) || { id: b.unit, team: b.team, name: '?', kills: 0, deaths: 0, money: 0 };
          damageUnit(g, e, b.damage, shooter);
          hit = true;
          break;
        }
      }
    }
    if (!hit) { b.ttl--; if (b.ttl > 0) survivors.push(b); }
  }
  g.bullets = survivors;
}

function damageUnit(g, target, damage, attacker) {
  if (!target.alive) return;
  const absorbed = Math.min(target.armor, damage * 0.5);
  target.armor = Math.max(0, target.armor - absorbed);
  const hpDamage = damage - absorbed;
  target.hp = Math.max(0, target.hp - hpDamage);
  emit(g, 'hit', { owner: attacker.team, target: target.id, damage: Math.round(hpDamage), hp: target.hp, text: `${target.name} 中弹` });
  if (target.hp <= 0) {
    target.alive = false;
    target.deaths++;
    attacker.kills++;
    attacker.money = Math.min(rules.maxMoney, attacker.money + rules.killReward);
    emit(g, 'death', { owner: target.team, target: target.id, killer: attacker.id, text: `${attacker.name} 击倒 ${target.name}` });
    if (g.bomb.state === 'carried' && g.bomb.carrier === target.id) dropBomb(g, target);
  }
}

function dropBomb(g, unit) {
  g.bomb.state = 'dropped';
  g.bomb.carrier = null;
  g.bomb.x = unit.x; g.bomb.y = unit.y;
  emit(g, 'bombDrop', { x: round3(unit.x), y: round3(unit.y), text: '炸弹掉落' });
}

/* ============================ 单位更新 ============================ */

function moveUnit(g, u, dx, dy) {
  const r = rules.unitRadius;
  const nx = u.x + dx;
  if (!circleHitsWall(g, nx, u.y, r)) u.x = nx;
  const ny = u.y + dy;
  if (!circleHitsWall(g, u.x, ny, r)) u.y = ny;
}

function updateUnit(g, u) {
  const input = u.held;
  // 朝向：aim 优先；没有 aim 时跟随移动方向
  const aim = input.aim ? DIRS[input.aim] : null;
  const dir = DIRS[input.dir];
  if (aim && (aim[0] || aim[1])) u.facing = norm(aim[0], aim[1]);
  if (dir[0] || dir[1]) {
    const v = norm(dir[0], dir[1]);
    moveUnit(g, u, v.x * rules.moveSpeed * DT, v.y * rules.moveSpeed * DT);
    if (!aim || (!aim[0] && !aim[1])) u.facing = v;
  }

  // 换弹完成
  const w = weapons[u.weapon];
  if (u.reloadUntil > 0 && g.tick >= u.reloadUntil) {
    const need = w.mag - u.mag;
    const load = Math.min(need, u.reserve);
    u.mag += load; u.reserve -= load; u.reloadUntil = 0;
  }
  if (u.mag <= 0) startReload(g, u);

  // 自动开火：只打视野与朝向内的最近敌人
  if (u.reloadUntil <= 0) {
    if (u.fireCd > 0) u.fireCd--;
    if (u.fireCd <= 0) {
      let target = null, best = Infinity;
      for (const e of g.units) {
        if (!canFire(g, u, e)) continue;
        const d = dist2(u.x, u.y, e.x, e.y);
        if (d < best) { best = d; target = e; }
      }
      if (target) fireAt(g, u, target);
    }
  }

  // 安包：携带者站在包点内不动
  if (g.bomb.state === 'carried' && g.bomb.carrier === u.id) {
    const site = siteAt(u.x, u.y);
    if (site && input.dir === 'N') {
      u.plantProgress += DT;
      if (u.plantProgress >= rules.plantTime) {
        g.bomb.state = 'planted';
        g.bomb.x = u.x; g.bomb.y = u.y; g.bomb.site = site;
        g.bomb.timer = rules.bombTimer;
        g.bomb.defuseProgress = 0; g.bomb.defuserId = null;
        u.plantProgress = 0;
        u.money = Math.min(rules.maxMoney, u.money + rules.plantReward);
        emit(g, 'plant', { site, x: round3(u.x), y: round3(u.y), text: `炸弹已安放在 ${site} 点` });
      }
    } else u.plantProgress = 0;
  }
}

function processBomb(g) {
  // 掉落的炸弹：进攻方自动捡起
  if (g.bomb.state === 'dropped') {
    for (const u of g.units) {
      if (!u.alive || g.sides[u.team] !== 'attack') continue;
      if (dist2(u.x, u.y, g.bomb.x, g.bomb.y) <= rules.bombPickupRadius ** 2) {
        g.bomb.state = 'carried'; g.bomb.carrier = u.id;
        emit(g, 'bombPickup', { unit: u.id, text: `${u.name} 捡起炸弹` });
        break;
      }
    }
    return;
  }
  if (g.bomb.state !== 'planted') return;

  // 拆包：最近的、静止的防守方；移动/死亡会重置进度
  let defuser = null, best = Infinity;
  for (const u of g.units) {
    if (!u.alive || g.sides[u.team] !== 'defend') continue;
    if (u.held.dir !== 'N') continue;
    if (dist2(u.x, u.y, g.bomb.x, g.bomb.y) > 1.0) continue;
    const d = dist2(u.x, u.y, g.bomb.x, g.bomb.y);
    if (d < best) { best = d; defuser = u; }
  }
  if (defuser) {
    g.bomb.defuserId = defuser.id;
    g.bomb.defuseProgress += DT;
    const need = defuser.kit ? rules.defuseKitTime : rules.defuseTime;
    if (g.bomb.defuseProgress >= need) {
      g.bomb.state = 'defused';
      defuser.money = Math.min(rules.maxMoney, defuser.money + rules.defuseReward);
      emit(g, 'defuse', { unit: defuser.id, text: `${defuser.name} 拆除炸弹` });
      endRound(g, defuser.team, '拆除炸弹');
    }
  } else {
    g.bomb.defuserId = null;
    g.bomb.defuseProgress = 0;
  }
}

function tickBombTimer(g) {
  if (g.bomb.state !== 'planted' || g.phase !== 'live') return;
  g.bomb.timer -= DT;
  if (g.bomb.timer <= 0) {
    g.bomb.timer = 0;
    g.bomb.state = 'exploded';
    emit(g, 'explode', { text: '炸弹爆炸' });
    const attacker = g.units.find(u => g.sides[u.team] === 'attack');
    if (attacker) endRound(g, attacker.team, '炸弹爆炸');
  }
}

/* ============================ 回合推进 ============================ */

function step(g) {
  if (g.status !== 'playing' || g.phase !== 'live') return g;
  g.tick++;
  g.roundFrames++;
  g.now = g.tick * DT;

  for (const u of g.units) if (u.alive) updateUnit(g, u);
  updateBullets(g);
  processBomb(g);
  tickBombTimer(g);
  if (g.phase === 'live') checkRoundEnd(g);
  return g;
}

function checkRoundEnd(g) {
  const attackTeam = g.sides[0] === 'attack' ? 0 : 1;
  const defendTeam = 1 - attackTeam;
  const atkAlive = g.units.filter(u => u.team === attackTeam && u.alive).length;
  const defAlive = g.units.filter(u => u.team === defendTeam && u.alive).length;
  const planted = g.bomb.state === 'planted' || g.bomb.state === 'defused' || g.bomb.state === 'exploded';

  if (!planted) {
    if (atkAlive === 0 && defAlive === 0) return endRound(g, defendTeam, '双方全灭');
    if (atkAlive === 0) return endRound(g, defendTeam, '进攻方全灭');
    if (defAlive === 0) return endRound(g, attackTeam, '防守方全灭');
    if (g.roundFrames >= ROUND_LIMIT_TICKS) return endRound(g, defendTeam, '时间到');
  } else if (g.bomb.state === 'planted' && defAlive === 0) {
    return endRound(g, attackTeam, '防守方全灭');
  }
}

function endRound(g, winnerTeam, reason) {
  if (g.status !== 'playing' || g.phase !== 'live') return;
  g.roundWins[winnerTeam]++;
  g.players[winnerTeam].wins = g.roundWins[winnerTeam];
  g.players[1 - winnerTeam].wins = g.roundWins[1 - winnerTeam];
  for (const u of g.units) {
    u.money = Math.min(rules.maxMoney, u.money + (u.team === winnerTeam ? rules.winReward : rules.lossReward));
    u.survived = u.alive;
  }
  g.roundLog.push({
    round: g.round, winnerTeam, winner: g.players[winnerTeam].name, reason,
    frames: g.roundFrames,
    bomb: { state: g.bomb.state, site: g.bomb.site },
    units: g.units.map(u => ({ team: u.team, index: u.index, hp: u.hp, alive: u.alive, weapon: u.weapon, kills: u.kills, deaths: u.deaths, money: u.money })),
  });
  emit(g, 'roundEnd', { owner: winnerTeam, text: `第 ${g.round} 回合：${g.players[winnerTeam].name} 胜 · ${reason}` });

  const decided = g.roundWins.some(w => w >= rules.roundsToWin) || g.round >= rules.roundsTotal;
  if (decided) {
    g.status = 'finished';
    g.phase = 'finished';
    const best = Math.max(...g.roundWins);
    const leaders = g.roundWins.filter(w => w === best).length;
    g.winner = leaders === 1 ? g.roundWins.indexOf(best) : null;
    g.reason = g.winner === null ? '六回合战平' : (best >= rules.roundsToWin ? '先胜四回合' : '胜局最多');
    emit(g, 'matchEnd', { owner: g.winner, text: g.winner === null ? '比赛平局' : `${g.players[g.winner].name} 获胜（${g.roundWins.join(':')}）` });
    return;
  }
  g.round++;
  startRound(g);
}

/* ============================ 决策窗口 ============================ */

function advanceWindow(g, windows) {
  if (g.status !== 'playing' || g.phase !== 'live') return g;
  for (let i = 0; i < FRAMES_PER_DECISION && g.phase === 'live' && g.status === 'playing'; i++) {
    for (let team = 0; team < 2; team++) {
      for (const u of g.units) {
        if (u.team !== team || !u.alive) continue;
        const frame = windows[team] && windows[team][i];
        pushInput(u, frame && frame[u.index] ? frame[u.index] : { dir: 'N', aim: null });
      }
    }
    step(g);
  }
  return g;
}

/* ============================ 观察 ============================ */

function bombView(g, team) {
  const b = g.bomb;
  if (b.state === 'planted' || b.state === 'defused' || b.state === 'exploded') {
    return { state: b.state, x: round3(b.x), y: round3(b.y), site: b.site, timer: Math.max(0, Math.round(b.timer * 10) / 10), defuseProgress: Math.round(b.defuseProgress * 10) / 10 };
  }
  if (b.state === 'carried') {
    const carrier = g.units.find(u => u.id === b.carrier);
    return carrier && carrier.team === team ? { state: 'carried', carrier: b.carrier } : { state: 'carried' };
  }
  if (b.state === 'dropped') {
    if (g.sides[team] === 'attack') return { state: 'dropped', x: round3(b.x), y: round3(b.y) };
    const visible = g.units.some(u => u.team === team && u.alive && canSeePosition(g, u, b.x, b.y));
    return visible ? { state: 'dropped', x: round3(b.x), y: round3(b.y) } : { state: 'dropped' };
  }
  return { state: b.state };
}

function publicUnit(u, own) {
  const w = weapons[u.weapon];
  const base = {
    id: u.id, team: u.team, index: u.index, name: u.name,
    x: round3(u.x), y: round3(u.y), facing: { ...u.facing },
    hp: u.hp, alive: u.alive, weapon: u.weapon, mag: u.mag,
    reloading: u.reloadUntil > 0,
  };
  if (own) Object.assign(base, {
    armor: u.armor, reserve: u.reserve, money: u.money, kit: u.kit,
    kills: u.kills, deaths: u.deaths,
    plantProgress: round3(u.plantProgress), defuseProgress: round3(u.defuseProgress),
  });
  return base;
}

const PUBLIC_EVENTS = new Set(['round', 'live', 'halftime', 'roundEnd', 'matchEnd', 'plant', 'defuse', 'explode', 'bombDrop', 'bombPickup', 'death']);

function publicEvents(g, team) {
  return g.events.filter(e => PUBLIC_EVENTS.has(e.type) || (e.type === 'shot' && e.owner === team)).slice(-150).map(e => {
    const out = { id: e.id, t: e.t, frame: e.frame, type: e.type, text: e.text };
    if (e.type === 'shot') {
      out.owner = e.owner; out.unit = e.unit; out.from = e.from; out.angle = e.angle; out.weapon = e.weapon;
    }
    return out;
  });
}

function fullBomb(g) {
  const b = g.bomb;
  return {
    state: b.state, carrier: b.carrier, x: round3(b.x), y: round3(b.y), site: b.site,
    timer: Math.max(0, Math.round(b.timer * 10) / 10),
    defuseProgress: Math.round(b.defuseProgress * 10) / 10,
  };
}

function commonState(g, owner) {
  const attackTeam = g.sides[0] === 'attack' ? 0 : 1;
  const timeLeft = g.phase === 'finished' ? 0
    : g.bomb.state === 'planted' ? Math.max(0, Math.round(g.bomb.timer * 10) / 10)
    : Math.max(0, Math.round((rules.roundTimeLimit - g.roundFrames / rules.hz) * 10) / 10);
  return {
    id: g.id, seed: g.seed, tick: g.tick, frame: g.roundFrames,
    status: g.status, phase: g.phase, winner: g.winner, reason: g.reason,
    yourPlayer: owner, round: g.round, roundsTotal: rules.roundsTotal,
    roundWins: [...g.roundWins], sides: { ...g.sides },
    players: g.players.map(p => ({ ...p })),
    roundLog: g.roundLog,
    timeLeft, bombTimer: g.bomb.state === 'planted' ? Math.max(0, Math.round(g.bomb.timer * 10) / 10) : null,
    // owner=null 是完整观战视角；有 owner 时按队伍过滤炸弹情报。
    bomb: owner === null ? fullBomb(g) : bombView(g, owner),
    map: { width: W, height: H, tiles: Array.from(g.tiles), audit: g.mapAudit, sites: SITES },
    teamAlive: {
      [attackTeam]: g.units.filter(u => u.team === attackTeam && u.alive).length,
      [1 - attackTeam]: g.units.filter(u => u.team === 1 - attackTeam && u.alive).length,
    },
    buy: { ready: [...g.buyReady], weapons, buyable, armorPrice: rules.armorPrice, kitPrice: rules.kitPrice },
    rules: {
      hz: rules.hz, decisionFrames: rules.decisionFrames, teamSize: rules.teamSize,
      moveSpeed: rules.moveSpeed, visionRange: rules.visionRange,
      visionHalfAngle: rules.visionHalfAngle, proximity: rules.proximity,
      maxHp: rules.maxHp, roundTimeLimit: rules.roundTimeLimit, bombTimer: rules.bombTimer,
      plantTime: rules.plantTime, defuseTime: rules.defuseTime, defuseKitTime: rules.defuseKitTime,
      roundsTotal: rules.roundsTotal, roundsToWin: rules.roundsToWin, halftimeRound: rules.halftimeRound,
      startingMoney: rules.startingMoney, maxMoney: rules.maxMoney,
      winReward: rules.winReward, lossReward: rules.lossReward, killReward: rules.killReward,
      plantReward: rules.plantReward, defuseReward: rules.defuseReward,
      armorPrice: rules.armorPrice, kitPrice: rules.kitPrice, bombPickupRadius: rules.bombPickupRadius,
    },
    weapons,
  };
}

function snapshot(g, owner = null) {
  return {
    ...commonState(g, owner),
    units: g.units.map(u => publicUnit(u, true)),
    bullets: g.bullets.map(publicBullet),
    events: g.events.slice(-150),
    buys: g.buys,
  };
}

const publicBullet = b => ({ id: b.id, team: b.team, unit: b.unit, weapon: b.weapon, x: round3(b.x), y: round3(b.y), r: b.r });

function visibleBullets(g, team) {
  const chosen = new Map();
  for (const b of g.bullets) {
    if (b.team === team) { chosen.set(b.id, b); continue; }
    if (g.units.some(u => u.team === team && u.alive && canSeePosition(g, u, b.x, b.y))) chosen.set(b.id, b);
  }
  return [...chosen.values()].map(publicBullet);
}

function view(g, team) {
  const own = g.units.filter(u => u.team === team);
  const visible = {};
  for (const u of own) visible[u.id] = u.alive && g.phase === 'live' ? visibleEnemies(g, u) : [];
  return {
    ...commonState(g, team),
    yourTeam: team,
    side: g.sides[team],
    units: own.map(u => publicUnit(u, true)),
    visibleEnemies: visible,
    bullets: visibleBullets(g, team),
    events: publicEvents(g, team),
  };
}

/* ============================ 练习电脑 ============================ */
/* 仅供本机练习：每个非人类单位用简单目标 + BFS 路径行动。外部 API 与比赛框架不运行它。 */

function bfsPath(g, sx, sy, tx, ty) {
  const start = [Math.floor(sx), Math.floor(sy)], goal = [Math.floor(tx), Math.floor(ty)];
  if (!inBounds(goal[0], goal[1]) || tileAt(g, goal[0] + 0.5, goal[1] + 0.5) === WALL) return null;
  const key = `${start[0]},${start[1]}>${goal[0]},${goal[1]}`;
  const prev = new Int32Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const q = [start];
  seen[start[1] * W + start[0]] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    if (x === goal[0] && y === goal[1]) {
      const path = [];
      let idx = y * W + x;
      while (idx !== -1) {
        path.push([idx % W, Math.floor(idx / W)]);
        idx = prev[idx];
      }
      path.reverse(); path.key = key;
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (seen[ni] || g.tiles[ni] === WALL) continue;
      seen[ni] = 1; prev[ni] = y * W + x; q.push([nx, ny]);
    }
  }
  return null;
}

function botObjective(g, u) {
  if (g.bomb.state === 'planted') return { x: g.bomb.x, y: g.bomb.y };
  const site = u.index % 2 === 0 ? SITES.A : SITES.B;
  // 包点中心在随机地图里保证是空地（buildMap 会清理 5×5）。
  const point = {
    x: Math.floor((site.x1 + site.x2) / 2) + 0.5,
    y: Math.floor((site.y1 + site.y2) / 2) + 0.5,
  };
  if (g.sides[u.team] === 'attack') {
    if (g.bomb.state === 'dropped') return { x: g.bomb.x, y: g.bomb.y };
    return point;
  }
  return point;
}

function botUnitInput(g, u) {
  if (!u.alive || g.phase !== 'live') return { dir: 'N', aim: null };
  const enemy = g.units.find(e => canFire(g, u, e));
  if (enemy) return { dir: 'N', aim: dirToward(u, enemy.x, enemy.y) };
  const visible = g.units.find(e => canSee(g, u, e));
  if (visible) return { dir: 'N', aim: dirToward(u, visible.x, visible.y) };
  const target = botObjective(g, u);
  const key = `${g.round}:${u.id}:${Math.floor(target.x)}:${Math.floor(target.y)}`;
  if (!u.botPath || u.botPathKey !== key || u.botPlanTick === undefined || g.tick - u.botPlanTick > rules.hz) {
    u.botPath = bfsPath(g, u.x, u.y, target.x, target.y);
    u.botPathKey = key; u.botPlanTick = g.tick;
  }
  // 路径是按格生成的；单位已经走过前面的格后要裁掉，否则会回头走向旧格中心。
  if (u.botPath) {
    const ux = Math.floor(u.x), uy = Math.floor(u.y);
    let k = 0;
    while (k < u.botPath.length && !(u.botPath[k][0] === ux && u.botPath[k][1] === uy)) k++;
    if (k >= u.botPath.length) u.botPath = null;
    else if (k > 0) u.botPath = u.botPath.slice(k);
  }
  if (!u.botPath || u.botPath.length < 2) return { dir: 'N', aim: null };
  const [nx, ny] = u.botPath[1];
  const dx = nx + 0.5 - u.x, dy = ny + 0.5 - u.y;
  let dir = dirToward(u, nx + 0.5, ny + 0.5);
  // 斜向需要两个相邻格都为空
  if (Math.abs(dx) > 0.2 && Math.abs(dy) > 0.2) {
    if (circleHitsWall(g, u.x + Math.sign(dx) * 0.35, u.y, rules.unitRadius) ||
        circleHitsWall(g, u.x, u.y + Math.sign(dy) * 0.35, rules.unitRadius)) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
  }
  return { dir, aim: dir };
}

function dirToward(u, x, y) {
  const dx = x - u.x, dy = y - u.y;
  const len = Math.hypot(dx, dy) || 1;
  let best = 'N', dot = -2;
  for (const [dir, v] of Object.entries(DIRS)) {
    if (dir === 'N') continue;
    const l = Math.hypot(v[0], v[1]) || 1;
    const d = (v[0] / l) * (dx / len) + (v[1] / l) * (dy / len);
    if (d > dot) { dot = d; best = dir; }
  }
  return best;
}

module.exports = {
  createMatch, step, advanceWindow, submitWindow, submitBuys, botBuy, botUnitInput,
  snapshot, view, normalizeUnitInput, normalizeFrame, emit, canSee, canFire,
  lineOfSight, circleHitsWall, moveUnit, visibleEnemies,
  DT, FRAMES_PER_DECISION, rules, weapons, TILE: catalog.TILE, W, H, tileIndex, inBounds,
};
