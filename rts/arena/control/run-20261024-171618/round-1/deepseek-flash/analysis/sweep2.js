'use strict';
const {opps,evalCfg}=require('./combo.js');
const base=JSON.parse(process.argv[2]);
const variants=JSON.parse(process.argv[3]);
const list=opps();
for(const [name,delta] of Object.entries(variants)){
  const cfg=Object.assign({},base,delta);
  const e=evalCfg(cfg,list);
  const eng=e.byTag.eng, sol=e.byTag.sol2;
  console.log(name.padEnd(18),(100*e.rate).toFixed(1)+'%','eng',eng.w+'/'+eng.g,'sol2',sol.w+'/'+sol.g,'seats',e.seatW+'/'+e.seatG,'ms',e.byTag.mixedSpread.w);
}
