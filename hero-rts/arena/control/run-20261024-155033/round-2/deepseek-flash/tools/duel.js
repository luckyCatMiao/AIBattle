'use strict';
// Lockstep duel harness on the public engine, faithful to the arena (verified
// bit-exact against official replays).
const path=require('path');
const SIM=require(path.resolve(__dirname,'..','simulation.js'));
const {createMatch,command,step,snapshot}=SIM;

function runDuel(agentA,agentB,{heroA='necromancer',heroB='druid',maxSeconds=900,verbose=false,onFrame=null,nameA='A',nameB='B'}={}){
  const g=createMatch({id:'duel',seed:1,players:[{name:nameA,kind:'api',hero:heroA},{name:nameB,kind:'api',hero:heroB}]});
  command(g,0,{type:'start'});
  const agents=[agentA,agentB];
  const stats={errors:[0,0],rejected:[0,0],maxCmds:0,decisions:0,rejectSamples:[]};
  let lastNow=-1;
  while(g.status==='playing'&&g.now<maxSeconds){
    for(let owner=0;owner<2;owner++){
      const st=snapshot(g,owner);
      st.decisionSeconds=0.25;st.maxCommands=20;st.lastErrors=[];
      let out;
      try{out=agents[owner].decide(st)||{};}catch(e){stats.errors[owner]++;if(verbose)console.error('agent error',owner,e&&e.stack||e);out={commands:[]};}
      let cmds=Array.isArray(out.commands)?out.commands:[];
      if(cmds.length>20)cmds=cmds.slice(0,20);
      stats.maxCmds=Math.max(stats.maxCmds,cmds.length);
      for(const c of cmds){
        try{command(g,owner,c);}catch(e){
          stats.rejected[owner]++;
          if(stats.rejectSamples.length<12)stats.rejectSamples.push(owner+':'+c.type+':'+String(e.message||e));
        }
      }
    }
    for(let i=0;i<5;i++)step(g);
    stats.decisions++;
    if(onFrame)onFrame(g,stats);
    if(g.now<=lastNow){console.error('stall');break;}
    lastNow=g.now;
    if(verbose&&stats.decisions%80===0)console.log('t=',g.now.toFixed(1),'pop',g.players.map(p=>p.population).join('/'),'gold',g.players.map(p=>Math.floor(p.gold)).join('/'));
  }
  const fin=snapshot(g);
  return {g,stats,winner:g.winner,reason:g.reason,duration:g.now,
    scores:{0:SIM.score(g,g.players[0]),1:SIM.score(g,g.players[1])},
    heroes:fin.players.map(p=>p.heroes.map(h=>h.type+':lv'+h.level+(h.dead?'D':'')).join(',')),
    th:fin.buildings.filter(b=>b.type==='townhall').map(b=>b.owner+':'+Math.round(b.hp)),
    alive:fin.players.map(p=>p.alive)};
}
module.exports={runDuel,SIM};
