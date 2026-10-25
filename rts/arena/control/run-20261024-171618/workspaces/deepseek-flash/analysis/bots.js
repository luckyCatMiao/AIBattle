'use strict';
// Bot framework: generic RTS policy with configurable build, micro, raid.
const path = require('path');
const R = require(path.join('..', 'rules.js'));
const {TYPES} = R;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function money(obs, p) { return obs.players[p].credits; }

function ownBase(obs, p) { return obs.bases.find(b => b.owner === p); }
function foeBase(obs, p) { return obs.bases.find(b => b.owner !== p && b.hp > 0); }
function myUnits(obs, p) { return obs.units.filter(u => u.owner === p && u.hp > 0); }
function foeUnits(obs, p) { return obs.units.filter(u => u.owner !== p && u.hp > 0); }

// ---------------- Generic bot ----------------
function makeBot(cfg) {
  const C = Object.assign({
    cycle: ['tank', 'raider', 'raider'], // production cycle
    maxQueue: 1,
    upgrades: true,
    engageRadius: 430,
    retreatFrac: 0.28,
    focus: true,
    raidFrom: 999,       // time to start raid
    raidCount: 0,        // raiders reserved for raid
    defenseRadius: 300,  // distance from own base to treat enemies as base threats
    objective: 'base',   // 'base' | 'center'
    workersTarget: 3,
    opening: null,       // function(obs,p,cmds)
  }, cfg);
  const state = {prodIdx: 0, lastQueue: 0};
  return function bot(obs, g) {
    const p = obs.yourPlayer, t = obs.now;
    const base = ownBase(obs, p), fbase = foeBase(obs, p);
    const my = myUnits(obs, p), foes = foeUnits(obs, p);
    const workers = my.filter(u => u.type === 'worker');
    const army = my.filter(u => u.type !== 'worker');
    const cmds = [];

    // ---- opening ----
    if (t === 0 && C.opening) C.opening(obs, p, cmds);
    if (t === 0 && !C.opening) {
      // default: workers gather nearest mine, army attackMove center
      for (const w of workers) cmds.push({type: 'gather', units: [w.id], target: nearestMine(obs, base).id});
    }

    // ---- production ----
    if (base) {
      const next = C.cycle[state.prodIdx % C.cycle.length];
      const ncost = TYPES[next].cost;
      const busy = base.queue.length > 0;
      // upgrade only when it will not block a train
      if (C.upgrades && obs.players[p].level < 2 && t > 22) {
        const cost = 180 + obs.players[p].level * 120;
        const canSpare = busy ? money(obs, p) >= cost : money(obs, p) >= cost + ncost;
        if (canSpare) cmds.push({type: 'upgrade'});
      }
      if (base.queue.length <= C.maxQueue) {
        if (money(obs, p) >= ncost && my.length + base.queue.length < 40) {
          cmds.push({type: 'train', unit: next});
          state.prodIdx++;
        }
      }
    }
    // repair
    if (base && base.hp < base.maxHp - 350 && money(obs, p) >= 130 && t - (obs.players[p].repairAt) >= 30) {
      cmds.push({type: 'repair'});
    }

    // ---- army micro ----
    if (army.length && fbase) {
      const myC = centroid(army);
      // base threat: enemies close to our base
      const threat = base ? foes.filter(u => dist(u, base) < C.defenseRadius) : [];
      // split raid group
      let raid = [], main = army;
      if (C.raidCount > 0 && t >= C.raidFrom) {
        const raiders = army.filter(u => u.type === 'raider');
        raid = raiders.slice(0, C.raidCount);
        const ids = new Set(raid.map(u => u.id));
        main = army.filter(u => !ids.has(u.id));
      }
      // engage decision
      const target = pickFocus(obs, p, main, foes, C);
      if (threat.length) {
        // defend base: attack threats
        const tgt = threat.slice().sort((a, b) => dist(a, base) - dist(b, base))[0];
        cmds.push({type: 'attack', units: main.map(u => u.id), target: tgt.id});
        // hurt units retreat
        retreatHurt(cmds, main, base, C);
      } else if (target && dist(target, myC) < C.engageRadius) {
        if (C.focus) cmds.push({type: 'attack', units: main.map(u => u.id), target: target.id});
        else spreadAttack(cmds, main, foes);
        retreatHurt(cmds, main, base, C);
      } else {
        // no fight nearby: attackMove objective
        const obj = C.objective === 'center' ? {x: 640, y: 420} : (fbase || {x: 640, y: 420});
        if (main.length) cmds.push({type: 'attackMove', units: main.map(u => u.id), x: obj.x, y: obj.y});
      }
      // raid behavior
      if (raid.length) {
        const nearFoe = foes.filter(u => u.type !== 'worker' && dist(u, centroid(raid)) < 240);
        if (nearFoe.length) {
          cmds.push({type: 'attack', units: raid.map(u => u.id), target: nearFoe.sort((a, b) => a.hp - b.hp)[0].id});
        } else if (fbase) {
          if (dist(centroid(raid), fbase) < 170 + 60) {
            cmds.push({type: 'attack', units: raid.map(u => u.id), target: fbase.id});
          } else {
            cmds.push({type: 'move', units: raid.map(u => u.id), x: fbase.x, y: fbase.y});
          }
        }
      }
    }
    return cmds.slice(0, 10);
  };
}

function nearestMine(obs, base) {
  return obs.mines.filter(m => m.ore > 0).sort((a, b) => dist(a, base) - dist(b, base))[0];
}
function centroid(us) {
  let x = 0, y = 0; for (const u of us) { x += u.x; y += u.y; }
  return {x: x / us.length, y: y / us.length};
}
function pickFocus(obs, p, army, foes, C) {
  if (!foes.length || !army.length) return null;
  const c = centroid(army);
  const cands = foes.filter(u => u.type !== 'worker' && dist(u, c) < C.engageRadius + 120);
  if (!cands.length) return null;
  // score: low hp first, prefer valuable combat units
  cands.sort((a, b) => (a.hp) - (b.hp));
  return cands[0];
}
function retreatHurt(cmds, army, base, C) {
  if (!base) return;
  const hurt = army.filter(u => u.hp < u.maxHp * C.retreatFrac);
  if (hurt.length) cmds.push({type: 'move', units: hurt.map(u => u.id), x: base.x + (base.x < 640 ? -20 : 20), y: base.y});
}
function spreadAttack(cmds, army, foes) {
  const groups = {};
  for (const u of army) {
    let best = null, bd = 1e9;
    for (const v of foes) { if (v.type === 'worker') continue; const d = dist(u, v); if (d < bd) { bd = d; best = v; } }
    if (best) { (groups[best.id] = groups[best.id] || []).push(u.id); }
  }
  for (const k in groups) if (cmds.length < 9) cmds.push({type: 'attack', units: groups[k], target: k});
}

// ---------------- Sol proxy ----------------
// Mirrors observed sol: opening tank+worker, 3 rifles north node, 1 rifle home-side node,
// one tank at a time, upgrade at first affordability (~35s/60s), focus-fire micro, retreat hurt.
function makeSol(cfg = {}) {
  const state = {init: false, targetIdx: 0};
  return function sol(obs, g) {
    const p = obs.yourPlayer, t = obs.now;
    const base = ownBase(obs, p), fbase = foeBase(obs, p);
    const my = myUnits(obs, p), foes = foeUnits(obs, p);
    const workers = my.filter(u => u.type === 'worker');
    const army = my.filter(u => u.type !== 'worker');
    const cmds = [];
    const dir = base.x < 640 ? 1 : -1; // toward center
    const northNode = {x: 640, y: 250};
    const homeNode = obs.nodes.filter(n => n.y > 400).sort((a, b) => dist(a, base) - dist(b, base))[0];
    const rally = {x: 640 - dir * -0 + (dir > 0 ? -47 : 47), y: 267}; // 593/687
    if (t < 1.5) {
      if (t === 0) {
        cmds.push({type: 'train', unit: 'tank'}, {type: 'train', unit: 'worker'});
        cmds.push({type: 'rally', x: rally.x, y: rally.y});
        for (const w of workers) cmds.push({type: 'gather', units: [w.id], target: nearestMine(obs, base).id});
        const rifles = army.filter(u => u.type === 'rifle').sort((a, b) => a.id.localeCompare(b.id));
        const three = rifles.slice(0, 3), one = rifles.slice(3, 4);
        if (three.length) cmds.push({type: 'attackMove', units: three.map(u => u.id), x: northNode.x, y: northNode.y});
        if (one.length) cmds.push({type: 'attackMove', units: one.map(u => u.id), x: homeNode.x, y: homeNode.y});
      }
      if (t === 1) cmds.push({type: 'rally', x: rally.x, y: 420});
      return cmds;
    }
    // production
    if (base.queue.length === 0) {
      if (obs.players[p].level < 2) {
        const cost = 180 + obs.players[p].level * 120;
        if (money(obs, p) >= cost && t > 25) cmds.push({type: 'upgrade'});
      }
      if (base.queue.length === 0 && money(obs, p) >= 160 && my.length + base.queue.length < 40) cmds.push({type: 'train', unit: 'tank'});
    }
    if (base.hp < base.maxHp - 500 && money(obs, p) >= 130 && t - obs.players[p].repairAt >= 30) cmds.push({type: 'repair'});
    // micro
    if (army.length) {
      const c = centroid(army);
      const combatFoes = foes.filter(u => u.type !== 'worker');
      const close = combatFoes.filter(u => dist(u, c) < 470);
      // hurt retreat
      const hurt = army.filter(u => u.hp < u.maxHp * (cfg.retreatFrac || 0.3));
      const rest = army.filter(u => u.hp >= u.maxHp * (cfg.retreatFrac || 0.3));
      if (hurt.length) cmds.push({type: 'move', units: hurt.map(u => u.id), x: base.x + (base.x < 640 ? -30 : 30), y: base.y});
      if (close.length) {
        // focus lowest hp
        close.sort((a, b) => a.hp - b.hp);
        if (rest.length) cmds.push({type: 'attack', units: rest.map(u => u.id), target: close[0].id});
      } else if (rest.length) {
        const obj = fbase ? {x: fbase.x, y: fbase.y} : {x: 640, y: 420};
        cmds.push({type: 'attackMove', units: rest.map(u => u.id), x: obj.x, y: obj.y});
      }
      // workers under attack? ignore
    }
    return cmds.slice(0, 10);
  };
}

module.exports = {makeBot, makeSol, dist, centroid, nearestMine, ownBase, foeBase, myUnits, foeUnits};
