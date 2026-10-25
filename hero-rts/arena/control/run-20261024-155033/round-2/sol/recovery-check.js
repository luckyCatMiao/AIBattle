'use strict';
const sim=require('./simulation'),agent=require('./agent'),fs=require('fs'),crypto=require('crypto');
const results=[];
for(const seat of [0,1]){
 const g=sim.createMatch({players:[{kind:'api',hero:'druid'},{kind:'api',hero:'druid'}]});sim.command(g,0,{type:'start'});
 const p=g.players[seat];p.gold=250;p.heroes.push({type:'frost',level:6,xp:0,dead:true,queued:false,respawnAt:0,unitId:null});
 const a=agent.makeAgent();let revivedAt=null,errors=[],beforeRevive=[];
 for(let n=0;n<160;n++){
  const commands=a(JSON.parse(JSON.stringify(sim.snapshot(g,seat)))).commands;
  if(revivedAt===null)beforeRevive.push({t:g.now,gold:p.gold,spending:commands.filter(c=>['train','build','research','summon','revive'].includes(c.type))});
  for(const c of commands){try{sim.command(g,seat,c);if(c.type==='revive'&&c.hero==='frost')revivedAt=g.now;}catch(e){errors.push(e.message);}}
  for(let k=0;k<5;k++)sim.step(g);
 }
 const alive=g.units.find(u=>u.owner===seat&&u.type==='frost');
 if(revivedAt===null||!alive||errors.length)throw Error('recovery regression');
 results.push({seat,revivedAt,aliveLevel:alive.level,errors,firstDecision:beforeRevive[0],spendingBeforeRevive:beforeRevive.flatMap(v=>v.spending.filter(c=>c.type!=='revive'))});
}
console.log(JSON.stringify({candidateHash:crypto.createHash('sha256').update(fs.readFileSync('agent.js')).digest('hex'),description:'人为构造250金、六级霜语先知待复活的资源储备回归场景，非正式对局',results},null,2));
