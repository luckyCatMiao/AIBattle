'use strict';
/* 复盘第 1 轮两局：用官方物理引擎逐帧重放公开回放，统计弹距/射击质量/走位。
 * 只读取本局回放（公开对局数据），不读取对手任何源码。
 * 用法: node dev/analyze_r1.js <run目录> */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const sim = require('D:/extraProj/AIBattle/duel/simulation.js');

const RUN = process.argv[2] || path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'res');
fs.mkdirSync(OUT, { recursive: true });

const HIT = 0.67;

function analyze(file) {
  const rec = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const g = sim.createMatch({
    id: rec.id, seed: rec.seed,
    players: rec.names.map(name => ({ name, kind: 'api' })),
  });

  // 逐子弹追踪：id -> {owner, born, x0,y0, ux,uy, minToFoe, minT, pathLen}
  const shots = [];
  const live = new Map();

  const frames = [];
  let minFoe = [Infinity, Infinity];       // 每名玩家与敌方子弹的最近距离
  let minFoeAt = [null, null];
  let minAllShot = [Infinity, Infinity];   // 每个玩家发射的子弹对对手的最近距离（整局）
  let minAllShotT = [0, 0];
  let near = new Array(8).fill(0);         // 每名玩家距敌方子弹 <0.9 / <1.2 / <1.6 / <2.2 的帧数
  let nearFoe = [0, 0, 0, 0];
  let sepSum = 0, sepN = 0;
  let wallFrames = 0;                      // 我方位移很小（贴墙/柱）的帧数

  const prevPos = [null, null];
  const moveStats = [
    { frames: 0, speed: 0, threatFrames: 0, perp: 0, away: 0, toward: 0 },
    { frames: 0, speed: 0, threatFrames: 0, perp: 0, away: 0, toward: 0 },
  ];
  const posHeat = [new Array(16).fill(0), new Array(16).fill(0)];
  const record = (f) => {
    const ps = g.players;
    const basePos = prevPos.map(v => (v ? [v[0], v[1]] : null));
    for (let i = 0; i < 2; i++) {
      const p = ps[i], foe = ps[1 - i];
      // 最近敌方子弹
      let m = Infinity, mb = null;
      for (const b of g.bullets) {
        if (b.owner === i) continue;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < m) { m = d; mb = b; }
      }
      const TH = [0.9, 1.2, 1.6, 2.2];
      for (let j = 0; j < 4; j++) if (m < TH[j]) near[i * 4 + j]++;
      if (m < minFoe[i]) {
        minFoe[i] = m;
        minFoeAt[i] = {
          frame: g.frame, now: +g.now.toFixed(3), dist: +m.toFixed(3),
          bullet: mb && mb.id, bulletOwner: mb && mb.owner,
          me: [+p.x.toFixed(3), +p.y.toFixed(3)], meCd: p.cooldown,
          foe: [+foe.x.toFixed(3), +foe.y.toFixed(3)], foeCd: foe.cooldown,
        };
      }
      // 4x4 区域热度
      const row = Math.min(3, Math.max(0, Math.floor(p.y / (sim.H / 4))));
      const col = Math.min(3, Math.max(0, Math.floor(p.x / (sim.W / 4))));
      posHeat[i][row * 4 + col]++;
      // 移动/对威胁的反应
      if (prevPos[i]) {
        const mvx = p.x - prevPos[i][0], mvy = p.y - prevPos[i][1];
        const mv = Math.hypot(mvx, mvy);
        const st = moveStats[i];
        st.frames++; st.speed += mv;
        if (mv > 0.2) {
          // 最近的一颗正在接近的敌方子弹
          let best = null, bestD = Infinity;
          for (const b of g.bullets) {
            if (b.owner === i) continue;
            const dx = p.x - b.x, dy = p.y - b.y;
            const d = Math.hypot(dx, dy);
            if (d > 5) continue;
            const closing = (b.vx * dx + b.vy * dy) / Math.max(d, 1e-6);
            if (closing <= 0.5) continue;
            if (d < bestD) { bestD = d; best = b; }
          }
          if (best) {
            st.threatFrames++;
            const sp = Math.hypot(best.vx, best.vy) || 1;
            const bx = best.vx / sp, by = best.vy / sp;
            const cos = (mvx * bx + mvy * by) / mv;
            if (Math.abs(cos) < 0.35) st.perp++;
            else if (cos < 0) st.away++;
            else st.toward++;
          }
        }
      }
      // 追踪自己子弹对对手的最近距离
      for (const b of g.bullets) {
        if (b.owner !== i) continue;
        const d = Math.hypot(foe.x - b.x, foe.y - b.y);
        const tr = live.get(b.id);
        if (tr && d < tr.minToFoe) {
          tr.minToFoe = d; tr.minT = +g.now.toFixed(3); tr.minBounces = b.bounces;
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const rx = foe.x - b.x, ry = foe.y - b.y;
          tr.minAlong = +(rx * ux + ry * uy).toFixed(3);        // 沿弹道方向误差
          tr.minPerp = +Math.abs(rx * -uy + ry * ux).toFixed(3); // 垂直弹道误差
          tr.minFoeDistWall = +(Math.min(foe.x - 1, sim.W - 1 - foe.x, foe.y - 1, sim.H - 1 - foe.y)).toFixed(2);
          // 最近的墙：法向与弹道夹角（0=正对墙，1=沿墙）
          const dw = [foe.x - 1, sim.W - 1 - foe.x, foe.y - 1, sim.H - 1 - foe.y];
          let wi = 0; for (let k = 1; k < 4; k++) if (dw[k] < dw[wi]) wi = k;
          const nrm = [[-1, 0], [1, 0], [0, -1], [0, 1]][wi];
          tr.minWallNormalCos = +Math.abs(ux * nrm[0] + uy * nrm[1]).toFixed(2);
          tr.minWallSide = ['L', 'R', 'T', 'B'][wi];
          if (basePos[1 - i]) {
            tr.foeVx = +((foe.x - basePos[1 - i][0]) / (1 / 20)).toFixed(2);
            tr.foeVy = +((foe.y - basePos[1 - i][1]) / (1 / 20)).toFixed(2);
          }
        }
        if (d < minAllShot[i]) { minAllShot[i] = d; minAllShotT[i] = +g.now.toFixed(3); }
      }
      // 玩家间距
      sepSum += Math.hypot(p.x - foe.x, p.y - foe.y); sepN++;
      // 本帧位移
      if (prevPos[i]) {
        const mv = Math.hypot(p.x - prevPos[i][0], p.y - prevPos[i][1]);
        if (mv < 0.05) wallFrames++;
      }
      prevPos[i] = [p.x, p.y];
    }
    // 新子弹登记
    for (const b of g.bullets) {
      if (!live.has(b.id)) {
        const tr = {
          id: b.id, owner: b.owner, bornFrame: g.frame, bornT: +g.now.toFixed(3),
          x0: b.x, y0: b.y, vx: b.vx, vy: b.vy,
          aim: Math.round(Math.atan2(b.vy, b.vx) * 180 / Math.PI),
          fireDist: +Math.hypot(g.players[1 - b.owner].x - b.x, g.players[1 - b.owner].y - b.y).toFixed(2),
          directCos: +(((g.players[1 - b.owner].x - b.x) * b.vx + (g.players[1 - b.owner].y - b.y) * b.vy) /
            (8.5 * Math.hypot(g.players[1 - b.owner].x - b.x, g.players[1 - b.owner].y - b.y) || 1)).toFixed(2),
          minToFoe: Infinity, minT: null, minBounces: null,
        };
        live.set(b.id, tr); shots.push(tr);
      }
    }
    if (g.frame % 20 === 0) {  // 每 1 s 一行
      frames.push({
        t: +g.now.toFixed(2),
        p: ps.map(p => [+p.x.toFixed(1), +p.y.toFixed(1)]),
        cd: ps.map(p => p.cooldown),
        shots: ps.map(p => p.shots),
        bullets: g.bullets.length,
        sep: +Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y).toFixed(1),
      });
    }
  };

  record();
  for (const w of rec.windows) {
    for (let f = 0; f < 3 && g.status === 'playing'; f++) {
      for (let o = 0; o < 2; o++) {
        g.players[o].held = sim.normalizeInput((w.inputs[o] && w.inputs[o][f]) || {});
      }
      sim.step(g);
      record();
    }
  }

  const shotStats = (owner) => {
    const list = shots.filter(s => s.owner === owner);
    const arr = list.map(s => s.minToFoe).sort((a, b) => a - b);
    const bucket = (lt) => arr.filter(v => v < lt).length;
    const aims = {};
    for (const s of list) aims[s.aim] = (aims[s.aim] || 0) + 1;
    const ranges = [0, 0, 0, 0];
    for (const s of list) {
      if (s.fireDist < 6) ranges[0]++;
      else if (s.fireDist < 10) ranges[1]++;
      else if (s.fireDist < 16) ranges[2]++;
      else ranges[3]++;
    }
    const cls = (s) => (s.directCos > 0.7 ? 'direct' : s.directCos < -0.3 ? 'bank' : 'lateral');
    const allCls = { direct: 0, lateral: 0, bank: 0 };
    const closeCls = { direct: 0, lateral: 0, bank: 0 };
    for (const s of list) { allCls[cls(s)]++; if (s.minToFoe < 1.5) closeCls[cls(s)]++; }
    return {
      count: arr.length,
      min: +arr[0].toFixed(3),
      p10: +arr[Math.floor(arr.length * 0.1)].toFixed(3),
      median: +arr[Math.floor(arr.length * 0.5)].toFixed(3),
      p90: +arr[Math.floor(arr.length * 0.9)].toFixed(3),
      under_1_0: bucket(1.0), under_1_5: bucket(1.5), under_2_0: bucket(2.0), under_3_0: bucket(3.0),
      bounces_at_best: list.filter(s => s.minBounces > 0).length,
      aims, fireDistRanges_lt6_10_16_gt16: ranges,
      shotClassAll: allCls, shotClassUnder1_5: closeCls,
    };
  };

  const geomStats = (owner) => {
    const list = shots.filter(s => s.owner === owner && s.minToFoe != null && isFinite(s.minToFoe));
    const nearList = list.filter(s => s.minToFoe < 2.5);
    const med = (a) => a.length ? +a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(3) : null;
    return {
      n_near: nearList.length,
      perp_median: med(nearList.map(s => s.minPerp)),
      along_median: med(nearList.map(s => Math.abs(s.minAlong))),
      perp_smaller_share: +(nearList.filter(s => s.minPerp < Math.abs(s.minAlong)).length / Math.max(1, nearList.length)).toFixed(2),
      foe_wall_dist_median: med(nearList.map(s => s.minFoeDistWall)),
      wall_parallel_share_close: +(list.filter(s => s.minToFoe < 1.5 && s.minWallNormalCos < 0.5).length /
        Math.max(1, list.filter(s => s.minToFoe < 1.5).length)).toFixed(2),
      wall_side_close: list.filter(s => s.minToFoe < 1.5).reduce((a, s) => (a[s.minWallSide] = (a[s.minWallSide] || 0) + 1, a), {}),
      top10: list.slice().sort((a, b) => a.minToFoe - b.minToFoe).slice(0, 10).map(s => ({
        id: s.id, t: s.bornT, d: +s.minToFoe.toFixed(3), perp: s.minPerp, along: s.minAlong,
        bounces: s.minBounces, foeV: [s.foeVx, s.foeVy], wall: s.minFoeDistWall, fireDist: s.fireDist,
        directCos: s.directCos,
      })),
    };
  };

  return {
    id: rec.id, seed: rec.seed,
    final: {
      frame: g.frame, now: +g.now.toFixed(2), windows: rec.windows.length,
      status: g.status, winner: g.winner, reason: g.reason,
      shots: g.players.map(p => p.shots), bullets: g.bullets.length,
      durationWallClock: rec.duration,
    },
    minEnemyBulletDist: {
      p0_deepseek_if_seat0: +minFoe[0].toFixed(3),
      p1: +minFoe[1].toFixed(3),
      at: minFoeAt,
    },
    myShotsClosestToFoe: {
      owner0: shotStats(0), owner1: shotStats(1),
    },
    shotGeometry: { owner0: geomStats(0), owner1: geomStats(1) },
    allBulletOwnersMinDist: { owner0: +minAllShot[0].toFixed(3), owner1: +minAllShot[1].toFixed(3), at: minAllShotT },
    enemyBulletProximityFrames: {
      p0_lt_0_9_1_2_1_6_2_2: near.slice(0, 4),
      p1_lt_0_9_1_2_1_6_2_2: near.slice(4, 8),
    },
    meanSeparation: +(sepSum / sepN).toFixed(2),
    nearStaticFrames: wallFrames,
    moveStats: moveStats.map(s => ({
      frames: s.frames,
      meanStep: +(s.speed / s.frames).toFixed(3),
      threatFrames: s.threatFrames,
      pct_perp: +(100 * s.perp / Math.max(1, s.threatFrames)).toFixed(1),
      pct_away: +(100 * s.away / Math.max(1, s.threatFrames)).toFixed(1),
      pct_toward: +(100 * s.toward / Math.max(1, s.threatFrames)).toFixed(1),
    })),
    posHeat,
    timeline: frames,
    shots,
  };
}

const all = {};
for (const id of ['r1-g1', 'r1-g2']) {
  const file = path.join(RUN, id + '.json.gz');
  all[id] = analyze(file);
  const a = all[id];
  console.log('=====', id, 'seed', a.seed, '=>', a.final.frame, '物理帧', a.final.now, 's');
  console.log(' shots', a.final.shots, 'bullets', a.final.bullets, 'wallclock', a.final.durationWallClock);
  console.log(' min enemy bullet dist p0/p1:', a.minEnemyBulletDist.p0_deepseek_if_seat0, a.minEnemyBulletDist.p1);
  console.log(' proximity frames p0:', a.enemyBulletProximityFrames.p0_lt_0_9_1_2_1_6_2_2);
  console.log(' proximity frames p1:', a.enemyBulletProximityFrames.p1_lt_0_9_1_2_1_6_2_2);
  console.log(' shot quality owner0:', JSON.stringify(a.myShotsClosestToFoe.owner0));
  console.log(' shot quality owner1:', JSON.stringify(a.myShotsClosestToFoe.owner1));
  console.log(' mean separation', a.meanSeparation);
}
fs.writeFileSync(path.join(OUT, 'r1-analysis.json'), JSON.stringify(all, null, 2));
console.log('wrote', path.join(OUT, 'r1-analysis.json'));
