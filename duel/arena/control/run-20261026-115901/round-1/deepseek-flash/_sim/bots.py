# -*- coding: utf-8 -*-
"""自测用对手：几种不同风格的机器人。都只读公开观察，不读对方内部状态。"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
if WS not in sys.path:
    sys.path.insert(0, WS)

import agent as A  # noqa: E402

DIRS = A.MOVE_DIRS
AIM = A.AIM_DIRS


def los_clear(field, x0, y0, x1, y1, step=0.2):
    d = math.hypot(x1 - x0, y1 - y0)
    if d < 1e-6:
        return True
    n = int(d / step) + 1
    ux = (x1 - x0) / d
    uy = (y1 - y0) / d
    for i in range(1, n):
        if field.wall(x0 + ux * i * step, y0 + uy * i * step):
            return False
    return True


class BaseBot(object):
    """通用：每窗口用「预测弹道 + 贪心避让」走位，冷却一到就开火。"""

    name = 'base'

    def __init__(self, seed=1, fire=True):
        self.rng = random.Random(seed)
        self.fire = fire
        self.frames = 0

    # ---- 供子类覆盖
    def extra_cost(self, x, y, oppx, oppy):
        return 0.0

    def act(self, obs):
        try:
            return self._act(obs)
        except Exception:
            return A.NEUTRAL

    def _act(self, obs):
        if obs.get('status') != 'playing':
            return A.NEUTRAL
        self.frames += 1
        rules = obs['rules']
        dt = 1.0 / rules['hz']
        prad = rules['playerRadius']
        brad = rules['bulletRadius']
        bspeed = rules['bulletSpeed']
        sub_dt = dt / A.SUB
        step_len = rules['playerSpeed'] * dt
        m = obs['map']
        field = A.Field(m['tiles'], m['width'], m['height'], step_len, prad)
        me_i = obs['yourPlayer']
        me = obs['players'][me_i]
        opp = obs['players'][1 - me_i]
        mx, my = float(me['x']), float(me['y'])
        ox, oy = float(opp['x']), float(opp['y'])

        enemy = [b for b in obs['bullets'] if b['owner'] != me_i]
        pos = [(float(b['x']), float(b['y']), float(b['vx']), float(b['vy'])) for b in enemy]
        NF = 10
        frm = []
        cur = pos
        for _t in range(NF):
            nxt = []
            for (x, y, vx, vy) in cur:
                nxt.append(A.advance_bullet(x, y, vx, vy, sub_dt, field))
            cur = nxt
            frm.append([(p[0], p[1]) for p in cur])

        def cost_of(x, y, t0):
            c = 0.0
            for t in range(t0, min(t0 + 4, NF)):
                for (bx, by) in frm[t]:
                    d = math.hypot(x - bx, y - by)
                    if d < 0.75:
                        c += 400.0
                    elif d < 2.5:
                        c += (2.5 - d) * (2.5 - d) * 8.0
            c += self.extra_cost(x, y, ox, oy)
            return c

        # 贪心 3 帧
        path = []
        cx, cy = mx, my
        for k in range(3):
            best, bc = 'N', None
            order = list(DIRS)
            self.rng.shuffle(order)
            for d in order:
                nx, ny = field.move(cx, cy, d)
                c = cost_of(nx, ny, k)
                if bc is None or c < bc:
                    bc, best = c, d
            cx, cy = field.move(cx, cy, best)
            path.append(best)

        # 开火
        cd = int(me.get('cooldown', 0))
        shot = None
        if self.fire and cd <= 2:
            best_aim, bs = None, -1.0
            for fi in range(cd, 3):
                sx, sy = mx, my
                for k in range(fi):
                    sx, sy = field.move(sx, sy, path[k])
                for d in AIM:
                    ux, uy = A.DIRV[d]
                    if field.wall(sx + ux * 0.79, sy + uy * 0.79):
                        continue
                    # 打分：与对手的连线是否通畅 + 距离
                    bx, by = sx + ux * 0.79, sy + uy * 0.79
                    s = 0.0
                    if los_clear(field, bx, by, ox, oy):
                        s += 30.0 - math.hypot(ox - bx, oy - by) * 0.5
                    else:
                        s += 3.0 * math.exp(-math.hypot(ox - bx, oy - by) / 25.0)
                    s += self.rng.random() * 0.3
                    if s > bs:
                        bs, best_aim = s, (fi, d)
            shot = best_aim
        out = []
        for k in range(3):
            out.append({'dir': path[k],
                        'aim': (shot[1] if (shot and shot[0] == k) else None),
                        'fire': bool(shot and shot[0] == k)})
        return {'inputs': out}


class GreedyBot(BaseBot):
    """会躲最近的威胁弹 + 有视线就还击：接近「练习电脑」的水平。"""
    name = 'greedy'


class HunterBot(BaseBot):
    """主动拉近到中距离，逼对手走位。"""
    name = 'hunter'

    def extra_cost(self, x, y, oppx, oppy):
        d = math.hypot(x - oppx, y - oppy)
        if d > 9.0:
            return (d - 9.0) * 1.2
        if d < 4.0:
            return (4.0 - d) * (4.0 - d) * 3.0
        return 0.0


class FleeBot(BaseBot):
    """尽量远离对手，纯苟。"""
    name = 'flee'

    def extra_cost(self, x, y, oppx, oppy):
        d = math.hypot(x - oppx, y - oppy)
        return max(0.0, 18.0 - d) * 0.8


class RandomBot(object):
    name = 'random'

    def __init__(self, seed=1, fire=True):
        self.rng = random.Random(seed)
        self.fire = fire

    def act(self, obs):
        if obs.get('status') != 'playing':
            return A.NEUTRAL
        out = []
        for _ in range(3):
            out.append({'dir': self.rng.choice(DIRS),
                        'aim': self.rng.choice(AIM),
                        'fire': self.fire and self.rng.random() < 0.5})
        return {'inputs': out}


class StillBot(object):
    name = 'still'

    def __init__(self, **kw):
        pass

    def act(self, obs):
        return {'inputs': [{'dir': 'N', 'aim': None, 'fire': True}] * 3}


class MirrorBot(object):
    """和参赛程序同一个大脑（自博弈用）。"""
    name = 'mirror'

    def __init__(self, seed=1, **kw):
        self.ag = A.Agent()

    def act(self, obs):
        return self.ag.act(obs)


class SniperBot(BaseBot):
    """保持中远距离，尽量在有视线时打提前量。"""
    name = 'sniper'

    def __init__(self, seed=1, **kw):
        BaseBot.__init__(self, seed=seed)
        self.hist = []

    def extra_cost(self, x, y, oppx, oppy):
        d = math.hypot(x - oppx, y - oppy)
        if d < 10.0:
            return (10.0 - d) * (10.0 - d) * 0.7
        if d > 26.0:
            return (d - 26.0) * 0.5
        return 0.0

    def _act(self, obs):
        if obs.get('status') != 'playing':
            return A.NEUTRAL
        me_i = obs['yourPlayer']
        opp = obs['players'][1 - me_i]
        op = (float(opp['x']), float(opp['y']))
        self.hist.append(op)
        if len(self.hist) > 2:
            self.hist.pop(0)
        out = BaseBot._act(self, obs)
        return out


class RusherBot(BaseBot):
    """贴脸突进：逼对手在近距离做反应。"""
    name = 'rusher'

    def extra_cost(self, x, y, oppx, oppy):
        d = math.hypot(x - oppx, y - oppy)
        return max(0.0, d - 2.0) * 2.0


class SprayBot(BaseBot):
    """疯狂铺子弹：冷却一到就朝「我」的预测位置打；走位用同一套贪心避让。

    用于压力测试：它自己不轻易死，能持续把场上子弹堆起来。
    """
    name = 'spray'

    def _act(self, obs):
        if obs.get('status') != 'playing':
            return A.NEUTRAL
        me_i = obs['yourPlayer']
        opp = obs['players'][1 - me_i]
        op = (float(opp['x']), float(opp['y']))
        self.hist = getattr(self, 'hist', [])
        self.hist.append(op)
        if len(self.hist) > 2:
            self.hist.pop(0)
        vx = vy = 0.0
        if len(self.hist) == 2:
            vx = (self.hist[1][0] - self.hist[0][0]) / 3.0
            vy = (self.hist[1][1] - self.hist[0][1]) / 3.0

        rules = obs['rules']
        dt = 1.0 / rules['hz']
        prad = rules['playerRadius']
        bspeed = rules['bulletSpeed']
        sub_dt = dt / A.SUB
        step_len = rules['playerSpeed'] * dt
        m = obs['map']
        field = A.Field(m['tiles'], m['width'], m['height'], step_len, prad)
        me = obs['players'][me_i]
        mx, my = float(me['x']), float(me['y'])
        ox, oy = float(opp['x']), float(opp['y'])

        enemy = [b for b in obs['bullets'] if b['owner'] != me_i]
        pos = [(float(b['x']), float(b['y']), float(b['vx']), float(b['vy'])) for b in enemy]
        NF = 12
        frm = []
        cur = pos
        for _t in range(NF):
            cur = [A.advance_bullet(x, y, vx_, vy_, sub_dt, field) for (x, y, vx_, vy_) in cur]
            frm.append([(p[0], p[1]) for p in cur])

        def cost_of(x, y, t0):
            c = 0.0
            for t in range(t0, min(t0 + 4, NF)):
                for (bx, by) in frm[t]:
                    d = math.hypot(x - bx, y - by)
                    if d < 0.75:
                        c += 400.0
                    elif d < 3.0:
                        c += (3.0 - d) * (3.0 - d) * 8.0
            return c

        path = []
        cx, cy = mx, my
        for k in range(3):
            best, bc = 'N', None
            for d in DIRS:
                nx, ny = field.move(cx, cy, d)
                c = cost_of(nx, ny, k)
                if bc is None or c < bc:
                    bc, best = c, d
            cx, cy = field.move(cx, cy, best)
            path.append(best)

        cd = int(me.get('cooldown', 0))
        shot = None
        if cd <= 2:
            # 朝「我」的预测位置打（提前量最多 8 帧）
            best_aim, bs = None, -1.0
            for fi in range(cd, 3):
                sx, sy = mx, my
                for k in range(fi):
                    sx, sy = field.move(sx, sy, path[k])
                for lead in (0, 2, 4, 6, 8):
                    tx = ox + vx * lead
                    ty = oy + vy * lead
                    d = A.dir_of(tx - sx, ty - sy)
                    if d == 'N':
                        continue
                    ux, uy = A.DIRV[d]
                    if field.wall(sx + ux * 0.79, sy + uy * 0.79):
                        continue
                    # 用 8 方向中最接近连线的那一个
                    s = -abs(math.hypot(tx - sx, ty - sy) - 12.0)
                    if s > bs:
                        bs, best_aim = s, (fi, d)
            shot = best_aim
        out = []
        for k in range(3):
            out.append({'dir': path[k],
                        'aim': (shot[1] if (shot and shot[0] == k) else None),
                        'fire': bool(shot and shot[0] == k)})
        return {'inputs': out}


class DuckBot(object):
    """完全不动、不开火的靶子：用来单独衡量我的进攻能力。"""
    name = 'duck'

    def __init__(self, **kw):
        pass

    def act(self, obs):
        return {'inputs': [{'dir': 'N', 'aim': None, 'fire': False}] * 3}
