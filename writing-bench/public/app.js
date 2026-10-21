'use strict';
// The live judge worker remains on its original port; the reader uses the
// server-side human-first API. This redirect exposes no results.
if(['8800','8801','8802','8803'].includes(location.port))location.replace('http://127.0.0.1:8804/'+location.search);
const $ = s => document.querySelector(s);
const labels = {queued:'等待创作',writing:'创作中',written:'待评审',judging:'评审中',scored:'已评分',writer_failed:'创作失败',render_failed:'图像未完成',judge_failed:'评审失败'};
const states = {queued:'排队中',writing:'正在创作',judging:'匿名评审',complete:'本轮已完成',complete_with_errors:'部分未完成',error:'运行中断'};
let config, run, selected, runId = new URL(location.href).searchParams.get('run'), blind = true, fingerprint = '', busy = false, humanEntry = '', humanSaved = '', rubricSignature = '';
let visibilityRun = '';
const node = (tag, cls, text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
async function api(url, options){const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw Error(result.error||response.statusText);if(Array.isArray(result.entries)&&!result.human_first){for(const e of result.entries){delete e.grade;delete e.judge;}}return result;}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,4500);}
function modelName(entry){return blind?entry.id:entry.model;}
function deliveryMessage(entry){
  if(entry.render_status==='failed'&&!/<svg\b/i.test(entry.failed_submission||'')&&/无法查看或处理附带的参考图片|不具备多模态|没有多模态|cannot (?:see|view|process) the (?:reference )?image/i.test(entry.failed_submission||''))return '模型回复称无法读取参考图片，未提交 SVG。本项保留原始回复，不参与作品评分。';
  if(entry.render_error)return 'SVG 未完成或无法渲染：'+entry.render_error+'。原始返回已保留，本项不计作品分数。';
  if(entry.status==='writer_failed'){
    if(entry.vision_unsupported)return '该模型接口明确拒绝图片输入，未参与本题仿绘。不用文字描述替代参考图，本项未评分。';
    if(/timed?\s*out|timeout/i.test(entry.writer_error||''))return '模型接口超时，未收到可展示的 SVG。本项未评分，可以稍后重试。';
    if(/empty text/i.test(entry.writer_error||''))return '模型返回了空内容，尚未交出可展示的 SVG。本项未评分。';
    return '本次接口调用未成功交付 SVG。本项未评分，可以稍后重试。';
  }
  return '作品正在生成，完成后会显示在这里。';
}
function sortedEntries(){return [...run.entries].sort((a,b)=>(run.ranking_unlocked?(b.grade?.total??-1)-(a.grade?.total??-1):0)||a.id.localeCompare(b.id));}
function renderList(){
  const list=$('#entries'), scroll=list.scrollTop, query=$('#search').value.trim().toLowerCase();list.replaceChildren();
  let last,rank=0,number=0;
  for(const entry of sortedEntries()){
    if(run.ranking_unlocked&&entry.grade){number++;if(entry.grade.total!==last)rank=number;last=entry.grade.total;}
    if(!(modelName(entry)+' '+entry.id).toLowerCase().includes(query))continue;
    const shownScore=run.ranking_unlocked?entry.grade?.total:entry.human?.score;
    const progress=entry.revealed?'已揭晓':entry.human?'我已评分 · 待揭晓':entry.render_status==='failed'?'图像未完成':entry.text?'待我评分':entry.status==='writer_failed'?'尚未交付':'创作中';
    const button=node('button','entry'+(entry.id===selected?' selected':''));button.type='button';button.setAttribute('aria-label',modelName(entry)+'，'+progress);button.setAttribute('aria-pressed',String(entry.id===selected));
    button.append(node('span','rank',run.ranking_unlocked&&entry.grade?String(rank).padStart(2,'0'):'·'));
    const name=node('span');name.append(node('span','entry-name',modelName(entry)),node('span','entry-sub',(blind?'':entry.id+' · ')+progress));button.append(name,node('span','entry-score'+(shownScore!==undefined?'':' pending'),shownScore??'—'));
    button.onclick=()=>{selected=entry.id;renderList();renderReader();};list.append(button);
  }
  if(!list.children.length)list.append(node('p','no-matches','没有匹配的作品'));
  list.scrollTop=scroll;
}
function section(title,items){const s=node('section','review-section');s.append(node('h3','',title));const ul=node('ul');for(const item of items)ul.append(node('li','',item));s.append(ul);return s;}
function renderReader(){
  const entry=run.entries.find(e=>e.id===selected);if(!entry)return;
  const isSvg=run.kind==='svg';
  const canScore=Boolean(entry.text)&&(!isSvg||entry.render_status==='ready');
  const saved=JSON.stringify(entry.human);
  if(humanEntry!==entry.id||humanSaved!==saved){$('#human-score').value=entry.human?.score??'';$('#human-note').value=entry.human?.note??'';humanEntry=entry.id;humanSaved=saved;}
  $('#human-score').disabled=entry.revealed||!canScore;$('#human-note').disabled=entry.revealed||!canScore;$('#save-human').disabled=entry.revealed||!canScore;
  $('#save-human').textContent=entry.revealed?(entry.human?'我的分数已锁定':'本轮已直接揭晓'):entry.human?'更新我的分数':'提交我的分数';
  $('#human-form').hidden=Boolean(run.direct_reveal&&!entry.human);
  $('#human-hint').textContent=!canScore&&isSvg?'图片完成后才能评分，未完成交付不需要你给空白图打分。':entry.revealed?'已揭晓，保留你的首次独立判断。':entry.human?'已保存。你可以继续盲读下一篇，也可以揭晓这一篇。':'先按自己的感受判断，不用猜裁判会给几分。';
  $('#reveal-entry').disabled=!entry.human||entry.status!=='scored'||entry.revealed;
  $('#reveal-entry').textContent=entry.revealed?'本篇已揭晓':!canScore&&isSvg?'本项没有可评分图像':!entry.human?'提交分数后可揭晓本篇':entry.status==='judge_failed'?'裁判未完成，本篇暂不可揭晓':entry.status!=='scored'?'裁判还在评审':'揭晓这篇的裁判评分';
  const signature=JSON.stringify([run.id,entry,blind]);if(signature===fingerprint)return;fingerprint=signature;
  $('#entry-id').textContent=entry.id+(isSvg?' / ORIGINAL SVG':' / ORIGINAL TEXT');$('#author').textContent=modelName(entry);
  $('#wordcount').textContent=isSvg?(entry.render_status==='ready'?entry.render.width+' × '+entry.render.height+' · SVG':entry.status.endsWith('failed')?'未完成 SVG 交付':'等待图像'):entry.text?entry.chars+' 字符 · 含标点':'';
  $('#visual-artwork').hidden=!isSvg;$('#original').hidden=isSvg;
  if(isSvg){
    const reference=Boolean(run.reference),referenceUrl='/api/runs/'+run.id+'/reference';
    $('#reference-figure').hidden=!reference;$('#copy-label').hidden=!reference;$('#image-pair').classList.toggle('has-reference',reference);
    if(reference){$('#reference-image').src=referenceUrl;$('#reference-open').href=referenceUrl;}
    const ready=entry.render_status==='ready',base='/api/runs/'+run.id+'/entries/'+encodeURIComponent(entry.id);
    $('#artwork-large').hidden=!ready;$('#artwork-open').hidden=!ready;$('#artwork-download').hidden=!ready;
    if(ready){$('#artwork-image').src=base+'/preview.png';$('#artwork-image').alt=entry.id+' · SVG 作品';$('#artwork-large').href=base+'/preview.png';$('#artwork-open').href=base+'/preview.png';$('#artwork-download').href=base+'/artwork.svg';}
    $('#render-error').hidden=ready;$('#render-error').textContent=deliveryMessage(entry);$('#svg-source').textContent=entry.text||entry.failed_submission||'';
  }
  $('#original').textContent=entry.text||entry.writer_error||'这位作者还在准备作品。';$('#original').classList.toggle('empty',!entry.text);
  $('#receipt').textContent=entry.writer?`${isSvg?(entry.render_status==='ready'?'原始 SVG 的统一渲染，与裁判看的是同一张图。':'原始返回已保留，未形成可展示的图像。'):'原始输出，未经人工改写。'}用时 ${entry.writer.elapsed_seconds} 秒 · 输出 ${entry.writer.output_tokens} tokens。${entry.truncated?'输出触及上限，作品可能截断。':''}${blind?'':`请求模型：${entry.model}；接口回报：${entry.writer.response_model||'未提供'}。`}`:'所有作者使用同一题目。';
  const review=$('#review-content');review.replaceChildren();
  if(!blind&&entry.judge_is_same_model)review.append(node('p','self-note','同模型自评：这份作品也出自 Opus 5.5。评分时仍未向裁判提供作者身份。'));
  if(!entry.grade){review.append(node('p','locked-grade',entry.status==='judge_failed'?'裁判本次评审未完成，目前没有可揭晓的结果。你的个人评分会独立保留。':entry.human?'你的分数已保存。裁判评分仍封存，点击上方“揭晓”后才会显示。':'裁判评分、评语和总榜都已封存。先看完作品，提交你自己的 0～100 分评价。'));return;}
  if(entry.human)review.append(node('p','my-score-comparison','你的评分：'+entry.human.score+' / 100'));
  const grade=entry.grade,total=node('div','total-score');total.append(node('strong','',grade.total),node('span','','/ 100'));review.append(total,node('p','verdict',grade.verdict));
  const bars=node('div');for(const r of run.rubric){const row=node('div','score-row'),label=node('div','score-label');label.append(node('span','',r.label),node('span','',grade.scores[r.key]+' / '+r.max));const bar=node('div','bar'),fill=node('i');fill.style.width=(grade.scores[r.key]/r.max*100)+'%';bar.append(fill);row.append(label,bar);bars.append(row);}review.append(bars);
  review.append(section(isSvg?'画面亮点':'写得好的地方',grade.strengths),section('还差在哪里',grade.weaknesses));
  if(isSvg){if(grade.uncertainties?.length)review.append(section('观察中的不确定性',grade.uncertainties));}
  else review.append(section('AI 味观察',grade.ai_tells.length?grade.ai_tells:['裁判未列出明显模板痕迹。']));
  const evidence=node('section','review-section');evidence.append(node('h3','',isSvg?'画面依据':'回到原句'));for(const e of (isSvg?grade.observations:grade.evidence)){const item=node('div','evidence');item.append(node('blockquote','',isSvg?e.region:e.quote),node('p','',e.comment));evidence.append(item);}review.append(evidence);
}
function render(){
  if(visibilityRun!==run.id){visibilityRun=run.id;blind=!run.ranking_unlocked;$('#blind').checked=blind;}
  $('#title').textContent=run.title;$('#prompt').textContent=run.prompt;$('#state').textContent=states[run.state]||run.state;
  $('.lead').textContent=run.ranking_unlocked?'评分已揭晓。查看总榜，也可以逐篇阅读裁判评语。':'先看作品，再看分数。你的判断，值得独立保留。';
  $('.blind-banner strong').textContent=run.ranking_unlocked?'本轮评分已全部揭晓。':'你先读，你先打分。';
  $('.blind-banner span').textContent=run.direct_reveal?'按你的要求直接公开裁判评分与总榜；此前的个人评分原样保留。':run.ranking_unlocked?'你的独立评分已保留，可逐篇对照裁判的判断。':'提交某篇的分数后，可选择揭晓这篇；所有作品都打完分后，再揭晓总榜。裁判评分和评语现已封存。';
  $('.aside-note').textContent=run.ranking_unlocked?'按裁判总分排序，同分并列。点击作品查看分项评分和评语。':'揭晓总榜前，始终按随机稿号排列，不根据裁判分数排序。';
  $('#next-entry').hidden=run.ranking_unlocked;
  $('#category').textContent=run.reference?'第三题 · SVG 参考图仿绘':run.kind==='svg'?'第二类 · SVG 视觉创作':'第一类 · 故事与对白';
  $('#method-note').textContent=run.reference?'所有模型收到同一张参考原图，只能提交纯 SVG，不提供生图工具。裁判对照原图与同一份渲染图评分。每模型一次作品，结果只代表本轮表现。':run.kind==='svg'?'本题没有唯一标准答案。不同画风与视觉解法都可以成立；单次作品和裁判偏好都会影响评分，结果不代表模型的整体能力。':'这是一场创作试读，不是模型能力的最终排名。单次样本与裁判偏好都会影响结果。“AI 味”是文体体验，不是 AI 来源鉴定。';
  const written=run.entries.filter(e=>e.text&&(run.kind!=='svg'||e.render_status==='ready')).length,scored=run.entries.filter(e=>e.status==='scored').length,failed=run.entries.filter(e=>e.status.endsWith('failed')).length;
  $('#progress').textContent=`${written} / ${run.entries.length} 份作品 · 我已评 ${run.human_count||0} 份 · 裁判${run.ranking_unlocked?'已揭晓':'已封存'} ${scored} 份${failed?' · '+failed+' 份未完成':''}`;$('#count').textContent=run.entries.length+' 份';$('#run-id').textContent=run.id;
  $('#human-progress').textContent=(run.human_count||0)+' / '+written;$('#score-label').textContent=run.ranking_unlocked?'裁判得分':'我的评分';
  const judgeReady=run.entries.filter(e=>e.text).every(e=>e.status==='scored');
  $('#export').href='/api/runs/'+run.id+'/report';$('#export').hidden=!run.ranking_unlocked;$('#reveal-all').disabled=!run.all_human_scored||run.ranking_unlocked||!judgeReady;$('#reveal-all').textContent=run.ranking_unlocked?'总榜已揭晓':run.all_human_scored&&!judgeReady?'等待裁判补齐评分':run.all_human_scored?'揭晓全场评分与总榜':written>0&&(run.human_count||0)>=written?'等待本轮完成后揭晓总榜':'全部打分后揭晓总榜';
  $('#resume').hidden=!['error','complete_with_errors'].includes(run.state);$('#new-run').disabled=['queued','writing','judging'].includes(run.state);
  const rubric=$('#rubric'),rubricKey=JSON.stringify(run.rubric);if(rubricSignature!==rubricKey){rubric.replaceChildren();rubricSignature=rubricKey;for(const r of run.rubric){const item=node('div','rubric-item');item.title=r.description;item.append(node('strong','',r.max),node('span','',r.label));rubric.append(item);}}
  if(!selected||!run.entries.some(e=>e.id===selected))selected=sortedEntries().find(e=>e.text)?.id||run.entries[0]?.id;
  renderList();renderReader();
}
async function refreshRuns(){const runs=await api('/api/runs');$('#runs').replaceChildren();for(const r of runs){const option=node('option','',r.title+' · '+r.scored+'/'+r.total);option.value=r.id;$('#runs').append(option);}if(!runId)runId=runs[0]?.id;if(runId)$('#runs').value=runId;return runs;}
async function refresh(){if(busy)return;busy=true;try{await refreshRuns();if(runId){run=await api('/api/runs/'+runId);render();}}catch(error){$('#state').textContent='连接中断';$('#progress').textContent=error.message;}finally{busy=false;}}
$('#runs').onchange=async()=>{runId=$('#runs').value;selected=null;fingerprint='';history.replaceState({},'', '?run='+runId);await refresh();};
$('#search').oninput=()=>run&&renderList();$('#blind').onchange=()=>{blind=$('#blind').checked;$('#search').value='';renderList();renderReader();};
$('#new-run').onclick=()=>$('#compose').showModal();$('#close-dialog').onclick=()=>$('#compose').close();
function selectedModels(){return [...document.querySelectorAll('#model-options input:checked')].map(el=>el.value);}
function countModels(){$('#selected-count').textContent='· '+selectedModels().length+' 个';}
$('#select-all').onclick=()=>{const all=[...document.querySelectorAll('#model-options input')],check=all.some(x=>!x.checked);all.forEach(x=>x.checked=check);countModels();};
$('#compose-form').onsubmit=async event=>{event.preventDefault();$('#submit-run').disabled=true;$('#form-error').textContent='';try{const result=await api('/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:$('#new-title').value,prompt:$('#new-prompt').value,models:selectedModels(),kind:$('#new-kind').value})});runId=result.id;selected=null;fingerprint='';history.replaceState({},'','?run='+runId);$('#compose').close();await refresh();toast('新一轮已开始，可以在这里看进度。');}catch(error){$('#form-error').textContent=error.message;}finally{$('#submit-run').disabled=false;}};
$('#new-kind').onchange=()=>{const profile=config.profiles?.[$('#new-kind').value];if(profile){$('#new-prompt').value=profile.prompt;$('#new-title').value=$('#new-kind').value==='svg'?'恐龙倒立骑自行车 · SVG 开放创作':'旅店等晚饭 · JRPG 队伍闲聊';$('#profile-note').textContent=$('#new-kind').value==='svg'?'Opus 5.5 根据实际图片评分。题意 30、比例 25、画面 30、创意 15。每模型一件 SVG，输出上限 12000 tokens；你先打分，再揭晓。':'自然度 50、人物 20、趣味 20、契合 10。每模型一份作品，输出上限 6144 tokens；你先打分，再揭晓。';}};
$('#resume').onclick=async()=>{try{await api('/api/runs/'+runId+'/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});await refresh();}catch(error){toast(error.message);}};
async function humanAction(action,body){run=await api('/api/runs/'+runId+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});render();}
$('#human-form').onsubmit=async event=>{event.preventDefault();const raw=$('#human-score').value;if(raw==='')return;const score=Number(raw);if(!Number.isInteger(score)||score<0||score>100){toast('请输入 0～100 的整数');return;}try{await humanAction('human-grade',{entry_id:selected,score,note:$('#human-note').value});toast('你的分数已保存，裁判评分仍未揭晓。');}catch(error){toast(error.message);}};
$('#reveal-entry').onclick=async()=>{try{await humanAction('reveal',{entry_id:selected});}catch(error){toast(error.message);}};
$('#reveal-all').onclick=async()=>{try{await humanAction('reveal',{});}catch(error){toast(error.message);}};
$('#next-entry').onclick=()=>{const entries=sortedEntries(),index=entries.findIndex(e=>e.id===selected),next=[...entries.slice(index+1),...entries.slice(0,index)].find(e=>e.text&&!e.human&&(run.kind!=='svg'||e.render_status==='ready'));if(next){selected=next.id;renderList();renderReader();}else toast('没有其他未评分的作品了。');};
async function init(){try{config=await api('/api/config');$('#new-prompt').value=config.default_prompt;for(const model of config.models){const label=node('label'),input=node('input');input.type='checkbox';input.value=model;input.checked=true;input.onchange=countModels;label.append(input,document.createTextNode(model));$('#model-options').append(label);}countModels();await refresh();setInterval(refresh,3000);}catch(error){toast(error.message);}}
async function renderOriginal(){
  const parameters=new URL(location.href).searchParams,entryId=parameters.get('render');
  const data=await api('/api/runs/'+parameters.get('run')),entry=data.entries.find(e=>e.id===entryId);
  if(!entry||entry.render_status!=='ready')throw Error('Artwork is not ready');
  const raw=entry.text,start=raw.search(/<svg\b/i),ends=[...raw.matchAll(/<\/svg\s*>/gi)],end=ends[ends.length-1];
  const source=raw.slice(start,end.index+end[0].length),bytes=new TextEncoder().encode(source);
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const image=node('img','render-surface');image.alt=entry.id;image.width=entry.render.width;image.height=entry.render.height;image.src='data:image/svg+xml;base64,'+btoa(binary);
  document.body.className='render-mode';document.body.replaceChildren(image);
}
if(new URL(location.href).searchParams.has('render'))renderOriginal().catch(e=>{document.body.textContent=e.message;});else init();
