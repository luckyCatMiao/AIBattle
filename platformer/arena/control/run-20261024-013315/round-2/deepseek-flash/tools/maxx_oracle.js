'use strict';
/* 在真实 sim 上暴力搜索：卡死图（3 连刺）能拿到的最远 maxX。
   策略族：一直 move=1，在 x>=T 的第一帧起跳；扫描 T。 */
const path = require('node:path');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));
function trial(levelSeed, T, seat=1) {
  const g = sim.createMatch({ id:'m', seed: 424242, players:[{name:'A',kind:'api'},{name:'B',kind:'api'}] });
  // 强制指定关卡：直接改写 seed/round 后用 generateLevel 重建
  const lv = sim.generateLevel(levelSeed);
  g.w = lv.w; g.h = lv.h; g.tiles = lv.tiles; g.goalX = lv.goalX; g.startX = lv.startX;
  g.platforms = lv.platforms; g.plants = lv.plants; g.saws = lv.saws;
  g.platformRects = []; g.plantStates = []; g.sawStates = []; g.crumbleTimers = new Map(); g.gone = new Map();
  g.time = 0; g.runners = [];
  for (let team=0; team<2; team++) g.runners.push({
    id:'p'+team, team, index:team, name:'x', x: g.startX+team*0.9, prevX: g.startX+team*0.9,
    y: g.h-13, vx:0, vy:0, onGround:true, facing:1, held:{move:0,jump:false},
    invuln:0, deaths:0, finished:false, finishTime:null, maxX:g.startX, inputHistory: [] });
  g.monsters=[]; g.monsterTimer=999; g.roundLeft=90; g.freezeLeft=0; g.phase='race';
  sim.step(g); // 刷新 machine
  const R = g.runners[seat];
  let jumped = false;
  for (let f=0; f<400; f++) {
    const jump = (!jumped && R.x >= T && R.onGround);
    if (jump) jumped = true;
    R.held = { move: 1, jump };
    g.runners[1-seat].held = { move: 0, jump: false };
    sim.step(g);
    if (jumped && R.maxX > T + 5) break;
  }
  return R.maxX;
}
const levelSeed = Number(process.argv[2]);       // 例如 7004*131+1*977
const s = Number(process.argv[3]);               // 刺起始列
let best = 0, bestT = 0;
for (let T = s-2.0; T <= s+0.2; T += 0.02) {
  const mx = trial(levelSeed, T);
  if (mx > best) { best = mx; bestT = T; }
}
console.log(JSON.stringify({levelSeed, s, best:+best.toFixed(3), bestT:+bestT.toFixed(2), offset:+(best-s).toFixed(3)}));
