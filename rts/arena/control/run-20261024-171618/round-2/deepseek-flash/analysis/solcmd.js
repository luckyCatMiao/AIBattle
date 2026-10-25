const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const id=process.argv[2];
const g=j.find(x=>x.id===id);
const S=g.seats.indexOf('sol'), E=1-S;
const dec=g.decisions;
const framesByTick=new Map(g.frames.map(f=>[f.tick,f]));
for(const d of dec){
  const f=framesByTick.get(d.tick); if(!f) continue;
  const cmds=d.commands[S];
  if(!cmds.length) continue;
  const su=f.units.filter(u=>u.owner===S);
  const eu=f.units.filter(u=>u.owner===E);
  const cnt=us=>{const c={};for(const u of us)c[u.type]=(c[u.type]||0)+1;return Object.entries(c).map(e=>e[0]+':'+e[1]).join(' ')};
  console.log(`t${d.now.toFixed(0)} S[${cnt(su)}] cr${f.players[S].credits} lv${f.players[S].level} base${Math.round(f.bases[S].hp)} | E[${cnt(eu)}] cr${f.players[E].credits}`);
  console.log('   ', JSON.stringify(cmds));
}
