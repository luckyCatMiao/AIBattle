const fs=require('fs'),zlib=require('zlib');
const file=process.argv[2];
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
const who=process.argv[3]||'sol';
const idx=j.seats.indexOf(who);
for(const t of (process.argv[4]||'0,5,10,15,20,25,30,40,50,60,75,90,105,120,150,180,210,240,270,300').split(',').map(Number)){
  const i=Math.min(j.frames.length-1,Math.round(t/0.25));
  const f=j.frames[i];if(!f)continue;
  const us=f.units.filter(u=>u.owner===idx);
  const by={};for(const u of us){const k=u.type;if(!by[k])by[k]=[];by[k].push([Math.round(u.x),Math.round(u.y),u.order.type]);}
  const blds=f.buildings.filter(b=>b.owner===idx).map(b=>b.type+(b.complete?'':'('+Math.round(b.progress*100)+'%)')+'@'+Math.round(b.x)+','+Math.round(b.y));
  console.log('t='+f.now.toFixed(1),'gold',Math.floor(f.players[idx].gold),'wood',Math.floor(f.players[idx].wood),'pop',f.players[idx].population+'/'+f.players[idx].popCap);
  console.log('  units',JSON.stringify(by));
  console.log('  blds',blds.join(' '));
}
