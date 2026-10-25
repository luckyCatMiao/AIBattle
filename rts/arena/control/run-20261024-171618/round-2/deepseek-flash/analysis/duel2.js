const {runMatch}=require('./harness.js');
const {makeBot}=require('./bot.js');
const {makeSol}=require('./solbot.js');
const cfgs=JSON.parse(process.argv[2]||'[{}]');
for(const cfg of cfgs){
  const out=[];
  for(const swap of [0,1]){
    const bot=makeBot(cfg), sol=makeSol(cfg.solCfg);
    const pols=swap?[sol,bot]:[bot,sol];
    const r=runMatch(pols,{maxT:600});
    const bs=swap?1:0, ss=swap?0:1;
    out.push({seat:bs===0?'W':'E',win:r.winner===bs?'WIN':(r.winner===ss?'LOSS':'DRAW'),dur:+r.duration.toFixed(1),bs:r.scores[bs],ss:r.scores[ss],lv:r.level[bs],errs:r.errs});
  }
  console.log(JSON.stringify(cfg), '=>', out.map(o=>`${o.seat}:${o.win} t${o.dur} ${o.bs}-${o.ss} lv${o.lv}${o.errs.length?' ERR'+o.errs:''}`).join(' | '));
}
