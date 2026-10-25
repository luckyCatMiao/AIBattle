const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function mk(){const m=R.createMatch({id:'m',players:[{name:'a'},{name:'b'}],seed:1});R.command(m,0,{type:'start'});m.units=[];m.bases[0].x=-9000;m.bases[0].y=-9000;m.bases[1].x=9000;m.bases[1].y=9000;m.mines.forEach(x=>x.ore=0);return m;}
// style: 'nearest' | 'focus' | 'focuslow' | 'kite' | 'kitefocus'
function fight(nA,nB,styleA,styleB,D,seed,maxT){
  const m=mk();
  const cx=640,cy=420;
  const jitter=()=>((Math.sin(seed*12.9898+Math.cos(seed*78.233))*43758.5453)%1);
  for(let i=0;i<nA;i++)R.spawn(m,0,'tank',cx-D/2+((i%3)-1.5)*26,cy+Math.floor(i/3)*26-13+seed*0.1);
  for(let i=0;i<nB;i++)R.spawn(m,1,'tank',cx+D/2+((i%3)-1.5)*26,cy+Math.floor(i/3)*26-13+seed*0.1);
  const alive=o=>m.units.filter(u=>u.owner===o&&u.hp>0);
  while(m.units.filter(u=>u.hp>0&&u.owner===0).length&&m.units.filter(u=>u.hp>0&&u.owner===1).length){
    for(const p of [0,1]){
      const style=p===0?styleA:styleB;
      const mine=alive(p), foes=alive(1-p);
      if(!mine.length||!foes.length)break;
      const cent={x:mine.reduce((s,u)=>s+u.x,0)/mine.length,y:mine.reduce((s,u)=>s+u.y,0)/mine.length};
      const focus=foes.slice().sort((a,b)=>style.startsWith('focuslow')?(a.hp-b.hp):(dist(a,cent)-dist(b,cent)))[0];
      const atk=[];
      for(const u of mine){
        if(style.startsWith('kite')){
          const nu=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
          if(nu&&dist(u,nu)<=174&&u.fireAt>m.now+1e-9){
            const d=dist(u,nu)||1;
            try{R.command(m,p,{type:'move',units:[u.id],x:u.x+(u.x-nu.x)/d*50,y:u.y+(u.y-nu.y)/d*50})}catch(e){}
            continue;
          }
        }
        atk.push(u.id);
      }
      if(!atk.length)continue;
      try{
        if(style==='nearest'){for(const u of mine){if(!atk.includes(u.id))continue;const t=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];R.command(m,p,{type:'attack',units:[u.id],target:t.id});}}
        else R.command(m,p,{type:'attack',units:atk,target:focus.id});
      }catch(e){}
    }
    for(let k=0;k<20;k++)R.step(m);
    if(m.now>maxT)break;
  }
  const a=alive(0),b=alive(1);
  return {t:+m.now.toFixed(1),a:a.length,ahp:Math.round(a.reduce((s,u)=>s+u.hp,0)),b:b.length,bhp:Math.round(b.reduce((s,u)=>s+u.hp,0))};
}
const styles=['nearest','focus','kitefocus','kite'];
for(const s of styles){
  let row=[];
  for(const n of [2,3,4,5,6]){
    let wins=0,hpDiff=0;
    for(let seed=0;seed<8;seed++){
      const r=fight(n,n,s,'nearest',300,seed,120);
      if(r.a>0&&r.b===0)wins++;
      else if(r.a>0&&r.b>0)hpDiff+=r.ahp-r.bhp; else if(r.a===0&&r.b===0)hpDiff+=0; else hpDiff-=1000;
    }
    row.push(`${n}v${n}: win${wins}/8`);
  }
  console.log(s.padEnd(11),row.join('  '));
}
// equal cost compositions
console.log('--- style vs style');
for(const sA of styles){const row=[];for(const sB of styles){let w=0;for(let seed=0;seed<6;seed++){const r=fight(5,5,sA,sB,300,seed,120);if(r.a>0&&r.b===0)w++;}row.push(w);}console.log(sA.padEnd(11),row.join(' '));}
