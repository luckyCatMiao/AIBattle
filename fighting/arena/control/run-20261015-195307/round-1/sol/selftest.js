'use strict';
const fs=require('fs');
const E=require('./engine');const A=require('./agent');
const team=['kestrel','vex','aegis'];
function match(style,enemyTeam,seat,full=false,max=450) {
 const teams=[];teams[seat]=team;teams[1-seat]=enemyTeam;
 const g=E.createMatch({players:teams.map((team,i)=>({name:'p'+i,kind:'api',team}))});
 const ctrl=new A.Controller();let windows=0,maxMs=0,sumMs=0,notes={};
 let oldId=null,opp=null;
 while(g.status==='playing'&&windows<max) {
  const t=performance.now();const r=ctrl.choose(E.snapshot(g,seat));
  const ms=performance.now()-t;maxMs=Math.max(maxMs,ms);sumMs+=ms;
  notes[r.note.split(' ')[0]]=(notes[r.note.split(' ')[0]]||0)+1;
  E.submitWindow(g,seat,r.inputs);
  if(oldId!==g.fighters[1-seat].id){opp=new A.Policy(style);oldId=g.fighters[1-seat].id;}
  let ew;
  if(!full) {
   const h=A.clone(g);ew=[];
   for(let i=0;i<15;i++) {const inp=opp.next(h,1-seat);ew.push(inp);const pair=[];pair[seat]={dir:'DB',btn:null};pair[1-seat]=inp;A.stepFrame(h,pair);}
  }
  for(let i=0;i<15&&g.status==='playing';i++) {
   const pair=[];pair[seat]=r.inputs[i];pair[1-seat]=full?opp.next(g,1-seat):ew[i];A.stepFrame(g,pair);
  }
  windows++;
 }
 return {style,enemyTeam,seat,full,winner:g.winner,win:g.winner===seat,reason:g.reason,frames:g.frames,windows,maxMs:Math.round(maxMs),meanMs:Math.round(sumMs/windows),roundLog:g.roundLog,notes,hp:g.fighters.map(f=>[f.char,f.hp])};
}
if(require.main===module) {
 const mode=process.argv[2]||'suite';let tests=[];
 if(mode==='one')tests=[match(process.argv[3]||'rush',['vex','aegis','kestrel'],Number(process.argv[4]||0),false)];
 else for(const style of ['rush','zone','normal','low','guard','jump','overhead','balanced'])for(const seat of [0,1]) tests.push(match(style,style==='rush'?['vex','aegis','torv']:style==='zone'?['kestrel','aegis','sable']:['aegis','torv','nyx'],seat));
 for(const t of tests) console.log(JSON.stringify(t));
 fs.writeFileSync('/workspace/test_results.json',JSON.stringify(tests,null,2));
}
module.exports={match};
