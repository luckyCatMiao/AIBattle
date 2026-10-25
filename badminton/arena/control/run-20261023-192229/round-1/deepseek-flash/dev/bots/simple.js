'use strict';
/* 简单对手：预测球路 -> 跑到落点 -> 到位就挥拍。参数化挥拍偏好。 */
const core = require('../../core.js');
const { rules } = require('../../catalog.js');
const NET = rules.netX, L = rules.courtLength;
const DT = 1 / rules.hz;

module.exports = function make(opts = {}) {
  const prefer = opts.prefer || 'overhead'; // overhead | under | any
  return {
    decide(obs) {
      const g = core.rebuild(obs);
      const team = obs.yourPlayer, me = g.batsmen[team];
      const dir = me.facing;
      const home = team === 0 ? 2.9 : L - 2.9;
      const pred = core.predictShuttle(g, 70);
      const traj = pred.pts;
      // 目标：最早能打的点
      let k = -1, aim = home;
      for (let i = 1; i < traj.length; i++) {
        const p = traj[i];
        if ((p.x - NET) * dir > 0.2) continue;
        if (p.y > 2.2 || p.y < 0.15) continue;
        k = i; aim = p.x - dir * 0.38; break;
      }
      let mv = 0;
      if (k >= 0) mv = Math.max(-1, Math.min(1, (aim - me.x) * 4));
      else if (pred.land) mv = Math.max(-1, Math.min(1, ((pred.land.x - dir * 0.35) - me.x) * 4));
      else mv = Math.max(-1, Math.min(1, (home - me.x) * 3));
      const frames = [];
      for (let i = 0; i < 10; i++) {
        let sw = 0;
        if (k >= 0 && i === Math.max(0, k - 2)) sw = prefer === 'under' ? -1 : 1;
        frames.push({ move: sw ? 0 : mv, jump: false, swing: sw, charge: false, sprint: false });
      }
      return frames;
    },
  };
};
