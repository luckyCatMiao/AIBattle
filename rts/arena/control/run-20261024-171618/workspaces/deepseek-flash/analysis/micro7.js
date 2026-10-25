const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function mk(){const m=R.createMatch({id:'m',players:[{name:'a'},{name:'b'}],seed:1});R.command(m,0,{type:'start'});m.units=[];m.bases[0].x=-9000;m.bases[0].y=-9000;m.bases[1].x=9000;m.bases[1].y=9000;m.mines.forEach(x=>x.ore=0);return m;}
// Generic controller. cfg: kiteMode none|always|alt|low; target per|global|hybrid; holdThresh
function ctl(cfg){
  return function(p,m,st){
    const mine=m.units.filter(u=>u.owner===p&&u.hp>0), foes=m.units.filter(u=>u.owner!==p&&u.hp>0);
    if(!mine.length||!foes.length)return[];
    const cmds=[];
    const cent={x:mine.reduce((s,u)=>s+u.x,0)/mine.length,y:mine.reduce((s,u)=>s+u.y,0)/mine.length};
    const global=foes.slice().sort((a,b)=>(cfg.focus==='lowhp'?(a.hp-b.hp):(dist(a,cent)-dist(b,cent))))[0];
    const atk=[];
    for(const u of mine){
      const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      const nu=fs[0]; if(!nu)continue;
      const inR=dist(u,nu)<=174;
      const ready=u.fireAt<=m.now+1e-9;
      let kite=false;
      if(inR&&!ready){
        if(cfg.kiteMode==='always')kite=true;
        else if(cfg.kiteMode==='alt')kite=!st.kite[u.id];
        else if(cfg.kiteMode==='low')kite=u.hp/u.maxHp<cfg.kiteHp;
      }
      if(!kite&&cfg.kiteMode==='alt'&&inR&&ready)st.kite[u.id]=false;
      if(kite){
        st.kite[u.id]=true;
        const d=dist(u,nu)||1;
        cmds.push({type:'move',units:[u.id],x:u.x+(u.x-nu.x)/d*cfg.kiteLen,y:u.y+(u.y-nu.y)/d*cfg.kiteLen});
        continue;
      }
      let target=nu;
      if(cfg.target==='global')target=global;
      else if(cfg.target==='hybrid'&&dist(u,global)<=cfg.hybridR)target=global;
      if(dist(u,target)<=cfg.engageR){
        if(cfg.holdWhenReady&&dist(u,target)<=174)cmds.push({type:'stop',units:[u.id]});
        else atk.push([u.id,target.id]);
      } else {
        cmds.push({type:'attackMove',units:[u.id],x:target.x,y:target.y});
      }
    }
    const groups={};
    for(const [uid,tid] of atk){(groups[tid]=groups[tid]||[]).push(uid);}
    for(const tid in groups)cmds.push({type:'attack',units:groups[tid],target:tid});
    return cmds.slice(0,10);
  };
}
function fight(ctlA,ctlB,n,D,offY,maxT){
  const m=mk();
  const cx=640,cy=420+offY;
  for(let i=0;i<n;i++)R.spawn(m,0,'tank',cx-D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  for(let i=0;i<n;i++)R.spawn(m,1,'tank',cx+D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  const stA={kite:{}},stB={kite:{}};
  while(m.units.some(u=>u.owner===0&&u.hp>0)&&m.units.some(u=>u.owner===1&&u.hp>0)&&m.now<maxT){
    for(const [p,c,st] of [[0,ctlA,stA],[1,ctlB,stB]]){
      const cmds=c(p,m,st)||[];
      for(const cc of cmds.slice(0,10)){try{R.command(m,p,cc)}catch(e){}}
    }
    for(let k=0;k<20;k++)R.step(m);
  }
  const a=m.units.filter(u=>u.owner===0&&u.hp>0),b=m.units.filter(u=>u.owner===1&&u.hp>0);
  return {a:a.length,ahp:Math.round(a.reduce((s,u)=>s+u.hp,0)),b:b.length,bhp:Math.round(b.reduce((s,u)=>s+u.hp,0))};
}
function cmp(nameA,A,nameB,B,n,offs){
  let w=0,l=0,d=0;
  for(const off of offs){
    let r=fight(A,B,n,300,off,150);
    let v=(r.a>0&&r.b===0)?1:(r.a===0&&r.b===0?0:(r.b>0&&r.a===0?-1:(r.ahp>r.bhp?1:(r.bhp>r.ahp?-1:0))));
    if(v>0)w++;else if(v<0)l++;else d++;
    let r2=fight(B,A,n,300,off,150);
    v=(r2.b>0&&r2.a===0)?1:(r2.b===0&&r2.a===0?0:(r2.a>0&&r2.b===0?-1:(r2.bhp>r2.ahp?1:(r2.ahp>r2.bhp?-1:0))));
    if(v>0)w++;else if(v<0)l++;else d++;
  }
  return `${w}-${l}-${d}`;
}
const offs=[0,-60,60,120,-120];
const base={kiteMode:'alt',kiteLen:50,target:'per',engageR:188,focus:'nearest',holdWhenReady:false,kiteHp:0.4,hybridR:230};
const variants={
  solClone:base,
  kiteAlways:{...base,kiteMode:'always'},
  kiteNone:{...base,kiteMode:'none'},
  kiteLow:{...base,kiteMode:'low'},
  holdReady:{...base,holdWhenReady:true},
  globalFocus:{...base,target:'global'},
  hybridFocus:{...base,target:'hybrid'},
  hybridFocusWide:{...base,target:'hybrid',hybridR:300},
  kiteLen80:{...base,kiteLen:80},
  kiteLen100:{...base,kiteLen:100},
  engage230:{...base,engageR:230},
  engage160:{...base,engageR:160},
};
for(const n of [4,5,6]){
  console.log('=== '+n+'v'+n);
  for(const [name,cfg] of Object.entries(variants)){
    if(name==='solClone')continue;
    console.log(('  '+name).padEnd(18), 'vs solClone:', cmp(name,ctl(cfg),'sol',ctl(base),n,offs), '  vs itself:',cmp(name,ctl(cfg),name,ctl(cfg),n,offs));
  }
}
