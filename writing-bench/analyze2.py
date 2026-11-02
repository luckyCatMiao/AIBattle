# -*- coding: utf-8 -*-
import json, re
d = json.load(open('novel-runs/novel-20261030-201019-ef826a/run.json', encoding='utf-8'))
E = [e for e in d['entries'] if e.get('text')]
def clean(t): return re.sub(r'\s+', '', t)

rows = []
for e in E:
    t = clean(e['text'])
    hm = t[:600]
    m = re.search(r'(凌晨|半夜|深夜|夜里)?([一二三四五六七八九十两\d]+点)([一二三四五六七八九十\d]+分)?', hm)
    clock = m.group(0) if m else '-'
    # 职业/手艺自述
    trade = re.search(r'(我做[^。]{0,12}第[^。]{0,6}年|我叫[^，。]{1,6}[，,][^，。]{2,6}的|我们这行|干我们这行的|在我们这一行|这行当)', hm)
    rows.append((e['model'], clock, trade.group(0) if trade else '-', t[:60]))

report = ['# 时间戳开篇']
for m, c, tr, head in rows:
    report.append(f'  {m:22s} | {c:10s} | {tr:12s} | {head[:40]}')

# 共享名词
report.append('')
report.append('# 跨篇共享的高辨识度名词')
import collections
words = collections.defaultdict(set)
for e in E:
    t = clean(e['text'])
    for w in ['当票','秤','钟','档案','修复','博物馆','拓碑','灯光','灯管','录音']:
        if w in t: words[w].add(e['model'])
for w, ms in sorted(words.items(), key=lambda x: -len(x[1])):
    if len(ms) >= 3:
        report.append(f'  {w}：{len(ms)}/18 — ' + '、'.join(sorted(ms)))

# 第一人称占比
fp = [e['model'] for e in E if re.match(r'^\s*[^。]{0,20}[我]', clean(e['text'])[:40]) or '我' in clean(e['text'])[:25]]
report.append('')
report.append(f'# 开篇 25 字内出现“我”：{len(fp)}/18 — ' + '、'.join(fp))

open('similarity-report-2.md', 'w', encoding='utf-8').write('\n'.join(report))
print('ok')
