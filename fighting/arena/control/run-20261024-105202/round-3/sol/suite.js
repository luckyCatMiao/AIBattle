global.bot=null;const s=require('./simulation'),a=require('./agent'),op=require('./opponents'),fs=require('fs');
const all=['aegis','vex','kestrel','torv','nyx','sable'];
function test(style,team,enemy,seat){
 let teams=[];teams[seat]=team;teams[1-seat]=enemy;let g=s.createMatch({players:teams.map((team,i)=>({name:''+i,kind:'api',team}))}),prev=null,times=[],n=0;
 while(g.status==='playing'&&n++<700){
  let start=performance.now(),h=a.hydrate(s.snapshot(g,seat),prev),r=a.decide(h,seat);times.push(performance.now()-start);prev=h;prev.fighters[seat].inputHistory.push(...r.inputs);prev.fighters[seat].inputHistory=prev.fighters[seat].inputHistory.slice(-30);
  let c=op.create(style);
  for(let i=0;i<15&&g.status==='playing';i++){let ins=[];ins[seat]=r.inputs[i];ins[1-seat]=op.act(g,1-seat,c);s.stepFrame(g,ins);}
 }
 return {style,team,enemy,seat,winner:g.winner,win:g.winner===seat,frames:g.frames,hp:g.fighters.map(f=>Math.round(f.hp)),active:g.players.map(p=>p.active),rounds:g.roundLog,maxMs:Math.max(...times),meanMs:times.reduce((x,y)=>x+y,0)/times.length};
}
if(require.main===module){let suite=process.argv[2]||'a',team=(process.argv[3]||'kestrel,aegis,vex').split(',');let styles=suite==='a'?['artillery','reversal','hopper','throw']:suite==='b'?['parry','bomb','heavyspam','block']:['balanced','zone','rush','safe','heavy','jump'];let results=[];
for(let style of styles)for(let seat of [0,1]){let enemy=style==='throw'?['torv','vex','aegis']:style==='parry'?['sable','aegis','kestrel']:style==='bomb'?['nyx','torv','sable']:['aegis','kestrel','vex'];let r=test(style,team,enemy,seat);results.push(r);console.log(JSON.stringify(r));fs.writeFileSync(`suite-${suite}.json`,JSON.stringify(results,null,2));}}
module.exports={test};
