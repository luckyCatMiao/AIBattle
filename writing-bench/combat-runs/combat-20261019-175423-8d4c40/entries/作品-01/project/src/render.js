/* =========================================================
   render.js — scenery, arena, severed pieces, orbs
   ========================================================= */

function drawSky(ctx, w, h, cam, time) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0614');
  g.addColorStop(0.45, '#191026');
  g.addColorStop(0.78, '#2b1526');
  g.addColorStop(1, '#120a12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // stars
  ctx.save();
  const parX = cam.x * 0.03;
  for (let i = 0; i < 90; i++) {
    const sx = ((i * 137.5 + 43) % 1600) - parX * 0.2 % 1600;
    const sy = ((i * 79.3) % (h * 0.62));
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.3 + i));
    ctx.globalAlpha = 0.18 + tw * 0.32;
    ctx.fillStyle = i % 7 === 0 ? '#ffc9c0' : '#dfe8ff';
    ctx.fillRect(((sx % (w + 200)) + w + 200) % (w + 200) - 100, sy, 1.4, 1.4);
  }
  ctx.restore();

  // crimson moon
  const mx = w * 0.74 - (cam.x - 960) * 0.04;
  const my = h * 0.2;
  const mr = Math.min(w, h) * 0.13;
  ctx.save();
  const halo = ctx.createRadialGradient(mx, my, mr * 0.55, mx, my, mr * 2.6);
  halo.addColorStop(0, 'rgba(255,84,66,0.30)');
  halo.addColorStop(0.5, 'rgba(190,40,60,0.10)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
  const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  mg.addColorStop(0, '#ffd2b8');
  mg.addColorStop(0.4, '#ff7a5e');
  mg.addColorStop(0.75, '#c9303c');
  mg.addColorStop(1, '#6e1420');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  // moon maria
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#5c0c18';
  for (let i = 0; i < 7; i++) {
    const a = i * 1.7, rr = mr * (0.15 + (i % 3) * 0.18);
    ctx.beginPath(); ctx.arc(mx + Math.cos(a) * rr, my + Math.sin(a) * rr, mr * (0.07 + (i % 2) * 0.06), 0, TAU); ctx.fill();
  }
  ctx.restore();

  // distant mountain silhouettes (3 parallax layers)
  const layers = [
    { f: 0.09, col: '#1d1226', base: 0.66, amp: 0.16, seed: 1.2, step: 210 },
    { f: 0.18, col: '#241427', base: 0.74, amp: 0.13, seed: 3.4, step: 150 },
    { f: 0.32, col: '#2a1620', base: 0.83, amp: 0.09, seed: 6.1, step: 105 }
  ];
  for (const L of layers) {
    ctx.fillStyle = L.col;
    ctx.beginPath();
    ctx.moveTo(-40, h);
    const off = cam.x * L.f;
    for (let x = -40; x <= w + 60; x += 14) {
      const wx = x + off;
      const yy = h * L.base - Math.abs(Math.sin(wx * 0.0016 + L.seed)) * h * L.amp
        - Math.abs(Math.sin(wx * 0.0041 + L.seed * 2.7)) * h * L.amp * 0.35;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w + 60, h);
    ctx.closePath();
    ctx.fill();
  }
  // mist band
  const mist = ctx.createLinearGradient(0, h * 0.62, 0, h * 0.92);
  mist.addColorStop(0, 'rgba(120,60,80,0)');
  mist.addColorStop(0.55, 'rgba(120,60,80,0.16)');
  mist.addColorStop(1, 'rgba(30,14,24,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, h * 0.6, w, h * 0.32);
}

function drawArena(ctx, world) {
  const { x1, x2 } = world.arena;
  const groundY = GROUND_Y;
  // far gate silhouette
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#150b14';
  const gateX = 1550;
  ctx.fillRect(gateX - 90, groundY - 250, 16, 250);
  ctx.fillRect(gateX + 74, groundY - 250, 16, 250);
  ctx.fillRect(gateX - 118, groundY - 268, 236, 18);
  ctx.fillRect(gateX - 104, groundY - 236, 208, 10);
  ctx.restore();

  // ground body
  const gg = ctx.createLinearGradient(0, groundY - 4, 0, groundY + 120);
  gg.addColorStop(0, '#3c2a2c');
  gg.addColorStop(0.2, '#2a1c20');
  gg.addColorStop(1, '#120b10');
  ctx.fillStyle = gg;
  ctx.fillRect(x1 - 240, groundY, (x2 - x1) + 480, 180);
  // top edge highlight
  ctx.fillStyle = '#6e4b44';
  ctx.fillRect(x1 - 240, groundY, (x2 - x1) + 480, 2);
  ctx.fillStyle = 'rgba(255,140,110,0.16)';
  ctx.fillRect(x1 - 240, groundY + 2, (x2 - x1) + 480, 1);

  // stone tile joints
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let x = x1 - 240; x < x2 + 240; x += 96) {
    ctx.beginPath(); ctx.moveTo(x, groundY + 4); ctx.lineTo(x - 26, groundY + 120); ctx.stroke();
  }
  for (let yy = groundY + 26; yy < groundY + 120; yy += 30) {
    ctx.beginPath(); ctx.moveTo(x1 - 240, yy); ctx.lineTo(x2 + 240, yy); ctx.stroke();
  }

  // arena limit posts: braziers
  for (const side of [x1 - 22, x2 + 22]) {
    ctx.fillStyle = '#241a1c';
    ctx.fillRect(side - 7, groundY - 92, 14, 92);
    ctx.fillStyle = '#3a2a2a';
    ctx.fillRect(side - 14, groundY - 96, 28, 10);
    const t = world.time;
    glowCircle(ctx, side, groundY - 104, 46, 'rgba(255,110,60,0.5)', 0.55 + Math.sin(t * 7 + side) * 0.12);
    ctx.fillStyle = '#ffb24a';
    ctx.beginPath();
    ctx.moveTo(side - 7, groundY - 96);
    ctx.quadraticCurveTo(side - 3 + Math.sin(t * 9) * 3, groundY - 116, side, groundY - 124 - Math.sin(t * 13) * 4);
    ctx.quadraticCurveTo(side + 4 + Math.cos(t * 8) * 3, groundY - 112, side + 7, groundY - 96);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff0b8';
    ctx.beginPath();
    ctx.ellipse(side, groundY - 103, 3.4, 6 + Math.sin(t * 15) * 1.5, 0, 0, TAU);
    ctx.fill();
    // chains
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.moveTo(side, groundY - 96); ctx.lineTo(side + 16, groundY - 60); ctx.stroke();
  }

  // near foreground grass tufts & pebbles
  ctx.strokeStyle = 'rgba(150,100,90,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const gx2 = x1 + ((i * 173) % (x2 - x1));
    ctx.beginPath();
    ctx.moveTo(gx2, groundY + 2);
    ctx.quadraticCurveTo(gx2 + 3, groundY - 6, gx2 + 7, groundY - 9);
    ctx.stroke();
  }
  // vignette handled by renderWorld overlay
}

function drawSeveredPiece(ctx, s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  const sc = s.size;
  const fade = clamp(s.life, 0, 1);
  // soft contact shadow when resting
  if (s.rest) {
    ctx.globalAlpha = 0.28 * fade;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 2, 16 * sc, 4 * sc, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = fade;
  if (s.id === 'head') {
    ctx.beginPath(); ctx.arc(0, 0, 11 * sc, 0, TAU);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = s.darker; ctx.lineWidth = 2.2; ctx.stroke();
    // bone-white mask plate
    ctx.beginPath();
    ctx.moveTo(-6 * sc, -3 * sc); ctx.lineTo(7 * sc, -1 * sc);
    ctx.lineTo(6 * sc, 5 * sc); ctx.lineTo(-5 * sc, 4 * sc);
    ctx.closePath();
    ctx.fillStyle = '#efe6cf'; ctx.fill();
    ctx.strokeStyle = s.darker; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ff3b2f';
    ctx.beginPath(); ctx.arc(-1 * sc, 0, 1.6 * sc, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5 * sc, 0.6 * sc, 1.6 * sc, 0, TAU); ctx.fill();
    // torn neck
    ctx.fillStyle = '#7a1c26';
    ctx.beginPath(); ctx.ellipse(-10 * sc, 1 * sc, 4.4 * sc, 6.5 * sc, 0, 0, TAU); ctx.fill();
  } else if (s.id === 'legs') {
    capsule(ctx, -7 * sc, -5 * sc, -10 * sc, 12 * sc, 6.4 * sc, 4.4 * sc);
    ctx.fillStyle = s.color; ctx.fill(); ctx.strokeStyle = s.darker; ctx.lineWidth = 1.8; ctx.stroke();
    capsule(ctx, 7 * sc, -5 * sc, 10 * sc, 12 * sc, 6.4 * sc, 4.4 * sc);
    ctx.fillStyle = s.color; ctx.fill(); ctx.strokeStyle = s.darker; ctx.lineWidth = 1.8; ctx.stroke();
    // belt/hip band joining the pair
    ctx.fillStyle = s.darker;
    ctx.beginPath(); ctx.ellipse(0, -4 * sc, 12 * sc, 5 * sc, 0, 0, TAU); ctx.fill();
    // torn hip
    ctx.fillStyle = '#7a1c26';
    ctx.beginPath(); ctx.ellipse(0, -8 * sc, 9 * sc, 4 * sc, 0, 0, TAU); ctx.fill();
  } else {
    // arm: shoulder joint -> forearm -> claw/blade remnant
    ctx.lineCap = 'round';
    // torn shoulder stump
    ctx.fillStyle = '#7a1c26';
    ctx.beginPath(); ctx.ellipse(-12 * sc, 0, 4.6 * sc, 7 * sc, 0, 0, TAU); ctx.fill();
    capsule(ctx, -11 * sc, 0, 5 * sc, 0, 5.6 * sc, 4.4 * sc);
    ctx.fillStyle = s.color; ctx.fill(); ctx.strokeStyle = s.darker; ctx.lineWidth = 1.8; ctx.stroke();
    // accent cuff
    ctx.strokeStyle = s.accent || s.darker; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(2 * sc, -4 * sc); ctx.lineTo(2 * sc, 4 * sc); ctx.stroke();
    // claw / gauntlet blade
    ctx.beginPath();
    ctx.moveTo(5 * sc, -4.5 * sc); ctx.lineTo(17 * sc, -6 * sc);
    ctx.lineTo(21 * sc, -0.5 * sc); ctx.lineTo(16 * sc, 3 * sc); ctx.lineTo(6 * sc, 4 * sc);
    ctx.closePath();
    ctx.fillStyle = '#d7d1c2'; ctx.fill();
    ctx.strokeStyle = s.darker; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(8 * sc, -1 * sc); ctx.lineTo(18 * sc, -2.5 * sc); ctx.stroke();
  }
  ctx.restore();
}

function drawOrbs(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const o of world.orbs) {
    const col = o.reflected ? '255,215,106' : '255,91,134';
    glowCircle(ctx, o.x, o.y, o.r * 3.4, 'rgba(' + col + ',0.55)', 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.48, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(' + col + ',0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, world.time * 8, world.time * 8 + 4.2); ctx.stroke();
    // tail
    ctx.strokeStyle = 'rgba(' + col + ',0.5)';
    ctx.lineWidth = o.r * 0.9;
    ctx.beginPath(); ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x - o.vx * 0.045, o.y - o.vy * 0.045); ctx.stroke();
  }
  ctx.restore();
}

function drawAmbient(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of world.ambientEmbers) {
    const y = ((e.y - world.time * 14) % 520 + 520) % 520 + 20;
    const x = e.x + Math.sin(world.time * 0.7 + e.ph) * 22;
    ctx.globalAlpha = 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(world.time * 2 + e.ph));
    ctx.fillStyle = Math.sin(e.ph) > 0 ? '#ff7a58' : '#ffc06a';
    ctx.beginPath(); ctx.arc(x, y, e.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawWorld(ctx, world) {
  const cam = world.cam;
  const w = cam.vw, h = cam.vh;

  drawSky(ctx, w, h, cam, world.time);

  ctx.save();
  cam.apply(ctx);
  drawAmbient(ctx, world);
  drawArena(ctx, world);

  // settled debris lies on the ground behind actors; airborne pieces draw on top
  for (const s of world.severed) if (s.rest) drawSeveredPiece(ctx, s);

  // enemies (sorted back to front by y)
  const list = world.enemies.slice().sort((a, b) => a.y - b.y);
  for (const e of list) e.draw(ctx);

  // player
  world.player.draw(ctx, cam);

  // flying limbs in front of the fight so the moment of severing always reads
  for (const s of world.severed) if (!s.rest) drawSeveredPiece(ctx, s);

  // fx in additive mode
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  world.fx.draw(ctx, true);
  ctx.restore();
  world.fx.draw(ctx, false);

  drawOrbs(ctx, world);
  drawSkillWorldFx(ctx, world);

  // telegraph slash warn already in enemy.draw

  world.fx.drawTexts(ctx);

  // soft arena edge falloff: fades in and back out so there is no hard seam
  const fadeW = 190;
  const fadeL = ctx.createLinearGradient(world.arena.x1 - fadeW, 0, world.arena.x1 + 40, 0);
  fadeL.addColorStop(0, 'rgba(6,3,8,0)');
  fadeL.addColorStop(0.45, 'rgba(6,3,8,0.34)');
  fadeL.addColorStop(1, 'rgba(6,3,8,0)');
  ctx.fillStyle = fadeL;
  ctx.fillRect(world.arena.x1 - fadeW, -400, fadeW + 40, 1400);
  const fadeR = ctx.createLinearGradient(world.arena.x2 + fadeW, 0, world.arena.x2 - 40, 0);
  fadeR.addColorStop(0, 'rgba(6,3,8,0)');
  fadeR.addColorStop(0.45, 'rgba(6,3,8,0.34)');
  fadeR.addColorStop(1, 'rgba(6,3,8,0)');
  ctx.fillStyle = fadeR;
  ctx.fillRect(world.arena.x2 - 40, -400, fadeW + 40, 1400);

  ctx.restore();

  // screen vignette
  const vg = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.38, w / 2, h * 0.52, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // damage flash (subtle red edge)
  if (world.uiDamageFlash > 0) {
    const a = world.uiDamageFlash * 0.5;
    const dg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    dg.addColorStop(0, 'rgba(255,30,40,0)');
    dg.addColorStop(1, 'rgba(255,30,40,' + a + ')');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, w, h);
  }
}


function drawSkillWorldFx(ctx, world) {
  const t = world.time;
  // shadow rend marks
  for (const e of world.enemies) {
    if (e.dead || !e._shadowMarked) continue;
    const k = e._shadowMarked / 0.55;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.4 * k;
    ctx.strokeStyle = '#ff4a6a';
    ctx.lineWidth = 2;
    const cx = e.x, cy = e.y - e.h * 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, 30 + 10 * k, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * (TAU / 3);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
      ctx.lineTo(cx + Math.cos(a) * (34 + 8 * k), cy + Math.sin(a) * (34 + 8 * k));
      ctx.stroke();
    }
    ctx.restore();
  }
  // falling falchions
  for (const b of world.bladeRain) {
    if (b.done) continue;
    const visible = b.delay <= 0.35;
    if (!visible) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    // soft glow trail
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, -120, 0, 0);
    g.addColorStop(0, 'rgba(150,200,255,0)');
    g.addColorStop(1, 'rgba(190,230,255,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(-4, -130, 8, 130);
    ctx.globalCompositeOperation = 'source-over';
    // blade body
    ctx.rotate(0.18);
    poly(ctx, [[-5, -26], [6, -26], [9, 14], [0, 40], [-9, 14]]);
    ctx.fillStyle = '#dceaff'; ctx.fill();
    ctx.strokeStyle = '#5a7fa8'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 10); ctx.stroke();
    ctx.restore();
  }
}

function drawSkillScreenFx(ctx, world) {
  const u = world.ultimate;
  const w = world.cam.vw, h = world.cam.vh;
  if (u) {
    const k = clamp(u.t / u.end, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // crimson vignette pulse
    const a = 0.16 + 0.14 * Math.sin(k * Math.PI * 6);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(255,40,50,0)');
    g.addColorStop(1, 'rgba(255,40,50,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // converging speed lines toward the player
    const px = world.player.x - world.cam.x + w / 2 - world.cam.offX;
    const py = world.player.y - 40 - world.cam.y + h / 2 - world.cam.offY;
    ctx.globalAlpha = 0.10 + 0.12 * Math.sin(k * 40);
    ctx.strokeStyle = '#ff9a9a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const ang = i * 0.2857 + k * 1.4;
      const r0 = 120 + 90 * Math.sin(i * 1.7 + k * 9);
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(ang) * r0, py + Math.sin(ang) * r0 * 0.72);
      ctx.lineTo(px + Math.cos(ang) * (r0 + 150), py + Math.sin(ang) * (r0 + 150) * 0.72);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (world.slowmoT > 0 && !u) {
    ctx.save();
    ctx.fillStyle = 'rgba(40,70,110,' + (0.05 * world.slowmoT).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
