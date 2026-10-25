'use strict';
const fs=require('fs');
const rows=fs.readFileSync(require('path').join(__dirname,'current_r1_matches.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const summary={matches:rows.length,win:0,draw:0,loss:0,goals:0,conceded:0,fouls:0,maxMs:0,modes:{}};
for(const row of rows){
 const m=summary.modes[row.mode]||(summary.modes[row.mode]={matches:0,win:0,draw:0,loss:0,goals:0,conceded:0,fouls:0,maxMs:0});
 for(const s of [summary,m]){
  if(s===m)s.matches++;
  s[row.win]++;s.goals+=row.score[row.seat];s.conceded+=row.score[1-row.seat];s.fouls+=row.fouls[row.seat];s.maxMs=Math.max(s.maxMs,row.maxMs);
 }
}
console.log(JSON.stringify(summary,null,2));
