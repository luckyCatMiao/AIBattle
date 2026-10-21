'use strict';
(() => {
const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay'), soundButton = document.getElementById('sound');
const TAU = Math.PI * 2, FLOOR = 568, WORLD = 2240;
const C = {teal:'#9cf8dc', pale:'#e6f7e7', gold:'#ffc775', red:'#ff7764', ink:'#0a1722'};
let W = 1280, H = 720, ratio = 1, clock = 0, last = 0, dt = 0;
let playing = false, paused = false, dead = false, stop = 0, shake = 0, cam = 0;
let enemies = [], particles = [], debris = [], arcs = [], ghosts = [], texts = [], shots = [], rings = [];
let hitCount = 0, limbBreakCount = 0, kills = 0, wave = 0, combo = 0, comboClock = 0, bestCombo = 0;
let waveClock = 0, banner = '', bannerTime = 0, dangerFlash = 0, score = 0;
let player, nextId = 1, slow = 0, perfect = 0;
const keys = new Set(), buffer = new Map();
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const rand = (a,b) => a+Math.random()*(b-a);
const sign = v => v < 0 ? -1 : 1;
const ease = x => 1-Math.pow(1-clamp(x,0,1),3);
function resize() {
  const dpr = Math.min(devicePixelRatio || 1,2);
  H = 720; W = Math.max(960, innerWidth / innerHeight * 720);
  ratio = innerHeight / H;
  canvas.width = Math.round(innerWidth*dpr); canvas.height = Math.round(innerHeight*dpr);
  ctx.setTransform(dpr*ratio,0,0,dpr*ratio,0,0);
}
window.addEventListener('resize',resize); resize();

// Short layered synthesized sounds; no assets or audio permission assumptions.
let audio = null, master = null, noise = null, muted = false;
function unlockAudio() {
  try {
    if (!audio) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio = new Audio(); master = audio.createGain(); master.gain.value = muted ? 0 : .36; master.connect(audio.destination);
      noise = audio.createBuffer(1,audio.sampleRate*.6,audio.sampleRate);
      const data = noise.getChannelData(0); for (let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    }
    if(audio.state === 'suspended') audio.resume().catch(()=>{});
  } catch (_) { audio = null; }
}
function tone(freq,end,duration,volume,type='sine',delay=0) {
  if(!audio || audio.state !== 'running') return;
  const t=audio.currentTime+delay, o=audio.createOscillator(), g=audio.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
  g.gain.setValueAtTime(.001,t); g.gain.linearRampToValueAtTime(volume,t+.004); g.gain.exponentialRampToValueAtTime(.001,t+duration);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+duration+.02);
}
function hiss(duration,volume,freq=1800) {
  if(!audio || audio.state !== 'running') return;
  const t=audio.currentTime,s=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();
  s.buffer=noise;f.type='bandpass';f.frequency.value=freq;f.Q.value=.7;
  g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
  s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+duration);
}
function sfx(kind,power=1) {
  if(kind==='slash'){hiss(.12,.22,1400+power*600);tone(380,120,.10,.045,'triangle');}
  if(kind==='hit'){tone(120+power*12,38,.13+power*.025,.32,'triangle');hiss(.075,.3,2300);tone(850,190,.07,.07,'square');}
  if(kind==='break'){tone(90,26,.32,.48,'sawtooth');hiss(.26,.45,3400);tone(1200,260,.22,.08,'triangle',.03);}
  if(kind==='dash'){hiss(.19,.27,950);tone(240,80,.14,.06,'sine');}
  if(kind==='jump'){tone(150,480,.13,.08,'triangle');hiss(.09,.09,700);}
  if(kind==='hurt'){tone(110,40,.23,.35,'sawtooth');hiss(.17,.3,900);}
  if(kind==='charge'){tone(160,550,.3,.05,'triangle');}
  if(kind==='ready'){tone(660,990,.18,.1,'sine');tone(990,1320,.24,.08,'sine',.12);}
  if(kind==='warn'){tone(420,430,.09,.055,'sine');}
  if(kind==='land'){hiss(.1,.12,400);tone(65,30,.1,.1);}
}
soundButton.onclick=()=>{unlockAudio();muted=!muted;if(master)master.gain.value=muted?0:.36;soundButton.textContent=muted?'音效 OFF':'音效 ON';soundButton.blur();canvas.focus();};

const controls = new Set(['Digit1','Digit2','Digit3','Digit4','Numpad1','Numpad2','Numpad3','Numpad4','KeyA','KeyD','ArrowLeft','ArrowRight','Space','KeyJ','KeyK','KeyL','KeyI','KeyR','Enter']);
window.addEventListener('keydown', e => {
  if(!controls.has(e.code))return;
  e.preventDefault();unlockAudio();
  if(e.code==='KeyR' && !e.repeat){startGame();return;}
  if(e.code==='Enter' && !e.repeat){if(!playing)startGame();else if(paused)resume();return;}
  if(!playing || paused || player.hp<=0)return;
  if(!keys.has(e.code))buffer.set(e.code,.18);
  keys.add(e.code);
});
window.addEventListener('keyup',e=>{if(controls.has(e.code)){e.preventDefault();keys.delete(e.code);}});
function clearKeys(){keys.clear();buffer.clear();}
window.addEventListener('blur',()=>{clearKeys();if(playing&&!dead){paused=true;}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearKeys();if(playing)paused=true;}});
canvas.addEventListener('pointerdown',()=>{unlockAudio();if(paused)resume();canvas.focus();});
function resume(){paused=false;clearKeys();last=performance.now();}
const queued = k => (buffer.get(k)||0)>0;
const use = k => {buffer.delete(k);};

/*__SKILLS__*/

function makePlayer(){return {skill:null,skillCD:[0,0,0,0],skillFlash:[0,0,0,0],x:840,y:FLOOR,vx:0,vy:0,dir:1,hp:100,maxHp:100,onGround:true,jumps:2,action:null,charge:0,charging:false,chargeGlow:false,dash:0,dashCD:0,dashStock:2,dashRegen:0,invul:0,hurt:0,step:0,chain:0,chainTime:0,riseCD:0,land:0,trailTime:0,airAttack:0,heal:0};}
function spawnEnemy(type,x,delay=0){
  const brute=type==='brute', gun=type==='gunner';
  enemies.push({id:nextId++,type,x,y:FLOOR,vx:0,vy:0,dir:x>player.x?-1:1,hp:brute?182:gun?112:126,maxHp:brute?182:gun?112:126,
    arm:true,leg:true,armDamage:0,legDamage:0,stun:0,flash:0,spawn:.6+delay,state:'idle',t:0,cd:rand(.7,1.4),step:rand(0,10),wind:0,attackDone:false,lockDir:1,dead:false,death:0,chain:0,chainT:0,landing:false,alert:0});
}
function startWave(){
  wave++;banner='第 '+String(wave).padStart(2,'0')+' 波  /  '+(wave===1?'试 刃':wave%3===0?'重 装 入 场':'铸 庭 苏 醒');bannerTime=2.8;
  const center=clamp(player.x,400,WORLD-400);
  const count=Math.min(3+Math.floor((wave-1)/2),6);
  for(let i=0;i<count;i++){
    const type = wave===1 ? ['blade','gunner','blade'][i] : (i===count-1 && wave>=2?'brute':i%3===1?'gunner':'blade');
    let x=center+(i%2===0?1:-1)*(220+Math.floor(i/2)*155);
    x=clamp(x,100,WORLD-100);spawnEnemy(type,x,i*.16);
  }
  waveClock=-1;
}
function startGame(){
  unlockAudio();clearKeys();skillObjects=[];skillFX=[];player=makePlayer();enemies=[];particles=[];debris=[];arcs=[];ghosts=[];texts=[];shots=[];rings=[];
  hitCount=0;limbBreakCount=0;kills=0;wave=0;score=0;combo=0;bestCombo=0;comboClock=0;stop=0;shake=0;slow=0;perfect=0;dangerFlash=0;
  dead=false;playing=true;paused=false;waveClock=0;cam=clamp(player.x-W*.45,0,Math.max(0,WORLD-W));startWave();overlay.classList.add('hidden');canvas.focus();last=performance.now();sfx('ready');
}
document.getElementById('start').onclick=startGame;
function endGame(){
  dead=true;playing=false;clearKeys();overlay.classList.remove('hidden');
  document.getElementById('eyebrow').textContent='FORGE RECORD / 本次战斗记录';
  document.getElementById('title').innerHTML='刃 未 熄<span>再 入 雨 夜</span>';
  document.getElementById('description').textContent='守卫亮起红色锋芒时，闪步穿身。断掉武器臂可以解除远程火力；断腿会让重装失去冲锋。';
  document.getElementById('report').textContent=`抵达第 ${wave} 波　·　击破 ${kills}　·　断械 ${limbBreakCount}　·　最高 ${bestCombo} 连击`;
  document.getElementById('start').textContent='再次试刃 ↵';
}
Object.defineProperty(window,'combatBenchState',{value:()=>({ready:true,playerAlive:!!player&&player.hp>0,enemyCount:enemies.filter(e=>!e.dead).length,hitCount,limbBreakCount,playing:playing&&!paused}),writable:false,configurable:false});

// Attack phases are simulation time; contact freezes both combatants, not input collection.
const attackDefs={
  light1:{wind:.065,active:.105,recover:.19,damage:17,range:108,height:70,knock:170,stop:.043,cut:11,color:C.teal,name:'一闪',kind:'light'},
  light2:{wind:.055,active:.105,recover:.20,damage:20,range:116,height:79,knock:180,stop:.052,cut:15,color:C.teal,name:'返刃',kind:'light'},
  light3:{wind:.09,active:.14,recover:.25,damage:29,range:137,height:87,knock:330,stop:.078,cut:34,color:C.pale,name:'断流',kind:'finish'},
  heavy:{wind:.10,active:.15,recover:.31,damage:43,range:145,height:95,knock:470,stop:.10,cut:70,color:C.gold,name:'断械',kind:'heavy'},
  charged:{wind:.095,active:.17,recover:.33,damage:68,range:174,height:113,knock:640,stop:.135,cut:110,color:C.gold,name:'一刀 · 破城',kind:'charged'},
  rise:{wind:.075,active:.17,recover:.22,damage:23,range:110,height:128,knock:90,stop:.075,cut:23,color:C.teal,name:'升龙',kind:'rise'},
  air:{wind:.045,active:.13,recover:.16,damage:21,range:125,height:105,knock:130,stop:.055,cut:20,color:C.teal,name:'空切',kind:'air'},
  dive:{wind:.08,active:.22,recover:.28,damage:48,range:134,height:130,knock:420,stop:.11,cut:78,color:C.gold,name:'落断',kind:'dive'}
};
function beginAttack(name){
  const move=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  if(move)player.dir=move;
  const a=attackDefs[name];
  player.action={...a,name,t:0,hit:new Set(),fired:false,dir:player.dir};player.charging=false;player.charge=0;
  if(name.startsWith('light')){player.chain=(Number(name.slice(-1)))%3;player.chainTime=.8;}
  else if(name!=='air'){player.chain=0;}
  if(name==='rise'){player.riseCD=1.25;player.vy=-650;player.onGround=false;player.jumps=Math.max(1,player.jumps-1);}
  if(name==='air'){if(player.airAttack<4)player.vy=clamp(player.vy,-110,80)-85;player.airAttack++;}
  if(name==='dive'){player.vy=660;}
}
function requestLight(){beginAttack(!player.onGround?'air':'light'+(player.chainTime>0?player.chain+1:1));use('KeyJ');}
function dash(){
  if(player.hp<=0)return false;
  if(player.dashStock<=0 || player.dashCD>0)return false;
  const d=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  if(d)player.dir=d;
  player.skill=null;
  player.dash=.165;player.dashCD=.27;player.dashStock--;player.dashRegen=0;player.invul=Math.max(player.invul,.23);player.action=null;player.charging=false;player.hurt=0;player.vy*=.15;
  player.vx=player.dir*1080;player.trailTime=0;sfx('dash');use('KeyL');dust(player.x,player.y,10,C.teal);
  return true;
}
function updatePlayer(dt){
  const p=player;
  p.invul=Math.max(0,p.invul-dt);p.hurt=Math.max(0,p.hurt-dt);p.dashCD=Math.max(0,p.dashCD-dt);p.riseCD=Math.max(0,p.riseCD-dt);p.chainTime-=dt;p.land=Math.max(0,p.land-dt);p.heal=Math.max(0,p.heal-dt);
  if(p.dashStock<2){p.dashRegen+=dt;if(p.dashRegen>=.82){p.dashStock++;p.dashRegen=0;}}
  for(let i=0;i<4;i++){p.skillCD[i]=Math.max(0,p.skillCD[i]-dt);p.skillFlash[i]=Math.max(0,p.skillFlash[i]-dt);}
  if(queued('KeyL'))dash();
  trySkill();
  const move=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  if(p.dash>0){
    p.dash-=dt;p.vx=p.dir*1080;p.vy*=.85;
    p.trailTime-=dt;if(p.trailTime<=0){ghosts.push({x:p.x,y:p.y,dir:p.dir,life:.22,max:.22,pose:posePlayer()});p.trailTime=.025;}
  }else if(p.skill){
    updateSkillPose(dt);
  }else if(p.hurt<=0){
    if(queued('Space')&&p.jumps>0&&(!p.action||p.action.t>p.action.wind+p.action.active)){
      use('Space');p.vy=p.onGround?-650:-590;p.onGround=false;p.jumps--;p.action=null;p.charging=false;sfx('jump');dust(p.x,p.y,8,C.teal);ring(p.x,p.y-5,30,C.teal,.3);
    }
    if(p.action){
      const a=p.action;a.t+=dt;
      if(a.t>=a.wind&&!a.fired){a.fired=true;sfx('slash',a.kind==='heavy'||a.kind==='charged'?2:1);createArc(p,a);if(p.onGround)p.vx=p.dir*(a.kind==='charged'?500:a.kind==='heavy'?330:230);}
      if(a.t>=a.wind&&a.t<=a.wind+a.active)attackCollision(a);
      const cancel=a.t>a.wind+a.active+.025;
      if(cancel && queued('KeyI') && p.riseCD<=0){use('KeyI');beginAttack('rise');}
      else if(cancel && queued('KeyK')){use('KeyK');p.action=null;if(p.onGround){p.charging=true;p.charge=0;p.chargeGlow=false;sfx('charge');}else beginAttack('dive');}
      else if(cancel && (queued('KeyJ')||keys.has('KeyJ')))requestLight();
      else if(a.t>a.wind+a.active+a.recover)p.action=null;
      p.vx*=Math.exp(-dt*7);
      if(cancel&&move)p.vx=lerp(p.vx,move*230,Math.min(1,dt*16));
    }else if(p.charging){
      p.charge+=dt;p.vx=lerp(p.vx,move*85,Math.min(1,dt*12));if(move)p.dir=move;
      if(p.charge>=.46&&!p.chargeGlow){p.chargeGlow=true;ring(p.x,p.y-43,52,C.gold,.35);sfx('ready');}
      if(!keys.has('KeyK')||p.charge>=.95)beginAttack(p.charge>=.46?'charged':'heavy');
    }else{
      p.vx=lerp(p.vx,move*315,Math.min(1,dt*(p.onGround?22:10)));if(move)p.dir=move;
      if(queued('KeyI')&&p.riseCD<=0){use('KeyI');beginAttack('rise');}
      else if(queued('KeyK')){use('KeyK');if(p.onGround){p.charging=true;p.charge=0;p.chargeGlow=false;sfx('charge');}else beginAttack('dive');}
      else if(queued('KeyJ')||keys.has('KeyJ'))requestLight();
    }
  }else{p.vx*=Math.exp(-dt*6);}
  if(p.dash<=0){p.vy+=1650*dt;if(p.action&&p.action.kind==='air')p.vy-=1200*dt;}
  const oldY=p.y;p.x=clamp(p.x+p.vx*dt,42,WORLD-42);p.y+=p.vy*dt;
  if(p.y>=FLOOR){
    p.y=FLOOR;p.onGround=true;p.jumps=2;p.airAttack=0;
    if(oldY<FLOOR-2){p.land=.16;dust(p.x,FLOOR,10,'#83b3bf');sfx('land');
      if(p.action&&p.action.kind==='dive'){const a=p.action;a.t=a.wind;a.fired=true;createArc(p,a);attackCollision(a);shake=Math.max(shake,4);ring(p.x,FLOOR-4,110,C.gold,.35);}
    }p.vy=0;
  }else p.onGround=false;
  p.step+=dt*(Math.abs(p.vx)/30+1);
}
function attackCollision(a){
  const p=player;
  for(const e of enemies){
    if(e.dead||e.spawn>0||a.hit.has(e.id))continue;
    const dx=(e.x-p.x)*a.dir,dy=(e.y-38)-(p.y-40);
    if(dx>-35&&dx<a.range+(e.type==='brute'?25:16)&&Math.abs(dy)<a.height){
      a.hit.add(e.id);hitEnemy(e,a);
    }
  }
  if(a.kind==='heavy'||a.kind==='charged'||a.kind==='finish'){
    for(const s of shots)if(!s.dead&&Math.abs(s.x-p.x)<a.range&&Math.abs(s.y-(p.y-40))<90){s.dead=true;sparks(s.x,s.y,8,C.gold,1);}
  }
}
function hitEnemy(e,a){
  const dir=a.dir,p=player;hitCount++;combo++;comboClock=2.7;bestCombo=Math.max(bestCombo,combo);score+=a.damage*10;
  e.hp-=a.damage;e.flash=.12;e.stun=Math.max(e.stun,a.kind==='light'?.26:.42);e.state='stun';e.t=0;e.cd=Math.max(e.cd,.45);e.chain++;e.chainT=1.5;
  e.vx=dir*a.knock;e.vy=Math.min(e.vy,-65);
  if(a.kind==='rise'){e.vy=-720;e.stun=.8;e.landing=true;}
  if(!p.onGround&&a.kind==='air'){e.vy=-220;e.stun=.46;e.landing=true;}
  if(a.kind==='charged'){e.vy=-330;e.stun=.65;e.landing=true;}
  if(a.kind==='dive'){e.vy=680;e.landing=true;}
  const ix=e.x-dir*15,iy=clamp(a.impactY??(p.y-42),e.y-75,e.y-13);
  sparks(ix,iy,a.kind==='light'?13:23,a.color,a.kind==='light'?1:1.5);
  rings.push({x:ix,y:iy,r:5,end:a.kind==='light'?32:65,life:.2,max:.2,color:a.color});
  texts.push({x:e.x+rand(-10,10),y:e.y-90,text:String(a.damage),color:a.color,life:.62,max:.62,size:a.kind==='light'?15:23});
  stop=Math.max(stop,a.stop);shake=Math.max(shake,a.kind==='light'?2.2:a.kind==='charged'?7:4.5);sfx('hit',a.kind==='light'?1:2);
  const target=a.limb&&e[a.limb]?a.limb:(a.kind==='finish'||a.kind==='dive')&&e.leg?'leg':e.arm?'arm':'leg';
  e[target+'Damage']+=a.cut;
  if(e[target]&&(e[target+'Damage']>=(e.type==='brute'?85:60)||(e.chain>=3&&a.kind==='finish')))breakLimb(e,target,dir);
  if(e.hp<=0)killEnemy(e,dir);
}
function breakLimb(e,part,dir){
  if(!e[part])return;e[part]=false;limbBreakCount++;score+=250;stop=Math.max(stop,.105);shake=Math.max(shake,5);sfx('break');
  const size=e.type==='brute'?1.3:1;
  const x=e.x+dir*15,y=e.y-(part==='arm'?51:21);
  debris.push({x,y,vx:dir*rand(180,330),vy:-rand(290,470),angle:0,spin:dir*rand(5,11),life:5,max:5,part,type:e.type,scale:size,bounces:0});
  sparks(x,y,25,C.gold,1.7);ring(x,y,65,C.gold,.28);
  texts.push({x:e.x,y:e.y-123,text:part==='arm'?'断 臂 · 武器失效':'断 腿 · 移动受损',color:C.gold,life:1.15,max:1.15,size:14});
  if(part==='arm'){e.state='stun';e.stun=Math.max(e.stun,.6);e.cd=1.1;}
  else{e.vx*=.55;e.stun=Math.max(e.stun,.7);}
  pHeal(3);
}
function killEnemy(e,dir){
  if(e.dead)return;e.dead=true;e.death=.65;kills++;score+=400;e.vx=dir*230;e.vy=-240;
  sparks(e.x,e.y-42,24,'#9fc7c7',1.2);dust(e.x,e.y,13,'#859b9f');pHeal(2);
  debris.push({x:e.x,y:e.y-76,vx:dir*rand(60,170),vy:-rand(200,360),angle:0,spin:rand(-9,9),life:4,max:4,part:'head',type:e.type,scale:1,bounces:0});
}
function pHeal(n){if(player.hp<=0)return;player.hp=clamp(player.hp+n,0,100);player.heal=.3;}
function hurtPlayer(damage,dir){
  const p=player;if(p.hp<=0||p.invul>0||dead)return false;
  p.skill=null;
  p.hp=Math.max(0,p.hp-damage);p.invul=.92;p.hurt=.24;p.action=null;p.charging=false;p.vx=dir*280;p.vy=-170;combo=0;comboClock=0;
  stop=Math.max(stop,.065);shake=Math.max(shake,5);dangerFlash=.25;sparks(p.x,p.y-42,18,C.red,1);sfx('hurt');
  if(p.hp<=0){stop=.15;clearKeys();setTimeout(()=>{if(player===p&&p.hp<=0&&!dead)endGame();},240);}return true;
}
function perfectDodge(x,y){
  if(player.dash<=0||perfect>0)return;
  perfect=.65;slow=.23;player.dashStock=Math.min(2,player.dashStock+1);score+=100;
  texts.push({x:player.x,y:player.y-105,text:'擦 身 · 闪步返还',color:C.teal,life:.85,max:.85,size:15});ring(x,y,55,C.teal,.3);sfx('ready');
}
function enemyAttack(e){
  const p=player,range=e.type==='brute'&&e.arm?145:e.arm?110:57;
  const dx=(p.x-e.x)*e.lockDir,dy=Math.abs(p.y-e.y);
  if(dx>-28&&dx<range&&dy<76){if(p.dash>0)perfectDodge(p.x,p.y-40);hurtPlayer(e.type==='brute'&&e.arm?21:e.arm?13:8,e.lockDir);}
  if(e.arm){arcs.push({x:e.x,y:e.y-47,dir:e.lockDir,r:range,life:.19,max:.19,color:C.red,kind:'enemy',a:-1.4,b:1.25,width:11});}
  else dust(e.x+e.lockDir*30,e.y-25,6,C.red);
}
function updateEnemy(e,dt){
  e.flash=Math.max(0,e.flash-dt);e.alert=Math.max(0,e.alert-dt);e.chainT-=dt;if(e.chainT<=0)e.chain=0;
  if(e.dead){e.death-=dt;e.vx*=Math.exp(-dt*3);e.vy+=1500*dt;e.x+=e.vx*dt;e.y=Math.min(FLOOR,e.y+e.vy*dt);return;}
  if(e.spawn>0){e.spawn-=dt;return;}
  e.cd-=dt;e.step+=dt*(Math.abs(e.vx)/24+1);
  const p=player,dx=p.x-e.x,dist=Math.abs(dx),ground=e.y>=FLOOR-.1;
  if(e.stun>0){e.stun-=dt;e.vx*=Math.exp(-dt*(ground?7:2));if(e.stun<=0)e.state='idle';}
  else if(e.state==='wind'){
    e.t+=dt;e.vx*=Math.exp(-dt*10);
    if(e.t>=e.wind){e.state='attack';e.t=0;e.attackDone=false;
      if(e.type==='gunner'&&e.arm){
        shots.push({x:e.x+e.lockDir*38,y:e.y-47,vx:e.lockDir*440,vy:0,life:3,dead:false});sfx('slash',.4);sparks(e.x+e.lockDir*40,e.y-47,7,C.red,.5);e.attackDone=true;
      }else{e.vx=e.lockDir*(e.leg?(e.type==='brute'?440:330):105);sfx('slash',.5);}
    }
  }else if(e.state==='attack'){
    e.t+=dt;e.vx*=Math.exp(-dt*4);
    if(!e.attackDone&&e.t>=.055){enemyAttack(e);e.attackDone=true;}
    if(e.t>.23){e.state='recover';e.t=0;}
  }else if(e.state==='recover'){
    e.t+=dt;e.vx*=Math.exp(-dt*9);if(e.t>(e.arm?.54:.7)){e.state='idle';e.cd=rand(.4,.9);}
  }else{
    e.dir=sign(dx);const gun=e.type==='gunner'&&e.arm;
    const speed=(e.type==='brute'?76:e.type==='gunner'?100:133)*(e.leg?1:.3);
    const reach=gun?410:e.type==='brute'&&e.arm?130:e.arm?95:53;
    if(dist>reach){e.vx=lerp(e.vx,e.dir*speed,Math.min(1,dt*7));}
    else if(gun&&dist<180&&e.leg){e.vx=lerp(e.vx,-e.dir*65,dt*5);}
    else e.vx*=Math.exp(-dt*9);
    if(dist<reach+15&&e.cd<=0&&Math.abs(p.y-e.y)<130){
      // Keep simultaneous melee commitments readable rather than surrounding with permanent stun.
      const committed=enemies.filter(o=>o!==e&&(o.state==='wind'||o.state==='attack')).length;
      if(committed<2){e.state='wind';e.t=0;e.wind=gun?.8:e.type==='brute'&&e.arm?.83:e.arm?.57:.6;e.lockDir=e.dir;e.alert=.3;sfx('warn');}
    }
  }
  e.x=clamp(e.x+e.vx*dt,35,WORLD-35);e.vy+=1540*dt;e.y+=e.vy*dt;
  if(e.y>=FLOOR){if(e.landing&&e.vy>250){dust(e.x,FLOOR,13,C.gold);ring(e.x,FLOOR-3,50,'#63808a',.25);shake=Math.max(shake,2);sfx('land');e.stun=Math.max(e.stun,.25);e.landing=false;}e.y=FLOOR;e.vy=0;}
}

function sparks(x,y,n,color,power){for(let i=0;i<n;i++){const a=rand(-Math.PI,Math.PI),v=rand(80,360)*power;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.15,.43),max:.45,color,size:rand(1,3),kind:'spark'});}}
function dust(x,y,n,color){for(let i=0;i<n;i++)particles.push({x:x+rand(-10,10),y:y-2,vx:rand(-110,110),vy:rand(-100,-15),life:rand(.2,.55),max:.55,color,size:rand(1,3),kind:'dust'});}
function ring(x,y,r,color,life){rings.push({x,y,r:3,end:r,color,life,max:life});}
function createArc(p,a){
  const type=a.kind,down=type==='heavy'||type==='charged'||type==='dive';
  arcs.push({x:p.x+p.dir*7,y:p.y-43,dir:p.dir,r:a.range,life:down?.23:.18,max:down?.23:.18,color:a.color,kind:type,a:type==='rise'?1.6:down?-2.1:a.name==='light2'?1.4:-1.7,b:type==='rise'?-1.7:down?1.3:a.name==='light2'?-1.4:1.2,width:down?22:13});
}
function updateFX(dt){
  updateSkillFX(dt);
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.kind==='spark'?530:200)*dt;p.vx*=Math.exp(-dt*2);}
  particles=particles.filter(p=>p.life>0);
  for(const d of debris){d.life-=dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vy+=1100*dt;d.angle+=d.spin*dt;
    if(d.y>FLOOR-5){d.y=FLOOR-5;d.vy=-Math.abs(d.vy)*.35;d.vx*=.65;d.spin*=.5;if(d.bounces<2){dust(d.x,FLOOR,4,C.gold);d.bounces++;}if(Math.abs(d.vy)<35){d.vy=0;d.spin=0;}}}
  debris=debris.filter(d=>d.life>0);
  for(const a of arcs)a.life-=dt;arcs=arcs.filter(a=>a.life>0);
  for(const g of ghosts)g.life-=dt;ghosts=ghosts.filter(g=>g.life>0);
  for(const r of rings){r.life-=dt;r.r=lerp(3,r.end,ease(1-r.life/r.max));}rings=rings.filter(r=>r.life>0);
  for(const t of texts){t.life-=dt;t.y-=27*dt;}texts=texts.filter(t=>t.life>0);
}
function update(dt){
  clock+=dt;
  if(!playing||paused){updateFX(dt*.25);return;}
  perfect=Math.max(0,perfect-dt);dangerFlash=Math.max(0,dangerFlash-dt);
  // Buffered input survives hit stop; wall time only expires it while the simulation advances.
  if(stop>0){stop=Math.max(0,stop-dt);shake*=Math.exp(-dt*8);return;}
  if(slow>0){slow-=dt;dt*=.45;}
  for(const [k,v] of buffer){if(v<=dt)buffer.delete(k);else buffer.set(k,v-dt);}
  comboClock-=dt;if(comboClock<=0)combo=0;bannerTime=Math.max(0,bannerTime-dt);
  updatePlayer(dt);
  updateSkillObjects(dt);
  for(const e of enemies)updateEnemy(e,dt);
  // Soft separation keeps bodies legible without blocking player movement or air juggles.
  for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){
    const a=enemies[i],b=enemies[j];if(a.dead||b.dead||a.spawn>0||b.spawn>0||Math.abs(a.y-b.y)>35)continue;
    const dx=b.x-a.x;if(Math.abs(dx)<39){const push=(39-Math.abs(dx))*.5*dt*8;a.x-=sign(dx)*push;b.x+=sign(dx)*push;}
  }
  enemies=enemies.filter(e=>!e.dead||e.death>0);
  for(const s of shots){s.life-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;
    if(!s.dead&&Math.abs(s.x-player.x)<25&&Math.abs(s.y-(player.y-38))<40){if(player.dash>0)perfectDodge(player.x,player.y-40);if(hurtPlayer(11,sign(s.vx))||player.invul>0){s.dead=true;sparks(s.x,s.y,7,C.red,.7);}}
  }shots=shots.filter(s=>!s.dead&&s.life>0&&s.x>0&&s.x<WORLD);
  if(enemies.every(e=>e.dead)){if(waveClock<0){waveClock=1.4;if(player.hp>0)player.hp=Math.min(100,player.hp+12);texts.push({x:player.x,y:player.y-115,text:'铸庭净空 · 修复 +12',color:C.teal,life:1.4,max:1.4,size:16});}waveClock-=dt;if(waveClock<=0)startWave();}
  updateFX(dt);shake*=Math.exp(-dt*16);
  const target=clamp(player.x-W*.46+player.dir*45,0,Math.max(0,WORLD-W));cam=lerp(cam,target,1-Math.exp(-dt*5));
}

// All artwork is procedural geometry: articulated silhouettes, layered ink architecture and wet stone.
function poly(points,fill,stroke=null,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function line(x1,y1,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
function label(text,x,y,size,color,align='left',font='sans-serif'){ctx.font=`${size}px ForgeUI, ${font}`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(text,x,y);}
function rounded(x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function roof(x,y,w,h,color){poly([[x-w*.57,y+8],[x-w*.42,y-h*.25],[x-w*.25,y-h*.8],[x,y-h],[x+w*.25,y-h*.8],[x+w*.42,y-h*.25],[x+w*.57,y+8],[x+w*.35,y],[x-w*.35,y]],color);line(x-w*.56,y+9,x+w*.56,y+9,'#2e454d',2);}
function pagoda(x,y,w,levels){
  for(let i=0;i<levels;i++){const ww=w*(1-i*.15),yy=y-i*55;ctx.fillStyle='#132a35';ctx.fillRect(x-ww*.31,yy-45,ww*.62,53);roof(x,yy-43,ww,33,'#10242f');for(let j=-1;j<=1;j++){ctx.fillStyle='#21404a';ctx.fillRect(x+j*ww*.18-4,yy-34,8,24);}}
  line(x,y-levels*55-18,x,y-levels*55-58,'#223b43',3);
}
function lantern(x,y,scale=1){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);line(0,-36,0,-8,'#45616a',1);
  const g=ctx.createRadialGradient(0,0,2,0,0,60);g.addColorStop(0,'#fbb66822');g.addColorStop(1,'#fbb66800');ctx.fillStyle=g;ctx.fillRect(-60,-60,120,120);
  rounded(-8,-8,16,24,4,'#e4a65d');line(-10,-8,10,-8,'#382d29',3);line(-9,15,9,15,'#382d29',3);line(0,-6,0,14,'#ffd58a',3);line(0,17,0,30,'#c88349',1);ctx.restore();
}
function background(){
  const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#0a1525');sky.addColorStop(.55,'#19343f');sky.addColorStop(1,'#101f2a');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  const mx=W*.72-cam*.035;const moon=ctx.createRadialGradient(mx,134,10,mx,134,150);moon.addColorStop(0,'#b8d6c522');moon.addColorStop(1,'#b8d6c500');ctx.fillStyle=moon;ctx.fillRect(mx-150,-16,300,300);circle(mx,134,43,'#9db8b644');circle(mx+12,121,42,'#152c39');
  for(let i=0;i<3;i++){
    ctx.save();ctx.translate(-cam*(.08+i*.065),0);const base=330+i*54;
    poly([[-400,base],[0,base-85],[160,base-20],[355,base-155],[525,base-45],[760,base-109],[980,base-12],[1240,base-142],[1450,base-60],[1700,base-100],[2300,base-50],[2700,640],[-400,640]],['#122733','#16313b','#1b3941'][i]);ctx.restore();
  }
  ctx.save();ctx.translate(-cam*.25,0);pagoda(320,420,220,4);pagoda(1110,425,300,5);pagoda(1760,420,185,3);
  for(let x=-100;x<2600;x+=76){line(x,405,x,493,'#122a34',7);line(x,421,x+76,421,'#102832',6);}ctx.restore();
  const mist=ctx.createLinearGradient(0,340,0,535);mist.addColorStop(0,'#6db0b500');mist.addColorStop(.65,'#6db0b519');mist.addColorStop(1,'#6db0b500');ctx.fillStyle=mist;ctx.fillRect(0,340,W,195);
  ctx.save();ctx.translate(-cam*.65,0);
  for(let x=-120;x<WORLD+600;x+=380){
    ctx.fillStyle='#132630';ctx.fillRect(x-12,275,24,267);ctx.fillRect(x-25,270,50,13);poly([[x-27,270],[x-39,258],[x+39,258],[x+27,270]],'#20363e');line(x-5,289,x-5,530,'#28434a',2);
    line(x,287,x+110,310,'#12222a',3);line(x+110,310,x+207,284,'#12222a',3);lantern(x+110,345,.85);
    if(x%760===-120){ctx.save();ctx.translate(x+24,308);const bend=Math.sin(clock*1.4+x)*4;poly([[0,0],[38,0],[38+bend,113],[17+bend,126],[0,112]],'#31515a');label('鋳',19+bend,43,24,'#78978f','center','serif');label('庭',19+bend,76,24,'#78978f','center','serif');ctx.restore();}
  }ctx.restore();
  // Rain is deterministic and wraps without allocating particles.
  ctx.strokeStyle='#a7d1db14';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<115;i++){let x=((i*137.71-clock*115-cam*.2)%(W+100)+W+100)%(W+100),y=(i*71.13+clock*520)%650;ctx.moveTo(x,y);ctx.lineTo(x-5,y+17);}ctx.stroke();
  ctx.save();ctx.translate(-cam,0);
  const floor=ctx.createLinearGradient(0,FLOOR,0,720);floor.addColorStop(0,'#233e47');floor.addColorStop(.2,'#172b36');floor.addColorStop(1,'#091520');ctx.fillStyle=floor;ctx.fillRect(0,FLOOR,WORLD,200);
  ctx.fillStyle='#0d202b';ctx.fillRect(0,FLOOR-7,WORLD,7);line(0,FLOOR-7,WORLD,FLOOR-7,'#6f999c',2);line(0,FLOOR+3,WORLD,FLOOR+3,'#426670',1);
  for(let x=0;x<WORLD;x+=94){line(x,FLOOR+5,x-32,624,'#0a1a25',2);line(x-32,625,x-80,720,'#0d1c28',2);}line(0,624,WORLD,624,'#0b1b26',3);line(0,680,WORLD,680,'#0b1b26',3);
  for(let i=0;i<34;i++){const x=(i*163)%WORLD,y=FLOOR+18+(i*29)%125;ellipse(x,y,23+i%4*11,1.7,'#75a6ad10');line(x-11,y,x+16,y,'#80b5bd14');}
  for(let i=0;i<8;i++){let x=i*310+40;ctx.fillStyle='#132630';ctx.fillRect(x,FLOOR-24,44,17);poly([[x-6,FLOOR-24],[x+22,FLOOR-30],[x+50,FLOOR-24]],'#31494d');}
  // Arena end markers are visible walls, not invisible camera clamps.
  for(const x of [18,WORLD-18]){ctx.fillStyle='#12232b';ctx.fillRect(x-15,177,30,391);ctx.fillStyle='#35515a';ctx.fillRect(x-17,177,34,8);lantern(x,252,1.2);}
  ctx.restore();
}
function segment(ax,ay,bx,by,width,color,edge='#172d36'){
  line(ax,ay,bx,by,edge,width+4);line(ax,ay,bx,by,color,width);line(ax-2,ay,bx-2,by,'#ffffff12',2);
}
function blade(x,y,angle,length,color=C.pale,width=7){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);poly([[0,-width*.5],[length-12,-width*.5],[length+3,0],[length-10,width*.45],[0,width*.55]],'#203640',color,1.4);line(9,-width*.45,length-9,-width*.45,color,2);line(-5,-11,-5,11,'#d4b67c',3);line(-5,0,-23,0,'#182731',7);line(-9,-3,-9,3,'#b5ac8f',2);line(-16,-3,-16,3,'#b5ac8f',2);ctx.restore();
}
function posePlayer(){
  const p=player,t=p.step,moving=Math.abs(p.vx)>35;
  let pose={lean:0,hipY:-32,headX:1,headY:-72,frontKnee:[10,-19],frontFoot:[15,0],backKnee:[-10,-17],backFoot:[-14,0],elbow:[16,-48],hand:[27,-43],backElbow:[-14,-44],backHand:[-16,-31],sword:-.48};
  if(moving&&p.onGround&&!p.action&&!p.charging){let s=Math.sin(t*1.2);pose.lean=6;pose.hipY=-33+Math.abs(s)*3;pose.frontKnee=[s*16,-19];pose.frontFoot=[s*27,-Math.max(0,-s)*10];pose.backKnee=[-s*16,-17];pose.backFoot=[-s*27,-Math.max(0,s)*10];pose.hand=[-13,-34];pose.elbow=[0,-48];pose.sword=-2.8;}
  if(!p.onGround){pose.frontKnee=[21,-28];pose.frontFoot=[31,-13];pose.backKnee=[-16,-21];pose.backFoot=[-20,-2];pose.lean=4;}
  if(p.dash>0){pose.lean=20;pose.headY=-54;pose.headX=18;pose.hipY=-25;pose.frontKnee=[23,-18];pose.frontFoot=[31,0];pose.backFoot=[-37,-9];pose.backKnee=[-22,-18];pose.hand=[-8,-33];pose.elbow=[7,-38];pose.sword=-2.9;}
  if(p.charging){pose.lean=-7;pose.headX=-4;pose.headY=-66;pose.hand=[-23,-62];pose.elbow=[-24,-45];pose.sword=-1.6;pose.frontFoot=[25,0];pose.frontKnee=[15,-16];pose.backFoot=[-24,0];}
  if(p.action){const a=p.action,q=clamp((a.t-a.wind)/a.active,0,1),wind=a.t<a.wind;let angle;
    if(a.kind==='rise'){angle=lerp(1.4,-1.8,ease(q));pose.lean=2;}
    else if(a.kind==='heavy'||a.kind==='charged'||a.kind==='dive'){angle=lerp(-2.1,.9,ease(q));pose.lean=wind?-8:14;pose.headY=-65;pose.headX=pose.lean*.5;}
    else {angle=a.name==='light2'?lerp(1.2,-1.5,ease(q)):lerp(-1.7,1.1,ease(q));pose.lean=wind?-4:10;}
    if(wind)angle=a.kind==='rise'?1.5:(a.name==='light2'?1.5:-2);
    pose.hand=[12+Math.cos(angle)*23,-48+Math.sin(angle)*22];pose.elbow=[7+Math.cos(angle-.5)*15,-47+Math.sin(angle-.5)*15];pose.sword=angle;pose.frontFoot=[27,0];pose.backFoot=[-24,0];pose.frontKnee=[19,-17];
    if(!p.onGround){pose.frontFoot=[25,-17];pose.backFoot=[-19,-4];}
  }
  if(p.hurt>0){pose.lean=-13;pose.headX=-13;pose.hand=[18,-36];pose.sword=.7;}
  if(p.land>0){pose.hipY+=6;pose.headY+=6;}
  return skillPose(pose);
}
function drawPlayerAt(x,y,dir,pose,alpha=1,ghost=false){
  ctx.save();ctx.translate(x,y);ctx.scale(dir,1);ctx.globalAlpha=alpha;
  const p=pose,l=p.lean,coat=ghost?'#47cdb1':'#d9e5d8',dark=ghost?'#2d8b89':'#1a3640';
  // Scarf stretches with velocity and reacts to movement rather than being a static sprite.
  const flutter=Math.sin(clock*15-x*.03)*6,stretch=player&&player.dash>0?32:0;
  poly([[l-5,p.headY+18],[l-29-stretch,p.headY+11+flutter],[l-54-stretch,p.headY+24-flutter],[l-36-stretch,p.headY+22+flutter],[l-14,p.headY+28]],'#69d2bf');
  segment(-5,p.hipY,p.backKnee[0],p.backKnee[1],9,dark);segment(...p.backKnee,...p.backFoot,8,'#18303a');line(p.backFoot[0]-8,p.backFoot[1]-2,p.backFoot[0]+6,p.backFoot[1]-2,'#101d27',7);
  segment(5,p.hipY,p.frontKnee[0],p.frontKnee[1],10,'#38535a');segment(...p.frontKnee,...p.frontFoot,8,'#223b45');line(p.frontFoot[0]-5,p.frontFoot[1]-2,p.frontFoot[0]+10,p.frontFoot[1]-2,'#10242e',7);
  segment(l-6,-55,p.backElbow[0],p.backElbow[1],8,dark);segment(...p.backElbow,...p.backHand,7,dark);
  poly([[l-11,-59],[l+10,-58],[10,p.hipY+2],[21,-13],[3,-18],[-5,-13],[-19,-17],[-10,p.hipY]],coat,'#102c35',2);
  poly([[l-9,-58],[l-1,-59],[5,-30],[-9,-30]],'#52797a');line(-12,-31,12,-31,'#19333b',7);line(-8,-32,9,-32,'#d2b784',2);
  // Sword sheath and coat seam.
  line(-6,-31,-36,-12,'#152733',6);line(-8,-29,-32,-15,'#8eafae',1);
  circle(p.headX,p.headY+4,11,'#182e38');poly([[p.headX-10,p.headY-4],[p.headX+4,p.headY-9],[p.headX+13,p.headY-2],[p.headX+11,p.headY+9],[p.headX-8,p.headY+10]],'#d8e5d9','#142b33',1.4);
  poly([[p.headX-10,p.headY-3],[p.headX-6,p.headY-11],[p.headX+8,p.headY-9],[p.headX+12,p.headY-4]],'#18333e');line(p.headX+2,p.headY+1,p.headX+11,p.headY-1,C.teal,2);line(p.headX-7,p.headY+13,p.headX+8,p.headY+13,'#7be6cb',6);
  segment(l+6,-54,...p.elbow,9,coat);segment(...p.elbow,...p.hand,7,'#34515a');circle(...p.hand,4,'#dae6d9');blade(...p.hand,p.sword,72,ghost?'#7ff3d3':C.pale,6);
  ctx.restore();
}
function drawPlayer(){
  const p=player;ellipse(p.x,FLOOR+3,25,5,'#020b1480');
  if(p.charging){const q=clamp(p.charge/.46,0,1);ctx.save();ctx.globalAlpha=.35+q*.4;ctx.strokeStyle=C.gold;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y-42,42,clock*4,clock*4+q*TAU);ctx.stroke();ctx.restore();if(q>=1)circle(p.x+p.dir*-22,p.y-65,4+Math.sin(clock*30),C.pale);}
  let alpha=p.invul>0&&p.dash<=0?(Math.sin(clock*65)>0?.5:1):1;
  drawPlayerAt(p.x,p.y,p.dir,posePlayer(),alpha);
  if(p.heal>0){ctx.strokeStyle='#9cf8dc66';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-37,26,45,0,0,TAU);ctx.stroke();}
}
function mechArm(part,type,scale=1){
  ctx.save();ctx.scale(scale,scale);
  if(part==='arm'){segment(0,0,14,12,12,'#587078');circle(0,0,5,'#e5b36d');segment(14,12,31,10,11,'#40515d');circle(14,12,4,'#bc9460');
    if(type==='gunner'){rounded(22,2,31,15,2,'#243b47');line(34,5,54,5,'#bf9966',3);circle(24,9,3,C.red);}
    else if(type==='brute'){line(28,9,67,9,'#283e49',6);poly([[55,-15],[78,-11],[84,13],[63,24],[55,9]],'#739092','#c7b786',2);}
    else blade(31,10,-.2,54,'#e9ae7d',9);
  }else if(part==='leg'){segment(0,0,4,16,13,'#526d76');circle(4,16,5,'#b79665');segment(4,16,13,34,11,'#354f5c');line(6,35,23,35,'#243d49',9);}
  else{poly([[-11,-10],[10,-12],[15,2],[6,11],[-12,7]],'#6a8588','#152d39',3);line(-3,-1,10,-1,C.red,3);}
  ctx.restore();
}
function drawEnemy(e){
  const scale=e.type==='brute'?1.3:1,dir=e.state==='wind'||e.state==='attack'?e.lockDir:e.dir;
  const spawnAlpha=e.spawn>0?clamp(1-e.spawn/.7,0,1):1;
  if(e.spawn>0){ctx.save();ctx.globalAlpha=.35;ellipse(e.x,FLOOR,34,7,C.gold);line(e.x,FLOOR,e.x,FLOOR-100,'#ffc77533',2);ctx.restore();}
  ellipse(e.x,FLOOR+3,25*scale,5*scale,'#020b1480');
  ctx.save();ctx.translate(e.x,e.y);ctx.scale(dir*scale,scale);ctx.globalAlpha=(e.dead?clamp(e.death/.35,0,1):1)*spawnAlpha;
  const wind=e.state==='wind',atk=e.state==='attack',stun=e.stun>0;
  let lean=stun?-10:atk?13:wind?-6:0;
  let bob=(Math.abs(e.vx)>10&&e.y>=FLOOR)?Math.sin(e.step*1.2)*2:0;
  let hip=-32+(e.leg?0:10)+bob;
  let gait=Math.sin(e.step*1.2)*(Math.abs(e.vx)>10?1:0),foot1=[gait*18+7,0],foot2=[-gait*18-9,0];
  const metal=e.flash>0?'#f8e9b8':e.type==='gunner'?'#617079':e.type==='brute'?'#687278':'#536d76';
  segment(-7,hip,-8-gait*8,-16,12,'#2a424f');segment(-8-gait*8,-16,...foot2,10,'#3c535f');line(foot2[0]-6,-2,foot2[0]+9,-2,'#203744',8);
  if(e.leg){segment(7,hip,9+gait*9,-17,12,metal);circle(9+gait*9,-17,5,'#bf9e6a');segment(9+gait*9,-17,...foot1,10,metal);line(foot1[0]-4,-2,foot1[0]+13,-2,'#29424c',8);}
  else{segment(6,hip,9,hip+11,11,metal);circle(9,hip+12,4,C.gold);if(Math.sin(clock*30)>0)line(9,hip+12,13,hip+19,C.gold,1);}
  // Rear arm, rib cage and exposed reactor stay visible when the weapon arm is removed.
  segment(lean-10,hip-24,-20,hip-7,10,'#2d4551');segment(-20,hip-7,-13,hip+4,8,'#3b5361');
  poly([[lean-16,hip-32],[lean+14,hip-33],[lean+19,hip-18],[10,hip+6],[-10,hip+6],[lean-19,hip-17]],metal,'#132b38',3);
  poly([[lean-11,hip-27],[lean+10,hip-27],[lean+8,hip-7],[-5,hip-3]],'#243e4c');circle(lean+1,hip-17,6,'#bf8053');circle(lean+1,hip-17,3,e.arm?C.red:C.gold);
  for(let i=0;i<3;i++)line(-8,hip-2+i*4,9,hip-2+i*4,'#122c39',2);
  if(!e.dead){ctx.save();ctx.translate(lean,hip-43);if(stun)ctx.rotate(-.2);mechArm('head',e.type);ctx.restore();}
  if(e.type==='gunner')poly([[lean-16,hip-33],[lean-24,hip-46],[lean-25,hip-8],[lean-17,hip]],'#344e5a');
  if(e.arm){
    const angle=e.type==='gunner'?(wind||atk?-.27:.35):wind?-1.9:atk?.3:1.0;
    ctx.save();ctx.translate(lean+12,hip-25);ctx.rotate(angle);mechArm('arm',e.type);ctx.restore();
    circle(lean+12,hip-25,7,metal);circle(lean+12,hip-25,3,'#d9bb7e');
  }else{circle(lean+12,hip-25,6,'#1a2f38');circle(lean+13,hip-25,3,C.gold);line(lean+16,hip-25,lean+22,hip-21+Math.sin(clock*30)*4,C.gold,1);}
  ctx.restore();
  if(e.dead||e.spawn>0)return;
  const top=e.y-99*scale;
  if(e.hp<e.maxHp||wind){ctx.fillStyle='#0a1722';ctx.fillRect(e.x-24,top,48,3);ctx.fillStyle=e.arm?'#a8bab6':'#dfb16d';ctx.fillRect(e.x-24,top,48*Math.max(0,e.hp/e.maxHp),3);}
  if(wind){
    const q=clamp(e.t/e.wind,0,1);ctx.save();ctx.globalAlpha=.4+q*.5;
    const range=e.type==='gunner'&&e.arm?380:e.type==='brute'&&e.arm?145:e.arm?110:57;
    if(e.type==='gunner'&&e.arm){line(e.x,e.y-47,e.x+dir*range,e.y-47,'#ff7c6660',1);}
    else{poly([[e.x,e.y-2],[e.x+dir*range,e.y-2],[e.x+dir*range,e.y-7],[e.x,e.y-7]],'#ff776433');line(e.x,e.y-4,e.x+dir*range*q,e.y-4,C.red,2);}
    ctx.translate(e.x,top-17);ctx.rotate(Math.PI/4);ctx.strokeStyle=C.red;ctx.lineWidth=1.5;ctx.strokeRect(-6,-6,12,12);ctx.restore();label('!',e.x,top-13,13,C.red,'center');
  }
}
function drawArc(a){
  const q=1-a.life/a.max,alpha=(1-q)*.8;
  ctx.save();ctx.translate(a.x,a.y);ctx.scale(a.dir, a.kind==='rise'?1:.78);ctx.globalCompositeOperation='lighter';
  const start=lerp(a.a,a.b,Math.max(0,q-.42)),end=lerp(a.a,a.b,Math.min(1,q*2.4+.16));
  const reverse=end<start;
  ctx.beginPath();ctx.arc(0,0,a.r,start,end,reverse);ctx.arc(0,0,a.r-a.width,end,start,!reverse);ctx.closePath();ctx.fillStyle=a.color;ctx.globalAlpha=alpha*.46;ctx.fill();
  ctx.beginPath();ctx.arc(0,0,a.r,start,end,reverse);ctx.lineWidth=2;ctx.strokeStyle=a.color;ctx.globalAlpha=alpha;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,a.r-8,start+.05*(reverse?-1:1),end,reverse);ctx.lineWidth=1;ctx.globalAlpha=alpha*.6;ctx.stroke();ctx.restore();
}
function drawEffects(){
  drawSkillObjects();
  for(const d of debris){ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.angle);ctx.globalAlpha=clamp(d.life,0,1);mechArm(d.part,d.type,d.scale);ctx.restore();}
  for(const a of arcs)drawArc(a);
  for(const r of rings){ctx.save();ctx.globalAlpha=r.life/r.max*.6;ctx.strokeStyle=r.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(r.x,r.y,r.r,r.r*(r.y>FLOOR-10?.23:1),0,0,TAU);ctx.stroke();ctx.restore();}
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);if(p.kind==='spark'){line(p.x,p.y,p.x-p.vx*.025,p.y-p.vy*.025,p.color,p.size);}else circle(p.x,p.y,p.size,p.color);}
  for(const s of shots){line(s.x-sign(s.vx)*24,s.y,s.x,s.y,C.red,3);circle(s.x,s.y,4,'#ffe5b1');}
  ctx.restore();
  for(const t of texts){ctx.save();ctx.globalAlpha=clamp(t.life/.2,0,1);ctx.shadowColor='#091722';ctx.shadowBlur=5;label(t.text,t.x,t.y,t.size,t.color,'center');ctx.restore();}
}
function hud(){
  const p=player;
  const grad=ctx.createLinearGradient(0,0,0,150);grad.addColorStop(0,'#07111dd9');grad.addColorStop(1,'#07111d00');ctx.fillStyle=grad;ctx.fillRect(0,0,W,150);
  label('断 械',32,39,21,'#dce9e1','left','serif');label('雨夜铸庭 / THE RAIN FORGE',113,37,10,'#7895a2');
  label('刃 客  /  VITAL',32,70,10,'#9eb8bf');label(Math.ceil(p.hp)+' / 100',307,70,11,p.hp<30?C.red:'#b5cacb','right','monospace');
  rounded(32,80,276,8,2,'#1d333e');rounded(32,80,276*p.hp/100,8,2,p.hp<30?C.red:'#a0dfcc');
  for(let i=1;i<5;i++)line(32+276*i/5,80,32+276*i/5,88,'#102b36',2);
  for(let i=0;i<2;i++){rounded(32+i*31,99,25,4,1,'#243c47');if(p.dashStock>i)rounded(32+i*31,99,25,4,1,C.teal);else if(i===p.dashStock)rounded(32+i*31,99,25*p.dashRegen/.82,4,1,'#558e88');}
  label('闪步',98,105,10,'#87a8af');label(p.riseCD<=0?'升龙 就绪':'升龙 '+p.riseCD.toFixed(1)+'s',148,105,10,p.riseCD<=0?'#a3d6cc':'#607b87');
  label('WAVE '+String(wave).padStart(2,'0'),W*.5,34,12,'#bed0ce','center','monospace');line(W*.5-42,45,W*.5+42,45,'#597376',1);label('守卫 '+enemies.filter(e=>!e.dead).length+'   /   断械 '+limbBreakCount,W*.5,64,11,'#8ca7ae','center');
  label(String(score).padStart(6,'0'),W-34,92,22,'#e4d3ad','right','monospace');label('FORGE SCORE',W-34,112,9,'#758d98','right');
  if(combo>1){
    const x=W-44,y=181;label(String(combo).padStart(2,'0'),x,y,52,combo>=10?C.gold:C.teal,'right','monospace');label(combo>=15?'S / 断械如流':combo>=8?'A / 锋芒连缀':'连 击 / CHAIN',x,y+23,11,combo>=10?C.gold:'#9bb7b9','right');
    ctx.fillStyle='#233740';ctx.fillRect(x-90,y+35,90,2);ctx.fillStyle=combo>=10?C.gold:C.teal;ctx.fillRect(x-90,y+35,90*clamp(comboClock/2.7,0,1),2);
  }
  if(bannerTime>0){ctx.save();ctx.globalAlpha=Math.min(1,bannerTime, (2.8-bannerTime)*3);label(banner,W/2,142,18,'#d9d7bd','center');label('DISMANTLE / REPAIR / REPEAT',W/2,163,9,'#7eaaa9','center','monospace');ctx.restore();}
  const bar=ctx.createLinearGradient(0,H-84,0,H);bar.addColorStop(0,'#07111d00');bar.addColorStop(.5,'#07111dd0');bar.addColorStop(1,'#07111df5');ctx.fillStyle=bar;ctx.fillRect(0,H-84,W,84);
  const items=[['A D / ← →','移动'],['SPACE','二段跳'],['J','连斩'],['K 长按','蓄力断械'],['L','闪步'],['I','升龙'],['R','重开']];
  const widths=[148,141,100,167,100,100,86],total=widths.reduce((a,b)=>a+b,0);let x=(W-total)/2;
  for(let i=0;i<items.length;i++){const [k,t]=items[i];const kw=k.length*7+14;rounded(x,H-45,kw,24,3,'#1a303c');ctx.strokeStyle='#3c5660';ctx.lineWidth=1;ctx.strokeRect(x+.5,H-44.5,kw-1,23);label(k,x+kw/2,H-29,11,'#d9d8c2','center','monospace');label(t,x+kw+7,H-28,11,'#9ab3bd');x+=widths[i];}
  drawSkillHUD();
  if(dangerFlash>0){ctx.save();ctx.globalAlpha=dangerFlash*1.6;const v=ctx.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,W*.65);v.addColorStop(0,'#ff574500');v.addColorStop(1,'#ff5745');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);ctx.restore();}
  if(paused){ctx.fillStyle='#07111dbb';ctx.fillRect(0,0,W,H);label('雨 暂 歇',W/2,H/2-15,34,C.pale,'center','serif');label('Enter 或点击场景继续',W/2,H/2+26,14,'#99c6c5','center');}
}
function draw(){
  const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr*ratio,0,0,dpr*ratio,0,0);ctx.clearRect(0,0,W,H);
  background();ctx.save();ctx.translate(-cam+(shake>.1?rand(-shake,shake):0),shake>.1?rand(-shake,shake)*.45:0);
  for(const g of ghosts)drawPlayerAt(g.x,g.y,g.dir,g.pose,g.life/g.max*.28,true);
  for(const e of enemies)drawEnemy(e);drawPlayer();drawEffects();ctx.restore();hud();
  // Fine screen vignette frames the stage without obscuring attack tells.
  const vignette=ctx.createRadialGradient(W/2,H*.46,H*.35,W/2,H*.46,W*.8);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#02091555');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
}
player=makePlayer();cam=clamp(player.x-W*.45,0,Math.max(0,WORLD-W));spawnEnemy('blade',1080);spawnEnemy('gunner',530);enemies.forEach(e=>e.spawn=0);
function frame(now){
  const elapsed=last?Math.min((now-last)/1000,.034):1/60;last=now;dt=elapsed;
  update(elapsed);draw();requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
