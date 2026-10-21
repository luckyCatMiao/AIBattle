const fs=require('fs'),{play}=require('./revision4_sweep');
const base=fs.readFileSync('incumbent_revision5.js','utf8');const candidates={control:base,safe:fs.readFileSync('r5_safe.js','utf8'),weighted:fs.readFileSync('r5_weighted.js','utf8')};
for(const cos of [.25,.5,.75]){
 candidates['cone'+cos]=base.replace('const len=Math.hypot(vx,vy)||1;',`const dx=(u.x-threat.x)/(D(u,threat)||1),dy=(u.y-threat.y)/(D(u,threat)||1),ln=Math.hypot(vx,vy)||1;let ax=vx/ln,ay=vy/ln;const dot=ax*dx+ay*dy;if(dot<${cos}){const side=ax*(-dy)+ay*dx>=0?1:-1;ax=dx*${cos}-dy*side*Math.sqrt(1-${cos}*${cos});ay=dy*${cos}+dx*side*Math.sqrt(1-${cos}*${cos});}vx=ax;vy=ay;const len=Math.hypot(vx,vy)||1;`);
}
candidates.safeWeight04=candidates.safe.replace('(vd||1)*.8','(vd||1)*.4');
candidates.safeRadius40=candidates.safe.replace('vd<65','vd<40');
for(const [name,src]of Object.entries(candidates))fs.writeFileSync('r5_'+name+'.js',src);
let out=[];for(const name of Object.keys(candidates)){const rows=[];for(const opp of ['incumbent_revision5','r4_spread40','r3_reload0.65','series3_spar','revision1_longcohesion'])for(const seat of [0,1])rows.push({opp,...play(require('./r5_'+name).choose,require('./'+opp).choose,seat)});out.push({name,wins:rows.filter(r=>r.winner===r.seat).length,rows});console.log(JSON.stringify(out.at(-1)));fs.writeFileSync('revision5_refine.json',JSON.stringify(out,null,2));}
