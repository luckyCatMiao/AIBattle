'use strict';
// ASCII danger map: which tiles a given defender set can see/fire at.
const sim = require('../simulation');
const cat = require('../catalog');
const W = 40, H = 24;

function mkG() {
  const g = sim.createMatch({ id: 'd', players: [{ name: 'a', kind: 'api' }, { name: 'b', kind: 'api' }], seed: 1 });
  return g;
}

const angleOf = (x, y) => Math.atan2(y, x);
function angleDiff(a, b) {
  let d = (a - b + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return Math.abs(d - Math.PI);
}

// defs: [{x,y,fx,fy,range}]
function firedAt(g, d, x, y) {
  const dist = Math.hypot(x - d.x, y - d.y);
  if (dist > (d.range || 22)) return false;
  if (!sim.lineOfSight(g, d.x, d.y, x, y)) return false;
  const fa = angleOf(d.fx, d.fy);
  return angleDiff(angleOf(x - d.x, y - d.y), fa) <= Math.PI * 50 / 180;
}
function seenAt(g, d, x, y) {
  const dist = Math.hypot(x - d.x, y - d.y);
  if (dist > 8) return false;
  if (!sim.lineOfSight(g, d.x, d.y, x, y)) return false;
  if (dist <= 2) return true;
  const fa = angleOf(d.fx, d.fy);
  return angleDiff(angleOf(x - d.x, y - d.y), fa) <= Math.PI * 50 / 180;
}

function main() {
  const g = mkG();
  const mode = process.argv[2] || 'mid';
  const range = Number(process.argv[3] || 22);
  let defs = [];
  if (mode === 'mid') {
    for (const [x, y] of [[17.5, 9.5], [19.5, 9.5], [21.5, 9.5], [18.5, 8.5], [20.5, 8.5]])
      defs.push({ x, y, fx: 0, fy: 1, range });
  } else if (mode === 'split') {
    for (const [x, y] of [[9.5, 7.5], [12.5, 8.5], [30.5, 7.5], [27.5, 8.5], [19.5, 9.5]])
      defs.push({ x, y, fx: 0, fy: 1, range });
  } else if (mode === 'siteA') {
    for (const [x, y] of [[9.5, 7.5], [12.5, 8.5], [6.5, 6.5], [10.5, 4.5], [9.5, 9.5]])
      defs.push({ x, y, fx: 0, fy: 1, range });
  } else if (mode === 'gapA') {
    for (const [x, y] of [[9.5, 12.5], [10.5, 14.5], [8.5, 13.5], [11.5, 16.5], [9.5, 17.5]])
      defs.push({ x, y, fx: 0, fy: 1, range });
  }
  let out = '';
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (g.tiles[y * W + x] === 1) { row += '#'; continue; }
      const fire = defs.some(d => firedAt(g, d, cx, cy));
      const see = defs.some(d => seenAt(g, d, cx, cy));
      row += fire ? (see ? 'X' : 'x') : (see ? 's' : '.');
    }
    out += row + '\n';
  }
  console.log(out);
  console.log('X=fire+see x=fire only s=see only .=safe  mode=' + mode + ' range=' + range);
}
main();
