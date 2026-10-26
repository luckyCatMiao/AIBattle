'use strict';
// Per-shot quality from recorded match: for each fired bullet, min distance to the
// opponent's actual future trajectory. Also aggregate spacing / wall stats.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const sim = require('../simulation.js');
const load = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));

function run(gid, p) {
  const d = load(p);
  const g = sim.createMatch({ id: gid, seed: d.seed, players: d.seats.map(s=>({name:s})) });
  const mine = d.seats.indexOf('deepseek-flash');
  const fires = [], pos = [], bulletFrame = new Map(); // id -> {owner, fireFrame, x0,y0, bounces0}
  const perFrame = [];
  for (const w of d.windows) {
    for (let i = 0; i < 3 && g.status === 'playing'; i++) {
      for (let o = 0; o < 2; o++) {
        const pl = g.players[o];
        pl.held = (w.inputs[o] && w.inputs[o][i]) || {dir:'N',aim:null,fire:false};
      }
      sim.step(g);
      for (const b of g.bullets) if (!bulletFrame.has(b.id)) {
        bulletFrame.set(b.id, {owner:b.owner, fireFrame:g.frame, x0:b.x, y0:b.y, vx0:b.vx, vy0:b.vy});
        fires.push(bulletFrame.get(b.id));
      }
      perFrame.push({frame:g.frame, players:g.players.map(pl=>({x:pl.x,y:pl.y,cd:pl.cooldown,shots:pl.shots})), bullets:g.bullets.map(b=>({id:b.id,owner:b.owner,x:b.x,y:b.y,bounces:b.bounces}))});
    }
    if (g.status !== 'playing') break;
  }
  // map frame -> player positions
  const posByFrame = new Map(perFrame.map(f=>[f.frame, f.players]));
  const bulletById = new Map();
  for (const f of perFrame) for (const b of f.bullets) {
    if (!bulletById.has(b.id)) bulletById.set(b.id, []);
    bulletById.get(b.id).push({frame:f.frame, x:b.x, y:b.y, bounces:b.bounces});
  }
  const shots = fires.map(fr => {
    const target = 1 - fr.owner;
    const traj = bulletById.get('b' + (fires.indexOf(fr)+1)) || [];
    // find bullet by matching source object (ids sequential)
    return null;
  });
  // Do it properly: iterate bullet ids
  const ids = [...bulletById.keys()].sort((a,b)=>parseInt(a.slice(1))-parseInt(b.slice(1)));
  const results = [];
  for (const id of ids) {
    const info = bulletFrame.get(id); if (!info) continue;
    const target = 1 - info.owner;
    let best = Infinity, bestFrame = null;
    for (const pt of bulletById.get(id)) {
      const pp = posByFrame.get(pt.frame)[target];
      if (!pp) continue;
      const dd = Math.hypot(pp.x-pt.x, pp.y-pt.y);
      if (dd < best) { best = dd; bestFrame = pt.frame; }
    }
    // min within fixed windows after fire
    const within = n => {
      let b = Infinity;
      for (const pt of bulletById.get(id)) {
        if (pt.frame > info.fireFrame + n) break;
        const pp = posByFrame.get(pt.frame)[target];
        if (!pp) continue;
        const dd = Math.hypot(pp.x-pt.x, pp.y-pt.y);
        if (dd < b) b = dd;
      }
      return b;
    };
    results.push({id, owner: info.owner, fireFrame: info.fireFrame, t: info.fireFrame*.05,
      minDist: best, minFrame: bestFrame, m15: within(30), m30: within(60), m60: within(120), m80: within(160),
      lifetime: bulletById.get(id).length});
  }
  // spacing & wall time
  let close = 0, wall = 0, sumD = 0;
  for (const f of perFrame) {
    const m = f.players[mine], o = f.players[1-mine];
    const dd = Math.hypot(m.x-o.x, m.y-o.y);
    sumD += dd; if (dd < 2.0) close++; if (Math.min(m.x-1,39-m.x,m.y-1,29-m.y) < 2.2) wall++;
  }
  return {gid, seed:d.seed, mine, perFrame, results, frames:perFrame.length,
    stats:{meanDist:sumD/perFrame.length, closeFrames:close, wallFrames:wall}};
}

const base = 'D:/extraProj/AIBattle/duel/arena/control/run-20261025-233938';
for (const gid of ['r1-g1','r1-g2','r2-g1','r2-g2']) {
  const r = run(gid, path.join(base, gid+'.json.gz'));
  const mineShots = r.results.filter(x=>x.owner===r.mine);
  const oppShots = r.results.filter(x=>x.owner!==r.mine);
  const q = (arr, key) => {
    const v = arr.map(x=>x[key]).sort((a,b)=>a-b);
    return {n:v.length, med:v[Math.floor(v.length/2)], lt15:v.filter(x=>x<1.5).length, lt10:v.filter(x=>x<1.0).length, lt067:v.filter(x=>x<0.67).length, min:v[0]};
  };
  console.log('====',gid,'frames',r.frames,'shots me',mineShots.length,'opp',oppShots.length);
  console.log(' spacing mean %.2f close<2 %.2fs wall<2.2 %.2fs (%.1f%%)'%(r.stats.meanDist,r.stats.closeFrames*.05,r.stats.wallFrames*.05,100*r.stats.wallFrames/r.frames));
  for (const key of ['m15','m30','m60','m80','minDist']) {
    console.log('  %-8s me %s | opp %s'%(key,JSON.stringify(q(mineShots,key)),JSON.stringify(q(oppShots,key))));
  }
  // closest shots
  console.log('  my closest shots:',mineShots.slice().sort((a,b)=>a.minDist-b.minDist).slice(0,6).map(x=>`${x.id}@f${x.fireFrame} d${x.minDist.toFixed(2)}`).join(' '));
  console.log('  opp closest shots:',oppShots.slice().sort((a,b)=>a.minDist-b.minDist).slice(0,6).map(x=>`${x.id}@f${x.fireFrame} d${x.minDist.toFixed(2)}`).join(' '));
  fs.writeFileSync(path.join(__dirname,'res',gid+'-shots.json'), JSON.stringify({gid:r.gid,seed:r.seed,mine:r.mine,frames:r.frames,stats:r.stats,results:r.results},null,1));
}
