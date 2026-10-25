'use strict';
/* 反事实验证：g2 第 1 局，sol 沿用回放输入，deepseek 在指定窗口切换成新版 agent。 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { spawn } = require('child_process');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

const replayPath = path.join(__dirname, '..', '..', '..', 'r1-g2.json.gz');
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(replayPath)).toString('utf8'));
const TEAM = 1; // deepseek-flash 在 g2 是 team 1
const SWITCH_FRAME = parseInt(process.argv[2] || '1265', 10);

const name = d.names && d.names.length ? d.names : d.seats;
const game = sim.createMatch({
  id: d.id, seed: d.seed,
  players: [{ name: name[0] || 'A', kind: 'api' }, { name: name[1] || 'B', kind: 'api' }],
});

const py = spawn('python', ['-u', path.join(__dirname, '..', 'agent.py')], {
  cwd: path.join(__dirname, '..'), stdio: ['pipe', 'pipe', 'inherit'],
});
let buf = '';
const waiters = [];
py.stdout.on('data', chunk => {
  buf += chunk.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (waiters.length) waiters.shift()(line);
  }
});
function ask(obj) {
  return new Promise(resolve => { waiters.push(resolve); py.stdin.write(JSON.stringify(obj) + '\n'); });
}

(async () => {
  let switched = false;
  for (let i = 0; i < d.windows.length; i++) {
    const w = d.windows[i];
    const obs = sim.view(game, TEAM);
    const line = await ask(obs);
    let plan;
    try { plan = JSON.parse(line).inputs; } catch (e) { console.error('bad plan', line); process.exit(2); }
    if (!Array.isArray(plan) || plan.length !== 5) { console.error('bad plan len', line); process.exit(2); }
    const until = w.frame;
    const usePlan = until >= SWITCH_FRAME;
    if (usePlan && !switched) {
      switched = true;
      console.log('SWITCH at window', i, 'frame', until, 'dsf x', game.runners[TEAM].x.toFixed(2),
                  'sol x', game.runners[0].x.toFixed(2), 'deaths', game.runners[TEAM].deaths);
    }
    const inputs = [null, null];
    inputs[TEAM] = usePlan ? plan : w.inputs[TEAM];
    inputs[0] = w.inputs[0];
    sim.advanceWindow(game, [sim.submitWindow(game, 0, inputs[0]), sim.submitWindow(game, 1, inputs[1])]);
    const p = game.runners[TEAM], o = game.runners[0];
    if (until >= SWITCH_FRAME - 5 && (until % 20 === 0 || p.deaths !== (global.prevDeaths || 0))) {
      global.prevDeaths = p.deaths;
      console.log(`f=${until} t=${game.time.toFixed(2)} R${game.round} dsf x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} deaths=${p.deaths}`
        + ` | sol x=${o.x.toFixed(2)} deaths=${o.deaths}`
        + ` | plant15=${(game.plantStates[0] ? game.plantStates[0].height : -1).toFixed(2)}`
        + ` plant21=${(game.plantStates[1] ? game.plantStates[1].height : -1).toFixed(2)}`);
    }
    if (game.round > 1 || game.status !== 'playing') {
      console.log(`ROUND END at window ${i} frame=${game.frame} round=${game.round} status=${game.status}`
        + ` dsf deaths=${p.deaths} x=${p.x.toFixed(2)} maxX=${p.maxX.toFixed(2)}`);
      break;
    }
  }
  py.stdin.end();
})();
