'use strict';
/* 爆破模式 竞技裁判。
 * 只有可信的控制器持有本进程的 stdin。选手只拿到自己队伍的视野。
 *
 * 协议（每行一个 JSON）：
 *   {"type":"create","id":…,"names":[a,b],"seed":…}              ⇒ {state,views}
 *   {"type":"buy","owner":0|1,"purchases":[…]}                   ⇒ {state,views}
 *   {"type":"window","inputs":[[20 帧×5 单位],[…]],"capture":true}⇒ {state,views,frames}
 */
const sim = require('../simulation');
const readline = require('node:readline');
const { rules, weapons, buyable, SITES, SPAWNS } = require('../catalog');

let game = null;
const views = () => [sim.view(game, 0), sim.view(game, 1)];

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
  if (m.type === 'buy') {
    if (m.owner !== 0 && m.owner !== 1) throw Error('owner 必须是 0 或 1');
    sim.submitBuys(game, m.owner, m.purchases || []);
    return { state: sim.snapshot(game), views: views() };
  }
  if (m.type === 'window') {
    if (game.status !== 'playing') throw Error('对局已结束');
    if (game.phase !== 'live') throw Error('当前不是比赛阶段');
    if (!Array.isArray(m.inputs) || m.inputs.length !== 2) throw Error('window 需要两名选手的输入');
    const windows = [sim.submitWindow(game, 0, m.inputs[0]), sim.submitWindow(game, 1, m.inputs[1])];
    if (!m.capture) {
      sim.advanceWindow(game, windows);
      return { state: sim.snapshot(game), views: views() };
    }
    const frames = [];
    for (let i = 0; i < rules.decisionFrames && game.phase === 'live' && game.status === 'playing'; i++) {
      for (const u of game.units) {
        if (!u.alive) continue;
        const frame = windows[u.team][i];
        const input = frame && frame[u.index] ? frame[u.index] : { dir: 'N', aim: null };
        u.inputHistory.push(input);
        if (u.inputHistory.length > 8) u.inputHistory.shift();
        u.held = input;
      }
      sim.step(game);
      frames.push(structuredClone(sim.snapshot(game)));
    }
    return { state: sim.snapshot(game), views: views(), frames };
  }
  if (m.type === 'catalog') return { rules, weapons, buyable, sites: SITES, spawns: SPAWNS };
  throw Error('未知的裁判消息');
}

if (require.main === module) {
  readline.createInterface({ input: process.stdin }).on('line', line => {
    try { process.stdout.write(JSON.stringify(action(JSON.parse(line))) + '\n'); }
    catch (e) { process.stdout.write(JSON.stringify({ error: e.message }) + '\n'); }
  });
}
module.exports = { action };
