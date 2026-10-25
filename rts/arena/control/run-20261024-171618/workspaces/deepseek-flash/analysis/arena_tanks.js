'use strict';
const R=require('../rules.js');
const T=R.TYPES;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const FIREWINDOW=1.0;
function tankAI(opts){
  // opts: kite(bool), kiteLen, focus('nearest'|'lowhp'|'centroid'), engage(e.g. 12 extra), retreatHp(0=off), spread
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const cmds=[];
    const myC=my.length?{x:my.reduce((s,u)=>s+u.x,0)/my.length,y:my.reduce((s,u)=>s+u.y,0)/my.length}:{x:640,y:420};
    for(const u of my){
      if(u.type!=='tank')continue;
      if(opts.retreatHp&&u.hp/u.maxHp<opts.retreatHp){
        // retreat toward own start (use x<640 ? 200:1080)
        const hx=u.x<640?200:1080;
        cmds.push({type:'move',units:[u.id],x:hx,y:420}); continue;
      }
      const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      // choose target
      let tgt=null;
      if(opts.focus==='lowhp'){
        const inr=fs.filter(v=>dist(u,v)<=T.tank.range+v.r+opts.engage);
        tgt=(inr.length?inr:fs).sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0];
      } else if(opts.focus==='centroid'){
        tgt=fs.slice().sort((a,b)=>dist(myC,a)-dist(myC,b))[0];
      } else tgt=fs[0];
      if(!tgt)continue;
      const d=dist(u,tgt);
      const inEngage=d<=T.tank.range+tgt.r+opts.engage;
      if(inEngage){
        const willFire=u.fireAt-t<=FIREWINDOW;
        if(willFire||!opts.kite){
          if(d<=T.tank.range+tgt.r) cmds.push({type:'attack',units:[u.id],target:tgt.id});
          else cmds.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});
        } else {
          const dx=(u.x-tgt.x)/d,dy=(u.y-tgt.y)/d;
          let px=dx,py=dy;
          if(opts.spread){const s=(u.id.charCodeAt(1)%2?1:-1);px=dx*0.5-dy*0.866*s;py=dy*0.5+dx*0.866*s;const l=Math.hypot(px,py)||1;px/=l;py/=l;}
          cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+px*opts.kiteLen)),y:Math.max(15,Math.min(825,u.y+py*opts.kiteLen))});
        }
      } else cmds.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});
    }
    return cmds.slice(0,10);
  };
}
function run(cfgA,nA,cfgB,nB,sep=380,seedShift=0){
  const m=R.createMatch({id:'arena',players:[{name:'A'},{name:'B'}],seed:1});
  R.command(m,0,{type:'start'});
  m.units.length=0; m.mines.length=0;
  const y=420+seedShift;
  for(let i=0;i<nA;i++){const u=R.spawn(m,0,'tank',440-((i%3)*36),y+Math.floor(i/3)*36-40);u.order={type:'hold'};}
  for(let i=0;i<nB;i++){const u=R.spawn(m,1,'tank',440+sep+((i%3)*36),y+Math.floor(i/3)*36-40);u.order={type:'hold'};}
  const pa=tankAI(cfgA),pb=tankAI(cfgB);
  while(m.status==='playing'&&m.now<200){
    const A=pa(R.snapshot(m,0))||[],B=pb(R.snapshot(m,1))||[];
    for(const c of A.slice(0,10))try{R.command(m,0,c);}catch(e){}
    for(const c of B.slice(0,10))try{R.command(m,1,c);}catch(e){}
    for(let k=0;k<20;k++)R.step(m);
    if(!m.units.some(u=>u.owner===0)||!m.units.some(u=>u.owner===1))break;
  }
  return {a:m.units.filter(u=>u.owner===0).length,b:m.units.filter(u=>u.owner===1).length,t:m.now};
}
module.exports={run,tankAI};
if(require.main===module){
  const base={kite:true,kiteLen:50,focus:'nearest',engage:12,retreatHp:0,spread:false};
  const variants={
    nearest:base,
    lowhp:Object.assign({},base,{focus:'lowhp'}),
    centroid:Object.assign({},base,{focus:'centroid'}),
    nokite:Object.assign({},base,{kite:false}),
    kite70:Object.assign({},base,{kiteLen:70}),
    kite30:Object.assign({},base,{kiteLen:30}),
    lowhpRetreat:Object.assign({},base,{focus:'lowhp',retreatHp:0.25}),
    spread:Object.assign({},base,{spread:true}),
    engage40:Object.assign({},base,{engage:40}),
  };
  for(const [name,cfg] of Object.entries(variants)){
    let wa=0,wb=0,res=[];
    for(const n of [2,3,4,5,6,8])for(const sh of [0,60,-60]){
      const r=run(cfg,n,base,n,380,sh);
      if(r.a>0&&r.b===0)wa++; else if(r.b>0&&r.a===0)wb++;
      res.push(`${n}v${n}@${sh}:${r.a}-${r.b}(${r.t.toFixed(0)}s)`);
    }
    console.log(name.padEnd(12),'A-wins',wa,'B-wins',wb,'|',res.join(' '));
  }
}
