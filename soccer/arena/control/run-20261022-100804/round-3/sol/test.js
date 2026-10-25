'use strict';
const sim=require('./simulation');
const agent=require('./agent');
const fs=require('fs');
function basic(o,mode){
 const t=o.yourTeam,sg=t===0?1:-1,own=o.units.filter(u=>u.team===t),b=o.ball;
 let order=own.map(u=>({i:u.index,d:Math.hypot(u.x-b.x,u.y-b.y)})).sort((a,b)=>a.d-b.d);
 const frames=[];
 const pos=own.map(u=>({...u}));
 for(let f=0;f<20;f++){
  frames.push(pos.map((u,i)=>{
   let x=b.x,y=b.y;
   if(mode==='defense'&&own.length>1&&i!==order[0].i){x=t===0?3:41;y=10.9+4.2*i/Math.max(1,own.length-1);}
   else if(mode==='balanced'&&own.length>2&&i===0){x=t===0?3:41;y=Math.max(10.8,Math.min(15.2,13+(b.y-13)*.25));}
   let dx=x-u.x,dy=y-u.y,dir='N';if(Math.hypot(dx,dy)>.14){let a=Math.round(Math.atan2(dy,dx)/(Math.PI/4));dir=['R','DR','D','DL','L','UL','U','UR'][(a+8)%8];}
   const dv={N:[0,0],R:[1,0],L:[-1,0],U:[0,-1],D:[0,1],UR:[.707,-.707],UL:[-.707,-.707],DR:[.707,.707],DL:[-.707,.707]}[dir];
   let nx=u.x+dv[0]*.1575,ny=u.y+dv[1]*.1575;
   if(ny>5.7&&ny<20.3&&(t===0?nx>=33.6:nx<=10.4))dir='N';else{u.x=nx;u.y=ny;}
   const gx=t===0?43:1;let gy=mode==='corners'?(u.y<13?15.1:10.9):13;
   const aim=(Math.atan2(gy-u.y,gx-u.x)*180/Math.PI+360)%360;
   let kick=mode==='rush'||mode==='corners'||Math.abs(gx-u.x)<20;
   return {dir,aim,kick};
  }));
 }return {inputs:frames};
}
function run(n,t,mode,seed){
 const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed,teamSize:n});let maxms=0,totalms=0,windows=0;
 while(g.status==='playing'){
  const start=performance.now();let a=agent.decide(sim.view(g,t));let dt=performance.now()-start;maxms=Math.max(maxms,dt);totalms+=dt;windows++;
  let e=mode==='self'?agent.decide(sim.view(g,1-t)):basic(sim.view(g,1-t),mode);
  const ws=[];ws[t]=sim.submitWindow(g,t,a.inputs);ws[1-t]=sim.submitWindow(g,1-t,e.inputs);sim.advanceWindow(g,ws);
 }
 return {n,t,mode,seed,score:g.score,win:g.winner===t?'W':g.winner===null?'D':'L',fouls:g.stats[t].fouls,kicks:g.stats[t].kicks,maxms:Math.round(maxms*10)/10,meanms:Math.round(totalms/windows*10)/10};
}
if(require.main===module){let modes=process.argv.slice(2);if(!modes.length)modes=['rush','balanced','corners','defense'];let results=[];for(const mode of modes)for(let n=1;n<=6;n++)for(let t=0;t<2;t++){const r=run(n,t,mode,41+n);results.push(r);console.log(JSON.stringify(r));}fs.writeFileSync('/workspace/test_results.json',JSON.stringify(results,null,2));}
module.exports={run,basic};
