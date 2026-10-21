'use strict';
const $=id=>document.getElementById(id),canvas=$('field'),ctx=canvas.getContext('2d');
const ICON={worker:'⬡',rifle:'♟',tank:'▰',raider:'➤'},NAMES={worker:'采矿机',rifle:'步兵',tank:'坦克',raider:'突击车'};
let game=null,seat=null,selected=new Set(),baseSelected=false,drag=null,attackMode=false,polling=false,lastReceive=0,lastEvent=0,feed=[],pointer={x:0,y:0},marker=null;
const smooth=new Map(),effects=[];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
async function request(route,body){
 const res=await fetch(route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(seat?.token?{Authorization:'Bearer '+seat.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await res.json();if(!res.ok)throw Error(result.error||'连接失败');return result;
}
async function order(data){if(!seat||!game)return;try{await request('/api/matches/'+seat.match+'/commands',data);await poll();}catch(e){toast(e.message);}}
function me(){return game?.players.find(p=>p.id===game.yourPlayer);}
function ownArmy(){return game?.units.filter(u=>u.owner===game.yourPlayer&&u.type!=='worker')||[];}
function selection(){return game?.units.filter(u=>selected.has(u.id))||[];}
function log(text){feed.push(text);feed=feed.slice(-4);$('feed').innerHTML=feed.map(s=>'<span>'+esc(s)+'</span>').join('');}
async function newGame(){
 try{
  const made=await request('/api/matches',{count:Number($('player-count').value)});
  seat={match:made.match,token:made.seats[0].token};localStorage.setItem('frontier-seat',JSON.stringify(seat));
  history.replaceState(null,'','/?match='+seat.match);selected.clear();smooth.clear();effects.length=0;feed=[];lastEvent=0;baseSelected=false;attackMode=false;
  update(made.state);log('战役就绪。采矿机将自动采集附近矿脉。');
 }catch(e){toast(e.message);}
}
function update(next){
 game=next;lastReceive=performance.now();
 const live=new Set(game.units.map(u=>u.id));for(const id of selected)if(!live.has(id))selected.delete(id);
 for(const id of smooth.keys())if(!live.has(id))smooth.delete(id);
 for(const e of game.events){
  if(e.id<=lastEvent)continue;lastEvent=e.id;
  effects.push({...e,born:performance.now()});
  if(e.type==='capture')log(game.players[e.owner].name+' 占领了'+game.nodes.find(n=>n.id===e.node).name);
  if(e.type==='eliminated')log(game.players[e.owner].name+' 的指挥部已被摧毁');
  if(e.type==='upgrade')log(game.players[e.owner].name+' 完成武器升级');
 }
 hud();
}
async function poll(){
 if(!seat||polling)return;polling=true;
 try{update(await request('/api/matches/'+seat.match));$('connection').innerHTML='<i></i> 指挥链路在线';}
 catch(e){$('connection').textContent='连接中断 · 刷新可重连';}finally{polling=false;}
}
function hud(){
 const p=me(),base=game.bases.find(b=>b.owner===p?.id),active=game.status==='playing'&&!game.paused&&p?.alive;
 $('phase').textContent=game.status==='ready'?'战役待命':game.status==='finished'?'战役结束':game.paused?'战役暂停':'交战中';
 $('credits').textContent=p?.credits??'—';$('population').textContent=p?.population??'—';
 const nodes=game.nodes.filter(n=>n.owner===p?.id).length;
 $('income').textContent='+'+(1.5+nodes*3).toFixed(1)+'/s';$('income').title='指挥部与中继站收入；采矿收益另计';
 $('node-count').textContent='中继站 '+nodes+' / 3';
 $('clock').textContent=String(Math.floor(game.now/60)).padStart(2,'0')+':'+String(Math.floor(game.now%60)).padStart(2,'0');
 $('pause').textContent=game.paused?'▶ 继续':'Ⅱ 暂停';$('pause').disabled=game.status!=='playing'||game.yourPlayer!==0||game.players.some(q=>q.id!==0&&q.kind!=='bot');
 $('base-health').textContent=base?Math.max(0,Math.ceil(base.hp))+' / '+base.maxHp:'观战';$('base-health-fill').style.width=base?Math.max(0,base.hp/base.maxHp*100)+'%':'0%';
 for(const btn of document.querySelectorAll('[data-unit]')){const type=btn.dataset.unit;btn.disabled=!active||p.credits<game.types[type].cost||p.population+(base?.queue.length||0)>=40||(base?.queue.length||0)>=6;}
 $('queue-count').textContent=(base?.queue.length||0)+' / 6';
 $('queue').innerHTML=base?.queue.length?base.queue.map((q,i)=>`<span class="queue-item" title="${NAMES[q.type]} · ${Math.ceil(q.remaining)} 秒">${ICON[q.type]}<i style="width:${i?0:(1-q.remaining/q.total)*100}%"></i></span>`).join(''):'<span class="empty-queue">等待生产指令</span>';
 const upgradeCost=180+(p?.level||0)*120;
 $('upgrade-cost').textContent=p?.level===2?'已满级':'◆ '+upgradeCost+' · Lv.'+(p?.level||0);
 $('upgrade').disabled=!active||p.level>=2||p.credits<upgradeCost;
 const cool=p?Math.max(0,30-(game.now-p.repairAt)):0;
 $('repair-cost').textContent=cool>0?Math.ceil(cool)+' 秒冷却':'◆ 100 · 恢复 400';
 $('repair').disabled=!active||p.credits<100||base.hp>=base.maxHp||cool>0;
 $('players').innerHTML=game.players.map(q=>`<div class="player-row ${q.alive?'':'dead'}"><i style="color:${q.color};background:${q.color}"></i><b>${esc(q.name)}${q.id===game.yourPlayer&&q.name!=='你'?' · 你':''}</b><small>${q.alive?q.population+' 单位 · '+q.kills+' 击毁':'已淘汰'}</small></div>`).join('');
 const overlay=game.status!=='playing'||game.paused||p&&!p.alive;
 $('overlay').classList.toggle('hidden',!overlay);$('overlay').classList.toggle('modal-finished',game.status==='finished'||p&&!p.alive);
 if(game.status==='finished'||p&&!p.alive){
  const won=game.winner===game.yourPlayer;
  $('overlay-title').textContent=game.status!=='finished'?'指挥部失守。':game.winner===null?'战役平局。':won?'前线属于你。':'战役失利。';
  $('overlay-copy').textContent=(game.status==='finished'?game.reason+'。':'其他势力仍在交战。')+(p?' 你的战役积分 '+p.score+'，摧毁 '+p.kills+' 个目标。':'');
  $('start').innerHTML='再战一局 <span>↗</span>';$('overlay-foot').textContent='调整兵种搭配与扩张节奏，下一次再来。';
 }else if(game.paused){
  $('overlay-title').textContent='战场暂歇。';$('overlay-copy').textContent='整理思路，再继续推进。时间与战斗均已暂停。';$('start').innerHTML='继续战役 <span>→</span>';$('overlay-foot').textContent='也可以按空格继续';
 }else if(game.status==='ready'){
  $('overlay-title').textContent='指挥官，就位。';$('overlay-copy').innerHTML='占领矿区，建立你的部队。<br>摧毁敌方指挥部，成为最后的胜者。';$('start').innerHTML=game.yourPlayer===0?'开始战役 <span>→</span>':'等待房主开始';$('start').disabled=game.yourPlayer!==0;$('overlay-foot').textContent='单人战役可随时按空格暂停 · 无操作速度要求';
 }
 if(game.status!=='ready')$('start').disabled=false;
 for(const id of ['center-order','attack-base','stop-order'])$(id).disabled=!active;
 for(const id of ['select-army','select-workers'])$(id).disabled=!p?.alive;
 selectedHud();
}
function selectedHud(){
 const units=selection(),counts={};for(const u of units)counts[u.type]=(counts[u.type]||0)+1;
 $('selection-title').textContent=baseSelected?'指挥部 · 集结点':units.length?'已选择 '+units.length+' 个单位':'等待你的指令';
 $('selection-detail').textContent=baseSelected?'右键战场，设置新兵集结位置':units.length?Object.entries(counts).map(([k,n])=>NAMES[k]+' × '+n).join(' / '):'左键点击单位，或拖动框选';
 $('selection-icon').textContent=baseSelected?'⌂':units.length===1?ICON[units[0].type]:'⌖';
 $('mode-hint').classList.toggle('hidden',!attackMode);
}
function world(e){const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/1280,r.height/840);return {x:(e.clientX-r.left-(r.width-1280*scale)/2)/scale,y:(e.clientY-r.top-(r.height-840*scale)/2)/scale};}
function hitUnit(p,filter=()=>true){return game.units.filter(filter).filter(u=>Math.hypot(u.x-p.x,u.y-p.y)<u.r+12).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];}
function flash(p){marker={...p,born:performance.now()};}
function issue(p){
 if(!game||game.status!=='playing'||game.paused)return;
 if(baseSelected){order({type:'rally',...p});flash(p);return;}
 const us=selection();if(!us.length){toast('先选择单位，或按 1 全选部队');return;}
 const enemy=hitUnit(p,u=>u.owner!==game.yourPlayer)||game.bases.find(b=>b.owner!==game.yourPlayer&&b.hp>0&&Math.hypot(b.x-p.x,b.y-p.y)<43);
 const mine=game.mines.find(m=>m.ore>0&&Math.hypot(m.x-p.x,m.y-p.y)<27);
 const workers=us.filter(u=>u.type==='worker'),army=us.filter(u=>u.type!=='worker');
 if(mine&&workers.length)order({type:'gather',units:workers.map(u=>u.id),target:mine.id});
 else if(workers.length)order({type:'move',units:workers.map(u=>u.id),...p});
 if(army.length)order(enemy?{type:'attack',units:army.map(u=>u.id),target:enemy.id}:{type:'attackMove',units:army.map(u=>u.id),...p});
 flash(p);attackMode=false;selectedHud();
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
 if(!game||!me()?.alive)return;const p=world(e);if(p.x<0||p.x>1280||p.y<0||p.y>840)return;pointer=p;
 if(e.button===2){e.preventDefault();issue(p);return;}
 if(e.button!==0)return;if(attackMode){issue(p);return;}
 drag={start:p,end:p,shift:e.shiftKey};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{pointer=world(e);if(drag)drag.end=pointer;});
canvas.addEventListener('pointerup',e=>{
 if(!drag||e.button!==0)return;const d=drag;drag=null;if(!d.shift)selected.clear();baseSelected=false;
 if(Math.hypot(d.start.x-d.end.x,d.start.y-d.end.y)>7){
  for(const u of game.units)if(u.owner===game.yourPlayer&&u.x>=Math.min(d.start.x,d.end.x)&&u.x<=Math.max(d.start.x,d.end.x)&&u.y>=Math.min(d.start.y,d.end.y)&&u.y<=Math.max(d.start.y,d.end.y))selected.add(u.id);
 }else{
  const u=hitUnit(d.end,u=>u.owner===game.yourPlayer);if(u){if(d.shift&&selected.has(u.id))selected.delete(u.id);else selected.add(u.id);}
  else baseSelected=game.bases.some(b=>b.owner===game.yourPlayer&&Math.hypot(b.x-d.end.x,b.y-d.end.y)<43);
 }selectedHud();
});
canvas.addEventListener('pointercancel',()=>{drag=null;});
function selectAll(worker=false){selected=new Set(game?.units.filter(u=>u.owner===game.yourPlayer&&(u.type==='worker')===worker).map(u=>u.id)||[]);baseSelected=false;selectedHud();}
$('select-army').onclick=()=>selectAll();$('select-workers').onclick=()=>selectAll(true);
$('center-order').onclick=()=>{if(!selection().some(u=>u.type!=='worker'))selectAll();const base=game.bases[game.yourPlayer];const dest=game.nodes.filter(n=>n.owner!==game.yourPlayer).sort((a,b)=>Math.hypot(a.x-base.x,a.y-base.y)-Math.hypot(b.x-base.x,b.y-base.y))[0]||game.nodes[0];issue(dest);};
$('attack-base').onclick=()=>{if(!selection().some(u=>u.type!=='worker'))selectAll();const base=game.bases[game.yourPlayer],dest=game.bases.filter(b=>b.owner!==game.yourPlayer&&b.hp>0).sort((a,b)=>Math.hypot(a.x-base.x,a.y-base.y)-Math.hypot(b.x-base.x,b.y-base.y))[0];if(dest)issue(dest);};
$('stop-order').onclick=()=>{if(selected.size)order({type:'stop',units:[...selected]});};
for(const b of document.querySelectorAll('[data-unit]'))b.onclick=()=>order({type:'train',unit:b.dataset.unit});
$('upgrade').onclick=()=>order({type:'upgrade'});$('repair').onclick=()=>order({type:'repair'});$('pause').onclick=()=>order({type:'pause'});$('new-game').onclick=newGame;
$('start').onclick=()=>{if(game.status==='finished'||me()&&!me().alive)newGame();else order({type:game.paused?'pause':'start'});};
$('focus-view').onclick=()=>{const on=document.body.classList.toggle('focus-view');$('focus-view').textContent=on?'退出专注 ⛶':'专注视图 ⛶';window.scrollTo(0,0);};
document.addEventListener('keydown',e=>{
 if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||!game)return;
 const k=e.key.toLowerCase();
 if(k===' '){e.preventDefault();if(!$('pause').disabled)order({type:'pause'});}
 else if(k==='1')selectAll();else if(k==='2')selectAll(true);
 else if(k==='a'){attackMode=!attackMode;selectedHud();}
 else if(k==='escape'){attackMode=false;selected.clear();baseSelected=false;selectedHud();}
 else if(k==='s')$('stop-order').click();else if(['q','w','e','r'].includes(k))order({type:'train',unit:{q:'rifle',w:'tank',e:'worker',r:'raider'}[k]});
});
// A deterministic, hand-drawn terrain layer; decoration never blocks commands.
const terrain=document.createElement('canvas');terrain.width=1280;terrain.height=840;
const tc=terrain.getContext('2d');
let rng=7361;function random(){rng=(rng*1664525+1013904223)>>>0;return rng/4294967296;}
function terrainDraw(){
 tc.fillStyle='#293c36';tc.fillRect(0,0,1280,840);
 for(let i=0;i<75;i++){
  const x=random()*1280,y=random()*840,r=35+random()*130;
  const grad=tc.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,i%3?'#42584455':'#9b947b21');grad.addColorStop(1,'#34463a00');tc.fillStyle=grad;tc.beginPath();tc.arc(x,y,r,0,Math.PI*2);tc.fill();
 }
 tc.strokeStyle='#a9bb9220';tc.lineWidth=1;
 for(let n=0;n<8;n++){tc.beginPath();tc.ellipse(635,420,120+n*31,90+n*25,-.3,0,Math.PI*2);tc.stroke();}
 tc.strokeStyle='#b6b49618';tc.lineWidth=45;tc.lineCap='round';
 for(const [x,y]of [[0,420],[1280,420],[640,0],[640,840]]){tc.beginPath();tc.moveTo(x,y);tc.quadraticCurveTo(x*.6+256,y*.6+168,640,420);tc.stroke();}
 tc.strokeStyle='#77917a13';tc.lineWidth=1;
 for(let x=0;x<1280;x+=40){tc.beginPath();tc.moveTo(x,0);tc.lineTo(x,840);tc.stroke();}
 for(let y=0;y<840;y+=40){tc.beginPath();tc.moveTo(0,y);tc.lineTo(1280,y);tc.stroke();}
 for(let i=0;i<1800;i++){
  const x=random()*1280,y=random()*840;
  if(i%4){tc.strokeStyle=['#82957830','#182e2550','#adba7b25'][i%3];tc.beginPath();tc.moveTo(x,y);tc.lineTo(x+random()*5-2,y-3-random()*4);tc.stroke();}
  else{tc.fillStyle='#b8bd9d18';tc.beginPath();tc.ellipse(x,y,1+random()*3,1+random()*2,random()*3,0,7);tc.fill();}
 }
 // Corner survey marks and a restrained tactical border.
 tc.strokeStyle='#a8ba8e3a';tc.lineWidth=2;tc.strokeRect(14,14,1252,812);
 for(const [x,y]of [[28,28],[1252,28],[28,812],[1252,812]]){tc.beginPath();tc.moveTo(x-9,y);tc.lineTo(x+9,y);tc.moveTo(x,y-9);tc.lineTo(x,y+9);tc.stroke();}
}
terrainDraw();
function circle(x,y,r,fill,stroke,width=1){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function poly(x,y,r,n,fill,stroke,angle=0){ctx.beginPath();for(let i=0;i<n;i++){const a=angle+i*Math.PI*2/n;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.6;ctx.stroke();}}
function text(s,x,y,color,size=11){ctx.fillStyle=color;ctx.font=`${size}px "Segoe UI","Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.fillText(s,x,y);}
function health(u,x,y,width){ctx.fillStyle='#0c1b19cc';ctx.fillRect(x-width/2,y,width,3);ctx.fillStyle=u.hp/u.maxHp>.4?'#b0dca5':'#e5996e';ctx.fillRect(x-width/2,y,width*Math.max(0,u.hp/u.maxHp),3);}
function drawBase(b,time){
 const color=game.players[b.owner].color;
 if(b.hp<=0){poly(b.x,b.y,34,6,'#26302b','#576550');text('失守',b.x,b.y+4,'#7e8b73',10);return;}
 ctx.save();ctx.translate(b.x,b.y);
 circle(0,0,56,color+'0b',color+'30');poly(0,3,40,6,'#142923',color+'95',Math.PI/6);
 ctx.fillStyle='#13231e';ctx.fillRect(-29,-25,58,50);ctx.fillStyle='#4d6753';ctx.fillRect(-25,-25,50,43);
 ctx.fillStyle='#66846b';ctx.fillRect(-20,-22,40,10);ctx.fillStyle='#273d33';ctx.fillRect(-17,-8,34,22);
 ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.fillRect(-12,-5,24,3);ctx.fillRect(-3,-28,6,17);ctx.shadowBlur=0;
 ctx.fillStyle='#99b28c';ctx.fillRect(-28,17,9,8);ctx.fillRect(19,17,9,8);
 circle(0,-37,3,color);ctx.strokeStyle=color+'88';ctx.beginPath();ctx.arc(0,-37,9+Math.sin(time*2)*2,0,Math.PI*2);ctx.stroke();
 if(baseSelected&&b.owner===game.yourPlayer){ctx.setLineDash([4,5]);circle(0,0,48,null,color,2);ctx.setLineDash([]);}
 ctx.restore();health(b,b.x,b.y-57,72);text(game.players[b.owner].name+' · 指挥部',b.x,b.y+69,color,11);
}
function drawUnit(u){
 let loc=smooth.get(u.id);if(!loc){loc={x:u.x,y:u.y};smooth.set(u.id,loc);}loc.x+=(u.x-loc.x)*.25;loc.y+=(u.y-loc.y)*.25;
 const x=loc.x,y=loc.y,color=game.players[u.owner].color,on=selected.has(u.id);
 if(on){circle(x,y,u.r+6,color+'15',color,1.6);if(u.order.x!==undefined){ctx.setLineDash([3,7]);ctx.strokeStyle=color+'35';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(u.order.x,u.order.y);ctx.stroke();ctx.setLineDash([]);}}
 ctx.save();ctx.translate(x,y);ctx.fillStyle='#0d1c1955';ctx.beginPath();ctx.ellipse(2,5,u.r+3,u.r*.65,0,0,7);ctx.fill();ctx.rotate(u.angle||0);
 if(u.type==='tank'){
  ctx.fillStyle='#10231d';ctx.fillRect(-14,-13,29,7);ctx.fillRect(-14,6,29,7);ctx.strokeStyle='#9bb19055';ctx.lineWidth=1;
  for(let i=-11;i<14;i+=5){ctx.beginPath();ctx.moveTo(i,-12);ctx.lineTo(i,-7);ctx.moveTo(i,7);ctx.lineTo(i,12);ctx.stroke();}
  ctx.fillStyle=color;ctx.fillRect(-11,-7,22,14);ctx.fillStyle='#345347';ctx.fillRect(-7,-5,12,10);circle(0,0,6,color+'cc','#dbe9c877');ctx.fillStyle='#d3dac0';ctx.fillRect(3,-2,19,4);
 }else if(u.type==='raider'){
  ctx.fillStyle='#182a22';ctx.fillRect(-10,-11,16,5);ctx.fillRect(-10,6,16,5);poly(0,0,13,3,color,'#d5e8cb88',0);ctx.fillStyle='#274d45';ctx.fillRect(-5,-3,11,6);
 }else if(u.type==='worker'){
  poly(0,0,10,6,'#385547',color,Math.PI/6);ctx.fillStyle=color;ctx.fillRect(-4,-4,8,8);ctx.strokeStyle='#c9dab5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(7,-5);ctx.lineTo(14,-9);ctx.moveTo(7,5);ctx.lineTo(14,9);ctx.stroke();
  if(u.cargo>0)circle(-8,0,3,'#f2d391');
 }else{
  ctx.fillStyle='#14271f';ctx.fillRect(-4,-7,7,14);circle(0,0,7,color,'#d0e4c188');circle(1,0,4,'#416255');ctx.fillStyle='#d7e2c4';ctx.fillRect(3,-2,11,3);
 }
 ctx.restore();if(on||u.hp<u.maxHp)health(u,x,y-u.r-8,u.r*2+5);
}
function render(now){
 ctx.drawImage(terrain,0,0);
 if(game){
  const time=game.now+(game.status==='playing'&&!game.paused?Math.min(.2,(now-lastReceive)/1000):0);
  for(const n of game.nodes){
   const color=n.owner===null?'#c2bd8e':game.players[n.owner].color;
   circle(n.x,n.y,65,color+'0a',color+'35');ctx.setLineDash([5,7]);circle(n.x,n.y,45,null,color+'70');ctx.setLineDash([]);
   poly(n.x,n.y+5,24,6,'#253c32',color+'80',Math.PI/6);ctx.fillStyle='#869b79';ctx.fillRect(n.x-5,n.y-24,10,34);ctx.fillStyle='#d3cfaa';ctx.fillRect(n.x-18,n.y-26,36,5);circle(n.x,n.y-29,4,color);
   ctx.save();ctx.translate(n.x,n.y-22);ctx.rotate(time*.7);ctx.strokeStyle=color+'65';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,15,-.7,.7);ctx.stroke();ctx.restore();
   if(n.progress>0){ctx.strokeStyle=n.contested?'#e8b875':game.players[n.capturer]?.color||color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(n.x,n.y,51,-Math.PI/2,-Math.PI/2+n.progress*Math.PI*2);ctx.stroke();}
   text(n.contested?'争夺中':n.owner===null?'中继站 · +3/s':game.players[n.owner].name+' · +3/s',n.x,n.y+44,color,10);
  }
  for(const m of game.mines){
   if(m.ore<=0){circle(m.x,m.y,8,'#35453b');continue;}
   circle(m.x,m.y,23,'#7ce2cb0b');
   for(let i=0;i<4;i++){const x=m.x+(i%2)*13-7,y=m.y+Math.floor(i/2)*12-8;ctx.beginPath();ctx.moveTo(x,y-12);ctx.lineTo(x+6,y-2);ctx.lineTo(x+3,y+9);ctx.lineTo(x-5,y+5);ctx.closePath();ctx.fillStyle=['#74b7a3','#abcdb1','#6d9b88','#c0dcc1'][i];ctx.fill();ctx.strokeStyle='#d5edc955';ctx.stroke();}
   text('◆ '+Math.ceil(m.ore),m.x,m.y+33,'#a9bba2',9);
  }
  for(const b of game.bases)drawBase(b,time);
  const p=me();if(p?.alive){const r=p.rally;ctx.strokeStyle=p.color+'70';ctx.beginPath();ctx.moveTo(r.x,r.y+5);ctx.lineTo(r.x,r.y-15);ctx.stroke();ctx.fillStyle=p.color+'80';ctx.beginPath();ctx.moveTo(r.x,r.y-15);ctx.lineTo(r.x+12,r.y-10);ctx.lineTo(r.x,r.y-5);ctx.fill();}
  for(const u of [...game.units].sort((a,b)=>a.y-b.y))drawUnit(u);
  for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=(now-e.born)/1000;if(age>1.1){effects.splice(i,1);continue;}
   if(e.type==='shot'&&age<.22){ctx.globalAlpha=1-age/.22;ctx.strokeStyle=e.weapon==='tank'?'#ffe1a8':game.players[e.owner].color;ctx.lineWidth=e.weapon==='tank'?3:1.5;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.tx,e.ty);ctx.stroke();circle(e.tx,e.ty,3,'#fff4cf');ctx.globalAlpha=1;}
   if(e.type==='explosion'){circle(e.x,e.y,age*(e.big?75:26),'#f1b66d'+Math.round((1-age/1.1)*60).toString(16).padStart(2,'0'),'#f3d4a3'+Math.round((1-age/1.1)*160).toString(16).padStart(2,'0'),2);}
   if(['capture','spawn','repair','upgrade'].includes(e.type))circle(e.x,e.y,10+age*45,null,game.players[e.owner].color+Math.round((1-age/1.1)*130).toString(16).padStart(2,'0'),2);
  }
 }
 if(drag&&Math.hypot(drag.start.x-drag.end.x,drag.start.y-drag.end.y)>7){ctx.fillStyle='#a5e0c51c';ctx.strokeStyle='#a7e4ca';ctx.lineWidth=1;ctx.fillRect(drag.start.x,drag.start.y,drag.end.x-drag.start.x,drag.end.y-drag.start.y);ctx.strokeRect(drag.start.x,drag.start.y,drag.end.x-drag.start.x,drag.end.y-drag.start.y);}
 if(marker){const t=(now-marker.born)/1000;if(t>1)marker=null;else{circle(marker.x,marker.y,8+t*15,null,'#d5ecc1'+Math.round((1-t)*220).toString(16).padStart(2,'0'),2);}}
 requestAnimationFrame(render);
}
async function init(){
 const invite=new URLSearchParams(location.hash.slice(1)),match=invite.get('match'),token=invite.get('token');
 if(match&&token){seat={match,token};localStorage.setItem('frontier-seat',JSON.stringify(seat));history.replaceState(null,'','/?match='+match);}
 else{try{seat=JSON.parse(localStorage.getItem('frontier-seat')||'null');}catch{}}
 const query=new URLSearchParams(location.search).get('match');if(query&&query!==seat?.match)seat={match:query};
 if(seat){try{update(await request('/api/matches/'+seat.match));}catch{seat=null;}}
 if(!seat)await newGame();setInterval(poll,150);requestAnimationFrame(render);
}
init();
