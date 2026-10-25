'use strict';
const path = require('node:path');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));
function scenario(label, frontMove, jumpAt) {
  const g = sim.createMatch({ id:'t', seed: 1001, players:[{name:'A',kind:'api'},{name:'B',kind:'api'}] });
  for (let i=0;i<40;i++) sim.step(g);   // 过 freeze
  const R = g.runners;
  R[0].x = 19.2; R[0].y = 3; R[0].vx = 0; R[0].vy = 0; R[0].onGround = true; R[0].prevX = 19.2;
  R[1].x = 20.0; R[1].y = 3; R[1].vx = 0; R[1].vy = 0; R[1].onGround = true; R[1].prevX = 20.0;
  // R1 在前（x 大）站着；R0 在后，全速追，第 jumpAt 帧起跳
  const log = [];
  for (let f = 0; f < 40; f++) {
    R[0].held = { move: 1, jump: f === jumpAt };
    R[1].held = { move: frontMove, jump: false };
    sim.step(g);
    log.push(`f${f} A=(${R[0].x.toFixed(2)},${R[0].y.toFixed(2)}) B=(${R[1].x.toFixed(2)},${R[1].y.toFixed(2)}) ${R[0].x>R[1].x?'A-AHEAD':'B-ahead'}`);
  }
  console.log('==', label, 'frontMove=', frontMove, 'jumpAt=', jumpAt);
  console.log(log.slice(0, 24).join('\n'));
  console.log('end A.x=%s B.x=%s  pushes A->B=%d', R[0].x.toFixed(2), R[1].x.toFixed(2),
    g.events.filter(e=>e.type==='push'&&e.from===0).length);
}
scenario('front idle, rear jumps immediately', 0, 0);
scenario('front idle, rear waits 4f then jumps', 0, 4);
scenario('front runs full, rear jumps', 1, 0);
