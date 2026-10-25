const {runMatch}=require('./harness.js');
const BOT=process.argv[3]||'bot3';
const {makeBot3}=require('./'+BOT+'.js');
const {makeSol}=require('./solbot.js');
const cfgs=JSON.parse(process.argv[2]||'[{}]');
const solCfg=JSON.parse(process.argv[4]||'{}');
for(const cfg of cfgs){
  const out=[];let wins=0,games=0;
  for(const swap of [0,1]){
    const bot=makeBot3(cfg), sol=makeSol(solCfg);
    const pols=swap?[sol,bot]:[bot,sol];
    const r=runMatch(pols,{maxT:600});
    const bs=swap?1:0, ss=swap?0:1;
    const win=r.winner===bs?'WIN':(r.winner===ss?'LOSS':'DRAW');
    if(r.winner===bs)wins++;games++;
    out.push(`${bs===0?'W':'E'}:${win} t${r.duration.toFixed(0)} ${r.scores[bs]}-${r.scores[ss]} lv${r.level[bs]}/${r.level[ss]}`);
  }
  console.log(JSON.stringify(cfg).slice(0,88).padEnd(90), out.join(' | '));
}
