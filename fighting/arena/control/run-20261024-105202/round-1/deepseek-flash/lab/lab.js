// Route lab: drive owner 0 with an explicit frame schedule, owner 1 with a script.
const sim = require('./simulation.patched.js');
const ALL = ['aegis','vex','kestrel','torv','nyx','sable'];
const N = {dir:'N',btn:null}, I=(d,b=null)=>({dir:d,btn:b});

function teamFor(ch, opp){ // 3 distinct, ch first
  const t=[ch]; for(const c of ALL) if(c!==ch&&t.length<3) t.push(c); return t;
}
function teamForOpp(ch, opp){
  const t=[]; if(opp!==ch) t.push(opp);
  for(const c of ALL) if(c!==ch&&c!==opp&&t.length<3) t.push(c);
  return t;
}
function mk(a,b,s){return sim.createMatch({id:'L'+s,players:[{name:'A',kind:'api',team:a},{name:'B',kind:'api',team:b}],seed:s});}

function run(char, oppChar, dx, schedule, opp, frames, meter, extra) {
  const g = mk(teamFor(char,oppChar), teamForOpp(char,oppChar), 7);
  g.fighters[0].x = 640 - dx/2; g.fighters[1].x = 640 + dx/2;
  if (meter !== undefined) g.fighters[0].meter = meter;
  if (extra) extra(g);
  const log = [];
  for (let i=0;i<frames && g.status==='playing';i++){
    const a = schedule[i] ? I(schedule[i][0], schedule[i][1]) : N;
    sim.stepFrame(g,[a, opp?opp(i):N]);
    log.push({f:i, p0:g.fighters[0].state, p1:g.fighters[1].state, hp1:Math.round(g.fighters[1].hp), m0:Math.round(g.fighters[0].meter), m1:Math.round(g.fighters[1].meter), mv:g.fighters[0].move?g.fighters[0].move.frame:null, mv1:g.fighters[1].move?g.fighters[1].move.name+':'+g.fighters[1].move.frame:null, hs1:g.fighters[1].hitstunLeft, x0:Math.round(g.fighters[0].x), x1:Math.round(g.fighters[1].x)});
  }
  return {g, log};
}
function summarize(r){
  const hits = r.g.events.filter(e=>e.type==='hit'&&e.owner===0);
  const blocks = r.g.events.filter(e=>e.type==='block'&&e.owner===1);
  return {dmg: r.g.players[0].damageDealt, hits: r.g.players[0].hits, meter: Math.round(r.g.fighters[0].meter), oppHp: Math.round(r.g.fighters[1].hp), status:r.g.status, winner:r.g.winner, blocks:blocks.length, ev: hits.map(h=>`${h.frame}:${h.damage}`).join(' ')};
}
module.exports={run,summarize,mk,I,N,ALL,teamFor,teamForOpp};
