'use strict';
/* ============================================================
   Player rig rendering — "the Ashen Blade".
   Skeleton (local units, y=0 at the feet):
     hip(-44) -> chest(-66) -> neck(-78) -> head(-88)
   Two-bone IK legs with planted feet, two-bone arms, katana in
   the front hand. Poses are driven by pl.pose from the state machine.
   ============================================================ */

const CHAR_SCALE = 1.6;

const PCOL = {
  coat: '#4b5069', coatHi: '#656c88', coatLo: '#2c2f40',
  trim: '#d8603f', trimHi: '#ff7a4e',
  wrap: '#efe8d8', wrapLo: '#c0b6a3',
  mask: '#f6f1e4', maskLine: '#1d1922',
  scarf: '#e04a30', scarfHi: '#ff6b45',
  boot: '#1e1e2c', belt: '#4a342c',
  blade: '#eef5ff', hilt: '#2c2a30',
  rim: 'rgba(180,208,255,0.55)', rimWarm: 'rgba(255,168,110,0.4)'
};

/* two-bone IK: root -> target, returns the middle joint. */
function ik2(rx, ry, tx, ty, l1, l2, bend) {
  let dx = tx - rx, dy = ty - ry;
  let d = Math.hypot(dx, dy);
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) { const s = maxD / d; dx *= s; dy *= s; d = maxD; }
  d = Math.max(d, Math.abs(l1 - l2) + 0.01);
  const a = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const ang = a + bend * Math.acos(cosA);
  return { x: rx + Math.cos(ang) * l1, y: ry + Math.sin(ang) * l1 };
}

function stroke2(ctx, ax, ay, bx, by, cx, cy, w1, w2, col, rim) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(6,7,12,0.60)';
  ctx.lineWidth = w1 + 4;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w1;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.lineWidth = w2;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
  if (rim) {
    ctx.strokeStyle = PCOL.rim;
    ctx.lineWidth = Math.max(1, w2 * 0.24);
    ctx.beginPath();
    ctx.moveTo(ax - 1.3, ay - w1 * 0.32); ctx.lineTo(bx - 1.3, by - w1 * 0.32);
    ctx.lineTo(cx - 1.3, cy - w2 * 0.32);
    ctx.stroke();
  }
}

function drawBoot(ctx, x, y, ang, col, s) {
  s = s || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-4.5 * s, 0);
  ctx.quadraticCurveTo(-6 * s, -8 * s, 0, -9 * s);
  ctx.quadraticCurveTo(5 * s, -9 * s, 6 * s, -3 * s);
  ctx.lineTo(10 * s, -2 * s);
  ctx.quadraticCurveTo(12 * s, -0.2 * s, 8.5 * s, 1.4 * s);
  ctx.lineTo(-4.5 * s, 1.4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,180,235,0.26)'; ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawPlayerRig(ctx, pl) {
  const p = pl.pose;
  const face = pl.facing;
  const t = pl.t;

  ctx.save();
  ctx.translate(pl.x, pl.y);
  ctx.scale(CHAR_SCALE, CHAR_SCALE);

  // ---- ground light pool + contact shadow ----
  const airH = clamp(1 - (WORLD.ground - pl.y) / 320, 0.25, 1);
  ctx.save();
  ctx.scale(1, 0.26);
  const lp = ctx.createRadialGradient(0, 0, 2, 0, 0, 52 * airH);
  lp.addColorStop(0, 'rgba(140,175,255,' + (0.13 * airH) + ')');
  lp.addColorStop(1, 'rgba(140,175,255,0)');
  ctx.fillStyle = lp;
  ctx.beginPath(); ctx.arc(0, 0, 52 * airH, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.55 * airH;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, 0.5, 22 * (0.6 + airH * 0.4), 5.2 * (0.6 + airH * 0.4), 0, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.scale(face, 1);
  ctx.translate(0, -p.crouch);

  const flashAmt = clamp(pl.hitFlash, 0, 1);
  const lean = p.lean;
  const hipY = -44;
  const chestY = -66;
  const neckY = -78;
  const shX = (p.hipShift || 0) * 0.25;

  // ---- scarf (drawn behind the body) ----
  const scarfFlow = clamp(Math.abs(pl.vx) / 300, 0, 1.4)
    + (pl.act && pl.act.dash ? 1.1 : 0)
    + (pl.act && (pl.act.light || pl.act.heavy) ? 0.4 : 0);
  ctx.save();
  ctx.translate(shX + 1, neckY + 4);
  for (let s = 0; s < 2; s++) {
    const ph = t * 8 + s * 1.9;
    const len = 52 + s * 14 + scarfFlow * 26;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i <= 6; i++) {
      const k = i / 6;
      const wav = Math.sin(ph - i * 0.85) * (2.2 + k * (3.4 + scarfFlow * 6));
      const rise = Math.sin(ph * 0.7 + i * 0.45) * 2.2;
      // always streams backwards (-x), lifted by speed
      ctx.lineTo(-len * k * (0.86 + scarfFlow * 0.12) + wav * 0.6,
                 5 + k * k * (10 + scarfFlow * 6) - scarfFlow * 9 * k + rise + wav * 0.3);
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7.5 - s * 2;
    ctx.stroke();
    ctx.strokeStyle = s === 0 ? PCOL.scarf : PCOL.scarfHi;
    ctx.lineWidth = 5.4 - s * 2;
    ctx.globalAlpha = s === 0 ? 1 : 0.82;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ---- legs ----
  const footF = { x: p.footFx || 6, y: p.footFy || 0 };
  const footB = { x: p.footBx || -7, y: p.footBy || 0 };
  const kneeB = ik2(-4, hipY, footB.x, footB.y, 23, 24, -1);
  stroke2(ctx, -4, hipY, kneeB.x, kneeB.y, footB.x, footB.y, 9, 7.5, '#3a3d52', false);
  drawBoot(ctx, footB.x, footB.y, p.footBAng || 0, '#1b1b27', 0.92);

  // ---- back arm ----
  const shB = { x: shX - 5, y: chestY + 2 };
  const handB = {
    x: shB.x + Math.cos(p.armB) * 21 + Math.cos(p.armB + p.elbowB) * 20,
    y: shB.y + Math.sin(p.armB) * 21 + Math.sin(p.armB + p.elbowB) * 20
  };
  const elbowB = ik2(shB.x, shB.y, handB.x, handB.y, 21, 20, -1);
  stroke2(ctx, shB.x, shB.y, elbowB.x, elbowB.y, handB.x, handB.y, 7, 6, '#33364a', false);
  ctx.fillStyle = PCOL.wrapLo;
  ctx.beginPath(); ctx.arc(handB.x, handB.y, 3.5, 0, TAU); ctx.fill();

  // ---- coat tails ----
  drawCoatTails(ctx, pl, hipY + 2, 42, scarfFlow);

  // ---- front leg ----
  const kneeF = ik2(4, hipY, footF.x, footF.y, 23, 24, -1);
  stroke2(ctx, 4, hipY, kneeF.x, kneeF.y, footF.x, footF.y, 10, 8, '#474b65', false);
  drawBoot(ctx, footF.x, footF.y, p.footFAng || 0, '#252636', 1);

  // ---- torso ----
  ctx.save();
  ctx.translate(shX, 0);
  ctx.rotate(lean * 0.5 + p.spine * 0.35);

  ctx.fillStyle = PCOL.coatLo;
  ctx.beginPath(); ctx.ellipse(0, hipY + 2, 11, 9, 0, 0, TAU); ctx.fill();

  const bg = ctx.createLinearGradient(-16, 0, 16, 0);
  bg.addColorStop(0, PCOL.coatLo);
  bg.addColorStop(0.45, PCOL.coat);
  bg.addColorStop(1, PCOL.coatHi);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-9.5, hipY + 4);
  ctx.quadraticCurveTo(-13, hipY - 12, -12, chestY + 2);
  ctx.quadraticCurveTo(-8, neckY - 3, 0, neckY - 2);
  ctx.quadraticCurveTo(9, neckY - 1, 12, chestY + 3);
  ctx.quadraticCurveTo(13, hipY - 12, 9, hipY + 4);
  ctx.quadraticCurveTo(0, hipY + 8, -9.5, hipY + 4);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(184,212,255,0.55)'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(11, chestY + 4); ctx.quadraticCurveTo(12.4, hipY - 12, 8.2, hipY + 3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,166,110,0.22)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-11, chestY + 3); ctx.quadraticCurveTo(-12.4, hipY - 12, -8.2, hipY + 3);
  ctx.stroke();

  ctx.fillStyle = PCOL.wrap;
  ctx.beginPath();
  ctx.moveTo(-10.5, chestY - 1); ctx.lineTo(10.5, chestY - 5);
  ctx.lineTo(11.5, chestY + 8); ctx.lineTo(-10.5, chestY + 10.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(70,60,52,0.30)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-9, chestY + 2); ctx.lineTo(10, chestY - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9, chestY + 6); ctx.lineTo(10.5, chestY + 2.5); ctx.stroke();

  ctx.fillStyle = PCOL.trim;
  ctx.save(); ctx.rotate(-0.05);
  ctx.fillRect(-12, hipY - 8, 24, 6);
  ctx.fillStyle = PCOL.trimHi;
  ctx.fillRect(-12, hipY - 8, 24, 2);
  ctx.restore();
  ctx.fillStyle = PCOL.belt;
  ctx.fillRect(-11.5, hipY - 1.5, 24, 4);
  ctx.fillStyle = '#7a6746';
  ctx.fillRect(1.5, hipY - 2, 4.5, 5);

  // ---- head ----
  ctx.save();
  ctx.translate(1.2, neckY + 1);
  ctx.rotate(lean * 0.35 + p.head * 0.7);
  ctx.scale(0.92, 0.92);
  ctx.fillStyle = PCOL.wrapLo;
  ctx.fillRect(-3.2, -2, 6.4, 7);
  ctx.fillStyle = '#343749';
  ctx.beginPath(); ctx.ellipse(-1, -8, 11, 11.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(184,212,255,0.45)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(-1, -8, 10.6, -1.7, 0.5); ctx.stroke();
  // hood cloth trailing behind the jaw
  ctx.fillStyle = '#2c2f40';
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.quadraticCurveTo(-15, 4, -10 + Math.sin(t * 3) * 1.5, 16);
  ctx.quadraticCurveTo(-6, 6, -5, -6);
  ctx.closePath(); ctx.fill();
  // porcelain mask
  ctx.fillStyle = PCOL.mask;
  ctx.beginPath();
  ctx.moveTo(-1, -18);
  ctx.quadraticCurveTo(10, -17, 11.5, -7);
  ctx.quadraticCurveTo(12, 1.5, 5.5, 4.5);
  ctx.quadraticCurveTo(-1, 6, -4, 0);
  ctx.quadraticCurveTo(-5.5, -11, -1, -18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,110,120,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = PCOL.maskLine;
  ctx.beginPath(); ctx.ellipse(4.6, -8, 4.6, 1.7, -0.1, 0, TAU); ctx.fill();
  const eyeGlow = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const eg = ctx.createRadialGradient(4.8, -8, 0, 4.8, -8, 10);
  eg.addColorStop(0, 'rgba(255,150,96,' + (0.95 * eyeGlow) + ')');
  eg.addColorStop(1, 'rgba(255,80,60,0)');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(4.8, -8, 10, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffab72';
  ctx.beginPath(); ctx.ellipse(5.2, -8, 2.8, 1.05, -0.1, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(200,86,58,0.9)'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(2, -15); ctx.lineTo(7, -13); ctx.lineTo(3, -10.5); ctx.stroke();
  ctx.strokeStyle = 'rgba(56,50,58,0.55)'; ctx.lineWidth = 0.75;
  ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(2.5, -4); ctx.lineTo(0.5, 2); ctx.stroke();
  ctx.strokeStyle = PCOL.scarf; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, -16);
  ctx.quadraticCurveTo(-18 - scarfFlow * 6, -21 + Math.sin(t * 8) * 2.5,
                       -27 - scarfFlow * 9, -13 + Math.sin(t * 8 + 1) * 3.5);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // ---- front arm + blade ----
  const shF = { x: shX + 5, y: chestY + 1 };
  const armAng = p.armF;
  const foreAng = armAng + p.elbowF;
  const ex = shF.x + Math.cos(armAng) * 22, ey = shF.y + Math.sin(armAng) * 22;
  const hx = ex + Math.cos(foreAng) * 21, hy = ey + Math.sin(foreAng) * 21;

  ctx.fillStyle = '#4d5272';
  ctx.beginPath(); ctx.ellipse(shF.x - 0.5, shF.y - 0.5, 8.5, 7.4, armAng * 0.25, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(184,212,255,0.6)'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.fillStyle = 'rgba(20,22,34,0.5)';
  ctx.beginPath(); ctx.ellipse(shF.x - 0.5, shF.y - 0.5, 4.6, 3.9, armAng * 0.25, 0, TAU); ctx.fill();

  stroke2(ctx, shF.x, shF.y, ex, ey, hx, hy, 8, 6.5, PCOL.wrap, true);
  drawBlade(ctx, hx, hy, foreAng, pl);

  ctx.restore();

  if (flashAmt > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = flashAmt * 0.4;
    ctx.fillStyle = '#ff6a5a';
    ctx.beginPath(); ctx.ellipse(0, -52, 24, 54, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawCoatTails(ctx, pl, hipY, len, flow) {
  const t = pl.t;
  const n = 5;
  const sway = Math.sin(t * 5.4) * 2.4 + pl.vx * 0.026;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    const ang = Math.PI * 0.5 + k * 0.62 + Math.sin(t * 4.6 + i * 1.25) * 0.05 + flow * 0.24;
    const L = (len - Math.abs(k) * 7) * 0.94;
    const bx = k * 17;
    const ex = bx - Math.cos(ang) * L * 0.72 + sway;
    const ey = hipY + Math.sin(ang) * L * 0.95;
    ctx.beginPath();
    ctx.moveTo(bx, hipY);
    ctx.quadraticCurveTo(bx - Math.cos(ang) * L * 0.36 + sway * 0.3, hipY + Math.sin(ang) * L * 0.5, ex, ey);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(6,7,12,0.55)';
    ctx.lineWidth = 11 - Math.abs(k) * 2.4;
    ctx.stroke();
    ctx.strokeStyle = i % 2 ? '#383c52' : '#464b64';
    ctx.lineWidth = 8 - Math.abs(k) * 2.1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(168,120,90,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBlade(ctx, hx, hy, ang, pl) {
  const p = pl.pose;
  const a = ang + (p.bladeRot != null ? p.bladeRot : -0.35);
  const len = 74;
  const x1 = hx + Math.cos(a) * 11, y1 = hy + Math.sin(a) * 11;
  const x2 = hx + Math.cos(a) * len, y2 = hy + Math.sin(a) * len;
  const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
  const curve = 3.5;
  const mx = (x1 + x2) / 2 + nx * curve;
  const my = (y1 + y2) / 2 + ny * curve;

  const chargeGlow = pl.state === 'chargeWind' ? clamp(pl.chargeT / 0.46, 0, 1) : 0;
  const g = Math.max(pl.bladeGlow * 0.65, (p.blade || 0) * 0.4, chargeGlow);
  if (g > 0.03) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const warm = (p.blade || 0) >= 1.5 || chargeGlow > 0.9;
    const col = warm ? '255,158,84' : '146,208,255';
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.13 * g) + ')';
    ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.42 * g) + ')';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
    ctx.restore();
  }

  // handle
  ctx.strokeStyle = '#211f26';
  ctx.lineWidth = 5.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - Math.cos(a) * 15, hy - Math.sin(a) * 15);
  ctx.lineTo(hx + Math.cos(a) * 5, hy + Math.sin(a) * 5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(214,200,172,0.55)';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    const k = -12 + i * 4.4;
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(a) * k - nx * 2.6, hy + Math.sin(a) * k - ny * 2.6);
    ctx.lineTo(hx + Math.cos(a) * (k + 3) + nx * 2.6, hy + Math.sin(a) * (k + 3) + ny * 2.6);
    ctx.stroke();
  }
  // tsuba
  ctx.strokeStyle = '#8d7a56';
  ctx.lineWidth = 3.4;
  const gx = hx + Math.cos(a) * 6.5, gy = hy + Math.sin(a) * 6.5;
  ctx.beginPath();
  ctx.moveTo(gx - nx * 6.5, gy - ny * 6.5);
  ctx.lineTo(gx + nx * 6.5, gy + ny * 6.5);
  ctx.stroke();

  // blade body
  ctx.beginPath();
  ctx.moveTo(x1 + nx * 2.4, y1 + ny * 2.4);
  ctx.quadraticCurveTo(mx + nx * 2.2, my + ny * 2.2, x2, y2);
  ctx.quadraticCurveTo(mx - nx * 1.6, my - ny * 1.6, x1 - nx * 1.6, y1 - ny * 1.6);
  ctx.closePath();
  const edge = ctx.createLinearGradient(x1, y1, x2, y2);
  edge.addColorStop(0, '#a9b6c9');
  edge.addColorStop(0.4, '#dde8f7');
  edge.addColorStop(1, '#ffffff');
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * 2.2, y1 + ny * 2.2);
  ctx.quadraticCurveTo(mx + nx * 2.1, my + ny * 2.1, x2 - nx * 0.2, y2 - ny * 0.2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,110,140,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x1 - nx * 1.4, y1 - ny * 1.4);
  ctx.quadraticCurveTo(mx - nx * 1.5, my - ny * 1.5, x2 - nx * 0.4, y2 - ny * 0.4);
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(220,240,255,0.85)';
  ctx.beginPath(); ctx.arc(x2, y2, 1.9, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.fillStyle = PCOL.wrap;
  ctx.beginPath(); ctx.arc(hx, hy, 4.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,22,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(hx, hy, 4.3, 0, TAU); ctx.stroke();
}

function drawPlayerSilhouette(ctx, x, y, face, poseName) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face * CHAR_SCALE, CHAR_SCALE);
  const col = ctx.fillStyle;
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  if (poseName === 'run' || poseName === 'dash') {
    ctx.beginPath(); ctx.ellipse(0, -58, 12, 22, -0.32, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -84, 9, 0, TAU); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-3, -44); ctx.lineTo(-18, -22); ctx.lineTo(-10, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -44); ctx.lineTo(16, -24); ctx.lineTo(27, -14); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(5, -66); ctx.lineTo(28, -56); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.ellipse(0, -58, 11, 24, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(2, -86, 9.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
