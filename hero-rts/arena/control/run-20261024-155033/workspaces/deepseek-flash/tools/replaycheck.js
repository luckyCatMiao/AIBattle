'use strict';
const zlib=require('zlib'),fs=require('fs'),path=require('path');
const SIM=require(path.resolve(__dirname,'..','simulation.js'));
const {createMatch,command,step,snapshot}=SIM;
const file=process.argv[2];
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
// players order from replay: owner0 and owner1 hero
const h0=j.frames[0].units.find(u=>u.hero&&u.owner===0).type;
const h1=j.frames[0].units.find(u=>u.hero&&u.owner===1).type;
const g=createMatch({id:'x',seed:j.frames[0].seed,players:[{name:'A',kind:'api',hero:h0},{name:'B',kind:'api',hero:h1}]});
command(g,0,{type:'start'});
let decIdx=0,framesMatched=0,mismatch=0;
function cmp(gi,fi){
  const a=snapshot(g);
  const f=j.frames[fi];
  // compare unit count/hp and buildings hp
  const su=new Map(a.units.map(u=>[u.id,u.hp])), fu=new Map(f.units.map(u=>[u.id,u.hp]));
  let bad=[];
  for(const [id,hp] of su){ if(!fu.has(id)||Math.abs(fu.get(id)-hp)>0.5)bad.push('u'+id); }
  for(const [id,hp] of fu){ if(!su.has(id))bad.push('-u'+id); }
  const sb=a.buildings.map(b=>b.id+':'+b.hp.toFixed(0)), fb=f.buildings.map(b=>b.id+':'+b.hp.toFixed(0));
  const bsame=JSON.stringify(sb)===JSON.stringify(fb);
  return {same:!bad.length&&bsame, bad:bad.slice(0,6), sb:sb.filter(x=>!fb.includes(x)).slice(0,6), fb:fb.filter(x=>!sb.includes(x)).slice(0,6), su:su.size,fu:fu.size};
}
let firstBad=null;
for(let fi=0;fi<j.frames.length;fi++){
  const f=j.frames[fi];
  // apply decisions at this tick
  const d=j.decisions.find(d=>d.tick===f.tick);
  if(d){ for(let o=0;o<2;o++){ for(const c of d.commands[o]||[]){ try{command(g,o,c);}catch(e){ /* record */ if(o===0&&fi<10)console.error('cmd err',o,c.type,e.message);} } } }
  // step 5 frames
  for(let k=0;k<5;k++)step(g);
  const r=(fi+1<j.frames.length)?cmp(g,fi+1):{same:g.status!=="playing"||true};
  if(!r.same){mismatch++;if(!firstBad)firstBad={fi,t:f.now,r};}
  else framesMatched++;
}
console.log('final local',g.now,g.winner,'replay',j.duration,j.winner,'frames matched',framesMatched,'/',j.frames.length,'mismatch',mismatch);
if(firstBad)console.log('first mismatch',JSON.stringify(firstBad));
