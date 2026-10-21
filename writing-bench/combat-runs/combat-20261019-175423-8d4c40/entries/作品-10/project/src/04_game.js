'use strict';
/* ============================================================
   斩骸夜行 —— 04 游戏层
   命中结算 / 波次 / HUD / 覆盖层 / 主循环 / 对外状态
   ============================================================ */

/* ---------------- 命中盒结算 ---------------- */
function updateHitboxes(dt){
  for (let i = G.hitboxes.length - 1; i >= 0; i--){
    const hb = G.hitboxes[i];
    hb.t += dt;
    if (hb.t > hb.dur){ G.hitboxes.splice(i, 1); continue; }
    const r = hb.rect();
    if (hb.owner === 'p'){
      for (const e of G.enemies){
        if (e.dead) continue;
        if (hb.hit.has(e)) continue;
        if (r.l < e.x + e.w / 2 && r.r > e.x - e.w / 2 && r.t < e.y && r.b > e.y - e.h){
          hb.hit.add(e);
          damageEnemy(e, hb);
        }
      }
      // 顺带斩落敌方箭矢
      for (let j = G.shots.length - 1; j >= 0; j--){
        const s = G.shots[j];
        if (s.x > r.l && s.x < r.r && s.y > r.t && s.y < r.b){
          G.shots.splice(j, 1);
          sparks(s.x, s.y, 7, 0, '#ffe2b0', 320);
          flashFx(s.x, s.y, 16, 0.12, '255,235,190');
          addGauge(2);
          sfx('hit');
        }
      }
    } else {
      // 敌方攻击 vs 玩家
      const p = P;
      if (p.dead) continue;
      const overlap = r.l < p.x + 13 && r.r > p.x - 13 && r.t < p.y && r.b > p.y - p.h;
      if (!overlap) continue;
      // 弹反：架势中被打中 → 化解并追斩
      if (p.parryT > 0 && !hb.hit.has('p')){
        hb.hit.add('p');
        parrySuccess(hb.src);
        continue;
      }
      if (p.dashInv > 0){
        if (!hb.insight){
          hb.insight = true;
          triggerInsight(p.x, p.y - 46);
        }
        continue;
      }
      if (p.iFrames > 0) continue;
      if (hb.hit.has('p')) continue;
      hb.hit.add('p');
      damagePlayer(hb.dmg, sgn(p.x - hb.src.x) || 1, { kb: hb.kb, vy: hb.vy || 0 });
    }
  }
}

/* ---------------- 波次 ---------------- */
const WAVE_DEFS = {
  1: ['blade', 'blade'],
  2: ['blade', 'blade', 'archer'],
  3: ['blade', 'archer', 'brute'],
  4: ['blade', 'blade', 'archer', 'archer'],
  5: ['blade', 'blade', 'archer', 'brute'],
  6: ['blade', 'blade', 'blade', 'archer', 'archer'],
  7: ['blade', 'blade', 'archer', 'archer', 'brute'],
  8: ['blade', 'blade', 'brute', 'archer', 'brute'],
};
function composeWave(n){
  let list = WAVE_DEFS[n];
  if (!list){
    const extra = Math.floor((n - 8) / 2);
    list = ['blade', 'blade', 'archer', 'brute', 'brute'];
    for (let i = 0; i < extra; i++) list.push(pick(['blade', 'archer', 'blade']));
    if (n > 10 && n % 3 === 0) list.push('brute');
  }
  // 打乱
  for (let i = list.length - 1; i > 0; i--){
    const j = rndi(0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function startWave(n){
  G.wave = n;
  G.pending = composeWave(n);
  G.waveState = 'spawning';
  G.spawnT = 0.38;
  const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const label = n <= 10 ? cn[n - 1] : '' + n;
  G.banner = { text: '第 ' + label + ' 波', sub: n >= 3 ? '注意重锤傀儡的前摇' : (n === 1 ? '斩碎所有木偶' : '敌人变强了'), t: 0, life: 1.9 };
  sfx('wave');
}
function spawnOne(type){
  const side = Math.random() < 0.5 ? -1 : 1;
  let x = P.x + side * rnd(330, 500);
  // 避免与其他敌人重叠
  for (const e of G.enemies){
    if (!e.dead && Math.abs(e.x - x) < 90) x += side * 110;
  }
  x = clamp(x, 110, ARENA_W - 110);
  let opts = {};
  if (type === 'archer' && Math.random() < 0.42 && G.wave >= 2){
    const plat = pick(PLATFORMS);
    opts = { platformY: plat.y };
    // 放到平台上方附近
    x = plat.x + rnd(-40, 40);
    opts.platformX = plat.x;
    opts.platformHalf = plat.w / 2;
  }
  spawnEnemy(type, x, opts);
}
function updateWaves(dt){
  const alive = G.enemies.filter(e => !e.dead).length;
  const cap = G.wave < 5 ? 4 : 5;
  if (G.waveState === 'spawning'){
    G.spawnT -= dt;
    if (G.pending.length && alive < cap && G.spawnT <= 0){
      spawnOne(G.pending.shift());
      G.spawnT = G.pending.some(t => t === 'brute') ? 1.25 : 0.85;
    }
    if (!G.pending.length) G.waveState = 'fighting';
  } else if (G.waveState === 'fighting'){
    if (alive === 0 && !P.dead){
      G.waveState = 'clear';
      G.waveT = 1.7;
      G.banner = { text: '肃清', sub: '下一波即将来袭', t: 0, life: 1.6 };
      P.hp = Math.min(P.maxHp, P.hp + 14);
      addGauge(16);
      ring(P.x, P.y - 46, 10, 80, 0.5, '255,220,150', 3);
      sfx('gauge');
    }
  } else if (G.waveState === 'clear'){
    G.waveT -= dt;
    if (G.waveT <= 0) startWave(G.wave + 1);
  }
}

/* ---------------- HUD ---------------- */
const FONT = '"Songti SC","STSong","SimSun",Georgia,serif';
function barBg(x, y, w, h){
  ctx.fillStyle = 'rgba(8,10,20,0.66)';
  rr(x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,160,200,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
}
let hpGhost = 100, comboPop = 0;
function drawHUD(rdt){
  const p = P;
  hpGhost += (p.hp - hpGhost) * Math.min(1, rdt * 3.2);
  if (Math.abs(hpGhost - p.hp) < 0.3) hpGhost = p.hp;

  /* 生命 */
  const hw = 268, hh = 17, hx = 20, hy = 20;
  barBg(hx, hy, hw, hh);
  // 残影（受创延迟条）
  ctx.fillStyle = 'rgba(255,120,120,0.45)';
  ctx.fillRect(hx, hy, hw * clamp(hpGhost / p.maxHp, 0, 1), hh);
  const hf = clamp(p.hp / p.maxHp, 0, 1);
  const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
  if (hf > 0.35){ hg.addColorStop(0, '#e34b5a'); hg.addColorStop(1, '#ff8a6a'); }
  else { hg.addColorStop(0, '#ff5a4a'); hg.addColorStop(1, '#ffc861'); }
  ctx.fillStyle = hg;
  ctx.fillRect(hx, hy, hw * hf, hh);
  // 低血量脉冲
  if (hf < 0.32){
    ctx.globalAlpha = 0.25 + Math.sin(G.rtime * 8) * 0.2;
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.globalAlpha = 1;
  }
  ctx.font = '700 13px ' + FONT;
  ctx.fillStyle = 'rgba(240,238,250,0.9)';
  ctx.textAlign = 'left';
  ctx.fillText('生命 ' + Math.ceil(p.hp), hx, hy + hh + 16);

  /* 剑气 */
  const gx = hx, gy = hy + 38, gw = 268, gh = 9;
  barBg(gx, gy, gw, gh);
  const gf = clamp(G.gauge / 100, 0, 1);
  const gg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  gg.addColorStop(0, G.gaugeFull ? '#ff5a66' : '#4db8e8');
  gg.addColorStop(1, G.gaugeFull ? '#ffd76a' : '#8fe8d8');
  ctx.fillStyle = gg;
  ctx.fillRect(gx, gy, gw * gf, gh);
  if (G.gaugeFull){
    ctx.globalAlpha = 0.35 + Math.sin(G.rtime * 10) * 0.3;
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.globalAlpha = 1;
    ctx.font = '700 12px ' + FONT;
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('破军 · 下一击强化', gx + 2, gy + gh + 14);
  } else {
    ctx.font = '400 11px ' + FONT;
    ctx.fillStyle = 'rgba(190,200,230,0.75)';
    ctx.fillText('剑气', gx + 2, gy + gh + 13);
  }

  /* 波次 / 击杀 */
  ctx.textAlign = 'center';
  ctx.font = '700 17px ' + FONT;
  ctx.fillStyle = 'rgba(240,238,250,0.92)';
  ctx.fillText('第 ' + G.wave + ' 波', CW / 2, 30);
  ctx.font = '400 12px ' + FONT;
  ctx.fillStyle = 'rgba(180,190,220,0.7)';
  const alive = G.enemies.filter(e => !e.dead).length + G.pending.length;
  ctx.fillText(alive > 0 ? '剩余敌人 ' + alive : '——', CW / 2, 48);

  /* 击杀数（右上，避开静音按钮） */
  ctx.textAlign = 'right';
  ctx.font = '700 14px ' + FONT;
  ctx.fillStyle = 'rgba(240,238,250,0.85)';
  ctx.fillText('击碎 ' + G.kills, CW - 16, 34);
  ctx.font = '400 11px ' + FONT;
  ctx.fillStyle = 'rgba(180,190,220,0.6)';
  ctx.fillText('断肢 ' + G.limbBreaks + ' · 最高连击 ' + G.maxCombo, CW - 16, 52);

  /* 连击 */
  comboPop = Math.max(0, comboPop - rdt * 5);
  if (G.comboShowT > 0 && G.combo > 1){
    G.comboShowT -= rdt;
    const al = clamp(G.comboShowT / 0.5, 0, 1);
    const sc = 1 + comboPop * 0.5;
    ctx.save();
    ctx.translate(CW - 74, 132);
    ctx.scale(sc, sc);
    ctx.globalAlpha = al;
    ctx.textAlign = 'center';
    ctx.font = '800 46px ' + FONT;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText('' + G.combo, 2, 2);
    ctx.fillStyle = G.combo >= 12 ? '#ffd76a' : '#f4e9d8';
    ctx.fillText('' + G.combo, 0, 0);
    ctx.font = '700 13px ' + FONT;
    ctx.fillStyle = 'rgba(240,238,250,0.8)';
    ctx.fillText('连 击', 0, 20);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* 技能栏（左下角） */
  {
    const chips = [
      { key: 'U', name: '弹反', cd: p.skillCd.parry, max: 2.8 },
      { key: 'O', name: '瞬闪', cd: p.skillCd.blink, max: 5 },
      { key: 'H', name: '樱吹雪', cd: p.skillCd.storm, max: 9, cost: 40 },
      { key: 'Y', name: '落月', cd: p.skillCd.fall, max: 14 },
    ];
    for (let i = 0; i < chips.length; i++){
      const c = chips[i];
      const x = 18 + i * 58, y = CH - 98;
      const usable = c.cd <= 0 && (!c.cost || G.gauge >= c.cost) && !p.dead;
      ctx.fillStyle = 'rgba(8,10,20,0.66)';
      rr(x, y, 48, 44, 7);
      ctx.fill();
      ctx.strokeStyle = usable ? (c.cost ? 'rgba(255,180,200,0.9)' : 'rgba(150,170,220,0.85)') : 'rgba(90,100,130,0.4)';
      ctx.lineWidth = usable ? 1.8 : 1;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = '700 15px ' + FONT;
      ctx.fillStyle = usable ? '#f4ead8' : 'rgba(205,215,240,0.85)';
      ctx.fillText(c.key, x + 24, y + 19);
      ctx.font = '400 11px ' + FONT;
      ctx.fillStyle = usable ? 'rgba(210,220,240,0.9)' : 'rgba(140,150,180,0.55)';
      ctx.fillText(c.name, x + 24, y + 34);
      if (c.cd > 0){
        const frac = clamp(c.cd / c.max, 0, 1);
        ctx.fillStyle = 'rgba(6,8,16,0.72)';
        ctx.fillRect(x, y + 44 * (1 - frac), 48, 44 * frac);
        ctx.font = '700 13px ' + FONT;
        ctx.fillStyle = '#cfd8ef';
        ctx.fillText(Math.ceil(c.cd) + 's', x + 24, y + 17);
      } else if (c.cost && G.gauge < c.cost){
        ctx.font = '700 11px ' + FONT;
        ctx.fillStyle = '#8fd8ff';
        ctx.fillText(c.cost + ' 剑气', x + 24, y + 43);
      }
      if (usable && !(c.cost && G.gauge < c.cost)){
        ctx.globalAlpha = 0.35 + Math.sin(G.rtime * 6) * 0.2;
        ctx.strokeStyle = 'rgba(220,230,255,0.8)';
        ctx.lineWidth = 1;
        rr(x + 1.5, y + 1.5, 45, 41, 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  /* 底部按键提示 */
  ctx.textAlign = 'center';
  ctx.font = '400 11px ' + FONT;
  const hint = 'A/D 移动 · Space 跳跃 · J 连斩 · K 蓄力重斩 · L 影步 · I 挑空 · U 弹反 · O 瞬闪 · H 樱吹雪 · Y 落月 · R 重开';
  ctx.globalAlpha = 0.62;
  const tw = ctx.measureText(hint).width;
  ctx.fillStyle = 'rgba(8,10,20,0.55)';
  rr(CW / 2 - tw / 2 - 16, CH - 34, tw + 32, 24, 12);
  ctx.fill();
  ctx.fillStyle = 'rgba(225,230,248,0.9)';
  ctx.fillText(hint, CW / 2, CH - 18);
  ctx.globalAlpha = 1;

  /* 受创红晕 */
  if (G.hurtVig > 0 || hf < 0.32){
    const a = Math.max(G.hurtVig * 0.4, hf < 0.32 ? 0.12 + Math.sin(G.rtime * 6) * 0.05 : 0);
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.36, CW / 2, CH / 2, Math.max(CW, CH) * 0.72);
    vg.addColorStop(0, 'rgba(200,30,40,0)');
    vg.addColorStop(1, 'rgba(200,30,40,' + clamp(a, 0, 0.5) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CW, CH);
  }
  /* 慢镜蓝晕 */
  if (G.slowmoT > 0){
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.3, CW / 2, CH / 2, Math.max(CW, CH) * 0.75);
    vg.addColorStop(0, 'rgba(80,140,255,0)');
    vg.addColorStop(1, 'rgba(80,140,255,' + clamp(G.slowmoT * 0.35, 0, 0.4) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CW, CH);
  }
  /* 重击白闪（边缘） */
  if (G.flashT > 0){
    const a = clamp(G.flashT / 0.22, 0, 1) * 0.5;
    const vg2 = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.32, CW / 2, CH / 2, Math.max(CW, CH) * 0.78);
    vg2.addColorStop(0, 'rgba(' + G.flashCol + ',0)');
    vg2.addColorStop(1, 'rgba(' + G.flashCol + ',' + a + ')');
    ctx.fillStyle = vg2;
    ctx.fillRect(0, 0, CW, CH);
  }

  /* 波次横幅 */
  if (G.banner){
    const b = G.banner;
    b.t += rdt;
    const u = b.t / b.life;
    if (u >= 1){ G.banner = null; }
    else {
      const al = u < 0.12 ? u / 0.12 : u > 0.75 ? (1 - u) / 0.25 : 1;
      const yy = CH * 0.3 - eo3(Math.min(1, b.t / 0.4)) * 16;
      ctx.globalAlpha = clamp(al, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = '800 44px ' + FONT;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(b.text, CW / 2 + 2, yy + 2);
      ctx.fillStyle = '#f4ead8';
      ctx.fillText(b.text, CW / 2, yy);
      // 笔触底线
      const bw = 150 * eo3(Math.min(1, b.t / 0.5));
      const bg = ctx.createLinearGradient(CW / 2 - bw / 2, 0, CW / 2 + bw / 2, 0);
      bg.addColorStop(0, 'rgba(216,53,74,0)');
      bg.addColorStop(0.5, 'rgba(216,53,74,0.95)');
      bg.addColorStop(1, 'rgba(216,53,74,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(CW / 2 - bw / 2, yy + 12, bw, 4);
      ctx.font = '400 14px ' + FONT;
      ctx.fillStyle = 'rgba(220,225,245,0.85)';
      ctx.fillText(b.sub, CW / 2, yy + 36);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- 覆盖层 ---------------- */
function dimScreen(a){
  ctx.fillStyle = 'rgba(5,6,14,' + a + ')';
  ctx.fillRect(0, 0, CW, CH);
}
function drawTitle(rt){
  dimScreen(0.5);
  ctx.textAlign = 'center';
  const cy = CH * 0.34;
  ctx.font = '800 74px ' + FONT;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('斩 骸 夜 行', CW / 2 + 3, cy + 3);
  const tg = ctx.createLinearGradient(CW / 2 - 220, 0, CW / 2 + 220, 0);
  tg.addColorStop(0, '#f4ead8');
  tg.addColorStop(0.5, '#ffffff');
  tg.addColorStop(1, '#e8b8a8');
  ctx.fillStyle = tg;
  ctx.fillText('斩 骸 夜 行', CW / 2, cy);
  // 红月印
  ctx.fillStyle = 'rgba(216,53,74,0.9)';
  ctx.beginPath(); ctx.arc(CW / 2, cy - 96, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(216,53,74,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(CW / 2, cy - 96, 13, 0, TAU); ctx.stroke();

  ctx.font = '400 17px ' + FONT;
  ctx.fillStyle = 'rgba(215,222,244,0.85)';
  ctx.fillText('月下讨伐失控的武傀儡 · 打断它们的肢体，瓦解它们的战法', CW / 2, cy + 40);

  // 招式表（左：基础武技 / 右：奥义）
  const basics = [
    ['J', '三段连斩（可接取消）'],
    ['K', '重斩 · 按住蓄力「满月斩」'],
    ['I', '升龙挑空 → 空中连斩'],
    ['Space×2', '二段跳 · 空中K 坠斩'],
    ['L', '影步(无敌) · 看破慢镜'],
    ['剑气满', '下一击「破军」必断肢'],
  ];
  const ults = [
    ['U', '弹反·镜花 — 化解攻击并自动追斩'],
    ['O', '瞬影·一閃 — 穿行并齐斩沿途敌人'],
    ['H', '樱吹雪 — 耗40剑气·回旋三段AoE'],
    ['Y', '落月·断罪 — 引月砸地·大范围击飞'],
  ];
  const colW = 322, lx = CW / 2 - colW - 10, rx = CW / 2 + 10, by = cy + 66;
  ctx.textAlign = 'left';
  ctx.font = '700 13px ' + FONT;
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('— 基础武技 —', lx, by - 8);
  ctx.fillStyle = '#ff9bb0';
  ctx.fillText('— 奥 义 —', rx, by - 8);
  ctx.font = '400 13px ' + FONT;
  const drawRows = (list, x) => list.forEach((r, i) => {
    const y = by + i * 21;
    ctx.fillStyle = 'rgba(8,10,22,0.6)';
    rr(x, y - 14, colW, 19, 5);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(r[0], x + 64, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(225,230,248,0.9)';
    ctx.fillText(r[1], x + 72, y);
  });
  drawRows(basics, lx);
  drawRows(ults, rx);
  ctx.textAlign = 'center';

  const footY = by + 6 * 21 + 26;
  const pulse = 0.65 + Math.sin(rt * 4) * 0.35;
  ctx.globalAlpha = pulse;
  ctx.font = '700 26px ' + FONT;
  ctx.fillStyle = '#f4ead8';
  ctx.fillText('按 Enter 或点击 开始战斗', CW / 2, footY);
  ctx.globalAlpha = 1;
  ctx.font = '400 12px ' + FONT;
  ctx.fillStyle = 'rgba(170,180,210,0.6)';
  ctx.fillText('A/D 移动 · 鼠标仅用于按钮 · 右上可静音 · 游戏中左下角有技能冷却栏', CW / 2, footY + 26);
}

function drawDead(){
  dimScreen(0.55);
  ctx.textAlign = 'center';
  const cy = CH * 0.36;
  ctx.font = '800 58px ' + FONT;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('力 尽', CW / 2 + 3, cy + 3);
  ctx.fillStyle = '#e34b5a';
  ctx.fillText('力 尽', CW / 2, cy);
  ctx.font = '400 16px ' + FONT;
  ctx.fillStyle = 'rgba(225,230,248,0.9)';
  const lines = [
    '抵达 第 ' + G.wave + ' 波 · 击碎 ' + G.kills + ' 具木偶',
    '断肢 ' + G.limbBreaks + ' 次 · 最高连击 ' + G.maxCombo,
  ];
  lines.forEach((l, i) => ctx.fillText(l, CW / 2, cy + 42 + i * 24));
  const pulse = 0.65 + Math.sin(G.rtime * 4) * 0.35;
  ctx.globalAlpha = pulse;
  ctx.font = '700 24px ' + FONT;
  ctx.fillStyle = '#f4ead8';
  ctx.fillText('按 R 或 Enter 立即再战', CW / 2, cy + 122);
  ctx.globalAlpha = 1;
}

function drawPaused(){
  dimScreen(0.5);
  ctx.textAlign = 'center';
  ctx.font = '700 34px ' + FONT;
  ctx.fillStyle = '#f4ead8';
  ctx.fillText('已暂停', CW / 2, CH * 0.44);
  ctx.font = '400 15px ' + FONT;
  ctx.fillStyle = 'rgba(200,210,235,0.8)';
  ctx.fillText('按任意键或点击继续', CW / 2, CH * 0.44 + 30);
}

/* ---------------- 渲染 ---------------- */
function render(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
  drawBackground(G.rtime);

  const s = viewScale * cam.zoom;
  ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (CW / 2 + cam.sx), DPR * (CH * 0.5 + cam.sy));
  ctx.translate(-cam.x, -cam.y);

  drawPetals(false);
  drawGround(G.rtime);
  drawShocks();
  drawDebris();
  drawEnemies(G.rtime);
  drawShots();
  if (!(P.dead && P.deadT > 2.6)) drawPlayer(G.rtime);
  drawParticles();
  drawTexts();
  drawPetals(true);

  // 世界空间下的前兆凝光（武器尖端）
  for (const e of G.enemies){
    if (e.state === 'windup'){
      const u = clamp(e.stateT / Math.max(0.001, e.windupDur), 0, 1);
      const tip = enemyWeaponTip(e);
      if (tip && u > 0.5){
        const gg = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 18);
        gg.addColorStop(0, 'rgba(255,240,220,' + (0.45 + Math.sin(e.t * 30) * 0.25) + ')');
        gg.addColorStop(1, 'rgba(255,240,220,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 18, 0, TAU); ctx.fill();
      }
    }
  }

  // 屏幕空间
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (G.state !== 'title') drawHUD(1 / 60);
  if (G.state === 'title') drawTitle(G.rtime);
  else if (G.state === 'dead' && P.deadT > 0.85) drawDead();
  if (G.paused) drawPaused();
}

/* ---------------- 主循环 ---------------- */
function updateGame(sdt, fdt, rdt){
  updatePlayer(sdt, rdt);
  updateEnemies(sdt);
  updateHitboxes(sdt);
  updateShots(sdt);
  updateShocks(sdt);
  updateDebris(fdt);
  updateParticles(fdt);
  updateTexts(fdt);
  updatePetals(fdt);
  updateWaves(sdt);
  // 连击计时
  if (G.comboT > 0){
    G.comboT -= sdt;
    if (G.comboT <= 0) G.combo = 0;
  }
  G.hurtVig = Math.max(0, G.hurtVig - rdt * 1.8);
  G.flashT = Math.max(0, (G.flashT || 0) - rdt * 2.2);
  G.moonBoost = Math.max(0, (G.moonBoost || 0) - rdt * 0.8);
  updateCamera(sdt, rdt);
}

function updateTitle(fdt, rdt){
  updatePetals(fdt);
  updateParticles(fdt);
  updateTexts(fdt);
  cam.x = 1080 + Math.sin(G.rtime * 0.1) * 130;
  cam.y = 460;
  cam.zoom += (1 - cam.zoom) * Math.min(1, rdt * 4);
  cam.trauma = Math.max(0, cam.trauma - rdt * 2.6);
}

let lastT = 0;
function frame(t){
  requestAnimationFrame(frame);
  const rt = t / 1000;
  let rdt = rt - lastT;
  lastT = rt;
  if (!isFinite(rdt) || rdt < 0 || rdt > 0.5) rdt = 0.016;
  rdt = Math.min(rdt, 1 / 30);
  sfxThisFrame = 0;
  G.rtime += rdt;
  if (G.slowmoT > 0){
    G.slowmoT -= rdt;
    if (G.slowmoT <= 0) G.tsTarget = 1;
  }
  G.timeScale += (G.tsTarget - G.timeScale) * Math.min(1, rdt * 9);
  let sdt = 0;
  if (G.hitStop > 0){
    G.hitStop -= rdt;
    if (G.hitStop < 0) G.hitStop = 0;
  } else {
    sdt = rdt * G.timeScale;
  }
  const fdt = G.hitStop > 0 ? rdt * 0.3 : sdt;
  G.time += sdt;
  purgeBuf();
  if (!G.paused){
    if (G.state === 'play' || G.state === 'dead'){
      updateGame(sdt, fdt, rdt);
    } else {
      updateTitle(fdt, rdt);
    }
  }
  render();
}

/* ---------------- 流程控制 ---------------- */
function resetRun(){
  G.enemies.length = 0;
  G.hitboxes.length = 0;
  G.debris.length = 0;
  G.shots.length = 0;
  G.shocks.length = 0;
  parts.length = 0;
  texts.length = 0;
  G.combo = 0; G.comboT = 0; G.comboShowT = 0;
  G.gauge = 0; G.gaugeFull = false;
  G.kills = 0; G.maxCombo = 0;
  G.hits = 0; G.limbBreaks = 0;
  G.hitStop = 0; G.slowmoT = 0; G.tsTarget = 1; G.timeScale = 1;
  G.hurtVig = 0; G.banner = null;
  G.skillUses = { parry: 0, blink: 0, storm: 0, fall: 0, parryWins: 0 };
  G.moonBoost = 0; G.flashT = 0;
  G.waveState = 'idle';
  hpGhost = P.maxHp;
  resetPlayer();
  cam.x = P.x; cam.y = 470; cam.trauma = 0; cam.zoomP = 0;
}
function startGame(){
  resetRun();
  G.state = 'play';
  startWave(1);
  sfx('start');
  flashFx(P.x, P.y - 50, 60, 0.3, '255,235,190');
}
function restart(){
  startGame();
}

onKeyHook = function (k){
  if (G.paused && k !== 'pause'){ G.paused = false; buf.length = 0; return; }
  if (k === 'restart'){
    if (G.state === 'play' || G.state === 'dead') restart();
  } else if (k === 'confirm'){
    if (G.state === 'title') startGame();
    else if (G.state === 'dead' && P.deadT > 0.5) restart();
  } else if (k === 'pause'){
    if (G.state === 'play') G.paused = !G.paused;
  }
};
onBlurHook = function (){
  if (G.state === 'play') G.paused = true;
};

/* ---------------- 对外真实状态 ---------------- */
window.combatBenchState = function (){
  try {
    return {
      ready: true,
      playerAlive: !P.dead,
      enemyCount: G.enemies.filter(e => !e.dead).length,
      hitCount: G.hits,
      limbBreakCount: G.limbBreaks,
      playing: G.state === 'play',
    };
  } catch (err){
    return { ready: false, playerAlive: false, enemyCount: 0, hitCount: 0, limbBreakCount: 0, playing: false };
  }
};
// 仅供自动化测试读取内部坐标（只读，不影响玩法）
window.combatDebugState = function (){
  try {
    let nearest = null, nd = 1e9;
    for (const e of G.enemies){
      if (e.dead) continue;
      const d = Math.abs(e.x - P.x);
      if (d < nd){ nd = d; nearest = e; }
    }
    return {
      px: Math.round(P.x), py: Math.round(P.y), hp: Math.round(P.hp),
      dead: P.dead, state: G.state, wave: G.wave, gauge: Math.round(G.gauge),
      combo: G.combo, pstate: P.state, pmove: P.move, pmoveT: +(P.moveT || 0).toFixed(3), pcharging: P.charging, pchargeT: +(P.chargeT || 0).toFixed(3), pair: P.air,
      pvx: Math.round(P.vx), dashCd: +(P.dashCd || 0).toFixed(2), hitStop: +(G.hitStop || 0).toFixed(3),
      camX: Math.round(cam.x * 10) / 10, camY: Math.round(cam.y * 10) / 10, vs: +(viewScale).toFixed(4), zoom: +(cam.zoom).toFixed(3), CW, CH,
      debris: G.debris.length, pfacing: P.facing,
      debrisList: G.debris.slice(0, 6).map(d => ({ x: Math.round(d.x), y: Math.round(d.y) })),
      enemyAir: G.enemies.filter(e => e.airborne).length, gaugeFull: G.gaugeFull,
      nearestDx: nearest ? Math.round(nearest.x - P.x) : null,
      nearestType: nearest ? nearest.type : null,
      nearestState: nearest ? nearest.state : null,
      nearestWindupT: nearest && nearest.state === 'windup' ? Math.round(clamp(nearest.stateT / Math.max(0.001, nearest.windupDur), 0, 1) * 100) / 100 : null,
      skillCd: { parry: +(P.skillCd.parry).toFixed(2), blink: +(P.skillCd.blink).toFixed(2), storm: +(P.skillCd.storm).toFixed(2), fall: +(P.skillCd.fall).toFixed(2) },
      skillUses: Object.assign({}, G.skillUses),
      enemies: G.enemies.filter(e => !e.dead).map(e => ({ x: Math.round(e.x), type: e.type, hp: Math.round(e.hp) })),
      pending: G.pending.length, waveState: G.waveState,
    };
  } catch (err){ return null; }
};

/* ---------------- 启动 ---------------- */
function boot(){
  resize();
  initBackground();
  initPetals();
  resetPlayer();
  cam.x = 1080; cam.y = 460;

  // 静音按钮
  try {
    const btn = document.getElementById('muteBtn');
    if (btn){
      const sync = function (){ btn.textContent = muted ? '音效 关' : '音效 开'; };
      btn.addEventListener('click', function (ev){
        ev.stopPropagation();
        unlockAudio();
        setMuted(!muted);
        sync();
        try { btn.blur(); } catch (err){}
      });
      sync();
    }
  } catch (err){}

  // 点击画布：开始 / 再战 / 恢复
  canvas.addEventListener('pointerdown', function (){
    unlockAudio();
    if (G.paused){ G.paused = false; buf.length = 0; return; }
    if (G.state === 'title') startGame();
    else if (G.state === 'dead' && P.deadT > 0.5) restart();
  });

  G.running = true;
  requestAnimationFrame(frame);
}
boot();

/* ============================================================ */
})();
