'use strict';
// Independent observation-only test controller.
const dirs={N:[0,0],U:[0,-1],D:[0,1],L:[-1,0],R:[1,0],UL:[-.7071067811865476,-.7071067811865476],UR:[.7071067811865476,-.7071067811865476],DL:[-.7071067811865476,.7071067811865476],DR:[.7071067811865476,.7071067811865476]};
const keys=Object.keys(dirs).slice(1);
function aim(dx,dy){return keys.reduce((a,b)=>dx*dirs[a][0]+dy*dirs[a][1]>dx*dirs[b][0]+dy*dirs[b][1]?a:b);}
module.exports=class Baseline{
 constructor(style){this.style=style;this.maxMs=0;this.calls=0;this.r=0;this.contacts=[];}
 close(){}
 async ask(o){let begin=performance.now();let result=this.act(o);this.maxMs=Math.max(this.maxMs,performance.now()-begin);this.calls++;return result;}
 act(o){
  if(o.phase==='buy') return {buys:o.units.map(u=>{let p={unit:u.index},m=u.money;let w=m>=3350?'rifle':m>=1900?'smg':null;if(w&&u.weapon!=='rifle'){p.weapon=w;m-=w==='rifle'?2700:1250;}if(m>=650&&u.armor<70){p.armor=true;m-=650;}if(m>=400&&o.side==='defend')p.kit=true;return p;})};
  if(this.r!==o.round){this.r=o.round;this.contacts=[];}
  let t=o.frame/20,b=o.bomb,atk=o.side==='attack';
  let contacts=Object.values(o.visibleEnemies).flat();if(contacts.length)this.contacts=contacts.map(e=>({...e,t}));this.contacts=this.contacts.filter(e=>t-e.t<4);
  let W=o.map.width,H=o.map.height,wall=(x,y)=>x<0||y<0||x>=W||y>=H||o.map.tiles[y*W+x]===1;
  let hit=(x,y)=>{for(let yy=Math.floor(y-.3);yy<=Math.floor(y+.3);yy++)for(let xx=Math.floor(x-.3);xx<=Math.floor(x+.3);xx++)if(wall(xx,yy)&&Math.hypot(x-Math.max(xx,Math.min(x,xx+1)),y-Math.max(yy,Math.min(y,yy+1)))<.3)return true;return false;};
  let los=(p,q)=>{let n=Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)*10);for(let i=1;i<n;i++)if(wall(Math.floor(p.x+(q.x-p.x)*i/n),Math.floor(p.y+(q.y-p.y)*i/n)))return false;return true;};
  let units=o.units.map(u=>({...u,path:[]}));
  for(let u of units){
   let sx=this.style==='indB'?30.5:9.5;
   let goal=atk?{x:sx,y:7.5}:{x:[9.5,10.5,19.5,29.5,30.5][u.index],y:8.5};
   if(!atk&&this.style==='indStack')goal={x:19.5+(u.index-2)*.3,y:8.2};
   if(!atk&&this.contacts.length)goal={x:this.contacts[0].x,y:this.contacts[0].y-1};
   if(b.state==='planted')goal={x:b.x,y:b.y};
   if(atk&&b.state==='dropped')goal={x:b.x,y:b.y};
   if(!atk&&this.style==='indHunt'&&t>8&&!this.contacts.length)goal={x:19.5,y:17.5};
   u.goal=goal;
   let start=Math.floor(u.y)*W+Math.floor(u.x),end=Math.floor(goal.y)*W+Math.floor(goal.x),q=[start],prev=new Map([[start,null]]);
   for(let i=0;i<q.length&&!prev.has(end);i++){let p=q[i],x=p%W,y=Math.floor(p/W);for(let [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){let nx=x+dx,ny=y+dy,z=ny*W+nx;if(!wall(nx,ny)&&!prev.has(z)){prev.set(z,p);q.push(z);}}}
   if(prev.has(end)){for(let z=end;z!==start;z=prev.get(z))u.path.unshift({x:z%W+.5,y:Math.floor(z/W)+.5});}
   u.path.push(goal);
  }
  let frames=[];
  for(let f=0;f<20;f++)frames.push(units.map(u=>{
   if(!u.alive)return {dir:'N',aim:'D'};
   while(u.path.length&&Math.hypot(u.path[0].x-u.x,u.path[0].y-u.y)<.19)u.path.shift();
   let goal=u.path[0]||u.goal,dir=Math.hypot(goal.x-u.x,goal.y-u.y)<.17?'N':aim(goal.x-u.x,goal.y-u.y);
   if(atk&&b.carrier===u.id&&Object.values(o.map.sites).some(s=>Math.floor(u.x)>=s.x1&&Math.floor(u.x)<=s.x2&&Math.floor(u.y)>=s.y1&&Math.floor(u.y)<=s.y2))dir='N';
   if(b.state==='planted'&&!atk&&Math.hypot(u.x-b.x,u.y-b.y)<.85)dir='N';
   let enemies=this.contacts.filter(e=>los(u,e)).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
   let a=atk?'U':'D';
   if(enemies.length){a=aim(enemies[0].x-u.x,enemies[0].y-u.y);if(Math.hypot(enemies[0].x-u.x,enemies[0].y-u.y)<12)dir='N';}
   if(atk&&b.state==='planted'&&!enemies.length)a=u.x<20?'DR':'DL';
   let [dx,dy]=dirs[dir];if(!hit(u.x+dx*.15,u.y))u.x+=dx*.15;if(!hit(u.x,u.y+dy*.15))u.y+=dy*.15;
   return {dir,aim:a};
  }));
  return {inputs:frames};
 }
};
