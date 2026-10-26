# -*- coding: utf-8 -*-
"""Build the markdown tables used in review.md from the official round-1
report and the replay analysis in work/r1_summary.json."""
import io, json, os, collections

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = os.path.dirname(os.path.dirname(HERE))  # .../run-20261025-192049
ME = 'deepseek-g1'


def main():
    results = json.load(io.open(os.path.join(RUN, 'results.json'), encoding='utf-8'))
    summ = {x['id']: x for x in json.load(io.open(os.path.join(HERE, 'work', 'r1_summary.json'), encoding='utf-8'))}
    lines = []
    lines.append('| 对局 | 人数 | 座位（我/敌） | 结果 | 比分 | 帧数 | 模拟秒 | 引擎耗时(s) | 踢球(我/敌) | 射正(我/敌) | 扑救(我/敌) | 控球(我/敌) |')
    lines.append('|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    agg = collections.Counter()
    for r in results:
        gid = r['id']; s = summ[gid]
        seats = r['seats']; mi = seats.index(ME); oi = 1 - mi
        my, op = r['scores'][ME], r['scores']['sol']
        win = r['winner']
        res = '胜' if win == ME else ('平' if win is None else '负')
        my_shots = [x for x in s['shots'] if x['team'] == s['myteam']]
        op_shots = [x for x in s['shots'] if x['team'] != s['myteam']]
        my_on = sum(1 for x in my_shots if x['on_target'])
        op_on = sum(1 for x in op_shots if x['on_target'])
        frames = r['frames']; sim = frames / 20.0
        lines.append('| %s | %d | %s/%s | %s | %d:%d | %d | %.2f | %.2f | %d/%d | %d/%d | %d/%d | %d/%d |' % (
            gid, r['teamSize'], seats[0], seats[1], res, my, op, frames, sim, r['duration'],
            r['stats'][mi]['kicks'], r['stats'][oi]['kicks'], my_on, op_on,
            r['saves'][mi], r['saves'][oi],
            r['stats'][mi]['possession'], r['stats'][oi]['possession']))
        agg['games'] += 1
        agg['wins'] += 1 if win == ME else 0
        agg['draws'] += 1 if win is None else 0
        agg['losses'] += 1 if win not in (ME, None) else 0
        agg['gf'] += my; agg['ga'] += op
        agg['my_kicks'] += r['stats'][mi]['kicks']; agg['op_kicks'] += r['stats'][oi]['kicks']
        agg['my_on'] += my_on; agg['op_on'] += op_on
        agg['my_saves'] += r['saves'][mi]; agg['op_saves'] += r['saves'][oi]
        agg['my_poss'] += r['stats'][mi]['possession']; agg['op_poss'] += r['stats'][oi]['possession']
        agg['ts%d_games' % r['teamSize']] += 1
        if win == ME: agg['ts%d_w' % r['teamSize']] += 1
        elif win is None: agg['ts%d_d' % r['teamSize']] += 1
        else: agg['ts%d_l' % r['teamSize']] += 1
    # goal table
    glines = []
    glines.append('| 对局 | 模拟时间 | 帧 | 进球方 | 射手 | 射门起点 | 距门线 | 飞行(s) | 瞄点 y |')
    glines.append('|---|---:|---:|---|---|---|---:|---:|---:|')
    for r in results:
        s = summ[r['id']]
        for g in s['goals']:
            side = '我' if g['team'] == s['myteam'] else '敌'
            if g.get('kick_x') is None:
                glines.append('| %s | %.2f | %d | %s | %s | —（抢断/折射后进球） | — | — | — |' % (
                    r['id'], g['t'], g['frame'], side, g.get('scorer')))
            else:
                glines.append('| %s | %.2f | %d | %s | %s | (%.2f, %.2f) | %.2f | %.2f | %s |' % (
                    r['id'], g['t'], g['frame'], side, g.get('scorer'),
                    g['kick_x'], g['kick_y'], g['dist_to_goal'], g['flight_s'],
                    g.get('aim_y')))
    out = io.open(os.path.join(HERE, 'work', 'r1_tables.md'), 'w', encoding='utf-8', newline='\n')
    out.write('## 附：第 1 轮 20 局逐局数据\n\n')
    out.write('\n'.join(lines))
    out.write('\n\n合计：%d 局 %d 胜 %d 平 %d 负；进球 %d:%d；踢球 %d:%d；射正 %d:%d；扑救 %d:%d；控球帧 %d:%d。\n' % (
        agg['games'], agg['wins'], agg['draws'], agg['losses'], agg['gf'], agg['ga'],
        agg['my_kicks'], agg['op_kicks'], agg['my_on'], agg['op_on'],
        agg['my_saves'], agg['op_saves'], agg['my_poss'], agg['op_poss']))
    out.write('\n按人数：')
    for n in range(1, 7):
        out.write('%dv%d %d胜%d平%d负；' % (n, n, agg['ts%d_w' % n], agg['ts%d_d' % n], agg['ts%d_l' % n]))
    out.write('\n\n## 附：全部进球明细\n\n')
    out.write('\n'.join(glines))
    out.write('\n')
    out.close()
    print('wrote', out.name)
    print('\n'.join(lines))
    print('\n'.join(glines[:8]))


if __name__ == '__main__':
    main()
