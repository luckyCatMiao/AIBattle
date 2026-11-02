# -*- coding: utf-8 -*-
import json, re, collections, itertools, difflib

d = json.load(open('novel-runs/novel-20261030-201019-ef826a/run.json', encoding='utf-8'))
E = [e for e in d['entries'] if e.get('text')]

def clean(t): return re.sub(r'\s+', '', t)

report = []
bucket = collections.defaultdict(list)
for e in E:
    hm = clean(e['text'])[:600]
    if re.search(r'凌晨|半夜|深夜|三点|四点|夜里|深夜', hm): bucket['深夜/凌晨'].append(e['model'])
    if re.search(r'废墟|残破|断壁|塌|荒芜|荒凉', hm): bucket['废墟/荒凉'].append(e['model'])
    if re.search(r'醒来|睁开眼|另一个世界|异世界|穿越', hm): bucket['醒来/穿越'].append(e['model'])
    if re.search(r'博物馆|修复|文物|档案|研究|标本|整理|库房|卷宗|挖掘|出土', hm): bucket['档案/修复/研究'].append(e['model'])
    if re.search(r'刀|剑|术|法|咒|纹|符', hm): bucket['刀剑/魔法符号'].append(e['model'])
    if re.search(r'少女|女孩|少年', hm): bucket['少年/少女同伴'].append(e['model'])

report.append('# 开篇 600 字场景元素命中（18 篇）')
for k, v in sorted(bucket.items(), key=lambda x: -len(x[1])):
    report.append(f'{k}：{len(v)}/18 — ' + '、'.join(v))

# 头 300 字两两相似度
report.append('')
report.append('# 开篇 300 字两两相似度（difflib，最高 15 对）')
pairs = []
for a, b in itertools.combinations(E, 2):
    ha, hb = clean(a['text'])[:300], clean(b['text'])[:300]
    r = difflib.SequenceMatcher(None, ha, hb).ratio()
    pairs.append((r, a['model'], b['model']))
pairs.sort(reverse=True)
for r, a, b in pairs[:15]:
    report.append(f'  {r:.3f}  {a} ↔ {b}')
avg = sum(p[0] for p in pairs) / len(pairs)
report.append(f'  平均相似度 {avg:.3f}')

# 标题
report.append('')
report.append('# 各篇标题 / 第一章标题')
for e in E:
    lines = [l.strip() for l in e['text'].split('\n') if l.strip()][:4]
    report.append(f'  {e["model"]:22s} | ' + ' ¦ '.join(lines))
open('similarity-report.md', 'w', encoding='utf-8').write('\n'.join(report))
print('OK')
