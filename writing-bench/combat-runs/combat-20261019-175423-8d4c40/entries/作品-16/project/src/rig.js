// ---- skeletal rig: FK, procedural poses, character rendering ----
'use strict';

function capsule(ctx, x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function jointBall(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

// FK: pose angles in canvas radians. f = facing (+1 right, -1 left)
function computeSkeleton(p, dims, f, px, py) {
  const ta = -Math.PI / 2 + (p.lean || 0); // torso dir (up-ish)
  const dx = Math.cos(ta), dy = Math.sin(ta);
  const pxp = Math.cos(ta + Math.PI / 2), pyp = Math.sin(ta + Math.PI / 2);
  const pelvis = { x: px, y: py };
  const chest = { x: px + dx * dims.torsoLen, y: py + dy * dims.torsoLen };
  const head = {
    x: chest.x + dx * (dims.headR + 3) - Math.sin(p.headTilt || 0) * 2,
    y: chest.y + dy * (dims.headR + 3),
  };
  const shL = { x: chest.x + pxp * dims.shoulderW * 0.5, y: chest.y + pyp * dims.shoulderW * 0.5 };
  const shR = { x: chest.x - pxp * dims.shoulderW * 0.5, y: chest.y - pyp * dims.shoulderW * 0.5 };
  const hipL = { x: pelvis.x + pxp * dims.hipW * 0.5, y: pelvis.y + pyp * dims.hipW * 0.5 };
  const hipR = { x: pelvis.x - pxp * dims.hipW * 0.5, y: pelvis.y - pyp * dims.hipW * 0.5 };
  const mkArm = (sh, a, b) => {
    const el = { x: sh.x + Math.cos(a) * dims.upperArm, y: sh.y + Math.sin(a) * dims.upperArm };
    const ha = { x: el.x + Math.cos(a + b * f) * dims.foreArm, y: el.y + Math.sin(a + b * f) * dims.foreArm };
    return { sh, el, ha };
  };
  const mkLeg = (hip, a, b) => {
    const kn = { x: hip.x + Math.cos(a) * dims.upperLeg, y: hip.y + Math.sin(a) * dims.upperLeg };
    const ft = { x: kn.x + Math.cos(a + b) * dims.lowerLeg, y: kn.y + Math.sin(a + b) * dims.lowerLeg };
    return { hip, kn, ft };
  };
  const armL = mkArm(shL, p.armL.a, p.armL.b);
  const armR = mkArm(shR, p.armR.a, p.armR.b);
  const legL = mkLeg(hipL, p.legL.a, p.legL.b);
  const legR = mkLeg(hipR, p.legR.a, p.legR.b);
  // blade from right hand
  const bl = p.blade || { a: armR.a, len: 46, on: true };
  const bladeBase = { x: armR.ha.x, y: armR.ha.y };
  const bladeTip = { x: bladeBase.x + Math.cos(bl.a) * bl.len, y: bladeBase.y + Math.sin(bl.a) * bl.len };
  return {
    pelvis, chest, head, shL, shR, hipL, hipR, armL, armR, legL, legR,
    ta, f, bladeBase, bladeTip, bladeOn: bl.on, bladeLen: bl.len,
    blade: { a: bl.a, len: bl.len, on: bl.on },
  };
}

function basePose() {
  return {
    crouch: 0, lean: 0, headTilt: 0,
    armL: { a: Math.PI / 2 + 0.25, b: 0.3 },
    armR: { a: Math.PI / 2 - 0.15, b: 0.25 },
    legL: { a: Math.PI / 2, b: 0 },
    legR: { a: Math.PI / 2, b: 0 },
    blade: { a: Math.PI / 2, len: 46, on: true },
  };
}
function lerpPose(a, b, t) {
  const o = basePose();
  o.crouch = lerp(a.crouch, b.crouch, t);
  o.lean = lerp(a.lean, b.lean, t);
  o.headTilt = lerp(a.headTilt, b.headTilt, t);
  for (const k of ['armL', 'armR', 'legL', 'legR']) {
    o[k].a = angleLerp(a[k].a, b[k].a, t);
    o[k].b = angleLerp(a[k].b, b[k].b, t);
  }
  o.blade.a = angleLerp(a.blade.a, b.blade.a, t);
  o.blade.len = lerp(a.blade.len, b.blade.len, t);
  o.blade.on = t < 0.5 ? a.blade.on : b.blade.on;
  return o;
}
// mirror a facing-right-space pose for left-facing (flip x: a -> PI - a)
function mirrorPose(p) {
  const o = basePose();
  o.crouch = p.crouch;
  o.lean = -p.lean;
  o.headTilt = -p.headTilt;
  for (const k of ['armL', 'armR', 'legL', 'legR']) {
    o[k].a = Math.PI - p[k].a;
    o[k].b = -p[k].b;
  }
  o.blade.a = Math.PI - p.blade.a;
  o.blade.len = p.blade.len;
  o.blade.on = p.blade.on;
  return o;
}

// simple line-render of a skeleton snapshot (afterimages)
function drawSkeletonGhost(ctx, s, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(s.pelvis.x, s.pelvis.y); ctx.lineTo(s.chest.x, s.chest.y);
  ctx.moveTo(s.armL.sh.x, s.armL.sh.y); ctx.lineTo(s.armL.el.x, s.armL.el.y); ctx.lineTo(s.armL.ha.x, s.armL.ha.y);
  ctx.moveTo(s.armR.sh.x, s.armR.sh.y); ctx.lineTo(s.armR.el.x, s.armR.el.y); ctx.lineTo(s.armR.ha.x, s.armR.ha.y);
  ctx.moveTo(s.legL.hip.x, s.legL.hip.y); ctx.lineTo(s.legL.kn.x, s.legL.kn.y); ctx.lineTo(s.legL.ft.x, s.legL.ft.y);
  ctx.moveTo(s.legR.hip.x, s.legR.hip.y); ctx.lineTo(s.legR.kn.x, s.legR.kn.y); ctx.lineTo(s.legR.ft.x, s.legR.ft.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---------------- player rendering ----------------
function drawPlayer(ctx, pl, skel) {
  const flash = pl.flashT > 0;
  const body = flash ? '#ffffff' : '#1d2233';
  const cloth = flash ? '#ffffff' : '#c8352f';
  const trim = flash ? '#ffffff' : '#e8b64c';
  const skin = flash ? '#ffffff' : '#e8d5b5';
  // scarf (behind body): chain from neck backwards
  ctx.strokeStyle = flash ? '#fff' : '#b02a26';
  ctx.lineCap = 'round';
  for (let i = 0; i < pl.scarf.length - 1; i++) {
    const a = pl.scarf[i], b = pl.scarf[i + 1];
    ctx.lineWidth = 7 * (1 - i / pl.scarf.length) + 1.5;
    ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // legs
  capsule(ctx, skel.legL.hip.x, skel.legL.hip.y, skel.legL.kn.x, skel.legL.kn.y, 7, body);
  capsule(ctx, skel.legL.kn.x, skel.legL.kn.y, skel.legL.ft.x, skel.legL.ft.y, 6, body);
  capsule(ctx, skel.legR.hip.x, skel.legR.hip.y, skel.legR.kn.x, skel.legR.kn.y, 7, body);
  capsule(ctx, skel.legR.kn.x, skel.legR.kn.y, skel.legR.ft.x, skel.legR.ft.y, 6, body);
  // boots
  ctx.fillStyle = flash ? '#fff' : '#12141f';
  for (const ft of [skel.legL.ft, skel.legR.ft]) {
    ctx.beginPath();
    ctx.ellipse(ft.x + skel.f * 3, ft.y - 2, 6, 3.5, 0, 0, TAU);
    ctx.fill();
  }
  // torso (tapered quad)
  const c = skel.chest, pv = skel.pelvis, pp = { x: Math.cos(skel.ta + Math.PI / 2), y: Math.sin(skel.ta + Math.PI / 2) };
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(c.x + pp.x * 9, c.y + pp.y * 9);
  ctx.lineTo(c.x - pp.x * 9, c.y - pp.y * 9);
  ctx.lineTo(pv.x - pp.x * 6.5, pv.y - pp.y * 6.5);
  ctx.lineTo(pv.x + pp.x * 6.5, pv.y + pp.y * 6.5);
  ctx.closePath(); ctx.fill();
  // belt
  ctx.strokeStyle = trim; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pv.x + pp.x * 7, pv.y + pp.y * 7);
  ctx.lineTo(pv.x - pp.x * 7, pv.y - pp.y * 7);
  ctx.stroke();
  // left arm
  capsule(ctx, skel.armL.sh.x, skel.armL.sh.y, skel.armL.el.x, skel.armL.el.y, 6, body);
  capsule(ctx, skel.armL.el.x, skel.armL.el.y, skel.armL.ha.x, skel.armL.ha.y, 5, body);
  // head
  const hd = skel.head;
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(hd.x, hd.y, 8.5, 0, TAU); ctx.fill();
  // hair / band
  ctx.fillStyle = flash ? '#fff' : '#14161f';
  ctx.beginPath(); ctx.arc(hd.x - skel.f * 1.5, hd.y - 2.5, 8, Math.PI, TAU); ctx.fill();
  ctx.fillRect(hd.x - skel.f * 9, hd.y - 4.5, skel.f * 18, 3);
  // eye
  ctx.fillStyle = flash ? '#fff' : '#0c0e16';
  ctx.beginPath(); ctx.arc(hd.x + skel.f * 3.5, hd.y + 0.5, 1.4, 0, TAU); ctx.fill();
  // right arm + katana
  capsule(ctx, skel.armR.sh.x, skel.armR.sh.y, skel.armR.el.x, skel.armR.el.y, 6, body);
  capsule(ctx, skel.armR.el.x, skel.armR.el.y, skel.armR.ha.x, skel.armR.ha.y, 5, body);
  if (skel.bladeOn) {
    const b = skel.bladeBase, t = skel.bladeTip;
    // glow
    ctx.save();
    ctx.shadowColor = '#9fe8ff'; ctx.shadowBlur = pl.chargeGlow > 0 ? 18 + pl.chargeGlow * 22 : 10;
    const grad = ctx.createLinearGradient(b.x, b.y, t.x, t.y);
    if (pl.chargeGlow > 0) {
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.5, '#ffe9a8'); grad.addColorStop(1, '#ff9a3d');
    } else {
      grad.addColorStop(0, '#dff6ff'); grad.addColorStop(1, '#8be9ff');
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = pl.chargeGlow > 0 ? 4.5 : 3;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.restore();
    // hilt
    capsule(ctx, skel.armR.ha.x, skel.armR.ha.y, b.x, b.y, 3.5, '#3a2b1c');
  }
  // charge aura
  if (pl.chargeGlow > 0) {
    ctx.globalAlpha = pl.chargeGlow * 0.5;
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    const r = 20 + pl.chargeGlow * 26 + Math.sin(pl.animT * 30) * 3;
    ctx.beginPath(); ctx.arc(skel.chest.x, skel.chest.y, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ---------------- enemy rendering ----------------
function drawEnemy(ctx, e, skel) {
  const flash = e.flashT > 0;
  const armor = flash ? '#ffffff' : e.T.color.armor;
  const dark = flash ? '#dfe6ff' : e.T.color.dark;
  const glow = flash ? '#ffffff' : e.T.color.glow;
  const scale = e.scale || 1;
  const broken = e.broken;
  // legs (skip broken)
  const legDraw = (leg, isBroken) => {
    if (isBroken) {
      // torn stump
      capsule(ctx, leg.hip.x, leg.hip.y, leg.kn.x, leg.kn.y, 7 * scale, dark);
      ctx.strokeStyle = '#ff5f4a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(leg.kn.x, leg.kn.y);
      ctx.lineTo(leg.kn.x + rand(-4, 4), leg.kn.y + rand(2, 7)); ctx.stroke();
      return;
    }
    capsule(ctx, leg.hip.x, leg.hip.y, leg.kn.x, leg.kn.y, 7 * scale, armor);
    capsule(ctx, leg.kn.x, leg.kn.y, leg.ft.x, leg.ft.y, 6 * scale, dark);
    jointBall(ctx, leg.kn.x, leg.kn.y, 3 * scale, dark);
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(leg.ft.x + skel.f * 3 * scale, leg.ft.y - 2, 6 * scale, 3.5 * scale, 0, 0, TAU); ctx.fill();
  };
  legDraw(skel.legL, broken.legL);
  legDraw(skel.legR, broken.legR);
  // torso: mecha chest plate
  const c = skel.chest, pv = skel.pelvis;
  const pp = { x: Math.cos(skel.ta + Math.PI / 2), y: Math.sin(skel.ta + Math.PI / 2) };
  const w = 12 * scale;
  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.moveTo(c.x + pp.x * w, c.y + pp.y * w);
  ctx.lineTo(c.x - pp.x * w, c.y - pp.y * w);
  ctx.lineTo(pv.x - pp.x * w * 0.75, pv.y - pp.y * w * 0.75);
  ctx.lineTo(pv.x + pp.x * w * 0.75, pv.y + pp.y * w * 0.75);
  ctx.closePath(); ctx.fill();
  // chest core (glow, dims when staggered)
  ctx.save();
  ctx.shadowColor = glow; ctx.shadowBlur = 8;
  ctx.fillStyle = glow;
  ctx.globalAlpha = e.staggerT > 0 ? 0.9 : 0.55 + Math.sin(e.animT * 4) * 0.15;
  ctx.beginPath(); ctx.arc(c.x, c.y, 4.5 * scale, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  // cracks as damage accumulates
  if (e.dmgVis > 0.25 && !flash) {
    ctx.strokeStyle = 'rgba(10,10,16,0.8)';
    ctx.lineWidth = 1.3;
    const n = Math.floor(e.dmgVis * 4);
    for (let i = 0; i < n; i++) {
      const t0 = 0.2 + i * 0.2;
      const bx = lerp(pv.x, c.x, t0), by = lerp(pv.y, c.y, t0);
      ctx.beginPath();
      ctx.moveTo(bx + pp.x * w * 0.6, by + pp.y * w * 0.6);
      ctx.lineTo(bx, by + 4);
      ctx.lineTo(bx - pp.x * w * 0.5, by + 1);
      ctx.stroke();
    }
  }
  // head (skip if broken)
  if (!broken.head) {
    const hd = skel.head;
    ctx.fillStyle = armor;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(hd.x - 8 * scale, hd.y - 8 * scale, 16 * scale, 15 * scale, 3 * scale);
    else ctx.rect(hd.x - 8 * scale, hd.y - 8 * scale, 16 * scale, 15 * scale);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(hd.x - 8 * scale, hd.y - 9 * scale, 16 * scale, 3 * scale);
    // eye: flares during telegraph
    ctx.save();
    const tele = e.telegraphGlow || 0;
    ctx.shadowColor = tele > 0 ? '#ff3b30' : glow;
    ctx.shadowBlur = 6 + tele * 14;
    ctx.fillStyle = tele > 0 ? '#ff5148' : glow;
    ctx.beginPath(); ctx.arc(hd.x + skel.f * 3 * scale, hd.y - 1 * scale, (2.2 + tele * 2) * scale, 0, TAU); ctx.fill();
    ctx.restore();
  } else { // headless: exposed neck wires
    const hd = skel.head;
    ctx.strokeStyle = '#ff5f4a'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(skel.chest.x, skel.chest.y);
    ctx.lineTo(hd.x + Math.sin(e.animT * 9) * 4, hd.y - 6);
    ctx.moveTo(skel.chest.x, skel.chest.y);
    ctx.lineTo(hd.x - 3, hd.y - 8 + Math.cos(e.animT * 7) * 3);
    ctx.stroke();
  }
  // arms + weapons
  const armDraw = (arm, isBroken, isRight) => {
    if (isBroken) {
      capsule(ctx, arm.sh.x, arm.sh.y, arm.el.x, arm.el.y, 6 * scale, dark);
      ctx.strokeStyle = '#ff5f4a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(arm.el.x, arm.el.y);
      ctx.lineTo(arm.el.x + rand(-4, 4), arm.el.y + rand(2, 6)); ctx.stroke();
      return;
    }
    capsule(ctx, arm.sh.x, arm.sh.y, arm.el.x, arm.el.y, 6 * scale, armor);
    capsule(ctx, arm.el.x, arm.el.y, arm.ha.x, arm.ha.y, 5 * scale, dark);
    jointBall(ctx, arm.el.x, arm.el.y, 3 * scale, dark);
    // weapon from right hand
    if (isRight && e.weapon === 'blade') {
      const b = arm.ha;
      const a = skel.blade.a;
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = 6;
      ctx.strokeStyle = flash ? '#fff' : '#d9e2f2';
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(a) * 30 * scale, b.y + Math.sin(a) * 30 * scale);
      ctx.stroke();
      ctx.restore();
    }
    if (isRight && e.weapon === 'hammer' && e.hammerUp) {
      const b = arm.ha;
      const a = skel.blade.a;
      const hx = b.x + Math.cos(a) * 14 * scale, hy = b.y + Math.sin(a) * 14 * scale;
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(a);
      ctx.fillStyle = dark;
      ctx.fillRect(-6 * scale, -16 * scale, 12 * scale, 20 * scale);
      ctx.fillStyle = flash ? '#fff' : '#6d7890';
      ctx.fillRect(-14 * scale, -24 * scale, 28 * scale, 14 * scale);
      ctx.strokeStyle = 'rgba(255,90,60,0.7)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-14 * scale, -24 * scale, 28 * scale, 14 * scale);
      ctx.restore();
    }
    if (isRight && e.weapon === 'gun') {
      const b = arm.ha;
      const a = skel.blade.a;
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(a);
      ctx.fillStyle = dark;
      ctx.fillRect(-2 * scale, -5 * scale, 22 * scale, 10 * scale);
      ctx.fillStyle = glow;
      ctx.fillRect(16 * scale, -2.5 * scale, 5 * scale, 5 * scale);
      ctx.restore();
    }
  };
  armDraw(skel.armL, broken.armL, false);
  armDraw(skel.armR, broken.armR, true);
  // stagger stars
  if (e.staggerT > 0) {
    ctx.fillStyle = '#ffe9a8';
    for (let i = 0; i < 3; i++) {
      const a = e.animT * 6 + i * TAU / 3;
      ctx.beginPath();
      ctx.arc(skel.head.x + Math.cos(a) * 14, skel.head.y - 12 + Math.sin(a) * 5, 2, 0, TAU);
      ctx.fill();
    }
  }
  // self-destruct warning ring
  if (e.state === 'selfdestruct') {
    const t = 1 - e.stateT / e.sdDur;
    ctx.strokeStyle = `rgba(255,60,40,${0.4 + 0.5 * Math.sin(e.animT * 20)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(skel.chest.x, skel.chest.y, 18 + t * 26, 0, TAU); ctx.stroke();
  }
}
