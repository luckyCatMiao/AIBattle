'use strict';
const assert=require('assert');
const fs=require('fs');
const {spawnSync}=require('child_process');
const sim=require('./simulation');
const {Agent}=require('./agent');
const obs=JSON.parse(fs.readFileSync('example.json','utf8'));
const input=Array.from({length:20},(_,i)=>JSON.stringify({...obs,id:'protocol-'+(i%2),frame:i*3})).join('\n')+'\n';
const start=performance.now();
const proc=spawnSync(process.execPath,['agent.js'],{input,encoding:'utf8',timeout:10000});
assert.strictEqual(proc.status,0,proc.stderr);
assert.strictEqual(proc.stderr,'');
const lines=proc.stdout.trim().split('\n');assert.strictEqual(lines.length,20);
for(const line of lines){const result=JSON.parse(line);assert.strictEqual(result.inputs.length,3);sim.submitWindow({status:'playing'},0,result.inputs);}
const dense={...obs,id:'dense',frame:2000,bullets:[]};
for(let i=0;i<100;i++)dense.bullets.push({owner:1-dense.yourPlayer,x:2+(i*7.31)%35,y:2+(i*3.17)%25,vx:i%2?6.01:-6.01,vy:i%3?6.01:-6.01});
const agent=new Agent();let maxMS=0;
for(let i=0;i<30;i++){dense.frame+=3;const st=performance.now();const result=agent.act(dense);maxMS=Math.max(maxMS,performance.now()-st);assert.strictEqual(result.inputs.length,3);sim.submitWindow({status:'playing'},0,result.inputs);}
const result={protocolLines:lines.length,processExit:proc.status,stderrEmpty:proc.stderr==='',totalProtocolWallMS:+(performance.now()-start).toFixed(2),denseResponses:30,maxDenseMS:+maxMS.toFixed(3)};
fs.writeFileSync('protocol_results_r2.json',JSON.stringify(result,null,2));console.log(result);
