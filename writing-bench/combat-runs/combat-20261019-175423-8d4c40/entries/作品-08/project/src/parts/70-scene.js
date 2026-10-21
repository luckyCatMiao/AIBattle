/* ============================================================
   Scene rendering: sky, moon, parallax, stage, player figure
   ============================================================ */

const PC = {
  coat: "#1b2030",
  coatLight: "#272e44",
  coatDark: "#0e111b",
  lining: "#8e2036",
  liningLight: "#d34152",
  skin: "#e5d8c2",
  mask: "#f0e7d5",
  maskShadow: "#c8b99f",
  hair: "#14131a",
  scarf: "#cb2e49",
  scarfLight: "#ff6f75",
  gold: "#c7a45e",
  goldLight: "#f3d58e",
  boot: "#17161d",
  blade: "#e7eef0",
  bladeDim: "#aebec4",
  glow: "#ff596a",
};

const BG = makeScenery();

function makeScenery() {
  const rng = mulberry32(0x5eed9a1);
  const stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({
      x: rng(),
      y: rng() * 0.62,
      r: 0.4 + rng() * 1.5,
      phase: rng() * TAU,
      speed: 0.4 + rng() * 1.2,
      warm: rng() < 0.18,
    });
  }
  const bamboo = [];
  for (let i = 0; i < 46; i++) {
    bamboo.push({
      x: rng(),
      depth: 0.22 + rng() * 0.4,
      h: 150 + rng() * 260,
      w: 1.2 + rng() * 2.3,
      phase: rng() * TAU,
      sway: 2 + rng() * 5,
      leaves: 2 + Math.floor(rng() * 4),
      leafSeed: rng() * 100,
    });
  }
  const grass = [];
  for (let i = 0; i < 60; i++) {
    grass.push({ x: rng(), h: 12 + rng() * 34, w: 1 + rng() * 2, phase: rng() * TAU, lean: (rng() - 0.5) * 6 });
  }
  const groundCracks = [];
  const grng = mulberry32(0x1234abcd);
  for (let i = 0; i < 130; i++) {
    groundCracks.push({
      x: grng() * WORLD_W,
      y: GROUND_Y + 8 + grng() * 80,
      len: 10 + grng() * 38,
      ang: -0.6 + grng() * 1.2,
      branches: grng() < 0.4 ? 1 : 0,
      seed: grng() * 10,
    });
  }
  const slabs = [];
  for (let i = 0; i < 60; i++) {
    slabs.push({ x: grng() * WORLD_W, w: 30 + grng() * 80, y: 6 + grng() * 60, a: 0.02 + grng() * 0.04 });
  }
  const pagodas = [];
  for (let i = 0; i < 4; i++) {
    pagodas.push({
      x: 0.06 + i * 0.29 + (i === 1 ? 0.1 : 0) + (i === 3 ? -0.08 : 0),
      base: 0.78 + (i % 2) * 0.04,
      scale: 0.55 + i * 0.08,
      depth: 0.06 + (i % 3) * 0.035,
      windows: i === 1 || i === 2,
    });
  }
  const mistBands = [];
  for (let i = 0; i < 5; i++) {
    mistBands.push({ y: 0.72 + i * 0.045, h: 10 + rng() * 22, speed: 0.3 + rng() * 0.7, phase: rng() * TAU, alpha: 0.02 + rng() * 0.035 });
  }
  const embers = [];
  for (let i = 0; i < 28; i++) {
    embers.push({ x: rng(), y: 0.3 + rng() * 0.7, speed: 0.006 + rng() * 0.02, phase: rng() * TAU, size: 0.6 + rng() * 1.8, drift: 0.2 + rng() * 0.7 });
  }
  return { stars, bamboo, grass, groundCracks, slabs, pagodas, mistBands, embers };
}

function screenBackground() {
  const w = view.w;
  const h = view.h;
  const sc = view.scale;
  const camFrac = game.camera.x / Math.max(1, WORLD_W);
  const groundY = (GROUND_Y - view.camY) * sc;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#04050d");
  sky.addColorStop(0.35, "#080817");
  sky.addColorStop(0.62, "#160b17");
  sky.addColorStop(0.82, "#28111c");
  sky.addColorStop(1, "#160c12");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // faint red nebula wash
  const neb = ctx.createRadialGradient(w * 0.72, h * 0.3, 0, w * 0.72, h * 0.3, w * 0.55);
  neb.addColorStop(0, "rgba(128,26,44,0.12)");
  neb.addColorStop(0.55, "rgba(70,16,32,0.05)");
  neb.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, w, h);

  // stars
  for (const st of BG.stars) {
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(game.realTime * st.speed + st.phase));
    const x = ((st.x - camFrac * 0.02) % 1 + 1) % 1 * w;
    const y = st.y * (groundY * 0.92);
    ctx.globalAlpha = tw * (st.warm ? 0.6 : 0.42);
    ctx.fillStyle = st.warm ? "#e6a28c" : "#d9e2ef";
    ctx.beginPath();
    ctx.arc(x, y, st.r * Math.max(0.7, sc * 0.85), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // moon
  const moonX = w * 0.735 - (camFrac - 0.5) * w * 0.09;
  const moonY = h * 0.225;
  const moonR = Math.min(w, h) * 0.155;
  const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.55, moonX, moonY, moonR * 2.7);
  halo.addColorStop(0, "rgba(255,120,100,0.18)");
  halo.addColorStop(0.35, "rgba(200,64,80,0.08)");
  halo.addColorStop(1, "rgba(120,20,40,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  const mg = ctx.createRadialGradient(moonX - moonR * 0.25, moonY - moonR * 0.3, moonR * 0.08, moonX, moonY, moonR);
  mg.addColorStop(0, "#ffe3ca");
  mg.addColorStop(0.28, "#f4b39d");
  mg.addColorStop(0.62, "#c85a60");
  mg.addColorStop(0.86, "#8b2d40");
  mg.addColorStop(1, "#5a1a2c");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, TAU);
  ctx.fill();

  // moon blotches
  ctx.save();
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, TAU);
  ctx.clip();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#6c2635";
  ctx.beginPath();
  ctx.ellipse(moonX - moonR * 0.3, moonY - moonR * 0.2, moonR * 0.28, moonR * 0.14, -0.4, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(moonX + moonR * 0.18, moonY + moonR * 0.33, moonR * 0.34, moonR * 0.16, 0.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(moonX + moonR * 0.3, moonY - moonR * 0.35, moonR * 0.2, moonR * 0.09, 0.7, 0, TAU);
  ctx.fill();
  ctx.restore();
  // moon rim
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(255,196,160,0.28)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR - 0.5, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // soft cloud haze crossing the moon
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const cy = moonY - moonR * 0.34 + i * moonR * 0.33;
    const cw = moonR * (1.35 + i * 0.3);
    const grad = ctx.createRadialGradient(
      moonX + Math.sin(game.realTime * 0.035 + i * 2.1) * moonR * 0.12, cy, 0,
      moonX + Math.sin(game.realTime * 0.035 + i * 2.1) * moonR * 0.12, cy, cw
    );
    grad.addColorStop(0, "rgba(14,10,18,0.18)");
    grad.addColorStop(0.55, "rgba(14,10,18,0.11)");
    grad.addColorStop(1, "rgba(14,10,18,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(moonX + (i - 1) * moonR * 0.12, cy, cw, moonR * (0.09 + i * 0.03), -0.06 + i * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const horizon = groundY - 92 * sc;

  // distant mountains
  ridge(horizon + 6 * sc, h, 120 * sc, 0.011, camFrac, 0.035, 0.35, "#0a0b18", 0);
  ridge(horizon + 18 * sc, h, 90 * sc, 0.016, camFrac, 0.07, 1.7, "#0d0d1c", 0.06);
  ridge(horizon + 34 * sc, h, 60 * sc, 0.023, camFrac, 0.12, 3.4, "#110f1d", 0.1);

  // pagodas
  for (const pg of BG.pagodas) {
    const px = ((pg.x - camFrac * pg.depth * 4) % 1.2 + 1.2) % 1.2 * w - w * 0.08;
    if (px < -w * 0.15 || px > w * 1.1) continue;
    drawPagoda(px, groundY - 48 * sc, pg.scale * sc * Math.min(w / 960, 1.6), pg.windows);
  }

  // bamboo forest
  drawBamboo(camFrac, groundY, horizon, sc);

  // mist
  for (const mb of BG.mistBands) {
    const y = h * mb.y;
    const off = (game.realTime * mb.speed * 12 + Math.sin(mb.phase + game.realTime * 0.2) * 20) % (w + 300);
    const grad = ctx.createLinearGradient(0, y - mb.h, 0, y + mb.h);
    grad.addColorStop(0, "rgba(190,140,140,0)");
    grad.addColorStop(0.5, `rgba(180,120,130,${mb.alpha})`);
    grad.addColorStop(1, "rgba(190,140,140,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(-100 + off * 0.1, y - mb.h, w + 200, mb.h * 2);
  }

  // ambient drifting embers in screen space
  for (const em of BG.embers) {
    const t = game.realTime;
    const x = ((em.x + Math.sin(t * 0.13 + em.phase) * 0.03 - camFrac * 0.06 * em.drift) % 1 + 1) % 1 * w;
    const y = ((em.y - t * em.speed * 0.06) % 1 + 1) % 1 * (groundY + 20);
    const a = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + em.phase));
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, x, y, em.size * 4 * Math.max(0.7, sc), "#ffb27a", 0.7);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = 1;
}

function ridge(baseY, h, amp, freq, camFrac, speed, phase, color, rim) {
  const w = view.w;
  const off = camFrac * w * speed;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 12; x += 12) {
    const xx = x + off;
    const y = baseY
      - Math.sin(xx * freq + phase) * amp
      - Math.sin(xx * freq * 2.37 + phase * 1.7) * amp * 0.34
      - Math.sin(xx * freq * 0.47 + phase * 0.6) * amp * 0.5
      - amp * 0.35;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (rim > 0) {
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#b27a84";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPagoda(x, baseY, s, windows) {
  ctx.save();
  ctx.translate(x, baseY);
  const col = "rgba(10,9,16,0.92)";
  ctx.fillStyle = col;
  // base
  ctx.fillRect(-18 * s, -8 * s, 36 * s, 10 * s);
  for (let i = 0; i < 4; i++) {
    const y = -8 * s - i * 22 * s;
    const width = (34 - i * 6) * s;
    ctx.fillRect(-5 * s, y - 16 * s, 10 * s, 18 * s);
    // roof
    ctx.beginPath();
    ctx.moveTo(-width * 0.7, y - 14 * s);
    ctx.quadraticCurveTo(-width * 0.25, y - 20 * s, 0, y - 24 * s);
    ctx.quadraticCurveTo(width * 0.25, y - 20 * s, width * 0.7, y - 14 * s);
    ctx.quadraticCurveTo(width * 0.45, y - 11 * s, width * 0.3, y - 12 * s);
    ctx.lineTo(-width * 0.3, y - 12 * s);
    ctx.quadraticCurveTo(-width * 0.45, y - 11 * s, -width * 0.7, y - 14 * s);
    ctx.closePath();
    ctx.fill();
    if (windows) {
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(game.realTime * 1.2 + i);
      ctx.fillStyle = "#d98a5c";
      ctx.fillRect(-1.8 * s, y - 8 * s, 1.6 * s, 2.2 * s);
      ctx.fillRect(1.0 * s, y - 8 * s, 1.6 * s, 2.2 * s);
      ctx.fillStyle = col;
      ctx.globalAlpha = 1;
    }
  }
  // finial
  ctx.fillStyle = col;
  ctx.fillRect(-0.8 * s, -116 * s, 1.6 * s, 18 * s);
  ctx.beginPath();
  ctx.arc(0, -118 * s, 2 * s, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBamboo(camFrac, groundY, horizon, sc) {
  const w = view.w;
  for (const b of BG.bamboo) {
    const parallax = b.depth;
    let x = (((b.x - camFrac * parallax * 0.9) % 1) + 1) % 1 * w;
    if (x < -40 || x > w + 40) continue;
    const sway = Math.sin(game.realTime * 0.55 + b.phase) * b.sway * (0.6 + parallax);
    const topY = groundY - b.h * (0.5 + parallax * 0.65) * Math.max(0.75, sc);
    const alpha = 0.18 + parallax * 0.5;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#0c0b13";
    ctx.lineWidth = b.w * Math.max(0.7, sc);
    ctx.beginPath();
    ctx.moveTo(x, groundY + 4);
    ctx.quadraticCurveTo(x + sway * 0.4, (groundY + topY) / 2, x + sway, topY);
    ctx.stroke();
    // nodes
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const nx = x + sway * t * t;
      const ny = lerp(groundY + 4, topY, t);
      ctx.beginPath();
      ctx.moveTo(nx - 2.2 * sc, ny);
      ctx.lineTo(nx + 2.2 * sc, ny);
      ctx.stroke();
    }
    // leaves
    const lrng = mulberry32(b.leafSeed * 1000);
    for (let i = 0; i < b.leaves; i++) {
      const t = 0.45 + lrng() * 0.5;
      const nx = x + sway * t * t;
      const ny = lerp(groundY, topY, t);
      const dir = i % 2 === 0 ? 1 : -1;
      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate(dir * 0.55 + Math.sin(game.realTime * 0.7 + i + b.phase) * 0.12);
      ctx.fillStyle = "#0d0c14";
      ctx.beginPath();
      ctx.ellipse(dir * 5 * Math.max(0.7, sc), 0, 8 * Math.max(0.7, sc), 1.6 * Math.max(0.7, sc), dir * 0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function worldTransform() {
  const s = view.scale * view.dpr;
  const cam = game.camera;
  ctx.setTransform(s, 0, 0, s, (-cam.x + cam.shakeX) * s, (-view.camY + cam.shakeY) * s);
}

function screenTransform() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

/* ---------------- stage ---------------- */
function drawStage() {
  const x0 = game.camera.x - 160;
  const x1 = game.camera.x + view.viewW + 160;
  const bottom = view.camY + view.viewH + 120;

  // torii gates at the arena edges
  drawTorii(78, GROUND_Y + 2, 1.08);
  drawTorii(WORLD_W - 78, GROUND_Y + 2, 1.08);

  // ground body
  const g = ctx.createLinearGradient(0, GROUND_Y - 2, 0, bottom);
  g.addColorStop(0, "#211a18");
  g.addColorStop(0.16, "#191416");
  g.addColorStop(0.55, "#0e0c11");
  g.addColorStop(1, "#07060a");
  ctx.fillStyle = g;
  ctx.fillRect(x0, GROUND_Y - 2, x1 - x0, bottom - GROUND_Y + 2);

  // top stone lip
  ctx.fillStyle = "#33291f";
  ctx.fillRect(x0, GROUND_Y - 3, x1 - x0, 4);
  ctx.fillStyle = "rgba(205,180,140,0.25)";
  ctx.fillRect(x0, GROUND_Y - 3, x1 - x0, 1);
  ctx.fillStyle = "rgba(255,120,90,0.07)";
  ctx.fillRect(x0, GROUND_Y + 1, x1 - x0, 2);

  // stone slabs
  const startX = Math.floor(x0 / 92) * 92;
  for (let x = startX; x < x1; x += 92) {
    ctx.strokeStyle = "rgba(180,155,120,0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 2);
    ctx.lineTo(x + 3, GROUND_Y + 30);
    ctx.lineTo(x - 2, GROUND_Y + 72);
    ctx.lineTo(x + 4, bottom);
    ctx.stroke();
  }
  const s0 = Math.floor(x0 / 140) * 140;
  for (let x = s0; x < x1; x += 140) {
    ctx.strokeStyle = "rgba(180,155,120,0.04)";
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 38);
    ctx.lineTo(x + 110, GROUND_Y + 40);
    ctx.stroke();
  }

  // cracks / moss
  for (const c of BG.groundCracks) {
    if (c.x < x0 - 40 || c.x > x1 + 40) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    ctx.strokeStyle = "rgba(8,7,10,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-c.len / 2, 0);
    ctx.lineTo(-c.len * 0.15, 1.5);
    ctx.lineTo(c.len * 0.2, -1);
    ctx.lineTo(c.len / 2, 1);
    ctx.stroke();
    if (c.branches) {
      ctx.beginPath();
      ctx.moveTo(-c.len * 0.1, 0);
      ctx.lineTo(c.len * 0.05, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // subtle slab shading & pebbles
  for (const sl of BG.slabs) {
    if (sl.x < x0 || sl.x > x1) continue;
    ctx.fillStyle = `rgba(120,104,84,${sl.a})`;
    ctx.beginPath();
    ctx.ellipse(sl.x, GROUND_Y + sl.y, sl.w * 0.5, 3.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(205,180,145,0.09)";
  for (let i = 0; i < 24; i++) {
    const px = ((i * 137.3) % (x1 - x0)) + x0;
    ctx.beginPath();
    ctx.ellipse(px, GROUND_Y + 9 + (i % 5) * 13, 2 + (i % 3), 1, 0, 0, TAU);
    ctx.fill();
  }
  // pale moonlight streak on the stone
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const sheen = ctx.createLinearGradient(x0, 0, x1, 0);
  sheen.addColorStop(0, "rgba(255,160,130,0)");
  sheen.addColorStop(0.42, "rgba(255,160,130,0.025)");
  sheen.addColorStop(0.6, "rgba(255,180,140,0.05)");
  sheen.addColorStop(1, "rgba(255,160,130,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(x0, GROUND_Y + 1, x1 - x0, 2);
  ctx.restore();

  // lantern light pools
  for (const lx of [255, WORLD_W - 255]) {
    if (lx < x0 - 80 || lx > x1 + 80) continue;
    drawStoneLantern(lx, GROUND_Y);
  }
}

function drawTorii(x, baseY, s) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(s, s);
  const dark = "rgba(12,10,15,0.96)";
  ctx.fillStyle = dark;
  // pillars
  ctx.fillRect(-54, -160, 8, 160);
  ctx.fillRect(46, -160, 8, 160);
  // lower beam
  ctx.fillRect(-68, -142, 136, 7);
  // upper curved beam
  ctx.beginPath();
  ctx.moveTo(-82, -172);
  ctx.quadraticCurveTo(0, -158, 82, -172);
  ctx.quadraticCurveTo(0, -148, -82, -172);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-68, -162, 136, 4);
  // plaque
  ctx.fillRect(-9, -164, 18, 12);
  ctx.fillStyle = "rgba(120,30,40,0.22)";
  ctx.fillRect(-54, -160, 8, 4);
  ctx.fillRect(46, -160, 8, 4);
  ctx.restore();
}

function drawStoneLantern(x, baseY) {
  const flicker = 0.7 + 0.3 * Math.sin(game.realTime * 7.3 + x) * Math.sin(game.realTime * 2.1 + x * 0.03);
  ctx.save();
  ctx.translate(x, baseY);
  // post & housing silhouettes
  ctx.fillStyle = "rgba(8,7,10,0.94)";
  ctx.fillRect(-5, -54, 10, 54);
  ctx.fillRect(-12, -66, 24, 6);
  ctx.fillRect(-9, -88, 18, 20);
  ctx.beginPath();
  ctx.moveTo(-18, -88);
  ctx.lineTo(0, -102);
  ctx.lineTo(18, -88);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-2, -102, 4, 8);
  // glow
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, 0, -78, 30, "#ff9a55", 0.28 * flicker);
  ctx.fillStyle = `rgba(255,168,96,${0.55 * flicker})`;
  ctx.fillRect(-5, -82, 10, 10);
  // light pool
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
  pool.addColorStop(0, `rgba(255,126,70,${0.13 * flicker})`);
  pool.addColorStop(1, "rgba(255,126,70,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(0, 0, 100, 18, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawShadowAt(x, groundY, width, alpha) {
  const g = ctx.createRadialGradient(x, groundY, 0, x, groundY, width);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.55})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1, width, width * 0.28, 0, 0, TAU);
  ctx.fill();
}

/* ---------------- player draw ---------------- */
function drawScarf(p) {
  const pts = p.scarf;
  if (!pts || pts.length < 3) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const w = lerp(5.6, 0.8, i / (n - 1));
    left.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w });
    right.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w });
  }
  const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[n - 1].x, pts[n - 1].y);
  grad.addColorStop(0, "#e33a52");
  grad.addColorStop(0.35, "#b8213c");
  grad.addColorStop(1, "rgba(84,10,24,0.55)");
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.shadowColor = "rgba(255,60,80,0.5)";
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.shadowBlur = 0;
  // bright edge
  ctx.strokeStyle = "rgba(255,140,140,0.45)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const p = game.player;
  if (!p) return;
  const alt = Math.max(0, GROUND_Y - p.y);
  const shadowAlpha = clamp(0.36 - alt * 0.0009, 0.08, 0.36);
  const shadowW = clamp(27 - alt * 0.03, 12, 27);
  drawShadowAt(p.x, GROUND_Y, shadowW, shadowAlpha);

  // air slash winds
  if (!p.grounded && Math.abs(p.vy) > 500) {
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = "#d6e4ea";
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - 9 + i * 12, p.y - 50 + i * 7);
      ctx.lineTo(p.x - 5 + i * 12, p.y - 12 + i * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawScarf(p);
  if (p.state === "skill") drawSkillAura(p);
  const pose = computePlayerPose(p);

  // dash speed lines
  if (p.state === "dash") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const yy = p.y - 12 - i * 11;
      const len = 34 + Math.random() * 30;
      ctx.globalAlpha = 0.12 + Math.random() * 0.12;
      ctx.strokeStyle = "#ff7d86";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.dashDir * (18 + Math.random() * 10), yy);
      ctx.lineTo(p.x - p.dashDir * (18 + len), yy - 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // charge aura
  if (p.state === "charge") {
    const lv = p.chargeLevel;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pulse = 0.7 + 0.3 * Math.sin(game.time * 18);
    glowCircle(ctx, p.x, p.y - 36, 42 + lv * 28, lv > 0.8 ? "#ffc06a" : "#ff5c58", (0.1 + lv * 0.16) * pulse);
    ctx.globalAlpha = 0.35 + lv * 0.3;
    ctx.strokeStyle = lv > 0.8 ? "#ffe0a0" : "#ff7a68";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 28 + lv * 20, -0.4 + game.time * 2, 0.7 + game.time * 2);
    ctx.stroke();
    ctx.restore();
  }

  // parry flash
  if (p.parryFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, p.x + p.facing * 14, p.y - 40, 40, "#ffe3a2", p.parryFlash * 0.3);
    ctx.globalAlpha = p.parryFlash * 0.8;
    ctx.strokeStyle = "#fff2c8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x + p.facing * 14, p.y - 40, 34 + (1 - p.parryFlash) * 32, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  let alpha = 1;
  if (p.hurtFlash > 0.6 && p.iframes > 0.1) {
    alpha = 0.72 + 0.28 * Math.sin(game.realTime * 55);
  }
  if (p.state === "skill" && p.skill && p.skill.id === 2) {
    if (p.skill.t < 0.13) alpha = 0.08;
    else if (p.skill.t < 0.23) alpha = 0.7;
  }
  drawPlayerFigure(pose, {
    alpha,
    animTime: p.animTime,
    flash: p.hurtFlash,
    chargeLevel: p.chargeLevel,
    state: p.state,
  });

  // interaction hint glint at first sight
  if (game.mode === "title") {
    // subtle idle glow
  }
}

function drawPlayerFigure(pose, opts = {}) {
  const ghost = !!opts.ghost;
  const alpha = (opts.alpha != null ? opts.alpha : 1) * (ghost ? 0.52 : 1);
  const t = opts.animTime != null ? opts.animTime : game.time;
  const flash = opts.flash || 0;
  const C = ghost ? null : PC;
  const col = (c) => {
    if (ghost) return "rgba(255,82,102,0.9)";
    if (flash > 0.01) return mixHex(c, "#ffffff", Math.min(0.7, flash * 0.8));
    return c;
  };
  const dark = ghost ? "rgba(130,22,42,0.75)" : col(PC.coatDark);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pose.x, pose.y);
  ctx.scale(pose.facing, 1);
  if (pose.spin) {
    ctx.translate(0, -32);
    ctx.rotate(pose.spin);
    ctx.translate(0, 32);
  }

  // coat tails (behind)
  drawPlayerCoatTails(pose, ghost, t, col);

  // back leg
  drawPlayerLeg(pose, "L", ghost, col, dark);
  // back arm
  drawPlayerArm(pose, "L", ghost, col, dark);

  // torso
  drawPlayerTorso(pose, ghost, col, dark);

  // head
  drawPlayerHead(pose, ghost, t, col, dark, flash);

  // front leg
  drawPlayerLeg(pose, "R", ghost, col, dark);

  // front arm + sword
  drawPlayerArm(pose, "R", ghost, col, dark);
  drawPlayerSword(pose, ghost, opts, col, dark, t);

  ctx.restore();
}

function drawPlayerCoatTails(pose, ghost, t, col) {
  const hip = pose.hip;
  const sway = Math.sin(t * 3.1) * 2.5 + (pose.state === "dash" ? -7 : 0);
  const sway2 = Math.cos(t * 2.3 + 1) * 2;
  const baseY = hip.y + 2;
  const tail1 = [
    { x: hip.x - 4, y: baseY - 2 },
    { x: hip.x - 15 + sway * 0.2, y: baseY + 16 },
    { x: hip.x - 30 + sway, y: baseY + 34 + sway2 },
    { x: hip.x - 20 + sway * 0.5, y: baseY + 22 },
    { x: hip.x + 2, y: baseY + 6 },
  ];
  const tail2 = [
    { x: hip.x - 2, y: baseY - 1 },
    { x: hip.x - 8 + sway2 * 0.2, y: baseY + 17 },
    { x: hip.x - 17 + sway * 0.7, y: baseY + 30 + sway },
    { x: hip.x - 8, y: baseY + 20 },
    { x: hip.x + 3, y: baseY + 6 },
  ];
  ctx.fillStyle = col(PC.coatDark);
  poly(ctx, tail1, col(PC.coatDark));
  poly(ctx, tail2, col(PC.coat));
  // red lining
  ctx.save();
  ctx.globalAlpha *= 0.85;
  poly(ctx, [
    { x: tail1[1].x + 1, y: tail1[1].y - 2 },
    { x: tail1[2].x + 1, y: tail1[2].y - 3 },
    { x: tail1[2].x + 7, y: tail1[2].y - 5 },
    { x: tail1[1].x + 6, y: tail1[1].y - 1 },
  ], ghost ? "rgba(255,120,130,0.3)" : PC.lining);
  ctx.restore();
}

function drawPlayerLeg(pose, side, ghost, col, dark) {
  const hip = side === "R" ? pose.hipR : pose.hipL;
  const knee = side === "R" ? pose.kneeR : pose.kneeL;
  const foot = side === "R" ? pose.footR : pose.footL;
  const back = side === "L";
  const cloth = back ? col(PC.coatDark) : col(PC.coat);
  const inner = back ? dark : col(PC.boot);
  // thigh
  lineRod(ctx, hip, knee, 10.5, dark);
  lineRod(ctx, hip, knee, 7.8, cloth);
  // shin
  lineRod(ctx, knee, foot, 7.6, dark);
  lineRod(ctx, knee, foot, 5.4, inner);
  // knee highlight
  if (!ghost) {
    ctx.globalAlpha *= 0.5;
    circle(ctx, knee.x, knee.y, 1.6, "#8090a0");
    ctx.globalAlpha /= 0.5;
  }
  // foot / boot
  const dir = foot.x - knee.x >= 0 ? 1 : 1;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(foot.x + 4.4, foot.y - 2.2, 7.2, 3.4, 0, 0, TAU);
  ctx.fill();
  if (!ghost) {
    ctx.fillStyle = col(PC.boot);
    ctx.beginPath();
    ctx.ellipse(foot.x + 4.2, foot.y - 2.6, 6.2, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(200,170,110,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(foot.x + 1, foot.y - 4);
    ctx.lineTo(foot.x + 8, foot.y - 4);
    ctx.stroke();
  }
}

function drawPlayerArm(pose, side, ghost, col, dark) {
  const sh = side === "R" ? pose.shoulderR : pose.shoulderL;
  const el = side === "R" ? pose.elbowR : pose.elbowL;
  const hand = side === "R" ? pose.handR : pose.handL;
  const back = side === "L";
  // sleeve from shoulder to elbow
  lineRod(ctx, sh, el, 9.2, dark);
  lineRod(ctx, sh, el, 6.6, back ? col(PC.coatDark) : col(PC.coatLight));
  // forearm
  lineRod(ctx, el, hand, 5.8, dark);
  lineRod(ctx, el, hand, 3.9, back ? col(PC.coatDark) : col(PC.coat));
  // cuff
  if (!ghost) {
    ctx.globalAlpha *= 0.6;
    lineRod(ctx, pointAlong(el, hand, 0.82), pointAlong(el, hand, 0.9), 5.2, PC.gold);
    ctx.globalAlpha /= 0.6;
  }
  // hand
  ctx.fillStyle = dark;
  circle(ctx, hand.x, hand.y, 3.6, dark);
  if (!ghost) {
    circle(ctx, hand.x, hand.y, 2.4, col(PC.skin));
    ctx.fillStyle = "rgba(74,52,44,0.8)";
    ctx.beginPath();
    ctx.ellipse(hand.x + 0.4, hand.y, 2.1, 1.1, 0, 0, TAU);
    ctx.fill();
  }
  // shoulder pad (front side only)
  if (!back) {
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(-0.2);
    poly(ctx, [
      { x: -5.2, y: -3.4 },
      { x: 5.4, y: -2.4 },
      { x: 5.8, y: 2.4 },
      { x: -4.2, y: 3.2 },
    ], dark);
    poly(ctx, [
      { x: -3.6, y: -2.4 },
      { x: 3.4, y: -1.7 },
      { x: 3.8, y: 1.2 },
      { x: -3, y: 1.8 },
    ], ghost ? "rgba(255,90,110,0.5)" : PC.coatLight);
    ctx.strokeStyle = ghost ? "rgba(255,120,130,0.4)" : "rgba(199,164,94,0.55)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayerTorso(pose, ghost, col, dark) {
  const hip = pose.hip;
  const chest = pose.chest;
  const sL = pose.shoulderL;
  const sR = pose.shoulderR;
  const torso = [
    { x: sL.x - 1.5, y: sL.y - 2 },
    { x: sR.x + 2, y: sR.y - 2 },
    { x: chest.x + 7.2, y: chest.y + 5 },
    { x: hip.x + 8, y: hip.y + 1 },
    { x: hip.x - 7.4, y: hip.y + 2 },
    { x: chest.x - 7.6, y: chest.y + 7 },
  ];
  // dark under-coat
  poly(ctx, torso, dark);
  // main wrap
  const inner = ghost ? "rgba(255,82,102,0.8)" : col(PC.coat);
  poly(ctx, [
    { x: sL.x, y: sL.y - 0.5 },
    { x: sR.x + 0.5, y: sR.y - 0.5 },
    { x: chest.x + 5.8, y: chest.y + 6 },
    { x: hip.x + 6.4, y: hip.y },
    { x: hip.x - 5.6, y: hip.y + 1 },
    { x: chest.x - 6.2, y: chest.y + 6 },
  ], inner);
  // exposed crimson lining down the front
  ctx.save();
  ctx.globalAlpha *= 0.9;
  poly(ctx, [
    { x: chest.x + 2.4, y: chest.y + 2 },
    { x: chest.x + 6.2, y: chest.y + 7 },
    { x: hip.x + 6.4, y: hip.y - 2 },
    { x: hip.x + 2.2, y: hip.y - 2 },
    { x: chest.x - 1, y: chest.y + 9 },
  ], ghost ? "rgba(255,150,150,0.35)" : PC.lining);
  ctx.restore();
  // sash
  ctx.fillStyle = ghost ? "rgba(180,40,60,0.7)" : PC.lining;
  ctx.save();
  ctx.translate(hip.x, hip.y - 2);
  ctx.rotate(pose.lean * 0.4);
  ctx.fillRect(-9, -2.4, 18, 4.4);
  ctx.fillStyle = ghost ? "rgba(255,120,130,0.5)" : PC.gold;
  ctx.fillRect(-1.6, -3.2, 3.2, 6);
  ctx.restore();
  // diagonal chest strap
  ctx.strokeStyle = ghost ? "rgba(255,120,130,0.35)" : "rgba(151,70,55,0.65)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(chest.x - 5, chest.y + 3);
  ctx.lineTo(chest.x + 5, chest.y + 15);
  ctx.stroke();
  // moonlight rim
  if (!ghost) {
    ctx.save();
    ctx.globalAlpha *= 0.55;
    ctx.strokeStyle = "rgba(174,205,225,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chest.x - 6.4, chest.y + 4);
    ctx.quadraticCurveTo(chest.x - 8, hip.y - 6, hip.x - 7, hip.y - 1);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayerHead(pose, ghost, t, col, dark, flash) {
  const h = pose.head;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(pose.headTilt + pose.lean * 0.25);
  // hair mass
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-1.4, 0.8, 8.8, 9.2, -0.15, 0, TAU);
  ctx.fill();
  // topknot / tied hair
  ctx.fillStyle = ghost ? "rgba(255,100,110,0.8)" : PC.hair;
  ctx.beginPath();
  ctx.ellipse(-4.5, -8.4, 5.6, 2.8, -0.55, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.quadraticCurveTo(-14, -13, -9, -4);
  ctx.quadraticCurveTo(-7, -5, -5, -6);
  ctx.closePath();
  ctx.fill();
  // mask
  const maskGrad = ctx.createLinearGradient(0, -6, 0, 8);
  if (ghost) {
    maskGrad.addColorStop(0, "rgba(255,160,160,0.5)");
    maskGrad.addColorStop(1, "rgba(255,90,100,0.35)");
  } else {
    maskGrad.addColorStop(0, flash > 0.01 ? "#ffffff" : "#f2ead9");
    maskGrad.addColorStop(1, flash > 0.01 ? "#ffffff" : "#cdbfa7");
  }
  ctx.fillStyle = maskGrad;
  ctx.beginPath();
  ctx.ellipse(2.2, 0.4, 6.4, 7.6, -0.06, 0, TAU);
  ctx.fill();
  // mask brow / snout shading
  ctx.strokeStyle = "rgba(74,58,48,0.5)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(5.2, -4.4);
  ctx.quadraticCurveTo(7.4, -1.8, 6.2, 1.2);
  ctx.stroke();
  // eye slits
  if (!ghost) {
    ctx.fillStyle = "#1a1518";
    ctx.beginPath();
    ctx.ellipse(2.2, -1.4, 3.1, 0.9, -0.08, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-1.9, -1.1, 1.9, 0.8, 0.08, 0, TAU);
    ctx.fill();
    // glowing eye
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 3.4, -1, 4.5, "#ff5964", 0.5);
    ctx.fillStyle = "rgba(255,190,160,0.95)";
    ctx.beginPath();
    ctx.ellipse(3.4, -1.4, 1.15, 0.65, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // red marking
    ctx.strokeStyle = "rgba(160,30,48,0.8)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(4.6, 0.2);
    ctx.lineTo(6.4, 3.4);
    ctx.lineTo(5.2, 6.2);
    ctx.stroke();
    // mouth line
    ctx.strokeStyle = "rgba(70,54,48,0.45)";
    ctx.beginPath();
    ctx.moveTo(2.2, 4.2);
    ctx.lineTo(4.4, 4.5);
    ctx.stroke();
  }
  // hood shadow / rim
  ctx.save();
  ctx.globalAlpha *= 0.6;
  ctx.strokeStyle = "rgba(190,215,235,0.5)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(0, -1, 8.2, -2.4, -0.6);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawPlayerSword(pose, ghost, opts, col, dark, t) {
  const hand = pose.handR;
  const ang = pose.bladeAngle;
  const len = pose.bladeLen;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const px = -dy;
  const py = dx;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);
  // handle
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(3, 0);
  ctx.stroke();
  if (!ghost) {
    ctx.strokeStyle = "#51302f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();
    ctx.strokeStyle = PC.gold;
    ctx.lineWidth = 0.8;
    for (let i = -7; i < 2; i += 2.2) {
      ctx.beginPath();
      ctx.moveTo(i, -1.2);
      ctx.lineTo(i + 1.2, 1.2);
      ctx.stroke();
    }
    // pommel
    circle(ctx, -9, 0, 2.1, PC.gold);
  }
  // guard
  ctx.strokeStyle = ghost ? "rgba(255,140,150,0.6)" : PC.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(3, -4.2);
  ctx.lineTo(3, 4.2);
  ctx.stroke();
  // blade
  const base = 5;
  const tip = len;
  const baseW = 2.1;
  const tipW = 0.55;
  if (ghost) {
    ctx.strokeStyle = "rgba(255,110,120,0.8)";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(base, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();
  } else {
    ctx.save();
    const glow = (opts.state === "attack" || opts.state === "charge" || opts.state === "skill")
      ? 0.55 + (opts.chargeLevel || 0) * 0.4
      : 0.2 + 0.08 * Math.sin(t * 2.5);
    ctx.shadowColor = `rgba(255,74,92,${glow})`;
    ctx.shadowBlur = 8 + (opts.chargeLevel || 0) * 12;
    const bg = ctx.createLinearGradient(base, -baseW, tip, baseW * 0.4);
    bg.addColorStop(0, PC.bladeDim);
    bg.addColorStop(0.35, "#f5fbfb");
    bg.addColorStop(0.7, "#cfdde0");
    bg.addColorStop(1, "#f2f8f8");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(base, -baseW);
    ctx.lineTo(tip, -tipW);
    ctx.lineTo(tip + 1.4, 0);
    ctx.lineTo(tip, tipW * 1.4);
    ctx.lineTo(base, baseW);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // crimson edge
    ctx.strokeStyle = "rgba(255,72,88,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base, baseW * 0.8);
    ctx.lineTo(tip - 1, tipW * 1.3);
    ctx.stroke();
    // cold highlight
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(base + 2, -baseW * 0.42);
    ctx.lineTo(tip - 2, -tipW * 0.4);
    ctx.stroke();
    // glint travelling down blade
    const glint = ((t * 1.6) % 3) / 3;
    if (glint < 0.24) {
      ctx.globalAlpha = Math.sin((glint / 0.24) * PI) * 0.8;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.8;
      const gx = lerp(base + 4, tip - 2, glint / 0.24);
      ctx.beginPath();
      ctx.moveTo(gx, -1.6);
      ctx.lineTo(gx + 5, 1.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ---------------- afterimages ---------------- */
function drawAfterimages() {
  for (const a of game.afterimages) {
    const alpha = clamp(a.life / a.maxLife, 0, 1) * 0.42;
    if (alpha <= 0.01) continue;
    drawPlayerFigure(a.pose, { ghost: true, alpha, animTime: 0 });
  }
}

/* ---------------- projectiles ---------------- */
function drawProjectiles() {
  for (const pr of game.projectiles) {
    ctx.save();
    if (pr.type === "bolt") {
      // trail
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < (pr.trail || []).length; i++) {
        const tp = pr.trail[i];
        const al = clamp(tp.life / 0.18, 0, 1) * 0.35;
        ctx.globalAlpha = al;
        circle(ctx, tp.x, tp.y, pr.r * (0.35 + al * 0.5), pr.color);
      }
      ctx.globalAlpha = 1;
      glowCircle(ctx, pr.x, pr.y, 26, pr.color, 0.5);
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.angle);
      // bolt
      ctx.fillStyle = "#c9fff6";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-3, -3.6);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 3.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // energy tails
      ctx.strokeStyle = "rgba(143,242,224,0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-14 - Math.random() * 4, -2);
      ctx.moveTo(-4, 0);
      ctx.lineTo(-12 - Math.random() * 4, 2);
      ctx.stroke();
    } else {
      // reflected blade wave (golden crescent)
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < (pr.trail || []).length; i++) {
        const tp = pr.trail[i];
        const al = clamp(tp.life / 0.18, 0, 1) * 0.22;
        ctx.globalAlpha = al;
        circle(ctx, tp.x, tp.y, 12, "#ffe3a0");
      }
      ctx.globalAlpha = 1;
      glowCircle(ctx, pr.x, pr.y, 30, "#ffca72", 0.5);
      ctx.translate(pr.x, pr.y);
      ctx.scale(pr.reflectDir, 1);
      ctx.fillStyle = "rgba(255,230,171,0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 16, -1.2, 1.2);
      ctx.arc(0, 0, 9, 1.2, -1.2, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,240,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}
