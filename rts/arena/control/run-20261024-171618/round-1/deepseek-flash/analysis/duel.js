'use strict';
// Unit matchup duel tester: place armies at center, no production, run until one side dead.
const path = require('path');
const R = require(path.join('..', 'rules.js'));
const {createMatch, step, snapshot, TYPES, DT} = R;

// comp: {rifle:n, tank:n, raider:n}; micro: function or null
function duel(compA, compB, micro, opts = {}) {
  const g = createMatch({id: 'duel', players: [{name: 'A'}, {name: 'B'}]});
  g.status = 'playing';
  // clear starting units
  g.units.length = 0;
  // reset player credits irrelevant
  const make = (owner, comp, cx, cy) => {
    let k = 0;
    const total = comp.rifle + comp.tank + comp.raider;
    for (const type of ['rifle', 'tank', 'raider']) {
      for (let i = 0; i < comp[type]; i++) {
        const u = R.spawn(g, owner, type, cx + ((k % 6) - 2.5) * 26, cy + (Math.floor(k / 6) - 1) * 26);
        u.order = {type: 'hold'};
        k++;
      }
    }
  };
  make(0, compA, 640 - 220, 420);
  make(1, compB, 640 + 220, 420);
  // remove bases from combat by moving them far away (keep alive)
  for (const b of g.bases) { b.x = b.owner === 0 ? 40 : 1240; b.y = 40; b.hp = 1e9; }
  const errs = [[], []];
  let t = 0;
  for (; t < 120 && g.status === 'playing'; t++) {
    if (micro) {
      const o0 = snapshot(g, 0); o0.lastErrors = []; const o1 = snapshot(g, 1); o1.lastErrors = [];
      for (const [owner, o] of [[0, o0], [1, o1]]) {
        let cmds = [];
        try { cmds = micro(o, g, owner) || []; } catch (e) {}
        let n = 0;
        for (const c of cmds) { if (n++ >= 10) break; try { R.command(g, owner, c); } catch (e) { errs[owner].push(e.message); } }
      }
    }
    for (let i = 0; i < 20; i++) step(g, DT);
    const alive = [0, 1].map(p => g.units.filter(u => u.owner === p).length);
    if (alive[0] === 0 || alive[1] === 0) break;
  }
  const alive = [0, 1].map(p => g.units.filter(u => u.owner === p));
  const hp = alive.map(us => us.reduce((s, u) => s + u.hp, 0));
  return {sec: t, alive: alive.map(a => a.length), hp,
    winner: alive[0].length && !alive[1].length ? 0 : (!alive[0].length && alive[1].length ? 1 : null),
    surv: alive.map(us => us.reduce((o, u) => { o[u.type] = (o[u.type] || 0) + 1; return o; }, {}))};
}

module.exports = {duel};
if (require.main === module) {
  const comps = {
    tank10: {rifle: 0, tank: 10, raider: 0},
    raider16: {rifle: 0, tank: 0, raider: 16},
    rifle27: {rifle: 27, tank: 0, raider: 0},
    mixed: {rifle: 6, tank: 6, raider: 6},
  };
  for (const a of Object.keys(comps)) for (const b of Object.keys(comps)) {
    if (a >= b) continue;
    const r = duel(comps[a], comps[b], null);
    console.log(a, 'vs', b, '->', JSON.stringify(r));
  }
  // with micro
  console.log('--- with simple micro both sides');
  for (const a of Object.keys(comps)) for (const b of Object.keys(comps)) {
    if (a >= b) continue;
    const r = duel(comps[a], comps[b], simpleMicro);
    console.log(a, 'vs', b, '->', JSON.stringify(r));
  }
}

// simple micro: focus lowest-hp enemy in range with all units, else attackMove to nearest enemy
function simpleMicro(obs, g, owner) {
  const me = obs.units.filter(u => u.owner === owner);
  const foe = obs.units.filter(u => u.owner !== owner);
  if (!me.length) return [];
  if (!foe.length) return [];
  let target = foe.slice().sort((p, q) => p.hp - q.hp)[0];
  return [{type: 'attack', units: me.map(u => u.id), target: target.id}];
}
