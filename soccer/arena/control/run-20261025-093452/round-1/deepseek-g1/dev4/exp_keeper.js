'use strict';
// 门将站位实验：射手固定，门将沿「球-球门中心」连线放在距门线 k 处，
// 统计球门 5 格有效宽度中有多少落点能进球（所有人静止）。
const sim = require('../simulation.js');
const { rules, W, H } = require('../catalog');
const DT = 1/20;

function testShot(sx, sy, kx, ky, ty, team) {
  // team=1 表示射手是 team1（进攻左门 x=0）；返回 true 表示进球
  const g = sim.createMatch({ id:'x', players:[{name:'A',kind:'api'},{name:'B',kind:'api'}], seed:1, teamSize:2 });
  g.freeze = 0;
  g.ball.owner = null;
  // 射手在 (sx,sy)，门将在 (kx,ky)
  const sh = g.units.find(u=>u.team===team && u.index===1);
  const gk = g.units.find(u=>u.team===1-team && u.index===0);
  const other1 = g.units.find(u=>u.team===1-team && u.index===1);
  const other2 = g.units.find(u=>u.team===team && u.index===0);
  sh.x=sx; sh.y=sy; gk.x=kx; gk.y=ky;
  other1.x=2; other1.y=25; other2.x=42; other2.y=1;   // 挪开
  const gx = team===1 ? 1.0 : W-1.0;
  const dx = gx - sx, dy = ty - sy;
  const l = Math.hypot(dx,dy);
  const ux=dx/l, uy=dy/l;
  const off = rules.unitRadius + rules.ballRadius + 0.03;
  g.ball.x = sx + ux*off; g.ball.y = sy + uy*off;
  if (sim.circleHitsWall(g, g.ball.x, g.ball.y, rules.ballRadius)) { g.ball.x=sx; g.ball.y=sy; }
  g.ball.vx = ux*rules.kickPower; g.ball.vy = uy*rules.kickPower;
  g.ball.lastTouch = sh.id; g.ball.lastTeam = team;
  const neutral = g.units.map(()=>({dir:'N',aim:null,kick:false}));
  for (let i=0;i<90 && g.status==='playing';i++){
    for (const u of g.units) u.held = neutral[g.units.indexOf(u)];
    sim.step(g);
    if (g.score[team] > 0) return true;
  }
  return g.score[team] > 0;
}

function analyze(sx,sy,shootTeam){
  // 门将在「球->球门中心」连线上，距门线 k
  const gx = shootTeam===1 ? 1.0 : W-1.0;
  const atk = shootTeam===1 ? 1 : -1;   // 球门在 x=1 时射手在右侧
  const res = {};
  for (const k of [1.5,3,5,7,9,11,13,15]) {
    // 门将位置 = 球门中心 + (球-球门中心) 的单位向量 * k，但要限制在合法范围
    const cx = gx, cy = 13.0;
    let dx = sx-cx, dy = sy-cy; const l=Math.hypot(dx,dy)||1; dx/=l; dy/=l;
    let kx = cx + dx*k, ky = cy + dy*k;
    let goals=0, n=0;
    for (let ty=10.6; ty<=15.4; ty+=0.2) { n++; if (testShot(sx,sy,kx,ky,ty,shootTeam)) goals++; }
    res[k] = goals+'/'+n;
  }
  return res;
}

const cases = [[11,13],[12,9],[15,13],[18,7],[22,13],[26,13],[30,13],[8,17]];
for (const [sx,sy] of cases) {
  console.log('shooter('+sx+','+sy+')', JSON.stringify(analyze(sx,sy,1)));
}
