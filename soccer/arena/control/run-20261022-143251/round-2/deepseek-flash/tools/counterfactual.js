'use strict';
/* Open-loop counterfactual replay:
 * keep the recorded inputs of the opponent, replace one team's inputs with a
 * live agent, and see what happens.  This is NOT a prediction: once the state
 * diverges, the recorded opponent inputs are no longer causal.
 *
 * Usage: node tools/counterfactual.js <replay.json.gz> <ourTeam> <agentCmd> [startWindow]
 */
const fs = require('fs');
const zlib = require('zlib');
const { spawn } = require('child_process');
const sim = require('../simulation.js');

function readReplay(path) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(path)).toString('utf8'));
}

function startAgent(cmd) {
  const parts = cmd.split(' ');
  const child = spawn(parts[0], parts.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const waiters = [];
  child.stdout.on('data', d => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      const w = waiters.shift();
      if (w) w(line);
    }
  });
  return {
    request(obs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('agent timeout')), 5000);
        waiters.push(line => { clearTimeout(timer); resolve(JSON.parse(line)); });
        child.stdin.write(JSON.stringify(obs) + '\n');
      });
    },
    close() { try { child.stdin.end(); child.kill(); } catch (e) {} },
  };
}

async function main() {
  const [replayPath, ourTeamArg, agentCmd, startArg] = process.argv.slice(2);
  const ourTeam = Number(ourTeamArg);
  const startWindow = Number(startArg || 0);
  const rep = readReplay(replayPath);
  const g = sim.createMatch({
    id: 'cf-' + rep.id,
    seed: rep.seed,
    players: rep.seats.map((name, i) => ({ name, kind: 'api' })),
    teamSize: rep.teamSize,
  });
  const agent = startAgent(agentCmd);
  try {
    for (let i = 0; i < rep.windows.length && g.status === 'playing'; i++) {
      const rec = rep.windows[i].inputs;
      let mine, theirs;
      if (i < startWindow) {
        mine = rec[ourTeam];
        theirs = rec[1 - ourTeam];
      } else {
        const view = sim.view(g, ourTeam);
        const resp = await agent.request(view);
        mine = resp.inputs;
        theirs = rec[1 - ourTeam];
      }
      const w0 = ourTeam === 0 ? mine : theirs;
      const w1 = ourTeam === 0 ? theirs : mine;
      const s0 = sim.submitWindow(g, 0, w0);
      const s1 = sim.submitWindow(g, 1, w1);
      sim.advanceWindow(g, [s0, s1]);
    }
  } finally {
    agent.close();
  }
  const goals = g.events.filter(e => e.type === 'goal');
  console.log(JSON.stringify({
    id: rep.id, startWindow, ourTeam, score: g.score, winner: g.winner,
    reason: g.reason, frames: g.frame,
    goals: goals.map(e => ({ frame: e.frame, t: e.t, team: e.team, scorer: e.scorer })),
  }));
}

main().catch(e => { console.error(e); process.exit(1); });
