global.bot=null;const s=require('./simulation'),a=require('./agent');let g=s.createMatch({players:[{name:'a',kind:'api',team:['kestrel','aegis','vex']},{name:'b',kind:'api',team:['vex','torv','sable']}]}),prev=null,stats={},errors=[];
for(let w=0;w<400&&g.status==='playing';w++){
 let h=a.hydrate(s.snapshot(g,0),prev);
 for(let i=0;i<2;i++){let f=g.fighters[i],e=h.fighters[i];let keys=['hitstop'];
  if(f.state==='hitstun'&&!f.airborne)keys.push('hitstunLeft');if(f.state==='blockstun')keys.push('blockstunLeft');
  for(let k of keys){let x=k==='hitstop'?g[k]:f[k],y=k==='hitstop'?h[k]:e[k];stats[k]??={n:0,err:0,max:0};let z=stats[k];z.n++;z.err+=Math.abs(x-y);z.max=Math.max(z.max,Math.abs(x-y));if(Math.abs(x-y)>5)errors.push({w,i,k,x,y});}
 }
 let cs=[a.controller(w%4===0?'heavy':'balanced'),a.controller(w%3===0?'rush':'balanced')],win=[[],[]];for(let j=0;j<15;j++){let ins=cs.map((c,i)=>a.control(g,i,c));for(let i=0;i<2;i++)win[i].push(ins[i]);s.stepFrame(g,ins);}prev=h;h.fighters[0].inputHistory.push(...win[0]);
}
console.log(JSON.stringify({stats,errors:errors.slice(0,30)},null,2));
