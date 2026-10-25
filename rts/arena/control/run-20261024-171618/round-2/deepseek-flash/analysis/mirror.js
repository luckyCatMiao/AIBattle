const {runMatch}=require('./harness.js');
const {makeBot}=require('./bot.js');
const {makeSol}=require('./solbot.js');
const cases=[
  ['sol-vs-sol',()=>makeSol(),()=>makeSol()],
  ['botA-vs-sol',()=>makeBot({build:['tank'],kiteHp:0.9,kiteAll:false,workers:4,upT:15}),()=>makeSol()],
  ['botB-vs-sol',()=>makeBot({build:['tank'],kiteHp:0.9,workers:4,upT:15,captureN:2}),()=>makeSol()],
];
for(const [name,mkA,mkB] of cases){
  const res=[];
  for(const swap of [0,1]){
    const A=mkA(),B=mkB();
    const pols=swap?[B,A]:[A,B];
    const r=runMatch(pols,{maxT:600});
    const as=swap?1:0, bs=swap?0:1;
    res.push(`${as===0?'W':'E'}:${r.winner===as?'WIN':(r.winner===bs?'LOSS':'DRAW')} t${r.duration.toFixed(0)} ${r.scores[as]}-${r.scores[bs]} lv${r.level[as]}/${r.level[bs]}`);
  }
  console.log(name.padEnd(14),res.join(' | '));
}
