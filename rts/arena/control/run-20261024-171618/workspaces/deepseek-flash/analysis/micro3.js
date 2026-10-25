const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function mk(){const m=R.createMatch({id:'m',players:[{name:'a'},{name:'b'}],seed:1});R.command(m,0,{type:'start'});m.units=[];return m;}
function run(styleA,styleB,T){
  const m=mk();
  const a=R.spawn(m,0,'tank',560,420), b=R.spawn(m,1,'tank',720,420);
  const shots=[];
  let t=0;
  while(m.now<T){
    for(const p of [0,1]){
      const mine=m.units.filter(u=>u.owner===p&&u.hp>0), foes=m.units.filter(u=>u.owner!==p&&u.hp>0);
      if(!mine.length||!foes.length)break;
      const style=p===0?styleA:styleB;
      const u=mine[0], nu=foes.slice().sort((x,y)=>dist(u,x)-dist(u,y))[0];
      if(style==='kite'&&nu&&dist(u,nu)<=174&&u.fireAt>m.now+1e-9){
        const d=dist(u,nu)||1;
        R.command(m,p,{type:'move',units:[u.id],x:u.x+(u.x-nu.x)/d*50,y:u.y+(u.y-nu.y)/d*50});
      }else if(style==='stop'){R.command(m,p,{type:'stop',units:[mine[0].id]});}
      else R.command(m,p,{type:'attack',units:mine.map(x=>x.id),target:nu.id});
    }
    for(let k=0;k<20;k++){
      R.step(m);
      for(const e of m.events) if(e.type==='shot'&&!shots.some(s=>s.id===e.id)) shots.push({id:e.id,t:+e.t.toFixed(2),owner:e.owner});
    }
    t++;
    const ua=m.units.find(u=>u.owner===0), ub=m.units.find(u=>u.owner===1);
    if(!ua||!ub)break;
  }
  const ua=m.units.find(u=>u.owner===0), ub=m.units.find(u=>u.owner===1);
  return {a:ua?Math.round(ua.hp):0,b:ub?Math.round(ub.hp):0,shotsA:shots.filter(s=>s.owner===0).map(s=>s.t),shotsB:shots.filter(s=>s.owner===1).map(s=>s.t)};
}
for(const [sa,sb] of [['kite','attack'],['attack','attack'],['stop','attack'],['kite','kite']]){
  const r=run(sa,sb,20);
  console.log(sa,'vs',sb,'=> A hp',r.a,'B hp',r.b);
  console.log('   A shots',r.shotsA.join(','));
  console.log('   B shots',r.shotsB.join(','));
}
