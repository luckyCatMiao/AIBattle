'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMatch,command,snapshot}=require('../rts/simulation');
const {applyBatch,action}=require('../rts/arena/arena');
test('Arena enforces the same ownership and budgets and forbids player clock control',()=>{
 const g=createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});command(g,0,{type:'start'});
 const own=g.units[0],enemy=g.units.find(u=>u.owner===1),before=structuredClone(enemy);
 const errors=applyBatch(g,[[{type:'pause'},{type:'move',units:[enemy.id],x:20,y:20},{type:'train',unit:'tank'},{type:'train',unit:'tank'}],Array.from({length:12},()=>({type:'rally',x:800,y:420}))]);
 assert.equal(g.paused,false);assert.deepEqual(enemy,before);assert.equal(g.players[0].credits,100);
 assert.equal(errors[0].length,3);assert.equal(errors[1].length,2);assert.equal(own.owner,0);
});
test('Arena observations are detached and a decision advances twenty continuous physics ticks',()=>{
 const a=action({type:'create',id:'test-arena',players:['A','B']}).state;
 const b=action({type:'advance',commands:[[{type:'train',unit:'worker'}],[]]}).state;
 assert.equal(a.tick,0);assert.equal(a.bases[0].queue.length,0);
 assert.equal(b.tick,20);assert.ok(Math.abs(b.now-1)<1e-9);assert.equal(b.bases[0].queue.length,1);
 assert.ok(b.bases[0].queue[0].remaining<3.01);assert.ok(b.units.some((u,i)=>u.x!==a.units[i].x||u.y!==a.units[i].y));
});
test('Spectator HTTP cannot mutate matches or expose private strategy files',async t=>{
 const {spawn}=require('node:child_process'),net=require('node:net'),path=require('node:path');
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,[path.join(__dirname,'../rts/arena/arena.js')],{windowsHide:true,env:{...process.env,ARENA_PORT:String(port)},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),5000);child.once('error',reject);child.stderr.once('data',()=>{clearTimeout(timer);resolve();});});
 const base=`http://127.0.0.1:${port}`;
 assert.equal((await fetch(base+'/')).status,200);
 assert.equal((await fetch(base+'/api/arena',{method:'POST',body:'{}'})).status,405);
 for(const file of ['/players/sol/entry.json','/control/status.json','/../isolate.py'])assert.equal((await fetch(base+file)).status,404);
 const response=new Promise(r=>child.stdout.once('data',data=>r(JSON.parse(data.toString()))));
 child.stdin.write(JSON.stringify({type:'create',id:'public-test',players:['A','B']})+'\n');await response;
 const s=await (await fetch(base+'/api/matches/public-test?frame=0')).json();
 assert.equal(s.tick,0);assert.equal(s.yourPlayer,null);assert.equal(s.players.length,2);
});
