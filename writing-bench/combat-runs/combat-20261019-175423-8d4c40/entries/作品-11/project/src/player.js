// ============================================================
// player.js — 玩家：移动 / 连斩 / 蓄力重斩 / 瞬步 / 挑空 / 空中连段
// ============================================================
const ATK = {
  atk1:     { dur: 0.40, a0: 0.26, a1: 0.58, dmg: 12, kb: 150, kup: 0,   ks: 0.050, shake: 0.10, punch: 0,    part: 0.62, step: 150, w: 1 },
  atk2:     { dur: 0.44, a0: 0.28, a1: 0.60, dmg: 14, kb: 180, kup: 80,  ks: 0.060, shake: 0.12, punch: 0.012, part: 0.65, step: 100, w: 1 },
  atk3:     { dur: 0.68, a0: 0.34, a1: 0.72, dmg: 24, kb: 430, kup: 130, ks: 0.110, shake: 0.28, punch: 0.030, part: 1.15, step: 120, w: 2, poise: true, kdown: true, forcePart: 0.6 },
  heavyTap: { dur: 0.52, a0: 0.32, a1: 0.58, dmg: 26, kb: 320, kup: 90,  ks: 0.090, shake: 0.20, punch: 0.020, part: 1.05, step: 120, w: 2, poise: true },
  heavyRel: { dur: 0.72, a0: 0.32, a1: 0.60, dmg: 46, kb: 580, kup: 170, ks: 0.150, shake: 0.42, punch: 0.050, part: 2.2,  step: 180, w: 3, poise: true, kdown: true, forceBreak: true },
  launcher: { dur: 0.55, a0: 0.14, a1: 0.52, dmg: 16, kb: 70,  launch: 600, ks: 0.090, shake: 0.18, punch: 0.020, part: 0.95, step: 40, w: 2, poise: true },
  air1:     { dur: 0.38, a0: 0.22, a1: 0.52, dmg: 12, kb: 120, kup: 150, ks: 0.050, shake: 0.09, punch: 0, part: 0.62, w: 1 },
  air2:     { dur: 0.50, a0: 0.28, a1: 0.55, dmg: 20, kb: 80,  slam: true, ks: 0.085, shake: 0.22, punch: 0.025, part: 0.95, w: 2, poise: true },
  dashatk:  { dur: 0.42, a0: 0.18, a1: 0.52, dmg: 16, kb: 260, kup: 0, ks: 0.060, shake: 0.14, punch: 0.010, part: 0.70, step: 230, w: 1 },
};
const GROUND_CHAIN = { atk1: 'atk2', atk2: 'atk3' };

// ---------- 四大技能定义 ----------
const SKD = {
  strings: { dur: 0.55, cost: 30, cd: 1.2, slot: 'u' },
  blink:   { dur: 0.78, cost: 35, cd: 1.8, slot: 'o' },
  wave:    { dur: 0.72, cost: 45, cd: 2.2, slot: 'p' },
  ult:     { dur: 1.95, cost: 100, cd: 6, slot: 'h' },
};
// 技能命中数据（供 hitEnemy 使用）
const SKD_HIT = {
  str1: { dmg: 10, kb: 130, kup: 0, ks: 0.04, shake: 0.08, punch: 0, part: 0.5, w: 1 },
  str3: { dmg: 18, kb: 300, kup: 0, ks: 0.12, shake: 0.3, punch: 0.03, part: 0.9, w: 2, poise: true, kdown: true },
  blink: { dmg: 22, kb: 210, kup: 0, ks: 0.09, shake: 0.18, punch: 0.02, part: 1.0, w: 2, poise: true },
  blinkEnd: { dmg: 26, kb: 330, kup: 0, ks: 0.11, shake: 0.24, punch: 0.03, part: 1.2, w: 2, poise: true, kdown: true },
  wave: { dmg: 32, kb: 380, kup: 60, ks: 0.08, shake: 0.2, punch: 0.02, part: 1.5, w: 2, poise: true, kdown: true },
  ult: { dmg: 60, kb: 260, kup: 120, ks: 0.15, shake: 0.5, punch: 0.06, part: 2.5, w: 3, poise: true, kdown: true },
};

// ---------- 玩家姿态轨道 ----------
const P_TR = {
  atk1: TR([
    [0,    { ln: -0.16, bb: 2, lfh: 0.5, lfk: -0.55, lbh: -0.55, lbk: -0.7, rsh: -2.1, rse: -0.5, wp: 3.9, lsh: 0.8, lse: 0.9, hd: -0.06 }],
    [0.30, { ln: 0.30, bb: -3, lfh: 0.85, lfk: -0.3, lbh: -0.7, lbk: -0.5, rsh: -4.5, rse: -0.15, wp: 1.35, lsh: -1.2, lse: -0.4 }],
    [0.60, { ln: 0.48, bb: -5, lfh: 0.55, lfk: -0.45, rsh: -5.1, rse: 0.3, wp: 0.55 }],
    [1,    {}],
  ]),
  atk2: TR([
    [0,    { ln: -0.08, bb: 1, rsh: 0.9, rse: 0.95, wp: 0.9, lfh: 0.45 }],
    [0.30, { ln: -0.32, bb: -4, rsh: 4.6, rse: -0.5, wp: 5.15, lfh: 0.6, lfk: -0.5, lsh: -0.9 }],
    [0.60, { ln: -0.2, bb: -3, rsh: 3.95, rse: -0.3, wp: 4.9 }],
    [1,    {}],
  ]),
  atk3: TR([
    [0,    { ln: -0.1, bb: 4, rsh: 2.6, rse: -0.2, wp: 3.3, lfh: 0.5, lfk: -0.7, lbh: -0.4, lbk: -0.8 }],
    [0.32, { ln: 0.15, bb: -2, rsh: -4.71, rse: 0, wp: 7.85, spin: 0.9, lfh: 1.0, lfk: -0.1, lbh: -0.9, lbk: -0.2 }],
    [0.75, { ln: 0.15, bb: -2, rsh: -4.71, rse: 0, wp: 7.85, spin: 6.16, lfh: 1.0, lfk: -0.1, lbh: -0.9, lbk: -0.2 }],
    [0.90, { rsh: -4.71, wp: 7.85, spin: 6.2832, ln: 0.1 }],
    [1,    { spin: 6.2832, rsh: -0.42, rse: -0.45, wp: 5.13 }],
  ]),
  heavyRel: TR([
    [0,    { ln: -0.14, rsh: -2.9, rse: -0.3, wp: 3.45, lsh: 2.7, lse: 0.4, lfh: 0.55, lfk: -0.7, lbh: -0.5, lbk: -0.75 }],
    [0.32, { ln: 0.5, bb: -7, rsh: -4.9, rse: -0.1, wp: 0.6, lsh: -1.4, lfh: 0.9, lfk: -0.5, lbh: -0.6, lbk: -0.4 }],
    [0.62, { ln: 0.55, bb: -8, rsh: -5.15, wp: 0.35 }],
    [1,    {}],
  ]),
  heavyTap: TR([
    [0,    { ln: -0.12, rsh: -2.6, rse: -0.4, wp: 3.2, lsh: 2.2, lse: 0.5, lfh: 0.5, lfk: -0.6 }],
    [0.32, { ln: 0.48, bb: -6, rsh: -4.8, rse: -0.1, wp: 0.7, lfh: 0.85, lfk: -0.45 }],
    [0.60, { ln: 0.5, rsh: -5.0, wp: 0.45 }],
    [1,    {}],
  ]),
  launcher: TR([
    [0,    { ln: 0.3, bb: 10, lfh: 0.7, lfk: -1.1, lbh: -0.4, lbk: -1.0, rsh: 1.3, rse: 1.1, wp: 1.1, lsh: -0.6 }],
    [0.14, { ln: 0.32, bb: 12, lfh: 0.7, lfk: -1.15, lbh: -0.4, lbk: -1.0, rsh: 1.35, rse: 1.15, wp: 1.0, lsh: -0.7 }],
    [0.45, { ln: -0.15, bb: -14, rsh: 2.2, rse: 0.15, wp: 2.35, lfh: 0.2, lfk: -0.2, lbh: -0.1, lbk: -0.2, lsh: -1.5 }],
    [0.72, { ln: -0.2, bb: -10, rsh: 2.5, rse: 0.05, wp: 2.6 }],
    [1,    {}],
  ]),
  air1: TR([
    [0,    { ln: -0.16, lfh: 0.95, lfk: -1.5, lbh: 0.35, lbk: -0.6, rsh: -2.1, rse: -0.5, wp: 3.9 }],
    [0.30, { ln: 0.3, lfh: 0.95, lfk: -1.5, lbh: 0.35, lbk: -0.6, rsh: -4.35, rse: -0.15, wp: 1.7 }],
    [0.60, { ln: 0.45, lfh: 0.95, lfk: -1.5, lbh: 0.35, lbk: -0.6, rsh: -4.85, wp: 0.95 }],
    [1,    { lfh: 0.95, lfk: -1.5, lbh: 0.35, lbk: -0.6 }],
  ]),
  air2: TR([
    [0,    { ln: -0.3, bb: 2, lfh: 0.8, lfk: -1.3, lbh: 0.3, lbk: -0.7, rsh: 3.5, rse: -0.3, wp: 4.0 }],
    [0.30, { ln: 0.6, bb: 2, lfh: 0.15, lfk: -0.15, lbh: -0.1, lbk: -0.15, rsh: -5.0, rse: -0.1, wp: 0.4 }],
    [0.65, { ln: 0.62, rsh: -5.1, wp: 0.3, lfh: 0.15, lfk: -0.15, lbh: -0.1, lbk: -0.15 }],
    [1,    { lfh: 0.15, lfk: -0.15, lbh: -0.1, lbk: -0.15 }],
  ]),
  dashatk: TR([
    [0,    { ln: 0.55, rsh: -2.4, rse: -0.6, wp: -2.9, lfh: 1.05, lfk: -0.35, lbh: -0.95, lbk: -0.85 }],
    [0.25, { ln: 0.42, rsh: -4.4, rse: -0.2, wp: 1.3, lfh: 0.9, lfk: -0.4, lbh: -0.8, lbk: -0.5 }],
    [0.60, { ln: 0.4, rsh: -4.9, wp: 0.7 }],
    [1,    {}],
  ]),
  hurt: TR([
    [0,    { ln: -0.5, bb: 2, hd: 0.3, rsh: 2.4, rse: 0.4, lsh: 2.2, lse: 0.3, lfh: 0.9, lfk: -0.9, lbh: -0.6, lbk: -0.4, wp: 2.8 }],
    [0.45, { ln: -0.3, bb: 1, rsh: 1.8, lsh: 1.6, wp: 2.0 }],
    [1,    {}],
  ]),
  // 千丝乱舞：旋身双臂展开
  strings: TR([
    [0,    { ln: -0.05, bb: 2, rsh: -4.71, rse: 0, wp: 7.85, lsh: 1.57, lse: 0, lfh: 0.4, lfk: -0.4, lbh: -0.4, lbk: -0.5 }],
    [0.5,  { ln: -0.05, bb: -2, rsh: -4.71, rse: 0, wp: 7.85, lsh: 1.57, lse: 0, spin: 3.14, lfh: 0.4, lfk: -0.4, lbh: -0.4, lbk: -0.5 }],
    [0.9,  { rsh: -4.71, rse: 0, wp: 7.85, lsh: 1.57, lse: 0, spin: 6.2832 }],
    [1,    { spin: 6.2832, rsh: -0.42, rse: -0.45, wp: 5.13 }],
  ]),
  // 影缝·三连：三次快速挥斩
  blink: TR([
    [0,    { ln: 0.1, bb: 2, rsh: -2.0, rse: -0.5, wp: 3.6 }],
    [0.2,  { ln: 0.3, bb: -3, rsh: -4.4, rse: -0.1, wp: 1.4 }],
    [0.42, { ln: -0.2, bb: -1, rsh: 0.9, rse: 0.9, wp: 0.9 }],
    [0.62, { ln: 0.35, bb: -3, rsh: -4.5, rse: -0.1, wp: 1.3 }],
    [0.85, { ln: -0.15, bb: -1, rsh: 4.6, rse: -0.4, wp: 5.1 }],
    [1,    {}],
  ]),
  // 裂空·断丝刃： overhead 大挥
  wave: TR([
    [0,    { ln: -0.15, bb: 2, rsh: -2.85, rse: -0.3, wp: 3.45, lsh: 2.7, lse: 0.4, lfh: 0.5, lfk: -0.6 }],
    [0.3,  { ln: 0.5, bb: -7, rsh: -4.9, rse: -0.1, wp: 0.6, lfh: 0.9, lfk: -0.5, lbh: -0.6, lbk: -0.4 }],
    [0.62, { ln: 0.52, bb: -8, rsh: -5.1, wp: 0.4 }],
    [1,    {}],
  ]),
  // 谢幕·万偶崩解：举刀向天 → 蓄 → 崩落
  ult: TR([
    [0,    { ln: -0.1, bb: 4, rsh: -2.9, rse: -0.3, wp: 3.3, lsh: 2.8, lse: 0.4, lfh: 0.4, lfk: -0.6, lbh: -0.4, lbk: -0.7 }],
    [0.3,  { ln: -0.2, bb: -6, rsh: -3.0, rse: -0.2, wp: 3.35 }],
    [0.42, { ln: 0.55, bb: -8, rsh: -5.0, rse: -0.1, wp: 0.5, lfh: 0.9, lfk: -0.5 }],
    [0.8,  { ln: 0.45, bb: -6, rsh: -4.6, rse: 0, wp: 0.8 }],
    [1,    {}],
  ]),
};
const P_DASH = makePose({ ln: 0.55, bb: 2, lfh: 1.05, lfk: -0.35, lbh: -0.95, lbk: -0.85, rsh: -2.6, rse: -0.6, wp: -2.9, lsh: 1.4, lse: 0.5, hd: 0.1 });
const P_LAND = makePose({ ln: 0.35, bb: 10, lfh: 0.65, lfk: -0.95, lbh: -0.5, lbk: -1.0, rsh: -1.2, rse: -0.2, wp: -0.6, lsh: 1.0, lse: 0.6 });
const P_CHARGE = makePose({ ln: -0.15, bb: -2, rsh: -2.9, rse: -0.35, wp: 3.5, lsh: 2.9, lse: 0.5, lfh: 0.55, lfk: -0.7, lbh: -0.5, lbk: -0.75 });
const P_JUMP = makePose({ ln: 0.12, lfh: 0.95, lfk: -1.55, lbh: 0.25, lbk: -0.7, lsh: -0.9, lse: -0.5, rsh: -1.6, rse: -0.3, wp: -2.6 });
const P_FALL = makePose({ ln: 0.05, lfh: 0.5, lfk: -0.55, lbh: -0.35, lbk: -0.5, lsh: 1.5, lse: 0.3, rsh: -1.5, rse: -0.3, wp: -2.2 });
const P_DEAD = makePose({ lie: 1, ln: 0.2, wp: -1.3, lfh: 0.4, lfk: -0.3, lbh: 0.2, lbk: -0.4, lsh: 2.6, lse: 0.3, rsh: -2.4, rse: -0.2 });

class Player {
  constructor(g) {
    this.g = g;
    this.type = 'player';
    this.pal = PAL.player;
    this.face = 'visor';
    this.weapon = 'katana';
    this.scale = 1;
    this.parts = { head: { on: true }, armF: { on: true }, armB: { on: true }, legF: { on: true }, legB: { on: true } };
    this.tumble = 0;
    this.scarf = [];
    for (let i = 0; i < 9; i++) this.scarf.push({ x: 0, y: 0 });
    this.reset();
  }
  reset() {
    this.x = WORLD_W / 2; this.y = GROUND_Y - FOOT;
    this.vx = 0; this.vy = 0; this.facing = 1;
    this.hp = 100; this.maxhp = 100;
    this.state = 'idle'; this.st = 0;
    this.onGround = true; this.coyote = 0;
    this.iframes = 0; this.hurtT = 0; this.landT = 0;
    this.atkName = null; this.atkT = 0; this.hitIds = new Set(); this.swingHit = false; this.trail = null;
    this.dashT = 0; this.dashCd = 0; this.ghostT = 0;
    this.chargeT = 0; this.chargeFullCued = false;
    this.runPhase = 0; this.animT = 0; this.deadT = 0;
    this.cds = { u: 0, o: 0, p: 0, h: 0 };
    this.skillName = null; this.skillT = 0;
    this.hitFlash = 0; this.weaponGlow = 0;
    this.pressedJ = false;
    this.sk = null; this.pose = IDLE;
    for (const p of this.scarf) { p.x = this.x; p.y = this.y - 30; }
  }
  get alive() { return this.hp > 0; }
  get airborneNow() { return !this.onGround; }

  canAct() { return this.state === 'idle' || this.state === 'run' || this.state === 'jump' || this.state === 'fall' || this.state === 'land'; }
  trySkill(name) {
    const def = SKD[name];
    if (this.cds[def.slot] > 0) { this.g.denySkill(def.slot, 'cd'); return; }
    if (this.g.energy < def.cost) { this.g.denySkill(def.slot, 'energy'); return; }
    this.g.energy -= def.cost;
    this.cds[def.slot] = def.cd;
    this.state = 'skill'; this.skillName = name; this.skillT = 0;
    this.atkName = null;
    this.vx *= 0.3;
    this.g.stats.skillUses[name] = (this.g.stats.skillUses[name] || 0) + 1;
    this.g.onSkillCast(name);
    if (name === 'strings') { this.iframes = Math.max(this.iframes, 0.5); }
    else if (name === 'blink') { this.iframes = Math.max(this.iframes, 0.8); }
    else if (name === 'wave') { this.iframes = Math.max(this.iframes, 0.4); }
    else if (name === 'ult') { this.iframes = Math.max(this.iframes, 2.0); }
  }
  inAttack() { return this.state === 'atk'; }
  atkDef() { return this.atkName ? ATK[this.atkName] : null; }

  press(a) { const t = this.g.press[a]; return t !== undefined && this.g.time - t < 0.17; }
  consume(a) { this.g.press[a] = undefined; }

  startAttack(name) {
    this.state = 'atk'; this.atkName = name; this.atkT = 0;
    this.hitIds = new Set(); this.swingHit = false; this.trail = null;
    const def = ATK[name];
    if (def.launch && this.onGround) { /* 挑空在 a0 起跳 */ }
    if (name === 'air2') this.vy = Math.max(this.vy, 60);
  }
  chainOrNew() {
    const d = this.atkDef();
    if (this.onGround && GROUND_CHAIN[this.atkName]) { this.startAttack(GROUND_CHAIN[this.atkName]); return true; }
    if (!this.onGround && this.atkName === 'air1') { this.startAttack('air2'); return true; }
    if (this.atkName === 'launcher') { // 挑空后直接衔接空中追击
      if (this.onGround) { this.vy = -600; this.onGround = false; }
      this.startAttack('air1');
      return true;
    }
    return false;
  }
  takeHit(dmg, dir) {
    if (this.iframes > 0 || this.state === 'dash' || !this.alive) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = 0.95;
    if (this.hp <= 0) { this.die(); return true; }
    this.state = 'hurt'; this.st = 0; this.hurtT = 0.27;
    this.atkName = null;
    this.vx = dir * 280; this.vy = Math.min(this.vy, -160);
    this.onGround = false;
    this.g.onPlayerHurt(dir);
    return true;
  }
  die() {
    this.state = 'dead'; this.st = 0; this.deadT = 0;
    this.vx = -this.facing * 180; this.vy = -300; this.onGround = false;
    this.g.onPlayerDeath();
  }
  onBlur() {
    if (this.state === 'heavyCharge') { this.state = 'idle'; this.chargeT = 0; }
  }

  update(dt) {
    const g = this.g, inp = g.keys;
    this.animT += dt;
    this.iframes -= dt; this.dashCd -= dt; this.hitFlash -= dt;
    this.st += dt;
    const wasAir = !this.onGround;

    // ---------- 死亡 ----------
    if (!this.alive) {
      this.deadT += dt;
      this.vy += GRAV * dt;
      this.x = clamp(this.x + this.vx * dt, 60, WORLD_W - 60);
      const gy = GROUND_Y - 12;
      if (this.y < gy) { this.y += this.vy * dt; if (this.y >= gy) { this.y = gy; this.vy = 0; this.vx *= 0.8; if (wasAir) { FX.dust(this.x, GROUND_Y, 8, 80); SFX.land(); } } }
      else this.y = gy;
      this.pose = P_DEAD;
      this.sk = computeFigure(this, this.pose);
      this.updateScarf(dt);
      return;
    }

    // ---------- 通用物理 ----------
    if (this.state !== 'dash') {
      this.vy += GRAV * (this.state === 'atk' && this.atkName === 'air2' ? 1.8 : 1) * dt;
    }
    const footH = (this.state === 'dead') ? 12 : FOOT;
    const gy = GROUND_Y - footH;
    if (this.y >= gy && this.vy >= 0) {
      if (wasAir) {
        const impact = this.vy;
        if (impact > 620 || (this.state === 'atk' && this.atkName === 'air2')) {
          const slam = this.state === 'atk' && this.atkName === 'air2';
          if (this.state !== 'skill') { // 技能不被落地打断
            this.state = 'land'; this.st = 0; this.landT = 0.1; this.atkName = null;
          }
          FX.dust(this.x, GROUND_Y, 10, 120); FX.ring(this.x, GROUND_Y - 4, 6, 40, 0.22, 'rgba(255,220,170,1)', 2);
          g.trauma += 0.14; SFX.land();
          if (slam) g.onSlamLand(this.x, this.facing);
        } else if (impact > 260) { FX.dust(this.x, GROUND_Y, 4, 60); SFX.land(); }
      }
      this.vy = 0;
      this.onGround = true;
      this.y = gy;
      this.coyote = 0.09;
    } else {
      this.onGround = false;
      this.coyote -= dt;
    }
    if (this.onGround) this.y = gy;

    // ---------- 状态逻辑 ----------
    const def = this.atkDef();
    if (this.state === 'atk' && def) {
      const prevT = this.atkT / def.dur;
      this.atkT += dt;
      const t = this.atkT / def.dur;
      // 出招瞬间：步进、音效、刀光
      if (prevT < def.a0 && t >= def.a0) {
        if (def.step) this.vx = this.facing * def.step * (this.onGround ? 1 : 0.55);
        if (def.launch) { this.vy = -590; this.onGround = false; }
        SFX.swing(def.w);
        this.trail = FX.trail(this.atkName === 'heavyRel' ? '#eaffff' : '#9fe8ff');
      }
      if (this.trail && this.sk && this.sk.blade) {
        if (t <= def.a1 + 0.06) {
          const bl = this.sk.blade;
          this.trail.pts.push({ bx: bl.bx, by: bl.by, tx: bl.tx, ty: bl.ty, t: 0.13 });
          if (this.trail.pts.length > 16) this.trail.pts.shift();
        } else this.trail = null;
      }
      if (t >= 1) { this.state = this.onGround ? 'idle' : 'fall'; this.atkName = null; }
    }
    else if (this.state === 'skill') {
      const def = SKD[this.skillName];
      const prevT = this.skillT / def.dur;
      this.skillT += dt;
      const t = this.skillT / def.dur;
      if (this.skillName === 'strings') {
        for (const tick of [0.14, 0.27, 0.42]) {
          if (prevT < tick && t >= tick) this.g.skillStringsTick(tick >= 0.4);
        }
      } else if (this.skillName === 'blink') {
        for (const tt of [0.16, 0.42, 0.68]) {
          if (prevT < tt && t >= tt) this.g.skillShadowBlink(tt >= 0.66);
        }
        this.iframes = Math.max(this.iframes, 0.12); // 全程无敌
      } else if (this.skillName === 'wave') {
        this.vx = approach(this.vx, 0, 1200 * dt);
        if (prevT < 0.3 && t >= 0.3) this.g.skillCrescent();
      } else if (this.skillName === 'ult') {
        this.vx = approach(this.vx, 0, 2000 * dt);
        if (prevT < 0.42 && t >= 0.42) this.g.ultBurst();
      }
      if (t >= 1) { this.state = this.onGround ? 'idle' : 'fall'; this.skillName = null; }
    }
    else if (this.state === 'heavyCharge') {
      this.chargeT += dt;
      this.weaponGlow = clamp(this.chargeT / 0.42, 0, 1);
      if (!this.chargeFullCued && this.chargeT >= 0.42) {
        this.chargeFullCued = true;
        SFX.chargeFull();
        FX.ring(this.x, this.y - 30, 8, 34, 0.25, '#bfe9ff', 2);
      }
      if (this.chargeT > 0.1 && chance(dt * 30)) {
        const a = rand(TAU), r = rand(26, 44);
        FX.ps.push({ t: 'spark', x: this.x + Math.cos(a) * r, y: this.y - 26 + Math.sin(a) * r, vx: -Math.cos(a) * 130, vy: -Math.sin(a) * 130, life: 0.16, max: 0.16, col: '#bfe9ff', w: 1.6 });
      }
      if (!g.keys.k) { // 松开 K → 释放
        this.state = 'atk';
        const full = this.chargeT >= 0.42;
        this.startAttack(full ? 'heavyRel' : 'heavyTap');
        this.chargeT = 0; this.chargeFullCued = false; this.weaponGlow = 0;
      }
    }
    else if (this.state === 'dash') {
      this.dashT += dt;
      this.vx = this.facing * 840 * (1 - this.dashT / 0.24 * 0.35);
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = 0.028; FX.ghost(this); }
      if (this.dashT >= 0.20) { this.state = this.onGround ? 'idle' : 'fall'; }
    }
    else if (this.state === 'hurt') {
      this.hurtT -= dt;
      if (this.hurtT <= 0 && this.onGround) this.state = 'idle';
      else if (this.hurtT <= 0) this.state = 'fall';
    }
    else if (this.state === 'land') {
      if (this.st >= 0.1) this.state = 'idle';
    }

    // ---------- 输入 ----------
    const moveDir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const actable = this.canAct();
    const chainableAtk = this.state === 'atk' && (() => {
      const d = this.atkDef(); if (!d) return false;
      const t = this.atkT / d.dur;
      return t >= d.a1 || (t >= d.a0 + 0.02 && this.swingHit);
    })();
    const charging = this.state === 'heavyCharge';

    // 面向（攻击前摇阶段允许转身 + 轻微辅助瞄准）
    if ((actable || (this.state === 'atk' && this.atkT / this.atkDef().dur < this.atkDef().a0 * 0.7))) {
      if (moveDir !== 0) this.facing = moveDir;
      else {
        const e = g.nearestEnemy(this.x, 190);
        if (e && Math.abs(e.y - this.y) < 90) this.facing = e.x >= this.x ? 1 : -1;
      }
    }

    if (actable) {
      // 移动
      const spd = 330;
      if (moveDir !== 0) {
        this.vx = approach(this.vx, moveDir * spd, 2900 * dt);
        if (this.onGround) { this.state = 'run'; this.runPhase += Math.abs(this.vx) * dt * 0.021; }
      } else {
        this.vx = approach(this.vx, 0, 2400 * dt);
        if (this.onGround && this.state === 'run') { this.state = 'idle'; }
      }
      // 跳跃（含输入缓冲 + 土狼时间）
      if (this.press('jump') && (this.onGround || this.coyote > 0)) {
        this.consume('jump');
        this.vy = -680; this.onGround = false; this.coyote = 0;
        this.state = 'jump';
        FX.dust(this.x, GROUND_Y, 4, 60); SFX.jump();
      }
      // 瞬步
      if (this.press('l') && this.dashCd <= 0) {
        this.consume('l');
        this.state = 'dash'; this.dashT = 0; this.dashCd = 0.34;
        this.iframes = Math.max(this.iframes, 0.26);
        if (moveDir !== 0) this.facing = moveDir;
        this.vx = this.facing * 840; this.vy = 0;
        SFX.dash();
        FX.dust(this.x, GROUND_Y + 2, 5, 70);
      }
      // 主攻击
      if (this.press('j')) {
        this.consume('j');
        this.startAttack(this.onGround ? 'atk1' : 'air1');
      }
      // 挑空斩
      else if (this.press('i')) {
        this.consume('i');
        if (this.onGround) this.startAttack('launcher');
        else { this.startAttack('launcher'); this.vy = Math.min(this.vy, -380); } // 空中也可升斩
      }
      // 蓄力（按住 K）
      else if (this.press('k') && this.onGround) {
        this.consume('k');
        this.state = 'heavyCharge'; this.chargeT = 0; this.chargeFullCued = false;
        this.vx = approach(this.vx, 0, 4000 * dt);
      }
      // 四大技能
      else if (this.press('u') || this.press('o') || this.press('p') || this.press('h')) {
        const name = this.press('u') ? 'strings' : this.press('o') ? 'blink' : this.press('p') ? 'wave' : 'ult';
        for (const k of ['u', 'o', 'p', 'h']) this.consume(k);
        this.trySkill(name);
      }
    }
    else if (chainableAtk) {
      if (this.press('j')) { if (this.chainOrNew()) this.consume('j'); } // 连段结束则保留缓冲，攻击收招后立即出下一招
      else if (this.press('k') && this.onGround && this.atkName !== 'air2') {
        this.consume('k');
        this.state = 'heavyCharge'; this.chargeT = 0; this.chargeFullCued = false;
      }
      else if (this.press('l') && this.dashCd <= 0 && this.swingHit) { // 命中取消瞬步
        this.consume('l');
        this.state = 'dash'; this.dashT = 0; this.dashCd = 0.34;
        this.iframes = Math.max(this.iframes, 0.26);
        if (moveDir !== 0) this.facing = moveDir;
        this.vx = this.facing * 840; this.vy = 0;
        SFX.dash(); FX.ghost(this);
      }
    }
    else if (charging) {
      const spd = 120;
      if (moveDir !== 0) this.vx = approach(this.vx, moveDir * spd, 1200 * dt);
      else this.vx = approach(this.vx, 0, 1600 * dt);
      if (this.press('l') && this.dashCd <= 0) { // 瞬步取消蓄力
        this.consume('l');
        this.state = 'dash'; this.dashT = 0; this.dashCd = 0.34;
        this.chargeT = 0; this.chargeFullCued = false; this.weaponGlow = 0;
        this.iframes = Math.max(this.iframes, 0.26);
        if (moveDir !== 0) this.facing = moveDir;
        this.vx = this.facing * 840; this.vy = 0;
        SFX.dash();
      }
      if (moveDir !== 0) this.facing = moveDir;
    }
    else if (this.state === 'dash') {
      if (this.press('j')) { // 瞬步攻击
        this.consume('j');
        this.startAttack('dashatk');
      }
    }
    else if (this.state === 'atk') {
      this.vx = approach(this.vx, 0, (this.onGround ? 1500 : 300) * dt);
      if (moveDir !== 0 && this.atkT / this.atkDef().dur < this.atkDef().a0) this.facing = moveDir;
    }

    // 变高跳（提前松开跳跃键）
    if (!g.keys.jump && this.vy < -450 && this.state === 'jump') this.vy = -450;

    // ---------- 位移 ----------
    if (this.state === 'dash') { /* vx 已定 */ }
    this.x = clamp(this.x + this.vx * dt, 60, WORLD_W - 60);
    if (!this.onGround) this.y += this.vy * dt;

    // ---------- 姿态 ----------
    this.pose = this.computePose();
    this.sk = computeFigure(this, this.pose);
    this.updateScarf(dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  computePose() {
    const t = this.animT;
    switch (this.state) {
      case 'run': {
        const ph = this.runPhase;
        return makePose({
          ln: 0.20, bb: -Math.abs(Math.cos(ph)) * 2.5,
          lfh: Math.sin(ph) * 0.75, lfk: -0.25 - Math.max(0, -Math.sin(ph)) * 0.9,
          lbh: Math.sin(ph + PI) * 0.75, lbk: -0.25 - Math.max(0, -Math.sin(ph + PI)) * 0.9,
          lsh: Math.sin(ph + PI) * 0.5 + 0.1, lse: 0.5,
          rsh: Math.sin(ph) * 0.45 - 0.3, rse: -0.4,
          wp: -1.0 + Math.sin(ph) * 0.15, hd: 0.05,
        });
      }
      case 'jump': return P_JUMP;
      case 'fall': return this.vy > 420 ? P_FALL : lerpPose(P_JUMP, P_FALL, smooth((this.vy + 100) / 500));
      case 'land': return P_LAND;
      case 'dash': return P_DASH;
      case 'hurt': return evalTrack(P_TR.hurt, 1 - this.hurtT / 0.27);
      case 'heavyCharge': {
        const j = Math.sin(t * 42) * 0.03 * clamp(this.chargeT / 0.42, 0, 1);
        const p = Object.assign({}, P_CHARGE);
        p.rsh += j; p.wp -= j * 2;
        return p;
      }
      case 'atk': return evalTrack(P_TR[this.atkName], this.atkT / this.atkDef().dur);
      case 'skill': return evalTrack(P_TR[this.skillName], this.skillT / SKD[this.skillName].dur);
      case 'dead': return P_DEAD;
      default: // idle
        return makePose({
          bb: Math.sin(t * 2.1) * 1.4,
          wp: -1.15 + Math.sin(t * 1.7) * 0.06,
          lsh: 0.30 + Math.sin(t * 2.1 + 1) * 0.04,
        });
    }
  }
  updateScarf(dt) {
    const anchor = this.sk && this.sk.neck ? this.sk.neck : [this.x, this.y - 30];
    const pts = this.scarf;
    pts[0].x = anchor[0] - this.facing * 4; pts[0].y = anchor[1] + 2;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1];
      // 目标位置：跟随前一点 + 重力 + 风（速度反向）
      const tx = q.x - this.facing * 7 - this.vx * 0.022 * i;
      const ty = q.y + 3.2 + Math.sin(this.animT * 6 + i) * 0.8 - this.vy * 0.012 * i;
      p.x += (tx - p.x) * Math.min(1, dt * 18);
      p.y += (ty - p.y) * Math.min(1, dt * 18);
    }
  }
  drawScarf(ctx) {
    const pts = this.scarf;
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const w = lerp(4.6, 1.4, i / pts.length);
      ctx.strokeStyle = i < 3 ? '#d8434f' : '#b23340';
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
  }
  render(ctx) {
    this.drawScarf(ctx);
    drawFigure(ctx, this);
  }
}
