const fs=require('fs'),s=require('./rules');
const base=fs.readFileSync('incumbent_revision4.js','utf8');
const variants={
 control:base,
 reload65:base.replace('o.now+.85','o.now+.65'),
 reload45:base.replace('o.now+.85','o.now+.45'),
 reserve:base.replace('180+p.level*120+(queue?40:160)','180+p.level*120+160'),
 nearThreat:base.replace('u.r+40','u.r+15'),
 spread:base.replace("const d=D(u,threat)||1, x=", "let vx=(u.x-threat.x)/(D(u,threat)||1),vy=(u.y-threat.y)/(D(u,threat)||1);for(const v of army){const vd=D(v,u);if(v.id!==u.id&&vd<65){vx+=(u.x-v.x)/(vd||1)*.8;vy+=(u.y-v.y)/(vd||1)*.8;}}const len=Math.hypot(vx,vy)||1;const virtual={x:u.x-vx/len*100,y:u.y-vy/len*100};threat=virtual;const d=D(u,threat)||1, x=").replace('const threat=near.filter','let threat=near.filter'),
 noEmptyNorth:base.replace("else{const other=nodes.find(n=>n.owner!==me);goal=other||north;}","else{const other=nodes.find(n=>n.owner!==me);goal=other||home;}"),
 keepLine:base.replace("else{const other=nodes.find(n=>n.owner!==me);goal=other||north;}","else{const other=nodes.find(n=>n.owner!==me);goal=other||{x:640,y:420};}"),
 hardFocus:base.replace('hits*3-splash*12','hits*6-splash*12'),
 noSplash:base.replace('hits*3-splash*12','hits*3-splash*4')
};
function play(a,z,seat){const g=s.createMatch({players:[{},{}]});g.status='playing';let errors=0;for(let t=0;t<600&&g.status==='playing';t++){const os=[structuredClone(s.snapshot(g,0)),structuredClone(s.snapshot(g,1))],acts=os.map((o,i)=>(i===seat?a:z)(o));for(let i=0;i<2;i++)for(const c of acts[i].commands)try{s.command(g,i,c)}catch(e){errors++}for(let k=0;k<20;k++)s.step(g);}return{seat,winner:g.winner,time:+g.now.toFixed(2),score:g.players.map(p=>s.score(g,p)),errors};}
module.exports={play};
if(require.main===module){let out=[];for(const [name,src] of Object.entries(variants)){fs.writeFileSync('r4_'+name+'.js',src);const a=require('./r4_'+name).choose,rows=[];for(const opp of ['incumbent_revision4','r3_upgrade','revision1_longcohesion'])for(const seat of [0,1])rows.push({opp,...play(a,require('./'+opp).choose,seat)});out.push({name,wins:rows.filter(r=>r.winner===r.seat).length,rows});console.log(JSON.stringify(out.at(-1)));fs.writeFileSync('revision4_sweep.json',JSON.stringify(out,null,2));}}
