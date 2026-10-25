'use strict';
const sim=require('./simulation');
const fs=require('fs');
const {spawnSync}=require('child_process');
let samples=[];
const g=sim.createMatch({seed:139,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
g.phase='race';g.runners[1].x=1;
for(let i=0;i<600;i++){
 const p=g.runners[0];const before=sim.view(g,0);
 const action={move:i%71<5?0:1,jump:i%13===0};
 p.held=action;g.runners[1].held={move:0,jump:false};
 sim.step(g);
 if(g.round!==1)break;
 if(p.deaths===before.runners[0].deaths&&Math.abs(p.x-g.runners[1].x)>1&&p.invuln===0)
 samples.push({obs:before,action,after:sim.view(g,0).runners[0]});
}
fs.writeFileSync('physics_samples.json',JSON.stringify(samples));
const code=`import json
from agent import Agent
a=Agent(); n=0; errors=[]
for s in json.load(open('physics_samples.json',encoding='utf-8')):
 a.setup(s['obs']); p=a.runner(s['obs']['runners'][0]); r=a.physics(p,s['action']['move'],s['action']['jump']); q=s['after']; n+=1
 err=max(abs(r[i]-q[k]) for i,k in enumerate(['x','y','vx','vy']))
 if err>.021: errors.append((n,err,p,r,q))
print(json.dumps({'samples':n,'mismatches_over_0_021':len(errors),'first':errors[:2]}))
`;
const p=spawnSync('python',['-c',code],{encoding:'utf-8'});console.log(p.stdout);console.error(p.stderr);process.exitCode=p.status;
