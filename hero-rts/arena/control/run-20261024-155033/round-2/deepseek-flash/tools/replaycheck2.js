'use strict';
const zlib=require('zlib'),fs=require('fs'),path=require('path');
const SIM=require(path.resolve(__dirname,'..','simulation.js'));
const {createMatch,command,step,snapshot}=SIM;
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])));
const h0=j.frames[0].units.find(u=>u.hero&&u.owner===0).type;
const h1=j.frames[0].units.find(u=>u.hero&&u.owner===1).type;
const g=createMatch({id:'x',seed:j.frames[0].seed,players:[{name:'A',kind:'api',hero:h0},{name:'B',kind:'api',hero:h1}]});
command(g,0,{type:'start'});
let badCount=0,firstBad=null;
for(let fi=0;fi<j.frames.length-1;fi++){
  const d=j.decisions.find(d=>d.tick===j.frames[fi].tick);
  if(d)for(let o=0;o<2;o++)for(const c of d.commands[o]||[])try{command(g,o,c);}catch(e){}
  for(let k=0;k<5;k++)step(g);
  const f=j.frames[fi+1];
  const su=new Map(g.units.map(u=>[u.id,u])),fu=new Map(f.units.map(u=>[u.id,u]));
  let bad=[];
  if(su.size!==fu.size)bad.push('count '+su.size+'/'+fu.size);
  for(const [id,u] of su){const v=fu.get(id);if(!v){bad.push('missing '+id);continue;}if(Math.abs(v.x-u.x)>0.01||Math.abs(v.y-u.y)>0.01||Math.abs(v.hp-u.hp)>0.01)bad.push(id+' pos/hp');}
  for(const [id,v] of fu){if(!su.has(id))bad.push('extra '+id);}
  if(bad.length){badCount++;if(!firstBad)firstBad={t:f.now,bad:bad.slice(0,8)};}
}
console.log('result',g.now.toFixed(2),g.winner,'replay',j.duration,j.winner,'bad frames',badCount,'first',JSON.stringify(firstBad));
