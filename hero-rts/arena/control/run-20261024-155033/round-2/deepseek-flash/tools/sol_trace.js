'use strict';
const zlib=require('zlib'),fs=require('fs');
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])));
const owner=parseInt(process.argv[3]||'1',10);
const step=parseInt(process.argv[4]||'10',10); // frames*0.05s each -> 10 = 0.5s
for(let i=0;i<j.frames.length;i+=step){
  const fr=j.frames[i];
  const us=fr.units.filter(u=>u.owner===owner&&u.type!=='worker');
  const hero=us.find(u=>u.hero);
  const army=us.filter(u=>!u.hero);
  const blds=fr.buildings.filter(b=>b.owner===owner);
  const done=blds.filter(b=>b.complete).map(b=>b.type+(b.type==='townhall'?':'+Math.round(b.hp):''));
  const wip=blds.filter(b=>!b.complete).map(b=>b.type+'~'+Math.round(b.progress*100));
  const pop=fr.players[owner];
  const cnt={};for(const u of army)cnt[u.type]=(cnt[u.type]||0)+1;
  const heroS=hero?`${hero.type}@${Math.round(hero.x)},${Math.round(hero.y)} hp${Math.round(hero.hp)} mp${Math.round(hero.mana)} lv${hero.level}`:'-';
  console.log(`t=${fr.now.toFixed(1)} g${Math.round(pop.gold)} w${Math.round(pop.wood)} | ${heroS} | ${Object.entries(cnt).map(([k,v])=>k+'x'+v).join(' ')||'noarmy'} | ${done.join(',')} | WIP ${wip.join(',')}`);
}
