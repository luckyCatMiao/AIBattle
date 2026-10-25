const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function mk(){const m=R.createMatch({id:'m',players:[{name:'a'},{name:'b'}],seed:1});R.command(m,0,{type:'start'});m.units=[];m.bases[0].x=-9000;m.bases[0].y=-9000;m.bases[1].x=9000;m.bases[1].y=9000;m.mines.forEach(x=>x.ore=0);return m;}
function ctl(cfg){
  return function(p,m,st){
    const mine=m.units.filter(u=>u.owner===p&&u.hp>0), foes=m.units.filter(u=>u.owner!==p&&u.hp>0);
    if(!mine.length||!foes.length)return[];
    const cmds=[];
    const cent={x:mine.reduce((s,u)=>s+u.x,0)/mine.length,y:mine.reduce((s,u)=>s+u.y,0)/mine.length};
    const fcent={x:foes.reduce((s,u)=>s+u.x,0)/foes.length,y:foes.reduce((s,u)=>s+u.y,0)/foes.length};
    mine.sort((a,b)=>(a.id<b.id?-1:1));
    const atk=[];
    mine.forEach((u,idx)=>{
      const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      const nu=fs[0]; if(!nu)return;
      const inR=dist(u,nu)<=174;
      const ready=u.fireAt<=m.now+1e-9;
      let kite=false;
      if(inR&&!ready){
        if(cfg.kiteMode==='always')kite=true;
        else if(cfg.kiteMode==='alt')kite=!st.kite[u.id];
        else if(cfg.kiteMode==='low')kite=u.hp/u.maxHp<cfg.kiteHp;
      }
      if(kite){
        st.kite[u.id]=true;
        const dx=(u.x-nu.x)||1,dy=(u.y-nu.y)||1,d=Math.hypot(dx,dy);
        let vx=dx/d,vy=dy/d;
        if(cfg.spread>0){
          const sgn=(idx%2===0?1:-1);
          vx=vx*(1-cfg.spread)+(-dy/d)*cfg.spread*sgn;
          vy=vy*(1-cfg.spread)+(dx/d)*cfg.spread*sgn;
          const l=Math.hypot(vx,vy)||1;vx/=l;vy/=l;
        }
        cmds.push({type:'move',units:[u.id],x:u.x+vx*cfg.kiteLen,y:u.y+vy*cfg.kiteLen});
        return;
      }
      st.kite[u.id]=false;
      if(inR){
        if(cfg.holdWhenReady)cmds.push({type:'stop',units:[u.id]});
        else atk.push(u.id);
        return;
      }
      // spread approach: offset target perpendicular to enemy direction
      if(cfg.form){
        const ddx=fcent.x-cent.x,ddy=fcent.y-cent.y,dl=Math.hypot(ddx,ddy)||1;
        const px=-ddy/dl,py=ddx/dl;
        const off=(idx-(mine.length-1)/2)*cfg.form;
        cmds.push({type:'attackMove',units:[u.id],x:Math.max(20,Math.min(1260,nu.x+px*off)),y:Math.max(20,Math.min(820,nu.y+py*off))});
      }else cmds.push({type:'attackMove',units:[u.id],x:nu.x,y:nu.y});
    });
    if(atk.length)cmds.push({type:'attack',units:atk,target:foes.slice().sort((a,b)=>dist(a,cent)-dist(b,cent))[0].id});
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
function score(nameA,A,nameB,B,n,offs){
  let w=0,l=0,d=0,net=0;
  for(const off of offs){
    let r=fight(A,B,n,300,off,150);
    let v=(r.a>0&&r.b===0)?1:(r.a===0&&r.b===0?0:(r.b>0&&r.a===0?-1:(r.ahp>r.bhp?1:(r.bhp>r.ahp?-1:0))));
    if(v>0)w++;else if(v<0)l++;else d++; net+=(r.ahp-r.bhp);
    let r2=fight(B,A,n,300,off,150);
    v=(r2.b>0&&r2.a===0)?1:(r2.b===0&&r2.a===0?0:(r2.a>0&&r2.b===0?-1:(r2.bhp>r2.ahp?1:(r2.ahp>r2.bhp?-1:0))));
    if(v>0)w++;else if(v<0)l++;else d++; net+=(r2.bhp-r2.ahp);
  }
  return `${nameA} vs ${nameB}: W${w} L${l} D${d} netHP${Math.round(net)}`;
}

function fight2(typeA,nA,typeB,nB,ctlA,ctlB,D,offY,maxT){
  const m=mk();
  const cx=640,cy=420+offY;
  for(let i=0;i<nA;i++)R.spawn(m,0,typeA,cx-D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  for(let i=0;i<nB;i++)R.spawn(m,1,typeB,cx+D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
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
const offs=[0,-40,40,-80,80,-120,120];
const sol={kiteMode:'alt',kiteLen:50,spread:0,form:0,holdWhenReady:false,kiteHp:0.4};
const raiderCtl={kiteMode:'none',kiteLen:50,spread:0,form:60,holdWhenReady:false,kiteHp:0.4};
const raiderSpread={kiteMode:'none',kiteLen:50,spread:0,form:100,holdWhenReady:false,kiteHp:0.4};
for(const [nR,nT] of [[5,3],[6,4],[7,4],[8,5],[9,6],[10,6],[6,3],[7,5],[10,7]]){
  let w=0,l=0,net=0;
  for(const off of offs){
    let r=fight2('raider',nR,'tank',nT,ctl(raiderCtl),ctl(sol),300,off,120);
    if(r.a>0&&r.b===0)w++;else if(r.b>0&&r.a===0)l++;net+=r.ahp-r.bhp;
    let r2=fight2('tank',nT,'raider',nR,ctl(sol),ctl(raiderCtl),300,off,120);
    if(r2.b>0&&r2.a===0)w++;else if(r2.a>0&&r2.b===0)l++;net+=r2.bhp-r2.ahp;
  }
  console.log(nR+' raiders ('+(nR*100)+'cr) vs '+nT+' tanks ('+(nT*160)+'cr): W'+w+' L'+l+' netHP'+net);
}
for(const [nR,nT] of [[8,5],[10,6],[12,8]]){
  let w=0,l=0,net=0;
  for(const off of offs){
    let r=fight2('raider',nR,'tank',nT,ctl(raiderSpread),ctl(sol),300,off,120);
    if(r.a>0&&r.b===0)w++;else if(r.b>0&&r.a===0)l++;net+=r.ahp-r.bhp;
    let r2=fight2('tank',nT,'raider',nR,ctl(sol),ctl(raiderSpread),300,off,120);
    if(r2.b>0&&r2.a===0)w++;else if(r2.a>0&&r2.b===0)l++;net+=r2.bhp-r2.ahp;
  }
  console.log('SPREAD '+nR+' raiders vs '+nT+' tanks: W'+w+' L'+l+' netHP'+net);
}
