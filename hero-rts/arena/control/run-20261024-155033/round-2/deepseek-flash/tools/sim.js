'use strict';
// Offline lockstep harness using the public simulation engine.
const path=require('path');
const SIM=require(path.resolve(__dirname,'..','simulation.js'));
const {createMatch,command,step,snapshot}=SIM;

function runMatch(agentA,agentB,{seed=1,heroA='druid',heroB='druid',maxSeconds=1200,verbose=false,onFrame=null}={}){
  const g=createMatch({id:'off',seed,players:[{name:'A',kind:'api',hero:heroA},{name:'B',kind:'api',hero:heroB}]});
  command(g,0,{type:'start'});
  const agents=[agentA,agentB];
  const stats={errors:[0,0],decisions:0,timedOut:[0,0]};
  let lastNow=-1;
  while(g.status==='playing'){
    // build per-seat observations
    for(let owner=0;owner<2;owner++){
      const st=snapshot(g,owner);
      st.decisionSeconds=0.25;st.maxCommands=20;st.lastErrors=[];
      let out;
      try{ out=agents[owner].decide(st)||{}; }catch(e){ stats.errors[owner]++; if(verbose)console.error('agent err',owner,e); out={commands:[]}; }
      let cmds=Array.isArray(out.commands)?out.commands:[];
      if(cmds.length>20)cmds=cmds.slice(0,20);
      const errs=[];
      for(const c of cmds){ try{ command(g,owner,c); }catch(e){ errs.push(String(e.message||e)); stats.errors[owner]++; } }
      if(owner===0) stats.pendingErrs=errs; else stats.pendingErrs2=errs;
    }
    for(let i=0;i<5;i++) step(g);
    stats.decisions++;
    if(onFrame)onFrame(g,stats);
    if(g.now>maxSeconds+1)break;
    if(g.now<=lastNow){console.error('stall');break;}
    lastNow=g.now;
    if(verbose && stats.decisions%40===0){console.log('t=',g.now.toFixed(1),'A',g.players[0].population,'B',g.players[1].population,'gold',Math.floor(g.players[0].gold),Math.floor(g.players[1].gold));}
  }
  const fin=snapshot(g);
  return {g,stats,winner:g.winner,reason:g.reason,duration:g.now,scores:{0:SIM.score(g,g.players[0]),1:SIM.score(g,g.players[1])}};
}
module.exports={runMatch,SIM};
