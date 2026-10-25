'use strict';
/* 实验：发球方能否在“不碰自己发球”的前提下，于网前拦住接发方的杀球？ */
const sim = require('../engine.js');
const brain = require('../brain.js');

const myBot = { decide: obs => brain.decide(obs).frames };

function recordReceiver(seed) {
  const g = sim.createMatch({ id: 'x', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const windows = [];
  for (let w = 0; w < 5; w++) {
    const o1 = sim.view(g, 1); o1.yourPlayer = 1;
    const r1 = myBot.decide(o1);
    windows.push(r1);
    sim.advanceWindow(g, [sim.submitWindow(g, 0, Array.from({ length: 10 }, () => ({ move: 0 }))), sim.submitWindow(g, 1, r1)]);
    if (g.score[0] + g.score[1] > 0) break;
  }
  return { windows, g };
}

const rec = recordReceiver(1);
console.log('接发方窗口', rec.windows.length);

function replay(target, jumpF, swingF) {
  const g = sim.createMatch({ id: 'x', seed: 1, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const hits = [];
  const points = [];
  for (let w = 0; w < rec.windows.length; w++) {
    const f0 = Array.from({ length: 10 }, (_, i) => {
      const f = w * 10 + i;
      const me = g.batsmen[0];
      const d = target - me.x;
      const mv = Math.abs(d) < 0.05 ? 0 : Math.max(-1, Math.min(1, d * 6));
      const sw = f === swingF ? 1 : 0;
      return { move: sw ? 0 : mv, jump: f === jumpF, swing: sw };
    });
    sim.advanceWindow(g, [sim.submitWindow(g, 0, f0), sim.submitWindow(g, 1, rec.windows[w])]);
    for (const e of g.events) {
      if (e.type === 'hit' && e.team === 0) hits.push({ frame: e.frame, x: e.x, y: e.y, kind: e.kind });
      if (e.type === 'hit' && e.team === 1) hits.push({ team: 1, frame: e.frame, x: e.x, y: e.y, kind: e.kind });
      if (e.type === 'point') points.push({ team: e.team, x: e.x, reason: e.reason });
    }
    if (points.length) break;
  }
  return { hits, points, g };
}

// 先看一遍参照：发球方站着不动
{
  const r = replay(3.35, -1, -1);
  console.log('参照 hits:', JSON.stringify(r.hits), 'points:', JSON.stringify(r.points));
}

let legal = 0, selfHit = 0, examples = [];
for (const target of [5.2, 5.6, 6.0, 6.2, 6.35]) {
  for (let J = 10; J <= 34; J++) {
    for (let S = 10; S <= 34; S++) {
      const r = replay(target, J, S);
      const mine = r.hits.filter(h => h.team === 0);
      if (!mine.length) continue;
      const own = mine.find(h => h.x < 6.7);
      const blocked = mine.find(h => h.x > 6.7);
      if (blocked) { legal++; if (examples.length < 5) examples.push({ target, J, S, blocked, points: r.points }); }
      else if (own) selfHit++;
    }
  }
}
console.log('合法拦到(球已过网)方案数', legal, '  打到自家发球方案数', selfHit);
console.log(JSON.stringify(examples, null, 1));
