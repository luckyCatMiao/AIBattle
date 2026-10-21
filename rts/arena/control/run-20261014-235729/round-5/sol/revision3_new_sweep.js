const fs=require('fs'),s=require('./rules');const base=fs.readFileSync('incumbent_revision3.js','utf8');
function play(a,z,seat,start){const g=start?structuredClone(start):s.createMatch({players:[{},{}]});g.status='playing';let errors=0,maxMs=0;for(let t=0;t<600&&g.status==='playing'&&g.now<600;t++){const os=[structuredClone(s.snapshot(g,0)),structuredClone(s.snapshot(g,1))],acts=os.map((o,i)=>{const st=performance.now(),v=(i===seat?a:z)(o);maxMs=Math.max(maxMs,performance.now()-st);return v;});for(let i=0;i<2;i++)for(const c of acts[i].commands)try{s.command(g,i,c)}catch(e){errors++}for(let k=0;k<20;k++)s.step(g);}return {seat,winner:g.winner,time:+g.now.toFixed(2),score:g.players.map(p=>s.score(g,p)),errors,maxMs};}
const variants={};for(const threshold of [.65,.85,1.25])variants['reload'+threshold]=base.replace('o.now+1.05','o.now+'+threshold);
variants.fine=base.replace("'kite'+Math.round(x/70)+','+Math.round(y/70)","'kite'+u.id");
variants.support=base.replace('D(v,u)<250','D(v,u)<175').replace('ep>ally*1.65','ep>ally*1.25');
variants.join=base.replace('const dest=assigned.get(u.id)||goal;',`const leader=army.filter(v=>v.id!==u.id&&v.type==='tank'&&D(v,goal)<D(u,goal)-100).sort((a,c)=>D(a,goal)-D(c,goal))[0]; const dest=assigned.get(u.id)||(u.type==='tank'&&leader&&D(leader,u)>145?leader:goal);`);
variants.near=base.replace('const dest=assigned.get(u.id)||goal;',`const en=fighters.filter(e=>D(e,u)<380).sort((a,c)=>D(a,u)-D(c,u))[0];const dest=assigned.get(u.id)||(en||goal);`);
variants.north=base.replace('else{const other=nodes.find(n=>n.owner!==me);goal=other||north;}','else{goal=north;}');
variants.spread=variants.fine.replace('o.now+1.05','o.now+.85');
variants.combo=variants.support.replace("'kite'+Math.round(x/70)+','+Math.round(y/70)","'kite'+u.id");
const out=[];for(const [name,src] of Object.entries(variants)){fs.writeFileSync('r3_'+name+'.js',src);const a=require('./r3_'+name).choose,rows=[];for(const opp of ['incumbent_revision3','revision1_longcohesion','series3_southpure'])for(const seat of [0,1])rows.push({opp,...play(a,require('./'+opp).choose,seat)});out.push({name,wins:rows.filter(r=>r.winner===r.seat).length,rows});console.log(JSON.stringify(out.at(-1)));}fs.writeFileSync('revision3_new_sweep.json',JSON.stringify(out,null,2));
module.exports={play};
