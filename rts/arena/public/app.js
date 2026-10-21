'use strict';
const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d');
let arena=null,state=null,chosen='',follow=true,replaying=false,frame=0,busy=false;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=n=>{n=Math.floor(n+1e-6);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
const defaultContestants=[{id:'sol',name:'GPT-6.1 Sol',short:'Sol'},{id:'luna',name:'GPT-6 Luna',short:'Luna'}];
function color(p){return p?.name===(arena?.contestants||defaultContestants)[0].name?'#68ead1':'#ff9b71';}
function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function poly(x,y,r,n,fill,stroke,angle=0){ctx.beginPath();for(let i=0;i<n;i++){const a=angle+i*Math.PI*2/n;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function label(text,x,y,c='#b7c5a4',size=12){ctx.fillStyle=c;ctx.font=`${size}px "Segoe UI","Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.fillText(text,x,y);}
function hp(e,width,y){ctx.fillStyle='#10251b';ctx.fillRect(e.x-width/2,y,width,4);ctx.fillStyle=color(state.players[e.owner]);ctx.fillRect(e.x-width/2,y,width*Math.max(0,e.hp/e.maxHp),4);}
const terrain=document.createElement('canvas');terrain.width=1280;terrain.height=840;const bg=terrain.getContext('2d');
bg.fillStyle='#273b29';bg.fillRect(0,0,1280,840);let rand=41;function rng(){rand=(rand*16807)%2147483647;return rand/2147483647;}
for(let i=0;i<8000;i++){const x=rng()*1280,y=rng()*840;bg.fillStyle=i%3?'#233626':'#35482e';bg.fillRect(x,y,rng()*4+1,rng()*2+1);}
bg.strokeStyle='#71916b11';for(let x=0;x<1280;x+=80){bg.beginPath();bg.moveTo(x,0);bg.lineTo(x,840);bg.stroke();}for(let y=0;y<840;y+=80){bg.beginPath();bg.moveTo(0,y);bg.lineTo(1280,y);bg.stroke();}
for(const [x,y,rx,ry] of [[410,200,90,55],[875,650,100,60],[830,150,50,35],[440,650,50,35]]){bg.fillStyle='#1b3024';bg.beginPath();bg.ellipse(x,y,rx,ry,.3,0,Math.PI*2);bg.fill();}
function draw(){
 ctx.drawImage(terrain,0,0);if(!state)return;
 for(const n of state.nodes){const c=n.owner===null?'#c6c18e':color(state.players[n.owner]);circle(n.x,n.y,65,c+'08',c+'50');poly(n.x,n.y,24,6,'#243c2b',c,Math.PI/6);ctx.fillStyle=c;ctx.fillRect(n.x-3,n.y-23,6,38);ctx.fillRect(n.x-17,n.y-24,34,5);if(n.progress){ctx.strokeStyle=n.contested?'#fff':color(state.players[n.capturer]);ctx.lineWidth=4;ctx.beginPath();ctx.arc(n.x,n.y,52,-Math.PI/2,-Math.PI/2+n.progress*Math.PI*2);ctx.stroke();ctx.lineWidth=1;}label(n.name+(n.contested?' · 争夺中':''),n.x,n.y+86,c,11);}
 for(const m of state.mines){if(m.ore<=0)continue;for(let i=0;i<3;i++)poly(m.x+(i-1)*12,m.y+(i%2)*8,10,4,['#c3d2a3','#8db9a0','#b5cbb1'][i],null,0);label('◆ '+Math.ceil(m.ore),m.x,m.y+32,'#8ba788',10);}
 for(const b of state.bases){const c=color(state.players[b.owner]);circle(b.x,b.y,170,null,c+'13');if(b.hp<=0){poly(b.x,b.y,35,6,'#20251d','#735a44');label('基地已摧毁',b.x,b.y+60,'#a38773',13);continue;}poly(b.x,b.y+5,49,6,'#172d22',c+'99',Math.PI/6);poly(b.x,b.y,34,6,'#3c5940',c,Math.PI/6);ctx.fillStyle=c;ctx.fillRect(b.x-14,b.y-12,28,24);ctx.fillStyle='#223d2e';ctx.fillRect(b.x-9,b.y-7,18,14);hp(b,95,b.y-62);label(state.players[b.owner].name,b.x,b.y+78,c,15);label(Math.ceil(b.hp)+' HP',b.x,b.y-72,c,11);if(b.queue.length)label('生产 '+b.queue[0].type+' · '+Math.ceil(b.queue[0].remaining)+'s',b.x,b.y+96,'#a3b093',10);}
 for(const u of state.units){const c=color(state.players[u.owner]);ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.angle||0);ctx.shadowColor='#071c12';ctx.shadowBlur=5;
  if(u.type==='worker'){poly(0,0,10,6,'#35513b',c,Math.PI/6);ctx.fillStyle=c;ctx.fillRect(-4,-4,8,8);if(u.cargo>0)circle(-8,0,3,'#dbcf8b');}
  else if(u.type==='tank'){ctx.fillStyle='#162b20';ctx.fillRect(-16,-15,32,8);ctx.fillRect(-16,7,32,8);ctx.fillStyle=c;ctx.fillRect(-13,-10,26,20);ctx.fillStyle='#395740';ctx.fillRect(-8,-7,16,14);ctx.fillStyle='#d6e6be';ctx.fillRect(3,-3,24,6);}
  else if(u.type==='raider'){poly(0,0,13,3,c,'#dfebca88');ctx.fillStyle='#284232';ctx.fillRect(-6,-4,10,8);}
  else{circle(0,0,7,c);ctx.fillStyle='#cdddbb';ctx.fillRect(3,-2,12,3);circle(0,0,3,'#385b44');}ctx.restore();if(u.hp<u.maxHp)hp(u,24,u.y-u.r-9);
 }
 const latest=state.events.filter(e=>state.now-e.t<.8);for(const e of latest){if(e.type==='shot'){ctx.strokeStyle=color(state.players[e.owner])+'80';ctx.lineWidth=e.weapon==='tank'?2:1;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.tx,e.ty);ctx.stroke();}else if(e.type==='explosion')circle(e.x,e.y,e.big?45:18,'#edc08740','#e9bb7855');}ctx.lineWidth=1;
 label('OASIS BASIN / FRONTIER',640,815,'#6b896b',10);
}
function updateArena(a){
 arena=a;const r=a.results||[],rounds=a.rounds||3;$('phase').textContent=`第 ${a.round||1} / ${rounds} 轮 · ${a.phase}`;
 const contestants=a.contestants||defaultContestants,[left,right]=contestants,names=Object.fromEntries(contestants.map(p=>[p.id,p.short]));
 $('matchup').textContent=left.short+' × '+right.short;document.title=left.short+' × '+right.short+' · 前线争夺';
 $('left-label').textContent=left.name.toUpperCase();$('right-label').textContent=right.name.toUpperCase();$('models-label').textContent=left.short+' · '+right.short+' / MEDIUM';
 $('setup').textContent=(a.setup_note||'双方从零开始')+` · ${rounds} 轮迭代 · 每轮交换出生位置`;
 $('sol-score').textContent=r.filter(g=>g.winner===left.id).length;$('luna-score').textContent=r.filter(g=>g.winner===right.id).length;$('draws').textContent=`${r.filter(g=>g.winner===null).length} 平局 · ${r.length} / ${rounds*2} 局完成`;
 $('progress').textContent=a.error?'比赛已中止，裁判正在检查。':a.completed?`${rounds} 轮对战已完成。可以选择任意对局，拖动时间轴或播放回放。`:a.phase.includes('策略')||a.phase.includes('复盘')?`第 ${a.round} 轮：${a.ready?.length?a.ready.map(w=>names[w]||w).join('、')+' 已就绪；等待另一方。':left.short+' 与 '+right.short+' 正在各自准备。'} 复盘只提供公开战报。`:'双方指令同步收集。单位持续采矿、生产和交战。';
 $('records').innerHTML=r.length?r.map(g=>`<div class="record"><span>R${g.round} · G${g.game}</span><span class="${g.winner===left.id?'sol':'luna'}">${g.winner?escape(names[g.winner]||g.winner)+' 胜':'平局'} <small>· ${escape(g.reason)}</small></span><small>${clock(g.duration)}</small><small>西 ${escape(names[g.seats[0]]||g.seats[0])} / 东 ${escape(names[g.seats[1]]||g.seats[1])}</small></div>`).join(''):'<div class="empty">第一局尚未开始</div>';
 const options='<option value="">最新比赛</option>'+a.games.map(g=>`<option value="${g.id}">${g.id.toUpperCase()} · ${g.status==='finished'?'回放':'直播'}</option>`).join('');if($('game-select').innerHTML!==options){$('game-select').innerHTML=options;$('game-select').value=chosen;}
 if(follow)chosen='';
}
function updateState(s,g){
 state=s;$('waiting').classList.add('hidden');$('match-title').textContent=`${g.id.toUpperCase()} / ${s.status==='finished'?'战役结束':follow?'实时观战':'历史回放'}`;$('game-time').textContent=clock(s.now)+' / 10:00';
 $('players').innerHTML=s.players.map(p=>{const b=s.bases[p.id],t=s.units.filter(u=>u.owner===p.id);return `<div class="player"><b style="color:${color(p)}">${escape(p.name)} <span class="muted">· ${p.id?'东':'西'}</span></b><div class="stats"><span>${p.credits}<small>矿晶</small></span><span>${t.length}<small>单位</small></span><span>${p.score}<small>积分</small></span></div><div class="bar"><i style="width:${Math.max(0,b.hp/b.maxHp*100)}%;background:${color(p)}"></i></div><div class="explain" style="margin-top:8px">基地 ${Math.max(0,Math.ceil(b.hp))} HP · 击毁 ${p.kills} · 武器 Lv.${p.level}<br>采矿机 ${t.filter(u=>u.type==='worker').length} / 步兵 ${t.filter(u=>u.type==='rifle').length} / 坦克 ${t.filter(u=>u.type==='tank').length} / 突击车 ${t.filter(u=>u.type==='raider').length}</div></div>`;}).join('');
 $('timeline').max=g.frames-1;$('timeline').value=follow?g.frames-1:frame;$('position').textContent=follow?(s.status==='finished'?'最终状态':'LIVE · 最高 8×'):clock(s.now)+' / '+clock(g.now);draw();
}
async function poll(){
 if(busy)return;busy=true;
 try{const a=await (await fetch('/api/arena')).json();updateArena(a);const g=a.games.find(g=>g.id===(chosen||a.current));if(g){if(replaying){frame=Math.min(g.frames-1,frame+2);if(frame===g.frames-1){replaying=false;$('play').textContent='▶ 回放';}}const s=await (await fetch('/api/matches/'+g.id+(follow?'':'?frame='+frame))).json();updateState(s,g);}}
 catch(e){$('phase').textContent='连接中断 · 等待重连';}finally{busy=false;}
}
$('game-select').onchange=()=>{chosen=$('game-select').value;follow=!chosen;frame=0;replaying=false;$('play').textContent='▶ 回放';poll();};
$('timeline').oninput=()=>{chosen=chosen||arena.current;follow=false;frame=Number($('timeline').value);$('game-select').value=chosen;poll();};
$('live').onclick=()=>{chosen='';follow=true;replaying=false;$('game-select').value='';$('play').textContent='▶ 回放';poll();};
$('play').onclick=()=>{if(!arena?.current)return;if(follow){chosen=arena.current;frame=0;follow=false;$('game-select').value=chosen;}const g=arena.games.find(g=>g.id===chosen);if(frame>=g.frames-1)frame=0;replaying=!replaying;$('play').textContent=replaying?'Ⅱ 暂停':'▶ 回放';poll();};
draw();poll();setInterval(poll,250);
