const fs=require('fs'),zlib=require('zlib'),path=require('path');
const files=fs.readdirSync('.').filter(f=>f.startsWith('public-history-')&&f.endsWith('.gz'));
for(const f of files){
  const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
  const solIdx=j.seats.indexOf('sol');
  console.log('=====',f,'seats',j.seats,'sol seat',solIdx,'winner',j.winner,'dur',j.duration,'scores',JSON.stringify(j.scores));
  // initial hero
  const f0=j.frames[0];
  console.log('init heroes:',f0.players.map(p=>({name:p.name,hero:p.heroes.map(h=>h.type),gold:p.gold,wood:p.wood})));
  // hero types recruited by sol over time
  let lastHeroes=0;
  const events=[];
  for(let i=0;i<j.frames.length;i++){
    const fr=j.frames[i];
    const p=fr.players[solIdx];
    if(p.heroes.length!==lastHeroes){events.push([fr.now,p.heroes.map(h=>h.type+':'+h.level+(h.dead?'D':''))]);lastHeroes=p.heroes.length;}
  }
  console.log('sol hero roster changes:',events.map(e=>e[0].toFixed(1)+'s '+e[1].join('|')).join('  ;  '));
  // summarize sol commands by type
  const counts={};
  let firstAttack=null,attackMsgs=[];
  for(let i=0;i<j.decisions.length;i++){
    const d=j.decisions[i];if(!d)continue;
    const cmds=d.commands[solIdx]||[];
    for(const c of cmds){
      counts[c.type]=(counts[c.type]||0)+1;
      if(c.type==='attackMove'){
        if(!firstAttack||firstAttack.t>d.now)firstAttack={t:d.now,x:c.x,y:c.y,units:c.units.slice()};
      }
    }
  }
  console.log('sol cmd counts',JSON.stringify(counts));
  console.log('sol first attackMove',JSON.stringify(firstAttack));
  // economy: peek at gold/wood/worker count at several times
  for(const t of [10,30,60,90,120,150,180,240,300]){
    const idx=Math.min(j.frames.length-1,Math.round(t/0.25));
    const fr=j.frames[idx];if(!fr)continue;
    const sp=fr.players[solIdx];
    const units=fr.units.filter(u=>u.owner===solIdx);
    const byT={};units.forEach(u=>byT[u.type]=(byT[u.type]||0)+1);
    const blds=fr.buildings.filter(b=>b.owner===solIdx).map(b=>b.type+(b.complete?'':'(%'+Math.round(b.progress*100)+')'));
    console.log('t='+fr.now.toFixed(0)+' gold',sp.gold,'wood',sp.wood,'pop',sp.population,'cap',sp.popCap,'tier',sp.tier,'units',JSON.stringify(byT),'blds',blds.join(','));
  }
  console.log();
}
