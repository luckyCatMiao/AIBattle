'use strict';
// Test harness: runs rules.js matches with JS bot functions, faithful to referee protocol.
const path = require('path');
const R = require(path.join('..', 'rules.js'));
const {createMatch, command, step, snapshot, TYPES, DT} = R;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function applyCommands(g, owner, cmds, errs) {
  if (!Array.isArray(cmds)) return;
  let n = 0;
  for (const c of cmds) {
    if (n >= 10) break;
    n++;
    try { command(g, owner, c); } catch (e) { errs.push(String(e.message || e)); }
  }
}

function runMatch(botA, botB, opts = {}) {
  const id = opts.id || 'sim';
  const g = createMatch({id, players: [{name: 'A', kind: 'api'}, {name: 'B', kind: 'api'}]});
  g.status = 'playing';
  const errs = [[], []];
  const trace = [];
  const maxSeconds = opts.maxSeconds || 600;
  for (let sec = 0; sec < maxSeconds && g.status === 'playing'; sec++) {
    const obs0 = snapshot(g, 0);
    obs0.lastErrors = errs[0].slice(); obs0.decisionSeconds = 1; obs0.maxCommands = 10;
    const obs1 = snapshot(g, 1);
    obs1.lastErrors = errs[1].slice(); obs1.decisionSeconds = 1; obs1.maxCommands = 10;
    errs[0].length = 0; errs[1].length = 0;
    let c0 = [], c1 = [];
    try { c0 = botA(obs0, g) || []; } catch (e) { if (opts.verbose) console.error('botA error', e); }
    try { c1 = botB(obs1, g) || []; } catch (e) { if (opts.verbose) console.error('botB error', e); }
    applyCommands(g, 0, c0, errs[0]);
    applyCommands(g, 1, c1, errs[1]);
    for (let i = 0; i < 20; i++) step(g, DT);
    if (opts.traceEvery && (sec % opts.traceEvery === 0 || g.status !== 'playing')) {
      trace.push(JSON.parse(JSON.stringify(snapshot(g, null))));
    }
  }
  const fin = snapshot(g, null);
  return {g, fin, trace, winner: g.winner, reason: g.reason, duration: g.now,
    scores: fin.players.map(p => p.score),
    stats: fin.players.map(p => ({kills: p.kills, damage: p.damage, mined: p.mined, ctl: p.controlTime, hp: fin.bases[p.id].hp}))};
}

module.exports = {runMatch, dist, TYPES};
