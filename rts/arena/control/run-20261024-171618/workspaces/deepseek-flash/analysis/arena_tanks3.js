const R=require('../rules.js');const T=R.TYPES;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function ai(opts){
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const cmds=[];
    const myC=my.length?{x:my.reduce((s,u)=>s+u.x,0)/my.length,y:my.reduce((s,u)=>s+u.y,0)/my.length}:{x:640,y:420};
    for(const u of my){
      if(u.type!=='tank')continue;
      const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      let tgt;
      if(opts.focus==='lowhp'){
        const inr=fs.filter(v=>dist(u,v)<=T.tank.range+v.r+12);
        tgt=(inr.length?inr:fs).sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0];
      } else tgt=fs[0];
      if(!tgt)continue;
      const d=dist(u,tgt);
      const myHit=d<=T.tank.range+tgt.r; // I can hit target
      const canBeHit=d<=T.tank.range+u.r; // target can hit me (same range)
      const willFire=u.fireAt-t<=1.0;
      const engageD=T.tank.range+tgt.r+opts.engage;
      if(d<=engageD){
        if(willFire){
          if(myHit)cmds.push({type:'attack',units:[u.id],target:tgt.id});
          else cmds.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});
        } else if(opts.kiteWhen==='always'||(opts.kiteWhen==='threat'&&canBeHit)){
          const dx=(u.x-tgt.x)/d,dy=(u.y-tgt.y)/d;
          cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+dx*opts.kiteLen)),y:Math.max(15,Math.min(825,u.y+dy*opts.kiteLen))});
        } else {
          cmds.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});
        }
      } else if(willFire&&myHit)cmds.push({type:'attack',units:[u.id],target:tgt.id});
      else cmds.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});
    }
    return cmds.slice(0,10);
  };
}
function run(cfgA,cfgB,n,dist0){
  const m=R.createMatch({id:'a',players:[{name:'A'},{name:'B'}],seed:1});
  R.command(m,0,{type:'start'});m.units.length=0;m.mines.length=0;
  for(let i=0;i<n;i++){const u=R.spawn(m,0,'tank',440-((i%2)*34),400+Math.floor(i/2)*34);u.order={type:'hold'};}
  for(let i=0;i<n;i++){const u=R.spawn(m,1,'tank',440+dist0+((i%2)*34),400+Math.floor(i/2)*34);u.order={type:'hold'};}
  const pa=ai(cfgA),pb=ai(cfgB);
  while(m.status==='playing'&&m.now<200){
    const A=pa(R.snapshot(m,0))||[],B=pb(R.snapshot(m,1))||[];
    for(const c of A.slice(0,10))try{R.command(m,0,c);}catch(e){}
    for(const c of B.slice(0,10))try{R.command(m,1,c);}catch(e){}
    for(let k=0;k<20;k++)R.step(m);
    if(!m.units.some(u=>u.owner===0)||!m.units.some(u=>u.owner===1))break;
  }
  return {a:m.units.filter(u=>u.owner===0).length,b:m.units.filter(u=>u.owner===1).length,t:m.now};
}
const base={focus:'nearest',engage:12,kiteLen:50,kiteWhen:'always'};
const V={
  base:{focus:'nearest',engage:12,kiteLen:50,kiteWhen:'always'},
  lowhp:{focus:'lowhp',engage:12,kiteLen:50,kiteWhen:'always'},
  lowhp_threat:{focus:'lowhp',engage:12,kiteLen:50,kiteWhen:'threat'},
  lowhp_threat55:{focus:'lowhp',engage:12,kiteLen:55,kiteWhen:'threat'},
  lowhp_threat40:{focus:'lowhp',engage:12,kiteLen:40,kiteWhen:'threat'},
  lowhp_e0:{focus:'lowhp',engage:0,kiteLen:50,kiteWhen:'always'},
  lowhp_e24:{focus:'lowhp',engage:24,kiteLen:50,kiteWhen:'always'},
};
for(const [name,cfg] of Object.entries(V)){
  let w=0,l=0,res=[];
  for(const n of [1,2,3,4,5,6,7,8])for(const d of [300,380,460]){
    const r=run(cfg,base,n,d);
    if(r.a>0&&r.b===0)w++;else if(r.b>0&&r.a===0)l++;
    res.push(`${n}@${d}:${r.a}-${r.b}`);
  }
  console.log(name.padEnd(16),'W',w,'L',l,'|',res.join(' '));
}
