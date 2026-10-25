'use strict';
const {runGame}=require('./harness.js');
const cfg=process.argv[3]?JSON.parse(process.argv[3]):{};
const a=Number(process.argv[2]||4000), n=Number(process.argv[4]||60);
const rows=[];for(let i=0;i<n;i++)rows.push(runGame(a+i,{cfg}));
const fin=rows.filter(r=>r.finishTime!=null);
const miss=rows.filter(r=>r.wraps>r.lap);
const bad=rows.filter(r=>r.finishTime==null||r.wraps>r.lap+1);
console.log('fin',fin.length+'/'+n,'meanFin',(fin.reduce((s,r)=>s+r.finishTime,0)/fin.length).toFixed(2),
 'meanBest',(fin.reduce((s,r)=>s+r.bestLap,0)/fin.length).toFixed(2),
 'meanOff',(rows.reduce((s,r)=>s+r.offroadPct,0)/n).toFixed(2),
 'ratioFin/best',(fin.reduce((s,r)=>s+r.finishTime/r.bestLap,0)/fin.length).toFixed(2),
 'gamesWithExtraLap',miss.length,'bad',bad.length);
for(const r of rows.filter(r=>r.wraps>r.lap+1).slice(0,5)) console.log('  bad seed',r.seed,'fin',r.finishTime,'best',r.bestLap,'wraps',r.wraps,'lap',r.lap);
console.log('worst ratio:',rows.filter(r=>r.finishTime).map(r=>[r.seed,(r.finishTime/r.bestLap).toFixed(2),r.finishTime.toFixed(1),r.wraps,r.lap]).sort((a,b)=>b[1]-a[1]).slice(0,6).join(' | '));
