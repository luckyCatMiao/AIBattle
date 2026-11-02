# -*- coding: utf-8 -*-
import json, re, itertools, difflib, collections
d = json.load(open('novel-runs/novel-20261101-175830-986783/run.json', encoding='utf-8'))
E = [e for e in d['entries'] if e.get('text')]
def clean(t): return re.sub(r'\s+', '', t)
rep = []
rep.append(f'# 斗破续写 · {len(E)} 篇')

# 是否引用原著人物
names = ['萧炎','美杜莎','萧薰儿','药老','小医仙','紫研','海波东','云韵','纳兰嫣然','魂殿','异火','迦南']
rep.append('')
rep.append('# 原著元素引用')
for n in names:
    who = [e['model'] for e in E if n in e['text']]
    if who: rep.append(f'  {n}: {len(who)}/19 — ' + '、'.join(who))

# 时间/开篇范式（对比上一轮）
rep.append('')
rep.append('# 开篇 300 字')
for e in E:
    head = clean(e['text'])[:130]
    rep.append(f'  {e["model"]:22s} | {head}')

# 同质化指标
rep.append('')
rep.append('# 与上一轮对比的同质化指标')
late = sum(1 for e in E if re.search(r'凌晨|半夜|深夜|夜里', clean(e['text'])[:600]))
iq = sum(1 for e in E if re.search(r'博物馆|修复|档案|考古|拓碑|库房|出土', clean(e['text'])[:600]))
rep.append(f'  深夜开篇: {late}/19（上一轮 10/18）')
rep.append(f'  文博/修复职业开篇: {iq}/19（上一轮 3/18）')

# 5-gram Jaccard
def grams(t): return set(t[i:i+5] for i in range(len(t)-5))
gs = {e['model']: grams(clean(e['text'])) for e in E}
pairs = sorted(((len(gs[a]&gs[b])/len(gs[a]|gs[b]), a, b) for a,b in itertools.combinations(gs,2)), reverse=True)
rep.append('')
rep.append('  5-gram Jaccard 前 5:')
for j,a,b in pairs[:5]: rep.append(f'    {j:.4f}  {a} ↔ {b}')
rep.append(f'    平均 {sum(p[0] for p in pairs)/len(pairs):.4f}（上一轮 0.045 的 difflib 300字口径不同，仅看相对）')

# 逐字重合
hits=[]
for a,b in itertools.combinations(E,2):
    ta=set(clean(a['text'])[i:i+14] for i in range(len(clean(a['text']))-14))
    tb=set(clean(b['text'])[i:i+14] for i in range(len(clean(b['text']))-14))
    c=ta&tb
    if c: hits.append((len(c),a['model'],b['model'],list(c)[0]))
rep.append('')
rep.append('# ≥14 字完全相同片段')
for n,a,b,s in sorted(hits,reverse=True)[:8]:
    rep.append(f'  {n} 处 {a} ↔ {b} | 例: {s}')
if not hits: rep.append('  无')

# 篇幅
rep.append('')
rep.append('# 篇幅')
for e in sorted(E,key=lambda x:-x['chars']):
    rep.append(f'  {e["chars"]:5d}字  {e["model"]}')
open('doupo-analysis.md','w',encoding='utf-8').write('\n'.join(rep))
print('ok')
