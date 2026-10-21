import json,pathlib,statistics,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parent
def main():
    run=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(json.loads((ROOT/'control/active-run.json').read_text(encoding='utf-8'))['path'])
    subprocess.run(['node',str(ROOT/'audit.js'),str(run)],check=True,stdout=subprocess.DEVNULL)
    results=json.loads((run/'results.json').read_text(encoding='utf-8'))
    records=json.loads((run/'replays.json').read_text(encoding='utf-8'))
    audit=json.loads((run/'audit.json').read_text(encoding='utf-8'))
    config=json.loads((run/'config.json').read_text(encoding='utf-8'))
    participants=list(config['models']);left,right=participants;labels={w:w.title() for w in participants}
    wins={w:sum(r['winner']==w for r in results) for w in participants};draws=sum(r['winner'] is None for r in results)
    lines=['# 前线争夺：'+ ' vs '.join(config['models'].values()),'',f"结果：{labels[left]} {wins[left]} 胜，{labels[right]} {wins[right]} 胜，平局 {draws}。",'',
      f'| 轮次 | {labels[left]} 在西侧 | {labels[left]} 在东侧 | 本轮比分 {labels[left]}:{labels[right]} |','|---|---|---|---|']
    for round_no in range(1,config['rounds']+1):
        games=[r for r in results if r['round']==round_no]
        display=lambda r:(labels[r['winner']]+' 胜' if r['winner'] else '平局')+f" · {r['duration']:.2f} 秒"
        lines.append(f"| {round_no} | {display(games[0])} | {display(games[1])} | {sum(g['winner']==left for g in games)}:{sum(g['winner']==right for g in games)} |")
    lines+=['',f"按胜者出生位置统计：西侧 {sum(r['winner']==r['seats'][0] for r in results)} 胜，东侧 {sum(r['winner']==r['seats'][1] for r in results)} 胜，平局 {draws}。"]
    start=(f"双方沿用上一系列第 {config['source_round']} 轮最终策略，各自保留自己的代码和笔记，从本次第一轮起复盘改进；起始文件哈希已核对。" if config.get('resume_both') else f"{labels[config['incumbent']]} 沿用上一系列最终策略，首轮原样出场，已核对全部保留文件的哈希；挑战者从零开始。" if config.get('incumbent') else '双方都从零开始。')+f"双方获得相同的 {config.get('history_games',0)} 局历史公开战报。"
    lines+=['','## 实验条件','',
      '- 调用模型：'+ '、'.join('`'+m+'`（'+config.get('clients',{}).get(w,'Codex CLI')+'）' for w,m in config['models'].items())+'，均设置为 medium；不同厂商的同名档位不代表相同计算量。',
      '- '+start,
      f"- 每次准备上限 600 秒，自行选择策略与实现方式。共 {config['rounds']} 轮，每轮 2 局交换东西出生位置，轮间双方复盘改进。"+('守擂者首轮原样出场，不额外准备。' if config.get('first_round_incumbent_frozen') else '双方在每轮比赛前均有独立准备回合。'),
      '- 规则、初始观察和历次公开战报相同。不提供内置电脑控制代码。双方独立文件系统；执行程序时只读冻结版本、无网络、无模型凭据。',
      '- 相同游戏时刻观察，每游戏秒各提交最多 10 条命令，再推进 20 个物理帧。最高 8 倍速播放。等待决策时冻结游戏时钟，因此不衡量模型响应速度。',
      '- 每局独立启动进程，单位持续执行已收到命令。程序每次应答硬上限 5 秒；协议或进程失败中止实验，不伪造对方胜利。',
      '- 摧毁基地取胜；600 秒未结束则按游戏积分结算。地图固定且完全公开。','',
      '## 执行与验证','',
      f"- {len(records)} 局的每秒状态和全部命令已保存；独立重放全部命令，所有已记录的逐秒快照、非法命令拒绝和最终胜者均一致。",
      f"- {audit['uniqueActionTraces']} 条不同的完整动作轨迹。每轮冻结策略的 SHA-256 清单验证通过。"]
    for w in participants:
        times=[d['seconds'][r['seats'].index(w)] for r in records for d in r['decisions']]
        errors=sum(g['errors'][w] for g in results)
        modes=[json.loads((run/f'round-{i}'/w/'entry.json').read_text(encoding='utf-8'))['mode'] for i in range(1,config['rounds']+1)]
        lines.append(f"- {w.title()}：提交方式 {', '.join(modes)}；{len(times)} 次决策，应答中位数 {statistics.median(times)*1000:.2f} ms，最大 {max(times):.3f} s；拒绝指令 {errors} 条（未计为直接判负）。")
    lines+=['','## 复盘版本','']
    for i in range(1,config['rounds']+1):
        reviews=[]
        for w in participants:
            original=f'round-{i}/{w}/review.md'
            translated=f'reviews-zh/round-{i}-{w}.md'
            reviews.append(f'[{labels[w]} 自述（中文）]({translated})（[原文]({original})）' if (run/translated).is_file() else f'[{labels[w]} 自述]({original})')
        lines.append(f"- 第 {i} 轮："+' · '.join(reviews)+'。这些是模型自述，不代表裁判认可全部判断。')
    lines+=['','## 解释范围','',
      '这是固定地图上的一次自适应系列赛，各局并非独立、随机化的统计实验。相同初始条件、确定性模拟和轮间学习让结果有关联；只能说明这次规则、准备预算下提交策略的对抗效果，不能据此推断模型的通用能力或长期胜率。',
      '双方若选择程序，局内行动来自它们自己编写的程序；不要把结果解读为模型在每个物理帧都进行了实时推理。',
      ('本次起点不对等：守擂者有此前多轮积累，挑战者从零开始，不能视作同等训练预算下的模型比较。' if config.get('incumbent') else ''),
      ('本次双方均从既有最终策略继续；更早的准备历史仍不同，因此不属于从零、等累计预算的比较。' if config.get('resume_both') else ''),
      '', f"观战与回放：http://127.0.0.1:{config.get('port',8789)}/。服务关闭后双击项目根目录 WatchRTSBattle.bat，读取最近系列赛保存记录重新打开，不会再次调用模型。",'']
    (run/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({'report':str(run/'REPORT.md'),**wins,'draws':draws,'verified':True},ensure_ascii=False))
if __name__=='__main__':main()
