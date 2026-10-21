const S = require('./loadsim');
const { execFileSync } = require('child_process');
const dirs = ['N','F','B','U','D','UF','UB','DF','DB'], btns=[null,null,null,'LP','HP','LK','HK'];
let seed = +process.argv[2] || 1; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const chars = Object.keys(S.characters);
const teams=[[chars[seed%6],chars[(seed+1)%6],chars[(seed+2)%6]],[chars[(seed+3)%6],chars[(seed+4)%6],chars[(seed+5)%6]]];
const g = S.createMatch({players:[{name:'a',kind:'api',team:teams[0]},{name:'b',kind:'api',team:teams[1]}]});
const inputs=[[],[]];
for (let i=0;i<600;i++) for (let o=0;o<2;o++){ // motions sometimes
  inputs[o].push({dir:dirs[Math.floor(rnd()*9)], btn:btns[Math.floor(rnd()*7)]});
}
const traj=[];
for (let i=0;i<600 && g.status==='playing' && g.round===1;i++){
  for (let o=0;o<2;o++) { const f=g.fighters[o]; f.inputHistory.push(inputs[o][i]); if(f.inputHistory.length>30)f.inputHistory.shift(); f.held=inputs[o][i]; }
  S.step(g);
  traj.push(g.fighters.map(f=>[+f.x.toFixed(3),+f.y.toFixed(3),f.hp,f.state]));
}
const out = execFileSync('python3', ['-c', `
import json,sys
sys.path.insert(0,'/workspace')
import sim
d=json.load(sys.stdin)
cat=d['cat']
g=sim.G(); g.frames=0; g.hitstop=0; g.proj=[]; g.over=False; g.roundFrames=0
a=sim.new_fighter(cat,0,d['teams'][0][0]); b=sim.new_fighter(cat,1,d['teams'][1][0]); b.x=860.0; b.facing=-1
g.f=[a,b]
res=[]
for i in range(len(d['traj'])):
    for o in (0,1):
        x=d['inputs'][o][i]; sim.push_input(g.f[o],(x['dir'],x['btn']))
    sim.step(g)
    res.append([[round(f.x,3),round(f.y,3),f.hp,f.state] for f in g.f])
print(json.dumps(res))
`], {input: JSON.stringify({cat: JSON.parse(JSON.stringify(S.characters)), teams, inputs, traj})}).toString();
const py = JSON.parse(out);
let bad=-1;
for (let i=0;i<traj.length;i++){ if (JSON.stringify(traj[i])!==JSON.stringify(py[i])) { bad=i; break; } }
console.log('seed',seed,'frames',traj.length,'firstMismatch',bad, bad>=0? JSON.stringify([traj[bad],py[bad]]):'' , 'hp', JSON.stringify(traj[traj.length-1]));
