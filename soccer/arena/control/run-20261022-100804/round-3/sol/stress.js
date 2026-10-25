'use strict';
const fs=require('fs'),{run}=require('./test');
const results=[];
for(const seed of [101,202,98765])for(let n=1;n<=6;n++)for(let t=0;t<2;t++){
 const r=run(n,t,seed%2?'corners':'rush',seed);results.push(r);console.log(JSON.stringify(r));
}
fs.writeFileSync('/workspace/stress_results.json',JSON.stringify(results,null,2));
