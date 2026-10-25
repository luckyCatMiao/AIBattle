'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
function fam(){const v=[];
 for(const rf of [0,0.15])for(const fr of [260,340,430])for(const adv of ['north','south'])for(const rb of [false,true]){
   v.push({retreatFrac:rf,focusRange:fr,advanceMode:adv,rebuildWorkers:rb,pushAfter:90,kiteFrac:0});
 }
 return v;}
const myCfg=JSON.parse(process.argv[2]);
const list=fam();let w=0,g=0;const sw=[0,0];
for(const oc of list)for(const seat of [0,1]){
 const me=makeEngine(myCfg),opp=makeSol2(oc);
 const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
 g++;if(r.winner===seat){w++;sw[seat]++;}
}
console.log((100*w/g).toFixed(1)+'%',w+'/'+g,'seats',sw);
