const {runCounterfactual}=require('./counterfactual');
const {Agent}=require('../agent.js');
const opts=process.env.AGENT_OPTS?JSON.parse(process.env.AGENT_OPTS):{};
for(const file of ['public-r1-g1.json.gz','public-r1-g2.json.gz']){
  const r=runCounterfactual(new Agent(opts),{file,replace:'deepseek-flash'});
  console.log(file,'winner',r.winner,'dur',r.duration.toFixed(1),'ourTH',r.ourTH,'oppTH',r.oppTH,'| our',r.ourHeroes,'| opp',r.oppHeroes,'| units',r.ourUnits,r.oppUnits,'| rej',r.stats.rejected,'solRej',r.stats.solRejected,'max',r.stats.maxCmds);
}
