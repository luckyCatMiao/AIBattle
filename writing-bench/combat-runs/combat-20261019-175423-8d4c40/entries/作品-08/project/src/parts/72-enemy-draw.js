/* ============================================================
   Enemy rendering: segmented puppets, telegraphs, health pips
   ============================================================ */
function ec(e, color, extra = 0) {
  const f = clamp(e.flash * 1.25 + extra, 0, 1);
  if (f <= 0.02) return color;
  return mixHex(color, "#fff4e6", f * 0.72);
}

function drawEnemyShadows() {
  for (const e of game.enemies) {
    if (e.remove) continue;
    const alt = Math.max(0, GROUND_Y - e.y);
    const alpha = clamp(0.32 - alt * 0.0008, 0.05, 0.32) * (e.alive ? 1 : 0.5);
    drawShadowAt(e.x, GROUND_Y, clamp(25 * e.scale - alt * 0.02, 10, 30), alpha);
  }
}

function drawEnemies() {
  const dead = game.enemies.filter((e) => !e.alive).sort((a, b) => a.y - b.y);
  const alive = game.enemies.filter((e) => e.alive).sort((a, b) => a.y - b.y);
  for (const e of dead) drawEnemy(e);
  for (const e of alive) drawEnemy(e);
}

function drawEnemy(e) {
  if (!e.pose) e.pose = computeEnemyPose(e);
  const pose = e.pose;
  let alpha = 1;
  if (e.spawnT > 0) alpha = clamp(1 - e.spawnT / 0.55, 0, 1);
  if (!e.alive) {
    alpha = e.deathT < 0.9 ? 1 : clamp(1 - (e.deathT - 0.9) / 0.85, 0, 1);
    if (alpha <= 0.01) return;
  }
  if (e.invuln > 0 && e.spawnT <= 0 && e.alive) alpha *= 0.9;
  ctx.save();
  ctx.globalAlpha = alpha;

  // elite aura
  if (e.elite && e.alive) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, e.x, e.y - 34 * e.scale, 55 * e.scale, "#ffc95e", 0.09 + 0.03 * Math.sin(game.time * 3));
    ctx.restore();
  }

  ctx.translate(e.x, e.y);
  ctx.scale(e.facing, 1);

  const pal = e.palette;
  const s = e.scale;

  drawEnemyBackDecor(e, pose, pal, s);
  drawEnemyLeg(e, pose, "L", false, pal, s, alpha);
  drawEnemyArm(e, pose, "L", false, pal, s, alpha);
  drawEnemyTorso(e, pose, pal, s);
  drawEnemyHead(e, pose, pal, s);
  drawEnemyLeg(e, pose, "R", true, pal, s, alpha);
  drawEnemyArm(e, pose, "R", true, pal, s, alpha);
  drawEnemyWeapon(e, pose, pal, s);

  ctx.restore();

  // spawn glow
  if (e.spawnT > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const a = 0.2 + 0.25 * Math.sin(game.time * 30);
    glowCircle(ctx, e.x, e.y - 34 * e.scale, 50 * e.scale, e.palette.accent, a);
    ctx.restore();
  }
}

function drawEnemyBackDecor(e, pose, pal, s) {
  if (e.type === "axe") {
    // tattered back banner (sashimono)
    const sway = Math.sin(e.animTime * 2.1) * 2.5 * s;
    ctx.save();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-9 * s, pose.hip.y + 4);
    ctx.lineTo(-14 * s + sway, pose.hip.y - 64 * s);
    ctx.stroke();
    ctx.fillStyle = e.elite ? "#7c3426" : "#44231f";
    ctx.beginPath();
    ctx.moveTo(-13 * s + sway, pose.hip.y - 62 * s);
    ctx.lineTo(-1 * s + sway * 0.8, pose.hip.y - 58 * s);
    ctx.lineTo(-4 * s + sway * 0.6, pose.hip.y - 40 * s);
    ctx.lineTo(-15 * s + sway * 0.7, pose.hip.y - 44 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(pal.rope, 0.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // emblem
    ctx.globalAlpha *= 0.7;
    ctx.strokeStyle = e.elite ? "#ffd77e" : "#c5a887";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(-9 * s + sway, pose.hip.y - 53 * s, 3.2 * s, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9 * s + sway, pose.hip.y - 56 * s);
    ctx.lineTo(-9 * s + sway, pose.hip.y - 50 * s);
    ctx.stroke();
    ctx.restore();
  } else if (e.type === "bolt") {
    // quiver on the back
    ctx.save();
    ctx.translate(-9 * s, pose.chest.y + 14 * s);
    ctx.rotate(0.35);
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-3.5 * s, -8 * s, 7 * s, 22 * s);
    ctx.fillStyle = pal.wood;
    ctx.fillRect(-2.4 * s, -7 * s, 4.8 * s, 18 * s);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = "#b9b49a";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-1.8 * s + i * 1.8 * s, -8 * s);
      ctx.lineTo(-1.8 * s + i * 1.8 * s + 2 * s, -17 * s);
      ctx.stroke();
    }
    ctx.restore();
  } else if (e.type === "rend") {
    // whipping tail
    const t = e.animTime * 2.5;
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(-5 * s, pose.hip.y + 2);
    ctx.quadraticCurveTo(-24 * s, pose.hip.y + 8 + Math.sin(t) * 4, -34 * s, pose.hip.y - 6 + Math.sin(t * 1.3) * 7);
    ctx.stroke();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 0.7 * s;
    ctx.beginPath();
    ctx.moveTo(-31 * s, pose.hip.y - 4 + Math.sin(t * 1.3) * 7);
    ctx.lineTo(-40 * s, pose.hip.y - 9 + Math.sin(t * 1.3) * 8);
    ctx.stroke();
  }
}

function drawEnemyJoint(e, pt, r, pal, isCore = false) {
  circle(ctx, pt.x, pt.y, r + 0.7, ec(e, pal.dark));
  circle(ctx, pt.x, pt.y, r, ec(e, pal.wood));
  circle(ctx, pt.x, pt.y, r * 0.48, ec(e, pal.accent, 0.2));
  if (isCore) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, pt.x, pt.y, r * 2.4, pal.accent, 0.3);
    ctx.restore();
  }
}

function crackSegment(e, part, a, b) {
  if (!part || part.broken) return;
  const ratio = part.hp / part.maxHp;
  if (ratio > 0.55) return;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= ratio < 0.28 ? 0.85 : 0.55;
  ctx.strokeStyle = e.palette.accent;
  ctx.lineWidth = 0.8;
  const n = ratio < 0.28 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const t = 0.3 + i * 0.18;
    const px = lerp(a.x, b.x, t);
    const py = lerp(a.y, b.y, t);
    const off = (i % 2 === 0 ? 1 : -1) * (2 + i);
    ctx.beginPath();
    ctx.moveTo(px + nx * off, py + ny * off);
    ctx.lineTo(px + dx / len * 4 - nx * 2, py + dy / len * 4 - ny * 2);
    ctx.lineTo(px - dx / len * 3 + nx * 1.5, py - dy / len * 3 + ny * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStump(e, pt, size, pal, angle = 0) {
  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(angle);
  circle(ctx, 0, 0, size * 0.9, ec(e, pal.dark));
  circle(ctx, 0, 0, size * 0.62, ec(e, pal.wood));
  // jagged shards
  ctx.fillStyle = ec(e, pal.woodLight);
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.55);
  ctx.lineTo(size * 0.25, -size * 0.9);
  ctx.lineTo(size * 0.35, -size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-size * 0.4, size * 0.4);
  ctx.lineTo(-size * 0.1, size * 0.95);
  ctx.lineTo(size * 0.3, size * 0.5);
  ctx.closePath();
  ctx.fill();
  // exposed glowing core
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, 0, 0, size * 2.5, pal.accent, 0.35 + 0.12 * Math.sin(game.time * 9 + e.id));
  circle(ctx, 0, 0, size * 0.33, rgba("#fff4dd", 0.85));
  ctx.restore();
  ctx.restore();
}

function drawEnemyLeg(e, pose, side, front, pal, s, alpha) {
  const P = e.parts;
  const hip = side === "R" ? pose.hipR : pose.hipL;
  const knee = side === "R" ? pose.kneeR : pose.kneeL;
  const foot = side === "R" ? pose.footR : pose.footL;
  const upId = side === "R" ? "legR0" : "legL0";
  const lowId = side === "R" ? "legR1" : "legL1";
  const up = P[upId];
  const low = P[lowId];
  const baseCol = front ? ec(e, pal.armor) : ec(e, pal.wood);
  const dark = ec(e, pal.dark);
  if (up.broken) {
    drawStump(e, hip, 4.4 * s, pal, -0.4);
    return;
  }
  // thigh
  lineRod(ctx, hip, knee, 9.4 * s, dark);
  lineRod(ctx, hip, knee, 6.8 * s, front ? baseCol : ec(e, pal.wood));
  drawEnemyJoint(e, hip, 3.2 * s, pal);
  crackSegment(e, up, hip, knee);
  if (low.broken) {
    drawStump(e, knee, 3.5 * s, pal, 0.5);
    return;
  }
  // shin
  lineRod(ctx, knee, foot, 7.4 * s, dark);
  lineRod(ctx, knee, foot, 5 * s, front ? ec(e, pal.woodLight) : ec(e, pal.wood));
  drawEnemyJoint(e, knee, 3.3 * s, pal);
  crackSegment(e, low, knee, foot);
  // foot
  ctx.fillStyle = dark;
  if (e.type === "rend") {
    ctx.beginPath();
    ctx.moveTo(foot.x - 1, foot.y - 2.4 * s);
    ctx.lineTo(foot.x + 9 * s, foot.y - 1);
    ctx.lineTo(foot.x + 11 * s, foot.y + 2);
    ctx.lineTo(foot.x - 2, foot.y + 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ec(e, pal.accent);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(foot.x + 9 * s, foot.y + 1);
    ctx.lineTo(foot.x + 13 * s, foot.y + 3);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(foot.x + 4.6 * s, foot.y - 1.5, 6.6 * s, 3.5 * s, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.armorLight, 0.45);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(foot.x + 4.6 * s, foot.y - 1.5, 5.1 * s, PI * 0.9, PI * 1.9);
    ctx.stroke();
  }
  drawEnemyJoint(e, foot, 2.4 * s, pal);
}

function drawEnemyArm(e, pose, side, front, pal, s, alpha) {
  const P = e.parts;
  const sh = side === "R" ? pose.shoulderR : pose.shoulderL;
  const el = side === "R" ? pose.elbowR : pose.elbowL;
  const hand = side === "R" ? pose.handR : pose.handL;
  const upId = side === "R" ? "armR0" : "armL0";
  const lowId = side === "R" ? "armR1" : "armL1";
  const up = P[upId];
  const low = P[lowId];
  const dark = ec(e, pal.dark);
  const main = front ? ec(e, pal.woodLight) : ec(e, pal.wood);
  if (up.broken) {
    drawStump(e, sh, 4.6 * s, pal, -0.6);
    return;
  }
  // upper arm
  lineRod(ctx, sh, el, 8.2 * s, dark);
  lineRod(ctx, sh, el, 5.6 * s, main);
  drawEnemyJoint(e, sh, 3.5 * s, pal);
  crackSegment(e, up, sh, el);
  // shoulder plate for axe
  if (e.type === "axe" && front) {
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(-0.1);
    poly(ctx, [
      { x: -5 * s, y: -4 * s },
      { x: 6 * s, y: -3 * s },
      { x: 5 * s, y: 3.5 * s },
      { x: -4.5 * s, y: 4 * s },
    ], ec(e, pal.armor));
    ctx.strokeStyle = rgba(pal.armorLight, 0.6);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // spike
    poly(ctx, [
      { x: -4 * s, y: -3.6 * s },
      { x: -10 * s, y: -8 * s },
      { x: -3 * s, y: -1.4 * s },
    ], ec(e, pal.armorLight));
    ctx.restore();
  }
  if (low.broken) {
    drawStump(e, el, 3.4 * s, pal, 0.7);
    return;
  }
  // forearm
  lineRod(ctx, el, hand, 6.4 * s, dark);
  lineRod(ctx, el, hand, 4.4 * s, front ? ec(e, pal.woodLight) : ec(e, pal.wood));
  drawEnemyJoint(e, el, 3.1 * s, pal);
  crackSegment(e, low, el, hand);
  // hand
  drawEnemyJoint(e, hand, 2.8 * s, pal, true);
  // rend claws
  if (e.type === "rend") {
    const dir = 1;
    ctx.strokeStyle = ec(e, pal.woodLight);
    ctx.lineWidth = 1.2 * s;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y + i * 2 * s);
      ctx.quadraticCurveTo(hand.x + 9 * s, hand.y + i * 4.2 * s, hand.x + 17 * s, hand.y + i * 3.6 * s + 3 * s);
      ctx.stroke();
    }
    ctx.strokeStyle = ec(e, pal.accent);
    ctx.lineWidth = 0.7 * s;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hand.x + 9 * s, hand.y + i * 3.8 * s);
      ctx.lineTo(hand.x + 17 * s, hand.y + i * 3.6 * s + 3 * s);
      ctx.stroke();
    }
  }
}

function drawEnemyTorso(e, pose, pal, s) {
  const chest = pose.chest;
  const hip = pose.hip;
  const sL = pose.shoulderL;
  const sR = pose.shoulderR;
  const dark = ec(e, pal.dark);
  const cloth = ec(e, pal.cloth);
  const armor = ec(e, pal.armor);
  const bodyW = pose.bodyW;

  if (e.type === "axe") {
    // broad lacquered carapace
    poly(ctx, [
      { x: sL.x - 2 * s, y: sL.y - 1 * s },
      { x: sR.x + 2 * s, y: sR.y - 1 * s },
      { x: chest.x + bodyW * 0.6, y: chest.y + 8 * s },
      { x: hip.x + bodyW * 0.5, y: hip.y + 2 },
      { x: hip.x - bodyW * 0.5, y: hip.y + 2 },
      { x: chest.x - bodyW * 0.62, y: chest.y + 8 * s },
    ], dark);
    poly(ctx, [
      { x: sL.x - 0.5 * s, y: sL.y },
      { x: sR.x + 0.5 * s, y: sR.y },
      { x: chest.x + bodyW * 0.47, y: chest.y + 8 * s },
      { x: hip.x + bodyW * 0.4, y: hip.y },
      { x: hip.x - bodyW * 0.4, y: hip.y },
      { x: chest.x - bodyW * 0.48, y: chest.y + 8 * s },
    ], ec(e, pal.wood));
    // chest armor plates
    poly(ctx, [
      { x: chest.x - bodyW * 0.42, y: chest.y + 1 * s },
      { x: chest.x + bodyW * 0.46, y: chest.y + 1 * s },
      { x: chest.x + bodyW * 0.36, y: chest.y + 14 * s },
      { x: chest.x - bodyW * 0.38, y: chest.y + 14 * s },
    ], armor);
    ctx.strokeStyle = rgba(pal.armorLight, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(chest.x - bodyW * 0.34, chest.y + 5 * s);
    ctx.lineTo(chest.x + bodyW * 0.36, chest.y + 5 * s);
    ctx.moveTo(chest.x - bodyW * 0.32, chest.y + 9.5 * s);
    ctx.lineTo(chest.x + bodyW * 0.3, chest.y + 9.5 * s);
    ctx.stroke();
    // rope belt
    ctx.strokeStyle = rgba(pal.rope, 0.8);
    ctx.lineWidth = 2.3 * s;
    ctx.beginPath();
    ctx.moveTo(hip.x - bodyW * 0.5, hip.y - 1);
    ctx.lineTo(hip.x + bodyW * 0.46, hip.y - 1);
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.rope, 0.5);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(hip.x + 3 * s, hip.y + 1);
    ctx.quadraticCurveTo(hip.x + 8 * s, hip.y + 12 * s, hip.x + 2 * s, hip.y + 20 * s);
    ctx.stroke();
    // tassets
    poly(ctx, [
      { x: hip.x - bodyW * 0.5, y: hip.y },
      { x: hip.x - bodyW * 0.1, y: hip.y + 1 },
      { x: hip.x - 2 * s, y: hip.y + 17 * s },
      { x: hip.x - bodyW * 0.55, y: hip.y + 13 * s },
    ], ec(e, pal.cloth));
    poly(ctx, [
      { x: hip.x + bodyW * 0.1, y: hip.y },
      { x: hip.x + bodyW * 0.5, y: hip.y },
      { x: hip.x + bodyW * 0.48, y: hip.y + 13 * s },
      { x: hip.x + 2 * s, y: hip.y + 17 * s },
    ], ec(e, pal.cloth));
    // exposed neck core
    drawChestCore(e, chest, pal, s);
  } else if (e.type === "bolt") {
    // tattered cloak
    poly(ctx, [
      { x: sL.x - 1 * s, y: sL.y - 1 * s },
      { x: sR.x + 1 * s, y: sR.y - 1 * s },
      { x: chest.x + bodyW * 0.55, y: chest.y + 8 * s },
      { x: hip.x + bodyW * 0.7, y: hip.y + 18 * s },
      { x: hip.x + 6 * s, y: hip.y + 12 * s },
      { x: hip.x + 1 * s, y: hip.y + 20 * s },
      { x: hip.x - 5 * s, y: hip.y + 12 * s },
      { x: hip.x - bodyW * 0.65, y: hip.y + 19 * s },
      { x: chest.x - bodyW * 0.56, y: chest.y + 8 * s },
    ], cloth);
    // inner wrap
    poly(ctx, [
      { x: chest.x - bodyW * 0.4, y: chest.y + 2 },
      { x: chest.x + bodyW * 0.42, y: chest.y + 2 },
      { x: hip.x + 5 * s, y: hip.y + 1 },
      { x: hip.x - 5 * s, y: hip.y + 1 },
    ], ec(e, pal.dark));
    // chest straps
    ctx.strokeStyle = rgba(pal.rope, 0.65);
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(chest.x - 6 * s, chest.y + 2);
    ctx.lineTo(chest.x + 5 * s, hip.y - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chest.x + 6 * s, chest.y + 2);
    ctx.lineTo(chest.x - 5 * s, hip.y - 2);
    ctx.stroke();
    // belt
    ctx.strokeStyle = rgba(pal.rope, 0.7);
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(hip.x - bodyW * 0.55, hip.y);
    ctx.lineTo(hip.x + bodyW * 0.55, hip.y);
    ctx.stroke();
    // hood collar
    poly(ctx, [
      { x: sL.x - 3 * s, y: sL.y - 2 * s },
      { x: sL.x + 1 * s, y: sL.y - 7 * s },
      { x: sR.x - 1 * s, y: sR.y - 7 * s },
      { x: sR.x + 3 * s, y: sR.y - 2 * s },
      { x: chest.x + 4 * s, y: chest.y + 4 * s },
      { x: chest.x - 4 * s, y: chest.y + 4 * s },
    ], ec(e, pal.dark));
    drawChestCore(e, chest, pal, s);
  } else {
    // rend: exposed wooden frame
    poly(ctx, [
      { x: sL.x - 1 * s, y: sL.y },
      { x: sR.x + 1 * s, y: sR.y },
      { x: chest.x + bodyW * 0.42, y: chest.y + 7 * s },
      { x: hip.x + bodyW * 0.46, y: hip.y + 4 * s },
      { x: hip.x - bodyW * 0.46, y: hip.y + 4 * s },
      { x: chest.x - bodyW * 0.42, y: chest.y + 7 * s },
    ], ec(e, pal.dark));
    // ribs
    ctx.strokeStyle = ec(e, pal.woodLight);
    ctx.lineWidth = 1.6 * s;
    for (let i = 0; i < 3; i++) {
      const yy = chest.y + (5 + i * 4.5) * s;
      const ww = bodyW * (0.46 - i * 0.08);
      ctx.beginPath();
      ctx.moveTo(chest.x - ww, yy);
      ctx.quadraticCurveTo(chest.x, yy + 4 * s, chest.x + ww, yy);
      ctx.stroke();
    }
    // ragged waist cloth
    poly(ctx, [
      { x: hip.x - bodyW * 0.5, y: hip.y - 1 },
      { x: hip.x + bodyW * 0.5, y: hip.y - 1 },
      { x: hip.x + bodyW * 0.4, y: hip.y + 14 * s },
      { x: hip.x + 2 * s, y: hip.y + 8 * s },
      { x: hip.x - 3 * s, y: hip.y + 16 * s },
      { x: hip.x - bodyW * 0.42, y: hip.y + 10 * s },
    ], ec(e, pal.cloth));
    // spine spikes
    ctx.strokeStyle = ec(e, pal.woodLight);
    ctx.lineWidth = 1.2 * s;
    for (let i = 0; i < 3; i++) {
      const yy = chest.y + (3 + i * 6) * s;
      ctx.beginPath();
      ctx.moveTo(chest.x - bodyW * 0.28, yy);
      ctx.lineTo(chest.x - bodyW * 0.62, yy - 3 * s);
      ctx.stroke();
    }
    drawChestCore(e, chest, pal, s);
  }
}

function drawChestCore(e, chest, pal, s) {
  const pulse = 0.55 + 0.3 * Math.sin(game.time * 4.2 + e.id);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, chest.x, chest.y + 8 * s, 9 * s, pal.accent, 0.28 * pulse);
  circle(ctx, chest.x, chest.y + 8 * s, 1.5 * s, rgba("#fff4da", 0.75));
  ctx.restore();
}

function drawEnemyHead(e, pose, pal, s) {
  if (e.parts.head.broken) {
    drawStump(e, pose.head, 4.2 * s, pal, 0);
    return;
  }
  const h = pose.head;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(pose.headTilt + pose.lean * 0.45);
  const dark = ec(e, pal.dark);
  const armor = ec(e, pal.armor);
  if (e.type === "axe") {
    // horned helm
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.4 * s, 8 * s, 0, 0, TAU);
    ctx.fill();
    // faceplate
    poly(ctx, [
      { x: -5.5 * s, y: -4 * s },
      { x: 5.5 * s, y: -4.5 * s },
      { x: 4.4 * s, y: 5 * s },
      { x: -3.6 * s, y: 5.4 * s },
    ], armor);
    // helm top
    poly(ctx, [
      { x: -6 * s, y: -4 * s },
      { x: -4 * s, y: -9 * s },
      { x: 0, y: -11 * s },
      { x: 5 * s, y: -8 * s },
      { x: 6 * s, y: -3.6 * s },
      { x: 0, y: -6 * s },
    ], ec(e, pal.armorLight));
    // horns
    ctx.fillStyle = ec(e, pal.woodLight);
    poly(ctx, [
      { x: -5.4 * s, y: -7 * s },
      { x: -13 * s, y: -16 * s },
      { x: -8.5 * s, y: -4.4 * s },
    ], ec(e, pal.woodLight));
    poly(ctx, [
      { x: 5.6 * s, y: -7 * s },
      { x: 12.5 * s, y: -15.5 * s },
      { x: 8 * s, y: -3.8 * s },
    ], ec(e, pal.woodLight));
    // eye slit
    ctx.fillStyle = dark;
    ctx.fillRect(-4.2 * s, -1.4 * s, 8.6 * s, 2.4 * s);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 1 * s, 0, 8 * s, pal.eye, 0.55);
    ctx.fillStyle = rgba("#fff1c4", 0.95);
    ctx.fillRect(-2.8 * s, -0.9 * s, 5.6 * s, 1.1 * s);
    ctx.restore();
    // jaw
    ctx.fillStyle = dark;
    ctx.fillRect(-3.4 * s, 3.4 * s, 7 * s, 2 * s);
    if (e.elite) drawEliteCrown(h, s);
  } else if (e.type === "bolt") {
    // pointed hood
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-9 * s, 3 * s);
    ctx.quadraticCurveTo(-10 * s, -9 * s, -3 * s, -11 * s);
    ctx.quadraticCurveTo(6 * s, -12 * s, 10 * s, -2 * s);
    ctx.quadraticCurveTo(11 * s, 5 * s, 4 * s, 7 * s);
    ctx.lineTo(-7 * s, 7 * s);
    ctx.closePath();
    ctx.fill();
    // mask
    ctx.fillStyle = ec(e, pal.wood);
    ctx.beginPath();
    ctx.ellipse(2 * s, 1 * s, 6.2 * s, 6.8 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ec(e, pal.armor);
    ctx.beginPath();
    ctx.ellipse(1.8 * s, 0.6 * s, 4.6 * s, 5.2 * s, 0, 0, TAU);
    ctx.fill();
    // single lens
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 3.6 * s, -0.6 * s, 7 * s, pal.eye, 0.6);
    circle(ctx, 3.6 * s, -0.6 * s, 2.1 * s, "#d9fff9");
    ctx.fillStyle = rgba("#0c2a2a", 0.9);
    ctx.beginPath();
    ctx.arc(4.2 * s, -0.4 * s, 0.9 * s, 0, TAU);
    ctx.fill();
    ctx.restore();
    // antenna
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(-4 * s, -8 * s);
    ctx.quadraticCurveTo(-8 * s, -15 * s, -3 * s, -20 * s);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, -3 * s, -20 * s, 3.4 * s, pal.accent, 0.6);
    ctx.restore();
    // hood rim
    ctx.strokeStyle = rgba(pal.rope, 0.35);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(1 * s, 1 * s, 8.2 * s, -2.5, 0.7);
    ctx.stroke();
    if (e.elite) drawEliteCrown(h, s);
  } else {
    // rend wooden skull
    ctx.fillStyle = ec(e, pal.wood);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.6 * s, 7.2 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ec(e, pal.woodLight);
    ctx.beginPath();
    ctx.ellipse(1 * s, 1.4 * s, 5.6 * s, 5 * s, 0, 0, TAU);
    ctx.fill();
    // horns
    ctx.fillStyle = dark;
    poly(ctx, [
      { x: -5 * s, y: -6 * s },
      { x: -10 * s, y: -15 * s },
      { x: -2 * s, y: -7 * s },
    ], dark);
    poly(ctx, [
      { x: 6 * s, y: -5 * s },
      { x: 11 * s, y: -13 * s },
      { x: 8 * s, y: -3 * s },
    ], dark);
    // eye sockets
    ctx.fillStyle = "#1b1114";
    ctx.beginPath();
    ctx.ellipse(2.6 * s, -1.4 * s, 2.3 * s, 1.7 * s, -0.1, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-2.4 * s, -1.2 * s, 1.9 * s, 1.5 * s, 0.1, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 2.6 * s, -1.2 * s, 5 * s, pal.eye, 0.55);
    glowCircle(ctx, -2.4 * s, -1 * s, 4 * s, pal.eye, 0.5);
    ctx.restore();
    // jaw
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(-4 * s, 4 * s);
    ctx.lineTo(4.6 * s, 4.4 * s);
    ctx.stroke();
    ctx.lineWidth = 0.8 * s;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-2.5 * s + i * 2.6 * s, 4.1 * s);
      ctx.lineTo(-2.2 * s + i * 2.6 * s, 6.2 * s);
      ctx.stroke();
    }
    if (e.elite) drawEliteCrown(h, s);
  }
  ctx.restore();
}

function drawEliteCrown(h, s) {
  ctx.save();
  ctx.translate(0, -12 * s);
  ctx.fillStyle = "#ffd46e";
  ctx.beginPath();
  ctx.moveTo(-5 * s, 2 * s);
  ctx.lineTo(-4 * s, -4 * s);
  ctx.lineTo(-1 * s, -1 * s);
  ctx.lineTo(0, -5 * s);
  ctx.lineTo(2 * s, -1 * s);
  ctx.lineTo(5 * s, -4 * s);
  ctx.lineTo(5 * s, 2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, 0, -1, 9 * s, "#ffd46e", 0.28);
  ctx.restore();
}

function drawEnemyWeapon(e, pose, pal, s) {
  if (!e.parts.armR0.broken && !e.parts.armR1.broken) {
    const hand = pose.handR;
    if (e.type === "axe") {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.rotate(pose.axeAngle);
      // handle
      ctx.strokeStyle = ec(e, pal.dark);
      ctx.lineWidth = 4.2 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-12 * s, 0);
      ctx.lineTo(34 * s, 0);
      ctx.stroke();
      ctx.strokeStyle = ec(e, pal.wood);
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      ctx.moveTo(-11 * s, 0);
      ctx.lineTo(33 * s, 0);
      ctx.stroke();
      // grip wrap
      ctx.strokeStyle = rgba(pal.rope, 0.8);
      ctx.lineWidth = 0.8 * s;
      for (let i = -8; i < 4; i += 2.4) {
        ctx.beginPath();
        ctx.moveTo(i * s, -1.2 * s);
        ctx.lineTo((i + 1.3) * s, 1.2 * s);
        ctx.stroke();
      }
      // socket and blade
      ctx.fillStyle = ec(e, pal.armor);
      ctx.beginPath();
      ctx.ellipse(31 * s, 0, 3.6 * s, 4.8 * s, 0, 0, TAU);
      ctx.fill();
      const bg = ctx.createLinearGradient(30 * s, -18 * s, 48 * s, 16 * s);
      bg.addColorStop(0, "#f0f5f3");
      bg.addColorStop(0.35, ec(e, pal.armorLight));
      bg.addColorStop(0.7, ec(e, pal.armor));
      bg.addColorStop(1, "#3e4346");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(31 * s, -3 * s);
      ctx.quadraticCurveTo(40 * s, -20 * s, 54 * s, -22 * s);
      ctx.quadraticCurveTo(49 * s, -8 * s, 45 * s, 1 * s);
      ctx.quadraticCurveTo(52 * s, 10 * s, 55 * s, 22 * s);
      ctx.quadraticCurveTo(40 * s, 18 * s, 31 * s, 4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(pal.accent, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(52 * s, -19 * s);
      ctx.quadraticCurveTo(43 * s, 0, 53 * s, 19 * s);
      ctx.stroke();
      // red hot core near socket
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      glowCircle(ctx, 34 * s, 0, 6 * s, pal.core, 0.4);
      ctx.restore();
      ctx.restore();
    } else if (e.type === "bolt") {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.rotate(pose.bowAngle);
      // stock
      ctx.fillStyle = ec(e, pal.wood);
      ctx.fillRect(-6 * s, -1.8 * s, 32 * s, 3.6 * s);
      ctx.fillStyle = ec(e, pal.dark);
      ctx.fillRect(-7 * s, -2.6 * s, 8 * s, 5.2 * s);
      // limbs
      ctx.strokeStyle = ec(e, pal.armorLight);
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(24 * s, -1 * s);
      ctx.quadraticCurveTo(31 * s, -14 * s, 23 * s, -19 * s);
      ctx.moveTo(24 * s, 1 * s);
      ctx.quadraticCurveTo(31 * s, 14 * s, 23 * s, 19 * s);
      ctx.stroke();
      // string
      ctx.strokeStyle = rgba("#d8f5ef", 0.6);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(23 * s, -19 * s);
      ctx.lineTo(14 * s, 0);
      ctx.lineTo(23 * s, 19 * s);
      ctx.stroke();
      // loaded bolt
      if (e.state === "windup" || e.state === "attack") {
        ctx.strokeStyle = "#bafff4";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(12 * s, 0);
        ctx.lineTo(36 * s, 0);
        ctx.stroke();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        glowCircle(ctx, 36 * s, 0, 7 * s, pal.accent, 0.35);
        ctx.restore();
      }
      ctx.restore();
    }
  }
}
