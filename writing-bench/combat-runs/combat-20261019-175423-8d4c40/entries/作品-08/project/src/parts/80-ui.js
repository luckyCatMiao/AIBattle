/* ============================================================
   HUD, title, death screen, banners
   ============================================================ */
const UI_SANS = '"CombatSerif","Songti SC","STSong","Noto Serif CJK SC","Noto Serif SC","SimSun",serif';

function drawUI() {
  if (game.mode === "title") {
    drawTitleScreen();
    return;
  }
  drawHud();
  drawBanners();
  if (game.mode === "play" && !game.player.dead) drawTutorialHint();
  if (game.mode === "over") drawDeathScreen();
}

function drawHud() {
  const w = view.w;
  const h = view.h;
  const p = game.player;
  if (!p) return;

  // ----- health -----
  const barW = Math.min(252, w * 0.3);
  const x = 24;
  const y = 22;
  // diamond + label
  ctx.save();
  ctx.fillStyle = "rgba(8,7,12,0.55)";
  ctx.beginPath();
  ctx.moveTo(x + 7, y);
  ctx.lineTo(x + 16, y + 9);
  ctx.lineTo(x + 7, y + 18);
  ctx.lineTo(x - 2, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(224,183,120,0.65)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#f0dcb6";
  ctx.font = `600 13px ${UI_SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("命", x + 24, y + 9);
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(218,199,166,0.55)";
  ctx.fillText("绯 刃", x + 48, y + 10);

  // numeric
  ctx.font = `600 11px ${UI_SANS}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(245,230,202,0.85)";
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, x + barW, y + 10);
  ctx.restore();

  const by = y + 20;
  // frame
  ctx.save();
  ctx.fillStyle = "rgba(5,5,9,0.72)";
  angledBar(x - 2, by - 2, barW + 4, 17, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(218,183,126,0.38)";
  ctx.lineWidth = 1;
  angledBar(x - 2, by - 2, barW + 4, 17, 3);
  ctx.stroke();

  // residual (slow-following) bar
  const dispPct = clamp(p.displayHp / p.maxHp, 0, 1);
  const hpPct = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = "rgba(255,220,190,0.28)";
  angledBar(x, by, barW * dispPct, 13, 2);
  ctx.fill();

  const low = hpPct < 0.3;
  const pulse = low ? 0.7 + 0.3 * Math.sin(game.realTime * 7.5) : 1;
  const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
  if (low) {
    grad.addColorStop(0, "#8b1625");
    grad.addColorStop(0.6, "#ef3d44");
    grad.addColorStop(1, "#ff8a68");
  } else {
    grad.addColorStop(0, "#701725");
    grad.addColorStop(0.45, "#b42a3b");
    grad.addColorStop(0.8, "#e0555a");
    grad.addColorStop(1, "#ff8f74");
  }
  ctx.globalAlpha = pulse;
  ctx.fillStyle = grad;
  angledBar(x, by, barW * hpPct, 13, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // glass highlight
  ctx.fillStyle = "rgba(255,240,220,0.18)";
  ctx.fillRect(x + 2, by + 1, Math.max(0, barW * hpPct - 4), 2.2);
  // ticks
  ctx.strokeStyle = "rgba(15,10,14,0.35)";
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 10; i++) {
    const tx = x + (barW * i) / 10;
    ctx.beginPath();
    ctx.moveTo(tx, by + 1);
    ctx.lineTo(tx, by + 12);
    ctx.stroke();
  }
  ctx.restore();

  // ----- wave -----
  if (game.wave > 0) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 15px ${UI_SANS}`;
    ctx.fillStyle = "rgba(238,218,178,0.9)";
    const label = game.wavePhase === "clear" ? "阵  破" : `第 ${cnNum(game.wave)} 阵`;
    const tx = w / 2;
    ctx.fillText(label, tx, 28);
    // ornamental lines
    const tw = ctx.measureText(label).width;
    ctx.strokeStyle = "rgba(206,168,105,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2 - 70, 28);
    ctx.lineTo(tx - tw / 2 - 12, 28);
    ctx.moveTo(tx + tw / 2 + 12, 28);
    ctx.lineTo(tx + tw / 2 + 70, 28);
    ctx.stroke();
    // little diamonds at ends
    ctx.fillStyle = "rgba(220,180,112,0.55)";
    for (const dx of [-tw / 2 - 74, tw / 2 + 74]) {
      ctx.beginPath();
      ctx.moveTo(tx + dx, 25);
      ctx.lineTo(tx + dx + 3, 28);
      ctx.lineTo(tx + dx, 31);
      ctx.lineTo(tx + dx - 3, 28);
      ctx.closePath();
      ctx.fill();
    }
    // remaining enemies
    const rem = game.waveRemaining;
    if (game.wavePhase === "fight") {
      const maxDots = 8;
      const n = Math.min(maxDots, rem);
      const gap = 12;
      const start = tx - ((n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        const px = start + i * gap;
        const py = 46;
        ctx.moveTo(px, py - 3);
        ctx.lineTo(px + 3.2, py);
        ctx.lineTo(px, py + 3);
        ctx.lineTo(px - 3.2, py);
        ctx.closePath();
        ctx.fillStyle = i < aliveEnemies() ? "rgba(255,126,100,0.8)" : "rgba(202,170,124,0.4)";
        ctx.fill();
      }
      if (rem > maxDots) {
        ctx.font = `9px ${UI_SANS}`;
        ctx.fillStyle = "rgba(220,190,140,0.6)";
        ctx.fillText(`+${rem - maxDots}`, tx + (n * gap) / 2 + 10, 46);
      }
    }
    ctx.restore();
  }

  // ----- combo / rank -----
  if (game.combo > 0) {
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const pop = 1 + game.comboPop * 0.22;
    const cx = w - 28;
    const cy = 94;
    // rank
    if (game.rank) {
      const rc = rankColor(game.rank);
      const rs = 1 + game.rankPop * 0.3;
      ctx.save();
      ctx.translate(cx - 102, cy - 6);
      ctx.scale(rs, rs);
      ctx.font = `italic 700 30px Georgia,"Times New Roman",serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = rc;
      ctx.shadowColor = rc;
      ctx.shadowBlur = 12;
      ctx.fillText(game.rank, 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
      // slash
      ctx.strokeStyle = "rgba(230,200,140,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 83, cy - 19);
      ctx.lineTo(cx - 79, cy + 9);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(cx, cy - 8);
    ctx.scale(pop, pop);
    ctx.font = `700 34px ${UI_SANS}`;
    ctx.fillStyle = "#fff1d2";
    ctx.shadowColor = "rgba(255,90,80,0.55)";
    ctx.shadowBlur = 10;
    ctx.textAlign = "right";
    ctx.fillText(String(game.combo), 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.font = `600 12px ${UI_SANS}`;
    ctx.fillStyle = "rgba(238,214,176,0.8)";
    ctx.fillText("连", cx - 2, cy + 16);
    // timer
    const tw = 96;
    const tPct = clamp(game.comboTimer / 2.4, 0, 1);
    ctx.fillStyle = "rgba(8,6,10,0.45)";
    ctx.fillRect(cx - tw, cy + 27, tw, 2);
    ctx.fillStyle = game.rank ? rankColor(game.rank) : "rgba(255,180,140,0.8)";
    ctx.globalAlpha = 0.7;
    ctx.fillRect(cx - tw * tPct, cy + 27, tw * tPct, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ----- run stats -----
  if (game.limbBreakCount > 0 || game.kills > 0) {
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `10px ${UI_SANS}`;
    ctx.fillStyle = "rgba(215,188,150,0.5)";
    const sx = w - 24;
    const sy = h - 24;
    ctx.fillText(`断肢 ${game.limbBreakCount}   ·   斩 ${game.kills}`, sx, sy);
    ctx.restore();
  }

  // ----- skills (1-4) -----
  drawSkillBar();

  // ----- controls -----
  drawControlsPanel();
}

function drawSkillBar() {
  const p = game.player;
  if (!p || !p.skillCd) return;
  const w = view.w;
  const h = view.h;
  const n = SKILL_DEFS.length;
  const slotW = 66;
  const gap = 6;
  const slotH = 46;
  const totalW = n * slotW + (n - 1) * gap;
  const x = w - 22 - totalW;
  const y = h - 46 - 14 - 12 - slotH;

  ctx.save();
  // backing panel keeps the four inputs legible over the battlefield
  roundRect(ctx, x - 8, y - 17, totalW + 16, slotH + 25, 4);
  const backing = ctx.createLinearGradient(x, y - 17, x, y + slotH + 8);
  backing.addColorStop(0, "rgba(11,8,13,0.72)");
  backing.addColorStop(1, "rgba(6,5,9,0.84)");
  ctx.fillStyle = backing;
  ctx.fill();
  ctx.strokeStyle = "rgba(203,167,107,0.22)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `9px ${UI_SANS}`;
  ctx.fillStyle = "rgba(226,192,136,0.62)";
  ctx.fillText("技能  ·  1—4", x, y - 7);

  for (let i = 0; i < n; i++) {
    const def = SKILL_DEFS[i];
    const sx = x + i * (slotW + gap);
    const cd = p.skillCd[def.id] || 0;
    const ready = cd <= 0.001;
    const active = p.skill && p.skill.id === def.id;
    const deny = p.skillDenyT > 0 && p.skillDenyId === def.id;
    const pulse = 0.72 + 0.28 * Math.sin(game.realTime * 3.4 + i * 1.7);

    roundRect(ctx, sx, y, slotW, slotH, 3);
    const bg = ctx.createLinearGradient(sx, y, sx, y + slotH);
    bg.addColorStop(0, active ? "rgba(34,21,26,0.92)" : "rgba(12,9,14,0.78)");
    bg.addColorStop(1, "rgba(6,5,9,0.86)");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = deny
      ? `rgba(255,80,80,${0.5 + 0.4 * Math.sin(game.realTime * 30)})`
      : ready
        ? rgba(def.color, active ? 0.95 : 0.42 + 0.22 * pulse)
        : "rgba(170,150,125,0.18)";
    ctx.lineWidth = ready || active ? 1.2 : 0.8;
    ctx.stroke();

    // top colour strip
    ctx.fillStyle = rgba(def.color, ready ? 0.55 : 0.16);
    ctx.fillRect(sx + 1, y + 1, slotW - 2, 1.6);

    // keycap
    drawKeycap(sx + 5, y + 6, def.key, {
      fontSize: 10, height: 15,
      fill: "rgba(24,18,26,0.9)",
      stroke: rgba(def.color, ready ? 0.7 : 0.25),
      color: ready ? "#f4e7cc" : "#9b8e7d",
    });

    // name
    ctx.font = `600 10px ${UI_SANS}`;
    ctx.textAlign = "left";
    ctx.fillStyle = ready ? "rgba(244,230,205,0.92)" : "rgba(190,172,148,0.55)";
    ctx.fillText(def.name, sx + 25, y + 14);

    // cooldown
    if (!ready) {
      const frac = clamp(cd / def.cd, 0, 1);
      ctx.fillStyle = "rgba(5,4,8,0.34)";
      ctx.fillRect(sx + 1, y + 2, slotW - 2, slotH - 4);
      // thin recharge line along the bottom
      ctx.fillStyle = rgba(def.color, 0.55);
      ctx.fillRect(sx + 1, y + slotH - 3.5, (slotW - 2) * (1 - frac), 2);
      ctx.textAlign = "center";
      if (active) {
        ctx.font = `600 10px ${UI_SANS}`;
        ctx.fillStyle = "rgba(255,236,206,0.94)";
        ctx.fillText("施放中", sx + slotW / 2, y + slotH - 11);
      } else {
        ctx.font = `600 11px ${UI_SANS}`;
        ctx.fillStyle = "rgba(10,7,10,0.75)";
        ctx.fillText(cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1), sx + slotW / 2 + 0.6, y + slotH - 10.4);
        ctx.fillStyle = "rgba(255,230,198,0.92)";
        ctx.fillText(cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1), sx + slotW / 2, y + slotH - 11);
      }
    } else {
      ctx.textAlign = "center";
      ctx.font = `9px ${UI_SANS}`;
      ctx.fillStyle = rgba(def.color, 0.55 + 0.25 * pulse);
      ctx.fillText(active ? "施放中" : "可用", sx + slotW / 2, y + slotH - 10);
    }
  }
  ctx.restore();
}

function rankColor(rank) {
  switch (rank) {
    case "SS": return "#ffe59a";
    case "S": return "#ffd273";
    case "A": return "#ffa07c";
    case "B": return "#ffc0cc";
    case "C": return "#cfe2da";
    default: return "#a8bcc0";
  }
}

function angledBar(x, y, w, h, cut) {
  const c = Math.min(cut, w / 3, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function drawKeycap(x, y, label, opts = {}) {
  const fs = opts.fontSize || 10;
  ctx.font = `600 ${fs}px ${UI_SANS}`;
  const tw = ctx.measureText(label).width;
  const padX = 5;
  const h = opts.height || 16;
  const w = tw + padX * 2;
  roundRect(ctx, x, y, w, h, 2.5);
  ctx.fillStyle = opts.fill || "rgba(23,18,24,0.78)";
  ctx.fill();
  ctx.strokeStyle = opts.stroke || "rgba(215,181,121,0.4)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = opts.color || "#e9d7b4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  return w;
}

function keycapWidth(label, fs) {
  ctx.font = `600 ${fs}px ${UI_SANS}`;
  return ctx.measureText(label).width + 10;
}

function drawControlItems(x, y, items, opts = {}) {
  const fs = opts.fontSize || 10;
  const gapBetweenKeys = 2;
  const gapAfterKeys = 4;
  const gapItems = opts.gapItems || 13;
  let cx = x;
  ctx.textBaseline = "middle";
  for (const [keys, desc] of items) {
    for (let k = 0; k < keys.length; k++) {
      const w = drawKeycap(cx, y, keys[k], { fontSize: fs, fill: opts.fill, stroke: opts.stroke, color: opts.color });
      cx += w + gapBetweenKeys;
    }
    cx -= gapBetweenKeys;
    cx += gapAfterKeys;
    ctx.font = `${fs}px ${UI_SANS}`;
    ctx.textAlign = "left";
    ctx.fillStyle = opts.labelColor || "rgba(221,204,174,0.72)";
    ctx.fillText(desc, cx, y + (opts.height || 16) / 2 + 0.5);
    cx += ctx.measureText(desc).width + gapItems;
  }
  return cx;
}

function drawControlsPanel() {
  const w = view.w;
  const h = view.h;
  const fs = 10;
  const rowH = 18;
  const panelW = Math.min(690, w - 40);
  const panelH = 46;
  const x = 22;
  const y = h - panelH - 14;
  ctx.save();
  roundRect(ctx, x, y, panelW, panelH, 3);
  const g = ctx.createLinearGradient(x, y, x, y + panelH);
  g.addColorStop(0, "rgba(11,9,14,0.62)");
  g.addColorStop(1, "rgba(6,5,9,0.78)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(200,164,107,0.2)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // top accent
  ctx.fillStyle = "rgba(190,42,58,0.5)";
  ctx.fillRect(x + 1, y, 2, panelH - 2);

  const row1 = [
    [["A", "D"], "移动 · ←→"],
    [["SPACE"], "跳跃 / 二段"],
    [["J"], "连斩"],
    [["K"], "重斩 · 按住蓄力"],
  ];
  const row2 = [
    [["L"], "疾闪"],
    [["I"], "见切弹反"],
    [["R"], "重来"],
    [["ENTER"], "开始 / 再战"],
  ];
  drawControlItems(x + 14, y + 5, row1, { fontSize: fs, gapItems: 14 });
  drawControlItems(x + 14, y + 5 + rowH, row2, { fontSize: fs, gapItems: 14 });
  // small flavor on the right
  ctx.font = `9px ${UI_SANS}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(210,178,130,0.38)";
  ctx.fillText("斩其肢体 · 断其锋芒", x + panelW - 12, y + panelH - 10);
  ctx.restore();
}

function drawTutorialHint() {
  const w = view.w;
  const h = view.h;
  if (game.wave !== 1) return;
  const t = game.time;
  if (t > 17) return;
  let text = "";
  if (t < 4.6) text = "J 连斩命中后，按 L 疾闪可取消后摇";
  else if (t < 9) text = "I 见切：在敌人攻击命中前一瞬按下，弹反并令其失衡";
  else if (t < 13) text = "按住 K 蓄力，重斩可直接斩断肢体；断肢会改变敌人的行动";
  else text = "1-4 独立技能：月轮斩 · 影渡 · 千樱葬 · 断界";
  const fadeIn = clamp(t / 0.5, 0, 1);
  const fadeOut = clamp((17 - t) / 1.2, 0, 1);
  const alpha = Math.min(fadeIn, fadeOut) * 0.85;
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `13px ${UI_SANS}`;
  const tw = ctx.measureText(text).width;
  const bx = w / 2 - tw / 2 - 18;
  const by = 74;
  roundRect(ctx, bx, by - 13, tw + 36, 26, 13);
  ctx.fillStyle = "rgba(8,7,12,0.62)";
  ctx.fill();
  ctx.strokeStyle = "rgba(218,180,112,0.22)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = "rgba(240,222,188,0.88)";
  ctx.fillText(text, w / 2, by + 0.5);
  ctx.restore();
}

function drawBanners() {
  const w = view.w;
  const h = view.h;
  for (let i = 0; i < game.banners.length; i++) {
    const b = game.banners[i];
    const t = 1 - b.life / b.maxLife; // 0..1
    const fadeIn = clamp(t / 0.12, 0, 1);
    const fadeOut = clamp(b.life / 0.35, 0, 1);
    const a = Math.min(fadeIn, fadeOut);
    if (a <= 0.01) continue;
    const yy = h * 0.24 + i * 58;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // band
    const bandW = Math.min(430, w * 0.56);
    const bg = ctx.createLinearGradient(w / 2 - bandW / 2, 0, w / 2 + bandW / 2, 0);
    bg.addColorStop(0, "rgba(10,8,13,0)");
    bg.addColorStop(0.18, "rgba(12,9,14,0.55)");
    bg.addColorStop(0.82, "rgba(12,9,14,0.55)");
    bg.addColorStop(1, "rgba(10,8,13,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(w / 2 - bandW / 2, yy - 30, bandW, 58);
    // lines
    ctx.strokeStyle = rgba(b.color, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - bandW * 0.36, yy - 20);
    ctx.lineTo(w / 2 + bandW * 0.36, yy - 20);
    ctx.moveTo(w / 2 - bandW * 0.36, yy + 19);
    ctx.lineTo(w / 2 + bandW * 0.36, yy + 19);
    ctx.stroke();
    // text with spacing
    const spaced = b.text.split("").join(" ");
    ctx.font = `600 30px ${UI_SANS}`;
    ctx.fillStyle = b.color;
    ctx.shadowColor = rgba(b.color, 0.45);
    ctx.shadowBlur = 14;
    ctx.fillText(spaced, w / 2, yy - 1);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = `11px ${UI_SANS}`;
      ctx.fillStyle = "rgba(228,209,177,0.68)";
      ctx.fillText(b.sub, w / 2, yy + 25);
    }
    // flanking diamonds
    ctx.fillStyle = rgba(b.color, 0.55);
    for (const dx of [-bandW * 0.39, bandW * 0.39]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + dx, yy - 23);
      ctx.lineTo(w / 2 + dx + 3, yy - 20);
      ctx.lineTo(w / 2 + dx, yy - 17);
      ctx.lineTo(w / 2 + dx - 3, yy - 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------- title ---------------- */
function drawTitleScreen() {
  const w = view.w;
  const h = view.h;
  const t = game.realTime;
  ctx.save();
  // vignette / darkening
  const g = ctx.createRadialGradient(w * 0.64, h * 0.4, Math.min(w, h) * 0.08, w * 0.55, h * 0.5, Math.max(w, h) * 0.8);
  g.addColorStop(0, "rgba(4,4,10,0.08)");
  g.addColorStop(0.55, "rgba(4,4,10,0.42)");
  g.addColorStop(1, "rgba(3,3,7,0.84)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const titleY = h * 0.26;

  // small eyebrow
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(220,191,145,0.55)";
  ctx.fillText("月 下 无 尽 · 一 骑 斩 傀", cx, titleY - 63);

  // big title
  const tg = ctx.createLinearGradient(0, titleY - 42, 0, titleY + 38);
  tg.addColorStop(0, "#fff1d0");
  tg.addColorStop(0.35, "#ffb9a0");
  tg.addColorStop(0.62, "#e34d5c");
  tg.addColorStop(1, "#8f1c31");
  ctx.font = `700 ${Math.min(92, w * 0.09)}px ${UI_SANS}`;
  ctx.fillStyle = tg;
  ctx.shadowColor = "rgba(220,52,66,0.55)";
  ctx.shadowBlur = 26;
  ctx.fillText("绯 刃", cx, titleY);
  ctx.shadowBlur = 0;

  // subtitle
  ctx.font = `600 ${Math.min(24, w * 0.025)}px ${UI_SANS}`;
  ctx.fillStyle = "rgba(242,218,178,0.92)";
  ctx.fillText("月 下 斩", cx, titleY + 56);
  ctx.font = `11px ${UI_SANS}`;
  ctx.fillStyle = "rgba(211,190,160,0.55)";
  ctx.fillText("斩其肢体 · 断其锋芒 · 于刀锋之上求生", cx, titleY + 84);

  // ornamental line
  ctx.strokeStyle = "rgba(211,166,102,0.38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 150, titleY + 100);
  ctx.lineTo(cx - 22, titleY + 100);
  ctx.moveTo(cx + 22, titleY + 100);
  ctx.lineTo(cx + 150, titleY + 100);
  ctx.stroke();
  ctx.fillStyle = "rgba(230,186,116,0.7)";
  ctx.beginPath();
  ctx.moveTo(cx, titleY + 96);
  ctx.lineTo(cx + 5, titleY + 100);
  ctx.lineTo(cx, titleY + 104);
  ctx.lineTo(cx - 5, titleY + 100);
  ctx.closePath();
  ctx.fill();

  // start prompt
  const pulse = 0.68 + 0.32 * Math.sin(t * 2.6);
  ctx.globalAlpha = pulse;
  ctx.font = `600 17px ${UI_SANS}`;
  ctx.fillStyle = "#f7e5bc";
  ctx.shadowColor = "rgba(255,110,90,0.5)";
  ctx.shadowBlur = 10;
  ctx.fillText("按  ENTER  开 始", cx, h * 0.575);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.7;
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(224,204,172,0.6)";
  ctx.fillText("或 点 击 任 意 处", cx, h * 0.575 + 24);
  ctx.globalAlpha = 1;

  // controls panel
  const panelW = Math.min(700, w - 48);
  const panelH = 132;
  const px = cx - panelW / 2;
  const py = Math.min(h - panelH - 32, h * 0.68);
  roundRect(ctx, px, py, panelW, panelH, 4);
  const pg = ctx.createLinearGradient(px, py, px, py + panelH);
  pg.addColorStop(0, "rgba(13,10,16,0.74)");
  pg.addColorStop(1, "rgba(7,6,10,0.82)");
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.strokeStyle = "rgba(203,167,107,0.3)";
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.fillStyle = "rgba(192,45,60,0.55)";
  ctx.fillRect(px + 1, py + 1, 2, panelH - 2);

  ctx.textAlign = "left";
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(224,198,154,0.66)";
  ctx.fillText("操 作", px + 18, py + 17);

  const fs = 11;
  const gap = 16;
  const rowY = (n) => py + 27 + n * 28;
  drawControlItems(px + 18, rowY(0), [
    [["A", "D / ← →"], "移动"],
    [["SPACE"], "跳跃 / 二段"],
    [["J"], "连斩（三段）"],
    [["K"], "重斩 / 按住蓄力"],
  ], { fontSize: fs, gapItems: gap, labelColor: "rgba(235,219,190,0.82)" });
  drawControlItems(px + 18, rowY(1), [
    [["L"], "疾闪（无敌帧）"],
    [["I"], "见切弹反"],
    [["R"], "立即重来"],
    [["ENTER"], "开始 / 再战"],
  ], { fontSize: fs, gapItems: gap, labelColor: "rgba(235,219,190,0.82)" });

  // skills row
  ctx.textAlign = "left";
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(230,185,120,0.7)";
  ctx.fillText("技能", px + 18, rowY(2) + 8);
  drawControlItems(px + 52, rowY(2), [
    [["1"], "月轮斩"],
    [["2"], "影渡"],
    [["3"], "千樱葬"],
    [["4"], "断界"],
  ], { fontSize: fs, gapItems: 12, labelColor: "rgba(240,214,176,0.9)" });

  ctx.textAlign = "center";
  ctx.font = `9px ${UI_SANS}`;
  ctx.fillStyle = "rgba(205,183,151,0.42)";
  ctx.fillText("1–4 为独立技能，冷却结束后可再次施放 · 技能可打断攻击后摇", cx, py + panelH - 12);

  ctx.restore();
}

/* ---------------- death ---------------- */
function drawDeathScreen() {
  const w = view.w;
  const h = view.h;
  const a = clamp((game.overTimer || 0) / 0.5, 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(3,3,7,0.68)";
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.08, w / 2, h * 0.45, Math.max(w, h) * 0.7);
  vg.addColorStop(0, "rgba(90,10,18,0.1)");
  vg.addColorStop(0.6, "rgba(55,6,12,0.15)");
  vg.addColorStop(1, "rgba(20,2,6,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.min(66, w * 0.07)}px ${UI_SANS}`;
  ctx.fillStyle = "#e8cdb0";
  ctx.shadowColor = "rgba(180,30,40,0.6)";
  ctx.shadowBlur = 22;
  ctx.fillText("力 竭", cx, cy);
  ctx.shadowBlur = 0;
  ctx.font = `11px ${UI_SANS}`;
  ctx.fillStyle = "rgba(219,196,164,0.55)";
  ctx.fillText("月 影 吞 锋 · 刃 未 折", cx, cy + 46);

  // stat block
  const bw = Math.min(500, w - 80);
  const bh = 90;
  const bx = cx - bw / 2;
  const by = cy + 78;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fillStyle = "rgba(10,8,13,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(200,160,105,0.24)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const stats = [
    ["抵达", `第 ${cnNum(game.wave)} 阵`],
    ["斩击", `${game.hitCount} 次`],
    ["断肢", `${game.limbBreakCount} 处`],
    ["最高连击", `${game.maxCombo}`],
  ];
  const sw = bw / stats.length;
  for (let i = 0; i < stats.length; i++) {
    const sx = bx + sw * i + sw / 2;
    if (i > 0) {
      ctx.strokeStyle = "rgba(200,165,110,0.14)";
      ctx.beginPath();
      ctx.moveTo(bx + sw * i, by + 16);
      ctx.lineTo(bx + sw * i, by + bh - 16);
      ctx.stroke();
    }
    ctx.font = `10px ${UI_SANS}`;
    ctx.fillStyle = "rgba(202,178,143,0.55)";
    ctx.fillText(stats[i][0], sx, by + 28);
    ctx.font = `600 19px ${UI_SANS}`;
    ctx.fillStyle = i === 3 ? "#ffd88c" : "#f2e2c6";
    ctx.fillText(stats[i][1], sx, by + 55);
  }

  // prompt
  const pulse = 0.65 + 0.35 * Math.sin(game.realTime * 3.2);
  ctx.globalAlpha = a * pulse;
  ctx.font = `600 16px ${UI_SANS}`;
  ctx.fillStyle = "#f6e3b9";
  ctx.shadowColor = "rgba(255,120,90,0.4)";
  ctx.shadowBlur = 8;
  ctx.fillText("按  R  或  ENTER  再 战", cx, by + bh + 52);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = a * 0.65;
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(215,194,163,0.55)";
  ctx.fillText("点 击 任 意 处 也 可 重 新 开 始", cx, by + bh + 76);
  ctx.restore();
}
