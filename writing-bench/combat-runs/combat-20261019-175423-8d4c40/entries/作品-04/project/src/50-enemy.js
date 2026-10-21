'use strict';
/* ============================================================
   ENEMIES — "缚偶" the Bound Puppets
   Segmented wooden marionettes: limbs carry their own HP and
   can be severed, which removes abilities and changes behavior.
   ============================================================ */
const ENEMY_TYPES = {
  warden: {
    name: '灰傀', hp: 78, scale: 0.94, speed: 118, range: 76,
    windup: 0.44, recover: 0.30, cooldown: [0.5, 1.1], dmg: 12,
    limbHp: { armL: 30, armR: 30, legL: 40, legR: 40 },
    color: '#cfa877', color2: '#8d6644', trim: '#412c1e',
    mask: '#e8dfc8', ribbon: '#7b2233', eye: '#ff6a4a',
    combo: 2, weight: 1
  },
  thrower: {
    name: '灯使', hp: 62, scale: 0.9, speed: 132, range: 300,
    windup: 0.55, recover: 0.34, cooldown: [1.2, 2.0], dmg: 10,
    limbHp: { armL: 27, armR: 27, legL: 34, legR: 34 },
    color: '#b9b3a8', color2: '#6d6579', trim: '#2e2a3c',
    mask: '#f0e6d2', ribbon: '#2f6f7a', eye: '#7cf5ff',
    ranged: true, weight: 1.1
  },
  brute: {
    name: '斩首式', hp: 150, scale: 1.22, speed: 84, range: 92,
    windup: 0.62, recover: 0.44, cooldown: [1.0, 1.8], dmg: 20,
    limbHp: { armL: 58, armR: 58, legL: 66, legR: 66 },
    color: '#8d8fa6', color2: '#4f5166', trim: '#20202d',
    mask: '#d8d2c4', ribbon: '#7a1b28', eye: '#ffae42',
    armor: true, weight: 1.8
  }
};

const ENEMY_POSE = {};
ENEMY_POSE.stand = (() => {
  const p = basePose();
  p.hipY = -52; p.lean = 0.03; p.fh = [16, -58]; p.bh = [-2, -54];
  p.ff = [14, 0]; p.bf = [-16, 0]; p.sword = 1.9; p.elbowF = 1; p.elbowB = -1;
  return p;
})();
(() => {
  const S = ENEMY_POSE.stand;
  const mk = f => { const p = clonePose(S); f(p); return p; };
  ENEMY_POSE.walkA = mk(p => { p.ff = [22, -2]; p.bf = [-24, -4]; p.hipY = -49; p.fh = [6, -56]; p.bh = [-14, -50]; });
  ENEMY_POSE.walkB = mk(p => { p.ff = [-16, -8]; p.bf = [14, -12]; p.hipY = -53; p.fh = [22, -56]; p.bh = [4, -52]; });
  ENEMY_POSE.windup = mk(p => { p.sword = 3.15; p.lean = -0.25; p.chestTwist = -0.6; p.fh = [-8, -88]; p.hipY = -54; p.ff = [24, 0]; p.bf = [-24, 0]; });
  ENEMY_POSE.strike = mk(p => { p.sword = 0.25; p.lean = 0.45; p.chestTwist = 0.5; p.fh = [36, -52]; p.hipY = -44; p.ff = [32, 0]; p.bf = [-30, 2]; });
  ENEMY_POSE.throwWind = mk(p => { p.fh = [4, -96]; p.bh = [-20, -88]; p.lean = -0.12; p.hipY = -54; });
  ENEMY_POSE.throwOut = mk(p => { p.fh = [40, -60]; p.bh = [-14, -66]; p.lean = 0.3; p.hipY = -48; });
  ENEMY_POSE.hurt = mk(p => { p.lean = -0.42; p.head = -0.3; p.hipY = -46; p.fh = [24, -48]; p.bh = [-22, -44]; p.ff = [8, 0]; p.bf = [-24, 0]; });
  ENEMY_POSE.down = mk(p => { p.hipY = -16; p.lean = -1.35; p.head = -0.4; p.ff = [22, 0]; p.bf = [-24, 0]; p.fh = [28, -8]; p.bh = [-18, -6]; p.sword = 0.2; });
  ENEMY_POSE.crawl = mk(p => { p.hipY = -26; p.lean = 0.55; p.ff = [18, 0]; p.bf = [-16, 0]; p.fh = [24, -26]; p.bh = [20, -24]; p.sword = 2.5; });
  ENEMY_POSE.hop = mk(p => { p.hipY = -60; p.ff = [8, -14]; p.bf = [-10, -10]; p.lean = 0.2; });
})();

let ENEMY_ID = 0;

class Puppet {
  constructor(typeName, x, side) {
    const T = ENEMY_TYPES[typeName];
    this.id = ++ENEMY_ID;
    this.type = typeName; this.T = T;
    this.x = x; this.y = GROUND_Y; this.vx = 0; this.vy = 0;
    this.facing = side;
    this.maxHp = T.hp * (1 + (Game.wave - 1) * 0.10);
    this.hp = this.maxHp;
    this.scale = T.scale;
    this.onGround = true;
    this.state = 'spawn';
    this.stateT = 0.55;
    this.atkCd = rand(0.7, 1.5);
    this.attack = null;
    this.hurtT = 0;
    this.staggerT = 0;
    this.knockT = 0;
    this.flash = 0;
    this.dead = false;
    this.deadT = 0;
    this.limbs = {
      armL: { hp: T.limbHp.armL, max: T.limbHp.armL, attached: true, ext: 'arm' },
      armR: { hp: T.limbHp.armR, max: T.limbHp.armR, attached: true, ext: 'arm' },
      legL: { hp: T.limbHp.legL, max: T.limbHp.legL, attached: true, ext: 'leg' },
      legR: { hp: T.limbHp.legR, max: T.limbHp.legR, attached: true, ext: 'leg' },
      head: { hp: T.hp * 0.75, max: T.hp * 0.75, attached: true, ext: 'head' }
    };
    this.walkPhase = Math.random() * TAU;
    this.ribbons = [];
    for (let i = 0; i < 5; i++) {
      this.ribbons.push({
        pts: new Array(6).fill(0).map(() => ({ x, y: GROUND_Y - 180, px: x, py: GROUND_Y - 180 })),
        len: 12, init: false, ph: Math.random() * TAU
      });
    }
    this.spawnX = x;
    this.spawnGlow = 1;
    this.armSwing = 0;
    this.aiTimer = 0;
    this.hasToken = false;
    this.stunGlint = 0;
    this.decoys = 0;
  }

  get alive() { return !this.dead && this.hp > 0; }
  get armsOk() { return this.limbs.armL.attached || this.limbs.armR.attached; }
  get legsOk() { return this.limbs.legL.attached || this.limbs.legR.attached; }
  get legsCount() { return (this.limbs.legL.attached ? 1 : 0) + (this.limbs.legR.attached ? 1 : 0); }

  hurtBox() {
    const s = this.scale;
    return { x: this.x - 24 * s, y: this.y - 104 * s, w: 48 * s, h: 102 * s };
  }
  center() { return { x: this.x, y: this.y - 56 * this.scale }; }
  bodyRect() { return { x: this.x - 22 * this.scale, y: this.y - 96 * this.scale, w: 44 * this.scale, h: 94 * this.scale }; }
}
