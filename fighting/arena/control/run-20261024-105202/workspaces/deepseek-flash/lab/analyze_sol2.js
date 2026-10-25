// 决策点分析：Sol 每次起招/起跳时，它所在决策窗口开始时的局面特征。
const fs = require('fs');
const path = require('path');

function load(file) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  const frames = d.frames;
  const names = frames[0].players.map(p => p.name);
  const solSeat = names.findIndex(x => /Sol/i.test(x));
  return { frames, solSeat };
}
const mv = m => m ? `${m.name}#${m.frame}` : '-';
function analyze(file) {
  const { frames, solSeat } = load(file);
  const oppSeat = 1 - solSeat;
  const starts = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1], cur = frames[i];
    const a = prev.fighters[solSeat], b = cur.fighters[solSeat];
    // 起招：move 从 null/别的招变成新招 frame 0
    if (b.move && b.move.frame === 0 && (!a.move || a.move.name !== b.move.name)) {
      starts.push({ frame: cur.frame, kind: 'move', name: b.move.name, win: Math.floor((cur.frame - 1) / 15) * 15 });
    }
    if (b.state === 'jump' && a.state !== 'jump') {
      starts.push({ frame: cur.frame, kind: 'jump', name: 'jump', win: Math.floor((cur.frame - 1) / 15) * 15 });
    }
  }
  const rows = [];
  for (const st of starts) {
    const wi = st.win;
    const s = frames[wi];
    if (!s || s.status !== 'playing') continue;
    const me = s.fighters[solSeat], op = s.fighters[oppSeat];
    rows.push({
      f: st.frame, r: st.win, act: st.name, kind: st.kind,
      my: me.state + (me.move ? ':' + me.move.name + '#' + me.move.frame : ''),
      op: op.state + (op.move ? ':' + op.move.name + '#' + op.move.frame : ''),
      dx: Math.round(Math.abs(op.x - me.x)), m: Math.round(me.meter), hp: Math.round(me.hp),
      ohp: Math.round(op.hp), ochar: op.char,
      off: st.frame - st.win,
      myx: Math.round(me.x), opx: Math.round(op.x),
    });
  }
  return rows;
}
const all = [];
for (const f of ['replay_dump_r1-g1.json', 'replay_dump_r1-g2.json']) {
  const rows = analyze(f);
  all.push(...rows);
  console.log('=====', f, 'starts', rows.length);
  for (const r of rows) console.log(`${r.f} w${r.r} off${r.off} ${r.act} | my=${r.my} op=${r.op} dx=${r.dx} m=${r.m} hp=${r.hp}/${r.ohp} ${r.ochar}`);
}
// 距离分布
console.log('\n===== action by dx bucket =====');
const buck = d => d < 70 ? 'A<70' : d < 110 ? 'B70-110' : d < 150 ? 'C110-150' : d < 200 ? 'D150-200' : d < 280 ? 'E200-280' : d < 380 ? 'F280-380' : 'G380+';
const tab = new Map();
for (const r of all) {
  const k = buck(r.dx) + '|' + r.my.split(':')[0] + '|' + r.op.split(':')[0];
  if (!tab.has(k)) tab.set(k, new Map());
  const m = tab.get(k); m.set(r.act, (m.get(r.act) || 0) + 1);
}
for (const [k, m] of [...tab].sort()) console.log(k, [...m].sort((a, b) => b[1] - a[1]).map(x => x[0] + ':' + x[1]).join(' '));
