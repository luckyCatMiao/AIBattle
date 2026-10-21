/* ============================================================
   Telegraphs, enemy HUD, master render
   ============================================================ */

function drawEnemyTelegraphZones() {
  for (const e of game.enemies) {
    if (!e.alive || !e.tele || e.state !== "windup") continue;
    const t = e.tele;
    const p = clamp(t.p || 0, 0, 1);
    const s = e.scale;
    const pulse = 0.62 + 0.38 * Math.sin(game.time * 22 + e.id);
    const alpha = 0.09 + p * 0.13;
    const edge = 0.3 + p * 0.42;
    const kind = t.kind;

    if (kind === "chop" || kind === "swipe" || kind === "kick" || kind === "bite") {
      const reach = (e.atk.reach + e.atk.r * 0.7 + 22) * s;
      ctx.save();
      ctx.translate(e.x, GROUND_Y);
      ctx.scale(e.facing, 1);
      // ground fan
      ctx.save();
      ctx.scale(1, 0.26);
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, reach);
      grad.addColorStop(0, `rgba(255,70,74,${alpha * 0.45})`);
      grad.addColorStop(0.7, `rgba(255,66,72,${alpha})`);
      grad.addColorStop(1, "rgba(255,66,72,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, -0.72, 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,120,100,${edge * 0.85})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, reach * 0.98, -0.72, 0.72);
      ctx.stroke();
      ctx.restore();
      // arcing danger line at body height
      ctx.globalAlpha = edge * 0.55;
      ctx.strokeStyle = "#ff6c60";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, -34 * s, (e.atk.reach + 26) * s, -0.7, 0.7);
      ctx.stroke();
      // leading sparkle
      const t0 = -0.7 + ((game.time * 1.8) % 1.4);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,190,140,0.85)";
      ctx.beginPath();
      ctx.arc(Math.cos(t0) * (e.atk.reach + 26) * s, -34 * s + Math.sin(t0) * (e.atk.reach + 26) * s, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (kind === "headbutt") {
      ctx.save();
      ctx.translate(e.x, GROUND_Y);
      ctx.scale(e.facing, 1);
      const len = 195 * s;
      const grad = ctx.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, `rgba(255,80,70,${alpha * 1.8})`);
      grad.addColorStop(0.8, `rgba(255,60,60,${alpha * 0.9})`);
      grad.addColorStop(1, "rgba(255,60,60,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(16, -16, len, 16);
      ctx.strokeStyle = `rgba(255,120,100,${edge * 0.7})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(16, -16, len, 16);
      // chevrons
      ctx.globalAlpha = edge;
      ctx.strokeStyle = "#ffb094";
      for (let i = 0; i < 3; i++) {
        const x = 40 + i * 42 + (p * 30);
        ctx.beginPath();
        ctx.moveTo(x, -13);
        ctx.lineTo(x + 8, -8);
        ctx.lineTo(x, -3);
        ctx.stroke();
      }
      ctx.restore();
    } else if (kind === "leap" || kind === "pounce") {
      const targetX = t.targetX;
      const radius = (kind === "leap" ? 86 : 58) * s;
      ctx.save();
      ctx.translate(targetX, GROUND_Y);
      // target circle
      ctx.save();
      ctx.scale(1, 0.3);
      const g = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
      g.addColorStop(0, `rgba(255,80,70,${alpha * 0.4})`);
      g.addColorStop(0.72, `rgba(255,66,66,${alpha * 1.2})`);
      g.addColorStop(1, "rgba(255,66,66,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
      // rotating crosshair ring
      ctx.globalAlpha = edge * 0.85;
      ctx.strokeStyle = "#ff806e";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = -game.time * 28;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.72, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.stroke();
      // trajectory line
      ctx.globalAlpha = edge * 0.3;
      ctx.strokeStyle = "#ff8c74";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x, GROUND_Y - 30 * s);
      ctx.lineTo(targetX, GROUND_Y);
      ctx.stroke();
      ctx.restore();
    } else if (kind === "aim") {
      const pose = e.pose;
      if (pose) {
        const hand = localToWorld(e, pose.handR);
        const pTarget = game.player ? { x: game.player.x, y: game.player.y - 36 } : null;
        if (pTarget) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.22 + p * 0.3;
          ctx.strokeStyle = "#ff8b78";
          ctx.lineWidth = 1.1;
          ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = -game.time * 40;
          ctx.beginPath();
          ctx.moveTo(hand.x, hand.y);
          ctx.lineTo(pTarget.x, pTarget.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = edge * 0.9;
          ctx.strokeStyle = "#ffb39b";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pTarget.x, pTarget.y, 11 + p * 5, 0, TAU);
          ctx.moveTo(pTarget.x - 16, pTarget.y);
          ctx.lineTo(pTarget.x - 7, pTarget.y);
          ctx.moveTo(pTarget.x + 7, pTarget.y);
          ctx.lineTo(pTarget.x + 16, pTarget.y);
          ctx.moveTo(pTarget.x, pTarget.y - 16);
          ctx.lineTo(pTarget.x, pTarget.y - 7);
          ctx.moveTo(pTarget.x, pTarget.y + 7);
          ctx.lineTo(pTarget.x, pTarget.y + 16);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }
}

function drawEnemyHealthBars() {
  for (const e of game.enemies) {
    if (!e.alive || e.barTimer <= 0) continue;
    const pose = e.pose;
    const s = e.scale;
    const headY = pose ? e.y + pose.head.y : e.y - 70 * s;
    const w = 58 * s;
    const x = e.x - w / 2;
    const y = headY - 22 * s;
    const pct = clamp(e.hp / e.maxHp, 0, 1);
    ctx.save();
    // name
    ctx.font = `600 ${Math.max(8, 8.5 * s)}px "CombatSerif","Songti SC","STSong","Noto Serif CJK SC",serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha *= 0.75;
    ctx.fillStyle = e.elite ? "#ffd982" : "#e7d7b4";
    ctx.fillText(e.elite ? `${e.def.name} · 精` : e.def.name, e.x, y - 5);
    ctx.globalAlpha /= 0.75;
    // bar frame
    ctx.fillStyle = "rgba(8,6,10,0.78)";
    ctx.fillRect(x - 1, y, w + 2, 5);
    ctx.strokeStyle = "rgba(220,190,145,0.28)";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x - 1, y, w + 2, 5);
    // hp fill
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    if (pct > 0.5) {
      grad.addColorStop(0, "#9e2833");
      grad.addColorStop(1, "#e05458");
    } else {
      grad.addColorStop(0, "#7c1e2a");
      grad.addColorStop(1, "#ff8d68");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + 1, w * pct, 3);
    if (e.flash > 0.02) {
      ctx.globalAlpha *= clamp(e.flash * 1.5, 0, 0.8);
      ctx.fillStyle = "#fff6ea";
      ctx.fillRect(x, y + 1, w * pct, 3);
      ctx.globalAlpha /= clamp(e.flash * 1.5, 0, 0.8);
    }
    if (e.elite) {
      ctx.strokeStyle = "rgba(255,211,123,0.75)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x - 1.5, y - 0.5, w + 3, 6);
    }
    // limb pips: L arm / R arm / head / L leg / R leg
    const pipY = y + 10;
    const pips = [
      e.armLok,
      e.armRok,
      !e.parts.head.broken,
      e.legLok,
      e.legRok,
    ];
    const pw = 4.2 * s;
    const gap = 3.2 * s;
    const total = pips.length * pw + (pips.length - 1) * gap;
    let px = e.x - total / 2;
    for (const ok of pips) {
      ctx.beginPath();
      ctx.moveTo(px + pw / 2, pipY - 2.2 * s);
      ctx.lineTo(px + pw, pipY);
      ctx.lineTo(px + pw / 2, pipY + 2.2 * s);
      ctx.lineTo(px, pipY);
      ctx.closePath();
      if (ok) {
        ctx.fillStyle = e.palette.accent;
        ctx.globalAlpha *= 0.7;
      } else {
        ctx.fillStyle = "rgba(90,28,38,0.8)";
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      px += pw + gap;
    }
    ctx.restore();
  }
}

function drawEnemyWarnings() {
  for (const e of game.enemies) {
    if (!e.alive || e.state !== "windup" || !e.tele) continue;
    const pose = e.pose;
    const s = e.scale;
    const p = clamp(e.tele.p || 0, 0, 1);
    const headY = (pose ? e.y + pose.head.y : e.y - 70 * s) - 31 * s;
    const pulse = 0.75 + 0.25 * Math.sin(game.time * 20);
    const scale = 0.75 + easeOutBack(clamp(p * 2.4, 0, 1)) * 0.45;
    ctx.save();
    ctx.translate(e.x, headY);
    ctx.scale(scale * pulse, scale * pulse);
    // diamond backing
    ctx.fillStyle = "rgba(16,7,10,0.82)";
    ctx.beginPath();
    ctx.moveTo(0, -12.5);
    ctx.lineTo(11, 0);
    ctx.lineTo(0, 12.5);
    ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,110,90,${0.5 + p * 0.45})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 0, 0, 18, "#ff5a4c", 0.22 + p * 0.2);
    ctx.restore();
    ctx.fillStyle = `rgba(255,${Math.floor(160 - p * 60)},110,${0.85 + p * 0.15})`;
    ctx.font = '700 17px "CombatSerif","Songti SC","STSong",serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 0, 1);
    ctx.restore();
  }
}

function drawForeground() {
  const w = view.w;
  const h = view.h;
  const sc = view.scale;
  const camFrac = game.camera.x / Math.max(1, WORLD_W);
  // bottom dark gradient
  const g = ctx.createLinearGradient(0, h - 110 * sc, 0, h);
  g.addColorStop(0, "rgba(4,4,8,0)");
  g.addColorStop(1, "rgba(2,2,5,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h - 110 * sc, w, 110 * sc);
  // grass silhouettes
  ctx.save();
  ctx.strokeStyle = "rgba(4,4,8,0.75)";
  for (const gr of BG.grass) {
    let x = (((gr.x - camFrac * 0.35) % 1) + 1) % 1 * w;
    const baseY = h - 2;
    const hh = gr.h * sc * 0.8;
    const sway = Math.sin(game.realTime * 1.6 + gr.phase) * 3 * sc;
    ctx.lineWidth = gr.w * sc;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + sway + gr.lean * sc, baseY - hh * 0.55, x + sway * 1.8 + gr.lean * 2 * sc, baseY - hh);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScreenFX() {
  const w = view.w;
  const h = view.h;
  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(0.72, "rgba(0,0,0,0.18)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // hurt vignette
  if (game.hurtVignette > 0.01) {
    const hv = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    hv.addColorStop(0, "rgba(120,10,20,0)");
    hv.addColorStop(0.72, `rgba(130,14,24,${0.14 * game.hurtVignette})`);
    hv.addColorStop(1, `rgba(180,20,32,${0.55 * game.hurtVignette})`);
    ctx.fillStyle = hv;
    ctx.fillRect(0, 0, w, h);
  }

  // low health pulse
  if (game.mode === "play" && game.player && game.player.hp > 0 && game.player.hp / game.player.maxHp < 0.3) {
    const pulse = 0.5 + 0.5 * Math.sin(game.realTime * 5.2);
    const lv = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    lv.addColorStop(0, "rgba(100,8,18,0)");
    lv.addColorStop(1, `rgba(170,16,30,${0.1 + pulse * 0.15})`);
    ctx.fillStyle = lv;
    ctx.fillRect(0, 0, w, h);
  }

  // start-of-run fade
  if (game.introFade > 0.001) {
    ctx.fillStyle = `rgba(2,2,5,${Math.min(0.82, game.introFade * 0.82)})`;
    ctx.fillRect(0, 0, w, h);
  }

  // impact flash
  if (game.flash > 0.003) {
    ctx.fillStyle = `rgba(255,235,218,${game.flash})`;
    ctx.fillRect(0, 0, w, h);
  }

  // parry slow-mo tint
  if (game.timeScale < 0.82) {
    ctx.fillStyle = `rgba(40,90,96,${(0.82 - game.timeScale) * 0.16})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function render() {
  screenTransform();
  screenBackground();

  worldTransform();
  drawStage();
  drawEnemyTelegraphZones();
  drawDecals();
  drawSkillFx("back");
  drawParticlesBack();
  drawEnemyShadows();
  drawAfterimages();
  drawEnemies();
  drawPlayer();
  drawDebris();
  drawProjectiles();
  drawSlashes();
  drawSkillFx("front");
  drawParticlesFront();
  drawEnemyHealthBars();
  drawEnemyWarnings();
  drawFloaters();

  screenTransform();
  drawForeground();
  drawUI();
  drawScreenFX();
}
