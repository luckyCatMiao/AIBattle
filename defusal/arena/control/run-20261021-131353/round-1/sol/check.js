'use strict';
// Offline-only protocol and objective integration tests against the public engine.
const sim=require('./simulation');
const {spawnSync}=require('child_process');
const assert=require('assert');
function game(seed=101){return sim.createMatch({seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});}
function ask(obs){const p=spawnSync('python3',['agent.py'],{cwd:'/workspace',input:JSON.stringify(obs)+'\n',encoding:'utf8',timeout:5000});assert.equal(p.status,0,p.stderr);assert(!p.stderr,p.stderr);return JSON.parse(p.stdout);}
function live(g){sim.submitBuys(g,0,[]);sim.submitBuys(g,1,[]);}
function step(g,a,b){sim.advanceWindow(g,[sim.submitWindow(g,0,a.inputs),sim.submitWindow(g,1,b.inputs)]);}
const neutral={inputs:Array.from({length:20},()=>Array.from({length:5},()=>({dir:'N',aim:'N'})))};
let passed=[];
{
let g=game();let a=ask(sim.view(g,0));sim.submitBuys(g,0,a.buys);assert(g.units.filter(u=>u.team===0).every(u=>u.weapon==='pistol'&&u.armor===100&&u.money===150));passed.push('opening armor purchase');
}
{
let g=game();live(g);let u=g.units[0];u.x=10.5;u.y=7.5;
for(let i=0;i<5 && g.bomb.state!=='planted';i++)step(g,ask(sim.view(g,0)),neutral);
assert.equal(g.bomb.state,'planted');passed.push('plant with stationary carrier');
}
{
let g=game();live(g);g.bomb={state:'planted',carrier:null,x:10.5,y:7.5,site:'A',timer:40,defuseProgress:0,defuserId:null};
let u=g.units[5];u.x=10.7;u.y=7.5;u.kit=true;
for(let i=0;i<4&&g.round===1;i++)step(g,neutral,ask(sim.view(g,1)));
assert(g.roundLog.some(r=>r.reason==='拆除炸弹'));passed.push('kit defuse without movement resets');
}
{
let g=game();live(g);g.bomb.state='dropped';g.bomb.carrier=null;g.bomb.x=g.units[0].x;g.bomb.y=g.units[0].y;
step(g,ask(sim.view(g,0)),neutral);assert.equal(g.bomb.state,'carried');passed.push('dropped bomb pickup');
}
{
for(let seed=1;seed<=80;seed++){
let g=game(seed);live(g);for(let team=0;team<2;team++){
const a=ask(sim.view(g,team));assert.equal(a.inputs.length,20);assert(a.inputs.every(f=>f.length===5));sim.submitWindow(g,team,a.inputs);
}}
passed.push('160 map/seat protocol windows');
}
console.log(JSON.stringify({passed},null,2));
