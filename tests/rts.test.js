'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMatch,command,step,snapshot,spawn}=require('../rts/simulation');
const make=(kind='api')=>createMatch({players:[{name:'A',kind},{name:'B',kind}]});
function run(g,seconds){for(let n=0;n<seconds*20;n++)step(g);}
test('RTS command ownership and economy are authoritative and atomic',()=>{
 const g=make();command(g,0,{type:'start'});
 const before=structuredClone(snapshot(g)),enemy=g.units.find(u=>u.owner===1);
 assert.throws(()=>command(g,0,{type:'move',units:[g.units[0].id,enemy.id],x:600,y:400}));
 assert.deepEqual(g.units,before.units); // Also verify the own unit's original order, not just return code.
 assert.equal(g.units[0].order.type,'gather');
 assert.throws(()=>command(g,0,{type:'attackMove',units:[g.units[0].id],x:NaN,y:0}));
 command(g,0,{type:'train',unit:'tank'});assert.equal(g.players[0].credits,100);
 assert.throws(()=>command(g,0,{type:'train',unit:'tank'}));assert.equal(g.players[0].credits,100);
 run(g,13);assert.equal(g.units.filter(u=>u.owner===0&&u.type==='tank').length,1);
 assert.ok(g.players[0].mined>0);assert.ok(g.mines[0].ore<2200);
});
test('RTS depleted mine returns only its real remaining ore',()=>{
 const g=make();g.units=g.units.filter(u=>u.owner===0&&u.type==='worker').slice(0,1);
 const u=g.units[0],m=g.mines[0];g.mines=[m];m.ore=1;u.x=m.x;u.y=m.y;u.order={type:'gather',target:m.id};
 command(g,0,{type:'start'});run(g,30);
 assert.ok(Math.abs(g.players[0].mined-1)<1e-6);assert.ok(g.players[0].credits<=260+45+1.001);
});
test('RTS captures, contested stations and pause preserve intended timing',()=>{
 const g=make(),n=g.nodes[0];g.units=[];const u=spawn(g,0,'rifle',n.x,n.y);
 command(g,0,{type:'start'});run(g,9);assert.equal(n.owner,0);
 const v=spawn(g,1,'tank',n.x+30,n.y);u.hp=v.hp=1e6;
 run(g,2);assert.equal(n.contested,true);assert.equal(n.owner,0);
 assert.throws(()=>command(g,0,{type:'pause'}));
 const solo=createMatch({players:[{name:'Human',kind:'human'},{name:'Bot',kind:'bot'}]});
 command(solo,0,{type:'start'});run(solo,3);command(solo,0,{type:'pause'});
 const fixed=JSON.stringify(snapshot(solo));run(solo,30);assert.equal(JSON.stringify(snapshot(solo)),fixed);
 command(solo,0,{type:'pause'});step(solo);assert.ok(solo.now>3);
});
test('RTS base defeat clears that army and ends battle; finished state is immutable',()=>{
 const g=make();command(g,0,{type:'start'});g.bases[1].hp=1;g.units=[];
 spawn(g,0,'tank',g.bases[1].x-70,g.bases[1].y);step(g);
 assert.equal(g.status,'finished');assert.equal(g.winner,0);assert.equal(g.players[1].alive,false);
 const final=JSON.stringify(snapshot(g));run(g,5);assert.equal(JSON.stringify(snapshot(g)),final);
 assert.throws(()=>command(g,0,{type:'train',unit:'rifle'}));
});
test('RTS eight-player match stays inside map and bot battle resolves deterministically',()=>{
 const many=createMatch({players:Array.from({length:8},(_,i)=>({name:'P'+i,kind:'bot'}))});command(many,0,{type:'start'});run(many,20);
 assert.equal(many.players.length,8);for(const u of many.units){assert.ok(Number.isFinite(u.x)&&u.x>=15&&u.x<=1265);assert.ok(u.y>=15&&u.y<=825);}
 const a=make('bot'),b=make('bot');command(a,0,{type:'start'});command(b,0,{type:'start'});
 run(a,601);run(b,601);assert.equal(a.status,'finished');assert.equal(JSON.stringify(snapshot(a)),JSON.stringify(snapshot(b)));
 assert.ok(a.players.some(p=>p.damage>1700));assert.ok(a.players.some(p=>p.kills>0));assert.ok(a.players.some(p=>p.controlTime>0));
 console.log('RTS bot match:',Math.round(a.now),'seconds; winner',a.winner,'reason',a.reason);
});
