// Replay a referee window file through the real JS engine and log the
// parameters of every strike in a frame range.
// usage: node dev/replay_probe.js <replay.json.gz> <lo> <hi>
const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2];
const lo = Number(process.argv[3] || 0);
const hi = Number(process.argv[4] || 1e9);
const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));

let src = fs.readFileSync('simulation.js', 'utf8');
src = src.replace("require('./catalog')", "require('../catalog')");
src = src.replace('function strike(g, p, sx, sy) {',
  `function strike(g, p, sx, sy) {
  if (g.frame >= ${lo} && g.frame <= ${hi}) {
    console.error('STRIKE frame=' + g.frame + ' team=' + p.team + ' sx=' + sx.toFixed(3) +
      ' sy=' + sy.toFixed(3) + ' nh=' + g.netHeight + ' oppx=' + g.batsmen[1 - p.team].x.toFixed(6) +
      ' facing=' + p.facing + ' swtype=' + p.swingType + ' stam=' + p.stamina.toFixed(1));
  }`);
src = src.replace('({ angle, speed } = chooseShot(sx, sy, dir, kind, target, g.netHeight));',
  `({ angle, speed } = chooseShot(sx, sy, dir, kind, target, g.netHeight));
  if (g.frame >= ${lo} && g.frame <= ${hi}) {
    console.error('  SHOT kind=' + kind + ' target=' + target.toFixed(3) + ' angle=' + angle.toFixed(3) +
      ' speed=' + speed.toFixed(3) + ' vx=' + (p.facing * speed * Math.cos(angle)).toFixed(2) +
      ' vy=' + (speed * Math.sin(angle)).toFixed(2));
  }`);
src = src.replace('module.exports = {', 'module.exports = {');
src = src.replace('canSwingNow, predictContact,', '');
src = src.replace('module.exports = {', 'module.exports = { chooseShot, shotTrace,');
fs.writeFileSync('dev/_replay_sim.js', src);
const m = require('./_replay_sim.js');

const g = m.createMatch({
  id: data.id, seed: data.seed,
  players: data.seats.map((s, i) => ({ name: data.names[i], kind: 'api' })),
});
for (const w of data.windows) {
  m.advanceWindow(g, w.inputs);
}
console.error('FINAL', JSON.stringify({ score: g.score, frame: g.frame, net: g.netHeight }));
