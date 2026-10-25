const fs=require('fs'),{play}=require('./revision4_sweep');
const base=fs.readFileSync('incumbent_series_r2.js','utf8');
const variants={
 control:base,
 central:base.replace('goal=other||north;','goal=other||{x:640,y:420};'),
 forward:base.replace('goal=other||north;','goal=other||{x:640+(eb.x-640)*.22,y:420};'),
 readyFocus:base.replace('hits*3-splash*12','hits*6-splash*8'),
 spreadIdle:base.replace('const dest=assigned.get(u.id)||goal;',`let dest=assigned.get(u.id)||goal;if(u.type==='tank'&&!assigned.has(u.id)&&dest!==eb&&near.length===0){const index=army.filter(v=>v.type==='tank').findIndex(v=>v.id===u.id),side=me===0?1:-1;dest={...dest,x:Math.max(18,Math.min(1262,dest.x-side*(index%3)*50)),y:Math.max(18,Math.min(822,dest.y+(Math.floor(index/3)%5-2)*48))};}`),
 splash:base.replace("foes.filter(v=>v!==e&&D(v,e)<36).length:0","foes.filter(v=>v!==e&&D(v,e)<36).reduce((s,v)=>s+Math.min(v.hp,stats.damage*(1+p.level*.2)*(v.type==='rifle'?1.5:1)*.4)/16,0):0"),
 readyAttack:base.replace("u.fireAt>o.now+.85&&threat","u.fireAt>o.now+1.1&&threat"),
};
for(const [name,src] of Object.entries(variants))fs.writeFileSync('sr2_'+name+'.js',src);
if(require.main===module){const results=[];for(const name of Object.keys(variants)){const rows=[];for(const opp of ['incumbent_series_r2','r5_weighted','r4_reload45'])for(const seat of [0,1])rows.push({opp,...play(require('./sr2_'+name).choose,require('./'+opp).choose,seat)});const result={name,wins:rows.filter(r=>r.winner===r.seat).length,rows};results.push(result);console.log(JSON.stringify(result));fs.writeFileSync('series_r2_sweep.json',JSON.stringify(results,null,2));}}
