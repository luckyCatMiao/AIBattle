'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),readline=require('readline');
const {spawn}=require('child_process');
const engine=new Module(path.join(__dirname,'scenario-engine.js'),module);engine.filename=path.join(__dirname,'scenario-engine.js');engine.paths=module.paths;
engine._compile(fs.readFileSync(path.join(__dirname,'simulation.js'),'utf8').replace('canSwingNow, predictContact,',''),engine.filename);
const sim=engine.exports;
const child=spawn('python',['agent.py'],{cwd:__dirname,stdio:['pipe','pipe','inherit']});
const queue=[];readline.createInterface({input:child.stdout}).on('line',s=>queue.shift()(JSON.parse(s)));
const call=obs=>new Promise(resolve=>{queue.push(resolve);child.stdin.write(JSON.stringify(obs)+'\n');});
(async()=>{
 const results=[];
 for(const team of [0,1])for(const stamina of [20,50,100])for(const kind of ['low','fast','high','out'])for(const position of [2.7,4.4]){
  const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  g.phase='rally';g.batsmen[team].x=team===0?position:13.4-position;g.batsmen[team].stamina=stamina;
  const dir=team===0?-1:1;
  const profiles={low:[6.1,1.1,4.2,1.7],fast:[6.4,2.7,9,-2],high:[6.6,4.5,5,1],out:[6.4,4.5,17,3]};
  const [x,y,vx,vy]=profiles[kind];
  Object.assign(g.shuttle,{x:team===0?x:13.4-x,y,vx:dir*vx,vy,lastTeam:1-team});
  const initialStamina=stamina;
  for(let w=0;w<12 && g.batsmen[team].hits===0 && g.phase==='rally';w++){
   const a=await call(sim.view(g,team));const windows=[];
   windows[team]=sim.submitWindow(g,team,a.inputs);windows[1-team]=Array.from({length:10},()=>[{}]);sim.advanceWindow(g,windows);
  }
  results.push({team,stamina:initialStamina,kind,position,hit:g.batsmen[team].hits>0,point:g.lastPoint&&g.lastPoint.winner,remaining:Math.round(g.batsmen[team].stamina)});
 }
 child.kill();fs.writeFileSync(path.join(__dirname,'fresh_inbounds_scenarios.json'),JSON.stringify(results,null,2));
 for(const kind of ['low','fast','high','out']){const rows=results.filter(r=>r.kind===kind);console.log(kind,rows.filter(r=>r.hit).length+'/'+rows.length,'untouched wins',rows.filter(r=>!r.hit&&r.point===r.team).length);}
})().catch(e=>{console.error(e);child.kill();process.exit(1);});
