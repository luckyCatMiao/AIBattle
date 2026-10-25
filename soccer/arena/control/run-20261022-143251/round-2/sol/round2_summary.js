'use strict';
const fs=require('fs');
function summarize(file){const rows=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);let out={matches:rows.length,win:0,draw:0,loss:0,goals:0,conceded:0,fouls:0,maxMs:0,modes:{}};for(const r of rows){out[r.result]++;out.goals+=r.score[r.seat];out.conceded+=r.score[1-r.seat];out.fouls+=r.fouls[r.seat];out.maxMs=Math.max(out.maxMs,r.maxMs);const m=out.modes[r.mode]||={matches:0,win:0,draw:0,loss:0,goals:0,conceded:0};m.matches++;m[r.result]++;m.goals+=r.score[r.seat];m.conceded+=r.score[1-r.seat];}return out;}
for(const f of process.argv.slice(2))console.log(JSON.stringify({file:f,...summarize(f)},null,2));
