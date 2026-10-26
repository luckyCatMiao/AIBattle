const fs=require('fs');
const dir=process.argv[2], n=+process.argv[3];
let w=[0,0,0],frames=[],err=0,stats=[];
for(let i=0;i<n;i++){let t;try{t=fs.readFileSync(dir+'/g'+i+'.log','utf8')}catch(e){err++;continue}
 const m=t.match(/winner=(\w+) reason=(.+?) frames=(\d+)/);if(!m){err++;continue}
 if(m[1]==='null')w[2]++;else w[+m[1]]++;
 frames.push(+m[3]);
 const ss=t.match(/STATS seed=\d+ (\{.*\})/);if(ss){stats.push(JSON.parse(ss[1]));}
}
const med=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?+a[Math.floor(a.length/2)].toFixed(2):null};
const avg=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):null;
console.log(`TAG=${dir} games=${n} p0win=${w[0]} p1win=${w[1]} draw=${w[2]} errors=${err}`);
console.log(`frames=${frames.join(',')} median=${med(frames)}`);
if(stats.length){
 for(const k of [0,1]){
  const sc=stats.map(s=>s.shotQuality[k]);
  const sum=(f)=>sc.reduce((a,b)=>a+f(b),0);
  const nS=sum(s=>s.n);
  console.log(`p${k}: shots=${nS} | m30<1.5=${sum(s=>s.m30.u15)} (${(100*sum(s=>s.m30.u15)/nS).toFixed(1)}%) m30<1.0=${sum(s=>s.m30.u10)} | m60<1.5=${sum(s=>s.m60.u15)} (${(100*sum(s=>s.m60.u15)/nS).toFixed(1)}%) m60<1.0=${sum(s=>s.m60.u10)} | life<1.5=${sum(s=>s.under1_5)} life<1.0=${sum(s=>s.under1_0)} | minEnemy=${Math.min(...stats.map(s=>s.minEnemyDist[k]))} sepMin=${Math.min(...stats.map(s=>s.separation[k].min))} wall=${avg(stats.map(s=>s.wall[k].near22))}`);
 }
}
