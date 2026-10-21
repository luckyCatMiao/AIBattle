'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {action}=require('./referee');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// Compare the JSON protocol representation: undefined optional fields are not sent.
const wire=value=>JSON.parse(JSON.stringify(value));
function audit(run){
 const config=JSON.parse(fs.readFileSync(path.join(run,'config.json'),'utf8'));
 assert.equal(hash(path.join(__dirname,'../simulation.js')),config.source_sha256,'Simulation changed during series');
 assert.equal(hash(path.join(__dirname,'../catalog.js')),config.catalog_sha256,'Catalog changed during series');
 for(const [who,files]of Object.entries(config.starting_files||{}))for(const [name,expected]of Object.entries(files)){
  assert.equal(hash(path.join(run,'round-1',who,name)),expected,'Retained incumbent differs from its previous submission');
 }
 for(const [who,files]of Object.entries(config.inherited_files||{}))for(const [name,expected]of Object.entries(files)){
  assert.equal(hash(path.join(run,'starting',who,name)),expected,'Inherited baseline changed');
  assert.equal(hash(path.join(config.from_run,`round-${config.source_round}`,who,name)),expected,'Inherited baseline differs from previous submission');
 }
 const results=JSON.parse(fs.readFileSync(path.join(run,'results.json'),'utf8')),checks=[];
 for(const result of results){
  const file=path.join(run,result.id+'.json.gz');assert.equal(hash(file),result.sha256,'Replay file modified');
  const record=JSON.parse(zlib.gunzipSync(fs.readFileSync(file))),entries=result.seats.map(w=>JSON.parse(fs.readFileSync(path.join(run,`round-${result.round}`,w,'entry.json'),'utf8')));
  assert.equal(record.frames.length,result.frames);assert.equal(record.decisions.length+(result.technicalFailure?2:1),record.frames.length);
  let state=wire(action({type:'create',id:record.id,players:record.frames[0].players.map((p,i)=>({name:p.name,hero:entries[i].hero}))}).state);
  assert.deepEqual(state,record.frames[0]);
  for(let i=0;i<record.decisions.length;i++){
   const decision=record.decisions[i];assert.equal(decision.tick,state.tick);
   const next=wire(action({type:'advance',commands:decision.commands}));assert.deepEqual(next.errors,decision.errors);assert.deepEqual(next.state,record.frames[i+1]);state=next.state;
  }
  if(!result.technicalFailure)assert.deepEqual(state,record.final);
  for(const who of result.seats){const frozen=path.join(run,`round-${result.round}`,who),manifest=JSON.parse(fs.readFileSync(path.join(frozen,'manifest.json'),'utf8'));for(const [name,expected]of Object.entries(manifest))assert.equal(hash(path.join(frozen,name)),expected,'Frozen strategy modified');}
  checks.push({id:record.id,frames:record.frames.length,decisions:record.decisions.length,deterministic:true,technicalFailure:!!result.technicalFailure});
 }
 const report={verified:true,sourceVerified:true,frozenStrategiesVerified:true,incumbentVerified:config.incumbent||null,continuedBaselinesVerified:Object.keys(config.inherited_files||{}),games:checks};fs.writeFileSync(path.join(run,'audit.json'),JSON.stringify(report,null,2));return report;
}
if(require.main===module)console.log(JSON.stringify(audit(path.resolve(process.argv[2]))));
module.exports={audit};
