// ============================================================
// anim.js — 程序化骨骼：姿态、关键帧、角色绘制
// 角度约定：0 = 竖直向下，正方向朝角色面向（+x），π = 竖直向上
// ============================================================
const BONE = { torso: 26, neck: 6, headR: 8.5, uarm: 16, farm: 15, thigh: 20, shin: 20, katana: 50, saber: 36, hammer: 30 };

const PAL = {
  player: { skin: '#ece5d4', cloth: '#26343a', cloth2: '#33474f', boot: '#161d24', accent: '#d8434f', metal: '#dfeaf2', glow: '#8fe3ff', outline: '#0e0c13' },
  grunt: { skin: '#a8744a', cloth: '#6e3b2e', cloth2: '#83462f', boot: '#38231a', accent: '#d9a441', metal: '#c3ccd3', glow: '#ff9b6a', outline: '#1f1410' },
  heavy: { skin: '#8a7558', cloth: '#4b3f33', cloth2: '#5f4e3c', boot: '#2c231b', accent: '#c9a227', metal: '#9aa3ab', glow: '#ffb36a', outline: '#171310' },
  thrower: { skin: '#c8b39a', cloth: '#7d2f3a', cloth2: '#94404a', boot: '#38222a', accent: '#e0c26a', metal: '#e3eaee', glow: '#ffd98a', outline: '#231a16' },
};
const STUB_COL = '#6b4326'; // 断肢截面的木茬

// ---------- 姿态 ----------
function makePose(o) {
  return Object.assign({
    ln: 0.05, bb: 0, hd: 0, wp: -1.15, spin: 0, lie: 0,
    lfh: 0.30, lfk: -0.30, lbh: -0.34, lbk: -0.45,
    lsh: 0.30, lse: 0.55, rsh: -0.42, rse: -0.45,
  }, o);
}
function lerpPose(a, b, k) {
  const out = {};
  for (const key in a) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}
// 关键帧轨道：[[t, partial], ...] → 完整姿态插值
function TR(pairs) { return pairs.map(([t, o]) => [t, makePose(o)]); }
function evalTrack(tr, t) {
  t = clamp(t, 0, 1);
  if (t <= tr[0][0]) return tr[0][1];
  for (let i = 1; i < tr.length; i++) {
    if (t <= tr[i][0]) {
      const k = smooth((t - tr[i - 1][0]) / (tr[i][0] - tr[i - 1][0] || 1e-6));
      return lerpPose(tr[i - 1][1], tr[i][1], k);
    }
  }
  return tr[tr.length - 1][1];
}

const IDLE = makePose({});

// ============================================================
// 骨架计算：局部坐标 → 世界坐标（镜像 + 自旋 + 平移）
// ============================================================
function computeFigure(e, p) {
  const s = e.scale, f = e.facing;
  const spin = (p.spin || 0) + (e.tumble || 0) + (p.lie ? -1.52 * p.lie : 0);
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const W = (lx, ly) => {
    const rx = lx * cs - ly * sn, ry = lx * sn + ly * cs;
    return [e.x + rx * f, e.y + ry + (p.bb || 0)];
  };
  const parts = e.parts;
  const pal = e.pal;
  const B = BONE, sc = s;
  const torsoL = B.torso * sc, neckL = B.neck * sc, headR = B.headR * sc;

  const chestL = [Math.sin(p.ln) * torsoL, -Math.cos(p.ln) * torsoL];
  const neckLp = [chestL[0] + Math.sin(p.ln) * neckL, chestL[1] - Math.cos(p.ln) * neckL];
  const hA = p.ln + (p.hd || 0) * 0.6;
  const headL = [neckLp[0] + Math.sin(hA) * (headR + 1), neckLp[1] - Math.cos(hA) * (headR + 1)];
  const chest = W(chestL[0], chestL[1]), neck = W(neckLp[0], neckLp[1]), headC = W(headL[0], headL[1]);
  const shL = W(chestL[0] * 0.94 - 1.5, chestL[1] * 0.94 + 1);
  const shR = W(chestL[0] * 0.94 + 1.5, chestL[1] * 0.94 + 1);
  const hipFL = [2.5, -1], hipBL = [-2.5, -1];

  function limb2(jl, a1, l1, a2, l2) {
    const j = W(jl[0], jl[1]);
    const ex = jl[0] + Math.sin(a1) * l1, ey = jl[1] + Math.cos(a1) * l1;
    const eW = W(ex, ey);
    const a3 = a1 + a2;
    const hW = W(ex + Math.sin(a3) * l2, ey + Math.cos(a3) * l2);
    return [j, eW, hW, a3];
  }
  const uarm = B.uarm * sc, farm = B.farm * sc, thigh = B.thigh * sc, shin = B.shin * sc;

  const bones = [], pins = [], circles = [];
  const push = (a, b, w, col) => bones.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], w, col });
  const stub = (j, ang) => { const t = W(j[0] + Math.sin(ang) * 5, j[1] + Math.cos(ang) * 5); push(W(j[0], j[1]), t, 3.5 * sc, STUB_COL); };

  // 远侧手臂（后手）
  if (parts.armB.on) {
    const r = limb2([chestL[0] * 0.94 - 1.5, chestL[1] * 0.94 + 1], p.lsh, uarm, p.lse, farm);
    push(r[0], r[1], 5.2 * sc, pal.cloth); push(r[1], r[2], 4.2 * sc, pal.skin);
    pins.push(r[1]);
    circles.push({ part: 'armB', x: (r[1][0] + r[2][0]) / 2, y: (r[1][1] + r[2][1]) / 2, r: 6.5 * sc });
  } else stub([chestL[0] * 0.94 - 1.5, chestL[1] * 0.94 + 1], p.lsh * 0.4);
  // 远侧腿（后腿）
  if (parts.legB.on) {
    const r = limb2(hipBL, p.lbh, thigh, p.lbk, shin);
    push(r[0], r[1], 7.2 * sc, pal.cloth2); push(r[1], r[2], 5.6 * sc, pal.boot);
    pins.push(r[1]); e._footB = r[2];
    circles.push({ part: 'legB', x: (r[1][0] + r[2][0]) / 2, y: (r[1][1] + r[2][1]) / 2, r: 7 * sc });
  } else stub(hipBL, 0.2);
  // 躯干
  push(W(0, 0), chest, 12.5 * sc, pal.cloth);
  push(chest, neck, 6 * sc, pal.skin);
  circles.push({ part: 'torso', x: chest[0], y: chest[1] - 2, r: 12 * sc });
  // 近侧腿（前腿）
  if (parts.legF.on) {
    const r = limb2(hipFL, p.lfh, thigh, p.lfk, shin);
    push(r[0], r[1], 7.6 * sc, pal.cloth2); push(r[1], r[2], 6 * sc, pal.boot);
    pins.push(r[1]); e._footF = r[2];
    circles.push({ part: 'legF', x: (r[1][0] + r[2][0]) / 2, y: (r[1][1] + r[2][1]) / 2, r: 7 * sc });
  } else stub(hipFL, -0.2);
  // 头
  if (parts.head.on) circles.push({ part: 'head', x: headC[0], y: headC[1], r: 9.5 * sc });
  else stub(neckLp, p.ln + 1.35);
  // 近侧手臂（前手 / 持械手）
  let hand = null, blade = null;
  if (parts.armF.on) {
    const r = limb2([chestL[0] * 0.94 + 1.5, chestL[1] * 0.94 + 1], p.rsh, uarm, p.rse, farm);
    push(r[0], r[1], 5.4 * sc, pal.cloth); push(r[1], r[2], 4.4 * sc, pal.skin);
    pins.push(r[1]);
    circles.push({ part: 'armF', x: (r[1][0] + r[2][0]) / 2, y: (r[1][1] + r[2][1]) / 2, r: 6.5 * sc });
    hand = r[2]; e._handF = hand;
    if (e.weapon) {
      const wl = (e.weapon === 'katana' ? B.katana : e.weapon === 'saber' ? B.saber : e.weapon === 'hammer' ? B.hammer : 14) * sc;
      const tip = W(chestL[0] * 0.94 + 1.5 + Math.sin(p.rsh) * uarm + Math.sin(p.rsh + p.rse) * farm + Math.sin(p.wp) * wl,
                    chestL[1] * 0.94 + 1 + Math.cos(p.rsh) * uarm + Math.cos(p.rsh + p.rse) * farm + Math.cos(p.wp) * wl);
      blade = { bx: hand[0], by: hand[1], tx: tip[0], ty: tip[1] };
    }
  } else {
    stub([chestL[0] * 0.94 + 1.5, chestL[1] * 0.94 + 1], p.rsh * 0.4);
    if (e.weapon) e._handF = null;
  }

  return {
    bones, pins, head: parts.head.on ? { x: headC[0], y: headC[1], r: headR } : null,
    chest, neck, hand, blade, circles, root: W(0, 0),
  };
}

// ============================================================
// 角色绘制
// ============================================================
function strokeBone(ctx, b, col, w) {
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.lineTo(b.bx, b.by); ctx.stroke();
}
function drawHeadShape(ctx, e, h, pal) {
  ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.fillStyle = pal.skin; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = pal.outline; ctx.stroke();
  const f = e.facing;
  // 提线孔
  ctx.beginPath(); ctx.arc(h.x, h.y - h.r - 1.5 * e.scale, 1.6 * e.scale, 0, TAU);
  ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.4; ctx.stroke();
  if (e.face === 'visor') {
    ctx.fillStyle = pal.glow;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(h.x + f * h.r * 0.05, h.y - 2.5, f * h.r * 0.95, 4);
    ctx.globalAlpha = 1;
  } else if (e.face === 'mask') {
    ctx.fillStyle = pal.metal;
    ctx.fillRect(h.x - h.r * 0.9, h.y - 3.5, h.r * 1.8, 6);
    ctx.fillStyle = pal.outline;
    ctx.fillRect(h.x + f * h.r * 0.3, h.y - 2.5, f * h.r * 0.45, 3);
  } else if (e.face === 'eye') {
    ctx.fillStyle = pal.outline;
    ctx.beginPath(); ctx.arc(h.x + f * h.r * 0.35, h.y - 1, 3.2 * e.scale, 0, TAU); ctx.fill();
    ctx.fillStyle = pal.glow;
    ctx.beginPath(); ctx.arc(h.x + f * h.r * 0.42, h.y - 1, 1.3 * e.scale, 0, TAU); ctx.fill();
  } else { // stitched 双针脚眼
    ctx.strokeStyle = pal.outline; ctx.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      const ex = h.x + f * h.r * (0.18 + i * 0.42), ey = h.y - 1.5;
      ctx.beginPath();
      ctx.moveTo(ex - 2.2, ey - 2.2); ctx.lineTo(ex + 2.2, ey + 2.2);
      ctx.moveTo(ex + 2.2, ey - 2.2); ctx.lineTo(ex - 2.2, ey + 2.2);
      ctx.stroke();
    }
  }
}
function drawWeaponShape(ctx, e, hand, wp, pal, glow) {
  if (!hand) return;
  const s = e.scale, dx = Math.sin(wp), dy = Math.cos(wp);
  if (e.weapon === 'katana') {
    const L = BONE.katana * s;
    // 刀身光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = pal.glow; ctx.globalAlpha = 0.22 + (glow || 0) * 0.5;
    ctx.lineWidth = 7 + (glow || 0) * 6;
    ctx.beginPath(); ctx.moveTo(hand[0] + dx * 5, hand[1] + dy * 5); ctx.lineTo(hand[0] + dx * L, hand[1] + dy * L); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#f4fbff'; ctx.lineWidth = 3.2 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hand[0] + dx * 4, hand[1] + dy * 4); ctx.lineTo(hand[0] + dx * L, hand[1] + dy * L); ctx.stroke();
    ctx.strokeStyle = pal.metal; ctx.lineWidth = 1.4 * s;
    ctx.beginPath(); ctx.moveTo(hand[0] + dx * 4, hand[1] + dy * 4); ctx.lineTo(hand[0] + dx * L * 0.98, hand[1] + dy * L * 0.98); ctx.stroke();
    // 柄与镡
    ctx.strokeStyle = '#2c2118'; ctx.lineWidth = 3.6 * s;
    ctx.beginPath(); ctx.moveTo(hand[0] - dx * 9 * s, hand[1] - dy * 9 * s); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.beginPath(); ctx.arc(hand[0], hand[1], 3 * s, 0, TAU); ctx.fill();
  } else if (e.weapon === 'saber') {
    const L = BONE.saber * s;
    ctx.strokeStyle = '#584138'; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.moveTo(hand[0] - dx * 6 * s, hand[1] - dy * 6 * s); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
    ctx.strokeStyle = pal.metal; ctx.lineWidth = 3.4 * s;
    ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(hand[0] + dx * L, hand[1] + dy * L); ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.beginPath(); ctx.arc(hand[0], hand[1], 2.6 * s, 0, TAU); ctx.fill();
  } else if (e.weapon === 'hammer') {
    const L = BONE.hammer * s;
    ctx.strokeStyle = '#4a3624'; ctx.lineWidth = 4.5 * s;
    ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(hand[0] + dx * L, hand[1] + dy * L); ctx.stroke();
    const hx = hand[0] + dx * L, hy = hand[1] + dy * L, ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(ang);
    ctx.fillStyle = pal.metal;
    ctx.fillRect(-9 * s, -14 * s, 18 * s, 28 * s);
    ctx.lineWidth = 2; ctx.strokeStyle = pal.outline;
    ctx.strokeRect(-9 * s, -14 * s, 18 * s, 28 * s);
    ctx.fillStyle = pal.accent; ctx.fillRect(-9 * s, -3 * s, 18 * s, 6 * s);
    ctx.restore();
  } else if (e.weapon === 'needle') {
    const L = 15 * s;
    ctx.strokeStyle = pal.metal; ctx.lineWidth = 2.2 * s;
    ctx.beginPath(); ctx.moveTo(hand[0] - dx * 4, hand[1] - dy * 4); ctx.lineTo(hand[0] + dx * L, hand[1] + dy * L); ctx.stroke();
  }
}
function drawFigure(ctx, e) {
  const sk = e.sk; if (!sk) return;
  const pal = e.pal, s = e.scale;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const b of sk.bones) strokeBone(ctx, b, pal.outline, b.w + 2.8);
  for (const b of sk.bones) strokeBone(ctx, b, b.col, b.w);
  // 关节铆钉（木偶感）
  ctx.fillStyle = pal.accent;
  for (const p of sk.pins) { ctx.beginPath(); ctx.arc(p[0], p[1], 2 * s, 0, TAU); ctx.fill(); }
  if (sk.head) drawHeadShape(ctx, e, sk.head, pal);
  drawWeaponShape(ctx, e, sk.hand, e.pose ? e.pose.wp : -1.15, pal, e.weaponGlow || 0);
  // 受击白闪
  if (e.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, e.hitFlash * 9);
    for (const b of sk.bones) strokeBone(ctx, b, '#ffffff', b.w + 1);
    if (sk.head) { ctx.beginPath(); ctx.arc(sk.head.x, sk.head.y, sk.head.r, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}
