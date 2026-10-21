"""Build the Chinese series report from archived evidence only."""
import json, pathlib, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent

def generate(run):
    run = pathlib.Path(run).resolve()
    config = json.loads((run / 'config.json').read_text(encoding='utf-8'))
    results = json.loads((run / 'results.json').read_text(encoding='utf-8'))
    labels = {k: v for k, v in config.get('models', {}).items()}
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
    line = ' · '.join(f'{names[w]} **{tally.get(w, 0)}**' for w in order)
    port = config.get('port', 8796)
    url = f'http://127.0.0.1:{port}/?replay=latest&run={run.name}'

    out = [f'# 铁拳谱 · ' + ' 对战 '.join(names[w] for w in order), '']
    out.append(f'**[打开交互回放]({url})**。支持选系列、选局、暂停、倍速、拖动时间轴与观察阵营切换。')
    out.append('')
    out.append(f'系列比分：{line}。')
    out.append('')
    out.append(config.get('setup_note', ''))
    out.append('')
    out.append('## 对局')
    out.append('')
    out.append('| 对局 | 座位（先/后） | 出场顺序 | 胜者 | 帧数 | 用时(秒) | ' +
               ' | '.join(names[w] for w in order) + ' 得分 |')
    out.append('| --- | --- | --- | --- | ---: | ---: | ' + ' | '.join('---:' for _ in order) + ' |')
    for r in results:
        seats = ' / '.join(names[w] for w in r['seats'])
        teams = ' / '.join('-'.join(t) for t in (r.get('teams') or []))
        winner = '技术中断' if r.get('technicalFailure') else (names.get(r['winner'], r['winner']) if r['winner'] else '平局')
        scores = ' | '.join(str(r.get('scores', {}).get(w, 0)) for w in order)
        out.append(f"| [{r['id']}](http://127.0.0.1:{port}/?replay={r['id']}&run={run.name}) | {seats} | {teams} | {winner} | "
                   f"{r.get('frames', 0)} | {r.get('duration', 0)} | {scores} |")
    out.append('')
    out.append('## 提交与用量')
    out.append('')
    out.append('| 轮次 | 模型 | 控制方式 | 出场顺序 | 输入 tokens | 输出 tokens |')
    out.append('| --- | --- | --- | ---: | ---: | ---: |')
    for round_no in range(1, config.get('rounds', 0) + 1):
        for w in order:
            entry_file = run / f'round-{round_no}' / w / 'entry.json'
            usage_file = run / f'round-{round_no}-{w}-usage.json'
            if not entry_file.exists():
                continue
            entry = json.loads(entry_file.read_text(encoding='utf-8'))
            team = ' / '.join(entry.get('team', []))
            usage = json.loads(usage_file.read_text(encoding='utf-8')) if usage_file.exists() else None
            tin = tout = 0
            if isinstance(usage, list):
                for u in usage:
                    inner = u.get('usage') or u
                    tin += inner.get('input_tokens', 0) + inner.get('cached_input_tokens', 0) + inner.get('cache_read_input_tokens', 0)
                    tout += inner.get('output_tokens', 0)
            elif isinstance(usage, dict):
                inner = usage.get('usage') or usage
                tin = inner.get('input_tokens', 0) + inner.get('cached_input_tokens', 0) + inner.get('cache_read_input_tokens', 0)
                tout = inner.get('output_tokens', 0)
            out.append(f"| {round_no} | {labels.get(w, w)} | {entry.get('mode', '')} | {team} | {tin} | {tout} |")
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
        out.append('逐帧重演核验通过：从初始状态重新执行全部双方输入，每一个快照与终局结果都与存档一致；'
                   '引擎、角色目录与冻结提交的哈希均通过。')
    else:
        out.append('**注意：本次没有通过逐帧重演核验**，请查看 audit.json。')
    out.append('')
    out.append(f'- `results.json`：胜负、得分、帧数与用时。')
    out.append('- `r*-g*.json.gz`：每个决策窗口的全场快照、双方逐帧输入与最终结果。')
    out.append('- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。')
    out.append('- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。')
    out.append('- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。')
    out.append('')
    out.append('本系列只比较这次准备产生的策略在当前帧数据下的表现。6 局样本不能证明模型的综合能力高低。'
               '公开页面只发布回放和中文说明，不提供私有策略源码。')
    text = '\n'.join(out) + '\n'
    (run / 'REPORT.md').write_text(text, encoding='utf-8')
    return text

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else json.loads((ROOT / 'control' / 'active-run.json').read_text(encoding='utf-8'))['path']
    text = generate(target)
    print(text[:2000])
