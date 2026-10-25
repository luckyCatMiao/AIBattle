'use strict';
const R=require('../rules.js');
function runMatch(policies,opts={}){
  const m=R.createMatch({id:opts.id||'sim',players:[{name:'p0'},{name:'p1'}],seed:1});
  R.command(m,0,{type:'start'});
  const maxT=opts.maxT||600;
  const log=opts.log?[]:null;
  let errs=[[],[]];
  while(m.status==='playing'&&m.now<maxT){
    const snaps=[R.snapshot(m,0),R.snapshot(m,1)];
    const cmds=[];
    for(let p=0;p<2;p++){
      let c;
      try{ c=policies[p](snaps[p]) || []; }catch(e){ c=[]; errs[p].push('policy:'+e.message); }
      cmds.push(c.slice(0,10));
    }
    if(opts.order==='rev'){for(let p=1;p>=0;p--)for(const c of cmds[p]){try{R.command(m,p,c);}catch(e){errs[p].push(e.message);}}}
    else for(let p=0;p<2;p++)for(const c of cmds[p]){try{R.command(m,p,c);}catch(e){errs[p].push(e.message);}}
    if(log)log.push({t:m.now,units:m.units.map(u=>({id:u.id,o:u.owner,ty:u.type,x:u.x,y:u.y,hp:u.hp})),bases:m.bases.map(b=>b.hp),cr:m.players.map(p=>p.credits)});
    for(let k=0;k<20;k++)R.step(m);
  }
  const sc=m.players.map(p=>R.score(m,p));
  return {winner:m.winner,reason:m.reason,duration:m.now,scores:sc,level:m.players.map(p=>p.level),errs:[...new Set(errs[0])].slice(0,5),errs1:[...new Set(errs[1])].slice(0,5),log,m};
}
module.exports={runMatch,R};
