'use strict';
// Only the trusted controller owns stdin. Contestants get observations, never this process.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const sim=require('../simulation');
let game;
function observe(){const s=sim.snapshot(game);delete s.catalog;return s;}
function action(m){
 if(m.type==='create'){
  game=sim.createMatch({id:m.id,seed:1,players:m.players.map(p=>({...p,kind:'api'}))});
  sim.command(game,0,{type:'start'});return {state:observe()};
 }
 if(m.type==='advance'){
  if(!game||game.status!=='playing')throw Error('No active battle');
  if(!Array.isArray(m.commands)||m.commands.length!==2||m.commands.some(c=>!Array.isArray(c)||c.length>20))throw Error('Invalid batch');
  const errors=[[],[]];
  // Both answers were committed against the same snapshot before this is called.
  for(let owner=0;owner<2;owner++)for(let i=0;i<m.commands[owner].length;i++){
   const c=m.commands[owner][i];try{if(!c||['start','pause'].includes(c.type))throw Error('Referee-only command');sim.command(game,owner,c);}
   catch(e){errors[owner].push({index:i,error:e.message});}
  }
  for(let i=0;i<5&&game.status==='playing';i++)sim.step(game);
  return {state:observe(),errors};
 }
 throw Error('Unknown referee message');
}
if(require.main===module){readline.createInterface({input:process.stdin}).on('line',line=>{try{process.stdout.write(JSON.stringify(action(JSON.parse(line)))+'\n');}catch(e){process.stdout.write(JSON.stringify({error:e.message})+'\n');}});}
module.exports={action};
