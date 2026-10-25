#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""随机化假想对手：用 seed 派生一套打法参数，覆盖攻防/超必杀/距离/时机。

用法: python randbot.py [seed] [style]
seed 由对局观察里的 seed 字段决定，不同种子 -> 不同打法。
"""
import sys
import json

N = {"dir": "N", "btn": None}


def I(d, b=None):
    return {"dir": d, "btn": b}


MOT = {'qcf': ['D', 'DF', 'F'], 'qcb': ['D', 'DB', 'B'],
       'dp': ['F', 'D', 'DF'], 'hcb': ['F', 'DF', 'D', 'DB', 'B']}


def n(v, d=0.0):
    try:
        return float(v)
    except Exception:
        return d


class R:
    def __init__(self, s):
        self.s = (int(s) * 2654435761 + 1013904223) & 0xFFFFFFFF

    def u(self):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def pick(self, arr):
        return arr[int(self.u() * len(arr)) % len(arr)]


class Bot:
    def __init__(self, seed_hint, style):
        self.r = None
        self.seed_hint = seed_hint
        self.style = style
        self.frame = 0

    def params(self, seed):
        r = R(seed * 7919 + 13)
        p = {}
        p['aggro'] = 0.25 + 0.7 * r.u()          # 中立出手概率
        p['block_p'] = 0.2 + 0.75 * r.u()        # 面对攻击时防御概率
        p['use_super'] = r.u() < 0.8             # 气满是否放超必杀
        p['super_dist'] = 120 + 260 * r.u()      # 放超必杀的距离阈值
        p['low_p'] = r.u()                      # 喜欢下段
        p['jump_p'] = r.u() * 0.4               # 跳入概率
        p['delay'] = int(r.u() * 10)            # 出招延迟帧
        p['retreat'] = r.u() * 0.5              # 后退倾向
        p['block_dir'] = 'DB' if r.u() < 0.55 else 'B'
        p['finish'] = r.u() < 0.6               # 命中后是否接连段
        p['chase'] = r.u() < 0.7                # 是否主动逼近
        return p

    def run(self):
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                obs = json.loads(line)
            except Exception:
                continue
            try:
                out = self.decide(obs)
            except Exception as e:
                sys.stderr.write("rb %r\n" % (e,))
                out = {"inputs": [dict(N) for _ in range(15)]}
            sys.stdout.write(json.dumps(out) + "\n")
            sys.stdout.flush()

    def decide(self, obs):
        seed = int(obs.get("seed", 1) or 1)
        if self.r is None:
            self.r = R(seed * 104729 + 7)
            self.p = self.params(seed)
        r, p = self.r, self.p
        pi = int(obs.get("yourPlayer", 0) or 0)
        me = obs["fighters"][pi]
        op = obs["fighters"][1 - pi]
        C = obs["catalog"]["characters"][me["char"]]
        OC = obs["catalog"]["characters"][op["char"]]
        out = [dict(N) for _ in range(15)]
        dx = abs(op["x"] - me["x"])
        normals = C.get("normals") or {}
        lp = normals.get("lp") or {}
        hp = normals.get("hp") or {}
        lk = normals.get("lk") or {}
        sup = C.get("super") or {}

        def hi(m):
            hb = m.get("hitbox")
            return (n(hb.get("x")) + n(hb.get("w")) / 2 + 28) if hb else 0

        lp_hi, hp_hi, lk_hi = hi(lp), hi(hp), hi(lk)
        bd = p['block_dir']

        st = me.get("state")
        if st in ("hitstun", "down", "wakeup"):
            return {"inputs": [dict(I(bd)) for _ in range(15)]}
        if st in ("jump", "air"):
            if r.u() < 0.5:
                out[0] = I("F", "HP")
            return {"inputs": out}

        meter = n(me.get("meter"))
        # 气满 -> 超必杀
        if p['use_super'] and meter >= n(sup.get("cost"), 100) and dx <= p['super_dist']:
            seq = MOT.get(sup.get("motion"), ['D', 'DF', 'F'])
            btn = sup.get("button", "HP")
            d0 = int(r.u() * 4)
            for i, d in enumerate(seq):
                if d0 + i < 15:
                    out[d0 + i] = I(d, btn if i == len(seq) - 1 else None)
            for j in range(1, 3):
                if d0 + len(seq) - 1 + j < 15:
                    out[d0 + len(seq) - 1 + j] = I(seq[-1], btn)
            return {"inputs": out}

        omv = op.get("move")
        if op.get("state") == "attack" and omv:
            md = None
            for pool in ("normals", "specials"):
                for mv in (OC.get(pool) or {}).values():
                    if isinstance(mv, dict) and mv.get("name") == omv.get("name"):
                        md = mv
            if md is None:
                sup2 = OC.get("super")
                if isinstance(sup2, dict) and sup2.get("name") == omv.get("name"):
                    md = sup2
            fr = n(omv.get("frame"))
            s = n((md or {}).get("startup"), n(omv.get("startup"), 5))
            a = n((md or {}).get("active"), n(omv.get("active"), 0))
            rr = n((md or {}).get("recovery"), n(omv.get("recovery"), 8))
            tot = s + a + rr + n((md or {}).get("cinematic"), 0)
            if fr >= s + a and dx <= hp_hi and (tot - fr) > 8 and r.u() < 0.85:
                k = int(r.u() * 6)
                out[k] = I("F", "HK" if hp_hi >= dx else "HP")
                out[k + 3] = I("F", "LK")
                out[k + 7] = I("F", "HP")
                return {"inputs": out}
            if dx <= 170 and r.u() < p['block_p']:
                return {"inputs": [dict(I(bd)) for _ in range(15)]}

        if st == "blockstun":
            return {"inputs": [dict(I(bd)) for _ in range(15)]}

        if dx <= (lk_hi if p['low_p'] < 0.5 else lp_hi) - 2:
            if r.u() < p['aggro']:
                d0 = int(r.u() * 5)
                key = "LK" if (p['low_p'] < 0.5 and lk) else "LP"
                out[d0] = I("F", key)
                if p['finish']:
                    out[d0 + 5] = I("F", "LP" if key == "LK" else "LK")
                    out[d0 + 10] = I("F", "HP")
                return {"inputs": out}
            if r.u() < p['jump_p'] and dx < 170:
                out[0] = I("UF")
                out[3] = I("F", "HK")
                return {"inputs": out}
            return {"inputs": [dict(I(bd)) for _ in range(15)]}

        if p['chase']:
            for k in range(15):
                out[k] = I("F")
            if dx < hp_hi and r.u() < p['aggro']:
                out[0] = I("F", "HP")
            return {"inputs": out}
        for k in range(15):
            out[k] = I("B")
        return {"inputs": out}


if __name__ == "__main__":
    Bot(int(sys.argv[1]) if len(sys.argv) > 1 else 0,
        sys.argv[2] if len(sys.argv) > 2 else "rand").run()
