const $=s=>document.querySelector(s);
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
let run,runId=new URL(location.href).searchParams.get('run'),selected,loadedGame='',formEntry='',formSaved='',busy=false;
const statuses={queued:'等待制作',building:'制作中',ready:'可试玩',failed:'请求未完成',invalid:'交付检查失败',cancelled:'已取消'};
const entryStatus=e=>e.administrative_result?'已停止 · 按要求记0分':e.development?.status==='awaiting_service'?'等待接口恢复':e.skill_update?.status==='working'?'新增4技能中':e.skill_update?.status==='requested'?'已追加4技能要求':e.development?.status==='fixing'?'原模型修复中':e.development?.status==='needs_fix'?'等待技术修复':e.runtime?.status==='error'?'等待技术修复':e.status==='ready'&&!e.combat_verified?(e.skill_update?.status==='delivered'?'四技能版待试玩验证':'待战斗验证'):e.repair?.status==='repairing'?'原模型自修中':statuses[e.status]||e.status;
const rubric=[['impact','命中与打击反馈',35],['flow','动作衔接与操控',30],['rhythm','攻防节奏与重复乐趣',20],['destruction','肢体破坏与战斗作用',15]];
const api=async(url,options)=>{const r=await fetch(url,options),d=await r.json();if(!r.ok)throw Error(d.error||r.statusText);return d;};
const toast=text=>{$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3500);};
const author=e=>$('#blind').checked?e.id:e.model;
const entryUrl=(e,kind)=>`/api/runs/${runId}/entries/${encodeURIComponent(e.id)}/${kind}`;
function renderList(){
 const q=$('#search').value.trim().toLowerCase(),sort=$('#sort').value;
 let entries=run.entries.filter(e=>(e.id+' '+($('#blind').checked?'':e.model)).toLowerCase().includes(q));
 if(sort==='judge')entries.sort((a,b)=>(b.administrative_result?.total??b.grade?.total??-1)-(a.administrative_result?.total??a.grade?.total??-1)||a.id.localeCompare(b.id));
 if(sort==='human')entries.sort((a,b)=>(b.human?.score??-1)-(a.human?.score??-1)||a.id.localeCompare(b.id));
 $('#entries').replaceChildren();
 for(const e of entries){const b=el('button',undefined,'entry'+(e.id===selected?' selected':''));b.type='button';b.setAttribute('aria-label',`${author(e)}，${entryStatus(e)}`);b.setAttribute('aria-pressed',e.id===selected);b.dataset.entry=e.id;
 const num=el('span',e.id.split('-')[1],'number'),info=el('span',undefined,'entry-info');info.append(el('b',author(e)));const subtitle=el('small');subtitle.append(el('span',undefined,'state-dot '+(e.repair?.status==='repairing'?'building':e.status)),document.createTextNode(entryStatus(e)));if(e.grade)subtitle.append(document.createTextNode(' · 已评审'));info.append(subtitle);b.append(num,info,el('span',e.administrative_result?.total??e.grade?.total??'—','points'));b.onclick=()=>{selected=e.id;render();};$('#entries').append(b);}
}
function placeholder(title,description){const box=el('div');box.id='placeholder';box.append(el('span','✳','crosshair'),el('h3',title),el('p',description));$('#stage').replaceChildren(box);}
function renderGame(e){
 const signature=runId+':'+e.id+':'+e.status+':'+(e.repair?.status||'')+':'+(e.source_sha256||'');
 if(signature===loadedGame)return;
 loadedGame=signature;
 if(e.status==='ready'){const iframe=document.createElement('iframe');iframe.id='game';iframe.title=author(e)+' 战斗试玩';iframe.sandbox='allow-scripts';iframe.setAttribute('allow','autoplay');iframe.referrerPolicy='no-referrer';iframe.src=entryUrl(e,'game');$('#stage').replaceChildren(iframe);}
 else if(e.repair?.status==='repairing')placeholder('原作者正在修复交付。','模型正在根据自己的源码与错误反馈，完成可试玩的版本。');
 else if(e.status==='invalid'||e.status==='failed')placeholder('这份作品还无法开打。',e.error||'交付未完成。');
 else if(e.status==='cancelled')placeholder('本轮已取消。',run.cancellation_reason||'');
 else placeholder('好手感，正在酝酿。',e.status==='building'?'这个模型正在独立制作战斗场景。你可以先玩已经交付的作品。':'等待模型开始制作。作品交付后，这里会自动显示。');
}
function renderJudge(e){
 const box=$('#judge-content');box.replaceChildren();
 if(e.administrative_result){const total=el('div',undefined,'judge-total');total.append(el('b',String(e.administrative_result.total)),el('span','/ 100'));box.append(total,el('p',e.administrative_result.reason,'verdict'),el('p','用户指定的终止处置，不是 Opus 打击感评分。','judge-limit'));return;}
 if(run.grading_cancelled&&!e.grade){box.append(el('p','评分已按用户要求取消。保留可玩作品，不再启动裁判。','muted'));return;}
 if(run.state==='stopped'&&!e.grade){box.append(el('p','评审已按用户要求停止，未生成本版新评分。','muted'));return;}
 if(run.feature_request&&!e.grade&&e.skill_update?.status!=='delivered'){box.append(el('p','正在按用户最新需求新增 4 个自主设计的技能，完成实际试玩后重新评审。旧版本参考分保留在记录中。','muted'));return;}
 if(!e.grade){box.append(el('p',e.development?.status==='fixing'||e.development?.status==='needs_fix'?'技术问题交回原作者修复，不因此扣分。修好后重新试玩和评审。':!e.judge_eligible?'等待正常战斗与破坏效果验证；缺少有效交战材料不作低分处理。':e.judge_status==='awaiting_more_play'?'裁判请求补充游戏内的实际操作材料。':e.judge_status==='judging'?'Opus 正在评价最终战斗打击感。':e.judge_error?'裁判请求尚未完成，原始记录已保留。':'等待最终打击感评审，结果会直接公开。','muted'));return;}
 const g=e.grade,total=el('div',undefined,'judge-total');total.append(el('b',String(g.total)),el('span','/ 100'));box.append(total,el('p',g.verdict,'verdict'));
 for(const [key,label,max] of rubric){const row=el('div',undefined,'rubric-row'),l=el('label');l.append(el('span',label),el('span',`${g.scores[key]} / ${max}`));const track=el('i'),fill=el('b');fill.style.width=(100*g.scores[key]/max)+'%';track.append(fill);row.append(l,track);box.append(row);}
 for(const [key,title] of [['strengths','让人想继续打的地方'],['weaknesses','打断爽感的地方']]){if(!g[key]?.length)continue;box.append(el('h3',title));const ul=el('ul');g[key].forEach(t=>ul.append(el('li',t)));box.append(ul);}
 box.append(el('p',g.limitations||'源码与离散截图只能辅助推断，真实连续手感请上手确认。','judge-limit'));
}
function renderForm(e){
 const serialized=JSON.stringify(e.human||null),isNew=formEntry!==e.id;
 const dirty=$('#human-score').value!==String(e.human?.score??'')||$('#human-note').value!==(e.human?.note??'');
 if(isNew||(!dirty&&serialized!==formSaved)){$('#human-score').value=e.human?.score??'';$('#human-note').value=e.human?.note??'';formEntry=e.id;formSaved=serialized;$('#save-state').textContent=e.human?'已保存，可继续修改':'';}
 $('#save-score').disabled=e.status!=='ready';
}
function render(){
 if(!run)return;
 $('.notice span').textContent=run.grading_cancelled?'直接试玩':'只评打击感';
 $('.notice p').textContent=run.grading_cancelled?'四技能追加与自动评分已取消。已交付作品保留，尚未交付的模型只需完成首版。':'技术错误由原模型持续修复，修复次数与一次通过率不计分。正常战斗验证后，再由 Opus 5.5 评价最终打击感。';
 $('.list-foot').textContent=run.grading_cancelled?'作品交付后即可试玩；不再生成新评分。切换作品会重新开始战斗。':'作品交付后即可试玩，裁判评审陆续更新。切换作品会重新开始战斗。';
 const activeEntries=run.entries.filter(e=>!e.administrative_result),ready=activeEntries.filter(e=>e.status==='ready').length,judged=run.entries.filter(e=>e.grade).length,failed=run.entries.filter(e=>['invalid','failed'].includes(e.status)).length;
 $('#ready-count').replaceChildren(document.createTextNode(ready),el('span',` / ${activeEntries.length}`));$('#total').textContent=run.entries.length;$('#progress-track i').style.width=(ready/Math.max(1,activeEntries.length)*100)+'%';
 $('#round-status').textContent=`${run.grading_cancelled?'首版交付 · 四技能追加与评分已取消':run.state==='stopped'?'本轮已停止':run.feature_request?`新增四技能迭代 · 四技能版已交付 ${run.skill_delivered_count||0}/${run.entries.length}`:run.state==='superseded'?'旧 API 轮次已归档':run.verified_count>=run.entries.length?'战斗验证已完成':ready===run.entries.length?'项目已全部交付，试玩验证中':'制作与验证中'} · 战斗已验证 ${run.verified_count||0} 份 · ${run.grading_cancelled?'历史评分':'最终评审'} ${judged} 份`;
 $('#run-id').textContent=run.id;$('#prompt').textContent=run.prompt;const budget=run.invocation_method==='claude-code-cli'?`真正 Claude Code 独立项目；统一 high；${run.parameters.concurrency} 个模型并行，不设置输出额度、开发总时长或工具轮数上限。`:run.parameters.deadline_seconds===null?`每次先申请 ${run.parameters.max_tokens.toLocaleString()} tokens，接口如有更低硬上限则按实际限制请求，触顶自动续写；不设本地总输出或总时长上限。`:`单次 ${run.parameters.max_tokens} tokens、最长 ${run.parameters.deadline_seconds/60} 分钟。`;$('#rules').textContent=budget+`${run.invocation_method==='claude-code-cli'?'每个模型拥有文件与命令工具及隔离工作区；':'初始制作 4 路并发；'}技术问题由原模型持续修复，不设修复轮数上限。修复次数与一次通过率不计分；仅评价正常可玩版本的打击感。有效作品不手工改写、不换作者、不择优。只记录最终作品和调用元数据，作品各自隔离。${run.grading_cancelled?'自动评分已取消，既有评分仅作历史记录。':'裁判直接公开，个人分数独立保存。'}`+(run.budget_history?.length?' 本轮按用户要求中途放宽预算；已完成作品保留，原始参数与变更时间已存档。':'');
 if(!selected||!run.entries.some(e=>e.id===selected))selected=(run.entries.find(e=>e.status==='ready')||run.entries[0]).id;
 const e=run.entries.find(e=>e.id===selected);renderList();$('#entry-tag').textContent=e.id+' / COMBAT PROTOTYPE';$('#author').textContent=author(e);$('#entry-status').textContent=entryStatus(e);
 renderGame(e);renderJudge(e);renderForm(e);
 $('#reload').disabled=$('#fullscreen').disabled=e.status!=='ready';$('#download').hidden=!e.writer;$('#download').href=entryUrl(e,'source');
 $('#delivery-content').textContent=[`状态：${entryStatus(e)}`,run.invocation_method==='claude-code-cli'?'调用：Claude Code CLI · high · 独立项目': '调用：直接 API（历史轮次）',e.skill_update?`四技能追加：${e.skill_update.status}`:'',...(e.skill_update?.manifest?.skills||[]).map(s=>`${s.name} · ${s.controls} · ${s.description}`),e.code_lines!==undefined?`源码与配置文本行数：${e.code_lines}（含 JSON 与打包文件；最终代码规模报告会分列）`:'',e.repaired?'原模型自修后交付，初始版本与记录均已保留。':'',e.writer?`${e.writer.invocation_method==='claude-code-cli'?'最后一次 Claude Code 会话用时':'用时'}：${e.writer.elapsed_seconds} 秒 · 输出：${e.writer.output_tokens} tokens · 完成原因：${e.writer.stop_reason}`:'尚未返回完整作品。',e.validation?'内联脚本语法检查通过；运行与手感仍需要实际试玩。':'',e.capture?`已存档 ${e.capture.screenshots?.length||0} 张试玩截图；${e.capture.note||''}`:'尚未存档试玩截图。',e.runtime?.status==='error'?'浏览器运行异常：'+(e.runtime.errors||[]).map(x=>typeof x==='string'?x:x.message).join('\n'):'',e.error?'交付问题：'+e.error:'',e.judge_error?'裁判问题：'+e.judge_error:''].filter(Boolean).join('\n');
}
async function refresh(){if(busy)return;busy=true;try{run=await api('/api/runs/'+runId);render();}catch(e){toast(e.message);}finally{busy=false;}}
$('#blind').onchange=()=>render();$('#search').oninput=()=>renderList();$('#sort').onchange=()=>renderList();
$('#reload').onclick=()=>{loadedGame='';renderGame(run.entries.find(e=>e.id===selected));};
$('#fullscreen').onclick=()=>$('#stage').requestFullscreen().catch(e=>toast(e.message));
$('#brief-toggle').onclick=()=>{$('#brief').classList.toggle('open');$('#brief').open=$('#brief').classList.contains('open');};
$('#runs').onchange=async()=>{runId=$('#runs').value;selected=null;loadedGame='';history.replaceState({},'',`?run=${runId}`);await refresh();};
$('#human-form').onsubmit=async event=>{event.preventDefault();const raw=$('#human-score').value;if(raw.trim()==='')return;const score=Number(raw);if(!Number.isInteger(score)||score<0||score>100)return toast('请输入 0～100 的整数分数');$('#save-score').disabled=true;try{run=await api(`/api/runs/${runId}/human-grade`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry_id:selected,score,note:$('#human-note').value})});formEntry='';render();toast('已保存你的试玩评分');}catch(e){toast(e.message);$('#save-score').disabled=false;}};
(async()=>{try{const runs=await api('/api/runs');for(const r of runs){if(r.state==='cancelled')continue;const option=el('option',`${r.title} · ${r.total} 个模型`);option.value=r.id;$('#runs').append(option);}runId=runId||runs.find(r=>r.state!=='cancelled')?.id;if(!runId)return toast('还没有评测');$('#runs').value=runId;await refresh();setInterval(refresh,4000);}catch(e){toast(e.message);}})();
