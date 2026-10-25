const fs=require('fs'),{play}=require('./revision4_sweep'),base=fs.readFileSync('incumbent_series_r2.js','utf8');
const variants={
 support180:base.replace('army.filter(v=>D(v,u)<250)','army.filter(v=>D(v,u)<180)'),
 support140:base.replace('army.filter(v=>D(v,u)<250)','army.filter(v=>D(v,u)<140)'),
 cautious:base.replace('ep>ally*1.65','ep>ally*1.3'),
 supportReady:base.replace('army.filter(v=>D(v,u)<250).reduce((s,v)=>s+power(v),0)','army.filter(v=>D(v,u)<250).reduce((s,v)=>s+power(v)*Math.max(.2,1-Math.max(0,D(v,u)-140)/150),0)'),
 northArmor:base.replace("if(o.now<18&&(ec.tank>0||eb.queue.some(q=>q.type==='tank')))goal={x:640,y:420};",''),
 cheapArmor:base.replace("if(o.now===0){train('tank');train('worker');}","if(o.now===0){train('tank');}").replace('nearbyMine?4:3','nearbyMine?3:3'),
 earlierUpgrade:base.replace('180+p.level*120+(queue?40:160)','180+p.level*120+40'),
};
let out=[];for(const [name,src] of Object.entries(variants)){fs.writeFileSync('sr2_'+name+'.js',src);const rows=[];for(const opp of ['incumbent_series_r2','r5_weighted','r4_reload45'])for(const seat of [0,1])rows.push({opp,...play(require('./sr2_'+name).choose,require('./'+opp).choose,seat)});out.push({name,wins:rows.filter(r=>r.winner===r.seat).length,rows});console.log(JSON.stringify(out.at(-1)));fs.writeFileSync('series_r2_refine.json',JSON.stringify(out,null,2));}
