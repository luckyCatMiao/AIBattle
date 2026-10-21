"""Generate a Chinese report from archived evidence, never model claims."""
import json,pathlib,sys

def generate(run):
    config=json.loads((run/'config.json').read_text(encoding='utf-8'))
    results=json.loads((run/'results.json').read_text(encoding='utf-8'))
    audit=json.loads((run/'audit.json').read_text(encoding='utf-8')) if (run/'audit.json').exists() else None
    models=config['models'];wins={w:sum(r['winner']==w for r in results) for w in models}
    left,right=models;labels=config.get('labels',{'luna':'GPT-6 Luna','sol':'GPT-6.1 Sol','opus':'Claude Opus 5.5','astra':'GPT-6 Astra'});base='http://127.0.0.1:8794';runquery='run='+run.name
    lines=[f'# 灰烬王座 · {labels[left]} 对战 {labels[right]}','',
      f'**[打开交互回放]({base}/?replay=latest&{runquery})**。支持选系列、选局、暂停、倍速、拖动时间轴和观察阵营切换。','',
      f"系列比分：{labels[left]} **{wins[left]} : {wins[right]}** {labels[right]}。",'',
      config.get('setup_note','双方从零准备。'),'',
      f"新准备预算：每轮最多 {config.get('preparation_seconds',600)//60} 分钟。客户端 effort 均设置 medium；同名设置不保证跨厂商实际推理投入相同。两局交换出生位置，使用冻结策略。每 0.25 游戏秒双方同时观察，各最多 20 条命令；游戏等待两方响应，不奖励网络速度。",'',
      f'| 对局 | 西 / 东 | 胜者 | 游戏时长 | {labels[left]} 积分 | {labels[right]} 积分 | 指令错误 {left} / {right} |',
      '| --- | --- | --- | --- | ---: | ---: | ---: |']
    for r in results:
        seconds=r['duration'];winner=models.get(r['winner'],'平局')+('（技术负）' if r.get('technicalFailure') else '')
        lines.append(f"| [{r['id']}]({base}/?replay={r['id']}&{runquery}) | {' / '.join(r['seats'])} | {winner} | {int(seconds//60):02}:{int(seconds%60):02} | {r['scores'][left]} | {r['scores'][right]} | {r['errors'][left]} / {r['errors'][right]} |")
    lines+=['','## 提交与用量','', '| 轮次 | 模型 | 控制方式 | 首发英雄 ID | 总输入 tokens（含缓存） | 缓存输入 | 输出 tokens |','| --- | --- | --- | --- | ---: | ---: | ---: |']
    for iteration in range(1,config['rounds']+1):
        for who in models:
            entry=json.loads((run/f'round-{iteration}'/who/'entry.json').read_text(encoding='utf-8'))
            usages=json.loads((run/f'round-{iteration}-{who}-usage.json').read_text(encoding='utf-8'))
            if any(u.get('reused_frozen_incumbent') for u in usages):total=cached=output='沿用旧提交'
            elif who=='opus':
                raw=[u['usage'] for u in usages];cached=sum(u.get('cache_read_input_tokens',0) for u in raw);total=sum(u.get('input_tokens',0)+u.get('cache_read_input_tokens',0)+u.get('cache_creation_input_tokens',0) for u in raw);output=sum(u.get('output_tokens',0) for u in raw)
            else:total=sum(u.get('input_tokens',0) for u in usages);cached=sum(u.get('cached_input_tokens',0) for u in usages);output=sum(u.get('output_tokens',0) for u in usages)
            lines.append(f"| {iteration} | {models[who]} | {entry['mode']} | {entry['hero']} | {total} | {cached} | {output} |")
    lines+=['','双方均有独立的文件系统视图，不能读取对方私有策略。比赛程序只读、无网络；裁判没有运行内置规则电脑或替参赛者修改策略。','',
      '## 中文自述与复盘','',
      *[f'- [{labels[w]} 策略及赛后复盘]({base}/api/arena/reviews/{w}?{runquery})' for w in models],
      '', '上述文字是模型自述，不代表裁判认可全部判断。','',
      '## 证据与范围','',
      ('逐帧重演核验通过：从初始状态重新执行所有命令，战场状态和指令错误与存档一致；引擎、配置、冻结提交和回放文件哈希均通过。' if audit and audit.get('verified') else '尚未完成逐帧重演核验。'),'',
      '- `results.json`：胜负、积分、错误与时长。',
      '- `r*-g*.json.gz`：每个决策窗口的全场状态、双方指令、响应耗时与最终结果。',
      '- `round-*-*-invocation.json`、`round-*-*.jsonl`：各轮实际模型调用配置和执行记录。',
      '- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。',
      '- `audit.json`、冻结目录 `manifest.json`：回放及策略完整性校验。','',
      f'本系列只比较这次准备产生的策略在当前原型规则下的表现。{len(results)} 局样本不能证明模型的综合能力高低。公开页面只发布回放和中文说明，不提供私有策略源码。','']
    (run/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
    return wins

if __name__=='__main__':print(json.dumps(generate(pathlib.Path(sys.argv[1]).resolve()),ensure_ascii=False))
