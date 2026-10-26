'use strict';
/* 无尽弹墙对决 · 竞技裁判。
 * 只有可信的控制器持有本进程的 stdin。选手只拿到观察数据，永远接触不到这个进程。
 *
 * 协议（每行一个 JSON）：
 *   {"type":"create","id":…,"names":[a,b],"seed":…}                    ⇒ {state}
 *   {"type":"window","inputs":[[3 帧],[3 帧]],"note":""}                ⇒ {state}
 *   {"type":"catalog"}                                                  ⇒ {rules}
 */
const sim = require('../simulation');
const readline = require('node:readline');
const { rules } = require('../catalog');

let game = null;

function action(m) {
  if (m.type === 'create') {
    const names = Array.isArray(m.names) && m.names.length ? m.names : ['A', 'B'];
    game = sim.createMatch({
      id: m.id, seed: m.seed ?? 1,
      players: names.map(name => ({ name, kind: 'api' })),
    });
    return { state: sim.snapshot(game) };
  }
  if (m.type === 'window') {
    if (!game || game.status !== 'playing') throw Error('当前没有进行中的对局');
    if (!Array.isArray(m.inputs) || m.inputs.length !== 2) throw Error('window 需要两名选手的输入');
    for (let owner = 0; owner < 2; owner++) {
      if (!Array.isArray(m.inputs[owner])) throw Error('每一侧的输入必须是数组');
      if (m.inputs[owner].length > rules.decisionFrames) throw Error(`一个窗口最多 ${rules.decisionFrames} 帧`);
      m.inputs[owner] = m.inputs[owner].map(sim.normalizeInput);
    }
    sim.advanceWindow(game, m.inputs);
    return { state: sim.snapshot(game) };
  }
  if (m.type === 'catalog') return { rules };
  throw Error('未知的裁判消息');
}

if (require.main === module) {
  readline.createInterface({ input: process.stdin }).on('line', line => {
    try { process.stdout.write(JSON.stringify(action(JSON.parse(line))) + '\n'); }
    catch (e) { process.stdout.write(JSON.stringify({ error: e.message }) + '\n'); }
  });
}
module.exports = { action };
