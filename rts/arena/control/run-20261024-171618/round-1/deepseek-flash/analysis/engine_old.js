'use strict';
// Engine: configurable RTS policy with staging, focus fire, node capture, raids.
const path = require('path');
const R = require(path.join('..', 'rules.js'));
const {TYPES} = R;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const POWER = {rifle: 16.25 * 110, tank: 20 * 360, raider: 24.6 * 150, worker: 0};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeEngine(cfg) {
  const C = Object.assign({
    workersTarget: 4,
    build: ['tank'],
    schedule: null,
    maxQueue: 1,
    upgrades: true,
    upgradeMinT: 22,
    opening: 'nodes',
    staging: 'center',
    engageRange: 430,
    powerRatio: 0.85,
    focus: true,
    focusMode: 'lowhp',
    focusDistWeight: 0.25,
    chaseRange: 480,
    pushTime: 90,
    retreatFrac: 0.3,
    retreatTo: 'base',
    raid: null,
    defendRadius: 320,
    captureNodes: false,
    repairMargin: 400,
    repairReserve: 30,
    captureMinArmy: 2,
    seed: 1,
    jitter: 0,
  }, cfg);
  const rng = mulberry32(C.seed * 7919 + 13);
  const st = {prodIdx: 0, wound: {}, cap: {}};
  return function bot(obs) {
    const p = obs.yourPlayer, t = obs.now;
    const base = obs.bases.find(b => b.owner === p);
    const fbase = obs.bases.find(b => b.owner !== p && b.hp > 0);
    const my = obs.units.filter(u => u.owner === p && u.hp > 0);
    const foes = obs.units.filter(u => u.owner !== p && u.hp > 0);
    const workers = my.filter(u => u.type === 'worker');
    const army = my.filter(u => u.type !== 'worker');
    const cmds = [];
    const dir = base.x < 640 ? 1 : -1;
    const center = {x: 640, y: 420};
    const nodes = obs.nodes;
    const eCombat = foes.filter(u => u.type !== 'worker');

    function stagingPoint() {
      if (C.staging === 'center') return {x: dir > 0 ? 560 : 720, y: 400};
      if (C.staging === 'home') return {x: base.x + dir * 110, y: base.y};
      if (C.staging === 'north') return {x: 640, y: 300};
      if (C.staging === 'enemyBase') return {x: fbase.x, y: fbase.y};
      if (C.staging === 'enemyMine') return {x: fbase.x - dir * 94, y: fbase.y + 65};
      return {x: base.x + dir * 110, y: base.y};
    }

    // ---------- opening ----------
    if (t === 0) {
      for (const w of workers) cmds.push({type: 'gather', units: [w.id], target: bestMine(obs, base).id});
      const rifles = army.filter(u => u.type === 'rifle').sort((a, b) => a.id.localeCompare(b.id));
      const north = nodes.find(n => n.y < 300) || center;
      const home = nodes.filter(n => n.y > 400).sort((a, b) => dist(a, base) - dist(b, base))[0] || north;
      if (C.opening === 'nodes') {
        if (rifles.length >= 4) {
          cmds.push({type: 'attackMove', units: rifles.slice(0, 3).map(u => u.id), x: north.x, y: north.y});
          cmds.push({type: 'attackMove', units: rifles.slice(3, 4).map(u => u.id), x: home.x, y: home.y});
        } else if (rifles.length) cmds.push({type: 'attackMove', units: rifles.map(u => u.id), x: north.x, y: north.y});
      } else if (C.opening === 'rushWorkers') {
        const emine = bestMine(obs, fbase);
        if (rifles.length) cmds.push({type: 'move', units: rifles.map(u => u.id), x: emine.x, y: emine.y});
      } else if (C.opening === 'enemyBase') {
        if (rifles.length) cmds.push({type: 'move', units: rifles.map(u => u.id), x: fbase.x, y: fbase.y});
      } else if (C.opening === 'defend') {
        const sp = stagingPoint();
        if (rifles.length) cmds.push({type: 'move', units: rifles.map(u => u.id), x: sp.x, y: sp.y});
      } else if (C.opening === 'allNorth') {
        if (rifles.length) cmds.push({type: 'attackMove', units: rifles.map(u => u.id), x: north.x, y: north.y});
      } else if (C.opening === 'allHome') {
        if (rifles.length) cmds.push({type: 'attackMove', units: rifles.map(u => u.id), x: home.x, y: home.y});
      }
      cmds.push({type: 'rally', x: dir > 0 ? 600 : 680, y: 330});
      // production at t=0 continues below
    }

    // ---------- production ----------
    const lvl = obs.players[p].level;
    const credits = obs.players[p].credits;
    const nextType = (C.schedule && st.prodIdx < C.schedule.length) ? C.schedule[st.prodIdx] : C.build[st.prodIdx % C.build.length];
    const ncost = TYPES[nextType].cost;
    const busy = base.queue.length > 0;
    let didTrain = false;
    if (workers.length + base.queue.filter(q => q.type === 'worker').length < C.workersTarget && t < 60) {
      if (base.queue.length <= C.maxQueue && credits >= 50 && my.length + base.queue.length < 40) {
        cmds.push({type: 'train', unit: 'worker'});
        didTrain = true;
      }
    }
    if (!didTrain && base.queue.length <= C.maxQueue && credits >= ncost && my.length + base.queue.length < 40) {
      cmds.push({type: 'train', unit: nextType});
      st.prodIdx++;
      didTrain = true;
    }
    if (C.upgrades && lvl < 2 && t > C.upgradeMinT) {
      const cost = 180 + lvl * 120;
      if (credits >= cost && (busy || didTrain || credits >= cost + ncost)) cmds.push({type: 'upgrade'});
    }
    if (base.hp < base.maxHp - C.repairMargin && credits >= 100 + C.repairReserve && t - obs.players[p].repairAt >= 30) cmds.push({type: 'repair'});

    // ---------- army control ----------
    if (army.length && t > 0) {
      // raid split
      let raid = [], pool = army;
      if (C.raid && t >= C.raid.from) {
        const cand = army.filter(u => u.type === (C.raid.unit || 'raider'));
        raid = cand.slice(0, C.raid.count);
        const ids = new Set(raid.map(u => u.id));
        pool = army.filter(u => !ids.has(u.id));
      }
      // capture assignment
      const capIds = new Set(Object.keys(st.cap));
      if (C.captureNodes) {
        // release finished/dead/endangered
        for (const uid of Object.keys(st.cap)) {
          const u = pool.find(x => x.id === uid);
          const nd = nodes.find(n => n.id === st.cap[uid]);
          if (!u || !nd || nd.owner === p) { delete st.cap[uid]; capIds.delete(uid); continue; }
          const enemyNear = eCombat.some(v => dist(v, nd) < 175);
          if (enemyNear) { delete st.cap[uid]; capIds.delete(uid); }
        }
        const freeForCap = pool.filter(u => !capIds.has(u.id));
        const threatNear = eCombat.some(v => dist(v, centroid(pool)) < C.engageRange);
        if (!threatNear && freeForCap.length > C.captureMinArmy) {
          for (const nd of nodes) {
            if (nd.owner === p) continue;
            if (Object.values(st.cap).includes(nd.id)) continue;
            if (eCombat.some(v => dist(v, nd) < 190)) continue;
            const cand = freeForCap.filter(u => !capIds.has(u.id)).sort((a, b) => dist(a, nd) - dist(b, nd))[0];
            if (!cand) break;
            if (freeForCap.length - capIds.size <= C.captureMinArmy) break;
            st.cap[cand.id] = nd.id; capIds.add(cand.id);
          }
        }
      }
      const capUnits = pool.filter(u => capIds.has(u.id));
      const main = pool.filter(u => !capIds.has(u.id));

      const myC = centroid(main.length ? main : pool);
      const baseThreat = eCombat.filter(u => dist(u, base) < C.defendRadius);

      // wounded hysteresis
      const retreatIds = [], fight = [];
      for (const u of main) {
        const frac = u.hp / u.maxHp;
        const near = eCombat.reduce((m, v) => Math.min(m, dist(u, v)), 1e9);
        if (st.wound[u.id] === undefined) st.wound[u.id] = false;
        if (frac < C.retreatFrac && near < 300) st.wound[u.id] = true;
        if (st.wound[u.id] && near > 480) st.wound[u.id] = false;
        if (st.wound[u.id]) retreatIds.push(u.id); else fight.push(u);
      }
      const eNear = eCombat.filter(u => dist(u, myC) < C.engageRange + 100);
      const ourP = power(fight), theirP = power(eNear);
      if (baseThreat.length) {
        const tgt = baseThreat.slice().sort((a, b) => a.hp - b.hp)[0];
        if (fight.length) cmds.push({type: 'attack', units: fight.map(u => u.id), target: tgt.id});
      } else if (eNear.length && (theirP < ourP / C.powerRatio || eNear.some(u => dist(u, myC) < 230))) {
        if (C.focusMode === 'spread') spreadAttack(cmds, fight, eNear);
        else if (fight.length) cmds.push({type: 'attack', units: fight.map(u => u.id), target: pickFocusMode(eNear, myC, C.focusMode)});
      } else if (fight.length) {
        const obj = stagingPoint();
        if (t > C.pushTime && !eNear.length) cmds.push({type: 'attackMove', units: fight.map(u => u.id), x: fbase.x, y: fbase.y});
        else cmds.push({type: 'attackMove', units: fight.map(u => u.id), x: obj.x, y: obj.y});
      }
      if (retreatIds.length) {
        const rt = C.retreatTo === 'base' ? {x: base.x - dir * 30, y: base.y} : stagingPoint();
        cmds.push({type: 'move', units: retreatIds, x: rt.x, y: rt.y});
      }
      // capture unit orders
      for (const u of capUnits) {
        const nd = nodes.find(n => n.id === st.cap[u.id]);
        if (nd) cmds.push({type: 'move', units: [u.id], x: nd.x, y: nd.y});
      }
      // raid orders
      if (raid.length) raidOrders(cmds, raid, foes, eCombat, fbase, C);
    }
    return cmds.slice(0, 10);
  };
}

function raidOrders(cmds, raid, foes, eCombat, fbase, C) {
  const rc = centroid(raid);
  const tanks = eCombat.filter(u => (u.type === 'tank' || u.type === 'raider') && dist(u, rc) < 240);
  const eWorkers = foes.filter(u => u.type === 'worker');
  if (tanks.length) {
    const tn = tanks.slice().sort((a, b) => dist(a, rc) - dist(b, rc))[0];
    const dx = rc.x - tn.x, dy = rc.y - tn.y, dl = Math.hypot(dx, dy) || 1;
    const tx = clamp(rc.x + dx / dl * 280, 40, 1240), ty = clamp(rc.y + dy / dl * 280, 40, 800);
    cmds.push({type: 'move', units: raid.map(u => u.id), x: tx, y: ty});
    return;
  }
  const nearW = eWorkers.filter(u => dist(u, rc) < 230).sort((a, b) => dist(a, rc) - dist(b, rc));
  if (nearW.length) { cmds.push({type: 'attack', units: raid.map(u => u.id), target: nearW[0].id}); return; }
  if (eWorkers.length && C.raid.workersFirst && dist(rc, centroid(eWorkers)) < 520) {
    const wc = centroid(eWorkers);
    cmds.push({type: 'move', units: raid.map(u => u.id), x: wc.x, y: wc.y});
    return;
  }
  if (dist(rc, fbase) < 190) cmds.push({type: 'attack', units: raid.map(u => u.id), target: fbase.id});
  else cmds.push({type: 'move', units: raid.map(u => u.id), x: fbase.x, y: fbase.y});
}

function power(us) { let s = 0; for (const u of us) s += POWER[u.type] || 0; return s; }
function centroid(us) { let x = 0, y = 0; for (const u of us) { x += u.x; y += u.y; } return {x: x / us.length, y: y / us.length}; }
function bestMine(obs, base) {
  return obs.mines.filter(m => m.ore > 0).sort((a, b) => dist(a, base) - dist(b, base))[0] || obs.mines[0];
}
function pickFocusMode(foes, c, mode, w) {
  const W = (w === undefined ? 0.25 : w);
  if (mode === 'nearest') return foes.slice().sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (mode === 'value') return foes.slice().sort((a, b) => (POWER[b.type] || 0) - (POWER[a.type] || 0))[0];
  return foes.slice().sort((a, b) => (a.hp + W * dist(a, c)) - (b.hp + W * dist(b, c)))[0];
}
function spreadAttack(cmds, army, foes) {
  const groups = {};
  for (const u of army) {
    let best = null, bd = 1e9;
    for (const v of foes) { const d = dist(u, v); if (d < bd) { bd = d; best = v; } }
    if (best) (groups[best.id] = groups[best.id] || []).push(u.id);
  }
  for (const k in groups) if (cmds.length < 9) cmds.push({type: 'attack', units: groups[k], target: k});
}
module.exports = {makeEngine, power, centroid, bestMine};
