const fs=require('fs'),{play}=require('./revision4_sweep');
const base=fs.readFileSync('incumbent_series_r3.js','utf8');
const rifle=`
  if(u.type==='rifle'&&!baseRush&&near.some(e=>e.type==='tank'&&D(e,u)<190)&&!near.some(e=>e.type!=='tank'&&D(e,u)<140)){
   const e=near.filter(e=>e.type==='tank').sort((a,c)=>D(a,u)-D(c,u))[0],d=D(u,e)||1;
   group('screen'+u.id,{type:'move',x:Math.max(18,Math.min(1262,u.x+(u.x-e.x)/d*75)),y:Math.max(18,Math.min(822,u.y+(u.y-e.y)/d*75))},u,108);continue;
  }
`;
const variants={control:base,rifle:base.replace('  const capture=assigned.get(u.id);',rifle+'  const capture=assigned.get(u.id);'),
 anchor:base.replace('goal=other||north;','goal=other||nodes[1];'),
 center:base.replace('goal=other||north;','goal=other||{x:640,y:420};'),
 pressure:base.replace('goal=other||north;',`goal=other||o.nodes.reduce((a,c)=>{const danger=n=>fighters.reduce((s,e)=>s+powerAt(e,n),0);return danger(a)>danger(c)?a:c;});`).replace(' const cmds=[];',` const powerAt=(e,n)=>e.hp*Math.max(0,1-D(e,n)/350); const cmds=[];`),
 reload:base.replace('o.now+.85','o.now+.65'),
 focus:base.replace('hits*3-splash*12','hits*5-splash*8'),
 range:base.replace('u.r+40','u.r+15'),
 support:base.replace('D(v,u)<140','D(v,u)<170'),
};
for(const [name,src] of Object.entries(variants))fs.writeFileSync('sr3_'+name+'.js',src);
if(require.main===module){let results=[];for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(variants)){const rows=[];for(const opp of ['incumbent_series_r3','r5_weighted','r4_reload45'])for(const seat of [0,1])rows.push({opp,...play(require('./sr3_'+name).choose,require('./'+opp).choose,seat)});const out={name,wins:rows.filter(r=>r.winner===r.seat).length,rows};results.push(out);console.log(JSON.stringify(out));fs.writeFileSync('series_r3_sweep.json',JSON.stringify(results,null,2));}}
