"""Build the Chinese series report from archived evidence only."""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent


def generate(run):
    run = pathlib.Path(run).resolve()
    config = json.loads((run / 'config.json').read_text(encoding='utf-8'))
    results = json.loads((run / 'results.json').read_text(encoding='utf-8'))
    labels = config.get('models', {})
    names = {k: config.get('labels', {}).get(k, k) for k in labels}
    audit = None
    try:
        audit = json.loads((run / 'audit.json').read_text(encoding='utf-8'))
    except Exception:
        pass

    tally = {}
    for r in results:
        w = r.get('winner')
        tally[w] = tally.get(w, 0) + 1
    order = list(labels)
    port = config.get('watch_port', 8815)
    url = f'http://127.0.0.1:{port}/?replay=latest&run={run.name}'

    out = ['# 横版闯关竞速 · ' + ' 对战 '.join(names[w] for w in order), '']
    out.append(f'**[打开交互回放]({url})**。支持选系列、选局、暂停、倍速、拖动时间轴。')
    out.append('')
    out.append(f"系列比分（局）：{' · '.join(f'{names[w]} **{tally.get(w, 0)}**' for w in order)}。")
    out.append('')
    out.append(config.get('setup_note', ''))
    out.append('')
    out.append('## 对局')
    out.append('')
    out.append('| 对局 | 座位（左/右） | 胜者 | 局分 | 关卡长度 | 死亡数 | 最远距离 | 帧数 | 用时(秒) |')
    out.append('| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: |')
    for r in results:
        seats = ' / '.join(names[w] for w in r['seats'])
        winner = '技术中断' if r.get('technicalFailure') else (names.get(r['winner'], r['winner']) if r['winner'] else '平局')
        wins = r.get('wins') or [0, 0]
        level = r.get('level') or {}
        deaths = r.get('deaths') or [0, 0]
        maxx = r.get('maxX') or [0, 0]
        out.append(f"| [{r['id']}](http://127.0.0.1:{port}/?replay={r['id']}&run={run.name}) | {seats} | {winner} | "
                   f"{wins[0]}:{wins[1]} | {level.get('width', '?')} 格 | {deaths[0]}:{deaths[1]} | "
                   f"{maxx[0]}:{maxx[1]} | {r.get('frames', 0)} | {r.get('duration', 0)} |")
    out.append('')

    out.append('## 机制生效情况')
    out.append('')
    deaths = [0, 0]
    for r in results:
        for i, v in enumerate(r.get('deaths') or []):
            if i < 2: deaths[i] += int(v)
    out.append(f'全部 {len(results)} 局共 {sum(tally.values())} 个胜局；双方累计回起点重跑 {deaths[0]} : {deaths[1]} 次。')
    out.append('规则要点：每局随机生成横版关卡（地面、坑、台阶、浮空砖），并随机布置**地刺、移动平台、食人花、'
               '旋转锯齿、塌陷砖**；从后面顶住对手可以推人，前面的人挡得住但推不动；'
               '掉坑、碰怪、地刺、食人花、锯齿都会回起点重跑；先摸到终点旗帜者赢一局，三局两胜。')
    out.append('')

    out.append('## 提交与用量')
    out.append('')
    out.append('| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |')
    out.append('| --- | --- | --- | ---: | ---: |')
    played = {r.get('round') for r in results}
    for round_no in range(1, config.get('rounds', 0) + 1):
        if round_no not in played:
            continue
        for w in order:
            entry_file = run / f'round-{round_no}' / w / 'entry.json'
            usage_file = run / f'round-{round_no}-{w}-usage.json'
            if not entry_file.exists():
                continue
            entry = json.loads(entry_file.read_text(encoding='utf-8'))
            usage = json.loads(usage_file.read_text(encoding='utf-8')) if usage_file.exists() else None
            tin = tout = 0
            items = usage if isinstance(usage, list) else [usage] if isinstance(usage, dict) else []
            for u in items:
                inner = (u or {}).get('usage') or u or {}
                tin += inner.get('input_tokens', 0) + inner.get('cached_input_tokens', 0) + inner.get('cache_read_input_tokens', 0)
                tout += inner.get('output_tokens', 0)
            out.append(f"| {round_no} | {labels.get(w, w)} | {entry.get('mode', '')} | {tin} | {tout} |")
    out.append('')
    out.append('## 中文自述与复盘')
    out.append('')
    for w in order:
        out.append(f"- [{names[w]} 策略及赛后复盘](http://127.0.0.1:{port}/api/arena/reviews/{w}?run={run.name})")
    out.append('')
    out.append('上述文字是模型自述，不代表裁判认可全部判断。')
    out.append('')
    out.append('## 证据与范围')
    out.append('')
    if audit and audit.get('verified'):
        out.append('逐物理帧重演核验通过：重新执行全部输入，每个存档帧与终局都与存档一致；'
                   '引擎、规则目录与冻结提交的哈希均通过。')
    else:
        out.append('**注意：本次没有通过逐帧重演核验**，请查看 audit.json。')
    out.append('')
    out.append('- `results.json`：胜负、局分、死亡数、最远距离与帧数。')
    out.append('- `r*-g*.json.gz`：每个物理帧的完整比赛快照（含关卡）与逐窗口输入。')
    out.append('- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。')
    out.append('- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。')
    out.append('')
    out.append('本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，'
               '不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。')
    text = '\n'.join(out) + '\n'
    (run / 'REPORT.md').write_text(text, encoding='utf-8')
    return text


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else json.loads((ROOT / 'control' / 'active-run.json').read_text(encoding='utf-8'))['path']
    print(generate(target)[:2000])
