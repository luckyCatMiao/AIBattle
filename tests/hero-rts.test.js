'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createMatch, command, step, snapshot, spawn, addBuilding, DT, catalog} = require('../hero-rts/simulation');

function make(options = {}) {
  return createMatch({id:'test-match', seed:73, players:[{name:'A',kind:'api'}, {name:'B',kind:'api'}], ...options});
}
function run(g, seconds) { for (let i=0; i<Math.ceil(seconds/DT); i++) step(g, DT); }
function start(g) { command(g,0,{type:'start'}); return g; }
function arena() {
  const g=make();
  g.units=[]; g.resources=[]; g.nodes=[]; g.map.obstacles=[];
  return start(g);
}
function held(g, owner, type, x, y) {
  const u=spawn(g,owner,type,x,y);
  command(g,owner,{type:'hold',units:[u.id]});
  return u;
}
function rejectedUnchanged(g, owner, action) {
  const before=structuredClone(snapshot(g));
  assert.throws(()=>command(g,owner,action));
  assert.deepEqual(snapshot(g),before,'rejected commands must not mutate the battlefield or economy');
}

test('hero roster and combat catalog expose usable, distinct content',()=>{
  assert.equal(Object.keys(catalog.heroes).length,10);
  assert.equal(Object.values(catalog.units).filter(u=>u.id!=='worker').length,16);
  assert.equal(Object.keys(catalog.buildings).length,12);
  const heroSkills=Object.values(catalog.heroes).flatMap(h=>h.skills);
  assert.equal(new Set(heroSkills).size,40);
  for(const hero of Object.values(catalog.heroes)) {
    assert.deepEqual(hero.skills.map(id=>catalog.skills[id].slot),['Q','W','E','R']);
    assert.ok(hero.skills.every(id=>catalog.skills[id].description.length>0));
  }
  for(const unit of Object.values(catalog.units).filter(u=>u.id!=='worker')) {
    assert.equal(unit.skills.length,1);
    assert.ok(catalog.skills[unit.skills[0]]);
    assert.ok(catalog.buildings[unit.producer]);
  }
});

test('preparation, ownership and invalid group commands are authoritative and atomic',()=>{
  const g=make(), own=g.units.find(u=>u.owner===0), enemy=g.units.find(u=>u.owner===1);
  const ready=structuredClone(snapshot(g));
  run(g,1); assert.deepEqual(snapshot(g),ready);
  rejectedUnchanged(g,1,{type:'start'});
  start(g);
  rejectedUnchanged(g,0,{type:'move',units:[own.id,enemy.id],x:500,y:500});
  rejectedUnchanged(g,0,{type:'move',units:[own.id,'nonexistent'],x:500,y:500});
  rejectedUnchanged(g,0,{type:'attackMove',units:[own.id],x:NaN,y:500});
  rejectedUnchanged(g,0,{type:'move',units:[own.id],x:Infinity,y:0});
  rejectedUnchanged(g,0,{type:'cast',unit:enemy.id,skill:'v_shield',x:enemy.x,y:enemy.y});
  rejectedUnchanged(g,0,{type:'pause'});
});

test('gold and wood depletion settle only the actual remaining resources',()=>{
  for(const kind of ['gold','wood']) {
    const g=make(), baseline=make();
    for(const world of [g,baseline]) {
      const hall=world.buildings.find(b=>b.owner===0&&b.type==='townhall');
      world.units=[]; world.nodes=[]; world.map.obstacles=[];
      const resource={id:'last-resource',kind,x:hall.x+120,y:hall.y,r:32,amount:world===g?1:0};
      world.resources=[resource];
      const worker=spawn(world,0,'worker',resource.x,resource.y);
      start(world);
      if(resource.amount) command(world,0,{type:'gather',units:[worker.id],target:resource.id});
    }
    run(g,40); run(baseline,40);
    assert.equal(g.resources[0].amount,0);
    assert.ok(Math.abs((g.players[0][kind]-baseline.players[0][kind])-1)<1e-6,
      `${kind}: the last one resource must be delivered exactly once`);
    assert.equal(g.units[0].cargo?.[kind]||0,0);
  }
});

test('construction spends once, requires a worker and finishes only after work',()=>{
  const g=arena(), p=g.players[0], worker=held(g,0,'worker',500,500);
  p.gold=10000; p.wood=10000;
  rejectedUnchanged(g,0,{type:'build',building:'stable',units:[worker.id],x:650,y:500});
  const before={gold:p.gold,wood:p.wood};
  command(g,0,{type:'build',building:'farm',units:[worker.id],x:650,y:500});
  const farm=g.buildings.find(b=>b.owner===0&&b.type==='farm'&&b.x===650);
  assert.ok(farm,'accepted construction must exist in observation');
  assert.equal(p.gold,before.gold-catalog.buildings.farm.cost.gold);
  assert.equal(p.wood,before.wood-catalog.buildings.farm.cost.wood);
  assert.equal(farm.complete,false);
  run(g,1); assert.equal(farm.complete,false);
  run(g,25); assert.equal(farm.complete,true);
  assert.equal(p.wood,before.wood-catalog.buildings.farm.cost.wood,'construction must not charge each work tick');
  rejectedUnchanged(g,0,{type:'build',building:'farm',units:[worker.id],x:650,y:500});
});

test('a worker beside a building edge navigates around it and completes reachable construction',()=>{
  const g=arena();
  g.buildings=[];
  addBuilding(g,0,'townhall',330,1000,true);
  addBuilding(g,1,'townhall',2870,1500,true);
  const arcane=addBuilding(g,0,'arcane',2630,1000,true);
  addBuilding(g,0,'forge',2662.15,1120,true);
  const worker=held(g,0,'worker',2659.3264,1045.3869);
  command(g,0,{type:'build',building:'farm',units:[worker.id],x:2662.1539,y:880});
  const farm=g.buildings.find(b=>b.type==='farm');
  assert.ok(farm&&!farm.complete);
  for(let i=0;i<40/DT;i++) {
    step(g,DT);
    assert.ok(Math.hypot(worker.x-arcane.x,worker.y-arcane.y)>=worker.r+arcane.r,
      'the worker must navigate around the obstruction instead of crossing its footprint');
  }
  assert.equal(farm.complete,true,`reachable farm stalled at ${farm.progress}; worker at ${worker.x},${worker.y}`);
});

test('default workers deliver both resources within 30 seconds at every spawn',()=>{
  for(const count of [2,8]) {
    const g=start(make({players:Array.from({length:count},(_,i)=>({name:'P'+i,kind:'api'}))}));
    run(g,30);
    for(const p of g.players) {
      assert.ok(p.mined>0,`${count} players: seat ${p.id} must deliver resources`);
      assert.ok(p.gold>650+catalog.rules.baseIncome*g.now+1,`${count} players: seat ${p.id} must deliver gold beyond passive income`);
      assert.ok(p.wood>250,`${count} players: seat ${p.id} must deliver wood`);
    }
  }
});

test('production and research enforce completed prerequisites and take simulation time',()=>{
  const g=arena(), p=g.players[0]; p.gold=p.wood=10000;
  rejectedUnchanged(g,0,{type:'train',unit:'knight'});
  rejectedUnchanged(g,0,{type:'train',unit:'archer'});
  rejectedUnchanged(g,0,{type:'research',tech:'tier2'});
  const forge=addBuilding(g,0,'forge',600,500,false);
  rejectedUnchanged(g,0,{type:'research',tech:'tier2'});
  forge.complete=true;
  command(g,0,{type:'research',tech:'tier2'});
  assert.equal(p.tier,1);
  rejectedUnchanged(g,0,{type:'research',tech:'tier2'});
  run(g,catalog.techs.tier2.build+1); assert.equal(p.tier,2);
  command(g,0,{type:'research',tech:'weapons'});
  assert.equal(p.tech.weapons,0);
  run(g,catalog.techs.weapons.build+1); assert.equal(p.tech.weapons,1);
  const stable=addBuilding(g,0,'stable',750,500,true);
  const gold=p.gold, wood=p.wood;
  command(g,0,{type:'train',unit:'knight',building:stable.id});
  assert.equal(g.units.filter(u=>u.type==='knight').length,0);
  assert.equal(p.gold,gold-catalog.units.knight.cost.gold);
  assert.equal(p.wood,wood-catalog.units.knight.cost.wood);
  run(g,catalog.units.knight.build+1);
  assert.equal(g.units.filter(u=>u.owner===0&&u.type==='knight').length,1);
});

test('queued troops reserve population before they spawn',()=>{
  const g=start(make());
  g.buildings.find(b=>b.owner===0&&b.type==='farm').hp=0;
  // A townhall alone supports the initial 18 population and one 2-population footman.
  command(g,0,{type:'train',unit:'footman'});
  rejectedUnchanged(g,0,{type:'train',unit:'footman'});
  const initial=g.units.filter(u=>u.owner===0&&u.type==='footman').length;
  assert.equal(initial,4);
  run(g,catalog.units.footman.build+1);
  assert.equal(g.units.filter(u=>u.owner===0&&u.type==='footman').length,initial+1);
});

test('hero limit counts queued and dead heroes, and a dead hero can be revived',()=>{
  const g=start(make()), p=g.players[0]; p.gold=p.wood=100000;
  g.units=g.units.filter(u=>u.hero); g.nodes=[];
  for(let i=0;i<4;i++) addBuilding(g,0,'farm',500+i*100,300,true);
  for(const hero of ['pyromancer','frost','ranger']) {
    command(g,0,{type:'summon',hero}); run(g,catalog.heroes[hero].build+1);
  }
  command(g,0,{type:'summon',hero:'assassin'});
  rejectedUnchanged(g,0,{type:'summon',hero:'druid'});
  rejectedUnchanged(g,0,{type:'summon',hero:'vanguard'});
  run(g,catalog.heroes.assassin.build+1);
  assert.equal(p.heroes.length,5);
  const killed=g.units.find(u=>u.owner===0&&u.type==='frost');
  killed.hp=1;
  const attacker=held(g,1,'necromancer',killed.x+100,killed.y);
  command(g,1,{type:'cast',unit:attacker.id,skill:'n_drain',target:killed.id});
  run(g,.4);
  assert.equal(p.heroes.find(h=>h.type==='frost').dead,true);
  rejectedUnchanged(g,0,{type:'summon',hero:'druid'});
  rejectedUnchanged(g,0,{type:'revive',hero:'frost'});
  g.units=g.units.filter(u=>u.id!==attacker.id);
  run(g,12);
  command(g,0,{type:'revive',hero:'frost'});
  run(g,60);
  assert.equal(p.heroes.length,5);
  assert.equal(p.heroes.find(h=>h.type==='frost').dead,false);
  assert.equal(g.units.filter(u=>u.owner===0&&u.type==='frost'&&u.hp>0).length,1);
});

test('casts validate learned skill, ownership, distance, mana, cooldown and ultimate level',()=>{
  const g=arena(), hero=held(g,0,'pyromancer',800,300);
  rejectedUnchanged(g,0,{type:'cast',unit:hero.id,skill:'v_shield',x:800,y:300});
  rejectedUnchanged(g,1,{type:'cast',unit:hero.id,skill:'p_blink',x:850,y:300});
  rejectedUnchanged(g,0,{type:'cast',unit:hero.id,skill:'p_blink',x:1500,y:300});
  rejectedUnchanged(g,0,{type:'cast',unit:hero.id,skill:'p_meteor',x:900,y:300});
  hero.mana=0;
  rejectedUnchanged(g,0,{type:'cast',unit:hero.id,skill:'p_blink',x:900,y:300});
  hero.mana=hero.maxMana;
  const mana=hero.mana;
  command(g,0,{type:'cast',unit:hero.id,skill:'p_blink',x:900,y:300});
  assert.ok(Math.abs(hero.x-900)<1);
  assert.equal(hero.mana,mana-catalog.skills.p_blink.mana);
  rejectedUnchanged(g,0,{type:'cast',unit:hero.id,skill:'p_blink',x:950,y:300});
  run(g,catalog.skills.p_blink.cooldown+DT);
  command(g,0,{type:'cast',unit:hero.id,skill:'p_blink',x:950,y:300});
});

test('delayed area damage is avoidable by leaving its warning circle',()=>{
  function scenario(dodge) {
    const g=arena(), mage=held(g,0,'pyromancer',800,300), victim=held(g,1,'assassin',1200,300);
    mage.level=3;
    const initial=victim.hp;
    command(g,0,{type:'cast',unit:mage.id,skill:'p_meteor',x:victim.x,y:victim.y});
    run(g,.35);
    assert.equal(victim.hp,initial,'damage must not precede the telegraph delay');
    if(dodge) command(g,1,{type:'move',units:[victim.id],x:1600,y:300});
    run(g,2.5);
    return {initial,remaining:victim.hp};
  }
  const stationary=scenario(false), moving=scenario(true);
  assert.ok(stationary.remaining<stationary.initial-200);
  assert.equal(moving.remaining,moving.initial);
});

test('stun interrupts a channeled heal before it resolves',()=>{
  const g=arena(), healer=held(g,0,'oracle',800,300), ally=held(g,0,'footman',800,500);
  const guardian=held(g,1,'guardian',1000,300);
  healer.level=3; ally.hp=50;
  command(g,0,{type:'cast',unit:healer.id,skill:'o_renew',x:800,y:400});
  assert.ok(healer.casting);
  command(g,1,{type:'cast',unit:guardian.id,skill:'g_slam',x:800,y:300});
  run(g,1.4);
  assert.ok(!healer.casting);
  assert.equal(ally.hp,50,'interrupted ultimate must not heal after its former finish time');
});

test('ground melee cannot hit flying units; dedicated anti-air can',()=>{
  const g=arena(), flyer=held(g,1,'gargoyle',1000,300);
  held(g,0,'footman',970,300);
  const initial=flyer.hp;
  run(g,3); assert.equal(flyer.hp,initial);
  held(g,0,'archer',800,300);
  run(g,3); assert.ok(flyer.hp<initial);
});

test('townhall and tower attacks leave their own footprint and damage a target',()=>{
  for(const type of ['townhall','tower']) {
    const g=arena();
    const building=addBuilding(g,0,type,900,300,true);
    const target=held(g,1,'footman',1100,300);
    target.fireAt=Infinity;
    const hp=target.hp;
    run(g,3);
    assert.ok(target.hp<hp,`${type} must fire through its own footprint`);
    assert.ok(building.hp>0);
  }
});

test('all 40 hero and 16 troop skills resolve their advertised combat effect',()=>{
  const roster=[...Object.values(catalog.heroes),...Object.values(catalog.units).filter(u=>u.skills.length)];
  let resolved=0;
  for(const definition of roster) for(const skillId of definition.skills) {
    const g=arena(), s=catalog.skills[skillId];
    const caster=held(g,0,definition.id,900,300), enemy=held(g,1,'footman',950,300), ally=held(g,0,'footman',925,350);
    caster.level=3; caster.hp=20; caster.mana=1000;
    enemy.hp=enemy.maxHp=10000; ally.hp=20;
    for(const u of [caster,enemy,ally]) u.fireAt=Infinity;
    for(const b of g.buildings) b.fireAt=Infinity;
    let damagedBuilding;
    if(s.effect==='dispel') {
      ally.statuses.slow=g.now+20; enemy.statuses.haste=g.now+20;
      enemy.shield=200; enemy.shieldUntil=g.now+20;
    }
    if(s.effect==='repairArea') { damagedBuilding=addBuilding(g,0,'farm',1000,450,true); damagedBuilding.hp=50; }
    const action={type:'cast',unit:caster.id,skill:skillId};
    if(s.target==='point') { action.x=1000; action.y=300; }
    if(s.target==='enemy') action.target=enemy.id;
    if(s.target==='ally') action.target=ally.id;
    command(g,0,action);
    run(g,s.castTime+s.delay+.5);
    const label=`${definition.id}/${skillId} (${s.effect})`;
    switch(s.effect) {
      case 'blink': assert.ok(caster.x>970,label+' must move its caster'); break;
      case 'dash':
      case 'strike': assert.ok(caster.x>900,label+' must move its caster'); assert.ok(enemy.hp<10000,label+' must damage the enemy'); break;
      case 'heal': assert.ok(ally.hp>20,label+' must heal the target'); break;
      case 'healArea':
      case 'sanctuary': assert.ok(ally.hp>20,label+' must heal in its area'); break;
      case 'repairArea': assert.ok(damagedBuilding.hp>50,label+' must repair an eligible building'); break;
      case 'shield': assert.ok((s.target==='ally'?ally:caster).shield>0,label+' must grant a shield'); break;
      case 'buff': assert.ok((s.target==='ally'?ally:caster).statuses[s.status]>g.now,label+' must grant its buff'); break;
      case 'evade': assert.ok(caster.statuses.evade>g.now,label+' must enable evasion'); break;
      case 'stone': assert.ok(caster.hp>20&&caster.statuses.stun>g.now,label+' must heal and immobilize the caster'); break;
      case 'dispel': assert.ok(!ally.statuses.slow&&enemy.shield===0&&!enemy.statuses.haste,label+' must remove allied debuffs and enemy protection'); break;
      case 'drain': assert.ok(caster.hp>20&&enemy.hp<10000,label+' must drain actual health'); break;
      case 'taunt': assert.ok(enemy.statuses.taunt>g.now,label+' must taunt nearby enemies'); break;
      case 'summon': assert.equal(g.units.filter(u=>u.owner===0&&u.type===s.summon&&u.summoned).length,s.count,label+' must produce its summons'); break;
      case 'execute':
      case 'blastTarget':
      case 'dot':
      case 'cone':
      case 'line':
      case 'zone':
      case 'blast':
        if(s.amount>0) assert.ok(enemy.hp<10000,label+' must deal damage');
        if(s.status) assert.ok(enemy.statuses[s.status]>g.now,label+' must apply its control or debuff');
        break;
      default: assert.fail(label+' has no behavioral test');
    }
    resolved++;
  }
  assert.equal(resolved,56);
});

test('solo pause freezes all time and finished matches stay immutable',()=>{
  const solo=start(make({players:[{name:'Human',kind:'human'},{name:'Bot',kind:'bot'}]}));
  run(solo,1); command(solo,0,{type:'pause'});
  const frozen=structuredClone(snapshot(solo)); run(solo,5);
  assert.deepEqual(snapshot(solo),frozen);
  command(solo,0,{type:'pause'}); step(solo); assert.ok(solo.now>1);
  const g=arena();
  for(const b of g.buildings.filter(b=>b.owner===1&&b.type==='townhall')) b.hp=0;
  step(g); assert.equal(g.status,'finished'); assert.equal(g.winner,0);
  const finished=structuredClone(snapshot(g)); run(g,5);
  assert.deepEqual(snapshot(g),finished);
  rejectedUnchanged(g,0,{type:'train',unit:'worker'});
});

test('contested shrines stop capture, and summoned troops cannot capture them',()=>{
  const g=arena(), node={id:'test-shrine',x:1400,y:300,r:105,owner:null,capturer:null,progress:0,contested:false};
  g.nodes=[node];
  const summon=held(g,0,'treant',1400,300); summon.summoned=true;
  run(g,catalog.rules.captureSeconds+1); assert.equal(node.owner,null);
  const a=held(g,0,'footman',1350,300), b=held(g,1,'footman',1450,300);
  a.hp=a.maxHp=b.hp=b.maxHp=100000;
  run(g,catalog.rules.captureSeconds+1); assert.equal(node.contested,true); assert.equal(node.owner,null);
  g.units=g.units.filter(u=>u.id!==b.id);
  run(g,catalog.rules.captureSeconds+1); assert.equal(node.owner,0);
});

test('the time limit settles among living players and cannot reward an eliminated army',()=>{
  const g=start(make({players:[...Array(3)].map((_,i)=>({name:'P'+i,kind:'api'}))}));
  g.units=[]; g.nodes=[];
  g.players[0].damage=1000; g.players[2].damage=1000000;
  g.buildings.find(b=>b.owner===2&&b.type==='townhall').hp=0;
  g.now=catalog.rules.duration-DT/2;
  step(g);
  assert.equal(g.players[2].alive,false);
  assert.equal(g.status,'finished'); assert.equal(g.winner,0);
});

test('eight-player spawns and navigation remain finite and inside terrain bounds',()=>{
  const g=make({players:Array.from({length:8},(_,i)=>({name:'P'+i,kind:'api'}))});
  assert.equal(g.players.length,8);
  const halls=g.buildings.filter(b=>b.type==='townhall');
  assert.equal(halls.length,8);
  for(let i=0;i<halls.length;i++) for(let j=i+1;j<halls.length;j++) {
    assert.ok(Math.hypot(halls[i].x-halls[j].x,halls[i].y-halls[j].y)>halls[i].r+halls[j].r);
  }
  start(g);
  for(let owner=0;owner<8;owner++) command(g,owner,{type:'move',units:g.units.filter(u=>u.owner===owner).map(u=>u.id),x:1600,y:1000});
  run(g,35);
  for(const u of g.units) {
    assert.ok(Number.isFinite(u.x)&&Number.isFinite(u.y)&&Number.isFinite(u.hp));
    assert.ok(u.x>=0&&u.x<=catalog.rules.width&&u.y>=0&&u.y<=catalog.rules.height);
    if(!u.flying) for(const o of g.map.obstacles) {
      assert.equal(u.x>o.x&&u.x<o.x+o.w&&u.y>o.y&&u.y<o.y+o.h,false,'ground unit ended inside blocked terrain');
    }
  }
});

test('seeded bot actions produce identical complete simulation observations',()=>{
  const options={players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}]};
  const a=start(make(options)),b=start(make(options));
  run(a,90); run(b,90);
  assert.deepEqual(snapshot(a),snapshot(b));
  for(const p of a.players) assert.ok(Number.isFinite(p.gold)&&Number.isFinite(p.wood)&&p.gold>=0&&p.wood>=0);
  for(const u of a.units) for(const key of ['x','y','hp','mana']) assert.ok(Number.isFinite(u[key]));
});
