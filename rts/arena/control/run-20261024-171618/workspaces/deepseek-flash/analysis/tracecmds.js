const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent3.js');
const R=require('../rules.js');
const mine=JSON.parse(process.argv[2]||'{}');
const solc=JSON.parse(process.argv[3]||'{}');
const swap=+(process.argv[4]||0);
const t0=+(process.argv[5]||0), t1=+(process.argv[6]||30);
// instrument by wrapping policies: rebuild harness manually to capture commands
const m=R.createMatch({id:'x',players:[{name:'a'},{name:'b'}],seed:1});
R.command(m,0,{type:'start'});
const A=makeAgent(mine),B=makeSol(solc);
const as=swap?1:0;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
while(m.status==='playing'&&m.now<600){
  const snaps=[R.snapshot(m,0),R.snapshot(m,1)];
  const cmds=[null,null];
  cmds[as]=A(snaps[as])||[];
  cmds[1-as]=B(snaps[1-as])||[];
  if(m.now>=t0-0.01&&m.now<=t1+0.01){
    const units=m.units.filter(u=>u.type==='tank');
    const f=u=>`${u.id}${u.owner===as?'A':'B'}(${Math.round(u.x)},${Math.round(u.y)} ${Math.round(u.hp)}${u.fireAt>m.now?'*':''})`;
    const c=x=>{let s=x.type;if(x.target)s+='->'+x.target;if(x.x!==undefined)s+='@'+Math.round(x.x)+','+Math.round(x.y);if(x.units)s+='['+x.units.join(',')+']';return s;};
    console.log('t='+m.now.toFixed(0),'U:',units.map(f).join(' '));
    console.log('  A:',(cmds[as]||[]).map(c).join(' | '));
    console.log('  B:',(cmds[1-as]||[]).map(c).join(' | '));
  }
  for(let p=0;p<2;p++)for(const c of cmds[p]||[])try{R.command(m,p,c);}catch(e){}
  for(let k=0;k<20;k++)R.step(m);
}
