'use strict';
const fs=require('fs');
for(const file of process.argv.slice(2)){
 const rows=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),groups={};
 for(const r of rows){for(const key of ['all',r.mode]){const g=groups[key]||= {games:0,win:0,draw:0,loss:0,goals:0,against:0,fouls:0,maxMs:0};g.games++;g[r.result]++;g.goals+=r.score[r.seat];g.against+=r.score[1-r.seat];g.fouls+=r.fouls[r.seat];g.maxMs=Math.max(g.maxMs,r.maxMs);}}
 console.log(JSON.stringify({file,groups}));
}
