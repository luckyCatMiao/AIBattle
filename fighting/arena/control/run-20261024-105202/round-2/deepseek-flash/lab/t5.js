const sim = require('./simulation.patched.js');
const ALL=['aegis','vex','kestrel','torv','nyx','sable'];
const N={dir:'N',btn:null};
function teamOf(c){ return [c, ...ALL.filter(x=>x!==c).slice(0,2)]; }
function oppOf(c){ return ALL.filter(x=>x!==c).slice(0,3); }
function drive(me, opp, dist, plan, Bdir, frames, Bplan){
  const g = sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:teamOf(me)},{name:'B',kind:'api',team:oppOf(me)}], seed:1});
  g.fighters[0].meter = 100;
  g.fighters[1].x = 420 + dist;
  const log=[];
  for(let f=1; f<=frames && g.status==='playing'; f++){
    const ia = plan[f] || N;
    const ib = (Bplan && Bplan[f]) || {dir: Bdir||'N', btn:null};
    sim.stepFrame(g, [ia, ib]);
    const a=g.fighters[0], b=g.fighters[1];
    log.push(`${String(f).padStart(3)} A(${a.state},${a.move?a.move.name+'/'+a.move.frame:''},x${Math.round(a.x)},hp${Math.round(a.hp)}) B(${b.state},hp${Math.round(b.hp)},cmb${b.hitTaken},x${Math.round(b.x)})`);
  }
  return {g, log};
}
let plan={};
plan[1]={dir:'F',btn:'HP'};
plan[11]={dir:'F',btn:'LK'};
plan[16]={dir:'F',btn:'HP'};
plan[26]={dir:'D',btn:null}; plan[27]={dir:'DF',btn:null}; plan[28]={dir:'F',btn:'HP'};
let r = drive('vex','aegis',80,plan,'N',50);
console.log(r.log.slice(0,48).join('\n'));
console.log('--- events:', r.g.events.map(e=>e.type+':'+(e.damage||e.text)).join(' | '));
