'use strict';
const zlib=require('zlib'),fs=require('fs');
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])));
const seat=parseInt(process.argv[3]||'1',10); // seat index in decisions
console.log('===',j.id,'seats',j.seats,'sol seat',seat);
let lastT=-1;
const counts={};
for(const d of j.decisions){
  const cmds=d.commands[seat]||[];
  for(const c of cmds){
    const key=c.type+(c.type==='train'?':'+c.unit:c.type==='build'?':'+c.building:c.type==='cast'?':'+c.skill:c.type==='research'?':'+c.tech:c.type==='summon'?'':c.type==='revive'?'':c.type==='move'||c.type==='attackMove'?'':'');
    counts[key]=(counts[key]||0)+1;
  }
  if(d.now<180 && (d.now%5<0.26) && cmds.length){
    const brief=cmds.map(c=>{
      if(c.type==='build')return 'build:'+c.building+'@'+Math.round(c.x)+','+Math.round(c.y)+'('+c.units.length+'w)';
      if(c.type==='train')return 'train:'+c.unit+(c.building?('@'+c.building):'');
      if(c.type==='summon')return 'summon:'+c.hero;
      if(c.type==='revive')return 'revive:'+c.hero;
      if(c.type==='research')return 'research:'+c.tech;
      if(c.type==='cast')return 'cast:'+c.skill+'@'+Math.round(c.x)+','+Math.round(c.y);
      if(c.type==='move'||c.type==='attackMove')return c.type+':'+c.units.join('/')+'->'+Math.round(c.x)+','+Math.round(c.y);
      if(c.type==='attack')return 'attack:'+c.units.join('/')+'->'+c.target;
      if(c.type==='gather')return 'gather:'+c.units.join('/')+'->'+c.target;
      return c.type+':'+JSON.stringify(c).slice(0,60);
    }).join(' | ');
    console.log('t='+d.now.toFixed(2), brief);
  }
}
console.log('counts',JSON.stringify(counts,null,1));
