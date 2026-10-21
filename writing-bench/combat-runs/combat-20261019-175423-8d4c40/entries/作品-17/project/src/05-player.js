/* ============================================================
 * 05-player.js — 玩家浪人：移动 / 三段连斩 / 蓄力重斩 /
 * 冲刺(无敌帧+取消) / 挑空 / 空中连段 / 空中下劈 / 受击
 * ============================================================ */
'use strict';

// stop: 0轻 1中 2重 3蓄力（对应 hitstop 时长）
const HITSTOP_LV = [CFG.hitstop.light, CFG.hitstop.medium, CFG.hitstop.heavy, CFG.hitstop.charged];

const ATTACKS = {
  atk1: {
    dur: 0.30, startup: 0.055, activeEnd: 0.13, cancel: 0.155, next: 'atk2',
    lungeV: 720, lungeFrom: 0.02, lungeTo: 0.11,
    reach: 80, hh: 58, dmg: 8, breakDmg: 9, kbX: 160, kbY: -70,
    stop: 0, shake: 2.4, swingSize: 0,
  },
  atk2: {
    dur: 0.32, startup: 0.06, activeEnd: 0.135, cancel: 0.17, next: 'atk3',
    lungeV: 780, lungeFrom: 0.02, lungeTo: 0.12,
    reach: 84, hh: 60, dmg: 9, breakDmg: 10, kbX: 200, kbY: -90,
    stop: 0, shake: 2.8, swingSize: 0,
  },
  atk3: {
    dur: 0.44, startup: 0.10, activeEnd: 0.185, cancel: 0.26, next: null,
    lungeV: 950, lungeFrom: 0.03, lungeTo: 0.15,
    reach: 96, hh: 68, dmg: 15, breakDmg: 22, kbX: 340, kbY: -300,
    stop: 1, shake: 4.6, swingSize: 1,
  },
  air1: {
    dur: 0.28, startup: 0.05, activeEnd: 0.115, cancel: 0.15, next: 'air2',
    reach: 82, hh: 76, dmg: 8, breakDmg: 8, kbX: 130, kbY: -80,
    stop: 0, shake: 2.2, swingSize: 0,
  },
  air2: {
    dur: 0.32, startup: 0.06, activeEnd: 0.135, cancel: 0.19, next: null,
    reach: 88, hh: 80, dmg: 11, breakDmg: 12, kbX: 160, kbY: -230,
    stop: 1, shake: 3.2, swingSize: 1,
  },
  heavy: { // 未蓄满
    dur: 0.46, startup: 0.09, activeEnd: 0.175, cancel: 0.30,
    lungeV: 1080, lungeFrom: 0.03, lungeTo: 0.15,
    reach: 112, hh: 74, dmg: 24, breakDmg: 34, kbX: 540, kbY: -330,
    stop: 2, shake: 6, swingSize: 2,
  },
  heavyC: { // 满蓄力
    dur: 0.54, startup: 0.11, activeEnd: 0.21, cancel: 0.34,
    lungeV: 1350, lungeFrom: 0.03, lungeTo: 0.17,
    reach: 138, hh: 88, dmg: 38, breakDmg: 90, kbX: 660, kbY: -470,
    stop: 3, shake: 9, swingSize: 2,
  },
  launcher: {
    dur: 0.38, startup: 0.07, activeEnd: 0.17, cancel: 0.22,
    reach: 78, hh: 104, dmg: 12, breakDmg: 14, kbX: 70, kbY: -800,
    stop: 1, shake: 3.6, swingSize: 1, rise: -660,
  },
  airRise: { // 空中 I：再度升腾
    dur: 0.34, startup: 0.05, activeEnd: 0.14, cancel: 0.18,
    reach: 86, hh: 110, dmg: 10, breakDmg: 12, kbX: 60, kbY: -560,
    stop: 1, shake: 3, swingSize: 1, rise: -560,
  },
  slamHit: { // 空中下劈落地 AoE
    reach: 128, hh: 80, dmg: 26, breakDmg: 30, kbX: 400, kbY: -400,
    stop: 2, shake: 7.5, swingSize: 2,
  },
};

/* ---------------- 攻击姿态关键帧 ---------------- */
const P = (t, p, ease) => ({ t, p, ease });
const POSES = {
  atk1: [
    P(0, { lean: 0.05, armFA1: -0.4, armFA2: -0.7, weaponA: 0.9, hipY: 1 }),
    P(0.05, { lean: -0.16, armFA1: -2.1, armFA2: -2.6, armBA1: 0.5, weaponA: -2.3, hipY: 3, headTilt: -0.06 }, easeInCubic),
    P(0.115, { lean: 0.36, armFA1: 1.55, armFA2: 1.5, armBA1: -0.5, weaponA: 1.35, hipY: -3, headTilt: 0.08, legFA1: 0.5, legBA1: -0.5 }, easeOutCubic),
    P(0.30, { lean: 0.06, armFA1: -0.1, armFA2: -0.3, weaponA: 1.1, hipY: 0 }),
  ],
  atk2: [
    P(0, { lean: 0.2, armFA1: 1.6, armFA2: 1.6, weaponA: 1.9, hipY: 2 }),
    P(0.055, { lean: 0.3, armFA1: 2.1, armFA2: 2.2, weaponA: 2.5, hipY: 4, headTilt: 0.1 }, easeInCubic),
    P(0.125, { lean: -0.12, armFA1: -1.5, armFA2: -1.6, weaponA: -1.7, hipY: -4, headTilt: -0.1, legFA1: -0.4, legBA1: 0.4 }, easeOutCubic),
    P(0.32, { lean: 0.05, armFA1: -0.2, armFA2: -0.4, weaponA: 1.0, hipY: 0 }),
  ],
  atk3: [
    P(0, { lean: 0.1, armFA1: -0.5, armFA2: -0.8, weaponA: 0.6, hipY: 2 }),
    P(0.09, { lean: -0.24, armFA1: -2.8, armFA2: -2.9, weaponA: -3.0, hipY: 6, headTilt: -0.14, legFA1: 0.5, legFA2: 1.0, legBA1: -0.5, legBA2: 0.7 }, easeInCubic),
    P(0.175, { lean: 0.44, armFA1: 1.15, armFA2: 1.1, weaponA: 1.2, hipY: -5, headTilt: 0.12, legFA1: -0.4, legBA1: 0.55 }, easeOutCubic),
    P(0.44, { lean: 0.08, armFA1: 0.1, armFA2: -0.2, weaponA: 1.15, hipY: 0 }),
  ],
  air1: [
    P(0, { lean: 0.1, armFA1: -0.8, armFA2: -1.2, weaponA: -1.4, legFA1: -0.4, legFA2: -0.9, legBA1: 0.4, legBA2: 0.6 }),
    P(0.045, { lean: -0.1, armFA1: -2.0, armFA2: -2.3, weaponA: -2.4 }, easeInCubic),
    P(0.105, { lean: 0.3, armFA1: 1.4, armFA2: 1.4, weaponA: 1.3 }, easeOutCubic),
    P(0.28, { lean: 0.12, armFA1: -0.3, armFA2: -0.6, weaponA: 0.9 }),
  ],
  air2: [
    P(0, { lean: 0.2, armFA1: 1.2, armFA2: 1.3, weaponA: 1.8 }),
    P(0.05, { lean: 0.34, armFA1: 2.0, armFA2: 2.1, weaponA: 2.4 }, easeInCubic),
    P(0.125, { lean: -0.18, armFA1: -1.7, armFA2: -1.8, weaponA: -1.9 }, easeOutCubic),
    P(0.32, { lean: 0.1, armFA1: -0.3, armFA2: -0.6, weaponA: 0.9 }),
  ],
  heavy: [
    P(0, { lean: -0.2, armFA1: -1.9, armFA2: -2.2, weaponA: -2.1, hipY: 4 }),
    P(0.08, { lean: -0.3, armFA1: -2.5, armFA2: -2.8, weaponA: -2.7, hipY: 6, headTilt: -0.1 }, easeInCubic),
    P(0.165, { lean: 0.46, armFA1: 1.6, armFA2: 1.55, weaponA: 1.4, hipY: -5, headTilt: 0.12, legFA1: 0.55, legBA1: -0.55 }, easeOutCubic),
    P(0.46, { lean: 0.12, armFA1: 0.2, armFA2: 0.0, weaponA: 1.2, hipY: 0 }),
  ],
  launcher: [
    P(0, { lean: 0.25, armFA1: 1.4, armFA2: 1.5, weaponA: 1.9, hipY: 8, legFA1: 0.8, legFA2: 1.5, legBA1: -0.6, legBA2: 1.1 }),
    P(0.06, { lean: 0.32, armFA1: 1.9, armFA2: 2.0, weaponA: 2.3, hipY: 10 }, easeInCubic),
    P(0.15, { lean: -0.22, armFA1: -2.4, armFA2: -2.5, weaponA: -2.6, hipY: -6, legFA1: -0.5, legFA2: -0.9, legBA1: 0.3, legBA2: 0.5 }, easeOutCubic),
    P(0.38, { lean: 0.02, armFA1: -1.2, armFA2: -1.4, weaponA: -1.2, hipY: 0 }),
  ],
  charge: [
    P(0, { lean: -0.24, armFA1: -1.8, armFA2: -2.1, weaponA: -2.0, hipY: 5, headTilt: -0.08, legFA1: 0.45, legFA2: 0.8, legBA1: -0.5, legBA2: 0.6 }),
  ],
  slam: [
    P(0, { lean: 0.55, armFA1: 1.35, armFA2: 1.4, armBA1: 0.8, weaponA: 1.62, hipY: 0, legFA1: -0.5, legFA2: -0.8, legBA1: 0.5, legBA2: 0.9, headTilt: 0.2 }),
  ],
  dash: [
    P(0, { lean: 0.72, armFA1: -0.9, armFA2: -1.1, armBA1: -0.7, armBA2: -0.9, weaponA: 2.7, hipY: 2, legFA1: 0.9, legFA2: 0.4, legBA1: -0.8, legBA2: 0.2, headTilt: -0.15 }),
  ],
  hurt: [
    P(0, { lean: -0.45, armFA1: -1.4, armFA2: -1.7, armBA1: -1.1, armBA2: -1.4, weaponA: -0.6, hipY: 3, headTilt: -0.25 }),
  ],
};

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.w = 30; this.h = 56;
    this.hp = CFG.player.hp;
    this.maxHp = CFG.player.hp;
    this.state = 'idle';
    this.stateT = 0;
    this.grounded = true;
    this.airJumpsLeft = CFG.player.airJumps;
    this.coyote = 0; this.jumpBuf = 0;
    this.dashCharges = CFG.player.dashMax;
    this.dashRegenT = 0;
    this.dashDir = 1;
    this.iFrames = 0;
    this.dashIFrames = 0;   // 用于完美闪避判定
    this.comboStep = 0;
    this.currentAtk = null;
    this.swingId = 0;
    this.hitSet = new Set();
    this.chargeT = 0;
    this.chargeLevel = 0;
    this.specialCd = 0;
    this.usedAirRise = false;
    this.runPhase = 0;
    this.trail = new BladeTrail();
    this.pose = basePose();
    this.squashX = 1; this.squashY = 1;
    this.landTimer = 0;
    this.dead = false;
    this.deadT = 0;
    this.bladeGlow = 0;
    this.queuedHeavy = false;
    this.style = {
      skin: '#e8c8a0', cloth: '#b03040', clothDark: '#6e1f2c',
      pants: '#2c3244', pantsDark: '#1c2030', strap: '#d8b25a',
      hair: '#241d1a', bladeLen: 52, scale: 1.0,
    };
  }

  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }
  get invulnerable() { return this.iFrames > 0 || this.dashIFrames > 0; }
  get attacking() { return this.currentAtk !== null; }

  hurtBox() {
    return { x: this.x - 14, y: this.y - this.h, w: 28, h: this.h };
  }

  /* 当前激活的攻击判定（供 game 查询） */
  activeHit() {
    if (!this.currentAtk) return null;
    const a = this.currentAtk;
    const def = ATTACKS[a.name];
    const t = this.stateT;
    if (t < def.startup || t > def.activeEnd) return null;
    const reach = def.reach;
    const front = this.x + this.facing * (10 + reach);
    const back = this.x - this.facing * 16; // 略微覆盖身后，贴身不空挥
    return {
      x: Math.min(front, back),
      y: this.y - this.h - 6 + (this.h - def.hh) / 2 + 6,
      w: Math.abs(front - back), h: def.hh,
      dir: this.facing, def, swingId: this.swingId, name: a.name,
      cx: this.x + this.facing * (10 + reach * 0.55), cy: this.y - this.h * 0.55,
    };
  }

  startAttack(name, game) {
    // 攻击磁吸：无方向输入时自动面向 280px 内最近的敌人
    if (game && game.input.axisX === 0) {
      let best = null, bd = 280;
      for (const e of game.enemies) {
        if (e.dead || e.state === 'drop') continue;
        const d = Math.abs(e.x - this.x);
        if (d < bd && Math.abs(e.y - this.y) < 160) { bd = d; best = e; }
      }
      if (best) this.facing = sign(best.x - this.x) || this.facing;
    }
    this.state = name;
    this.stateT = 0;
    this.currentAtk = { name };
    this.swingId++;
    this.hitSet.clear();
    const def = ATTACKS[name];
    synth.swing(def.swingSize);
    // 刀光弧闪现
    if (def.swingSize >= 1) {
      fx.slashArc(this.x + this.facing * 30, this.y - this.h * 0.55, this.facing, def.reach * 0.9,
        name === 'heavyC' ? '190,245,255' : '150,225,255', name === 'atk2' || name === 'air2');
    }
  }

  canCancelInto() { // 攻击中允许取消的时间点
    if (!this.currentAtk) return true;
    return this.stateT >= ATTACKS[this.currentAtk.name].cancel;
  }

  update(dt, game) {
    if (this.dead) { this.deadT += dt; this.trail.update(dt); return; }
    const inp = game.input;
    const P = CFG.player;
    this.stateT += dt;
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.dashIFrames = Math.max(0, this.dashIFrames - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.bladeGlow = Math.max(0, this.bladeGlow - dt * 2.2);
    this.trail.update(dt);

    // 冲刺充能
    if (this.dashCharges < P.dashMax) {
      this.dashRegenT += dt;
      if (this.dashRegenT >= P.dashRegen) {
        this.dashRegenT = 0;
        this.dashCharges++;
      }
    }

    // 压扁回弹
    this.squashX = damp(this.squashX, 1, 14, dt);
    this.squashY = damp(this.squashY, 1, 14, dt);

    const st = this.state;

    /* ---------- 冲刺 ---------- */
    if (st === 'dash') {
      this.vx = this.dashDir * P.dashSpeed;
      this.vy = 0;
      if (this.stateT > 0.03 && this.stateT < P.dashTime) {
        if (Math.random() < 0.85) {
          const ghostStyle = {
            ...this.style,
            cloth: '#7fd8ff', clothDark: '#4a90b8', pants: '#3a5a78',
            pantsDark: '#2a4258', skin: '#bfe8ff', hair: '#3a5a78',
          };
          fx.addAfterimage({
            life: 0.22, maxLife: 0.22,
            draw: (ctx, k) => {
              ctx.save();
              drawRonin(ctx, this.x - this.dashDir * 6, this.y, this.facing, this.pose, ghostStyle, { noWeapon: false });
              ctx.restore();
            },
          });
        }
      }
      if (this.stateT >= P.dashTime) {
        this.state = this.grounded ? 'idle' : 'air';
        this.stateT = 0;
        this.vx *= 0.35;
      }
      this.applyPhysics(dt, game, 0);
      return;
    }

    /* ---------- 受击 ---------- */
    if (st === 'hurt') {
      if (this.stateT > 0.32) { this.state = this.grounded ? 'idle' : 'air'; this.stateT = 0; }
      this.applyPhysics(dt, game, 1);
      this.readMovementOnly(dt, game);
      return;
    }

    /* ---------- 蓄力 ---------- */
    if (st === 'charge') {
      this.vx = damp(this.vx, 0, 20, dt);
      const prevLv = this.chargeLevel;
      this.chargeT += dt;
      this.chargeLevel = this.chargeT >= 0.6 ? 2 : (this.chargeT >= 0.26 ? 1 : 0);
      if (this.chargeLevel !== prevLv) {
        synth.chargeTick(this.chargeLevel);
        fx.ring(this.x, this.y - 30, 26, 4, 0.3, 'rgba(150,230,255,0.8)', 3);
        this.bladeGlow = 0.5 + this.chargeLevel * 0.5;
      }
      // 蓄力吸粒子
      if (Math.random() < 0.5) {
        const a = rand(0, TAU);
        const r = rand(30, 70);
        fx.particles.push({
          type: 'ember', x: this.x + Math.cos(a) * r, y: this.y - 30 + Math.sin(a) * r,
          vx: -Math.cos(a) * r * 3.2, vy: -Math.sin(a) * r * 3.2,
          life: 0.28, maxLife: 0.28, size: 2, color: '140,225,255', grav: 0, drag: 0,
        });
      }
      if (this.chargeLevel >= 2) this.bladeGlow = 1;
      if (!inp.down('heavy')) { // 释放
        const full = this.chargeLevel >= 2;
        this.startAttack(full ? 'heavyC' : 'heavy', game);
        this.bladeGlow = full ? 1 : 0.4;
        this.chargeT = 0; this.chargeLevel = 0;
      }
      this.applyPhysics(dt, game, 1);
      return;
    }

    /* ---------- 空中下劈 ---------- */
    if (st === 'slam') {
      this.vy = 1450;
      this.vx = damp(this.vx, 0, 6, dt);
      if (this.grounded) {
        // 落地 AoE 由 game 触发一次
        game.playerSlamLand();
        this.state = 'slamRecover'; this.stateT = 0;
        this.squashX = 1.35; this.squashY = 0.6;
      }
      this.applyPhysics(dt, game, 1, true);
      return;
    }
    if (st === 'slamRecover') {
      this.vx = damp(this.vx, 0, 10, dt);
      if (this.stateT > 0.22) { this.state = 'idle'; this.stateT = 0; this.currentAtk = null; }
      // 允许提前取消
      if (this.stateT > 0.1 && (inp.pressed('atk') || inp.pressed('dash'))) {
        this.currentAtk = null;
        this.state = 'idle'; this.stateT = 0;
      } else {
        this.applyPhysics(dt, game, 1);
        return;
      }
    }

    /* ---------- 攻击状态 ---------- */
    if (this.currentAtk) {
      const def = ATTACKS[this.currentAtk.name];
      // 地面攻击突进
      if (this.grounded && def.lungeV && this.stateT >= def.lungeFrom && this.stateT <= def.lungeTo) {
        this.vx = this.facing * def.lungeV;
      } else if (this.grounded) {
        this.vx = damp(this.vx, 0, 18, dt);
      } else {
        // 空中攻击：允许微漂移 + 悬停
        const ax = inp.axisX;
        this.vx = damp(this.vx, ax * 240, 8, dt);
        this.vy = Math.min(this.vy, 240); // 悬停封顶
      }

      // 连段衔接
      if (this.stateT >= def.cancel) {
        if (def.next && inp.consume('atk')) {
          this.startAttack(def.next, game);
        } else if (inp.consume('dash') && this.dashCharges > 0) {
          this.doDash(game);
        } else if (inp.pressed('heavy') && this.grounded) {
          inp.consume('heavy');
          this.currentAtk = null;
          this.enterCharge();
        } else if (inp.pressed('special') && this.specialCd <= 0) {
          inp.consume('special');
          this.doLauncher(game);
        }
      }

      if (this.stateT >= def.dur) {
        this.currentAtk = null;
        this.state = this.grounded ? 'idle' : 'air';
        this.stateT = 0;
      }
      this.applyPhysics(dt, game, this.currentAtk && !this.grounded ? 0.35 : 1);
      if (this.currentAtk) return;
    }

    /* ---------- 普通状态：idle / run / air ---------- */
    const ax = inp.axisX;
    if (ax !== 0 && this.state !== 'charge') this.facing = ax;

    // 跳跃缓冲 & 土狼时间
    if (inp.pressed('jump')) this.jumpBuf = P.jumpBuf;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.grounded) { this.coyote = P.coyote; this.airJumpsLeft = P.airJumps; this.usedAirRise = false; }
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuf > 0) {
      if (this.coyote > 0) {
        this.jumpBuf = 0; this.coyote = 0;
        this.vy = -P.jumpVel;
        this.grounded = false;
        this.squashX = 0.75; this.squashY = 1.3;
        synth.jump();
        fx.dust(this.x, this.y, 5, 70);
      } else if (this.airJumpsLeft > 0) {
        this.jumpBuf = 0;
        this.airJumpsLeft--;
        this.vy = -P.jumpVel * 0.88;
        this.squashX = 0.8; this.squashY = 1.25;
        synth.jump();
        fx.ring(this.x, this.y - 6, 4, 30, 0.25, 'rgba(180,220,255,0.7)', 3);
      }
    }
    // 可变跳高
    if (!inp.down('jump') && this.vy < -280) this.vy = -280;

    // 攻击触发
    if (inp.pressed('atk')) {
      inp.consume('atk');
      this.startAttack(this.grounded ? 'atk1' : 'air1', game);
    } else if (inp.pressed('heavy')) {
      inp.consume('heavy');
      if (this.grounded) this.enterCharge();
      else { this.state = 'slam'; this.stateT = 0; this.currentAtk = null; synth.swing(2); }
    } else if (inp.pressed('special') && this.specialCd <= 0) {
      inp.consume('special');
      this.doLauncher(game);
    } else if (inp.pressed('dash') && this.dashCharges > 0) {
      inp.consume('dash');
      this.doDash(game);
    }

    // 移动
    const target = ax * P.runSpeed;
    const accel = this.grounded ? P.accel : P.airAccel;
    if (ax !== 0) {
      this.vx = damp(this.vx, target, accel / P.runSpeed, dt);
    } else if (this.grounded) {
      this.vx = damp(this.vx, 0, P.friction / P.runSpeed, dt);
    }

    if (this.grounded && Math.abs(this.vx) > 40) {
      this.runPhase += dt * Math.abs(this.vx) * 0.038;
      if (Math.random() < dt * 6) fx.dust(this.x - this.facing * 10, this.y, 1, 30);
    }

    this.applyPhysics(dt, game, 1);

    // 状态归类
    if (!this.currentAtk && this.state !== 'dash' && this.state !== 'hurt') {
      if (this.grounded) this.state = Math.abs(this.vx) > 40 ? 'run' : 'idle';
      else this.state = 'air';
    }
  }

  readMovementOnly(dt, game) {
    // 受击时仍允许微调（手感不锁死）
    const ax = game.input.axisX;
    this.vx = damp(this.vx, ax * 120, 3, dt);
  }

  enterCharge() {
    this.state = 'charge';
    this.stateT = 0;
    this.currentAtk = null;
    this.chargeT = 0; this.chargeLevel = 0;
    synth.chargeTick(0);
  }

  doDash(game) {
    this.dashCharges--;
    this.currentAtk = null;
    this.state = 'dash';
    this.stateT = 0;
    const ax = game.input.axisX;
    this.dashDir = ax !== 0 ? ax : this.facing;
    this.facing = this.dashDir;
    this.dashIFrames = CFG.player.dashIFrames;
    this.squashX = 1.3; this.squashY = 0.75;
    synth.dash();
    fx.dust(this.x, this.y - 4, 6, 90);
    fx.ring(this.x, this.y - 26, 6, 34, 0.2, 'rgba(170,220,255,0.55)', 2.5);
  }

  doLauncher(game) {
    this.specialCd = 1.0;
    if (this.grounded) {
      this.startAttack('launcher', game);
      this.vy = ATTACKS.launcher.rise;
      this.grounded = false;
      fx.ring(this.x, this.y, 8, 46, 0.3, 'rgba(160,235,255,0.8)', 4);
      fx.dust(this.x, this.y, 8, 90);
    } else if (!this.usedAirRise) {
      this.usedAirRise = true;
      this.startAttack('airRise', game);
      this.vy = ATTACKS.airRise.rise;
      fx.ring(this.x, this.y - 20, 6, 36, 0.25, 'rgba(160,235,255,0.7)', 3);
    } else {
      this.specialCd = 0.3;
      return;
    }
    synth.swing(1);
  }

  takeHit(dmg, dirX, kbX, kbY, game) {
    if (this.invulnerable || this.dead) return false;
    this.hp -= dmg;
    this.iFrames = CFG.player.hurtIFrames;
    this.currentAtk = null;
    this.state = 'hurt';
    this.stateT = 0;
    this.vx = dirX * kbX;
    this.vy = -Math.abs(kbY);
    this.grounded = false;
    synth.hurt();
    fx.spark(this.x, this.y - 34, dirX, 8, 320, '255,90,80', 1.2);
    fx.shake(5, 0.25, dirX, 0);
    fx.addHitstop(0.06);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadT = 0;
      synth.gameOver();
    }
    return true;
  }

  heal(v) {
    this.hp = Math.min(this.maxHp, this.hp + v);
    synth.heal();
    fx.embers(this.x, this.y - 30, 10, '120,255,170');
  }

  applyPhysics(dt, game, gravMul = 1, noGrav = false) {
    if (!noGrav) this.vy += GRAVITY * gravMul * dt;
    const prevVy = this.vy;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 场地边界
    if (this.x < 46) { this.x = 46; this.vx = Math.max(0, this.vx); }
    if (this.x > ARENA_W - 46) { this.x = ARENA_W - 46; this.vx = Math.min(0, this.vx); }

    const wasGrounded = this.grounded;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      if (!wasGrounded) {
        this.grounded = true;
        if (prevVy > 620) {
          this.squashX = 1.3; this.squashY = 0.62;
          this.landTimer = 0.1;
          fx.dust(this.x, this.y, 7, 110);
          synth.land(true);
        } else if (prevVy > 200) {
          fx.dust(this.x, this.y, 3, 60);
          synth.land(false);
        }
      }
      this.vy = 0;
      if (this.state !== 'slam') this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  currentPose(out) {
    const st = this.state;
    if (this.currentAtk) {
      const keys = POSES[this.currentAtk.name === 'heavyC' ? 'heavy' : this.currentAtk.name] || POSES.atk1;
      return evalKeyframes(keys, this.stateT, out);
    }
    switch (st) {
      case 'run': return runPose(this.runPhase, out);
      case 'air': return airPose(this.vy, out);
      case 'dash': return evalKeyframes(POSES.dash, 0, out);
      case 'charge': {
        const p = evalKeyframes(POSES.charge, 0, out);
        const tr = Math.sin(this.stateT * 55) * 0.02 * (1 + this.chargeLevel);
        p.armFA1 += tr; p.weaponA += tr;
        return p;
      }
      case 'slam': case 'slamRecover': return evalKeyframes(POSES.slam, 0, out);
      case 'hurt': return evalKeyframes(POSES.hurt, 0, out);
      default: return idlePose(this.stateT, out);
    }
  }

  draw(ctx, time) {
    const pose = this.currentPose(this.pose);
    if (this.dead) {
      // 倒地
      ctx.save();
      ctx.globalAlpha = clamp(1.6 - this.deadT * 0.8, 0, 1);
      ctx.translate(this.x, this.y);
      ctx.rotate(-this.facing * Math.min(this.deadT * 3.2, 1.35));
      ctx.translate(-this.x, -this.y);
      drawRonin(ctx, this.x, this.y, this.facing, evalKeyframes(POSES.hurt, 0, this.pose), this.style, {});
      ctx.restore();
      return;
    }
    // 受击闪白
    const hurtFlash = this.iFrames > 0 && Math.floor(time * 18) % 2 === 0 && this.state === 'hurt';
    const info = drawRonin(ctx, this.x, this.y, this.facing, pose, this.style, {
      glow: this.bladeGlow,
      sx: this.squashX, sy: this.squashY,
    });
    if (hurtFlash) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      drawRonin(ctx, this.x, this.y, this.facing, pose, {
        ...this.style, cloth: '#fff', clothDark: '#fff', pants: '#fff', pantsDark: '#fff', skin: '#fff', hair: '#fff',
      }, { noWeapon: true, sx: this.squashX, sy: this.squashY });
      ctx.restore();
    }
    // 攻击激活期记录刀光
    if (this.currentAtk) {
      const def = ATTACKS[this.currentAtk.name];
      if (this.stateT > def.startup * 0.5 && this.stateT < def.activeEnd + 0.09) {
        this.trail.push(info.base.x, info.base.y, info.tip.x, info.tip.y);
      }
    }
    const trailColor = this.currentAtk && (this.currentAtk.name === 'heavyC') ? '190,245,255' : '120,215,255';
    this.trail.draw(ctx, trailColor);
  }
}
