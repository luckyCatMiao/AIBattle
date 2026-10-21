const fs=require('fs'),{play}=require('./revision4_sweep');
const base=fs.readFileSync('incumbent_revision5.js','utf8');
const dir=`const dot=vx*(u.x-threat.x)+vy*(u.y-threat.y);if(dot<0){const dx=(u.x-threat.x)/(D(u,threat)||1),dy=(u.y-threat.y)/(D(u,threat)||1);const inward=vx*dx+vy*dy;vx-=inward*dx;vy-=inward*dy;vx+=dx*.25;vy+=dy*.25;}\n   const len=Math.hypot(vx,vy)||1;`;
const variants={
 control:base,
 timed:base.replaceAll('/d*50','/d*Math.min(50,37*Math.max(.1,u.fireAt-o.now-.1))'),
 timed45:base.replace('o.now+.85','o.now+.45').replaceAll('/d*50','/d*Math.min(50,37*Math.max(.1,u.fireAt-o.now-.1))'),
 timed65:base.replace('o.now+.85','o.now+.65').replaceAll('/d*50','/d*Math.min(50,37*Math.max(.1,u.fireAt-o.now-.1))'),
 safe:base.replace('const len=Math.hypot(vx,vy)||1;',dir),
 weighted:base.replace('let vx=(u.x-threat.x)/(D(u,threat)||1),vy=(u.y-threat.y)/(D(u,threat)||1);',`let vx=0,vy=0;for(const e of near){const d=D(u,e)||1;if(d<TYPES[e.type].range+u.r+40){const weight=TYPES[e.type].damage*(1+o.players[e.owner].level*.2)/Math.max(.4,e.fireAt-o.now+.4);vx+=(u.x-e.x)/d*weight;vy+=(u.y-e.y)/d*weight;}}const vl=Math.hypot(vx,vy)||1;vx/=vl;vy/=vl;`),
 ready:base.replace("e.type!=='raider'&&D(e,u)","e.type!=='raider'&&e.fireAt<o.now+1&&D(e,u)"),
 near:base.replace('u.r+40','u.r+15'),
 short:base.replaceAll('/d*50','/d*30'),
 longer:base.replace('o.now+.85','o.now+1.05'),
};
for(const [name,src] of Object.entries(variants))fs.writeFileSync('r5_'+name+'.js',src);
if(require.main===module){let out=[];for(const name of Object.keys(variants)){const rows=[];for(const opp of ['incumbent_revision5','r4_spread40','r3_upgrade'])for(const seat of [0,1])rows.push({opp,...play(require('./r5_'+name).choose,require('./'+opp).choose,seat)});out.push({name,wins:rows.filter(r=>r.winner===r.seat).length,rows});console.log(JSON.stringify(out.at(-1)));fs.writeFileSync('revision5_sweep.json',JSON.stringify(out,null,2));}}
