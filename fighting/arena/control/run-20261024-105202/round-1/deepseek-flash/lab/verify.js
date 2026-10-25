const sim = require('./simulation.patched.js');
function mk(teamA, teamB, seed) {
  return sim.createMatch({id:'v'+seed, players:[{name:'A',kind:'api',team:teamA},{name:'B',kind:'api',team:teamB}], seed});
}
const N = {dir:'N',btn:null};
const I = (d,b=null)=>({dir:d,btn:b});

function run(g, planA, frames) {
  // planA: array of per-frame inputs for owner 0 (owner1 neutral)
  for (let i=0;i<frames && g.status==='playing';i++){
    const a = planA[i] || N;
    sim.advanceWindow(g, [[a], [N]]); // advanceWindow takes window arrays; use stepFrame instead
  }
}
function runF(g, inA, inB, frames){
  for (let i=0;i<frames && g.status==='playing';i++){
    sim.stepFrame(g, [inA(i), inB?inB(i):N]);
  }
}
module.exports={mk,I,N,runF};

if (require.main === module) {
  // Test 1: Vex super (qcf HP) at close range vs standing dummy
  let g = mk(['vex','aegis','kestrel'], ['torv','nyx','sable'], 1);
  g.fighters[0].meter = 100;
  g.fighters[0].x = 600; g.fighters[1].x = 700; // dx=100
  const seq = [];
  seq.push(I('D')); seq.push(I('DF')); seq.push(I('F','HP'));
  let k=0;
  runF(g, (i)=> seq[i]||N, ()=>N, 120);
  console.log('T1 vex super: status', g.status, 'winner', g.winner, 'hp1', Math.round(g.fighters[1].hp), 'hp0', Math.round(g.fighters[0].hp));
  console.log('   roundLog', JSON.stringify(g.roundLog));

  // Test 2: Kestrel super
  g = mk(['kestrel','aegis','vex'], ['torv','nyx','sable'], 2);
  g.fighters[0].meter = 100; g.fighters[0].x=600; g.fighters[1].x=700;
  runF(g, (i)=> seq[i]||N, ()=>N, 120);
  console.log('T2 kestrel super: winner', g.winner, 'hp1', Math.round(g.fighters[1].hp));

  // Test 3: Aegis super
  g = mk(['aegis','vex','kestrel'], ['torv','nyx','sable'], 3);
  g.fighters[0].meter = 100; g.fighters[0].x=600; g.fighters[1].x=700;
  runF(g, (i)=> seq[i]||N, ()=>N, 120);
  console.log('T3 aegis super: winner', g.winner, 'hp1', Math.round(g.fighters[1].hp));

  // Test 4: Vex super blocked (opponent holds B)
  g = mk(['vex','aegis','kestrel'], ['torv','nyx','sable'], 4);
  g.fighters[0].meter = 100; g.fighters[0].x=600; g.fighters[1].x=700;
  runF(g, (i)=> seq[i]||N, ()=>I('B'), 120);
  console.log('T4 vex super BLOCKED: hp1', Math.round(g.fighters[1].hp), 'guard1', Math.round(g.fighters[1].guard), 'state1', g.fighters[1].state, 'meter0', Math.round(g.fighters[0].meter));
}
