'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib');
const {handleArena}=require('../hero-rts/arena/http');
const {action}=require('../hero-rts/arena/referee');

test('hero tournament uses self-selected heroes and equal quarter-second decision windows',()=>{
 const first=action({type:'create',id:'r1-g1',players:[{name:'A',hero:'frost'},{name:'B',hero:'oracle'}]}).state;
 assert.equal(first.players[0].heroes[0].type,'frost');assert.equal(first.players[1].heroes[0].type,'oracle');assert.equal(first.catalog,undefined);
 const enemy=first.units.find(u=>u.owner===1&&u.hero),before=enemy.x;
 const next=action({type:'advance',commands:[[{type:'move',units:[enemy.id],x:100,y:100},{type:'train',unit:'worker'}],[]]});
 assert.equal(next.state.tick,5);assert.equal(next.state.now,.25);assert.equal(next.errors[0].length,1);assert.equal(next.state.units.find(u=>u.id===enemy.id).x,before);
 assert.ok(next.state.buildings.some(b=>b.owner===0&&b.queue.some(q=>q.type==='worker')));
 assert.throws(()=>action({type:'advance',commands:[Array(21).fill({type:'stop'}),[]]}));
 assert.equal(action({type:'advance',commands:[[],[]]}).state.tick,10);
});

test('replay archive serves compressed complete games and only public allowlisted resources',async t=>{
 const control=fs.mkdtempSync(path.join(os.tmpdir(),'hero-replay-')),run='run-20261015-123456',folder=path.join(control,run);
 fs.mkdirSync(path.join(folder,'round-1','luna'),{recursive:true});
 const server=http.createServer((req,res)=>{if(!handleArena(req,res,new URL(req.url,'http://localhost'),control)){res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(control,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+server.address().port;
 assert.deepEqual((await (await fetch(url+'/api/arena')).json()).games,[]);
 fs.writeFileSync(path.join(control,'status.json'),JSON.stringify({run,round:1,models:{luna:'gpt-6-luna'},games:[{id:'r1-g1'}]}));
 const record={id:'r1-g1',frames:[{now:0,tick:0},{now:.25,tick:5}],final:{tick:5},seats:['luna','sol']};
 fs.writeFileSync(path.join(folder,'r1-g1.json.gz'),zlib.gzipSync(JSON.stringify(record)));
 fs.writeFileSync(path.join(folder,'round-1','luna','review.md'),'这是中文策略说明');
 fs.writeFileSync(path.join(folder,'postmatch-luna.md'),'这是中文复盘');
 fs.writeFileSync(path.join(folder,'secret.json'),'private source');
 const response=await fetch(url+'/api/arena/games/r1-g1');assert.equal(response.headers.get('content-encoding'),'gzip');assert.deepEqual(await response.json(),record);
 const review=await (await fetch(url+'/api/arena/reviews/luna')).text();assert.match(review,/中文策略说明/);assert.match(review,/中文复盘/);
 for(const route of ['/api/arena/games/secret','/api/arena/games/r1-g2','/api/arena/reviews/sol/entry.json','/api/arena/games/%2e%2e%2fsecret'])assert.equal((await fetch(url+route)).status,404,route);
 assert.equal((await fetch(url+'/api/arena',{method:'POST'})).status,405);
 // Pinning an archived run must not follow a new active series with the same game ID.
 const historical={run,round:1,models:{luna:'gpt-6-luna',sol:'gpt-6.1-sol'},games:[{id:'r1-g1'}],completed:true};
 fs.writeFileSync(path.join(folder,'status.json'),JSON.stringify(historical));
 const nextRun='run-20261015-234500',nextFolder=path.join(control,nextRun),active={run:nextRun,round:1,models:{opus:'claude-opus-5-5',sol:'gpt-6.1-sol'},games:[{id:'r1-g1'}],completed:false};
 fs.mkdirSync(path.join(nextFolder,'round-1','opus'),{recursive:true});
 fs.writeFileSync(path.join(nextFolder,'status.json'),JSON.stringify(active));fs.writeFileSync(path.join(control,'status.json'),JSON.stringify(active));
 fs.writeFileSync(path.join(nextFolder,'round-1','opus','review.md'),'Opus 中文策略');
 const nextRecord={...record,seats:['opus','sol']};fs.writeFileSync(path.join(nextFolder,'r1-g1.json.gz'),zlib.gzipSync(JSON.stringify(nextRecord)));
 const list=await (await fetch(url+'/api/arena/runs')).json();assert.equal(list.activeRun,nextRun);assert.deepEqual(list.runs.map(r=>r.run),[nextRun,run]);
 assert.equal((await (await fetch(url+'/api/arena')).json()).models.opus,'claude-opus-5-5');
 assert.deepEqual(await (await fetch(url+'/api/arena?run='+run)).json(),historical);
 assert.deepEqual(await (await fetch(url+'/api/arena/games/r1-g1?run='+run)).json(),record);
 assert.deepEqual(await (await fetch(url+'/api/arena/games/r1-g1?run='+nextRun)).json(),nextRecord);
 assert.match(await (await fetch(url+'/api/arena/reviews/opus?run='+nextRun)).text(),/Opus 中文策略/);
 // During the next preparation window, the previous round remains readable.
 fs.writeFileSync(path.join(nextFolder,'status.json'),JSON.stringify({...active,round:2}));
 assert.match(await (await fetch(url+'/api/arena/reviews/opus?run='+nextRun)).text(),/第 1 轮/);
 fs.mkdirSync(path.join(nextFolder,'round-2','opus'),{recursive:true});
 fs.writeFileSync(path.join(nextFolder,'round-2','opus','review.md'),'第二轮实际改进');
 const continuedReview=await (await fetch(url+'/api/arena/reviews/opus?run='+nextRun)).text();
 assert.match(continuedReview,/Opus 中文策略/);assert.match(continuedReview,/第 2 轮/);assert.match(continuedReview,/第二轮实际改进/);
 assert.equal((await fetch(url+'/api/arena/reviews/opus?run='+run)).status,404);
 assert.equal((await fetch(url+'/api/arena?run=..%2Fprivate')).status,400);
 assert.equal((await fetch(url+'/api/arena?run=run-20261015-000000')).status,404);
});
