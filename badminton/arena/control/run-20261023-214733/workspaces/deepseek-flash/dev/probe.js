'use strict';
// 探针：打印发球/挑高/杀球的弹道参数，帮助理解物理。
const sim = require('../engine.js');
const { rules } = require('../catalog.js');
const DT = 1 / rules.hz, SUB = DT / rules.substeps;

// 复制 flightLanding/solveSpeed/shotTrace 的逻辑（从引擎源码抄，便于离线探查）
function flightLanding(x, y, vx, vy) {
  const dt = SUB;
  for (let t = 0; t < 5; t += dt) {
    const sp = Math.hypot(vx, vy);
    vx -= vx * rules.shuttleDrag * sp * dt;
    vy -= vy * rules.shuttleDrag * sp * dt;
    vy -= rules.gravity * dt;
    x += vx * dt; y += vy * dt;
    if (y > rules.ceiling) { y = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
    if (y <= rules.shuttleRadius) return x;
    if (x < -0.5 || x > rules.courtLength + 0.5) return x;
  }
  return x;
}
function solveSpeed(x0, y0, angle, dir, targetX) {
  let lo = 5, hi = 34;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const land = flightLanding(x0, y0, dir * mid * Math.cos(angle), mid * Math.sin(angle));
    if ((land - targetX) * dir < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// 逐帧轨迹（含网）
function trace(x0, y0, vx, vy, dir) {
  let x = x0, y = y0;
  const out = [{ x, y, t: 0 }];
  const dt = SUB;
  let netY = null;
  for (let n = 0; n < 20 * 6; n++) {
    for (let k = 0; k < rules.substeps; k++) {
      const sp = Math.hypot(vx, vy);
      vx -= vx * rules.shuttleDrag * sp * dt;
      vy -= vy * rules.shuttleDrag * sp * dt;
      vy -= rules.gravity * dt;
      const px = x, py = y;
      x += vx * dt; y += vy * dt;
      if (netY === null && (px - rules.netX) * (x - rules.netX) < 0) {
        const f = (rules.netX - px) / (x - px);
        netY = py + (y - py) * f;
      }
      if (y > rules.ceiling) { y = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
      if (y <= rules.shuttleRadius) { out.push({ x, y: 0, t: (n + (k + 1) / rules.substeps) * DT, land: true }); return { pts: out, netY, landX: x }; }
      if (x < -0.15 || x > rules.courtLength + 0.15) { out.push({ x, y, t: (n + (k + 1) / rules.substeps) * DT, out: true }); return { pts: out, netY, landX: x }; }
    }
    out.push({ x, y, t: (n + 1) * DT });
  }
  return { pts: out, netY, landX: x };
}

function fmt(n) { return (Math.round(n * 1000) / 1000).toFixed(3); }

console.log('=== 发球（team0 从 (3.8,1.35) 发向 9.9） ===');
{
  const x0 = 3.8, y0 = 1.35, angle = 0.72, dir = 1, target = rules.netX + 3.2;
  const sp = solveSpeed(x0, y0, angle, dir, target);
  const tr = trace(x0, y0, dir * sp * Math.cos(angle), sp * Math.sin(angle), dir);
  console.log('speed', fmt(sp), 'netY', fmt(tr.netY), 'landX', fmt(tr.landX), 'flightT', fmt(tr.pts[tr.pts.length - 1].t));
  const at = y => tr.pts.find(p => p.t > 0.2 && p.y <= y);
  for (const h of [2.4, 2.0, 1.6, 1.2]) { const p = at(h); if (p) console.log(`  降到 y<=${h}: x=${fmt(p.x)} t=${fmt(p.t)}`); }
}

console.log('\n=== 高远球 clear：team0 从 (2.5,1.9) 打向 11.9 ===');
{
  const x0 = 2.5, y0 = 1.9, dir = 1, target = 11.9;
  for (const angle of [0.60, 0.72]) {
    const sp = solveSpeed(x0, y0, angle, dir, target);
    const tr = trace(x0, y0, dir * sp * Math.cos(angle), sp * Math.sin(angle), dir);
    console.log(`angle ${angle} speed ${fmt(sp)} netY ${fmt(tr.netY)} landX ${fmt(tr.landX)} T ${fmt(tr.pts[tr.pts.length - 1].t)}`);
  }
}

console.log('\n=== 挑高球 lift：team0 从 (4.5,0.7) 打向 11.4 ===');
{
  const x0 = 4.5, y0 = 0.7, dir = 1, target = 11.4;
  for (const angle of [1.05, 1.20]) {
    const sp = solveSpeed(x0, y0, angle, dir, target);
    const tr = trace(x0, y0, dir * sp * Math.cos(angle), sp * Math.sin(angle), dir);
    console.log(`angle ${angle} speed ${fmt(sp)} netY ${fmt(tr.netY)} landX ${fmt(tr.landX)} T ${fmt(tr.pts[tr.pts.length - 1].t)}`);
  }
}

console.log('\n=== 杀球 smash：接触点 (5.2,2.5) 目标 8.3 / 12.4 ===');
{
  for (const target of [8.3, 12.4]) {
    for (const angle of [-0.42, -0.30, -0.18]) {
      const x0 = 5.2, y0 = 2.5, dir = 1;
      const sp = solveSpeed(x0, y0, angle, dir, target);
      const tr = trace(x0, y0, dir * sp * Math.cos(angle), sp * Math.sin(angle), dir);
      const last = tr.pts[tr.pts.length - 1];
      console.log(`target ${target} angle ${angle} speed ${fmt(sp)} netY ${fmt(tr.netY)} landX ${fmt(tr.landX)} T ${fmt(last.t)}`);
    }
  }
}
console.log('\n=== 杀球：接触点 (4.0,2.5)（离网更远 2.7） ===');
{
  for (const target of [8.3, 12.4]) {
    for (const angle of [-0.42, -0.18]) {
      const x0 = 4.0, y0 = 2.5, dir = 1;
      const sp = solveSpeed(x0, y0, angle, dir, target);
      const tr = trace(x0, y0, dir * sp * Math.cos(angle), sp * Math.sin(angle), dir);
      const last = tr.pts[tr.pts.length - 1];
      console.log(`target ${target} angle ${angle} speed ${fmt(sp)} netY ${fmt(tr.netY)} landX ${fmt(tr.landX)} T ${fmt(last.t)}`);
    }
  }
}
