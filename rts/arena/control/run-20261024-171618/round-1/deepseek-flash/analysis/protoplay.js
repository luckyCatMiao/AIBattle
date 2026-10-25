'use strict';
// Protocol test: spawn the real agent process, feed observations, apply commands.
const path = require('path');
const {spawn} = require('child_process');
const readline = require('readline');
const R = require(path.join('..', 'rules.js'));
const {createMatch, command, step, snapshot, DT} = R;
const {makeEngine} = require('./engine.js');
const {makeSol2} = require('./sol2.js');

function play(agentPath, oppKind, oppCfg, seat, opts = {}) {
  return new Promise((resolve) => {
    const g = createMatch({id: 'proto', players: [{name: 'me', kind: 'api'}, {name: 'opp', kind: 'api'}]});
    g.status = 'playing';
    const child = spawn(process.execPath, [agentPath], {cwd: path.dirname(agentPath), stdio: ['pipe', 'pipe', 'pipe']});
    const rl = readline.createInterface({input: child.stdout});
    const pending = [];
    rl.on('line', (line) => { const p = pending.shift(); if (p) p(line); });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString().slice(0, 4000); });
    const errs = [[], []];
    const opp = oppKind === 'sol2' ? makeSol2(oppCfg) : makeEngine(oppCfg);
    const times = [];
    let sec = 0;
    const maxSeconds = opts.maxSeconds || 600;

    function ask(obs) {
      return new Promise((res, rej) => {
        const t0 = Date.now();
        pending.push((line) => { times.push(Date.now() - t0); res(line); });
        child.stdin.write(JSON.stringify(obs) + '\n');
        setTimeout(() => { if (pending.length) { /* timeout handled loosely */ } }, 5000);
      });
    }

    async function loop() {
      for (; sec < maxSeconds && g.status === 'playing'; sec++) {
        const obsMe = snapshot(g, seat);
        obsMe.lastErrors = errs[seat].slice();
        obsMe.decisionSeconds = 1; obsMe.maxCommands = 10;
        errs[seat].length = 0;
        // opponent in-process
        const obsOpp = snapshot(g, 1 - seat);
        obsOpp.lastErrors = errs[1 - seat].slice();
        errs[1 - seat].length = 0;
        let cmdsOpp = [];
        try { cmdsOpp = opp(obsOpp) || []; } catch (e) {}
        const line = await ask(obsMe);
        let cmdsMe = [];
        let note = '';
        try { const o = JSON.parse(line); cmdsMe = o.commands || []; note = o.note || ''; }
        catch (e) { errs[seat].push('bad json: ' + line.slice(0, 100)); }
        // apply in seat order
        for (const [owner, cmds] of [[seat, cmdsMe], [1 - seat, cmdsOpp]]) {
          let n = 0;
          for (const c of cmds) {
            if (n++ >= 10) { errs[owner].push('too many'); break; }
            try { command(g, owner, c); } catch (e) { errs[owner].push(String(e.message || e)); }
          }
        }
        for (let i = 0; i < 20; i++) step(g, DT);
      }
      const fin = snapshot(g, null);
      child.stdin.end(); setTimeout(() => child.kill(), 200);
      resolve({winner: g.winner, seat, duration: g.now, scores: fin.players.map(p => p.score),
        stats: fin.players.map(p => ({kills: p.kills, damage: p.damage, mined: p.mined, ctl: p.controlTime})),
        maxMs: Math.max(...times), avgMs: times.reduce((a, b) => a + b, 0) / times.length, calls: times.length,
        errors: errs[seat].length, sampleErrors: errs[seat].slice(0, 5), stderr: stderr.slice(0, 2000)});
    }
    loop().catch(e => { resolve({error: String(e)}); });
  });
}

module.exports = {play};
if (require.main === module) {
  (async () => {
    const agentPath = path.resolve(process.argv[2] || '../agent.js');
    const oppKind = process.argv[3] || 'sol2';
    const oppCfg = process.argv[4] ? JSON.parse(process.argv[4]) : {};
    const seat = parseInt(process.argv[5] || '0');
    const r = await play(agentPath, oppKind, oppCfg, seat, {maxSeconds: parseInt(process.argv[6] || '200')});
    console.log(JSON.stringify(r, null, 1));
  })();
}
