'use strict';
// Replays the EXACT recorded command stream of the real frozen Sol program from
// an official replay against a live agent on the other seat. Since our engine is
// bit-exact with the arena engine, Sol's own build/defense script stays valid up
// to the point where our different play changes the situation it was reacting to.
const path=require('path'),zlib=require('zlib'),fs=require('fs');
const SIM=require(path.resolve(__dirname,'..','simulation.js'));
const {createMatch,command,step,snapshot}=SIM;

function loadReplay(file){
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
}
// ourSeatName: 'deepseek-flash' or 'sol' -- which recorded seat we replace with the live agent
function runCounterfactual(agent,{file,replace='deepseek-flash',maxSeconds=900,verbose=false,onFrame=null}={}){
  const j=loadReplay(file);
  const replaceSeat=j.seats.indexOf(replace);
  const solSeat=1-replaceSeat;
  const h0=j.frames[0].units.find(u=>u.hero&&u.owner===0).type;
  const h1=j.frames[0].units.find(u=>u.hero&&u.owner===1).type;
  const g=createMatch({id:'cf',seed:j.frames[0].seed,players:[{name:'A',kind:'api',hero:h0},{name:'B',kind:'api',hero:h1}]});
  command(g,0,{type:'start'});
  const stats={decisions:0,rejected:0,agentErr:0,maxCmds:0,samples:[],solRejected:0};
  let lastNow=-1;
  const maxT=Math.min(maxSeconds,j.duration+4);
  while(g.status==='playing'&&g.now<maxT){
    // our agent decision
    const st=snapshot(g,replaceSeat);
    st.decisionSeconds=0.25;st.maxCommands=20;st.lastErrors=[];
    let out;
    try{out=agent.decide(st)||{};}catch(e){stats.agentErr++;if(verbose)console.error(e);out={commands:[]};}
    let cmds=Array.isArray(out.commands)?out.commands:[];
    if(cmds.length>20)cmds=cmds.slice(0,20);
    stats.maxCmds=Math.max(stats.maxCmds,cmds.length);
    for(const c of cmds)try{command(g,replaceSeat,c);}catch(e){stats.rejected++;if(stats.samples.length<12)stats.samples.push('ours:'+c.type+':'+e.message);}
    // recorded Sol commands at this tick
    const d=j.decisions.find(x=>x.tick===g.tick);
    if(d)for(const c of d.commands[solSeat]||[])try{command(g,solSeat,c);}catch(e){stats.solRejected++;if(stats.samples.length<12)stats.samples.push('sol:'+c.type+':'+e.message);}
    for(let i=0;i<5;i++)step(g);
    stats.decisions++;
    if(onFrame)onFrame(g,stats);
    if(g.now<=lastNow)break;
    lastNow=g.now;
  }
  const fin=snapshot(g);
  return {g,stats,winner:g.winner,reason:g.reason,duration:g.now,
    ourSeat:replaceSeat,solSeat,
    oppTH:fin.buildings.filter(b=>b.type==='townhall'&&b.owner===solSeat).map(b=>Math.round(b.hp))[0]??0,
    ourTH:fin.buildings.filter(b=>b.type==='townhall'&&b.owner===replaceSeat).map(b=>Math.round(b.hp))[0]??0,
    oppHeroes:fin.players[solSeat].heroes.map(h=>h.type+':lv'+h.level+(h.dead?'D':'')).join(','),
    ourHeroes:fin.players[replaceSeat].heroes.map(h=>h.type+':lv'+h.level+(h.dead?'D':'')).join(','),
    oppUnits:fin.units.filter(u=>u.owner===solSeat).length,ourUnits:fin.units.filter(u=>u.owner===replaceSeat).length,
    oppGold:Math.round(fin.players[solSeat].gold),ourGold:Math.round(fin.players[replaceSeat].gold),
    oppPop:fin.players[solSeat].population,ourPop:fin.players[replaceSeat].population};
}
module.exports={runCounterfactual,loadReplay};
