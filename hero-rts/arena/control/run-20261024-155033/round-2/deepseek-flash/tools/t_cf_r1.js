const {runCounterfactual}=require('./counterfactual');
const {Agent}=require('./agent_r1_backup.js');
for(const file of ['public-r1-g1.json.gz','public-r1-g2.json.gz']){
  const r=runCounterfactual(new Agent(),{file,replace:'deepseek-flash'});
  console.log(file, 'winner',r.winner,'dur',r.duration.toFixed(1),'ourTH',r.ourTH,'oppTH',r.oppTH,'ourHeroes',r.ourHeroes,'oppHeroes',r.oppHeroes,'stats',JSON.stringify(r.stats).slice(0,300));
}
