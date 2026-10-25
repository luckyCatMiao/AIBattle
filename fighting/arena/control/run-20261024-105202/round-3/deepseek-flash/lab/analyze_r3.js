// 分析公开录像 dump（frames 快照）里 GPT-6.1 Sol 的实际行为。
// 用法: node analyze_r3.js <dump.json> [solSeat]
const fs = require('fs');
const file = process.argv[2];
const solSeat = Number(process.argv[3] || 1);
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const F = d.frames;
const meSeat = 1 - solSeat;

function st(f) { return f ? f.state : 'none'; }
function key(f, o) {
  const dx = Math.abs(o.x - f.x);
  const b = dx < 70 ? '0-70' : dx < 110 ? '70-110' : dx < 150 ? '110-150' : dx < 200 ? '150-200' : dx < 280 ? '200-280' : dx < 380 ? '280-380' : '380+';
  return st(f) + '|' + st(o) + '|' + b;
}

const first = F[0];
console.log('==', file, 'windows', d.windows, 'frames', F.length);
console.log('teams', JSON.stringify(first.players.map(p => [p.name, p.team])));
console.log('roundLog', JSON.stringify(F[F.length - 1].roundLog));

// 每帧事件增量
let prevId = 0;
const events = [];
for (const fr of F) for (const e of (fr.events || [])) if (e.id > prevId) { prevId = e.id; events.push(e); }
const byType = {};
for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1;
console.log('events', JSON.stringify(byType));

// Sol 的招式发动、命中、被命中
const sol = (fr) => fr.fighters[solSeat], opp = (fr) => fr.fighters[meSeat];
const moveStarts = [], blocks = [], hits = [], supers = [], jumps = [];
for (const fr of F) {
  const s = sol(fr);
  if (s.move && !moveStarts.length ? false : false) {}
}
for (const e of events) {
  if (e.type === 'move') { if (e.owner === solSeat) moveStarts.push(e); }
  if (e.type === 'super') { if (e.owner === solSeat) supers.push(e); }
  if (e.type === 'jump') { if (e.owner === solSeat) jumps.push(e); }
  if (e.type === 'block') blocks.push(e);
  if (e.type === 'hit') hits.push(e);
}
console.log('sol moveStarts', moveStarts.length, 'supers', supers.length, 'jumps', jumps.length);
console.log('blocks(any owner)', blocks.length, 'byOwner', JSON.stringify(blocks.reduce((a, e) => (a[e.owner] = (a[e.owner] || 0) + 1, a), {})));
console.log('hits', hits.length, 'byOwner', JSON.stringify(hits.reduce((a, e) => (a[e.owner] = (a[e.owner] || 0) + 1, a), {})));
const mc = {}; for (const e of moveStarts) mc[e.name] = (mc[e.name] || 0) + 1;
console.log('sol moves', JSON.stringify(mc));

// 每帧：Sol 状态与 x 移动
let xMoves = { fwd: 0, back: 0, still: 0 };
for (let i = 1; i < F.length; i++) {
  const a = sol(F[i - 1]), b = sol(F[i]);
  if (!a || !b || a.hp <= 0 || b.hp <= 0) continue;
  if (['stand', 'crouch', 'blockstun'].includes(b.state)) {
    const away = Math.sign(b.x - opp(F[i]).x) || 1;
    const dv = (b.x - a.x) * away;
    if (dv > 1.5) xMoves.back++; else if (dv < -1.5) xMoves.fwd++; else xMoves.still++;
  }
}
console.log('sol free-state x move', JSON.stringify(xMoves));

// 条件动作：Sol 在自由状态时，按 (Sol状态|对手状态|距离) 统计接下来 20 帧内起手
const act = {};
function nextStart(i, horizon = 20) {
  for (let j = i + 1; j < Math.min(F.length, i + 1 + horizon); j++) {
    for (const e of (F[j].events || [])) if (e.type === 'move' && e.owner === solSeat && e.frame === F[j].frame) return e.name;
  }
  return null;
}
// 用事件帧号精确：建 frame->event
const evAt = new Map();
for (const e of events) { const a = evAt.get(e.frame) || []; a.push(e); evAt.set(e.frame, a); }
for (let i = 0; i < F.length - 20; i += 5) {
  const s = sol(F[i]), o = opp(F[i]);
  if (!s || !o || s.hp <= 0 || o.hp <= 0) continue;
  if (!['stand', 'crouch'].includes(s.state)) continue;
  const k = key(s, o);
  act[k] = act[k] || { n: 0, acts: {} };
  act[k].n++;
  let found = null;
  for (let j = i + 1; j <= i + 20; j++) {
    for (const e of (evAt.get(F[j].frame) || [])) if (e.type === 'move' && e.owner === solSeat) { found = e.name; break; }
    if (found) break;
  }
  const key2 = found || '(none)';
  act[k].acts[key2] = (act[k].acts[key2] || 0) + 1;
}
const rows = Object.entries(act).sort((a, b) => b[1].n - a[1].n).slice(0, 30);
console.log('== conditional actions (sampled every 5f; horizon 20f) ==');
for (const [k, v] of rows) {
  const arr = Object.entries(v.acts).sort((a, b) => b[1] - a[1]).map(x => x[0] + ':' + x[1]).join(' ');
  console.log(k, 'n=' + v.n, arr);
}

// Sol 超必杀发动时的条件
console.log('== supers ==');
for (const e of supers.slice(0, 20)) {
  const fr = F.find(x => x.frame === e.frame);
  if (!fr) continue;
  const s = sol(fr), o = opp(fr);
  console.log('frame', e.frame, 'round', fr.round, 'dx', Math.round(Math.abs(s.x - o.x)), 'myState', s.state, 'opState', o.state, 'meterBefore?', s.meter);
}

// 对手（我方旧程序）被命中次数与伤害
let dmg = [0, 0], hp0 = null;
for (let i = 1; i < F.length; i++) {
  for (const seat of [0, 1]) {
    const a = F[i - 1].fighters[seat], b = F[i].fighters[seat];
    if (a && b) dmg[seat] += Math.max(0, a.hp - b.hp);
  }
}
console.log('damage taken by seat', JSON.stringify(dmg));
