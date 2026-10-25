#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""3v3 足球 agent：每行一个观察，输出 20 帧输入。

核心思路：
- 用内部简化前向模型预测本窗口 20 帧（自己的球员按指令移动、球按物理飞行）。
- 控球时以“把球藏在离对手最远的一侧”为原则护球推进，有清晰射门线路时精确角度射门。
- 无球时最近的球员压迫/拦截，指定门将守在自家球门前，其余人补位/前插。
"""
import sys
import json
import math
from collections import OrderedDict

# ---------------- 物理常量（来自 catalog.js） ----------------
W, H = 44, 26
DT = 1.0 / 20
MOVE_SPEED = 3.15
UNIT_R = 0.34
BALL_R = 0.22
CONTROL_R = 0.82
TACKLE_MARGIN = 0.12
DRIBBLE_D = 0.62
KICK_POWER = 14.0
FRICTION = 0.97
WALL_REST = 0.72
KICK_CD_FRAMES = 7        # 0.35s
CONTROL_LOCK_FRAMES = 6   # 0.30s
STEAL_LOCK_FRAMES = 4     # 0.18s
GOAL_TOP, GOAL_BOT = 10.5, 15.5

DIRS = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-math.sqrt(0.5), -math.sqrt(0.5)), 'UR': (math.sqrt(0.5), -math.sqrt(0.5)),
    'DL': (-math.sqrt(0.5), math.sqrt(0.5)), 'DR': (math.sqrt(0.5), math.sqrt(0.5)),
}

def clamp(v, a, b):
    return a if v < a else (b if v > b else v)

def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])

def norm_vec(x, y):
    l = math.hypot(x, y)
    if l < 1e-9:
        return 0.0, 0.0
    return x / l, y / l

def dir_name(vx, vy):
    """连续向量 -> 八方向名"""
    l = math.hypot(vx, vy)
    if l < 1e-6:
        return 'N'
    ang = math.degrees(math.atan2(vy, vx)) % 360.0
    idx = int((ang + 22.5) // 45.0) % 8
    return ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'][idx]

def dir_toward(frm, to):
    return dir_name(to[0] - frm[0], to[1] - frm[1])

def dir_vec(d):
    return DIRS.get(d, (0.0, 0.0))

def angle_to(frm, to):
    return math.degrees(math.atan2(to[1] - frm[1], to[0] - frm[0])) % 360.0

def seg_point_dist(a, b, p):
    """点 p 到线段 ab 的距离"""
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 < 1e-12:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / l2
    t = clamp(t, 0.0, 1.0)
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

# ---------------- 几何/边界 ----------------
def unit_clamp(p):
    x, y = p
    x = clamp(x, UNIT_R, W - UNIT_R)
    y = clamp(y, UNIT_R, H - UNIT_R)
    # 非球门高度的左右边墙在 tile x=0/W-1，单位中心需离墙 >= 1.34
    if y < GOAL_TOP - 0.16 or y > GOAL_BOT + 0.16:
        x = clamp(x, 1.0 + UNIT_R, W - 1.0 - UNIT_R)
    return (x, y)

def ball_wall_bounce(bx, by, vx, vy, in_mouth_y):
    """近似球墙反弹；返回 (x,y,vx,vy, goal)  goal: 0/1 表示进球方（0=右门/队伍0得分）"""
    # 门线判定（先于墙）
    if by >= GOAL_TOP and by <= GOAL_BOT:
        if bx <= 1.0:
            return bx, by, vx, vy, 1
        if bx >= W - 1.0:
            return bx, by, vx, vy, 0
    lim_lo, lim_hi = BALL_R + 1.0, W - 1.0 - BALL_R
    if by < GOAL_TOP or by > GOAL_BOT:
        if bx < lim_lo:
            bx = lim_lo; vx = -vx * WALL_REST
        elif bx > lim_hi:
            bx = lim_hi; vx = -vx * WALL_REST
    else:
        if bx < BALL_R:
            bx = BALL_R; vx = -vx * WALL_REST
        elif bx > W - BALL_R:
            bx = W - BALL_R; vx = -vx * WALL_REST
    ylo, yhi = 1.0 + BALL_R, H - 1.0 - BALL_R
    if by < ylo:
        by = ylo; vy = -vy * WALL_REST
    elif by > yhi:
        by = yhi; vy = -vy * WALL_REST
    return bx, by, vx, vy, None

# ---------------- 内部状态（跨窗口记忆） ----------------
class Memory:
    def __init__(self):
        self.prev = {}      # unit id -> (x,y,frame)
        self.last_frame = None
        self.keeper_id = None
        self.match_key = None
    def velocity(self, uid, x, y, frame):
        p = self.prev.get(uid)
        out = (0.0, 0.0)
        if p is not None:
            dt = max(1, frame - p[2]) / 20.0
            vx = (x - p[0]) / dt; vy = (y - p[1]) / dt
            sp = math.hypot(vx, vy)
            if sp > 4.0:
                vx *= 4.0 / sp; vy *= 4.0 / sp
            out = (vx, vy)
        self.prev[uid] = (x, y, frame)
        return out

MEM = Memory()
_DBG = bool(__import__('os').environ.get('ADBG'))
_FRAME = 0

# ---------------- 内部前向模型 ----------------
class PlanUnit:
    __slots__ = ('id', 'team', 'index', 'x', 'y', 'facing', 'kickCd', 'controlLock',
                 'stealLock', 'is_mine')
    def __init__(self, d, mine):
        self.id = d['id']; self.team = d['team']; self.index = d['index']
        self.x = float(d['x']); self.y = float(d['y'])
        fx = float(d.get('facing', {}).get('x', 1.0)); fy = float(d.get('facing', {}).get('y', 0.0))
        self.facing = norm_vec(fx, fy)
        self.kickCd = int(round(float(d.get('kickCd', 0)) * 20))
        self.controlLock = int(round(float(d.get('controlLock', 0)) * 20))
        self.stealLock = 0
        self.is_mine = mine

def build_plan_units(obs, myteam):
    units = []
    for d in obs['units']:
        units.append(PlanUnit(d, d['team'] == myteam))
    return units

def forward_plan(units, ball, opp_vel, frames, policy):
    """推进 frames 帧，返回每帧输入列表。
    units: PlanUnit 列表（原地更新）；opp_vel: {id:(vx,vy)} 对手速度估计。
    policy(units, ball, frame_idx) -> {uid: (dir, aim, kick)}
    """
    my = [u for u in units if u.is_mine]
    opp = [u for u in units if not u.is_mine]
    out = []
    b = dict(ball)
    b.setdefault('owner', None)
    for k in range(frames):
        # 对手位置按估计速度外推（仅用于决策与拿球判定）
        for u in opp:
            v = opp_vel.get(u.id, (0.0, 0.0))
            u.x = clamp(u.x + v[0] * DT, UNIT_R, W - UNIT_R)
            u.y = clamp(u.y + v[1] * DT, UNIT_R, H - UNIT_R)
        decisions = policy(units, b, k)
        # 应用本队动作
        for u in my:
            dec = decisions.get(u.id)
            if dec is None:
                u.kickCd = max(0, u.kickCd - 1); u.controlLock = max(0, u.controlLock - 1)
                continue
            dname, aim, kick = dec
            u.kickCd = max(0, u.kickCd - 1)
            u.controlLock = max(0, u.controlLock - 1)
            dx, dy = dir_vec(dname)
            if aim is not None:
                a = math.radians(aim)
                u.facing = (math.cos(a), math.sin(a))
            elif dx or dy:
                u.facing = (dx, dy)
            if dx or dy:
                nx, ny = u.x + dx * MOVE_SPEED * DT, u.y + dy * MOVE_SPEED * DT
                nx, ny = unit_clamp((nx, ny))
                u.x, u.y = nx, ny
            if kick and b.get('owner') == u.id and u.kickCd <= 0 and u.controlLock <= 0:
                b['owner'] = None
                b['x'] = u.x + u.facing[0] * 0.59
                b['y'] = u.y + u.facing[1] * 0.59
                b['vx'] = u.facing[0] * KICK_POWER
                b['vy'] = u.facing[1] * KICK_POWER
                u.kickCd = KICK_CD_FRAMES
                u.controlLock = CONTROL_LOCK_FRAMES
        # 本队单位互相挤开（简化：只对本队做轻推，避免重叠）
        separate(my)
        # 球推进
        update_ball(b, units)
        out.append({u.id: decisions.get(u.id, ('N', None, False)) for u in my})
    return out

def separate(my):
    r2 = UNIT_R * 2
    for i in range(len(my)):
        for j in range(i + 1, len(my)):
            a, b = my[i], my[j]
            dx, dy = b.x - a.x, b.y - a.y
            d = math.hypot(dx, dy)
            if d >= r2 or d < 1e-6:
                continue
            push = (r2 - d) / 2
            dx /= d; dy /= d
            a.x -= dx * push; a.y -= dy * push
            b.x += dx * push; b.y += dy * push
            a.x, a.y = unit_clamp((a.x, a.y))
            b.x, b.y = unit_clamp((b.x, b.y))

def update_ball(b, units):
    if b.get('owner'):
        u = next((x for x in units if x.id == b['owner']), None)
        if u is None:
            b['owner'] = None
            return
        b['x'] = u.x + u.facing[0] * DRIBBLE_D
        b['y'] = u.y + u.facing[1] * DRIBBLE_D
        b['vx'] = 0.0; b['vy'] = 0.0
        try_possession(b, units)
        return
    steps = 4
    goal = None
    for _s in range(steps):
        b['x'] += b['vx'] * DT / steps
        b['y'] += b['vy'] * DT / steps
        bx, by, vx, vy, g = ball_wall_bounce(b['x'], b['y'], b['vx'], b['vy'],
                                             GOAL_TOP <= b['y'] <= GOAL_BOT)
        b['x'], b['y'], b['vx'], b['vy'] = bx, by, vx, vy
        if g is not None:
            goal = g
            break
    if goal is not None:
        # 重置到中圈（近似）
        b.update({'x': W / 2, 'y': H / 2, 'vx': 0.0, 'vy': 0.0, 'owner': None})
        return
    b['vx'] *= FRICTION; b['vy'] *= FRICTION
    if math.hypot(b['vx'], b['vy']) < 0.02:
        b['vx'] = 0.0; b['vy'] = 0.0
    try_possession(b, units)

def try_possession(b, units):
    if b.get('owner'):
        owner = next((u for u in units if u.id == b['owner']), None)
        if owner is None:
            b['owner'] = None
            return
        od = math.hypot(owner.x - b['x'], owner.y - b['y'])
        best = None; bd = 1e9
        for u in units:
            if u.team == owner.team or u.stealLock > 0 or u.controlLock > 0:
                continue
            d = math.hypot(u.x - b['x'], u.y - b['y'])
            if d < bd:
                bd = d; best = u
        if best is not None and bd < CONTROL_R and bd + TACKLE_MARGIN < od:
            b['owner'] = best.id
            owner.stealLock = STEAL_LOCK_FRAMES
        return
    best = None; bd = 1e9
    for u in units:
        if u.controlLock > 0 or u.stealLock > 0:
            continue
        d = math.hypot(u.x - b['x'], u.y - b['y'])
        if d < bd:
            bd = d; best = u
    if best is not None and bd < CONTROL_R:
        b['owner'] = best.id
        b['vx'] = 0.0; b['vy'] = 0.0

# ---------------- 决策策略 ----------------
def team_goal_x(team):
    return 43.0 if team == 0 else 0.0

def own_goal_x(team):
    return 0.0 if team == 0 else 43.0

def ball_pred(ball, nframes):
    """免费球轨迹预测（用于拦截点）"""
    x, y, vx, vy = ball['x'], ball['y'], ball.get('vx', 0.0), ball.get('vy', 0.0)
    pts = [(x, y)]
    for _ in range(nframes):
        for _s in range(4):
            x += vx * DT / 4; y += vy * DT / 4
            x, y, vx, vy, _g = ball_wall_bounce(x, y, vx, vy, GOAL_TOP <= y <= GOAL_BOT)
        vx *= FRICTION; vy *= FRICTION
        if math.hypot(vx, vy) < 0.02:
            vx = 0.0; vy = 0.0
        pts.append((x, y))
    return pts

def shot_target(pos, attack_dir, opps):
    """选择最佳射门目标点，返回 (target, clearance, dist) 或 None"""
    gx = 43.0 if attack_dir > 0 else 0.0
    best = None
    for ty in (10.8, 11.6, 13.0, 14.4, 15.2):
        T = (gx, ty)
        d = dist(pos, T)
        span = [(o.x, o.y) for o in opps]
        clr = min([seg_point_dist(pos, T, p) for p in span], default=99.0)
        # 越接近球门越容易得分，但穿人风险高
        need = 0.85 if d < 6.5 else (1.15 if d < 11 else 1.55)
        if clr < need:
            continue
        score = clr * 1.0 - 0.10 * d + (0.4 if ty in (10.8, 15.2) else 0.0)
        if best is None or score > best[3]:
            best = (T, clr, d, score)
    return None if best is None else (best[0], best[1], best[2])

def open_lane(owner, target, opps, need):
    for o in opps:
        if seg_point_dist((owner[0], owner[1]), target, (o[0], o[1])) < need:
            return False
    return True

def choose_shield_aim(pos, facing, opps, attack_dir, extra_pts=()):
    """选一个朝向，使球（pos+0.62*facing）尽可能远离对手；同时避免朝向自家球门。"""
    best_a = None; best_s = -1e9
    own_gx = 0.0 if attack_dir > 0 else 43.0
    for k in range(16):
        a = k * 22.5
        r = math.radians(a)
        bx = pos[0] + math.cos(r) * DRIBBLE_D
        by = pos[1] + math.sin(r) * DRIBBLE_D
        # 球出边界的朝向略微惩罚
        if bx < 0.2 or bx > W - 0.2 or by < 0.2 or by > H - 0.2:
            s = -5.0
        else:
            mind = min([math.hypot(bx - o[0], by - o[1]) for o in opps], default=99.0)
            if extra_pts:
                mind = min(mind, min([math.hypot(bx - o[0], by - o[1]) for o in extra_pts], default=99.0))
            s = min(mind, 6.0)
            # 球朝自家球门方向时稍微保守
            if (bx - pos[0]) * (own_gx - pos[0]) > 0 and abs(bx - own_gx) < 6:
                s -= 0.6
        if s > best_s:
            best_s = s; best_a = a
    return best_a

def make_policy(obs, myteam, units_by_id, order):
    global _FRAME
    _FRAME = int(obs.get('frame', 0))
    """返回 policy(units, ball, k) -> {uid: (dir, aim, kick)}"""
    n = obs['teamSize']
    ad = 1 if myteam == 0 else -1
    opp_gx = team_goal_x(myteam)
    my_gx = own_goal_x(myteam)
    my_units = [units_by_id[u['id']] for u in obs['units'] if u['team'] == myteam]
    my_ids = set(u.id for u in my_units)

    # 固定门将：优先沿用上一窗口的门将（粘性），否则选最靠自家球门的人
    keeper_id = None
    if n >= 2:
        key = (obs.get('id'), obs.get('seed'), n, myteam)
        if MEM.match_key != key:
            MEM.match_key = key
            MEM.keeper_id = None
        ball_owner0 = obs['ball'].get('owner')
        if ball_owner0 in my_ids:
            focus_id = ball_owner0
        else:
            focus_id = min(my_units, key=lambda u: math.hypot(
                u.x - float(obs['ball']['x']), u.y - float(obs['ball']['y']))).id
        cands = [u for u in my_units if u.id != focus_id]
        if cands:
            cur = next((u for u in cands if u.id == MEM.keeper_id), None)
            if cur is not None and abs(cur.x - my_gx) <= 15.0:
                keeper_id = cur.id
            else:
                pick = min(cands, key=lambda u: abs(u.x - my_gx) + abs(u.y - 13.0) * 0.35)
                keeper_id = pick.id
                MEM.keeper_id = pick.id

    opp_start_pts = [(float(d['x']), float(d['y'])) for d in obs['units'] if d['team'] != myteam]
    # 窗口开始时评估一次“传球方案”：持球者被逼抢或离门较远时，传给空位队友
    pass_plan = None   # (owner_id, recv_id, (tx,ty))
    owner0 = obs['ball'].get('owner')
    if owner0 in my_ids and n >= 2:
        ou = units_by_id[owner0]
        opp_pts0 = [(u.x, u.y) for u in units_by_id.values() if not u.is_mine]
        best = None
        for t in my_units:
            if t.id == owner0:
                continue
            D = math.hypot(t.x - ou.x, t.y - ou.y)
            if D < 2.5 or D > 17.0:
                continue
            clr = min([seg_point_dist((ou.x, ou.y), (t.x, t.y), pp) for pp in opp_pts0], default=99.0)
            if clr < 1.05:
                continue
            prog = (t.x - ou.x) * ad
            score = prog * 0.8 - D * 0.06 - (2.5 if t.id == keeper_id else 0.0)
            if best is None or score > best[3]:
                best = (ou.id, t.id, (t.x, t.y), score)
        if False and best is not None and best[3] > 0.8:
            pass_plan = best
    # 进攻支援的固定纵向分工
    spread_y = {}
    field_units = [u for u in my_units if u.id != keeper_id]
    for i, u in enumerate(sorted(field_units, key=lambda z: z.index)):
        spread_y[u.id] = [-5.5, 5.5, 0.0, -8.5, 8.5][i % 5]

    def policy(units, ball, k):
        dec = {}
        _dbg = None
        mine = [u for u in units if u.is_mine]
        opps = [u for u in units if not u.is_mine]
        opp_pts = [(o.x, o.y) for o in opps]
        owner = ball.get('owner')
        owner_u = next((u for u in units if u.id == owner), None)
        bp = (ball['x'], ball['y'])

        if owner_u is not None and owner_u.is_mine:
            # ------- 我方控球 -------
            ou = owner_u
            pos = (ou.x, ou.y)
            pressured = min([math.hypot(ou.x - o.x, ou.y - o.y) for o in opps], default=99.0)
            # 射门机会？
            st = shot_target(pos, ad, opps)
            if st is not None:
                T, clr, d = st
                if d < 9.0 or clr > (1.9 if d < 15 else 2.4) or pressured < 1.35:
                    aim = angle_to(pos, T)
                    dec[ou.id] = ('N' if dt_move_small(pos, T) else dir_toward(pos, T),
                                  aim, True)
                    for u in mine:
                        if u.id in dec:
                            continue
                        dec[u.id] = role_decide(u, ball, opps, opp_pts, keeper_id, spread_y,
                                                ad, my_gx, opp_gx, owner_u, n)
                    return dec
            # 传球方案：队友原地接应，持球者直接传出（0-2 帧内）
            if pass_plan is not None and ou.id == pass_plan[0] and k <= 2:
                recv = pass_plan[1]; tgt = pass_plan[2]
                aim = angle_to(pos, tgt)
                dec[ou.id] = ('N', aim, True)
                for u in mine:
                    if u.id in dec:
                        continue
                    if u.id == recv:
                        dec[u.id] = ('N', None, False)
                    else:
                        dec[u.id] = role_decide(u, ball, opps, opp_pts, keeper_id, spread_y,
                                                ad, my_gx, opp_gx, owner_u, n)
                return dec
            # 护球推进
            aim = choose_shield_aim(pos, ou.facing, opp_pts, ad, opp_start_pts)
            mv = choose_advance_dir(pos, opp_pts, ad, opp_gx)
            dec[ou.id] = (mv, aim, False)
            for u in mine:
                if u.id in dec:
                    continue
                if pass_plan is not None and u.id == pass_plan[1] and k <= 6:
                    dec[u.id] = ('N', None, False)
                    continue
                dec[u.id] = role_decide(u, ball, opps, opp_pts, keeper_id, spread_y,
                                        ad, my_gx, opp_gx, owner_u, n)
            return dec

        # ------- 对方控球 / 球自由 -------
        # 追球者：离（预测）球最近的本方球员
        if owner_u is not None:
            # 对方控球：追球点用实际球位置
            chaser = min(mine, key=lambda u: math.hypot(u.x - bp[0], u.y - bp[1]))
        else:
            pts = ball_pred(ball, 12)
            def score(u):
                best = 1e9
                for i, p in enumerate(pts[:13]):
                    t = i * DT
                    d = math.hypot(u.x - p[0], u.y - p[1])
                    best = min(best, d + 2.2 * t)
                return best
            chaser = min(mine, key=score)
        for u in mine:
            if u.id == chaser.id:
                dec[u.id] = chase_decide(u, ball, opp_pts, owner_u, ad, my_gx)
            else:
                dec[u.id] = role_decide(u, ball, opps, opp_pts, keeper_id, spread_y,
                                        ad, my_gx, opp_gx, owner_u, n)
        if k == 0 and _DBG:
            ku = next((u for u in mine if u.id == keeper_id), None)
            print('POL f%d own=%s keeper=%s kpos=%s kdec=%s ball=%s chaser=%s' % (
                _FRAME, ball.get('owner'), keeper_id,
                None if ku is None else (round(ku.x,2), round(ku.y,2)),
                None if keeper_id is None else dec.get(keeper_id), (round(ball['x'],2), round(ball['y'],2), round(ball.get('vx',0),1)),
                chaser.id), file=sys.stderr, flush=True)
        return dec

    return policy

def dt_move_small(pos, T):
    return dist(pos, T) < 0.4

def chase_decide(u, ball, opp_pts, owner_u, ad, my_gx):
    """追球/压迫"""
    if owner_u is not None and not owner_u.is_mine:
        bp = (ball['x'], ball['y'])
        return (dir_toward((u.x, u.y), bp), None, False)
    # 自由球：预测拦截点
    pts = ball_pred(ball, 12)
    best_i = 0; best_v = 1e9
    for i, p in enumerate(pts[:13]):
        d = math.hypot(u.x - p[0], u.y - p[1])
        v = d + 1.6 * i * DT
        if v < best_v:
            best_v = v; best_i = i
    tgt = pts[best_i]
    return (dir_toward((u.x, u.y), tgt), None, False)

def choose_advance_dir(pos, opp_pts, ad, opp_gx):
    """带球推进：在 8 个方向里选推进分高且不撞人的"""
    best = 'N'; best_s = -1e9
    gx = opp_gx
    gdir = norm_vec(gx - pos[0], 13.0 - pos[1])
    for dname, (dx, dy) in DIRS.items():
        if dx == 0 and dy == 0:
            continue
        nx = pos[0] + dx * MOVE_SPEED * 0.35
        ny = pos[1] + dy * MOVE_SPEED * 0.35
        nx, ny = unit_clamp((nx, ny))
        s = (dx * gdir[0] + dy * gdir[1]) * 1.0
        for o in opp_pts:
            d = math.hypot(nx - o[0], ny - o[1])
            if d < 1.1:
                s -= (1.1 - d) * 4.0
        if nx < 1.4 or nx > W - 1.4: s -= 0.4
        if ny < 1.4 or ny > H - 1.4: s -= 0.3
        if s > best_s:
            best_s = s; best = dname
    return best

def role_decide(u, ball, opps, opp_pts, keeper_id, spread_y, ad, my_gx, opp_gx, owner_u, n):
    bp = (ball['x'], ball['y'])
    gcenter = (opp_gx, 13.0)
    # 门将
    if u.id == keeper_id:
        return keeper_decide(u, ball, opps, owner_u, my_gx, ad, n)
    # 我方控球：前插支援
    if owner_u is not None and owner_u.is_mine:
        sy = spread_y.get(u.id, 0.0)
        tx = bp[0] + ad * (7.0 if abs(sy) > 2 else 4.0)
        ty = clamp(13.0 + sy, 3.0, 23.0)
        # 不要和持球者目标重叠
        if math.hypot(tx - owner_u.x, ty - owner_u.y) < 2.0:
            ty = clamp(ty + (3.0 if sy >= 0 else -3.0), 3.0, 23.0)
        return (dir_toward((u.x, u.y), (clamp(tx, 2.0, W - 2.0), ty)), None, False)
    # 防守：站在球与自家球门连线上
    # 非门将防守球员：卡在球门一侧
    t = 0.35 if u.index % 2 == 0 else 0.55
    tx = bp[0] + (my_gx - bp[0]) * t
    ty = bp[1] + (13.0 - bp[1]) * t
    # 分散一点
    settle = spread_y.get(u.id, 0.0) * 0.35
    ty = clamp(ty + settle, 3.0, 23.0)
    tx = clamp(tx, 2.0, W - 2.0)
    return (dir_toward((u.x, u.y), (tx, ty)), None, False)

def keeper_decide(u, ball, opps, owner_u, my_gx, ad, n):
    """门将：站在球-球门中心连线上，按比例出击封堵射门角度；来球时预测拦截。"""
    bp = (ball['x'], ball['y'])
    goal = (my_gx, 13.0)
    pos = (u.x, u.y)
    ours = owner_u is not None and owner_u.is_mine
    D = math.hypot(bp[0] - goal[0], bp[1] - goal[1])

    # 自由球高速朝我方球门飞来：按轨迹找可到达的拦截点
    if owner_u is None:
        vx = ball.get('vx', 0.0); vy = ball.get('vy', 0.0)
        sp = math.hypot(vx, vy)
        toward_own = (vx * (goal[0] - bp[0]) + vy * (goal[1] - bp[1])) > 0
        if sp > 2.0 and toward_own:
            pts = ball_pred(ball, 34)
            for i, p in enumerate(pts):
                t = i * DT
                if math.hypot(p[0] - pos[0], p[1] - pos[1]) <= MOVE_SPEED * t + 0.75:
                    return (dir_toward(pos, p), None, False)
            return (dir_toward(pos, pts[-1]), None, False)

    # 球已经逼近球门：直接扑球
    if D < 3.4:
        return (dir_toward(pos, bp), None, False)

    if ours:
        back = clamp(0.25 * D, 1.4, 4.2)
    else:
        cap = 7.5 if n <= 2 else (9.5 if n == 3 else 11.0)
        back = clamp(0.68 * D, 1.35, cap)
    dx = bp[0] - goal[0]; dy = bp[1] - goal[1]
    l = math.hypot(dx, dy) or 1.0
    tgt = (goal[0] + dx / l * back, goal[1] + dy / l * back)
    return (dir_toward(pos, tgt), None, False)

# ---------------- 主流程 ----------------
def neutral_frame(n):
    return [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]

def decide(obs):
    n = int(obs.get('teamSize', 3))
    myteam = int(obs.get('yourTeam', 0))
    units = build_plan_units(obs, myteam)
    by_id = {u.id: u for u in units}
    my_units = [u for u in units if u.is_mine]
    frame_no = int(obs.get('frame', 0))
    opp_vel = {}
    for d in obs['units']:
        if d['team'] != myteam:
            opp_vel[d['id']] = MEM.velocity(d['id'], float(d['x']), float(d['y']), frame_no)
    # 我方速度也记录（不影响）
    for d in obs['units']:
        if d['team'] == myteam:
            MEM.velocity(d['id'], float(d['x']), float(d['y']), frame_no)

    ball = {
        'x': float(obs['ball']['x']), 'y': float(obs['ball']['y']),
        'vx': float(obs['ball'].get('vx', 0.0)), 'vy': float(obs['ball'].get('vy', 0.0)),
        'owner': obs['ball'].get('owner'),
    }

    # 冻结帧：引擎不动，先跳过
    freeze_frames = int(round(float(obs.get('freeze', 0)) * 20))
    freeze_frames = max(0, min(20, freeze_frames))

    policy = make_policy(obs, myteam, by_id, None)
    total = 20
    frames_out = []
    if freeze_frames > 0:
        for _ in range(freeze_frames):
            frames_out.append({u.id: ('N', None, False) for u in my_units})
    remaining = total - freeze_frames
    if remaining > 0:
        plan = forward_plan(units, ball, opp_vel, remaining, policy)
        frames_out.extend(plan)

    # 组装输出：按 index 排序
    inputs = []
    for fo in frames_out:
        frame = [None] * n
        for u in my_units:
            d, aim, kick = fo.get(u.id, ('N', None, False))
            frame[u.index] = {'dir': d, 'aim': aim, 'kick': bool(kick)}
        for i in range(n):
            if frame[i] is None:
                frame[i] = {'dir': 'N', 'aim': None, 'kick': False}
        inputs.append(frame)
    return {'inputs': inputs}

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            out = decide(obs)
        except Exception as e:
            try:
                n = int(json.loads(line).get('teamSize', 3))
            except Exception:
                n = 3
            print('ERR ' + repr(e), file=sys.stderr, flush=True)
            out = {'inputs': [neutral_frame(n) for _ in range(20)]}
        print(json.dumps(out, separators=(',', ':')), flush=True)

if __name__ == '__main__':
    main()
