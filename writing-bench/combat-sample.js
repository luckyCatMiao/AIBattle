/* Uniform sampling controls, only on ?sample=1. Original author source is untouched. */
(()=>{
 const host=document.createElement('div');
 host.id='combat-sampling-controls';
 host.style.cssText='position:fixed;bottom:8px;left:8px;z-index:2147483647;max-width:680px;';
 const root=host.attachShadow({mode:'open'});
 root.innerHTML='<style>:host{font:11px sans-serif;color:#e5efdf}details{background:#101b15ed;border:1px solid #73965c;border-radius:5px;padding:7px 10px}summary{cursor:pointer}button{background:#263a27;color:#e0f8d1;border:1px solid #547047;border-radius:3px;padding:7px;margin:5px 3px 3px;cursor:pointer}pre{font:10px monospace;margin:5px 0 0;white-space:pre-wrap;max-width:640px}small{display:block;color:#97a88c;margin-top:4px}</style><details><summary>统一试玩采样按键 · 展开</summary><div id="buttons"></div><small>真实游戏状态只读显示；按钮发送标准键盘事件，不改游戏逻辑。连续按键未必等于真人操作。</small><pre id="events">等待输入</pre></details><pre id="state">读取状态…</pre><pre id="environment">渲染频率测量中</pre>';
 document.body.append(host);
 const errors=document.createElement('pre');errors.id='runtime-errors';errors.textContent='采样期间运行错误 / 0';root.append(errors);
 const observedErrors=[];
 function recordError(message){observedErrors.push(String(message));errors.textContent='采样期间运行错误 / '+observedErrors.length+' · '+JSON.stringify(observedErrors.slice(-5));}
 window.addEventListener('error',e=>recordError(e.message||'资源加载错误'));
 window.addEventListener('unhandledrejection',e=>recordError(e.reason?.message||String(e.reason)));
 const mapping={a:['a','KeyA',65],d:['d','KeyD',68],j:['j','KeyJ',74],k:['k','KeyK',75],l:['l','KeyL',76],i:['i','KeyI',73],space:[' ','Space',32],r:['r','KeyR',82],enter:['Enter','Enter',13]};
 for(let n=0;n<26;n++){const key=String.fromCharCode(97+n);mapping[key]=[key,'Key'+key.toUpperCase(),65+n];}
 for(let n=0;n<10;n++)mapping[String(n)]=[String(n),'Digit'+n,48+n];
 Object.assign(mapping,{shift:['Shift','ShiftLeft',16],ctrl:['Control','ControlLeft',17],alt:['Alt','AltLeft',18],up:['ArrowUp','ArrowUp',38],down:['ArrowDown','ArrowDown',40],left:['ArrowLeft','ArrowLeft',37],right:['ArrowRight','ArrowRight',39],escape:['Escape','Escape',27],tab:['Tab','Tab',9]});
 for(let n=1;n<=12;n++)mapping['f'+n]=['F'+n,'F'+n,111+n];
 const held=new Map();
 function event(key,type,repeat=false){const [value,code,num]=mapping[key];const e=new KeyboardEvent(type,{key:value,code,keyCode:num,which:num,bubbles:true,cancelable:true,repeat,shiftKey:held.has('shift'),ctrlKey:held.has('ctrl'),altKey:held.has('alt')});document.body.dispatchEvent(e);}
 function release(key){if(!held.has(key))return;clearInterval(held.get(key).repeat);clearTimeout(held.get(key).timeout);held.delete(key);event(key,'keyup');}
 function press(keys,duration){for(const key of keys){release(key);event(key,'keydown');const item={};item.timeout=setTimeout(()=>release(key),duration);held.set(key,item);}root.querySelector('#events').textContent='最近输入：'+keys.join('+')+' / '+duration+'ms';}
 function taps(){for(let i=0;i<7;i++)setTimeout(()=>press(['j'],60),i*160);}
 const actions=[['开始',['enter'],90],['重开 R',['r'],90],['左移 A · 1秒',['a'],1000],['右移 D · 1秒',['d'],1000],['A 点按 · 0.15秒',['a'],150],['D 点按 · 0.15秒',['d'],150],['J 主攻',['j'],80],['K 副攻 · 0.8秒',['k'],800],['K 长蓄 · 1.8秒',['k'],1800],['L 机动',['l'],150],['I 特色能力',['i'],100],['Space 跳跃',['space'],80],['跳跃 + J',['space','j'],100]];
 for(const [label,keys,duration] of actions){const b=document.createElement('button');b.textContent=label;b.onclick=()=>press(keys,duration);root.querySelector('#buttons').append(b);}
 for(const [label,move] of [['J 连按 · 1秒',false],['D + J · 1秒',true]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{if(move)press(['d'],1100);taps();};root.querySelector('#buttons').append(b);}
 const custom=document.createElement('div');
 custom.addEventListener('keydown',e=>e.stopPropagation());custom.addEventListener('keyup',e=>e.stopPropagation());
 const keyInput=document.createElement('input');keyInput.type='text';keyInput.value='1';keyInput.setAttribute('aria-label','自定义技能按键或组合键');keyInput.style.width='160px';
 const durationInput=document.createElement('input');durationInput.type='number';durationInput.value='150';durationInput.min='1';durationInput.max='60000';durationInput.setAttribute('aria-label','自定义按住毫秒');durationInput.style.width='85px';
 const customButton=document.createElement('button');customButton.textContent='发送自定义按键';
 customButton.onclick=()=>{const keys=keyInput.value.toLowerCase().split('+').map(x=>x.trim().replace(/^key([a-z])$/,'$1').replace(/^digit([0-9])$/,'$1'));const duration=Number(durationInput.value);if(!keys.length||keys.some(k=>!mapping[k])||!Number.isFinite(duration)||duration<1||duration>60000){root.querySelector('#events').textContent='请输入有效按键和1至60000毫秒时长';return;}press(keys,duration);};
 custom.append(keyInput,durationInput,customButton);root.querySelector('details').insertBefore(custom,root.querySelector('small'));
 // Sampling clicks may temporarily change browser focus; every held input has a short, bounded timeout.
 setInterval(()=>{try{const state=typeof window.combatBenchState==='function'?window.combatBenchState():{adapterNote:'作品没有提供状态接口'};root.querySelector('#state').textContent='真实状态 / '+JSON.stringify(state);}catch(e){root.querySelector('#state').textContent='状态接口异常 / '+String(e);}},200);
 let frames=0,last=performance.now(),fps=0;function measure(now){frames++;if(now-last>=1000){fps=Math.round(frames*1000/(now-last));frames=0;last=now;}requestAnimationFrame(measure);}requestAnimationFrame(measure);
 setInterval(()=>root.querySelector('#environment').textContent='采样环境 / '+fps+' FPS · '+document.visibilityState+' · 焦点 '+document.hasFocus(),500);
})();
