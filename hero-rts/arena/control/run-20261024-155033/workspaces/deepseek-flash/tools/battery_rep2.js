'use strict';
const fs=require('fs'),zlib=require('zlib');
const {runDuel}=require('./duel_replay.js');
const {Agent}=require(process.env.AGENT_FILE||'../agent.js');
const files=process.argv[3]?process.argv[3].split(','):fs.readdirSync('.').filter(f=>/^public-(history-)?.*\.json\.gz$/.test(f)&&!f.includes('r1-g')&&!f.includes('r2-g'));
const variants=JSON.parse(process.argv[2]);
for(const v of variants){
 let W=0,N=0;const L=[];
 for(const f of files){
  const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(f)));
  const solSeat=j.seats.indexOf('sol'); if(solSeat<0)continue;
  const ourSeat=1-solSeat;
  const r=runDuel(new Agent(Object.assign({},v.opts)),{replay:j,ourSeat,solSeat,maxSeconds:700});
  const win=r.winner===ourSeat; if(win)W++;N++;
  if(!win)L.push(f.replace('public-','').replace('.json.gz','')+'('+r.duration.toFixed(0)+')');
 }
 console.log(v.name.padEnd(20),`${W}/${N}`,L.length?'LOSSES: '+L.join(' '):'');
}
