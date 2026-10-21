const fs=require('fs'),R=require('./rules.js'),{decide}=require('./agent.js');
let samples=[],errors=[];
for(const g of JSON.parse(fs.readFileSync('public_replays.json'))){for(const f of g.frames){if(f.status!=='playing')continue;for(let i=0;i<2;i++){let s=structuredClone(f);s.yourPlayer=i;let t=performance.now(),out=decide(s);samples.push(performance.now()-t);if(out.commands.length>10)throw Error('budget');for(const c of out.commands)try{R.command(s,i,c);}catch(e){errors.push([g.id,f.now,c,e.message]);}}}}
console.log('replay observations',samples.length,'mean ms',samples.reduce((a,b)=>a+b)/samples.length,'max ms',Math.max(...samples),'errors',errors.slice(0,5),errors.length);
function opp(s,variant){let id=s.yourPlayer,p=s.players[id],b=s.bases[id],eb=s.bases[1-id],us=s.units.filter(u=>u.owner===id&&u.type!=='worker'),en=s.units.filter(u=>u.owner!==id),c=[],cash=p.credits;
 if(b.hp<1350&&cash>=100&&s.now-p.repairAt>=30){c.push({type:'repair'});cash-=100;}
 if(b.queue.length<2&&cash>=160&&s.units.filter(u=>u.owner===id).length+b.queue.length<40){c.push({type:'train',unit:variant===1?'raider':'tank'});cash-=variant===1?100:160;}
 if(p.level<2&&cash>=180+p.level*120&&us.length>=4)c.push({type:'upgrade'});
 let node=s.nodes.filter(n=>n.owner!==id).sort((a,z)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(z.x-b.x,z.y-b.y))[0]||eb;
 if(s.now<20)node=s.nodes[0];
 if(us.length>8)node=eb;
 c.push({type:'rally',x:node.x,y:node.y});
 let groups={};for(const u of us){const t=en.filter(e=>Math.hypot(u.x-e.x,u.y-e.y)<220).sort((a,b)=>a.hp-b.hp)[0];let key=t?t.id:'move';(groups[key]??=[]).push(u.id);}
 for(const [k,units] of Object.entries(groups))c.push(k==='move'?{type:'attackMove',units,x:node.x,y:node.y}:{type:'attack',units,target:k});
 return {commands:c.slice(0,10)};
}
for(let variant=0;variant<2;variant++)for(let seat=0;seat<2;seat++){let g=R.createMatch({players:[{name:'a'},{name:'b'}]});g.status='playing';let errs=0;let log=[];
 while(g.status==='playing'){let outs=[0,1].map(i=>i===seat?decide(R.snapshot(g,i)):opp(R.snapshot(g,i),variant));for(let i=0;i<2;i++)for(let c of outs[i].commands)try{R.command(g,i,c);}catch(e){errs++;}for(let n=0;n<20;n++)R.step(g);if(Math.round(g.now)%60===0)log.push([Math.round(g.now),g.bases.map(b=>Math.round(b.hp)),g.players.map(p=>R.score(g,p)),g.nodes.map(n=>n.owner)]);}
 console.log('sim',variant,seat,'winner',g.winner,'time',g.now,'errors',errs,'log',JSON.stringify(log));}
