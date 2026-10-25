const {runMatch}=require('./harness.js');
const {makeBot4}=require('./bot4.js');
const {makeBot3}=require('./bot3.js');
const {makeSol}=require('./solbot.js');
const N=+process.argv[2]||300;
const which=process.argv[3]||'bot4';
const solVariants=[{}, {kiteLen:0,engageR:188}, {pushMul:0.7,pushTime:25}, {capture:true,captureSafe:120}];
let rnd=12345;
const R=()=>{rnd=(rnd*1103515245+12345)%2147483648;return rnd/2147483648;};
const pick=a=>a[Math.floor(R()*a.length)];
const mkDefault=which==='bot4'?makeBot4:makeBot3;
function randCfg(){
  const c={};
  c.workers=pick([3,3,4,4,4,5]);
  c.kiteMode=pick(['alt','alt','always','low']);
  c.kiteLen=pick([0,30,50,50,70,90]);
  c.spread=pick([0,0,0,0.3,0.5,0.7]);
  c.form=pick([0,0,0,40,60,90]);
  if(which==='bot4'){
    c.target=pick(['per','per','group']);
    c.focusR=pick([188,218,260]);
    c.engageR=pick([174,188,220,260]);
    c.pushMul=pick([0.7,0.85,1.0,1.2,1.5]);
    c.pushTime=pick([25,40,60,90]);
    c.captureN=pick([0,0,1,2]);
    c.repair=pick([false,true]);
    c.upRes1=pick([0,0,56,120]);
    c.upRes2=pick([0,63,150]);
    c.chase=pick([true,false]);
    c.maxQueue=pick([1,2,2,3]);
  }else{
    c.capture=pick([true,false]);
    c.captureN=pick([0,1,2]);
    c.retreatMul=pick([0,0.55,0.8]);
    c.pushMul=pick([0.8,1.2,1.6,2.2]);
    c.pushTime=pick([30,60,90]);
    c.stance=pick(['balanced','balanced','turtle']);
    c.anchorD=pick([60,140,220]);
    c.anchorR=pick([200,400,600]);
    c.upT=pick([0,15,30]);
    c.reserve=pick([0,40,100]);
    c.opening=pick(['north3','north4','split']);
    c.engageR=pick([180,188,220]);
    c.armyR=pick([400,520,700]);
    c.focus=pick(['nearest','lowhp']);
  }
  return c;
}
const results=[];
for(let i=0;i<N;i++){
  const cfg=randCfg();
  let w=0,g=0,detail=[];
  for(const sv of solVariants){
    for(const swap of [0,1]){
      let inst;
      try{inst=mkDefault(cfg);}catch(e){continue;}
      const sol=makeSol(sv);
      const r=runMatch(swap?[sol,inst]:[inst,sol],{maxT:600});
      const as=swap?1:0;
      g++; if(r.winner===as)w++;
      detail.push((r.winner===as?'W':'L')+r.duration.toFixed(0));
    }
  }
  results.push({cfg,w,g,detail});
}
results.sort((a,b)=>b.w-a.w);
for(const r of results.slice(0,15))console.log(r.w+'/'+r.g, JSON.stringify(r.cfg));
console.log('--- distribution of wins');
const hist={};for(const r of results)hist[r.w]=(hist[r.w]||0)+1;
console.log(JSON.stringify(hist));
