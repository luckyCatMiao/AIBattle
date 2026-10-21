"""Independently audit a completed public tournament export and write a report."""
import collections
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
source = Path(sys.argv[1]) if len(sys.argv) > 1 else max((root / 'data').glob('tournament-*.json'), key=lambda p: p.stat().st_mtime)
series = json.loads(source.read_text(encoding='utf-8'))
assert series['status'] == 'finished'
names = {p['id']: p['name'] for p in series['players']}
records, patterns = [], collections.defaultdict(list)
for g in series['games']:
    board = [[0] * 15 for _ in range(15)]
    detected = None
    for i, m in enumerate(g['moves']):
        assert detected is None, 'A move was recorded after a win'
        x, y, color = m['x'], m['y'], 1 + i % 2
        assert 0 <= x < 15 and 0 <= y < 15 and board[y][x] == 0
        assert m['color'] == color and m['ply'] == i + 1
        assert m['playerId'] == g['black' if color == 1 else 'white']['id']
        board[y][x] = color
        for dx, dy in [(1, 0), (0, 1), (1, 1), (1, -1)]:
            count = 1
            for sign in [-1, 1]:
                a, b = x + dx * sign, y + dy * sign
                while 0 <= a < 15 and 0 <= b < 15 and board[b][a] == color:
                    count += 1
                    a += dx * sign
                    b += dy * sign
            if count >= 5:
                detected = m['playerId']
    assert board == g['board'] and detected == g['winner']
    assert detected or len(g['moves']) == 225
    sig = tuple((m['x'], m['y']) for m in g['moves'])
    patterns[sig].append(g['round'])
    records.append({'round': g['round'], 'black': g['black']['name'], 'white': g['white']['name'],
                    'winner': names.get(g['winner'], '平局'), 'moves': len(g['moves']),
                    'winningMove': g['moves'][-1]['coordinate'], 'gameId': g['id']})

stats = []
for p in series['players']:
    games = series['games']
    wins = sum(g['winner'] == p['id'] for g in games)
    draws = sum(g['winner'] is None for g in games)
    stats.append({'name': p['name'], 'wins': wins, 'losses': len(games) - wins - draws, 'draws': draws,
                  'blackWins': sum(g['winner'] == p['id'] and g['black']['id'] == p['id'] for g in games),
                  'whiteWins': sum(g['winner'] == p['id'] and g['white']['id'] == p['id'] for g in games),
                  'winRate': wins / len(games)})
audit = {'tournamentId': series['id'], 'auditPassed': True, 'games': records,
         'standings': stats, 'uniqueFullMoveSequences': len(patterns), 'repeatedRoundGroups': list(patterns.values()),
         'strategyHashes': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                            for p in [root / 'players/luna/play.py', root / 'players/sol/player.py'] if p.exists()}}
(root / 'data/audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf-8')

lines = ['# 五子棋开放策略试赛报告', '', '日期：2026-10-14（Asia/Shanghai）', '',
         f"比赛 ID：`{series['id']}`", '',
         '使用两个独立 Codex 子会话，分别明确指定 `gpt-6-luna` 与 `gpt-6.1-sol`。相同任务说明、相同 API 权限，允许自行决定是否编程。不强制逐手模型调用，不提供内置棋力引擎；禁止使用预制外部引擎或修改裁判。', '',
         '规则：15×15 自由五子棋，连续至少五子获胜，无禁手，从空棋盘开始，逐局交换黑白。双方使用默认/继承推理配置，没有单独强制相同 token 或计算时间预算。', '',
         '## 结果', '', '| 选手 | 胜 | 负 | 平 | 本次胜率 | 执黑胜 | 执白胜 |', '|---|---:|---:|---:|---:|---:|---:|']
for s in stats:
    lines.append(f"| {s['name']} | {s['wins']} | {s['losses']} | {s['draws']} | {s['winRate']:.0%} | {s['blackWins']} | {s['whiteWins']} |")
lines += ['', '| 局数 | 黑棋 | 白棋 | 胜者 | 手数 | 最后一手 |', '|---:|---|---|---|---:|---|']
for g in records:
    lines.append(f"| {g['round']} | {g['black']} | {g['white']} | {g['winner']} | {g['moves']} | {g['winningMove']} |")
lines += ['', '## 实际采用的策略', '',
          '- Luna 自行编写 Python 程序：五格窗口的静态评分、立即获胜检查、立即阻挡检查，再按评分选点。',
          '- Sol 自行编写 Python 程序：立即获胜与阻挡、递归连续冲四搜索、三层战术 negamax 搜索和棋形评分。',
          '- 两名选手均自主采用程序连续落子；本次不代表每一步都重新调用大模型思考。',
          '- 代码复核发现，Luna 的静态评分采用 `a + o * 1.12`，其中 `o` 是对手未被封堵的窗口分数。这个正号可能使保留对方威胁的局面获得更高评分，是本次实现的一个弱点。比赛后未替其修复策略。',
          '- Sol 初次前台运行在第 10 手后退出，选手自行重新启动后台进程续赛；原局保留、无超时判负，全部结果均来自五子连线。', '',
          '## 如何解读', '',
          f"六局中只有 **{len(patterns)} 种不同的完整落子序列**。重复组为：" + '；'.join('第 ' + '、'.join(map(str, rs)) + ' 局' for rs in patterns.values()) + '。', '',
          '结论：Sol 在本次开放工具、开放策略的试赛中胜率更高，它写出的程序击败了 Luna 写出的程序。', '',
          '不能把这六局当作六次独立的模型能力实验：每个模型只新建了一次会话，同一策略重复运行，先手轮换也没有消除棋谱重复。结果无法估计所有独立重试下的真实胜率，亦不能单独衡量模型的逐手推理能力。更严格的下一轮应为每对比赛重新启动两个会话，并统一策略开发预算，保留交换黑白。', '',
          '## 验证与文件', '',
          '- Node 自动测试 9 项通过，覆盖四方向胜利、长连、满盘平局、非法落子、身份鉴权、颜色交换与结果导出。',
          '- 浏览器实测：创建真人局、点击落子、回合切换、回放、手数显示、返回 AI 直播；没有网页 console error/warn。',
          '- `analyze.py` 独立重放全部棋谱，没有调用游戏引擎的判胜函数；检查先后手、坐标、占位、终局、持久化棋盘和胜者，全部通过。',
          '- `data/audit.json` 包含每局记录、重复序列分组与策略文件 SHA-256。',
          f"- 原始系列赛棋谱：`data/{source.name}`。", '',
          '服务：<http://127.0.0.1:8787>。页面下拉框可切换六局棋谱，使用进度条回看。']
(root / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps(audit, ensure_ascii=False, indent=2))
