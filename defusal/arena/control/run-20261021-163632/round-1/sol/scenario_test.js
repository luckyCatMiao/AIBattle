'use strict';
const sim=require('./simulation');
const {spawn}=require('child_process');
const readline=require('readline');
const assert=require('assert');
const p=spawn('python3',['/workspace/agent.py'],{stdio:['pipe','pipe','inherit']});
const rl=readline.createInterface({input:p.stdout});
let pending;
rl.on('line',s=>{pending(JSON.parse(s));});
function ask(o){return new Promise(resolve=>{pending=resolve;p.stdin.write(JSON.stringify(o)+'\n');});}
function create(){const g=sim.createMatch({seed:1,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});sim.submitBuys(g,0,[]);sim.submitBuys(g,1,[]);return g;}
async function run(g,team,n){for(let i=0;i<n&&g.phase==='live';i++){const out=await ask(sim.view(g,team));assert.equal(out.inputs.length,20);assert(out.inputs.every(f=>f.length===5));const windows=[sim.submitWindow(g,0,[]),sim.submitWindow(g,1,[])];windows[team]=sim.submitWindow(g,team,out.inputs);sim.advanceWindow(g,windows);}}
(async()=>{
 let g=create();g.units[0].x=10.5;g.units[0].y=7.5;await run(g,0,4);assert.equal(g.bomb.state,'planted');console.log('PASS stationary carrier plants automatically');
 g=create();g.bomb={state:'dropped',carrier:null,x:26.5,y:29.5};await run(g,0,2);assert.equal(g.bomb.state,'carried');console.log('PASS dropped bomb recovery');
 for(const kit of [false,true]){
  g=create();g.bomb={state:'planted',x:10.5,y:7.5,site:'A',timer:40,defuseProgress:0};g.units[5].x=10.5;g.units[5].y=7.5;g.units[5].kit=kit;await run(g,1,kit?3:6);assert(g.roundLog.some(r=>r.reason==='拆除炸弹'));console.log('PASS stationary defuse, kit='+kit);
 }
 g=create();g.units[5].x=27.5;g.units[5].y=19.5;g.units[5].facing={x:0,y:1};g.units[0].x=27.5;g.units[0].y=25.5;await run(g,0,1);console.log('PASS legal live combat window');
 p.kill();
})().catch(e=>{console.error(e);p.kill();process.exit(1);});
