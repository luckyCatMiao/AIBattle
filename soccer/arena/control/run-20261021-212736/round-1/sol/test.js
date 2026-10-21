'use strict';
const sim=require('./simulation');
const {spawn}=require('child_process');
const readline=require('readline');
const fs=require('fs');
const dirs={N:[0,0],R:[1,0],DR:[.707,.707],D:[0,1],DL:[-.707,.707],L:[-1,0],UL:[-.707,-.707],U:[0,-1],UR:[.707,-.707]};
function dir(x,y){let best='N',v=Infinity;for(const [k,d] of Object.entries(dirs)){let q=(x-d[0]*.1575)**2+(y-d[1]*.1575)**2;if(q<v){v=q;best=k}}return best}
function baseline(g,t,style){
 const us=g.units.filter(u=>u.team===t),b=g.ball,s=t===0?1:-1,gx=t===0?43:1;
 const nearest=[...us].sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y));
 return us.map(u=>{
 let x=b.x,y=b.y;
 if(style==='keeper' && us.length>1 && u===us[us.length-1] && u!==nearest[0]){x=t===0?2:42;y=Math.max(10.6,Math.min(15.4,b.y))}
 if(style==='spread' && us.length>2 && u!==nearest[0] && u!==nearest[1]){x=b.x-s*3;y=Math.max(2,Math.min(24,b.y+(u.index%2?4:-4)))}
 let owner=b.owner===u.id;
 if(owner){x=gx;y=13}
 const d=dir(x-u.x,y-u.y);
 const aim=owner?((Math.atan2(13-u.y,gx-u.x)*180/Math.PI+360)%360):(s===1?0:180);
 const shot=owner && (style==='rush'?Math.abs(gx-u.x)<19:Math.abs(gx-u.x)<15);
 return {dir:d,aim,kick:shot};
 });
}
function baselineWindow(g,t,style){let copy=JSON.parse(JSON.stringify(g)),frames=[];for(let f=0;f<20;f++){
 const a=baseline(copy,t,style),other=baseline(copy,1-t,style);frames.push(a);
 for(const u of copy.units)u.held=(u.team===t?a:other)[u.index];sim.step(copy);
 }return frames}
async function main(){
 const proc=spawn('python3',['-u','/workspace/agent.py']);proc.stderr.on('data',d=>process.stderr.write(d));
 let pending;readline.createInterface({input:proc.stdout}).on('line',line=>{if(pending){let f=pending;pending=null;f(JSON.parse(line))}});
 const ask=o=>new Promise(resolve=>{pending=resolve;proc.stdin.write(JSON.stringify(o)+'\n')});
 const results=[];let maxMs=0,totalMs=0,count=0;
 const sizes=process.argv[2]?process.argv[2].split(',').map(Number):[1,2,3,4,5,6];
 for(const n of sizes)for(const seat of [0,1]){
 const style=['rush','keeper','spread'][(n+seat)%3];const g=sim.createMatch({players:[{name:'a',kind:'api'},{name:'b',kind:'api'}],seed:100+n,teamSize:n});
 while(g.status==='playing'){
 const t0=performance.now();const r=await ask(sim.view(g,seat));const ms=performance.now()-t0;maxMs=Math.max(maxMs,ms);totalMs+=ms;count++;
 let own=sim.submitWindow(g,seat,r.inputs),opp=sim.submitWindow(g,1-seat,baselineWindow(g,1-seat,style));
 sim.advanceWindow(g,seat===0?[own,opp]:[opp,own]);
 }
 const r={n,seat,style,score:g.score,winner:g.winner,frame:g.frame,stats:g.stats};results.push(r);console.log(JSON.stringify(r));
 }
 proc.stdin.end();const report={results,timing:{maxMs,meanMs:totalMs/count,windows:count}};fs.writeFileSync('/workspace/test_results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.timing));
}
main().catch(e=>{console.error(e);process.exit(1)});
