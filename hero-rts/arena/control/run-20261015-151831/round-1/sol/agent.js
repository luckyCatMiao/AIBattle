'use strict';
const readline=require('readline');
const D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function makeAgent(){
 let scouts={},builtAt=-100,assigned=false, phase='capture';
 return function decide(s){
 const C=s.catalog, me=s.yourPlayer,p=s.players.find(p=>p.id===me),now=s.now;
 if(!p||!p.alive||s.status!=='playing')return {commands:[]};
 const us=s.units.filter(u=>u.owner===me&&u.hp>0),bs=s.buildings.filter(b=>b.owner===me&&b.hp>0), foes=s.units.filter(u=>u.owner!==me&&u.hp>0), eb=s.buildings.filter(b=>b.owner!==me&&b.hp>0),home=bs.find(b=>b.type==='townhall'&&b.complete)||bs[0];
 if(!home)return {commands:[]};
 const dir=home.x<1600?1:-1, def=u=>C.heroes[u.type]||C.units[u.type]||C.summons[u.type]||C.buildings[u.type],commands=[],acted=new Set();
 let gold=p.gold,wood=p.wood,pop=p.population;
 function push(c){if(commands.length>=20)return false;commands.push(c);return true;}
 function spend(cost,c){if(gold<cost.gold||wood<cost.wood)return false;if(!push(c))return false;gold-=cost.gold;wood-=cost.wood;return true;}
 function order(u,type,q){if(acted.has(u.id)||u.casting||u.attack)return false;const o=u.order||{};if(o.type===type&&(q.target?o.target===q.target:D(o,q)<35))return false;if(push({type,units:[u.id],...q})){acted.add(u.id);return true;}return false;}
 function cast(u,id,q={}){const a=C.skills[id];if(!a||acted.has(u.id)||u.casting||u.attack||u.level<a.requiredLevel||u.mana<a.mana||(u.cooldowns[id]||0)>now||(u.statuses.stun||0)>now||(u.statuses.silence||0)>now)return false;
 const t=q.target?[...s.units,...s.buildings].find(v=>v.id===q.target):q.x!==undefined?q:u;if(!t||D(u,t)>a.range+(t.r||0))return false;
 if(push({type:'cast',unit:u.id,skill:id,...q})){acted.add(u.id);return true;}return false;}
 const worker=us.filter(u=>u.type==='worker'),army=us.filter(u=>u.type!=='worker'&&!u.summoned),complete=t=>bs.filter(b=>b.type===t&&b.complete),count=t=>bs.filter(b=>b.type===t&&(b.complete||worker.some(u=>u.order.type==='build'&&u.order.target===b.id))).length,queued=t=>bs.reduce((n,b)=>n+b.queue.filter(q=>q.type===t).length,0),num=t=>us.filter(u=>u.type===t).length+queued(t);
 function train(t){const d=C.units[t];const b=complete(d.producer).filter(b=>b.queue.length<2).sort((a,b)=>a.queue.length-b.queue.length)[0];if(!b||p.tier<d.tier||pop+d.pop>p.popCap||us.length+bs.reduce((n,b)=>n+b.queue.length,0)>=98)return false;
 if(spend(d.cost,{type:'train',unit:t,building:b.id})){pop+=d.pop;b.queue.push({type:t,kind:'unit'});return true;}return false;}
 function blocked(pt,r){return pt.x<r+8||pt.x>3200-r-8||pt.y<r+8||pt.y>2000-r-8||s.map.obstacles.some(o=>pt.x>o.x-r&&pt.x<o.x+o.w+r&&pt.y>o.y-r&&pt.y<o.y+o.h+r)||s.buildings.some(b=>b.hp>0&&D(b,pt)<b.r+r+4);}
 function build(t,preferred){const d=C.buildings[t];if(now-builtAt<.75||bs.length>=39||gold<d.cost.gold||wood<d.cost.wood)return false;
 const builders=worker.filter(u=>u.order.type!=='build'&&!acted.has(u.id));if(!builders.length)return false;
 let pt=null;const center=preferred||{x:home.x+dir*190,y:home.y};
 for(let ring=0;ring<9&&!pt;ring++)for(let j=0;j<16;j++){const a=j*Math.PI/8,v={x:center.x+Math.cos(a)*ring*85,y:center.y+Math.sin(a)*ring*85};if(!blocked(v,d.r+12)&&!s.buildings.some(b=>b.hp>0&&D(b,v)<b.r+d.r+85)&&!s.units.some(u=>u.hp>0&&D(u,v)<u.r+d.r+18)&&!s.resources.some(r=>r.amount>0&&D(r,v)<r.r+d.r+20)&&!s.nodes.some(n=>D(n,v)<n.r+d.r)&&!foes.some(u=>D(u,v)<u.r+d.r+120)){pt=v;break;}}
 if(!pt)return false;const u=builders.sort((a,b)=>D(a,pt)-D(b,pt))[0];if(spend(d.cost,{type:'build',building:t,units:[u.id],...pt})){acted.add(u.id);builtAt=now;return true;}return false;}
 const nearestNode=s.nodes.slice().sort((a,b)=>D(home,a)-D(home,b))[0];
 const threats=foes.filter(u=>u.owner>=0&&D(u,home)<800),boss=s.units.find(u=>u.type==='ancient');
 if(!assigned){const fs=army.filter(u=>u.type==='footman');if(fs.length>=2){scouts[fs[0].id]={node:s.nodes.find(n=>n.y<400).id,step:0};scouts[fs[1].id]={node:s.nodes.find(n=>n.y>1600).id,step:0};assigned=true;}}
 for(const id of Object.keys(scouts))if(!us.some(u=>u.id===id))delete scouts[id];
 // Preserve two cheap scouts for the two distant outer shrines.
 if(now>80&&Math.floor(now*4)%12===0){for(const node of s.nodes.filter(n=>n.y<400||n.y>1600)){if(node.owner!==me&&!Object.values(scouts).some(v=>v.node===node.id)){
 const u=army.filter(u=>!u.hero&&!scouts[u.id]&&u.type!=='priest'&&u.type!=='mortar').sort((a,b)=>D(a,node)-D(b,node))[0];if(u)scouts[u.id]={node:node.id,step:0};}}}
 const main=army.filter(u=>!scouts[u.id]);const center=main.length?{x:main.reduce((a,u)=>a+u.x,0)/main.length,y:main.reduce((a,u)=>a+u.y,0)/main.length}:nearestNode;
 const nearEnemies=foes.filter(u=>u.owner>=0&&D(u,center)<650);
 let goal=nearestNode;
 if(threats.length>2&&D(center,home)>400)goal=threats.sort((a,b)=>D(a,home)-D(b,home))[0];
 else if(nearestNode.owner!==me)goal=nearestNode;
 else {
 const camps=s.camps.filter(c=>!c.cleared&&c.id!=='boss'&&D(c,home)<950);
 if(camps.length&&main.length>=7&&nearEnemies.length===0&&now<200)goal=camps.sort((a,b)=>D(a,center)-D(b,center))[0];
 else if(boss&&main.length>=13)goal=boss;
 else {const targets=s.nodes.filter(n=>n.owner!==me&&!Object.values(scouts).some(v=>v.node===n.id)&&(!boss||D(n,boss)>420&&(main.length>=13||(n.x-1600)*dir<0)));
 if(targets.length)goal=targets.sort((a,b)=>D(a,center)-D(b,center))[0];
 else if(main.length>=18||now>500)goal=eb.filter(b=>b.type==='townhall').sort((a,b)=>D(a,center)-D(b,center))[0]||nearestNode;
 else goal={x:nearestNode.x+dir*120,y:nearestNode.y};
 }}
 // Skills, safe movement, and focused fire.
 for(const u of us.filter(u=>u.type!=='worker').sort((a,b)=>(b.hero?1:0)-(a.hero?1:0))){
 if(commands.length>=16)break;if(u.casting||u.attack)continue;
 const d=def(u),local=[...foes,...eb].filter(v=>D(u,v)<700),danger=local.filter(v=>D(u,v)<(def(v).range||35)+v.r+u.r+65),hurt=us.filter(v=>D(u,v)<500&&v.maxHp-v.hp>90).sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp));
 // Leave hostile delayed zones before their next pulse.
 const z=s.zones.find(z=>z.owner!==me&&z.kind!=='sanctuary'&&z.endsAt>now&&D(u,z)<z.radius+u.r+18);
 if(z&&(!scouts[u.id]||danger.length)){const dd=Math.max(1,D(u,z)),q={x:clamp(z.x+(u.x-z.x)/dd*(z.radius+u.r+55),30,3170),y:clamp(z.y+(u.y-z.y)/dd*(z.radius+u.r+55),30,1970)};if(!blocked(q,u.r)){order(u,'move',q);continue;}}
 const target=local.filter(v=>D(u,v)<(d.range||35)+v.r+20&&(!def(v).flying||d.antiAir||u.hero&&d.range>=100||(v.statuses.grounded||0)>now)).sort((a,b)=>(a.hp+(a.shield||0))/(a.hero?1.4:1)-(b.hp+(b.shield||0))/(b.hero?1.4:1))[0];
 const nearest=local.slice().sort((a,b)=>D(u,a)-D(u,b))[0];
 if(u.hero){
 if(u.type==='druid'){
 if(hurt.length&&hurt.reduce((n,v)=>n+(D(v,hurt[0])<160?v.maxHp-v.hp:0),0)>180&&cast(u,'d_heal',{x:hurt[0].x,y:hurt[0].y}))continue;
 if(nearest&&D(u,nearest)<550&&cast(u,'d_trees',{x:u.x+dir*90,y:u.y}))continue;
 if(nearest&&D(u,nearest)<550&&cast(u,'d_root',{target:nearest.id}))continue;
 if(hurt.length>2&&cast(u,'d_growth',{x:u.x,y:u.y}))continue;
 }
 if(u.type==='oracle'){
 if(hurt.length>3&&cast(u,'o_renew',{x:hurt[0].x,y:hurt[0].y}))continue;
 if(hurt.length&&cast(u,'o_heal',{target:hurt[0].id}))continue;
 if(danger.length&&cast(u,'o_shield',{x:u.x,y:u.y}))continue;
 }
 if(['frost','pyromancer','ranger'].includes(u.type)&&nearest){
 const cluster=local.filter(v=>D(v,u)<530).sort((a,b)=>local.filter(v=>D(v,b)<130).length-local.filter(v=>D(v,a)<130).length)[0]||nearest;
 const ids=u.type==='frost'?['f_blizzard','f_root','f_cone']:u.type==='pyromancer'?['p_meteor','p_flame','p_bolt']:['r_rain','r_fan','r_arrow'];
 let done=false;for(const id of ids){if(id.endsWith('cone')&&D(u,nearest)>330||id==='r_fan'&&D(u,nearest)>340)continue;if(cast(u,id,{x:cluster.x,y:cluster.y})){done=true;break;}}if(done)continue;
 if(u.type==='frost'&&hurt.length&&cast(u,'f_armor',{target:hurt[0].id}))continue;
 }
 }
 if(u.type==='footman'&&danger.length&&u.shield<30&&cast(u,'u_guard'))continue;
 if(u.type==='archer'&&target&&cast(u,'u_rapid'))continue;
 if(u.type==='mortar'&&nearest&&cast(u,'u_shell',{x:nearest.x,y:nearest.y}))continue;
 if(scouts[u.id]){
 const rec=scouts[u.id],n=s.nodes.find(n=>n.id===rec.node);const paths=[{x:1600-dir*320,y:n.y<1000?790:1210},{x:1600-dir*280,y:n.y},n];
 if(n.owner===me){if(D(u,n)>65)order(u,'move',n);else if(u.order.type!=='hold')push({type:'hold',units:[u.id]});continue;}
 while(rec.step<2&&D(u,paths[rec.step])<90)rec.step++;
 if(danger.length&&u.hp<u.maxHp*.35){order(u,'move',{x:u.x-dir*180,y:u.y});continue;}
 order(u,'move',paths[rec.step]);continue;
 }
 const melee=local.filter(v=>!def(v).flying&&def(v).range<100&&D(u,v)<130).sort((a,b)=>D(u,a)-D(u,b))[0];
 if(d.range>=180&&melee&&u.fireAt>now+.35&&!(u.statuses.root>now)){
 const dd=Math.max(1,D(u,melee)),q={x:clamp(u.x+(u.x-melee.x)/dd*110,30,3170),y:clamp(u.y+(u.y-melee.y)/dd*110,30,1970)};if(!blocked(q,u.r)&&order(u,'move',q))continue;
 }
 if(target){order(u,'attack',{target:target.id});continue;}
 if(u.type==='mortar'){
 const tb=eb.filter(b=>D(u,b)<650).sort((a,b)=>(a.type==='townhall'?-1:0)-(b.type==='townhall'?-1:0))[0];if(tb){if(cast(u,'u_shell',{x:tb.x,y:tb.y}))continue;order(u,'attack',{target:tb.id});continue;}}
 if(u.summoned&&d.speed===0)continue;
 const aim=u.hp<u.maxHp*.25&&u.hero&&danger.length?{x:home.x+dir*150,y:home.y}:goal;
 if(D(u,aim)>80||u.order.type==='move'||u.order.type==='attack')order(u,'attackMove',{x:aim.x,y:aim.y});
 }
 // Economy uses the remaining command budget; all costs and reserved population are tracked.
 const pendingFarm=bs.some(b=>b.type==='farm'&&!b.complete&&worker.some(u=>u.order.type==='build'&&u.order.target===b.id));
 if(p.popCap-pop<10&&p.popCap<120&&!pendingFarm)build('farm',{x:home.x-dir*90,y:home.y+dir*350});
 if(!count('range'))build('range');
 if(threats.length>=3&&count('tower')<2&&now>30)build('tower',{x:home.x+dir*150,y:home.y-220});
 if(num('worker')<18&&pop<p.popCap-4)train('worker');
 if(!count('lumbermill')&&now>8) {const r=s.resources.filter(r=>r.kind==='wood'&&r.amount>0).sort((a,b)=>D(a,home)-D(b,home))[0];if(r)build('lumbermill',{x:r.x+dir*120,y:r.y+100});}
 if(!count('arcane')&&count('range')&&now>20)build('arcane');
 // New heroes bring much more immediate power than early age upgrades.
 const heroOrder=['frost','pyromancer','oracle','ranger'];
 const altar=complete('altar').find(b=>b.queue.length===0);
 if(altar&&pop+5<=p.popCap){const dead=p.heroes.find(h=>h.dead&&!h.queued&&h.respawnAt<=now);if(dead){if(spend({gold:150+40*dead.level,wood:0},{type:'revive',hero:dead.type})){pop+=5;altar.queue.push({type:dead.type});}}
 else if(p.heroes.length<5&&num('archer')>=3){const h=heroOrder.find(t=>!p.heroes.some(h=>h.type===t));if(h&&spend(C.heroes[h].cost,{type:'summon',hero:h})){pop+=5;altar.queue.push({type:h});}}}
 if(num('priest')<Math.max(2,Math.floor(num('archer')/5)))train('priest');
 for(let i=0;i<3;i++)train('archer');
 if(count('range')<3&&now>65&&num('archer')>=4)build('range');
 if(count('arcane')<2&&now>180&&num('priest')>=3)build('arcane');
 if(!count('forge')&&now>120)build('forge');
 const researching=t=>bs.some(b=>b.queue.some(q=>q.type===t));
 function research(t){const d=C.techs[t],lev=p.tech[t]||0;if(researching(t)||!complete(d.building).length||complete(d.building)[0].queue.length>1)return false;return spend({gold:d.cost.gold+lev*70,wood:d.cost.wood+lev*50},{type:'research',tech:t});}
 if(p.tier===1&&complete('forge').length&&now>150)research('tier2');
 if(p.tier>=2){if(!count('workshop'))build('workshop');if(num('mortar')<6)train('mortar');}
 if(complete('forge').length){if(p.tech.weapons<p.tier)research('weapons');else if(p.tech.armor<p.tier)research('armor');}
 if(complete('lumbermill').length&&p.tech.gathering<2&&now>90)research('gathering');
 if(gold>800&&wood>600&&p.tier===2)research('tier3');
 if(p.tier>=3&&num('mortar')>=4&&num('archer')<35)train('archer');
 const activeWorkers=worker.filter(u=>u.order.type!=='build'&&!acted.has(u.id));
 const woodWanted=wood<300?Math.ceil(activeWorkers.length*.52):Math.ceil(activeWorkers.length*.35);
 let woodN=activeWorkers.filter(u=>s.resources.find(r=>r.id===u.order.target)?.kind==='wood').length;
 for(const u of activeWorkers){if(commands.length>=20)break;let kind;
 if(u.order.type==='hold')kind=woodN<woodWanted?'wood':'gold';
 else if(woodN<woodWanted&&u.order.type==='gather'&&s.resources.find(r=>r.id===u.order.target)?.kind==='gold')kind='wood';
 else if(woodN>woodWanted+1&&u.order.type==='gather'&&s.resources.find(r=>r.id===u.order.target)?.kind==='wood')kind='gold';
 else continue;
 const r=s.resources.filter(r=>r.kind===kind&&r.amount>0).sort((a,b)=>D(u,a)-D(u,b))[0];if(r&&push({type:'gather',units:[u.id],target:r.id})){if(kind==='wood')woodN++;else woodN--;}}
 return {commands};
 };}
if(require.main===module){const agent=makeAgent();readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{try{const s=JSON.parse(line);process.stdout.write(JSON.stringify(agent(s))+'\n');}catch(e){process.stderr.write(String(e.stack)+'\n');process.stdout.write('{"commands":[]}\n');}});}
module.exports={makeAgent};
