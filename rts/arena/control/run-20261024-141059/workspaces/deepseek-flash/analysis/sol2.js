'use strict';
// Faithful sol proxy reconstructed from public last-series replays.
// Opening (observed): train tank+worker, rally ~(593/687,267)->(same,420), 3 rifles north node,
// 1 rifle home south node, workers gather. Then one tank at a time (queue<2, credits>=160),
// upgrades at first affordability after ~30s, focus-fire lowest-HP, retreat <~30% HP to base.
const path = require('path');
const R = require(path.join('..', 'rules.js'));
const {TYPES} = R;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeSol2(cfg = {}) {
  const C = Object.assign({
    workersTarget: 4,
    retreatFrac: 0.3,
    focusRange: 470,
    defendBase: true,
    defendRadius: 330,
    pushAfter: 90,
    rebuildWorkers: false,
    rallyForward: true,
    advanceMode: 'south',   // 'south' | 'north' | 'base'
    kiteFrac: 0,            // if >0, units below this HP pull back while enemies near
  }, cfg);
  const st = {
    wounded: {},
  };
  return function sol(obs) {
    const p = obs.yourPlayer, t = obs.now;
    const base = obs.bases.find(b => b.owner === p);
    const fbase = obs.bases.find(b => b.owner !== p && b.hp > 0);
    const my = obs.units.filter(u => u.owner === p && u.hp > 0);
    const foes = obs.units.filter(u => u.owner !== p && u.hp > 0);
    const workers = my.filter(u => u.type === 'worker');
    const army = my.filter(u => u.type !== 'worker');
    const cmds = [];
    const dir = base.x < 640 ? 1 : -1;
    const north = obs.nodes.find(n => n.y < 300);
    const homeNode = obs.nodes.filter(n => n.y > 400).sort((a, b) => dist(a, base) - dist(b, base))[0];

    // ---- exact opening ----
    if (t === 0) {
      cmds.push({type: 'train', unit: 'tank'}, {type: 'train', unit: 'worker'});
      cmds.push({type: 'rally', x: 640 - dir * 47, y: 267});
      for (const w of workers) cmds.push({type: 'gather', units: [w.id], target: nearestMine(obs, base).id});
      const rifles = army.filter(u => u.type === 'rifle').sort((a, b) => a.id.localeCompare(b.id));
      if (rifles.length >= 4) {
        cmds.push({type: 'attackMove', units: rifles.slice(0, 3).map(u => u.id), x: north.x, y: north.y});
        cmds.push({type: 'attackMove', units: rifles.slice(3, 4).map(u => u.id), x: homeNode.x, y: homeNode.y});
      }
      cmds.push({type: 'train', unit: 'tank'}); // no-op if unaffordable; sol's queue<2 rule
      return cmds;
    }
    if (t === 1) cmds.push({type: 'rally', x: 640 - dir * 47, y: 420});

    // ---- production ----
    const lvl = obs.players[p].level;
    if (base.queue.length < 2 && obs.players[p].credits >= 160 && my.length + base.queue.length < 40) {
      cmds.push({type: 'train', unit: 'tank'});
    }
    if (lvl < 2) {
      const cost = 180 + lvl * 120;
      if (obs.players[p].credits >= cost && t > 28) cmds.push({type: 'upgrade'});
    }
    if (C.rebuildWorkers && workers.length < 4 && base.queue.length === 0 && obs.players[p].credits >= 210) {
      cmds.push({type: 'train', unit: 'worker'});
    }
    if (base.hp < base.maxHp - 500 && obs.players[p].credits >= 140 && t - obs.players[p].repairAt >= 30) {
      cmds.push({type: 'repair'});
    }

    // ---- micro ----
    if (army.length) {
      const c = centroid(army);
      const combat = foes.filter(u => u.type !== 'worker');
      const near = combat.filter(u => dist(u, c) < C.focusRange);
      const baseThreat = C.defendBase ? combat.filter(u => dist(u, base) < C.defendRadius) : [];
      // wounded hysteresis
      const hurt = [];
      const rest = [];
      for (const u of army) {
        const frac = u.hp / u.maxHp;
        const dmin = combat.reduce((m, v) => Math.min(m, dist(u, v)), 1e9);
        if (st.wounded[u.id] === undefined) st.wounded[u.id] = false;
        if (frac < C.retreatFrac && dmin < 220) st.wounded[u.id] = true;
        if (st.wounded[u.id] && dmin > 420) st.wounded[u.id] = false;
        if (st.wounded[u.id]) hurt.push(u);
        else if (C.kiteFrac > 0 && frac < C.kiteFrac && dmin < 210) hurt.push(u);
        else rest.push(u);
      }
      if (far(hurt, base)) {
        cmds.push({type: 'move', units: hurt.map(u => u.id), x: base.x - dir * 30, y: base.y});
      }
      if (baseThreat.length && rest.length) {
        const tgt = baseThreat.slice().sort((a, b) => a.hp - b.hp)[0];
        cmds.push({type: 'attack', units: rest.map(u => u.id), target: tgt.id});
      } else if (near.length && rest.length) {
        const tgt = near.slice().sort((a, b) => a.hp - b.hp)[0];
        cmds.push({type: 'attack', units: rest.map(u => u.id), target: tgt.id});
      } else if (rest.length) {
        let objective;
        if (C.advanceMode === 'south') {
          const enemySouth = obs.nodes.filter(n => n.y > 400).sort((a, b) => dist(a, fbase) - dist(b, fbase))[0];
          objective = (rest.length >= 4 || t > C.pushAfter) ? fbase : (enemySouth || north || fbase);
        } else if (C.advanceMode === 'north') {
          objective = (rest.length >= 4 || t > C.pushAfter) ? fbase : (north || fbase);
        } else objective = fbase;
        cmds.push({type: 'attackMove', units: rest.map(u => u.id), x: objective.x, y: objective.y});
      }
    }
    return cmds.slice(0, 10);
  };
}

function far(us, p) { return us.length > 0; }
function centroid(us) { let x = 0, y = 0; for (const u of us) { x += u.x; y += u.y; } return {x: x / us.length, y: y / us.length}; }
function nearestMine(obs, base) {
  return obs.mines.filter(m => m.ore > 0).sort((a, b) => dist(a, base) - dist(b, base))[0] || obs.mines[0];
}
module.exports = {makeSol2};
