const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent3.js');
const SOLV={
 base:{}, fw05:{fireWindow:0.5}, engage210:{engage:210}, kite40:{kiteLen:40},
 engage210_fw05:{engage:210,fireWindow:0.5}, focuslow:{focus:'lowhp'},
 rebuild:{rebuildWorkers:true,repair:true},
};
const MY={
 default:{},
 eng200:{engageTank:200},
 eng210:{engageTank:210},
 fw05:{fireWindow:0.5},
 eng210_fw05:{engageTank:210,fireWindow:0.5},
 kite40:{kiteLen:40},
 kite60:{kiteLen:60},
 nearest:{focus:'nearest'},
 eng210_focuslow:{engageTank:210},
 lowhp_eng200:{engageTank:200},
 opening2:{opening:'2n2n'},
 def300:{defR:300},
};
let W=0,G=0;
for(const [mn,mc] of Object.entries(MY)){
 let line=mn.padEnd(14), w=0,g=0;
 for(const [sn,sc] of Object.entries(SOLV)){
  for(const swap of [0,1]){
   const A=makeAgent(mc),B=makeSol(sc);
   const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
   const as=swap?1:0; const win=r.winner===as; if(win)w++; g++; if(!win)line+=' ['+sn+':s'+as+']';
  }
 }
 W+=w;G+=g;
 console.log(line,'=>',w+'/'+g);
}
console.log('TOTAL',W+'/'+G,(100*W/G).toFixed(1)+'%');
