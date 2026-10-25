'use strict';
/* 横版羽毛球 竞技裁判。
 * 只有可信的控制器持有本进程的 stdin。
 *
 * 协议（每行一个 JSON）：
 *   {"type":"create","id":…,"names":[a,b],"seed":…}                  ⇒ {state,views}
 *   {"type":"window","inputs":[[10 帧×1 人],[…]],"capture":true}      ⇒ {state,views,frames,events}
 *   {"type":"catalog"}                                                ⇒ 规则与场地
 */
const sim = require('../simulation');
const readline = require('node:readline');
const { rules } = require('../catalog');

let game = null;
const views = () => [sim.view(game, 0), sim.view(game, 1)];
const NOTABLE = new Set(['serve', 'point', 'finish', 'net']);
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
    return { state: sim.snapshot(game), views: views(), events: notableEvents() };
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
      for (const b of game.batsmen) {
        const frame = windows[b.team][i];
        const input = frame && frame[0] ? frame[0] : { move: 0, jump: false, swing: 0, charge: false, sprint: false };
        b.inputHistory.push(input);
        if (b.inputHistory.length > 8) b.inputHistory.shift();
        b.held = input;
      }
      sim.step(game);
      frames.push(sim.leanState(game));
    }
    return { state: sim.snapshot(game), views: views(), frames, events: notableEvents() };
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
