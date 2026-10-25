'use strict';
const zlib=require('zlib'),fs=require('fs');
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])));
const who=parseInt(process.argv[3]||'0',10);
for(let i=0;i<j.frames.length;i+=20){
  const fr=j.frames[i];
  const us=fr.units.filter(u=>u.owner===who&&u.type!=='worker'&&u.type!=='skeleton'&&u.type!=='treant');
  const nFar=us.filter(u=>u.x>2350).length;
  const list=us.map(u=>u.type[0]+':'+Math.round(u.x)+','+Math.round(u.y)+'('+Math.round(u.hp)+')').join(' ');
  console.log(`t=${fr.now.toFixed(0)} far=${nFar} ${list}`);
}
