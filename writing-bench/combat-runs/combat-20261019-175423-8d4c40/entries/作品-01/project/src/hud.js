/* =========================================================
   hud.js — in-canvas HUD (HP, wave, combo, controls ribbon)
   ========================================================= */
function drawHUD(ctx, world) {
  const w = world.cam.vw, h = world.cam.vh;
  const p = world.player;
  ctx.save();
  ctx.textBaseline = 'middle';

  // ---- player status plate (top-left) ----
  const px = 24, py = 22, pw = 296, ph = 54;
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = '#0b0810';
  roundRect(ctx, px, py, pw, ph, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,160,110,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  gameFont(ctx, 12, 700);
  ctx.fillStyle = '#c9b58e';
  ctx.textAlign = 'left';
  ctx.fillText('绯月行者  REAPER', px + 14, py + 14);

  // hp bar with damage-delay ghost
  if (world._hpGhost === undefined) world._hpGhost = p.hp;
  world._hpGhost += (p.hp - world._hpGhost) * 0.12;
  if (world._hpGhost < p.hp) world._hpGhost = p.hp;
  const bx = px + 14, by = py + 25, bw = pw - 28, bh = 11;
  ctx.fillStyle = '#1d1216';
  roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
  // ghost
  ctx.fillStyle = 'rgba(255,120,110,0.45)';
  roundRect(ctx, bx, by, bw * clamp(world._hpGhost / p.maxHp, 0, 1), bh, 4); ctx.fill();
  const hpG = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  hpG.addColorStop(0, '#a81e2a');
  hpG.addColorStop(0.55, '#e5483c');
  hpG.addColorStop(1, '#ffb35c');
  ctx.fillStyle = hpG;
  roundRect(ctx, bx, by, bw * clamp(p.hp / p.maxHp, 0, 1), bh, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,180,0.28)';
  roundRect(ctx, bx, by, bw, bh, 4); ctx.stroke();
  // segment ticks
  ctx.strokeStyle = 'rgba(20,8,10,0.55)';
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(bx + (bw / 5) * i, by + 1);
    ctx.lineTo(bx + (bw / 5) * i, by + bh - 1);
    ctx.stroke();
  }
  gameFont(ctx, 11, 700);
  ctx.fillStyle = '#e8d6b8';
  ctx.textAlign = 'right';
  ctx.fillText(Math.ceil(p.hp) + ' / ' + p.maxHp, px + pw - 14, py + 14);

  // ---- wave plate (top-right) ----
  ctx.textAlign = 'right';
  const wave = Math.max(1, world.stats.wave);
  gameFont(ctx, 12, 700);
  ctx.fillStyle = 'rgba(220,200,170,0.7)';
  ctx.fillText('KILL ' + world.stats.killCount + '  ·  SEVER ' + world.stats.limbBreakCount + '  ·  PARRY ' + world.stats.parryCount, w - 120, py + 14);
  gameFont(ctx, 22, 800);
  ctx.fillStyle = '#f2d9a8';
  ctx.fillText('WAVE ' + wave, w - 120, py + 42);

  // ---- combo counter (right side, above ribbon) ----
  if (p.combo > 1) {
    const k = clamp(p.comboTimer / 2.2, 0, 1);
    const pulse = 1 + Math.max(0, (p.comboTimer - 2.05)) * 1.5;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * k;
    ctx.translate(w - 60, h * 0.34);
    ctx.rotate(-0.05);
    ctx.textAlign = 'right';
    gameFont(ctx, Math.round(52 * pulse), 900);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(18,8,10,0.8)';
    ctx.strokeText(String(p.combo), 0, 0);
    ctx.fillStyle = '#ffcf8a';
    ctx.fillText(String(p.combo), 0, 0);
    gameFont(ctx, 14, 800);
    ctx.fillStyle = 'rgba(255,215,170,0.85)';
    ctx.fillText('CONNECT', 0, 34);
    ctx.restore();
  }

  // ---- wave banner (centre) ----
  if (world.waveBannerT > 0) {
    const t = world.waveBannerT;
    const a = clamp(Math.min(t * 2, (1.5 - t) * 3), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    gameFont(ctx, 46, 900);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(14,6,10,0.85)';
    ctx.strokeText(world.waveBannerText, w / 2, h * 0.26);
    ctx.fillStyle = '#ffe3b0';
    ctx.fillText(world.waveBannerText, w / 2, h * 0.26);
    // underline sweep
    const lw = 260 * clamp((1.5 - t) * 2, 0, 1);
    ctx.strokeStyle = 'rgba(255,120,90,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - lw / 2, h * 0.26 + 34);
    ctx.lineTo(w / 2 + lw / 2, h * 0.26 + 34);
    ctx.stroke();
    ctx.restore();
  }

  // ---- skill bar (bottom-left, above ribbon) ----
  const SKILLS = [
    { key: '1', name: '月轮斩', en: 'MOON WHEEL', cd: 4.5, col: '#ff8ac8' },
    { key: '2', name: '影袭', en: 'SHADOW REND', cd: 6.5, col: '#ff8a7a' },
    { key: '3', name: '刃雨', en: 'BLADE RAIN', cd: 8.5, col: '#9cc9ff' },
    { key: '4', name: '千刃一闪', en: 'CRIMSON MOON', cd: 20, col: '#ff5a5a' }
  ];
  const sx0 = 24, sy0 = h - 98, sw = 128, sh = 44, gap = 6;
  for (let i = 0; i < 4; i++) {
    const cd = p.skillCd[i], max = SKILLS[i].cd;
    const ready = cd <= 0;
    const x = sx0 + i * (sw + gap);
    ctx.globalAlpha = 0.74;
    ctx.fillStyle = '#0b0810';
    roundRect(ctx, x, sy0, sw, sh, 6); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ready ? SKILLS[i].col : 'rgba(160,140,130,0.35)';
    ctx.lineWidth = ready ? 1.6 : 1;
    roundRect(ctx, x, sy0, sw, sh, 6); ctx.stroke();
    // cooldown wipe (rises from the bottom)
    if (!ready) {
      const k = clamp(cd / max, 0, 1);
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#000';
      roundRect(ctx, x, sy0 + sh * (1 - k), sw, sh * k, 6); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      gameFont(ctx, 12, 800);
      ctx.fillStyle = '#f0dcc0';
      ctx.fillText(cd.toFixed(1), x + sw - 7, sy0 + 15);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.26 + 0.12 * Math.sin(world.time * 4 + i);
      ctx.fillStyle = SKILLS[i].col;
      roundRect(ctx, x, sy0, sw, sh, 6); ctx.fill();
      ctx.restore();
      ctx.textAlign = 'right';
      gameFont(ctx, 10, 800);
      ctx.fillStyle = 'rgba(255,240,215,0.9)';
      ctx.fillText('READY', x + sw - 7, sy0 + 15);
    }
    // key chip
    ctx.fillStyle = 'rgba(255,235,200,0.16)';
    roundRect(ctx, x + 6, sy0 + 6, 18, 18, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,180,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center';
    gameFont(ctx, 12, 800);
    ctx.fillStyle = '#ffeecb';
    ctx.fillText(SKILLS[i].key, x + 15, sy0 + 16);
    // names
    ctx.textAlign = 'left';
    gameFont(ctx, 12, 800);
    ctx.fillStyle = ready ? '#f2e3c6' : 'rgba(220,205,185,0.6)';
    ctx.fillText(SKILLS[i].name, x + 29, sy0 + 16);
    gameFont(ctx, 8, 700);
    ctx.fillStyle = ready ? SKILLS[i].col : 'rgba(180,165,150,0.5)';
    ctx.fillText(SKILLS[i].en, x + 29, sy0 + 31);
  }

  // ---- controls ribbon (bottom) ----
  const ry = h - 30;
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#08050c';
  roundRect(ctx, w / 2 - 372, ry - 17, 744, 34, 7);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  const items = [
    ['J', '轻斩 SLASH'],
    ['K', '蓄力重斩 CHARGE'],
    ['L', '瞬步 DASH'],
    ['I', '弹反 PARRY'],
    ['Space', '跳跃 JUMP'],
    ['R', '重开']
  ];
  // skills are shown in the skill bar above; keep the ribbon compact
  let cx = w / 2 - 358;
  for (const it of items) {
    ctx.font = '800 12px "Trebuchet MS","PingFang SC",sans-serif';
    const kw = ctx.measureText(it[0]).width + 12;
    ctx.fillStyle = 'rgba(255,230,190,0.16)';
    roundRect(ctx, cx, ry - 10, kw, 20, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,170,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffe9c4';
    ctx.textAlign = 'center';
    ctx.fillText(it[0], cx + kw / 2, ry + 1);
    cx += kw + 5;
    ctx.fillStyle = 'rgba(230,214,190,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(it[1], cx, ry + 1);
    cx += ctx.measureText(it[1]).width + 16;
  }

  // ---- death overlay is DOM; draw the "R" cue only ----
  ctx.restore();
}

function drawStartHint(ctx, world) {
  // small hint while idle at very start
  if (world.time < 4.2 && world.playing && world.player.hp > 0) {
    const a = clamp(Math.min(world.time * 0.8, (4.2 - world.time) * 0.8), 0, 0.85);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    gameFont(ctx, 15, 700);
    ctx.fillStyle = '#ffd9a8';
    ctx.fillText('连按 J 追击 · 第四段挑空 · 空中 J 追打 / K 下劈    J combo · 4th launches · air J / K plunge', world.cam.vw / 2, world.cam.vh - 62);
    ctx.restore();
  }
}
