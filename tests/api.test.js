'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

test('HTTP auth, legal moves, color swap, persistence and public replay',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aibattle-test-'));
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{windowsHide:true,env:{...process.env,PORT:String(port),AIBATTLE_DATA:temp},stdio:['ignore','pipe','pipe']});
 t.after(()=>{child.kill();});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});
 const call=async(route,body,token)=>{const r=await fetch(`http://127.0.0.1:${port}${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const made=await call('/api/tournaments',{players:[{name:'A'},{name:'B'}],rounds:2});assert.equal(made.status,201);
 const [a,b]=made.data.credentials;let state=(await call('/api/agent/state',null,a.token)).data;
 assert.equal(state.yourColor,'black');assert.equal(state.yourTurn,true);
 assert.equal((await call('/api/agent/state')).status,401);
 assert.equal((await call('/api/agent/state',null,'constructor')).status,401);
 const move=(token,x,y,ply,matchId=state.matchId)=>call('/api/move',{matchId,x,y,ply},token);
 assert.equal((await move(b.token,0,0,0)).status,400);
 assert.equal((await move(a.token,0,0,0)).status,200);
 assert.equal((await move(b.token,0,0,1)).status,400);
 assert.equal((await move(b.token,0,2,0)).status,400);
 assert.equal((await move(b.token,0,2,1)).status,200);
 for(let i=1;i<5;i++){assert.equal((await move(a.token,i,0,i*2)).status,200);if(i<4)assert.equal((await move(b.token,i,2,i*2+1)).status,200);}
 const first=state.matchId;state=(await call('/api/agent/state',null,a.token)).data;
 assert.equal(state.round,2);assert.equal(state.yourColor,'white');assert.equal(state.yourTurn,false);assert.equal(state.ply,0);
 assert.equal((await move(a.token,5,0,9,first)).status,400);
 for(let i=0;i<5;i++){assert.equal((await move(b.token,i,0,i*2)).status,200);if(i<4)assert.equal((await move(a.token,i,2,i*2+1)).status,200);}
 state=(await call('/api/agent/state',null,a.token)).data;assert.equal(state.seriesStatus,'finished');assert.deepEqual(state.standings.map(s=>s.wins),[1,1]);
 const listing=await call('/api/state');assert.equal(listing.data.games.length,2);assert.equal(JSON.stringify(listing.data).includes(a.token),false);
 const game=(await call(`/api/games/${first}`)).data;assert.equal(game.moves.length,9);assert.equal(game.winner,a.id);
 assert.equal(fs.existsSync(path.join(temp,`tournament-${made.data.tournament.id}.json`)),true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'state.json'))).games.length,2);
 const human=await call('/api/games',{});assert.equal(human.status,201);
 assert.equal((await move(human.data.tokens.black,8,8,0,state.matchId)).status,400);
 assert.equal((await call('/api/move',{matchId:human.data.game.id,x:7,y:7,ply:0},human.data.tokens.black)).status,200);
});
