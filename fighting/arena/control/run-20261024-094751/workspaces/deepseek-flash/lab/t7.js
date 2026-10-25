const sim = require('./simulation.patched.js');
const ALL=['aegis','vex','kestrel','torv','nyx','sable'];
const N={dir:'N',btn:null};
function teamOf(c){ return [c, ...ALL.filter(x=>x!==c).slice(0,2)]; }
function oppOf(c){ return ALL.filter(x=>x!==c).slice(0,3); }
function drive(me, opp, dist, plan, Bdir, frames){
  const g = sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:teamOf(me)},{name:'B',kind:'api',team:oppOf(me)}], seed:1});
  g.fighters[0].meter = 100;
  g.fighters[1].x = 420 + dist;
  for(let f=1; f<=frames && g.status==='playing'; f++){
    sim.stepFrame(g, [plan[f]||N, {dir:Bdir||'N',btn:null}]);
  }
  return g;
}
// tight combo: s=1
let plan={1:{dir:'F',btn:'LP'},9:{dir:'F',btn:'LK'},18:{dir:'F',btn:'HP'},35:{dir:'D',btn:null},36:{dir:'DF',btn:null},37:{dir:'F',btn:'HP'}};
for(const dist of [60,80,100,110,120,125,130]){
  const g=drive('vex','aegis',dist,plan,'N',140);
  const hits=g.events.filter(e=>e.type==='hit');
  console.log('dist',dist,'dmg',hits.reduce((s,h)=>s+h.damage,0),'hits',hits.map(h=>h.damage).join(','),'| rounds',JSON.stringify(g.roundLog.map(r=>r.reason+' '+r.winnerChar+' hp'+r.winnerHp)));
}
// vs blocking opponent
for(const bd of ['B','DB','N']){
  const g=drive('vex','aegis',80,plan,bd,140);
  const hits=g.events.filter(e=>e.type==='hit');
  console.log('Bdir',bd,'dmg',hits.reduce((s,h)=>s+h.damage,0),'hits',hits.length,'blocks',g.players[1].blocks);
}
