'use strict';
/* 用法: node dev/run.js --a botSmart --b botChase --seeds 1,2,3 [--size 3] [--py agent.py] */
const { runMatch, PyAgent } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path = require('path');
const fs = require('fs');

const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const aName = arg('a', 'botSmart'), bName = arg('b', 'botChase');
  const seeds = (arg('seeds', '1,2,3,4,5,6')).split(',').map(Number);
  const sizeArg = arg('size', null);
  const pyScript = arg('py', null);
  const verbose = process.argv.includes('-v');

  const mk = (name, seatName) => {
    if (name === 'py') {
      const ag = new PyAgent(PY, pyScript || 'agent.py', ROOT, seatName);
      return { fn: async v => JSON.parse((await ag.ask(v))).inputs, ag };
    }
    const f = bots[name];
    if (!f) throw new Error('unknown bot ' + name);
    return { fn: async v => f(v), ag: null };
  };

  let wins = 0, losses = 0, draws = 0, gf = 0, ga = 0;
  const sizes = {};
  for (const seed of seeds) {
    // 两个座位各跑一局
    for (const swap of [false, true]) {
      const size = sizeArg ? Number(sizeArg) : undefined;
      const A = mk(swap ? bName : aName, 'A');
      const B = mk(swap ? aName : bName, 'B');
      let g;
      try {
        g = await runMatch({ seed, teamSize: size, agentA: A.fn, agentB: B.fn });
      } catch (e) {
        console.log('seed', seed, 'swap', swap, 'ERROR', e.message);
        if (A.ag) console.log('  stderrA:', A.ag.err.slice(-600));
        if (B.ag) console.log('  stderrB:', B.ag.err.slice(-600));
        A.ag && A.ag.kill(); B.ag && B.ag.kill();
        losses++;
        continue;
      }
      const aScore = swap ? g.score[1] : g.score[0];
      const bScore = swap ? g.score[0] : g.score[1];
      gf += aScore; ga += bScore;
      sizes[g.teamSize] = (sizes[g.teamSize] || 0) + 1;
      if (aScore > bScore) wins++; else if (aScore < bScore) losses++; else draws++;
      if (verbose) console.log(`seed=${seed} n=${g.teamSize} swap=${swap} ${aName} ${aScore}:${bScore} ${bName} (${g.reason})`);
      if (A.ag && A.ag.err) console.log('  [A stderr]', A.ag.err.slice(-400));
      if (B.ag && B.ag.err) console.log('  [B stderr]', B.ag.err.slice(-400));
      A.ag && A.ag.kill(); B.ag && B.ag.kill();
    }
  }
  const tot = wins + losses + draws;
  console.log(`\n${aName} vs ${bName}:  W${wins} L${losses} D${draws}  (${tot} 局)  胜率 ${(100 * wins / tot).toFixed(1)}%  进球 ${gf} 失球 ${ga}  分人数 ${JSON.stringify(sizes)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
