// 依据 r1-g1 / r1-g2 录像里 Sol 的输入分布，复刻一个「长弓 Kestrel 压制」陪练：
// 默认蹲防；近距离用 DP（倒跃射）反打，中距离用弓身横扫/短弓柄，远距离发穿云箭；
// 气满时在对手出招/受击时接超必杀；偶尔跳入。仅用于自测，不代表 Sol 的真实代码。
const D = (d, b = null) => ({ dir: d, btn: b });

class SolBot {
  constructor(seat) {
    this.seat = seat;
    this.cool = 0;
    this.jumpCool = 0;
    this.lastState = '';
  }
  guardDir(mv, airborne) {
    if (airborne) return 'B';
    const g = mv && mv.data && mv.data.guard;
    if (g === 'overhead') return 'B';
    return 'DB';
  }
  window(g) {
    const f = g.fighters[this.seat], o = g.fighters[1 - this.seat];
    const dx = Math.abs(o.x - f.x);
    const out = [];
    const push = (d, b = null) => { if (out.length < 15) out.push(D(d, b)); };
    // 硬直/受击：先防
    if (['blockstun', 'hitstun', 'down', 'wakeup'].includes(f.state)) {
      const db = this.guardDir(o.move, o.airborne);
      while (out.length < 15) push(db);
      return out;
    }
    if (f.state === 'jump' || f.state === 'air' || f.airborne) {
      if (!f.airMoveUsed && f.state === 'jump' && dx < 170) {
        push('N'); push('N', 'HK');
      } else push('N');
      while (out.length < 15) push('N');
      return out;
    }
    if (f.state === 'attack') {
      while (out.length < 15) push('DB');
      return out;
    }
    this.cool = Math.max(0, this.cool - 1);
    this.jumpCool = Math.max(0, this.jumpCool - 1);
    const full = f.meter >= 100;
    const oAtk = o.state === 'attack';
    const oStun = o.state === 'hitstun';
    const reach = (n) => { const m = f.def.normals[n]; const hb = m.hitbox; return hb.x + hb.w / 2 + 28; };
    // 超必杀：对手出招/受击/近距离且气满
    if (full && dx <= 145 && (oAtk || oStun || dx <= 110) && this.cool === 0) {
      push('D'); push('DF'); push('F', 'HP'); push('F', 'HP'); push('F', 'HP');
      while (out.length < 15) push('DB');
      this.cool = 12;
      return out;
    }
    // 对手跳入 -> 蹲防（或 DP 对空）
    if (o.airborne && dx < 130 && this.cool === 0) {
      push('F'); push('D'); push('DF', 'HK'); push('DF', 'HK'); push('DF', 'HK');
      while (out.length < 15) push('DB');
      this.cool = 10;
      return out;
    }
    // 对手出招：近距离 DP 反打（有 1-7 帧无敌），中距离蹲防
    if (oAtk) {
      const remain = o.move ? Math.max(0, (o.move.startup + o.move.active + o.move.recovery) - o.move.frame) : 99;
      if (dx <= 130 && this.cool === 0 && remain > 6) {
        push('F'); push('D'); push('DF', 'HK'); push('DF', 'HK'); push('DF', 'HK');
        while (out.length < 15) push('DB');
        this.cool = 10;
        return out;
      }
      while (out.length < 15) push(this.guardDir(o.move, o.airborne));
      return out;
    }
    // 中立：按距离选招
    if (this.cool === 0 && !o.airborne) {
      if (dx < reach('lk') + 8) {
        push('F'); push('D'); push('DF', 'HK'); push('DF', 'HK'); push('DF', 'HK');
        while (out.length < 15) push('DB');
        this.cool = 9;      // 约每 45 帧一次，和录像节奏一致
        return out;
      }
      if (dx < reach('hp') + 4) {
        push('F', 'HP');
        while (out.length < 15) push('DB');
        this.cool = 8;
        return out;
      }
      if (dx < 330) {
        push('D'); push('DF'); push('F', 'LP'); push('F', 'LP');
        while (out.length < 15) push('DB');
        this.cool = 9;
        return out;
      }
    }
    if (dx > 180 && this.jumpCool === 0 && this.cool === 0) {
      push('UF'); push('UF');
      while (out.length < 15) push('DB');
      this.jumpCool = 25;
      return out;
    }
    while (out.length < 15) push('DB');
    return out;
  }
}

module.exports = { SolBot };
