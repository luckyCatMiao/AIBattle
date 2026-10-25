'use strict';
// Verify that the standalone agent produces identical commands to the in-process engine.
const path = require('path');
const {spawn} = require('child_process');
const readline = require('readline');
const R = require(path.join('..', 'rules.js'));
const {createMatch, command, step, snapshot, DT} = R;
const {makeEngine} = require('./engine.js');

const cfg = JSON.parse(process.argv[2]);
const oppCfg = process.argv[3] ? JSON.parse(process.argv[3]) : null;
const agentPath = path.resolve(process.argv[4] || '../agent.js');
const seat = parseInt(process.argv[5] || '0');

const g = createMatch({id: 'equiv', players: [{name: 'me'}, {name: 'opp'}]});
g.status = 'playing';
const me = makeEngine(cfg);
const opp = makeEngine(oppCfg || {build: ['tank'], workersTarget: 4, opening: 'nodes', focusMode: 'lowhp', engageRange: 430, powerRatio: 1.3, captureNodes: true, retreatFrac: 0.1, chaseRange: 300});
const recs = [];
const errs = [[], []];
for (let sec = 0; sec < 200 && g.status === 'playing'; sec++) {
  const oMe = JSON.parse(JSON.stringify(snapshot(g, seat)));
  oMe.lastErrors = errs[seat].slice(); oMe.decisionSeconds = 1; oMe.maxCommands = 10;
  errs[seat].length = 0;
  const oOpp = JSON.parse(JSON.stringify(snapshot(g, 1 - seat)));
  oOpp.lastErrors = errs[1 - seat].slice();
  errs[1 - seat].length = 0;
  const cMe = me(oMe) || [];
  const cOpp = opp(oOpp) || [];
  recs.push({obs: oMe, cmds: JSON.parse(JSON.stringify(cMe))});
  for (const [owner, cmds] of [[seat, cMe], [1 - seat, cOpp]]) {
    let n = 0;
    for (const c of cmds) { if (n++ >= 10) break; try { command(g, owner, c); } catch (e) { errs[owner].push(String(e.message || e)); } }
  }
  for (let i = 0; i < 20; i++) step(g, DT);
}

(async () => {
  const child = spawn(process.execPath, [agentPath], {cwd: path.dirname(agentPath), stdio: ['pipe', 'pipe', 'pipe']});
  const rl = readline.createInterface({input: child.stdout});
  const pending = [];
  rl.on('line', (l) => { const p = pending.shift(); if (p) p(l); });
  let mismatches = 0, first = null;
  for (const rec of recs) {
    const line = await new Promise((res) => { pending.push(res); child.stdin.write(JSON.stringify(rec.obs) + '\n'); });
    let got;
    try { got = JSON.parse(line).commands || []; } catch (e) { got = ['BADJSON']; }
    if (JSON.stringify(got) !== JSON.stringify(rec.cmds)) {
      mismatches++;
      if (!first) first = {t: rec.obs.now, want: rec.cmds, got};
    }
  }
  child.stdin.end(); setTimeout(() => child.kill(), 100);
  console.log('records', recs.length, 'mismatches', mismatches);
  if (first) console.log('first mismatch', JSON.stringify(first).slice(0, 1200));
})();
