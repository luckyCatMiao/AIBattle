const $ = s => document.querySelector(s);
const esc = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
let run = null, runId = new URL(location.href).searchParams.get('run'), selected = null;

function toast(m){ const t=$('#toast'); t.textContent=m; t.hidden=false; setTimeout(()=>t.hidden=true,3200); }

async function api(u){ const r = await fetch(u); const j = await r.json(); if(!r.ok) throw Error(j.error || r.statusText); return j; }

function renderList(){
  const nav = $('#list'); nav.replaceChildren();
  if(!run) return;
  const ready = run.entries.filter(e => e.text);
  nav.append(Object.assign(document.createElement('div'), {className:'grp', textContent:`${ready.length} 篇 · 无评分`}));
  for(const e of ready){
    const a = document.createElement('a');
    a.href = '#' + encodeURIComponent(e.id);
    a.dataset.id = e.id;
    if(e.id === selected) a.className = 'active';
    a.innerHTML = `<span>${esc(e.id)}</span><span class="m">${esc(e.model)}</span>`;
    a.onclick = ev => { ev.preventDefault(); selected = e.id; renderList(); renderReader(); };
    nav.append(a);
  }
  for(const e of run.entries.filter(x => !x.text)){
    const a = document.createElement('a');
    a.style.opacity = .4;
    a.innerHTML = `<span>${esc(e.id)}</span><span class="m">${esc(e.model)}</span>`;
    a.title = e.last_error || '未交付';
    a.onclick = ev => { ev.preventDefault(); selected = e.id; renderList(); renderReader(); };
    nav.append(a);
  }
}

function renderReader(){
  const main = $('#main');
  const e = run?.entries.find(x => x.id === selected);
  if(!e){ main.innerHTML = '<p class="empty">选择一篇开始阅读。</p>'; return; }
  if(!e.text){
    main.innerHTML = `<article><header><span class="id">${esc(e.id)}</span><span class="model">${esc(e.model)}</span></header>
      <p class="missing">未交付：${esc(e.last_error || e.status)}</p></article>`;
    return;
  }
  const w = e.writer || {};
  const body = e.text.split('\n').map(p => p.trim()).filter(Boolean).map(p => {
    if(p.startsWith('#')) return `<h3>${esc(p.replace(/^#+\s*/, ''))}</h3>`;
    if(/^《.*》$/.test(p) && p.length < 40) return `<h3>${esc(p)}</h3>`;
    return `<p>${esc(p)}</p>`;
  }).join('');
  main.innerHTML = `<article>
    <header><span class="id">${esc(e.id)}</span><span class="model">${esc(e.model)}</span>
    <span class="meta">${e.chars} 字 · ${w.elapsed_seconds ?? '?'}s · ${w.output_tokens ?? '?'} tok</span></header>
    <div class="body">${body}</div></article>`;
  window.scrollTo({top:0, behavior:'smooth'});
}

function step(dir){
  const ready = run.entries.filter(e => e.text);
  const i = ready.findIndex(e => e.id === selected);
  if(i < 0) { if(ready[0]) { selected = ready[0].id; renderList(); renderReader(); } return; }
  const n = ready[(i + dir + ready.length) % ready.length];
  selected = n.id; renderList(); renderReader();
}

async function loadRuns(){
  const runs = await api('/api/novel/runs');
  const sel = $('#runs'); sel.replaceChildren();
  for(const r of runs){
    const o = document.createElement('option');
    o.value = r.id; o.textContent = `${r.title} · ${r.ready}/${r.total}`;
    sel.append(o);
  }
  if(!runId) runId = runs[0]?.id;
  if(runId) sel.value = runId;
  return runs;
}

async function refresh(){
  if(!runId) return;
  run = await api('/api/novel/runs/' + runId);
  $('#stat').textContent = `${run.entries.filter(e => e.text).length} / ${run.entries.length} 篇 · ${run.state}`;
  if(!selected) selected = run.entries.find(e => e.text)?.id || null;
  renderList(); renderReader();
}

$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);
$('#runs').onchange = async () => {
  runId = $('#runs').value; selected = null;
  history.replaceState({}, '', '?run=' + runId);
  await refresh();
};
document.addEventListener('keydown', ev => {
  if(ev.target.tagName === 'SELECT' || ev.target.tagName === 'INPUT') return;
  if(ev.key === 'ArrowLeft') step(-1);
  if(ev.key === 'ArrowRight') step(1);
});

(async () => {
  try {
    await loadRuns();
    await refresh();
  } catch(err){ toast(err.message); }
})();
