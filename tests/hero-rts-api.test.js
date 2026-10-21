'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../hero-rts/server');

async function serve(t) {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(route,body,token,extraHeaders={})=>{
    const response=await fetch(base+route,{
      method:body===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...extraHeaders},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    return {status:response.status,data:await response.json()};
  };
  return {base,call};
}
const apiPlayers=[{name:'Agent A',kind:'api'},{name:'Agent B',kind:'api'}];

test('Hero RTS HTTP serves its catalog and UI, and authenticates every mutating seat',async t=>{
  const {base,call}=await serve(t);
  const health=await call('/api/health');
  assert.equal(health.status,200); assert.equal(health.data.game,'hero-rts');
  const catalog=await call('/api/catalog');
  assert.equal(catalog.status,200); assert.equal(Object.keys(catalog.data.heroes).length,10);
  const made=await call('/api/matches',{players:apiPlayers,seed:5});
  assert.equal(made.status,201);
  const {match,seats}=made.data,url=`/api/matches/${match}`;
  assert.equal(seats.length,2); assert.notEqual(seats[0].token,seats[1].token);
  assert.equal((await call(url+'/commands',{type:'start'})).status,401);
  assert.equal((await call(url+'/commands',{type:'start'},'constructor')).status,401);
  assert.equal((await call(url+'/commands',{type:'start'},seats[1].token)).status,400);
  assert.equal((await call(url+'/commands',{type:'start'},seats[0].token)).status,200);
  const observation=await call(url,undefined,seats[1].token);
  assert.equal(observation.data.yourPlayer,1);
  const enemy=observation.data.units.find(u=>u.owner===0),own=observation.data.units.find(u=>u.owner===1);
  assert.equal((await call(url+'/commands',{type:'move',units:[own.id,enemy.id],x:700,y:700},seats[1].token)).status,400);
  assert.equal((await call(url+'/commands',{type:'train',unit:'footman'},seats[1].token)).status,200);
  assert.equal((await call(url+'/commands',{type:'pause'},seats[0].token)).status,400);
  const publicState=await call(url);
  for(const seat of seats) assert.equal(JSON.stringify(publicState.data).includes(seat.token),false);
  assert.equal((await call(url,undefined,'not-a-token')).status,401);
  const other=await call('/api/matches',{count:4});
  assert.equal(other.status,201); assert.equal(other.data.state.players.length,4); assert.equal(other.data.seats.length,1);
  assert.equal((await call(`/api/matches/${other.data.match}/commands`,{type:'start'},seats[0].token)).status,401);
  assert.equal((await call(`/api/matches/${other.data.match}`,undefined,seats[0].token)).status,401);
  assert.equal((await call('/api/matches',{count:9})).status,400);
  assert.equal((await call('/api/matches',{players:[{name:'Bad',kind:'admin'},apiPlayers[1]]})).status,400);
  assert.equal((await call('/api/matches',{count:2},undefined,{Origin:'https://untrusted.example'})).status,403);
  const page=await fetch(base+'/'); assert.equal(page.status,200); assert.match(await page.text(),/<canvas/i);
  assert.equal((await fetch(base+'/simulation.js')).status,404);
  assert.equal((await fetch(base+'/../server.js')).status,404);
});

test('lockstep collects equal-tick decisions and advances once only after every seat submits',async t=>{
  const {call}=await serve(t);
  const made=await call('/api/matches',{players:apiPlayers,mode:'lockstep',seed:11});
  assert.equal(made.status,201);
  const {match,seats}=made.data,url=`/api/matches/${match}`;
  assert.equal((await call(url+'/commands',{type:'start'},seats[0].token)).status,200);
  let initial=(await call(url,undefined,seats[0].token)).data;
  assert.equal(initial.tick,0);
  const own=initial.units.find(u=>u.owner===0&&u.type==='footman');
  const action={type:'move',units:[own.id],x:own.x+100,y:own.y};
  assert.equal((await call(url+'/commands',action,seats[0].token)).status,400);
  assert.equal((await call(url+'/decisions',{tick:0,commands:[action]})).status,401);
  const first=await call(url+'/decisions',{tick:0,commands:[action]},seats[0].token);
  assert.equal(first.status,200); assert.equal(first.data.accepted,true);
  assert.deepEqual(first.data.waiting,[1]);
  const waiting=(await call(url,undefined,seats[1].token)).data;
  assert.equal(waiting.tick,0); assert.equal(waiting.now,initial.now);
  assert.deepEqual(waiting.units,initial.units,'the first strategy must not execute while the second is deciding');
  assert.equal((await call(url+'/decisions',{tick:0,commands:[]},seats[0].token)).status,409);
  assert.equal((await call(url+'/decisions',{tick:1,commands:[]},seats[1].token)).status,409);
  const second=await call(url+'/decisions',{tick:0,commands:[]},seats[1].token);
  assert.equal(second.status,200); assert.deepEqual(second.data.waiting,[]);
  const advanced=(await call(url,undefined,seats[0].token)).data;
  assert.equal(advanced.tick,5);
  assert.ok(Math.abs(advanced.now-.25)<1e-9);
  const moved=advanced.units.find(u=>u.id===own.id);
  assert.ok(moved.x!==own.x||moved.y!==own.y,'a committed move must execute');
  assert.equal((await call(url+'/decisions',{tick:0,commands:[]},seats[0].token)).status,409);
  const oversized=Array.from({length:21},()=>({type:'stop',units:[own.id]}));
  assert.equal((await call(url+'/decisions',{tick:5,commands:oversized},seats[0].token)).status,400);
  const unchanged=(await call(url,undefined,seats[0].token)).data;
  assert.equal(unchanged.tick,5);
  assert.equal((await call(url+'/decisions',{tick:5,commands:[]},seats[0].token)).status,200);
  assert.equal((await call(url+'/decisions',{tick:5,commands:[]},seats[1].token)).status,200);
  assert.equal((await call(url)).data.tick,10,'invalid submissions must not consume a player decision');
});

test('one invalid lockstep command does not grant control over an opponent or block the round',async t=>{
  const {call}=await serve(t);
  const made=await call('/api/matches',{players:apiPlayers,mode:'lockstep',seed:19});
  const {match,seats}=made.data,url=`/api/matches/${match}`;
  await call(url+'/commands',{type:'start'},seats[0].token);
  const initial=(await call(url)).data,enemy=initial.units.find(u=>u.owner===1&&u.type==='footman');
  await call(url+'/decisions',{tick:0,commands:[{type:'move',units:[enemy.id],x:999,y:999}]},seats[0].token);
  const committed=await call(url+'/decisions',{tick:0,commands:[]},seats[1].token);
  assert.equal(committed.status,200);
  const state=(await call(url)).data;
  assert.equal(state.tick,5);
  assert.deepEqual(state.units.find(u=>u.id===enemy.id).order,enemy.order);
  assert.ok(state.lastDecision.errors[0].length>0,'rejected instructions must be reported to the strategy');
});
