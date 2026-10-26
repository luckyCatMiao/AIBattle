#!/usr/bin/env bash
# usage: dev/eval.sh <tag> <p0> <p1> <seconds> <seed0> <n> [pieces] [env0] [env1]
set -u
tag=$1; p0=$2; p1=$3; secs=$4; s0=$5; n=$6; par=${7:-8}; e0=${8:-}; e1=${9:-}
cd "$(dirname "$0")/.."
out="dev/res/eval/$tag"
rm -rf "$out"; mkdir -p "$out"
run() {
  local i=$1 seed=$((s0 + i))
  local a=(--p0 "$p0" --p1 "$p1" --games 1 --seed "$seed" --seconds "$secs" --stats --vary)
  [ -n "$e0" ] && a+=(--env0 "$e0")
  [ -n "$e1" ] && a+=(--env1 "$e1")
  node dev/harness.js "${a[@]}" > "$out/g$i.log" 2>&1
}
for ((i=0;i<n;i++)); do
  run "$i" &
  while [ "$(jobs -rp | wc -l)" -ge "$par" ]; do wait -n; done
done
wait
node - "$out" "$n" <<'JS'
const fs=require('fs');const dir=process.argv[2];const n=+process.argv[3];
let w=[0,0,0],frames=[],err=0,stats=[];
for(let i=0;i<n;i++){let t;try{t=fs.readFileSync(dir+'/g'+i+'.log','utf8')}catch(e){err++;continue}
 const m=t.match(/winner=(\w+) reason=(.+?) frames=(\d+)/);if(!m){err++;continue}
 if(m[1]==='null')w[2]++;else w[+m[1]]++;
 frames.push(+m[3]);
 const ss=t.match(/STATS seed=\d+ (\{.*\})/);if(ss){stats.push(JSON.parse(ss[1]));}
}
const med=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?+a[Math.floor(a.length/2)].toFixed(2):null};
const avg=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):null;
console.log(`TAG=${process.argv[2]} games=${n} p0win=${w[0]} p1win=${w[1]} draw=${w[2]} errors=${err}`);
console.log(`frames=${frames.join(',')} median=${med(frames)}`);
if(stats.length){
 const u15=[0,1].map(k=>stats.map(s=>s.shotQuality[k].under1_5));
 const minE=[0,1].map(k=>stats.map(s=>s.minEnemyDist[k]));
 const sepMin=[0,1].map(k=>stats.map(s=>s.separation[k].min));
 const wall=[0,1].map(k=>stats.map(s=>s.wall[k].near22));
 console.log(`under1_5 shots p0=${u15[0].join(',')} | sum=${u15[0].reduce((a,b)=>a+b,0)}`);
 console.log(`under1_5 shots p1=${u15[1].join(',')} | sum=${u15[1].reduce((a,b)=>a+b,0)}`);
 console.log(`minEnemyDist p0 med=${med(minE[0])} min=${Math.min(...minE[0])} | p1 med=${med(minE[1])} min=${Math.min(...minE[1])}`);
 console.log(`separation p0 med=${med(sepMin[0])} min=${Math.min(...sepMin[0])} | p1 med=${med(sepMin[1])} min=${Math.min(...sepMin[1])}`);
 console.log(`wallNear22 p0 avg=${avg(wall[0])} | p1 avg=${avg(wall[1])}`);
}
JS
