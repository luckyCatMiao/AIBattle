const sim = require('./simulation.patched.js');
const cat = require('./catalog.patched.js');
const ALL=['aegis','vex','kestrel','torv','nyx','sable'];
const N={dir:'N',btn:null};
function teamOf(c){ return [c, ...ALL.filter(x=>x!==c).slice(0,2)]; }
function oppOf(c){ return ALL.filter(x=>x!==c).slice(0,3); }

// frame-level driver: fn(frame) -> input for A ; B holds given dir
function drive(me, opp, dist, plan, Bdir, frames){
  const g = sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:teamOf(me)},{name:'B',kind:'api',team:oppOf(me)}], seed:1});
  g.fighters[0].meter = 100;
  g.fighters[1].x = 420 + dist;
  const log=[];
  for(let f=1; f<=frames && g.status==='playing'; f++){
    const ia = plan[f] || N;
    const ib = {dir: Bdir||'N', btn:null};
    sim.stepFrame(g, [ia, ib]);
    const a=g.fighters[0], b=g.fighters[1];
    log.push(`${f} A(${a.state},mv:${a.move?a.move.name+'/'+a.move.frame:''},x${Math.round(a.x)},hp${Math.round(a.hp)}) B(${b.state},hp${Math.round(b.hp)},cmb${b.hitTaken},x${Math.round(b.x)})`);
  }
  return {g, log};
}

// Vex chain: hp at 1, lk at 10, hp at 15, super motion at 25,26,27
let plan={};
plan[1]={dir:'F',btn:'HP'};
plan[10]={dir:'F',btn:'LK'};
plan[15]={dir:'F',btn:'HP'};
plan[25]={dir:'D',btn:null}; plan[26]={dir:'DF',btn:null}; plan[27]={dir:'F',btn:'HP'};
let r = drive('vex','aegis',80,plan,'N',60);
console.log(r.log.join('\n'));
console.log('--- events:', r.g.events.map(e=>e.type+':'+(e.damage||e.text)).join(' | '));
