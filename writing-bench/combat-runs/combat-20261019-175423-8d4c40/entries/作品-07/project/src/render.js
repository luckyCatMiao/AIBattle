// ============================================================================
// render.js — Canvas 绘制：背景、地面、角色、敌人（分段肢体）、粒子、HUD
// 视口对象 view 提供 toX/toY（世界坐标 → 屏幕坐标）。
// ============================================================================

// 圆角矩形路径（兼容性 + 便于在无 roundRect 的测试桩中运行）
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

class Renderer {
  constructor(game) {
    this.game = game;
    this.bgSeed = [];
    for (let i = 0; i < 40; i++) {
      this.bgSeed.push({ x: rand(0, 2000), y: rand(-520, -60), s: rand(0.6, 2.2), p: rand(0, 1) });
    }
  }

  // 静态背景（不随摄像机滚动，仅视差）
  drawBackground(ctx, view, time) {
    const g = this.game;
    const W = view.w, H = view.h;
    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, COLORS.bgTop);
    sky.addColorStop(0.55, COLORS.bgMid);
    sky.addColorStop(1, COLORS.bgBot);
    ctx.fillStyle = sky;
    ctx.fillRect(-60, -60, W + 120, H + 120);

    const groundY = view.groundY;

    // 月亮
    const mx = W * 0.78, my = H * 0.22;
    const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 90);
    mg.addColorStop(0, 'rgba(232,236,255,0.9)');
    mg.addColorStop(0.18, 'rgba(232,236,255,0.35)');
    mg.addColorStop(1, 'rgba(232,236,255,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.moon;
    ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(11,15,30,0.25)';
    ctx.beginPath(); ctx.arc(mx - 8, my - 4, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 6, my + 8, 5, 0, Math.PI * 2); ctx.fill();

    // 远景山峦（视差 0.12）
    this._mountains(ctx, W, groundY, 0.12, COLORS.mountainFar, 90, 0);
    this._mountains(ctx, W, groundY, 0.22, COLORS.mountainNear, 70, 20);
  }

  _mountains(ctx, W, groundY, par, color, h, seed) {
    const camX = this.game.camX * par;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    const step = 140;
    for (let x = -step; x <= W + step; x += step) {
      const wx = x + camX;
      const y = groundY - h * (0.5 + 0.5 * hash01(Math.floor(wx / step) + seed));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();
  }

  // 世界层：地面 + 齿轮剪影装饰
  drawWorldBack(ctx, view, time) {
    const g = this.game;
    const W = view.w, H = view.h, groundY = view.groundY;
    const camX = g.camX * 0.4;

    // 远处齿轮剪影
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 6; i++) {
      const gx = ((i * 420 - camX) % (W + 500) + W + 500) % (W + 500) - 250;
      const gy = groundY - 60 - (i % 3) * 30;
      ctx.strokeStyle = '#2a3350';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(gx, gy, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 地面主体
    const gnd = ctx.createLinearGradient(0, groundY, 0, H);
    gnd.addColorStop(0, COLORS.groundTop);
    gnd.addColorStop(0.12, COLORS.ground);
    gnd.addColorStop(1, '#14101f');
    ctx.fillStyle = gnd;
    ctx.fillRect(-60, groundY, W + 120, H - groundY + 60);

    // 地面顶部亮线
    ctx.fillStyle = COLORS.groundEdge;
    ctx.fillRect(-60, groundY, W + 120, 2);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-60, groundY + 2, W + 120, 3);
    ctx.globalAlpha = 1;

    // 地面纹理短线
    ctx.strokeStyle = 'rgba(120,110,180,0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const gx = ((i * 173 - camX) % (W + 200) + W + 200) % (W + 200) - 100;
      const gy = groundY + 14 + (i % 4) * 12;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 30, gy + 6);
      ctx.stroke();
    }
  }

  drawPlayer(ctx, view, p, time) {
    // 受伤无敌期间的闪烁提示（冲刺无敌不闪，避免干扰残影表现）
    if (p.invuln > 0 && p.state !== 'dash' && p.state !== 'dead' && Math.floor(time * 16) % 2 === 0) return;
    const sx = view.toX(p.x);
    const sy = view.toY(p.y);
    const f = p.facing;
    ctx.save();
    ctx.translate(sx, sy);

    // 残影
    for (const gh of p.ghosts) {
      const gx = view.toX(gh.x), gy = view.toY(gh.y);
      ctx.save();
      ctx.globalAlpha = gh.life * 0.25;
      ctx.translate(gx, gy);
      ctx.scale(gh.facing, 1);
      this._drawPlayerBody(ctx, p, gh, time, true);
      ctx.restore();
    }

    ctx.scale(f, 1);
    this._drawPlayerBody(ctx, p, p, time, false);
    ctx.restore();
  }

  _drawPlayerBody(ctx, p, pose, time, ghost) {
    const h = p.h;
    const charge = pose.charge || 0;
    const attackName = pose.attackName;
    const attackTimer = pose.attackTimer || 0;

    // 计算持刀角度（弧度，0=朝右，正=向下，负=向上）
    let swordA = -0.55;
    let armLift = 0;
    let lean = clamp(p.vx / CFG.dashSpeed, -0.5, 0.5) * 0.25;
    if (!ghost && p.charging) {
      swordA = 2.6 - charge * 1.6;
      armLift = 1;
      lean = 0.18;
    } else if (attackName && ATTACKS[attackName]) {
      const a = ATTACKS[attackName];
      const w = a.windup, ac = a.active;
      if (attackTimer < w) {
        const t = attackTimer / w;
        swordA = -0.55 + t * 2.9; // 拉后
        armLift = t * 0.7;
      } else if (attackTimer < w + ac) {
        const t = (attackTimer - w) / ac;
        swordA = 2.35 - t * 3.4; // 挥出
        armLift = 0.6;
        lean = 0.2 * (1 - t);
      } else {
        swordA = -1.05;
        armLift = 0.3;
      }
      if (attackName === 'launcher') {
        if (attackTimer < w) swordA = -2.6;
        else if (attackTimer < w + ac) swordA = -2.6 + ((attackTimer - w) / ac) * 1.6;
      }
      if (attackName === 'air1' || attackName === 'air2') {
        swordA = attackTimer < w ? -2.2 : -1.4 + Math.sin(attackTimer * 20) * 0.4;
      }
    } else if (pose.state === 'skill' && p.skillDef) {
      const sd = p.skillDef;
      if (!p.skillFired) {
        // 前摇蓄势
        swordA = (sd.type === 'lightning' || sd.type === 'nova') ? -2.4 : 2.4;
        armLift = 1;
        lean = -0.22;
      } else {
        swordA = sd.type === 'dashSlash' ? 0.25 : -1.0;
        lean = sd.type === 'dashSlash' ? 0.4 : 0.1;
        armLift = 0.4;
      }
    } else if (pose.state === 'dash') {
      swordA = -2.2;
      lean = 0.35;
    } else if (pose.state === 'hurt') {
      swordA = -0.9;
      lean = -0.3;
    }

    // 受击白闪
    const flash = p.hitFlash > 0 && !ghost;
    const bodyCol = flash ? '#ffffff' : COLORS.playerBody;
    const litCol = flash ? '#ffffff' : COLORS.playerBodyLit;

    // 腿（跑动摆动）
    const runCycle = Math.sin(time * (Math.abs(p.vx) > 30 ? 12 : 0) + (pose === p ? 0 : Math.PI));
    const legSwing = (p.grounded ? runCycle : 0.4) * clamp(Math.abs(p.vx) / 300, 0, 1) + (p.grounded ? 0 : 0.25);
    ctx.lineCap = 'round';
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 7;
    // 后腿
    ctx.beginPath();
    ctx.moveTo(-4, -34);
    ctx.lineTo(-4 + Math.sin(legSwing) * 14, -8);
    ctx.lineTo(-6 + Math.sin(legSwing) * 20, 0);
    ctx.stroke();
    // 前腿
    ctx.beginPath();
    ctx.moveTo(4, -34);
    ctx.lineTo(4 - Math.sin(legSwing) * 14, -8);
    ctx.lineTo(6 - Math.sin(legSwing) * 20, 0);
    ctx.stroke();

    // 躯干
    ctx.save();
    ctx.translate(0, -38);
    ctx.rotate(lean);
    ctx.fillStyle = bodyCol;
    rr(ctx, -11, -24, 22, 44, 7);
    ctx.fill();
    // 束带
    ctx.fillStyle = flash ? '#fff' : '#2a3550';
    ctx.fillRect(-11, -4, 22, 5);
    // 胸口高光
    ctx.fillStyle = litCol;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(-6, -20, 4, 14);
    ctx.globalAlpha = 1;
    ctx.restore();

    // 头 + 围巾
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.arc(2, -58, 9, 0, Math.PI * 2);
    ctx.fill();
    // 围巾（飘动）
    const scarfWave = Math.sin(time * 9) * 4;
    ctx.fillStyle = flash ? '#fff' : COLORS.playerScarf;
    ctx.beginPath();
    ctx.moveTo(-4, -62);
    ctx.quadraticCurveTo(-18, -52 + scarfWave, -26, -38 + scarfWave * 1.4);
    ctx.quadraticCurveTo(-14, -46, -6, -54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? '#eee' : COLORS.playerScarf2;
    ctx.beginPath();
    ctx.moveTo(-6, -60);
    ctx.quadraticCurveTo(-16, -50 + scarfWave, -20, -40 + scarfWave);
    ctx.quadraticCurveTo(-12, -44, -5, -52);
    ctx.closePath();
    ctx.fill();

    // 手臂 + 刀
    const shoulderX = 6, shoulderY = -46;
    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(swordA);
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 2);
    ctx.stroke();
    // 刀身
    const bladeLen = 46 + (p.charging ? charge * 14 : 0);
    ctx.save();
    ctx.translate(16, 2);
    if (!ghost && (p.charging || (attackName && attackTimer < ATTACKS[attackName].windup + ATTACKS[attackName].active))) {
      ctx.shadowColor = COLORS.bladeGlow;
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = flash ? '#fff' : COLORS.blade;
    ctx.beginPath();
    ctx.moveTo(0, -2.5);
    ctx.lineTo(bladeLen, -1.5);
    ctx.lineTo(bladeLen + 8, 0.5);
    ctx.lineTo(bladeLen, 2.5);
    ctx.lineTo(0, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 刀柄
    ctx.fillStyle = flash ? '#fff' : '#5a3a2a';
    ctx.fillRect(-5, -2, 6, 4);
    ctx.restore();
  }

  drawEnemy(ctx, view, e, time) {
    if (e.dead) return;
    const sx = view.toX(e.x);
    const sy = view.toY(e.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(e.facing, 1);
    this._drawEnemyBody(ctx, e, time);
    ctx.restore();
  }

  _drawEnemyBody(ctx, e, time) {
    const h = e.h, w = e.w;
    const flash = e.hitFlash > 0;
    const slowed = e.slowTimer > 0 && !flash;
    const steel = flash ? '#ffffff' : (slowed ? '#4a5a7a' : COLORS.enemySteel);
    const steelDark = flash ? '#e0e0e0' : (slowed ? '#2a3450' : COLORS.enemySteelDark);
    const steelLit = flash ? '#ffffff' : (slowed ? '#7f96c8' : COLORS.enemySteelLit);

    // 出招前摇红色预警光
    const windupGlow = e.state === 'windup' ? 0.5 + 0.5 * Math.sin(time * 40) : 0;
    if (windupGlow > 0.05 && !flash) {
      ctx.save();
      ctx.globalAlpha = windupGlow * 0.5;
      ctx.fillStyle = COLORS.enemyEye;
      ctx.beginPath();
      ctx.arc(0, -h * 0.5, h * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 腿（行走摆动）
    const walk = Math.sin(e.walkPhase);
    const bothLegsGone = e.limbs.legL.broken && e.limbs.legR.broken;
    this._limbPart(ctx, e, 'legL', -1, (l) => {
      const swing = e.state === 'walk' || e.state === 'idle' ? walk * 0.5 : 0.15;
      this._drawLeg(ctx, e, l, -w * 0.2, -h * 0.46, swing, steel, steelDark, steelLit);
    });
    this._limbPart(ctx, e, 'legR', 1, (l) => {
      const swing = e.state === 'walk' || e.state === 'idle' ? -walk * 0.5 : 0.15;
      this._drawLeg(ctx, e, l, w * 0.2, -h * 0.46, swing, steel, steelDark, steelLit);
    });

    // 躯干
    ctx.fillStyle = steelDark;
    ctx.strokeStyle = steelLit;
    ctx.lineWidth = 2;
    rr(ctx, -w * 0.42, -h * 0.78, w * 0.84, h * 0.5, 8);
    ctx.fill();
    ctx.stroke();
    // 胸口能源核心
    ctx.fillStyle = flash ? '#fff' : COLORS.enemyCore;
    ctx.beginPath();
    ctx.arc(0, -h * 0.5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(-2, -h * 0.5 - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 头
    this._limbPart(ctx, e, 'head', 0, (l) => {
      ctx.fillStyle = steel;
      ctx.strokeStyle = steelLit;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -h * 0.84, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 独眼
      ctx.fillStyle = flash ? '#fff' : COLORS.enemyEye;
      ctx.beginPath();
      ctx.arc(4, -h * 0.84, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 手臂
    const armSwing = e.state === 'attack' ? Math.sin(e.attackTimer * 40) * 0.9 : (e.state === 'windup' ? -0.9 : 0);
    this._limbPart(ctx, e, 'armL', -1, (l) => {
      this._drawArm(ctx, e, l, -w * 0.5, -h * 0.72, -armSwing * 0.4, steel, steelDark, steelLit, null);
    });
    if (e.type === 'blade') {
      this._limbPart(ctx, e, 'armR', 1, (l) => {
        this._drawArm(ctx, e, l, w * 0.5, -h * 0.72, armSwing, steel, steelDark, steelLit, 'blade');
      });
    } else {
      this._limbPart(ctx, e, 'cannon', 1, (l) => {
        this._drawCannon(ctx, e, l, w * 0.5, -h * 0.72, armSwing, steel, steelDark, steelLit);
      });
    }
  }

  // 仅在肢体未断时绘制
  _limbPart(ctx, e, id, side, fn) {
    const l = e.limbs[id];
    if (l && !l.broken) fn(l, side);
  }

  _drawLeg(ctx, e, l, x, y, swing, steel, steelDark, steelLit) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing);
    ctx.strokeStyle = steel;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 30);
    ctx.stroke();
    ctx.strokeStyle = steelDark;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(3, 40);
    ctx.stroke();
    // 关节
    ctx.fillStyle = COLORS.enemyJoint;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawArm(ctx, e, l, x, y, swing, steel, steelDark, steelLit, weapon) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing);
    ctx.strokeStyle = steel;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 24);
    ctx.stroke();
    if (weapon === 'blade') {
      // 剑形手臂
      ctx.fillStyle = steelLit;
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(-3, 52);
      ctx.lineTo(0, 56);
      ctx.lineTo(3, 52);
      ctx.closePath();
      ctx.fill();
      if (e.hitFlash <= 0) {
        ctx.shadowColor = '#9fe8ff';
        ctx.shadowBlur = 6;
      }
      ctx.fillStyle = COLORS.bladeEdge;
      ctx.fillRect(-0.8, 26, 1.6, 26);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = steelDark;
      ctx.beginPath();
      ctx.arc(0, 28, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.enemyJoint;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawCannon(ctx, e, l, x, y, swing, steel, steelDark, steelLit) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing * 0.6);
    ctx.fillStyle = steelDark;
    ctx.strokeStyle = steelLit;
    ctx.lineWidth = 2;
    rr(ctx, -5, -6, 26, 14, 5);
    ctx.fill();
    ctx.stroke();
    // 炮口
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath();
    ctx.arc(24, 1, 5, 0, Math.PI * 2);
    ctx.fill();
    if (e.state === 'windup' && e.hitFlash <= 0) {
      const g = Math.sin(e.game.time * 50) * 0.4 + 0.6;
      ctx.fillStyle = COLORS.cannonGlow;
      ctx.globalAlpha = g;
      ctx.beginPath();
      ctx.arc(24, 1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawProjectile(ctx, view, pr) {
    const sx = view.toX(pr.x), sy = view.toY(pr.y);
    ctx.save();
    ctx.shadowColor = COLORS.cannonGlow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.cannonGlow;
    ctx.beginPath();
    ctx.arc(sx, sy, pr.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy, pr.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSpawn(ctx, view, e, time) {
    if (e.state !== 'spawn') return;
    const sx = view.toX(e.x), sy = view.toY(0);
    const t = 1 - e.stateTimer / 0.45;
    const r = 20 + t * 16;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = COLORS.enemyEye;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(sx, sy - 4, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 上升光柱
    ctx.globalAlpha = t * 0.5;
    ctx.fillStyle = COLORS.enemyEye;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 4, r * 0.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawClone(ctx, view, c, time) {
    const sx = view.toX(c.x);
    const sy = view.toY(c.y);
    const a = clamp(c.life / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.75;
    ctx.translate(sx, sy);
    ctx.scale(c.dir, 1);
    // 深色剪影 + 围巾 + 刀光
    ctx.fillStyle = '#1a2240';
    ctx.strokeStyle = '#3a4a78';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, -30);
    ctx.lineTo(-3, -8);
    ctx.lineTo(-5, 0);
    ctx.moveTo(3, -30);
    ctx.lineTo(3, -8);
    ctx.lineTo(5, 0);
    ctx.stroke();
    rr(ctx, -9, -56, 18, 30, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, -62, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a8cff';
    ctx.beginPath();
    ctx.moveTo(-2, -66);
    ctx.quadraticCurveTo(-16, -56, -20, -42);
    ctx.quadraticCurveTo(-12, -48, -4, -56);
    ctx.closePath();
    ctx.fill();
    // 刀
    ctx.strokeStyle = '#bfd0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, -50);
    ctx.lineTo(38, -52);
    ctx.stroke();
    ctx.restore();
  }

  drawStrikeMarker(ctx, view, s, time) {
    if (s.done) return;
    const sx = view.toX(s.x);
    const sy = view.toY(s.y);
    const t = clamp(s.t / Math.max(s.delay, 0.001), 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 40);
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(sx, sy, 40 - t * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 预警柱
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 40);
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(sx - 8, view.toY(s.y - 560), 16, 560);
    ctx.restore();
  }

  // HUD（屏幕空间）
  drawHUD(ctx, view, g) {
    const W = view.w;
    const p = g.player;
    ctx.save();
    ctx.textBaseline = 'top';

    // 血条
    const bx = 22, by = 20, bw = 240, bh = 18;
    ctx.fillStyle = 'rgba(10,12,24,0.7)';
    rr(ctx, bx - 4, by - 4, bw + 8, bh + 8, 8);
    ctx.fill();
    ctx.fillStyle = '#2a2238';
    rr(ctx, bx, by, bw, bh, 5);
    ctx.fill();
    const hpRatio = clamp(p.hp / CFG.playerMaxHp, 0, 1);
    const hpCol = hpRatio > 0.5 ? '#7dff9b' : (hpRatio > 0.25 ? '#ffd24a' : '#ff4d5e');
    if (hpRatio > 0) {
      ctx.fillStyle = hpCol;
      rr(ctx, bx, by, bw * hpRatio, bh, 5);
      ctx.fill();
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      rr(ctx, bx, by, bw * hpRatio, bh * 0.4, 4);
      ctx.fill();
    }
    ctx.fillStyle = '#eaf0ff';
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('生命', bx, by + bh + 6);
    // 生命数值
    ctx.textAlign = 'right';
    ctx.fillText(Math.ceil(p.hp) + '/' + CFG.playerMaxHp, bx + bw, by + bh + 6);

    // 连击 / 统计
    ctx.textAlign = 'left';
    ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#9fb4ff';
    ctx.fillText('连击 ' + g.combo, bx, by + bh + 30);
    if (g.combo >= 3) {
      ctx.font = '700 24px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,210,74,' + clamp(g.combo / 12, 0.3, 1) + ')';
      ctx.fillText('· ' + g.combo + ' HITS', bx, by + bh + 52);
    }

    // 右上：断肢数
    ctx.textAlign = 'right';
    ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ff9f6a';
    ctx.fillText('断肢 × ' + g.limbBreakCount, W - 24, 22);
    ctx.fillStyle = 'rgba(234,240,255,0.55)';
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('敌 ' + g.enemies.length + ' · 命中 ' + g.hitCount, W - 24, 42);

    ctx.restore();
  }

  drawControlsHint(ctx, view, g) {
    const W = view.w, H = view.h;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '12.5px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(220,228,255,0.5)';
    ctx.fillText(
      'A/D 移动 · Space 跳跃 · J 轻斩 · K 重斩/坠斩 · L 闪避 · I 挑空 · U 一闪 · O 分身 · P 落雷 · Q 时滞 · R 重开',
      W / 2, H - 12
    );
    ctx.restore();
  }

  // 技能栏（4 个技能：按键 + 名称 + 冷却遮罩）
  drawSkills(ctx, view, g) {
    const p = g.player;
    const W = view.w, H = view.h;
    const slotW = 96, slotH = 40, gap = 8;
    const totalW = SKILLS.length * slotW + (SKILLS.length - 1) * gap;
    let x = (W - totalW) / 2;
    const y = H - 66;
    ctx.save();
    ctx.textBaseline = 'middle';
    for (const s of SKILLS) {
      const cd = p.skillCd[s.key] || 0;
      const ready = cd <= 0;
      ctx.fillStyle = 'rgba(10,12,26,0.68)';
      rr(ctx, x, y, slotW, slotH, 8);
      ctx.fill();
      ctx.strokeStyle = ready ? 'rgba(120,200,255,0.85)' : 'rgba(120,130,170,0.4)';
      ctx.lineWidth = 1.5;
      rr(ctx, x, y, slotW, slotH, 8);
      ctx.stroke();

      // 冷却遮罩
      if (!ready && s.cooldown > 0) {
        const frac = clamp(cd / s.cooldown, 0, 1);
        ctx.fillStyle = 'rgba(5,7,14,0.62)';
        rr(ctx, x, y + slotH * (1 - frac), slotW, slotH * frac, 8);
        ctx.fill();
      }

      ctx.fillStyle = ready ? '#bfe0ff' : '#7d87a6';
      ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.key.slice(-1), x + 7, y + slotH / 2);
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(s.name, x + 23, y + slotH / 2);
      if (!ready) {
        ctx.textAlign = 'right';
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(220,230,255,0.8)';
        ctx.fillText(cd.toFixed(1), x + slotW - 6, y + slotH / 2);
      }
      x += slotW + gap;
    }
    ctx.restore();
  }
}
