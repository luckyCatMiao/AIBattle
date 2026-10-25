'use strict';
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','brain.js'),'utf8');
function mk(name,extra){
  let s=src.replace("require('./engine.js')","require('../../engine.js')").replace("require('./core.js')","require('../../core.js')").replace("require('./catalog.js')","require('../../catalog.js')");
  if(extra) s=s.replace('let score = evalShot(tr, opp, dir);', 'let score = evalShot(tr, opp, dir);'+extra);
  const f=path.join(__dirname,'variants',name+'.js'); fs.writeFileSync(f,s); delete require.cache[require.resolve(f)]; return require(f);
}
const base=mk('base','');
const deep=mk('deep',' if (Math.abs(plan.strike.x - NET) < 1.2) score -= 12;');
const nojump=mk('nojump',' if (plan.strike.y > 2.3 && Math.abs(plan.strike.x-NET) < 1.6) score -= 8;');
const noAnt=mk('nA',null); // placeholder
const {playGame}=require('./arena.js');
const B=n=>({decide:o=>n.decide(o).frames});
console.log('base vs base  ', playGame(B(base),B(base),1,['A','B']).score.join(':'));
console.log('deep vs base  ', playGame(B(deep),B(base),1,['A','B']).score.join(':'));
console.log('base vs deep  ', playGame(B(base),B(deep),1,['A','B']).score.join(':'));
console.log('nojump vs base', playGame(B(nojump),B(base),1,['A','B']).score.join(':'));
console.log('base vs nojump', playGame(B(base),B(nojump),1,['A','B']).score.join(':'));
