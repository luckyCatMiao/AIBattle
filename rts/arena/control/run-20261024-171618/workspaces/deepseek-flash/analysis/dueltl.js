const {runMatch}=require('./harness.js');
const {makeBot}=require('./bot2.js');
const {makeSol}=require('./solbot.js');
const cfg=JSON.parse(process.argv[2]||'{}');
const swap=+(process.argv[3]||0);
const t0=+(process.argv[4]||0), t1=+(process.argv[5]||200);
const bot=makeBot(cfg), sol=makeSol(cfg.solCfg);
const pols=swap?[sol,bot]:[bot,sol];
const bs=swap?1:0, ss=swap?0:1;
const r=runMatch(pols,{maxT:600});
console.log('winner seat',r.winner,'dur',r.duration.toFixed(1),'scores',r.scores,'lv',r.level);
// reconstruct per-second snapshots by rerunning with logging of unit counts
// simpler: use r.m final state; we need timeline -> rerun manually
const R=require('../rules.js');
const m=R.createMatch({id:'sim',players:[{name:'a'},{name:'b'}],seed:1});
R.command(m,0,{type:'start'});
const {makeBot:MB}=require('./bot2.js');
const b2=makeBot(cfg), s2=makeSol(cfg.solCfg);
const P=swap?[s2,b2]:[b2,s2];
while(m.status==='playing'&&m.now<=(Math.min(t1,600))){
  const snaps=[R.snapshot(m,0),R.snapshot(m,1)];
  const cmds=[P[0](snaps[0])||[],P[1](snaps[1])||[]];
  for(let p=0;p<2;p++)for(const c of cmds[p]){try{R.command(m,p,c)}catch(e){}}
  const cnt=o=>{const c={};for(const u of m.units)if(u.owner===o)c[u.type]=(c[u.type]||0)+1;return Object.entries(c).map(e=>e[0]+':'+e[1]).join(' ')+' hp'+Math.round(m.units.filter(u=>u.owner===o).reduce((s,u)=>s+u.hp,0))};
  const nodes=m.nodes.map(n=>n.id+':'+(n.owner===null?'-':n.owner)+(n.progress>0?'('+Math.round(n.progress*100)+'%)':'')).join(' ');
  if(m.now>=t0)console.log('t'+m.now.toFixed(0)+' ME['+cnt(bs)+'] cr'+Math.floor(m.players[bs].credits)+' lv'+m.players[bs].level+' | SOL['+cnt(ss)+'] cr'+Math.floor(m.players[ss].credits)+' lv'+m.players[ss].level+' | base '+m.bases.map(b=>Math.round(b.hp)).join(',')+' | '+nodes);
  for(let k=0;k<20;k++)R.step(m);
}
