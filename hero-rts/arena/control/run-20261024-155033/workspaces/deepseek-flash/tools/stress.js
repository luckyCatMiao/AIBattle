const {SIM}=require('./sim.js');
const {SolBot}=require('./solbot.js');
const {Agent}=require('../agent.js');
// agentSeat: 0 or 1. Extra income is credited to the Sol seat.
function stress(agentOpts,{agentSeat=0,solOpts={},goldPerSec=0,woodPerSec=0,startGold=0,maxSeconds=420,hero='guardian'}={}){
  const heroA=agentSeat===0?hero:'druid', heroB=agentSeat===0?'druid':hero;
  const g=SIM.createMatch({id:'s',seed:1,players:[{name:'A',kind:'api',hero:heroA},{name:'B',kind:'api',hero:heroB}]});
  SIM.command(g,0,{type:'start'});
  const solSeat=1-agentSeat;
  const agents=agentSeat===0?[new Agent(agentOpts),new SolBot(solOpts)]:[new SolBot(solOpts),new Agent(agentOpts)];
  g.players[solSeat].gold+=startGold;
  let lastAcc=0,accG=0,accW=0;
  while(g.status==='playing'&&g.now<maxSeconds){
    for(let o=0;o<2;o++){
      const st=SIM.snapshot(g,o);st.decisionSeconds=.25;st.maxCommands=20;st.lastErrors=[];
      let out;try{out=agents[o].decide(st)||{commands:[]};}catch(e){out={commands:[]};}
      for(const c of (out.commands||[]).slice(0,20)){try{SIM.command(g,o,c);}catch(e){}}
    }
    for(let i=0;i<5;i++)SIM.step(g);
    accG+=goldPerSec*0.25;accW+=woodPerSec*0.25;
    const dg=Math.floor(accG),dw=Math.floor(accW);
    if(dg||dw){g.players[solSeat].gold+=dg;g.players[solSeat].wood+=dw;accG-=dg;accW-=dw;}
  }
  return {winner:g.winner,win:g.winner===agentSeat,dur:g.now,scores:{a:SIM.score(g,g.players[agentSeat]),s:SIM.score(g,g.players[solSeat])}};
}
module.exports={stress};
