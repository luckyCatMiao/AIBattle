(function (AV) {
  "use strict";
  const U = AV.util;
  const G = AV.gfx;
  const { clamp, lerp, TAU, rand, sign, easeOutCubic, easeInCubic, easeOutQuint, easeInOutCubic } = U;
  const D2R = Math.PI / 180;
  const PAL = G.palette;

  // ------------------------------------------------------------------ attack table
  const ATTACKS = {
    light1: {
      dur: 0.30, hit: [0.055, 0.135], dmg: 9, partMul: 1.0, kb: 150, kbY: -40,
      hitstop: 0.05, shake: 2.2, lunge: 250, reach: 88, hh: 66, hs: 0.06,
      sfx: 1, chain: ["light2", "heavy", "dashAtk"], chainAt: 0.10,
    },
    light2: {
      dur: 0.32, hit: [0.065, 0.15], dmg: 10, partMul: 1.1, kb: 190, kbY: -30,
      hitstop: 0.055, shake: 2.8, lunge: 280, reach: 92, hh: 70, hs: 0.14,
      sfx: 1.1, chain: ["light3", "heavy", "dashAtk"], chainAt: 0.11,
    },
    light3: {
      dur: 0.50, hit: [0.12, 0.215], dmg: 16, partMul: 1.7, kb: 240, kbY: -660,
      hitstop: 0.115, shake: 6.5, lunge: 330, reach: 104, hh: 96, hs: 0.26,
      sfx: 1.5, launch: true, chain: ["air1", "heavy"], chainAt: 0.16,
    },
    heavy: {
      dur: 0.64, hit: [0.17, 0.29], dmg: 22, partMul: 2.8, kb: 460, kbY: -300,
      hitstop: 0.14, shake: 9, lunge: 300, reach: 118, hh: 108, hs: 0.22,
      sfx: 1.9, chain: [], heavy: true,
    },
    dashAtk: {
      dur: 0.44, hit: [0.05, 0.17], dmg: 13, partMul: 1.5, kb: 300, kbY: -80,
      hitstop: 0.075, shake: 4, lunge: 520, reach: 112, hh: 66, hs: 0.12,
      sfx: 1.3, chain: ["light3", "heavy"], chainAt: 0.12,
    },
    air1: {
      dur: 0.28, hit: [0.04, 0.125], dmg: 8, partMul: 1.0, kb: 90, kbY: -110,
      hitstop: 0.045, shake: 1.6, lunge: 0, reach: 84, hh: 62, hs: 0.12,
      sfx: 0.9, chain: ["air2", "airDive"], chainAt: 0.08,
    },
    air2: {
      dur: 0.30, hit: [0.05, 0.14], dmg: 9, partMul: 1.1, kb: 120, kbY: -90,
      hitstop: 0.05, shake: 2, lunge: 0, reach: 88, hh: 66, hs: 0.12,
      sfx: 1.0, chain: ["air1", "airDive"], chainAt: 0.09,
    },
    airDive: {
      dur: 0.42, hit: [0.07, 0.3], dmg: 16, partMul: 2.0, kb: 260, kbY: 620,
      hitstop: 0.12, shake: 6, lunge: 0, reach: 88, hh: 80, hs: 0.1,
      sfx: 1.6, slam: true, chain: [],
    },
    counter: {
      dur: 0.56, hit: [0.10, 0.23], dmg: 30, partMul: 5.0, kb: 420, kbY: -380,
      hitstop: 0.2, shake: 13, lunge: 470, reach: 124, hh: 92, hs: 0.3,
      sfx: 2.1, guaranteedBreak: true, chain: [], counter: true,
    },
    iaido: {
      dur: 0.74, hit: [0.43, 0.57], dmg: 48, partMul: 4.5, kb: 550, kbY: -450,
      hitstop: 0.26, shake: 16, lunge: 0, reach: 150, hh: 130, hs: 0.35,
      sfx: 2.5, guaranteedBreak: true, chain: [], teleport: true,
    },
    bladeStorm: {
      dur: 0.92, hit: [0.14, 0.70], dmg: 7, partMul: 0.9, kb: 220, kbY: -90,
      hitstop: 0.04, shake: 3.5, lunge: 0, reach: 250, hh: 240, hs: 0.08,
      sfx: 1.4, multihit: true, chain: [],
    },
    execution: {
      dur: 0.74, hit: [0.30, 0.44], dmg: 999, partMul: 10.0, kb: 600, kbY: -700,
      hitstop: 0.35, shake: 20, lunge: 0, reach: 130, hh: 120, hs: 0.4,
      sfx: 2.8, guaranteedBreak: true, execution: true, chain: [],
    },
  };

  // ------------------------------------------------------------------ poses
  const P = (o) => G.basePose(o);

  const POSES = {
    idle: [
      P({ lean: 6, head: -3, bSh: 116, bEl: 152, fSh: 64, fEl: 78, swAng: 42, bTh: 104, bShin: 84, fTh: 76, fShin: 88 }),
      P({ lean: 4, head: -1, bSh: 112, bEl: 148, fSh: 70, fEl: 72, swAng: 50, bTh: 102, bShin: 82, fTh: 74, fShin: 86 }),
    ],
    runA: P({ lean: 12, head: -6, bSh: 150, bEl: 210, fSh: 40, fEl: 40, swAng: -20, bTh: 62, bShin: 130, fTh: 128, fShin: 62, scarf: 1 }),
    runB: P({ lean: 13, head: -6, bSh: 100, bEl: 165, fSh: 62, fEl: 54, swAng: 20, bTh: 128, bShin: 62, fTh: 60, fShin: 128, scarf: 1 }),
    jumpRise: P({ lean: 6, head: -4, bSh: 130, bEl: 190, fSh: 32, fEl: 34, swAng: -34, bTh: 55, bShin: 128, fTh: 108, fShin: 78, scarf: 1 }),
    fall: P({ lean: -2, head: 3, bSh: 148, bEl: 200, fSh: 58, fEl: 46, swAng: 14, bTh: 76, bShin: 110, fTh: 108, fShin: 96, scarf: 1 }),
    land: P({ lean: 20, head: 10, bSh: 90, bEl: 120, fSh: 52, fEl: 58, swAng: 70, bTh: 110, bShin: 63, fTh: 128, fShin: 62, crouch: 1 }),
    hurt: P({ lean: -18, head: 16, bSh: 165, bEl: 220, fSh: 150, fEl: 200, swAng: -60, bTh: 84, bShin: 96, fTh: 104, fShin: 108, scar: 0 }),

    // light1: coiled back, then wide horizontal cut
    l1a: P({ lean: -8, head: -8, bSh: 190, bEl: 250, fSh: 205, fEl: 250, swAng: -140, bTh: 96, bShin: 92, fTh: 88, fShin: 94, swX: -6, swY: -8 }),
    l1b: P({ lean: 16, head: -10, bSh: 150, bEl: 195, fSh: 128, fEl: 150, swAng: 18, bTh: 84, bShin: 92, fTh: 70, fShin: 96, swX: 8 }),
    l1c: P({ lean: 22, head: -6, bSh: 118, bEl: 168, fSh: 52, fEl: 30, swAng: 62, bTh: 88, bShin: 90, fTh: 62, fShin: 100, swX: 12, swY: 8 }),

    l2a: P({ lean: -2, head: -5, bSh: 200, bEl: 260, fSh: 168, fEl: 228, swAng: 128, bTh: 92, bShin: 96, fTh: 80, fShin: 96, swX: 8, swY: 6 }),
    l2b: P({ lean: 18, head: -4, bSh: 150, bEl: 200, fSh: 88, fEl: 78, swAng: -40, bTh: 82, bShin: 96, fTh: 70, fShin: 94, swX: 4 }),
    l2c: P({ lean: 10, head: 2, bSh: 120, bEl: 170, fSh: 62, fEl: 20, swAng: -96, bTh: 84, bShin: 92, fTh: 78, fShin: 94 }),

    l3a: P({ lean: 26, head: 6, bSh: 70, bEl: 100, fSh: 42, fEl: 120, swAng: 120, bTh: 126, bShin: 62, fTh: 132, fShin: 58 }),
    l3b: P({ lean: -6, head: -14, bSh: 160, bEl: 210, fSh: 152, fEl: 190, swAng: -100, bTh: 92, bShin: 90, fTh: 82, fShin: 92, swX: -6 }),
    l3c: P({ lean: -20, head: -18, bSh: 200, bEl: 255, fSh: 245, fEl: 290, swAng: -168, bTh: 74, bShin: 86, fTh: 68, fShin: 88, swX: 0, swY: -6 }),

    // heavy: two-handed overhead
    hva: P({ lean: -14, head: -12, bSh: 210, bEl: 255, fSh: 208, fEl: 262, swAng: -120, bTh: 114, bShin: 70, fTh: 124, fShin: 64, swX: -6, swY: -10, twoHand: 1 }),
    hvb: P({ lean: -22, head: -16, bSh: 240, bEl: 280, fSh: 240, fEl: 292, swAng: -150, bTh: 118, bShin: 66, fTh: 130, fShin: 60, swX: -8, swY: -14, twoHand: 1 }),
    hvc: P({ lean: 30, head: 8, bSh: 130, bEl: 175, fSh: 128, fEl: 168, swAng: 58, bTh: 120, bShin: 64, fTh: 136, fShin: 56, swX: 6, swY: 2, twoHand: 1 }),
    hvd: P({ lean: 36, head: 12, bSh: 112, bEl: 160, fSh: 100, fEl: 145, swAng: 88, bTh: 116, bShin: 66, fTh: 132, fShin: 58, twoHand: 1 }),

    // dash slash
    da: P({ lean: 30, head: -6, bSh: 185, bEl: 240, fSh: 196, fEl: 246, swAng: -140, bTh: 60, bShin: 128, fTh: 120, fShin: 66, scarf: 1 }),
    db: P({ lean: 34, head: -8, bSh: 158, bEl: 202, fSh: 80, fEl: 62, swAng: 6, bTh: 66, bShin: 122, fTh: 112, fShin: 74, swX: 10, scarf: 1 }),
    dc: P({ lean: 28, head: -2, bSh: 140, bEl: 190, fSh: 50, fEl: 22, swAng: 46, bTh: 74, bShin: 114, fTh: 100, fShin: 84, swX: 8, scarf: 1 }),

    // air attacks
    a1a: P({ lean: -4, head: -8, bSh: 190, bEl: 245, fSh: 200, fEl: 245, swAng: -152, bTh: 70, bShin: 118, fTh: 118, fShin: 72 }),
    a1b: P({ lean: 18, head: -4, bSh: 150, bEl: 195, fSh: 100, fEl: 80, swAng: 16, bTh: 76, bShin: 112, fTh: 110, fShin: 82 }),
    a1c: P({ lean: 24, head: 0, bSh: 130, bEl: 180, fSh: 60, fEl: 20, swAng: 58, bTh: 82, bShin: 106, fTh: 104, fShin: 88 }),

    a2a: P({ lean: 0, head: -6, bSh: 205, bEl: 255, fSh: 152, fEl: 232, swAng: 132, bTh: 76, bShin: 110, fTh: 112, fShin: 78 }),
    a2b: P({ lean: 22, head: -2, bSh: 140, bEl: 190, fSh: 70, fEl: 40, swAng: -60, bTh: 84, bShin: 100, fTh: 100, fShin: 92 }),
    a2c: P({ lean: 12, head: 2, bSh: 120, bEl: 175, fSh: 58, fEl: 30, swAng: -10, bTh: 86, bShin: 96, fTh: 98, fShin: 94 }),

    diveA: P({ lean: -10, head: -16, bSh: 210, bEl: 255, fSh: 170, fEl: 210, swAng: -95, bTh: 58, bShin: 132, fTh: 128, fShin: 60 }),
    diveB: P({ lean: 30, head: 16, bSh: 120, bEl: 170, fSh: 84, fEl: 96, swAng: 88, bTh: 110, bShin: 62, fTh: 140, fShin: 56 }),

    parryA: P({ lean: -2, head: -4, bSh: 120, bEl: 165, fSh: 250, fEl: 300, swAng: -90, bTh: 100, bShin: 88, fTh: 80, fShin: 90, swX: 4, swY: -2 }),
    parryB: P({ lean: 4, head: -6, bSh: 128, bEl: 182, fSh: 262, fEl: 316, swAng: -96, bTh: 104, bShin: 86, fTh: 76, fShin: 92, swX: 4, swY: -4 }),

    // counter execution
    cta: P({ lean: -10, head: -10, bSh: 200, bEl: 250, fSh: 205, fEl: 255, swAng: -150, bTh: 96, bShin: 94, fTh: 82, fShin: 96 }),
    ctb: P({ lean: 34, head: -4, bSh: 160, bEl: 205, fSh: 60, fEl: 26, swAng: 40, bTh: 82, bShin: 96, fTh: 66, fShin: 104, swX: 12 }),
    ctc: P({ lean: 30, head: 0, bSh: 132, bEl: 188, fSh: 48, fEl: 14, swAng: 70, bTh: 84, bShin: 94, fTh: 64, fShin: 106, swX: 10 }),

    // iaido: sheathed draw stance to explosive release
    iaidoA: P({ lean: -6, head: -8, bSh: 130, bEl: 175, fSh: 160, fEl: 200, swAng: -165, bTh: 108, bShin: 76, fTh: 90, fShin: 92, swX: -18, swY: 4 }),
    iaidoB: P({ lean: -8, head: -10, bSh: 135, bEl: 180, fSh: 168, fEl: 210, swAng: -170, bTh: 110, bShin: 74, fTh: 88, fShin: 94, swX: -20, swY: 6 }),
    iaidoC: P({ lean: 38, head: -6, bSh: 148, bEl: 192, fSh: 24, fEl: 12, swAng: 75, bTh: 78, bShin: 98, fTh: 64, fShin: 108, swX: 18, swY: -2 }),
    iaidoD: P({ lean: 32, head: 2, bSh: 120, bEl: 168, fSh: 38, fEl: 18, swAng: 90, bTh: 84, bShin: 92, fTh: 70, fShin: 102, swX: 14 }),

    // blade storm: spinning 360
    stormA: P({ lean: 8, head: -4, bSh: 140, bEl: 185, fSh: 55, fEl: 40, swAng: 20, bTh: 88, bShin: 94, fTh: 76, fShin: 96 }),
    stormB: P({ lean: 12, head: 0, bSh: 85, bEl: 140, fSh: 280, fEl: 320, swAng: -110, bTh: 94, bShin: 88, fTh: 82, fShin: 90 }),

    // execution: overhead cleave
    execA: P({ lean: -16, head: -14, bSh: 215, bEl: 260, fSh: 215, fEl: 270, swAng: -135, bTh: 116, bShin: 68, fTh: 126, fShin: 62, swX: -8, swY: -12, twoHand: 1 }),
    execB: P({ lean: 42, head: 14, bSh: 115, bEl: 165, fSh: 105, fEl: 150, swAng: 92, bTh: 122, bShin: 62, fTh: 138, fShin: 54, swX: 4, twoHand: 1 }),

    dead: P({ lean: 78, head: 30, bSh: 190, bEl: 240, fSh: 160, fEl: 210, swAng: 120, bTh: 118, bShin: 40, fTh: 132, fShin: 46, hipY: -40 }),
  };

  function poseAt(name, t) {
    switch (name) {
      case "idle": {
        const s = (Math.sin(t * 2.2) + 1) * 0.5;
        return G.lerpPose(POSES.idle[0], POSES.idle[1], s);
      }
      case "run": {
        const s = (Math.sin(t * 16) + 1) * 0.5;
        const base = G.lerpPose(POSES.runA, POSES.runB, s);
        base.lean += Math.sin(t * 32) * 1.5;
        return base;
      }
      case "jump": return POSES.jumpRise;
      case "fall": return POSES.fall;
      case "land": return POSES.land;
      case "hurt": return POSES.hurt;
      case "dead": return POSES.dead;
      case "light1": return G.blendPoses([POSES.idle[0], POSES.l1a, POSES.l1b, POSES.l1c], t);
      case "light2": return G.blendPoses([POSES.l1c, POSES.l2a, POSES.l2b, POSES.l2c], t);
      case "light3": return G.blendPoses([POSES.l2c, POSES.l3a, POSES.l3b, POSES.l3c], t);
      case "heavy": {
        if (t < 0.42) return G.lerpPose(POSES.hva, POSES.hvb, clamp(t / 0.42, 0, 1));
        return G.blendPoses([POSES.hvb, POSES.hvc, POSES.hvd], (t - 0.42) / 0.58);
      }
      case "dashAtk": return G.blendPoses([POSES.da, POSES.db, POSES.dc], t);
      case "air1": return G.blendPoses([POSES.a1a, POSES.a1b, POSES.a1c], t);
      case "air2": return G.blendPoses([POSES.a2a, POSES.a2b, POSES.a2c], t);
      case "airDive": return G.blendPoses([POSES.diveA, POSES.diveB], t);
      case "parry": {
        const s = (Math.sin(t * 30) + 1) * 0.5;
        return G.lerpPose(POSES.parryA, POSES.parryB, s * 0.4);
      }
      case "counter": return G.blendPoses([POSES.cta, POSES.ctb, POSES.ctc], t);
      case "iaido": {
        if (t < 0.38) return G.lerpPose(POSES.iaidoA, POSES.iaidoB, clamp(t / 0.38, 0, 1));
        return G.blendPoses([POSES.iaidoB, POSES.iaidoC, POSES.iaidoD], (t - 0.38) / 0.62);
      }
      case "bladeStorm": {
        const cycle = (t * 3.5) % 1;
        return G.lerpPose(POSES.stormA, POSES.stormB, cycle);
      }
      case "execution": return G.blendPoses([POSES.execA, POSES.execB], t);
      default: return POSES.idle[0];
    }
  }

  class Player {
    constructor(game) {
      this.game = game;
      this.dims = G.DIMS.player;
      this.reset(500, 0);
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.grounded = true;
      this.hp = 100;
      this.maxHp = 100;
      this.alive = true;
      this.state = "idle";
      this.stateT = 0;
      this.animT = 0;
      this.attack = null;
      this.attackName = null;
      this.attackT = 0;
      this.hitSet = new Set();
      this.comboIndex = 0;
      this.comboWindow = 0;
      this.chainQueued = null;
      this.iFrames = 0;
      this.hurtFlash = 0;
      this.parryTimer = 0;
      this.parryActive = false;
      this.parrySuccess = 0;
      this.dashCooldown = 0;
      this.airDashUsed = false;
      this.doubleJumpUsed = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.attackBuffer = 0;
      this.focus = 0;
      this.maxFocus = 100;
      this.charge = 0;
      this.charging = false;
      this.landT = 0;
      this.skel = G.makeSkel(POSES.idle[0], this.dims);
      this.pose = POSES.idle[0];
      this.trailT = 0;
      this.afterimages = 0;
      this.stepT = 0;
      this.deathT = 0;
      this.dashTrailT = 0;
      this.lastHitTime = 0;
      this.guardBREAK = 0;
      this.smokeT = 0;
      this.screenX = x;
      this.screenY = y;
      this.iaidoCooldown = 0;
      this.iaidoCharging = false;
      this.iaidoChargeT = 0;
      this.stormCooldown = 0;
      this.shadowCloneCooldown = 0;
      this.shadowClones = [];
      this.executionCooldown = 0;
      this.skillBuffer = { iaido: 0, bladeStorm: 0, execution: 0 };
      this.iaidoTarget = null;
      this.iaidoTeleported = false;
      this.executionTarget = null;
      this.executionHit = false;
      this.hitTimers = {};
    }

    get swordTip() {
      const w = this.skel.weapon;
      const r = w.ang * D2R;
      const len = 86;
      return {
        x: this.x + this.facing * (w.x + Math.cos(r) * len),
        y: this.y + (w.y + Math.sin(r) * len * 0.98 - Math.sin(r) * 0),
      };
    }

    hitbox() {
      return { x: this.x - 16, y: this.y - 108, w: 32, h: 108 };
    }

    startAttack(name) {
      const a = ATTACKS[name];
      if (!a) return;
      // gentle auto-facing assist: never attack past an adjacent enemy.
      // Targeting skills already picked their victim and facing.
      if (name !== "iaido" && name !== "execution") {
        let best = null;
        let bd = 150;
        for (const e of this.game.enemies) {
          if (!e.alive || e.spawning) continue;
          const hb = e.hurtbox();
          const d = Math.abs(hb.x - this.x);
          const dy = Math.abs(hb.y - (this.y - 60));
          if (d < bd && dy < 130) { bd = d; best = e; }
        }
        if (best) this.facing = sign(best.x - this.x) || this.facing;
      }
      this.attackName = name;
      this.attack = a;
      this.attackT = 0;
      this.state = "attack";
      this.stateT = 0;
      this.hitSet.clear();
      this.hitTimers = {};
      this.chainQueued = null;
      if (name === "heavy") {
        this.charging = false;
        this.charge = 0;
      }
      if (this.grounded && a.lunge) {
        this.vx = this.facing * a.lunge;
      }
      this.game.audio.swing(a.sfx || 1);
      this.game.fx.ghost(this.x, this.y, this.pose || POSES.idle[0], this.facing, { life: 0.24, alpha: 0.18 });
    }

    playAnim(name, speed = 1) {
      this.state = name;
      this.stateT = 0;
    }

    update(dt, game) {
      if (!this.alive) {
        this.deathT += dt;
        this.stateT += dt;
        this.animT += dt;
        this.vx = U.approach(this.vx, 0, 900 * dt);
        this.applyPhysics(dt);
        this.updatePose(dt);
        return;
      }
      this.stateT += dt;
      this.animT += dt;
      this.iFrames = Math.max(0, this.iFrames - dt);
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
      this.parrySuccess = Math.max(0, this.parrySuccess - dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      this.comboWindow = Math.max(0, this.comboWindow - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.attackBuffer = Math.max(0, this.attackBuffer - dt);
      this.focus = Math.min(this.maxFocus, this.focus + dt * 1.4);
      for (const name of ["iaido", "bladeStorm", "execution"]) {
        const v = this.skillBuffer[name];
        if (v > 0) this.skillBuffer[name] = Math.max(0, v - dt);
      }
      this.iaidoCooldown = Math.max(0, this.iaidoCooldown - dt);
      this.stormCooldown = Math.max(0, this.stormCooldown - dt);
      this.shadowCloneCooldown = Math.max(0, this.shadowCloneCooldown - dt);
      this.executionCooldown = Math.max(0, this.executionCooldown - dt);

      // update shadow clones (they seek and strike on their own)
      this.updateShadowClones(dt, game);

      const input = AV.Input;
      const move = (input.isDown("KeyD", "ArrowRight") ? 1 : 0) - (input.isDown("KeyA", "ArrowLeft") ? 1 : 0);
      if (input.wasPressed("Space")) this.jumpBuffer = 0.13;
      if (input.wasPressed("KeyJ")) this.attackBuffer = 0.16;

      // ---------------- NEW SKILLS ----------------

      // buffer skill inputs so a click during hitstun/attack still fires a beat later
      if (input.mouseLeftPressed) {
        this.skillBuffer.iaido = 0.24;
        this.skillBuffer.iaidoPoint = { x: input.mouseX, y: input.mouseY };
      }
      if (input.mouseRightPressed) this.skillBuffer.bladeStorm = 0.22;
      if (input.mouseMiddlePressed) {
        this.skillBuffer.execution = 0.24;
        this.skillBuffer.executionPoint = { x: input.mouseX, y: input.mouseY };
      }

      // Skill 1: Iaido (mouse left click on enemy) - charged teleport slash
      if (this.skillBuffer.iaido > 0 && this.iaidoCooldown <= 0 && this.state !== "attack" && this.state !== "hurt" && this.state !== "dead") {
        const pt = this.skillBuffer.iaidoPoint || { x: input.mouseX, y: input.mouseY };
        const w = game.screenToWorld(pt.x, pt.y);
        let target = null;
        let minDist = 460;
        for (const e of game.enemies) {
          if (!e.alive || e.spawning) continue;
          const hb = e.hurtbox();
          const d = Math.hypot(hb.x - w.x, hb.y - w.y);
          if (d < minDist) { minDist = d; target = e; }
        }
        if (target) {
          this.skillBuffer.iaido = 0;
          this.iaidoTarget = target;
          this.iaidoStartX = this.x;
          this.iaidoStartY = this.y;
          this.iaidoTeleported = false;
          this.facing = sign(target.x - this.x) || this.facing;
          this.startAttack("iaido");
          this.iaidoCooldown = 7.0;
          game.fx.ring(this.x, this.y - 60, { r1: 60, width: 4, color: "#ffeb99", life: 0.3, squash: 1 });
          game.fx.text(this.x, this.y - 168, "一 闪 · 居 合", { color: "#ffe8a8", size: 20, vy: -70, life: 0.8 });
          game.audio.iaidoCharge();
        }
      }

      // Skill 2: Blade Storm (mouse right click) - 360 AOE
      if (this.skillBuffer.bladeStorm > 0 && this.stormCooldown <= 0 && this.state !== "attack" && this.state !== "hurt" && this.state !== "dead") {
        this.skillBuffer.bladeStorm = 0;
        if (!this.grounded) { this.y = 0; this.grounded = true; this.vy = 0; }
        this.startAttack("bladeStorm");
        this.stormCooldown = 9.0;
        this.vx = 0;
        this.hitTimers = {};
        game.fx.ring(this.x, this.y - 60, { r1: 80, width: 3, color: "#7cf3ff", life: 0.4, squash: 1 });
        game.fx.text(this.x, this.y - 168, "旋 风 斩", { color: "#9ff6ff", size: 20, vy: -70, life: 0.8 });
        game.audio.storm();
      }

      // Skill 3: Shadow Double (Q) - summon a spectral clone that seeks and strikes
      if (input.wasPressed("KeyQ") && this.shadowCloneCooldown <= 0 && this.state !== "hurt" && this.state !== "dead") {
        this.shadowClones.push({
          x: this.x - this.facing * 30, y: this.y, pose: this.pose, facing: this.facing,
          life: 1.6, attacked: false,
        });
        this.shadowCloneCooldown = 7.5;
        this.iFrames = Math.max(this.iFrames, 0.18);
        game.fx.ring(this.x, this.y - 60, { r1: 62, width: 4, color: "#b899ff", life: 0.28, squash: 1.1 });
        game.fx.flashBurst(this.x - this.facing * 36, this.y - 64, { r: 54, color: "#c9a6ff", life: 0.2 });
        game.fx.emberBurst(this.x, this.y - 60, 10, "#b899ff", 180);
        game.audio.shadowSummon();
        game.fx.text(this.x, this.y - 148, "影 分 身", { color: "#cbb2ff", size: 20, vy: -70, life: 0.8 });
      }

      // Skill 4: Execution (mouse middle click on low HP enemy) - instant kill
      if (this.skillBuffer.execution > 0 && this.executionCooldown <= 0 && this.state !== "attack" && this.state !== "hurt" && this.state !== "dead") {
        const pt = this.skillBuffer.executionPoint || { x: input.mouseX, y: input.mouseY };
        const w = game.screenToWorld(pt.x, pt.y);
        let target = null;
        let minDist = 280;
        for (const e of game.enemies) {
          if (!e.alive || e.spawning || e.hp / e.maxHp > 0.30) continue;
          const hb = e.hurtbox();
          const d = Math.hypot(hb.x - w.x, hb.y - w.y);
          if (d < minDist) { minDist = d; target = e; }
        }
        if (target) {
          this.skillBuffer.execution = 0;
          this.executionTarget = target;
          this.executionHit = false;
          this.facing = sign(target.x - this.x) || this.facing;
          this.startAttack("execution");
          this.executionCooldown = 10.0;
          game.fx.ring(target.x, target.y - 40, { r1: 70, width: 5, color: "#ff4444", life: 0.35, squash: 1 });
          game.fx.text(this.x, this.y - 168, "处 刑", { color: "#ff9a8a", size: 20, vy: -70, life: 0.8 });
          game.audio.execution();
        }
      }

      // ---------------- parry (I)
      if (input.wasPressed("KeyI") && this.state !== "attack" && this.state !== "parry" && this.parryCooldownSafe()) {
        this.state = "parry";
        this.stateT = 0;
        this.parryTimer = 0.30;
        this.parryCooldown = 0.5;
        this.vx *= 0.3;
        game.audio.parryReady();
        game.fx.ring(this.x, this.y - 70, { r1: 42, width: 2, color: "#a8f4ff", life: 0.18, squash: 1 });
      }

      // ---------------- dash (L)
      if (input.wasPressed("KeyL") && this.dashCooldown <= 0 && this.state !== "attack" && this.state !== "hurt") {
        const dashingAir = !this.grounded;
        if (!dashingAir || !this.airDashUsed) {
          this.state = "dash";
          this.stateT = 0;
          this.dashTime = 0.20;
          this.iFrames = Math.max(this.iFrames, 0.17);
          this.dashCooldown = 0.34;
          if (dashingAir) { this.airDashUsed = true; this.vy = Math.min(this.vy, 20); }
          const dir = move !== 0 ? move : this.facing;
          this.facing = dir;
          this.vx = dir * 880;
          this.vy = 0;
          this.dashTrailT = 0;
          this.dashAttackWindow = 0.22;
          game.audio.dash();
          game.fx.dustPuff(this.x, this.y, 5, -dir, 0.9);
          game.fx.ghost(this.x, this.y, this.pose, this.facing, { life: 0.3, alpha: 0.35 });
        }
      }
      if (this.state === "dash") {
        this.dashTime -= dt;
        this.dashAttackWindow -= dt;
        this.iFrames = Math.max(this.iFrames, 0.1);
        this.dashTrailT -= dt;
        if (this.dashTrailT <= 0) {
          this.dashTrailT = 0.032;
          game.fx.ghost(this.x, this.y, this.pose, this.facing, { life: 0.26, alpha: 0.32 });
          if (Math.random() < 0.6) game.fx.emberBurst(this.x, this.y - 50, 2, "#7cf3ff", 90);
        }
        this.vx = this.facing * 880 * clamp(this.dashTime / 0.2, 0.35, 1);
        if (this.dashAttackWindow > 0 && (this.attackBuffer > 0 || input.wasPressed("KeyJ"))) {
          this.startAttack("dashAtk");
          this.attackBuffer = 0;
        } else if (this.dashTime <= 0) {
          this.state = this.grounded ? "idle" : "fall";
          this.vx *= 0.4;
        }
      }

      // ---------------- parry state
      if (this.state === "parry") {
        this.parryTimer -= dt;
        this.parryCooldown = Math.max(0, (this.parryCooldown || 0) - dt);
        this.vx = U.approach(this.vx, 0, 1800 * dt);
        if (this.parryTimer <= 0) {
          this.state = this.grounded ? "idle" : "fall";
        }
      } else if (this.parryCooldown) {
        this.parryCooldown = Math.max(0, this.parryCooldown - dt);
      }

      // ---------------- heavy charge (K)
      if (this.state !== "attack" && this.state !== "dash") {
        if (input.isDown("KeyK") && this.grounded) {
          if (!this.charging) {
            this.charging = true;
            this.charge = 0;
            game.audio.startChargeHum();
          }
          this.charge = Math.min(1, this.charge + dt * 1.35);
          this.vx = U.approach(this.vx, 0, 2200 * dt);
          game.audio.updateChargeHum(this.charge);
          if (this.state !== "parry") {
            this.state = "charge";
            this.stateT += dt;
          }
          if (this.charge >= 0.999 && Math.random() < 0.4) {
            const tip = this.swordTip;
            game.fx.spark(tip.x, tip.y, 0, -1, { count: 1, speed: 140, color: "#ffd28a", life: 0.36, grav: -60 });
          }
        } else if (this.charging) {
          this.charging = false;
          game.audio.stopChargeHum();
          if (this.state !== "parry" && this.state !== "dash") {
            this.startAttack("heavy");
            this.attack.chargePower = this.charge;
            this.charge = 0;
          } else {
            this.charge = 0;
          }
        }
      }

      // ---------------- attack
      if (this.state === "attack") {
        this.attackT += dt;
        const a = this.attack;
        const tt = this.attackT / a.dur;

        // special mechanics for new skills
        if (this.attackName === "iaido" && this.iaidoTarget) {
          if (tt >= 0.40 && !this.iaidoTeleported) {
            this.iaidoTeleported = true;
            const tx = this.iaidoTarget.alive
              ? this.iaidoTarget.x - this.facing * 78
              : this.iaidoStartX + this.facing * 60;
            this.x = clamp(tx, 60, game.arenaW - 60);
            this.y = 0;
            this.grounded = true;
            this.vy = 0;
            this.vx = 0;
            this.facing = sign((this.iaidoTarget.x || this.x) - this.x) || this.facing;
            game.fx.flashBurst(this.iaidoStartX, this.iaidoStartY - 60, { r: 70, color: "#fff5cc", life: 0.22 });
            game.fx.flashBurst(this.x, this.y - 60, { r: 90, color: "#fff5cc", life: 0.2 });
            game.fx.ring(this.x, this.y - 60, { r1: 92, width: 5, color: "#ffeb99", life: 0.26, squash: 1 });
            game.fx.ghost(this.iaidoStartX, this.iaidoStartY, this.pose, this.facing, { life: 0.5, alpha: 0.6 });
            game.cam.addShake(6);
            game.addHitstop(0.06);
            game.audio.iaidoStep();
          }
        } else if (this.attackName === "bladeStorm") {
          this.vx = U.approach(this.vx, 0, 3000 * dt);
          if (tt > 0.12 && tt < 0.68 && Math.random() < 0.5) {
            const ang = rand(0, TAU);
            const r = rand(60, 160);
            game.fx.slash(this.x + Math.cos(ang) * r, this.y - 60 + Math.sin(ang) * r, ang, 12, {
              arc: 1.8, life: 0.14, width: 8, color: "#7cf3ff", grow: 90, glow: 1.3,
            });
          }
        } else if (this.attackName === "execution" && this.executionTarget) {
          if (tt >= 0.18 && !this.executionHit) {
            this.executionHit = true;
            const tx = this.executionTarget.alive
              ? this.executionTarget.x - this.facing * 62
              : this.x;
            this.x = clamp(tx, 60, game.arenaW - 60);
            this.y = 0;
            this.grounded = true;
            this.vx = 0;
            this.vy = 0;
            game.fx.flashBurst(this.x, this.y - 70, { r: 100, color: "#ffd9c0", life: 0.18 });
            game.cam.addShake(9);
            game.cam.punchZoom(0.04);
            game.slowmoFor(0.32, 0.3);
            game.addHitstop(0.12);
          }
        } else {
          // gravity / physics for lunging attacks
          if (this.grounded && this.attackT < 0.22) {
            this.vx = U.approach(this.vx, this.facing * (a.lunge || 0), 900 * dt);
          } else if (this.grounded) {
            this.vx = U.approach(this.vx, 0, 2600 * dt);
          }
        }

        // emit slash trail during active window
        if (tt >= a.hit[0] * 0.7 && tt <= a.hit[1] + 0.05) {
          this.trailT -= dt;
          if (this.trailT <= 0) {
            this.trailT = 0.016;
            const tip = this.swordTip;
            const w = this.skel.weapon;
            const ang = Math.atan2(tip.y - (this.y + w.y), tip.x - (this.x + this.facing * w.x));
            const color = a.execution ? "#ff9999" : (a.counter ? "#ffe1a6" : (a.teleport ? "#ffeb99" : "#b8f6ff"));
            game.fx.slash(tip.x, tip.y, ang, 14, {
              arc: 2.4, life: 0.16, width: 11, color: color,
              grow: 120, glow: a.heavy || a.teleport || a.execution ? 1.6 : 1.1,
            });
            game.fx.spark(tip.x, tip.y, Math.cos(ang), Math.sin(ang), { count: 1, speed: 120, life: 0.2, color: "#bff8ff", grav: -20 });
          }
        }

        // hit detection
        if (tt >= a.hit[0] && tt <= a.hit[1]) {
          this.resolveHits(game, a);
        }

        // chain input
        if (a.chain && a.chain.length && this.attackT >= (a.chainAt || 0.1)) {
          if (this.attackBuffer > 0 || input.wasPressed("KeyJ")) {
            const next = this.pickChain(a.chain);
            if (next) {
              this.startAttack(next);
              this.attackBuffer = 0;
              this.comboIndex++;
            }
          }
        }

        if (this.attackT >= a.dur) {
          if (this.state === "attack") {
            this.state = this.grounded ? "idle" : "fall";
            this.attack = null;
            this.attackName = null;
            this.comboWindow = 0.16;
            // reset skill flags
            if (this.iaidoTarget) {
              this.iaidoTarget = null;
              this.iaidoTeleported = false;
            }
            if (this.executionTarget) {
              this.executionTarget = null;
              this.executionHit = false;
            }
          }
        }
      }

      // ---------------- ground / air movement
      if (this.state !== "attack" && this.state !== "dash" && this.state !== "parry") {
        if (this.grounded) {
          const speed = 430;
          if (this.state === "charge") {
            this.vx = U.approach(this.vx, move * 90, 2200 * dt);
          } else {
            this.vx = U.approach(this.vx, move * speed, 3400 * dt);
            if (move !== 0) this.facing = move;
          }
          if (this.jumpBuffer > 0 && this.state !== "charge") {
            this.jumpBuffer = 0;
            this.vy = -880;
            this.grounded = false;
            this.doubleJumpUsed = false;
            this.coyote = 0.1;
            this.state = "jump";
            this.stateT = 0;
            this.airDashUsed = false;
            game.audio.jump();
            game.fx.dustPuff(this.x, this.y, 5, 0, 0.9);
          }
        } else {
          this.vx = U.approach(this.vx, move * 380, 1500 * dt);
          if (move !== 0 && this.state !== "charge") this.facing = move;
          if (this.jumpBuffer > 0 && !this.doubleJumpUsed) {
            this.jumpBuffer = 0;
            this.doubleJumpUsed = true;
            this.vy = -760;
            this.state = "jump";
            this.stateT = 0;
            this.airDashUsed = false;
            game.audio.jump();
            game.fx.ring(this.x, this.y - 50, { r1: 46, width: 2.5, color: "#a9f3ff", life: 0.3, squash: 0.5 });
            game.fx.spark(this.x, this.y - 40, 0, 1, { count: 6, speed: 220, color: "#a9f3ff", life: 0.3 });
          }
        }
      } else if (this.state === "attack" && !this.grounded) {
        // slight air drift
        const a = this.attack;
        if (a && (this.attackName === "air1" || this.attackName === "air2")) {
          this.vx = U.approach(this.vx, this.facing * 140, 600 * dt);
        }
      }

      // air attack input: J while airborne
      if (!this.grounded && (this.attackBuffer > 0 || input.wasPressed("KeyJ")) && this.state !== "attack" && this.state !== "dash") {
        this.attackBuffer = 0;
        this.startAttack(this.doubleJumpUsed || this.vy < 60 ? "air1" : "air1");
      }

      this.applyPhysics(dt);
      this.updatePose(dt);
    }

    parryCooldownSafe() {
      return !this.parryCooldown || this.parryCooldown <= 0;
    }

    pickChain(chain) {
      if (chain.includes("air1") && !this.grounded) return "air1";
      for (const c of chain) {
        if (c === "airDive" && !this.grounded) return "airDive";
        if (c === "air1" || c === "air2") continue;
        return c;
      }
      return chain[0];
    }

    applyPhysics(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const arenaW = this.game.arenaW;
      if (this.x < 60) { this.x = 60; if (this.vx < 0) this.vx = 0; }
      if (this.x > arenaW - 60) { this.x = arenaW - 60; if (this.vx > 0) this.vx = 0; }
      if (this.y >= 0) {
        const wasAirborne = !this.grounded;
        this.y = 0;
        if (wasAirborne) {
          const impact = clamp(this.vy / 900, 0, 1.6);
          this.grounded = true;
          this.vy = 0;
          this.airDashUsed = false;
          this.doubleJumpUsed = false;
          if (this.state === "airDive" || this.state === "fall" || this.state === "jump") {
            if (impact > 0.25) {
              this.game.audio.land();
              this.game.fx.dustPuff(this.x, 0, 4 + impact * 6, 0, 0.8 + impact * 0.5);
              this.game.fx.dustPuff(this.x, 0, 3, -1, 0.6);
              this.game.fx.dustPuff(this.x, 0, 3, 1, 0.6);
              this.game.cam.addShake(impact * 2.4);
            }
            this.state = "land";
            this.landT = 0.12;
          } else if (this.state === "dash" || this.state === "attack" || this.state === "charge") {
            this.game.audio.land();
            this.game.fx.dustPuff(this.x, 0, 4, 0, 0.7);
          }
        }
      } else {
        this.grounded = false;
        this.vy += 2250 * dt;
        if (this.vy > 1600) this.vy = 1600;
        if (this.state === "idle" || this.state === "run" || this.state === "land") {
          this.state = this.vy < 0 ? "jump" : "fall";
          this.stateT = 0;
        }
      }
      // hurt stagger always releases; without this the player can be locked forever
      if (this.state === "hurt" && this.stateT > 0.34) {
        this.state = this.grounded ? "idle" : "fall";
        this.stateT = 0;
      }

      if (this.state === "land") {
        this.landT -= dt;
        if (this.landT <= 0) this.state = "idle";
      }
      if (this.grounded && this.state !== "attack" && this.state !== "dash" && this.state !== "parry" && this.state !== "charge" && this.state !== "land" && this.state !== "hurt") {
        if (Math.abs(this.vx) > 30) {
          if (this.state !== "run") { this.state = "run"; this.stateT = 0; }
        } else if (this.state === "run") {
          this.state = "idle";
          this.stateT = 0;
        }
      }
      // run dust
      if (this.state === "run" && this.grounded) {
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = 0.12;
          this.game.fx.dustPuff(this.x - this.facing * 14, 0, 1, -this.facing, 0.35);
        }
      }
    }

    resolveHits(game, a) {
      const reach = a.reach;
      const hx = this.x + this.facing * reach * 0.5;
      const hy = this.y - 60;
      const hw = reach;
      const hh = a.hh;

      for (const e of game.enemies) {
        if (!e.alive || e.spawning) continue;
        if (a.multihit) {
          // spinning storm re-hits each enemy on a short cadence
          if (this.hitTimers && this.hitTimers[e.id] != null && this.attackT < this.hitTimers[e.id]) continue;
        } else if (this.hitSet.has(e.id)) {
          continue;
        }
        const hb = e.hurtbox();
        if (a.multihit) {
          if (Math.hypot(hb.x - this.x, (hb.y - (this.y - 60)) * 0.7) > a.reach) continue;
        } else {
          if (Math.abs(hx - hb.x) > (hw + hb.w) * 0.5) continue;
          if (Math.abs(hy - hb.y) > (hh + hb.h) * 0.5) continue;
        }
        // strict facing (the 360 storm ignores it)
        if (!a.multihit && Math.sign(hb.x - this.x) !== this.facing && Math.abs(hb.x - this.x) > 20) continue;
        if (a.multihit) {
          if (!this.hitTimers) this.hitTimers = {};
          this.hitTimers[e.id] = this.attackT + 0.125;
        } else {
          this.hitSet.add(e.id);
        }
        const tip = this.swordTip;
        const contact = a.multihit
          ? { x: hb.x + rand(hb.w * 0.4, -hb.w * 0.4), y: hb.y + rand(hb.h * 0.35, -hb.h * 0.35) }
          : {
            x: clamp(tip.x, hb.x - hb.w * 0.5, hb.x + hb.w * 0.5),
            y: clamp(tip.y, hb.y - hb.h * 0.5, hb.y + hb.h * 0.5),
          };
        game.onPlayerHit(e, a, contact, this);
      }
    }

    updateShadowClones(dt, game) {
      for (let i = this.shadowClones.length - 1; i >= 0; i--) {
        const clone = this.shadowClones[i];
        clone.life -= dt;
        if (clone.life <= 0) { this.shadowClones.splice(i, 1); continue; }
        // find nearest foe, then dash at it like a phantom
        let best = null, bd = Infinity;
        for (const e of game.enemies) {
          if (!e.alive || e.spawning) continue;
          const hb = e.hurtbox();
          const d = Math.abs(hb.x - clone.x);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const hb = best.hurtbox();
          clone.facing = sign(hb.x - clone.x) || clone.facing;
          if (bd > 78) {
            clone.x = U.approach(clone.x, hb.x - clone.facing * 70, 780 * dt);
            clone.y = 0;
            clone.trail = (clone.trail || 0) - dt;
            if (clone.trail <= 0) {
              clone.trail = 0.045;
              game.fx.ghost(clone.x, clone.y, clone.pose, clone.facing, { life: 0.28, alpha: 0.32, color: "#9d7cff" });
            }
          } else if (!clone.attacked) {
            clone.attacked = true;
            const contact = { x: hb.x + rand(hb.w * 0.35, -hb.w * 0.35), y: hb.y - hb.h * 0.2 };
            const ang = Math.atan2(contact.y - (clone.y - 60), contact.x - clone.x);
            const cloneAtk = {
              dmg: 15, partMul: 1.7, kb: 260, kbY: -160, hitstop: 0.08, shake: 4.5,
              chain: [], sfx: 1.2, shadow: true,
            };
            game.fx.slash(contact.x, contact.y, ang, 12, {
              arc: 2.4, life: 0.2, width: 11, color: "#c9a6ff", grow: 120, glow: 1.5,
            });
            game.fx.ring(contact.x, contact.y, { r1: 52, width: 3, color: "#9d7cff", life: 0.24, squash: 1 });
            game.fx.ghost(clone.x, clone.y, clone.pose, clone.facing, { life: 0.55, alpha: 0.8, color: "#b899ff" });
            game.audio.shadowStrike();
            game.onPlayerHit(best, cloneAtk, contact, this);
          }
        }
        if (clone.attacked) clone.life = Math.min(clone.life, 0.18);
      }
    }

    takeDamage(amount, srcX, opts = {}) {
      const game = this.game;
      if (!this.alive || this.iFrames > 0) return false;
      this.hp -= amount;
      this.hurtFlash = 1;
      this.iFrames = 0.65;
      game.stats.damageTaken += amount;
      const dir = sign(this.x - srcX) || 1;
      this.vx = dir * (opts.kb || 380);
      if (opts.kbY) { this.vy = opts.kbY; this.grounded = false; }
      this.state = "hurt";
      this.stateT = 0;
      this.attack = null;
      this.attackName = null;
      this.charging = false;
      game.audio.stopChargeHum();
      game.fx.impact(this.x, this.y - 64, dir, 1.4, "#ff9a6a");
      game.fx.text(this.x, this.y - 118, "-" + Math.round(amount), { color: "#ff7b6b", size: 26, vy: -60, gravity: 60 });
      game.cam.addShake(7);
      game.cam.punchZoom(0.015);
      game.hitstop = Math.max(game.hitstop, 0.055);
      game.fx.screenFlash(0.12, "255,80,60");
      game.audio.hit(1.2);
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.state = "dead";
        this.stateT = 0;
        game.onPlayerDeath();
      }
      return true;
    }

    perfectParry(attacker) {
      const game = this.game;
      this.parrySuccess = 0.9;
      this.parryTimer = 0;
      this.parryCooldown = 0.05;
      this.focus = Math.min(this.maxFocus, this.focus + 34);
      this.iFrames = 0.7;
      this.state = "parrySuccess";
      this.stateT = 0;
      game.stats.parries++;
      game.audio.parry();
      game.hitstop = 0.24;
      game.slowmo = 0.42;
      game.slowmoT = 0.55;
      game.cam.addShake(5);
      game.cam.punchZoom(0.03);
      game.fx.screenFlash(0.22, "200,255,255");
      game.fx.ring(this.x, this.y - 66, { r1: 130, width: 6, color: "#eaffff", life: 0.42, squash: 0.9 });
      game.fx.ring(this.x, this.y - 66, { r1: 86, width: 3, color: "#7cf3ff", life: 0.55, squash: 0.9 });
      game.fx.spark(this.x, this.y - 66, 0, -1, { count: 26, speed: 620, spread: 3.2, life: 0.6, color: "#eaffff", grav: 600 });
      game.fx.text(this.x, this.y - 150, "完美弹反", { color: "#d9ffff", size: 30, vy: -120, life: 0.9, glow: 1 });
      if (attacker) {
        attacker.stun(this.focus >= this.maxFocus ? 1.8 : 1.3);
        attacker.parried = true;
        game.fx.flashBurst(attacker.x, attacker.y - 110, { r: 90, color: "#d9ffff", life: 0.2 });
      }
      if (this.focus >= this.maxFocus) {
        game.fx.text(this.x, this.y - 186, "刃势 · 满", { color: "#ffd9a0", size: 22, vy: -80, life: 1.1 });
      }
      return true;
    }

    updatePose(dt) {
      let pose;
      if (this.state === "attack") {
        const t = clamp(this.attackT / this.attack.dur, 0, 1);
        pose = poseAt(this.attackName, t);
      } else if (this.state === "charge") {
        const t = clamp(this.charge, 0, 1);
        pose = G.lerpPose(POSES.hva, POSES.hvb, easeOutCubic(t));
        pose.lean += Math.sin(this.animT * 8) * 0.8;
      } else if (this.state === "dash") {
        pose = G.lerpPose(POSES.da, POSES.db, 0.5 + Math.sin(this.animT * 40) * 0.1);
        pose.scarf = 1.4;
      } else if (this.state === "parry") {
        pose = poseAt("parry", this.animT);
      } else if (this.state === "parrySuccess") {
        pose = POSES.parryB;
      } else if (this.state === "hurt") {
        pose = POSES.hurt;
      } else if (this.state === "dead") {
        const t = clamp(this.deathT / 0.7, 0, 1);
        pose = G.lerpPose(POSES.hurt, POSES.dead, easeOutCubic(t));
      } else if (this.state === "jump") {
        pose = POSES.jumpRise;
        pose.lean += Math.sin(this.animT * 8) * 1.2;
      } else if (this.state === "fall") {
        pose = POSES.fall;
        pose.lean += clamp(Math.abs(this.vy) / 900, 0, 1) * 4;
      } else if (this.state === "land") {
        pose = POSES.land;
      } else if (this.state === "run") {
        pose = poseAt("run", this.animT);
      } else {
        pose = poseAt("idle", this.animT);
      }
      this.pose = pose;
      this.skel = G.makeSkel(pose, this.dims);
      // scarf trailing by speed
      this.scarfFlow = lerp(this.scarfFlow || 0, clamp(Math.abs(this.vx) / 500 + (this.grounded ? 0 : 0.35), 0, 1.6), 1 - Math.exp(-dt * 6));
    }

    // ---------------------------------------------------------------- drawing
    draw(ctx, game) {
      const sk = this.skel;
      const pose = this.pose;
      const facing = this.facing;
      const px = this.x;
      const py = this.y;

      // draw shadow clones
      for (const clone of this.shadowClones) {
        const fade = clamp(clone.life / 1.6, 0, 1);
        const alpha = (clone.attacked ? clamp(clone.life / 0.18, 0, 1) : 0.55) * (0.5 + fade * 0.5);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = "lighter";
        const cloneSk = G.makeSkel(clone.pose, this.dims);
        ctx.translate(clone.x, clone.y);
        ctx.scale(clone.facing, 1);
        const cA = "#7c5aff", cB = "#b899ff", cC = "#e0d2ff";
        // legs
        G.taperedLimb(ctx, cloneSk.backLeg.hip, cloneSk.backLeg.knee, 8, 5.5, cA, null);
        G.taperedLimb(ctx, cloneSk.backLeg.knee, cloneSk.backLeg.foot, 5.5, 4, cA, null);
        G.taperedLimb(ctx, cloneSk.frontLeg.hip, cloneSk.frontLeg.knee, 8.5, 6, cB, null);
        G.taperedLimb(ctx, cloneSk.frontLeg.knee, cloneSk.frontLeg.foot, 6, 4.2, cB, null);
        // coat tail
        ctx.beginPath();
        ctx.moveTo(-8, -100);
        ctx.quadraticCurveTo(-34, -64, -40, -6);
        ctx.quadraticCurveTo(-16, -22, -2, -58);
        ctx.closePath();
        ctx.fillStyle = "rgba(124,90,255,0.55)";
        ctx.fill();
        // torso
        G.taperedLimb(ctx, cloneSk.hip, cloneSk.neck, 12.5, 11, cB, null);
        // arms
        G.taperedLimb(ctx, cloneSk.backArm.sh, cloneSk.backArm.el, 5.5, 4.2, cA, null);
        G.taperedLimb(ctx, cloneSk.backArm.el, cloneSk.backArm.hand, 4.2, 3, cA, null);
        G.taperedLimb(ctx, cloneSk.frontArm.sh, cloneSk.frontArm.el, 6, 4.5, cB, null);
        G.taperedLimb(ctx, cloneSk.frontArm.el, cloneSk.frontArm.hand, 4.5, 3.2, cB, null);
        // head + hat brim
        G.joint(ctx, cloneSk.head, 9.5, cC, null);
        ctx.strokeStyle = cB;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(cloneSk.head.x - 15, cloneSk.head.y - 1);
        ctx.lineTo(cloneSk.head.x + 16, cloneSk.head.y - 1);
        ctx.stroke();
        // spectral blade
        const w = cloneSk.weapon;
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(w.ang * D2R);
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = cC;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.lineTo(2, 0);
        ctx.stroke();
        const bg = ctx.createLinearGradient(0, -4, 0, 5);
        bg.addColorStop(0, "rgba(240,235,255,0.95)");
        bg.addColorStop(0.5, "rgba(160,130,255,0.85)");
        bg.addColorStop(1, "rgba(110,80,220,0.5)");
        ctx.beginPath();
        ctx.moveTo(2, -3.4);
        ctx.quadraticCurveTo(44, -9, 86, -6.4);
        ctx.quadraticCurveTo(44, 1.5, 2, 3.2);
        ctx.closePath();
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.restore();
        // inner glow
        ctx.globalCompositeOperation = "lighter";
        const gl = ctx.createRadialGradient(0, -60, 4, 0, -60, 62);
        gl.addColorStop(0, "rgba(170,140,255,0.28)");
        gl.addColorStop(1, "rgba(120,80,255,0)");
        ctx.fillStyle = gl;
        ctx.fillRect(-70, -130, 140, 150);
        ctx.restore();
      }

      // shadow
      ctx.save();
      ctx.globalAlpha = clamp(0.5 + this.y / 700, 0.12, 0.5);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(px, 2, 30 + clamp(this.y / 40, -12, 0), 7, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      // focus aura when full
      if (this.focus >= this.maxFocus && this.alive) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const a = 0.12 + Math.sin(this.animT * 4) * 0.04;
        const g = ctx.createRadialGradient(px, py - 60, 8, px, py - 60, 70);
        g.addColorStop(0, "rgba(255,170,80," + a + ")");
        g.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(px - 80, py - 150, 160, 160);
        ctx.restore();
      }
      if (this.charging) {
        const c = this.charge;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(px, py - 70, 4, px, py - 70, 60 + c * 40);
        g.addColorStop(0, "rgba(255,200,120," + (0.12 + c * 0.22) + ")");
        g.addColorStop(0.6, "rgba(255,140,60," + (0.06 + c * 0.12) + ")");
        g.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(px - 120, py - 190, 240, 200);
        if (c > 0.6) {
          const tip = this.swordTip;
          ctx.strokeStyle = "rgba(255,230,180," + (0.3 + Math.sin(this.animT * 20) * 0.15) + ")";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 8 + Math.sin(this.animT * 14) * 3, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.scale(facing, 1);

      // ---------- scarf (behind)
      if (facing !== 0) {
        this.drawScarf(ctx, sk, pose, game);
      }

      const coat = PAL.cloth;
      const clothHi = PAL.cloth2;

      // ---------- back leg
      this.drawLeg(ctx, sk.backLeg, "#111823", "#0a0f16", "#263342");
      // ---------- back arm
      this.drawArm(ctx, sk.backArm, "#1a2431", "#0a0f16", "#2b3a4a");
      // ---------- coat tail behind
      ctx.beginPath();
      ctx.moveTo(-8, -100);
      ctx.quadraticCurveTo(-30 - this.scarfFlow * 14, -66, -34 - this.scarfFlow * 26, -8 + this.scarfFlow * 6);
      ctx.quadraticCurveTo(-18 - this.scarfFlow * 6, -20, -2, -58);
      ctx.closePath();
      ctx.fillStyle = coat;
      ctx.fill();

      // ---------- torso
      this.drawTorso(ctx, sk, pose);

      // ---------- front leg
      this.drawLeg(ctx, sk.frontLeg, "#1b2533", "#0a0f16", "#3f5568");

      // ---------- head
      this.drawHead(ctx, sk, pose);

      // ---------- front arm + weapon
      this.drawArm(ctx, sk.frontArm, "#222e3c", "#0a0f16", "#486074");
      if (!(this.state === "dead" && this.deathT > 0.4)) {
        const w = sk.weapon;
        G.drawKatana(ctx, w.x, w.y, w.ang, {
          glow: this.charge > 0.5 || this.focus >= this.maxFocus ? 1.5 : 1,
          edge: this.focus >= this.maxFocus ? "#ffd39b" : "#bffaff",
        });
        // second hand on handle during two-handed / charge / heavy
        if (pose.twoHand || this.charging) {
          ctx.save();
          ctx.translate(w.x, w.y);
          ctx.rotate(w.ang * D2R);
          ctx.strokeStyle = "#222e3c";
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-24, 4);
          ctx.lineTo(-8, 3);
          ctx.stroke();
          ctx.restore();
        }
      }

      // hit flash overlay
      if (this.hurtFlash > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.hurtFlash * 0.6;
        ctx.fillStyle = "#ff5a3a";
        ctx.beginPath();
        ctx.ellipse(0, -58, 30, 62, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // parry success sparkle around
      if (this.state === "parrySuccess" && this.stateT < 0.4) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(210,255,255," + (1 - this.stateT / 0.4) * 0.8 + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py - 62, 26 + this.stateT * 180, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawScarf(ctx, sk, pose, game) {
      const t = this.animT;
      const flow = this.scarfFlow || 0;
      const neck = sk.neck;
      const wave = Math.sin(t * 9) * (4 + flow * 5);
      const len = 46 + flow * 46;
      const g = ctx.createLinearGradient(neck.x, neck.y, neck.x - len, neck.y + 10);
      g.addColorStop(0, "#2b93a6");
      g.addColorStop(0.5, "#1e6d80");
      g.addColorStop(1, "rgba(20,70,88,0.25)");
      ctx.save();
      ctx.translate(neck.x, neck.y + 4);
      for (let i = 0; i < 2; i++) {
        const ph = t * (8 + i * 2) + i * 1.7;
        ctx.beginPath();
        ctx.moveTo(0, i * 4 - 3);
        ctx.bezierCurveTo(
          -len * 0.35, -8 + Math.sin(ph) * 5,
          -len * 0.72, 6 + Math.sin(ph + 1) * (6 + flow * 8),
          -len * (0.96 - i * 0.16), 14 + Math.sin(ph + 2) * (4 + flow * 12)
        );
        ctx.bezierCurveTo(
          -len * 0.72, 14 + Math.sin(ph + 2.4) * (5 + flow * 8),
          -len * 0.34, 4 + Math.sin(ph + 0.6) * 4,
          0, i * 4 + 2
        );
        ctx.closePath();
        ctx.fillStyle = i === 0 ? g : "rgba(24,72,88,0.7)";
        ctx.fill();
      }
      ctx.restore();
    }

    drawTorso(ctx, sk, pose) {
      const hip = sk.hip, neck = sk.neck;
      const a = Math.atan2(neck.y - hip.y, neck.x - hip.x) + Math.PI / 2;
      ctx.save();
      ctx.translate((hip.x + neck.x) / 2, (hip.y + neck.y) / 2);
      ctx.rotate(a);
      // coat / haori silhouette
      ctx.beginPath();
      ctx.moveTo(-14, 26);
      ctx.quadraticCurveTo(-20, 0, -13, -22);
      ctx.lineTo(-6, -28);
      ctx.lineTo(10, -26);
      ctx.quadraticCurveTo(18, -6, 16, 20);
      ctx.quadraticCurveTo(10, 30, 0, 30);
      ctx.closePath();
      ctx.fillStyle = "#141d29";
      ctx.fill();
      ctx.strokeStyle = "#070b10";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // inner wrap
      ctx.beginPath();
      ctx.moveTo(-8, -20);
      ctx.quadraticCurveTo(2, 4, -2, 24);
      ctx.lineTo(8, 22);
      ctx.quadraticCurveTo(6, -2, 4, -18);
      ctx.closePath();
      ctx.fillStyle = "#1d2937";
      ctx.fill();
      // belt
      ctx.fillStyle = "#4a2f22";
      ctx.fillRect(-14, 20, 30, 6);
      ctx.fillStyle = "#7a5334";
      ctx.fillRect(-6, 21, 9, 4);
      // ember brooch
      ctx.fillStyle = "#ff8a3c";
      ctx.beginPath();
      ctx.arc(2, -22, 2.6, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,138,60,0.35)";
      ctx.beginPath();
      ctx.arc(2, -22, 6, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // coat seam lines
      ctx.strokeStyle = "rgba(90,140,160,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(-6, 22);
      ctx.stroke();
      ctx.restore();
    }

    drawLeg(ctx, leg, fill, outline, rim) {
      G.taperedLimb(ctx, leg.hip, leg.knee, 7.2, 5, fill, outline, null);
      G.taperedLimb(ctx, leg.knee, leg.foot, 5.2, 3.6, fill, outline, rim);
      G.joint(ctx, leg.knee, 3.2, "#26323f", outline);
      // foot / boot
      ctx.save();
      ctx.translate(leg.foot.x, leg.foot.y);
      ctx.fillStyle = "#0e141c";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-5, -3);
      ctx.lineTo(8, -2);
      ctx.lineTo(10, 2);
      ctx.lineTo(-6, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawArm(ctx, arm, fill, outline, rim) {
      G.taperedLimb(ctx, arm.sh, arm.el, 6, 4.6, fill, outline, null);
      G.taperedLimb(ctx, arm.el, arm.hand, 4.6, 3.4, fill, outline, rim);
      G.joint(ctx, arm.el, 3, "#202b38", outline);
      G.joint(ctx, arm.hand, 3.4, "#2d3b49", outline);
    }

    drawHead(ctx, sk, pose) {
      const h = sk.head;
      ctx.save();
      ctx.translate(h.x, h.y);
      // neck
      ctx.strokeStyle = "#16202b";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, 14);
      ctx.stroke();
      // head shape (straw hat silhouette)
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 10.5, -0.06, 0, TAU);
      ctx.fillStyle = "#c9b89a";
      ctx.fill();
      ctx.strokeStyle = "#0a0f16";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // hair mass at back
      ctx.beginPath();
      ctx.moveTo(-6, -7);
      ctx.quadraticCurveTo(-14, 2, -10, 12);
      ctx.quadraticCurveTo(-4, 6, -2, 0);
      ctx.fillStyle = "#0c1118";
      ctx.fill();
      // hat brim
      ctx.beginPath();
      ctx.moveTo(-16, -3);
      ctx.quadraticCurveTo(0, -12, 17, -3);
      ctx.quadraticCurveTo(0, -1, -16, -3);
      ctx.closePath();
      ctx.fillStyle = "#191512";
      ctx.fill();
      // hat top
      ctx.beginPath();
      ctx.moveTo(-10, -5);
      ctx.quadraticCurveTo(0, -22, 11, -5);
      ctx.closePath();
      ctx.fillStyle = "#211a14";
      ctx.fill();
      ctx.strokeStyle = "rgba(200,170,120,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-9, -6);
      ctx.quadraticCurveTo(0, -10, 10, -6);
      ctx.stroke();
      // face shadow + eye glow
      ctx.beginPath();
      ctx.ellipse(2, 2, 6.4, 6.2, 0, 0, TAU);
      ctx.fillStyle = "rgba(24,20,16,0.72)";
      ctx.fill();
      ctx.fillStyle = "#9ff8ff";
      ctx.shadowColor = "#7cf3ff";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(5.4, 1.4, 1.7, 1.0, -0.2, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // limb pose lookup used by enemies and by player limb severing? player doesn't lose limbs
  // --------------------------------------------------------------------------
  AV.Player = Player;
  AV.ATTACKS = ATTACKS;
  AV.playerPoses = POSES;
  AV.poseAt = poseAt;
})(window.AV = window.AV || {});
