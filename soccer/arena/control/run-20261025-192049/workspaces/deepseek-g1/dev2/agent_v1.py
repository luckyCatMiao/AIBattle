#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""3V3 足球 · deepseek-v4.1-flash 参赛程序。

从 simulation.js 读出的关键机制
--------------------------------
1. 决策窗口 = 20 帧 = 1 秒，双方同时提交整段 20 帧后统一推进。
   => 对手这 20 帧的输入在窗口开始时就已锁定，**本窗口内无法对本窗口新发生的事做反应**。
2. 从禁区外沿（距门线约 9 格）射门，球飞约 0.94 秒（≈19 帧）→ 在窗口第 0 帧起脚时，
   球正好在本窗口内到门线，对方门将完全没有反应时间。落点只要离门将 > 0.82 格即必进。
3. 球员不能进对方禁区；禁区深 9 格 => 射手最靠前只能站到距门线 9 格。
4. 球离脚后走直线。挡射门的唯一办法是有人站在球与球门连线之间：
   距球 r、球距门 D 时可封 ±2.5r/D 的扇面，控制半径 0.82 => r ≤ 0.33D 就能封死全部角度。
5. 控球者离球固定 0.62 格；对手只要离球 < 0.50 格且更近就能抢断。
   => 贴身逼抢（贴到离球 0.45 格）几乎是必抢断。
6. 球速 11 格/秒 >> 球员 3.15 格/秒 => 传球能瞬间把球送过防守人。

策略
----
进攻：得球先看有无「无遮挡射门」→ 有就第 0 帧起脚打离门将远的死角；
      被贴防就一脚传给无人盯防的队友，队友接球当帧起脚（一次性配合，防守方本窗口无法调整）；
      门将得球立刻大脚解围。
防守：最近球员永远贴到离球 0.45 格（抢断 + 封死射门扇面），第二人补位，门将守门线。
"""

import sys
import json
import math
import os

DBG = bool(os.environ.get('SOCCER_DEBUG'))
HIGH_OUTLET = bool(os.environ.get('SOCCER_HIGH'))
REACT0 = float(os.environ.get('SOCCER_REACT', '1.15'))
LONG_BALL = os.environ.get('SOCCER_LONG', '1') != '0'
LONG_BALL_D = float(os.environ.get('SOCCER_LONGD', '16'))
SAFE_M = float(os.environ.get('SOCCER_SAFE', '0.62'))
YBAND = float(os.environ.get('SOCCER_YBAND', '0.4'))
# 是否强制「绝不踏入对方禁区」。默认关闭：自然追球行为更强（见 review.md 自测数据）。
GUARD = os.environ.get('SOCCER_GUARD', '0') != '0'

# ------------------------------------------------------------------ 常量
W = 44.0
H = 26.0
DT = 0.05
R_U = 0.34
R_B = 0.22
SPEED = 3.15
DRIB_F = 0.58
CTRL = 0.82
KICK_P = 11.0
FRICTION = 0.978
WALL_R = 0.72
MOUTH_LO = 10.5
MOUTH_HI = 15.5
POST_LO = 10.0
POST_HI = 16.0
S2 = 0.7071067811865476

DIRV = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-S2, -S2), 'UR': (S2, -S2), 'DL': (-S2, S2), 'DR': (S2, S2),
}


def in_box(x, y, box):
    return box[0] - 0.02 <= x <= box[2] + 0.02 and box[1] - 0.02 <= y <= box[3] + 0.02


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def hyp(a, b):
    return math.sqrt(a * a + b * b)


def dir_for(dx, dy):
    if dx == 0.0 and dy == 0.0:
        return 'N'
    l = math.sqrt(dx * dx + dy * dy)
    dx /= l
    dy /= l
    best, bd = 'N', -2.0
    for k, v in DIRV.items():
        d = v[0] * dx + v[1] * dy
        if d > bd:
            bd = d
            best = k
    return best


def ang(ax, ay, bx, by):
    return int(round(math.degrees(math.atan2(by - ay, bx - ax)))) % 360


# ------------------------------------------------------------------ 球轨迹
def ball_track(bx, by, vx, vy, frames):
    out = []
    x, y = bx, by
    X, Y = vx, vy
    for _ in range(frames):
        x += X * DT
        y += Y * DT
        if y < R_B:
            y = R_B
            Y = -Y * WALL_R
        elif y > H - R_B:
            y = H - R_B
            Y = -Y * WALL_R
        X *= FRICTION
        Y *= FRICTION
        out.append((x, y))
    return out


def predict_cross(ball, own_line, sgn):
    """球是否会飞向本方门线；返回越过门线时的 y。"""
    vx = ball.get('vx') or 0.0
    vy = ball.get('vy') or 0.0
    if hyp(vx, vy) < 0.8:
        return None
    if (sgn > 0 and vx > -0.3) or (sgn < 0 and vx < 0.3):
        return None
    x, y = ball['x'], ball['y']
    X, Y = vx, vy
    for _ in range(140):
        x += X * DT
        y += Y * DT
        if y < R_B:
            y = R_B
            Y = -Y * WALL_R
        elif y > H - R_B:
            y = H - R_B
            Y = -Y * WALL_R
        X *= FRICTION
        Y *= FRICTION
        if (sgn > 0 and x <= own_line + 0.35) or (sgn < 0 and x >= own_line - 0.35):
            return y
    return None


def keeper_y(ball, own_line, sgn):
    """门将站位：球在飞行取门线交点，否则站球对两门柱张角的角平分线。"""
    cross = predict_cross(ball, own_line, sgn)
    if cross is not None and POST_LO - 2.0 <= cross <= POST_HI + 2.0:
        return clamp(cross, 10.9, 15.1)
    bx, by = ball['x'], ball['y']
    ax, ay = own_line - bx, POST_LO - by
    bx2, by2 = own_line - bx, POST_HI - by
    la = hyp(ax, ay) or 1.0
    lb = hyp(bx2, by2) or 1.0
    ux, uy = ax / la + bx2 / lb, ay / la + by2 / lb
    l = hyp(ux, uy)
    if l < 1e-6 or abs(ux) < 1e-6:
        return clamp(by, 10.9, 15.1)
    ux, uy = ux / l, uy / l
    t = (own_line - bx) / ux
    return clamp(by + uy * t, 10.9, 15.1)


# ------------------------------------------------------------------ 射门 / 传球评估
def eval_shot(bx, by, tx, ty, opps, react_delay=1.0):
    """直线射门可行性。react_delay = 对手开始反应前的时间（本窗口起脚时≈1 秒）。"""
    dx, dy = tx - bx, ty - by
    d = hyp(dx, dy)
    if d < 0.6:
        return (False, -9.0)
    ux, uy = dx / d, dy / d
    x, y, v, t = bx, by, KICK_P, 0.0
    margin = 1e9
    for _ in range(280):
        dv = v * DT
        x += ux * dv
        y += uy * dv
        v *= FRICTION
        t += DT
        if y < R_B + 0.04 or y > H - R_B - 0.04:
            return (False, -9.0)
        for o in opps:
            dd = hyp(o['x'] - x, o['y'] - y)
            reach = SPEED * max(0.0, t - react_delay)
            m = dd - reach - CTRL
            if m < margin:
                margin = m
        if t > 3.2 or abs(x - tx) < 0.35:
            break
    return (margin > 0.03, margin)


def best_shot(bx, by, opps, goal_line, keeper, react_delay=1.0, max_d=26.0):
    if abs(goal_line - bx) > max_d:
        return None
    best = None
    for ty in (10.7, 11.4, 12.1, 12.8, 13.0, 13.2, 13.9, 14.6, 15.3):
        ok, margin = eval_shot(bx, by, goal_line, ty, opps, react_delay)
        if not ok:
            continue
        kd = abs(keeper['y'] - ty) if keeper else 4.0
        score = margin + min(kd, 6.0) * 0.5
        if best is None or score > best[0]:
            best = (score, ty, margin)
    return best


def best_pass(bx, by, mates, opps, goal_line, keeper, sgn, kick_frame=0):
    """找「传到位后能形成射门」的传球。返回 (aim_x, aim_y, recv_idx, meet_frame, meet_x, meet_y, shot_ty)。"""
    react = max(0.0, (20 - kick_frame) * DT)
    best = None
    for T in mates:
        for lead in (0.0, 2.5, 5.0):
            px = T['x'] + sgn * lead
            py = T['y']
            if px < R_U + 0.2 or px > W - R_U - 0.2:
                continue
            d = hyp(px - bx, py - by)
            if d < 2.2 or d > 26.0:
                continue
            ux, uy = (px - bx) / d, (py - by) / d
            x, y, v = bx, by, KICK_P
            meet = None
            for k in range(1, 42):
                x += ux * v * DT
                y += uy * v * DT
                v *= FRICTION
                if y < R_B + 0.04 or y > H - R_B - 0.04:
                    break
                if x < R_B or x > W - R_B:
                    break
                t = k * DT
                blocked = False
                for o in opps:
                    dd = hyp(o['x'] - x, o['y'] - y)
                    if dd - SPEED * max(0.0, t - react) - CTRL < 0.0:
                        blocked = True
                        break
                if blocked:
                    break
                if hyp(T['x'] - x, T['y'] - y) <= SPEED * t + 0.70:
                    meet = (x, y, k)
                    break
            if meet is None:
                continue
            mx, my, mk = meet
            sh = best_shot(mx, my, opps, goal_line, keeper,
                           react_delay=max(0.0, (20 - mk) * DT), max_d=24.0)
            gain = (3.0 + sh[2]) if sh else 0.0
            adv = (mx - bx) * sgn * 0.30
            sc = gain + adv - mk * 0.06
            if best is None or sc > best[0]:
                best = (sc, px, py, T['index'], mk, mx, my, sh[1] if sh else None)
    return best


# ------------------------------------------------------------------ 主决策
def decide(obs):
    me = obs.get('yourTeam', 0)
    n = int(obs.get('teamSize', 3))
    units = obs.get('units', [])
    mine = sorted([u for u in units if u['team'] == me], key=lambda u: u['index'])
    opps = [u for u in units if u['team'] != me]
    ball = obs.get('ball') or {'x': W / 2, 'y': H / 2, 'vx': 0, 'vy': 0, 'owner': None}
    if not mine:
        return neutral(n)

    sgn = 1.0 if me == 0 else -1.0
    goal_line = 43.0 if me == 0 else 1.0      # 对方门线（球越过即得分）
    own_line = 1.0 if me == 0 else 43.0       # 本方门线
    if me == 0:
        opp_box = (34.0, 6.0, 43.0, 20.0)
    else:
        opp_box = (1.0, 6.0, 10.0, 20.0)

    score = obs.get('score') or [0, 0]
    tleft = obs.get('timeLeft')
    tleft = 999.0 if tleft is None else float(tleft)
    golden = bool(obs.get('golden'))
    if golden:
        desperate = True
    elif score[me] < score[1 - me]:
        desperate = tleft < 45.0
    elif score[me] == score[1 - me]:
        desperate = tleft < 22.0
    else:
        desperate = False

    my_ids = set(u['id'] for u in mine)
    owner = ball.get('owner')
    keeper = next((o for o in opps if o['index'] == 0), None)
    poss = 'mine' if owner in my_ids else ('theirs' if owner else 'loose')
    carrier = next((u for u in mine if u['id'] == owner), None)

    def safe(x, y, m=SAFE_M):
        x1, y1, x2, y2 = opp_box
        if y1 - YBAND < y < y2 + YBAND:
            if me == 0:
                if x > x1 - m:
                    x = x1 - m
            else:
                if x < x2 + m:
                    x = x2 + m
        return (clamp(x, R_U + 0.05, W - R_U - 0.05), clamp(y, R_U + 0.05, H - R_U - 0.05))

    tgt = {}
    act = {}
    field = [u for u in mine if u['index'] != 0] if n >= 2 else list(mine)

    def d2b(u):
        return hyp(u['x'] - ball['x'], u['y'] - ball['y'])

    fld = sorted(field, key=d2b)

    # ---------------------------------------------------------- 门将
    if n >= 2:
        k = mine[0]
        kx = own_line + sgn * 0.32
        cross = predict_cross(ball, own_line, sgn)
        if cross is not None:
            ky = clamp(cross, 10.9, 15.1)
        else:
            ky = clamp(13.0 + (ball['y'] - 13.0) * 0.55, 11.0, 15.0)
        if carrier is not None and carrier['index'] == 0:
            # 门将持球 -> 立刻出球
            p = best_pass(ball['x'], ball['y'], fld, opps, goal_line, keeper, sgn, 0)
            if p is not None:
                act[0] = ('kick', ang(ball['x'], ball['y'], p[1], p[2]))
            else:
                act[0] = ('kick', ang(ball['x'], ball['y'], goal_line, clamp(ball['y'], 5.0, 21.0)))
            tgt[0] = (k['x'], k['y'])
        elif poss == 'loose' and hyp(ball['x'] - own_line, ball['y'] - 13.0) < 12.0:
            bestd = min([d2b(u) for u in fld] or [99.0])
            if hyp(k['x'] - ball['x'], k['y'] - ball['y']) <= bestd + 0.6:
                tgt[0] = (ball['x'], ball['y'])
            else:
                tgt[0] = (kx, ky)
        elif desperate and poss == 'mine' and abs(ball['x'] - own_line) > 26.0:
            # 必须抢分且球在对方半场：门将压到中线当出球点
            tgt[0] = (own_line + sgn * 14.0, clamp(ball['y'], 8.0, 18.0))
        else:
            tgt[0] = (kx, ky)

    # ---------------------------------------------------------- 进攻
    if poss == 'mine' and carrier is not None:
        ci = carrier['index']
        bx, by = ball['x'], ball['y']
        sh = best_shot(bx, by, opps, goal_line, keeper, REACT0, max_d=27.0)
        tgt[ci] = (carrier['x'], carrier['y'])
        if sh is not None:
            act[ci] = ('kick', ang(bx, by, goal_line, sh[1]))
        else:
            mates = [u for u in mine if u['index'] != ci and u['index'] != 0] or \
                    [u for u in mine if u['index'] != ci]
            p = best_pass(bx, by, mates, opps, goal_line, keeper, sgn, 0)
            if DBG:
                sys.stderr.write('W%d MINE (%.1f,%.1f) pass=%s mates=%s opps=%s\n' % (
                    obs.get('frame', 0), bx, by,
                    ('%.2f u%d meet(%.1f,%.1f)f%d ty=%s' % (p[0], p[3], p[5], p[6], p[4], p[7])) if p else 'None',
                    [(u['index'], round(u['x'], 1), round(u['y'], 1)) for u in mates],
                    [(o['index'], round(o['x'], 1), round(o['y'], 1)) for o in opps]))
            if p is not None and p[0] > 0.8:
                _, px, py, ridx, mk, mx, my, sty = p
                act[ci] = ('kick', ang(bx, by, px, py))
                tgt[ridx] = (mx, my)
                if sty is not None:
                    act[ridx] = ('kick', ang(mx, my, goal_line, sty))
            else:
                near = min([hyp(o['x'] - bx, o['y'] - by) for o in opps] or [99.0])
                gd = abs(goal_line - bx)
                if gd > LONG_BALL_D and LONG_BALL:
                    # 长传打到禁区外沿空当，全队压上抢第二点
                    ly = clamp(by + (8.0 if (ci % 2) else -8.0), 6.0, 20.0)
                    act[ci] = ('kick', ang(bx, by, goal_line - sgn * 9.4, ly))
                elif near < 1.5:
                    act[ci] = ('kick', ang(bx, by, goal_line, clamp(by, 4.0, 22.0)))
                else:
                    aimy = 13.0
                    if keeper is not None:
                        aimy = 10.9 if keeper['y'] >= 13.0 else 15.1
                    tgt[ci] = safe(goal_line - sgn * 9.9, aimy)
        others = [u for u in fld if u['index'] != ci]
        slots = support_slots(goal_line, sgn, ball['y'], len(others))
        for u, s in zip(sorted(others, key=d2b), slots):
            if u['index'] not in tgt:
                tgt[u['index']] = safe(*s)

    # ---------------------------------------------------------- 防守
    elif poss == 'theirs':
        bx, by = ball['x'], ball['y']
        dx, dy = own_line - bx, 13.0 - by
        l = hyp(dx, dy) or 1.0
        ux, uy = dx / l, dy / l
        if n == 1:
            # 1 人局：唯一一人兼门将。球离门远才上抢，进射程就退守门线站角平分线。
            if abs(bx - own_line) > 16.0:
                tgt[0] = safe(bx + ux * 0.45, by + uy * 0.45)
            else:
                tgt[0] = (own_line + sgn * 0.32, keeper_y(ball, own_line, sgn))
        else:
            defenders = fld
            if HIGH_OUTLET and len(fld) >= 2:
                # 留一人常驻对方禁区外沿当接应点（其余回防）
                high = max(fld, key=lambda u: (u['x'] - bx) * sgn)
                defenders = [u for u in fld if u['index'] != high['index']]
                tgt[high['index']] = safe(goal_line - sgn * 9.9, clamp(13.0 + (by - 13.0) * 0.5, 7.0, 19.0))
            if len(defenders) >= 1:
                p = defenders[0]
                tgt[p['index']] = safe(bx + ux * 0.45, by + uy * 0.45)
            if len(defenders) >= 2:
                p = defenders[1]
                tgt[p['index']] = safe(bx + ux * 4.0, by + uy * 4.0)
            rest = defenders[2:]
            if rest:
                threats = sorted(opps, key=lambda o: -abs(o['x'] - own_line))[:len(rest)]
                for u, t in zip(rest, threats):
                    ddx, ddy = own_line - t['x'], 13.0 - t['y']
                    ll = hyp(ddx, ddy) or 1.0
                    tgt[u['index']] = safe(t['x'] + ddx / ll * 2.4, t['y'] + ddy / ll * 2.4)
    # ---------------------------------------------------------- 松球
    else:
        if n == 1:
            # 1 人局：唯一一人兼门将。抢得到就抢，否则退回球门线；
            # 预测 60 帧（3 秒），够不到就奔向球会停下的位置，绝不无谓追尾。
            bxx, byy = ball['x'], ball['y']
            trk = ball_track(bxx, byy, ball.get('vx') or 0.0, ball.get('vy') or 0.0, 60)
            sp = hyp(ball.get('vx') or 0.0, ball.get('vy') or 0.0)
            opp_near = min([hyp(o['x'] - bxx, o['y'] - byy) for o in opps] or [99.0])
            me_d = hyp(mine[0]['x'] - bxx, mine[0]['y'] - byy)
            kk = 999
            for k in range(len(trk)):
                if hyp(mine[0]['x'] - trk[k][0], mine[0]['y'] - trk[k][1]) <= SPEED * k * DT + 0.60:
                    kk = k
                    break
            if abs(bxx - own_line) < 17.0 and (sp > 2.5 or me_d > opp_near + 1.2 or kk >= 999):
                tgt[0] = (own_line + sgn * 0.32, keeper_y(ball, own_line, sgn))
            elif kk >= 999:
                tgt[0] = safe(*trk[-1])
            else:
                tgt[0] = safe(*trk[kk])
            track = trk
        else:
            track = ball_track(ball['x'], ball['y'], ball.get('vx') or 0.0, ball.get('vy') or 0.0, 45)
            rank = []
            for u in fld:
                bk = 999
                for k in range(len(track)):
                    bx2, by2 = track[k]
                    if hyp(u['x'] - bx2, u['y'] - by2) <= SPEED * k * DT + 0.60:
                        bk = k
                        break
                rank.append((bk, u))
        if n == 1:
            rank = []
        rank.sort(key=lambda z: z[0])
        for idx, (k, u) in enumerate(rank):
            if k >= 999:
                tgt[u['index']] = safe(ball['x'], ball['y'])
            elif idx == 0:
                tgt[u['index']] = safe(*track[min(k, len(track) - 1)])
            elif idx == 1 and k <= 15:
                tgt[u['index']] = safe(*track[min(k, len(track) - 1)])
            else:
                tgt[u['index']] = safe(goal_line - sgn * 6.0,
                                       clamp(ball['y'] + (idx - 1) * 5.0 - 5.0, 3.0, 23.0))
        if len(fld) >= 3:
            u = rank[-1][1]
            tgt[u['index']] = safe(own_line + sgn * 13.0, clamp(ball['y'], 4.0, 22.0))

    for u in mine:
        if u['index'] not in tgt:
            tgt[u['index']] = (u['x'], u['y'])
    for i in list(tgt.keys()):
        tgt[i] = safe(*tgt[i])

    gd = GUARD
    if GUARD and opp_box is not None and in_box(ball['x'], ball['y'], (opp_box[0] - 0.6, opp_box[1] - 0.6, opp_box[2] + 0.6, opp_box[3] + 0.6)):
        gd = False   # 球在禁区内/边沿：允许进去抢（裁判会判任意球）
    return build(mine, tgt, act, ball, poss, carrier, opp_box, gd)


def support_slots(goal_line, sgn, ball_y, m):
    xs = goal_line - sgn * 9.9
    offs = [-7.0, 7.0, 0.0, -12.5, 12.5, -3.5]
    out = []
    for k in range(m):
        y = clamp(13.0 + offs[k % len(offs)], 2.5, 23.5)
        out.append((xs, y))
    return out


# ------------------------------------------------------------------ 生成帧
def build(mine, tgt, act, ball, poss, carrier, opp_box=None, guard=None):
    pos = dict((u['index'], [u['x'], u['y']]) for u in mine)
    bx, by = ball['x'], ball['y']
    bvx = ball.get('vx') or 0.0
    bvy = ball.get('vy') or 0.0
    owner = None
    if carrier is not None:
        owner = carrier['index']
        bvx = bvy = 0.0
    done = set()
    frames = []
    for f in range(20):
        fr = []
        for u in mine:
            i = u['index']
            tx, ty = tgt.get(i, (u['x'], u['y']))
            px, py = pos[i]
            dx, dy = tx - px, ty - py
            d = hyp(dx, dy)
            dirn = 'N'
            aim = None
            kick = False
            if i == owner and i in act and i not in done:
                aim = act[i][1]
                kick = True
                done.add(i)
            elif d > 0.10:
                dirn = dir_for(dx, dy)
                v = DIRV[dirn]
                sp = SPEED * (DRIB_F if i == owner else 1.0)
                nx = clamp(px + v[0] * sp * DT, R_U, W - R_U)
                ny = clamp(py + v[1] * sp * DT, R_U, H - R_U)
                if guard and opp_box is not None and in_box(nx, ny, opp_box):
                    # 会踩进对方禁区（犯规）：改为沿边界滑动，并发出对应方向
                    if not in_box(px, ny, opp_box):
                        nx, ny = px, ny
                        dirn = 'U' if v[1] < 0 else 'D'
                    elif not in_box(nx, py, opp_box):
                        nx, ny = nx, py
                        dirn = 'L' if v[0] < 0 else 'R'
                    else:
                        nx, ny = px, py
                        dirn = 'N'
                pos[i] = [nx, ny]
            fr.append({'dir': dirn, 'aim': aim, 'kick': kick})
        # 推进球（内部近似）
        if owner is not None and owner in done:
            a = act[owner][1]
            rad = math.radians(a)
            fx, fy = math.cos(rad), math.sin(rad)
            u = pos[owner]
            bx = u[0] + fx * (R_U + R_B + 0.03)
            by = u[1] + fy * (R_U + R_B + 0.03)
            bvx, bvy = fx * KICK_P, fy * KICK_P
            owner = None
        elif owner is None:
            bx += bvx * DT
            by += bvy * DT
            if by < R_B:
                by = R_B
                bvy = -bvy * WALL_R
            elif by > H - R_B:
                by = H - R_B
                bvy = -bvy * WALL_R
            if bx < R_B or bx > W - R_B:
                bx = clamp(bx, R_B, W - R_B)
                bvx = -bvx * WALL_R
            bvx *= FRICTION
            bvy *= FRICTION
            if abs(bvx) < 0.02:
                bvx = 0.0
            if abs(bvy) < 0.02:
                bvy = 0.0
            bi, bd = None, 1e9
            for u in mine:
                i = u['index']
                dd = hyp(pos[i][0] - bx, pos[i][1] - by)
                if dd < bd:
                    bd = dd
                    bi = i
            if bi is not None and bd < CTRL:
                owner = bi
                bvx = bvy = 0.0
        frames.append(fr)
    return {'inputs': frames}


def neutral(n):
    return {'inputs': [[{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)] for _ in range(20)]}


def main():
    last_n = 3
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            last_n = int(obs.get('teamSize', last_n))
            out = decide(obs)
        except Exception as e:
            sys.stderr.write('ERR %s\n' % e)
            out = neutral(last_n)
        sys.stdout.write(json.dumps(out, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
