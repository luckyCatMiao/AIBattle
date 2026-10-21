'use strict';
// Independent local sparring controller: cardinal BFS, sustained strafes, scanning.
const readline=require('readline');
const dirs={N:[0,0],U:[0,-1],D:[0,1],L:[-1,0],R:[1,0],UL:[-.7071067811865476,-.7071067811865476],UR:[.7071067811865476,-.7071067811865476],DL:[-.7071067811865476,.7071067811865476],DR:[.7071067811865476,.7071067811865476]};const compass=['R','DR','D','DL','L','UL','U','UR'];
const style=process.argv[2]||'scan';let lastRound,mem={},fields={};
function act(o){
 const W=o.map.width,H=o.map.height,T=o.map.tiles;const wall=(x,y)=>x<0||y<0||x>=W||y>=H||T[Math.floor(y)*W+Math.floor(x)]!==0;
 const fits=(x,y)=>{for(let j=Math.floor(y-.3);j<=Math.floor(y+.3);j++)for(let i=Math.floor(x-.3);i<=Math.floor(x+.3);i++)if(wall(i+.5,j+.5)){const dx=x-Math.max(i,Math.min(x,i+1)),dy=y-Math.max(j,Math.min(y,j+1));if(dx*dx+dy*dy<.09)return false}return true};
 const move=(x,y,d)=>{const [dx,dy]=dirs[d];if(fits(x+dx*.15,y))x+=dx*.15;if(fits(x,y+dy*.15))y+=dy*.15;return [x,y]};
 const los=(x,y,xx,yy)=>{let n=Math.ceil(Math.hypot(xx-x,yy-y)*10);for(let i=1;i<n;i++)if(wall(x+(xx-x)*i/n,y+(yy-y)*i/n))return false;return true};
 const aim=(x,y)=>compass[((Math.round(Math.atan2(y,x)/(Math.PI/4))%8)+8)%8];
 if(lastRound!==o.round){lastRound=o.round;mem={};fields={}}
 if(o.phase==='buy')return {buys:o.units.map(u=>{let m=u.money,p={unit:u.index};if(m>=650&&u.armor<50){p.armor=true;m-=650}if(u.weapon==='pistol'||u.weapon==='pdw')for(const [w,c]of [['rifle',2700],['smg',1250],['pdw',700]])if(m>=c){p.weapon=w;m-=c;break}if(o.side==='defend'&&m>=400)p.kit=true;return p})};
 for(const es of Object.values(o.visibleEnemies))for(const e of es)mem[e.id]={...e,t:o.tick};const es=Object.values(mem).filter(e=>o.tick-e.t<=60);
 function field(g){let k=Math.floor(g[1])*W+Math.floor(g[0]);if(T[k]){let best=1e9;for(let a=0;a<T.length;a++)if(!T[a]){let d=(a%W+.5-g[0])**2+(Math.floor(a/W)+.5-g[1])**2;if(d<best){best=d;k=a}}}if(fields[k])return fields[k];let f=new Float64Array(T.length).fill(1e6),q=[k];f[k]=0;for(let j=0;j<q.length;j++){let c=q[j];for(const n of [c-1,c+1,c-W,c+W])if(n>=0&&n<T.length&&!T[n]&&f[n]>f[c]+1){f[n]=f[c]+1;q.push(n)}}fields[k]=f;return f}
 const atk=o.side==='attack',b=o.bomb,pl=b.state==='planted';let label=style==='left'?'A':'B';let s=o.map.sites[label];const center=[(s.x1+s.x2+1)/2,8.5];const out=Array.from({length:20},()=>Array.from({length:5},()=>({dir:'N',aim:'N'})));
 for(const u of o.units){if(!u.alive)continue;let x=u.x,y=u.y;let g=atk?center:[27.5,11.5];if(style==='split'&&!atk)g=[u.index<2?11.5:44.5,9.5];if(pl||b.state==='dropped'&&b.x!==undefined)g=[b.x,b.y];else if(!atk&&es.length){const e=es.reduce((a,e)=>Math.hypot(e.x-x,e.y-y)<Math.hypot(a.x-x,a.y-y)?e:a);g=[e.x,e.y]}const ds=field(g);
 for(let f=0;f<20;f++){
 const targets=es.filter(e=>los(x,y,e.x,e.y));let e=targets.length?targets.reduce((a,e)=>Math.hypot(e.x-x,e.y-y)<Math.hypot(a.x-x,a.y-y)?e:a):null;
 const fixed=atk&&b.carrier===u.id&&Object.values(o.map.sites).some(s=>x>=s.x1&&x<s.x2+1&&y>=s.y1&&y<s.y2+1)||pl&&Math.hypot(x-b.x,y-b.y)<(atk?2.8:.8);
 let d='N';if(!fixed){let ck=Math.floor(y)*W+Math.floor(x),nk=ck;for(const n of [ck-1,ck+1,ck-W,ck+W])if(n>=0&&n<T.length&&ds[n]<ds[nk])nk=n;let wx=nk%W+.5,wy=Math.floor(nk/W)+.5;let best=1e9;for(const n of Object.keys(dirs)){let [nx,ny]=move(x,y,n),k=Math.floor(ny)*W+Math.floor(nx);let cost=Math.hypot(nx-wx,ny-wy);
 if(e){let r=Math.hypot(e.x-x,e.y-y)||1;let [dx,dy]=dirs[n];let sign=(u.index%2)?1:-1;if(style==='weave')sign=((Math.floor(o.frame/35)+u.index)%2)?1:-1;cost=.05*Math.hypot(nx-g[0],ny-g[1]);cost+=((nx-x)*(e.x-x)+(ny-y)*(e.y-y))/r*(r>4?-1:1.5);cost-=sign*((nx-x)*(e.y-y)-(ny-y)*(e.x-x))/r*3;if(n==='N')cost+=.8;if(Math.hypot(nx-x,ny-y)<.05&&n!=='N')cost+=2}
 if(cost<best){best=cost;d=n}}
 }
 [x,y]=move(x,y,d);let a=e?aim(e.x-x,e.y-y):pl&&atk?aim(b.x-x,b.y-y):atk?(y>14?'U':label==='A'?'R':'L'):'D';if(!e&&f%20>=13)a=compass[(Math.floor(o.frame/20)+u.index+Math.floor(f/3))%8];out[f][u.index]={dir:d,aim:a};
 }
 }
 return {inputs:out};
}
readline.createInterface({input:process.stdin}).on('line',s=>{try{console.log(JSON.stringify(act(JSON.parse(s))))}catch(e){console.error(e);process.exit(1)}});
