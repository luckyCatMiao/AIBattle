'use strict';
const sim = require('../simulation');
const { PyAgent } = require('./run_match');
async function main(){
 const seed=Number(process.argv[2]||2), target=Number(process.argv[3]||1), every=Number(process.argv[4]||1);
 const a=new PyAgent(['python3','/workspace/agent.py'],'t0',{AGENT_ATK:'stack'});
 const b=new PyAgent(['python3','/workspace/agent.py'],'t1',{AGENT_VARIANT:'C'});
 const g=sim.createMatch({id:'x',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
 let guard=0,tick=0;
 while(g.status==='playing'&&guard++<5000){
  if(g.phase==='buy'){const v0=sim.view(g,0),v1=sim.view(g,1);const [b0,b1]=await Promise.all([a.buy(v0),b.buy(v1)]);sim.submitBuys(g,0,b0.buys||[]);sim.submitBuys(g,1,b1.buys||[]);tick=0;}
  else if(g.phase==='live'){
   if(g.round===target&&tick%every===0){
    const f=u=>`${u.id}(${u.x.toFixed(1)},${u.y.toFixed(1)})hp${u.hp}${u.alive?'':'X'}${u.held.dir}/${u.held.aim||'-'}`;
    console.log(`t=${g.now.toFixed(1)} T0 ${g.units.filter(u=>u.team===0).map(f).join(' ')}`);
    console.log(`        T1 ${g.units.filter(u=>u.team===1).map(f).join(' ')}`);
   }
   const v0=sim.view(g,0),v1=sim.view(g,1);
   const [i0,i1]=await Promise.all([a.live(v0),b.live(v1)]);
   const w0=sim.submitWindow(g,0,i0.inputs),w1=sim.submitWindow(g,1,i1.inputs);
   const be=g.events.length;
   sim.advanceWindow(g,[w0,w1]);
   for(const e of g.events.slice(be)) if(g.round===target&&(e.type==='death'||e.type==='plant'||e.type==='defuse')) console.log(`  ${e.type}@${e.t.toFixed(2)} ${e.target||''}${e.killer?' by '+e.killer:''}`);
   tick++;
  } else break;
 }
 console.log(g.roundLog.map(r=>`R${r.round}: t${r.winnerTeam} ${r.reason} ${r.bomb.state}`).join('\n'));
 a.kill();b.kill();
}
main().catch(e=>{console.error(e);process.exit(1);});
