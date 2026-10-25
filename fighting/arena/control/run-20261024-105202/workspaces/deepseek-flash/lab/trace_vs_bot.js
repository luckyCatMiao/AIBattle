// 对任意程序型对手的逐帧统计（对手是独立进程，观察里带 catalog，与 bench2 一致）。
// 用法: node trace_vs_bot.js <botFile> <style> <mySeat> <seed> <myTeam> [oppTeam]
const path = require('path');
const { makeProc, playMatch } = require('./harness.js');
const sim = require('./simulation.patched.js');
const WS = path.resolve(__dirname, '..');
const botFile = process.argv[2] || 'bot.py';
const style = process.argv[3] || 'random';
const mySeat = Number(process.argv[4] || 0);
const seed = Number(process.argv[5] || 1);
const myTeam = (process.argv[6] || 'vex,kestrel,aegis').split(',');
const oppTeam = (process.argv[7] || 'torv,nyx,sable').split(',');

const a = makeProc('python', [path.join(WS, 'agent.py')], WS);
const b = makeProc('python', [path.join(__dirname, botFile), style], __dirname);
(async () => {
  const g = sim.createMatch({ id: 't', players: [{ name: 'A', kind: 'api', team: myTeam }, { name: 'B', kind: 'api', team: oppTeam }], seed });
  const procs = [a, b];
  const seen = new Set(); const dmg = new Map(); const myStates = new Map(); let windows = 0;
  while (g.status === 'playing' && windows < 4000) {
    const reqs = [];
    for (let o = 0; o < 2; o++) {
      const snap = sim.snapshot(g, o);
      snap.catalog = { rules: require('./catalog.patched.js').rules, characters: snap.catalog };
      reqs.push(procs[o].send(JSON.stringify(snap)));
    }
    const lines = await Promise.all(reqs);
    const ins = [];
    for (let o = 0; o < 2; o++) {
      const obj = JSON.parse(lines[o]);
      const arr = (obj.inputs || []).slice(0, 15);
      const norm = [];
      for (let i = 0; i < 15; i++) norm.push(arr[i] ? sim.normalizeInput(arr[i]) : { dir: 'N', btn: null });
      ins.push(norm);
    }
    for (let k = 0; k < 15 && g.status === 'playing'; k++) {
      const preMe = { state: g.fighters[mySeat].state, held: { ...g.fighters[mySeat].held } };
      const preOpMove = g.fighters[1 - mySeat].move && g.fighters[1 - mySeat].move.name;
      sim.stepFrame(g, [ins[0][k], ins[1][k]]);
      for (const e of g.events) {
        if (seen.has(e.id)) continue; seen.add(e.id);
        if (e.type === 'hit' && e.owner !== mySeat) {
          const key = (preOpMove || '?') + ' | me:' + preMe.state + '/' + preMe.held.dir + '/' + (preMe.held.btn || '-');
          dmg.set(key, (dmg.get(key) || 0) + (e.damage || 0));
          myStates.set(preMe.state, (myStates.get(preMe.state) || 0) + 1);
        }
      }
    }
    windows++;
  }
  a.kill(); b.kill();
  console.log('winner', g.winner, 'final', g.fighters.map(f=>f.char+':'+Math.round(f.hp))); console.log(JSON.stringify(g.roundLog));
  console.log('final', g.fighters.map(f => f.char + ':' + Math.round(f.hp)));
  console.log('my state when hit:', [...myStates].sort((x, y) => y[1] - x[1]));
  console.log('dmg sources:', [...dmg].sort((x, y) => y[1] - x[1]).slice(0, 20));
  process.exit(0);
})();
