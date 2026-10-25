'use strict';
/* 检查：是否存在“自己发球后自己第一拍触球”或连续同队触球。 */
const sim=require('../engine.js');
const {play}=require('./analyze.js');
function load(p){const m=require(require('path').resolve(p));const b=typeof m==='function'?m():m;return o=>{const r=b.decide(o);return Array.isArray(r)?r:(r&&r.frames)?r.frames:r.inputs;};}
const me=load('./dev/variants/s6_autoB.js');
const opps={brain:load('./dev/variants/s5_none.js'),simple:load('./dev/bots/simple.js'),mirror:me};
for(const [name,opp] of Object.entries(opps)){
  for(const seat of [0,1]){
    // 用 analyze 的内部逻辑重放，拿不到 events；这里直接跑引擎
    const g=sim.createMatch({id:'x',seed:1,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
    const dec=seat===0?[me,opp]:[opp,me];
    let self=0, chain=0;
    while(g.status==='playing'){
      const wins=[];
      for(let t=0;t<2;t++){const o=sim.view(g,t);o.yourPlayer=t;wins.push(dec[t](o));}
      const before=g.events.length;
      sim.advanceWindow(g,[sim.submitWindow(g,0,wins[0]),sim.submitWindow(g,1,wins[1])]);
      const evs=g.events.slice(before);
      let last=null;
      for(const e of evs){
        if(e.type==='serve') last={t:e.team,kind:'serve'};
        else if(e.type==='hit'){
          if(last&&last.t===e.team) { chain++; if(last.kind==='serve') self++; }
          last={t:e.team,kind:e.type};
        } else if(e.type==='point'||e.type==='net') last=null;
      }
    }
    console.log(name,'seat',seat,'score',g.score.join(':'),'selfServeHits',self,'sameTeamChains',chain);
  }
}
