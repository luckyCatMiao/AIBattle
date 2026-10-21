import json, pathlib, subprocess, sys
train=pathlib.Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(train/'control'/'audit.py')],check=True)
run=pathlib.Path(json.loads((train/'active-run.json').read_text(encoding='utf-8'))['path'])
audit=json.loads((run/'audit.json').read_text(encoding='utf-8'))
config=json.loads((run/'config.json').read_text(encoding='utf-8')) if (run/'config.json').exists() else {}
events=[json.loads(l) for l in (run/'events.jsonl').read_text(encoding='utf-8').splitlines()]
complete=events[-1]['event']=='completed'
rows=audit['rounds']; players=audit['players']
title=' vs '.join(p['name'] for p in players)
text=[f'# {title} 连续复盘实验','',f'批次：`{run.name}`。状态：'+('已完成。' if complete else '运行中；以下仅包含已完成轮次。'),'',
      '模型：'+'，'.join(f"{p['name']} 使用 `{p['model']}`" for p in players)+'。双方均为 medium 推理设置，每轮各自复盘、修改和验证，再交换黑白对战两局。','',
      '起点：'+config.get('setup_note','各自保留此前策略。'),'',
      '| 迭代轮次 | '+' | '.join(p['name']+' 胜' for p in players)+' | 平局 | 两局手数 | 最长一步耗时 |',
      '|---|'+'---:|'*len(players)+'---:|---|---:|']
for r in rows:
    text.append(f"| {r['iteration']} | "+' | '.join(str(r['wins'][p['id']]) for p in players)+f" | {r['draws']} | {' / '.join(map(str,r['plies']))} | {r['max_move_seconds']:.3f} 秒 |")
text+=['','本批合计：'+'，'.join(f"{p['name']} {sum(r['wins'][p['id']] for r in rows)} 胜" for p in players)+f"，平局 {sum(r['draws'] for r in rows)} 局。共 {len(audit['verified_games'])} 局，{audit['distinct_sequences']} 种完整落子序列。",'',
       '棋谱已由独立窗口枚举程序逐手重建，核对落子合法性、先后手、首次五连、胜者与最终棋盘。源码快照的 SHA-256 校验通过。记录耗时包含进程冷启动及传输开销。','',
       '## 隔离与条件','',
       '- 选手使用独立挂载和进程命名空间，只获得自己的源码、经验文件、相同公开棋谱与规则。对方工作区、旧源码、裁判凭据、控制器日志和 Windows 盘均未挂载。',
       '- 双向越界读取测试通过；比赛程序源码只读，无网络路由、无模型认证文件。组织者只转发输入和输出，不选择落点。',
       '- 程序每步目标预算 5 秒，10 秒异常硬上限；双方准备上限相同，允许自选程序、直接推理或混合策略。',
       '- 本次起点和历史积累见上文，不能默认视为双方从零、等经验的比较。少量棋局不代表通用模型胜率。','',
       '## 记录与继续运行','',
       f'- [本批记录](control/{run.name}/)：源码快照、模型日志、复盘、验证、棋谱、耗时和隔离检查。',
       '- [运行说明](README.md)。双击根目录 `ContinueTraining.bat`，会沿用当前这组选手各自的策略和历史棋谱，再跑三轮。',
       '- [直播与回放](http://127.0.0.1:8787)，点击「跟随直播」。',
       '- 改进的是策略与经验文件，没有训练模型权重。','']
for r in rows:
    text += [f"## 第 {r['iteration']} 轮复盘",'']
    for p in players:
        snapshot=run/f"iteration-{r['iteration']}"/p['id']
        entry=json.loads((snapshot/'entry.json').read_text(encoding='utf-8'))
        text.append(f"- [{p['name']}](control/{run.name}/iteration-{r['iteration']}/{p['id']}/review.md)，参赛方式：`{entry['mode']}`。")
    text.append('')
body='\n'.join(text)
(train/'REPORT.md').write_text(body,encoding='utf-8')
archived=body.replace(f'control/{run.name}/','./').replace('(README.md)','(../../README.md)')
(run/'REPORT.md').write_text(archived,encoding='utf-8')
print('Report saved to',train/'REPORT.md')
