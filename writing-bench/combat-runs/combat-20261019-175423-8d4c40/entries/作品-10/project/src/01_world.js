'use strict';
/* ============================================================
   斩骸夜行 —— 01 世界层
   背景（夜幕/月/远山/鸟居/灯火）/ 花瓣 / 地面与石台 / 断肢实体 / 弩箭 / 冲击波
   ============================================================ */

/* ---------------- 背景数据（启动时生成一次） ---------------- */
let bgLayers = [], decorTrees = [], lanterns = [], stoneCracks = [], grasses = [];
const PLATFORMS = [
  { x: 560,  y: 420, w: 190, h: 16 },
  { x: 1280, y: 396, w: 230, h: 18 },
  { x: 1980, y: 424, w: 180, h: 16 },
];

function initBackground(){
  const R = mkSeed(20261019);
  // 三层远山剪影
  bgLayers = [];
  const cfg = [
    { f: 0.12, base: 385, amp: 70, col: '#171c30', jag: 9 },
    { f: 0.28, base: 425, amp: 95, col: '#111527', jag: 11 },
    { f: 0.52, base: 470, amp: 120, col: '#0b0e1d', jag: 13 },
  ];
  for (const c of cfg){
    const pts = [];
    const span = ARENA_W * 1.6;
    let x = -span * 0.3;
    while (x < span){
      pts.push({ x, y: c.base - R() * c.amp });
      x += span / c.jag * (0.5 + R());
    }
    bgLayers.push({ ...c, pts, span });
  }
  // 枯树剪影
  decorTrees = [];
  for (let i = 0; i < 9; i++){
    decorTrees.push({ x: R() * ARENA_W, s: 0.6 + R() * 0.9, lean: (R() - 0.5) * 0.5, layer: R() < 0.5 ? 0.62 : 0.82 });
  }
  // 石灯笼
  lanterns = [];
  for (let i = 0; i < 7; i++){
    lanterns.push({ x: 160 + i * (ARENA_W - 320) / 6 + (R() - 0.5) * 60, ph: R() * TAU, layer: 0.94 });
  }
  // 地面裂纹与草
  stoneCracks = [];
  for (let i = 0; i < 42; i++) stoneCracks.push({ x: R() * ARENA_W, y: GROUND_Y + 8 + R() * 60, w: 10 + R() * 46, h: 1 + R() * 2.2, a: 0.05 + R() * 0.1 });
  grasses = [];
  for (let i = 0; i < 46; i++) grasses.push({ x: R() * ARENA_W, h: 4 + R() * 9, ph: R() * TAU });
}

/* ---------------- 花瓣 ---------------- */
let petals = [];
function initPetals(){
  petals = [];
  for (let i = 0; i < 84; i++){
    petals.push({ x: rnd(0, ARENA_W), y: rnd(-100, GROUND_Y), vx: rnd(-26, -6), vy: rnd(18, 52), rot: rnd(0, TAU), vr: rnd(-3, 3), s: rnd(2.2, 4.6), ph: rnd(0, TAU), depth: rnd(0.5, 1.3) });
  }
}
function updatePetals(dt){
  const l = cam.x - viewW / 2 - 60, r = cam.x + viewW / 2 + 60;
  for (const p of petals){
    p.ph += dt * 1.7;
    p.x += (p.vx + Math.sin(p.ph) * 16) * dt;
    p.y += p.vy * dt * (0.6 + Math.sin(p.ph * 0.7) * 0.3);
    p.rot += p.vr * dt;
    if (p.y > GROUND_Y + 8){ p.y = rnd(-140, -20); p.x = rnd(l, r); }
    if (p.x < l) p.x = r - rnd(0, 30);
    if (p.x > r) p.x = l + rnd(0, 30);
  }
}
function petalBlast(x, y, rad, dir){
  for (const p of petals){
    const dx = p.x - x, dy = p.y - y;
    if (dx * dx + dy * dy < rad * rad){
      p.vx += dir * rnd(60, 200); p.vy -= rnd(20, 110);
      p.vr += rnd(-8, 8);
    }
  }
}
function drawPetals(front){
  for (const p of petals){
    if (front ? p.depth < 1 : p.depth >= 1) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot + Math.sin(p.ph) * 0.5);
    ctx.globalAlpha = 0.5 * Math.min(1, p.depth);
    ctx.fillStyle = '#e9a8b8';
    ctx.beginPath();
    ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------------- 背景绘制 ---------------- */
function drawBackground(rt){
  // 天空
  const sky = ctx.createLinearGradient(0, 0, 0, CH);
  sky.addColorStop(0, '#070912');
  sky.addColorStop(0.45, '#12142a');
  sky.addColorStop(0.8, '#221a38');
  sky.addColorStop(1, '#2e1f36');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, CH);

  // 月（几乎不动；「落月·断罪」施放时月辉增强）
  const mb = 1 + (G.moonBoost || 0) * 0.9;
  const mx = CW * 0.72 - (cam.x - ARENA_W / 2) * 0.012;
  const my = CH * 0.2;
  const mr = Math.min(CW, CH) * 0.13 + 26;
  const mg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 2.6 * mb);
  mg.addColorStop(0, 'rgba(244,236,214,' + Math.min(0.5, 0.22 * mb) + ')');
  mg.addColorStop(1, 'rgba(244,236,214,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(mx, my, mr * 2.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#efe6cd';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(210,200,175,0.5)';
  ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.16, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.28, mr * 0.1, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + mr * 0.05, my - mr * 0.45, mr * 0.07, 0, TAU); ctx.fill();

  // 云带横过月面
  ctx.fillStyle = 'rgba(14,15,30,0.55)';
  ctx.beginPath();
  ctx.ellipse(mx - mr * 0.7, my + mr * 0.15, mr * 1.5, mr * 0.16, -0.06, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(mx + mr * 0.9, my - mr * 0.4, mr * 1.1, mr * 0.1, 0.04, 0, TAU);
  ctx.fill();

  // 远山（视差）
  for (const L of bgLayers){
    const off = cam.x * L.f;
    ctx.fillStyle = L.col;
    ctx.beginPath();
    ctx.moveTo(-60, CH);
    for (const p of L.pts){
      const sx = p.x - off;
      if (sx < -260 || sx > viewW + 260) continue;
      ctx.lineTo(sx, p.y - (cam.y - 470) * L.f * 0.5);
    }
    ctx.lineTo(viewW + 60, CH);
    ctx.closePath();
    ctx.fill();
  }

  // 枯树剪影
  ctx.fillStyle = '#0a0c18';
  for (const t of decorTrees){
    const sx = t.x - cam.x * t.layer + (cam.x - ARENA_W / 2) * t.layer;
    if (sx < -80 || sx > viewW + 80) continue;
    const gy = GROUND_Y + 6 - (cam.y - 470) * t.layer * 0.9;
    ctx.save();
    ctx.translate(sx, gy);
    ctx.rotate(t.lean);
    ctx.scale(t.s, t.s);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-2.5, -70);
    ctx.lineTo(-8, -100);
    ctx.lineTo(-3, -104);
    ctx.lineTo(2, -74);
    ctx.lineTo(6, -108);
    ctx.lineTo(12, -112);
    ctx.lineTo(13, -106);
    ctx.lineTo(7, -70);
    ctx.lineTo(4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, -86);
    ctx.lineTo(-24, -108);
    ctx.lineTo(-21, -112);
    ctx.lineTo(0, -94);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 石灯笼（暖光）
  for (const l of lanterns){
    const sx = l.x - cam.x * l.layer + (cam.x - ARENA_W / 2) * l.layer;
    if (sx < -60 || sx > viewW + 60) continue;
    const gy = GROUND_Y + 4 - (cam.y - 470) * l.layer * 0.9;
    const fl = 0.82 + Math.sin(rt * 5 + l.ph) * 0.1 + Math.sin(rt * 13.7 + l.ph * 3) * 0.05;
    const lg = ctx.createRadialGradient(sx, gy - 34, 2, sx, gy - 34, 46);
    lg.addColorStop(0, 'rgba(255,190,110,' + (0.3 * fl) + ')');
    lg.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(sx, gy - 34, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0d0f1c';
    ctx.fillRect(sx - 3, gy - 26, 6, 26);
    ctx.fillRect(sx - 11, gy - 44, 22, 16);
    ctx.fillStyle = 'rgba(255,196,120,' + (0.85 * fl) + ')';
    ctx.fillRect(sx - 7, gy - 41, 14, 10);
    ctx.fillStyle = '#0d0f1c';
    ctx.beginPath(); ctx.moveTo(sx - 15, gy - 44); ctx.lineTo(sx + 15, gy - 44); ctx.lineTo(sx + 9, gy - 52); ctx.lineTo(sx - 9, gy - 52); ctx.closePath(); ctx.fill();
  }
}

/* ---------------- 地面 / 石台 / 场地边界 ---------------- */
function drawGround(rt){
  // 主地面
  const gg = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 120);
  gg.addColorStop(0, '#232a45');
  gg.addColorStop(0.08, '#151a2e');
  gg.addColorStop(1, '#0a0c16');
  ctx.fillStyle = gg;
  ctx.fillRect(-200, GROUND_Y, ARENA_W + 400, 260);
  // 地表高光线
  ctx.strokeStyle = 'rgba(150,166,220,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-200, GROUND_Y + 1); ctx.lineTo(ARENA_W + 200, GROUND_Y + 1); ctx.stroke();
  // 石缝
  for (const c of stoneCracks){
    ctx.fillStyle = 'rgba(8,10,20,' + c.a + ')';
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }
  // 草
  for (const g of grasses){
    const sway = Math.sin(rt * 2 + g.ph) * 2.4;
    ctx.strokeStyle = 'rgba(96,120,170,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(g.x, GROUND_Y + 2);
    ctx.quadraticCurveTo(g.x + sway, GROUND_Y - g.h * 0.5, g.x + sway * 2, GROUND_Y - g.h);
    ctx.stroke();
  }
  // 两端鸟居门（出生点）
  for (const gx of [70, ARENA_W - 70]){
    drawTorii(gx, GROUND_Y, 1);
  }
  // 边界雾墙
  for (const [bx, bdir] of [[28, 1], [ARENA_W - 28, -1]]){
    const fg = ctx.createLinearGradient(bx - (bdir > 0 ? 90 : 0), 0, bx + (bdir > 0 ? 0 : 90), 0);
    fg.addColorStop(0, 'rgba(10,12,26,0)');
    fg.addColorStop(1, 'rgba(10,12,26,0.72)');
    ctx.fillStyle = fg;
    ctx.fillRect(bx - (bdir > 0 ? 90 : 0), GROUND_Y - 320, 90, 340);
  }
  // 高台（单向平台）
  for (const p of PLATFORMS){
    const pg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    pg.addColorStop(0, '#2c3557');
    pg.addColorStop(0.25, '#1a2140');
    pg.addColorStop(1, '#10132a');
    ctx.fillStyle = pg;
    rr(p.x - p.w / 2, p.y, p.w, p.h + 10, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(160,176,230,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(p.x - p.w / 2 + 3, p.y + 1); ctx.lineTo(p.x + p.w / 2 - 3, p.y + 1); ctx.stroke();
    // 支撑石柱
    ctx.fillStyle = 'rgba(18,22,44,0.9)';
    ctx.fillRect(p.x - p.w / 2 + 10, p.y + p.h, 8, GROUND_Y - p.y - p.h);
    ctx.fillRect(p.x + p.w / 2 - 18, p.y + p.h, 8, GROUND_Y - p.y - p.h);
    // 垂落的草
    ctx.strokeStyle = 'rgba(96,120,170,0.3)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++){
      const hx = p.x - p.w / 2 + 14 + i * (p.w - 28) / 3;
      ctx.beginPath(); ctx.moveTo(hx, p.y + p.h + 10); ctx.lineTo(hx + Math.sin(rt * 1.6 + i) * 2, p.y + p.h + 16 + (i % 2) * 5); ctx.stroke();
    }
  }
}
function drawTorii(x, gy, s){
  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(s, s);
  ctx.fillStyle = '#251b2e';
  ctx.fillRect(-26, -150, 9, 150);
  ctx.fillRect(17, -150, 9, 150);
  ctx.fillRect(-38, -158, 76, 10);
  ctx.beginPath(); ctx.moveTo(-46, -170); ctx.lineTo(46, -170); ctx.lineTo(40, -160); ctx.lineTo(-40, -160); ctx.closePath(); ctx.fill();
  ctx.fillRect(-7, -140, 14, 6);
  ctx.fillStyle = 'rgba(210,90,110,0.16)';
  ctx.fillRect(-38, -158, 76, 3);
  ctx.restore();
}

/* ---------------- 断肢实体（可见的肢体破坏） ---------------- */
function spawnDebrisPoly(x, y, pts, vx, vy, col, stroke, big){
  G.debris.push({
    x, y, vx, vy, rot: rnd(0, TAU), vr: rnd(-9, 9),
    pts, col, stroke: stroke || '#2b1d12',
    life: rnd(5.5, 7.5), t: 0, landed: false, bounces: 0, hitEnemies: false, big: !!big,
  });
}
function updateDebris(dt){
  for (let i = G.debris.length - 1; i >= 0; i--){
    const d = G.debris[i];
    d.t += dt;
    if (d.t > d.life){ G.debris.splice(i, 1); continue; }
    if (d.landed){
      d.vx *= Math.max(0, 1 - dt * 4);
      d.vr *= Math.max(0, 1 - dt * 4);
      continue;
    }
    d.vy += 1500 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rot += d.vr * dt;
    // 撞到其他敌人（飞出的肢体有碰撞威力）
    if (!d.hitEnemies && Math.abs(d.vx) + Math.abs(d.vy) > 380){
      for (const e of G.enemies){
        if (e.dead || e.state === 'spawn') continue;
        if (Math.abs(d.x - e.x) < e.w * 0.6 && d.y > e.y - e.h && d.y < e.y){
          d.hitEnemies = true;
          damageEnemyLight(e, 5, sgn(d.vx), d.x, d.y);
          break;
        }
      }
    }
    // 场地侧壁反弹（碎块不飘出场外）
    if (d.x < 34){ d.x = 34; d.vx = Math.abs(d.vx) * 0.5; }
    if (d.x > ARENA_W - 34){ d.x = ARENA_W - 34; d.vx = -Math.abs(d.vx) * 0.5; }
    // 落地
    let floor = GROUND_Y;
    for (const p of PLATFORMS){
      if (Math.abs(d.x - p.x) < p.w / 2 && d.y >= p.y && d.y - d.vy * dt <= p.y + 4) floor = Math.min(floor, p.y);
    }
    if (d.y >= floor){
      d.y = floor;
      if (Math.abs(d.vy) > 120){
        d.vy *= -0.36; d.vx *= 0.6; d.vr *= 0.55; d.bounces++;
        chips(d.x, d.y, d.big ? 5 : 3, d.col);
        dust(d.x, d.y, 3, 0.7, sgn(d.vx));
        if (d.bounces <= 2) sfx('bounce');
      } else {
        d.vy = 0; d.vx *= 0.4; d.landed = true;
        d.rot = Math.round(d.rot / PI) * PI + rnd(-0.14, 0.14);
        dust(d.x, d.y, 3, 0.7, sgn(d.vx));
      }
    }
  }
}
function drawDebris(){
  for (const d of G.debris){
    const fade = d.t > d.life - 1 ? Math.max(0, d.life - d.t) : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, fade);
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle = d.col;
    ctx.strokeStyle = d.stroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(d.pts[0][0], d.pts[0][1]);
    for (let i = 1; i < d.pts.length; i++) ctx.lineTo(d.pts[i][0], d.pts[i][1]);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 断口纹理
    ctx.strokeStyle = 'rgba(20,10,6,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(d.pts[0][0] * 0.5, d.pts[0][1] * 0.5);
    ctx.lineTo(d.pts[2][0] * 0.55, d.pts[2][1] * 0.55);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------------- 敌方弩箭（可被斩落） ---------------- */
function spawnBolt(x, y, tx, ty, dmg){
  const a = Math.atan2(ty - y, tx - x);
  const sp = 545;
  G.shots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a, dmg, t: 0, dead: false, trail: [] });
  sfx('bow');
}
function updateShots(dt){
  for (let i = G.shots.length - 1; i >= 0; i--){
    const s = G.shots[i];
    s.t += dt;
    if (s.dead || s.t > 5){ G.shots.splice(i, 1); continue; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.trail.push([s.x, s.y]);
    if (s.trail.length > 7) s.trail.shift();
    if (s.x < -60 || s.x > ARENA_W + 60 || s.y > GROUND_Y + 10){
      if (s.y > GROUND_Y){ chips(s.x, GROUND_Y, 3, '#7a5a40'); dust(s.x, GROUND_Y, 3, 0.6, sgn(s.vx)); }
      G.shots.splice(i, 1); continue;
    }
    // 命中玩家（弹反架势中 → 拨挡反弹）
    const p = P;
    if (!p.dead && p.parryT > 0 && !s.friendly &&
        s.x > p.x - 24 && s.x < p.x + 24 && s.y > p.y - p.h - 10 && s.y < p.y + 10){
      s.vx = -s.vx * 1.6;
      s.vy = -Math.abs(s.vy) * 0.6 - 60;
      s.friendly = true;
      s.dmg = 14;
      s.insight = true;
      parrySuccess(null);
      continue;
    }
    if (!p.dead && !s.friendly && p.iFrames <= 0 && p.dashInv <= 0 &&
        s.x > p.x - 16 && s.x < p.x + 16 && s.y > p.y - p.h && s.y < p.y){
      damagePlayer(s.dmg, sgn(s.vx) || 1, { kb: 190 });
      G.shots.splice(i, 1); continue;
    }
    // 反弹的箭矢伤害敌人
    if (s.friendly){
      for (const e of G.enemies){
        if (e.dead) continue;
        if (s.x > e.x - e.w / 2 && s.x < e.x + e.w / 2 && s.y > e.y - e.h && s.y < e.y){
          damageEnemy(e, {
            rect: () => ({ l: s.x - 10, r: s.x + 10, t: s.y - 10, b: s.y + 10 }),
            dmg: s.dmg, kb: 160, kbY: -120, hs: 0.04, partMul: 1,
          });
          G.shots.splice(i, 1);
          break;
        }
      }
    }
    // 冲刺无敌帧穿过 → 看破
    if (p.dashInv > 0 && !s.insight && s.x > p.x - 20 && s.x < p.x + 20 && s.y > p.y - p.h - 8 && s.y < p.y + 8){
      s.insight = true;
      triggerInsight(s.x, s.y);
    }
  }
}
function drawShots(){
  for (const s of G.shots){
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.atan2(s.vy, s.vx));
    // 尾焰
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ff9b4d';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-4, 0); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -3); ctx.lineTo(-9, 0); ctx.lineTo(-6, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#33241a';
    ctx.fillRect(-11, -1.6, 6, 3.2);
    ctx.restore();
  }
}

/* ---------------- 地面冲击波（重锤招式） ---------------- */
function spawnShock(x, dir, dmg, big){
  G.shocks.push({ x, dir, dmg, t: 0, life: big ? 1.05 : 0.85, speed: big ? 380 : 330, big: !!big, hit: false });
}
function updateShocks(dt){
  const p = P;
  for (let i = G.shocks.length - 1; i >= 0; i--){
    const s = G.shocks[i];
    s.t += dt;
    s.x += s.dir * s.speed * dt;
    if (s.t > s.life || s.x < 10 || s.x > ARENA_W - 10){ G.shocks.splice(i, 1); continue; }
    if (Math.random() < 0.7) dust(s.x, GROUND_Y, 1, s.big ? 0.9 : 0.6, s.dir);
    if (!s.hit && !p.dead && p.iFrames <= 0 && p.dashInv <= 0 && p.y > GROUND_Y - 26 && Math.abs(p.x - s.x) < 24){
      s.hit = true;
      damagePlayer(s.dmg, s.dir, { kb: 300, vy: -330 });
    }
  }
}
function drawShocks(){
  for (const s of G.shocks){
    const u = s.t / s.life;
    const h = (s.big ? 40 : 30) * (1 - u * 0.5) * (0.7 + Math.sin(s.t * 40) * 0.3);
    ctx.globalAlpha = 0.85 * (1 - u);
    // 地面碎屑脊
    ctx.fillStyle = '#3a4468';
    ctx.beginPath();
    ctx.moveTo(s.x - 16 * s.dir, GROUND_Y);
    ctx.lineTo(s.x, GROUND_Y - h);
    ctx.lineTo(s.x + 10 * s.dir, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,90,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x - 8 * s.dir, GROUND_Y);
    ctx.lineTo(s.x, GROUND_Y - h * 0.8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
