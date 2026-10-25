const {evalCfg}=require('./suite.js');
const base=JSON.parse(process.argv[2]||'{}');
const list=JSON.parse(process.argv[3]||'[]');
const out=[];
for(const o of list){
  const cfg=Object.assign({},base,o);
  const r=evalCfg(cfg,false);
  out.push({cfg,w:r.wins,g:r.games,det:r.det});
}
out.sort((a,b)=>b.w-a.w);
for(const o of out) console.log(o.w+'/'+o.g,JSON.stringify(o.cfg).slice(0,120),o.w<o.g?'| '+o.det.join(' '):'');
