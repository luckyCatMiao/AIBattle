const {runMatch}=require('./harness.js');
const {makeBot5}=require('./bot5.js');
const {makeSol}=require('./solbot.js');
const variants={base:{},engage210:{engageR:210},aggro:{pushMul:0.7,pushTime:25},pass:{pushMul:1.4,pushTime:100},fastUp:{upReserve1:0,upReserve2:0},q1:{maxQueue:1},kite80:{kiteLen:80},engage224:{engageR:224},q3:{maxQueue:3}};
let rnd=987654321;
const R=()=>{rnd=(rnd*1103515245+12345)%2147483648;return rnd/2147483648;};
const pick=a=>a[Math.floor(R()*a.length)];
const N=+process.argv[2]||60;
const base={posture:'home',anchorD:0,anchorR:260,leashR:0,workerSafe:false,retreatAt:1.9};
const out=[];
for(let i=0;i<N;i++){
  const cfg={...base};
  cfg.anchorR=pick([200,240,260,300,360]);
  cfg.anchorD=pick([0,20,40,80,120]);
  cfg.posture=pick(['home','home','nodes']);
  cfg.retreatAt=pick([1.5,1.9,2.5,99]);
  cfg.armyR=pick([500,560,650]);
  cfg.engageR=pick([180,188,200]);
  cfg.focusR=pick([188,218,250]);
  cfg.kiteMode=pick(['alt','alt','low']);
  cfg.kiteLen=pick([45,55,65]);
  cfg.form=pick([0,0,40,60]);
  cfg.spread=pick([0,0,0.3]);
  cfg.upRes1=pick([0,0,40]);
  cfg.upRes2=pick([0,0,60]);
  cfg.pushMul=pick([0.8,1.0,1.2]);
  cfg.pushTime=pick([40,60,90]);
  cfg.captureN=pick([1,1,2]);
  cfg.captureSafe=pick([150,170,200]);
  cfg.workers=pick([4,4,5]);
  let W=0,rows=[];
  for(const [vn,sv] of Object.entries(variants)){
    let w=0;
    for(const swap of [0,1]){
      const A=makeBot5(cfg),B=makeSol(sv);
      const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
      const as=swap?1:0; if(r.winner===as)w++;
    }
    W+=w;rows.push(vn+':'+w);
  }
  out.push({cfg,W,rows});
}
out.sort((a,b)=>b.W-a.W);
for(const o of out.slice(0,10))console.log(o.W+'/18',JSON.stringify(o.cfg));
console.log('--- best base-variant detail');
for(const o of out.slice(0,5))console.log(o.W+'/18',o.rows.join(' '));
