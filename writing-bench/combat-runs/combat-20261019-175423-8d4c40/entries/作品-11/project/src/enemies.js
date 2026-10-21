// ============================================================
// enemies.js — 傀儡敌人：吊兵(近战) / 铁锤(重装) / 针偶(远程)
// 分段肢体：head / armF(持械臂) / armB / legF / legB
// ============================================================
let EID = 0;

const TYPES = {
  grunt: {
    name: '吊兵', hp: 55, scale: 1, speed: 132, face: 'stitch', weapon: 'saber',
    partHp: { head: 16, armF: 20, armB: 14, legF: 18, legB: 18 },
    slashDmg: 10, lungeDmg: 13, tackleDmg: 8,
  },
  heavy: {
    name: '铁锤', hp: 150, scale: 1.34, speed: 58, face: 'mask', weapon: 'hammer',
    partHp: { head: 28, armF: 34, armB: 24, legF: 30, legB: 30 },
    smashDmg: 18, shockDmg: 11, slamDmg: 12, poise: true,
  },
  thrower: {
    name: '针偶', hp: 42, scale: 0.92, speed: 118, face: 'eye', weapon: 'needle',
    partHp: { head: 14, armF: 16, armB: 12, legF: 16, legB: 16 },
    needleDmg: 6, kickDmg: 7,
  },
};
const PART_MULT = { grunt: 1, heavy: 1, thrower: 1 };

// ---------- 敌人姿态轨道 ----------
const E_TR = {
  g_wind: TR([[0, {}], [1, { ln: -0.2, bb: 2, rsh: -2.0, rse: -0.6, wp: 3.8, lfh: 0.55, lfk: -0.6, lbh: -0.5, lbk: -0.7, lsh: 0.9, lse: 0.8 }]]),
  g_strike: TR([
    [0,    { ln: -0.2, rsh: -2.0, rse: -0.6, wp: 3.8, lfh: 0.55, lfk: -0.6, lbh: -0.5, lbk: -0.7 }],
    [0.35, { ln: 0.38, bb: -3, rsh: -4.35, rse: -0.1, wp: 1.25, lfh: 0.9, lfk: -0.35, lbh: -0.7, lbk: -0.5 }],
    [0.70, { ln: 0.45, rsh: -4.8, wp: 0.7 }],
    [1,    {}],
  ]),
  g_leap: makePose({ ln: 0.7, bb: 0, rsh: -4.3, rse: -0.2, wp: 1.3, lfh: -0.8, lfk: -0.3, lbh: -1.0, lbk: -0.2, lsh: 1.6, lse: 0.4 }),
  g_tackle: makePose({ ln: 0.75, bb: 3, lsh: -1.2, lse: -0.8, rsh: -1.2, rse: -0.9, wp: -2.4, lfh: 0.9, lfk: -0.5, lbh: -0.8, lbk: -0.4 }),
  h_wind: TR([[0, {}], [1, { ln: -0.15, bb: 2, rsh: -2.85, rse: -0.2, wp: 3.35, lsh: 2.7, lse: 0.4, lfh: 0.6, lfk: -0.7, lbh: -0.5, lbk: -0.8 }]]),
  h_strike: TR([
    [0,    { ln: -0.15, rsh: -2.85, rse: -0.2, wp: 3.35, lsh: 2.7, lse: 0.4, lfh: 0.6, lfk: -0.7, lbh: -0.5, lbk: -0.8 }],
    [0.35, { ln: 0.55, bb: -8, rsh: -5.05, rse: -0.05, wp: 0.5, lsh: -1.6, lfh: 0.95, lfk: -0.45, lbh: -0.7, lbk: -0.4 }],
    [0.70, { ln: 0.6, bb: -9, rsh: -5.2, wp: 0.35 }],
    [1,    {}],
  ]),
  h_slam: TR([
    [0,    { ln: -0.1, rsh: -1.4, rse: -0.8, wp: -2.2 }],
    [0.4,  { ln: 0.85, bb: 6, rsh: -1.0, rse: -1.2, wp: -2.6, lfh: 1.1, lfk: -0.4, lbh: -0.9, lbk: -0.3 }],
    [1,    {}],
  ]),
  t_wind: TR([[0, {}], [1, { ln: -0.15, bb: 2, rsh: -2.5, rse: -0.9, wp: 3.4, lfh: 0.5, lfk: -0.55, lbh: -0.5, lbk: -0.65, lsh: 0.7, lse: 0.7 }]]),
  t_strike: TR([
    [0,    { ln: -0.15, rsh: -2.5, rse: -0.9, wp: 3.4 }],
    [0.35, { ln: 0.3, bb: -2, rsh: 1.35, rse: 0.1, wp: 1.2, lfh: 0.8, lfk: -0.35 }],
    [1,    {}],
  ]),
  t_kick: TR([
    [0,    { ln: -0.1, lfh: 1.2, lfk: -1.6 }],
    [0.35, { ln: 0.35, bb: -2, lfh: 1.55, lfk: -0.1, lbh: -0.4, lbk: -0.5 }],
    [1,    {}],
  ]),
};
const E_STAGGER = makePose({ ln: -0.45, bb: 2, hd: -0.2, lsh: 2.2, lse: 0.3, rsh: -2.4, rse: -0.4, wp: 3.6, lfh: 0.7, lfk: -0.5, lbh: -0.6, lbk: -0.7 });
const E_LAUNCHED = makePose({ ln: -0.3, lfh: 0.9, lfk: -1.2, lbh: 0.3, lbk: -0.8, lsh: 2.2, lse: 0.3, rsh: -2.0, rse: -0.3, wp: 3.8 });
const E_DOWN = makePose({ lie: 1, ln: 0.15, lfh: 0.4, lfk: -0.3, lbh: 0.2, lbk: -0.4, lsh: 2.8, lse: 0.2, rsh: -2.6, rse: -0.2, wp: 3.9 });
const E_CRAWL = makePose({ lie: 0.55, ln: 0.5, lfh: 1.2, lfk: -0.4, lbh: 0.9, lbk: -0.9, lsh: 1.2, lse: 0.4, rsh: 0.8, rse: 0.6, wp: -0.5 });
const E_FLINCH = makePose({ ln: -0.18, bb: 1 });

class Enemy {
  constructor(g, type, x) {
    const cfg = TYPES[type];
    this.id = ++EID;
    this.g = g;
    this.type = type; this.cfg = cfg;
    this.scale = cfg.scale;
    this.pal = PAL[type];
    this.face = cfg.face;
    this.weapon = cfg.weapon;
    this.hp = cfg.hp; this.maxhp = cfg.hp;
    this.parts = {};
    for (const k in cfg.partHp) this.parts[k] = { on: true, hp: cfg.partHp[k] * PART_MULT[type] };
    this.x = x; this.y = -90; this.vx = 0; this.vy = 0;
    this.facing = chance(0.5) ? 1 : -1;
    this.state = 'descend';
    this.st = 0; this.animT = rand(10);
    this.onGround = false; this.airborne = true;
    this.cool = rand(0.4, 1.0); this.hopCd = 0; this.leapCd = rand(1, 2);
    this.hitFlash = 0; this.tumble = 0; this.juggle = 0;
    this.weaponLost = false; this.crawl = false; this.berserk = false; this.panicT = 0;
    this.slammed = false; this.stringCut = false;
    this.swingDone = false; this.thrown = 0;
    this.atkKind = null; this.windupT = 0;
    this.targetY = GROUND_Y - FOOT * this.scale;
    this.sk = null; this.pose = IDLE;
    this.dead = false; this.trail = null;
    this.wanderSeed = rand(100);
  }
  get alive() { return !this.dead && this.hp > 0; }
  get legsOn() { return (this.parts.legF.on ? 1 : 0) + (this.parts.legB.on ? 1 : 0); }
  footHeight() {
    const s = this.scale;
    if (this.state === 'down' || this.state === 'getup' && this.st < 0.25) return 12 * s;
    if (this.crawl) return 26 * s;
    return FOOT * s;
  }
  // ---------------- 受击 ----------------
  hitReact(o) {
    // o: {dir, def, dmg, launch, slam}
    const heavy = !!this.cfg.poise;
    this.juggle = this.airborne ? this.juggle + 1 : 0;
    if (o.launch) {
      this.state = 'launched'; this.st = 0; this.airborne = true; this.onGround = false;
      this.vy = -o.launch * (heavy ? 0.78 : 1);
      this.vx = o.dir * o.def.kb * 0.45;
      this.tumble = rand(-6, 6);
      this.juggle = 0;
      return;
    }
    if (o.slam && this.airborne) {
      this.slammed = true;
      this.vy = Math.max(this.vy, 780);
      this.vx = o.dir * 60;
      return;
    }
    if (this.airborne) { // 空中追击浮空
      this.vy = Math.min(this.vy, -210 - rand(60));
      this.vx = o.dir * o.def.kb * 0.5;
      this.state = 'launched';
      return;
    }
    const poiseBreak = !heavy || o.def.poise;
    if (!poiseBreak) { // 铁锤对轻击只闪一下
      this.vx += o.dir * o.def.kb * 0.3;
      if (this.state === 'chase') { this.state = 'flinch'; this.st = 0; }
      return;
    }
    this.vx = o.dir * o.def.kb;
    if (o.def.kdown || o.dmg >= 20) { this.knockdown(heavy ? 1.25 : 0.95); }
    else { this.state = 'stagger'; this.st = 0; this.staggerT = 0.17 + (o.def.w || 1) * 0.05; }
  }
  knockdown(t) { this.state = 'down'; this.st = 0; this.downT = t; this.airborne = false; this.onGround = true; }
  breakPart(kind, dir) {
    const part = this.parts[kind];
    if (!part || !part.on) return false;
    part.on = false;
    this.g.stats.limbs++;
    this.g.gainEnergy(4);
    SFX.breakW();
    // 找到肢体位置喷残骸
    const c = this.sk && this.sk.circles.find(c => c.part === kind);
    const px = c ? c.x : this.x, py = c ? c.y : this.y - 20;
    FX.chips(px, py, 12, null, 300);
    FX.flash(px, py, 12, 0.1, '#ffe9c0');
    FX.ring(px, py, 4, 26, 0.2, '#ffd98a', 2);
    const vel = () => [dir * rand(120, 320) + rand(-80, 80), rand(-360, -140)];
    let v = vel();
    FX.gib(px, py, kind, this, v[0], v[1]);
    if (kind === 'armF' && this.weapon && !this.weaponLost) {
      this.weaponLost = true;
      v = vel();
      FX.weaponGib(px + 8, py + 4, this.weapon, this.pal, this.scale, v[0] * 1.2, v[1] - 120);
    }
    this.g.freeze = Math.max(this.g.freeze, 0.05);
    this.g.trauma = Math.min(1, this.g.trauma + 0.12);
    this.hp -= 8; // 断肢重创
    // 行为影响
    if (kind === 'head') {
      if (this.type === 'heavy') { this.berserk = true; }
      else if (this.state !== 'panic' && this.alive) { this.state = 'panic'; this.st = 0; this.panicT = 2.3; }
    } else if (kind === 'armF') {
      if (this.type === 'thrower' && this.state !== 'panic') { this.state = 'flee'; this.st = 0; }
    } else if (kind === 'legF' || kind === 'legB') {
      this.crawl = this.legsOn < 2;
    }
    if (this.hp <= 0 && !this.dead) this.die(dir);
    return true;
  }
  die(dir) {
    if (this.dead) return;
    this.dead = true; this.hp = 0;
    const g = this.g;
    g.stats.kills++;
    g.gainEnergy(8);
    SFX.kill();
    g.freeze = Math.max(g.freeze, 0.09);
    g.slow = 0.13; g.slowScale = 0.3;
    g.trauma = Math.min(1, g.trauma + 0.28);
    g.punch = Math.max(g.punch, 0.045);
    const cx = this.sk ? this.sk.chest[0] : this.x, cy = this.sk ? this.sk.chest[1] : this.y - 30;
    FX.flash(cx, cy, 26, 0.12, '#fff2d8');
    FX.lines(cx, cy, dir, 8);
    FX.ring(cx, cy, 6, 60, 0.3, '#ffd98a', 3);
    FX.chips(cx, cy, 18, null, 360);
    FX.dust(this.x, GROUND_Y, 6, 90);
    for (const k of ['head', 'armF', 'armB', 'legF', 'legB']) {
      if (!this.parts[k].on) continue;
      FX.gib(cx + rand(-6, 6), cy + rand(-6, 6), k, this, dir * rand(140, 380) + rand(-100, 100), rand(-420, -120));
    }
    if (this.weapon && !this.weaponLost) FX.weaponGib(cx, cy + 6, this.weapon, this.pal, this.scale, dir * rand(100, 260), rand(-380, -160));
    for (let i = 0; i < 2; i++) FX.gib(cx, cy, 'chunk', this, dir * rand(80, 300) + rand(-120, 120), rand(-360, -80));
    g.onEnemyDeath(this);
  }
  // ---------------- 主循环 ----------------
  update(dt) {
    if (this.dead) return;
    const g = this.g, p = g.player;
    this.animT += dt; this.st += dt;
    this.hitFlash -= dt;
    this.cool -= dt; this.hopCd -= dt; this.leapCd -= dt;
    const dx = p.x - this.x, adx = Math.abs(dx), dirp = sign(dx);
    const alive = p.alive;

    // ---- 下落着地判定 ----
    const footH = this.footHeight();
    const gy = GROUND_Y - footH;
    if (this.state === 'descend') {
      // 提线降落
      const speed = this.stringCut ? 900 : 640;
      this.y += speed * dt;
      if (!this.stringCut) this.x += Math.sin(this.animT * 3 + this.wanderSeed) * 14 * dt * 10;
      if (this.y >= gy) {
        this.y = gy; this.vy = 0; this.onGround = true; this.airborne = false;
        FX.dust(this.x, GROUND_Y, 5, 70);
        if (this.stringCut) { this.state = 'stagger'; this.st = 0; this.staggerT = 0.55; SFX.clack(true); }
        else { this.state = 'chase'; SFX.clack(true); }
        FX.puffString(this.x, this.y - 60);
      }
      this.pose = makePose({ ln: Math.sin(this.animT * 3 + this.wanderSeed) * 0.1, wp: -1.2, bb: 0 });
      this.facing = dirp;
      this.sk = computeFigure(this, this.pose);
      return;
    }
    // 重力
    if (!this.onGround) {
      this.vy += GRAV * dt;
      this.y += this.vy * dt;
      if (this.y >= gy && this.vy >= 0) {
        this.y = gy; this.vy = 0; this.onGround = true; this.airborne = false;
        this.tumble = 0;
        FX.dust(this.x, GROUND_Y, 6, 90);
        SFX.land();
        if (this.slammed) {
          this.slammed = false;
          g.onSlamLand(this.x, sign(this.vx || 1), this);
          this.knockdown(1.0);
          this.hp -= 10;
          if (this.hp <= 0) { this.die(sign(this.vx || 1)); return; }
        } else if (this.state === 'launched') {
          this.knockdown(this.cfg.poise ? 1.15 : 0.9);
        }
      }
    } else {
      this.y = gy;
      this.airborne = false;
    }

    // ---- 状态机 ----
    switch (this.state) {
      case 'stagger':
        if (this.st >= (this.staggerT || 0.2)) this.state = 'chase';
        this.vx = approach(this.vx, 0, 800 * dt);
        break;
      case 'flinch':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.st >= 0.14) this.state = 'chase';
        break;
      case 'launched':
        this.vx = approach(this.vx, 0, 240 * dt);
        break;
      case 'down':
        this.vx = approach(this.vx, 0, 1000 * dt);
        if (this.st >= this.downT) { this.state = 'getup'; this.st = 0; }
        break;
      case 'getup':
        if (this.st >= 0.5) { this.state = 'chase'; this.cool = rand(0.3, 0.8); }
        break;
      case 'panic': {
        // 断头恐慌：乱窜后倒下
        this.panicT -= dt;
        this.vx = Math.sin(this.animT * 7 + this.wanderSeed) * 190;
        this.facing = sign(this.vx) || this.facing;
        this.x = clamp(this.x + this.vx * dt, 60, WORLD_W - 60);
        if (this.panicT <= 0) { this.die(dirp); return; }
        break;
      }
      case 'flee': {
        // 断臂针偶逃窜
        this.facing = -dirp;
        this.vx = approach(this.vx, -dirp * this.cfg.speed * 1.2, 1400 * dt);
        if ((adx < 90 || this.x <= 90 || this.x >= WORLD_W - 90) && this.cool <= 0) {
          this.state = 'kickWind'; this.st = 0; this.swingDone = false;
          SFX.clack(false);
        }
        break;
      }
      case 'chase': {
        if (!alive) { this.vx = approach(this.vx, 0, 600 * dt); break; }
        this.facing = dirp;
        const spd = this.cfg.speed * (this.berserk ? 1.5 : 1) * (this.crawl ? 0.32 : 1);
        let want = 0;
        if (this.type === 'grunt') {
          const stopAt = this.weaponLost ? 46 : 44;
          if (adx > stopAt) want = dirp * spd; else want = 0;
          if (this.cool <= 0 && adx < (this.weaponLost ? 66 : 62)) {
            this.state = 'windup'; this.st = 0;
            this.atkKind = this.weaponLost ? 'tackle' : 'slash';
            this.windupT = this.weaponLost ? 0.55 : (this.crawl ? 0.6 : 0.45);
            this.swingDone = false;
            SFX.clack(false);
          } else if (!this.crawl && !this.weaponLost && this.cool <= 0 && this.leapCd <= 0 && adx > 110 && adx < 330 && this.onGround && chance(dt * 1.6)) {
            this.state = 'leapWind'; this.st = 0; this.swingDone = false;
            SFX.clack(false);
          }
        } else if (this.type === 'heavy') {
          if (adx > 76) want = dirp * spd; else want = 0;
          if (this.cool <= 0 && adx < 105) {
            this.state = 'windup'; this.st = 0;
            this.atkKind = this.weaponLost ? 'slam' : 'smash';
            this.windupT = this.berserk ? 0.6 : 0.85;
            this.swingDone = false;
            SFX.clack(true);
          }
        } else { // thrower
          if (adx < 205) want = -dirp * spd * 1.1;
          else if (adx > 440) want = dirp * spd;
          else want = Math.sin(this.animT * 1.3 + this.wanderSeed) * spd * 0.4;
          if (adx < 215 && this.hopCd <= 0 && this.onGround && chance(dt * (adx < 140 ? 7 : 3))) { // 后跳拉开距离（靠墙则向开阔侧跳）
            this.hopCd = 0.9;
            const cornered = this.x < 160 || this.x > WORLD_W - 160;
            const away = cornered ? dirp : -dirp;
            this.vy = -300; this.onGround = false; this.airborne = true;
            this.vx = away * 250;
          }
          if (this.cool <= 0 && adx < 92 && this.onGround) { // 被贴身：踢击（避免死角僵局）
            this.state = 'kickWind'; this.st = 0;
            this.atkKind = 'kick'; this.swingDone = false;
            this.cool = rand(1.2, 2.0);
            SFX.clack(false);
          }
          if (this.cool <= 0 && adx > 190 && adx < 470 && !this.weaponLost) {
            this.state = 'windup'; this.st = 0;
            this.atkKind = 'throw'; this.windupT = 0.5; this.thrown = 0;
            this.swingDone = false;
            SFX.clack(false);
          }
        }
        this.vx = approach(this.vx, want, 1600 * dt);
        break;
      }
      case 'windup': {
        this.vx = approach(this.vx, 0, 1400 * dt);
        if (this.st >= this.windupT * 0.55 && !this._cue) { this._cue = true; FX.ring(this.x, this.y - 34 * this.scale, 4, 20, 0.22, 'rgba(255,80,70,1)', 2); }
        if (this.st >= this.windupT) {
          this._cue = false;
          this.state = 'strike'; this.st = 0;
          if (this.atkKind === 'tackle') this.vx = this.facing * 360;
          if (this.atkKind === 'slash') this.vx = this.facing * 260;
          if (this.atkKind === 'slam') this.vx = this.facing * 300;
          if (this.atkKind === 'leap') { this.vx = this.facing * 380; this.vy = -430; this.onGround = false; this.airborne = true; }
        }
        break;
      }
      case 'strike': {
        const dur = this.strikeDur();
        // 攻击刀光（提升前兆可读性）
        if ((this.atkKind === 'slash' || this.atkKind === 'leap' || this.atkKind === 'smash') && this.sk && this.sk.blade) {
          const kt = this.st / dur;
          if (kt > 0.08 && kt < 0.62) {
            if (!this.trail) this.trail = FX.trail('#ff9b6a');
            const bl = this.sk.blade;
            this.trail.pts.push({ bx: bl.bx, by: bl.by, tx: bl.tx, ty: bl.ty, t: 0.11 });
            if (this.trail.pts.length > 12) this.trail.pts.shift();
          }
        }
        if (this.atkKind === 'throw' && !this.swingDone && this.st >= dur * 0.3) {
          this.swingDone = true;
          this.fireNeedle();
        }
        if ((this.atkKind === 'slash' || this.atkKind === 'leap') && !this.swingDone && this.st >= dur * 0.22) {
          this.tryWeaponHit(this.cfg.slashDmg, 10);
        }
        if (this.atkKind === 'tackle' && !this.swingDone && this.st >= dur * 0.2) {
          this.tryBodyHit(this.cfg.tackleDmg, 12);
        }
        if (this.atkKind === 'smash') {
          if (!this.swingDone && this.st >= dur * 0.25) {
            this.swingDone = true;
            this.tryHammerHit(this.cfg.smashDmg, 16);
            g.spawnShock(this.x + this.facing * 40, this.facing);
          }
        }
        if (this.atkKind === 'slam' && !this.swingDone && this.st >= dur * 0.25) {
          this.tryBodyHit(this.cfg.slamDmg, 14);
        }
        if (this.atkKind === 'kick' && !this.swingDone && this.st >= dur * 0.25) {
          this.tryBodyHit(this.cfg.kickDmg, 10);
        }
        if (this.atkKind === 'throw') this.vx = approach(this.vx, 0, 800 * dt);
        if (this.st >= dur) {
          this.state = 'recover'; this.st = 0;
          this.cool = this.berserk ? rand(0.7, 1.2) : (this.type === 'heavy' ? rand(1.4, 2.2) : rand(0.8, 1.5));
        }
        break;
      }
      case 'recover':
        this.vx = approach(this.vx, 0, 1200 * dt);
        if (this.st >= (this.type === 'heavy' ? 0.55 : 0.4)) this.state = 'chase';
        break;
      case 'leapWind':
        this.vx = approach(this.vx, 0, 1200 * dt);
        if (this.st >= 0.38) {
          this.state = 'strike'; this.st = 0;
          this.atkKind = 'leap';
          this.vx = this.facing * 400; this.vy = -440;
          this.onGround = false; this.airborne = true;
        }
        break;
      case 'kickWind':
        this.vx = approach(this.vx, 0, 1200 * dt);
        if (this.st >= 0.5) { this.state = 'strike'; this.st = 0; this.atkKind = 'kick'; this.swingDone = false; }
        break;
      default:
        this.state = 'chase';
    }

    this.x = clamp(this.x + this.vx * dt, 50, WORLD_W - 50);
    if (!this.onGround) this.y += 0; // y 已在重力段处理

    this.pose = this.computePose();
    this.sk = computeFigure(this, this.pose);
  }
  strikeDur() {
    switch (this.atkKind) {
      case 'slash': return 0.34;
      case 'leap': return 0.6;
      case 'tackle': return 0.34;
      case 'smash': return 0.4;
      case 'slam': return 0.4;
      case 'throw': return 0.42;
      case 'kick': return 0.36;
      default: return 0.4;
    }
  }
  fireNeedle() {
    const g = this.g, p = g.player;
    if (!this.sk || !this.sk.hand) return;
    const h = this.sk.hand;
    const tx = p.x, ty = p.y - 26;
    const d = Math.max(1, Math.hypot(tx - h[0], ty - h[1]));
    const spd = 470;
    g.needles.push({ x: h[0], y: h[1], vx: (tx - h[0]) / d * spd, vy: (ty - h[1]) / d * spd, life: 2.2, dead: false });
    SFX.needle();
    FX.spark(h[0], h[1], 3, this.facing, 0.4, '#ffe9b0', 160);
  }
  // 对玩家判定
  tryWeaponHit(dmg, reach) {
    const g = this.g, p = g.player;
    if (!this.sk || !this.sk.blade) return;
    if (this.tryHitBlade(this.sk.blade, dmg)) return;
  }
  tryHammerHit(dmg, r) {
    const g = this.g, p = g.player;
    if (!this.sk || !this.sk.blade) return;
    const bl = this.sk.blade;
    const hx = bl.tx, hy = bl.ty;
    // 锤头圆
    for (const c of p.sk.circles) {
      const d2v = dist2(hx, hy, c.x, c.y);
      const rr = r + c.r;
      if (d2v < rr * rr) { this.dealHit(dmg, sign(p.x - this.x) || this.facing); return; }
    }
  }
  tryBodyHit(dmg, r) {
    const g = this.g, p = g.player;
    const cx = this.x + this.facing * r * 0.8, cy = this.y - 30 * this.scale;
    for (const c of p.sk.circles) {
      const rr = r + c.r;
      if (dist2(cx, cy, c.x, c.y) < rr * rr) { this.dealHit(dmg, this.facing); return; }
    }
  }
  tryHitBlade(bl, dmg) {
    const p = this.g.player;
    for (const c of p.sk.circles) {
      if (segHit(bl.bx, bl.by, bl.tx, bl.ty, c.x, c.y, c.r + 3)) {
        this.dealHit(dmg, this.facing);
        return true;
      }
    }
    return false;
  }
  dealHit(dmg, dir) {
    const p = this.g.player;
    if (p.takeHit(dmg, dir)) return;
    // 挥空/无敌：小特效
  }
  // ---------------- 姿态 ----------------
  computePose() {
    const t = this.animT;
    const base = (o) => makePose(Object.assign({ wp: this.weaponLost ? 0 : -1.15 }, o));
    switch (this.state) {
      case 'descend': return this.pose;
      case 'chase': case 'flee': {
        const spd = Math.abs(this.vx);
        if (spd < 18) return base({ bb: Math.sin(t * 2) * 1.2, wp: this.weaponLost ? -1.15 : -1.0 });
        const ph = this.animT * (6 + spd * 0.02);
        return base({
          ln: 0.18 + (this.berserk ? 0.1 : 0), bb: -Math.abs(Math.cos(ph)) * 2.2,
          lfh: Math.sin(ph) * 0.7, lfk: -0.25 - Math.max(0, -Math.sin(ph)) * 0.85,
          lbh: Math.sin(ph + PI) * 0.7, lbk: -0.25 - Math.max(0, -Math.sin(ph + PI)) * 0.85,
          lsh: Math.sin(ph + PI) * 0.45 + 0.1, lse: 0.5,
          rsh: Math.sin(ph) * 0.4 - 0.35, rse: -0.4,
          wp: -1.0 + Math.sin(ph) * 0.12,
        });
      }
      case 'stagger': return E_STAGGER;
      case 'flinch': return E_FLINCH;
      case 'launched': return E_LAUNCHED;
      case 'down': return E_DOWN;
      case 'getup': return lerpPose(E_DOWN, IDLE, smooth(this.st / 0.5));
      case 'panic': return base({
        ln: -0.2 + Math.sin(t * 9) * 0.15, bb: Math.sin(t * 11) * 2,
        lsh: 2.6, lse: 0.5, rsh: 2.4, rse: 0.5, wp: -2.2,
        lfh: 0.5, lfk: -0.6, lbh: -0.5, lbk: -0.6,
      });
      case 'windup': {
        const k = smooth(this.st / this.windupT);
        const track = this.atkKind === 'slash' ? E_TR.g_wind : this.atkKind === 'tackle' ? null :
                      this.atkKind === 'smash' ? E_TR.h_wind : this.atkKind === 'slam' ? E_TR.h_slam :
                      this.atkKind === 'throw' ? E_TR.t_wind : E_TR.g_wind;
        if (this.atkKind === 'tackle') return E_TR.g_tackle;
        return evalTrack(track, k);
      }
      case 'leapWind': return evalTrack(E_TR.g_wind, smooth(this.st / 0.38));
      case 'kickWind': return evalTrack(E_TR.t_kick, smooth(this.st / 0.5) * 0.5);
      case 'strike': {
        const k = this.st / this.strikeDur();
        switch (this.atkKind) {
          case 'slash': return evalTrack(E_TR.g_strike, k);
          case 'leap': return E_TR.g_leap;
          case 'tackle': return E_TR.g_tackle;
          case 'smash': return evalTrack(E_TR.h_strike, k);
          case 'slam': return evalTrack(E_TR.h_slam, 0.4 + k * 0.5);
          case 'throw': return evalTrack(E_TR.t_strike, k);
          case 'kick': return evalTrack(E_TR.t_kick, 0.5 + k * 0.5);
        }
        return IDLE;
      }
      case 'recover': return base({ ln: 0.2, bb: -1 });
      default: return IDLE;
    }
  }
  render(ctx) {
    // 提线
    if (this.state === 'descend' && !this.stringCut && this.sk) {
      ctx.strokeStyle = 'rgba(220,215,200,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x + 6, this.y - 260);
      ctx.quadraticCurveTo(this.x + 10, this.y - 140, this.sk.head ? this.sk.head.x : this.x, this.sk.head ? this.sk.head.y - this.sk.head.r : this.y - 40);
      ctx.stroke();
    }
    // 铁锤蓄力红光（可观察前兆）
    if (this.state === 'windup' || this.state === 'leapWind' || this.state === 'kickWind') {
      const k = clamp(this.st / this.windupT, 0, 1);
      const pulse = 0.16 + 0.14 * Math.sin(this.animT * 18) + k * 0.12;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,60,50,${pulse})`;
      ctx.beginPath(); ctx.arc(this.sk ? this.sk.chest[0] : this.x, this.sk ? this.sk.chest[1] : this.y - 30, 40 * this.scale, 0, TAU); ctx.fill();
      ctx.restore();
      // 头顶红色警示
      const hy = (this.sk && this.sk.head ? this.sk.head.y : this.y - 60) - 22 * this.scale - Math.sin(this.animT * 10) * 2;
      const hx = this.sk && this.sk.head ? this.sk.head.x : this.x;
      ctx.fillStyle = 'rgba(255,70,60,0.95)';
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy - 9); ctx.lineTo(hx + 6, hy - 9); ctx.lineTo(hx, hy);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(hx - 2, hy + 2, 4, 8);
    }
    if (this.berserk) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,60,50,${0.1 + 0.06 * Math.sin(this.animT * 12)})`;
      ctx.beginPath(); ctx.arc(this.x, this.y - 34 * this.scale, 44 * this.scale, 0, TAU); ctx.fill();
      ctx.restore();
    }
    drawFigure(ctx, this);
    // 血条（受击后短暂显示）
    if (this.hitFlash > -1.2 && this.alive && this.hp < this.maxhp) {
      const w = 40 * this.scale, hx = this.x - w / 2, hy = (this.sk && this.sk.head ? this.sk.head.y : this.y - 60) - 30 * this.scale;
      const a = clamp((1.2 + this.hitFlash) / 1.2, 0, 1);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = 'rgba(10,8,12,0.7)';
      ctx.fillRect(hx, hy, w, 4);
      ctx.fillStyle = this.type === 'heavy' ? '#ffb36a' : '#e0524d';
      ctx.fillRect(hx + 1, hy + 1, (w - 2) * clamp(this.hp / this.maxhp, 0, 1), 2);
      ctx.globalAlpha = 1;
    }
  }
}
