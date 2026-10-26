'use strict';
// Replay a recorded match through the official simulation and analyze the fatal bullet.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const sim = require('../simulation.js');

function load(p) { return JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')); }

function analyze(gid, p) {
  const d = load(p);
  const seats = d.seats;
  const g = sim.createMatch({ id: gid, seed: d.seed, players: seats.map((s,i)=>({name:s})) });
  const trace = []; // per physics frame {frame, mine:{x,y}, opp:{x,y}, bullets:[...], cd, shots}
  const prevIds = new Set();
  const fires = {}; // bullet id -> {frame, owner, x,y,vx,vy}
  const windows = d.windows;
  let hitInfo = null;
  let wi = 0;
  while (g.status === 'playing' && wi < windows.length) {
    const w = windows[wi];
    // record state before first frame of window
    sim.advanceWindow(g, w.inputs);
    // after up to 3 frames, but record each frame by stepping manually instead
    wi++;
  }
  // redo manually to get per-frame
  const g2 = sim.createMatch({ id: gid, seed: d.seed, players: seats.map((s,i)=>({name:s})) });
  const mineIdx = seats.indexOf('deepseek-flash');
  const oppIdx = 1 - mineIdx;
  const per = [];
  const known = new Set();
  for (const w of windows) {
    for (let i = 0; i < 3 && g2.status === 'playing'; i++) {
      for (let owner = 0; owner < 2; owner++) {
        const pl = g2.players[owner];
        const f = w.inputs[owner] && w.inputs[owner][i] ? w.inputs[owner][i] : {dir:'N',aim:null,fire:false};
        pl.held = f;
      }
      const before = new Map(g2.bullets.map(b=>[b.id,{x:b.x,y:b.y,vx:b.vx,vy:b.vy,owner:b.owner}]));
      sim.step(g2);
      // new bullets
      for (const b of g2.bullets) if (!known.has(b.id)) { known.add(b.id); fires[b.id] = {frame:g2.frame, owner:b.owner, x:b.x, y:b.y, vx:b.vx, vy:b.vy}; }
      const m = g2.players[mineIdx], o = g2.players[oppIdx];
      let closest = Infinity, cid = null;
      const edist = [];
      for (const b of g2.bullets) {
        if (b.owner === mineIdx) continue;
        const dist = Math.hypot(b.x-m.x, b.y-m.y);
        edist.push({id:b.id, d:dist, x:b.x,y:b.y,vx:b.vx,vy:b.vy,bounces:b.bounces});
        if (dist < closest) { closest = dist; cid = b.id; }
      }
      per.push({frame:g2.frame, now:g2.now, status:g2.status, mx:m.x,my:m.y, ox:o.x,oy:o.y,
        inputs: w.inputs[mineIdx] ? w.inputs[mineIdx][i] : null,
        cooldown:m.cooldown, shots:m.shots, closest, cid, edist});
      if (g2.status === 'finished' && !hitInfo) {
        const ev = g2.events.filter(e=>e.type==='hit').pop();
        hitInfo = {frame:g2.frame, now:g2.now, ev, winner:g2.winner};
        // find which bullet is at hit position
        let best=null, bd=1e9;
        for (const b of g2.bullets) {
          const dd = Math.hypot(b.x-(ev?ev.x:0), b.y-(ev?ev.y:0));
          if (dd<bd){bd=dd;best=b;}
        }
        hitInfo.bullet = best ? {...best} : null;
        hitInfo.bulletDist = bd;
      }
    }
    if (g2.status !== 'playing') break;
  }
  // trace fatal bullet
  let fatalTrace = [];
  if (hitInfo && hitInfo.bullet) {
    const id = hitInfo.bullet.id;
    fatalTrace = per.filter(f => f.edist.some(e=>e.id===id)).map(f=>{
      const e = f.edist.find(x=>x.id===id);
      return {frame:f.frame, bd:e.d, bx:e.x, by:e.y, bounces:e.bounces, mx:f.mx, my:f.my, closest:f.closest, cid:f.cid, cooldown:f.cooldown, input:f.inputs};
    });
    hitInfo.fire = fires[id];
    // rank by distance at each window-start frame (frame%3==0), before decision
    hitInfo.ranks = [];
    for (const f of per) {
      if (f.frame % 3 !== 0) continue;
      const sorted = [...f.edist].sort((a,b)=>a.d-b.d);
      const rank = sorted.findIndex(x=>x.id===id);
      hitInfo.ranks.push({frame:f.frame, d: sorted.find(x=>x.id===id)?.d, rank, total: sorted.length});
    }
  }
  return {gid, seed:d.seed, seats, mineIdx, hitInfo, per, fatalTrace, fires, d};
}

const outDir = path.join(__dirname, 'res');
fs.mkdirSync(outDir, {recursive:true});
const base = 'D:/extraProj/AIBattle/duel/arena/control/run-20261025-233938';
for (const gid of ['r2-g1','r2-g2']) {
  const r = analyze(gid, path.join(base, gid + '.json.gz'));
  fs.writeFileSync(path.join(outDir, gid + '-analysis.json'), JSON.stringify({gid:r.gid,seed:r.seed,seats:r.seats,mineIdx:r.mineIdx,hitInfo:r.hitInfo,per:r.per,fatalTrace:r.fatalTrace}, null, 1));
  console.log('====', gid, 'seed', r.seed, 'frames', r.per.length, 'final frame', r.per[r.per.length-1].frame);
  console.log('hit', JSON.stringify(r.hitInfo && {frame:r.hitInfo.frame, now:r.hitInfo.now, ev:r.hitInfo.ev, winner:r.hitInfo.winner, bullet:r.hitInfo.bullet, fire:r.hitInfo.fire, bulletDist:r.hitInfo.bulletDist}));
  if (r.hitInfo) {
    console.log('ranks near end:', r.hitInfo.ranks.slice(-14).map(x=>`f${x.frame}:d${x.d?.toFixed(2)}#${x.rank}/${x.total}`).join(' '));
    console.log('fatal trace last 45 frames:');
    for (const f of r.fatalTrace.slice(-45)) console.log(`  f${f.frame} t${(f.frame*.05).toFixed(2)} bd=${f.bd.toFixed(3)} b=(${f.bx.toFixed(2)},${f.by.toFixed(2)}) bo${f.bounces||0} me=(${f.mx.toFixed(2)},${f.my.toFixed(2)}) closest=${f.closest.toFixed(2)}:${f.cid} in=${JSON.stringify(f.input)}`);
  }
}
