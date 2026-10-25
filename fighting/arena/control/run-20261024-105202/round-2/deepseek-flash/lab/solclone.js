// 依据公开第 1 轮录像（r1-g1 / r1-g2）中 Sol 的逐帧行为复刻的陪练。
// 观察到的特征（见 lab/sol_starts.txt）：
//  * 几乎不主动防御；在自由状态几乎每个窗口都在出招（约 45 帧一轮）。
//  * 近身（dx<~105）以 倒跃射(DP) 为主，夹杂 短弓柄 lp / 踩踏 lk。
//  * 中距离（~105-175）以 弓身横扫 hp / lp 为主。
//  * 远距离（>~280）以 穿云箭 qcf 弹为主，偶尔跳入。
//  * 气满后：先用轻招确认，命中/被挡后接超必杀；对手硬直时也直接放。
//  * 开局第 3 个窗口起跳跳入。
// 本文件只用于自测；它不是 Sol 的真实代码，也不可能完全等价。
const catalog = require('./catalog.patched.js');
const { characters } = catalog;
const MOT = {
  qcf: ['D', 'DF', 'F'], qcb: ['D', 'DB', 'B'], dp: ['F', 'D', 'DF'], hcb: ['F', 'DF', 'D', 'DB', 'B'],
};
const isUp = d => ['U', 'UF', 'UB'].includes(d);
const isBack = d => ['B', 'UB', 'DB'].includes(d);
const D = (d, b = null) => ({ dir: d, btn: b });

class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() { this.s = (1664525 * this.s + 1013904223) >>> 0; return this.s / 4294967296; }
  int(n) { return Math.floor(this.next() * n); }
  pick(a) { return a[this.int(a.length)]; }
}

class SolClone {
  // opts: {jit: 行为抖动幅度, aggression: 0..1, defense: 0..1, seed}
  constructor(seat, seed = 1, opts = {}) {
    this.seat = seat;
    this.rng = new RNG(seed * 2654435761 + 97);
    this.jit = opts.jit === undefined ? 4 : opts.jit;
    this.aggression = opts.aggression === undefined ? 1 : opts.aggression;
    this.defense = opts.defense === undefined ? 0.15 : opts.defense;
    this.nextAtk = 0;         // 帧号：这个窗口结束前允许起招
    this.jumpCool = 0;
    this.superCool = 0;
    this.lastRound = -1;
    this.planned = [];        // [{f,dir,btn}]
  }
  get def() { return null; }
  moveOf(name) {
    const c = this.C;
    for (const pool of ['normals', 'specials']) for (const m of Object.values(c[pool] || {})) if (m.name === name) return m;
    if (c.super && c.super.name === name) return c.super;
    return null;
  }
  win(g) {
    const f = g.fighters[this.seat], o = g.fighters[1 - this.seat];
    this.C = characters[f.char];
    this.f = f; this.o = o;
    this.dx = Math.abs(o.x - f.x);
    this.plan = new Map();
    const put = (k, d, b = null) => { if (k >= 1 && k <= 15) this.plan.set(k, D(d, b)); };
    const fill = (d = 'N', b = null) => { for (let k = 1; k <= 15; k++) if (!this.plan.has(k)) this.plan.set(k, D(d, b)); };
    const at = (frame, d, b = null) => { if (frame >= g.frames + 1 && frame <= g.frames + 15) this.plan.set(frame - g.frames, D(d, b)); };
    const now = g.frames;

    if (f.state === 'ko') { fill('N'); return this.out(); }
    if (f.state === 'hitstun' || f.state === 'down' || f.state === 'wakeup' || f.state === 'blockstun') {
      fill(this.guardDir(o));
      return this.out();
    }
    if (f.airborne || f.state === 'jump' || f.state === 'air') {
      if (!f.airMoveUsed && f.state === 'jump' && now - f.stateAt >= 2 && this.dx < 240) {
        // 空中重击（重腿/重拳看距离）
        const btn = this.dx < 140 ? 'HK' : 'HP';
        at(now + 1 + this.rng.int(3), 'N', btn);
      }
      fill('N');
      return this.out();
    }
    if (f.state === 'attack' || f.state === 'stance') { fill('N'); return this.out(); }

    // ---- 自由状态：Sol 的决策 ----
    const full = f.meter >= 100;
    const op2 = this.o, dx = this.dx;
    const oStun = ['hitstun', 'blockstun', 'down'].includes(op2.state);
    const oAtk = op2.state === 'attack';
    // 防御性：少量概率主动防御（真 Sol 极少这么做，留一点扰动）
    if (!oStun && !oAtk && this.rng.next() < this.defense * 0.12) {
      fill(this.guardDir(op2));
      return this.out();
    }
    // 超必杀：气满且（对手硬直 / 对手出招 / 距离很近）
    const sup = this.C.super;
    if (full && now >= this.superCool && (oStun || oAtk || dx < 120)) {
      const t = 1 + this.rng.int(Math.max(1, this.jit + 2));
      // 先用轻招确认，再取消超必杀（录像里 1125 帧就是 lp -> 万矢）
      if (dx < 140 && !oStun && !oAtk) {
        put(t, 'F', 'LP');
        this.scheduleMotion(t + 6, sup.motion, sup.button, put);
      } else if (oStun || oAtk) {
        this.scheduleMotion(t, sup.motion, sup.button, put);
      } else {
        put(t, 'F', 'LP');
        this.scheduleMotion(t + 6, sup.motion, sup.button, put);
      }
      this.superCool = now + 30;
      fill('DB');
      return this.out();
    }
    // 起跳跳入（开局和远距离）
    if (this.jumpCool <= now && dx > 150 && dx < 330 && this.rng.next() < 0.5 * this.aggression) {
      const t = 1 + this.rng.int(8);
      put(t, 'UF');
      this.jumpCool = now + 40 + this.rng.int(40);
      fill('DB');
      return this.out();
    }
    // 近身
    const lk = this.C.normals.lk, hp = this.C.normals.hp, lp = this.C.normals.lp;
    const lkR = lk.hitbox.x + lk.hitbox.w / 2 + 28, hpR = hp.hitbox.x + hp.hitbox.w / 2 + 28;
    if (dx < lkR + 6) {
      const t = 1 + this.rng.int(Math.max(1, this.jit));
      const r = this.rng.next();
      const dp = Object.values(this.C.specials).find(s => s.motion === 'dp' && !s.airOnly);
      if (r < 0.45 && dp) this.scheduleMotion(t, 'dp', dp.button, put);
      else if (r < 0.75) put(t, 'F', 'LP');
      else if (r < 0.92) put(t, 'F', 'LK');
      else put(t, 'DB', null);
      fill('DB');
      return this.out();
    }
    if (dx < hpR + 6) {
      const t = 1 + this.rng.int(Math.max(1, this.jit));
      const r = this.rng.next();
      if (r < 0.55) put(t, 'F', 'HP');
      else if (r < 0.85) put(t, 'F', 'LP');
      else put(t, 'D', 'LK');
      fill('DB');
      return this.out();
    }
    if (dx < 350) {
      const t = 1 + this.rng.int(Math.max(1, this.jit + 2));
      // 本角色的 qcf 远程手段（Kestrel 穿云箭 / Aegis 铁律弹 / Vex 影针）
      const proj = Object.values(this.C.specials).find(s => s.projectile && (s.projectile.speed || 0) > 0);
      if (proj && this.rng.next() < 0.8 * this.aggression) this.scheduleMotion(t, proj.motion, proj.button, put);
      else put(t, 'F', 'HP');
      fill('DB');
      return this.out();
    }
    // 很远的自由状态：前进或发波
    const proj = Object.values(this.C.specials).find(s => s.projectile && (s.projectile.speed || 0) > 0);
    if (proj) { const t = 1 + this.rng.int(5); this.scheduleMotion(t, proj.motion, proj.button, put); }
    else { for (let k = 1; k <= 10; k++) put(k, 'F'); }
    fill('DB');
    return this.out();
  }
  guardDir(o) {
    if (o.airborne || o.state === 'jump' || o.state === 'air') return 'B';
    const mv = o.move;
    if (mv) {
      const md = this.moveOf(mv.name);
      if (md) {
        if (md.guard === 'overhead') return 'B';
        if (md.guard === 'low') return 'DB';
      }
    }
    // 真 Sol 的默认防御：录像里绝大多数时间蹲防
    return 'DB';
  }
  scheduleMotion(t, motion, btn, put) {
    const seq = MOT[motion] || MOT.qcf;
    for (let i = 0; i < seq.length; i++) put(t + i, seq[i], i === seq.length - 1 ? btn : null);
  }
  out() {
    const a = [];
    for (let k = 1; k <= 15; k++) a.push(this.plan.get(k) || D('N'));
    return a;
  }
}
module.exports = { SolClone, RNG };
