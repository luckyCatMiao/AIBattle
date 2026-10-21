// ============================================================================
// entities.js — 玩家 / 敌人（分段肢体可破坏）/ 炮弹投射物
// ============================================================================

// ============================================================ 玩家 ============
class Player {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    const g = this.game;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.w = CFG.playerW; this.h = CFG.playerH;
    this.hp = CFG.playerMaxHp;
    this.grounded = true;
    this.coyote = 0;
    this.state = 'idle';          // idle|run|jump|dash|attack|airAttack|dive|hurt|dead
    this.attackName = null;
    this.attackTimer = 0;
    this.attackHitDone = new Set();
    this.lightStep = 0;
    this.comboTimer = 0;
    this.airStep = 0;
    this.airAttacks = 0;
    this.charge = 0;
    this.charging = false;
    this.kPressBuffer = 0;
    this.bufferJump = 0;
    this.bufferLight = 0;
    this.bufferLauncher = 0;
    this.bufferDash = 0;
    this.dashTimer = 0;
    this.dashCd = 0;
    this.dashDir = 1;
    this.invuln = 0;
    this.hurtTimer = 0;
    this.animTime = 0;
    this.ghosts = [];
    this.hitFlash = 0;
    this.skillBuf = { KeyU: 0, KeyO: 0, KeyP: 0, KeyQ: 0 };
    this.skillCd = { KeyU: 0, KeyO: 0, KeyP: 0, KeyQ: 0 };
    this.skillName = null;
    this.skillDef = null;
    this.skillTimer = 0;
    this.skillFired = false;
    this._spaceHeld = false;
    this._prevGrounded = true;
    this.landImpact = 0;
  }

  _updateGhosts(dt) {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
  }

  // ---- 每帧（含顿帧期间）读取按下脉冲，写入缓冲区 ----
  queueInput(input) {
    if (input.pressed('Space')) this.bufferJump = CFG.jumpBufferTime;
    if (input.pressed('KeyJ')) this.bufferLight = 0.22;
    if (input.pressed('KeyI')) this.bufferLauncher = 0.20;
    if (input.pressed('KeyL')) this.bufferDash = 0.22;
    if (input.pressed('KeyK')) this.kPressBuffer = 0.18;
    for (const s of SKILLS) {
      if (input.pressed(s.key)) this.skillBuf[s.key] = 0.22;
    }
  }

  update(dt, input) {
    this.animTime += dt;
    this._updateGhosts(dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.lightStep = 0;
    this.bufferJump = Math.max(0, this.bufferJump - dt);
    this.bufferLight = Math.max(0, this.bufferLight - dt);
    this.bufferLauncher = Math.max(0, this.bufferLauncher - dt);
    this.bufferDash = Math.max(0, this.bufferDash - dt);
    this.kPressBuffer = Math.max(0, this.kPressBuffer - dt);
    for (const k in this.skillBuf) this.skillBuf[k] = Math.max(0, this.skillBuf[k] - dt);
    for (const k in this.skillCd) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
    if (this.hitFlash) this.hitFlash = Math.max(0, this.hitFlash - dt);

    // 落地检测（普通物理路径外的状态各自处理）
    this._prevGrounded = this.grounded;

    if (this.state === 'dead') {
      this.vy += CFG.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y > 0) { this.y = 0; this.vy = 0; }
      return;
    }

    const axis = input.moveAxis();

    // ---- 受伤硬直 ----
    if (this.state === 'hurt') {
      this.vy += CFG.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.max(0, 1 - 5 * dt);
      if (this.y >= 0) { this.y = 0; this.vy = Math.min(0, this.vy); this.vx *= 0.7; }
      this.hurtTimer -= dt;
      if (this.hurtTimer <= 0) this.state = this.grounded ? 'idle' : 'jump';
      return;
    }

    // ---- 冲刺（最高优先级，可取消其它动作） ----
    if (this.bufferDash > 0 && this.dashCd <= 0 && this.state !== 'dash') {
      this.bufferDash = 0;
      this.startDash(axis);
    }

    if (this.state === 'dash') {
      this.dashTimer -= dt;
      this.x += this.vx * dt;
      if (!this.grounded) { this.vy += CFG.gravity * 0.32 * dt; this.y += this.vy * dt; }
      // 残影
      this.ghostTimer = (this.ghostTimer || 0) - dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = 0.03;
        this.ghosts.push({ x: this.x, y: this.y, facing: this.facing, state: 'dash', life: 0.24, charge: 0, attackName: null, attackTimer: 0 });
      }
      if (this.dashTimer <= 0) {
        this.state = this.grounded ? 'idle' : 'jump';
        this.vx *= 0.4;
      }
      return;
    }

    // ---- 主动技能（可取消攻击/坠斩，但不能打断进行中的冲刺） ----
    if (this.state === 'skill') {
      this.updateSkill(dt, input);
      return;
    }
    if (this.tryStartSkill()) {
      this.updateSkill(dt, input);
      return;
    }

    // ---- 坠斩 ----
    if (this.state === 'dive') {
      this.updateDive(dt, input);
      return;
    }

    // ---- 攻击（地面 / 空中） ----
    if (this.state === 'attack' || this.state === 'airAttack') {
      this.updateAttack(dt, input);
      return;
    }

    // ================= 正常状态（idle / run / jump） =================
    // 面向与水平移动
    if (axis !== 0) this.facing = sign(axis);
    if (this.grounded) {
      this.vx = approach(this.vx, axis * CFG.moveSpeed, CFG.accel * dt);
    } else {
      this.vx = approach(this.vx, axis * CFG.moveSpeed, CFG.accel * CFG.airControl * dt);
    }
    if (axis === 0) {
      const f = (this.grounded ? CFG.groundFriction : CFG.airFriction) * dt;
      this.vx = this.vx > 0 ? Math.max(0, this.vx - f) : Math.min(0, this.vx + f);
    }

    // ---- 蓄力 / 重斩 / 坠斩 ----
    if (this.kPressBuffer > 0) {
      if (this.grounded && !this.charging) {
        this.charging = true; this.charge = 0; this.kPressBuffer = 0;
      } else if (!this.grounded) {
        this.kPressBuffer = 0; this.startDive(); return;
      }
    }
    if (this.charging) {
      if (input.isDown('KeyK')) {
        this.charge = Math.min(1, this.charge + dt / 0.55);
        // 蓄力时仍可移动，但不触发其它攻击
      } else {
        this.charging = false;
        this.startHeavy(this.charge);
        return;
      }
    }

    // ---- 轻斩 / 挑空 ----
    if (!this.charging) {
      if (this.bufferLight > 0) {
        if (this.grounded) { this.bufferLight = 0; this.startLight(); return; }
        else if (this.airAttacks < 2) { this.bufferLight = 0; this.startAirAttack(); return; }
      }
      if (this.bufferLauncher > 0 && this.grounded) {
        this.bufferLauncher = 0; this.startLauncher(); return;
      }
    }

    // ---- 跳跃（可变高度） ----
    if (this.bufferJump > 0 && this.coyote > 0 && !this.charging) {
      this.bufferJump = 0; this.coyote = 0;
      this.vy = CFG.jumpSpeed;
      this.grounded = false;
      this.state = 'jump';
      this.game.audio.jump();
      this.game.particles.dust(this.x, this.y, 4, 90);
    }
    // 提前松键削减上升
    if (!input.isDown('Space') && this._spaceHeld && this.vy < 0) {
      this.vy *= CFG.jumpCut;
    }
    this._spaceHeld = input.isDown('Space');

    // ---- 物理积分 ----
    const wasGrounded = this.grounded;
    const fallSpeed = this.vy;
    this.vy += CFG.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= 0) {
      this.y = 0;
      this.vy = Math.min(0, this.vy);
      this.grounded = true;
      this.coyote = CFG.coyoteTime;
      this.airStep = 0; this.airAttacks = 0;
      if (!wasGrounded) this.onLand(fallSpeed);
    } else {
      this.grounded = false;
      this.coyote = Math.max(0, this.coyote - dt);
    }
    this.state = this.grounded ? (Math.abs(axis) > 0 ? 'run' : 'idle') : 'jump';
  }

  onLand(fallSpeed) {
    const g = this.game;
    const impact = clamp(fallSpeed / 1400, 0, 1.2);
    g.particles.dust(this.x, 0, 5 + Math.round(impact * 3), 120 + impact * 120);
    if (impact > 0.25) g.audio.land(impact);
    if (impact > 0.7) g.fx.addShake(2 + impact * 3);
  }

  // ============================================================ 招式 ============
  _beginAttack(name) {
    this.attackName = name;
    this.state = (name === 'air1' || name === 'air2') ? 'airAttack' : 'attack';
    this.attackTimer = 0;
    this.attackHitDone = new Set();
    this.activeStarted = false;
    this.comboTimer = CFG.comboWindow;
    this.vx = this.facing * 60;
    const a = ATTACKS[name];
    this.game.audio.swing(name === 'heavyFull' ? 1.4 : (name === 'heavy' ? 1.1 : 0.85));
    if (name === 'launcher') {
      // 挑空斩自带小幅上跳，便于追击
      this.vy = -300;
      this.grounded = false;
    }
    return a;
  }

  startLight() {
    if (this.comboTimer <= 0) this.lightStep = 0;
    else this.lightStep = Math.min(this.lightStep + 1, 2);
    this._beginAttack(['l1', 'l2', 'l3'][this.lightStep]);
  }

  startAirAttack() {
    const name = this.airStep === 0 ? 'air1' : 'air2';
    this.airStep = Math.min(this.airStep + 1, 1);
    this.airAttacks++;
    this._beginAttack(name);
  }

  startHeavy(charge) {
    const name = charge > 0.8 ? 'heavyFull' : 'heavy';
    this._beginAttack(name);
    if (name === 'heavyFull') this.charge = 1;
  }

  startLauncher() {
    this._beginAttack('launcher');
  }

  startDash(axis) {
    const dir = axis !== 0 ? sign(axis) : this.facing;
    this.state = 'dash';
    this.dashTimer = CFG.dashTime;
    this.dashCd = CFG.dashCooldown;
    this.dashDir = dir;
    this.facing = dir;
    this.vx = dir * CFG.dashSpeed;
    if (this.grounded) this.vy = 0;
    this.invuln = Math.max(this.invuln, CFG.dashIframes);
    this.ghostTimer = 0;
    this.game.audio.dash();
  }

  startDive() {
    this.state = 'dive';
    this.vy = Math.max(this.vy, 1000);
    this.vx = this.facing * 150;
    this.diveHit = new Set();
    this.game.audio.swing(1.3);
  }

  // ---- 主动技能 ----
  tryStartSkill() {
    for (const s of SKILLS) {
      if (this.skillBuf[s.key] > 0 && this.skillCd[s.key] <= 0) {
        this.skillBuf[s.key] = 0;
        this.startSkill(s);
        return true;
      }
    }
    return false;
  }

  startSkill(s) {
    this.state = 'skill';
    this.skillDef = s;
    this.skillName = s.id;
    this.skillTimer = 0;
    this.skillFired = false;
    this.skillCd[s.key] = s.cooldown;
    this.attackName = null;
    this.charging = false;
    if (this.grounded) this.vx = 0;
    else this.vx *= 0.3;
    this.game.audio.swing(s.type === 'dashSlash' ? 1.15 : 0.9);
  }

  updateSkill(dt, input) {
    const d = this.skillDef;
    this.skillTimer += dt;

    // 到前摇时刻触发技能效果
    if (!this.skillFired && this.skillTimer >= d.windup) {
      this.skillFired = true;
      this.game.castSkill(this, d);
    }

    // 技能期间移动 / 滞空
    if (this.grounded) {
      this.x += this.vx * dt;
      this.y = 0;
    } else {
      this.vy += CFG.gravity * 0.5 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= 0) {
        this.y = 0; this.vy = 0; this.grounded = true;
        this.airStep = 0; this.airAttacks = 0;
      }
    }

    if (this.skillTimer >= d.total) {
      this.state = this.grounded ? 'idle' : 'jump';
      this.skillDef = null;
      this.skillName = null;
      this.vx *= 0.5;
    }
  }

  updateAttack(dt, input) {
    const a = ATTACKS[this.attackName];
    this.attackTimer += dt;
    const w = a.windup, ac = a.active, r = a.recovery, total = w + ac + r;
    const isAir = this.attackName === 'air1' || this.attackName === 'air2' || this.attackName === 'launcher';

    if (this.attackTimer >= w && this.attackTimer < w + ac) {
      if (!this.activeStarted) {
        this.activeStarted = true;
        this.game.spawnSlashVisual(this, a);
      }
      this.vx = approach(this.vx, this.facing * a.move, 16 * dt);
      this.game.dealPlayerAttack(this, a, this.attackHitDone);
    }

    if (isAir) {
      this.vy += CFG.gravity * 0.55 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= 0) {
        this.y = 0; this.vy = 0; this.grounded = true;
        this.airStep = 0; this.airAttacks = 0;
      }
    } else {
      this.x += this.vx * dt;
      this.y = 0;
    }

    // 收招阶段自然减速，避免滑行过多
    if (this.attackTimer >= w + ac) {
      this.vx *= Math.max(0, 1 - 8 * dt);
    }

    // 连段衔接
    if (this.bufferLight > 0 && this.attackTimer >= a.chainFrom) {
      if (this.attackName === 'air1') {
        this.bufferLight = 0; this.startAirAttack(); return;
      }
      if (this.attackName === 'l1' || this.attackName === 'l2') {
        this.bufferLight = 0; this.startLight(); return;
      }
    }

    if (this.attackTimer >= total) {
      this.state = this.grounded ? 'idle' : 'jump';
      this.attackName = null;
      this.vx *= 0.55;
    }
  }

  updateDive(dt, input) {
    this.vy += CFG.gravity * dt;
    const axis = input.moveAxis();
    if (axis !== 0) this.vx = approach(this.vx, axis * CFG.moveSpeed * 0.5, 8 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 下落过程中命中敌人（刺击）
    this.game.dealDive(this);

    if (this.y >= 0) {
      this.y = 0;
      this.game.diveImpact(this);
      this.state = 'idle';
      this.vx *= 0.4;
      this.vy = 0;
      this.grounded = true;
    }
  }

  // ---- 受伤 / 死亡 ----
  takeDamage(dmg, fromX) {
    const g = this.game;
    if (this.invuln > 0 || this.state === 'dead') return false;
    this.hp -= dmg;
    g.fx.addHitStop(CFG.hurtHitstop);
    g.fx.addShake(6);
    g.audio.hurt();
    g.combo = 0;
    this.comboTimer = 0;
    this.lightStep = 0;
    this.charging = false;
    g.particles.sparks(this.x, this.y - this.h * 0.5, 10, COLORS.blood, 260);
    g.particles.ring(this.x, this.y - this.h * 0.5, COLORS.blood, 4, 46, 0.3);
    this.state = 'hurt';
    this.hurtTimer = 0.32;
    this.invuln = CFG.hurtInvuln;
    this.vx = sign(this.x - fromX) * CFG.hurtKnockback;
    this.vy = -280;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    g.onPlayerHurt();
    return true;
  }

  die() {
    this.state = 'dead';
    this.vy = -520;
    this.vx = 0;
    this.charging = false;
    this.game.onPlayerDeath();
  }
}

// ============================================================ 敌人 ============
class Enemy {
  constructor(game, type, x) {
    this.game = game;
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.x = x;
    this.y = 0;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.w = this.def.w; this.h = this.def.h;
    this.hp = this.def.bodyHp;
    this.maxHp = this.def.bodyHp;
    this.limbs = {};
    for (const id in this.def.limbs) {
      const s = this.def.limbs[id];
      this.limbs[id] = { id, hp: s.hp, maxHp: s.hp, broken: false, kind: s.kind, side: s.side || 0, weapon: s.weapon || null };
    }
    this.state = 'spawn';       // spawn|idle|walk|windup|attack|recover|hit|stun|dead
    this.stateTimer = 0.45;
    this.walkPhase = rand(0, Math.PI * 2);
    this.hitFlash = 0;
    this.stunTimer = 0;
    this.touchCd = 0;
    this.attackTimer = 0;
    this.attackHitPlayer = false;
    this.dead = false;
    this.grounded = true;
    this.slowTimer = 0;
  }

  // ---- 能力（依据剩余肢体） ----
  attackLimb() { return this.type === 'blade' ? this.limbs.armR : this.limbs.cannon; }
  canAttack() { const l = this.attackLimb(); return l && !l.broken; }

  speedMul() {
    let legs = 0;
    if (!this.limbs.legL.broken) legs++;
    if (!this.limbs.legR.broken) legs++;
    if (legs === 2) return 1;
    if (legs === 1) return 0.48;
    return 0.07;
  }

  aliveLimbCount() {
    let n = 0;
    for (const id in this.limbs) if (!this.limbs[id].broken) n++;
    return n;
  }

  update(dt) {
    if (this.dead) return;
    const g = this.game;
    const p = g.player;

    // 时滞 debuff：整体放慢动作/移动（真实时间衰减 debuff 本身）
    if (this.slowTimer > 0) this.slowTimer -= dt;
    const sdt = this.slowTimer > 0 ? dt * 0.45 : dt;

    this.walkPhase += sdt * (Math.abs(this.vx) * 0.06 + 4);
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.touchCd > 0) this.touchCd = Math.max(0, this.touchCd - dt);
    if (this.stunTimer > 0) this.stunTimer -= dt;

    // 面向玩家
    const dx = p.x - this.x;
    if (Math.abs(dx) > 4) this.facing = sign(dx);
    const dist = Math.abs(dx);
    const speed = this.def.speed * this.speedMul();

    // ---- 出场 ----
    if (this.state === 'spawn') {
      this.stateTimer -= sdt;
      if (this.stateTimer <= 0) this.state = 'idle';
      return;
    }

    // ---- 眩晕（断头） ----
    if (this.state === 'stun') {
      this._physics(sdt, 6);
      if (this.stunTimer <= 0) this.state = 'idle';
      return;
    }

    // ---- 受击硬直（击退 / 浮空） ----
    if (this.state === 'hit') {
      this._physics(sdt, 2);
      if (this.grounded && Math.abs(this.vx) < 20) this.state = 'idle';
      return;
    }

    // ---- 出招前摇 ----
    if (this.state === 'windup') {
      this.vx *= Math.max(0, 1 - 8 * sdt);
      this._physics(sdt, 1);
      this.stateTimer -= sdt;
      if (this.stateTimer <= 0) this._fireAttack();
      return;
    }

    // ---- 攻击（近战挥砍） ----
    if (this.state === 'attack') {
      this.attackTimer += sdt;
      this.vx *= Math.max(0, 1 - 10 * sdt);
      this._physics(sdt, 1);
      // 判定窗口
      if (this.attackTimer <= this.def.active) {
        g.dealEnemyMelee(this);
      }
      if (this.attackTimer >= this.def.active + 0.08) {
        this.state = 'recover';
        this.stateTimer = this.def.recovery;
      }
      return;
    }

    // ---- 收招 ----
    if (this.state === 'recover') {
      this.vx *= Math.max(0, 1 - 6 * sdt);
      this._physics(sdt, 1);
      this.stateTimer -= sdt;
      if (this.stateTimer <= 0) this.state = 'idle';
      return;
    }

    // ---- 正常决策（idle / walk） ----
    if (this.canAttack()) {
      if (this.type === 'blade') {
        if (dist < this.def.attackRange) {
          this._startWindup();
        } else {
          this._walk(sdt, speed);
        }
      } else { // cannon
        if (dist > this.def.fireMax) {
          this._walk(sdt, speed);
        } else if (dist < this.def.fireMin) {
          this._walk(sdt, -speed); // 拉开距离
        } else {
          this._startWindup();
        }
      }
    } else {
      // 失去攻击肢体 → 撞击（碰到玩家才有效）
      this._walk(sdt, speed);
    }

    // 撞击伤害（失去攻击肢体的敌人用身体冲撞）
    if (!this.canAttack()) {
      this._contactDamage();
    }
  }

  _walk(dt, speed) {
    this.state = 'walk';
    this.vx = approach(this.vx, this.facing * speed, 1400 * dt);
    this._physics(dt, 1);
  }

  _startWindup() {
    this.state = 'windup';
    this.stateTimer = this.def.windup;
    this.attackHitPlayer = false;
    this.attackTimer = 0;
    this.game.audio.enemyWindup();
  }

  _fireAttack() {
    if (this.type === 'cannon') {
      // 发射炮弹
      const pos = this.limbPos('cannon');
      const p = this.game.player;
      const dir = sign(p.x - this.x) || this.facing;
      this.facing = dir;
      const speed = this.def.projectileSpeed;
      const sx = this.x + dir * (this.w / 2 + 14);
      const sy = pos.y + 2;
      const ang = Math.atan2((p.y - p.h * 0.5) - sy, p.x - sx);
      this.game.addProjectile(sx, sy, Math.cos(ang) * speed, Math.sin(ang) * speed);
      this.game.audio.shoot();
      this.game.particles.sparks(sx, sy, 6, COLORS.cannonGlow, 200, 1.2);
      this.state = 'recover';
      this.stateTimer = this.def.recovery;
    } else {
      // 近战挥砍
      this.state = 'attack';
      this.attackTimer = 0;
      this.game.audio.enemySlash();
      this.game.spawnEnemySlash(this);
    }
  }

  _contactDamage() {
    const g = this.game;
    const p = g.player;
    if (this.touchCd > 0) return;
    if (Math.abs(p.x - this.x) < (this.w + p.w) * 0.5 + 4 && p.y > -this.h - 10 && p.y < 10) {
      if (p.takeDamage(this.def.touchDamage, this.x)) {
        this.touchCd = 0.9;
        g.fx.addShake(4);
      }
    }
  }

  _physics(dt, frictionMul) {
    const wasGrounded = this.grounded;
    this.vy += CFG.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= 0) {
      const fall = this.vy;
      this.y = 0;
      this.vy = Math.min(0, this.vy);
      this.grounded = true;
      this.vx *= Math.max(0, 1 - (wasGrounded ? 4 : 2.4) * frictionMul * dt);
      // 被击飞后落地反馈
      if (!wasGrounded && fall > 260) {
        this.game.particles.dust(this.x, 0, 4, 110);
        if (fall > 720) this.game.audio.land(0.5);
      }
    } else {
      this.grounded = false;
      this.vx *= Math.max(0, 1 - 0.6 * dt);
    }
  }

  // ---- 肢体世界坐标（判定 & 渲染参考） ----
  limbPos(id) {
    const l = this.limbs[id];
    if (!l || l.broken) return null;
    const f = this.facing;
    const y = this.y, h = this.h, w = this.w;
    const cx = this.x;
    const shoulderY = y - h + 26;
    const hipY = y - h * 0.48;
    const headY = y - h + 14;
    switch (l.kind) {
      case 'head': return { x: cx + f * 2, y: headY, r: 13 };
      case 'arm': return { x: cx + f * l.side * (w / 2 + 8), y: shoulderY + 2, r: 11 };
      case 'cannon': return { x: cx + f * (w / 2 + 10), y: shoulderY, r: 14 };
      case 'leg': return { x: cx + f * l.side * (w * 0.22), y: hipY + 5, r: 10 };
    }
    return { x: cx, y: y - h / 2, r: 12 };
  }

  bodyRect() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  // ---- 受击 ----
  takeHit(dmg, knockback, launch, dir, opts = {}) {
    const g = this.game;
    this.hp -= dmg;
    this.hitFlash = 0.14;
    this.state = 'hit';
    this.stunTimer = 0;
    this.vx = dir * knockback;
    this.vy = launch || 0;
    if (this.grounded && !launch) {
      // 地面击退
      this.vx = dir * knockback;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      g.killEnemy(this);
      return true;
    }
    return false;
  }

  // ---- 断肢 ----
  breakLimb(id) {
    const l = this.limbs[id];
    if (!l || l.broken) return;
    l.broken = true;
    const g = this.game;
    const pos = this.limbPos(id) || { x: this.x, y: this.y - this.h * 0.5 };
    g.onLimbBreak(this, l, pos);
  }

  getAttackHb() {
    if (this.type !== 'blade' || this.state !== 'attack') return null;
    const hb = this.def.attackHb;
    const cy = this.y - this.h * 0.5 + hb.cy;
    return { x: this.x + this.facing * hb.cx - hb.w / 2, y: cy - hb.h / 2, w: hb.w, h: hb.h };
  }
}

// ============================================================ 炮弹 ============
class Projectile {
  constructor(game, x, y, vx, vy) {
    this.game = game;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = 7;
    this.life = 3;
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    this.vy += 200 * dt; // 轻微下坠
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // 尾迹
    if (Math.random() < 0.6) {
      this.game.particles.add({ type: 'dot', x: this.x, y: this.y, vx: 0, vy: 0, life: 0.2, size: 3, color: COLORS.cannonGlow });
    }
    // 命中玩家
    const p = this.game.player;
    if (!this.dead && Math.abs(p.x - this.x) < p.w * 0.5 + this.r && p.y - p.h < this.y && this.y < p.y + 10) {
      if (p.takeDamage(this.game.enemyDef('cannon').attackDamage, this.x - this.vx * 0.05)) {
        this.dead = true;
      }
    }
    // 落地 / 出界
    if (this.y >= 0) {
      this.dead = true;
      this.game.particles.sparks(this.x, 0, 5, COLORS.cannonGlow, 160);
      this.game.particles.ring(this.x, 0, COLORS.cannonGlow, 3, 26, 0.2);
    }
    if (this.life <= 0 || Math.abs(this.x - this.game.player.x) > 1600) this.dead = true;
  }
}

// ============================================================ 分身 ============
class Clone {
  constructor(game, x, y, dir, d, delay) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.d = d;
    this.delay = delay;
    this.t = 0;
    this.life = 0.5;
    this.dead = false;
    this.hit = new Set();
  }

  update(dt) {
    this.t += dt;
    this.life -= dt;
    if (this.t < this.delay) return;
    this.x += this.dir * 1050 * dt;

    // 拖尾残影
    if (Math.random() < 0.55) {
      this.game.particles.add({
        type: 'dot', x: this.x, y: this.y,
        vx: -this.dir * 40, vy: 0,
        life: 0.18, size: 4, color: '#7a8cff', drag: 2,
      });
    }

    // 命中判定
    const rect = { x: this.x - 22, y: this.y - 46, w: 44, h: 92 };
    for (const e of this.game.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      if (this.hit.has(e.id)) continue;
      const br = e.bodyRect();
      if (!rectsOverlap(rect.x, rect.y, rect.w, rect.h, br.x, br.y, br.w, br.h)) continue;
      this.hit.add(e.id);
      const dmg = Math.round(this.d.damage * rand(0.9, 1.1));
      const died = e.takeHit(dmg, this.d.knockback, this.d.launch, this.dir);
      this.game.hitCount++;
      this.game.combo++;
      this.game.comboTimer = CFG.comboWindow;
      this.game.applyHitFeedback({ x: e.x, y: e.y - e.h * 0.5 }, this.d, dmg, died);
      this.game.particles.slash(this.x, this.y, this.dir > 0 ? 0 : Math.PI, 1.5, 42, '#7a8cff', '#c9d4ff', 0.13);
      for (const id in e.limbs) {
        const l = e.limbs[id];
        if (l.broken) continue;
        const pos = e.limbPos(id);
        if (pos && circleRect(pos.x, pos.y, pos.r + 4, rect.x, rect.y, rect.w, rect.h)) {
          this.game.hitEnemyLimb(e, l, pos, this.d, this.dir);
        }
      }
      if (died) continue;
    }
    if (this.life <= 0) this.dead = true;
  }
}
