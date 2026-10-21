'use strict';
/* ============================================================
   Player runtime
   ============================================================ */
const GRAV = 2150, MAX_FALL = 980;

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.maxHp = 120; this.hp = 120;
    this.onGround = true;
    this.state = 'idle';
    this.act = null;
    this.actT = 0;
    this.queued = null;
    this.buffer = null; this.bufferT = 0;
    this.jumpBuf = 0; this.coyote = 0;
    this.jumps = 0; this.airDashes = 2;
    this.dashCd = 0;
    this.invuln = 0; this.hurtT = 0;
    this.parryT = 0; this.parryCd = 0; this.parrySuccess = 0;
    this.charge = 0; this.charging = false;
    this.combo = 0; this.comboT = 0;
    this.slashTrail = [];
    this.ribbon = new Ribbon(12, 86, '#e8324f', '#4a0714');
    this.bladeGlow = 0;
    this.dead = false;
    this.spawnT = 0.35;
    this.runCycle = 0;
    this.landT = 0;
    this.hitIds = new Set();
    this.lastSwordTip = null;
    this.airSlashUsed = false;
    this.shake = 0;
    this.stepT = 0;
    this.soul = 55;
    this.soulMax = SOUL_MAX;
    this.soulRegenT = 0;
    this.skillName = null;
    this.skillT = 0;
    this.skillData = null;
    this.skillCd = 0;
    this.skillFlash = 0;
    this.skillDenyT = 0;
  }

  get alive() { return !this.dead; }
  get centerY() { return this.y - 40; }

  setState(s) { this.state = s; }

  startAttack(name, fromBuffer = false) {
    const def = ATTACKS[name];
    if (!def) return;
    const wasAttacking = this.act && this.act.t < ATTACKS[this.act.name].active[1] + 0.03;
    this.act = { name, def, t: 0, hit: new Set(), lunged: false, slashed: false, swung: false };
    this.actT = 0;
    this.state = 'attack';
    this.hitIds.clear();
    this.queued = null;
    this.charging = false;
    this.charge = 0;
    /* snappy direction correction only at combo start */
    if (!wasAttacking) {
      const dir = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);
      if (dir) this.facing = dir;
    }
    Audio_.swing(def.heavy ? 1.4 : 0.6);
  }

  bufferAction(name) { this.buffer = name; this.bufferT = 0.16; }

  dash() {
    if (this.dashCd > 0) return false;
    if (!this.onGround) {
      if (this.airDashes <= 0) return false;
      this.airDashes--;
    }
    const dir = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);
    if (dir) this.facing = dir;
    this.state = 'dash'; this.act = null;
    this.dashT = 0.17; this.dashDir = this.facing;
    this.vx = this.dashDir * 900; this.vy = this.onGround ? 0 : 40;
    this.invuln = Math.max(this.invuln, 0.22);
    this.dashCd = 0.30;
    this.charging = false; this.charge = 0;
    this.slashTrail.length = 0;
    Audio_.dash();
    for (let i = 0; i < 3; i++) {
      FX.parts.push({ type: 'dust', x: this.x - this.facing * 16, y: this.y - 10 - i * 14, vx: -this.facing * rand(40, 120), vy: rand(-60, -10), life: 0.4, max: 0.4, r: rand(6, 14), color: 'rgba(150,220,255,', grav: 0, drag: 3 });
    }
    return true;
  }

  jump() {
    if (this.jumpBuf <= 0) return;
    if (this.onGround || this.coyote > 0) {
      this.vy = -740; this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
      this.jumps = 1; this.state = 'jump'; Audio_.jump();
      FX.ring(this.x, this.y - 2, 4, 26, 0.3, 'rgba(180,230,255,', 2);
      for (let i = 0; i < 4; i++) FX.parts.push({ type: 'dust', x: this.x + rand(-12, 12), y: this.y, vx: rand(-80, 80), vy: rand(-40, -5), life: 0.35, max: 0.35, r: rand(5, 12), color: 'rgba(200,210,240,', grav: 0, drag: 3 });
    } else if (this.jumps < 2 && !this.charging) {
      this.vy = -660; this.jumps = 2; this.jumpBuf = 0; this.state = 'jump';
      this.airDashes = Math.max(this.airDashes, 1);
      Audio_.jump();
      FX.ring(this.x, this.y - 26, 6, 46, 0.34, 'rgba(140,240,255,', 2.5);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        FX.parts.push({ type: 'spark', x: this.x + Math.cos(a) * 16, y: this.y - 26 + Math.sin(a) * 8, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 + 60, life: 0.3, max: 0.3, w: 2, color: '#9fefff', grav: 200, drag: 2.5 });
      }
      this.spinJump = 1;
    }
  }
}

const PLAYER_PROTO = {
  update(dt) {
    if (this.dead) {
      this.vy += GRAV * dt; this.y += this.vy * dt;
      if (this.y > GROUND_Y) { this.y = GROUND_Y; this.vy = 0; }
      this.x += this.vx * dt; this.vx *= 0.85;
      this.ribbon.update(dt, this.x - this.facing * 8, this.y - 46, this.facing, this.vx, this.vy);
      return;
    }
    this.spawnT = Math.max(0, this.spawnT - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.parrySuccess = Math.max(0, this.parrySuccess - dt);
    this.bufferT = Math.max(0, this.bufferT - dt);
    if (this.bufferT <= 0) this.buffer = null;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.bladeGlow = Math.max(0, this.bladeGlow - dt * 4);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.skillFlash = Math.max(0, this.skillFlash - dt * 2.2);
    this.skillDenyT = Math.max(0, this.skillDenyT - dt);
    /* slow passive soul build while not casting */
    if (this.state !== 'skill') this.soul = Math.min(this.soulMax, this.soul + dt * 3.2);

    /* dash movement */
    if (this.state === 'dash') {
      this.dashT -= dt;
      if (this.dashT <= 0) { this.state = this.onGround ? 'idle' : 'fall'; this.vx *= 0.55; }
    }

    /* parry stance */
    if (this.state === 'parry') this.parryT -= dt;

    /* input */
    this.handleInput(dt);

    /* physics */
    if (!this.onGround) { this.vy += GRAV * dt; if (this.vy > MAX_FALL) this.vy = MAX_FALL; }
    let gravityScale = 1;
    if (this.state === 'hurt') {
      this.hurtT -= dt;
      if (this.hurtT <= 0) { this.state = this.onGround ? 'idle' : 'fall'; }
      this.vx *= Math.pow(0.06, dt);
      gravityScale = 1;
    } else if (this.state === 'dash') {
      if (!this.onGround) { this.vy = Math.max(this.vy * 0.6, -40); }
      gravityScale = 0;
    } else if (this.state === 'attack') {
      const def = this.act.def;
      if (this.act.t < def.active[1] && !this.act.lunged) {
        this.vx = this.facing * def.lunge * (def.air ? 0.55 : 1);
        this.act.lunged = true;
      }
      /* stop short of the target so bodies don't interpenetrate */
      const near = Game.enemies.find(e => e.alive && Math.sign(e.x - this.x) === this.facing && Math.abs(e.x - this.x) < 56);
      if (near && this.vx * this.facing > 0) this.vx = 0;
      this.vx *= Math.pow(0.02, dt);
      if (def.dive && this.act.t > 0.03 && this.act.t < 0.26) { this.vy = 1500; }
      else gravityScale = this.onGround ? 0 : (def.air ? 0.55 : 0.3);
    } else if (this.state === 'charge') {
      this.vx *= Math.pow(0.02, dt);
    } else if (this.state === 'parry') {
      this.vx *= Math.pow(0.02, dt);
    } else if (this.state === 'skill') {
      gravityScale = this.onGround ? 0 : 0.6;
      if (this.skillName !== 'blossom' && this.skillName !== 'raid') this.vx *= Math.pow(0.02, dt);
    }
    this.x += this.vx * dt;
    if (gravityScale) this.y += this.vy * dt;

    /* aim facing when attacking on ground w/ movement */
    if ((this.state !== 'attack' && this.state !== 'dash' && this.state !== 'hurt') || true) {
      /* attacks track the stick lightly before the active frames, never during them */
      const dir = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);
      if (dir && !(this.state === 'attack') && !(this.state === 'dash')) this.facing = dir;
    }

    /* ground collision */
    const wasAir = !this.onGround;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      if (wasAir) {
        this.onGround = true; this.jumps = 0; this.airDashes = 2;
        if (this.state === 'attack' && !this.act.def.dive) {
          /* keep attack running */
        } else if (this.state !== 'dash' && this.state !== 'skill') {
          this.state = 'idle';
        }
        this.landT = 0.14;
        Audio_.land();
        FX.ring(this.x, this.y - 2, 6, 40, 0.32, 'rgba(200,220,255,', 2);
        for (let i = 0; i < 7; i++) FX.parts.push({ type: 'dust', x: this.x + rand(-20, 20), y: this.y, vx: rand(-140, 140), vy: rand(-70, -10), life: rand(0.25, 0.5), max: 0.5, r: rand(5, 14), color: 'rgba(190,200,235,', grav: 100, drag: 3 });
        if (this.state === 'dive' || (this.act && this.act.def.dive)) {
          this.state = 'idle'; this.act = null;
          FX.ring(this.x, this.y - 4, 10, 90, 0.35, 'rgba(160,230,255,', 4);
          Camera.kick(0.2);
        }
      }
      this.vy = 0;
    } else {
      this.onGround = false;
    }

    /* skill progress */
    if (this.state === 'skill') {
      this.updateSkill(dt);
      if (this.state !== 'skill') {
        /* finished this frame */
      }
    }

    /* attack progress */
    if (this.state === 'attack' && this.act) {
      this.actT += dt;
      this.act.t = this.actT;
      if (this.actT >= this.act.def.dur) {
        const q = this.queued;
        this.act = null;
        if (q) { this.startAttack(q); }
        else this.state = this.onGround ? 'idle' : 'fall';
      }
    }

    /* clamp arena */
    this.x = clamp(this.x, 40, WORLD.w - 40);

    /* combo timer visual */
    if (this.combo > 0) this.comboT = Math.max(this.comboT, 0.1);

    /* ribbon */
    const scarfRoot = this.getScarfRoot();
    this.ribbon.update(dt, scarfRoot.x, scarfRoot.y, this.facing, this.vx * 1.15 + this.facing * 30, this.vy, this.act ? 1.7 : this.state === 'run' ? 1.6 : 1);

    /* dash trail */
    if (this.state === 'dash') {
      if (!this._trailT) this._trailT = 0;
      this._trailT += dt;
      if (this._trailT > 0.028) {
        this._trailT = 0;
        const snap = this.makeSnapshot();
        FX.afterimage(snap, 0.22, 'rgba(120,220,255,');
      }
    }
  },

  handleInput(dt) {
    /* start / restart/mute */
    if (Input.hit('jump')) this.jumpBuf = 0.13;

    const moveX = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);

    if (this.state === 'attack') {
      const def = this.act.def;
      const t = this.act.t;
      /* buffer next light during active/recovery */
      if (Input.hit('atk') && def.next && t > def.active[0] * 0.6) this.queued = def.next;
      else if (Input.hit('atk') && !def.next && t > def.active[1] && def.air === undefined && !this.onGround) this.queued = 'air2';
      if (Input.hit('heavy') && t > 0.05) this.queued = 'heavy';
      /* jump cancel light recovery */
      if (Input.hit('jump') && !def.air && t > def.active[1] && this.onGround) {
        this.act = null; this.state = 'idle'; this.jump();
      }
      /* dash cancel after active */
      if (Input.hit('dash') && t > def.active[1] * 0.55) {
        if (this.dash()) { this.act = null; }
      }
      return;
    }

    if (this.state === 'hurt') return;

    /* --- four blade-soul techniques --- */
    const castOrder = ['skill1', 'skill2', 'skill3', 'skill4'];
    for (let i = 0; i < 4; i++) {
      if (Input.hit(castOrder[i])) {
        if (this.state === 'skill' || this.skillCd > 0) break;
        const name = SKILL_ORDER[i];
        if (this.state === 'attack' || this.state === 'charge' || this.state === 'parry') {
          if (this.state === 'attack' && this.act.t < this.act.def.active[0]) break;
          this.act = null; this.charging = false; this.charge = 0;
        }
        if (this.castSkill(name)) this.skillCd = 0.12;
        return;
      }
    }

    if (this.state === 'dash') {
      if (Input.hit('atk')) { this.state = 'idle'; this.startAttack(this.onGround ? 'light1' : 'air1'); }
      return;
    }
    if (this.state === 'parry') {
      if (Input.hit('atk')) { this.state = 'counter'; this.startAttack('counter'); }
      if (this.parryT <= 0 && !Input.down('special')) this.state = this.onGround ? 'idle' : 'fall';
      return;
    }

    /* move */
    if (this.onGround) {
      if (this.state !== 'charge') {
        const spd = moveX * 330;
        if (moveX) {
          this.vx = approach(this.vx, spd, 2600 * dt);
          this.facing = moveX;
          this.runCycle += dt * 12;
          if (Math.abs(this.vx) > 60) this.stepT -= dt;
          if (this.stepT <= 0 && Math.abs(this.vx) > 200) {
            this.stepT = 0.22;
            FX.parts.push({ type: 'dust', x: this.x - this.facing * 10, y: this.y - 2, vx: -this.facing * rand(20, 60), vy: rand(-36, -8), life: 0.3, max: 0.3, r: rand(3, 7), color: 'rgba(200,200,235,', grav: 0, drag: 3 });
          }
        } else if (this.state !== 'parry') {
          this.vx = approach(this.vx, 0, 3000 * dt);
        }
      }
      if (this.state === 'idle' || this.state === 'run') this.state = moveX ? 'run' : 'idle';
    } else {
      if (this.state !== 'charge') {
        if (moveX) { this.vx = approach(this.vx, moveX * 300, 1800 * dt); this.facing = moveX; }
        else this.vx = approach(this.vx, 0, 1200 * dt);
      }
      if (this.state !== 'attack' && this.state !== 'charge') this.state = this.vy < 0 ? 'jump' : 'fall';
    }

    /* jump */
    if (Input.hit('jump')) this.jump();

    /* charge (K hold) */
    if (Input.down('heavy')) {
      if (!this.charging && this.state !== 'charge') {
        this.charging = true; this.charge = 0; this.state = 'charge';
        this.act = null;
      }
      if (this.charging) {
        this.charge = Math.min(1, this.charge + dt / 0.62);
        if (this.state !== 'charge') this.state = 'charge';
        if (Math.random() < dt * 26) {
          const a = rand(-2.4, -0.7);
          FX.parts.push({ type: 'spark', x: this.x + Math.cos(a) * 60, y: this.y - 50 + Math.sin(a) * 60, vx: Math.cos(a) * -260, vy: Math.sin(a) * -260, life: 0.25, max: 0.25, w: 2, color: this.charge >= 1 ? '#ff9a5c' : '#ffd76e', grav: 0, drag: 1 });
        }
      }
    } else if (this.charging) {
      this.charging = false;
      const full = this.charge >= 0.99 ? 2 : 1;
      this.startAttack(full === 2 ? 'charge2' : 'charge1');
    }

    if (this.state === 'charge') return;

    /* dash */
    if (Input.hit('dash')) { this.dash(); return; }

    /* parry */
    if (Input.hit('special') && this.parryCd <= 0) {
      this.state = 'parry'; this.parryT = 0.20; this.parryCd = 0.28;
      this.act = null;
      Audio_.swing(0.4);
      FX.slash(this.x + this.facing * 20, this.y - 52, this.facing > 0 ? 0.2 : Math.PI - 0.2, 62, 2.2, 0.18, 'rgba(140,240,255,', 3);
      return;
    }

    /* riposte: J right after a successful parry */
    if (Input.hit('atk') && this.parrySuccess > 0) {
      this.startAttack('counter');
      return;
    }
    /* attacks */
    if (Input.hit('atk')) {
      if (!this.onGround) {
        if (Input.down('down')) this.startAttack('dive');
        else this.startAttack('air1');
      } else {
        this.startAttack('light1');
      }
      return;
    }
    if (Input.hit('heavy') && !this.charging) { this.startAttack('heavy'); }
  },

  getScarfRoot() {
    const P = this.currentSkel;
    const bx = P ? P.neckX : this.x;
    const by = P ? P.neckY + 6 : this.y - 76;
    return { x: bx - this.facing * 6, y: by - 2 };
  },

  hurtBox() {
    if (this.state === 'dash' && this.invuln > 0) return { x: this.x - 14, y: this.y - 96, w: 28, h: 92 };
    return { x: this.x - 15, y: this.y - 92, w: 30, h: 88 };
  },

  hitbox() {
    const def = this.act.def;
    const p = this.pose();
    const tip = p.swordTip;
    const reachW = 26;
    if (this.facing > 0) return { x: this.x - 18, y: this.y - 88, w: def.reach + 18, h: 92 };
    return { x: this.x - def.reach, y: this.y - 88, w: def.reach + 18, h: 92 };
  },

  currentFrameHits(enemies, game) {
    const def = this.act.def;
    if (this.act.t < def.active[0] || this.act.t > def.active[1]) return;
    const hb = this.hitbox();
    for (const e of enemies) {
      if (e.dead || e.hp <= 0) continue;
      if (this.act.hit.has(e.id)) continue;
      if (!overlap(hb, e.hurtBox())) continue;
      this.act.hit.add(e.id);
      game.playerHitsEnemy(e, this, def);
    }
  },

  takeDamage(dmg, dir, opts = {}) {
    if (this.dead || this.invuln > 0 || this.spawnT > 0) return false;
    if (this.parrySuccess > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.9;
    this.vx = dir * 260; this.vy = -180;
    this.state = 'hurt'; this.hurtT = 0.32;
    this.act = null; this.charging = false; this.charge = 0;
    this.combo = 0;
    Audio_.hurt();
    Camera.kick(0.32);
    FX.blood(this.x, this.y - 46, dir > 0 ? 0.2 : Math.PI - 0.2, 1.2);
    FX.ring(this.x, this.y - 46, 10, 62, 0.3, 'rgba(255,90,110,', 3);
    Game.hitstop = Math.max(Game.hitstop, 0.06);
    Game.flash = Math.max(Game.flash, 0.22);
    if (this.hp <= 0) this.die();
    return true;
  },

  die() {
    this.dead = true; this.state = 'dead';
    this.vy = -320; this.vx = -this.facing * 120;
    Audio_.death();
    Game.onPlayerDeath();
  },

  pose() {
    const t = Game.time;
    let p;
    if (this.state === 'skill') { p = keyPose(poseSkillKeys(this.skillName), this.skillT); }
    else if (this.state === 'attack' && this.act) p = keyPose(this.act.def.keys(this.act.def.dur), this.act.t);
    else if (this.state === 'charge') { p = poseChargeHold(); p.hipY += Math.sin(t * 22) * 0.8; }
    else if (this.state === 'parry') p = poseParry();
    else if (this.state === 'dash') p = clonePose(POSE.dash);
    else if (this.state === 'hurt') p = POSE.hurt;
    else if (this.state === 'dead') p = POSE.dead;
    else if (this.state === 'run') {
      const c = (this.runCycle % (Math.PI * 2)) / (Math.PI * 2);
      const k = Math.abs(Math.sin(c * Math.PI * 2));
      p = lerpPose(POSE.runA, POSE.runB, k);
      p.hipY += Math.cos(c * TAU) * 2;
    }
    else if (!this.onGround) p = this.vy < 0 ? POSE.jumpUp : POSE.fall;
    else {
      p = lerpPose(POSE.idle, POSE.idleBreath, (Math.sin(t * 2.0) * 0.5 + 0.5));
      if (this.landT > 0) p = lerpPose(p, POSE.land, this.landT / 0.14);
    }
    const sk = this.solve(p);
    this.currentSkel = sk;
    return sk;
  },

  solve(p) {
    const hipX = this.x, hipY = this.y + p.hipY;
    const lean = p.lean;
    const shoulderY = hipY - SK.torso * Math.cos(lean * 0.6);
    const shoulderX = hipX + SK.torso * Math.sin(lean * 0.6);
    const side = this.facing;
    const neckX = shoulderX + Math.sin(lean) * SK.neck * side;
    const neckY = shoulderY - SK.neck * Math.cos(lean);
    const headX = neckX + side * (Math.sin(lean + p.head) * (SK.headR + 4));
    const headY = neckY - Math.cos(lean + p.head) * (SK.headR + 4);

    const shF = { x: shoulderX + side * 3, y: shoulderY + 2 };
    const shB = { x: shoulderX - side * 3, y: shoulderY + 4 };

    const hipF = { x: hipX + side * 4, y: hipY - 2 };
    const hipB = { x: hipX - side * 4, y: hipY - 2 };

    const handF = { x: hipX + p.fh[0] * side, y: hipY + p.fh[1] };
    const handB = { x: hipX + p.bh[0] * side, y: hipY + p.bh[1] };
    const elbowF = ik2(shF.x, shF.y, handF.x, handF.y, SK.upperArm, SK.foreArm, p.elbowF);
    const elbowB = ik2(shB.x, shB.y, handB.x, handB.y, SK.upperArm, SK.foreArm, p.elbowB);

    const footF = { x: hipX + p.ff[0] * side + (this.vx * 0.012), y: this.y + p.ff[1] - (p.ff[1] === 0 ? 4 : 0) };
    const footB = { x: hipX + p.bf[0] * side + (this.vx * 0.012), y: this.y + p.bf[1] - (p.bf[1] === 0 ? 4 : 0) };
    const kneeF = ik2(hipF.x, hipF.y, footF.x, footF.y, SK.thigh, SK.shin, p.kneeF);
    const kneeB = ik2(hipB.x, hipB.y, footB.x, footB.y, SK.thigh, SK.shin, p.kneeB);

    const ang = p.sword;
    const swordBase = handF;
    const swordTip = { x: swordBase.x + Math.cos(ang) * SK.swordLen * side, y: swordBase.y + Math.sin(ang) * SK.swordLen };

    return { hipX, hipY, shoulderX, shoulderY, neckX, neckY, headX, headY, shF, shB, handF, handB, elbowF, elbowB, hipF, hipB, footF, footB, kneeF, kneeB, swordBase, swordTip, p };
  },

  draw(ctx) {
    if (this.spawnT > 0) {
      const t = this.spawnT / 0.35;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glowCircle(ctx, this.x, this.y - 48, 60 * t + 20, 'rgba(120,220,255,0.7)', 1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + Game.time * 2;
        FX.parts.push({ type: 'spark', x: this.x + Math.cos(a) * 40 * t, y: this.y - 48 + Math.sin(a) * 46 * t, vx: -Math.cos(a) * 160, vy: -Math.sin(a) * 160, life: 0.2, max: 0.2, w: 2, color: '#9fefff', grav: 0, drag: 2 });
      }
      ctx.restore();
    }
    const P = this.pose();
    const side = this.facing;
    const p = P.p;

    /* shadow */
    ctx.save();
    ctx.globalAlpha = clamp(1 - (GROUND_Y - this.y) / 300, 0.14, 0.48);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(this.x, GROUND_Y + 1, 27, 6, 0, 0, TAU); ctx.fill();
    ctx.restore();

    /* scarf behind */
    ctx.save();
    this.ribbon.draw(ctx);
    ctx.restore();

    const OUT = '#07080f';
    /* ---------- rear limbs ---------- */
    this.drawLeg(ctx, P.hipB, P.kneeB, P.footB, '#33416b', p, false);
    taperedLimb(ctx, P.shB.x, P.shB.y, P.elbowB.x, P.elbowB.y, 9.5, 7.5, '#33416b');
    taperedLimb(ctx, P.elbowB.x, P.elbowB.y, P.handB.x, P.handB.y, 7.5, 5.5, '#33416b');

    /* ---------- torso: layered kimono ---------- */
    ctx.save();
    const leanN = p.lean;
    /* hakama: flared, split skirt with a centre crease */
    const skirtL = 24 + Math.abs(this.vx) * 0.012;
    const skirtB = P.hipY + 30;
    ctx.beginPath();
    ctx.moveTo(P.hipX - side * 14, P.hipY - 7);
    ctx.lineTo(P.hipX + side * 12, P.hipY - 9);
    ctx.quadraticCurveTo(P.hipX + side * skirtL * 0.55, P.hipY + 12, P.hipX + side * skirtL, skirtB + 2);
    ctx.lineTo(P.hipX + side * 5, skirtB - 3);
    ctx.lineTo(P.hipX - side * 4, skirtB + 3);
    ctx.lineTo(P.hipX - side * skirtL * 0.9, skirtB - 1);
    ctx.quadraticCurveTo(P.hipX - side * skirtL * 0.5, P.hipY + 10, P.hipX - side * 14, P.hipY - 7);
    ctx.closePath();
    const hk = ctx.createLinearGradient(P.hipX - side * 18, P.hipY, P.hipX + side * 16, skirtB);
    hk.addColorStop(0, '#2d3857'); hk.addColorStop(1, '#151b2e');
    ctx.fillStyle = hk; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();
    /* crease */
    ctx.strokeStyle = 'rgba(150,175,235,0.16)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(P.hipX + side * 2, P.hipY - 4);
    ctx.lineTo(P.hipX + side * 6, skirtB - 4);
    ctx.stroke();

    /* torso body */
    const midX = lerp(P.hipX, P.shoulderX, 0.5), midY = lerp(P.hipY, P.shoulderY, 0.5);
    const wid = 25, widTop = 30;
    ctx.beginPath();
    poly(ctx, [
      P.hipX - side * (wid * 0.5), P.hipY - 2,
      midX - side * (wid * 0.52), midY,
      P.shoulderX - side * (widTop * 0.5), P.shoulderY + 4,
      P.shoulderX + side * (widTop * 0.46), P.shoulderY + 2,
      midX + side * (wid * 0.50), midY,
      P.hipX + side * (wid * 0.5), P.hipY - 2,
    ]);
    const tg = ctx.createLinearGradient(P.shoulderX - side * 16, P.shoulderY, P.hipX + side * 16, P.hipY);
    tg.addColorStop(0, '#5a6ca0'); tg.addColorStop(0.45, '#3f4e7c'); tg.addColorStop(1, '#2a3455');
    ctx.fillStyle = tg; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.3; ctx.lineJoin = 'round'; ctx.stroke();

    /* shoulder plate on the sword side */
    ctx.beginPath();
    ctx.ellipse(P.shoulderX + side * 3, P.shoulderY + 4, 9, 8.5, 0, 0, TAU);
    ctx.fillStyle = '#4d5f92'; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();

    /* collar: short V of the kimono at the neck */
    ctx.strokeStyle = '#e8e2d4'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(P.neckX - side * 5, P.neckY + 3);
    ctx.lineTo(lerp(P.neckX, midX, 0.42) - side * 1, lerp(P.neckY, midY, 0.42));
    ctx.lineTo(P.neckX + side * 5, P.neckY + 3);
    ctx.stroke();
    ctx.strokeStyle = '#cf2038'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(P.neckX + side * 5.5, P.neckY + 3.5);
    ctx.lineTo(lerp(P.neckX, midX, 0.44) + side * 1.5, lerp(P.neckY, midY, 0.44));
    ctx.stroke();

    /* crimson obi sash */
    ctx.beginPath();
    poly(ctx, [
      P.hipX - side * 13, P.hipY - 10,
      P.hipX + side * 12, P.hipY - 12,
      P.hipX + side * 12, P.hipY - 1,
      P.hipX - side * 13, P.hipY + 1
    ]);
    ctx.fillStyle = '#cf2038'; ctx.fill();
    ctx.strokeStyle = '#4a0710'; ctx.lineWidth = 1.6; ctx.stroke();
    /* sash knot trailing */
    ctx.strokeStyle = '#e8324f'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(P.hipX - side * 10, P.hipY - 5);
    ctx.quadraticCurveTo(P.hipX - side * 22, P.hipY + 6, P.hipX - side * (26 + Math.sin(Game.time * 6) * 3), P.hipY + 18);
    ctx.stroke();
    ctx.restore();

    /* ---------- front leg ---------- */
    this.drawLeg(ctx, P.hipF, P.kneeF, P.footF, '#4a5b8c', p, true);

    /* ---------- head + hair ---------- */
    this.drawHead(ctx, P, side, p);

    /* ---------- front arm ---------- */
    taperedLimb(ctx, P.shF.x, P.shF.y, P.elbowF.x, P.elbowF.y, 10.5, 8.5, '#55679c');
    taperedLimb(ctx, P.elbowF.x, P.elbowF.y, P.handF.x, P.handF.y, 8.5, 6.5, '#55679c');
    jointDot(ctx, P.elbowF.x, P.elbowF.y, 2.2, '#0a0c16');
    /* hand wrap */
    ctx.fillStyle = '#d9bda2';
    ctx.beginPath(); ctx.arc(P.handF.x, P.handF.y, 3.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();

    /* ---------- sword ---------- */
    this.drawSword(ctx, P, side);

    /* parry glint */
    if (this.state === 'parry') {
      const a = 0.55 + Math.sin(Game.time * 40) * 0.2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glowCircle(ctx, P.handF.x + side * 20, P.handF.y, 40, 'rgba(140,240,255,0.5)', a);
      ctx.restore();
    }
    if (this.parrySuccess > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glowCircle(ctx, this.x, this.y - 50, 90, 'rgba(150,245,255,0.55)', clamp(this.parrySuccess * 2, 0, 0.8));
      ctx.restore();
    }
  },

  drawLeg(ctx, hip, knee, foot, color, p, front) {
    const OUT = '#07080f';
    const th = front ? 1 : 0.86;
    taperedLimb(ctx, hip.x, hip.y, knee.x, knee.y, 12.5 * th, 9 * th, color);
    taperedLimb(ctx, knee.x, knee.y, foot.x, foot.y, 9.5 * th, 6.5 * th, color);
    /* tabi boot: pointed foot along the facing direction */
    const s = this.facing;
    const toeX = foot.x + s * 11, toeY = foot.y - 1;
    ctx.beginPath();
    ctx.moveTo(foot.x - s * 3, foot.y - 8);
    ctx.quadraticCurveTo(foot.x + s * 6, foot.y - 9, toeX, toeY - 2);
    ctx.quadraticCurveTo(foot.x + s * 8, foot.y + 2, foot.x - s * 2, foot.y + 1);
    ctx.closePath();
    ctx.fillStyle = front ? '#232c47' : '#1a2238';
    ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
    /* wrap bands */
    ctx.strokeStyle = 'rgba(235,225,205,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(foot.x - s * 1, foot.y - 7); ctx.lineTo(foot.x - s * 2, foot.y - 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(foot.x + s * 3, foot.y - 7.5); ctx.lineTo(foot.x + s * 2, foot.y - 1); ctx.stroke();
  },

  drawHead(ctx, P, side, p) {
    const hx = P.headX, hy = P.headY;
    const r = 9.4;
    ctx.save();
    ctx.translate(hx, hy);
    const tilt = clamp((P.neckX - hx) * 0.02, -0.12, 0.12) + p.head * 0.3;
    ctx.rotate(tilt);
    ctx.scale(side, 1); /* local space faces +x */
    const OUT = '#07080f';

    /* neck */
    ctx.strokeStyle = '#e8cdb4'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1, r * 0.9); ctx.lineTo(-1, r * 1.6); ctx.stroke();

    /* skull / face */
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.92, r, 0, 0, TAU);
    ctx.fillStyle = '#f3dcc2'; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();

    /* jaw shadow */
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, r * 0.25);
    ctx.quadraticCurveTo(r * 0.45, r * 0.55, r * 0.86, r * 0.05);
    ctx.strokeStyle = 'rgba(150,110,90,0.35)'; ctx.lineWidth = 2; ctx.stroke();

    /* hair: swept back, layered spikes */
    const hairG = ctx.createLinearGradient(0, -r, 0, r * 0.4);
    hairG.addColorStop(0, '#232a44'); hairG.addColorStop(1, '#12162a');
    ctx.fillStyle = hairG;
    ctx.beginPath();
    ctx.moveTo(-r * 1.02, r * 0.55);
    ctx.quadraticCurveTo(-r * 1.5, -r * 0.15, -r * 1.0, -r * 0.72);
    ctx.quadraticCurveTo(-r * 0.75, -r * 1.28, -r * 0.05, -r * 1.08);
    ctx.quadraticCurveTo(r * 0.62, -r * 1.05, r * 0.92, -r * 0.5);
    ctx.quadraticCurveTo(r * 0.6, -r * 0.72, r * 0.36, -r * 0.34);
    ctx.quadraticCurveTo(r * 0.1, -r * 0.66, -r * 0.28, -r * 0.36);
    ctx.quadraticCurveTo(-r * 0.6, -r * 0.2, -r * 1.02, r * 0.55);
    ctx.closePath();
    ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();

    /* ponytail streaming back */
    const sway = Math.sin(Game.time * 3.4) * 2.2 - clamp(this.vx * 0.02, -5, 5);
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, -r * 0.5);
    ctx.quadraticCurveTo(-r * 2.1, -r * 0.9 + sway, -r * 2.9, -r * 0.15 + sway * 1.6);
    ctx.quadraticCurveTo(-r * 2.2, -r * 0.25 + sway, -r * 1.6, r * 0.45);
    ctx.quadraticCurveTo(-r * 1.3, -r * 0.05, -r * 0.85, -r * 0.5);
    ctx.fillStyle = '#181d33'; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();

    /* red headband */
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, -r * 0.62);
    ctx.quadraticCurveTo(-r * 0.1, -r * 1.02, r * 0.88, -r * 0.56);
    ctx.lineTo(r * 0.9, -r * 0.30);
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.76, -r * 0.95, -r * 0.36);
    ctx.closePath();
    ctx.fillStyle = '#e8324f'; ctx.fill();
    ctx.strokeStyle = '#5c0a1c'; ctx.lineWidth = 1.4; ctx.stroke();
    /* headband tails */
    ctx.strokeStyle = '#e8324f'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.4);
    ctx.quadraticCurveTo(-r * 1.9, -r * 0.35 + sway * 0.5, -r * 2.5, r * 0.25 + sway);
    ctx.stroke();

    /* eye with gold iris + sharp brow */
    ctx.fillStyle = '#f6f1e6';
    ctx.beginPath(); ctx.ellipse(r * 0.44, 0, 2.5, 1.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0a53c';
    ctx.beginPath(); ctx.arc(r * 0.52, 0, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0b0d18';
    ctx.beginPath(); ctx.arc(r * 0.55, 0, 0.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#12152a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.16, -r * 0.3); ctx.lineTo(r * 0.78, -r * 0.19); ctx.stroke();
    /* cheek mark */
    ctx.strokeStyle = 'rgba(207,32,56,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(r * 0.3, r * 0.42); ctx.lineTo(r * 0.55, r * 0.3); ctx.stroke();
    ctx.restore();
  },

  drawSword(ctx, P, side) {
    const b = P.swordBase, t = P.swordTip;
    ctx.save();
    /* charge glow */
    if (this.state === 'charge' && this.charge > 0.15) {
      const c = this.charge;
      const glowColor = c >= 0.99 ? 'rgba(255,120,60,' : 'rgba(255,200,90,';
      ctx.globalCompositeOperation = 'lighter';
      glowCircle(ctx, b.x, b.y, 22 + c * 48, glowColor + (0.28 + c * 0.5) + ')', 1);
      glowCircle(ctx, t.x, t.y, 16 + c * 34, glowColor + (0.35 + c * 0.45) + ')', 1);
      if (c >= 0.99) {
        for (let i = 0; i < 2; i++) {
          const a = Game.time * 9 + i * Math.PI;
          ctx.strokeStyle = 'rgba(255,170,90,' + (0.35 + Math.sin(Game.time * 20 + i) * 0.2) + ')';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(b.x, b.y, 40 + i * 9, a, a + 2.2); ctx.stroke();
        }
      }
    }
    /* hilt */
    const hx = b.x - Math.cos(this.facing > 0 ? 0 : 0) * 0;
    ctx.strokeStyle = '#0a0c16'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(this.pose().p.sword) * 10 * side, b.y - Math.sin(this.pose().p.sword) * 10);
    ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#8c1229'; ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(this.pose().p.sword) * 10 * side, b.y - Math.sin(this.pose().p.sword) * 10);
    ctx.lineTo(b.x, b.y); ctx.stroke();
    /* guard */
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - Math.sin(this.pose().p.sword) * 6, b.y + Math.cos(this.pose().p.sword) * 6);
    ctx.lineTo(b.x + Math.sin(this.pose().p.sword) * 6, b.y - Math.cos(this.pose().p.sword) * 6);
    ctx.stroke();
    /* blade */
    blade(ctx, b.x, b.y, t.x, t.y, 2.6, this.bladeGlow > 0);
    if (this.bladeGlow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(180,240,255,' + this.bladeGlow + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    }
    ctx.restore();
  },

  makeSnapshot() {
    const P = this.pose();
    const side = this.facing;
    const p = P.p;
    return (ctx, color, t) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = color + (0.9) + ')';
      ctx.fillStyle = color + (0.28) + ')';
      ctx.lineWidth = 3;
      taperedLimb(ctx, P.hipX, P.hipY, P.shoulderX, P.shoulderY, 26, 30, color + (0.30) + ')', null);
      taperedLimb(ctx, P.hipF.x, P.hipF.y, P.kneeF.x, P.kneeF.y, 12, 9, color + (0.26) + ')', null);
      taperedLimb(ctx, P.kneeF.x, P.kneeF.y, P.footF.x, P.footF.y, 9, 6, color + (0.26) + ')', null);
      taperedLimb(ctx, P.hipB.x, P.hipB.y, P.kneeB.x, P.kneeB.y, 12, 9, color + (0.20) + ')', null);
      taperedLimb(ctx, P.kneeB.x, P.kneeB.y, P.footB.x, P.footB.y, 9, 6, color + (0.20) + ')', null);
      taperedLimb(ctx, P.shF.x, P.shF.y, P.elbowF.x, P.elbowF.y, 10, 8, color + (0.30) + ')', null);
      taperedLimb(ctx, P.elbowF.x, P.elbowF.y, P.handF.x, P.handF.y, 8, 6, color + (0.30) + ')', null);
      ctx.beginPath(); ctx.arc(P.headX, P.headY, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = color + '0.9)';
      blade(ctx, P.swordBase.x, P.swordBase.y, P.swordTip.x, P.swordTip.y, 3.2, true);
      blade(ctx, P.swordBase.x, P.swordBase.y, P.swordTip.x, P.swordTip.y, 2.4, true);
      ctx.restore();
    };
  }
};
Object.assign(Player.prototype, PLAYER_PROTO, SKILL_RUNTIME);
