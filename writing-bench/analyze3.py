# -*- coding: utf-8 -*-
import json, re, itertools, difflib
d = json.load(open('novel-runs/novel-20261030-201019-ef826a/run.json', encoding='utf-8'))
E = [e for e in d['entries'] if e.get('text')]
def clean(t): return re.sub(r'\s+', '', t)
rep = []

# 排除“分钟”后的“钟”
own = []
for e in E:
    t = clean(e['text'])
    stripped = t.replace('分钟', '').replace('钟头', '').replace('点钟', '')
    if '钟' in stripped: own.append(e['model'])
rep.append(f'“钟”排除分钟/钟头/点钟后：{len(own)}/18 — ' + '、'.join(own))

# 十七分 巧合
rep.append('')
rep.append('“十七分”开篇：' + '、'.join(
    e['model'] for e in E if re.search(r'(一点|两点|三点)十七分', clean(e['text'])[:200])))

# 逐句重合检测：找任意 ≥12 字的完全相同的句子片段
rep.append('')
rep.append('# ≥12 字完全相同片段（若有则说明存在复制/蒸馏痕迹）')
hits = 0
for a, b in itertools.combinations(E, 2):
    ta = set(clean(a['text'])[i:i+12] for i in range(len(clean(a['text']))-12))
    tb = set(clean(b['text'])[i:i+12] for i in range(len(clean(b['text']))-12))
    common = ta & tb
    if common:
        hits += 1
        rep.append(f'  {a["model"]} ↔ {b["model"]}: {len(common)} 处，例如 {list(common)[0]}')
rep.append(f'  共 {hits} 对存在 12 字以上重合')

# 5-gram 词汇集 Jaccard（衡量风格接近而非抄袭）
rep.append('')
rep.append('# 5-gram Jaccard 前 8（风格接近度）')
def grams(t): return set(t[i:i+5] for i in range(len(t)-5))
gs = {e['model']: grams(clean(e['text'])) for e in E}
pairs = []
for a, b in itertools.combinations(gs, 2):
    j = len(gs[a] & gs[b]) / len(gs[a] | gs[b])
    pairs.append((j, a, b))
pairs.sort(reverse=True)
for j, a, b in pairs[:8]:
    rep.append(f'  {j:.4f}  {a} ↔ {b}')

open('similarity-report-3.md', 'w', encoding='utf-8').write('\n'.join(rep))
print('ok')
