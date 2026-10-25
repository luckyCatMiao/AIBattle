'use strict';
/* 两种“反 rush”测试对手：
 *  late      —— 站深位等发球下落，晚点下手挑高
 *  deepsmash —— 站深位等发球到 2.1~2.4 格高，远网高点下压 */
const core = require('../../core.js');
const { rules } = require('../../catalog.js');
const NET = rules.netX, L = rules.courtLength;
const DT = 1 / rules.hz;

function makeBot(kind) {
  return {
    decide(obs) {
      const g = core.rebuild(obs);
      const team = obs.yourPlayer, me = g.batsmen[team];
      const dir = me.facing;
      const home = team === 0 ? 2.9 : L - 2.9;
      const pred = core.predictShuttle(g, 90);
      const traj = pred.pts;
      let k = -1, aim = home, type = -1;
      for (let i = 1; i < traj.length; i++) {
        const p = traj[i];
        if ((p.x - NET) * dir > 0.25) continue;         // 还没过网
        const d = Math.abs(p.x - NET);
        if (kind === 'late') {
          if (d > 2.0 && p.y >= 0.45 && p.y <= 1.7) { k = i; aim = p.x - dir * 0.38; type = -1; break; }
        } else {
          if (d > 2.2 && p.y >= 2.0 && p.y <= 2.35) { k = i; aim = p.x - dir * 0.38; type = 1; break; }
        }
      }
      let mv;
      if (k >= 0) mv = Math.max(-1, Math.min(1, (aim - me.x) * 5));
      else if (pred.land) mv = Math.max(-1, Math.min(1, ((pred.land.x - dir * 0.4) - me.x) * 4));
      else mv = Math.max(-1, Math.min(1, (home - me.x) * 3));
      const frames = [];
      for (let i = 0; i < 10; i++) {
        let sw = 0;
        if (k >= 0 && i === Math.max(0, k - 2)) sw = type;
        frames.push({ move: sw ? 0 : mv, jump: false, swing: sw, charge: false, sprint: false });
      }
      return frames;
    },
  };
}
module.exports = makeBot;
