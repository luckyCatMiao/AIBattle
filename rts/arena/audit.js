'use strict';
// Replay every logged command into a fresh simulation, compare every full state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createMatch,command,step,snapshot}=require('../simulation');
const {applyBatch}=require('./arena');
const root=__dirname,run=process.argv[2]||JSON.parse(fs.readFileSync(path.join(root,'control/active-run.json'),'utf8')).path;
const records=JSON.parse(fs.readFileSync(path.join(run,'replays.json'),'utf8'));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const config=JSON.parse(fs.readFileSync(path.join(run,'config.json'),'utf8'));
if(hash(fs.readFileSync(path.join(root,'../simulation.js')))!==config.source_sha256)throw Error('Referee source changed');
const audit=[];
for(const r of records){
 const g=createMatch({id:r.id,players:r.frames[0].players.map(p=>({name:p.name,kind:p.kind}))});command(g,0,{type:'start'});
 if(JSON.stringify(snapshot(g))!==JSON.stringify(r.frames[0]))throw Error(r.id+': initial mismatch');
 let errors=[0,0],maxSeconds=[0,0];
 for(let i=0;i<r.decisions.length;i++){
  const d=r.decisions[i];if(d.tick!==g.tick)throw Error('Decision tick mismatch');
  const rejected=applyBatch(g,d.commands);if(JSON.stringify(rejected)!==JSON.stringify(d.errors))throw Error('Rejection mismatch');
  for(let s=0;s<2;s++){errors[s]+=rejected[s].length;maxSeconds[s]=Math.max(maxSeconds[s],d.seconds[s]);}
  for(let n=0;n<20&&g.status==='playing';n++)step(g);
  if(JSON.stringify(snapshot(g))!==JSON.stringify(r.frames[i+1]))throw Error(`${r.id}: frame ${i+1} mismatch`);
 }
 if(g.status!=='finished'||(g.winner===null?null:r.seats[g.winner])!==r.winner)throw Error('Winner mismatch');
 audit.push({id:r.id,winner:r.winner,frames:r.frames.length,tick:g.tick,errors,maxSeconds,
   actionsSha256:hash(JSON.stringify(r.decisions.map(d=>d.commands))),finalSha256:hash(JSON.stringify(snapshot(g)))});
}
for(let iteration=1;iteration<=config.rounds;iteration++)for(const who of Object.keys(config.models)){
 const folder=path.join(run,'round-'+iteration,who),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 for(const [file,expected]of Object.entries(manifest))if(hash(fs.readFileSync(path.join(folder,file)))!==expected)throw Error('Submission mismatch: '+folder+'/'+file);
}
if(config.first_round_incumbent_frozen){
 const folder=path.join(run,'round-1',config.incumbent);
 for(const [file,expected] of Object.entries(config.starting_files[config.incumbent]))if(hash(fs.readFileSync(path.join(folder,file)))!==expected)throw Error('Incumbent starting revision changed: '+file);
}
if(config.resume_both){
 for(const who of Object.keys(config.models)){
  const folder=path.join(config.from_run,'round-'+config.source_round,who);
  for(const [file,expected] of Object.entries(config.starting_files[who]))if(hash(fs.readFileSync(path.join(folder,file)))!==expected)throw Error('Retained source revision changed: '+who+'/'+file);
 }
}
if(records.length!==config.rounds*config.games_per_round)throw Error('Incomplete series');
const report={verified:true,refereeSha256:config.source_sha256,games:audit,uniqueActionTraces:new Set(audit.map(x=>x.actionsSha256)).size};
fs.writeFileSync(path.join(run,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
