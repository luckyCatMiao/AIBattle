# -*- coding: utf-8 -*-
import json, re
d = json.load(open('novel-runs/novel-20261101-175830-986783/run.json', encoding='utf-8'))
E = [e for e in d['entries'] if e.get('text')]
def clean(t): return re.sub(r'\s+','',t)
rep=[]
def hit(pat):
    return [e['model'] for e in E if re.search(pat, clean(e['text'])[:700])]
groups = {
 '全大陆的火同时熄灭/倒转/异变': r'(万火|三千炉火|所有火焰|万炉|火焰.{0,8}(熄|倒转|灭)|火.{0,4}灭|丹火.{0,6}(灭|熄))',
 '天穹裂开/天空出现裂缝': r'(天.{0,6}裂|裂缝|天穹.{0,6}(裂|开)|撕开.{0,6}天|空间裂缝)',
 '十周年大庆/十年祭': r'(十年祭|大祭|大庆|十周年|十年之期|整整十年|后的第十年)',
 '炎帝/萧炎 归来的预兆': r'(炎帝.{0,20}(回|归|归位)|他.{0,6}必归|帝潮|帝火归位)',
 '测气塔/通脉塔等新设施失灵': r'(测气塔|通脉塔|塔.{0,10}(熄|灭|亮))',
}
rep.append('# 开篇 700 字母题命中（19 篇）')
for k,p in groups.items():
    w=hit(p); rep.append(f'{k}: {len(w)}/19 — ' + '、'.join(w))
open('doupo-motif.md','w',encoding='utf-8').write('\n'.join(rep))
print('ok')
