'use strict';
/* 快速对局：node dev/q.js <botA> <botB> [n] [seed] */
const path=require('path');
const {playGame}=require('./arena.js');
function load(p){
  const m=require(path.resolve(p));
  if(typeof m==='function') return m();
  if(typeof m.decide==='function') return m;
  if(m.default) return m.default();
  throw new Error('bad bot '+p);
}
const A=load(process.argv[2]||'./dev/bots/mine.js');
const B=load(process.argv[3]||'./dev/bots/mine.js');
const n=parseInt(process.argv[4]||'2',10), seed=parseInt(process.argv[5]||'1',10);
for(let i=0;i<n;i++){
  const r=playGame(A,B,seed+i,['A','B']);
  const r2=playGame(B,A,seed+100+i,['B','A']);
  console.log(JSON.stringify({seed:seed+i,asA:r.score,asB:[r2.score[1],r2.score[0]],hits:r.stats.hits,smashes:r.stats.smashes,kinds:r.stats.kinds,frames:r.frames,reason:r.reason}));
}
