const sim = require('./simulation.patched.js');
const N={dir:'N',btn:null}, I=(d,b=null)=>({dir:d,btn:b});
function mk(a,b,s){return sim.createMatch({id:'x'+s,players:[{name:'A',kind:'api',team:a},{name:'B',kind:'api',team:b}],seed:s});}
function trace(char, seed, blocker){
  const g = mk([char,'aegis','nyx'], ['torv','nyx','sable'], seed);
  g.fighters[0].meter=100; g.fighters[0].x=600; g.fighters[1].x=700;
  const seq=[I('D'),I('DF'),I('F','HP')];
  for(let i=0;i<150 && g.status==='playing';i++){
    sim.stepFrame(g,[seq[i]||N, blocker?I('B'):N]);
    if(i<20 || i%5===0){
      const f0=g.fighters[0], f1=g.fighters[1];
      console.log(`f${i} p0(${f0.state},mv=${f0.move?f0.move.name+':'+f0.move.frame:'-'}) p1(${f1.state},hp=${Math.round(f1.hp)},hs=${f1.hitstunLeft},inv=${f1.invulnUntil>g.frames}) proj=${g.projectiles.length}`);
    }
  }
  console.log(char, 'seed',seed,'blocker',!!blocker,'-> status',g.status,'winner',g.winner,'hp1',Math.round(g.fighters[1].hp),'rounds',g.roundLog.length, JSON.stringify(g.roundLog));
  console.log('---');
}
trace('vex', 1, false);
trace('kestrel', 2, false);
trace('kestrel', 2, true);
