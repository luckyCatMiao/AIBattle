'use strict';
const {runCounterfactual,loadReplay}=require('./counterfactual');
const {Agent}=require('../agent.js');
const fs=require('fs');
const opts=process.env.AGENT_OPTS?JSON.parse(process.env.AGENT_OPTS):{};
const files=fs.readdirSync('.').filter(f=>f.endsWith('.json.gz')&&(f.startsWith('public-history')||f.startsWith('public-r1')));
let w=0,n=0;
for(const f of files){
  const j=loadReplay(f);
  const solSeat=j.seats.indexOf('sol');
  if(solSeat<0){console.log(f,'no sol');continue;}
  const otherSeat=1-solSeat;
  const r=runCounterfactual(new Agent(opts),{file:f,replace:j.seats[otherSeat]});
  const win=r.winner===otherSeat;
  if(win)w++;n++;
  console.log(`${f.padEnd(52)} ${win?'WIN ':'LOSS'} ${r.duration.toFixed(0)}s  ourTH=${r.ourTH} solTH=${r.oppTH}  our=${r.ourHeroes}  sol=${r.oppHeroes}`);
}
console.log('TOTAL',w+'/'+n);
