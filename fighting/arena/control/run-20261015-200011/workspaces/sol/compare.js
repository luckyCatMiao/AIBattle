'use strict';
const E=require('./engine'),A=require('./agent'),B=require('./agent_v1');
function play(seat,team=['kestrel','vex','aegis'],teamB=team){
 const ts=[];ts[seat]=team;ts[1-seat]=teamB;
 const g=E.createMatch({players:ts.map((team,i)=>({name:'p'+i,kind:'api',team}))});
 const ac=new A.Controller(),bc=new B.Controller();let n=0,max=0;
 while(g.status==='playing'&&n<405){const t=performance.now();const a=ac.choose(E.snapshot(g,seat));max=Math.max(max,performance.now()-t);const b=bc.choose(E.snapshot(g,1-seat));const pair=[];pair[seat]=a.inputs;pair[1-seat]=b.inputs;E.advanceWindow(g,pair);n++;}
 return {seat,win:g.winner===seat,winner:g.winner,frames:g.frames,maxMs:Math.round(max),roundLog:g.roundLog,hp:g.fighters.map(f=>[f.char,Math.round(f.hp)])};
}
console.log(JSON.stringify(play(0)));console.log(JSON.stringify(play(1)));
