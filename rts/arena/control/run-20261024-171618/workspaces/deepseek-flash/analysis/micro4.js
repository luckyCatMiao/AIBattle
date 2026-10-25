const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function mk(){const m=R.createMatch({id:'m',players:[{name:'a'},{name:'b'}],seed:1});R.command(m,0,{type:'start'});m.units=[];m.bases[0].x=-9000;m.bases[0].y=-9000;m.bases[1].x=9000;m.bases[1].y=9000;m.mines.forEach(x=>x.ore=0);return m;}
// seat s: 0 west, 1 east. lineup: identical composition mirrored.
function fight(n,s,styleWest,styleEast,D,offY,maxT){
  const m=mk();
  const cx=640,cy=420+offY;
  for(let i=0;i<n;i++)R.spawn(m,0,'tank',cx-D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  for(let i=0;i<n;i++)R.spawn(m,1,'tank',cx+D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  const alive=o=>m.units.filter(u=>u.owner===o&&u.hp>0);
  while(alive(0).length&&alive(1).length&&m.now<maxT){
    for(const p of [0,1]){
      const style=p===0?styleWest:styleEast;
      const mine=alive(p), foes=alive(1-p);
      if(!mine.length||!foes.length)break;
      const cent={x:mine.reduce((s,u)=>s+u.x,0)/mine.length,y:mine.reduce((s,u)=>s+u.y,0)/mine.length};
      const focus=foes.slice().sort((a,b)=>style.includes('low')?(a.hp-b.hp):(dist(a,cent)-dist(b,cent)))[0];
      const atk=[];
      for(const u of mine){
        const nu=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
        const inR=nu&&dist(u,nu)<=174;
        if(style.startsWith('kite')&&inR&&u.fireAt>m.now+1e-9){
          const d=dist(u,nu)||1;
          try{R.command(m,p,{type:'move',units:[u.id],x:u.x+(u.x-nu.x)/d*50,y:u.y+(u.y-nu.y)/d*50})}catch(e){}
          continue;
        }
        if(style.endsWith('stop')&&inR){
          try{R.command(m,p,{type:'stop',units:[u.id]})}catch(e){}
          continue;
        }
        atk.push(u.id);
      }
      if(atk.length&&focus){try{R.command(m,p,{type:'attack',units:atk,target:focus.id})}catch(e){}}
    }
    for(let k=0;k<20;k++)R.step(m);
  }
  const a=alive(0),b=alive(1);
  return {a:a.length,ahp:Math.round(a.reduce((s,u)=>s+u.hp,0)),b:b.length,bhp:Math.round(b.reduce((s,u)=>s+u.hp,0)),t:+m.now.toFixed(1)};
}
const styles=['nearest','focus','kite','kitestop','kitelow','stop'];
const N=+process.argv[2]||5;
const offs=[0,-60,60];
// symmetric: run style X in west vs Y in east, then swap
const results={};
for(const sx of styles)for(const sy of styles){
  let w=0,l=0,d=0;
  for(const off of offs){
    let r=fight(N,0,sx,sy,300,off,90);
    if(r.a>0&&r.b===0)w++; else if(r.a===0&&r.b===0)d++; else if(r.b>0&&r.a===0)l++; else if(r.ahp>r.bhp)w++; else if(r.bhp>r.ahp)l++; else d++;
    r=fight(N,1,sy,sx,300,off,90);
    if(r.b>0&&r.a===0)w++; else if(r.b===0&&r.a===0)d++; else if(r.a>0&&r.b===0)l++; else if(r.bhp>r.ahp)w++; else if(r.ahp>r.bhp)l++; else d++;
  }
  results[sx+' vs '+sy]={w,l,d};
}
for(const k in results){const r=results[k];console.log(k.padEnd(20),'W'+r.w,'L'+r.l,'D'+r.d);}
