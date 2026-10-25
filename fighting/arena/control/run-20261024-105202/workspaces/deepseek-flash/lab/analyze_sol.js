// 从公开录像的逐帧快照统计 Sol 的行为（不读取对方任何代码/进程数据）。
// 用法: node analyze_sol.js
const fs = require('fs');
const path = require('path');

function load(file) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  const frames = d.frames;
  const names = frames[0].players.map(p => p.name);
  const solSeat = names.findIndex(x => /Sol/i.test(x));
  return { frames, solSeat };
}

function bucketDx(dx) {
  if (dx < 70) return '0-70';
  if (dx < 110) return '70-110';
  if (dx < 150) return '110-150';
  if (dx < 200) return '150-200';
  if (dx < 280) return '200-280';
  if (dx < 380) return '280-380';
  return '380+';
}

function describeMove(m) {
  return m ? `${m.name}#${m.frame}/${m.startup}+${m.active}+${m.recovery}` : '-';
}

function analyze(file) {
  const { frames, solSeat } = load(file);
  const oppSeat = 1 - solSeat;
  const rows = [];
  const roundStart = new Map();
  for (let i = 0; i < frames.length; i++) {
    const s = frames[i];
    if (i % 15 !== 0) continue;
    if (s.status !== 'playing') continue;
    const me = s.fighters[solSeat], op = s.fighters[oppSeat];
    // 本窗口内的动作：窗口结束时新出现的事件（事件在 snapshot 里晚一帧出现，按 id 取新增最稳）
    const acts = [];
    const seen = new Set(s.events.map(e => e.id));
    const endIdx = Math.min(i + 15, frames.length - 1);
    for (const e of frames[endIdx].events) {
      if (seen.has(e.id)) continue;
      if (e.owner !== solSeat) continue;
      if (e.type === 'move' || e.type === 'super' || e.type === 'jump' || e.type === 'throw') {
        acts.push({ t: e.frame - (s.frame + 1), type: e.type, name: e.name || (e.type === 'jump' ? 'jump' : '') });
      }
    }
    rows.push({
      f: s.frame, round: s.round, rf: s.roundFrame,
      myState: me.state, myMove: describeMove(me.move),
      myHp: me.hp, myMeter: me.meter, myGuard: me.guard, myX: me.x,
      opState: op.state, opMove: describeMove(op.move), opChar: op.char,
      opHp: op.hp, opMeter: op.meter, dx: Math.abs(op.x - me.x),
      nProj: s.projectiles.length,
      acts,
    });
  }
  return rows;
}

const files = ['replay_dump_r1-g1.json', 'replay_dump_r1-g2.json'];
const all = [];
for (const f of files) {
  const rows = analyze(f);
  console.log('=====', f, 'windows', rows.length);
  // 每个窗口的主要动作序列，打印前 80 个窗口
  for (const r of rows.slice(0, 90)) {
    if (!r.acts.length) continue;
    console.log([r.f, 'R' + r.round, r.myState + (r.myMove !== '-' ? ':' + r.myMove : ''), 'x=' + r.myX.toFixed(0), 'op=' + r.opState + (r.opMove !== '-' ? ':' + r.opMove : ''), 'dx=' + r.dx.toFixed(0), 'm=' + r.myMeter, 'acts=' + r.acts.map(a => a.t + ':' + (a.name || a.type)).join(',')].join(' '));
  }
  all.push(...rows.map(r => ({ ...r, file: f })));
}

// 聚合：动作首个按键/招式 vs 特征
const key = r => {
  const a = r.acts[0];
  return a ? (a.name || a.type) : '(none)';
};
const agg = new Map();
for (const r of all) {
  const k = [r.myState, r.opState, bucketDx(r.dx), r.myMeter >= 100 ? 'FULL' : 'no'].join('|');
  if (!agg.has(k)) agg.set(k, new Map());
  const m = agg.get(k); const a = key(r);
  m.set(a, (m.get(a) || 0) + 1);
}
console.log('\n===== AGG by myState|opState|dx|meter (>=3) =====');
const items = [...agg.entries()].filter(x => [...x[1].values()].reduce((a, b) => a + b, 0) >= 3)
  .sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0));
for (const [k, m] of items.slice(0, 80)) {
  const tot = [...m.values()].reduce((a, b) => a + b, 0);
  console.log(k, 'n=' + tot, [...m].sort((a, b) => b[1] - a[1]).map(x => x[0] + ':' + x[1]).join(' '));
}
