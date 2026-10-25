'use strict';
const {spawn}=require('child_process');
const path=require('path');
const sim=require('../simulation');
function mkAgent(cmd){const c=spawn(cmd[0],cmd.slice(1),{cwd:path.join(__dirname,'..'),stdio:['pipe','pipe','pipe']});c.buf='';c.wait=[];c.q=[];c.stdout.on('data',d=>{c.buf+=d;let i;while((i=c.buf.indexOf('\n'))>=0){const l=c.buf.slice(0,i).trim();c.buf=c.buf.slice(i+1);if(!l)continue;const w=c.wait.shift();if(w)w(l);else c.q.push(l);}});c.stderr.on('data',()=>{});c.ask=l=>{c.stdin.write(l+'\n');return c.q.length?Promise.resolve(c.q.shift()):new Promise(r=>c.wait.push(r));};return c;}
function parse(t){const o=JSON.parse(t);return o.inputs.map(f=>[sim.normalizeUnitInput(Array.isArray(f)?f[0]:f)]);}
(async()=>{
 const seeds=process.argv[2].split(',').map(Number);
 for(const seed of seeds){
  const g=sim.createMatch({id:'solo',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
  const a=mkAgent(['python','-u','agent.py']);
  const laps=[];let w=0;
  while(g.status==='playing'&&w<200){
   const win=sim.submitWindow(g,0,parse(await a.ask(JSON.stringify(sim.view(g,0)))));
   // park car 1 far away from the track
   g.cars[1].x=2.0;g.cars[1].y=2.0;g.cars[1].vx=0;g.cars[1].vy=0;
   sim.advanceWindow(g,[win,Array.from({length:20},()=>[{throttle:0,steer:0,drift:false,boost:false}])]);
   for(const e of g.events)if(e.type==='lap'&&e.team===0&&!e._s){e._s=true;laps.push(+e.time.toFixed(2));}
   w++;
  }
  console.log(seed,'t=',(g.frame/20).toFixed(2),'laps=',JSON.stringify(laps),'boosts=',g.cars[0].boosts,'drift=',g.cars[0].driftTime.toFixed(1));
  a.kill();a.stdin.end();
 }
})();
