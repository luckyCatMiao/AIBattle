'use strict';
const fs=require('fs'),E=require('./engine'),A=require('./agent'),{Adversary}=require('./adversaries');
function test(style,chars,seat,reactive=false,ourTeam=['kestrel','vex','aegis']) {
 const ts=[];ts[seat]=ourTeam;ts[1-seat]=chars;
 const g=E.createMatch({players:ts.map((team,i)=>({name:'P'+i,kind:'api',team}))});
 const ctrl=new A.Controller(),enemy=new Adversary(style);let n=0,maxMs=0;
 while(g.status==='playing'&&n<405) {
  let st=performance.now(),r=ctrl.choose(E.snapshot(g,seat));maxMs=Math.max(maxMs,performance.now()-st);
  let ew=[];
  if(!reactive){const sim=A.clone(g);for(let i=0;i<15;i++){const inp=enemy.next(sim,1-seat);ew.push(inp);const ins=[];ins[seat]={dir:'DB',btn:null};ins[1-seat]=inp;A.stepFrame(sim,ins);}}
  E.submitWindow(g,seat,r.inputs);
  for(let i=0;i<15&&g.status==='playing';i++){const ins=[];ins[seat]=r.inputs[i];ins[1-seat]=reactive?enemy.next(g,1-seat):ew[i];A.stepFrame(g,ins);}
  n++;
 }
 return {style,chars,seat,reactive,win:g.winner===seat,winner:g.winner,frames:g.frames,maxMs:Math.round(maxMs),roundLog:g.roundLog,hp:g.fighters.map(f=>[f.char,Math.round(f.hp)])};
}
if(require.main===module){
 const cases=[['zone',['kestrel','vex','aegis']],['rush',['vex','aegis','kestrel']],['dp',['aegis','sable','kestrel']],['grab',['torv','vex','aegis']],['parry',['sable','kestrel','vex']],['bomb',['nyx','kestrel','torv']],['mix',['kestrel','vex','sable']],['punish',['kestrel','aegis','sable']],['jump',['vex','nyx','kestrel']],['runaway',['vex','kestrel','aegis']]];
 const results=[];for(const [s,t]of cases)for(const seat of[0,1])for(const reactive of process.argv.includes('--reactive')?[true]:[false]){const r=test(s,t,seat,reactive);results.push(r);console.log(JSON.stringify(r));}
 fs.writeFileSync('adversarial_results'+(process.argv.includes('--reactive')?'_reactive':'')+'.json',JSON.stringify(results,null,2));
}
module.exports={test};
