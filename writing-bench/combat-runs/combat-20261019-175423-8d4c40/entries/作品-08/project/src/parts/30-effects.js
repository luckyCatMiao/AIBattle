/* ============================================================
   Particles, slashes, debris, camera shake, hit-stop feedback
   ============================================================ */

function addParticle(p) {
  const arr = p.back ? game.particlesBack : game.particles;
  arr.push(p);
  if (arr.length > 380) arr.splice(0, arr.length - 380);
}

function sparkBurst(x, y, dir, count, power = 1, color = "#ffb45e", back = false) {
  for (let i = 0; i < count; i++) {
    const a = rand(-1.25, 1.25) * (0.6 + power * 0.2) + (dir >= 0 ? 0 : PI);
    const speed = rand(140, 520) * power;
    addParticle({
      kind: "spark",
      x, y,
      vx: Math.cos(a) * speed + rand(-60, 60),
      vy: Math.sin(a) * speed - rand(20, 180) * power,
      life: rand(0.16, 0.42),
      maxLife: 0.42,
      size: rand(0.8, 2.2) * (0.7 + power * 0.5),
      color,
      grav: 720,
      drag: 0.9,
      rot: a,
      back,
      additive: true,
    });
  }
  // a couple of white-hot flash specks
  for (let i = 0; i < Math.ceil(count * 0.3); i++) {
    addParticle({
      kind: "glow",
      x, y,
      vx: rand(-180, 180),
      vy: rand(-240, 80),
      life: rand(0.08, 0.2),
      maxLife: 0.2,
      size: rand(1.4, 3.2),
      color: "#fff8e8",
      grav: 200,
      drag: 0.86,
      back,
      additive: true,
    });
  }
}

function emberBurst(x, y, count, color = "#ff7a5a", power = 1, back = false) {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "ember",
      x: x + rand(-10, 10),
      y: y + rand(-8, 8),
      vx: rand(-160, 160) * power,
      vy: rand(-320, -20) * power,
      life: rand(0.4, 1.2),
      maxLife: 1.2,
      size: rand(1.1, 3.2),
      color: chance(0.5) ? color : "#ffd58a",
      grav: -40,
      drag: 0.94,
      back,
      additive: true,
      sway: rand(0.5, 2),
    });
  }
}

function dustBurst(x, y, count = 8, dir = 0, power = 1, color = "#b9a88f") {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "dust",
      x: x + rand(-14, 14),
      y: y - rand(0, 6),
      vx: rand(-110, 110) * power + dir * 40,
      vy: rand(-80, -10) * power,
      life: rand(0.35, 0.9),
      maxLife: 0.9,
      size: rand(5, 16) * power,
      color,
      grav: -30,
      drag: 0.9,
      back: true,
    });
  }
}

function smokeBurst(x, y, count = 5, color = "#241d22", power = 1, back = true) {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "smoke",
      x: x + rand(-10, 10),
      y: y + rand(-10, 6),
      vx: rand(-45, 45),
      vy: rand(-70, -12) * power,
      life: rand(0.5, 1.3),
      maxLife: 1.3,
      size: rand(7, 18) * power,
      color,
      grav: -20,
      drag: 0.94,
      back,
    });
  }
}

function woodBurst(x, y, dir, count = 10, power = 1, color = "#a98255") {
  for (let i = 0; i < count; i++) {
    const a = rand(-1.5, 1.5) + (dir >= 0 ? 0 : PI);
    addParticle({
      kind: "splinter",
      x, y,
      vx: Math.cos(a) * rand(120, 460) * power,
      vy: Math.sin(a) * rand(80, 380) - rand(80, 260),
      life: rand(0.5, 1.15),
      maxLife: 1.15,
      size: rand(2, 6) * (0.8 + power * 0.3),
      len: rand(6, 16),
      color: chance(0.35) ? "#d9c19a" : color,
      grav: 1500,
      drag: 0.985,
      rot: rand(0, TAU),
      vr: rand(-16, 16),
      back: false,
    });
  }
}

function metalBurst(x, y, dir, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(-1.2, 1.2) + (dir >= 0 ? 0 : PI);
    addParticle({
      kind: "shard",
      x, y,
      vx: Math.cos(a) * rand(160, 480),
      vy: Math.sin(a) * rand(100, 380) - rand(60, 200),
      life: rand(0.4, 0.9),
      maxLife: 0.9,
      size: rand(2, 5),
      len: rand(5, 12),
      color: chance(0.4) ? "#d4f4ee" : "#718c8b",
      grav: 1300,
      drag: 0.985,
      rot: rand(0, TAU),
      vr: rand(-18, 18),
      back: false,
    });
  }
}

function petalBurst(x, y, count = 4, color = "#d8324c") {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "petal",
      x: x + rand(-8, 8),
      y: y + rand(-20, 0),
      vx: rand(-60, 60),
      vy: rand(-60, 20),
      life: rand(0.7, 1.5),
      maxLife: 1.5,
      size: rand(3, 5),
      color,
      grav: 100,
      drag: 0.97,
      rot: rand(0, TAU),
      vr: rand(-7, 7),
      back: false,
    });
  }
}

function addRing(x, y, color = "#ffdca8", radius = 40, life = 0.22, width = 3, back = false) {
  addParticle({
    kind: "ring",
    x, y,
    vx: 0, vy: 0,
    life, maxLife: life,
    size: radius,
    color,
    width,
    back,
  });
}

function addShockwave(x, y, color = "#ffcf9a", radius = 110, life = 0.4, width = 5) {
  addParticle({
    kind: "shockwave",
    x, y,
    vx: 0, vy: 0,
    life, maxLife: life,
    size: radius,
    color,
    width,
    back: false,
  });
}

function addSlash(x, y, r, a0, a1, color, life = 0.18, width = 22, facing = 1, thick = 0.6) {
  game.slashes.push({
    x, y, r, a0, a1, color, life, maxLife: life, width, facing, thick,
  });
  if (game.slashes.length > 30) game.slashes.shift();
}

function addFloater(text, x, y, color = "#fff2d6", size = 13, opts = {}) {
  game.floaters.push({
    text,
    x, y,
    vx: opts.vx || rand(-20, 20),
    vy: opts.vy != null ? opts.vy : -58,
    life: opts.life || 0.8,
    maxLife: opts.life || 0.8,
    color,
    size,
    glow: opts.glow || null,
    slot: opts.slot || 0,
    pop: opts.pop || false,
  });
  if (game.floaters.length > 40) game.floaters.shift();
}

function addDecal(x, y, kind, dir = 1, scale = 1, color = "#1a0d0f", life = 7) {
  game.decals.push({ x, y, kind, dir, scale, color, life, maxLife: life, seed: Math.random() * 1000 });
  if (game.decals.length > 28) game.decals.shift();
}

function addAfterimage(pose, color = "#ff4d64", life = 0.26) {
  game.afterimages.push({ pose, color, life, maxLife: life });
  if (game.afterimages.length > 22) game.afterimages.shift();
}

function requestHitStop(t) {
  game.hitStop = Math.min(0.22, Math.max(game.hitStop, t));
}

function addShake(amp) {
  game.camera.shakeAmp = Math.min(13, Math.max(game.camera.shakeAmp, amp));
}

function screenFlash(a) {
  game.flash = Math.max(game.flash, a);
}

function setSlowmo(realSeconds, scale = 0.32) {
  game.slowmo = Math.max(game.slowmo, realSeconds);
  game.timeScale = Math.min(game.timeScale, scale);
}

/* ---------------- debris ---------------- */
function spawnDebris(opts) {
  const d = {
    kind: opts.kind || "arm",
    x: opts.x, y: opts.y,
    vx: opts.vx || 0,
    vy: opts.vy || -220,
    rot: opts.rot || rand(0, TAU),
    vr: opts.vr || rand(-10, 10),
    len: opts.len || 22,
    len2: opts.len2 || 18,
    width: opts.width || 7,
    color: opts.color || "#6b5137",
    dark: opts.dark || "#241a14",
    accent: opts.accent || "#ff9b5e",
    weapon: opts.weapon || null,
    scale: opts.scale || 1,
    life: opts.life || 4.5,
    maxLife: opts.life || 4.5,
    groundHits: 0,
    bouncing: true,
  };
  game.debris.push(d);
  if (game.debris.length > 44) game.debris.shift();
}

function updateDebris(dt) {
  for (let i = game.debris.length - 1; i >= 0; i--) {
    const d = game.debris[i];
    d.life -= dt;
    if (d.life <= 0) {
      game.debris.splice(i, 1);
      continue;
    }
    d.vy += 1500 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rot += d.vr * dt;
    if (d.y > GROUND_Y - 2) {
      d.y = GROUND_Y - 2;
      if (d.vy > 60) {
        if (d.groundHits < 3) {
          d.vy *= -0.32;
          d.vx *= 0.63;
          d.vr *= 0.55;
          d.groundHits++;
          dustBurst(d.x, GROUND_Y, 4, sgn(d.vx), 0.7, "#8f7d68");
          if (d.groundHits === 1) metalBurst(d.x, d.y - 4, sgn(d.vx), 2);
        } else {
          d.vy = 0;
          d.vx *= 0.82;
          d.vr *= 0.6;
          d.bouncing = false;
        }
      } else {
        d.vy = 0;
        d.vx *= Math.pow(0.02, dt);
        d.vr *= Math.pow(0.01, dt);
      }
    }
    if (d.bouncing && chance(dt * 18)) {
      addParticle({
        kind: "ember",
        x: d.x, y: d.y,
        vx: rand(-30, 30), vy: rand(-80, -10),
        life: rand(0.2, 0.5), maxLife: 0.5,
        size: rand(1, 2.4), color: d.accent,
        grav: -20, drag: 0.95, back: false, additive: true,
      });
    }
  }
}

function drawDebris() {
  for (const d of game.debris) {
    const alpha = d.life < 1.1 ? d.life / 1.1 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    const s = d.scale;
    if (d.kind === "head") {
      drawDebrisHead(d, s);
    } else if (d.kind === "armUpper" || d.kind === "armLower" || d.kind === "legUpper" || d.kind === "legLower") {
      drawDebrisLimb(d, s);
    } else {
      drawDebrisLimb(d, s);
    }
    ctx.restore();
  }
}

function drawDebrisLimb(d, s) {
  const half = d.len / 2;
  // dark outline then central rod
  lineRod(ctx, { x: -half, y: 0 }, { x: half, y: 0 }, d.width + 2.2, rgba(d.dark, 0.9));
  taperedRod(ctx, { x: -half, y: 0 }, { x: half, y: 0 }, d.width, d.width * 0.8, d.color);
  ctx.strokeStyle = rgba("#f4dfb8", 0.32);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-half + 2, -d.width * 0.42);
  ctx.lineTo(half - 2, -d.width * 0.5);
  ctx.stroke();
  // dark edge / wood grain
  ctx.strokeStyle = rgba(d.dark, 0.85);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-half + 2, -d.width * 0.28);
  ctx.lineTo(half - 2, -d.width * 0.34);
  ctx.stroke();
  ctx.strokeStyle = rgba("#e2caa2", 0.22);
  ctx.beginPath();
  ctx.moveTo(-half + 2, d.width * 0.28);
  ctx.lineTo(half - 2, d.width * 0.16);
  ctx.stroke();
  // joint at left end
  circle(ctx, -half, 0, d.width * 0.62, d.dark);
  circle(ctx, -half, 0, d.width * 0.38, rgba(d.accent, 0.85));
  glowCircle(ctx, -half, 0, d.width * 1.8, d.accent, 0.2);
  if (d.kind === "legLower") {
    // foot
    poly(ctx, [
      { x: half - 2, y: -3 },
      { x: half + 10 * s, y: -2 },
      { x: half + 11 * s, y: 4 },
      { x: half - 2, y: 5 },
    ], d.dark);
  } else if (d.kind === "armLower") {
    // hand joint
    circle(ctx, half, 0, d.width * 0.62, d.dark);
    circle(ctx, half + 2, 0, d.width * 0.3, rgba(d.accent, 0.8));
    if (d.weapon === "axe") {
      ctx.save();
      ctx.translate(half, 0);
      ctx.rotate(-0.25);
      lineRod(ctx, { x: -2, y: 0 }, { x: 30 * s, y: 0 }, 3.2 * s, "#4a3524");
      poly(ctx, [
        { x: 26 * s, y: -4 * s },
        { x: 40 * s, y: -16 * s },
        { x: 47 * s, y: -1 * s },
        { x: 35 * s, y: 9 * s },
      ], "#8b8c87", rgba("#dbe7e4", 0.5), 0.8);
      ctx.restore();
    } else if (d.weapon === "crossbow") {
      ctx.save();
      ctx.translate(half + 5, 0);
      ctx.strokeStyle = "#6a5741";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, 12 * s, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = "#c7bb9b";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(12 * s, -10 * s);
      ctx.lineTo(12 * s, 10 * s);
      ctx.stroke();
      ctx.restore();
    } else if (d.weapon === "claw") {
      ctx.strokeStyle = "#cfc4ac";
      ctx.lineWidth = 1.8;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(half, i * 2.4);
        ctx.lineTo(half + 14 * s, i * 4.4 + 2);
        ctx.stroke();
      }
    }
  }
}
function drawDebrisHead(d, s) {
  ctx.fillStyle = d.dark;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9 * s, 10 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.ellipse(0, -1 * s, 8 * s, 9 * s, 0, 0, TAU);
  ctx.fill();
  // horn
  poly(ctx, [
    { x: -5 * s, y: -6 * s },
    { x: -8 * s, y: -17 * s },
    { x: -2 * s, y: -8 * s },
  ], "#d4c3a2");
  const flicker = 0.5 + 0.5 * Math.sin(performance.now() * 0.02 + d.x);
  glowCircle(ctx, 2 * s, 0, 9 * s, d.accent, 0.55 * flicker);
  circle(ctx, 2 * s, 0, 2.2 * s, "#fff6df");
}

/* ---------------- update / draw particles ---------------- */
function updateEffects(dt) {
  updateParticles(game.particles, dt);
  updateParticles(game.particlesBack, dt);
  updateDebris(dt);

  for (let i = game.slashes.length - 1; i >= 0; i--) {
    const s = game.slashes[i];
    s.life -= dt;
    if (s.life <= 0) game.slashes.splice(i, 1);
  }
  for (let i = game.decals.length - 1; i >= 0; i--) {
    const d = game.decals[i];
    d.life -= dt;
    if (d.life <= 0) game.decals.splice(i, 1);
  }
  for (let i = game.floaters.length - 1; i >= 0; i--) {
    const f = game.floaters[i];
    f.life -= dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vy += 90 * dt;
    if (f.life <= 0) game.floaters.splice(i, 1);
  }
  for (let i = game.afterimages.length - 1; i >= 0; i--) {
    const a = game.afterimages[i];
    a.life -= dt;
    if (a.life <= 0) game.afterimages.splice(i, 1);
  }
  updateSkillFx(dt);
}

function updateParticles(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) {
      arr.splice(i, 1);
      continue;
    }
    if (p.kind === "ring" || p.kind === "shockwave") continue;
    p.vy += (p.grav || 0) * dt;
    p.vx *= Math.pow(p.drag != null ? p.drag : 0.98, dt * 60);
    p.vy *= Math.pow(p.drag != null ? p.drag : 0.98, dt * 60);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.sway) p.x += Math.sin((p.maxLife - p.life) * 8 * p.sway) * 24 * dt;
    if (p.rot != null && p.vr) p.rot += p.vr * dt;
    if (p.kind === "splinter" || p.kind === "shard") {
      if (p.y > GROUND_Y) {
        p.y = GROUND_Y;
        p.vy *= -0.28;
        p.vx *= 0.7;
        p.vr *= 0.5;
        if (Math.abs(p.vy) < 30) {
          p.vy = 0;
          p.vx *= 0.8;
        }
      }
    }
  }
}

function drawParticlesBack() {
  drawParticleArray(game.particlesBack);
}
function drawParticlesFront() {
  drawParticleArray(game.particles);
}

function drawParticleArray(arr) {
  ctx.save();
  for (const p of arr) {
    const lt = 1 - p.life / p.maxLife;
    const alpha = p.life <= 0 ? 0 : clamp(p.life / (p.maxLife * 0.6), 0, 1);
    if (p.kind === "spark") {
      const a = Math.atan2(p.vy, p.vx);
      const len = clamp(Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.025, 3, 16);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
      ctx.stroke();
      if (p.size > 1.8) {
        glowCircle(ctx, p.x, p.y, p.size * 2.3, p.color, alpha * 0.22);
      }
    } else if (p.kind === "glow" || p.kind === "ember") {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      glowCircle(ctx, p.x, p.y, p.size * (p.kind === "ember" ? 4.5 : 3), p.color, alpha * 0.8);
      circle(ctx, p.x, p.y, p.size * 0.7, rgba("#fff6e0", alpha));
    } else if (p.kind === "dust") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.34;
      const r = p.size * (1 + lt * 1.9);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, rgba(p.color, 0.7));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    } else if (p.kind === "smoke") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.25;
      const r = p.size * (1 + lt * 2.2);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, rgba(p.color, 0.9));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    } else if (p.kind === "splinter" || p.kind === "shard") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      poly(ctx, [
        { x: -p.len / 2, y: -p.size / 2 },
        { x: p.len / 2, y: 0 },
        { x: -p.len / 2, y: p.size / 2 },
      ], p.color);
      ctx.restore();
    } else if (p.kind === "petal") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.9;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === "ring") {
      const r = p.size * (0.35 + lt * 0.9);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * (1 - lt * 0.7);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
    } else if (p.kind === "shockwave") {
      const r = p.size * easeOutCubic(lt);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * (1 - lt) + 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x, GROUND_Y - 2, r, r * 0.22, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.25;
      ctx.lineWidth = p.width * 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x, GROUND_Y - 2, r * 0.7, r * 0.15, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawSlashes() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of game.slashes) {
    const t = 1 - s.life / s.maxLife;
    const alpha = Math.sin(Math.min(1, t * 1.2) * PI) * 0.95;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(s.facing, 1);
    const r = s.r * (0.92 + 0.1 * t);
    const inner = r * s.thick;
    const a0 = s.a0;
    const a1 = s.a1;
    // soft outer glow
    ctx.globalAlpha = alpha * 0.16;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * 1.35;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, a0, a1);
    ctx.stroke();
    // tapered crescent body
    const grad = ctx.createRadialGradient(0, 0, inner * 0.98, 0, 0, r);
    grad.addColorStop(0, rgba(s.color, 0));
    grad.addColorStop(0.5, rgba(s.color, alpha * 0.26));
    grad.addColorStop(0.8, rgba("#fff6ec", alpha * 0.55));
    grad.addColorStop(0.94, rgba("#ffffff", alpha * 0.42));
    grad.addColorStop(1, rgba(s.color, 0));
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.arc(0, 0, inner, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    // white core stroke along the leading edge
    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeStyle = "rgba(255,246,236,0.85)";
    ctx.lineWidth = Math.max(0.8, s.width * 0.11);
    const mid = (a0 + a1) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, lerp(a0, mid, 0.45), lerp(a1, mid, 0.2));
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawDecals() {
  for (const d of game.decals) {
    const alpha = clamp(d.life / d.maxLife, 0, 1) * 0.55;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(d.dir * d.scale, 1);
    ctx.globalAlpha = alpha;
    if (d.kind === "crack") {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-12, 2);
      ctx.lineTo(-2, -2);
      ctx.lineTo(9, 3);
      ctx.lineTo(22, 0);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-2, 7);
      ctx.moveTo(7, 1);
      ctx.lineTo(13, -6);
      ctx.stroke();
    } else if (d.kind === "scorch") {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 42);
      g.addColorStop(0, rgba(d.color, 0.8));
      g.addColorStop(0.5, rgba(d.color, 0.35));
      g.addColorStop(1, rgba(d.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 46, 8, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba("#ff9358", 0.28);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 + i * 9, 3 + i * 2, 0, 0.2, PI - 0.2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  for (const f of game.floaters) {
    const t = 1 - f.life / f.maxLife;
    const alpha = clamp(f.life / (f.maxLife * 0.45), 0, 1);
    const scale = f.pop ? 1 + Math.max(0, 0.5 - t * 3) : 1;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${f.size}px "CombatSerif","Songti SC","STSong","Noto Serif CJK SC",serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (f.glow) {
      ctx.shadowColor = f.glow;
      ctx.shadowBlur = 10;
    }
    if (f.size >= 13) {
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "rgba(10,6,9,0.72)";
      ctx.lineJoin = "round";
      ctx.strokeText(f.text, 0, 0);
    }
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}
