'use strict';
// Run a patched copy of simulation.js (bot helpers were stripped from the
// provided public source, so the export line is trimmed in a /tmp copy).
const fs = require('fs');
const path = require('path');
const dir = '/tmp/bomber_rules';
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync('/workspace/catalog.js', path.join(dir, 'catalog.js'));
let src = fs.readFileSync('/workspace/simulation.js', 'utf8');
src = src.replace(/module\.exports\s*=\s*\{[\s\S]*$/,
  'module.exports = { createMatch, step, advanceWindow, submitWindow, snapshot, score, emit, normalizeInput, walkable, placeBomb, explode, DT, FRAMES_PER_DECISION, rules, powerups, TILE: catalog.TILE, W, H, tileIndex, inBounds };\n');
fs.writeFileSync(path.join(dir, 'simulation.js'), src);
const sim = require(path.join(dir, 'simulation.js'));
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { seed = 1, windows } = spec;
let g = sim.createMatch({ id: 'x', players: [{name:'A',kind:'api'},{name:'B',kind:'api'}], seed });
const out = [];
function snap() {
  return {
    round: g.round, roundFrames: g.roundFrames, status: g.status, winner: g.winner,
    reason: g.reason,
    tiles: Array.from(g.tiles),
    spawns: g.spawns.map(p=>[p[0],p[1]]),
    fighters: g.fighters.map(f=>({owner:f.owner,x:f.x,y:f.y,fromX:f.fromX,fromY:f.fromY,
      progress:f.moveProgress,alive:f.alive,bombs:f.bombs,blast:f.blast,speed:f.speed,
      activeBombs:f.activeBombs,invulnUntil:f.invulnUntil})),
    bombs: g.bombs.map(b=>({id:b.id,owner:b.owner,x:b.x,y:b.y,fuse:b.fuse,blast:b.blast})),
    blasts: g.blasts.map(c=>({x:c.x,y:c.y,frames:c.frames,owner:c.owner})),
    drops: g.drops.map(d=>({id:d.id,x:d.x,y:d.y,type:d.type})),
    wins: g.players.map(p=>p.wins),
    roundLog: g.roundLog,
  };
}
out.push(snap());
for (const w of windows) {
  if (g.status !== 'playing') break;
  const wi = w.map(arr => arr.map(x=>sim.normalizeInput(x)));
  sim.advanceWindow(g, wi);
  out.push(snap());
}
process.stdout.write(JSON.stringify(out));
