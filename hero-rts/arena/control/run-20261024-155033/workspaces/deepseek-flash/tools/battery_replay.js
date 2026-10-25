'use strict';
const fs=require('fs');
const {runDuel}=require('./duel_replay.js');
const {Agent}=require('../agent.js');
const ours=process.env.AGENT_MODULE?require(process.env.AGENT_MODULE):null;
const files=process.argv.slice(2);
let W=0,N=0,tot=0;const rows=[];
for(const f of files){
  const j=JSON.parse(require('zlib').gunzipSync(fs.readFileSync(f)));
  const solSeat=j.seats.indexOf('sol');
  if(solSeat<0){console.log(f,'no sol');continue;}
  const ourSeat=1-solSeat;
  const AgentClass=ours||Agent;
  const a=new AgentClass(process.env.AGENT_OPTS?JSON.parse(process.env.AGENT_OPTS):{});
  const r=runDuel(a,{replay:j,ourSeat,solSeat,maxSeconds:700});
  const win=r.winner===ourSeat;
  if(win){W++;tot+=r.duration;}N++;
  rows.push(`${f.replace('public-','').replace('.json.gz','')} sol${solSeat} ${win?'W':'L'} ${r.duration.toFixed(0)}s th[${r.th.join(' ')}] wk[${r.workers.join(',')}] sc[${r.scores[ourSeat]}:${r.scores[solSeat]}]`);
}
console.log(rows.join('\n'));
console.log(`TOTAL ${W}/${N} = ${(100*W/Math.max(1,N)).toFixed(1)}%  avg win ${Math.round(tot/Math.max(1,W))}s`);
