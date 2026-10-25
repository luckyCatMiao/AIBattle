'use strict';
// Frontier RTS agent (DeepSeek V4.1 Flash).
// Reads one JSON observation per stdin line, writes one {"commands":[...],"note":...} JSON per stdout line.
// Policy: 4 workers -> continuous tank production; focus-fire the nearest enemy inside a
// short chase radius; capture neutral outposts when safe; upgrade and repair from surplus.
const readline = require('readline');

const TYPES = {
  worker: {cost: 50, build: 4, hp: 70, speed: 76, range: 0, damage: 0, cooldown: 1, r: 9},
  rifle: {cost: 60, build: 5, hp: 110, speed: 64, range: 115, damage: 13, cooldown: 0.8, r: 8},
  tank: {cost: 160, build: 12, hp: 360, speed: 37, range: 160, damage: 40, cooldown: 2, r: 14},
  raider: {cost: 100, build: 8, hp: 150, speed: 108, range: 94, damage: 16, cooldown: 0.65, r: 11},
};

const CFG = {
  workersTarget: 4,
  build: ['tank'],
  maxQueue: 1,
  upgrades: true,
  upgradeMinT: 22,
  opening: 'nodes',
  staging: 'center',
  engageRange: 380,
  powerRatio: 1.3,
  focusMode: 'nearest',
  focusDistWeight: 0.25,
  chaseRange: 9999,
  pushTime: 90,
  retreatFrac: 0.1,
  woundRecover: 480,
  captureNodes: true,
  captureMinArmy: 2,
  captureSafeDist: 190,
  defendRadius: 320,
  repairMargin: 400,
  repairReserve: 30,
};

const POWER = {rifle: 16.25 * 110, tank: 20 * 360, raider: 24.6 * 150, worker: 0};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const state = {prodIdx: 0, wound: {}, cap: {}};

function bestMine(obs, base) {
  const ms = obs.mines.filter(m => m.ore > 0);
  ms.sort((a, b) => dist(a, base) - dist(b, base));
  return ms[0] || obs.mines[0];
}
function centroid(us) { let x = 0, y = 0; for (const u of us) { x += u.x; y += u.y; } return {x: x / us.length, y: y / us.length}; }
function power(us) { let s = 0; for (const u of us) s += (POWER[u.type] || 0); return s; }
function pickFocusMode(foes, c, mode, w) {
  const W = (w === undefined ? 0.25 : w);
  if (mode === 'nearest') return foes.slice().sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (mode === 'value') return foes.slice().sort((a, b) => (POWER[b.type] || 0) - (POWER[a.type] || 0))[0];
  return foes.slice().sort((a, b) => (a.hp + W * dist(a, c)) - (b.hp + W * dist(b, c)))[0];
}

function decide(obs) {
  const p = obs.yourPlayer, t = obs.now;
  const base = (obs.bases || []).find(b => b.owner === p && b.hp > 0);
  const fbase = (obs.bases || []).find(b => b.owner !== p && b.hp > 0);
  if (!base || !fbase) return [];
  const my = (obs.units || []).filter(u => u.owner === p && u.hp > 0);
  const foes = (obs.units || []).filter(u => u.owner !== p && u.hp > 0);
  const workers = my.filter(u => u.type === 'worker');
  const army = my.filter(u => u.type !== 'worker');
  const nodes = obs.nodes || [];
  const cmds = [];
  const dir = base.x < 640 ? 1 : -1;
  const eCombat = foes.filter(u => u.type !== 'worker');

  function stagingPoint() {
    if (CFG.staging === 'center') return {x: dir > 0 ? 560 : 720, y: 400};
    return {x: base.x + dir * 110, y: base.y};
  }

  // ---------- opening ----------
  if (t === 0) {
    const mine = bestMine(obs, base);
    for (const w of workers) if (mine) cmds.push({type: 'gather', units: [w.id], target: mine.id});
    const rifles = army.filter(u => u.type === 'rifle').slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const north = nodes.find(n => n.y < 300) || {x: 640, y: 420};
    const home = nodes.filter(n => n.y > 400).sort((a, b) => dist(a, base) - dist(b, base))[0] || north;
    if (rifles.length >= 4) {
      cmds.push({type: 'attackMove', units: rifles.slice(0, 3).map(u => u.id), x: north.x, y: north.y});
      cmds.push({type: 'attackMove', units: rifles.slice(3, 4).map(u => u.id), x: home.x, y: home.y});
    } else if (rifles.length) {
      cmds.push({type: 'attackMove', units: rifles.map(u => u.id), x: north.x, y: north.y});
    }
    cmds.push({type: 'rally', x: dir > 0 ? 600 : 680, y: 330});
  }

  // ---------- production ----------
  const lvl = obs.players[p].level;
  const credits = obs.players[p].credits;
  const nextType = CFG.build[state.prodIdx % CFG.build.length];
  const ncost = TYPES[nextType].cost;
  const busy = base.queue.length > 0;
  let didTrain = false;
  const queuedWorkers = base.queue.filter(q => q.type === 'worker').length;
  if (workers.length + queuedWorkers < CFG.workersTarget && t < 60) {
    if (base.queue.length <= CFG.maxQueue && credits >= 50 && my.length + base.queue.length < 40) {
      cmds.push({type: 'train', unit: 'worker'});
      didTrain = true;
    }
  }
  if (!didTrain && base.queue.length <= CFG.maxQueue && credits >= ncost && my.length + base.queue.length < 40) {
    cmds.push({type: 'train', unit: nextType});
    state.prodIdx++;
    didTrain = true;
  }
  if (CFG.upgrades && lvl < 2 && t > CFG.upgradeMinT) {
    const cost = 180 + lvl * 120;
    const reserve = didTrain ? ncost : 0;
    if (credits >= cost + reserve && (busy || didTrain || credits >= cost + ncost)) cmds.push({type: 'upgrade'});
  }
  if (base.hp < base.maxHp - CFG.repairMargin && credits >= 100 + CFG.repairReserve && (t - obs.players[p].repairAt) >= 30) {
    cmds.push({type: 'repair'});
  }

  // ---------- army control ----------
  if (army.length && t > 0) {
    const pool = army;
    const capIds = new Set(Object.keys(state.cap));
    if (CFG.captureNodes) {
      for (const uid of Object.keys(state.cap)) {
        const u = pool.find(x => x.id === uid);
        const nd = nodes.find(n => n.id === state.cap[uid]);
        if (!u || !nd || nd.owner === p) { delete state.cap[uid]; capIds.delete(uid); continue; }
        if (eCombat.some(v => dist(v, nd) < 175)) { delete state.cap[uid]; capIds.delete(uid); }
      }
      const freeForCap = pool.filter(u => !capIds.has(u.id));
      const threatNear = eCombat.some(v => dist(v, centroid(pool)) < CFG.engageRange);
      if (!threatNear && freeForCap.length > CFG.captureMinArmy) {
        for (const nd of nodes) {
          if (nd.owner === p) continue;
          if (Object.values(state.cap).includes(nd.id)) continue;
          if (eCombat.some(v => dist(v, nd) < CFG.captureSafeDist)) continue;
          const cand = freeForCap.filter(u => !capIds.has(u.id)).sort((a, b) => dist(a, nd) - dist(b, nd))[0];
          if (!cand) break;
          if (freeForCap.length - capIds.size <= CFG.captureMinArmy) break;
          state.cap[cand.id] = nd.id;
          capIds.add(cand.id);
        }
      }
    }
    const capUnits = pool.filter(u => capIds.has(u.id));
    const main = pool.filter(u => !capIds.has(u.id));
    const myC = centroid(main.length ? main : pool);
    const baseThreat = eCombat.filter(u => dist(u, base) < CFG.defendRadius);

    const retreatIds = [], fight = [];
    for (const u of main) {
      const frac = u.hp / u.maxHp;
      const near = eCombat.reduce((m, v) => Math.min(m, dist(u, v)), 1e9);
      if (state.wound[u.id] === undefined) state.wound[u.id] = false;
      if (frac < CFG.retreatFrac && near < 300) state.wound[u.id] = true;
      if (state.wound[u.id] && (near > CFG.woundRecover || dist(u, base) < 180)) state.wound[u.id] = false;
      if (state.wound[u.id]) retreatIds.push(u.id); else fight.push(u);
    }
    const eNear = eCombat.filter(u => dist(u, myC) < CFG.engageRange + 100);
    const ourP = power(fight), theirP = power(eNear);
    if (baseThreat.length) {
      const tgt = baseThreat.slice().sort((a, b) => a.hp - b.hp)[0];
      if (fight.length) cmds.push({type: 'attack', units: fight.map(u => u.id), target: tgt.id});
    } else if (eNear.length && (theirP < ourP / CFG.powerRatio || eNear.some(u => dist(u, myC) < 230))) {
      const tgt = pickFocusMode(eNear, myC, CFG.focusMode, CFG.focusDistWeight);
      if (fight.length && tgt && dist(tgt, myC) < CFG.chaseRange) cmds.push({type: 'attack', units: fight.map(u => u.id), target: tgt.id});
      else if (fight.length) cmds.push({type: 'attackMove', units: fight.map(u => u.id), x: myC.x, y: myC.y});
    } else if (fight.length) {
      const nearEnemies = eCombat.filter(v => dist(v, myC) < 650);
      const ePow = power(nearEnemies);
      const obj = stagingPoint();
      if (t > CFG.pushTime && !eNear.length && ePow < ourP) cmds.push({type: 'attackMove', units: fight.map(u => u.id), x: fbase.x, y: fbase.y});
      else cmds.push({type: 'attackMove', units: fight.map(u => u.id), x: obj.x, y: obj.y});
    }
    if (retreatIds.length) cmds.push({type: 'move', units: retreatIds, x: base.x - dir * 30, y: base.y});
    for (const u of capUnits) {
      const nd = nodes.find(n => n.id === state.cap[u.id]);
      if (nd) cmds.push({type: 'move', units: [u.id], x: nd.x, y: nd.y});
    }
  }
  return cmds.slice(0, 10);
}

const rl = readline.createInterface({input: process.stdin});
rl.on('line', (line) => {
  let out = {commands: []};
  try {
    const s = line.trim();
    if (!s) { process.stdout.write(JSON.stringify(out) + '\n'); return; }
    const obs = JSON.parse(s);
    if (obs && obs.status === 'finished') out = {commands: [], note: 'finished'};
    else if (obs && typeof obs.yourPlayer === 'number') out = {commands: decide(obs), note: 'tank macro: focus nearest, capture, repair'};
  } catch (e) {
    try { process.stderr.write('agent error: ' + (e && e.stack ? e.stack : e) + '\n'); } catch (_) {}
    out = {commands: []};
  }
  process.stdout.write(JSON.stringify(out) + '\n');
});
