'use strict';
const fs=require('fs');
for(const file of process.argv.slice(2)){
 const rows=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),groups={};
 for(const r of rows)for(const key of ['all',r.mode]){
  const s=groups[key]||(groups[key]={games:0,win:0,draw:0,loss:0,goals:0,against:0,fouls:0,maxMs:0});
  s.games++;s[r.result]++;s.goals+=r.score[r.seat];s.against+=r.score[1-r.seat];s.fouls+=r.fouls[r.seat];s.maxMs=Math.max(s.maxMs,r.maxMs);
 }
 console.log(JSON.stringify({file,groups}));
}
