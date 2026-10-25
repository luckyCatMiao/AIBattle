'use strict';
/* 实验：后方玩家能否跳过前方玩家实现反超；推挤的速度上限。 */
const path = require('node:path');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));

function run(label, inputsA, inputsB, nframes) {
  const g = sim.createMatch({ id:'t', seed: 1001, players:[{name:'A',kind:'api'},{name:'B',kind:'api'}] });
  // 跳过 freeze 阶段
  for (let i=0;i<40;i++) sim.step(g);
  console.log(label, 'phase=', g.phase, 'start x', g.runners.map(r=>r.x.toFixed(2)).join(','));
  for (let f=0; f<nframes; f++) {
    g.runners[0].held = inputsA(f);
    g.runners[1].held = inputsB(f);
    sim.step(g);
    if (g.phase !== 'race') break;
  }
  const [a,b] = g.runners;
  console.log('  end: A x=%s maxX=%s | B x=%s maxX=%s | deaths %d/%d | pushes A->B=%d B->A=%d',
    a.x.toFixed(2), a.maxX.toFixed(2), b.x.toFixed(2), b.maxX.toFixed(2), a.deaths, b.deaths,
    g.events.filter(e=>e.type==='push'&&e.from===0).length,
    g.events.filter(e=>e.type==='push'&&e.from===1).length);
  return g;
}

// 场景 1：两人都全速向右；B 在前（起点 B 本来就在前 0.9 格）
console.log('=== case1 both run right (B ahead) ===');
run('c1', f=>({move:1,jump:false}), f=>({move:1,jump:false}), 60);

// 场景 2：A 落后 1.5 格（手动设置），A 起跳一次；看能否越过 B
console.log('=== case2 A behind, jumps ===');
{
  const g = sim.createMatch({ id:'t', seed: 1001, players:[{name:'A',kind:'api'},{name:'B',kind:'api'}] });
  for (let i=0;i<40;i++) sim.step(g);
  g.runners[0].x = 20; g.runners[0].y = 3; g.runners[0].vx = 6.8; g.runners[0].prevX=20;
  g.runners[1].x = 21.2; g.runners[1].y = 3; g.runners[1].vx = 6.8; g.runners[1].prevX=21.2;
  for (let f=0; f<40; f++) {
    // A: 第 1 帧起跳，其余全速；B 全速
    g.runners[0].held = (f===0)?{move:1,jump:true}:{move:1,jump:false};
    g.runners[1].held = {move:1,jump:false};
    sim.step(g);
    const [a,b]=g.runners;
    if (f<22) console.log(`  f${f} A=(${a.x.toFixed(2)},${a.y.toFixed(2)},og=${a.onGround},vx=${a.vx.toFixed(2)}) B=(${b.x.toFixed(2)},${b.y.toFixed(2)}) ${a.x>b.x?'A-AHEAD':'B-ahead'}`);
  }
  const [a,b]=g.runners;
  console.log('  result A.x=%s B.x=%s', a.x.toFixed(2), b.x.toFixed(2));
}
