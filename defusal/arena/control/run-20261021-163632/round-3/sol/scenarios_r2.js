'use strict';
const sim=require('./simulation');const {spawn}=require('child_process');const readline=require('readline');
class Client{
 constructor(){this.p=spawn('python3',['-u','agent.py'],{cwd:'/workspace'});this.q=[];this.max=0;readline.createInterface({input:this.p.stdout}).on('line',l=>{const q=this.q.shift();clearTimeout(q.timer);this.max=Math.max(this.max,performance.now()-q.start);q.resolve(JSON.parse(l));});this.p.stderr.on('data',b=>process.stderr.write(b));}
 ask(o){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),4900);this.q.push({resolve,timer,start:performance.now()});this.p.stdin.write(JSON.stringify(o)+'\n');});}close(){this.p.kill();}
}
const neutral=()=>Array.from({length:20},()=>Array.from({length:5},()=>({dir:'N',aim:'N'})));
async function scenario(seed,kind){const g=sim.createMatch({seed,players:[{name:'us',kind:'api'},{name:'script',kind:'api'}]});const c=new Client();
try{
 sim.submitBuys(g,0,[]);sim.submitBuys(g,1,[]);
 if(kind==='defuse'){g.sides={0:'defend',1:'attack'};for(const u of g.units)if(u.team===0){u.x=27.5;u.y=3.5;u.kit=true;}}
 if(kind!=='advance'){
 g.bomb={state:'planted',carrier:null,x:10.5,y:8.5,site:'A',timer:40,defuseProgress:0,defuserId:null};
 }
 if(kind==='guard'){
 for(const u of g.units){u.alive=u.team===0?u.index<2:u.index===0;if(u.team===0){u.x=10.5+u.index*2;u.y=8.5;u.armor=100;u.weapon='rifle';u.mag=30;}else{u.x=14.5;u.y=8.5;u.kit=true;u.armor=100;}}
 }else for(const u of g.units)if(u.team===1){u.mag=0;u.reserve=0;u.alive=u.index===0;u.x=53.5;u.y=31.5;}
 let windows=0,planted=false;
 while(g.status==='playing'&&g.round===1&&windows<105){
 const o=sim.view(g,0);o.side=g.sides[0];const a=await c.ask(o);const other=neutral();
 if(kind==='guard'){
 const e=g.units.find(u=>u.team===1&&u.alive);
 if(e){let x=e.x,y=e.y;for(let f=0;f<20;f++){let dx=g.bomb.x-x,dy=g.bomb.y-y;let d=dx*dx+dy*dy<.65?'N':Math.abs(dx)>Math.abs(dy)?(dx<0?'L':'R'):(dy<0?'U':'D');other[f][0]={dir:d,aim:'L'};if(d==='L')x-=.15;if(d==='R')x+=.15;if(d==='U')y-=.15;if(d==='D')y+=.15;}}
 }
 sim.advanceWindow(g,[sim.submitWindow(g,0,a.inputs),sim.submitWindow(g,1,other)]);windows++;
 if(kind==='advance'&&g.bomb.state==='planted'){planted=true;break;}
 }
 return {seed,kind,windows,pass:kind==='advance'?planted:g.roundLog[0]?.winnerTeam===0,reason:g.roundLog[0]?.reason||g.bomb.state,maxMs:c.max};
}finally{c.close();}}
(async()=>{for(const kind of ['advance','defuse','guard'])for(const seed of [1,2,7,17,42,101,202,303])console.log(JSON.stringify(await scenario(seed,kind)));})().catch(e=>{console.error(e);process.exit(1)});
