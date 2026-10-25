'use strict';
const fs=require('fs'), path=require('path');
const {playGame}=require('./arena.js');
const src=fs.readFileSync(path.join(__dirname,'..','brain.js'),'utf8');
function mk(name,T,off){
  let s=src.replace("require('./engine.js')","require('../../engine.js')")
           .replace("require('./core.js')","require('../../core.js')")
           .replace("require('./catalog.js')","require('../../catalog.js')")
           .replace(/const READY_OFF = [\d.]+;/,`const READY_OFF = ${off};`)
           .replace(/if \(ph\.frameRel > \d+\) return null;/,`if (ph.frameRel > ${T}) return null;`);
  const f=path.join(__dirname,'variants',name+'.js');
  fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,s);
  delete require.cache[require.resolve(f)]; return require(f);
}
const cfgs=[['A',8,3.15],['B',22,4.0],['C',16,2.8],['D',20,3.6]];
const bots={};
for(const [n,T,o] of cfgs){ const v=mk('rr_'+n,T,o); bots[n]={decide:ob=>v.decide(ob).frames}; }
const names=cfgs.map(c=>c[0]);
const table={};
for(const a of names){ table[a]={}; for(const b of names){
  if(a===b) continue;
  const r1=playGame(bots[a],bots[b],1,[a,b]);
  const r2=playGame(bots[b],bots[a],1,[b,a]);
  table[a][b]=[r1.score.join(':'),r2.score.slice().reverse().join(':')];
}}
for(const a of names){
  console.log(a, names.filter(b=>b!==a).map(b=>`vs${b}[${table[a][b].join('|')}]`).join(' '));
}
