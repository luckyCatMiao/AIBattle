const sim = require('./simulation.patched.js');
const ALL=['aegis','vex','kestrel','torv','nyx','sable'];
const N={dir:'N',btn:null};
function teamOf(c){ return [c, ...ALL.filter(x=>x!==c).slice(0,2)]; }
function oppOf(c){ return ALL.filter(x=>x!==c).slice(0,3); }
function drive(me, opp, dist, off, meter, Bdir, frames){
  const g = sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:teamOf(me)},{name:'B',kind:'api',team:oppOf(me)}], seed:1});
  g.fighters[0].meter = meter===undefined?100:meter;
  g.fighters[1].x = 420 + dist;
  const p={}; for(const o of off){ p[1+o[0]]={dir:o[1],btn:o[2]}; }
  for(let f=1; f<=frames && g.status==='playing'; f++) sim.stepFrame(g, [p[f]||N, {dir:Bdir||'N',btn:null}]);
  return g;
}
const routes={
 'vex-lp-full':['vex',[[0,'F','LP'],[8,'F','LK'],[17,'F','HP'],[34,'D',null],[35,'DF',null],[36,'F','HP']],100],
 'vex-lp-nom':['vex',[[0,'F','LP'],[8,'F','LK'],[17,'F','HP'],[34,'D',null],[35,'DB',null],[36,'B','LK']],0],
 'vex-lk-full':['vex',[[0,'F','LK'],[9,'F','HP'],[26,'D',null],[27,'DF',null],[28,'F','HP']],100],
 'kes-hp-full':['kestrel',[[0,'F','HP'],[16,'F','HK'],[34,'D',null],[35,'DF',null],[36,'F','HP']],100],
 'kes-hp-nom':['kestrel',[[0,'F','HP'],[16,'F','HK'],[34,'D',null],[35,'DB',null],[36,'B','HP']],0],
 'kes-lp-nom':['kestrel',[[0,'F','LP'],[8,'F','LK'],[14,'F',null],[15,'D',null],[16,'DF','HK']],0],
 'aeg-hp-full':['aegis',[[0,'F','HP'],[20,'F','HK'],[42,'D',null],[43,'DF',null],[44,'F','HP']],100],
 'aeg-hp-nom':['aegis',[[0,'F','HP'],[20,'F','HK'],[42,'F',null],[43,'D',null],[44,'DF','HP']],0],
 'aeg-lp-nom':['aegis',[[0,'F','LP'],[9,'F','LK'],[18,'F','LP'],[27,'F',null],[28,'D',null],[29,'DF','HP']],0],
 'aeg-lk-nom':['aegis',[[0,'F','LK'],[10,'F','LP'],[19,'F','LK'],[28,'F',null],[29,'D',null],[30,'DF','HP']],0],
};
for(const [name,[me,off,mt]] of Object.entries(routes)){
  let o=[];
  for(const dist of [55,70,85,100,110]){
    const g=drive(me,'kestrel',dist,off,mt,'N',160);
    const hits=g.events.filter(e=>e.type==='hit');
    o.push(`d${dist}:${hits.reduce((s,h)=>s+h.damage,0)}`);
  }
  const g2=drive(me,'kestrel',80,off,mt,'B',160);
  o.push('BLK:'+g2.events.filter(e=>e.type==='hit').reduce((s,h)=>s+h.damage,0));
  console.log(name.padEnd(14), o.join(' '));
}
