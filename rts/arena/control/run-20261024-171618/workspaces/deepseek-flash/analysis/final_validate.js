const {runMatch}=require('./harness.js');
const {makeBot5}=require('./bot5.js');
const {makeSol}=require('./solbot.js');
const V={
  'base(校准模型)':{},
  'rebuild-workers':{rebuildWorkers:true},
  'rebuild+repair':{rebuildWorkers:true,repair:true},
  'rebuild+fastup':{rebuildWorkers:true,repair:true,upReserve1:0,upReserve2:0},
  'no-kite':{kiteLen:0},
  'kite80':{kiteLen:80},
  'queue1':{maxQueue:1},
  'queue3':{maxQueue:3},
  'engage210':{engageR:210},
  'engage224':{engageR:224},
  'aggro-push':{pushMul:0.7,pushTime:25},
  'passive-push':{pushMul:1.4,pushTime:100},
  'fast-upgrade':{upReserve1:0,upReserve2:0},
};
const cfg=JSON.parse(process.argv[2]||'{"posture":"home","anchorR":260,"anchorD":0,"workerSafe":false}');
let W=0,G=0;
for(const [vn,sv] of Object.entries(V)){
  const det=[];
  for(const swap of [0,1]){
    const A=makeBot5(cfg),B=makeSol(sv);
    const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
    const as=swap?1:0;const win=r.winner===as;if(win)W++;G++;
    det.push((as===0?'W':'E')+(win?'WIN':'LOSS')+' t'+r.duration.toFixed(0)+' '+r.scores[as]+':'+r.scores[1-as]);
  }
  console.log(vn.padEnd(18),det.join('  |  '));
}
console.log('TOTAL',W+'/'+G,'=',(W/G*100).toFixed(0)+'%');
