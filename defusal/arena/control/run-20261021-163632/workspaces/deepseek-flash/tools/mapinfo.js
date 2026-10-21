'use strict';
const c = require('/workspace/catalog.js');
const seeds = process.argv.slice(2).map(Number);
const W=56,H=34;
function bfs(tiles, sx, sy, block){
  const d = new Int16Array(W*H).fill(-1);
  const q=[sy*W+sx]; d[sy*W+sx]=0;
  for(let qi=0; qi<q.length; qi++){
    const p=q[qi], x=p%W, y=(p/W)|0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      if(tiles[ny*W+nx]) continue;
      const np=ny*W+nx;
      if(d[np]>=0) continue;
      d[np]=d[p]+1; q.push(np);
    }
  }
  return (x,y)=>d[y*W+x];
}
for(const seed of seeds){
  const tiles=c.buildMap(seed);
  const A={x:11,y:7}, B={x:44,y:7};
  const atk=bfs(tiles,27,30), def=bfs(tiles,27,3);
  console.log('seed',seed,'atk->A',atk(A.x,A.y),'atk->B',atk(B.x,B.y),'def->A',def(A.x,A.y),'def->B',def(B.x,B.y));
  // 列出 y=16,17 的缺口
  let gaps16=[],gaps17=[];
  for(let x=0;x<W;x++){ if(!tiles[16*W+x]) gaps16.push(x); if(!tiles[17*W+x]) gaps17.push(x); }
  const runs=a=>{const r=[];let s=null,p=null;for(const x of a){if(s===null){s=x;p=x;}else if(x===p+1){p=x;}else{r.push([s,p]);s=x;p=x;}}if(s!==null)r.push([s,p]);return r;};
  console.log('  gaps y16',JSON.stringify(runs(gaps16)),'y17',JSON.stringify(runs(gaps17)));
  // 到 A 中心与 B 中心路径上的关键节点：用 BFS 回溯
  const dist=atk;
  function pathTo(tx,ty){
    let x=tx,y=ty; const path=[[x,y]];
    if(dist(x,y)<0) return null;
    while(!(x===27&&y===30)){
      let best=null,bd=dist(x,y);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=W||ny>=H||tiles[ny*W+nx]) continue;
        const dd=dist(nx,ny);
        if(dd>=0&&dd<bd){bd=dd;best=[nx,ny];}
      }
      if(!best) return null;
      [x,y]=best; path.push([x,y]);
    }
    return path.reverse();
  }
  const pa=pathTo(A.x,A.y), pb=pathTo(B.x,B.y);
  const sample=p=>p?p.filter((_,i)=>i%4===0).map(q=>q.join(',')).join(' '):'none';
  console.log('  pathA:',sample(pa));
  console.log('  pathB:',sample(pb));
}
