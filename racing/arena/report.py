"""Build the Chinese series report from archived evidence only."""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent


def fmt_time(value):
    return '—' if value is None else f'{float(value):.1f}s'


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
    port = config.get('watch_port', 8806)
    url = f'http://127.0.0.1:{port}/?replay=latest&run={run.name}'

    out = ['# 俯视角赛车 · ' + ' 对战 '.join(names[w] for w in order), '']
    out.append(f'**[打开交互回放]({url})**。支持选系列、选局、暂停、倍速、拖动时间轴。')
    out.append('')
    out.append(f"系列比分（局）：{' · '.join(f'{names[w]} **{tally.get(w, 0)}**' for w in order)}。")
    out.append('')
    out.append(config.get('setup_note', ''))
    out.append('')
    out.append('## 对局')
    out.append('')
    out.append('| 对局 | 赛道种子 | 赛道长度 | 半宽 | 座位（左/右） | 胜者 | 圈数 | 冲线时间 | 帧数 | 模拟秒数 | 用时(秒) |')
    out.append('| --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: |')
    for r in results:
        seats = ' / '.join(names[w] for w in r['seats'])
        winner = '技术中断' if r.get('technicalFailure') else (names.get(r['winner'], r['winner']) if r['winner'] else '平局')
        track = r.get('track') or {}
        laps = r.get('laps') or [0, 0]
        times = r.get('finishTimes') or [None, None]
        out.append(f"| [{r['id']}](http://127.0.0.1:{port}/?replay={r['id']}&run={run.name}) | "
                   f"{r.get('seed', '?')} | {round(float(track.get('length') or 0), 1)} | "
                   f"{round(float(track.get('halfWidth') or 0), 2)} | {seats} | {winner} | "
                   f"{laps[0]}:{laps[1]} | {fmt_time(times[0])} : {fmt_time(times[1])} | "
                   f"{r.get('frames', 0)} | {round(r.get('frames', 0) / 20, 1)} | {r.get('duration', 0)} |")
    out.append('')

    out.append('## 机制生效情况')
    out.append('')
    boosts = [0, 0]; drifts = [0.0, 0.0]; collisions = [0, 0]
    for r in results:
        for i, v in enumerate(r.get('boosts') or []):
            if i < 2: boosts[i] += int(v)
        for i, v in enumerate(r.get('driftTimes') or []):
            if i < 2: drifts[i] += float(v)
        for i, v in enumerate(r.get('collisions') or []):
            if i < 2: collisions[i] += int(v)
    out.append(f'喷火次数：{boosts[0]} : {boosts[1]}；漂移总时长：{drifts[0]:.1f}s : {drifts[1]:.1f}s；车辆碰撞：{collisions[0]} : {collisions[1]}。')
    tracks = [r.get('track') or {} for r in results]
    valid = sum(1 for t in tracks if (t.get('audit') or {}).get('valid'))
    fallback = sum(1 for t in tracks if (t.get('audit') or {}).get('fallback'))
    out.append(f'随机赛道：{len(tracks)} 局全部按种子重新生成，赛道自检通过 {valid} 局，回退到椭圆环 {fallback} 局。')
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
        out.append('逐物理帧重演核验通过：重新执行全部车辆输入，每个存档帧与终局都与存档一致；'
                   '引擎、规则目录与冻结提交的哈希均通过。')
    else:
        out.append('**注意：本次没有通过逐帧重演核验**，请查看 audit.json。')
    out.append('')
    out.append('- `results.json`：胜负、圈数、冲线时间、赛道种子与帧数。')
    out.append('- `r*-g*.json.gz`：每个物理帧的完整比赛快照（含赛道）与逐窗口输入。')
    out.append('- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。')
    out.append('- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针或本机直跑声明。')
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
