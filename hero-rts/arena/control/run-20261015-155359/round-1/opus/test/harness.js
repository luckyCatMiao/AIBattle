// 离线对战：node test/harness.js <mySeat 0|1> [opponent=sol|idle|rush] [maxSeconds]
const sim=require('../simulation.js');const {spawn}=require('child_process');const readline=require('readline');
const mySeat=+(process.argv[2]||0),opp=process.argv[3]||'sol',maxT=+(process.argv[4]||600);
const players=[0,1].map(i=>({name:'P'+i,kind:'api',hero:i===mySeat?'pyromancer':(opp==='rush'?'guardian':'druid')}));
const g=sim.createMatch({id:'t',players,seed:1});sim.command(g,0,{type:'start'});
const proc=spawn('python3',['agent.py'],{cwd:__dirname+'/..',stdio:['pipe','pipe','inherit']});
const rl=readline.createInterface({input:proc.stdout});const lines=[];let waiter=null;
rl.on('line',l=>{if(waiter){const w=waiter;waiter=null;w(l);}else lines.push(l);});
const next=()=>new Promise(r=>lines.length?r(lines.shift()):waiter=r);
// Sol-like bot
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);const mem={};
function bot(o,s){const c=[];const p=g.players[o];const mine=g.units.filter(u=>u.owner===o);const myb=g.buildings.filter(b=>b.owner===o);
 const th=myb.find(b=>b.type==='townhall');if(!th)return c;const D=th.x<1600?1:-1;const en=g.units.filter(u=>u.owner!==o&&u.owner>=0);
 const wk=mine.filter(u=>u.type==='worker');const q=t=>myb.reduce((n,b)=>n+b.queue.filter(x=>x.type===t).length,0);
 const free=(t,x,y)=>{for(let r=0;r<400;r+=25)for(let a=0;a<12;a++){const X=x+Math.cos(a*.52)*r,Y=y+Math.sin(a*.52)*r;try{const cp={gold:p.gold,wood:p.wood};sim.command(g,o,{type:'build',building:t,units:[wk[(mem.bi=(mem.bi||0)+1)%wk.length].id],x:X,y:Y});return true;}catch(e){if(/资源/.test(e.message))return false;}}return false;};
 if(opp==='idle')return c;
 for(const u of wk)if(u.order.type==='hold'||(!u._as&&g.now>5)){u._as=1;const woodN=wk.filter(w=>w.gatherKind==='wood').length;const res=g.resources.filter(r=>r.kind===(woodN<6?'wood':'gold')&&r.amount>0).sort((a,b)=>dist(a,th)-dist(b,th))[0];if(res&&u.order.type==='hold'||woodN<6&&u.gatherKind!=='wood'&&res)c.push({type:'gather',units:[u.id],target:res.id});}
 if(wk.length+q('worker')<18&&th.queue.length<1)c.push({type:'train',unit:'worker'});
 const rng=myb.filter(b=>b.type==='range');
 if(opp==='sol'){
  if(!rng.length&&!mem.r1){mem.r1=free('range',th.x+D*150,th.y+150);}
  if(s>60&&rng.length<3&&!mem['r'+rng.length+'t']&&p.gold>200){if(free('range',th.x+D*100,th.y-300+rng.length*120))mem['r'+rng.length+'t']=1;}
  if(s>50&&!myb.some(b=>b.type==='arcane')&&p.gold>200)free('arcane',th.x+D*60,th.y+330);
  for(const b of rng)if(b.complete&&b.queue.length<2)c.push({type:'train',unit:'archer',building:b.id});
  for(const b of myb.filter(b=>b.type==='arcane'&&b.complete))if(b.queue.length<1&&mine.filter(u=>u.type==='priest').length<6)c.push({type:'train',unit:'priest',building:b.id});
  if(s>83&&p.heroes.length<2)c.push({type:'summon',hero:'frost'});if(s>135&&p.heroes.length<3)c.push({type:'summon',hero:'pyromancer'});
 } else {
  const br=myb.filter(b=>b.type==='barracks');if(br.length<3&&p.gold>200)free('barracks',th.x+D*150,th.y-250+br.length*200);
  for(const b of br)if(b.complete&&b.queue.length<2)c.push({type:'train',unit:'footman',building:b.id});
 }
 if(sim.popCap(g,o)-sim.population(g,o)<8&&!myb.some(b=>b.type==='farm'&&!b.complete))free('farm',th.x-D*150,th.y+(myb.length%2?300:-300));
 for(const h of p.heroes)if(h.dead&&!h.queued&&g.now>=h.respawnAt)c.push({type:'revive',hero:h.type});
 const army=mine.filter(u=>u.type!=='worker');const et=g.buildings.find(b=>b.owner!==o&&b.type==='townhall');
 const arch=army.filter(u=>u.type==='archer'||u.type==='footman').length;
 const attack=opp==='sol'?(s>140&&arch>=20):(s>40);
 const tgt=attack?et:{x:th.x+D*(s<140?900:600),y:th.y};
 for(const u of army){if(u.attack||u.casting)continue;if(u.order.type==='attackMove'&&dist(u.order,tgt)<100)continue;if(u.order.type==='hold'&&dist(u,tgt)<200&&!attack)continue;c.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});}
 for(const u of army){if(u.type==='archer'&&(u.cooldowns.u_rapid||0)<=g.now&&en.some(e=>dist(e,u)<260))c.push({type:'cast',unit:u.id,skill:'u_rapid'});
  if(u.type==='frost'){const e=en.filter(e=>dist(e,u)<330)[0];if(e&&(u.cooldowns.f_cone||0)<=g.now&&u.mana>35)c.push({type:'cast',unit:u.id,skill:'f_cone',x:e.x,y:e.y});}
  if(u.type==='druid'){const e=en.filter(e=>dist(e,u)<540)[0];if(e&&(u.cooldowns.d_root||0)<=g.now&&u.mana>35)c.push({type:'cast',unit:u.id,skill:'d_root',target:e.id});else if(e&&(u.cooldowns.d_trees||0)<=g.now&&u.mana>70)c.push({type:'cast',unit:u.id,skill:'d_trees',x:u.x+D*100,y:u.y});}
  if(u.type==='pyromancer'){const e=en.filter(e=>dist(e,u)<540)[0];if(e&&(u.cooldowns.p_flame||0)<=g.now&&u.mana>35)c.push({type:'cast',unit:u.id,skill:'p_flame',x:e.x,y:e.y});}
 }
 return c.slice(0,40);
}
(async()=>{let errs=[],maxMs=0;const myErrs=[];
 while(g.status==='playing'&&g.now<maxT){
  const st={...sim.snapshot(g,mySeat),lastErrors:errs,decisionSeconds:.25,maxCommands:20};
  const t0=Date.now();proc.stdin.write(JSON.stringify(st)+'\n');const line=await next();maxMs=Math.max(maxMs,Date.now()-t0);
  const out=JSON.parse(line);if(!Array.isArray(out.commands)||out.commands.length>20)throw Error('bad output');
  const oc=bot(1-mySeat,g.now);errs=[];
  const seats=[[mySeat,out.commands],[1-mySeat,oc]].sort((a,b)=>a[0]-b[0]);
  for(const [seat,cs] of seats)for(const c of cs){try{sim.command(g,seat,c);}catch(e){if(seat===mySeat){errs.push({command:c,error:e.message});myErrs.push(e.message);}}}
  for(let i=0;i<5;i++)sim.step(g);
  if(Math.round(g.now*4)%(process.env.EV?+process.env.EV:120)===0){const s=[0,1].map(o=>{const us=g.units.filter(u=>u.owner===o);const c={};us.forEach(u=>c[u.type]=(c[u.type]||0)+1);const th=g.buildings.filter(b=>b.owner===o&&b.type==='townhall').map(b=>Math.round(b.hp));const h=us.find(u=>u.hero);return `P${o} g${Math.floor(g.players[o].gold)} w${Math.floor(g.players[o].wood)} th${th} L${h?h.level:'-'} ${JSON.stringify(c)}`;});console.log(Math.round(g.now),s.join(' | '));}
 }
 const cnt={};myErrs.forEach(e=>cnt[e]=(cnt[e]||0)+1);
 console.log('END',g.status,'winner',g.winner,'t',g.now.toFixed(1),'scores',g.players.map(p=>sim.score(g,p)),'maxMs',maxMs,'errors',JSON.stringify(cnt));proc.kill();process.exit(0);
})();
