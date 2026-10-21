'use strict';
// Referee stdin is private to the controller. HTTP is strictly read-only.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {createMatch,command,step,snapshot}=require('../simulation');
const games=new Map();let current=null,meta={phase:'准备比赛',round:0,results:[]};
const port=Number(process.env.ARENA_PORT||8789);
function clean(g){return structuredClone(snapshot(g));}
function applyBatch(g,batches){
 const errors=[[],[]];
 for(let owner=0;owner<2;owner++){
  if(!Array.isArray(batches[owner]))throw Error('Commands must be arrays');
  for(let i=0;i<batches[owner].length;i++){
   const c=batches[owner][i];
   try{if(i>=10)throw Error('10 commands per second limit');if(!c||['start','pause'].includes(c.type))throw Error('Referee-only command');command(g,owner,c);}
   catch(e){errors[owner].push({index:i,command:c,error:e.message});}
  }
 }
 return errors;
}
function action(msg){
 if(msg.type==='status'){meta={...meta,...msg.data};return {ok:true};}
 if(msg.type==='create'){
  if(games.has(msg.id))throw Error('Duplicate game');
  const game=createMatch({id:msg.id,players:msg.players.map(name=>({name,kind:'api'}))});
  command(game,0,{type:'start'});current=msg.id;
  games.set(current,{game,frames:[clean(game)]});return {state:clean(game)};
 }
 if(msg.type==='advance'){
  const item=games.get(current);if(!item||item.game.status!=='playing')throw Error('No live match');
  const errors=applyBatch(item.game,msg.commands);
  for(let i=0;i<20&&item.game.status==='playing';i++)step(item.game);
  const state=clean(item.game);item.frames.push(state);return {state,errors};
 }
 if(msg.type==='load'){
  for(const record of msg.records){games.set(record.id,{game:record.final,frames:record.frames});current=record.id;}
  meta=msg.meta;return {ok:true};
 }
 throw Error('Unknown referee command');
}
function serve(){
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let value;
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/api/arena')value={...meta,current,games:[...games].map(([id,o])=>({id,frames:o.frames.length,now:o.frames.at(-1).now,status:o.frames.at(-1).status,players:o.frames.at(-1).players.map(p=>p.name)}))};
  else if(url.pathname.startsWith('/api/matches/')){
   const item=games.get(url.pathname.split('/')[3]);
   if(item){const n=Number(url.searchParams.get('frame'));value=url.searchParams.has('frame')?item.frames[Math.max(0,Math.min(item.frames.length-1,Math.floor(n)||0))]:item.frames.at(-1);}
  }else if(url.pathname==='/'||url.pathname==='/arena.js'){
   res.writeHead(200,{'Content-Type':url.pathname==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-cache'});
   res.end(fs.readFileSync(path.join(__dirname,'public',url.pathname==='/'?'index.html':'app.js')));return;
  }
  res.writeHead(value?200:404,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value||{error:'Not found'}));
 });
 server.listen(port,'127.0.0.1',()=>process.stderr.write(`Arena http://127.0.0.1:${port}\n`));
 const rl=readline.createInterface({input:process.stdin});
 rl.on('line',line=>{try{process.stdout.write(JSON.stringify(action(JSON.parse(line)))+'\n');}catch(e){process.stdout.write(JSON.stringify({error:e.message})+'\n');}});
 // Keep the read-only viewer available after successful training finishes.
 return server;
}
if(require.main===module)serve();
module.exports={applyBatch,action};
