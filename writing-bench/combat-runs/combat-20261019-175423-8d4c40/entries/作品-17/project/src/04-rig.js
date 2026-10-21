/* ============================================================
 * 04-rig.js — 程序化人形骨架：姿态求值 + 绘制 + 刀光拖尾
 * 侧视骨架：髋部为原点；角度 0 = 垂直向下，正 = 朝面向方向摆。
 * ============================================================ */
'use strict';

function basePose() {
  return {
    hipY: 0, lean: 0, headTilt: 0, twist: 0,
    armFA1: -0.12, armFA2: -0.35,
    armBA1: 0.14, armBA2: -0.55,
    legFA1: 0.08, legFA2: 0.18,
    legBA1: -0.12, legBA2: 0.3,
    weaponA: 0.9,
  };
}

function lerpPoseInto(out, a, b, t) {
  for (const k in a) out[k] = lerp(a[k], b[k] !== undefined ? b[k] : a[k], t);
  return out;
}

// keys: [{t, p:{...partial pose}}]，要求 t 递增且 keys[0].t = 0
function evalKeyframes(keys, time, out) {
  out = out || basePose();
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= time) i++;
  const k0 = keys[i];
  const k1 = keys[Math.min(i + 1, keys.length - 1)];
  const span = Math.max(0.0001, k1.t - k0.t);
  const raw = clamp((time - k0.t) / span, 0, 1);
  const e = k0.ease ? k0.ease(raw) : raw;
  // 从默认值出发，先叠 k0 再叠 k1
  const p0 = Object.assign(basePose(), k0.p);
  const p1 = Object.assign(basePose(), k1.p);
  return lerpPoseInto(out, p0, p1, e);
}

/* ---------- 刀光拖尾 ---------- */
class BladeTrail {
  constructor() { this.pts = []; } // {bx,by,tx,ty,life}
  push(bx, by, tx, ty) {
    this.pts.push({ bx, by, tx, ty, life: 1 });
    if (this.pts.length > 14) this.pts.shift();
  }
  clear() { this.pts.length = 0; }
  update(dt) {
    for (let i = this.pts.length - 1; i >= 0; i--) {
      this.pts[i].life -= dt * 7.5;
      if (this.pts[i].life <= 0) this.pts.splice(i, 1);
    }
  }
  draw(ctx, color = '130,225,255', widthMul = 1) {
    const n = this.pts.length;
    if (n < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < n; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const k = b.life;
      if (k <= 0) continue;
      // 刃尖到刃尖、刃根到刃根的四边形
      ctx.beginPath();
      ctx.moveTo(a.tx, a.ty);
      ctx.lineTo(b.tx, b.ty);
      ctx.lineTo(b.bx, b.by);
      ctx.lineTo(a.bx, a.by);
      ctx.closePath();
      const grad = ctx.createLinearGradient(b.bx, b.by, b.tx, b.ty);
      grad.addColorStop(0, `rgba(${color},0)`);
      grad.addColorStop(0.55, `rgba(${color},${0.34 * k})`);
      grad.addColorStop(1, `rgba(255,255,255,${0.5 * k})`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------- 人形绘制（玩家浪人） ---------- */
// style: {skin, cloth, clothDark, pants, strap, hair, bladeLen, scale}
function drawRonin(ctx, x, y, facing, pose, style, opts = {}) {
  const s = (style.scale || 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * s * (opts.sx || 1), s * (opts.sy || 1));

  const hip = { x: 0, y: -34 + pose.hipY };
  const chest = {
    x: hip.x + Math.sin(pose.lean) * 26,
    y: hip.y - Math.cos(pose.lean) * 26,
  };

  // 各关节位置（facing 已并入 scale，直接用角度）
  const seg = (ox, oy, ang, len) => ({ x: ox + Math.sin(ang) * len, y: oy + Math.cos(ang) * len });

  const shoulderF = { x: chest.x + 2, y: chest.y + 2 };
  const shoulderB = { x: chest.x - 3, y: chest.y + 3 };
  const elbowF = seg(shoulderF.x, shoulderF.y, pose.armFA1, 15);
  const handF = seg(elbowF.x, elbowF.y, pose.armFA2, 13);
  const elbowB = seg(shoulderB.x, shoulderB.y, pose.armBA1, 15);
  const handB = seg(elbowB.x, elbowB.y, pose.armBA2, 13);

  const kneeF = seg(hip.x, hip.y, pose.legFA1, 16);
  const footF = seg(kneeF.x, kneeF.y, pose.legFA2, 15);
  const kneeB = seg(hip.x, hip.y, pose.legBA1, 16);
  const footB = seg(kneeB.x, kneeB.y, pose.legBA2, 15);

  const headC = {
    x: chest.x + Math.sin(pose.lean + pose.headTilt) * 14,
    y: chest.y - Math.cos(pose.lean + pose.headTilt) * 14,
  };

  const limb = (a, b, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };

  // --- 后侧腿臂（暗色） ---
  limb(hip, kneeB, 7, style.pantsDark);
  limb(kneeB, footB, 6, style.pantsDark);
  limb(shoulderB, elbowB, 6, style.clothDark);
  limb(elbowB, handB, 5, style.clothDark);

  // --- 躯干 ---
  ctx.strokeStyle = style.cloth;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(chest.x, chest.y); ctx.stroke();
  // 腰带
  ctx.strokeStyle = style.strap;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(hip.x - 6, hip.y + 2); ctx.lineTo(hip.x + 7, hip.y - 2); ctx.stroke();

  // --- 头 ---
  ctx.fillStyle = style.skin;
  ctx.beginPath(); ctx.arc(headC.x, headC.y, 8, 0, TAU); ctx.fill();
  // 斗笠/发髻
  ctx.fillStyle = style.hair;
  ctx.beginPath(); ctx.arc(headC.x - 1, headC.y - 3, 8.2, Math.PI * 1.02, Math.PI * 2.05); ctx.fill();
  ctx.fillRect(headC.x - 3, headC.y - 13, 6, 5);

  // --- 前侧腿 ---
  limb(hip, kneeF, 7.5, style.pants);
  limb(kneeF, footF, 6, style.pants);

  // --- 前侧臂 + 刀 ---
  limb(shoulderF, elbowF, 6.5, style.cloth);
  limb(elbowF, handF, 5.5, style.cloth);

  // 刀：从手掌沿 weaponA 伸出
  const wa = pose.weaponA;
  const gripEnd = seg(handF.x, handF.y, wa, -9);   // 柄尾
  const bladeBase = seg(handF.x, handF.y, wa, 7);
  const bladeTip = seg(handF.x, handF.y, wa, 7 + style.bladeLen);
  if (!opts.noWeapon) {
    ctx.strokeStyle = '#3a2c20';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(gripEnd.x, gripEnd.y); ctx.lineTo(bladeBase.x, bladeBase.y); ctx.stroke();
    // 刀刃
    const perp = { x: Math.cos(wa), y: -Math.sin(wa) };
    const grad = ctx.createLinearGradient(bladeBase.x, bladeBase.y, bladeTip.x, bladeTip.y);
    grad.addColorStop(0, '#8fa8bd');
    grad.addColorStop(0.6, '#dfeefc');
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bladeBase.x + perp.x * 2.4, bladeBase.y + perp.y * 2.4);
    ctx.lineTo(bladeTip.x + perp.x * 0.8, bladeTip.y + perp.y * 0.8);
    ctx.lineTo(bladeTip.x - perp.x * 0.8, bladeTip.y - perp.y * 0.8);
    ctx.lineTo(bladeBase.x - perp.x * 2.4, bladeBase.y - perp.y * 2.4);
    ctx.closePath();
    ctx.fill();
    // 护手
    ctx.fillStyle = '#c9a54a';
    ctx.beginPath(); ctx.arc(bladeBase.x, bladeBase.y, 3, 0, TAU); ctx.fill();
    // 蓄力辉光
    if (opts.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = opts.glow;
      ctx.strokeStyle = 'rgba(140,235,255,0.9)';
      ctx.lineWidth = 3 + opts.glow * 4;
      ctx.beginPath(); ctx.moveTo(bladeBase.x, bladeBase.y); ctx.lineTo(bladeTip.x, bladeTip.y); ctx.stroke();
      ctx.restore();
    }
  }

  // 手
  ctx.fillStyle = style.skin;
  ctx.beginPath(); ctx.arc(handF.x, handF.y, 3.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(handB.x, handB.y, 3, 0, TAU); ctx.fill();

  ctx.restore();

  // 返回刀身世界坐标（供拖尾记录）
  const cs = Math.cos(facing > 0 ? 0 : Math.PI);
  const world = (lx, ly) => ({ x: x + lx * facing * s, y: y + ly * s });
  const bb = world(bladeBase.x, bladeBase.y);
  const bt = world(bladeTip.x, bladeTip.y);
  return { base: bb, tip: bt, hand: world(handF.x, handF.y), chest: world(chest.x, chest.y), head: world(headC.x, headC.y) };
}

/* ---------- 跑步/待机姿态生成 ---------- */
function runPose(phase, out) {
  out = out || basePose();
  const A = 0.75, B = 0.6;
  const s = Math.sin(phase), c = Math.cos(phase);
  out.legFA1 = s * A;
  out.legBA1 = -s * A;
  // 膝盖在摆动后相弯曲
  out.legFA2 = s * A + Math.max(0, -c) * B + 0.12;
  out.legBA2 = -s * A + Math.max(0, c) * B + 0.12;
  out.armFA1 = -s * 0.55 - 0.15;
  out.armBA1 = s * 0.55 + 0.1;
  out.armFA2 = out.armFA1 - 0.35;
  out.armBA2 = out.armBA1 - 0.5;
  out.hipY = Math.abs(Math.cos(phase)) * 2.5;
  out.lean = 0.22;
  out.headTilt = -0.1;
  out.weaponA = 0.75 + Math.sin(phase) * 0.06;
  return out;
}

function idlePose(t, out) {
  out = out || basePose();
  const b = Math.sin(t * 2.1) * 0.5 + 0.5;
  out.hipY = b * 1.4;
  out.lean = 0.03 + b * 0.015;
  out.armFA1 = -0.14 - b * 0.03;
  out.armFA2 = -0.42;
  out.armBA1 = 0.16 + b * 0.03;
  out.armBA2 = -0.6;
  out.legFA1 = 0.09; out.legFA2 = 0.16;
  out.legBA1 = -0.13; out.legBA2 = 0.24;
  out.weaponA = 1.15; // 刀尖下垂向后
  out.headTilt = 0.02;
  return out;
}

function airPose(vy, out) {
  out = out || basePose();
  const up = vy < 0;
  out.legFA1 = up ? -0.5 : 0.25;
  out.legFA2 = up ? -1.1 : 0.9;
  out.legBA1 = up ? 0.35 : -0.3;
  out.legBA2 = up ? 0.7 : 0.5;
  out.armFA1 = up ? -0.5 : -0.3;
  out.armFA2 = up ? -0.9 : -0.6;
  out.armBA1 = up ? 0.55 : 0.4;
  out.armBA2 = up ? 0.1 : -0.2;
  out.lean = up ? -0.06 : 0.14;
  out.weaponA = 1.0;
  return out;
}
