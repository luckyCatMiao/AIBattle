'use strict';
const {runMatch} = require('./sim.js');
const {makeEngine} = require('./engine.js');

// Build a family of plausible "tank bot" opponents (sol-like) with varied micro params.
function proxyFamily() {
  const base = {build: ['tank'], workersTarget: 4, opening: 'nodes', upgrades: true};
  const variants = [];
  const opts = {
    retreatFrac: [0.28, 0.45, 0.2],
    powerRatio: [0.85, 1.1, 0.65],
    engageRange: [380, 480],
    opening: ['nodes', 'defend', 'enemyBase'],
    workersTarget: [3, 4],
    staging: ['center', 'home'],
    focus: [true],
  };
  let seed = 0;
  // cartesian too big; sample a structured set
  for (const opening of opts.opening) {
    for (const rf of [0.28, 0.45]) {
      for (const pr of [0.85, 1.1]) {
        for (const wt of [3, 4]) {
          variants.push(Object.assign({}, base, {
            opening, retreatFrac: rf, powerRatio: pr, workersTarget: wt,
            engageRange: 430, staging: 'center', seed: ++seed,
          }));
        }
      }
    }
  }
  return variants;
}

function runOne(myCfg, oppCfg, seat) {
  const me = makeEngine(myCfg), opp = makeEngine(oppCfg);
  const r = seat === 0 ? runMatch(me, opp, {}) : runMatch(opp, me, {});
  return {win: r.winner === seat, r, seat};
}

function evaluate(myCfg, oppCfgs, opts = {}) {
  let wins = 0, games = 0, seatWins = [0, 0], seatGames = [0, 0];
  const rows = [];
  for (const oc of oppCfgs) {
    const res = [];
    for (const seat of [0, 1]) {
      const x = runOne(myCfg, oc, seat);
      games++; seatGames[seat]++;
      if (x.win) { wins++; seatWins[seat]++; }
      res.push((x.win ? 'W' : 'L') + Math.round(x.r.duration));
    }
    rows.push({opp: oc, res});
  }
  return {wins, games, rate: wins / games, seatWins, seatGames, rows};
}

module.exports = {proxyFamily, evaluate, runOne};
if (require.main === module) {
  const myCfg = JSON.parse(process.argv[2] || '{}');
  const fam = proxyFamily();
  const e = evaluate(myCfg, fam);
  console.log('win rate', (e.rate * 100).toFixed(1) + '%', 'seats', e.seatWins, '/', e.seatGames);
  const byOpen = {};
  for (const row of e.rows) {
    const k = row.opp.opening + '/rf' + row.opp.retreatFrac + '/pr' + row.opp.powerRatio + '/w' + row.opp.workersTarget;
    byOpen[k] = row.res.join(' ');
  }
  for (const k in byOpen) console.log(k, byOpen[k]);
}
