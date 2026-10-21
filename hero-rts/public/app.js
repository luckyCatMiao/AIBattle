/* Thrones of Ash — original, procedural fantasy RTS client. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const world = $('world'), ctx = world.getContext('2d'), mini = $('minimap'), mctx = mini.getContext('2d');
  const S = { catalog:null, state:null, match:null, token:null, player:0, selected:new Set(), groups:{}, tab:'heroes', firstHero:'vanguard', mode:null, camera:{x:1600,y:1000,zoom:1}, mouse:{x:0,y:0,inside:false}, pointer:null, keys:new Set(), positions:new Map(), terrain:null, terrainKey:'', lastFrame:0, lastUI:0, pollBusy:false, pollFailures:0, lastEvent:0, logs:[], lastGroup:{key:'',at:0}, tooltip:null, setupFocus:null };
  const replayParams=new URLSearchParams(location.search),replayRequest=replayParams.get('replay');
  const R={enabled:replayRequest!==null,meta:null,data:null,id:null,index:-1,clock:0,playing:false,speed:1,loading:false,pollBusy:false,ticket:0,epoch:0,requested:replayRequest||'latest',loadError:'',run:replayParams.get('run')||null,runs:[],activeRun:null};
  const COLORS = ['#76bcce','#e38978','#99bb6f','#bea0dd','#e0b873','#78c5ab','#dc94be','#a1afcb'];
  const RUNES = {vanguard:'♜',pyromancer:'♨',frost:'❄',ranger:'➶',assassin:'◈',druid:'♣',necromancer:'☽',guardian:'⬟',engineer:'⚙',oracle:'✧',worker:'⚒',footman:'⛨',spearman:'↟',archer:'➶',crossbow:'⌖',knight:'♞',berserker:'⚔',rogue:'⟡',priest:'✦',sorceress:'☾',shaman:'ϟ',dryad:'❧',warlock:'☽',mortar:'◉',ballista:'⊹',griffin:'♘',gargoyle:'♠',townhall:'♜',altar:'✧',barracks:'⚔',range:'⌖',stable:'♞',arcane:'☽',workshop:'⚙',aviary:'♠',forge:'⚒',lumbermill:'♣',farm:'⌂',tower:'♖',tier2:'Ⅱ',tier3:'Ⅲ',weapons:'⚔',armor:'⛨',gathering:'♣',treant:'♣',skeleton:'†',turret:'⚙',sentinel:'⛨',ancient:'⬟'};
  const ARMOR = {heavy:'重甲',light:'轻甲',unarmored:'无甲',fortified:'城甲'};
  const ATTACK = {normal:'普通',pierce:'穿刺',magic:'魔法',siege:'攻城'};
  const TIER = ['','Ⅰ','Ⅱ','Ⅲ'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const normId = v => String(v);
  const rune = id => RUNES[id] || '✦';
  const own = e => e && e.owner === S.player;
  const player = () => S.state?.players?.find(p=>p.id===S.player);
  const definition = e => S.catalog?.heroes?.[e?.type] || S.catalog?.units?.[e?.type] || S.catalog?.buildings?.[e?.type] || S.catalog?.summons?.[e?.type] || {name:e?.type || '单位',skills:[],color:'#a5b694'};
  const entities = () => [...(S.state?.units || []),...(S.state?.buildings || [])];
  const entity = id => entities().find(e=>normId(e.id)===normId(id));
  const selectedEntities = () => entities().filter(e=>S.selected.has(normId(e.id)));
  const selectedUnits = () => (S.state?.units || []).filter(e=>S.selected.has(normId(e.id)) && own(e));
  const selectedBuildings = () => (S.state?.buildings || []).filter(e=>S.selected.has(normId(e.id)) && own(e));
  const caster = () => {const units=R.enabled?selectedEntities():selectedUnits();return units.find(e=>e.hero)||units.find(e=>definition(e).skills?.length);};
  const time = t => `${String(Math.floor(Math.max(0,t)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
  const colorFor = owner => S.state?.players?.find(p=>p.id===owner)?.color || COLORS[owner] || '#bda378';
  const hpFraction = e => clamp(e.hp/(e.maxHp||definition(e).hp||1),0,1);
  const colorAlpha = (color,alpha) => /^#[0-9a-f]{6}$/i.test(color) ? color+Math.round(alpha*255).toString(16).padStart(2,'0') : color;

  async function api(path,options={}) {
    const headers = {'Content-Type':'application/json',...(S.token?{Authorization:`Bearer ${S.token}`}:{})};
    const response = await fetch(path,{...options,headers:{...headers,...options.headers}});
    const body = await response.json().catch(()=>({error:`服务器返回 ${response.status}`}));
    if(!response.ok || body.error) throw new Error(body.error || `请求失败 (${response.status})`);
    return body;
  }
  function toast(message,error=false) {
    const el=document.createElement('div');el.className=`toast${error?' error':''}`;el.textContent=message;
    $('toast-region').append(el);setTimeout(()=>el.remove(),error?5500:3000);
  }
  async function command(payload) {
    if(R.enabled)return;
    if(!S.match) return toast('请先建立战局。',true);
    if(S.state?.status==='ready' && payload.type!=='start') return toast('点击「开始战役」后即可下达指令。',true);
    if(S.state?.status==='finished' && payload.type!=='pause') return toast('本局已结束，可以建立新的战局。',true);
    try { const result=await api(`/api/matches/${encodeURIComponent(S.match)}/commands`,{method:'POST',body:JSON.stringify(payload)});await poll();return result; }
    catch(error) {toast(error.message,true);return null;}
  }
  function saveSeat() {if(R.enabled)return;try {localStorage.setItem('thrones-of-ash-seat',JSON.stringify({match:S.match,token:S.token,player:S.player}));}catch{}}
  async function poll() {
    if(R.enabled || !S.match || S.pollBusy) return;
    const match=S.match;
    S.pollBusy=true;
    try { const state=await api(`/api/matches/${encodeURIComponent(match)}`); if(S.match===match){receive(state);S.pollFailures=0;} }
    catch(error) {if(S.match===match){S.pollFailures++;if(S.pollFailures===4)toast(`战场连接暂时中断：${error.message}`,true);}}
    finally {S.pollBusy=false;}
  }
  function receive(state) {
    if(state.state) state=state.state;
    if(!state?.map) return;
    S.state=state;if(state.catalog)S.catalog=state.catalog;
    if(!R.enabled&&Number.isInteger(state.yourPlayer)) S.player=state.yourPlayer;
    const aliveIds=new Set(entities().map(e=>normId(e.id)));
    S.selected=new Set([...S.selected].filter(id=>aliveIds.has(id)));
    for(const [id] of S.positions) if(!aliveIds.has(id))S.positions.delete(id);
    for(const event of state.events || []) {
      const eventKey=Number(event.id)||Number(event.t)*1000;
      if(eventKey>S.lastEvent && event.text && !['damage','heal','attack'].includes(event.type)) {
        if(R.enabled&&S.player===-1 || event.owner===undefined || event.owner===S.player || ['victory','defeat','capture','start','finished'].includes(event.type)) S.logs.push({text:event.text,t:event.t ?? state.now});
      }
      S.lastEvent=Math.max(S.lastEvent,eventKey);
    }
    S.logs=S.logs.filter(log=>state.now-log.t<15).slice(-3);
    const key=`${state.id}:${state.map.width}:${state.map.height}:${state.map.obstacles?.length}`;
    if(key!==S.terrainKey){S.terrainKey=key;makeTerrain();}
    renderStatus();
  }
  async function initialize() {
    if(R.enabled){await initializeReplay();requestAnimationFrame(frame);return;}
    try {
      S.catalog=await api('/api/catalog');renderSetupHeroes();renderProduction();
      let saved;try{saved=JSON.parse(localStorage.getItem('thrones-of-ash-seat')||'null');}catch{}
      const hash=new URLSearchParams(location.hash.slice(1));
      if(hash.has('match')) saved={match:hash.get('match'),token:hash.get('token'),player:Number(hash.get('player')||0)};
      if(saved?.match){S.match=saved.match;S.token=saved.token;S.player=saved.player ?? 0;await poll();if(S.state){home();saveSeat();}else{S.match=null;S.token=null;openSetup();}}
      else openSetup();
    } catch(error) {$('setup-error').textContent=`无法连接战场服务：${error.message}`;openSetup();$('create-button').disabled=true;}
    requestAnimationFrame(frame);setInterval(poll,150);
  }
  // Replay has its own transport and clock. It never restores or saves a player seat.
  const replayModel=(key,meta=R.meta)=>meta?.labels?.[key]||({luna:'GPT-6 Luna',sol:'GPT-6.1 Sol',opus:'Claude Opus 5.5',astra:'GPT-6 Astra'}[key])||meta?.models?.[key]||String(key??'未知');
  const replayKeys=(meta=R.meta)=>Object.keys(meta?.models||{}).length?Object.keys(meta.models):[...new Set((meta?.games||[]).flatMap(g=>g.seats||[]))];
  const arenaPath=path=>`${path}${R.run?`?run=${encodeURIComponent(R.run)}`:''}`;
  function replayURL() {const url=new URL(location.href);url.searchParams.set('replay',R.id||R.requested||'latest');if(R.run)url.searchParams.set('run',R.run);history.replaceState(null,'',url);}
  function replayWinner(game) {const winner=game?.winner;if(winner===null||winner===undefined||winner==='draw')return '平局';return `${replayModel(Number.isInteger(winner)?game.seats?.[winner]:winner)} 获胜`;}
  function replayBanner(title,description) {$('center-banner').hidden=false;$('center-banner').innerHTML=`<span class="eyebrow">AI BATTLE THEATER</span><h2>${esc(title)}</h2><p>${esc(description)}</p>`;}
  async function initializeReplay() {
    document.body.classList.add('replay-mode');document.title='模型对战 · 灰烬王座回放';
    $('replay-panel').hidden=false;$('pause-button').hidden=true;$('new-button').hidden=true;$('order-bar').hidden=true;S.player=-1;
    $('world').setAttribute('aria-label','回放战术地图，左键查看单位，拖动或滚轮移动视角');
    $('match-label').textContent='AI 对战 · 只读回放';$('game-status').textContent='等待比赛记录';$('faction-badge').textContent='观察者';
    document.querySelector('.map-hint').innerHTML='<kbd>空格</kbd> 播放 / 暂停 <span>·</span> <kbd>中键 / 右键拖动</kbd> 平移 <span>·</span> <kbd>Home</kbd> 定位观察阵营';
    document.querySelector('.panel-heading h2').textContent='战场资料';
    document.querySelector('.objective-note p').innerHTML='观察双方经营、编队与技能运用。<small>回放仅供观察 · 不会向比赛发送指令</small>';
    replayBanner('双方正在准备','模型将独立制定策略，比赛结束后即可播放完整回放。');
    try {S.catalog=await api('/api/catalog');renderProduction();renderSelection();}catch(error){$('replay-detail').textContent=`战场资料加载失败：${error.message}，将自动重试。`;}
    await pollArena();setInterval(pollArena,2500);
  }
  function phaseText(meta) {
    if(meta.error)return `比赛状态：${meta.error}`;
    const ready=(meta.ready||[]).map(r=>replayModel(typeof r==='string'?r:r.who||r.id||r.model)).join('、');
    if(meta.completed||['complete','completed','finished','done'].includes(meta.phase))return `比赛已完成 · ${(meta.games||[]).length} 局可回放`;
    if(['playing','running','battle','battling','fighting','matches','simulating','交战中'].includes(meta.phase))return `交战中${meta.round?` · 第 ${meta.round} 轮`:''}${meta.game?` · 第 ${meta.game} 局`:''}${Number.isFinite(meta.now)?` · 游戏时间 ${time(meta.now)}`:''}`;
    if(meta.phase&&/[\u4e00-\u9fff]/.test(meta.phase))return `${meta.phase}${/准备|改进/.test(meta.phase)&&ready?` · ${ready} 已就绪`:''}`;
    return `${meta.phase==='failed'?'比赛中断':'策略准备中'}${ready?` · ${ready} 已就绪`:' · 等待双方就绪'}`;
  }
  function renderSeries() {
    const picker=$('replay-series'),runs=R.runs.slice();
    if(R.run&&!runs.some(meta=>meta.run===R.run))runs.unshift(R.meta?.run===R.run?R.meta:{run:R.run,models:{}});
    const html=runs.length?runs.map(meta=>{const names=replayKeys(meta).map(key=>replayModel(key,meta)).join(' × '),count=Array.isArray(meta.games)?meta.games.length:Number(meta.games)||0;return `<option value="${esc(meta.run)}">${esc(names||'比赛系列')} · ${esc(meta.run.replace(/^run-/,''))}${meta.run===R.activeRun?' · 最新':''}${count?` · ${count} 局`:''}</option>`;}).join(''):'<option value="">暂无比赛系列</option>';
    if(picker.innerHTML!==html)picker.innerHTML=html;if(R.run)picker.value=R.run;picker.disabled=!runs.length;
  }
  async function switchSeries(run) {
    if(!run||run===R.run)return;
    R.epoch++;R.ticket++;R.pollBusy=false;R.run=run;R.meta=null;R.data=null;R.id=null;R.index=-1;R.clock=0;R.playing=false;R.loading=false;R.loadError='';R.requested='latest';
    S.state=null;S.selected.clear();S.groups={};S.positions.clear();S.logs=[];S.lastEvent=0;S.terrain=null;S.terrainKey='';S.mode=null;S.player=-1;S.keys.clear();S.mouse.inside=false;hideTooltip();
    for(const key of ['replay-play','replay-start','replay-seek'])$(key).disabled=true;
    $('replay-game').innerHTML='<option value="">正在读取此系列的对局…</option>';$('replay-game').disabled=true;$('replay-view').innerHTML='<option value="-1">全局</option>';$('replay-seek').value=0;$('replay-seek').min=0;$('replay-seek').max=1;$('replay-seek').setAttribute('aria-valuetext','00:00，共 00:00');$('replay-time').textContent='00:00 / 00:00';
    $('replay-models').textContent='正在读取参赛模型…';$('replay-reviews').replaceChildren();$('replay-setup').textContent='正在读取本系列的参赛起点与规则…';$('replay-phase').textContent='正在切换比赛系列…';$('replay-detail').textContent='正在读取本系列的比赛记录…';$('hero-ribbon').replaceChildren();$('player-list').replaceChildren();$('battle-log').replaceChildren();$('queue-list').replaceChildren();$('queue-count').textContent='0';
    for(const key of ['gold','wood','population','tier'])$(key).textContent='—';$('clock').textContent='00:00';$('game-status').textContent='等待比赛记录';$('faction-badge').textContent='观察者';$('map-subtitle').textContent='正在读取战场';
    replayURL();renderReplayControls();if(S.catalog)renderProduction();renderSelection();replayBanner('正在切换比赛系列','正在读取此系列的参赛模型与对局记录。');await pollArena();
  }
  function renderReplayMeta() {
    const keys=replayKeys(),names=keys.map(key=>replayModel(key)).join(' × ');
    document.title=`${names||'模型对战'} · 灰烬王座回放`;
    $('replay-models').textContent=`${names||'等待参赛模型'} · 推理 ${R.meta.reasoning_effort==='medium'?'中（medium）':R.meta.reasoning_effort||'待确认'}`;
    $('replay-setup').textContent=R.meta.setup_note||'双方独立制定策略；具体参赛设置以本系列记录为准。';
    const links=keys.map(who=>{const ready=(R.meta.ready||[]).some(r=>(typeof r==='string'?r:r.who||r.id)===who)||(R.meta.games||[]).length>0;return `<a href="${esc(arenaPath(`/api/arena/reviews/${encodeURIComponent(who)}`))}" target="_blank" rel="noopener" aria-disabled="${!ready}" tabindex="${ready?0:-1}" title="${ready?'查看参赛模型自行撰写的中文策略与复盘':'此模型尚未提交策略说明'}">${esc(replayModel(who))} 中文策略与复盘 ↗</a>`;}).join('');
    if($('replay-reviews').innerHTML!==links)$('replay-reviews').innerHTML=links;
  }
  async function pollArena() {
    if(R.pollBusy)return;R.pollBusy=true;const epoch=R.epoch;
    try {
      try {const listResponse=await fetch('/api/arena/runs',{cache:'no-store'});if(epoch!==R.epoch)return;if(listResponse.ok){const list=await listResponse.json();if(epoch!==R.epoch)return;R.runs=list.runs||[];R.activeRun=list.activeRun||null;if(!R.run)R.run=R.activeRun;renderSeries();}}catch{}
      if(epoch!==R.epoch)return;
      // This endpoint exists before any games do, so waiting does not generate 404s.
      const response=await fetch(arenaPath('/api/arena'),{cache:'no-store'});if(epoch!==R.epoch)return;
      if(!response.ok){$('replay-phase').textContent='等待比赛服务就绪…';return;}
      const meta=await response.json();if(epoch!==R.epoch)return;if(R.run&&meta.run&&meta.run!==R.run)throw new Error('比赛系列不匹配');R.meta=meta;R.run=meta.run||R.run;replayURL();renderSeries();renderReplayMeta();$('replay-phase').textContent=phaseText(R.meta);
      const games=R.meta.games||[],html=games.length?games.map((g,i)=>`<option value="${esc(g.id)}">${g.round?`第 ${g.round} 轮 · `:''}第 ${g.game||i+1} 局 · ${esc((g.seats||[]).map(k=>replayModel(k)).join(' / '))} · ${esc(replayWinner(g))}</option>`).join(''):'<option value="">等待对局完成</option>';
      const picker=$('replay-game');if(picker.innerHTML!==html){const selected=R.id;picker.innerHTML=html;if(selected&&games.some(g=>String(g.id)===String(selected)))picker.value=selected;}picker.disabled=!games.length;
      if(!S.catalog){try{S.catalog=await api('/api/catalog');renderProduction();}catch{}}
      if(epoch!==R.epoch)return;
      if(games.length&&!R.data&&!R.loading&&!R.loadError&&S.catalog){const requested=games.find(g=>String(g.id)===R.requested);await loadReplay(requested?.id||games[games.length-1].id);}
      else if(!R.data&&!R.loading&&!R.loadError){$('replay-detail').textContent=R.meta.error?String(R.meta.error):(R.meta.setup_note||'准备期间会自动刷新；已结束的对局会保存在列表中，可反复观看。');replayBanner(R.meta.error?'比赛暂时中断':'正在等待可播放的对局',phaseText(R.meta));}
      if(epoch!==R.epoch)return;
      if(R.data&&!R.loading)renderReplayDetail();
    } catch(error){if(epoch===R.epoch)$('replay-phase').textContent='连接暂时中断，正在重试…';}
    finally{if(epoch===R.epoch)R.pollBusy=false;}
  }
  async function readReplay(response,ticket) {
    if(!response.body?.getReader)return response.json();
    const reader=response.body.getReader(),decoder=new TextDecoder(),chunks=[];let size=0,lastUpdate=0;
    while(true){const {done,value}=await reader.read();if(done)break;if(ticket!==R.ticket){await reader.cancel();return null;}size+=value.byteLength;chunks.push(decoder.decode(value,{stream:true}));const now=performance.now();if(now-lastUpdate>150){$('replay-detail').textContent=`正在加载回放 · ${(size/1048576).toFixed(1)} MB 已读取…`;lastUpdate=now;}}
    if(ticket!==R.ticket)return null;chunks.push(decoder.decode());$('replay-detail').textContent=`正在整理战场记录 · ${(size/1048576).toFixed(1)} MB…`;
    // Let the loading label paint before parsing a potentially long match.
    await new Promise(resolve=>requestAnimationFrame(resolve));return JSON.parse(chunks.join(''));
  }
  async function loadReplay(id) {
    if(!id)return;const ticket=++R.ticket;R.loading=true;R.playing=false;R.loadError='';R.id=String(id);$('replay-game').value=R.id;
    for(const key of ['replay-play','replay-start','replay-seek'])$(key).disabled=true;
    $('replay-detail').textContent='正在读取完整回放，请稍候…';replayBanner('正在载入战场','回放包含双方的完整战场状态，可随时拖动时间轴。');
    try {
      const response=await fetch(arenaPath(`/api/arena/games/${encodeURIComponent(id)}`));if(ticket!==R.ticket)return;
      if(!response.ok)throw new Error(`回放文件暂不可用（${response.status}）`);
      const data=await readReplay(response,ticket);if(ticket!==R.ticket)return;
      if(!data?.frames?.length)throw new Error('回放尚未包含战场记录');
      R.data=data;R.index=-1;R.clock=Number(data.frames[0].now)||0;S.selected.clear();S.groups={};S.positions.clear();S.logs=[];S.lastEvent=0;S.terrainKey='';S.mode=null;S.player=-1;
      $('replay-view').innerHTML='<option value="-1">全局</option>'+data.frames[0].players.map(p=>`<option value="${p.id}">${esc(replayModel(data.seats?.[p.id])||p.name)}</option>`).join('');
      const duration=Number(data.frames[data.frames.length-1].now)||Number(data.duration)||0;$('replay-seek').max=duration;$('replay-seek').min=R.clock;
      showReplayFrame(0,true);const map=S.state.map;S.camera.zoom=clamp(Math.min(world.clientWidth/map.width,world.clientHeight/map.height)*.97,.36,2.1);$('zoom-label').textContent=`${Math.round(S.camera.zoom*100)}%`;home();
      for(const key of ['replay-play','replay-start','replay-seek'])$(key).disabled=false;
      R.playing=true;replayURL();renderReplayControls();renderUI(true);
    }catch(error){if(ticket!==R.ticket)return;R.loadError=error.message;R.data=null;S.state=null;$('replay-detail').textContent=`${error.message}。重新选择此对局或刷新页面可重试。`;replayBanner('回放载入失败',error.message);}
    finally{if(ticket===R.ticket){R.loading=false;if(R.data){$('center-banner').hidden=true;renderReplayDetail();}}}
  }
  function renderReplayDetail() {
    if(!R.data)return;const game=(R.meta?.games||[]).find(g=>String(g.id)===R.id)||R.data;const final=R.data.final||{};
    const keys=replayKeys(),totals=Object.fromEntries(keys.map(key=>[key,0]));for(const g of R.meta?.games||[]){const key=Number.isInteger(g.winner)?g.seats?.[g.winner]:g.winner;if(Object.hasOwn(totals,key))totals[key]++;}
    const score=keys.map(key=>`${replayModel(key)} ${totals[key]}`).join(' : ');
    $('replay-detail').textContent=`本局：${replayWinner(game)} · ${game.reason||R.data.reason||final.reason||'比赛结束'}　|　系列战绩 ${score}　|　点选单位查看技能；拖动时间轴可倒带。`;
  }
  function renderReplayStatus() {
    const state=S.state;if(!state)return;const p=player(),all=S.player===-1;
    $('gold').textContent=all?state.players.reduce((n,p)=>n+Math.floor(p.gold||0),0):Math.floor(p?.gold||0);
    $('wood').textContent=all?state.players.reduce((n,p)=>n+Math.floor(p.wood||0),0):Math.floor(p?.wood||0);
    $('population').textContent=all?`${state.players.reduce((n,p)=>n+(p.population||0),0)}/${state.players.reduce((n,p)=>n+(p.popCap||0),0)}`:`${p?.population||0}/${p?.popCap||0}`;
    $('tier').textContent=all?'—':TIER[p?.tier||1];$('clock').textContent=time(state.now||0);
    $('game-status').textContent=R.playing?'回放播放中':R.index===R.data?.frames?.length-1?'回放已结束':'回放已暂停';$('match-label').textContent='AI 对战 · 只读回放';$('faction-badge').textContent=all?'全局合计':replayModel(R.data?.seats?.[S.player]);
    $('map-subtitle').textContent=all?'全局观察 · 顶部资源为双方合计':`观察 ${replayModel(R.data?.seats?.[S.player])} · 顶部显示此阵营资源`;
    if(!R.loading)$('center-banner').hidden=true;
  }
  function renderReplayControls() {
    $('replay-play').textContent=R.playing?'Ⅱ 暂停':'▶ 播放';$('replay-play').setAttribute('aria-label',R.playing?'暂停回放':'播放回放');
    if(R.data){const end=Number(R.data.frames[R.data.frames.length-1].now)||0;$('replay-seek').value=R.clock;$('replay-time').textContent=`${time(R.clock)} / ${time(end)}`;$('replay-seek').setAttribute('aria-valuetext',`${time(R.clock)}，共 ${time(end)}`);}
    renderReplayStatus();
  }
  function showReplayFrame(index,reset=false) {
    if(!R.data)return;const changed=index!==R.index;if(!changed&&!reset)return;
    if(reset){S.positions.clear();S.logs=[];S.lastEvent=0;S.mode=null;hideTooltip();}
    R.index=index;const frame=R.data.frames[index];receive({...frame,map:frame.map||R.data.map||R.data.frames[0].map,rules:frame.rules||R.data.rules||S.catalog.rules});
    if(reset)renderUI(true);
  }
  function seekReplay(now) {
    if(!R.data)return;const frames=R.data.frames;R.clock=clamp(Number(now)||0,Number(frames[0].now)||0,Number(frames[frames.length-1].now)||0);
    const end=Number(frames[frames.length-1].now)||0;if(Math.abs(end-R.clock)<.000001)R.clock=end;
    let low=0,high=frames.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(frames[mid].now<=R.clock+.000001)low=mid;else high=mid-1;}
    showReplayFrame(low,true);renderReplayControls();
  }
  function toggleReplay() {if(!R.data||R.loading)return;if(!R.playing&&R.index===R.data.frames.length-1)seekReplay(R.data.frames[0].now||0);R.playing=!R.playing;renderReplayControls();}
  function advanceReplay(dt) {
    if(!R.playing||!R.data||R.loading)return;const frames=R.data.frames,end=Number(frames[frames.length-1].now)||0;R.clock=Math.min(end,R.clock+dt*R.speed);
    let index=Math.max(0,R.index);while(index+1<frames.length&&frames[index+1].now<=R.clock)index++;showReplayFrame(index);
    if(R.clock>=end)R.playing=false;renderReplayControls();
  }
  function openSetup() {if(R.enabled)return;$('setup-modal').hidden=false;$('setup-close').hidden=!S.state;S.setupFocus=document.activeElement;hideTooltip();renderSetupHeroes();}
  function closeSetup() {if(S.state){$('setup-modal').hidden=true;S.setupFocus?.focus?.();}}
  function renderSetupHeroes() {
    if(!S.catalog)return;
    const heroes=Object.values(S.catalog.heroes);
    if(!S.catalog.heroes[S.firstHero]) S.firstHero=heroes[0]?.id;
    $('setup-heroes').innerHTML=heroes.map(h=>`<button class="setup-hero ${S.firstHero===h.id?'active':''}" data-hero="${esc(h.id)}" aria-pressed="${S.firstHero===h.id}"><span class="rune" style="color:${esc(h.color)}">${rune(h.id)}</span><span class="hero-name">${esc(h.name)}</span></button>`).join('');
    const h=S.catalog.heroes[S.firstHero];
    if(h)$('setup-hero-description').innerHTML=`<b>${esc(h.name)} <span style="color:#8a9c7e;font-size:10px">· ${h.hp} 生命 / ${h.mana} 法力</span></b>${esc(h.description)}<small>${h.skills.map(id=>{const sk=S.catalog.skills[id];return `${sk.slot} ${esc(sk.name)}`;}).join('　')}</small>`;
  }
  async function createMatch() {
    if(R.enabled)return;
    const count=clamp(parseInt($('player-count').value)||2,2,8);$('player-count').value=count;
    const button=$('create-button');button.disabled=true;button.textContent='正在集结…';$('setup-error').textContent='';
    try {
      const result=await api('/api/matches',{method:'POST',body:JSON.stringify({count,hero:S.firstHero})});
      const seat=result.seats?.find(s=>s.player===0)||result.seats?.[0];
      S.match=typeof result.match==='object'?result.match.id:result.match;S.token=seat?.token || null;S.player=seat?.player ?? 0;S.selected.clear();S.groups={};S.positions.clear();S.logs=[];S.lastEvent=0;S.terrainKey='';S.mode=null;
      if(result.state)receive(result.state);else await poll();
      saveSeat();$('setup-modal').hidden=true;home();renderUI(true);toast('部队已集结。点击「开始战役」开战。');
    } catch(error) {$('setup-error').textContent=error.message;}
    finally {button.disabled=false;button.innerHTML='建立战局 <span>→</span>';}
  }
  function renderStatus() {
    const state=S.state;if(!state)return;
    if(R.enabled){renderReplayStatus();return;}
    const p=player();$('gold').textContent=Math.floor(p?.gold||0);$('wood').textContent=Math.floor(p?.wood||0);$('population').textContent=`${p?.population ?? 0}/${p?.popCap ?? 0}`;$('tier').textContent=TIER[p?.tier||1];$('clock').textContent=time(state.now||0);
    $('game-status').textContent=state.paused?'已暂停':state.status==='ready'?'等待开战':state.status==='finished'?'战局结束':'战役进行中';
    $('match-label').textContent=`${state.players?.length || 2} 方混战 · 本地战役`;$('faction-badge').textContent=p?.name || '观察者';
    $('pause-button').textContent=state.paused?'▶':'Ⅱ';$('pause-button').disabled=state.status!=='playing';
    $('map-subtitle').textContent=state.status==='ready'?'军团已集结，等待你的命令':`${state.players?.filter(p=>p.alive).length || 0} 方势力仍在战场 · 摧毁所有敌方大厅`;
    const banner=$('center-banner');
    const bannerKey=`${state.status}:${state.paused}:${state.winner}`;
    if(banner.dataset.key!==bannerKey){banner.dataset.key=bannerKey;
      if(state.status==='ready'){banner.hidden=false;banner.innerHTML='<span class="eyebrow">YOUR LEGEND BEGINS</span><h2>军团已集结</h2><p>工人已准备采集资源。<br>建立经济、招募英雄，夺取最后的王座。</p><button id="start-match" class="primary-button">开始战役 →</button>';}
      else if(state.status==='finished'){const win=state.winner===S.player;banner.hidden=false;banner.innerHTML=`<span class="eyebrow">THE WAR HAS ENDED</span><h2>${win?'王座属于你':state.winner==null?'战役落幕':'战旗陨落'}</h2><p>${esc(state.reason || (win?'你的军团取得了胜利。':'重整旗鼓，再次踏上征途。'))}</p><button id="another-match" class="primary-button">建立新战局 →</button>`;}
      else if(state.paused){banner.hidden=false;banner.innerHTML='<span class="eyebrow">THE BATTLE WAITS</span><h2>战役暂停</h2><p>稍作整顿，军团正在等待你。</p><button id="resume-match" class="primary-button">继续战役 →</button>';}
      else banner.hidden=true;
    }
  }
  function renderUI(force=false) {
    if(!S.catalog)return;
    renderProduction();renderSelection();renderHeroes();renderQueue();
    $('player-list').innerHTML=(S.state?.players||[]).map(p=>`<div class="player-row ${p.alive?'':'out'}"><small>${R.enabled?(p.id===S.player?'观察':'AI'):p.id===S.player?'你':p.kind==='human'?'玩家':'AI'}</small><span>${esc(R.enabled&&R.data?.seats?.[p.id]?replayModel(R.data.seats[p.id]):p.name)}</span><i style="background:${esc(p.color||COLORS[p.id])}"></i></div>`).join('');
    $('battle-log').innerHTML=S.logs.map(log=>`<p><span class="log-time">${time(log.t)}</span>${esc(log.text)}</p>`).join('');
    renderMode();
  }
  function costMarkup(cost={}) {
    const p=player();return `<span class="${p&&p.gold<(cost.gold||0)?'low':''}">◆ ${cost.gold||0}</span>${cost.wood?`<span class="wood-cost ${p&&p.wood<cost.wood?'low':''}">♠ ${cost.wood}</span>`:''}`;
  }
  function ownedComplete(type) {return (S.state?.buildings||[]).filter(b=>own(b)&&b.type===type&&b.complete);}
  function scaledTechCost(def,level) {return {gold:def.cost.gold+level*70,wood:def.cost.wood+level*50};}
  function rosterFor(id) {return player()?.heroes?.find(h=>h.type===id);}
  function itemState(def,kind) {
    if(R.enabled){const roster=kind==='heroes'?rosterFor(def.id):null;return {reason:roster?(roster.dead?'已阵亡':roster.queued?'正在召唤':'已在军中'):'回放 · 查看资料',action:'查看',cost:def.cost,owned:!!roster&&!roster.dead&&!roster.queued};}
    const p=player();if(!p)return {reason:'等待部署',action:'查看'};
    if(S.state.status==='ready')return {reason:'开始战役后可操作',action:'待命',cost:def.cost};
    if(S.state.status==='finished')return {reason:'本局已结束',action:'结束',cost:def.cost};
    if(S.state.paused)return {reason:'战役暂停中',action:'暂停',cost:def.cost};
    const tier=p.tier||1;let reason='',action=kind==='heroes'?'召唤':kind==='units'?'训练':kind==='buildings'?'放置':'研究';let cost=def.cost;
    if(kind==='heroes') {const roster=rosterFor(def.id);if(roster){if(roster.queued)return {reason:roster.dead?'复活中':'正在召唤',action:'排队中',cost:roster.dead?{gold:150+(roster.level||1)*40,wood:0}:cost};if(!roster.dead)return {reason:'英雄已在军中',action:`Lv.${roster.level||1}`,owned:true,cost};action='复活';cost={gold:150+(roster.level||1)*40,wood:0};if(roster.respawnAt>S.state.now)reason=`复苏中 ${Math.ceil(roster.respawnAt-S.state.now)}秒`;}
      else if((p.heroes?.length||0)>=(S.catalog.rules?.heroCap||5))reason='英雄名额已满';
    }
    if(kind==='techs') {const level=p.tech?.[def.id]||0;cost=scaledTechCost(def,level);if(level>=def.maxLevel)reason='已全部完成';else if(['weapons','armor'].includes(def.id)&&level>=tier)reason=`需要 ${TIER[Math.min(3,tier+1)]} 级时代`;if(def.id==='tier2'&&tier>=2)reason='已完成';if(def.id==='tier3'&&tier>=3)reason='已完成';action=reason==='已完成'||reason==='已全部完成'?'完成':`Lv.${level+1}`;
      if((S.state.buildings||[]).some(b=>own(b)&&b.queue?.some(q=>q.kind==='tech'&&q.type===def.id)))reason='研发中';
    }
    if(!reason&&tier<(def.tier||1))reason=`需要 ${TIER[def.tier]} 级时代`;
    const producer=kind==='techs'?def.building:kind==='heroes'?'altar':def.producer;
    if(!reason&&producer&&!ownedComplete(producer).length)reason=`需要${S.catalog.buildings[producer]?.name||producer}`;
    if(!reason&&def.requires&&!ownedComplete(def.requires).length)reason=`需要${S.catalog.buildings[def.requires]?.name||def.requires}`;
    if(!reason&&kind==='buildings'&&!(S.state.units||[]).some(u=>own(u)&&u.type==='worker'))reason='需要农民';
    if(!reason&&(p.gold<(cost?.gold||0)||p.wood<(cost?.wood||0)))reason='资源不足';
    if(!reason&&['heroes','units'].includes(kind)&&p.population+(def.pop||0)>p.popCap)reason='人口不足';
    return {reason,action,cost};
  }
  function renderProduction() {
    const p=player();$('hero-count').textContent=`${p?.heroes?.length||0} / ${S.catalog.rules?.heroCap||5}`;
    const intros={heroes:'英雄各具 4 项技能，战斗提升等级。最多招募 5 位不同英雄，阵亡后可在祭坛复活。',units:'17 类单位含农民与 16 类战斗兵种。生产需要对应建筑，部分兵种需要升级时代。',buildings:'选择建筑后点击空地，农民将前往施工。可在施工时继续指挥其他部队。',techs:'研究由对应建筑完成。升级时代解锁军备、建筑与部队；铁匠铺是时代升级的前提。'};
    $('production-intro').textContent=R.enabled?({heroes:'英雄资料：各具 4 项技能。切换观察阵营后可查看该方已招募英雄，点击头像定位。',units:'兵种资料：查看属性、费用与技能。回放模式中不会训练单位。',buildings:'建筑资料：查看费用、前置条件与用途。回放模式中不会放置建筑。',techs:'科技资料：切换观察阵营可查看经济和生产队列。'}[S.tab]):intros[S.tab];
    const rows=Object.values(S.catalog[S.tab]||{}).map(def=>{const st=itemState(def,S.tab);const producer=S.catalog.buildings[def.producer||def.building];return `<button class="production-item ${st.reason?'locked':''}" data-product="${esc(def.id)}" data-kind="${S.tab}" data-tooltip="${S.tab}:${esc(def.id)}" aria-label="${esc(def.name)}，${esc(st.reason||st.action)}"><span class="item-symbol" style="${def.color?`color:${esc(def.color)}`:''}">${rune(def.id)}</span><span><span class="item-name">${esc(def.name)}</span><span class="item-subtitle" style="display:block">${esc(st.reason || (S.tab==='heroes'?def.role:producer?producer.name:`${def.build} 秒建造`))}</span><span class="item-cost">${costMarkup(st.cost||def.cost)}${def.pop&&S.tab!=='buildings'?`<span>♟ ${def.pop}</span>`:''}</span></span><span class="item-action">${esc(st.action)}${def.tier>1?`<br><span style="color:#71876d">时代 ${TIER[def.tier]}</span>`:''}</span></button>`;}).join('');
    const list=$('production-list');if(list.innerHTML!==rows)list.innerHTML=rows;
  }
  function renderHeroes() {
    const p=player();if(!p){$('hero-ribbon').innerHTML='';return;}
    const html=(p.heroes||[]).map((h,i)=>{const unit=entity(h.unitId);const d=S.catalog.heroes[h.type];return `<button class="hero-card ${unit&&S.selected.has(normId(unit.id))?'selected':''} ${h.dead?'dead':''}" data-roster="${i}" data-tooltip="heroes:${esc(h.type)}" aria-label="${esc(d?.name)}，F${i+1}"><kbd>F${i+1}</kbd><span class="rune" style="color:${esc(d?.color||'#b6c09f')}">${rune(h.type)}</span><span class="hero-level">${h.dead?'†':h.level||unit?.level||1}</span><div class="mini-bar"><i style="width:${unit?hpFraction(unit)*100:0}%"></i></div><div class="mini-bar mana"><i style="width:${unit?clamp(unit.mana/(unit.maxMana||d?.mana||1),0,1)*100:0}%"></i></div></button>`;}).join('');
    if($('hero-ribbon').innerHTML!==html)$('hero-ribbon').innerHTML=html;
  }
  function renderSelection() {
    const list=selectedEntities(),first=caster()||list[0],summary=$('selection-summary');
    if(!first){summary.innerHTML=R.enabled?'<div class="empty-emblem">◷</div><div><span class="eyebrow">BATTLE OBSERVER</span><h2>纵览两军交锋</h2><p>点击单位查看生命、技能与冷却。</p></div>':'<div class="empty-emblem">♜</div><div><span class="eyebrow">YOUR COMMAND</span><h2>统领你的军团</h2><p>框选部队，右键指挥它们前进。</p></div>';$('selected-units').innerHTML='';$('skill-bar').innerHTML='';return;}
    const def=definition(first),isBuilding=(S.state?.buildings||[]).includes(first);const maxMana=first.maxMana||def.mana||0;
    const groupText=Object.keys(S.groups).filter(key=>S.groups[key].some(id=>S.selected.has(id))).map(key=>`<span class="group-tag">${key}</span>`).join('');
    const detail=first.hero?`英雄 · 等级 ${first.level||1}`:isBuilding?`${first.complete?'建筑':`施工 ${Math.round((first.progress||0)*100)}%`}`:`${ARMOR[def.armor]||'轻甲'} · ${ATTACK[def.attackType]||'普通'} ${Math.round(def.damage||0)}`;
    summary.innerHTML=`<div class="selection-portrait" style="color:${esc(def.color||colorFor(first.owner))}">${rune(first.type)}${list.length>1?`<small>× ${list.length}</small>`:first.hero?`<small>Lv.${first.level||1}</small>`:''}</div><div><span class="eyebrow">${R.enabled?'BATTLE OBSERVER':own(first)?'YOUR COMMAND':'ENEMY FORCES'}</span><h2>${esc(list.length>1?`${def.name} · ${list.length} 个单位`:def.name)}</h2><p>${esc(detail)}</p><div class="stat-bars"><div class="stat-line"><span>生命</span><span>${Math.ceil(first.hp)} / ${Math.ceil(first.maxHp||def.hp||0)}</span></div><div class="stat-bar"><i style="width:${hpFraction(first)*100}%"></i></div>${maxMana?`<div class="stat-line"><span>法力</span><span>${Math.floor(first.mana||0)} / ${maxMana}</span></div><div class="stat-bar mana"><i style="width:${clamp((first.mana||0)/maxMana,0,1)*100}%"></i></div>`:''}${first.hero?`<div class="stat-bar xp" title="${first.level>=6?'已达最高等级':`经验 ${Math.round(first.xp||0)} / ${100*(first.level||1)}`}"><i style="width:${first.level>=6?100:Math.min(100,(first.xp||0)/(first.level||1))}%"></i></div>`:''}</div>${groupText?`<div class="group-tags">${groupText}</div>`:''}</div>`;
    $('selected-units').innerHTML=list.length>1?list.slice(0,36).map(u=>`<button class="unit-chip ${u.id===first.id?'active':''}" data-select="${esc(u.id)}" title="${esc(definition(u).name)}" style="color:${esc(definition(u).color||'#bdc394')}">${rune(u.type)}<i style="width:${hpFraction(u)*26}px"></i></button>`).join(''):'';
    if((!own(first)&&!R.enabled)||isBuilding){$('skill-bar').innerHTML=isBuilding&&own(first)&&!R.enabled?'<p class="empty-text">右键设置集结点<br>生产部队将自动前往</p>':'';return;}
    const skillHtml=(def.skills||[]).map(id=>{const sk=S.catalog.skills[id];if(!sk)return '';const remain=Math.max(0,(first.cooldowns?.[id]||0)-(S.state?.now||0));const locked=(first.level||1)<sk.requiredLevel;const unavailable=locked||remain>0||(first.mana||0)<sk.mana;return `<button class="skill-button ${unavailable?'unavailable':''} ${S.mode?.skill===id?'chosen':''}" data-skill="${esc(id)}" data-tooltip="skills:${esc(id)}" aria-label="${sk.slot} ${esc(sk.name)}"><kbd>${sk.slot}</kbd><span class="mana-cost">${sk.mana||0}</span><span class="skill-rune">${skillRune(sk)}</span><span class="skill-name">${esc(sk.name)}</span>${remain>0?`<span class="cooldown-mask" style="height:${Math.min(100,remain/sk.cooldown*100)}%"></span><span class="cooldown-number">${Math.ceil(remain)}</span>`:locked?`<span class="cooldown-mask" style="height:100%"></span><span class="cooldown-number" style="font-size:12px">Lv.${sk.requiredLevel}</span>`:''}</button>`;}).join('');
    if($('skill-bar').innerHTML!==skillHtml)$('skill-bar').innerHTML=skillHtml;
  }
  function skillRune(sk) {return {dash:'➹',shield:'⛨',heal:'✧',sanctuary:'☀',line:'↟',zone:'◉',blink:'◇',blast:'✹',cone:'⋔',strike:'⚔',evade:'◌',dot:'♨',execute:'†',blastTarget:'⌖',healArea:'✦',summon:'♧',buff:'ϟ',drain:'☽',taunt:'♜',repairArea:'⚙',dispel:'⊹',stone:'⬟'}[sk.effect]||'✦';}
  function renderQueue() {
    if(!S.state)return;const entries=[];
    for(const b of S.state.buildings.filter(b=>R.enabled&&S.player===-1||own(b))) {
      if(!b.complete)entries.push({name:definition(b).name,where:'正在施工',progress:b.progress||0,left:Math.max(0,Math.ceil((1-(b.progress||0))*(definition(b).build||20)))});
      (b.queue||[]).forEach((q,i)=>{const d=S.catalog.units[q.type]||S.catalog.heroes[q.type]||S.catalog.techs[q.type]||{name:q.type};entries.push({name:`${q.kind==='revive'?'复活 · ':''}${d.name}`,where:`${definition(b).name}${i?' · 等待':''}`,progress:1-q.remaining/q.total,left:Math.ceil(q.remaining)});});
    }
    $('queue-count').textContent=entries.length;
    $('queue-list').innerHTML=entries.length?entries.map(q=>`<div class="queue-item"><i class="queue-progress" style="width:${clamp(q.progress,0,1)*100}%"></i><span>${esc(q.name)} <small>${esc(q.where)}</small></span><span>${q.left}s</span></div>`).join(''):'<p class="empty-text">暂无生产任务</p>';
  }
  function select(ids,add=false,toggle=false) {if(!add)S.selected.clear();for(const id of ids){const k=normId(id);if(toggle&&S.selected.has(k))S.selected.delete(k);else S.selected.add(k);}setMode(null);renderUI(true);}
  function selectHero(index) {const h=player()?.heroes?.[index];if(!h)return;const u=entity(h.unitId);if(u){select([u.id]);centerOn(u);}else{S.tab='heroes';updateTabs();toast(R.enabled?`${S.catalog.heroes[h.type]?.name}当前不在战场。`:`${S.catalog.heroes[h.type]?.name}已阵亡，可在英雄页复活。`);}}
  function updateTabs() {document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===S.tab);b.setAttribute('aria-selected',String(b.dataset.tab===S.tab));});hideTooltip();renderProduction();}
  function productAction(id,kind) {
    const def=S.catalog[kind]?.[id];if(!def)return;
    if(R.enabled){const hero=kind==='heroes'&&entity(rosterFor(id)?.unitId);if(hero){select([hero.id]);centerOn(hero);}return;}
    if(!S.state)return openSetup();
    const st=itemState(def,kind);
    if(st.owned){const hero=entity(rosterFor(id).unitId);if(hero){select([hero.id]);centerOn(hero);}return;}
    if(st.reason && !['资源不足','人口不足'].includes(st.reason))return toast(st.reason,true);
    if(kind==='buildings') {
      let worker=selectedUnits().find(u=>u.type==='worker');if(!worker)worker=(S.state.units||[]).filter(u=>own(u)&&u.type==='worker').sort((a,b)=>Math.hypot(a.x-S.camera.x,a.y-S.camera.y)-Math.hypot(b.x-S.camera.x,b.y-S.camera.y))[0];
      if(!worker)return toast('没有可用农民。',true);select([worker.id]);setMode({kind:'build',building:id,worker:worker.id});
    } else if(kind==='heroes')command({type:rosterFor(id)?.dead?'revive':'summon',hero:id});
    else if(kind==='units'){const b=selectedBuildings().find(b=>b.type===def.producer);command({type:'train',unit:id,...(b?{building:b.id}:{})});}
    else command({type:'research',tech:id});
  }
  function setMode(mode) {S.mode=mode;renderMode();}
  function renderMode() {
    const el=$('mode-indicator');el.hidden=!S.mode;world.style.cursor=S.mode?'crosshair':'default';
    if(S.mode){const text=S.mode.kind==='build'?`放置 ${S.catalog.buildings[S.mode.building].name}`:S.mode.kind==='cast'?`施放 ${S.catalog.skills[S.mode.skill].name}`:'攻击移动 · 选择目的地';el.innerHTML=`${esc(text)}<small>左键确认 · Esc 取消</small>`;}
    document.querySelectorAll('[data-order]').forEach(b=>b.classList.toggle('active',S.mode?.kind==='attackMove'&&b.dataset.order==='attackMove'));
  }
  function activateSkill(id) {
    if(R.enabled)return;
    const u=caster(),sk=S.catalog.skills[id];if(!u||!sk)return;
    if((u.level||1)<sk.requiredLevel)return toast(`需要英雄达到 ${sk.requiredLevel} 级。`,true);
    const cd=(u.cooldowns?.[id]||0)-(S.state.now||0);if(cd>0)return toast(`技能冷却还有 ${Math.ceil(cd)} 秒。`,true);
    if((u.mana||0)<sk.mana)return toast('法力不足。',true);
    if(sk.target==='self'){command({type:'cast',unit:u.id,skill:id});setMode(null);}
    else setMode({kind:'cast',unit:u.id,skill:id});
  }
  function orderAction(type) {
    if(R.enabled)return;
    if(type==='build'){S.tab='buildings';updateTabs();return;}
    const units=selectedUnits().map(u=>u.id);if(!units.length)return toast('请先选择己方部队。',true);
    if(type==='attackMove')setMode({kind:'attackMove'});else{setMode(null);command({type,units});}
  }
  function pointerWorld(x=S.mouse.x,y=S.mouse.y) {return {x:S.camera.x+(x-world.clientWidth/2)/S.camera.zoom,y:S.camera.y+(y-world.clientHeight/2)/S.camera.zoom};}
  function screenPoint(x,y) {return {x:(x-S.camera.x)*S.camera.zoom+world.clientWidth/2,y:(y-S.camera.y)*S.camera.zoom+world.clientHeight/2};}
  function clampCamera() {const map=S.state?.map||{width:3200,height:2000};const w=world.clientWidth/(2*S.camera.zoom),h=world.clientHeight/(2*S.camera.zoom);S.camera.x=w*2>map.width?map.width/2:clamp(S.camera.x,w,map.width-w);S.camera.y=h*2>map.height?map.height/2:clamp(S.camera.y,h,map.height-h);}
  function centerOn(e) {if(e){S.camera.x=e.x;S.camera.y=e.y;clampCamera();}}
  function home() {if(R.enabled&&S.player===-1&&S.state){centerOn({x:S.state.map.width/2,y:S.state.map.height/2});return;}const hall=S.state?.buildings?.find(b=>own(b)&&b.type==='townhall');const hero=S.state?.units?.find(u=>own(u)&&u.hero);centerOn(hall||hero);if(hero&&!S.selected.size)select([hero.id]);}
  function zoom(factor,x=world.clientWidth/2,y=world.clientHeight/2) {const before=pointerWorld(x,y);S.camera.zoom=clamp(S.camera.zoom*factor,.36,2.1);const after=pointerWorld(x,y);S.camera.x+=before.x-after.x;S.camera.y+=before.y-after.y;clampCamera();$('zoom-label').textContent=`${Math.round(S.camera.zoom*100)}%`;}
  function hitEntity(point) {const all=entities().slice().reverse();return all.find(e=>Math.hypot(e.x-point.x,e.y-point.y)<Math.max(e.r||definition(e).r||15,10/S.camera.zoom));}
  function hitResource(point) {return S.state?.resources?.find(r=>r.amount>0&&Math.hypot(r.x-point.x,r.y-point.y)<(r.r||30)+12/S.camera.zoom);}
  function ping(point,color='#c6dc8b') {const p=screenPoint(point.x,point.y),el=$('command-ping');el.hidden=false;el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;el.style.borderColor=color;el.style.animation='none';void el.offsetWidth;el.style.animation='ping .55s ease-out forwards';}
  function contextualOrder(point) {
    if(R.enabled)return;
    if(S.mode){setMode(null);return;}
    const units=selectedUnits(),target=hitEntity(point),resource=hitResource(point);
    if(units.length){
      if(target&&!own(target)){command({type:'attack',units:units.map(u=>u.id),target:target.id});ping(point,'#e49a75');}
      else if(resource&&units.some(u=>u.type==='worker')){const workers=units.filter(u=>u.type==='worker'),others=units.filter(u=>u.type!=='worker');command({type:'gather',units:workers.map(u=>u.id),target:resource.id});if(others.length)command({type:'move',units:others.map(u=>u.id),...point});ping(point,'#e7c66e');}
      else{command({type:'move',units:units.map(u=>u.id),...point});ping(point);}
    } else {const buildings=selectedBuildings();if(buildings.length){for(const b of buildings)command({type:'rally',building:b.id,...point});ping(point,'#e7c66e');}}
  }
  function confirmMode(point) {
    const mode=S.mode;if(!mode)return false;
    if(mode.kind==='attackMove'){command({type:'attackMove',units:selectedUnits().map(u=>u.id),...point});ping(point,'#e49a75');setMode(null);}
    else if(mode.kind==='build'){command({type:'build',units:[mode.worker],building:mode.building,...point});ping(point,'#e7c66e');setMode(null);}
    else if(mode.kind==='cast'){
      const sk=S.catalog.skills[mode.skill],target=hitEntity(point);let payload={type:'cast',unit:mode.unit,skill:mode.skill};
      if(sk.target==='enemy'||sk.target==='ally'){if(!target||sk.target==='enemy'&&own(target)||sk.target==='ally'&&!own(target)){toast(sk.target==='ally'?'请选择一个友军目标。':'请选择一个敌方目标。',true);return true;}payload.target=target.id;}
      else Object.assign(payload,point);
      command(payload);ping(point,sk.color||'#bde4d3');setMode(null);
    }
    return true;
  }

  // The terrain is drawn once per match, with a deterministic seed and no assets.
  function randomSeed(seed) {let value=seed>>>0;return ()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};}
  function ellipse(c,x,y,rx,ry,fill,stroke) {c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function polygon(c,points,fill,stroke) {c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function tree(c,x,y,size=1,variant=0) {
    c.save();c.translate(x,y);c.scale(size,size);ellipse(c,7,6,23,10,'#0b1b1466');c.fillStyle='#524735';c.fillRect(-3,-13,6,18);
    if(variant%3===0){polygon(c,[[-18,-8],[0,-48],[19,-8]],'#274e34','#1a3726');polygon(c,[[-15,-23],[0,-57],[14,-23]],'#315c3b');polygon(c,[[-10,-37],[0,-65],[10,-37]],'#416b43');c.strokeStyle='#68915b55';c.beginPath();c.moveTo(-9,-30);c.lineTo(0,-51);c.stroke();}
    else{ellipse(c,0,-22,22,23,'#1b3c2c','#163726');ellipse(c,-9,-31,17,17,variant%2?'#3c5a35':'#30583a');ellipse(c,10,-30,16,20,'#2b5034');ellipse(c,-2,-41,17,18,variant%2?'#486b3c':'#386641');ellipse(c,-7,-46,8,7,'#72905833');}c.restore();
  }
  function rock(c,x,y,size=1) {c.save();c.translate(x,y);c.scale(size,size);ellipse(c,5,8,24,10,'#10201855');polygon(c,[[-23,4],[-17,-17],[-2,-28],[18,-20],[27,3],[9,12],[-11,10]],'#626a55','#354c3c');polygon(c,[[-17,-17],[-2,-28],[18,-20],[4,-4]],'#858b6c');polygon(c,[[4,-4],[18,-20],[27,3],[9,12]],'#4c5b48');c.strokeStyle='#a5a78455';c.beginPath();c.moveTo(-14,-14);c.lineTo(-2,-23);c.lineTo(12,-18);c.stroke();c.restore();}
  function makeTerrain() {
    if(!S.state)return;const {width,height,obstacles=[]}=S.state.map,c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d'),rand=randomSeed(15426);
    g.fillStyle='#354a34';g.fillRect(0,0,width,height);
    for(let n=0;n<1050;n++){const x=rand()*width,y=rand()*height,r=35+rand()*170;const grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,n%3?'#65704412':'#142d2618');grad.addColorStop(1,'#314a3300');g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2);}
    // Broad old roads connect each starting settlement to the contested center.
    const halls=S.state.buildings.filter(b=>b.type==='townhall');
    for(const b of halls){g.lineCap='round';g.beginPath();g.moveTo(b.x,b.y);g.quadraticCurveTo((b.x+width/2)/2+100,(b.y+height/2)/2-65,width/2,height/2);g.strokeStyle='#71644333';g.lineWidth=110;g.stroke();g.strokeStyle='#a08a5223';g.lineWidth=74;g.stroke();g.strokeStyle='#b49f6620';g.lineWidth=40;g.stroke();ellipse(g,b.x,b.y,165,145,'#c3ab5d12');}
    for(let n=0;n<15000;n++){const x=rand()*width,y=rand()*height;g.fillStyle=['#b9b97422','#1b392c3a','#8d9c5729','#566d4159'][n%4];g.fillRect(x,y,1+rand()*2,1+rand()*4);}
    for(let n=0;n<800;n++){const x=rand()*width,y=rand()*height;g.strokeStyle='#819a5b25';g.lineWidth=1;g.beginPath();g.moveTo(x,y);g.lineTo(x-2,y-5);g.moveTo(x,y);g.lineTo(x+3,y-7);g.stroke();}
    // Water is decorative and kept beyond the walkable boundary.
    g.fillStyle='#1a332b';g.fillRect(0,0,18,height);g.fillRect(width-18,0,18,height);g.fillRect(0,0,width,18);g.fillRect(0,height-18,width,18);
    for(const o of obstacles){
      if(o.kind==='forest'){g.fillStyle='#1b362bd9';g.fillRect(o.x,o.y,o.w,o.h);for(let y=o.y+20;y<o.y+o.h;y+=34)for(let x=o.x+16;x<o.x+o.w;x+=33)tree(g,x+rand()*16-8,y+rand()*10,.75+rand()*.25,Math.floor(rand()*4));}
      else if(o.kind==='water'||o.kind==='lake'){g.fillStyle='#315e5d';g.fillRect(o.x,o.y,o.w,o.h);for(let y=o.y+10;y<o.y+o.h;y+=14){g.strokeStyle='#86b3a529';g.beginPath();g.moveTo(o.x+8,y);g.lineTo(o.x+o.w-8,y+3);g.stroke();}}
      else if(o.kind==='ruins'){g.fillStyle='#293b2b';g.fillRect(o.x-5,o.y-5,o.w+10,o.h+10);for(let y=o.y;y<o.y+o.h;y+=30)for(let x=o.x;x<o.x+o.w;x+=29){g.fillStyle=(x+y)%2?'#697260':'#5b6955';g.fillRect(x+1,y+1,27,27);g.fillStyle='#a5aa8433';g.fillRect(x+2,y+1,25,3);}for(let i=0;i<4;i++)rock(g,o.x+rand()*o.w,o.y+rand()*o.h,.6+rand()*.4);}
      else {g.fillStyle='#2a3c2c';g.fillRect(o.x,o.y,o.w,o.h);for(let y=o.y+25;y<o.y+o.h;y+=39)for(let x=o.x+25;x<o.x+o.w;x+=42)rock(g,x+rand()*15,y+rand()*10,1+rand()*.5);}
    }
    // A shallow border vignette anchors the edge of the map.
    const vignette=g.createRadialGradient(width/2,height/2,600,width/2,height/2,1900);vignette.addColorStop(0,'#091b1000');vignette.addColorStop(1,'#081b0e88');g.fillStyle=vignette;g.fillRect(0,0,width,height);S.terrain=c;
  }
  function visible(x,y,r=80) {const p=screenPoint(x,y);return p.x>-r*S.camera.zoom&&p.y>-r*S.camera.zoom&&p.x<world.clientWidth+r*S.camera.zoom&&p.y<world.clientHeight+r*S.camera.zoom;}
  function resizeCanvas(canvas) {const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}return dpr;}
  function drawResources() {
    for(const res of S.state.resources||[]){if(!visible(res.x,res.y,90))continue;ctx.save();ctx.translate(res.x,res.y);
      if(res.kind==='gold'){ellipse(ctx,3,8,45,24,'#15271a66');rock(ctx,-14,5,.9);rock(ctx,16,7,1.1);polygon(ctx,[[-29,-4],[-10,-33],[11,-25],[21,-8],[3,9]],res.amount>0?'#a79456':'#6f7055','#74633b');polygon(ctx,[[-12,-23],[0,-29],[10,-19],[-2,-8]],res.amount>0?'#e8ca6b':'#858769');polygon(ctx,[[4,-6],[17,-16],[22,-6],[13,5]],res.amount>0?'#d4b151':'#8d9074');if(res.amount>0){ctx.fillStyle='#f1d781';ctx.fillRect(-21,-7,6,5);ctx.fillRect(4,-3,6,7);}}
      else {const count=res.amount>0?7:2;for(let i=0;i<count;i++){const angle=i*2.4,rad=Math.sqrt(i)*19;tree(ctx,Math.cos(angle)*rad,Math.sin(angle)*rad,.8+((i*7)%4)/10,i);}}
      if(S.camera.zoom>.65&&(S.mouse.inside&&Math.hypot(pointerWorld().x-res.x,pointerWorld().y-res.y)<res.r+15)){ctx.font='10px '+getComputedStyle(document.body).fontFamily;ctx.textAlign='center';ctx.fillStyle=res.kind==='gold'?'#ecd384':'#b2d38d';ctx.shadowColor='#08140c';ctx.shadowBlur=5;ctx.fillText(`${res.kind==='gold'?'金矿':'树林'} · ${Math.ceil(res.amount)}`,0,res.r+18);}
      ctx.restore();
    }
  }
  function drawNodes(now) {
    for(const node of S.state.nodes||[]){if(!visible(node.x,node.y,node.r+30))continue;ctx.save();ctx.translate(node.x,node.y);const color=node.owner==null?'#b7af71':colorFor(node.owner),r=node.r||100;
      ellipse(ctx,0,0,r,r,'#1f372322');ctx.strokeStyle=colorAlpha(color,.25);ctx.lineWidth=2;ctx.setLineDash([10,12]);ellipse(ctx,0,0,r,r,null,colorAlpha(color,.3));ctx.setLineDash([]);ellipse(ctx,0,0,38,29,'#556347','#8a916b');ellipse(ctx,0,0,30,21,'#253e32','#7e9271');
      for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.fillStyle='#a7ab79';ctx.fillRect(Math.cos(a)*45-3,Math.sin(a)*34-3,6,6);}
      polygon(ctx,[[-13,4],[-7,-28],[7,-28],[14,4],[0,13]],'#7a8971','#a5ac84');polygon(ctx,[[0,-52],[11,-35],[0,-20],[-11,-35]],color,'#d3d5a188');
      ctx.globalAlpha=.2+Math.sin(now*2)*.08;ellipse(ctx,0,-35,22,22,color);ctx.globalAlpha=1;
      if(node.progress>0){ctx.lineWidth=4;ctx.strokeStyle=node.contested?'#df9d7c':colorFor(node.capturer);ctx.beginPath();ctx.arc(0,0,r,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(node.progress/(node.progress>1?S.catalog.rules.captureSeconds:1),0,1));ctx.stroke();}
      ctx.font='10px '+getComputedStyle(document.body).fontFamily;ctx.textAlign='center';ctx.fillStyle='#ced0aa';ctx.shadowColor='#0b1f12';ctx.shadowBlur=4;ctx.fillText(node.name,0,65);ctx.font='8px '+getComputedStyle(document.body).fontFamily;ctx.fillStyle=node.contested?'#e7b18c':'#a2b08c';ctx.fillText(node.contested?'争夺中':node.owner===S.player?'己方控制 · 持续收入':node.owner==null?'驻军占领 · 资源收入':'敌方控制',0,79);ctx.restore();
    }
  }
  function drawFlag(x,y,color,size=1) {ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.strokeStyle='#d6cd9a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(0,-26);ctx.stroke();polygon(ctx,[[1,-26],[21,-22],[15,-16],[1,-18]],color,'#18291f');ctx.restore();}
  function drawBuilding(b,preview=false) {
    if(!visible(b.x,b.y,(b.r||40)*2))return;const d=definition(b),r=b.r||d.r||38,color=colorFor(b.owner),selected=S.selected.has(normId(b.id));ctx.save();ctx.translate(b.x,b.y);
    ellipse(ctx,7,12,r+13,r*.63,'#0b1b1399');
    if(selected||preview){ellipse(ctx,0,0,r+7,r*.75,null,preview?'#c8d9a2':'#b9d798');ctx.lineWidth=2;ellipse(ctx,0,0,r+11,r*.8,null,preview?'#c8d9a244':'#b9d79866');}
    ctx.fillStyle='#59624b';ctx.strokeStyle='#253b2c';ctx.lineWidth=2;ctx.fillRect(-r*.87,-r*.5,r*1.74,r*1.18);ctx.strokeRect(-r*.87,-r*.5,r*1.74,r*1.18);ctx.fillStyle='#374837';ctx.fillRect(-r*.87,r*.37,r*1.74,r*.31);
    const roof=colorAlpha(color,.65),darkRoof='#2b4b42';
    if(b.type==='townhall') {
      ctx.fillStyle='#8b9274';ctx.fillRect(-30,-42,60,60);ctx.fillStyle='#65725a';ctx.fillRect(-23,-35,46,55);polygon(ctx,[[-39,-39],[0,-70],[39,-39]],darkRoof,'#a6b688');polygon(ctx,[[-31,-42],[0,-64],[31,-42]],roof);ctx.fillStyle='#182b21';ctx.fillRect(-9,-5,18,28);ctx.fillStyle='#c7b468';ctx.fillRect(-19,-27,7,10);ctx.fillRect(12,-27,7,10);
      for(const x of [-40,40]){ctx.fillStyle='#869073';ctx.fillRect(x-11,-29,22,48);ctx.fillStyle='#a3a78a';ctx.fillRect(x-13,-33,26,7);polygon(ctx,[[x-16,-34],[x,-51],[x+16,-34]],roof,'#193d31');ctx.fillStyle='#394f3c';ctx.fillRect(x-3,-18,6,12);}drawFlag(0,-67,color,.9);
    } else if(b.type==='altar') {
      ellipse(ctx,0,-1,30,18,'#9b9e7c','#c4c59c');ellipse(ctx,0,-4,22,12,'#415d47');for(const x of [-24,24]){ctx.fillStyle='#a1a688';ctx.fillRect(x-5,-36,10,36);ctx.fillStyle='#d0c997';ctx.fillRect(x-7,-38,14,5);}polygon(ctx,[[0,-58],[13,-36],[0,-15],[-13,-36]],color,'#d3d9ac');ctx.globalAlpha=.2;ellipse(ctx,0,-35,26,30,color);ctx.globalAlpha=1;
    } else if(b.type==='tower') {
      ctx.fillStyle='#8d977c';ctx.fillRect(-15,-40,30,46);ctx.fillStyle='#b4b79a';ctx.fillRect(-20,-46,40,12);for(let i=-18;i<20;i+=12)ctx.fillRect(i,-54,7,10);ctx.fillStyle='#344b3c';ctx.fillRect(-4,-29,8,16);ctx.fillStyle=color;ctx.fillRect(-17,-40,34,5);drawFlag(5,-54,color,.6);
    } else if(b.type==='farm') {
      ctx.fillStyle='#ae9c6b';ctx.fillRect(-19,-17,38,28);polygon(ctx,[[-26,-16],[0,-35],[26,-16]],'#7c7850','#b6aa6d');ctx.fillStyle='#493c28';ctx.fillRect(-4,-5,10,16);ctx.strokeStyle='#baa478';for(let x=-22;x<=22;x+=11){ctx.beginPath();ctx.moveTo(x,17);ctx.lineTo(x,28);ctx.stroke();}ctx.beginPath();ctx.moveTo(-25,21);ctx.lineTo(25,21);ctx.stroke();
    } else if(b.type==='arcane') {
      ctx.fillStyle='#899c82';ctx.fillRect(-16,-36,32,44);polygon(ctx,[[-23,-35],[0,-66],[23,-35]],'#8f79ab','#c6bad2');ellipse(ctx,0,-14,8,12,'#122e27','#c8c68f');ctx.fillStyle='#b5bce0';ctx.fillRect(-3,-21,6,13);ellipse(ctx,0,-62,5,5,color);
    } else if(b.type==='aviary') {
      ctx.strokeStyle='#9a9570';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-28,15);ctx.lineTo(-23,-31);ctx.lineTo(23,-31);ctx.lineTo(28,15);ctx.stroke();ellipse(ctx,0,-8,25,18,'#766d43','#b1a873');polygon(ctx,[[-33,-35],[0,-53],[33,-35]],roof,'#8b9f7a');ctx.fillStyle='#bfcab0';ctx.font='25px Georgia';ctx.textAlign='center';ctx.fillText('♠',0,-2);
    } else if(b.type==='lumbermill') {
      ctx.fillStyle='#8a7850';ctx.fillRect(-24,-18,48,30);polygon(ctx,[[-31,-19],[0,-39],[31,-19]],'#4b6c47','#a3ab75');for(let i=0;i<3;i++){ellipse(ctx,15+i*8,12,6,6,'#a68f58','#5f5435');ctx.fillStyle='#7b6c41';ctx.fillRect(-15+i*4,6,25,12);}ctx.fillStyle='#c1c3a0';ctx.font='28px Georgia';ctx.fillText('⚒',-15,8);
    } else if(['workshop','forge'].includes(b.type)) {
      ctx.fillStyle='#8a8a6b';ctx.fillRect(-29,-21,58,34);polygon(ctx,[[-36,-22],[-10,-41],[36,-22]],'#626a55','#b0ab7b');ctx.fillStyle='#515d4c';ctx.fillRect(15,-49,13,27);ctx.fillStyle='#252e24';ctx.fillRect(-19,-7,19,19);ellipse(ctx,-9,7,7,6,'#df9b53');ctx.fillStyle='#c6c39b';ctx.font='28px Georgia';ctx.fillText(b.type==='forge'?'⚒':'⚙',5,16);
    } else {
      ctx.fillStyle='#919273';ctx.fillRect(-26,-21,52,36);polygon(ctx,[[-34,-22],[0,-47],[34,-22]],darkRoof,'#8ea381');polygon(ctx,[[-28,-23],[0,-42],[28,-23]],roof);ctx.fillStyle='#263b2d';ctx.fillRect(-7,-6,14,22);ctx.fillStyle='#d7c491';ctx.font='25px Georgia';ctx.textAlign='center';ctx.fillText(rune(b.type),0,-20);drawFlag(26,-20,color,.65);
    }
    if(!b.complete&&!preview){ctx.fillStyle='#111e1480';ctx.fillRect(-r,-r,r*2,r*1.7);ctx.strokeStyle='#b39e68';ctx.lineWidth=3;for(let x=-r;x<=r;x+=r){ctx.beginPath();ctx.moveTo(x,r*.7);ctx.lineTo(x,-r*.9);ctx.stroke();}ctx.beginPath();ctx.moveTo(-r,-r*.35);ctx.lineTo(r,-r*.35);ctx.moveTo(-r,r*.35);ctx.lineTo(r,r*.35);ctx.moveTo(-r,r*.7);ctx.lineTo(r,-r*.9);ctx.stroke();drawBar(-r,r+10,r*2,4,b.progress,'#cbb36d');}
    if(!preview){if(selected||b.hp<b.maxHp||!b.complete)drawBar(-r,r+3,r*2,5,hpFraction(b),color);if(S.camera.zoom>.6){ctx.font='10px '+getComputedStyle(document.body).fontFamily;ctx.fillStyle='#d5d8b5';ctx.textAlign='center';ctx.shadowColor='#07170b';ctx.shadowBlur=4;ctx.fillText(d.name,0,r+23);ctx.shadowBlur=0;}if(b.queue?.length){drawBar(-r*.7,r+31,r*1.4,3,1-b.queue[0].remaining/b.queue[0].total,'#d8bb72');}if(selected&&d.range){ctx.lineWidth=1;ctx.setLineDash([5,8]);ellipse(ctx,0,0,d.range,d.range,null,'#d8d7a333');ctx.setLineDash([]);}}
    ctx.restore();
  }
  function drawBar(x,y,w,h,value,color) {ctx.fillStyle='#0a1811';ctx.fillRect(x-1,y-1,w+2,h+2);ctx.fillStyle=color;ctx.fillRect(x,y,w*clamp(value||0,0,1),h);}
  function drawUnit(u,now,dt) {
    let pos=S.positions.get(normId(u.id));if(!pos){pos={x:u.x,y:u.y};S.positions.set(normId(u.id),pos);}const distance=Math.hypot(pos.x-u.x,pos.y-u.y);if(distance>180){pos.x=u.x;pos.y=u.y;}else{const lerp=Math.min(1,dt*14);pos.x+=(u.x-pos.x)*lerp;pos.y+=(u.y-pos.y)*lerp;}
    if(!visible(pos.x,pos.y,70))return;const d=definition(u),r=u.r||d.r||12,selected=S.selected.has(normId(u.id)),color=colorFor(u.owner),moving=distance>2,bob=moving?Math.sin(now*12+(Number(String(u.id).replace(/\D/g,''))||0))*.8:0;
    ctx.save();ctx.translate(pos.x,pos.y);ellipse(ctx,4,5,r*.9,r*.45,'#0c1c1599');
    if(selected){ctx.lineWidth=u.hero?2:1.5;ellipse(ctx,0,0,r+6,(r+6)*.7,null,'#d3e3a1');ctx.lineWidth=1;ellipse(ctx,0,0,r+9,(r+9)*.7,null,'#bad79055');}
    if(u.hero){ctx.lineWidth=1;ctx.strokeStyle=colorAlpha(d.color||color,.28);ctx.setLineDash([3,6]);ellipse(ctx,0,0,r+12,(r+12)*.7,null,colorAlpha(d.color||color,.4));ctx.setLineDash([]);}
    const airborne=d.flying&&(u.statuses?.grounded||0)<=now;
    if(airborne){ctx.translate(0,-12+Math.sin(now*3)*2);}ctx.translate(0,bob);
    // Readable troop silhouettes: cavalry, artillery, flyers, robes and infantry.
    const angle=u.angle||0,dir=Math.cos(angle)>=0?1:-1;
    if(u.type==='worker'){
      ctx.fillStyle='#665c36';ctx.fillRect(-6,-6,12,13);ctx.fillStyle=color;ctx.fillRect(-7,-6,14,4);ellipse(ctx,0,-13,6,6,'#d1ad79','#4d4f32');ellipse(ctx,0,-16,9,3,'#bfad65','#70613b');ctx.strokeStyle='#c5c3a2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(7,-3);ctx.lineTo(14,-15);ctx.moveTo(9,-16);ctx.lineTo(18,-11);ctx.stroke();if(u.cargo?.gold||u.cargo?.wood){ctx.fillStyle=u.cargo.gold?'#d9b965':'#7a9360';ctx.fillRect(-11,-3,6,8);}
    }else if(u.type==='knight'){
      ellipse(ctx,0,0,16,8,'#a7aa90','#405845');ctx.fillStyle='#4f604c';ctx.fillRect(-12,1,4,10);ctx.fillRect(8,0,4,11);polygon(ctx,[[10,-2],[14,-16],[23,-13],[21,-3]],'#b7bba0','#4c624b');ctx.fillStyle=color;ctx.fillRect(-8,-13,15,14);ellipse(ctx,0,-18,6,7,'#c8c9ab','#475d4a');ctx.strokeStyle='#d9d4b1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,-12);ctx.lineTo(27,-27);ctx.stroke();
    }else if(['mortar','ballista','turret'].includes(u.type)){
      ctx.fillStyle='#4e5b44';ctx.fillRect(-17,-6,34,14);ellipse(ctx,-11,9,6,6,'#253d2c','#8d9470');ellipse(ctx,11,9,6,6,'#253d2c','#8d9470');ctx.save();ctx.rotate(angle);if(u.type==='mortar'){ctx.fillStyle='#8c967a';ctx.fillRect(-5,-7,25,14);ellipse(ctx,21,0,5,7,'#1e3629','#b7bb95');}else{ctx.strokeStyle='#c5b979';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-2,-17);ctx.lineTo(8,0);ctx.lineTo(-2,17);ctx.stroke();ctx.strokeStyle='#d0d2ac';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(24,0);ctx.stroke();}ctx.restore();ctx.fillStyle=color;ctx.fillRect(-8,-3,11,6);
    }else if(d.flying){
      const flap=airborne?Math.sin(now*7)*5:-8;polygon(ctx,[[-3,-2],[-31,-14-flap],[-23,7],[-8,10]],u.type==='griffin'?'#b6b28e':'#697d70','#283f32');polygon(ctx,[[3,-2],[31,-14-flap],[23,7],[8,10]],u.type==='griffin'?'#b6b28e':'#697d70','#283f32');ellipse(ctx,0,0,8,16,color,'#354e3a');ellipse(ctx,0,-13,6,7,'#ccd0ae');polygon(ctx,[[1,-18],[6,-14],[12,-15]],'#d8b878');
    }else if(u.type==='treant'||u.type==='ancient'||u.type==='sentinel'||u.type==='guardian'){
      const scale=u.type==='ancient'?1.5:u.type==='guardian'?1.1:1;ctx.save();ctx.scale(scale,scale);const stone=u.type==='treant'?'#6b8050':'#83917d';ctx.fillStyle=stone;polygon(ctx,[[-13,-14],[10,-18],[17,2],[9,11],[-12,9],[-18,-2]],stone,'#3b5442');ctx.fillRect(-12,8,8,10);ctx.fillRect(5,8,8,10);ellipse(ctx,0,-21,10,10,stone,'#3b5442');ctx.fillStyle=color;ctx.fillRect(-11,-7,22,6);ctx.fillStyle=u.type==='ancient'?'#f0c171':'#bdd9a2';ctx.fillRect(-5,-23,3,3);ctx.fillRect(3,-23,3,3);ctx.fillStyle='#6f8067';ctx.fillRect(-22,-10,9,20);ctx.fillRect(14,-9,9,20);ctx.restore();
    }else if(['pyromancer','frost','druid','necromancer','oracle','priest','sorceress','shaman','warlock'].includes(u.type)){
      const robe=u.hero?d.color:color;polygon(ctx,[[-5,-15],[5,-15],[r*.8,8],[-r*.8,8]],robe,'#2a4433');polygon(ctx,[[-2,-13],[2,-13],[5,8],[-5,8]],'#31483b');ellipse(ctx,0,-18,u.hero?7:5,u.hero?8:6,'#c2b999','#455840');if(['pyromancer','frost','sorceress','warlock','necromancer'].includes(u.type))polygon(ctx,[[-10,-19],[0,-34],[10,-19]],robe,'#2f493b');ctx.strokeStyle='#bdaf7d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(r*.8,9);ctx.lineTo(r*.8,-26);ctx.stroke();ellipse(ctx,r*.8,-28,4,5,d.color||'#bdc89e');ctx.globalAlpha=.25;ellipse(ctx,r*.8,-28,8,8,d.color||'#bdc89e');ctx.globalAlpha=1;
    }else{
      const armor=u.hero?d.color:color;polygon(ctx,[[-8,-10],[8,-10],[10,5],[-10,5]],armor,'#243f30');ctx.fillStyle='#324b3b';ctx.fillRect(-7,5,5,7);ctx.fillRect(3,5,5,7);ellipse(ctx,0,-15,u.hero?8:6,u.hero?8:6,['assassin','rogue'].includes(u.type)?'#4f5b52':'#c2c6a8','#334e3b');if(['assassin','rogue','ranger','archer','dryad'].includes(u.type)){polygon(ctx,[[-7,-15],[0,-26],[8,-15]],armor);}
      if(['vanguard','footman'].includes(u.type)){polygon(ctx,[[-16,-7],[-7,-10],[-5,2],[-12,9],[-18,2]],'#a5b7a1','#d4d7b2');ctx.fillStyle=armor;ctx.fillRect(-14,-5,5,10);ctx.strokeStyle='#d7d6bc';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,4);ctx.lineTo(15,-22);ctx.stroke();}
      else if(['ranger','archer','crossbow','dryad'].includes(u.type)){ctx.strokeStyle='#c6b680';ctx.lineWidth=2;ctx.beginPath();ctx.arc(12,-5,12,-1.2,1.2);ctx.stroke();ctx.strokeStyle='#d3d5b2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(16,-16);ctx.lineTo(16,6);ctx.moveTo(7,-5);ctx.lineTo(28,-5);ctx.stroke();}
      else if(u.type==='spearman'){ctx.strokeStyle='#b1a478';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(11,10);ctx.lineTo(14,-30);ctx.stroke();polygon(ctx,[[10,-27],[15,-38],[18,-27]],'#c6cfb4');}
      else if(u.type==='engineer'){ctx.fillStyle='#d6b878';ctx.fillRect(-10,-19,20,6);ctx.fillStyle='#738785';ctx.fillRect(7,-7,18,7);ctx.fillStyle='#2e4436';ctx.fillRect(8,0,5,6);}
      else {ctx.strokeStyle='#dad5bb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(-17,-18);ctx.moveTo(9,0);ctx.lineTo(17,-18);ctx.stroke();}
    }
    if((u.shield||0)>0){ctx.lineWidth=1.5;ellipse(ctx,0,-9,r+7,r+10,null,'#b6dcedaa');}
    const statuses=u.statuses||{};if(statuses.stun>now||statuses.root>now||statuses.silence>now){ctx.font='13px Georgia';ctx.textAlign='center';ctx.fillStyle=statuses.stun>now?'#f0d58b':statuses.root>now?'#95c47c':'#c4ace9';ctx.fillText(statuses.stun>now?'✦':statuses.root>now?'⌗':'×',Math.sin(now*5)*5,-r-23);}
    if(u.casting){const sk=S.catalog.skills[u.casting.skill];ctx.lineWidth=2;ellipse(ctx,0,0,r+8,(r+8)*.8,null,sk?.color||'#e1cd8f');}
    const showBar=selected||u.hero||u.hp<u.maxHp||S.camera.zoom>1.5;
    if(showBar){const w=u.hero?43:29,y=-r-(airborne?13:10);drawBar(-w/2,y,w,u.hero?4:3,hpFraction(u),u.owner<0?'#c9a56d':color);if(u.hero&&u.maxMana)drawBar(-w/2,y+6,w,2,u.mana/u.maxMana,'#7aafc3');if(u.hero&&S.camera.zoom>.65){ctx.font='bold 9px '+getComputedStyle(document.body).fontFamily;ctx.textAlign='center';ctx.fillStyle='#ece3b1';ctx.shadowColor='#0a180d';ctx.shadowBlur=4;ctx.fillText(`${d.name} ${u.level||1}`,0,y-5);ctx.shadowBlur=0;}}
    ctx.restore();
  }
  function drawZones(now) {
    for(const zone of S.state.zones||[]){const r=zone.radius||zone.r||100;if(!visible(zone.x,zone.y,r+10))continue;const warned=now<(zone.startsAt||0),color=zone.color||colorFor(zone.owner);ctx.save();ctx.translate(zone.x,zone.y);ctx.lineWidth=warned?2.5:1.5;ellipse(ctx,0,0,r,r,colorAlpha(color,warned?.1:.14),colorAlpha(color,warned?.8:.45));
      ctx.setLineDash(warned?[7,7]:[2,10]);ellipse(ctx,0,0,r-5,r-5,null,colorAlpha(color,.6));ctx.setLineDash([]);
      if(warned){ctx.strokeStyle=colorAlpha(color,.6);ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(12,0);ctx.moveTo(0,-12);ctx.lineTo(0,12);ctx.stroke();ctx.font='11px monospace';ctx.textAlign='center';ctx.fillStyle='#f3dda4';ctx.fillText(`${Math.max(0,zone.startsAt-now).toFixed(1)}s`,0,-18);}
      else{for(let i=0;i<12;i++){const a=i*2.4+now*.2,rr=r*.7*Math.sqrt((i+1)/12);ctx.globalAlpha=.2+.25*Math.sin(now*4+i)**2;ellipse(ctx,Math.cos(a)*rr,Math.sin(a)*rr,5+Math.sin(now*3+i)*2,8,color);}ctx.globalAlpha=1;const remaining=clamp((zone.endsAt-now)/Math.max(.1,zone.endsAt-zone.startsAt),0,1);ctx.strokeStyle=colorAlpha(color,.8);ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r,-Math.PI/2,-Math.PI/2+Math.PI*2*remaining);ctx.stroke();}
      ctx.restore();
    }
  }
  function drawProjectiles() {for(const p of S.state.projectiles||[]){if(!visible(p.x,p.y,30))continue;const a=Math.atan2((p.ty??p.y)-p.y,(p.tx??p.x)-p.x),color=p.color||colorFor(p.owner);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(a);ctx.strokeStyle=colorAlpha(color,.5);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(0,0);ctx.stroke();ellipse(ctx,0,0,p.r||3,Math.max(2,(p.r||3)*.7),color);ctx.restore();}}
  function drawEvents(now) {for(const event of S.state.events||[]){const age=now-event.t;if(age<0||age>1||!Number.isFinite(event.x))continue;const useful=['damage','heal','death','cast','impact','hit','heroDeath','level','levelup'].includes(event.type);if(!useful)continue;ctx.save();ctx.translate(event.x,event.y);ctx.globalAlpha=1-age;ctx.lineWidth=1.5;const color=event.type==='heal'?'#a8d98e':event.type==='death'||event.type==='heroDeath'?'#d69f73':'#e5cf97';ellipse(ctx,0,0,7+age*25,7+age*25,null,color);if(event.text && event.text.length<16){ctx.font='10px '+getComputedStyle(document.body).fontFamily;ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(event.text,0,-25-age*22);}ctx.restore();}}
  function drawOrders() {
    for(const u of selectedUnits()){const order=u.order;if(!order)continue;const target=order.target?entity(order.target)||S.state.resources.find(r=>r.id===order.target):order;if(!Number.isFinite(target?.x))continue;ctx.strokeStyle=order.type==='attack'?'#e99b7670':'#c3d89940';ctx.lineWidth=1;ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(target.x,target.y);ctx.stroke();ctx.setLineDash([]);}
    for(const b of selectedBuildings()){const rally=b.rally||player()?.rally;if(rally){ctx.strokeStyle='#e1c37988';ctx.lineWidth=1;ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(rally.x,rally.y);ctx.stroke();ctx.setLineDash([]);drawFlag(rally.x,rally.y,colorFor(S.player),.8);}}
  }
  function placementValid(point,d) {
    const map=S.state.map,r=d.r+12;if(point.x<r+8||point.y<r+8||point.x>map.width-r-8||point.y>map.height-r-8)return false;
    if(map.obstacles.some(o=>point.x>o.x-r&&point.x<o.x+o.w+r&&point.y>o.y-r&&point.y<o.y+o.h+r))return false;
    if(S.state.buildings.some(b=>Math.hypot(b.x-point.x,b.y-point.y)<b.r+r+4))return false;
    if(S.state.resources.some(res=>res.amount>0&&Math.hypot(res.x-point.x,res.y-point.y)<res.r+d.r+20))return false;
    if(S.state.nodes.some(n=>Math.hypot(n.x-point.x,n.y-point.y)<n.r+d.r))return false;
    return !S.state.units.some(u=>!own(u)&&Math.hypot(u.x-point.x,u.y-point.y)<u.r+d.r);
  }
  function drawTargeting() {
    if(!S.mode||!S.mouse.inside)return;const point=pointerWorld();ctx.save();
    if(S.mode.kind==='build'){const d=S.catalog.buildings[S.mode.building],valid=placementValid(point,d),color=valid?'#bed495':'#ed9983';ctx.globalAlpha=.55;drawBuilding({id:'preview',type:S.mode.building,...point,owner:S.player,r:d.r,complete:true},true);ctx.globalAlpha=1;ctx.lineWidth=2;ellipse(ctx,point.x,point.y,d.r+12,d.r+12,colorAlpha(color,.12),color);}
    else if(S.mode.kind==='cast'){const u=entity(S.mode.unit),sk=S.catalog.skills[S.mode.skill];if(u){ctx.lineWidth=1;ctx.setLineDash([5,9]);ellipse(ctx,u.x,u.y,sk.range,sk.range,null,'#d4d4a666');ctx.setLineDash([]);const inRange=Math.hypot(point.x-u.x,point.y-u.y)<=sk.range,color=inRange?(sk.color||'#c9dba6'):'#e99b83';if(sk.effect==='line'||sk.effect==='cone'||sk.effect==='dash'){const a=Math.atan2(point.y-u.y,point.x-u.x);ctx.translate(u.x,u.y);ctx.rotate(a);if(sk.effect==='cone'){ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,Math.min(sk.range,350),-.65,.65);ctx.closePath();ctx.fillStyle=colorAlpha(color,.12);ctx.fill();ctx.strokeStyle=colorAlpha(color,.7);ctx.stroke();}else{ctx.strokeStyle=colorAlpha(color,.4);ctx.lineWidth=sk.radius||25;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.min(sk.range,Math.hypot(point.x-u.x,point.y-u.y)),0);ctx.stroke();}}else ellipse(ctx,point.x,point.y,sk.radius||18,sk.radius||18,colorAlpha(color,.13),color);}}
    else {ctx.strokeStyle='#e5ad82';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(point.x-10,point.y-10);ctx.lineTo(point.x+10,point.y+10);ctx.moveTo(point.x+10,point.y-10);ctx.lineTo(point.x-10,point.y+10);ctx.stroke();}
    ctx.restore();
  }
  function drawMinimap() {
    const dpr=resizeCanvas(mini),w=mini.clientWidth,h=mini.clientHeight; mctx.setTransform(dpr,0,0,dpr,0,0);mctx.clearRect(0,0,w,h);
    if(!S.state){mctx.fillStyle='#213b2b';mctx.fillRect(0,0,w,h);return;}
    const sx=w/S.state.map.width,sy=h/S.state.map.height;if(S.terrain)mctx.drawImage(S.terrain,0,0,w,h);
    for(const r of S.state.resources){mctx.fillStyle=r.kind==='gold'?'#d8ba65':'#8dac68';mctx.fillRect(r.x*sx-1.5,r.y*sy-1.5,3,3);}
    for(const n of S.state.nodes){mctx.strokeStyle=n.owner==null?'#c6bb88':colorFor(n.owner);mctx.lineWidth=1;mctx.beginPath();mctx.arc(n.x*sx,n.y*sy,3,0,Math.PI*2);mctx.stroke();}
    for(const b of S.state.buildings){mctx.fillStyle=colorFor(b.owner);const size=b.type==='townhall'?5:3;mctx.fillRect(b.x*sx-size/2,b.y*sy-size/2,size,size);}
    for(const u of S.state.units){mctx.fillStyle=u.owner<0?'#bd995a':colorFor(u.owner);mctx.fillRect(u.x*sx-1,u.y*sy-1,u.hero?3:2,u.hero?3:2);}
    const left=(S.camera.x-world.clientWidth/2/S.camera.zoom)*sx,top=(S.camera.y-world.clientHeight/2/S.camera.zoom)*sy;mctx.strokeStyle='#f2e6ad';mctx.lineWidth=1;mctx.strokeRect(left,top,world.clientWidth/S.camera.zoom*sx,world.clientHeight/S.camera.zoom*sy);mctx.fillStyle='#f2e6ad0a';mctx.fillRect(left,top,world.clientWidth/S.camera.zoom*sx,world.clientHeight/S.camera.zoom*sy);
  }
  function frame(stamp) {
    const elapsed=Math.min(.25,(stamp-S.lastFrame)/1000||.016),dt=Math.min(.05,elapsed);S.lastFrame=stamp;if(R.enabled)advanceReplay(elapsed);const now=S.state?.now??stamp/1000;
    if($('setup-modal').hidden&&$('help-modal').hidden){let dx=0,dy=0;if(S.keys.has('ArrowLeft'))dx--;if(S.keys.has('ArrowRight'))dx++;if(S.keys.has('ArrowUp'))dy--;if(S.keys.has('ArrowDown'))dy++;
      if(S.mouse.inside&&S.mouse.edgeAllowed&&!S.pointer&&$('center-banner').hidden){if(S.mouse.x>=0&&S.mouse.x<12)dx--;if(S.mouse.x<=world.clientWidth&&S.mouse.x>world.clientWidth-12)dx++;if(S.mouse.y>=0&&S.mouse.y<12)dy--;if(S.mouse.y<=world.clientHeight&&S.mouse.y>world.clientHeight-12)dy++;}if(dx||dy){S.camera.x+=dx*700*dt/S.camera.zoom;S.camera.y+=dy*700*dt/S.camera.zoom;clampCamera();}}
    const dpr=resizeCanvas(world),w=world.clientWidth,h=world.clientHeight;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#283e2c';ctx.fillRect(0,0,w,h);
    if(S.state){ctx.save();ctx.translate(w/2,h/2);ctx.scale(S.camera.zoom,S.camera.zoom);ctx.translate(-S.camera.x,-S.camera.y);if(S.terrain)ctx.drawImage(S.terrain,0,0);drawNodes(now);drawResources();drawOrders();drawZones(now);
      const drawables=[...S.state.buildings.map(b=>({kind:'building',data:b,y:b.y})),...S.state.units.map(u=>({kind:'unit',data:u,y:u.y}))].sort((a,b)=>a.y-b.y);
      for(const drawable of drawables){if(drawable.kind==='building')drawBuilding(drawable.data);else drawUnit(drawable.data,now,dt);}drawProjectiles();drawEvents(now);drawTargeting();ctx.restore();
      const p=pointerWorld();$('map-coordinates').textContent=`${Math.round(clamp(p.x,0,S.state.map.width))} · ${Math.round(clamp(p.y,0,S.state.map.height))}`;
    } else {ctx.fillStyle='#c2c392';ctx.font='18px '+getComputedStyle(document.body).fontFamily;ctx.textAlign='center';ctx.fillText('灰烬王座 · 准备你的军团',w/2,h/2);}
    drawMinimap();if(stamp-S.lastUI>180){renderUI();S.lastUI=stamp;}requestAnimationFrame(frame);
  }

  function hideTooltip() {$('tooltip').hidden=true;S.tooltip=null;}
  function showTooltip(target,event) {
    const key=target.dataset.tooltip;if(!key||!S.catalog)return;const [kind,id]=key.split(':'),d=S.catalog[kind]?.[id];if(!d)return;
    const tips=[];if(d.hp)tips.push(`生命 ${d.hp}`);if(d.damage)tips.push(`${ATTACK[d.attackType]||'攻击'} ${d.damage}`);if(d.armor)tips.push(ARMOR[d.armor]);if(d.range)tips.push(`射程 ${d.range}`);if(d.build)tips.push(`${d.build} 秒`);if(d.pop&&kind!=='buildings')tips.push(`人口 ${d.pop}`);
    if(kind==='skills'){tips.push(`快捷键 ${d.slot}`,`法力 ${d.mana}`,`冷却 ${d.cooldown} 秒`);if(d.requiredLevel>1)tips.push(`需要等级 ${d.requiredLevel}`);if(d.castTime)tips.push(`施法 ${d.castTime} 秒`);if(d.delay)tips.push(`落点预警 ${d.delay} 秒`);}
    if(kind==='heroes')tips.push(d.skills.map(sk=>`${S.catalog.skills[sk].slot} ${S.catalog.skills[sk].name}`).join(' / '));
    const el=$('tooltip');el.innerHTML=`<h3>${esc(d.name)}</h3><p>${esc(d.description)}</p><div class="tooltip-stats">${tips.map(esc).join(' · ')}</div>`;el.hidden=false;S.tooltip=key;positionTooltip(event);
  }
  function positionTooltip(event){const el=$('tooltip');if(el.hidden)return;el.style.left=`${clamp(event.clientX-el.offsetWidth-16,10,window.innerWidth-el.offsetWidth-10)}px`;el.style.top=`${clamp(event.clientY-15,10,window.innerHeight-el.offsetHeight-10)}px`;}
  function eventPoint(event) {const rect=world.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  world.addEventListener('pointerdown',event=>{
    if(event.button>2)return;event.preventDefault();hideTooltip();world.focus({preventScroll:true});const point=eventPoint(event);Object.assign(S.mouse,point,{inside:true});
    S.pointer={button:event.button,startX:point.x,startY:point.y,lastX:point.x,lastY:point.y,startWorld:pointerWorld(point.x,point.y),moved:false,shift:event.shiftKey};world.setPointerCapture(event.pointerId);
  });
  world.addEventListener('pointermove',event=>{
    const p=eventPoint(event);Object.assign(S.mouse,p,{inside:p.x>=0&&p.y>=0&&p.x<world.clientWidth&&p.y<world.clientHeight,edgeAllowed:true});const drag=S.pointer;if(!drag)return;
    if(Math.hypot(p.x-drag.startX,p.y-drag.startY)>5)drag.moved=true;
    if((drag.button===1||drag.button===2)&&drag.moved){S.camera.x-=(p.x-drag.lastX)/S.camera.zoom;S.camera.y-=(p.y-drag.lastY)/S.camera.zoom;clampCamera();}
    else if(drag.button===0&&drag.moved&&!S.mode){const box=$('selection-box');box.hidden=false;box.style.left=`${Math.min(drag.startX,p.x)}px`;box.style.top=`${Math.min(drag.startY,p.y)}px`;box.style.width=`${Math.abs(p.x-drag.startX)}px`;box.style.height=`${Math.abs(p.y-drag.startY)}px`;}
    drag.lastX=p.x;drag.lastY=p.y;
  });
  world.addEventListener('pointerup',event=>{
    const drag=S.pointer;if(!drag)return;const p=eventPoint(event),point=pointerWorld(p.x,p.y);S.pointer=null;$('selection-box').hidden=true;
    if(world.hasPointerCapture(event.pointerId))world.releasePointerCapture(event.pointerId);
    if(!S.state)return;
    if(drag.button===2&&!drag.moved)contextualOrder(point);
    else if(drag.button===0){if(S.mode){if(!drag.moved)confirmMode(point);return;}
      if(drag.moved){const x1=Math.min(drag.startWorld.x,point.x),x2=Math.max(drag.startWorld.x,point.x),y1=Math.min(drag.startWorld.y,point.y),y2=Math.max(drag.startWorld.y,point.y);const selected=S.state.units.filter(u=>(own(u)||R.enabled&&S.player===-1)&&u.x>=x1&&u.x<=x2&&u.y>=y1&&u.y<=y2);select(selected.map(u=>u.id),drag.shift);}
      else {const target=hitEntity(point);if(target)select([target.id],drag.shift,drag.shift);else if(!drag.shift)select([]);}
    }
  });
  world.addEventListener('pointercancel',()=>{S.pointer=null;$('selection-box').hidden=true;});
  world.addEventListener('pointerenter',()=>{S.mouse.edgeAllowed=false;});world.addEventListener('pointerleave',()=>{S.mouse.inside=false;S.mouse.edgeAllowed=false;});
  world.addEventListener('contextmenu',event=>event.preventDefault());
  world.addEventListener('dblclick',event=>{if(!S.state||S.mode)return;const p=eventPoint(event),target=hitEntity(pointerWorld(p.x,p.y));if(target&&own(target))select(S.state.units.filter(u=>own(u)&&u.type===target.type&&visible(u.x,u.y,0)).map(u=>u.id),event.shiftKey);});
  world.addEventListener('wheel',event=>{event.preventDefault();const p=eventPoint(event);zoom(event.deltaY<0?1.12:1/1.12,p.x,p.y);},{passive:false});
  function minimapPoint(event) {const rect=mini.getBoundingClientRect();return {x:clamp((event.clientX-rect.left)/rect.width,0,1)*(S.state?.map.width||3200),y:clamp((event.clientY-rect.top)/rect.height,0,1)*(S.state?.map.height||2000)};}
  let miniDrag=false;
  mini.addEventListener('pointerdown',event=>{event.preventDefault();if(event.button===2){contextualOrder(minimapPoint(event));return;}miniDrag=true;mini.setPointerCapture(event.pointerId);centerOn(minimapPoint(event));});
  mini.addEventListener('pointermove',event=>{if(miniDrag)centerOn(minimapPoint(event));});mini.addEventListener('pointerup',event=>{miniDrag=false;if(mini.hasPointerCapture(event.pointerId))mini.releasePointerCapture(event.pointerId);});mini.addEventListener('pointercancel',()=>{miniDrag=false;});mini.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){setMode(null);hideTooltip();if(!$('help-modal').hidden)$('help-modal').hidden=true;else if(!$('setup-modal').hidden)closeSetup();return;}
    if(event.target.matches('input,textarea,select')||!$('setup-modal').hidden||!$('help-modal').hidden)return;
    if(event.key.startsWith('Arrow')){event.preventDefault();S.keys.add(event.key);return;}
    const key=event.key.toLowerCase();if(event.repeat)return;
    if(R.enabled&&event.code==='Space'){event.preventDefault();toggleReplay();return;}
    if(/^f[1-5]$/.test(key)){event.preventDefault();selectHero(Number(key.slice(1))-1);return;}
    if(/^[1-9]$/.test(key)){event.preventDefault();if(event.ctrlKey||event.metaKey){S.groups[key]=selectedEntities().filter(own).map(u=>normId(u.id));toast(`编队 ${key} 已保存 · ${S.groups[key].length} 个单位`);}
      else if(S.groups[key]?.length){select(S.groups[key].filter(id=>entity(id)),event.shiftKey);if(S.lastGroup.key===key&&performance.now()-S.lastGroup.at<400){const units=selectedEntities();if(units.length)centerOn({x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length});}S.lastGroup={key,at:performance.now()};}return;}
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(['a','s','h','b'].includes(key)){event.preventDefault();orderAction({a:'attackMove',s:'stop',h:'hold',b:'build'}[key]);return;}
    if('qwer'.includes(key)&&key.length===1){event.preventDefault();const u=caster(),id=u&&definition(u).skills?.find(id=>S.catalog.skills[id]?.slot===key.toUpperCase());if(id)activateSkill(id);return;}
    if(event.code==='Space'){event.preventDefault();const us=selectedEntities();if(us.length)centerOn({x:us.reduce((n,u)=>n+u.x,0)/us.length,y:us.reduce((n,u)=>n+u.y,0)/us.length});return;}
    if(event.key==='Home'){event.preventDefault();home();}
  });
  document.addEventListener('keyup',event=>S.keys.delete(event.key));window.addEventListener('blur',()=>{S.keys.clear();S.mouse.inside=false;S.pointer=null;$('selection-box').hidden=true;});
  $('replay-series').addEventListener('change',event=>switchSeries(event.target.value));
  $('replay-game').addEventListener('change',event=>loadReplay(event.target.value));
  $('replay-speed').addEventListener('change',event=>{R.speed=Number(event.target.value)||1;});
  $('replay-seek').addEventListener('input',event=>{R.playing=false;seekReplay(event.target.value);});
  $('replay-view').addEventListener('change',event=>{S.player=Number(event.target.value);S.selected.clear();S.groups={};showReplayFrame(R.index,true);home();renderUI(true);});
  document.addEventListener('click',event=>{
    if(event.target!==world){S.mouse.inside=false;S.mouse.edgeAllowed=false;}
    const button=event.target.closest('button');if(!button)return;
    if(button.id==='replay-play')toggleReplay();
    if(button.id==='replay-start'){R.playing=false;seekReplay(R.data?.frames[0]?.now||0);}
    if(button.dataset.tab){S.tab=button.dataset.tab;updateTabs();}
    if(button.dataset.hero){S.firstHero=button.dataset.hero;renderSetupHeroes();}
    if(button.dataset.product)productAction(button.dataset.product,button.dataset.kind);
    if(button.dataset.skill)activateSkill(button.dataset.skill);
    if(button.dataset.order)orderAction(button.dataset.order);
    if(button.dataset.select)select([button.dataset.select],event.shiftKey,event.shiftKey);
    if(button.dataset.roster!==undefined)selectHero(Number(button.dataset.roster));
    if(button.id==='start-match')command({type:'start'});
    if(button.id==='resume-match'||button.id==='pause-button')command({type:'pause'});
    if(['new-button','another-match'].includes(button.id))openSetup();
    if(button.id==='setup-close')closeSetup();
    if(button.id==='create-button')createMatch();
    if(button.id==='help-button'){hideTooltip();$('help-modal').hidden=false;}
    if(button.id==='help-close'||button.id==='help-done')$('help-modal').hidden=true;
    if(button.id==='zoom-in')zoom(1.15);if(button.id==='zoom-out')zoom(1/1.15);if(button.id==='home-button')home();
    if(button.id==='count-plus')$('player-count').value=clamp((parseInt($('player-count').value)||2)+1,2,8);
    if(button.id==='count-minus')$('player-count').value=clamp((parseInt($('player-count').value)||2)-1,2,8);
  });
  document.addEventListener('pointerover',event=>{if(event.target!==world){S.mouse.inside=false;S.mouse.edgeAllowed=false;}const target=event.target.closest('[data-tooltip]');if(target)showTooltip(target,event);else if(!event.target.closest('#tooltip'))hideTooltip();});
  document.addEventListener('pointermove',event=>{if(event.target!==world&&!S.pointer){S.mouse.inside=false;S.mouse.edgeAllowed=false;}if(S.tooltip)positionTooltip(event);});
  document.addEventListener('pointerdown',event=>{if(event.target!==world){S.mouse.inside=false;S.mouse.edgeAllowed=false;}},true);
  document.addEventListener('focusin',event=>{if(event.target!==world){S.mouse.inside=false;S.mouse.edgeAllowed=false;}});
  $('production-list').addEventListener('scroll',hideTooltip);document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();home();});
  window.addEventListener('resize',clampCamera);
  initialize();
})();
