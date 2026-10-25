const {runMatch}=require('./harness.js');
const {makeBot5}=require('./bot5.js');
const {makeSol}=require('./solbot.js');
const cfgs=JSON.parse(process.argv[2]||'[{}]');
const variants={
  base:{},
  nokite:{kiteLen:0},
  aggro:{pushMul:0.6,pushTime:20},
  passive:{pushMul:1.3,pushTime:90},
  engage220:{engageR:225},
  fastup:{upReserve1:0,upReserve2:0},
  queue1:{maxQueue:1},
  early:{pushTime:15,pushMul:0.9},
};
for(const cfg of cfgs){
  let W=0,G=0;
  const rows=[];
  for(const [vn,sv] of Object.entries(variants)){
    let w=0,g=0,det=[];
    for(const swap of [0,1]){
      const A=makeBot5(cfg),B=makeSol(sv);
      const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
      const as=swap?1:0; g++;
      const win=r.winner===as; if(win)w++;
      det.push((as===0?'W':'E')+(win?'+':'-')+'t'+r.duration.toFixed(0));
    }
    rows.push(vn+':'+w+'/'+g+'['+det.join(',')+']');
    W+=w;G+=g;
  }
  console.log(JSON.stringify(cfg).slice(0,60).padEnd(62),'TOTAL',W+'/'+G);
  for(const r of rows)console.log('   ',r);
}
