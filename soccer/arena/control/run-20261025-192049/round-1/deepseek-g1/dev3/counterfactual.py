# -*- coding: utf-8 -*-
"""反事实审计：在真实对局里，如果我方持球者「此刻直接起脚」会怎样？
对每个我方控球的窗口，把该窗口换成一脚射门（7 个落点），
用 pysim 推进 30 帧（对手沿用它在回放里真实提交的下一窗口输入），统计进球率。
用法: python dev3/counterfactual.py dev3/g3c.jsonl 0
"""
import json, sys, os, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import pysim

path = sys.argv[1]
me = int(sys.argv[2]) if len(sys.argv) > 2 else 0
recs = [json.loads(l) for l in open(path, encoding='utf-8')]
GL = 43.0 if me == 0 else 1.0
NEUTRAL = ('N', None, False)


def st_from(state):
    s = pysim.St()
    s.n = len([u for u in state['units'] if u['team'] == 0])
    s.units = []
    for u in state['units']:
        nu = pysim.Unit(u['team'], u['index'])
        nu.x, nu.y, nu.fx, nu.fy = u['x'], u['y'], u['fx'], u['fy']
        nu.kickCd, nu.controlLock, nu.stealLock, nu.foulLock = u['kickCd'], u['controlLock'], u['stealLock'], u['foulLock']
        s.units.append(nu)
    s.units.sort(key=lambda z: (z.team, z.index))
    b = state['ball']
    s.bx, s.by, s.bvx, s.bvy = b['x'], b['y'], b['vx'], b['vy']
    s.owner = -1
    if b.get('owner'):
        for i, u in enumerate(s.units):
            if pysim.unit_id(u) == b['owner']:
                s.owner = i
    s.score = list(state['score'])
    s.frame = state['frame']
    s.freeze = state['freeze']
    s.golden = state['golden']
    s.goldenEnd = state['goldenEnd']
    s.kickoffTeam = state['kickoffTeam']
    s.status = 'playing'
    s.half = state['half']
    return s


def parse_aim(a):
    if isinstance(a, (int, float)):
        r = math.radians(a)
        return (math.cos(r), math.sin(r))
    if isinstance(a, str):
        return pysim.DIRV.get(a)
    return None


def window_to_map(win, team, n):
    """回放窗口 -> [ {(team,index): (dir,aim,kick)} x 20 ]"""
    out = []
    for fr in win:
        m = {}
        for j in range(n):
            d = fr[j] or {}
            m[(team, j)] = (d.get('dir') or 'N', parse_aim(d.get('aim')), bool(d.get('kick')))
        out.append(m)
    return out


def advance(s, mine_frames, opp_frames, opp_team, horizon):
    for f in range(horizon):
        inp = []
        for u in s.units:
            if u.team == me:
                src = mine_frames[f] if f < len(mine_frames) else {}
            else:
                src = opp_frames[f] if f < len(opp_frames) else {}
            inp.append(src.get((u.team, u.index), NEUTRAL))
        g = pysim.step(s, inp, s.kickoffTeam)
        if g >= 0:
            return g
    return -1


def aim_deg(ax, ay, bx, by):
    return math.degrees(math.atan2(by - ay, bx - ax)) % 360


poss_windows = 0
scorable = 0
detail = []
for i in range(len(recs) - 1):
    st = recs[i]['state']
    nxt = recs[i + 1]
    if 'w0' not in nxt:
        continue
    w_me = nxt['w0'] if me == 0 else nxt['w1']
    w_op = nxt['w1'] if me == 0 else nxt['w0']
    b = st['ball']
    own = b.get('owner')
    if not own or int(own[1]) != me:
        continue
    poss_windows += 1
    n = len([u for u in st['units'] if u['team'] == me])
    opp_frames = window_to_map(w_op, 1 - me, n)
    ci = int(own.split('u')[1])
    best = None
    for ty in [10.7, 11.5, 12.3, 13.1, 13.9, 14.7, 15.3]:
        deg = aim_deg(b['x'], b['y'], GL, ty)
        mine = []
        for f in range(20):
            m = {}
            if f == 0:
                m[(me, ci)] = ('N', parse_aim(deg), True)
            mine.append(m)
        g = advance(st_from(st), mine, opp_frames, 1 - me, 30)
        if g == me:
            best = ty
            break
    if best is not None:
        scorable += 1
        detail.append((i, round(b['x'], 1), round(b['y'], 1), best))

print('我方控球窗口 %d，其中「直接起脚就能进」的窗口 %d (%.0f%%)' % (
    poss_windows, scorable, 100.0 * scorable / max(1, poss_windows)))
for d in detail:
    print('   win=%d ball=(%.1f,%.1f) aim_y=%.1f' % d)
