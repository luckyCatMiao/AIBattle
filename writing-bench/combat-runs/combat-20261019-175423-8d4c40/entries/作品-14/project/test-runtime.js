'use strict';
const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('/workspace/game.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
if(!match)throw new Error('script missing');

const gradient={addColorStop(){}};
const noop=()=>{};
const context2d=new Proxy({
  createLinearGradient:()=>gradient,
  createRadialGradient:()=>gradient,
  measureText:t=>({width:String(t).length*8})
},{get(o,k){return k in o?o[k]:noop},set(o,k,v){o[k]=v;return true}});
class Element {
  constructor(id){this.id=id;this.clientWidth=1280;this.clientHeight=720;this.width=0;this.height=0;this.textContent='';this.title='';this.listeners={};this.style={};this.classList={add:noop,remove:noop};}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  dispatch(type,event={}){for(const fn of this.listeners[type]||[])fn({...event,stopPropagation:noop,preventDefault:noop})}
  focus(){}
  getContext(){return context2d}
}
const elements={shell:new Element('shell'),game:new Element('game'),start:new Element('start'),startButton:new Element('startButton'),mute:new Element('mute'),fatal:new Element('fatal')};
const listeners={};
const raf=[];
const windowObj={
  devicePixelRatio:1,
  addEventListener(type,fn){(listeners[type]??=[]).push(fn)},
  dispatch(type,event={}){for(const fn of listeners[type]||[])fn({...event,preventDefault:noop,stopPropagation:noop})}
};
const documentObj={getElementById:id=>elements[id]};
const sandbox={
  console,Math,Date,Set,Object,Array,Map,WeakMap,JSON,
  document:documentObj,window:windowObj,
  performance:{now:()=>0},
  requestAnimationFrame:fn=>{raf.push(fn);return raf.length},
  setTimeout,clearTimeout
};
windowObj.window=windowObj;windowObj.document=documentObj;
vm.createContext(sandbox);
const instrumented=match[1].replace("initScene();\nObject.defineProperty(window,'combatBenchState'",`initScene();
Object.defineProperty(window,'__combatDebug',{value:{
 get player(){return player},get enemies(){return enemies},get fields(){return fields},
 makeEnemy(type,x){return new Enemy(type,x,false)},
 addEnemy(e){enemies.push(e)},clearEnemies(){enemies.length=0},
 clearEffects(){projectiles.length=0;particles.length=0;trails.length=0;detached.length=0;texts.length=0;shockwaves.length=0;skillFx.length=0;fields.length=0},
 resetPlayer(){player.x=370;player.y=FLOOR;player.vx=0;player.vy=0;player.grounded=true;player.state='idle';player.actionTime=0;player.hurtTimer=0;player.invuln=0;player.energy=100;player.skillCds=[0,0,0,0];player.skillId=-1}
}});
Object.defineProperty(window,'combatBenchState'`);
vm.runInContext(instrumented,sandbox,{filename:'game-inline.js'});

let now=0;
function frame(count=1){for(let i=0;i<count;i++){const fn=raf.shift();if(!fn)throw new Error('animation loop stopped');now+=1000/60;fn(now)}}
function down(code){windowObj.dispatch('keydown',{code})}
function up(code){windowObj.dispatch('keyup',{code})}
function tap(code,frames=2){down(code);frame(frames);up(code);frame(1)}
function state(){return windowObj.combatBenchState()}
function assert(ok,message){if(!ok)throw new Error(`${message}; state=${JSON.stringify(state())}`)}

frame(2);
assert(state().ready===true,'ready must be true');
assert(state().playing===false,'must wait for start');
tap('Enter');
assert(state().playing===true&&state().playerAlive===true,'Enter must start play');
assert(state().enemyCount===2,'first wave must spawn two enemies');

// Each of the four number-key skills must independently spend FLUX, start only its own cooldown and affect combat.
const dbg=windowObj.__combatDebug;
function skillTarget(type,x){dbg.clearEnemies();dbg.clearEffects();dbg.resetPlayer();const e=dbg.makeEnemy(type,x);e.state='idle';e.alpha=1;e.cooldown=9;dbg.addEnemy(e);return e;}
let target=skillTarget('reaver',530),hp=target.hp,x0=dbg.player.x;
tap('Digit1');frame(35);
assert(target.hp<hp&&dbg.player.x>x0+200,'1 / 裂帛·瞬光 must dash through and damage target');
assert(dbg.player.skillCds[0]>0&&dbg.player.skillCds.slice(1).every(v=>v===0),'skill 1 must have independent cooldown');

target=skillTarget('reaver',455);hp=target.hp;tap('Digit2');frame(38);
assert(target.hp<hp&&target.y<572,'2 / 星坠·断层 must land, damage and launch target');
assert(dbg.player.skillCds[1]>0&&dbg.player.skillCds[0]===0,'skill 2 must have independent cooldown');

target=skillTarget('lancer',500);hp=target.hp;tap('Digit3');frame(70);
assert(dbg.fields.length===1&&target.hp<hp&&target.y<577,'3 / 磁狱·缚轮 must create field, deal ticks and suspend target');
assert(dbg.player.skillCds[2]>0&&dbg.player.skillCds[3]===0,'skill 3 must have independent cooldown');

target=skillTarget('reaver',610);const second=dbg.makeEnemy('lancer',760);second.state='idle';second.alpha=1;second.cooldown=9;dbg.addEnemy(second);const hpA=target.hp,hpB=second.hp;tap('Digit4');
assert(dbg.player.energy>=62&&dbg.player.energy<64&&dbg.player.skillCds[3]>8,'skill 4 must immediately spend 38 FLUX and start its cooldown');
frame(145);
assert(target.hp<hpA&&second.hp<hpB,'4 / 终式·千隙葬 must acquire and damage multiple targets');
assert(dbg.player.skillCds[3]>0,'skill 4 cooldown must remain active after its cinematic');
tap('KeyR');frame(3);

// Deterministic combo test: a true J-J-J chain must sever a normal reaver blade arm.
dbg.clearEnemies();dbg.clearEffects();
const reaver=dbg.makeEnemy('reaver',dbg.player.x+78);reaver.state='idle';reaver.alpha=1;reaver.cooldown=9;dbg.addEnemy(reaver);
const hitsBefore=state().hitCount,breaksBefore=state().limbBreakCount;
down('KeyJ');frame(2);up('KeyJ');frame(8);down('KeyJ');frame(2);up('KeyJ');frame(13);down('KeyJ');frame(2);up('KeyJ');frame(36);
assert(state().hitCount>=hitsBefore+3,'J-J-J must land three distinct attacks');
assert(state().limbBreakCount===breaksBefore+1&&!reaver.weapon,'combo finisher must visibly sever blade arm');
reaver.cooldown=0;reaver.x=dbg.player.x+60;reaver.vx=0;reaver.vy=0;reaver.state='idle';frame(20);
assert(reaver.attackKind==='ram','disarmed reaver must switch to ram attack');

// Deterministic behavior check for the ranged archetype after cannon removal.
dbg.clearEnemies();dbg.clearEffects();dbg.player.state='idle';dbg.player.actionTime=0;dbg.player.comboStep=0;dbg.player.attackHit=new Set();dbg.player.vx=0;
const lancer=dbg.makeEnemy('lancer',dbg.player.x+55);lancer.state='idle';lancer.alpha=1;lancer.weapon=false;lancer.cooldown=0;dbg.addEnemy(lancer);frame(20);
assert(lancer.attackKind==='headbutt','disarmed lancer must switch to headbutt');

// Parry an actual active strike and confirm it converts directly into the counter slash.
dbg.clearEnemies();dbg.clearEffects();dbg.player.state='idle';dbg.player.actionTime=0;dbg.player.vx=0;dbg.player.invuln=0;
const attacker=dbg.makeEnemy('reaver',dbg.player.x+65);attacker.state='attack';attacker.attackKind='slash';attacker.actionTime=.39;attacker.attackDone=false;attacker.alpha=1;dbg.addEnemy(attacker);
down('KeyI');frame(5);up('KeyI');frame(3);
assert(dbg.player.state==='attack'&&dbg.player.comboStep===4,'timed I must convert attack into parry counter');

// Emptying the arena must schedule the next wave quickly rather than leave downtime.
dbg.clearEnemies();dbg.clearEffects();dbg.player.state='idle';dbg.player.actionTime=0;frame(70);
assert(state().enemyCount>0,'cleared arena must spawn the next wave within about one second');
tap('KeyR');frame(3);

// Exercise every required control while closing distance.
down('KeyD');frame(70);up('KeyD');frame(2);
tap('Space');frame(12);tap('KeyL');frame(18);
// Repeated attacks cover grounded/air attacks and combo input buffering.
for(let n=0;n<15;n++){tap('KeyJ',2);frame(8)}
frame(25);
// Hold and release K repeatedly to force visible weapon breaks.
for(let n=0;n<8;n++){down('KeyK');frame(50);up('KeyK');frame(38);if(!state().playerAlive)break;}
// Exercise parry and restart path regardless of combat outcome.
tap('KeyI');frame(30);
const progressed=state();
assert(progressed.hitCount>0,'combat must register real hits');
assert(progressed.limbBreakCount>0,'charged attacks must break a limb');
tap('KeyR');frame(3);
assert(state().playing&&state().playerAlive,'R must restart immediately');
assert(state().hitCount===0&&state().limbBreakCount===0,'restart must reset counters');
// Verify mute button works without WebAudio support.
elements.mute.dispatch('click');frame(2);

// Let both enemy archetypes fight unassisted until the real death flow triggers.
frame(1800);
assert(!state().playerAlive&&!state().playing,'enemy AI must be able to kill the player');
tap('Enter');frame(3);
assert(state().playerAlive&&state().playing,'Enter must restart from game over');

// Long mixed-input soak: exercise projectiles, parry, jumps, dashes and resets.
for(let cycle=0;cycle<45;cycle++){
  if(!state().playerAlive){tap('Enter');frame(4);}
  down(cycle%2?'KeyD':'KeyA');frame(12);up(cycle%2?'KeyD':'KeyA');
  if(cycle%3===0)tap('Space');
  if(cycle%4===0)tap('KeyL');
  if(cycle%5===0)tap('KeyI');
  tap('KeyJ');frame(6);tap('KeyJ');frame(7);tap('KeyJ');frame(18);
  if(cycle%3===1){down('KeyK');frame(46);up('KeyK');frame(30);}
}
assert(typeof state().enemyCount==='number'&&state().enemyCount>=0,'state must remain valid after soak');
console.log(JSON.stringify({ok:true,combatProgress:progressed,afterSoak:state(),frames:Math.round(now/(1000/60))}));
