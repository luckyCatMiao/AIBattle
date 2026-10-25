'use strict';
const path=require('path');
const {SIM}=require('./sim.js');
const {SolClone}=require('./solclone.js');
const {Agent}=require(process.env.AGENT_FILE||'../agent.js');
function run(agentSeat,{cloneOpts={},maxSeconds=400,hero='necromancer',seed=7}={}){
 const heroA=agentSeat===0?hero:'druid',heroB=agentSeat===0?'druid':hero;
 const g=SIM.createMatch({id:'proto',seed,players:[{name:'A',kind:'api',hero:heroA},{name:'B',kind:'api',hero:heroB}]});
 SIM.command(g,0,{type:'start'});
 const other=new SolClone(cloneOpts);const us=new Agent({});
 let maxCmds=0,rejected=0,decisions=0;
 while(g.status==='playing'&&g.now<maxSeconds){
  const otherSeat=1-agentSeat;
  const snap=JSON.parse(JSON.stringify(SIM.snapshot(g,agentSeat)));
  snap.decisionSeconds=.25;snap.maxCommands=20;snap.lastErrors=[];
  const otherSt=SIM.snapshot(g,otherSeat);otherSt.decisionSeconds=.25;otherSt.maxCommands=20;otherSt.lastErrors=[];
  const otherCmds=(other.decide(otherSt).commands||[]).slice(0,20);
  const out=us.decide(snap)||{commands:[]};
  const myCmds=(out.commands||[]).slice(0,20);maxCmds=Math.max(maxCmds,myCmds.length);
  const by={};by[agentSeat]=myCmds;by[otherSeat]=otherCmds;
  for(const seat of [0,1])for(const c of by[seat])try{SIM.command(g,seat,c);}catch(e){if(seat===agentSeat)rejected++;}
  for(let i=0;i<5;i++)SIM.step(g);
  decisions++;
 }
 return {win:g.winner===agentSeat,winner:g.winner,dur:+g.now.toFixed(1),maxCmds,rejected,decisions};
}
for(const seat of [0,1])console.log('seat',seat,JSON.stringify(run(seat)));
