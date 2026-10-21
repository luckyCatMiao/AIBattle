'use strict';
/* 泡泡堂 竞技裁判。
 * 只有可信的控制器持有本进程的 stdin。选手只拿到观察数据，永远接触不到这个进程。
 *
 * 协议（每行一个 JSON）：
 *   {"type":"create","id":…,"names":[a,b],"seed":…}         ⇒ {state}
 *   {"type":"window","inputs":[[20 帧],[20 帧]],"note":""}   ⇒ {state}
 */
const sim = require('../simulation');
const readline = require('node:readline');
const { rules, powerups } = require('../catalog');

let game = null;
// 比赛时两侧都是 api 席位，裁判不提供任何控制策略。
function observe() { const s = sim.snapshot(game); delete s.catalog; return s; }

function action(m) {
  if (m.type === 'create') {
    const names = Array.isArray(m.names) && m.names.length ? m.names : ['A', 'B'];
    game = sim.createMatch({ id: m.id, seed: m.seed ?? 1,
      players: names.map(name => ({ name, kind: 'api' })) });
    return { state: observe() };
  }
  if (m.type === 'window') {
    if (!game || game.status !== 'playing') throw Error('当前没有进行中的对局');
    const seats = game.players.length;
    if (!Array.isArray(m.inputs) || m.inputs.length !== seats) throw Error(`window 需要 ${seats} 个席位的输入`);
    for (let owner = 0; owner < seats; owner++) {
      if (!Array.isArray(m.inputs[owner])) throw Error('每一侧的输入必须是数组');
      if (m.inputs[owner].length > rules.decisionFrames) throw Error(`一个窗口最多 ${rules.decisionFrames} 帧`);
      // 逐帧规范化：非法帧直接抛错，由控制器判技术负，而不是静默变成中立输入。
      m.inputs[owner] = m.inputs[owner].map(sim.normalizeInput);
    }
    sim.advanceWindow(game, m.inputs);
    return { state: observe() };
  }
  if (m.type === 'catalog') return { rules, powerups };
  throw Error('未知的裁判消息');
}

if (require.main === module) {
  readline.createInterface({ input: process.stdin }).on('line', line => {
    try { process.stdout.write(JSON.stringify(action(JSON.parse(line))) + '\n'); }
    catch (e) { process.stdout.write(JSON.stringify({ error: e.message }) + '\n'); }
  });
}
module.exports = { action };
