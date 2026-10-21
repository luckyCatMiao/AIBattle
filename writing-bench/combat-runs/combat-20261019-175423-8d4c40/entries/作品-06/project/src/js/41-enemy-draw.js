'use strict';
/* ============================================================
   Enemy rendering: three distinct rigs, limb-aware.
   ============================================================ */

function drawShadow(ctx, x, y, w) {
  ctx.save();
  const hgt = clamp((WORLD.ground - y) / 240, 0, 1);
  ctx.globalAlpha = 0.45 * (1 - hgt * 0.6);
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, WORLD.ground + 1, w * (1 - hgt * 0.35), 6.5 * (1 - hgt * 0.4), 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function limbStroke(ctx, x, y, a1, l1, a2, l2, w1, w2, col, dark) {
  const x1 = x + Math.cos(a1) * l1, y1 = y + Math.sin(a1) * l1;
  const x2 = x1 + Math.cos(a1 + a2) * l2, y2 = y1 + Math.sin(a1 + a2) * l2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = dark || 'rgba(0,0,0,0.55)';
  ctx.lineWidth = w1 + 4;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.lineWidth = w2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = 'rgba(176,200,248,0.28)';
  ctx.lineWidth = Math.max(1, w2 * 0.22);
  ctx.beginPath(); ctx.moveTo(x - 1.2, y - w1 * 0.36); ctx.lineTo(x1 - 1.2, y1 - w1 * 0.36);
  ctx.lineTo(x2 - 1.2, y2 - w2 * 0.36); ctx.stroke();
  return { x1, y1, x2, y2 };
}

// Ambient light pool under an enemy so silhouettes read against the dark floor.
function enemyLightPool(ctx, e, r) {
  const hgt = clamp(1 - (WORLD.ground - e.y) / 300, 0.35, 1);
  const glowCol = e.kind === 'stalker' ? '110,220,255' : (e.kind === 'warden' ? '255,180,100' : '255,120,80');
  ctx.save();
  ctx.translate(e.x, WORLD.ground + 2);
  ctx.scale(1, 0.24);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * hgt);
  g.addColorStop(0, `rgba(${glowCol},${0.13 * hgt})`);
  g.addColorStop(1, `rgba(${glowCol},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r * hgt, 0, TAU); ctx.fill();
  ctx.restore();
}

// Dark glowing stump where a limb was severed
function drawStump(ctx, x, y, r, col, glow) {
  ctx.save();
  ctx.fillStyle = '#120d10';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, TAU); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.4 + 0.25 * Math.sin(performance.now() * 0.006 + x);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.fill();
  ctx.restore();
}

// Telegraph: pulsing warning arc on the ground and a rim glow.
function drawTelegraph(ctx, e, reach, dir, windup) {
  const k = clamp(windup, 0, 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(dir, 1);
  const col = k > 0.8 ? 'rgba(255,90,60,' : 'rgba(255,160,80,';
  const a = 0.10 + Math.sin(k * 30) * 0.03 + k * 0.1;
  const g = ctx.createLinearGradient(0, 0, reach, 0);
  g.addColorStop(0, col + (a * 1.4) + ')');
  g.addColorStop(0.7, col + (a * 0.8) + ')');
  g.addColorStop(1, col + '0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.quadraticCurveTo(reach * 0.7, 2, reach, 6);
  ctx.lineTo(reach, 2);
  ctx.lineTo(0, 2);
  ctx.closePath();
  ctx.fill();
  // ground warning line
  ctx.strokeStyle = col + (0.35 + k * 0.4) + ')';
  ctx.lineWidth = 1.5 + k * 1.5;
  ctx.beginPath();
  ctx.moveTo(reach * 0.1, 2); ctx.lineTo(reach, 2);
  ctx.stroke();
  ctx.restore();
}

/* ============================ HUSK ============================ */
const ENEMY_DRAW = {
  husk: {
    limbAnchor(id, e) {
      const h = e.h;
      switch (id) {
        case 'head': return { x: 4, y: -h + 4 };
        case 'armR': return { x: 14, y: -h * 0.62 };
        case 'armL': return { x: -12, y: -h * 0.62 };
        case 'legL': return { x: -6, y: -h * 0.32 };
        case 'legR': return { x: 6, y: -h * 0.32 };
      }
      return { x: 0, y: -h * 0.5 };
    },
    debrisColor(id) { return id === 'head' ? '#d9cfb9' : (id.startsWith('leg') ? '#b8ac93' : '#c9bfa9'); },
    draw(ctx, e) {
      const p = e.pose, h = e.h, sc = e.scale;
      const pal = e.cfg.palette;
      enemyLightPool(ctx, e, 64);
      const shH = clamp(1 - (WORLD.ground - e.y) / 260, 0.35, 1);
      ctx.save(); ctx.globalAlpha = 0.45 * shH; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(e.x, WORLD.ground + 1, 26 * sc * shH, 6.5 * sc * shH, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y - e.yOff);
      ctx.scale(e.facing * sc * CHAR_SCALE, sc * CHAR_SCALE);
      if (e.hitstun > 0 && e.flash > 0.1) { ctx.globalAlpha = 1; }
      // pause for hit flash: white overlay drawn via composite on redraw? use filter
      const flash = e.flash;
      const t = e.animT;

      const hipY = -h * 0.47;
      const shoulderY = -h * 0.78;
      const neckY = -h * 0.86;

      // telegraph previsualization
      if (e.state === 'tell' && e.attack) {
        drawTelegraph(ctx, e, e.attack.reach * 1.05, 1, e.stateT / e.attack.tell);
      }

      // ---- back leg ----
      if (!e.limbs.legL.broken) {
        limbStroke(ctx, 0, hipY, Math.PI / 2 + p.legB, 21, p.kneeB - 0.1, 21, 8, 6.2, '#5a5148', pal.cloth2);
        const fx = Math.cos(Math.PI / 2 + p.legB) * 21 + Math.cos(Math.PI / 2 + p.legB + p.kneeB - 0.1) * 21;
        const fy = hipY + Math.sin(Math.PI / 2 + p.legB) * 21 + Math.sin(Math.PI / 2 + p.legB + p.kneeB - 0.1) * 21;
        ctx.fillStyle = '#2b2520';
        ctx.beginPath(); ctx.ellipse(fx + 3, fy + 2, 8, 4, 0, 0, TAU); ctx.fill();
      } else {
        drawStump(ctx, 0, hipY + 2, 5, pal.glow, 'rgba(255,110,60,0.35)');
      }

      // ---- back arm (left) ----
      if (!e.limbs.armL.broken) {
        const b = limbStroke(ctx, -3, shoulderY + 2, Math.PI / 2 + p.armL, 20, p.elbowL, 19, 6, 5, '#6b6054', pal.cloth2);
        ctx.fillStyle = pal.bone2;
        ctx.beginPath(); ctx.arc(b.x2, b.y2, 3.4, 0, TAU); ctx.fill();
        // claw
        ctx.strokeStyle = pal.bone; ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(b.x2, b.y2);
          ctx.lineTo(b.x2 + Math.cos(Math.PI / 2 + p.armL + p.elbowL + (i - 1) * 0.3) * 8,
                     b.y2 + Math.sin(Math.PI / 2 + p.armL + p.elbowL + (i - 1) * 0.3) * 8);
          ctx.stroke();
        }
      } else {
        drawStump(ctx, -2, shoulderY + 2, 4.5, pal.glow, 'rgba(255,110,60,0.4)');
      }

      // ---- ragged cloth skirt ----
      ctx.save();
      ctx.translate(0, hipY - 4);
      for (let i = -3; i <= 3; i++) {
        const sw = Math.sin(t * 3 + i * 1.7) * 2 + e.vx * 0.008;
        ctx.beginPath();
        ctx.moveTo(i * 5.5, -6);
        ctx.quadraticCurveTo(i * 7 + sw, 12, i * 8 + sw * 2, 24 + Math.abs(i) * -2 + Math.sin(t * 2 + i) * 2);
        ctx.lineTo(i * 5.5 + 3, -6);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? pal.cloth2 : pal.cloth;
        ctx.fill();
      }
      ctx.restore();

      // ---- torso: hunched, ribbed ----
      ctx.save();
      ctx.translate(0, 0);
      ctx.rotate(p.lean * 0.35);
      const bg = ctx.createLinearGradient(-12, hipY, 14, hipY - 40);
      bg.addColorStop(0, pal.cloth2); bg.addColorStop(0.55, pal.cloth); bg.addColorStop(1, '#4a4c55');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(-10, hipY + 2);
      ctx.quadraticCurveTo(-14, hipY - 18, -13, shoulderY + 4);
      ctx.quadraticCurveTo(-6, shoulderY - 5, 4, shoulderY - 3);
      ctx.quadraticCurveTo(13, shoulderY - 1, 14, shoulderY + 10);
      ctx.quadraticCurveTo(13, hipY - 14, 9, hipY + 2);
      ctx.quadraticCurveTo(0, hipY + 7, -10, hipY + 2);
      ctx.closePath();
      ctx.fill();
      // exposed ribs
      ctx.strokeStyle = pal.bone2; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const y = hipY - 8 - i * 8;
        ctx.beginPath();
        ctx.moveTo(-9, y + 2);
        ctx.quadraticCurveTo(4, y - 2, 11, y + 1);
        ctx.stroke();
      }
      // spine ridge
      ctx.strokeStyle = pal.bone; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = hipY - 4 - i * 7;
        ctx.moveTo(-12, y); ctx.lineTo(-15, y - 2);
      }
      ctx.stroke();
      // shoulder wrap
      ctx.fillStyle = pal.cloth2;
      ctx.beginPath();
      ctx.moveTo(-13, shoulderY + 6); ctx.lineTo(12, shoulderY + 2);
      ctx.lineTo(13, shoulderY + 10); ctx.lineTo(-12, shoulderY + 14);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // ---- head ----
      if (!e.limbs.head.broken) {
        ctx.save();
        ctx.translate(4 + p.lean * 6, neckY + 2);
        ctx.rotate(p.lean * 0.5 + p.head * 0.6);
        // neck
        ctx.strokeStyle = '#6d6255'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-2, -2); ctx.stroke();
        // skull
        ctx.fillStyle = pal.bone;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.quadraticCurveTo(-10, -12, -2, -16);
        ctx.quadraticCurveTo(8, -18, 12, -9);
        ctx.quadraticCurveTo(15, -2, 9, 3);
        ctx.quadraticCurveTo(2, 8, -8, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,44,34,0.5)'; ctx.lineWidth = 1;
        ctx.stroke();
        // jaw
        ctx.fillStyle = pal.bone2;
        ctx.beginPath();
        ctx.moveTo(1, 2); ctx.lineTo(11, 0); ctx.lineTo(9, 6); ctx.lineTo(0, 6);
        ctx.closePath(); ctx.fill();
        // teeth
        ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(2 + i * 2.4, 2); ctx.lineTo(2 + i * 2.4, 5.5); ctx.stroke(); }
        // eye sockets + glow
        const tellK = e.state === 'tell' || e.state === 'attack' ? 1 : 0;
        const glow = 0.5 + 0.5 * Math.sin(t * 5 + e.id) + tellK * 0.8;
        ctx.fillStyle = '#1a1310';
        ctx.beginPath(); ctx.ellipse(5.5, -7, 4, 3.2, 0.1, 0, TAU); ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const eg = ctx.createRadialGradient(5.5, -7, 0, 5.5, -7, 12 + tellK * 8);
        eg.addColorStop(0, `rgba(255,${120 - tellK * 50},${60 - tellK * 30},${0.5 + tellK * 0.45})`);
        eg.addColorStop(1, 'rgba(255,60,30,0)');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(5.5, -7, 12 + tellK * 8, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.fillStyle = tellK ? '#ffd08a' : pal.glow;
        ctx.beginPath(); ctx.ellipse(5.5, -7, 2.2, 1.7, 0, 0, TAU); ctx.fill();
        // horn
        ctx.strokeStyle = pal.bone2; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-3, -13); ctx.quadraticCurveTo(-8, -22, -2, -26); ctx.stroke();
        ctx.restore();
      } else {
        drawStump(ctx, 2, neckY + 4, 6, pal.glow, 'rgba(255,110,60,0.4)');
      }

      // ---- front arm (right) with sword ----
      const shX = 6, shY = shoulderY + 4;
      if (!e.limbs.armR.broken) {
        const a1 = p.armR, a2 = p.elbowR;
        const u = 20, l = 19;
        const ex = shX + Math.cos(a1) * u, ey = shY + Math.sin(a1) * u;
        const handA = a1 + a2;
        const hx = ex + Math.cos(handA) * l, hy = ey + Math.sin(handA) * l;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.strokeStyle = pal.bone; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = pal.bone2; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
        // shoulder armor
        ctx.fillStyle = pal.metal;
        ctx.beginPath(); ctx.ellipse(shX - 1, shY - 1, 7.5, 6.5, 0.2, 0, TAU); ctx.fill();
        // jagged blade
        drawRustedBlade(ctx, hx, hy, handA + 0.25, 56, pal, e.state === 'tell' && e.attack);
      } else {
        drawStump(ctx, shX, shY, 6, pal.glow, 'rgba(255,110,60,0.4)');
      }
      ctx.restore();
    }
  },

  /* ============================ STALKER ============================ */
  stalker: {
    limbAnchor(id, e) {
      const h = e.h;
      switch (id) {
        case 'head': return { x: 8, y: -h * 0.86 };
        case 'armR': return { x: 12, y: -h * 0.66 };
        case 'armL': return { x: -10, y: -h * 0.66 };
        case 'legL': return { x: -7, y: -h * 0.34 };
        case 'legR': return { x: 7, y: -h * 0.34 };
      }
      return { x: 0, y: -h * 0.5 };
    },
    debrisColor(id) { return id === 'head' ? '#b9d4dd' : '#8fb2c0'; },
    draw(ctx, e) {
      const p = e.pose, h = e.h, sc = e.scale;
      const pal = e.cfg.palette;
      const t = e.animT;
      enemyLightPool(ctx, e, 58);
      ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(e.x, WORLD.ground + 1, 24 * sc, 6 * sc, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y - e.yOff);
      ctx.scale(e.facing * sc * CHAR_SCALE, sc * CHAR_SCALE);
      if (e.state === 'tell' && e.attack) drawTelegraph(ctx, e, e.attack.reach, 1, e.stateT / e.attack.tell);

      const crouch = p.crouch;
      const hipY = -h * 0.46 + crouch * 0.5;
      const shoulderY = -h * 0.72 + crouch * 0.5;
      const neckY = -h * 0.82 + crouch * 0.6;

      // back leg
      if (!e.limbs.legL.broken) {
        limbStroke(ctx, 0, hipY, Math.PI / 2 + p.legB + 0.75, 24, p.kneeB - 0.35, 25, 6, 4.5, '#41566a', pal.cloth2);
        // digitigrade foot claw
        const fx = 0 + Math.cos(Math.PI / 2 + p.legB + 0.75) * 24 + Math.cos(Math.PI / 2 + p.legB + 0.75 + p.kneeB - 0.35) * 25;
        const fy = hipY + Math.sin(Math.PI / 2 + p.legB + 0.75) * 24 + Math.sin(Math.PI / 2 + p.legB + 0.75 + p.kneeB - 0.35) * 25;
        ctx.strokeStyle = pal.bone2; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(fx, fy);
          ctx.lineTo(fx + 9 + i * 2, fy - 2 + i * 1.4); ctx.stroke();
        }
      } else drawStump(ctx, 0, hipY, 4.5, pal.glow, 'rgba(90,220,255,0.35)');

      // long ragged scarf / tail
      ctx.save();
      ctx.translate(-4, hipY - 8);
      ctx.strokeStyle = pal.cloth; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 1; i <= 4; i++) {
        const k = i / 4;
        ctx.lineTo(-k * 34 - Math.sin(t * 6 - i) * 4, k * 10 + Math.sin(t * 5 + i) * 5 + k * k * 8);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(111,224,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();

      // back arm dual blade
      if (!e.limbs.armL.broken) {
        const b = limbStroke(ctx, -2, shoulderY + 2, Math.PI / 2 + p.armL, 19, p.elbowL, 18, 5.5, 4.5, '#3a5364', pal.cloth2);
        drawTwinBlade(ctx, b.x2, b.y2, Math.PI / 2 + p.armL + p.elbowL + 0.3, 32, pal, false);
      } else drawStump(ctx, -2, shoulderY + 2, 4, pal.glow, 'rgba(90,220,255,0.4)');

      // torso: lean, ribbed carapace, glowing seams
      ctx.save();
      ctx.translate(0, 0);
      ctx.rotate(p.lean * 0.3 + p.spine * 0.4);
      const bg = ctx.createLinearGradient(-10, hipY, 12, shoulderY);
      bg.addColorStop(0, pal.cloth2); bg.addColorStop(0.6, pal.cloth); bg.addColorStop(1, '#455a68');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(-9, hipY + 2);
      ctx.quadraticCurveTo(-13, hipY - 14, -11, shoulderY + 2);
      ctx.quadraticCurveTo(0, shoulderY - 6, 11, shoulderY + 6);
      ctx.quadraticCurveTo(12, hipY - 12, 8, hipY + 2);
      ctx.quadraticCurveTo(0, hipY + 6, -9, hipY + 2);
      ctx.closePath(); ctx.fill();
      // glowing seams
      ctx.strokeStyle = `rgba(111,224,255,${0.5 + 0.3 * Math.sin(t * 4)})`;
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-6 + i * 5, hipY - 4 - i * 6);
        ctx.lineTo(-2 + i * 5, hipY - 9 - i * 6);
        ctx.stroke();
      }
      ctx.restore();

      // head: low, insectile, long crest
      if (!e.limbs.head.broken) {
        ctx.save();
        ctx.translate(7 + p.lean * 8, neckY);
        ctx.rotate(p.lean * 0.5 + p.spine * 0.4);
        ctx.fillStyle = pal.cloth2;
        ctx.beginPath();
        ctx.moveTo(-7, 2);
        ctx.quadraticCurveTo(-6, -13, 4, -14);
        ctx.quadraticCurveTo(15, -13, 16, -4);
        ctx.quadraticCurveTo(16, 3, 7, 5);
        ctx.quadraticCurveTo(-2, 6, -7, 2);
        ctx.closePath(); ctx.fill();
        // faceplate
        ctx.fillStyle = pal.bone2;
        ctx.beginPath();
        ctx.moveTo(2, -10); ctx.lineTo(17, -6); ctx.lineTo(15, 1); ctx.lineTo(3, 2);
        ctx.closePath(); ctx.fill();
        // single wide eye
        const tellK = (e.state === 'tell' || e.state === 'attack') ? 1 : 0;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const eg = ctx.createRadialGradient(9, -4, 0, 9, -4, 16 + tellK * 10);
        eg.addColorStop(0, `rgba(140,240,255,${0.7 + tellK * 0.3})`);
        eg.addColorStop(1, 'rgba(60,200,255,0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(9, -4, 16 + tellK * 10, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.fillStyle = tellK ? '#dffaff' : pal.glow;
        ctx.beginPath(); ctx.ellipse(9, -4, 4.5, 2.2, -0.12, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0a1418';
        ctx.beginPath(); ctx.ellipse(10, -4, 1.1, 2, 0, 0, TAU); ctx.fill();
        // crest spines
        ctx.strokeStyle = pal.bone2; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(-2 - i * 2.5, -11 + i * 1.5);
          ctx.lineTo(-9 - i * 4, -19 + i * 3); ctx.stroke();
        }
        // mandibles
        ctx.strokeStyle = pal.bone; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.quadraticCurveTo(20, 2, 21, 6); ctx.stroke();
        ctx.restore();
      } else drawStump(ctx, 5, neckY + 4, 5.5, pal.glow, 'rgba(90,220,255,0.4)');

      // front leg
      if (!e.limbs.legR.broken) {
        limbStroke(ctx, 1, hipY, Math.PI / 2 + p.legF - 0.55, 24, p.kneeF - 0.3, 25, 6.5, 5, '#4b6b7d', pal.cloth2);
        const fx = 1 + Math.cos(Math.PI / 2 + p.legF - 0.55) * 24 + Math.cos(Math.PI / 2 + p.legF - 0.55 + p.kneeF - 0.3) * 25;
        const fy = hipY + Math.sin(Math.PI / 2 + p.legF - 0.55) * 24 + Math.sin(Math.PI / 2 + p.legF - 0.55 + p.kneeF - 0.3) * 25;
        ctx.strokeStyle = pal.bone; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 10 + i * 2, fy - 1 + i * 1.6); ctx.stroke();
        }
      } else drawStump(ctx, 1, hipY, 4.5, pal.glow, 'rgba(90,220,255,0.4)');

      // front arm
      if (!e.limbs.armR.broken) {
        const a1 = p.armR, a2 = p.elbowR;
        const u = 19, l = 18;
        const ex = 4 + Math.cos(a1) * u, ey = shoulderY + 2 + Math.sin(a1) * u;
        const hx = ex + Math.cos(a1 + a2) * l, hy = ey + Math.sin(a1 + a2) * l;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 8.5;
        ctx.beginPath(); ctx.moveTo(4, shoulderY + 2); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.strokeStyle = pal.cloth; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(4, shoulderY + 2); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = pal.bone2; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
        drawTwinBlade(ctx, hx, hy, a1 + a2 + 0.35, 36, pal, e.state === 'tell' && e.attack);
      } else drawStump(ctx, 4, shoulderY + 2, 5, pal.glow, 'rgba(90,220,255,0.4)');
      ctx.restore();
    }
  },

  /* ============================ WARDEN ============================ */
  warden: {
    limbAnchor(id, e) {
      const h = e.h;
      switch (id) {
        case 'head': return { x: 6, y: -h * 0.88 };
        case 'armR': return { x: 18, y: -h * 0.66 };
        case 'armL': return { x: -16, y: -h * 0.66 };
        case 'legL': return { x: -10, y: -h * 0.32 };
        case 'legR': return { x: 10, y: -h * 0.32 };
      }
      return { x: 0, y: -h * 0.5 };
    },
    debrisColor() { return '#7b838f'; },
    draw(ctx, e) {
      const p = e.pose, h = e.h, sc = e.scale;
      const pal = e.cfg.palette;
      const t = e.animT;
      enemyLightPool(ctx, e, 84);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(e.x, WORLD.ground + 1, 38 * sc, 8 * sc, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y - e.yOff);
      ctx.scale(e.facing * sc * CHAR_SCALE, sc * CHAR_SCALE);
      if (e.state === 'tell' && e.attack) drawTelegraph(ctx, e, e.attack.reach * 0.9, 1, e.stateT / e.attack.tell);

      const hipY = -h * 0.44 + p.crouch * 0.4;
      const shoulderY = -h * 0.72;
      const neckY = -h * 0.82 + p.crouch * 0.3;
      const brokenArms = (e.limbs.armR.broken ? 1 : 0) + (e.limbs.armL.broken ? 1 : 0);

      // back leg
      if (!e.limbs.legL.broken) {
        limbStroke(ctx, -2, hipY, Math.PI / 2 + p.legB, 26, p.kneeB - 0.15, 26, 12, 10, '#4a4e58', pal.cloth2);
        const fx = -2 + Math.cos(Math.PI / 2 + p.legB) * 26 + Math.cos(Math.PI / 2 + p.legB + p.kneeB - 0.15) * 26;
        const fy = hipY + Math.sin(Math.PI / 2 + p.legB) * 26 + Math.sin(Math.PI / 2 + p.legB + p.kneeB - 0.15) * 26;
        drawArmoredBoot(ctx, fx, fy, pal);
      } else drawStump(ctx, -2, hipY + 2, 8, pal.glow, 'rgba(255,190,100,0.4)');

      // back arm
      if (!e.limbs.armL.broken) {
        const b = limbStroke(ctx, -6, shoulderY + 4, Math.PI / 2 + p.armL, 24, p.elbowL, 23, 10, 9, '#545a66', pal.cloth2);
        drawGauntlet(ctx, b.x2, b.y2, pal);
      } else drawStump(ctx, -6, shoulderY + 4, 8, pal.glow, 'rgba(255,190,100,0.4)');

      // tattered cape
      ctx.save();
      ctx.translate(-8, shoulderY + 4);
      const cape = ctx.createLinearGradient(0, 0, -20, 60);
      cape.addColorStop(0, '#36323a'); cape.addColorStop(1, '#1a181e');
      ctx.fillStyle = cape;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-26 - Math.sin(t * 2) * 3, 30, -24 + Math.sin(t * 2.5) * 4, 64);
      ctx.lineTo(-8 + Math.sin(t * 3) * 3, 72);
      ctx.quadraticCurveTo(-2, 40, 4, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // massive torso
      ctx.save();
      ctx.rotate(p.lean * 0.22);
      const bg = ctx.createLinearGradient(-18, hipY, 20, shoulderY);
      bg.addColorStop(0, pal.cloth2); bg.addColorStop(0.5, pal.cloth); bg.addColorStop(1, '#5a606c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(-14, hipY + 4);
      ctx.quadraticCurveTo(-20, hipY - 22, -18, shoulderY + 6);
      ctx.quadraticCurveTo(-8, shoulderY - 10, 6, shoulderY - 6);
      ctx.quadraticCurveTo(20, shoulderY - 2, 20, shoulderY + 12);
      ctx.quadraticCurveTo(18, hipY - 16, 13, hipY + 4);
      ctx.quadraticCurveTo(0, hipY + 10, -14, hipY + 4);
      ctx.closePath(); ctx.fill();
      // chest plate
      ctx.fillStyle = pal.metal;
      ctx.beginPath();
      ctx.moveTo(-12, shoulderY + 8);
      ctx.quadraticCurveTo(0, shoulderY - 2, 16, shoulderY + 10);
      ctx.lineTo(14, hipY - 20);
      ctx.quadraticCurveTo(0, hipY - 26, -10, hipY - 18);
      ctx.closePath();
      ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      // chest rune slit glowing
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(2, hipY - 26, 0, 2, hipY - 26, 26);
      gg.addColorStop(0, `rgba(255,190,110,${0.5 + 0.2 * Math.sin(t * 3)})`);
      gg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(2, hipY - 26, 26, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ffc46a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, hipY - 16); ctx.lineTo(4, hipY - 24); ctx.lineTo(0, hipY - 32); ctx.stroke();
      // belt chains
      ctx.strokeStyle = '#6a6258'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-14, hipY - 2); ctx.quadraticCurveTo(0, hipY + 6, 14, hipY - 2); ctx.stroke();
      ctx.restore();

      // head: bell helm
      if (!e.limbs.head.broken) {
        ctx.save();
        ctx.translate(4 + p.lean * 8, neckY + 2);
        ctx.rotate(p.lean * 0.4 + p.head * 0.5);
        ctx.fillStyle = '#5a606c';
        ctx.beginPath();
        ctx.moveTo(-12, 6);
        ctx.quadraticCurveTo(-14, -14, 0, -20);
        ctx.quadraticCurveTo(14, -14, 12, 6);
        ctx.quadraticCurveTo(0, 12, -12, 6);
        ctx.closePath(); ctx.fill();
        // bell rim
        ctx.fillStyle = pal.metal;
        ctx.beginPath();
        ctx.moveTo(-14, 4); ctx.quadraticCurveTo(0, 14, 14, 3);
        ctx.lineTo(14, -2); ctx.quadraticCurveTo(0, 8, -14, -2);
        ctx.closePath(); ctx.fill();
        // visor slit
        ctx.fillStyle = '#120f0c';
        ctx.fillRect(-9, -9, 20, 4.5);
        const tellK = (e.state === 'tell' || e.state === 'attack') ? 1 : 0;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const eg = ctx.createRadialGradient(2, -7, 0, 2, -7, 20 + tellK * 12);
        eg.addColorStop(0, `rgba(255,${190 - tellK * 60},${110 - tellK * 50},${0.5 + tellK * 0.5})`);
        eg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(2, -7, 20 + tellK * 12, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.fillStyle = tellK ? '#ffe0b0' : '#ffb45c';
        ctx.fillRect(-6, -8, 14, 2.5);
        // horns
        ctx.strokeStyle = '#8a7a62'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-10, -14); ctx.quadraticCurveTo(-22, -22, -18, -34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, -16); ctx.quadraticCurveTo(18, -24, 15, -34); ctx.stroke();
        ctx.restore();
      } else drawStump(ctx, 4, neckY + 6, 10, pal.glow, 'rgba(255,190,100,0.4)');

      // front leg
      if (!e.limbs.legR.broken) {
        limbStroke(ctx, 2, hipY, Math.PI / 2 + p.legF, 26, p.kneeF - 0.15, 26, 13, 11, '#555b66', pal.cloth2);
        const fx = 2 + Math.cos(Math.PI / 2 + p.legF) * 26 + Math.cos(Math.PI / 2 + p.legF + p.kneeF - 0.15) * 26;
        const fy = hipY + Math.sin(Math.PI / 2 + p.legF) * 26 + Math.sin(Math.PI / 2 + p.legF + p.kneeF - 0.15) * 26;
        drawArmoredBoot(ctx, fx, fy, pal);
      } else drawStump(ctx, 2, hipY + 2, 8, pal.glow, 'rgba(255,190,100,0.4)');

      // front arm + giant cleaver
      const shX = 12, shY = shoulderY + 4;
      if (!e.limbs.armR.broken) {
        const a1 = p.armR, a2 = p.elbowR;
        const u = 25, l = 24;
        const ex = shX + Math.cos(a1) * u, ey = shY + Math.sin(a1) * u;
        const hx = ex + Math.cos(a1 + a2) * l, hy = ey + Math.sin(a1 + a2) * l;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 15;
        ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.strokeStyle = '#5a606c'; ctx.lineWidth = 11;
        ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#6a707c'; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
        // pauldron
        ctx.fillStyle = pal.metal;
        ctx.beginPath();
        ctx.moveTo(shX - 12, shY - 4);
        ctx.quadraticCurveTo(shX, shY - 18, shX + 12, shY - 4);
        ctx.lineTo(shX + 7, shY + 8);
        ctx.quadraticCurveTo(shX, shY + 12, shX - 7, shY + 8);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#4a4436'; ctx.lineWidth = 1.5; ctx.stroke();
        drawGauntlet(ctx, hx, hy, pal);
        drawGreatCleaver(ctx, hx, hy, a1 + a2 + 0.3, 66, e.state === 'tell' && e.attack, pal, brokenArms === 2);
      } else drawStump(ctx, shX, shY, 9, pal.glow, 'rgba(255,190,100,0.4)');

      // armor crack decals as damage accumulates
      if (e.hp < e.maxHp * 0.5) {
        ctx.strokeStyle = 'rgba(10,10,14,0.6)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-8, hipY - 30); ctx.lineTo(-3, hipY - 42); ctx.lineTo(-7, hipY - 52); ctx.stroke();
      }
      ctx.restore();
    }
  }
};

function drawArmoredBoot(ctx, x, y, pal) {
  ctx.fillStyle = '#3a3e48';
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 2);
  ctx.lineTo(x - 10, y - 14);
  ctx.lineTo(x + 8, y - 14);
  ctx.lineTo(x + 10, y + 2);
  ctx.lineTo(x + 15, y + 3);
  ctx.lineTo(x + 15, y + 7);
  ctx.lineTo(x - 10, y + 7);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#6d7583'; ctx.lineWidth = 1.2; ctx.stroke();
}

function drawGauntlet(ctx, x, y, pal) {
  ctx.fillStyle = '#5a616e';
  ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8d939f'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#2e323a';
  ctx.beginPath(); ctx.arc(x + 1, y + 1, 3.4, 0, TAU); ctx.fill();
}

function drawRustedBlade(ctx, hx, hy, ang, len, pal, hot) {
  const x1 = hx + Math.cos(ang) * 6, y1 = hy + Math.sin(ang) * 6;
  const x2 = hx + Math.cos(ang) * len, y2 = hy + Math.sin(ang) * len;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2f2a26'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(hx - Math.cos(ang) * 8, hy - Math.sin(ang) * 8); ctx.lineTo(hx, hy); ctx.stroke();
  // jagged blade
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
  ctx.lineTo(x1 + nx * 3.5, y1 + ny * 3.5);
  ctx.lineTo(x2 + nx * 2 + Math.cos(ang) * 2, y2 + ny * 2);
  ctx.lineTo(x2 + Math.cos(ang) * 5, y2 + Math.sin(ang) * 5);
  ctx.lineTo(x1 - nx * 2, y1 - ny * 2);
  ctx.closePath();
  ctx.fillStyle = '#7a7266';
  ctx.fill();
  ctx.strokeStyle = hot ? '#ffb070' : '#a49a88'; ctx.lineWidth = 1.2; ctx.stroke();
  if (hot) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,150,80,0.5)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
}

function drawTwinBlade(ctx, hx, hy, ang, len, pal, hot) {
  for (const s of [-1, 1]) {
    const a = ang + s * 0.13;
    const x1 = hx + Math.cos(a) * 4, y1 = hy + Math.sin(a) * 4;
    const x2 = hx + Math.cos(a) * len, y2 = hy + Math.sin(a) * len;
    ctx.strokeStyle = '#233038'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - Math.cos(a) * 5, hy - Math.sin(a) * 5); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = hot ? '#d8fbff' : '#9fd4e2';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(110,220,255,${hot ? 0.55 : 0.22})`; ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
}

function drawGreatCleaver(ctx, hx, hy, ang, len, hot, pal, unarmed) {
  const x1 = hx + Math.cos(ang) * 8, y1 = hy + Math.sin(ang) * 8;
  const x2 = hx + Math.cos(ang) * len, y2 = hy + Math.sin(ang) * len;
  const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
  // haft
  ctx.strokeStyle = '#3a3028'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx - Math.cos(ang) * 16, hy - Math.sin(ang) * 16);
  ctx.lineTo(hx + Math.cos(ang) * 14, hy + Math.sin(ang) * 14); ctx.stroke();
  // huge cleaver head
  ctx.beginPath();
  ctx.moveTo(x1 + nx * 4, y1 + ny * 4);
  ctx.quadraticCurveTo((x1 + x2) / 2 + nx * (unarmed ? 12 : 17), (y1 + y2) / 2 + ny * (unarmed ? 12 : 17), x2 + nx * 6 + Math.cos(ang) * 4, y2 + ny * 6);
  ctx.quadraticCurveTo(x2 + Math.cos(ang) * 14, y2 + Math.sin(ang) * 14, x2 - nx * 5, y2 - ny * 5);
  ctx.lineTo(x1 - nx * 6, y1 - ny * 6);
  ctx.closePath();
  const gg = ctx.createLinearGradient(x1 - nx * 6, y1 - ny * 6, x1 + nx * 16, y1 + ny * 16);
  gg.addColorStop(0, '#8b929e'); gg.addColorStop(1, '#4c515b');
  ctx.fillStyle = gg; ctx.fill();
  ctx.strokeStyle = hot ? '#ffcf8a' : '#9aa1ad'; ctx.lineWidth = 1.4; ctx.stroke();
  // glowing edge
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hot ? 'rgba(255,180,90,0.9)' : 'rgba(255,180,90,0.28)';
  ctx.lineWidth = hot ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * 4, y1 + ny * 4);
  ctx.quadraticCurveTo((x1 + x2) / 2 + nx * 17, (y1 + y2) / 2 + ny * 17, x2 + nx * 6 + Math.cos(ang) * 4, y2 + ny * 6);
  ctx.stroke();
  ctx.restore();
  // rivets
  ctx.fillStyle = '#2c3038';
  ctx.beginPath(); ctx.arc((x1 + x2) / 2 - nx * 2, (y1 + y2) / 2 - ny * 2, 2, 0, TAU); ctx.fill();
}
