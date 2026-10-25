const {runMatch}=require('./harness.js');
const {makeRaiderBot}=require('./raiderbot.js');
const {makeSol}=require('./solbot.js');
const cfgs=JSON.parse(process.argv[2]||'[{}]');
const solCfg=JSON.parse(process.argv[3]||'{}');
for(const cfg of cfgs){
  const out=[];
  for(const swap of [0,1]){
    const bot=makeRaiderBot(cfg), sol=makeSol(solCfg);
    const pols=swap?[sol,bot]:[bot,sol];
    const r=runMatch(pols,{maxT:600});
    const bs=swap?1:0, ss=swap?0:1;
    const win=r.winner===bs?'WIN':(r.winner===ss?'LOSS':'DRAW');
    out.push(`${bs===0?'W':'E'}:${win} t${r.duration.toFixed(0)} ${r.scores[bs]}-${r.scores[ss]} lv${r.level[bs]}/${r.level[ss]}`);
  }
  console.log(JSON.stringify(cfg).padEnd(80), out.join(' | '));
}
