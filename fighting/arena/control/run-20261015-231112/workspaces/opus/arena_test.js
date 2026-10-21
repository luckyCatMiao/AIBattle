'use strict';
// 自测：brain 对若干脚本对手 / 自身镜像，在真实规则里跑完整车轮战。
globalThis.bot = null;
const sim = require('./simulation.js');
const brain = require('./brain.js');
const N = (dir = 'N', btn = null) => ({ dir, btn });
const rep = (x, n) => Array.from({ length: n }, () => ({ ...x }));
const MOT = { qcf: ['D', 'DF', 'F'], qcb: ['D', 'DB', 'B'], dp: ['F', 'D', 'DF'], hcb: ['F', 'DF', 'D', 'DB', 'B'] };
const mot = (m, b) => [...MOT[m].slice(0, -1).map(d => N(d)), N(MOT[m][MOT[m].length - 1], b)];
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const bots = {
  turtle: () => rep(N('B'), 15),
  random: () => Array.from({ length: 15 }, () => N(['N', 'F', 'B', 'U', 'D', 'UF', 'UB', 'DF', 'DB'][Math.floor(rnd() * 9)], [null, null, null, 'LP', 'HP', 'LK', 'HK'][Math.floor(rnd() * 7)])),
  rusher: (obs, me) => {
    const f = obs.fighters[me], o = obs.fighters[1 - me], d = Math.abs(f.x - o.x);
    const c = obs.catalog[f.char];
    const sp = Object.values(c.specials).find(s => !s.airOnly && !s.projectile && s.kind !== 'throw' && s.kind !== 'stance' && s.kind !== 'move');
    if (d > 150) return rnd() < 0.3 ? [N('UF'), ...rep(N('N'), 8), N('N', 'HK')] : rep(N('F'), 15);
    const out = [N('N', 'LP'), N('N'), N('N', 'LK'), N('N'), N('N', 'LK')];
    if (sp) out.push(...mot(sp.motion, sp.button), N(MOT[sp.motion][2], sp.button));
    return out;
  },
  zoner: (obs, me) => {
    const f = obs.fighters[me], o = obs.fighters[1 - me], d = Math.abs(f.x - o.x);
    const c = obs.catalog[f.char];
    const pj = Object.values(c.specials).find(s => s.projectile);
    const dp = Object.values(c.specials).find(s => s.motion === 'dp' && s.invuln);
    if (o.airborne && dp && d < 200) return mot(dp.motion, dp.button);
    if (d < 140) return rnd() < 0.5 ? [N('D', 'LK'), ...rep(N('DB'), 14)] : rep(N('B'), 15);
    if (pj) return [...mot(pj.motion, pj.button), ...rep(N('B'), 12)];
    return rep(N('B'), 15);
  },
};

// OLD_BRAIN=路径 时，mirror 的对手换成旧版 brain，用来做新旧对比
const oldBrain = process.env.OLD_BRAIN ? require(process.env.OLD_BRAIN) : null;
function makeBrainPlayer(mod = brain) {
  let hist = []; const mem = {};
  return (obs) => { const r = mod.decide(obs, hist, mem); hist = hist.concat(r.inputs).slice(-30); return r.inputs; };
}

function play(teamA, teamB, pa, pb) {
  const g = sim.createMatch({ players: [{ name: 'A', kind: 'api', team: teamA }, { name: 'B', kind: 'api', team: teamB }] });
  let w = 0;
  while (g.status === 'playing' && w < 600) {
    const ins = [pa, pb].map((p, i) => {
      const obs = sim.snapshot(g, i);
      return sim.submitWindow(g, i, p(obs, i));
    });
    sim.advanceWindow(g, ins); w++;
  }
  return { winner: g.winner, log: g.roundLog.map(r => `${r.winnerChar}>${r.loserChar}(${r.winnerHp},${r.reason},${r.frames})`).join(' '), stats: g.players.map(p => p.damageDealt) };
}

const teamA = (process.argv[2] || 'kestrel,aegis,vex').split(',');
const teamB = (process.argv[3] || 'aegis,vex,torv').split(',');
const which = process.argv[4] ? process.argv[4].split(',') : ['turtle', 'random', 'rusher', 'zoner', 'mirror'];
for (const name of which) {
  for (const side of [0, 1]) {
    const opp = name === 'mirror' ? makeBrainPlayer(oldBrain || brain) : bots[name];
    const me = makeBrainPlayer();
    const r = side === 0 ? play(teamA, teamB, me, opp) : play(teamB, teamA, opp, me);
    const won = r.winner === side ? 'WIN' : r.winner === null ? 'DRAW' : 'LOSS';
    console.log(`${name} 座位${side} ${won} dmg=${r.stats} | ${r.log}`);
  }
}
