/* ============================================================
 * 06-enemies.js — 傀儡军团：分段肢体 / 可破坏部位 / 三种行为
 *   斩傀 Swordsman：中速近身斩击
 *   碎城傀 Brute：高血霸体重锤，震地
 *   旋刃傀 Leaper：游走蓄力扑击
 * 肢体（头/双臂/双腿）可被打断，打断后实影响其战斗能力。
 * ============================================================ */
'use strict';

/* ---------- 部位碎片绘制（飞散用） ---------- */
function drawPuppetPart(ctx, partName, typeCfg) {
  const wood = typeCfg.wood, woodD = typeCfg.woodDark, joint = '#4a4038';
  ctx.lineCap = 'round';
  switch (partName) {
    case 'head': {
      ctx.fillStyle = wood;
      ctx.fillRect(-7, -8, 14, 15);
      ctx.strokeStyle = woodD; ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -8, 14, 15);
      // 熄灭的眼
      ctx.fillStyle = '#3a2a20';
      ctx.fillRect(-5, -3, 10, 3);
      break;
    }
    case 'torso': {
      ctx.fillStyle = wood;
      ctx.fillRect(-11, -16, 22, 30);
      ctx.strokeStyle = woodD; ctx.lineWidth = 1.5;
      ctx.strokeRect(-11, -16, 22, 30);
      ctx.beginPath(); ctx.moveTo(-11, -6); ctx.lineTo(11, -6); ctx.stroke();
      break;
    }
    case 'armL': case 'armR': {
      ctx.strokeStyle = wood; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      ctx.fillStyle = joint;
      ctx.beginPath(); ctx.arc(0, -8, 3.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 8, 3, 0, TAU); ctx.fill();
      break;
    }
    case 'legL': case 'legR': {
      ctx.strokeStyle = woodD; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke();
      ctx.fillStyle = joint;
      ctx.beginPath(); ctx.arc(0, -9, 3.6, 0, TAU); ctx.fill();
      break;
    }
    case 'weapon': {
      if (typeCfg.weapon === 'sword') {
        ctx.strokeStyle = '#3a2c20'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = '#b8c8d8';
        ctx.fillRect(-2, -30, 4, 30);
      } else if (typeCfg.weapon === 'hammer') {
        ctx.strokeStyle = '#4a3826'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -20); ctx.stroke();
        ctx.fillStyle = '#5a5248';
        ctx.fillRect(-9, -32, 18, 14);
        ctx.strokeStyle = '#3a352e'; ctx.lineWidth = 1.5;
        ctx.strokeRect(-9, -32, 18, 14);
      } else { // blade arms
        ctx.fillStyle = '#b8c8d8';
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.lineTo(4, -22); ctx.lineTo(-2, -20);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
  }
}

/* ---------- 类型配置 ---------- */
const ENEMY_TYPES = {
  swordsman: {
    name: '斩傀', hp: 56, speed: 135, scale: 1.0, mass: 1,
    wood: '#8a6b42', woodDark: '#6b5233', eye: '255,120,40',
    weapon: 'sword',
    dmg: 10, range: 78, windup: 0.5, active: 0.12, recover: 0.55,
    cdMin: 1.0, cdMax: 1.7, lunge: 360, armor: false,
    breakHp: { head: 22, armL: 26, armR: 26, legL: 32, legR: 32 },
    score: 100,
  },
  brute: {
    name: '碎城傀', hp: 185, speed: 58, scale: 1.5, mass: 2.0,
    wood: '#6e5a48', woodDark: '#54443a', eye: '255,60,40',
    weapon: 'hammer',
    dmg: 22, range: 118, windup: 0.85, active: 0.14, recover: 0.8,
    cdMin: 1.9, cdMax: 2.7, lunge: 120, armor: true,
    breakHp: { head: 40, armL: 55, armR: 55, legL: 60, legR: 60 },
    score: 350,
  },
  leaper: {
    name: '旋刃傀', hp: 44, speed: 165, scale: 0.88, mass: 0.8,
    wood: '#7d6a52', woodDark: '#5d4e3c', eye: '255,190,60',
    weapon: 'blade',
    dmg: 12, range: 300, windup: 0.55, active: 0.0, recover: 0.62,
    cdMin: 1.4, cdMax: 2.1, lunge: 0, armor: false,
    breakHp: { head: 18, armL: 20, armR: 20, legL: 26, legR: 26 },
    score: 150,
  },
};

let enemyUid = 1;

class Puppet {
  constructor(game, x, typeName) {
    this.uid = enemyUid++;
    this.game = game;
    this.type = typeName;
    this.cfg = ENEMY_TYPES[typeName];
    this.x = x; this.y = -80; // 从空中落入
    this.vx = 0; this.vy = 640;
    this.facing = x < ARENA_W / 2 ? 1 : -1;
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.scale = this.cfg.scale;
    this.w = 34 * this.scale;
    this.h = 62 * this.scale;
    this.state = 'drop';
    this.stateT = 0;
    this.flash = 0;         // 受击白闪
    this.eyeGlow = 0;
    this.walkPhase = rand(0, 6);
    this.attackCd = rand(0.3, 0.9);
    this.dead = false;
    this.removeMe = false;
    this.bodyTilt = 0;
    this.spin = 0;
    this.grounded = false;
    this.bounces = 0;
    this.lastHitSwing = -1;
    this.strikeUid = 0;
    this.struckUid = -1;
    this.leapVx = 0; this.leapVy = 0;
    this.pose = basePose();
    this.headlessAim = 1;
    this.stunArmorHit = 0;

    // 肢体
    this.parts = {};
    for (const p of ['head', 'armL', 'armR', 'legL', 'legR']) {
      this.parts[p] = { attached: true, hp: this.cfg.breakHp[p], maxHp: this.cfg.breakHp[p] };
    }
    this.recomputeStats();
  }

  recomputeStats() {
    const legs = (this.parts.legL.attached ? 1 : 0) + (this.parts.legR.attached ? 1 : 0);
    const arms = (this.parts.armL.attached ? 1 : 0) + (this.parts.armR.attached ? 1 : 0);
    this.legFactor = [0.32, 0.68, 1][legs];
    this.armCount = arms;
    this.hasWeaponArm = this.parts.armR.attached;
    this.headless = !this.parts.head.attached;
    // 攻击力
    if (this.type === 'brute') {
      this.curDmg = arms === 2 ? this.cfg.dmg : (arms === 1 ? 13 : 10);
    } else if (this.type === 'swordsman') {
      this.curDmg = this.hasWeaponArm ? this.cfg.dmg : (this.armCount === 1 ? 5 : 3);
    } else {
      this.curDmg = this.armCount > 0 ? this.cfg.dmg : 6;
    }
  }

  hurtBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  // 距离命中点最近的尚存肢体
  nearestPart(px, py) {
    const joints = this.partPositions();
    let best = null, bd = 1e9;
    for (const name in this.parts) {
      const p = this.parts[name];
      if (!p.attached) continue;
      const j = joints[name];
      const d = (j.x - px) * (j.x - px) + (j.y - py) * (j.y - py);
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }

  partPositions() {
    // 近似关节世界坐标（用于肢体选取与碎片生成）
    const s = this.scale, f = this.facing;
    return {
      head: { x: this.x, y: this.y - this.h + 8 * s },
      armL: { x: this.x - f * 8 * s, y: this.y - this.h * 0.62 },
      armR: { x: this.x + f * 12 * s, y: this.y - this.h * 0.6 },
      legL: { x: this.x - 6 * s, y: this.y - this.h * 0.22 },
      legR: { x: this.x + 6 * s, y: this.y - this.h * 0.22 },
    };
  }

  detachLimb(name, hitDirX, game) {
    const part = this.parts[name];
    if (!part || !part.attached) return;
    part.attached = false;
    const j = this.partPositions()[name];
    const mk = (partName, dx, dy, extra = {}) => {
      fx.addDebris({
        x: j.x + dx, y: j.y + dy,
        vx: hitDirX * rand(180, 420) + rand(-90, 90),
        vy: rand(-520, -240),
        rot: rand(0, TAU), vr: rand(-16, 16),
        radius: 14 * this.scale, life: rand(2.2, 3.2),
        draw: (c) => {
          c.scale(this.scale, this.scale);
          drawPuppetPart(c, partName, this.cfg);
        },
        ...extra,
      });
    };
    mk(name, 0, 0);
    // 武器手断掉时武器一起飞
    if (name === 'armR') {
      fx.addDebris({
        x: j.x + this.facing * 10, y: j.y - 6,
        vx: hitDirX * rand(220, 460), vy: rand(-560, -300),
        rot: rand(0, TAU), vr: rand(-20, 20),
        radius: 12, life: rand(2, 3),
        draw: (c) => { c.scale(this.scale, this.scale); drawPuppetPart(c, 'weapon', this.cfg); },
      });
    }
    game.limbBreaks++;
    synth.breakLimb();
    fx.splinters(j.x, j.y, 10, hitDirX);
    fx.oilSplash(j.x, j.y, 7, hitDirX);
    fx.spark(j.x, j.y, hitDirX, 6, 300, '255,200,90', 1.4);
    fx.text(j.x, j.y - 20, '断肢!', '#ffb347', 17, true);
    fx.addHitstop(0.06);
    fx.shake(4, 0.2, hitDirX, 0);
    this.recomputeStats();
    // 断腿额外踉跄
    if (name.startsWith('leg')) {
      this.vx += hitDirX * 160;
      if (this.state !== 'launched') { this.state = 'stagger'; this.stateT = 0; }
    }
  }

  hurt(hit, game) {
    if (this.dead || this.state === 'drop') return 'none';
    const def = hit.def;
    // 霸体判定：轻攻击打霸体只掉血不硬直
    const armored = this.cfg.armor && def.stop < 2 && this.state !== 'launched';

    this.hp -= def.dmg;
    this.flash = 0.09;
    this.eyeGlow = 1;

    // 肢体破坏
    const partName = this.nearestPart(hit.cx, hit.cy);
    if (partName) {
      const part = this.parts[partName];
      part.hp -= def.breakDmg;
      if (part.hp <= 0) this.detachLimb(partName, hit.dir, game);
    }

    // 打击反馈
    const col = armored ? '180,200,220' : '255,220,120';
    fx.spark(hit.cx, hit.cy, hit.dir, def.stop >= 2 ? 14 : 7, def.stop >= 2 ? 460 : 300, col, 1.1);
    fx.oilSplash(hit.cx, hit.cy, def.stop >= 2 ? 5 : 2, hit.dir);
    fx.addHitstop(HITSTOP_LV[def.stop]);
    fx.shake(def.shake, 0.12 + def.stop * 0.05, hit.dir * 0.7, -0.2);
    fx.text(hit.cx, hit.cy - 16, String(def.dmg), def.stop >= 2 ? '#ffe27a' : '#ffffff', def.stop >= 2 ? 22 : 15, def.stop >= 2);
    if (armored) synth.clangArmor(); else synth.hit(def.stop);

    // 击退 / 击飞
    const massK = 1 / this.cfg.mass;
    this.vx += hit.dir * def.kbX * massK * (armored ? 0.22 : 1);
    if (def.kbY < 0) {
      this.vy = def.kbY * (armored ? 0.35 : 1) * Math.min(1, massK * 1.4);
      if (this.vy < -260) {
        this.state = 'launched';
        this.stateT = 0;
        this.bounces = 0;
        this.spin = hit.dir * rand(2, 5);
      }
    }

    if (this.hp <= 0) {
      this.die(hit, game);
      return 'kill';
    }

    if (!armored && this.state !== 'launched') {
      this.state = 'stagger';
      this.stateT = 0;
    }
    return 'hit';
  }

  die(hit, game) {
    this.dead = true;
    this.removeMe = true;
    game.onEnemyKilled(this, hit);
    // 全身爆裂：所有剩余部位飞散
    const dirX = hit ? hit.dir : (this.facing * -1);
    const joints = this.partPositions();
    for (const name in this.parts) {
      if (!this.parts[name].attached) continue;
      const j = joints[name];
      fx.addDebris({
        x: j.x, y: j.y,
        vx: dirX * rand(120, 480) + rand(-140, 140),
        vy: rand(-640, -260),
        rot: rand(0, TAU), vr: rand(-18, 18),
        radius: 14 * this.scale, life: rand(2.2, 3.4),
        draw: (c) => { c.scale(this.scale, this.scale); drawPuppetPart(c, name, this.cfg); },
      });
    }
    // 躯干 + 核心
    fx.addDebris({
      x: this.x, y: this.y - this.h * 0.5,
      vx: dirX * rand(100, 300), vy: rand(-520, -300),
      rot: rand(0, TAU), vr: rand(-12, 12),
      radius: 18 * this.scale, life: rand(2.5, 3.5),
      draw: (c) => { c.scale(this.scale, this.scale); drawPuppetPart(c, 'torso', this.cfg); },
    });
    synth.coreShatter();
    fx.splinters(this.x, this.y - this.h * 0.5, 18, dirX);
    fx.oilSplash(this.x, this.y - this.h * 0.4, 14, dirX);
    fx.spark(this.x, this.y - this.h * 0.5, dirX, 18, 520, '255,170,80', 1.6);
    fx.embers(this.x, this.y - this.h * 0.5, 12, '255,140,50');
    fx.ring(this.x, this.y - this.h * 0.5, 8, 90 * this.scale, 0.4, 'rgba(255,160,70,0.8)', 6);
    fx.addHitstop(CFG.hitstop.kill);
    fx.shake(7, 0.32, dirX * 0.6, -0.4);
    fx.flash(0.1);
    fx.text(this.x, this.y - this.h - 12, `+${this.cfg.score}`, '#ffd766', 20, true);
  }

  /* ============ 状态机 ============ */
  update(dt, game) {
    if (this.dead) return;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.eyeGlow = Math.max(0, this.eyeGlow - dt * 1.4);
    this.attackCd = Math.max(0, this.attackCd - dt);
    const player = game.player;
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    const dirToPlayer = sign(dx) || 1;

    switch (this.state) {
      case 'drop': {
        this.vy += GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y >= GROUND_Y) {
          this.y = GROUND_Y; this.vy = 0; this.grounded = true;
          fx.dust(this.x, this.y, 10, 130);
          fx.ring(this.x, this.y, 6, 40 * this.scale, 0.3, 'rgba(200,180,150,0.5)', 3);
          synth.land(true);
          this.state = 'chase'; this.stateT = 0;
        }
        return;
      }

      case 'chase': {
        this.walkPhase += dt * 7 * this.legFactor;
        // 面向玩家（无头时可能走错方向——迷茫感）
        if (this.headless && Math.random() < dt * 1.5) this.headlessAim = pick([-1, 1]);
        const aim = this.headless ? this.headlessAim : dirToPlayer;
        this.facing = aim;
        const speed = this.cfg.speed * this.legFactor;

        if (this.type === 'leaper') {
          // 保持中距游走，冷却好了就扑
          const wantRange = 200;
          if (adx > wantRange + 40) this.vx = aim * speed;
          else if (adx < wantRange - 60) this.vx = -aim * speed * 0.8;
          else this.vx = damp(this.vx, Math.sin(this.walkPhase * 0.7) * 40, 4, dt);
          if (this.attackCd <= 0 && adx < this.cfg.range && adx > 60) {
            this.state = 'windup'; this.stateT = 0;
            synth.enemyWindup();
          }
        } else {
          if (adx > this.cfg.range * 0.82) {
            this.vx = aim * speed;
          } else {
            this.vx = damp(this.vx, 0, 10, dt);
            if (this.attackCd <= 0 && adx < this.cfg.range && Math.abs(player.y - this.y) < 90) {
              this.state = 'windup'; this.stateT = 0;
              synth.enemyWindup();
            }
          }
        }
        break;
      }

      case 'windup': {
        this.vx = damp(this.vx, 0, 12, dt);
        this.eyeGlow = Math.min(1, this.eyeGlow + dt * 4);
        const wu = this.cfg.windup * (this.headless ? 1.25 : 1);
        if (this.stateT >= wu) {
          if (this.type === 'leaper') {
            // 扑击：弧线跃向玩家
            this.state = 'leap'; this.stateT = 0;
            this.strikeUid++;
            const dxp = clamp(dx, -360, 360);
            this.leapVx = dxp * 1.9;
            this.leapVy = -620;
            this.vy = this.leapVy;
            this.grounded = false;
            synth.swing(1);
          } else {
            this.state = 'attack'; this.stateT = 0;
            this.strikeUid++;
            this.attackDidHit = false;
            this.vx = this.facing * this.cfg.lunge * this.legFactor;
            synth.swing(this.type === 'brute' ? 2 : 1);
          }
        }
        break;
      }

      case 'attack': {
        const t = this.stateT;
        if (this.type === 'brute') {
          // 重锤砸地：active 瞬间判定 + 震地
          if (!this.attackDidHit && t >= this.cfg.active * 0.4) {
            this.attackDidHit = true;
            const hx = this.x + this.facing * 70 * this.scale;
            fx.dust(hx, GROUND_Y, 12, 160);
            fx.ring(hx, GROUND_Y, 10, 110, 0.4, 'rgba(255,150,80,0.7)', 6);
            fx.shake(5, 0.25, this.facing * 0.4, 0.5);
            synth.slam();
            game.enemyStrike(this, {
              x: this.facing > 0 ? this.x : this.x - 150 * this.scale,
              y: GROUND_Y - 90, w: 150 * this.scale, h: 90,
              dmg: this.curDmg, kbX: 380, kbY: 300,
            });
          }
        } else {
          // 斩击判定（横扫矩形）
          if (!this.attackDidHit && t >= 0.02 && t <= this.cfg.active + 0.04) {
            const reach = 64 * this.scale;
            const hit = game.enemyStrike(this, {
              x: this.facing > 0 ? this.x : this.x - reach,
              y: this.y - this.h * 0.9, w: reach, h: this.h * 0.8,
              dmg: this.curDmg, kbX: 300, kbY: 220,
            });
            if (hit) this.attackDidHit = true;
          }
        }
        if (t >= this.cfg.active + 0.05) {
          this.state = 'recover'; this.stateT = 0;
          this.attackCd = rand(this.cfg.cdMin, this.cfg.cdMax) * (this.headless ? 1.3 : 1);
        }
        break;
      }

      case 'leap': {
        // 旋刃飞行中：全身判定
        this.spin += dt * 26;
        if (this.stateT > 0.06) {
          game.enemyStrike(this, {
            x: this.x - 26 * this.scale, y: this.y - this.h - 8,
            w: 52 * this.scale, h: this.h + 8,
            dmg: this.curDmg, kbX: 260, kbY: 260,
          });
        }
        this.vy += GRAVITY * 0.9 * dt;
        this.vx = this.leapVx;
        break;
      }

      case 'recover': {
        this.vx = damp(this.vx, 0, 8, dt);
        if (this.stateT >= this.cfg.recover) { this.state = 'chase'; this.stateT = 0; }
        break;
      }

      case 'stagger': {
        this.vx = damp(this.vx, 0, 6, dt);
        if (this.stateT >= 0.26) { this.state = 'chase'; this.stateT = 0; }
        break;
      }

      case 'launched': {
        this.bodyTilt += this.spin * dt;
        this.vy += GRAVITY * 0.55 * dt; // 滞空感
        break;
      }
    }

    // 物理：重力对所有悬空状态生效（小挑空也要落回地面）
    const prevVy = this.vy;
    const airborne = this.y < GROUND_Y - 0.5;
    if (this.state === 'launched') {
      // launched 的重力已在状态分支施加（浮空感）
    } else if (this.state === 'leap') {
      // leap 的重力已在状态分支施加
    } else if (airborne) {
      this.vy += GRAVITY * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 40) { this.x = 40; this.vx = Math.abs(this.vx) * 0.4; }
    if (this.x > ARENA_W - 40) { this.x = ARENA_W - 40; this.vx = -Math.abs(this.vx) * 0.4; }

    if (this.state === 'launched' || this.state === 'leap') {
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        if (this.state === 'leap') {
          // 落地硬直（破绽）
          this.state = 'recover'; this.stateT = 0;
          this.attackCd = rand(this.cfg.cdMin, this.cfg.cdMax);
          this.vx = 0; this.vy = 0;
          fx.dust(this.x, this.y, 8, 110);
          synth.land(true);
        } else if (this.bounces < 1 && Math.abs(prevVy) > 300) {
          this.bounces++;
          this.vy = -prevVy * 0.32;
          this.vx *= 0.6;
          fx.dust(this.x, this.y, 6, 100);
          synth.land(false);
        } else {
          this.vy = 0; this.vx *= 0.3;
          this.state = 'stagger'; this.stateT = -0.2; // 倒地片刻
          this.bodyTilt = 0;
        }
      }
    } else if (this.y >= GROUND_Y) {
      // 普通状态落地
      if (airborne && prevVy > 500) {
        fx.dust(this.x, GROUND_Y, 4, 80);
      }
      this.y = GROUND_Y;
      if (this.vy > 0) this.vy = 0;
    }

    this.grounded = this.y >= GROUND_Y - 0.5;
    if (this.grounded) this.bodyTilt = damp(this.bodyTilt, 0, 10, dt);

    // 敌人间排斥（防堆叠）
    for (const o of game.enemies) {
      if (o === this || o.dead) continue;
      const d = this.x - o.x;
      const ad = Math.abs(d);
      const minD = (this.w + o.w) * 0.5;
      if (ad < minD && ad > 0.01) {
        const push = (minD - ad) * 3 * dt;
        this.x += sign(d) * push;
      }
    }
  }

  /* ============ 姿态 ============ */
  currentPose(out) {
    out = out || this.pose;
    const st = this.state;
    const cfg = this.cfg;
    const big = this.type === 'brute';

    if (st === 'chase' || st === 'drop') {
      runPose(this.walkPhase * (big ? 0.6 : 1), out);
      out.lean = big ? 0.3 : 0.14;
      // 持武器手前伸
      out.armFA1 = big ? 0.5 : 0.3;
      out.armFA2 = big ? 0.4 : 0.2;
      out.weaponA = big ? 0.5 : 0.9;
      if (this.legFactor < 1) { // 断腿跛行：不对称 + 下沉
        out.hipY += (1 - this.legFactor) * 7;
        out.legBA1 *= this.legFactor;
        out.legBA2 *= this.legFactor;
      }
      return out;
    }
    if (st === 'windup') {
      const wu = cfg.windup * (this.headless ? 1.25 : 1);
      const k = easeInCubic(clamp(this.stateT / wu, 0, 1));
      runPose(0, out);
      if (this.type === 'leaper') {
        // 下蹲蓄力
        out.hipY = lerp(0, 12, k);
        out.legFA1 = lerp(0.1, 0.9, k); out.legFA2 = lerp(0.2, 1.7, k);
        out.legBA1 = lerp(-0.1, -0.7, k); out.legBA2 = lerp(0.3, 1.3, k);
        out.lean = lerp(0.1, 0.42, k);
        out.armFA1 = lerp(0.3, 1.2, k); out.armFA2 = lerp(0.2, 1.1, k);
      } else {
        // 武器高举（清晰前兆）
        out.armFA1 = lerp(0.3, big ? -2.6 : -2.3, k);
        out.armFA2 = lerp(0.2, big ? -2.7 : -2.4, k);
        out.weaponA = lerp(0.9, big ? -2.8 : -2.5, k);
        out.lean = lerp(0.14, -0.2, k);
        out.hipY = lerp(0, 4, k);
        out.headTilt = -0.12 * k;
      }
      return out;
    }
    if (st === 'attack') {
      const k = easeOutCubic(clamp(this.stateT / Math.max(0.05, cfg.active + 0.03), 0, 1));
      runPose(0, out);
      out.armFA1 = lerp(big ? -2.6 : -2.3, big ? 1.5 : 1.3, k);
      out.armFA2 = lerp(big ? -2.7 : -2.4, big ? 1.5 : 1.35, k);
      out.weaponA = lerp(big ? -2.8 : -2.5, big ? 1.6 : 1.3, k);
      out.lean = lerp(-0.2, big ? 0.5 : 0.38, k);
      out.hipY = big ? lerp(4, -3, k) : 0;
      return out;
    }
    if (st === 'leap') {
      airPose(this.vy, out);
      out.armFA1 = 1.1; out.armFA2 = 1.0;
      out.armBA1 = 1.1; out.armBA2 = 1.0;
      out.lean = 0.3;
      return out;
    }
    if (st === 'stagger') {
      idlePose(this.stateT, out);
      out.lean = -0.3;
      out.armFA1 = -0.9; out.armFA2 = -1.2;
      out.armBA1 = -0.7; out.armBA2 = -1.0;
      out.hipY = 3;
      return out;
    }
    if (st === 'launched') {
      airPose(this.vy, out);
      out.armFA1 = -1.2; out.armFA2 = -1.6;
      out.armBA1 = 1.3; out.armBA2 = 1.6;
      out.legFA1 = -0.9; out.legFA2 = -0.5;
      out.legBA1 = 0.8; out.legBA2 = 1.1;
      return out;
    }
    return idlePose(this.stateT, out);
  }

  /* ============ 绘制 ============ */
  draw(ctx, time) {
    if (this.dead) return;
    const cfg = this.cfg;
    const s = this.scale;
    const pose = this.currentPose(this.pose);
    const f = this.facing;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.bodyTilt * 0.4);
    ctx.scale(f * s, s);

    const hip = { x: 0, y: -30 + pose.hipY };
    const chest = { x: hip.x + Math.sin(pose.lean) * 20, y: hip.y - Math.cos(pose.lean) * 20 };
    const seg = (ox, oy, ang, len) => ({ x: ox + Math.sin(ang) * len, y: oy + Math.cos(ang) * len });

    const shoulderF = { x: chest.x + 3, y: chest.y + 2 };
    const shoulderB = { x: chest.x - 4, y: chest.y + 3 };
    const elbowF = seg(shoulderF.x, shoulderF.y, pose.armFA1, 12);
    const handF = seg(elbowF.x, elbowF.y, pose.armFA2, 11);
    const elbowB = seg(shoulderB.x, shoulderB.y, pose.armBA1, 12);
    const handB = seg(elbowB.x, elbowB.y, pose.armBA2, 11);
    const kneeF = seg(hip.x, hip.y, pose.legFA1, 13);
    const footF = seg(kneeF.x, kneeF.y, pose.legFA2, 12);
    const kneeB = seg(hip.x, hip.y, pose.legBA1, 13);
    const footB = seg(kneeB.x, kneeB.y, pose.legBA2, 12);
    const headC = { x: chest.x + Math.sin(pose.lean + pose.headTilt) * 12, y: chest.y - Math.cos(pose.lean + pose.headTilt) * 12 };

    const wood = cfg.wood, woodD = cfg.woodDark;
    const drawLimbSeg = (a, b, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    const jointDisc = (p, r) => {
      ctx.fillStyle = '#4a4038';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    };

    // 后腿
    if (this.parts.legL.attached) {
      drawLimbSeg(hip, kneeB, 6, woodD);
      drawLimbSeg(kneeB, footB, 5.5, woodD);
      jointDisc(kneeB, 3);
    }
    // 后臂
    if (this.parts.armL.attached) {
      drawLimbSeg(shoulderB, elbowB, 5, woodD);
      drawLimbSeg(elbowB, handB, 4.5, woodD);
      jointDisc(elbowB, 2.6);
      if (this.type === 'leaper') this.drawArmBlade(ctx, handB, pose.armBA2);
    }

    // 躯干（木偶箱 + 核心）
    ctx.fillStyle = wood;
    ctx.strokeStyle = woodD; ctx.lineWidth = 1.6;
    // 胸
    ctx.save();
    ctx.translate(chest.x, chest.y + 8);
    ctx.rotate(pose.lean * 0.5);
    ctx.fillRect(-11, -12, 22, 22);
    ctx.strokeRect(-11, -12, 22, 22);
    ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(11, -2); ctx.stroke();
    // 核心（发光）
    const coreGlow = this.state === 'windup' ? 1 : 0.55 + Math.sin(time * 3 + this.uid) * 0.15;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${cfg.eye},${coreGlow})`;
    ctx.beginPath(); ctx.arc(0, 0, 4.5 + coreGlow * 1.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
    // 胯
    ctx.fillStyle = woodD;
    ctx.fillRect(hip.x - 8, hip.y - 4, 16, 9);

    // 头
    if (this.parts.head.attached) {
      ctx.save();
      ctx.translate(headC.x, headC.y - 4);
      ctx.rotate(pose.headTilt);
      ctx.fillStyle = wood;
      ctx.fillRect(-7, -9, 14, 15);
      ctx.strokeStyle = woodD; ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -9, 14, 15);
      // 发光眼缝
      const eg = Math.max(this.eyeGlow, this.state === 'windup' ? 0.4 + 0.6 * clamp(this.stateT / cfg.windup, 0, 1) : 0.25);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${cfg.eye},${clamp(eg, 0.15, 1)})`;
      ctx.fillRect(-5, -4, 10, 3);
      ctx.restore();
      ctx.restore();
    }

    // 前腿
    if (this.parts.legR.attached) {
      drawLimbSeg(hip, kneeF, 6.5, wood);
      drawLimbSeg(kneeF, footF, 6, wood);
      jointDisc(kneeF, 3.2);
    }

    // 前臂 + 武器
    if (this.parts.armR.attached) {
      drawLimbSeg(shoulderF, elbowF, 5.5, wood);
      drawLimbSeg(elbowF, handF, 5, wood);
      jointDisc(elbowF, 2.8);
      if (this.type === 'leaper') {
        this.drawArmBlade(ctx, handF, pose.armFA2);
      } else {
        // 武器沿 weaponA
        ctx.save();
        ctx.translate(handF.x, handF.y);
        ctx.rotate(0);
        const wa = pose.weaponA;
        if (cfg.weapon === 'sword') {
          const b0 = seg(0, 0, wa, 2), b1 = seg(0, 0, wa, 34);
          ctx.strokeStyle = '#3a2c20'; ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b0.x, b0.y); ctx.stroke();
          ctx.strokeStyle = '#c2d2e2'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
          // 前兆闪光
          if (this.state === 'windup' && this.stateT > cfg.windup - 0.14) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = 'rgba(255,240,200,0.9)';
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
            ctx.restore();
          }
        } else if (cfg.weapon === 'hammer') {
          const h0 = seg(0, 0, wa, 4), h1 = seg(0, 0, wa, 30);
          ctx.strokeStyle = '#4a3826'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(h0.x, h0.y); ctx.lineTo(h1.x, h1.y); ctx.stroke();
          ctx.save();
          ctx.translate(h1.x, h1.y);
          ctx.rotate(-wa * 0.4);
          ctx.fillStyle = '#5a5248';
          ctx.fillRect(-10, -8, 20, 16);
          ctx.strokeStyle = '#3a352e'; ctx.lineWidth = 1.5;
          ctx.strokeRect(-10, -8, 20, 16);
          if (this.state === 'windup' && this.stateT > cfg.windup - 0.16) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgba(255,220,160,0.5)';
            ctx.fillRect(-10, -8, 20, 16);
            ctx.restore();
          }
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // 受击白闪覆盖
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(this.flash / 0.09, 0, 1) * 0.75;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-this.w / 2 / s * 1.2, -this.h / s, this.w / s * 1.2, this.h / s);
      ctx.restore();
    }

    ctx.restore();

    // 旋刃飞行特效
    if (this.state === 'leap') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(200,230,255,0.55)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.h * 0.5, 30 * s, this.spin, this.spin + 4.2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.h * 0.5, 22 * s, -this.spin, -this.spin + 3.6);
      ctx.stroke();
      ctx.restore();
    }

    // 血条（受击后短暂显示）
    if (this.hp < this.maxHp && !this.dead) {
      const bw = 40 * s;
      const bx = this.x - bw / 2, by = this.y - this.h - 14;
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,14,0.7)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#7a2030';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = '#ff5a48';
      ctx.fillRect(bx, by, bw * clamp(this.hp / this.maxHp, 0, 1), 3);
      ctx.restore();
    }
  }

  drawArmBlade(ctx, hand, ang) {
    const tip = { x: hand.x + Math.sin(ang) * 26, y: hand.y + Math.cos(ang) * 26 };
    const perp = { x: Math.cos(ang), y: -Math.sin(ang) };
    ctx.fillStyle = '#b8c8d8';
    ctx.beginPath();
    ctx.moveTo(hand.x + perp.x * 3, hand.y + perp.y * 3);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(hand.x - perp.x * 3, hand.y - perp.y * 3);
    ctx.closePath(); ctx.fill();
  }
}
