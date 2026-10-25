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
const noAnt=(()=>{let s=src.replace("require('./engine.js')","require('../../engine.js')").replace("require('./core.js')","require('../../core.js')").replace("require('./catalog.js')","require('../../catalog.js')").replace('function anticipate(g, team, opts) {','function anticipate(g, team, opts) { if (true) return null;');const f=path.join(__dirname,'variants','noAntX.js');fs.writeFileSync(f,s);delete require.cache[require.resolve(f)];return require(f);})();
const simple=require('./bots/simple.js')();
const simpleU=require('./bots/simple.js')({prefer:'under'});
const idle={decide:()=>Array.from({length:10},()=>({move:0}))};
const nA={decide:o=>noAnt.decide(o).frames};
const opps=[['noAnt',nA],['simple',simple],['simpleU',simpleU],['idle',idle]];
for(const [T,off] of [[8,3.15],[14,3.15],[16,2.8],[22,3.15],[22,4.0],[20,3.6]]){
  const v=mk(`e_${T}_${off}`,T,off);
  const bot={decide:o=>v.decide(o).frames};
  let line=`T=${T} off=${off}: `, wins=0, tot=0;
  for(const [name,opp] of opps){
    const a=playGame(bot,opp,1,['x','y']), b=playGame(opp,bot,1,['x','y']);
    const w0=a.score[0]>a.score[1], w1=b.score[1]>b.score[0];
    wins+=(w0?1:0)+(w1?1:0); tot+=2;
    line+=`${name}[${a.score.join(':')}|${b.score.join(':')}]${w0&&w1?'✓':'✗'} `;
  }
  const self=playGame(bot,bot,1,['x','y']);
  line+=` self ${self.score.join(':')}`;
  console.log(line+`  ${wins}/${tot}`);
}
