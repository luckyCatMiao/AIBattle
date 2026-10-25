'use strict';
/* 俯视角赛车 竞技裁判。
 * 只有可信的控制器持有本进程的 stdin。选手拿到自己的观察（赛道本身就是公开信息）。
 *
 * 协议（每行一个 JSON）：
 *   {"type":"create","id":…,"names":[a,b],"seed":…}               ⇒ {state,views}
 *   {"type":"window","inputs":[[20 帧×1 辆车],[…]],"capture":true} ⇒ {state,views,frames}
 *   {"type":"catalog"}                                             ⇒ 规则与赛道尺寸
 */
const sim = require('../simulation');
const readline = require('node:readline');
const { rules, W, H, TILE } = require('../catalog');

let game = null;
const views = () => [sim.view(game, 0), sim.view(game, 1)];
// 逐帧快照不再携带事件；事件单独回传，回放端按帧号过滤。
const NOTABLE = new Set(['go', 'lap', 'finish', 'collision', 'countdown']);
const notableEvents = () => game.events.filter(e => NOTABLE.has(e.type));

function action(m) {
  if (m.type === 'create') {
    game = sim.createMatch({
      id: m.id, seed: m.seed ?? 1,
      players: [
        { name: m.names?.[0] || 'A', kind: 'api' },
        { name: m.names?.[1] || 'B', kind: 'api' },
      ],
    });
    return { state: sim.snapshot(game), views: views() };
  }
  if (!game) throw Error('还没有创建对局');
  if (m.type === 'window') {
    if (game.status !== 'playing') throw Error('对局已结束');
    if (!Array.isArray(m.inputs) || m.inputs.length !== 2) throw Error('window 需要两名选手的输入');
    const windows = [sim.submitWindow(game, 0, m.inputs[0]), sim.submitWindow(game, 1, m.inputs[1])];
    if (!m.capture) {
      sim.advanceWindow(game, windows);
      return { state: sim.snapshot(game), views: views(), events: notableEvents() };
    }
    const frames = [];
    for (let i = 0; i < rules.decisionFrames && game.status === 'playing'; i++) {
      for (const car of game.cars) {
        const frame = windows[car.team][i];
        const input = frame && frame[0] ? frame[0] : { throttle: 0, steer: 0, drift: false, boost: false };
        car.inputHistory.push(input);
        if (car.inputHistory.length > 8) car.inputHistory.shift();
        car.held = input;
      }
      sim.step(game);
      frames.push(sim.leanState(game));
    }
    return { state: sim.snapshot(game), views: views(), frames, events: notableEvents() };
  }
  if (m.type === 'catalog') return { rules, width: W, height: H, tileSize: TILE };
  throw Error('未知的裁判消息');
}

if (require.main === module) {
  readline.createInterface({ input: process.stdin }).on('line', line => {
    try { process.stdout.write(JSON.stringify(action(JSON.parse(line))) + '\n'); }
    catch (e) { process.stdout.write(JSON.stringify({ error: e.message }) + '\n'); }
  });
}
module.exports = { action };
