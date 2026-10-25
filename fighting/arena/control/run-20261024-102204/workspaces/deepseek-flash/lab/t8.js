const sim = require('./simulation.patched.js');
const ALL=['aegis','vex','kestrel','torv','nyx','sable'];
const N={dir:'N',btn:null};
function teamOf(c){ return [c, ...ALL.filter(x=>x!==c).slice(0,2)]; }
function oppOf(c){ return ALL.filter(x=>x!==c).slice(0,3); }
function drive(me, opp, dist, plan, meter, Bdir, frames){
  const g = sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:teamOf(me)},{name:'B',kind:'api',team:oppOf(me)}], seed:1});
  g.fighters[0].meter = meter===undefined?100:meter;
  g.fighters[1].x = 420 + dist;
  for(let f=1; f<=frames && g.status==='playing'; f++){
    sim.stepFrame(g, [plan[f]||N, {dir:Bdir||'N',btn:null}]);
  }
  return g;
}
function rep(off,dir,btn){return [off,dir,btn];}
function plan(offsets){ const p={}; for(const o of offsets){ p[1+o[0]]={dir:o[1],btn:o[2]}; } return p; }

const routes = {
  'vex-full': [[0,'F','LP'],[8,'F','LK'],[17,'F','HP'],[34,'D',null],[35,'DF',null],[36,'F','HP']],
  'vex-nom':  [[0,'F','LP'],[8,'F','LK'],[17,'F','HP'],[34,'D',null],[35,'DB',null],[36,'B','LK']],
  'kes-full': [[0,'F','HP'],[16,'F','HK'],[34,'D',null],[35,'DF',null],[36,'F','HP']],
  'kes-nom':  [[0,'F','LP'],[8,'F','LK'],[17,'F','LP'],[25,'F',null],[26,'D',null],[27,'DF','HK']],
  'aeg-full': [[0,'F','HP'],[20,'F','HK'],[42,'D',null],[43,'DF',null],[44,'F','HP']],
  'aeg-nom':  [[0,'F','LP'],[9,'F','LK'],[18,'F','LP'],[27,'F',null],[28,'D',null],[29,'DF','HP']],
};
const who = {'vex-full':'vex','vex-nom':'vex','kes-full':'kestrel','kes-nom':'kestrel','aeg-full':'aegis','aeg-nom':'aegis'};
for(const [name,off] of Object.entries(routes)){
  const me = who[name]; const mt = name.endsWith('full')?100:0;
  let out=[];
  for(const dist of [60,80,100,115]){
    const g=drive(me,'kestrel',dist,plan(off),mt,'N',150);
    const hits=g.events.filter(e=>e.type==='hit');
    out.push(`d${dist}:${hits.reduce((s,h)=>s+h.damage,0)}(${hits.length}h)`);
  }
  const g=drive(me,'kestrel',80,plan(off),mt,'B',150);
  out.push('BLOCKED:'+g.events.filter(e=>e.type==='hit').reduce((s,h)=>s+h.damage,0));
  console.log(name.padEnd(10), out.join('  '));
}
