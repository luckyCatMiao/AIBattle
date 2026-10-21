(function (AV) {
  "use strict";
  const U = AV.util;
  const G = AV.gfx;
  const { clamp, lerp, TAU, rand, sign, easeOutCubic, easeInCubic, easeOutQuint, easeInOutCubic } = U;
  const D2R = Math.PI / 180;
  const PAL = G.palette;
  const P2R = Math.PI / 2;

  // Enemy pose set: front-anchored absolute angles, same convention as player.
  const E = (o) => G.basePose(o);

  const EPOSES = {
    idle: [
      E({ lean: 2, head: 0, bSh: 108, bEl: 142, fSh: 66, fEl: 80, swAng: 60, bTh: 104, bShin: 86, fTh: 76, fShin: 90 }),
      E({ lean: 1, head: 1, bSh: 104, bEl: 138, fSh: 72, fEl: 84, swAng: 66, bTh: 102, bShin: 84, fTh: 78, fShin: 88 }),
    ],
    walkA: E({ lean: 5, head: 1, bSh: 130, bEl: 160, fSh: 56, fEl: 66, swAng: 40, bTh: 64, bShin: 126, fTh: 122, fShin: 66 }),
    walkB: E({ lean: 5, head: 1, bSh: 96, bEl: 140, fSh: 74, fEl: 88, swAng: 52, bTh: 126, bShin: 64, fTh: 62, fShin: 124 }),
    runA: E({ lean: 12, head: -2, bSh: 150, bEl: 190, fSh: 40, fEl: 46, swAng: 10, bTh: 58, bShin: 132, fTh: 130, fShin: 58 }),
    runB: E({ lean: 12, head: -2, bSh: 100, bEl: 150, fSh: 70, fEl: 60, swAng: 30, bTh: 130, bShin: 58, fTh: 58, fShin: 132 }),

    // windup: raise weapon back overhead, lean away, chest open
    windup: E({ lean: -12, head: -6, bSh: 200, bEl: 240, fSh: 205, fEl: 250, swAng: -125, bTh: 110, bShin: 72, fTh: 124, fShin: 64, twoHand: 1 }),
    windupB: E({ lean: -18, head: -8, bSh: 218, bEl: 258, fSh: 222, fEl: 268, swAng: -148, bTh: 112, bShin: 70, fTh: 128, fShin: 60, twoHand: 1 }),

    // strike: huge downward chop
    strike: E({ lean: 28, head: 8, bSh: 132, bEl: 172, fSh: 128, fEl: 170, swAng: 64, bTh: 118, bShin: 66, fTh: 134, fShin: 58, twoHand: 1 }),
    strikeB: E({ lean: 34, head: 10, bSh: 116, bEl: 158, fSh: 110, fEl: 156, swAng: 86, bTh: 116, bShin: 64, fTh: 132, fShin: 56, twoHand: 1 }),

    // armored attack: shoulder charge
    chargeA: E({ lean: 24, head: 6, bSh: 160, bEl: 196, fSh: 116, fEl: 136, swAng: 76, bTh: 128, bShin: 60, fTh: 128, fShin: 62 }),
    chargeB: E({ lean: 30, head: 10, bSh: 166, bEl: 200, fSh: 108, fEl: 122, swAng: 84, bTh: 122, bShin: 62, fTh: 134, fShin: 58 }),

    // slam (brute)
    slamA: E({ lean: -16, head: -10, bSh: 214, bEl: 250, fSh: 216, fEl: 255, swAng: -110, bTh: 116, bShin: 70, fTh: 128, fShin: 60, twoHand: 1 }),
    slamB: E({ lean: 34, head: 12, bSh: 126, bEl: 166, fSh: 120, fEl: 160, swAng: 68, bTh: 118, bShin: 66, fTh: 138, fShin: 54, twoHand: 1 }),

    // stalker leap
    leapA: E({ lean: 16, head: -4, bSh: 170, bEl: 200, fSh: 120, fEl: 110, swAng: 30, bTh: 110, bShin: 64, fTh: 122, fShin: 58 }),
    leapB: E({ lean: 26, head: 4, bSh: 150, bEl: 180, fSh: 50, fEl: 20, swAng: -20, bTh: 70, bShin: 110, fTh: 120, fShin: 70 }),

    // claw attack
    clawA: E({ lean: -6, head: -4, bSh: 190, bEl: 220, fSh: 160, fEl: 200, swAng: -40, bTh: 96, bShin: 92, fTh: 84, fShin: 96 }),
    clawB: E({ lean: 22, head: 4, bSh: 140, bEl: 165, fSh: 70, fEl: 40, swAng: 20, bTh: 86, bShin: 98, fTh: 74, fShin: 98 }),

    // stagger / stun
    stagger: E({ lean: -18, head: 14, bSh: 170, bEl: 210, fSh: 150, fEl: 196, swAng: -80, bTh: 90, bShin: 100, fTh: 104, fShin: 104 }),
    stagger2: E({ lean: -24, head: 18, bSh: 180, bEl: 220, fSh: 166, fEl: 210, swAng: -100, bTh: 96, bShin: 104, fTh: 112, fShin: 108 }),
    stunLoop: E({ lean: 8, head: 20, bSh: 120, bEl: 160, fSh: 100, fEl: 140, swAng: 70, bTh: 100, bShin: 90, fTh: 92, fShin: 96 }),

    // airborne / falling
    airUp: E({ lean: -8, head: 6, bSh: 160, bEl: 200, fSh: 150, fEl: 190, swAng: -40, bTh: 66, bShin: 120, fTh: 112, fShin: 76 }),
    airDown: E({ lean: 18, head: 12, bSh: 140, bEl: 180, fSh: 110, fEl: 150, swAng: 20, bTh: 96, bShin: 100, fTh: 104, fShin: 96 }),

    death: E({ lean: 84, head: 28, bSh: 180, bEl: 220, fSh: 160, fEl: 200, swAng: 100, bTh: 120, bShin: 36, fTh: 134, fShin: 40, hipY: -34 }),
    deadGround: E({ lean: 86, head: 24, bSh: 178, bEl: 218, fSh: 158, fEl: 198, swAng: 100, bTh: 122, bShin: 34, fTh: 136, fShin: 38, hipY: -26, hipX: 4 }),
  };

  // ---------------------------------------------------------------- helpers
  function limbColorFor(kind) {
    return {
      armU: ["#3a3f46", "#23262b"],
      armL: ["#2e3238", "#1b1e22"],
      legU: ["#34383f", "#1f2226"],
      legL: ["#282c31", "#181a1e"],
      head: ["#4a4238", "#2a241c"],
    }[kind] || ["#333", "#222"];
  }

  let ENEMY_ID = 0;

  // ==========================================================================
  // Crossbow turret -- stationary ranged
  // ==========================================================================
  class Turret {
    constructor(game, x, tier) {
      this.game = game;
      this.id = ++ENEMY_ID;
      this.kind = "turret";
      this.x = x;
      this.y = 0;
      this.vx = 0; this.vy = 0;
      this.facing = -1;
      this.tier = tier || 0;
      this.maxHp = 34 + this.tier * 6;
      this.hp = this.maxHp;
      this.alive = true;
      this.spawning = true;
      this.spawnT = 0.5;
      this.armT = 0;
      this.lean = 0;
      this.baseY = 0;
      this.hopT = 0;
      this.recoil = 0;
      this.fireT = rand(1.4, 0.9);
      this.aimT = 0;
      this.chargeT = 0;
      this.stunT = 0;
      this.hurtFlash = 0;
      this.chargeFlash = 0;
      this.staggerT = 0;
      this.shakeT = 0;
      this.shells = [];
      this.cannonAngle = 0;
      this.targetAngle = 0;
      this.deadT = 0;
      this.barrelBroken = false;
      this.sincePlayerSeen = 0;
      this.spawnScale = 1;
      this.dying = false;
      this.deathVel = 0;
      this.limbSockets = {
        hull: { broken: false },
      };
      this.limbHp = { barrel: 26, hull: 999 };
      this.rot = 0;
      this.canFire = true;
    }

    hurtbox() {
      return { x: this.x, y: -34, w: 62, h: 70 };
    }
    parts() {
      // Part definitions for limb severing / hit feedback
      return [
        { key: "barrel", x: this.x + this.facing * 28, y: -56, r: 16, kind: "head", hp: this.limbHp.barrel, maxHp: 26, broken: this.barrelBroken, priority: 0.6 },
        { key: "hull", x: this.x, y: -22, r: 26, kind: "legU", hp: 999, maxHp: 999, broken: false, priority: 0.2 },
      ];
    }

    update(dt, game) {
      const p = game.player;
      this.spawnT -= dt;
      if (this.spawnT > 0) {
        this.spawnScale = 1 - this.spawnT / 0.5;
        return;
      }
      this.spawning = false;
      this.spawnScale = 1;
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      this.chargeFlash = Math.max(0, this.chargeFlash - dt * 6);
      this.recoil = Math.max(0, this.recoil - dt * 4);
      this.stunT = Math.max(0, this.stunT - dt);
      this.shakeT = Math.max(0, this.shakeT - dt);
      this.armT += dt;

      if (this.stunT > 0) {
        this.fireT = Math.max(this.fireT, 0.8);
        return;
      }

      const dx = p.x - this.x;
      const dy = (p.y - 66) - (-40);
      this.facing = dx < 0 ? -1 : 1;
      const dist = Math.abs(dx);
      const desired = clamp(Math.atan2(dy - 20, Math.abs(dx) * 0.7) * 0.4, -0.35, 0.25);
      this.cannonAngle = lerp(this.cannonAngle, desired - (this.recoil * 0.18), 1 - Math.exp(-dt * 8));

      if (!p.alive) {
        this.fireT = Math.max(this.fireT, 0.4);
        return;
      }

      // telegraph -> fire cycle
      if (this.aimT > 0) {
        this.aimT -= dt;
        this.chargeT += dt;
        if (Math.random() < 0.3) {
          game.fx.spark(this.x + this.facing * 36, -56 + Math.sin(this.cannonAngle) * 10, this.facing, -0.1, {
            count: 1, speed: 160, color: "#ffcf6a", life: 0.26, grav: 0,
          });
        }
        if (this.aimT <= 0) {
          this.fire(game, p);
        }
        return;
      }

      this.fireT -= dt;
      if (this.fireT <= 0 && dist < 900 && this.barrelBroken === false) {
        this.aimT = 0.52;
        this.fireT = rand(2.2, 1.4) + (this.barrelBroken ? 3 : 0);
        game.fx.ring(this.x + this.facing * 30, -56, { r1: 30, width: 2, color: "#ffb454", life: 0.22, squash: 1 });
        game.fx.text(this.x + this.facing * 20, -96, "!", { color: "#ffb454", size: 22, vy: -46, life: 0.55, gravity: 0 });
      }
    }

    fire(game, p) {
      if (!this.alive) return;
      this.recoil = 1;
      game.audio.tone && game.audio.tone("square", 220, 60, 0.12, 0.1);
      game.fx.flashBurst(this.x + this.facing * 40, -56, { r: 34, color: "#ffd08a", life: 0.12 });
      game.fx.spark(this.x + this.facing * 40, -56, this.facing, this.cannonAngle, {
        count: 12, speed: 460, spread: 0.5, life: 0.3, color: "#ffce80", grav: 300,
      });
      const ang = Math.atan2((p.y - 62) - -56, (p.x) - (this.x + this.facing * 46));
      game.spawnProjectile({
        x: this.x + this.facing * 44,
        y: -56 + Math.sin(this.cannonAngle) * 8,
        vx: Math.cos(ang) * 620,
        vy: Math.sin(ang) * 620,
        dmg: 9 + this.tier * 2,
        kind: "bolt",
        fromEnemy: true,
      });
      game.cam.addShake(1.6);
    }

    severPart(key, game, contact) {
      if (key === "barrel" && !this.barrelBroken) {
        this.barrelBroken = true;
        const socket = { x: this.x + this.facing * 30, y: -56 };
        game.spawnLimbDebris(this, "barrel", socket.x, socket.y);
        game.fx.text(socket.x, socket.y - 40, "炮管断裂", { color: "#ffca8a", size: 18, vy: -70, life: 0.9 });
      }
    }

    hurt(dmg, opts, game) {
      if (!this.alive) return;
      if (this.barrelBroken) dmg *= 0.55;
      this.hp -= dmg;
      this.hurtFlash = 1;
      this.shakeT = 0.22;
      this.fireT = Math.max(this.fireT, 0.35);
      if (opts && opts.limbBreak && !this.barrelBroken) {
        // breaking the turret's aiming barrel permanently reduces its threat
        this.barrelBroken = true;
        const socket = {
          x: this.x + this.facing * 30,
          y: -56,
        };
        game.fx.limb(socket.x, socket.y,
          { type: "barrel", palette: ["#6b4a2a", "#2a2016", "#c08a4a"], len: 34, w0: 7, w1: 4 },
          { vx: rand(260, -180), vy: rand(-220, -520), rot: rand(TAU, 0), spin: rand(16, -20), life: 2.6, trail: true });
        game.fx.spark(socket.x, socket.y, 1, -1, { count: 22, speed: 640, life: 0.5, color: "#ffc070", scale: 1.4 });
        game.fx.emberBurst(socket.x, socket.y, 14, "#ffb060", 300);
        game.fx.ring(socket.x, socket.y, { r1: 76, width: 4, color: "#ffd0a0", life: 0.34, squash: 0.7 });
        game.fx.text(socket.x, socket.y - 40, "炮管断裂", { color: "#ffca8a", size: 18, vy: -70, life: 0.9 });
        game.audio.limbBreak();
        game.cam.addShake(8);
        game.hitstop = Math.max(game.hitstop, 0.12);
        game.stats.limbBreaks++;
        game.focusGain && game.focusGain(8);
      }
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      if (this.dying) return;
      this.dying = true;
      game.audio.enemyDie();
      game.fx.ring(this.x, -32, { r1: 80, width: 4, color: "#ffae62", life: 0.4, squash: 0.6 });
      game.fx.spark(this.x, -34, 0, -1, { count: 26, speed: 520, life: 0.6, color: "#ffb468", grav: 600 });
      game.fx.emberBurst(this.x, -26, 20, "#ffaa58", 280);
      game.cam.addShake(6);
      this.alive = false;
      game.onEnemyDeath(this);
    }

    stun(t) {
      this.stunT = Math.max(this.stunT, t);
      this.aimT = 0;
      this.fireT = Math.max(this.fireT, 1.2);
    }
    knockdown() {}

    draw(ctx, game) {
      if (this.dying) return;
      const s = this.spawnScale;
      if (s <= 0.01) return;
      ctx.save();
      ctx.translate(this.x, 0);
      // shadow
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(0, 2, 34, 9, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      const sh = this.shakeT > 0 ? Math.sin(this.shakeT * 90) * 2.4 : 0;
      ctx.translate(sh, 0);
      ctx.scale(this.facing * s, s);
      ctx.translate(0, -(1 - s) * 20);

      const def = "rgba(0,0,0,0.5)";
      // tripod legs
      ctx.strokeStyle = "#262a30";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-15, -24); ctx.lineTo(-26, -2);
      ctx.moveTo(13, -24); ctx.lineTo(26, -2);
      ctx.moveTo(0, -22); ctx.lineTo(2, 0);
      ctx.stroke();
      ctx.strokeStyle = "#3b4148";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-17, -14); ctx.lineTo(-23, -6);
      ctx.stroke();

      // hull
      ctx.beginPath();
      ctx.moveTo(-28, -22);
      ctx.lineTo(-22, -49);
      ctx.lineTo(16, -52);
      ctx.lineTo(28, -30);
      ctx.lineTo(24, -17);
      ctx.lineTo(-22, -15);
      ctx.closePath();
      const hg = ctx.createLinearGradient(0, -52, 0, -15);
      hg.addColorStop(0, "#565c63");
      hg.addColorStop(0.55, "#363b42");
      hg.addColorStop(1, "#202327");
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = "#07090b";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // rivets
      ctx.fillStyle = "#1a1d21";
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-18 + i * 10, -19, 1.4, 0, TAU); ctx.fill(); }

      // hazard stripes
      ctx.save();
      ctx.beginPath();
      ctx.rect(-22, -30, 14, 8);
      ctx.clip();
      ctx.fillStyle = "#c79a3f";
      ctx.fillRect(-24, -32, 18, 12);
      ctx.fillStyle = "#202327";
      for (let i = -24; i < -4; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, -32); ctx.lineTo(i + 4, -32); ctx.lineTo(i - 4, -20); ctx.lineTo(i - 8, -20);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // barrel (breakable part)
      if (!this.barrelBroken) {
        ctx.save();
        ctx.translate(14, -42);
        ctx.rotate(this.cannonAngle + this.recoil * -0.15);
        ctx.fillStyle = "#4a4036";
        ctx.fillRect(-4, -7, 38, 14);
        ctx.fillStyle = "#62523f";
        ctx.fillRect(-4, -6, 30, 4);
        ctx.fillStyle = "#2a241d";
        ctx.fillRect(30, -8, 8, 16);
        ctx.fillStyle = "#c9a45c";
        ctx.fillRect(5, -7, 3, 14);
        ctx.fillRect(15, -7, 3, 14);
        if (this.aimT > 0) {
          const a = 0.35 + Math.sin(this.armT * 40) * 0.25;
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = "rgba(255,170,70," + a + ")";
          ctx.beginPath();
          ctx.arc(37, 0, 5 + (1 - this.aimT / 0.52) * 9, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        // barrel mount
        ctx.fillStyle = "#2b2f34";
        ctx.beginPath();
        ctx.arc(12, -42, 9, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#111418"; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        // stump with sparks
        ctx.fillStyle = "#2b2f34";
        ctx.beginPath();
        ctx.arc(12, -42, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#ff7a30";
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(12, -42, 4 + Math.sin(this.armT * 30) * 1.4, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      // sensor eye
      const eyeGlow = this.aimT > 0 ? 1 : 0.55 + Math.sin(this.armT * 3) * 0.15;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = this.aimT > 0 ? "rgba(255,110,60," + eyeGlow + ")" : "rgba(255,160,80," + (eyeGlow * 0.8) + ")";
      ctx.beginPath();
      ctx.arc(-10, -44, this.aimT > 0 ? 4.6 : 3.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      // broken / hurt flash
      if (this.hurtFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.hurtFlash * 0.5;
        ctx.fillStyle = "#ffd0a0";
        ctx.beginPath();
        ctx.ellipse(0, -34, 30, 22, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // hp bar
      if (this.alive && this.spawnScale >= 1 && this.hp < this.maxHp) {
        const w = 46;
        ctx.save();
        ctx.translate(this.x, -74);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(-w / 2, -2, w, 4);
        ctx.fillStyle = this.barrelBroken ? "#8b6a4a" : "#d98a4a";
        ctx.fillRect(-w / 2, -2, w * clamp(this.hp / this.maxHp, 0, 1), 4);
        ctx.restore();
      }
    }
  }

  // ==========================================================================
  // Stalker -- fast, leaping, clawed wretch
  // ==========================================================================
  class Stalker {
    constructor(game, x, tier) {
      this.game = game;
      this.id = ++ENEMY_ID;
      this.kind = "stalker";
      this.x = x;
      this.y = 0;
      this.vx = 0; this.vy = 0;
      this.facing = -1;
      this.tier = tier || 0;
      this.maxHp = 62 + this.tier * 12;
      this.hp = this.maxHp;
      this.alive = true;
      this.spawning = true;
      this.spawnT = 0.55;
      this.state = "approach";
      this.stateT = 0;
      this.animT = rand(10);
      this.hurtFlash = 0;
      this.stunT = 0;
      this.attackCd = rand(1.4, 0.5);
      this.grounded = true;
      this.airborne = false;
      this.iFrames = 0;
      this.dying = false;
      this.deadT = 0;
      this.lungeDir = 1;
      this.limbs = {
        head: { hp: 14, maxHp: 14, broken: false },
        armL: { hp: 12, maxHp: 12, broken: false },
        armR: { hp: 12, maxHp: 12, broken: false },
        legL: { hp: 10, maxHp: 10, broken: false },
        legR: { hp: 10, maxHp: 10, broken: false },
      };
      this.limbHp = { head: 14, armL: 12, armR: 12, legL: 10, legR: 10 };
      this.hitParts = [];
      this.spawnScale = 1;
      this.clawPhase = 0;
      this.lungeSpeed = 0;
      this.torsoAngle = 0;
      this.dashCd = 0;
      this.slashCd = 0;
      this.howled = false;
      this.attackName = "claw";
      this.staggerT = 0;
      this.armSwing = 0;
      this.enraged = false;
      this.tornLeg = false;
      this.weaponThrow = false;
      this.score = 10;
      this.mass = 1;
      this.poise = 8;
    }

    hurtbox() {
      return { x: this.x, y: -76, w: 44, h: 82 };
    }

    parts() {
      return [
        { key: "head", x: this.x + this.facing * 5, y: -94, r: 17, kind: "head", hp: this.limbHp.head, maxHp: 14, broken: this.limbs.head.broken, priority: 1 },
        { key: "armL", x: this.x + this.facing * -10, y: -62, r: 16, kind: "armU", hp: this.limbHp.armL, maxHp: 12, broken: this.limbs.armL.broken, priority: 1.1 },
        { key: "armR", x: this.x + this.facing * 14, y: -62, r: 16, kind: "armL", hp: this.limbHp.armR, maxHp: 12, broken: this.limbs.armR.broken, priority: 1.1 },
        { key: "legL", x: this.x + this.facing * -9, y: -24, r: 18, kind: "legU", hp: this.limbHp.legL, maxHp: 10, broken: this.limbs.legL.broken, priority: 0.5 },
        { key: "legR", x: this.x + this.facing * 9, y: -24, r: 18, kind: "legL", hp: this.limbHp.legR, maxHp: 10, broken: this.limbs.legR.broken, priority: 0.5 },
      ];
    }

    update(dt, game) {
      const p = game.player;
      if (this.dying) {
        this.deadT += dt;
        this.applyPhysics(dt, game);
        this.vx = U.approach(this.vx, 0, 700 * dt);
        return;
      }
      this.spawnT -= dt;
      if (this.spawnT > 0) {
        this.spawnScale = 1 - this.spawnT / 0.55;
        return;
      }
      this.spawning = false;
      this.spawnScale = 1;
      this.animT += dt;
      this.stateT += dt;
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      this.stunT = Math.max(0, this.stunT - dt);
      this.staggerT = Math.max(0, this.staggerT - dt);
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.iFrames = Math.max(0, this.iFrames - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);

      const dx = p.x - this.x;
      const dist = Math.abs(dx);
      if (this.stunT > 0) {
        this.vx = U.approach(this.vx, 0, 900 * dt);
        this.applyPhysics(dt, game);
        return;
      }

      const aggro = p.alive;
      if (aggro) this.facing = dx < 0 ? -1 : 1;
      const damaged = this.limbs.legL.broken && this.limbs.legR.broken;
      if (damaged && this.grounded) this.stunT = Math.max(this.stunT, 0.05);
      const speedBase = this.limbs.legL.broken && this.limbs.legR.broken ? 0 : (this.limbs.legL.broken || this.limbs.legR.broken) ? 0.6 : 1;
      const armless = this.limbs.armL.broken && this.limbs.armR.broken;
      this.armless = armless;
      // crippled legs: cannot leap
      if (damaged && (this.state === "leapPrep" || this.state === "leap")) { this.state = "approach"; this.stateT = 0; }

      switch (this.state) {
        case "approach": {
          const speed = 190 * speedBase;
          if (dist > 90) {
            this.vx = U.approach(this.vx, this.facing * speed, 1000 * dt);
          } else {
            this.vx = U.approach(this.vx, this.facing * 40, 900 * dt);
          }
          if (aggro && this.attackCd <= 0 && dist < 110) {
            this.state = "windup";
            this.stateT = 0;
            this.attackCd = 1.1;
            this.vx *= 0.2;
            game.fx.text(this.x, -116, "!", { color: "#ffc46a", size: 20, vy: -50, life: 0.4, gravity: 0 });
          }
          if (aggro && !damaged && dist > 170 && dist < 460 && this.dashCd <= 0 && Math.random() < 0.012) {
            this.state = "leapPrep";
            this.stateT = 0;
            this.dashCd = 2.2;
            this.vx = 0;
          }
          // grounded and aggrieved
          break;
        }
        case "leapPrep": {
          this.vx = U.approach(this.vx, 0, 2000 * dt);
          if (this.stateT > 0.26) {
            this.state = "leap";
            this.stateT = 0;
            this.vy = -580;
            this.vx = this.facing * 480;
            this.grounded = false;
            game.audio.jump();
            game.fx.dustPuff(this.x, 0, 5, -this.facing, 1);
          }
          break;
        }
        case "leap": {
          if (this.grounded && this.stateT > 0.1) {
            this.state = "leapStrike";
            this.stateT = 0;
          }
          if (dist < 70 && this.vy > -60) {
            this.state = "leapStrike";
            this.stateT = 0;
          }
          break;
        }
        case "leapStrike": {
          this.vx = U.approach(this.vx, 0, 1400 * dt);
          if (this.stateT > 0.16 && this.stateT < 0.34) {
            const hb = { x: this.x + this.facing * 42, y: -44, w: 80, h: 48 };
            const pb = p.hitbox();
            if (game.rectOverlap(hb, pb) && !this.hitDone) {
              this.hitDone = true;
              if (game.tryPlayerParry(this)) { /* parried */ }
              else if (!this.armless) p.takeDamage(11 + this.tier * 2, this.x, { kb: 420, kbY: -200 });
              else p.takeDamage(3, this.x, { kb: 160 });
            }
          }
          if (this.stateT > 0.42) {
            this.state = "approach";
            this.stateT = 0;
            this.attackCd = rand(1.2, 0.6);
            this.hitDone = false;
          }
          break;
        }
        case "windup": {
          if (this.stateT > 0.34) {
            this.state = "strike";
            this.stateT = 0;
            this.vx = this.facing * 220;
            game.audio.swing(1.1);
          }
          break;
        }
        case "strike": {
          this.vx = U.approach(this.vx, this.facing * 130, 900 * dt);
          if (this.stateT > 0.05 && this.stateT < 0.22) {
            const hb = { x: this.x + this.facing * 38, y: -64, w: 100, h: 60 };
            const pb = p.hitbox();
            if (game.rectOverlap(hb, pb) && !this.hitDone) {
              this.hitDone = true;
              if (game.tryPlayerParry(this)) { }
              else if (!this.armless) p.takeDamage(9 + this.tier * 2, this.x, { kb: 300 });
              else p.takeDamage(2, this.x, { kb: 120 });
            }
          }
          if (this.stateT > 0.3) {
            this.state = "recover";
            this.stateT = 0;
            this.hitDone = false;
          }
          break;
        }
        case "recover": {
          this.vx = U.approach(this.vx, 0, 1200 * dt);
          if (this.stateT > 0.38) {
            this.state = "approach";
            this.stateT = 0;
            this.attackCd = rand(1.0, 0.4);
          }
          break;
        }
        case "stagger": {
          this.vx = U.approach(this.vx, 0, 500 * dt);
          if (this.stateT > this.staggerDur) {
            this.state = "approach";
            this.stateT = 0;
            this.attackCd = 0.4;
          }
          break;
        }
        case "air": {
          this.vx = U.approach(this.vx, 0, 200 * dt);
          break;
        }
      }

      this.applyPhysics(dt, game);
      if (this.grounded) {
        if (this.state === "stagger" && this.stateT > 0.3) {
          this.state = "approach";
          this.stateT = 0;
        }
      }
    }

    applyPhysics(dt, game) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < 40) this.x = 40;
      if (this.x > game.arenaW - 40) this.x = game.arenaW - 40;
      if (this.y >= 0) {
        if (!this.grounded && this.vy > 240) {
          game.fx.dustPuff(this.x, 0, 5, 0, 0.8);
          game.audio.land();
          if (this.state === "leap") {
            this.state = "leapStrike";
            this.stateT = 0;
            this.hitDone = false;
          }
        }
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
        this.vy += 2100 * dt;
        if (this.vy > 1500) this.vy = 1500;
        if (this.state === "approach" && this.vy > 0) this.state = "air";
      }
    }

    stun(t) {
      this.stunT = Math.max(this.stunT, t);
      this.state = "stagger";
      this.stateT = 0;
      this.staggerDur = t;
      this.vx *= 0.2;
      this.hitDone = false;
    }

    knockdown(power) {
      this.stun(Math.max(0.5, power));
      this.vy = -(160 + power * 120);
      this.y = -0.5;
      this.grounded = false;
      this.state = "air";
      this.stateT = 0;
    }

    severPart(key, game, contact) {
      const L = this.limbs[key];
      if (!L || L.broken) return;
      L.broken = true;
      const f = this.facing;
      const px = this.x + f * (key === "head" ? 4 : key.startsWith("leg") ? 10 : 16);
      const py = key === "head" ? -94 : key.startsWith("leg") ? -26 : -62;
      if (key === "head") {
        game.spawnLimbDebris(this, "head", px, py);
        game.cam.punchZoom(0.03);
      } else {
        game.spawnLimbDebris(this, key, px, py);
        game.fx.dustPuff(this.x, 0, 4, 0, 0.7);
      }
    }

    hurt(dmg, opts, game) {
      if (!this.alive) return;
      if (this.iFrames > 0) return;
      this.hp -= dmg;
      this.hurtFlash = 1;
      this.attackCd = Math.max(this.attackCd, 0.2);
      if (this.state === "windup" && dmg > 4) {
        this.state = "stagger";
        this.stateT = 0;
        this.staggerDur = 0.28;
      }
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      if (this.dying) return;
      this.dying = true;
      this.alive = false;
      game.audio.enemyDie();
      game.fx.emberBurst(this.x, -40, 16, "#ff9a5a", 260);
      game.onEnemyDeath(this);
    }

    draw(ctx, game) {
      if (this.dying && this.deadT > 0.9) return;
      const s = this.spawnScale;
      ctx.save();
      ctx.translate(this.x, this.y);
      // shadow
      ctx.globalAlpha = clamp(0.4 + this.y / 600, 0.1, 0.45);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(0, 2, 26, 6, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.scale(this.facing * s, s);

      // choose pose
      let pose = EPOSES.idle[0];
      const t = this.animT;
      switch (this.state) {
        case "approach":
          pose = Math.abs(this.vx) > 40 ? (Math.sin(t * 15) > 0 ? EPOSES.runA : EPOSES.runB) : EPOSES.idle[0];
          break;
        case "windup": pose = G.lerpPose(EPOSES.clawA, EPOSES.clawB, clamp(this.stateT / 0.34, 0, 1) * 0.25); break;
        case "strike": pose = this.stateT < 0.1 ? EPOSES.clawB : EPOSES.windup; break;
        case "leapPrep": pose = EPOSES.leapA; break;
        case "leap": pose = this.vy < 0 ? EPOSES.leapA : EPOSES.leapB; break;
        case "leapStrike":
        case "air": pose = EPOSES.leapB; break;
        case "stagger": pose = Math.sin(t * 26) > 0 ? EPOSES.stagger : EPOSES.stagger2; break;
        case "recover": pose = EPOSES.idle[0]; break;
        default: pose = EPOSES.idle[0];
      }
      if (this.dying) {
        pose = G.lerpPose(pose, EPOSES.death, clamp(this.deadT / 0.5, 0, 1));
      }
      const sk = G.makeSkel(pose, G.DIMS.stalker);
      this.sk = sk;

      // limbs: use skel points but hide broken ones
      const hide = this.limbs;
      const skin = "#2b3a3c";
      const skin2 = "#1d282a";
      const rim = "#4e6a68";
      const boneCol = "#8fa0a0";

      // back leg
      if (!hide.legL.broken) this.drawLimb(ctx, sk.backLeg.hip, sk.backLeg.knee, sk.backLeg.foot, 7, 3.5, skin2, rim, "leg");
      // back arm
      if (!hide.armL.broken) this.drawLimb(ctx, sk.backArm.sh, sk.backArm.el, sk.backArm.hand, 5.5, 3, skin2, rim, "arm");
      // torso
      this.drawTorso(ctx, sk, pose, hide);
      // front leg
      if (!hide.legR.broken) this.drawLimb(ctx, sk.frontLeg.hip, sk.frontLeg.knee, sk.frontLeg.foot, 7.5, 3.8, skin, rim, "leg");
      // front arm
      if (!hide.armR.broken) {
        this.drawLimb(ctx, sk.frontArm.sh, sk.frontArm.el, sk.frontArm.hand, 6, 3.2, skin, rim, "arm");
        this.drawClaw(ctx, sk.frontArm.hand, this.state === "windup" || this.state === "leapPrep" ? 1 : 0);
      }
      if (!hide.armL.broken) this.drawClaw(ctx, sk.backArm.hand, 0, true);
      // head
      if (!hide.head.broken) this.drawHead(ctx, sk, hide);

      // ember eye / horns glow
      if (this.hurtFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.hurtFlash * 0.55;
        ctx.fillStyle = "#ffb070";
        ctx.beginPath();
        ctx.ellipse(0, -54, 22, 40, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // hp bar
      if (this.alive && this.spawnScale >= 1 && this.hp < this.maxHp) {
        const w = 44;
        ctx.save();
        ctx.translate(this.x, -118);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(-w / 2, -2, w, 3.5);
        ctx.fillStyle = "#cf7a4e";
        ctx.fillRect(-w / 2, -2, w * clamp(this.hp / this.maxHp, 0, 1), 3.5);
        ctx.restore();
      }
    }

    drawLimb(ctx, a, b, c, w0, w1, fill, rim, type) {
      G.taperedLimb(ctx, a, b, w0, w1 + 0.8, fill, "#05080a", null);
      G.taperedLimb(ctx, b, c, w1 + 0.8, w1 * 0.7, fill, "#05080a", rim);
      G.joint(ctx, b, w1 + 0.6, "#141c1e", "#05080a");
      if (type === "leg") {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.fillStyle = "#111718";
        ctx.beginPath();
        ctx.moveTo(-4, 0); ctx.lineTo(10, -1); ctx.lineTo(12, 3); ctx.lineTo(-5, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    drawTorso(ctx, sk, pose, hide) {
      const hip = sk.hip, neck = sk.neck;
      const ang = Math.atan2(neck.y - hip.y, neck.x - hip.x) + P2R;
      ctx.save();
      ctx.translate((hip.x + neck.x) / 2, (hip.y + neck.y) / 2);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-16, 20);
      ctx.quadraticCurveTo(-22, -2, -12, -20);
      ctx.lineTo(8, -22);
      ctx.quadraticCurveTo(18, -2, 14, 18);
      ctx.quadraticCurveTo(4, 25, -4, 23);
      ctx.closePath();
      ctx.fillStyle = "#263234";
      ctx.fill();
      ctx.strokeStyle = "#06090b";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // ribs
      ctx.strokeStyle = "rgba(160,190,180,0.22)";
      ctx.lineWidth = 1.6;
      for (let i = -12; i <= 10; i += 7) {
        ctx.beginPath();
        ctx.moveTo(-12, i);
        ctx.quadraticCurveTo(0, i + 4, 13, i - 2);
        ctx.stroke();
      }
      // ember core
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(1, -2, 1, 1, -2, 12);
      g.addColorStop(0, "rgba(255,140,60,0.55)");
      g.addColorStop(1, "rgba(255,90,30,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(1, -2, 12, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }

    drawClaw(ctx, hand, raise, back) {
      const len = 15;
      const spread = raise ? 0.6 : 0.25;
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.strokeStyle = "#cfd8d2";
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        const a = -0.15 + i * spread;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a) * len * 0.7, Math.sin(a) * len * 0.7 + 3, Math.cos(a + 0.2) * len, Math.sin(a + 0.2) * len + 7);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawHead(ctx, sk, hide) {
      const h = sk.head;
      ctx.save();
      ctx.translate(h.x, h.y);
      // skull
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 11, -0.08, 0, TAU);
      ctx.fillStyle = "#b3a68d";
      ctx.fill();
      ctx.strokeStyle = "#0a0d0e";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // jaw
      ctx.beginPath();
      ctx.moveTo(-7, 5);
      ctx.lineTo(4, 9);
      ctx.lineTo(8, 4);
      ctx.closePath();
      ctx.fillStyle = "#8f846d";
      ctx.fill();
      // eye sockets
      ctx.fillStyle = "#0b0f10";
      ctx.beginPath();
      ctx.ellipse(3, -1, 3.6, 3, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-3, 0, 2.4, 2.2, 0, 0, TAU);
      ctx.fill();
      // ember eye
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,110,40,0.95)";
      ctx.beginPath();
      ctx.arc(3.4, -1, 1.5 + Math.sin(this.animT * 5) * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,120,40,0.25)";
      ctx.beginPath();
      ctx.arc(3.4, -1, 5, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // horns
      ctx.strokeStyle = "#d9cfb8";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-3, -8);
      ctx.quadraticCurveTo(-9, -18, -14, -20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, -9);
      ctx.quadraticCurveTo(8, -17, 13, -19);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ==========================================================================
  // Blade Fiend -- the heavy swordsman (original "blade" class)
  // ==========================================================================
  class BladeFiend {
    constructor(game, x, tier) {
      this.game = game;
      this.id = ++ENEMY_ID;
      this.kind = "blade";
      this.x = x;
      this.y = 0;
      this.vx = 0; this.vy = 0;
      this.facing = -1;
      this.tier = tier || 0;
      this.maxHp = 170 + this.tier * 40;
      this.hp = this.maxHp;
      this.alive = true;
      this.spawning = true;
      this.spawnT = 0.85;
      this.state = "advance";
      this.stateT = 0;
      this.animT = rand(10);
      this.hurtFlash = 0;
      this.stunT = 0;
      this.attackCd = rand(1.6, 0.9);
      this.grounded = true;
      this.dying = false;
      this.deadT = 0;
      this.hitDone = false;
      this.attackPhase = 0;
      this.limbs = {
        head: { hp: 30, maxHp: 30, broken: false },
        armL: { hp: 42, maxHp: 42, broken: false },
        armR: { hp: 42, maxHp: 42, broken: false },
        legL: { hp: 36, maxHp: 36, broken: false },
        legR: { hp: 36, maxHp: 36, broken: false },
      };
      this.limbHp = { head: 30, armL: 42, armR: 42, legL: 36, legR: 36 };
      this.spawnScale = 1;
      this.armSwing = 0;
      this.torsoAngle = 0;
      this.weapon = { ang: 55 };
      this.chargeGlow = 0;
      this.score = 50;
      this.mass = 2.4;
      this.poise = 20;
      this.attackPattern = 0;
      this.guard = false;
      this.guardT = 0;
      this.slashCd = 0;
      this.recoverDur = 0.5;
      this.enraged = false;
      this.headBroken = false;
      this.staggerT = 0;
      this.stumble = 0;
      this.tauntT = 0;
      this.jumpCd = 0;
      this.dashSlashCd = 0;
      this.weaponBroken = false;
      this.armless = false;
      this.attackKind = "chop";
    }

    hurtbox() {
      return { x: this.x, y: -100, w: 54, h: 106 };
    }

    parts() {
      const f = this.facing;
      return [
        { key: "head", x: this.x + f * 3, y: -118, r: 17, kind: "head", hp: this.limbHp.head, maxHp: 30, broken: this.limbs.head.broken, priority: 1.2 },
        { key: "armL", x: this.x - f * 12, y: -80, r: 18, kind: "armU", hp: this.limbHp.armL, maxHp: 42, broken: this.limbs.armL.broken, priority: 1.35 },
        { key: "armR", x: this.x + f * 18, y: -82, r: 19, kind: "armL", hp: this.limbHp.armR, maxHp: 42, broken: this.limbs.armR.broken, priority: 1.35 },
        { key: "legL", x: this.x - f * 11, y: -32, r: 22, kind: "legU", hp: this.limbHp.legL, maxHp: 36, broken: this.limbs.legL.broken, priority: 0.35 },
        { key: "legR", x: this.x + f * 13, y: -32, r: 22, kind: "legL", hp: this.limbHp.legR, maxHp: 36, broken: this.limbs.legR.broken, priority: 0.35 },
      ];
    }

    update(dt, game) {
      const p = game.player;
      if (this.dying) {
        this.deadT += dt;
        this.applyPhysics(dt, game);
        this.vx = U.approach(this.vx, 0, 600 * dt);
        return;
      }
      this.spawnT -= dt;
      if (this.spawnT > 0) {
        this.spawnScale = 1 - this.spawnT / 0.85;
        return;
      }
      this.spawning = false;
      this.spawnScale = 1;
      this.animT += dt;
      this.stateT += dt;
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      this.stunT = Math.max(0, this.stunT - dt);
      this.staggerT = Math.max(0, this.staggerT - dt);
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.dashSlashCd = Math.max(0, this.dashSlashCd - dt);
      this.jumpCd = Math.max(0, this.jumpCd - dt);
      this.chargeGlow = Math.max(0, this.chargeGlow - dt * 2);

      const dx = p.x - this.x;
      const dist = Math.abs(dx);
      if (p.alive) this.facing = dx < 0 ? -1 : 1;

      if (this.stunT > 0) {
        this.vx = U.approach(this.vx, 0, 700 * dt);
        this.applyPhysics(dt, game);
        return;
      }

      const legBroken = (this.limbs.legL.broken ? 1 : 0) + (this.limbs.legR.broken ? 1 : 0);
      const speed = (legBroken >= 2 ? 0 : legBroken === 1 ? 0.55 : 1) * 155;
      const bothArms = this.limbs.armL.broken && this.limbs.armR.broken;
      this.weaponBroken = this.limbs.armR.broken;
      const pAlive = p.alive;
      if (bothArms && (this.state === "chopWind" || this.state === "slashWind" || this.state === "dashPrep" || this.state === "dashStrike")) {
        this.state = "advance"; this.stateT = 0;
      }

      switch (this.state) {
        case "advance": {
          if (!pAlive) {
            this.vx = U.approach(this.vx, 0, 800 * dt);
            break;
          }
          if (dist > 120) this.vx = U.approach(this.vx, this.facing * speed, 700 * dt);
          else this.vx = U.approach(this.vx, 0, 1000 * dt);
          if (this.attackCd <= 0 && dist < 170 && !bothArms) {
            this.chooseAttack(dist);
          }
          if (this.attackCd <= 0 && dist > 260 && dist < 620 && this.dashSlashCd <= 0 && !bothArms) {
            this.state = "dashPrep";
            this.stateT = 0;
            this.dashSlashCd = 3.4;
          }
          break;
        }
        case "dashPrep": {
          this.vx = U.approach(this.vx, 0, 2200 * dt);
          this.chargeGlow = 1;
          if (this.stateT > 0.45) {
            this.state = "dashStrike";
            this.stateT = 0;
            this.vx = this.facing * 900;
            this.hitDone = false;
            game.audio.swing(1.7);
            game.fx.dustPuff(this.x, 0, 8, -this.facing, 1.2);
          }
          break;
        }
        case "dashStrike": {
          if (this.stateT < 0.32) {
            const hb = { x: this.x + this.facing * 44, y: -96, w: 110, h: 96 };
            const pb = p.hitbox();
            if (!this.hitDone && game.rectOverlap(hb, pb)) {
              this.hitDone = true;
              if (game.tryPlayerParry(this)) { }
              else p.takeDamage(18 + this.tier * 3, this.x, { kb: 520, kbY: -260 });
            }
            if (Math.random() < 0.5) game.fx.ghost(this.x, this.y, this.currentPose || EPOSES.idle[0], this.facing, { life: 0.2, alpha: 0.2, color: "#ff9b60" });
          }
          this.vx = U.approach(this.vx, 0, 2500 * dt);
          if (this.stateT > 0.42) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = rand(1.2, 0.6);
          }
          break;
        }
        case "chopWind": {
          this.vx = U.approach(this.vx, 0, 900 * dt);
          this.chargeGlow = clamp(this.stateT / this.windDur, 0, 1) * 0.7;
          if (this.stateT > this.windDur) {
            this.state = "chopStrike";
            this.stateT = 0;
            this.hitDone = false;
            this.vx = this.facing * 260;
            game.audio.swing(1.9);
            game.fx.ring(this.x + this.facing * 50, -96, { r1: 54, width: 3, color: "#ffb168", life: 0.2, squash: 0.7 });
          }
          break;
        }
        case "chopStrike": {
          this.vx = U.approach(this.vx, this.facing * 120, 1200 * dt);
          if (this.stateT > 0.02 && this.stateT < 0.2) {
            const hb = { x: this.x + this.facing * 52, y: -108, w: 130, h: 120 };
            const pb = p.hitbox();
            if (!this.hitDone && game.rectOverlap(hb, pb)) {
              this.hitDone = true;
              if (!game.tryPlayerParry(this)) p.takeDamage(20 + this.tier * 3, this.x, { kb: 400, kbY: -150 });
              game.fx.spark(this.x + this.facing * 70, -26, 1, 1, { count: 14, speed: 460, life: 0.4, color: "#ffcf9a" });
              game.fx.dustPuff(this.x + this.facing * 60, 0, 6, this.facing, 1.1);
              game.cam.addShake(5);
            }
            if (this.stateT > 0.06 && !this.slamDone) {
              this.slamDone = true;
              game.cam.addShake(4);
              game.fx.dustPuff(this.x + this.facing * 60, 0, 8, this.facing, 1.0);
            }
          }
          if (this.stateT > 0.3) {
            this.state = "recover";
            this.stateT = 0;
            this.hitDone = false;
            this.slamDone = false;
          }
          break;
        }
        case "recover": {
          this.vx = U.approach(this.vx, 0, 1400 * dt);
          if (this.stateT > this.recoverDur) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = rand(1.1, 0.5);
          }
          break;
        }
        case "stagger": {
          this.vx = U.approach(this.vx, 0, 600 * dt);
          if (this.stateT > this.staggerDur) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = 0.5;
          }
          break;
        }
        case "knockdown": {
          this.vx = U.approach(this.vx, 0, 120 * dt);
          if (this.stateT > this.knockDur) {
            this.state = "getup";
            this.stateT = 0;
          }
          break;
        }
        case "getup": {
          if (this.stateT > 0.35) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = 0.3;
          }
          break;
        }
        case "slashWind": {
          this.vx = U.approach(this.vx, this.facing * 40, 800 * dt);
          this.chargeGlow = clamp(this.stateT / this.windDur, 0, 1) * 0.5;
          if (this.stateT > this.windDur) {
            this.state = "slashStrike";
            this.stateT = 0;
            this.hitDone = false;
            this.vx = this.facing * 480;
            game.audio.swing(1.4);
          }
          break;
        }
        case "slashStrike": {
          if (this.stateT < 0.2) {
            const hb = { x: this.x + this.facing * 46, y: -96, w: 110, h: 86 };
            const pb = p.hitbox();
            if (!this.hitDone && game.rectOverlap(hb, pb)) {
              this.hitDone = true;
              if (!game.tryPlayerParry(this)) p.takeDamage(12 + this.tier * 2, this.x, { kb: 340 });
            }
          }
          this.vx = U.approach(this.vx, 0, 1800 * dt);
          if (this.stateT > 0.26) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = rand(0.9, 0.45);
          }
          break;
        }
        case "air": {
          if (this.grounded && this.stateT > 0.08) {
            this.state = "advance";
            this.stateT = 0;
          }
          break;
        }
      }
      this.applyPhysics(dt, game);
    }

    chooseAttack(dist) {
      const canBoth = !(this.limbs.armL.broken || this.limbs.armR.broken);
      this.attackPattern = (this.attackPattern + 1) % 3;
      if (this.attackPattern === 0) {
        this.state = "chopWind";
        this.stateT = 0;
        this.windDur = 0.55 - this.tier * 0.04;
        this.recoverDur = 0.42;
        this.attackKind = "chop";
      } else if (this.attackPattern === 1) {
        this.state = "slashWind";
        this.stateT = 0;
        this.windDur = 0.36;
        this.recoverDur = 0.34;
        this.attackKind = "slash";
      } else {
        this.state = "chopWind";
        this.stateT = 0;
        this.windDur = 0.66 - this.tier * 0.04;
        this.recoverDur = 0.36;
        this.attackKind = "chop";
      }
      this.attackCd = 1.2;
      this.game.fx.text(this.x, -140, "!", { color: "#ffb454", size: 20, vy: -40, life: 0.3, gravity: 0 });
    }

    applyPhysics(dt, game) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < 40) this.x = 40;
      if (this.x > game.arenaW - 40) this.x = game.arenaW - 40;
      if (this.y >= 0) {
        if (!this.grounded && this.vy > 300) {
          game.fx.dustPuff(this.x, 0, 6, 0, 1);
          game.audio.land();
        }
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
        this.vy += 2100 * dt;
        if (this.vy > 1500) this.vy = 1500;
      }
    }

    stun(t) {
      this.stunT = Math.max(this.stunT, t);
      this.state = "stagger";
      this.stateT = 0;
      this.staggerDur = t;
      this.hitDone = false;
    }

    knockdown(power) {
      this.state = "knockdown";
      this.stateT = 0;
      this.knockDur = Math.max(0.6, power * 0.7);
      this.vy = -(220 + power * 100);
      this.y = -0.1;
      this.grounded = false;
      this.hitDone = false;
    }

    severPart(key, game, contact) {
      const L = this.limbs[key];
      if (!L || L.broken) return;
      L.broken = true;
      const f = this.facing;
      if (key === "head") {
        game.spawnLimbDebris(this, "head", this.x + f * 4, -118);
        game.cam.punchZoom(0.03);
      } else if (key === "armR" || key === "armL") {
        game.spawnLimbDebris(this, key, this.x + f * 16, -80);
        if (this.limbs.armL.broken && this.limbs.armR.broken) this.weaponBroken = true;
      } else {
        game.spawnLimbDebris(this, key, this.x + f * 12, -32);
        game.fx.dustPuff(this.x, 0, 5, 0, 0.8);
      }
    }

    hurt(dmg, opts, game) {
      if (!this.alive) return;
      this.hp -= dmg;
      this.hurtFlash = 1;
      if (this.state === "chopWind" || this.state === "slashWind" || this.state === "dashPrep") {
        if (dmg > 8) {
          this.state = "stagger";
          this.stateT = 0;
          this.staggerDur = 0.32;
        }
      }
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      if (this.dying) return;
      this.dying = true;
      this.alive = false;
      game.audio.enemyDie();
      game.cam.addShake(7);
      game.fx.emberBurst(this.x, -60, 20, "#ffa060", 300);
      game.onEnemyDeath(this);
    }

    draw(ctx, game) {
      if (this.dying && this.deadT > 1.6) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = clamp(0.45 + this.y / 600, 0.12, 0.5);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(0, 2, 32, 7, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      const s = this.spawnScale;
      ctx.scale(this.facing * s, s);

      let pose = EPOSES.idle[0];
      const t = this.animT;
      switch (this.state) {
        case "advance": pose = Math.abs(this.vx) > 30 ? (Math.sin(t * 10) > 0 ? EPOSES.walkA : EPOSES.walkB) : EPOSES.idle[0]; break;
        case "chopWind": pose = G.lerpPose(EPOSES.windup, EPOSES.windupB, clamp(this.stateT / this.windDur, 0, 1)); break;
        case "chopStrike": pose = this.stateT < 0.1 ? EPOSES.strike : EPOSES.strikeB; break;
        case "slashWind": pose = G.lerpPose(EPOSES.windup, EPOSES.chargeA, 0.4); break;
        case "slashStrike": pose = EPOSES.chargeB; break;
        case "dashPrep": pose = EPOSES.chargeA; break;
        case "dashStrike": pose = EPOSES.chargeB; break;
        case "stagger": pose = Math.sin(t * 24) > 0 ? EPOSES.stagger : EPOSES.stagger2; break;
        case "knockdown":
        case "getup": pose = G.lerpPose(EPOSES.airDown, EPOSES.idle[0], clamp(this.stateT / 0.4, 0, 1) * 0.3); break;
        case "recover": pose = EPOSES.idle[0]; break;
        default: pose = EPOSES.idle[0];
      }
      if (this.dying) pose = G.lerpPose(pose, EPOSES.death, clamp(this.deadT / 0.7, 0, 1));
      this.currentPose = pose;
      const sk = G.makeSkel(pose, G.DIMS.blade);
      this.sk = sk;

      const L = this.limbs;
      const armor = "#4a3b2e";
      const armor2 = "#2e241b";
      const rim = "#9a7a52";

      // cape behind
      this.drawCape(ctx, sk);

      // back leg
      if (!L.legL.broken) this.drawArmoredLimb(ctx, sk.backLeg.hip, sk.backLeg.knee, sk.backLeg.foot, 11, 6, armor2, "#0a0806");
      // back arm
      if (!L.armL.broken) this.drawArmoredArm(ctx, sk.backArm, armor2, null);
      // torso
      this.drawTorso(ctx, sk);
      // front leg
      if (!L.legR.broken) this.drawArmoredLimb(ctx, sk.frontLeg.hip, sk.frontLeg.knee, sk.frontLeg.foot, 11.5, 6.5, armor, rim);
      // head
      if (!L.head.broken) this.drawHelm(ctx, sk);
      // front arm + weapon
      if (!L.armR.broken) {
        this.drawArmoredArm(ctx, sk.frontArm, armor, rim);
        if (this.state !== "stagger" || Math.sin(t * 20) > -0.4) {
          if (!this.weaponBroken) {
            this.drawBlade(ctx, sk);
          }
        }
      }

      // charge glow
      if (this.chargeGlow > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(0, -80, 5, 0, -80, 60);
        g.addColorStop(0, "rgba(255,120,40," + (0.18 * this.chargeGlow) + ")");
        g.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-80, -150, 160, 150);
        ctx.restore();
      }

      if (this.hurtFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.hurtFlash * 0.5;
        ctx.fillStyle = "#ffd0a0";
        ctx.beginPath();
        ctx.ellipse(0, -62, 30, 54, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // health bar
      if (this.alive && this.spawnScale >= 1) {
        const w = 72;
        ctx.save();
        ctx.translate(this.x, -166);
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(-w / 2 - 1, -3, w + 2, 6);
        const frac = clamp(this.hp / this.maxHp, 0, 1);
        const grd = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        grd.addColorStop(0, "#c8552e");
        grd.addColorStop(1, "#e8a45c");
        ctx.fillStyle = grd;
        ctx.fillRect(-w / 2, -2, w * frac, 4);
        // broken limb pips
        const list = ["head", "armL", "armR", "legL", "legR"];
        for (let i = 0; i < list.length; i++) {
          const k = list[i];
          ctx.fillStyle = this.limbs[k].broken ? "#3a2a1e" : "rgba(255,200,150,0.55)";
          ctx.fillRect(-w / 2 + i * 9, 4, 6, 2);
        }
        ctx.restore();
      }
    }

    drawArmoredLimb(ctx, a, b, c, w0, w1, fill, rim) {
      G.taperedLimb(ctx, a, b, w0, w1 + 1, fill, "#080605", null);
      G.taperedLimb(ctx, b, c, w1 + 1, w1 * 0.6, fill, "#080605", rim);
      G.joint(ctx, b, w1 + 1.2, "#241c15", "#080605");
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.fillStyle = "#1a140f";
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(13, -1); ctx.lineTo(16, 5); ctx.lineTo(-8, 5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#080605"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    drawArmoredArm(ctx, arm, fill, rim) {
      G.taperedLimb(ctx, arm.sh, arm.el, 9, 7, fill, "#080605", null);
      G.taperedLimb(ctx, arm.el, arm.hand, 7, 5.5, fill, "#080605", rim);
      G.joint(ctx, arm.el, 5.5, "#3a2c20", "#080605");
      G.joint(ctx, arm.hand, 5.2, "#241a12", "#080605");
    }

    drawTorso(ctx, sk) {
      const hip = sk.hip, neck = sk.neck;
      const ang = Math.atan2(neck.y - hip.y, neck.x - hip.x) + P2R;
      ctx.save();
      ctx.translate((hip.x + neck.x) / 2, (hip.y + neck.y) / 2);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-22, 26);
      ctx.quadraticCurveTo(-30, 0, -20, -28);
      ctx.lineTo(16, -30);
      ctx.quadraticCurveTo(30, -4, 22, 24);
      ctx.quadraticCurveTo(6, 32, -8, 30);
      ctx.closePath();
      const g = ctx.createLinearGradient(-24, 0, 24, 0);
      g.addColorStop(0, "#3c3126");
      g.addColorStop(0.5, "#4e3e2f");
      g.addColorStop(1, "#2b2219");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "#080605";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // plate seams
      ctx.strokeStyle = "rgba(20,14,10,0.8)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-16, -16); ctx.quadraticCurveTo(0, -4, 16, -18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-18, 6); ctx.quadraticCurveTo(0, 16, 18, 4);
      ctx.stroke();
      // shoulder plates
      ctx.fillStyle = "#5a4633";
      ctx.beginPath();
      ctx.ellipse(-20, -20, 10, 7, -0.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#080605"; ctx.stroke();
      // glowing core (heart/vulnerable spot)
      ctx.globalCompositeOperation = "lighter";
      const cg = ctx.createRadialGradient(0, 2, 1, 0, 2, 16);
      cg.addColorStop(0, "rgba(255,140,60,0.7)");
      cg.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 2, 16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,220,160,0.9)";
      ctx.beginPath();
      ctx.arc(0, 2, 3.4 + Math.sin(this.animT * 5) * 0.6, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }

    drawCape(ctx, sk) {
      const neck = sk.neck;
      const flow = clamp(Math.abs(this.vx) / 300, 0.3, 1.6);
      const t = this.animT;
      ctx.save();
      ctx.translate(neck.x - 8, neck.y + 10);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-26, 10 + Math.sin(t * 7) * 4, -40 - flow * 20, 36 + Math.sin(t * 6 + 1) * 6);
      ctx.quadraticCurveTo(-22, 62, -6, 52);
      ctx.quadraticCurveTo(-8, 26, 2, 6);
      ctx.closePath();
      ctx.fillStyle = "#341d18";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,110,50,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    drawHelm(ctx, sk) {
      const h = sk.head;
      ctx.save();
      ctx.translate(h.x, h.y);
      // helmet shape
      ctx.beginPath();
      ctx.moveTo(-12, 2);
      ctx.quadraticCurveTo(-13, -13, 0, -14);
      ctx.quadraticCurveTo(13, -13, 12, 2);
      ctx.lineTo(8, 11);
      ctx.lineTo(-8, 11);
      ctx.closePath();
      ctx.fillStyle = "#57452f";
      ctx.fill();
      ctx.strokeStyle = "#080605";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // face slit
      ctx.fillStyle = "#0a0806";
      ctx.fillRect(-1, -3, 14, 4);
      // eye ember
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,120,40,0.9)";
      ctx.beginPath();
      ctx.arc(7, -1, 1.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,110,30,0.25)";
      ctx.beginPath();
      ctx.arc(7, -1, 5.5, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // horns
      ctx.strokeStyle = "#8d7a5c";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.quadraticCurveTo(-16, -22, -12, -30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(6, -11);
      ctx.quadraticCurveTo(16, -23, 20, -28);
      ctx.stroke();
      ctx.restore();
    }

    drawBlade(ctx, sk) {
      const w = sk.weapon;
      const ang = w.ang * D2R;
      // polearm / greatsword silhouette
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(ang);
      // shaft
      ctx.strokeStyle = "#2a2018";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(16, 0);
      ctx.stroke();
      ctx.strokeStyle = "#6b5438";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-22, -1.6);
      ctx.lineTo(14, -1.6);
      ctx.stroke();
      // guard
      ctx.fillStyle = "#3b2c1e";
      ctx.fillRect(14, -9, 5, 18);
      // blade (broad cleaver shape)
      const grad = ctx.createLinearGradient(0, -9, 0, 9);
      grad.addColorStop(0, "#d6d0c2");
      grad.addColorStop(0.5, "#8a8578");
      grad.addColorStop(0.52, "#ffb070");
      grad.addColorStop(1, "#3c3a34");
      ctx.beginPath();
      ctx.moveTo(19, -9);
      ctx.lineTo(60, -13);
      ctx.lineTo(84, -4);
      ctx.lineTo(60, 12);
      ctx.lineTo(19, 9);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#0d0a07";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // emissive edge
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,150,80,0.5)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(22, 8);
      ctx.lineTo(60, 11);
      ctx.lineTo(84, -4);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }
  }

  // ==========================================================================
  // Brute -- huge armored battering ram (kind "brute")
  // ==========================================================================
  class Brute {
    constructor(game, x, tier) {
      this.game = game;
      this.id = ++ENEMY_ID;
      this.kind = "brute";
      this.x = x;
      this.y = 0;
      this.vx = 0; this.vy = 0;
      this.facing = -1;
      this.tier = tier || 0;
      this.maxHp = 310 + this.tier * 60;
      this.hp = this.maxHp;
      this.alive = true;
      this.spawning = true;
      this.spawnT = 1.1;
      this.state = "advance";
      this.stateT = 0;
      this.animT = rand(10);
      this.hurtFlash = 0;
      this.stunT = 0;
      this.attackCd = rand(2.2, 1.2);
      this.grounded = true;
      this.dying = false;
      this.deadT = 0;
      this.hitDone = false;
      this.limbs = {
        head: { hp: 60, maxHp: 60, broken: false },
        armL: { hp: 90, maxHp: 90, broken: false },
        armR: { hp: 90, maxHp: 90, broken: false },
        legL: { hp: 80, maxHp: 80, broken: false },
        legR: { hp: 80, maxHp: 80, broken: false },
      };
      this.limbHp = { head: 60, armL: 90, armR: 90, legL: 80, legR: 80 };
      this.spawnScale = 1;
      this.fireVents = 0;
      this.guard = false;
      this.score = 120;
      this.mass = 5;
      this.poise = 40;
      this.staggerDur = 0;
      this.knockDur = 0;
      this.windDur = 0;
      this.recoverDur = 0.6;
      this.attackKind = "slam";
      this.bloodT = 0;
      this.steamT = 0;
      this.stompCd = 0;
      this.overheat = 0;
    }

    hurtbox() {
      return { x: this.x, y: -132, w: 76, h: 138 };
    }

    parts() {
      const f = this.facing;
      return [
        { key: "head", x: this.x + f * 4, y: -156, r: 20, kind: "head", hp: this.limbHp.head, maxHp: 60, broken: this.limbs.head.broken, priority: 1.3 },
        { key: "armL", x: this.x - f * 16, y: -106, r: 23, kind: "armU", hp: this.limbHp.armL, maxHp: 90, broken: this.limbs.armL.broken, priority: 1.5 },
        { key: "armR", x: this.x + f * 24, y: -106, r: 23, kind: "armL", hp: this.limbHp.armR, maxHp: 90, broken: this.limbs.armR.broken, priority: 1.5 },
        { key: "legL", x: this.x - f * 16, y: -36, r: 28, kind: "legU", hp: this.limbHp.legL, maxHp: 80, broken: this.limbs.legL.broken, priority: 0.3 },
        { key: "legR", x: this.x + f * 18, y: -36, r: 28, kind: "legL", hp: this.limbHp.legR, maxHp: 80, broken: this.limbs.legR.broken, priority: 0.3 },
      ];
    }

    update(dt, game) {
      const p = game.player;
      if (this.dying) {
        this.deadT += dt;
        this.applyPhysics(dt, game);
        this.vx = U.approach(this.vx, 0, 500 * dt);
        return;
      }
      this.spawnT -= dt;
      if (this.spawnT > 0) {
        this.spawnScale = 1 - this.spawnT / 1.1;
        return;
      }
      this.spawning = false;
      this.spawnScale = 1;
      this.animT += dt;
      this.stateT += dt;
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      this.stunT = Math.max(0, this.stunT - dt);
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.stompCd = Math.max(0, this.stompCd - dt);
      this.overheat = Math.max(0, this.overheat - dt);

      const dx = p.x - this.x;
      const dist = Math.abs(dx);
      if (p.alive && this.state !== "slamWind" && this.state !== "slamStrike") this.facing = dx < 0 ? -1 : 1;

      if (this.stunT > 0) {
        this.vx = U.approach(this.vx, 0, 500 * dt);
        this.applyPhysics(dt, game);
        return;
      }

      const legBroken = (this.limbs.legL.broken ? 1 : 0) + (this.limbs.legR.broken ? 1 : 0);
      const speed = (legBroken >= 2 ? 0 : legBroken === 1 ? 40 : 88);
      const bothArms = this.limbs.armL.broken && this.limbs.armR.broken;
      if (bothArms && (this.state === "slamWind" || this.state === "slamStrike")) {
        this.state = "advance"; this.stateT = 0;
      }

      switch (this.state) {
        case "advance": {
          this.vx = U.approach(this.vx, p.alive && dist > 130 ? this.facing * speed : 0, 500 * dt);
          if (this.attackCd <= 0 && p.alive && !bothArms) {
            if (dist < 190) {
              this.state = "slamWind";
              this.stateT = 0;
              this.windDur = 0.75 - this.tier * 0.05;
              this.attackKind = "slam";
              this.attackCd = 1.8;
              this.game.fx.text(this.x, -206, "危", { color: "#ff5a3a", size: 26, vy: -40, life: 0.62, gravity: 0 });
              this.game.fx.ring(this.x, 0, { r1: 90, width: 4, color: "#ff6a3a", life: 0.2, squash: 0.3 });
            } else if (dist < 420 && dist > 120) {
              this.state = "chargeWind";
              this.stateT = 0;
              this.windDur = 0.6;
              this.attackCd = 2.4;
            }
          }
          if (this.stompCd <= 0 && dist < 70 && p.alive && legBroken < 2) {
            this.state = "stompWind";
            this.stateT = 0;
            this.windDur = 0.38;
            this.stompCd = 2.6;
          }
          break;
        }
        case "slamWind": {
          this.vx = U.approach(this.vx, 0, 700 * dt);
          this.overheat = clamp(this.stateT / this.windDur, 0, 1);
          this.steamT -= dt;
          if (this.steamT <= 0) {
            this.steamT = 0.06;
            game.fx.emberBurst(this.x + rand(20, -20), -150, 2, "#ff9b50", 160);
          }
          if (this.stateT > this.windDur) {
            this.state = "slamStrike";
            this.stateT = 0;
            this.hitDone = false;
            game.audio.swing(2.2);
          }
          break;
        }
        case "slamStrike": {
          if (this.stateT > 0.05 && this.stateT < 0.3) {
            const hb = { x: this.x + this.facing * 66, y: -110, w: 160, h: 150 };
            const pb = p.hitbox();
            if (!this.hitDone && game.rectOverlap(hb, pb)) {
              this.hitDone = true;
              if (!game.tryPlayerParry(this)) p.takeDamage(26 + this.tier * 4, this.x, { kb: 650, kbY: -320 });
            }
            if (this.stateT > 0.16 && !this.slamDone) {
              this.slamDone = true;
              game.cam.addShake(12);
              game.fx.impact(this.x + this.facing * 90, 0, 0, 2.4, "#ffcf9a");
              game.fx.dustPuff(this.x + this.facing * 90, 0, 14, this.facing, 1.8);
              game.fx.ring(this.x + this.facing * 90, 0, { r1: 130, width: 5, color: "#ffb070", life: 0.35, squash: 0.28 });
              game.audio.heavy(1.4);
              game.hitstop = Math.max(game.hitstop, 0.08);
            }
          }
          if (this.stateT > 0.42) {
            this.state = "recover";
            this.stateT = 0;
            this.hitDone = false;
            this.slamDone = false;
          }
          break;
        }
        case "stompWind": {
          this.vx = U.approach(this.vx, 0, 900 * dt);
          if (this.stateT > this.windDur) {
            this.state = "stompStrike";
            this.stateT = 0;
            game.audio.swing(1.5);
          }
          break;
        }
        case "stompStrike": {
          if (this.stateT > 0.06 && !this.stompDone) {
            this.stompDone = true;
            const hb = { x: this.x + this.facing * 40, y: -84, w: 150, h: 90 };
            const pb = p.hitbox();
            if (game.rectOverlap(hb, pb)) {
              if (!game.tryPlayerParry(this)) p.takeDamage(12 + this.tier * 2, this.x, { kb: 380, kbY: -260 });
            }
            game.cam.addShake(6);
            game.fx.ring(this.x + this.facing * 30, 0, { r1: 110, width: 4, color: "#ffb070", life: 0.3, squash: 0.25 });
            game.fx.dustPuff(this.x + this.facing * 30, 0, 8, this.facing, 1.3);
            game.audio.land();
          }
          if (this.stateT > 0.3) {
            this.state = "recover";
            this.stateT = 0;
            this.stompDone = false;
          }
          break;
        }
        case "chargeWind": {
          this.vx = U.approach(this.vx, 0, 1200 * dt);
          if (this.stateT > this.windDur) {
            this.state = "chargeRun";
            this.stateT = 0;
            this.hitDone = false;
            this.chargeDur = 0.9;
            game.audio.swing(1.8);
          }
          break;
        }
        case "chargeRun": {
          this.vx = this.facing * 420;
          this.hitDone = false;
          const hb = { x: this.x + this.facing * 44, y: -124, w: 100, h: 120 };
          const pb = p.hitbox();
          if (game.rectOverlap(hb, pb)) {
            if (!game.tryPlayerParry(this)) p.takeDamage(16 + this.tier * 3, this.x, { kb: 520, kbY: -180 });
            this.state = "recover";
            this.stateT = 0;
            game.cam.addShake(6);
            break;
          }
          if (Math.random() < 0.4) {
            game.fx.dustPuff(this.x, 0, 2, -this.facing, 1.2);
            game.cam.addShake(1.4);
          }
          if (this.stateT > this.chargeDur) {
            this.state = "recover";
            this.stateT = 0;
            this.attackCd = rand(1.8, 1.1);
          }
          break;
        }
        case "recover": {
          this.vx = U.approach(this.vx, 0, 1200 * dt);
          if (this.stateT > this.recoverDur) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = Math.max(this.attackCd, 0.9);
          }
          break;
        }
        case "stagger": {
          this.vx = U.approach(this.vx, 0, 500 * dt);
          if (this.stateT > this.staggerDur) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = 0.4;
          }
          break;
        }
        case "knockdown": {
          this.vx = U.approach(this.vx, 0, 80 * dt);
          if (this.stateT > this.knockDur) {
            this.state = "getup";
            this.stateT = 0;
          }
          break;
        }
        case "getup": {
          if (this.stateT > 0.5) {
            this.state = "advance";
            this.stateT = 0;
            this.attackCd = 0.4;
          }
          break;
        }
      }
      this.applyPhysics(dt, game);
      if (this.grounded && (this.state === "slamWind" || this.state === "chargeWind" || this.state === "stompWind")) {
        const heavy = this.state === "slamWind" ? 3 : 2;
        if (Math.floor(this.stateT * 10) !== Math.floor((this.stateT - dt) * 10)) {
          game.cam.addShake(heavy * 0.6);
          game.fx.dustPuff(this.x, 0, 2, 0, 0.8);
        }
      }
    }

    applyPhysics(dt, game) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < 50) this.x = 50;
      if (this.x > game.arenaW - 50) this.x = game.arenaW - 50;
      if (this.y >= 0) {
        if (!this.grounded && this.vy > 300) {
          game.fx.dustPuff(this.x, 0, 10, 0, 1.6);
          game.audio.land();
          game.cam.addShake(4);
        }
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
        this.vy += 2100 * dt;
        if (this.vy > 1500) this.vy = 1500;
      }
    }

    stun(t) {
      this.stunT = Math.max(this.stunT, t);
      this.state = "stagger";
      this.stateT = 0;
      this.staggerDur = t;
      this.hitDone = false;
    }

    knockdown(power) {
      if (this.limbs.legL.broken && this.limbs.legR.broken) {
        this.knockDur = 2.0;
      } else {
        this.knockDur = Math.max(0.8, power * 0.5);
      }
      this.state = "knockdown";
      this.stateT = 0;
      this.vy = -(150 + power * 60);
      this.grounded = false;
      this.hitDone = false;
    }

    severPart(key, game, contact) {
      const L = this.limbs[key];
      if (!L || L.broken) return;
      L.broken = true;
      const f = this.facing;
      if (key === "head") {
        game.spawnLimbDebris(this, "head", this.x + f * 4, -156);
        game.cam.punchZoom(0.035);
      } else if (key === "armR" || key === "armL") {
        game.spawnLimbDebris(this, key, this.x + f * 22, -106);
      } else {
        game.spawnLimbDebris(this, key, this.x + f * 16, -36);
        game.fx.dustPuff(this.x, 0, 6, 0, 1);
      }
    }

    hurt(dmg, opts, game) {
      if (!this.alive) return;
      this.hp -= dmg;
      this.hurtFlash = 1;
      if (this.state.endsWith("Wind") && dmg > 10) {
        this.state = "stagger";
        this.stateT = 0;
        this.staggerDur = 0.4;
      }
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      if (this.dying) return;
      this.dying = true;
      this.alive = false;
      game.audio.enemyDie();
      game.cam.addShake(10);
      game.fx.emberBurst(this.x, -70, 26, "#ffa060", 380);
      game.fx.ring(this.x, -60, { r1: 140, width: 6, color: "#ffa060", life: 0.5, squash: 0.6 });
      game.onEnemyDeath(this);
    }

    draw(ctx, game) {
      if (this.dying && this.deadT > 2.0) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = clamp(0.5 + this.y / 600, 0.14, 0.55);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(0, 2, 44, 9, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      const s = this.spawnScale;
      ctx.scale(this.facing * s, s);

      const t = this.animT;
      let pose = EPOSES.idle[0];
      switch (this.state) {
        case "advance": pose = Math.abs(this.vx) > 20 ? (Math.sin(t * 6) > 0 ? EPOSES.walkA : EPOSES.walkB) : EPOSES.idle[1]; break;
        case "slamWind": pose = G.lerpPose(EPOSES.slamA, EPOSES.slamB, 0.12); break;
        case "slamStrike": pose = this.stateT < 0.12 ? EPOSES.slamB : EPOSES.strikeB; break;
        case "stompWind": pose = EPOSES.walkA; break;
        case "stompStrike": pose = EPOSES.strike; break;
        case "chargeWind": pose = EPOSES.chargeA; break;
        case "chargeRun": pose = EPOSES.chargeB; break;
        case "stagger":
        case "knockdown":
        case "getup": pose = Math.sin(t * 20) > 0 ? EPOSES.stagger : EPOSES.stagger2; break;
        default: pose = EPOSES.idle[0];
      }
      if (this.dying) pose = G.lerpPose(pose, EPOSES.death, clamp(this.deadT / 0.9, 0, 1));
      const sk = G.makeSkel(pose, G.DIMS.brute);
      this.sk = sk;
      const L = this.limbs;
      const plate = "#4b4a43";
      const plate2 = "#31312c";
      const rim = "#8f8a72";

      // back leg
      if (!L.legL.broken) this.drawLeg(ctx, sk.backLeg, plate2, null);
      // back arm (chain mace or fist)
      if (!L.armL.broken) this.drawArm(ctx, sk.backArm, plate2, null);
      // torso
      this.drawTorso(ctx, sk);
      // front leg
      if (!L.legR.broken) this.drawLeg(ctx, sk.frontLeg, plate, rim);
      // head
      if (!L.head.broken) this.drawHead(ctx, sk);
      // front arm
      if (!L.armR.broken) {
        this.drawArm(ctx, sk.frontArm, plate, rim);
        this.drawFist(ctx, sk.frontArm.hand, this.state === "slamStrike" || this.state === "stompStrike");
      }
      if (!L.armL.broken) this.drawFist(ctx, sk.backArm.hand, false, true);

      // turbine / steam
      if (this.overheat > 0.1) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(0, -70, 4, 0, -70, 50);
        g.addColorStop(0, "rgba(255,120,40," + (0.22 * this.overheat) + ")");
        g.addColorStop(1, "rgba(255,70,20,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-60, -140, 120, 140);
        ctx.restore();
      }

      if (this.hurtFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.hurtFlash * 0.45;
        ctx.fillStyle = "#ffd0a0";
        ctx.beginPath();
        ctx.ellipse(0, -80, 40, 68, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      if (this.alive && this.spawnScale >= 1) {
        const w = 96;
        ctx.save();
        ctx.translate(this.x, -206);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(-w / 2 - 1, -4, w + 2, 8);
        const frac = clamp(this.hp / this.maxHp, 0, 1);
        const grd = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        grd.addColorStop(0, "#8c3a26");
        grd.addColorStop(1, "#d98a52");
        ctx.fillStyle = grd;
        ctx.fillRect(-w / 2, -3, w * frac, 6);
        const list = ["head", "armL", "armR", "legL", "legR"];
        for (let i = 0; i < list.length; i++) {
          const k = list[i];
          ctx.fillStyle = this.limbs[k].broken ? "#2a1d15" : "rgba(255,214,170,0.6)";
          ctx.fillRect(-w / 2 + i * 12, 5, 8, 2.5);
        }
        ctx.restore();
      }
    }

    drawLeg(ctx, leg, fill, rim) {
      G.taperedLimb(ctx, leg.hip, leg.knee, 14, 9, fill, "#070605", null);
      G.taperedLimb(ctx, leg.knee, leg.foot, 9, 6, fill, "#070605", rim);
      G.joint(ctx, leg.knee, 7.4, "#232320", "#070605");
      ctx.save();
      ctx.translate(leg.foot.x, leg.foot.y);
      ctx.fillStyle = "#24231f";
      ctx.beginPath();
      ctx.moveTo(-10, -1); ctx.lineTo(16, -2); ctx.lineTo(20, 6); ctx.lineTo(-12, 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#070605"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }

    drawArm(ctx, arm, fill, rim) {
      G.taperedLimb(ctx, arm.sh, arm.el, 12, 9, fill, "#070605", null);
      G.taperedLimb(ctx, arm.el, arm.hand, 9, 7, fill, "#070605", rim);
      G.joint(ctx, arm.el, 7, "#2b2b27", "#070605");
    }

    drawFist(ctx, hand, down, back) {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.fillStyle = back ? "#2e2e2a" : "#43433c";
      ctx.strokeStyle = "#070605";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#5a5a4e";
      ctx.beginPath();
      ctx.arc(-2, -2, 6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawTorso(ctx, sk) {
      const hip = sk.hip, neck = sk.neck;
      const ang = Math.atan2(neck.y - hip.y, neck.x - hip.x) + P2R;
      ctx.save();
      ctx.translate((hip.x + neck.x) / 2, (hip.y + neck.y) / 2);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-30, 36);
      ctx.quadraticCurveTo(-40, 0, -26, -34);
      ctx.lineTo(20, -38);
      ctx.quadraticCurveTo(40, -2, 30, 32);
      ctx.quadraticCurveTo(8, 44, -10, 42);
      ctx.closePath();
      const g = ctx.createLinearGradient(-34, 0, 34, 0);
      g.addColorStop(0, "#2c2b27");
      g.addColorStop(0.45, "#4e4d45");
      g.addColorStop(1, "#232320");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "#060505";
      ctx.lineWidth = 2;
      ctx.stroke();
      // plating lines
      ctx.strokeStyle = "rgba(16,15,13,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-24, -20); ctx.quadraticCurveTo(0, -8, 24, -22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-26, 10); ctx.quadraticCurveTo(0, 22, 26, 8); ctx.stroke();
      // furnace
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createRadialGradient(0, 4, 2, 0, 4, 20);
      fg.addColorStop(0, "rgba(255,150,60,0.85)");
      fg.addColorStop(1, "rgba(255,70,10,0)");
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(0, 4, 20, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,220,170,0.9)";
      ctx.beginPath(); ctx.arc(0, 4, 4.5 + Math.sin(this.animT * 4) * 1, 0, TAU); ctx.fill();
      // furnace grill
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#141310";
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * 7 - 4, -4); ctx.lineTo(i * 7 - 4, 12); ctx.stroke();
      }
      ctx.restore();
    }

    drawHead(ctx, sk) {
      const h = sk.head;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.quadraticCurveTo(-16, -16, 0, -18);
      ctx.quadraticCurveTo(16, -16, 15, 4);
      ctx.lineTo(10, 14);
      ctx.lineTo(-10, 14);
      ctx.closePath();
      ctx.fillStyle = "#57544a";
      ctx.fill();
      ctx.strokeStyle = "#060505";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = "#0a0806";
      ctx.fillRect(0, -4, 15, 5);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,120,40,0.95)";
      ctx.beginPath(); ctx.arc(9, -1.5, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,110,30,0.3)";
      ctx.beginPath(); ctx.arc(9, -1.5, 6.5, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }
  }

  AV.enemies = { Turret, Stalker, BladeFiend, Brute };
  AV.enemyPoses = EPOSES;
  AV.EPOSES = EPOSES;
  AV.ENEMY_ID = () => ENEMY_ID;
})(window.AV = window.AV || {});
