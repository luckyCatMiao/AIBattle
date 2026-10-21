'use strict';
const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
let current = null, selectedId = null, follow = true, viewPly = null, state = null, hover = null;
let credentials = JSON.parse(localStorage.getItem('aibattle-tokens') || '{}');
// A player invitation carries only that seat's capability, in the URL fragment.
// The fragment is never sent to the HTTP server and is removed after import.
const invite = new URLSearchParams(location.hash.slice(1));
const invitedGame = invite.get('game'), invitedSide = invite.get('side'), invitedToken = invite.get('token');
if (/^[a-f0-9]{16}$/.test(invitedGame || '') && ['black','white'].includes(invitedSide) && /^[a-f0-9]{48}$/.test(invitedToken || '')) {
  credentials[invitedGame] = { [invitedSide]: invitedToken };
  localStorage.setItem('aibattle-tokens', JSON.stringify(credentials));
  history.replaceState(null, '', `/?game=${invitedGame}`);
}
const requestedGame = new URLSearchParams(location.search).get('game');
if (/^[a-f0-9]{16}$/.test(requestedGame || '')) { selectedId = requestedGame; follow = false; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('visible'), 3000); }
async function api(route, body, token) {
  const r = await fetch(route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || '请求失败'); return data;
}
function shownMoves() { return current ? current.moves.slice(0, viewPly === null ? current.moves.length : viewPly) : []; }
function draw() {
  const W = canvas.width, pad = W * .066, step = (W - pad * 2) / 14;
  const bg = ctx.createLinearGradient(0, 0, W, W); bg.addColorStop(0, '#e0c59b'); bg.addColorStop(1, '#cfad7d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 110; i++) { ctx.strokeStyle = i % 3 === 0 ? '#aa814c09' : '#ffecce09'; ctx.beginPath();ctx.moveTo(0,i*7.4);ctx.bezierCurveTo(W*.3,i*7.4+3,W*.6,i*7.4-3,W,i*7.4);ctx.stroke(); }
  ctx.lineWidth = 1; ctx.strokeStyle = '#7e64468c';
  for (let i = 0; i < 15; i++) { const a = pad + step * i; ctx.beginPath();ctx.moveTo(pad,a);ctx.lineTo(W-pad,a);ctx.moveTo(a,pad);ctx.lineTo(a,W-pad);ctx.stroke(); }
  ctx.strokeStyle = '#795b3b';ctx.lineWidth=1.5;ctx.strokeRect(pad,pad,W-pad*2,W-pad*2);
  ctx.font = '13px "Segoe UI", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#785e40';
  for(let i=0;i<15;i++){ctx.fillText(String.fromCharCode(65+i),pad+step*i,pad*.45);ctx.fillText(String(i+1),pad*.43,pad+step*i);ctx.fillText(String.fromCharCode(65+i),pad+step*i,W-pad*.4);ctx.fillText(String(i+1),W-pad*.4,pad+step*i);}
  for(const [x,y] of [[3,3],[11,3],[7,7],[3,11],[11,11]]){ctx.beginPath();ctx.arc(pad+x*step,pad+y*step,3.8,0,Math.PI*2);ctx.fill();}
  const moves=shownMoves();
  moves.forEach((m,i)=>{const x=pad+m.x*step,y=pad+m.y*step,r=step*.43;ctx.save();ctx.shadowColor='#35251055';ctx.shadowBlur=5;ctx.shadowOffsetY=3;const grad=ctx.createRadialGradient(x-r*.3,y-r*.35,r*.1,x,y,r);grad.addColorStop(0,m.color===1?'#515453':'#fffff8');grad.addColorStop(1,m.color===1?'#131918':'#deded2');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
    if($('numbers').checked){ctx.fillStyle=m.color===1?'#e3e8e2':'#3b433c';ctx.font=`600 ${step*.3}px "Segoe UI"`;ctx.fillText(m.ply,x,y+1);}else if(i===moves.length-1){ctx.strokeStyle='#d0794c';ctx.lineWidth=2;ctx.strokeRect(x-5,y-5,10,10);}});
  if(current?.winningLine?.length && moves.length===current.moves.length){const line=current.winningLine;const sorted=[...line].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const a=sorted[0],b=sorted.at(-1);ctx.strokeStyle='#c96740cc';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pad+a[0]*step,pad+a[1]*step);ctx.lineTo(pad+b[0]*step,pad+b[1]*step);ctx.stroke();}
  if(hover && playable() && !current.board[hover.y][hover.x]){ctx.globalAlpha=.28;ctx.fillStyle=current.turn===1?'#121918':'#fff';ctx.beginPath();ctx.arc(pad+hover.x*step,pad+hover.y*step,step*.43,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
}
function playable(){return current?.status==='playing' && credentials[current.id]?.[current.turn===1?'black':'white'] && (viewPly===null || viewPly===current.moves.length);}
function paintGame(){
  if(!current){draw();return;}
  $('black-name').textContent=current.black.name;$('white-name').textContent=current.white.name;
  $('black-active').classList.toggle('hidden',current.status!=='playing'||current.turn!==1);
  $('white-active').classList.toggle('hidden',current.status!=='playing'||current.turn!==2);
  const seats=credentials[current.id];
  $('mode-label').textContent=current.tournamentId?'AI 对战 · 开放策略':seats?.black&&seats?.white?'真人双人 · 点击落子':seats?.black?'你执黑 · 对手由 API 控制':seats?.white?'你执白 · 对手由 API 控制':'观战模式';
  $('round-label').textContent=current.round?`第 ${current.round} 局`:'';
  const n=viewPly===null?current.moves.length:viewPly;
  $('move-count').textContent=`${current.moves.length} 手`;
  $('game-status').textContent=n!==current.moves.length?`回放 · 第 ${n} 手`:current.status==='finished'?(current.winner?`${current.winner===current.black.id?current.black.name:current.white.name} 获胜 · 五子连线`:'棋盘已满 · 平局'):`${current.turn===1?'黑棋':'白棋'}回合${playable()?' · 点击交叉点落子':' · 等待选手落子'}`;
  $('timeline').max=current.moves.length;$('timeline').value=n;$('replay-label').textContent=viewPly===null?'实时':`${n} / ${current.moves.length}`;
  const atBottom=$('moves').scrollHeight-$('moves').scrollTop-$('moves').clientHeight<45;
  $('moves').innerHTML=current.moves.length?current.moves.map(m=>`<div class="move-row ${m.ply===n?'active':''}" data-ply="${m.ply}"><span class="move-number">${String(m.ply).padStart(2,'0')}</span><span class="mini-stone ${m.color===1?'b':'w'}"></span><strong>${m.coordinate}</strong><span class="move-note" title="${esc(m.note)}">${esc(m.note||'—')}</span></div>`).join(''):'<div class="empty">棋盘已准备好。<br>等待第一步落子。</div>';
  if(atBottom)$('moves').scrollTop=$('moves').scrollHeight;
  draw();
}
function renderSeries(){
  const t=state.tournaments.find(t=>t.id===current?.tournamentId);
  $('series').classList.toggle('hidden',!t);if(!t)return;
  const completed=t.standings[0].played;
  $('series').innerHTML=`<div class="series-label">MODEL MATCH<br><span style="color:var(--muted);font-size:9px">模型对战试赛</span></div>${t.standings.map(p=>`<div class="series-player"><strong>${esc(p.name)}</strong><b>${p.wins}</b><small>胜 / ${p.losses} 负 / ${p.draws} 平</small></div>`).join('<span class="versus">:</span>')}<div class="series-detail">${t.status==='finished'?'比赛已结束':'比赛进行中'} · ${completed} / ${t.rounds} 局<br>交换黑白 · 自主策略 · 样本有限</div>`;
}
async function pollTraining(){
  try {
    const t=await api('/api/training');
    $('training').classList.toggle('hidden',!t);
    if(!t)return;
    const name=({luna:'Luna',sol:'Sol',astra:'Astra'})[t.player]||t.player;
    const labels={isolation_verified:'独立工作区已就绪',preparing:`${name} 正在复盘和改进策略`,ready:`${name} 已提交新版本，等待另一位选手`,playing:'新版本开始对战',move:`第 ${t.game} 局 · 已落 ${t.ply} 手`,game_finished:`第 ${t.game} 局结束，准备下一阶段`,iteration_finished:'本轮完成，即将复盘',completed:'本批次迭代已完成',error:'迭代已暂停，正在处理运行问题'};
    $('training').innerHTML=`<div><span class="eyebrow">持续迭代 · ${t.iteration||0} / ${t.cycles||3} 轮</span><strong>${esc(labels[t.event]||'准备中')}</strong></div><span>复盘 → 改进 → 交换黑白对战<br>源码隔离 · 公开棋谱</span>`;
  } catch {}
}
let polling=false,lastSignature='';
async function poll(){if(polling)return;polling=true;try{
  const next=await api('/api/state');state=next;
  $('connection').textContent='本地服务在线';$('connection').style.color='';
  const ts=state.tournaments;const latest=ts.at(-1);
  if(follow&&latest)selectedId=latest.currentGameId;
  if(!selectedId)selectedId=state.games.at(-1)?.id||null;
  const opts=state.games.slice().reverse().map(g=>`<option value="${g.id}">${g.round?`第 ${g.round} 局 · `:''}${esc(g.black.name)} vs ${esc(g.white.name)}${g.status==='finished'?' · 已结束':''}</option>`).join('');
  if($('game-select').innerHTML!==opts){$('game-select').innerHTML=opts||'<option value="">暂无对局</option>';}$('game-select').value=selectedId||'';
  if(selectedId){const g=await api(`/api/games/${selectedId}`);const signature=`${g.id}:${g.moves.length}:${g.status}`;if(signature!==lastSignature){if(current?.id!==g.id)viewPly=null;current=g;lastSignature=signature;paintGame();}renderSeries();}
}catch(e){$('connection').textContent='服务连接中断';$('connection').style.color='#e5ac82';}finally{polling=false;}}
$('new-game').onclick=async()=>{try{const r=await api('/api/games',{});credentials[r.game.id]=r.tokens;localStorage.setItem('aibattle-tokens',JSON.stringify(credentials));selectedId=r.game.id;follow=false;viewPly=null;history.replaceState(null,'',`/?game=${selectedId}`);await poll();toast('双人对局已就绪，黑棋先行');}catch(e){toast(e.message);}};
$('game-select').onchange=()=>{selectedId=$('game-select').value;follow=false;viewPly=null;history.replaceState(null,'',`/?game=${selectedId}`);poll();};
$('follow').onclick=()=>{follow=true;viewPly=null;history.replaceState(null,'','/');poll();paintGame();};
$('numbers').onchange=draw;
function seek(n){if(!current)return;viewPly=Math.max(0,Math.min(n,current.moves.length));paintGame();}
$('timeline').oninput=()=>seek(Number($('timeline').value));$('first').onclick=()=>seek(0);$('prev').onclick=()=>seek((viewPly??current?.moves.length??0)-1);$('next').onclick=()=>seek((viewPly??current?.moves.length??0)+1);$('last').onclick=()=>{viewPly=null;paintGame();};
$('moves').onclick=e=>{const row=e.target.closest('[data-ply]');if(row)seek(Number(row.dataset.ply));};
function cellAt(e){const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*800,y=(e.clientY-r.top)/r.height*800,pad=800*.066,step=(800-pad*2)/14;const cx=Math.round((x-pad)/step),cy=Math.round((y-pad)/step);return cx>=0&&cx<15&&cy>=0&&cy<15?{x:cx,y:cy}:null;}
canvas.onmousemove=e=>{hover=cellAt(e);draw();};canvas.onmouseleave=()=>{hover=null;draw();};
let moving=false;canvas.onclick=async e=>{if(!playable()||moving)return;const cell=cellAt(e);if(!cell)return;moving=true;try{await api('/api/move',{matchId:current.id,ply:current.moves.length,...cell},credentials[current.id][current.turn===1?'black':'white']);viewPly=null;await poll();}catch(err){toast(err.message);}finally{moving=false;}};
$('export').onclick=()=>{if(!current){toast('暂无可导出的对局');return;}const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`gomoku-${current.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};
draw();poll();pollTraining();setInterval(poll,800);setInterval(pollTraining,2000);
