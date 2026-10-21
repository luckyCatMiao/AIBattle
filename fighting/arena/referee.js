'use strict';
/* 铁拳谱 竞技裁判。
 * 只有可信的控制器持有本进程的 stdin。选手只拿到观察数据，永远接触不到这个进程。
 *
 * 协议（每行一个 JSON）：
 *   {"type":"create","id":…,"teams":[[a,b,c],[a,b,c]],"seed":…}  ⇒ {state}
 *   {"type":"window","inputs":[[15 帧],[15 帧]],"note":""}       ⇒ {state}
 * 帧输入进度：create 之后双方先各自提交三名角色；裁判代 computerSeat 补齐后立即开打。 */
const sim = require('../simulation');
const readline = require('node:readline');
const { characters, rules } = require('../catalog');

let game = null;
// 比赛时两侧都是 api 席位，裁判不提供任何控制策略。
function observe() { const s = sim.snapshot(game); delete s.catalog; return s; }

function action(m) {
  if (m.type === 'create') {
    // 事务性：先在局部变量上把整场建好，全部校验通过才替换权威状态。
    // 否则一次失败的 create 会留下半成品，污染后续调用。
    if (!Array.isArray(m.teams) || m.teams.length !== 2) throw Error('create 需要两侧各三名角色');
    const next = sim.createMatch({ id: m.id, seed: m.seed ?? 1, players: [
      { name: m.names?.[0] || 'A', kind: 'api' },
      { name: m.names?.[1] || 'B', kind: 'api' },
    ] });
    sim.setTeam(next, 0, m.teams[0]);
    sim.setTeam(next, 1, m.teams[1]);
    sim.beginMatch(next);
    game = next;
    return { state: observe() };
  }
  if (m.type === 'window') {
    if (!game || game.status !== 'playing') throw Error('当前没有进行中的对局');
    if (!Array.isArray(m.inputs) || m.inputs.length !== 2) throw Error('window 需要两侧输入');
    for (let owner = 0; owner < 2; owner++) {
      if (!Array.isArray(m.inputs[owner])) throw Error('每一侧的输入必须是数组');
      if (m.inputs[owner].length > rules.decisionFrames) throw Error(`一个窗口最多 ${rules.decisionFrames} 帧`);
      // 逐帧规范化：非法帧直接抛错，由控制器判技术负而不是静默变成中立输入。
      m.inputs[owner] = m.inputs[owner].map(sim.normalizeInput);
    }
    sim.advanceWindow(game, m.inputs);
    return { state: observe() };
  }
  if (m.type === 'catalog') return { characters, rules };
  throw Error('未知的裁判消息');
}

if (require.main === module) {
  readline.createInterface({ input: process.stdin }).on('line', line => {
    try { process.stdout.write(JSON.stringify(action(JSON.parse(line))) + '\n'); }
    catch (e) { process.stdout.write(JSON.stringify({ error: e.message }) + '\n'); }
  });
}
module.exports = { action };
