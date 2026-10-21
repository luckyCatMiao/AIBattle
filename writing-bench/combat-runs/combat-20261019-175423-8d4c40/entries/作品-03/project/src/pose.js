(function (AV) {
  "use strict";
  const U = AV.util;
  const { lerp, TAU, clamp, rand } = U;
  const D2R = Math.PI / 180;

  // --------------------------------------------------------------------------
  // Skeleton: authored poses, absolute limb angles in screen space
  // (0deg = +x/forward, 90deg = +y/down). Facing is applied by the caller.
  // --------------------------------------------------------------------------
  const POSE_KEYS = [
    "hipX", "hipY", "lean", "head",
    "bSh", "bEl", "fSh", "fEl",
    "bTh", "bShin", "fTh", "fShin",
    "swAng", "swX", "swY", "twoHand", "crouch", "scarf",
  ];

  const DIMS = {
    player: { thigh: 33, shin: 34, up: 25, fore: 24, torso: 46, headR: 10.5, shoulderW: 13, hipW: 7.5 },
    blade: { thigh: 34, shin: 35, up: 27, fore: 28, torso: 50, headR: 11.5, shoulderW: 17, hipW: 9 },
    brute: { thigh: 37, shin: 34, up: 34, fore: 34, torso: 62, headR: 13, shoulderW: 27, hipW: 14 },
    stalker: { thigh: 36, shin: 37, up: 24, fore: 26, torso: 52, headR: 10, shoulderW: 12, hipW: 7 },
  };

  function basePose(over) {
    const p = {
      hipX: 0, hipY: -66, lean: 4, head: -2,
      bSh: 118, bEl: 150, fSh: 62, fEl: 72,
      bTh: 104, bShin: 84, fTh: 76, fShin: 88,
      swAng: 55, swX: 0, swY: 0, twoHand: 0, crouch: 0, scarf: 0,
    };
    return over ? Object.assign(p, over) : p;
  }

  function lerpPose(a, b, t) {
    const out = {};
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const k = POSE_KEYS[i];
      out[k] = lerp(a[k], b[k], t);
    }
    return out;
  }

  function makeSkel(pose, dims) {
    const hip = { x: pose.hipX, y: pose.hipY };
    const leanR = pose.lean * D2R;
    const neck = {
      x: hip.x + Math.sin(leanR) * dims.torso,
      y: hip.y - Math.cos(leanR) * dims.torso,
    };
    const headR = pose.head * D2R;
    const head = {
      x: neck.x + Math.sin(leanR + headR) * (dims.headR + 9),
      y: neck.y - Math.cos(leanR + headR) * (dims.headR + 9),
    };
    const sw = dims.shoulderW;
    const shF = { x: neck.x + Math.cos(leanR) * 2 - sw * 0.34, y: neck.y + 5 };
    const shB = { x: neck.x + Math.cos(leanR) * 2 + sw * 0.30, y: neck.y + 4 };
    const hipF = { x: hip.x + dims.hipW * 0.5, y: hip.y };
    const hipB = { x: hip.x - dims.hipW * 0.5, y: hip.y };

    const arm = (sh, up, lo) => {
      const u = up * D2R;
      const el = { x: sh.x + Math.cos(u) * dims.up, y: sh.y + Math.sin(u) * dims.up };
      const l = lo * D2R;
      const ha = { x: el.x + Math.cos(l) * dims.fore, y: el.y + Math.sin(l) * dims.fore };
      return { sh, el, hand: ha };
    };
    const leg = (hp, th, sh) => {
      const t = th * D2R;
      const kn = { x: hp.x + Math.cos(t) * dims.thigh, y: hp.y + Math.sin(t) * dims.thigh };
      const s = sh * D2R;
      const ft = { x: kn.x + Math.cos(s) * dims.shin, y: kn.y + Math.sin(s) * dims.shin };
      return { hip: hp, knee: kn, foot: ft };
    };

    const backArm = arm(shB, pose.bSh, pose.bEl);
    const frontArm = arm(shF, pose.fSh, pose.fEl);
    const weapon = {
      x: frontArm.hand.x + pose.swX,
      y: frontArm.hand.y + pose.swY,
      ang: pose.swAng,
    };
    return {
      hip, neck, head, shF, shB, backArm, frontArm, weapon,
      backLeg: leg(hipB, pose.bTh, pose.bShin),
      frontLeg: leg(hipF, pose.fTh, pose.fShin),
      leanR,
    };
  }

  function blendPoses(list, t) {
    // list of poses; t 0..1 across segments
    if (t <= 0) return list[0];
    const seg = Math.min(list.length - 1, Math.floor(t * (list.length - 1)));
    const local = t * (list.length - 1) - seg;
    return lerpPose(list[seg], list[Math.min(list.length - 1, seg + 1)], clamp(local, 0, 1));
  }

  // --------------------------------------------------------------------------
  // Drawing primitives
  // --------------------------------------------------------------------------
  const palette = {
    ink: "#0a0d12",
    outline: "#07080b",
    player: "#18202c",
    player2: "#232e3e",
    playerLight: "#3d5266",
    cloth: "#121b26",
    cloth2: "#0d141d",
    cyan: "#7cf3ff",
    cyanDeep: "#2ba9bd",
    ivory: "#e8dfc9",
    skinShadow: "#8f8574",
    bronze: "#5a4433",
    bronze2: "#3d2e22",
    bronzeHi: "#8f6a45",
    iron: "#31343a",
    iron2: "#202226",
    ember: "#ff7a2a",
    emberHot: "#ffe2ad",
  };

  function dir(a, len) {
    const r = a * D2R;
    return { x: Math.cos(r) * len, y: Math.sin(r) * len };
  }

  function mixColor(c1, c2, t) {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const a = p(c1), b = p(c2);
    return "rgb(" + Math.round(lerp(a[0], b[0], t)) + "," + Math.round(lerp(a[1], b[1], t)) + "," + Math.round(lerp(a[2], b[2], t)) + ")";
  }

  function taperedLimb(ctx, p0, p1, w0, w1, fill, outline, rim) {
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.beginPath();
    ctx.moveTo(p0.x + nx * w0, p0.y + ny * w0);
    ctx.lineTo(p1.x + nx * w1, p1.y + ny * w1);
    ctx.arc(p1.x, p1.y, w1, ang + Math.PI / 2, ang - Math.PI / 2, true);
    ctx.lineTo(p0.x - nx * w0, p0.y - ny * w0);
    ctx.arc(p0.x, p0.y, w0, ang - Math.PI / 2, ang + Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (rim) {
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x + nx * w0 * 1.02, p0.y + ny * w0 * 1.02);
      ctx.lineTo(p1.x + nx * w1 * 1.02, p1.y + ny * w1 * 1.02);
      ctx.stroke();
      ctx.restore();
    }
  }

  function joint(ctx, p, r, fill, outline) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.2; ctx.stroke(); }
  }

  // Curved katana in local space, pivot at hand. Blade points along +x.
  function drawKatana(ctx, x, y, angDeg, opts = {}) {
    const ang = angDeg * D2R;
    const glow = opts.glow == null ? 1 : opts.glow;
    const scale = opts.scale || 1;
    const bladeLen = 86 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    // handle
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 6.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-1, 0);
    ctx.stroke();
    ctx.strokeStyle = opts.wrap || "#3d2b1e";
    ctx.lineWidth = 2;
    for (let i = -18; i < -2; i += 5.5) {
      ctx.beginPath();
      ctx.moveTo(i, -3.2);
      ctx.lineTo(i + 3.4, 3.2);
      ctx.stroke();
    }
    // guard
    ctx.fillStyle = "#b98b4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2, 7.5, 0, 0, TAU);
    ctx.fill();

    // blade: gentle curve upward (−y)
    const tipX = bladeLen;
    const tipY = -bladeLen * 0.075;
    const c1x = bladeLen * 0.44, c1y = -bladeLen * 0.03;
    const c2x = bladeLen * 0.78, c2y = -bladeLen * 0.085;
    const grad = ctx.createLinearGradient(0, -4, 0, 6);
    grad.addColorStop(0, "#f2f5f3");
    grad.addColorStop(0.42, "#c3ced0");
    grad.addColorStop(0.5, "#8fa3a8");
    grad.addColorStop(0.55, opts.edge || "#bffaff");
    grad.addColorStop(1, "#3c4c55");
    ctx.beginPath();
    ctx.moveTo(2, -3.6);
    ctx.bezierCurveTo(c1x, c1y - 3.2, c2x, c2y - 2.6, tipX, tipY);
    ctx.bezierCurveTo(c2x + 2, c2y + 1.6, c1x + 3, c1y + 3.4, 2, 3.2);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(10,16,20,0.85)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // hamon / glowing edge
    if (glow > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = opts.edge || "rgba(150,247,255,0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(3, 1.5);
      ctx.bezierCurveTo(c1x, c1y + 2.8, c2x, c2y + 2.0, tipX, tipY + 0.6);
      ctx.stroke();
      ctx.globalAlpha = 0.22 * glow;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  AV.gfx = { palette, dir, taperedLimb, joint, drawKatana, makeSkel, basePose, lerpPose, blendPoses, DIMS, mixColor };
})(window.AV = window.AV || {});
