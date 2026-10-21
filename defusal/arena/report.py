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
        tally[r['winner']] = tally.get(r['winner'], 0) + 1
    order = list(labels)
    port = config.get('watch_port', config.get('port', 8799) + 1)
    url = f'http://127.0.0.1:{port}/?replay=latest&run={run.name}'

    out = ['# 爆破模式 · ' + ' 对战 '.join(names[w] for w in order), '']
    out.append(f'**[打开交互回放]({url})**。支持选系列、选局、暂停、倍速、拖动时间轴。')
    out.append('')
    out.append(f"系列比分：{' · '.join(f'{names[w]} **{tally.get(w, 0)}**' for w in order)}。")
    out.append('')
    out.append(config.get('setup_note', ''))
    out.append('')
    out.append('## 对局')
    out.append('')
    out.append('| 对局 | 座位（左/右） | 胜者 | 回合比分（座位序） | 逐回合结果 | 帧数 | 用时(秒) |')
    out.append('| --- | --- | --- | ---: | --- | ---: | ---: |')
    for r in results:
        seats = ' / '.join(names[w] for w in r['seats'])
        winner = '技术中断' if r.get('technicalFailure') else (names.get(r['winner'], r['winner']) if r['winner'] else '平局')
        detail = ' / '.join(
            f"{(x.get('winner') or '平')}·{x.get('reason', '')}·{round(x.get('frames', 0) / 20)}s"
            for x in (r.get('roundLog') or [])
        ) or '—'
        scores = r.get('scores', {})
        out.append(f"| [{r['id']}](http://127.0.0.1:{port}/?replay={r['id']}&run={run.name}) | {seats} | {winner} | "
                   f"{scores.get(r['seats'][0], 0)}:{scores.get(r['seats'][1], 0)} | {detail} | {r.get('frames', 0)} | {r.get('duration', 0)} |")
    out.append('')

    reasons = {}
    round_seconds = []
    for r in results:
        for x in (r.get('roundLog') or []):
            reasons[x.get('reason', '?')] = reasons.get(x.get('reason', '?'), 0) + 1
            round_seconds.append((x.get('frames') or 0) / 20)
    if reasons:
        out.append('## 机制生效情况')
        out.append('')
        out.append('回合结束方式分布：' + ' · '.join(f'{k} {v}' for k, v in sorted(reasons.items(), key=lambda kv: -kv[1])) + '。')
        if round_seconds:
            out.append(f'平均回合时长 {sum(round_seconds) / len(round_seconds):.1f} 秒（未下包上限 100 秒）。')
        buys = sum(len(r.get('buys') or []) for r in results)
        out.append(f'记录到的购买提交：{buys} 次。')
        out.append('')

    out.append('## 提交与用量')
    out.append('')
    out.append('| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |')
    out.append('| --- | --- | --- | ---: | ---: |')
    for round_no in range(1, config.get('rounds', 0) + 1):
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
        out.append('逐物理帧重演核验通过：从购买阶段重新应用全部购买、重新执行全部单位输入，'
                   '每个存档帧与终局都与存档一致；引擎、规则目录与冻结提交的哈希均通过。')
    else:
        out.append('**注意：本次没有通过逐帧重演核验**，请查看 audit.json。')
    out.append('')
    out.append('- `results.json`：胜负、回合比分、逐回合结果、帧数与用时。')
    out.append('- `r*-g*.json.gz`：每个物理帧的完整战场快照、购买记录与逐窗口输入。')
    out.append('- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。')
    out.append('- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。')
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
