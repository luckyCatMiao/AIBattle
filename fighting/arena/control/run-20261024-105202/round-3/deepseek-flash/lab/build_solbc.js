// 从公开录象 dump 构建 GPT-6.1 Sol 的行为克隆表。
// 每个决策窗口起点读 Sol 的状态/对手状态/距离/气槽/角色，统计该窗口内 Sol 实际发动的动作。
// 用法: node build_solbc.js out.json dump1.json [dump2.json ...]
const fs = require('fs');

const outFile = process.argv[2];
const files = process.argv.slice(3);
const table = {};      // key -> { action: count }
const airTable = {};   // char|dxBucket -> { action: count }
let samples = 0;

function distBucket(dx) {
  return dx < 70 ? '0-70' : dx < 110 ? '70-110' : dx < 150 ? '110-150' : dx < 200 ? '150-200'
    : dx < 280 ? '200-280' : dx < 380 ? '280-380' : '380+';
}

for (const file of files) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const F = d.frames;
  const solSeat = 1; // 两个 dump 里 GPT-6.1 Sol 都在席位 1
  // 建立 frame -> events
  const evAt = new Map();
  for (const fr of F) {
    if (!fr.events) continue;
    for (const e of fr.events) {
      if (e.owner !== solSeat) continue;
      if (!['move', 'super', 'jump'].includes(e.type)) continue;
      const a = evAt.get(e.frame) || [];
      if (!a.some(x => x.id === e.id)) a.push(e);
      evAt.set(e.frame, a);
    }
  }
  const startFrame = F[0].frame;
  const endFrame = F[F.length - 1].frame;
  for (let w = startFrame; w + 15 <= endFrame; w += 15) {
    const fr = F[w - startFrame];
    if (!fr) continue;
    const s = fr.fighters[solSeat], o = fr.fighters[1 - solSeat];
    if (!s || !o || s.hp <= 0 || o.hp <= 0) continue;
    if (!['stand', 'crouch', 'jump', 'air'].includes(s.state)) continue;
    let act = '(none)';
    outer:
    for (let f = w + 1; f <= w + 15; f++) {
      for (const e of (evAt.get(f) || [])) { act = e.type === 'jump' ? 'jump' : e.name; break outer; }
    }
    const dx = distBucket(Math.abs(o.x - s.x));
    const meter = s.meter >= 100 ? 'FULL' : 'no';
    if (s.state === 'jump' || s.state === 'air') {
      const k = s.char + '|' + dx;
      airTable[k] = airTable[k] || {};
      airTable[k][act] = (airTable[k][act] || 0) + 1;
    } else {
      const k = [s.char, s.state, o.state, dx, meter].join('|');
      table[k] = table[k] || {};
      table[k][act] = (table[k][act] || 0) + 1;
    }
    samples++;
  }
  console.log(file, 'windows used so far', samples);
}
fs.writeFileSync(outFile, JSON.stringify({ samples, table, airTable }));
console.log('wrote', outFile, 'keys', Object.keys(table).length, 'airKeys', Object.keys(airTable).length);
