const sim = require('./simulation.patched.js');
const ALL=['aegis','vex','kestrel','torv','nyx','sable'];
const N={dir:'N',btn:null};
function teamOf(c){ return [c, ...ALL.filter(x=>x!==c).slice(0,2)]; }
function oppOf(c){ return ALL.filter(x=>x!==c).slice(0,3); }
function drive(me, opp, dist, off, Bdir, frames, Bplan){
  const g = sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:teamOf(me)},{name:'B',kind:'api',team:oppOf(me)}], seed:1});
  g.fighters[0].meter = 100;
  g.fighters[1].x = 420 + dist;
  const p={}; for(const o of off){ p[1+o[0]]={dir:o[1],btn:o[2]}; }
  for(let f=1; f<=frames && g.status==='playing'; f++) sim.stepFrame(g, [p[f]||N, (Bplan&&Bplan[f])||{dir:Bdir||'N',btn:null}]);
  return g;
}
const superOnly = [[0,'D',null],[1,'DF',null],[2,'F','HP']];
console.log('=== Vex 超必杀裸发，对手站桩');
for(const dist of [60,80,100,120,140,160,180,200,240]){
  const g=drive('vex','kestrel',dist,superOnly,'N',120);
  const hits=g.events.filter(e=>e.type==='hit');
  console.log(' dist',dist,'dmg',hits.reduce((s,h)=>s+h.damage,0),'hits',hits.length,'status',g.status);
}
console.log('=== Vex 超必杀，对手先出招 (kestrel hp startup11)');
for(const dist of [80,100,120,140]){
  const bp={}; bp[1]={dir:'F',btn:'HP'};
  const g=drive('vex','kestrel',dist,superOnly,'N',120,bp);
  const hits=g.events.filter(e=>e.type==='hit');
  console.log(' dist',dist,'dmg',hits.reduce((s,h)=>s+h.damage,0),'hits',hits.length,'Bhp',Math.round(g.fighters[1].hp));
}
console.log('=== 对手按住站防');
for(const dist of [80,110]){
  const g=drive('vex','kestrel',dist,superOnly,'B',120);
  console.log(' dist',dist,'dmg',g.events.filter(e=>e.type==='hit').reduce((s,h)=>s+h.damage,0),'blocks',g.players[1].blocks);
}
console.log('=== Kestrel 超必杀裸发');
for(const dist of [80,100,120,140,160]){
  const g=drive('kestrel','aegis',dist,[[0,'D',null],[1,'DF',null],[2,'F','HP']],'N',140);
  console.log(' dist',dist,'dmg',g.events.filter(e=>e.type==='hit').reduce((s,h)=>s+h.damage,0),'status',g.status);
}
