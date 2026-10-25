const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function mk(){const m=R.createMatch({id:'m',players:[{name:'a'},{name:'b'}],seed:1});R.command(m,0,{type:'start'});m.units=[];m.bases[0].x=-9000;m.bases[0].y=-9000;m.bases[1].x=9000;m.bases[1].y=9000;m.mines.forEach(x=>x.ore=0);return m;}
// controller(p, m, state) -> commands
function solMicro(p,m,st){
  const mine=m.units.filter(u=>u.owner===p&&u.hp>0), foes=m.units.filter(u=>u.owner!==p&&u.hp>0);
  const cmds=[];
  for(const u of mine){
    const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
    const nu=fs[0];
    if(nu&&dist(u,nu)<=188){
      const ready=u.fireAt<=m.now+1e-9;
      const k=st.kite[u.id]||false;
      if(!ready&&!k&&u.hp/u.maxHp<0.98){
        const d=dist(u,nu)||1;
        cmds.push({type:'move',units:[u.id],x:u.x+(u.x-nu.x)/d*50,y:u.y+(u.y-nu.y)/d*50});
        st.kite[u.id]=true;
      }else{st.kite[u.id]=false;const t=fs.filter(v=>dist(u,v)<=218)[0]||nu;cmds.push({type:'attack',units:[u.id],target:t.id});}
    }else{
      st.kite[u.id]=false;
      const c={x:mine.reduce((s,x)=>s+x.x,0)/mine.length,y:mine.reduce((s,x)=>s+x.y,0)/mine.length};
      cmds.push({type:'attackMove',units:[u.id],x:nu?nu.x:c.x,y:nu?nu.y:c.y});
    }
  }
  return cmds;
}
function focusKite(p,m,st,opt){
  const mine=m.units.filter(u=>u.owner===p&&u.hp>0), foes=m.units.filter(u=>u.owner!==p&&u.hp>0);
  const cmds=[];
  const cent={x:mine.reduce((s,u)=>s+u.x,0)/mine.length,y:mine.reduce((s,u)=>s+u.y,0)/mine.length};
  let focus=foes.slice().sort((a,b)=>opt.focus==='lowhp'?(a.hp-b.hp):(dist(a,cent)-dist(b,cent)))[0];
  const atk=[];
  for(const u of mine){
    const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
    const nu=fs[0];
    const inR=nu&&dist(u,nu)<=174;
    if(inR&&u.fireAt>m.now+1e-9){
      let doKite=true;
      if(opt.kiteWhen==='enemyReady'){
        const anyReady=foes.some(v=>v.fireAt<=m.now+1e-9&&dist(u,v)<=174+v.r);
        doKite=anyReady;
      }
      if(doKite){
        const d=dist(u,nu)||1;
        cmds.push({type:'move',units:[u.id],x:u.x+(u.x-nu.x)/d*50,y:u.y+(u.y-nu.y)/d*50});
        continue;
      }
    }
    if(inR&&opt.holdWhenReady){cmds.push({type:'stop',units:[u.id]});continue;}
    atk.push(u.id);
  }
  if(atk.length&&focus)cmds.push({type:'attack',units:atk,target:focus.id});
  return cmds;
}
function fight(ctlA,ctlB,n,D,offY,maxT){
  const m=mk();
  const cx=640,cy=420+offY;
  for(let i=0;i<n;i++)R.spawn(m,0,'tank',cx-D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  for(let i=0;i<n;i++)R.spawn(m,1,'tank',cx+D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  const stA={kite:{}},stB={kite:{}};
  while(m.units.some(u=>u.owner===0&&u.hp>0)&&m.units.some(u=>u.owner===1&&u.hp>0)&&m.now<maxT){
    for(const [p,ctl,st] of [[0,ctlA,stA],[1,ctlB,stB]]){
      const cmds=ctl(p,m,st)||[];
      for(const c of cmds.slice(0,10)){try{R.command(m,p,c)}catch(e){}}
    }
    for(let k=0;k<20;k++)R.step(m);
  }
  const a=m.units.filter(u=>u.owner===0&&u.hp>0),b=m.units.filter(u=>u.owner===1&&u.hp>0);
  return {a:a.length,ahp:Math.round(a.reduce((s,u)=>s+u.hp,0)),b:b.length,bhp:Math.round(b.reduce((s,u)=>s+u.hp,0))};
}
function cmp(nameA,ctlA,nameB,ctlB,n,offs){
  let w=0,l=0,d=0,detail=[];
  for(const off of offs){
    let r=fight(ctlA,ctlB,n,300,off,120);
    const res1=(r.a>0&&r.b===0)?1:(r.a===0&&r.b===0?0:(r.b>0&&r.a===0?-1:(r.ahp>r.bhp?1:(r.bhp>r.ahp?-1:0))));
    let r2=fight(ctlB,ctlA,n,300,off,120);
    const res2=(r2.b>0&&r2.a===0)?1:(r2.b===0&&r2.a===0?0:(r2.a>0&&r2.b===0?-1:(r2.bhp>r2.ahp?1:(r2.ahp>r2.bhp?-1:0))));
    if(res1>0)w++;else if(res1<0)l++;else d++;
    if(res2>0)w++;else if(res2<0)l++;else d++;
    detail.push(`${res1>0?'W':res1<0?'L':'D'}${res2>0?'W':res2<0?'L':'D'}(${r.ahp}/${r.bhp},${r2.ahp}/${r2.bhp})`);
  }
  console.log((nameA+' vs '+nameB).padEnd(30),'W'+w,'L'+l,'D'+d,' ',detail.join(' '));
}
const offs=[0,-60,60,120];
const opts={focus:'nearest',kiteWhen:'always',holdWhenReady:false};
cmp('solMicro',solMicro,'focusKite',(p,m,st)=>focusKite(p,m,st,opts),5,offs);
cmp('solMicro',solMicro,'focusKite',(p,m,st)=>focusKite(p,m,st,opts),6,offs);
cmp('solMicro',solMicro,'focusKite-hold',(p,m,st)=>focusKite(p,m,st,{focus:'nearest',kiteWhen:'always',holdWhenReady:true}),5,offs);
cmp('solMicro',solMicro,'focusKite-enemyReady',(p,m,st)=>focusKite(p,m,st,{focus:'nearest',kiteWhen:'enemyReady'}),5,offs);
cmp('solMicro',solMicro,'focusKite-lowhp',(p,m,st)=>focusKite(p,m,st,{focus:'lowhp',kiteWhen:'always'}),5,offs);
cmp('focusKite',(p,m,st)=>focusKite(p,m,st,opts),'focusKite-hold',(p,m,st)=>focusKite(p,m,st,{focus:'nearest',kiteWhen:'always',holdWhenReady:true}),5,offs);
