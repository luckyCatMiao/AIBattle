'use strict';
const {runMatch} = require('./sim.js');
const {makeEngine} = require('./engine.js');
const {makeSol2} = require('./sol2.js');
const {makeSol} = require('./bots.js');

// Extended family of tank-bot opponents: sol-like plus strong micro variants.
function proxyFamily() {
  const base = {build: ['tank'], workersTarget: 4, opening: 'nodes', upgrades: true};
  const variants = [];
  let seed = 0;
  // sol-like axes
  for (const opening of ['nodes', 'defend', 'enemyBase']) {
    for (const rf of [0.2, 0.3, 0.45]) {
      for (const pr of [0.85, 1.1]) {
        for (const fm of ['lowhp', 'nearest']) {
          variants.push(Object.assign({}, base, {
            opening, retreatFrac: rf, powerRatio: pr, focusMode: fm, workersTarget: 4,
            engageRange: 430, staging: 'center', seed: ++seed,
          }));
        }
      }
    }
  }
  // strong micro variants
  for (const fm of ['nearest', 'spread']) {
    for (const er of [330, 430]) {
      for (const st of ['home', 'center']) {
        variants.push(Object.assign({}, base, {
          opening: 'defend', retreatFrac: 0.3, powerRatio: 1.1, focusMode: fm,
          engageRange: er, staging: st, seed: ++seed,
        }));
      }
    }
  }
  // worker-heavy / economy variants
  for (const wt of [3, 5]) {
    variants.push(Object.assign({}, base, {opening: 'nodes', retreatFrac: 0.3, powerRatio: 1.1, focusMode: 'spread', engageRange: 330, workersTarget: wt, seed: ++seed}));
  }
  return variants;
}

function getOpp(kind, cfg) {
  if (kind === 'engine') return makeEngine(cfg);
  if (kind === 'sol2') return makeSol2(cfg);
  if (kind === 'sol1') return makeSol(cfg);
  throw new Error('bad kind');
}

function runOne(myCfg, oppKind, oppCfg, seat) {
  const me = makeEngine(myCfg), opp = getOpp(oppKind, oppCfg);
  const r = seat === 0 ? runMatch(me, opp, {}) : runMatch(opp, me, {});
  return {win: r.winner === seat, r, seat};
}

function evaluate(myCfg, opps) {
  let wins = 0, games = 0;
  const seatWins = [0, 0], seatGames = [0, 0];
  const rows = [];
  for (const o of opps) {
    const res = [];
    for (const seat of [0, 1]) {
      const x = runOne(myCfg, o.kind, o.cfg, seat);
      games++; seatGames[seat]++;
      if (x.win) { wins++; seatWins[seat]++; }
      res.push((x.win ? 'W' : 'L') + Math.round(x.r.duration));
    }
    rows.push({opp: o, res});
  }
  return {wins, games, rate: wins / games, seatWins, seatGames, rows};
}

function standardOpps() {
  const opps = [];
  for (const cfg of proxyFamily()) opps.push({kind: 'engine', cfg, name: 'eng:' + JSON.stringify(cfg)});
  for (const cfg of [{}, {rebuildWorkers: true}, {defendBase: false}, {retreatFrac: 0.2}, {retreatFrac: 0.45}]) {
    opps.push({kind: 'sol2', cfg, name: 'sol2:' + JSON.stringify(cfg)});
  }
  opps.push({kind: 'sol1', cfg: {}, name: 'sol1'});
  return opps;
}

module.exports = {proxyFamily, evaluate, runOne, standardOpps, getOpp};
if (require.main === module) {
  const myCfg = JSON.parse(process.argv[2] || '{}');
  const e = evaluate(myCfg, standardOpps());
  console.log('win rate', (e.rate * 100).toFixed(1) + '%', 'seats', e.seatWins, '/', e.seatGames, 'games', e.games);
  if (process.argv[3] === '-v') {
    for (const row of e.rows) console.log(row.opp.name.slice(0, 100), row.res.join(' '));
  }
}
