'use strict';
const s=require('./simulation'),{spawn}=require('child_process'),rl=require('readline');
function c(file,args=[]){let p=spawn('python3',[file,...args],{cwd:'/workspace',stdio:['pipe','pipe','inherit']}),qs=[];rl.createInterface({input:p.stdout}).on('line',l=>qs.shift()(JSON.parse(l)));return{p,ask:o=>new Promise(r=>{qs.push(r);p.stdin.write(JSON.stringify(o)+'\n')})};}
(async()=>{const g=s.createMatch({seed:1,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]}),cs=[c('agent.py'),c('baseline.py',['hold'])];
while(g.status==='playing'){
 let obs=[s.view(g,0),s.view(g,1)],aa=await Promise.all(cs.map((p,i)=>p.ask(obs[i])));
 if(g.phase==='buy')for(let i=0;i<2;i++)s.submitBuys(g,i,aa[i].buys);
 else{
 if(g.round===4) console.log(JSON.stringify({time:g.roundFrames/20,u:obs[0].units.map(u=>({i:u.index,x:u.x,y:u.y,hp:u.hp,mag:u.mag})),see:obs[0].visibleEnemies,input:aa[0].inputs[0],en:g.units.filter(u=>u.team===1).map(u=>({i:u.index,x:u.x,y:u.y,hp:u.hp})),events:g.events.filter(e=>e.type==='hit').slice(-6)}));
 s.advanceWindow(g,aa.map((a,i)=>s.submitWindow(g,i,a.inputs)));
 if(g.round>4)break;
 }
}cs.forEach(c=>c.p.kill());})();
