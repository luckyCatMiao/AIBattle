// Offline adapter: public simulation exports names removed with its practice bot.
// Supply inert declarations in memory so the unmodified rule engine can be loaded.
const fs=require('fs'), Module=require('module');
const src=fs.readFileSync(__dirname+'/simulation.js','utf8');
const m=new Module(__dirname+'/simulation.js',module);m.filename=__dirname+'/simulation.js';m.paths=module.paths;
m._compile(src.replace('module.exports = {', 'const bot=null,dangerMap=null,blastDanger=null,floodDanger=null,escapeAfterBomb=null,bestMove=null;\nmodule.exports = {'),m.filename);
const sim=m.exports;let g;
const rl=require('readline').createInterface({input:process.stdin});
rl.on('line',l=>{try{
const q=JSON.parse(l);
if(q.op==='new')g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:q.seed||1});
if(q.op==='set'){
  for(const [k,v] of Object.entries(q.state||{}))g[k]=v;
}
if(q.op==='advance')sim.advanceWindow(g,q.inputs.map((a,i)=>sim.submitWindow(g,i,a)));
if(q.op==='step'){
  for(let i=0;i<2;i++){let f=g.fighters[i];f.inputHistory.push(q.inputs[i]);if(f.inputHistory.length>8)f.inputHistory.shift();f.held=q.inputs[i];}
  sim.step(g);
}
let s=sim.snapshot(g,0);if(q.raw)s.raw=g;
console.log(JSON.stringify(s));
}catch(e){console.log(JSON.stringify({error:e.stack}));}});
