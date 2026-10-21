'use strict';
/* ============================================================
   刃魂四式 — four Blade-Soul techniques
   Soul is earned by fighting; each technique has its own rhythm.
   ============================================================ */
const SKILLS = {
  blossom: {
    key: 'KeyU', label: 'U', name: '樱吹雪', sub: 'BLOSSOM STORM',
    cost: 40, dur: 1.02, color: '#ff9fc4', icon: '❀',
    desc: '化影穿阵，十二连斩后旋起樱吹雪将敌人挑空。'
  },
  raid: {
    key: 'KeyY', label: 'Y', name: '影袭·千鸟', sub: 'THOUSAND BIRDS',
    cost: 30, dur: 0.82, color: '#9fe8ff', icon: '⚡',
    desc: '瞬身连闪，在三名敌人之间斩击并停在最后一人身后。'
  },
  camellia: {
    key: 'KeyH', label: 'H', name: '血椿·断界', sub: 'SEVERING REALM',
    cost: 60, dur: 1.38, color: '#ff5a63', icon: '✖',
    desc: '插刀裂地，血椿尖刺沿地面爆开，截断残肢。'
  },
  setsuna: {
    key: 'KeyO', label: 'O', name: '刹那·时停', sub: 'SETSUNA',
    cost: 80, dur: 1.55, color: '#a8c8ff', icon: '◷',
    desc: '冻结全场一秒；期间命中留下刻痕，解冻时一并引爆。'
  }
};
const SKILL_ORDER = ['blossom', 'raid', 'camellia', 'setsuna'];
const SOUL_MAX = 100;

/* ---------- poses ---------- */
function skillPoseBase() { return clonePose(POSE.idle); }

function poseBlossomWind() {
  const p = skillPoseBase();
  p.hipY = -40; p.lean = -0.3; p.sword = 3.25; p.chestTwist = -0.8;
  p.fh = [-8, -80]; p.bh = [-16, -70]; p.ff = [26, 0]; p.bf = [-26, 0];
  return p;
}
function poseBlossomSlash() {
  const p = skillPoseBase();
  p.hipY = -52; p.lean = 0.5; p.sword = 0.05; p.chestTwist = 0.85;
  p.fh = [34, -54]; p.bh = [24, -44]; p.ff = [30, -4]; p.bf = [-28, -8];
  return p;
}
function poseBlossomSpin() {
  const p = skillPoseBase();
  p.hipY = -62; p.lean = -0.35; p.sword = -2.2; p.chestTwist = -0.9;
  p.fh = [8, -78]; p.bh = [-6, -70]; p.ff = [12, -16]; p.bf = [-18, -10];
  return p;
}
function poseRaidThrust() {
  const p = skillPoseBase();
  p.hipY = -46; p.lean = 0.6; p.sword = 0.02; p.chestTwist = 0.5;
  p.fh = [40, -56]; p.bh = [20, -50]; p.ff = [32, 0]; p.bf = [-30, -4];
  return p;
}
function poseCamelliaPlant() {
  const p = skillPoseBase();
  p.hipY = -44; p.lean = 0.15; p.sword = 1.57; p.chestTwist = 0.05;
  p.fh = [22, -56]; p.bh = [16, -48]; p.ff = [20, 0]; p.bf = [-24, 0];
  p.kneeF = 1; p.kneeB = -1;
  return p;
}
function poseCamelliaBlast() {
  const p = skillPoseBase();
  p.hipY = -38; p.lean = 0.35; p.sword = 1.57; p.chestTwist = -0.3;
  p.fh = [26, -46]; p.bh = [18, -42]; p.ff = [30, 0]; p.bf = [-30, 0];
  return p;
}
function poseSetsunaOpen() {
  const p = skillPoseBase();
  p.hipY = -52; p.lean = -0.1; p.sword = 1.85; p.chestTwist = 0.1;
  p.fh = [20, -66]; p.bh = [-4, -64]; p.ff = [20, 0]; p.bf = [-24, 0];
  return p;
}
function poseSetsunaRelease() {
  const p = skillPoseBase();
  p.hipY = -46; p.lean = 0.45; p.sword = 0.1; p.chestTwist = 0.7;
  p.fh = [36, -58]; p.bh = [22, -48]; p.ff = [30, 0]; p.bf = [-30, 0];
  return p;
}

function poseSkillKeys(name) {
  if (name === 'blossom') return [
    { t: 0, p: poseBlossomWind() },
    { t: 0.09, p: poseBlossomSlash(), ease: easeOutCubic },
    { t: 0.30, p: poseBlossomSlash() },
    { t: 0.36, p: poseBlossomSpin(), ease: easeOutQuad },
    { t: 0.70, p: poseBlossomSpin() },
    { t: 0.80, p: poseBlossomWind(), ease: easeOutQuad },
    { t: 1.02, p: POSE.idle, ease: easeOutQuad }
  ];
  if (name === 'raid') return [
    { t: 0, p: poseRaidThrust() },
    { t: 0.08, p: poseRaidThrust() },
    { t: 0.5, p: poseRaidThrust() },
    { t: 0.58, p: poseSetsunaRelease(), ease: easeOutCubic },
    { t: 0.82, p: POSE.idle, ease: easeOutQuad }
  ];
  if (name === 'camellia') return [
    { t: 0, p: poseCamelliaPlant() },
    { t: 0.32, p: poseCamelliaPlant() },
    { t: 0.38, p: poseCamelliaBlast(), ease: easeOutCubic },
    { t: 0.72, p: poseCamelliaBlast() },
    { t: 1.38, p: POSE.idle, ease: easeOutQuad }
  ];
  return [
    { t: 0, p: poseSetsunaOpen() },
    { t: 0.14, p: poseSetsunaOpen() },
    { t: 1.18, p: poseSetsunaOpen() },
    { t: 1.26, p: poseSetsunaRelease(), ease: easeOutCubic },
    { t: 1.55, p: POSE.idle, ease: easeOutQuad }
  ];
}

/* ---------- casting ---------- */
const SKILL_RUNTIME = {
  castSkill(name) {
    const S = SKILLS[name];
    if (!S) return false;
    if (this.dead) return false;
    if (this.soul < S.cost) {
      Game.flashSkillDenied(name);
      Audio_.deny();
      return false;
    }
    this.soul -= S.cost;
    this.state = 'skill';
    this.skillName = name;
    this.skillT = 0;
    this.act = null;
    this.charging = false; this.charge = 0;
    this.queued = null;
    this.attack = null;
    this.skillHits = new Map();
    this.skillStep = 0;
    this.skillData = { lastSlash: -1, struck: new Set(), targets: [] };
    this.bladeGlow = 1;

    /* per-skill opening */
    if (name === 'blossom') {
      this.invuln = Math.max(this.invuln, S.dur - 0.16);
      Audio_.skillBlossom();
      FX.ring(this.x, this.y - 50, 10, 120, 0.4, 'rgba(255,160,200,', 3);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU;
        FX.parts.push({ type: 'petal', x: this.x + Math.cos(a) * 40, y: this.y - 50 + Math.sin(a) * 40, vx: Math.cos(a) * rand(80, 300), vy: Math.sin(a) * rand(80, 300) - 60, life: rand(0.5, 0.9), max: 0.9, r: rand(2.2, 4.2), color: pick(['#ff9fc4', '#ffc2d8', '#ff6f9c']), grav: 180, drag: 1.6, rot: Math.random() * TAU, spin: rand(-8, 8) });
      }
    } else if (name === 'raid') {
      this.invuln = Math.max(this.invuln, S.dur + 0.15);
      Audio_.skillRaid();
      this.skillData.origin = { x: this.x, y: this.y };
      /* pick up to three targets ahead */
      const cand = Game.enemies.filter(e => e.alive && e.state !== 'spawn' && (e.x - this.x) * this.facing > -70)
        .sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x)).slice(0, 3);
      this.skillData.targets = cand;
      FX.afterimage(this.makeSnapshot(), 0.35, 'rgba(140,225,255,');
      for (let i = 0; i < 16; i++) {
        FX.parts.push({ type: 'spark', x: this.x + rand(-20, 20), y: this.y - rand(20, 90), vx: rand(-160, 160), vy: rand(-180, 80), life: 0.3, max: 0.3, w: 2, color: '#bfefff', grav: 220, drag: 2 });
      }
    } else if (name === 'camellia') {
      Audio_.skillCamellia();
      Camera.kick(0.18);
    } else if (name === 'setsuna') {
      Audio_.skillSetsuna();
      FX.ring(this.x, this.y - 52, 8, 160, 0.7, 'rgba(170,200,255,', 2.4);
      FX.slash(this.x, this.y - 52, 0, 90, TAU, 0.5, 'rgba(180,210,255,', 2);
      Game.startFreeze(1.02);
    }
    return true;
  },

  updateSkill(dt) {
    const name = this.skillName;
    const S = SKILLS[name];
    this.skillT += dt;
    const t = this.skillT;
    const D = this.skillData;

    if (name === 'blossom') {
      const DASH0 = 0.10, DASH1 = 0.66;
      if (t > DASH0 && t < DASH1) {
        this.vx = this.facing * 820;
        this.x += this.vx * dt;
        const step = Math.floor(t / 0.045);
        if (step !== D.lastSlash) {
          D.lastSlash = step;
          const sx = this.x + this.facing * rand(-10, 40);
          FX.slash(sx, this.y - 52 + rand(-12, 12), (this.facing > 0 ? -0.4 : Math.PI + 0.4) + rand(-0.5, 0.5),
            rand(58, 76), rand(2.2, 3.4), 0.14, 'rgba(255,150,195,', 2.6);
          FX.addTrail(this.x - this.facing * 30, this.y - 56, this.x + this.facing * 60, this.y - 62, '255,150,195', 1.4);
          if (step % 2 === 0) {
            FX.afterimage(this.makeSnapshot(), 0.2, 'rgba(255,140,190,');
            Audio_.swing(1.2);
          }
          /* damage anything swept through */
          for (const e of Game.enemies) {
            if (!e.alive) continue;
            const last = D.struck.get(e.id) || -9;
            if (Math.abs(e.x - this.x) < 82 && t - last > 0.085) {
              D.struck.set(e.id, t);
              Game.skillHit(e, skillDef({ dmg: 7, limbDmg: 24, hitstop: 0.045, shake: 0.1, kb: 70, kbY: -30, hitH: 0.55, heavy: false, slash: null }));
            }
          }
          if (Math.random() < 0.55) {
            FX.parts.push({ type: 'petal', x: this.x + this.facing * rand(-20, 60), y: this.y - rand(30, 90), vx: this.facing * rand(40, 180), vy: rand(-120, 20), life: 0.7, max: 0.7, r: rand(2, 4), color: pick(['#ff9fc4', '#ffc2d8']), grav: 120, drag: 1.2, rot: Math.random() * TAU, spin: rand(-10, 10) });
          }
        }
      } else if (t >= DASH1) {
        this.vx *= Math.pow(0.02, dt);
        if (!D.finisher) {
          D.finisher = true;
          Camera.kick(0.42);
          this.hitstop = 0;
          Audio_.skillBurst();
          FX.ring(this.x, this.y - 54, 20, 150, 0.5, 'rgba(255,150,200,', 4);
          FX.slash(this.x, this.y - 54, -0.6, 110, 5.4, 0.3, 'rgba(255,170,210,', 3.4);
          FX.flashLocal = 0.14;
          for (let i = 0; i < 60; i++) {
            const a = Math.random() * TAU;
            FX.parts.push({ type: 'petal', x: this.x + Math.cos(a) * rand(10, 60), y: this.y - 40 + Math.sin(a) * rand(10, 50), vx: Math.cos(a) * rand(120, 460), vy: Math.sin(a) * rand(120, 460) - 150, life: rand(0.6, 1.2), max: 1.2, r: rand(2.4, 5), color: pick(['#ff9fc4', '#ffc2d8', '#ff6f9c', '#ffe2ee']), grav: 260, drag: 1.1, rot: Math.random() * TAU, spin: rand(-12, 12) });
          }
          for (const e of Game.enemies) {
            if (!e.alive) continue;
            if (Math.abs(e.x - this.x) < 140) {
              Game.skillHit(e, skillDef({ dmg: 26, limbDmg: 95, hitstop: 0.14, shake: 0.4, kb: 330, kbY: -520, hitH: 0.85, heavy: true, crack: true }));
            }
          }
          this.hitstop = 0.12;
        }
      }
      if (t >= S.dur) this.finishSkill();
      return;
    }

    if (name === 'raid') {
      const steps = D.targets && D.targets.length ? D.targets : null;
      const times = [0.10, 0.26, 0.42];
      while (D.step === undefined) D.step = 0;
      if (D.step < times.length && t >= times[D.step]) {
        const i = D.step++;
        let target = steps ? steps[Math.min(i, steps.length - 1)] : null;
        let tx, ty;
        if (target && target.alive) {
          tx = target.x - this.facing * 56; ty = GROUND_Y;
        } else {
          const ahead = this.x + this.facing * (150 + i * 90);
          tx = clamp(ahead, 60, WORLD.w - 60); ty = GROUND_Y;
        }
        FX.afterimage(this.makeSnapshot(), 0.3, 'rgba(140,225,255,');
        FX.ring(this.x, this.y - 50, 8, 70, 0.28, 'rgba(150,230,255,', 2.4);
        this.x = clamp(tx, 60, WORLD.w - 60);
        this.y = ty;
        Audio_.skillRaidStrike(i);
        FX.slash(this.x + this.facing * 26, this.y - 56, (this.facing > 0 ? 0.1 : Math.PI - 0.1), 108, 4.6, 0.22, 'rgba(150,230,255,', 3.2);
        FX.addTrail(this.x - this.facing * 50, this.y - 58, this.x + this.facing * 70, this.y - 58, '150,230,255', 1.8);
        FX.afterimage(this.makeSnapshot(), 0.26, 'rgba(120,210,255,');
        for (let k = 0; k < 18; k++) {
          FX.parts.push({ type: 'spark', x: this.x + this.facing * rand(-20, 40), y: this.y - rand(20, 100), vx: this.facing * rand(-40, 320), vy: rand(-240, 120), life: 0.32, max: 0.32, w: rand(1.5, 3), color: pick(['#bff2ff', '#7ce7ff', '#ffffff']), grav: 200, drag: 2.4 });
        }
        Camera.kick(0.3);
        for (const e of Game.enemies) {
          if (!e.alive) continue;
          if (Math.abs(e.x - this.x) < 96) {
            Game.skillHit(e, skillDef({ dmg: 20, limbDmg: 62, hitstop: 0.09, shake: 0.3, kb: 170, kbY: -140, hitH: 0.6, heavy: true, crack: true }));
          }
        }
        this.hitstop = Math.max(this.hitstop, 0.075);
      }
      if (t >= S.dur) this.finishSkill();
      return;
    }

    if (name === 'camellia') {
      this.vx *= Math.pow(0.02, dt);
      if (!D.windupFx) {
        D.windupFx = true;
        FX.ring(this.x, this.y - 6, 10, 90, 0.35, 'rgba(255,90,100,', 2.4);
      }
      if (t < 0.36) {
        /* gathering crimson runes */
        if (Math.random() < 0.6) {
          const a = rand(-2.9, -0.25);
          FX.parts.push({ type: 'spark', x: this.x + Math.cos(a) * 90, y: this.y - 20 + Math.sin(a) * 90, vx: -Math.cos(a) * 320, vy: -Math.sin(a) * 320, life: 0.35, max: 0.35, w: 1.8, color: '#ff6b74', grav: 0, drag: 0.6 });
        }
        if (Math.floor(t * 60) % 6 === 0) Camera.kick(0.03);
      }
      if (t >= 0.36 && !D.slam) {
        D.slam = true;
        Game.spawnThornWave(this.x + this.facing * 30, this.facing);
        Camera.kick(0.75);
        this.hitstop = 0.10;
        Game.flash = Math.max(Game.flash, 0.22);
        Game.flashColor = '255,60,70';
        Audio_.skillCamelliaSlam();
        FX.ring(this.x, this.y - 4, 14, 190, 0.55, 'rgba(255,80,90,', 5);
        FX.crack(this.x, this.y - 6, this.facing > 0 ? -1.4 : Math.PI + 1.4, 1.6);
        for (let i = 0; i < 30; i++) {
          FX.parts.push({ type: 'chip', x: this.x + this.facing * rand(0, 60), y: GROUND_Y - 4, vx: this.facing * rand(-80, 420), vy: rand(-520, -120), life: rand(0.6, 1.1), max: 1.1, w: rand(2.5, 6), color: pick(['#6b2630', '#a83a44', '#f0d3c8']), grav: 1500, drag: 1.2, rot: Math.random() * TAU, spin: rand(-14, 14) });
        }
      }
      if (t >= S.dur) this.finishSkill();
      return;
    }

    if (name === 'setsuna') {
      this.vx *= Math.pow(0.4, dt);
      if (t > 1.12 && !D.released) {
        D.released = true;
        Game.endFreezeDetonate();
        Camera.kick(0.5);
      }
      if (t >= S.dur) this.finishSkill();
      return;
    }
  },

  finishSkill() {
    this.state = this.onGround ? 'idle' : 'fall';
    this.skillName = null; this.skillT = 0; this.skillData = null;
    this.attack = null;
  }
};

function skillDef(o) {
  return Object.assign({
    dmg: 10, limbDmg: 20, hitstop: 0.07, shake: 0.15,
    reach: 0, kb: 160, kbY: -60, hitH: 0.55, skill: true,
    slash: null, heavy: false, crack: false
  }, o || {});
}
