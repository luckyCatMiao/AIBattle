'use strict';
const path=require('path');
const SIM=require(path.resolve(__dirname,'..','simulation.js'));
const {createMatch,command,step,snapshot,score}=SIM;
const {ReplayOpponent,loadReplay}=require('./replay_opponent.js');

function runDuel(agent,{replay,ourSeat,solSeat,maxSeconds=900,verbose=false,onFrame=null,overlay=0}={}){
  const j=typeof replay==='string'?loadReplay(replay):replay;
  const heroes=j.frames[0].units.filter(u=>u.hero);
  const heroFor=o=>heroes.find(u=>u.owner===o).type;
  const g=createMatch({id:'duelrep',seed:1,players:[{name:'A',kind:'api',hero:heroFor(0)},{name:'B',kind:'api',hero:heroFor(1)}]});
  command(g,0,{type:'start'});
  const opp=new ReplayOpponent(j,solSeat,{defenseOverlay:overlay});
  const stats={rej:[0,0],errs:[],maxCmds:0,decisions:0};
  while(g.status==='playing'&&g.now<maxSeconds){
    const cmdsBy=[];
    let tNow=null;
    for(const o of [0,1]){
      const st=snapshot(g,o);st.decisionSeconds=.25;st.maxCommands=20;st.lastErrors=[];
      tNow=st.now;
      let cmds=[];
      if(o===solSeat){cmds=opp.decide(st,ourSeat);}
      else{try{const out=agent.decide(st)||{};cmds=Array.isArray(out.commands)?out.commands:[];}catch(e){stats.errs.push(String(e&&e.stack||e));}}
      if(cmds.length>20)cmds=cmds.slice(0,20);
      stats.maxCmds=Math.max(stats.maxCmds,cmds.length);
      cmdsBy[o]=cmds;
    }
    for(const o of [0,1]){
      for(const c of cmdsBy[o]){
        try{command(g,o,c);}catch(e){stats.rej[o]++;if(stats.errs.length<20)stats.errs.push(o+':'+c.type+':'+String(e.message||e));}
      }
    }
    for(let i=0;i<5;i++)step(g);
    stats.decisions++;
    if(onFrame)onFrame(g,stats);
    if(g.now>tNow+1)break;
  }
  const fin=snapshot(g);
  return {g,stats,winner:g.winner,duration:g.now,
    scores:{0:score(g,g.players[0]),1:score(g,g.players[1])},
    th:fin.buildings.filter(b=>b.type==='townhall').map(b=>b.owner+':'+Math.round(b.hp)),
    workers:fin.players.map(p=>fin.units.filter(u=>u.owner===p.id&&u.type==='worker').length),
    heroes:fin.players.map(p=>p.heroes.map(h=>h.type+':lv'+h.level+(h.dead?'D':'')).join(',')),
    alive:fin.players.map(p=>p.alive)};
}
module.exports={runDuel};
