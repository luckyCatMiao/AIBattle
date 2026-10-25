const fs=require('fs');
const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const games=a.filter(g=>!g.id.startsWith('history-'));
const dist=(u,v)=>Math.hypot(u.x-v.x,u.y-v.y);
for(const g of games){
  const ss=g.seats.indexOf('sol'), es=1-ss;
  console.log('====',g.id,'solSeat',ss);
  let mv=[],atk=[],am=[];
  for(let i=0;i<g.decisions.length;i++){
    const d=g.decisions[i]; const f=g.frames.find(x=>x.tick===d.tick)||g.frames[i];
    if(!f) continue;
    const solUnits=f.units.filter(u=>u.owner===ss&&u.hp>0);
    const foes=f.units.filter(u=>u.owner!==ss&&u.hp>0);
    for(const c of (d.commands[ss]||[])){
      if(!c.units) continue;
      for(const uid of c.units){
        const u=solUnits.find(x=>x.id===uid); if(!u) continue;
        const nf=foes.filter(v=>v.type!=='worker').sort((p,q)=>dist(u,p)-dist(u,q))[0];
        if(c.type==='move'){
          const dd=nf?dist(u,nf):-1;
          const inRange=nf? dd<=160+nf.r+2:false;
          const ready=u.fireAt<=d.now+1e-9;
          mv.push({t:d.now,type:u.type,dd,inRange,ready,step:Math.hypot(c.x-u.x,c.y-u.y)});
        } else if(c.type==='attack'){
          const tgt=foes.find(v=>v.id===c.target);
          if(tgt){ const rank=foes.filter(v=>v.type!=='worker').sort((p,q)=>dist(u,p)-dist(u,q)).findIndex(v=>v.id===tgt.id); atk.push({t:d.now,type:u.type,d:dist(u,tgt),rank,ttype:tgt.type,ready:u.fireAt<=d.now+1e-9}); }
          else atk.push({t:d.now,type:u.type,d:-1,rank:-2,ttype:'missing'});
        } else if(c.type==='attackMove'){
          am.push({t:d.now,type:u.type,x:c.x,y:c.y,nf:nf?dist(u,nf):-1});
        }
      }
    }
  }
  const stat=(arr,f)=>{const v=arr.map(f).filter(x=>x!==undefined&&x!==null);if(!v.length)return 'n=0';v.sort((a,b)=>a-b);const q=p=>v[Math.min(v.length-1,Math.floor(p*v.length))];return `n=${v.length} min=${v[0].toFixed(1)} p10=${q(.1).toFixed(1)} med=${q(.5).toFixed(1)} p90=${q(.9).toFixed(1)} max=${v[v.length-1].toFixed(1)} mean=${(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)}`;};
  console.log('move: dist to nearest foe', stat(mv,x=>x.dd), '| inRange%', (100*mv.filter(x=>x.inRange).length/Math.max(1,mv.length)).toFixed(0), '| ready%', (100*mv.filter(x=>x.ready).length/Math.max(1,mv.length)).toFixed(0), '| step', stat(mv,x=>x.step));
  console.log('  move by type', ['rifle','tank','raider'].map(ty=>ty+':'+mv.filter(x=>x.type===ty).length).join(' '));
  console.log('attack: dist', stat(atk,x=>x.d), '| rank0%', (100*atk.filter(x=>x.rank===0).length/Math.max(1,atk.length)).toFixed(0), '| ready%', (100*atk.filter(x=>x.ready).length/Math.max(1,atk.length)).toFixed(0),'| missing',atk.filter(x=>x.rank===-2).length);
  console.log('  attack by type', ['rifle','tank','raider'].map(ty=>ty+':'+atk.filter(x=>x.type===ty).length).join(' '),'| targettypes',JSON.stringify(atk.reduce((m,x)=>(m[x.ttype]=(m[x.ttype]||0)+1,m),{})));
  console.log('attackMove: dist to nearest foe', stat(am,x=>x.nf), '| by type', ['rifle','tank','raider'].map(ty=>ty+':'+am.filter(x=>x.type===ty).length).join(' '));
  // attackMove destinations clustered
  const pts={}; for(const x of am){const k=Math.round(x.x/40)*40+','+Math.round(x.y/40)*40; pts[k]=(pts[k]||0)+1;}
  console.log('  top AM dests', Object.entries(pts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>k+':'+v).join('  '));
}
