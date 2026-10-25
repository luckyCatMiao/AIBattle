#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""铁拳谱 · deepseek-flash 选手程序。

== 本引擎的两个关键事实（读 catalog.js / simulation.js 得出，并已用真实引擎离线验证）==

1. 多段必杀/超必杀的每一段都按 data.damage 全额结算（resolveHits 里 applyHit 用的是
   m.data.damage，hits 只控制「几段、每隔几帧一段」）。于是：
     Vex 超必杀 (hits=8, damage=280)  打满 1120 —— 满血 1000 直接秒杀
     Kestrel 超必杀 (hits=7, damage=300) 打满 1020 —— 也是秒杀
   Vex 的超必杀还带 invuln[1,10] 与 290 像素突进，实测在 60~240 像素距离上都能打满，
   且对手先出招也照样被吃下（我方无敌帧 + 第 9 帧首段命中打断对手）。

2. 连段链接（tryLink）要求对手处于 hitstun —— 也就是「已经挨了一下、正在硬直中」的对手
   无法防御。所以「轻攻击确认 → 连段 → 取消成超必杀」是一条不可防御的斩杀线。

== 由此得到的打法 ==
   * 中立：用 lp（3 帧，全游戏最快）试探；对手习惯站防就换 lk（下段，站防挡不住）。
   * 一旦第一下确认命中，立刻按预先排好的绝对帧表把连段打完并取消成超必杀。
   * 每 15 帧才提交一次，无法在窗口内反应，所以连段跨窗口排程，
     并在每个窗口边界用观察确认「对手仍在受击硬直」才继续，避免把 100 点气浪费在防御上。
   * 对手出招中（attack 状态）不能防御 —— 此时若气槽已满，直接放超必杀是必中的斩杀。
   * 对手攻击时按招式上下段正确防御，并在其收招帧内反击。
"""

import sys
import json

NEUTRAL = {"dir": "N", "btn": None}
PUSH_HALF = 28.0        # 受击盒半宽 = pushbox.w / 2

# ---------------------------------------------------------------- 连段表
# 每项: 起始招 key -> {first: 起手招的起手帧(用于窗口校验), hits: 预期命中帧偏移,
#                      full: 气槽满时的排程, nom: 气槽不足时的排程}
# 排程元素 = (相对起始帧偏移, dir, btn)。偏移按引擎逐帧时序（含 hitstop）手工推演。
ROUTES = {
    "vex": {
        "lp": {
            "first": 3, "hits": [3, 12, 26, 45],
            "full": [(0, 'F', 'LP'), (8, 'F', 'LK'), (17, 'F', 'HP'),
                     (34, 'D', None), (35, 'DF', None), (36, 'F', 'HP')],
            "nom": [(0, 'F', 'LP'), (8, 'F', 'LK'), (17, 'F', 'HP'),
                    (34, 'D', None), (35, 'DB', None), (36, 'B', 'LK')],
        },
        "lk": {
            "first": 4, "hits": [4, 18, 37],
            "full": [(0, 'F', 'LK'), (9, 'F', 'HP'),
                     (26, 'D', None), (27, 'DF', None), (28, 'F', 'HP')],
            "nom": [(0, 'F', 'LK'), (9, 'F', 'HP'),
                    (26, 'D', None), (27, 'DB', None), (28, 'B', 'LK')],
        },
    },
    "kestrel": {
        "hp": {
            "first": 11, "hits": [11, 29, 50],
            "full": [(0, 'F', 'HP'), (16, 'F', 'HK'),
                     (34, 'D', None), (35, 'DF', None), (36, 'F', 'HP')],
            "nom": [(0, 'F', 'HP'), (16, 'F', 'HK'),
                    (34, 'D', None), (35, 'DB', None), (36, 'B', 'HP')],
        },
        "lp": {
            "first": 3, "hits": [3, 16],
            "full": [(0, 'F', 'LP'), (8, 'F', 'LK'), (14, 'F', None),
                     (15, 'D', None), (16, 'DF', 'HK')],
            "nom": [(0, 'F', 'LP'), (8, 'F', 'LK'), (14, 'F', None),
                    (15, 'D', None), (16, 'DF', 'HK')],
        },
    },
    "aegis": {
        "hp": {
            "first": 12, "hits": [12, 34, 58],
            "full": [(0, 'F', 'HP'), (20, 'F', 'HK'),
                     (42, 'D', None), (43, 'DF', None), (44, 'F', 'HP')],
            "nom": [(0, 'F', 'HP'), (20, 'F', 'HK'),
                    (42, 'F', None), (43, 'D', None), (44, 'DF', 'HP')],
        },
        "lp": {
            "first": 4, "hits": [4, 14, 23, 36],
            "full": [(0, 'F', 'LP'), (9, 'F', 'LK'), (18, 'F', 'LP'),
                     (27, 'F', None), (28, 'D', None), (29, 'DF', 'HP')],
            "nom": [(0, 'F', 'LP'), (9, 'F', 'LK'), (18, 'F', 'LP'),
                    (27, 'F', None), (28, 'D', None), (29, 'DF', 'HP')],
        },
    },
    # 备用（本队不用）
    "torv": {
        "lp": {"first": 5, "hits": [5, 15],
               "nom": [(0, 'F', 'LP'), (10, 'F', 'LK'), (19, 'F', 'LP')],
               "full": [(0, 'F', 'LP'), (10, 'F', 'LK'), (19, 'F', 'LP')]},
        "lk": {"first": 7, "hits": [7, 19],
               "nom": [(0, 'F', 'LK'), (12, 'F', 'LP'), (21, 'F', 'LK')],
               "full": [(0, 'F', 'LK'), (12, 'F', 'LP'), (21, 'F', 'LK')]},
    },
    "nyx": {
        "lp": {"first": 4, "hits": [4, 14],
               "nom": [(0, 'F', 'LP'), (9, 'F', 'LK'), (18, 'F', 'LP')],
               "full": [(0, 'F', 'LP'), (9, 'F', 'LK'), (18, 'F', 'LP')]},
        "lk": {"first": 5, "hits": [5, 15],
               "nom": [(0, 'F', 'LK'), (10, 'F', 'LP'), (19, 'F', 'LK')],
               "full": [(0, 'F', 'LK'), (10, 'F', 'LP'), (19, 'F', 'LK')]},
    },
    "sable": {
        "lp": {"first": 4, "hits": [4, 14],
               "nom": [(0, 'F', 'LP'), (9, 'F', 'LK'), (18, 'F', 'LP')],
               "full": [(0, 'F', 'LP'), (9, 'F', 'LK'), (18, 'F', 'LP')]},
        "lk": {"first": 5, "hits": [5, 15],
               "nom": [(0, 'F', 'LK'), (10, 'F', 'LP'), (19, 'F', 'LK')],
               "full": [(0, 'F', 'LK'), (10, 'F', 'LP'), (19, 'F', 'LK')]},
    },
}

# 每名角色用来试探/起手的招（按优先级）
STARTERS = {
    "vex": ["lp", "lk"],
    "kestrel": ["lp", "hp"],
    "aegis": ["lp", "hp"],
    "torv": ["lp", "lk"],
    "nyx": ["lp", "lk"],
    "sable": ["lp", "lk"],
}

SUPER_RANGE = 250.0     # 实测超必杀突进后 60~240 都打满，留一点余量


def move_reach(mv):
    hb = (mv or {}).get("hitbox")
    if not hb:
        return None
    x, w = float(hb.get("x", 0)), float(hb.get("w", 0))
    return (x - w / 2 - PUSH_HALF, x + w / 2 + PUSH_HALF)


def num(v, d=0.0):
    try:
        return float(v)
    except Exception:
        return d


class Agent:
    def __init__(self):
        self.combo = None          # (start_frame, key, route)
        self.blocked_streak = 0    # 起手被防住的次数（用来在 lp/lk 之间切换）
        self.move_index = None     # {(char, name): movedata}

    # ------------------------------------------------------------- 主循环
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
                sys.stderr.write("ERR %r\n" % (e,))
                out = {"inputs": [dict(NEUTRAL) for _ in range(15)], "note": "fallback"}
            sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
            sys.stdout.flush()

    # ------------------------------------------------------------- 决策
    def decide(self, obs):
        f0 = int(obs.get("frame", 0) or 0)
        pi = int(obs.get("yourPlayer", 0) or 0)
        fighters = obs.get("fighters") or []
        if len(fighters) < 2:
            return {"inputs": [dict(NEUTRAL) for _ in range(15)]}
        me = fighters[pi]
        op = fighters[1 - pi]

        cat = obs.get("catalog") or {}
        chars = cat.get("characters") if isinstance(cat.get("characters"), dict) else cat
        C = chars.get(me.get("char"), {}) or {}
        OC = chars.get(op.get("char"), {}) or {}
        mychar = me.get("char", "")
        opchar = op.get("char", "")
        meter = num(me.get("meter", 0))

        out = [dict(NEUTRAL) for _ in range(15)]
        sched = {}

        def put(abs_frame, d, b):
            k = abs_frame - f0
            if 1 <= k <= 15:
                sched[k] = (d, b)

        def fill(k1, k2, d, b=None):
            for k in range(k1, k2 + 1):
                if 1 <= k <= 15:
                    sched[k] = (d, b)

        # ---------------- 1) 连段进行中 ----------------
        if self.combo is not None:
            s, key, route = self.combo
            plan = route["plan"]
            last_off = plan[-1][0]
            ok = True
            if f0 >= s + route["first"]:
                # 已经打出去了：对手必须仍在受击硬直，否则说明被防住/打空
                if op.get("state") != "hitstun":
                    near_hit = any(s + h - 1 <= f0 <= s + h + 5 for h in route["hits"])
                    if not near_hit:
                        ok = False
            if op.get("state") == "blockstun":
                self.blocked_streak += 1
                ok = False
            if me.get("state") in ("hitstun", "ko"):
                ok = False
            if f0 > s + last_off + 10:
                ok = False
            if ok:
                for off, d, b in plan:
                    put(s + off, d, b)
                if s + last_off <= f0:
                    self.combo = None
                return self._emit(out, sched, "combo:" + key)
            self.combo = None

        # ---------------- 2) 我方无法自由行动 ----------------
        mystate = me.get("state")
        if mystate in ("attack", "hitstun", "blockstun", "down", "wakeup", "stance", "ko"):
            if mystate == "blockstun":
                # 防御硬直中输入的移动指令不会被执行；先按几帧防御再前压，避免整窗后退
                fill(1, 6, "B")
                fill(7, 15, "F")
            elif mystate == "hitstun":
                # 受击硬直里一直按住防御：硬直一结束就挡住对手的后续，避免被连段滚雪球
                fill(1, 15, "B")
            return self._emit(out, sched, "busy:" + str(mystate))

        dx = abs(num(op.get("x")) - num(me.get("x")))
        ost = op.get("state")
        omv = op.get("move") or None
        oinv = bool(op.get("invulnerable"))

        normals = C.get("normals") or {}
        sup = C.get("super") or {}
        starters = STARTERS.get(mychar, ["lp"])
        key0 = starters[0]
        r0 = move_reach(normals.get(key0) or {}) or (0.0, 0.0)
        rk0 = r0[1]
        my_startup = num((normals.get(key0) or {}).get("startup"), 4)

        # ---------------- 0) 有飞行道具朝我飞来 -> 只在将要命中那几帧挡 ----------------
        projs = []
        for p in (obs.get("projectiles") or []):
            if p.get("owner") == pi:
                continue
            projs.append(p)
        if projs:
            myx = num(me.get("x"))
            opx = num(op.get("x"))
            my_spd = num(C.get("speed"), 5.0)
            block_frames = set()
            for p in projs:
                px = num(p.get("x"))
                toward = (px < myx) if myx > opx else (px > myx)
                if not toward:
                    continue
                dist = abs(px - myx)
                spd = self._proj_speed(opchar, OC)
                # 迎面走过来会提前撞上；判定盒有宽度，按接触距离估算到达帧
                eff = max(0.0, dist - num(p.get("w"), 40) / 2 - PUSH_HALF)
                k = int(eff / max(1.0, spd + my_spd))
                if k > 20:
                    continue
                lo, hi = max(0, k - 2), min(14, k + 4)
                for t in range(lo, hi + 1):
                    block_frames.add(t)
            if block_frames:
                for k in range(1, 16):
                    sched[k] = ("B", None) if (k - 1) in block_frames else ("F", None)
                return self._emit(out, sched, "blockproj")

        # ---------------- 3) 气槽满 + 对手无法防御 -> 超必杀斩杀 ----------------
        # 超必杀首段在起手后第 9 帧命中；对手只要那时还处在不能防御的状态（出招/空中）
        # 就必定吃满，直接满血秒杀。若对手能在命中帧之前恢复成站立，就可能被防住 —— 不做。
        if meter >= 100 and not oinv and dx <= SUPER_RANGE:
            if ost in ("jump", "air"):
                self._sched_super(put, f0, sup, 1)
                return self._emit(out, sched, "kill:super")
            if ost == "attack" and omv:
                st = num(omv.get("startup")); ac = num(omv.get("active"))
                rc = num(omv.get("recovery")); fr = num(omv.get("frame"))
                if st + ac + rc - fr >= 11:
                    self._sched_super(put, f0, sup, 1)
                    return self._emit(out, sched, "kill:super")

        # ---------------- 4) 对手受击硬直 -> 连段 ----------------
        if ost == "hitstun" and dx <= max(rk0, 150.0):
            if self._start(put, f0 + 1, mychar, key0, meter):
                return self._emit(out, sched, "combo-start")
            return self._emit(out, sched, "idle")

        # ---------------- 5) 对手出招中 ----------------
        if ost == "attack" and omv:
            md = self._move_data(opchar, OC, omv.get("name"))
            st = num(omv.get("startup")); ac = num(omv.get("active")); rc = num(omv.get("recovery"))
            fr = num(omv.get("frame"))
            rem = max(0.0, st + ac + rc - fr)
            o_reach = move_reach(md) if md else None
            is_proj = bool(md and md.get("projectile") and not md.get("hitbox"))
            is_throw = bool(md and md.get("kind") == "throw")
            t_act = max(0.0, st - fr)          # 还有几帧才出现判定
            danger = bool(is_proj) or bool(is_throw and dx <= 90) or \
                bool(o_reach and dx <= o_reach[1] + 14)

            if fr >= st + ac:
                # 已在收招：能反击就反击，够不着就压上去
                if dx <= rk0 + 6 and rem >= my_startup + 2:
                    if self._start(put, f0 + 1, mychar, key0, meter):
                        return self._emit(out, sched, "punish")
                if dx > rk0 + 6:
                    fill(1, 15, "F")
                    return self._emit(out, sched, "chase-whiff")
                fill(1, 15, "B")
                return self._emit(out, sched, "block")

            if not danger and not is_proj:
                # 打不到我 -> 压上去或直接反击
                if dx <= rk0 + 6 and rem >= my_startup + 2:
                    if self._start(put, f0 + 1, mychar, key0, meter):
                        return self._emit(out, sched, "punish-outrange")
                fill(1, 15, "F")
                return self._emit(out, sched, "chase")

            # 抢招：对手判定帧还早，且没有霸体/无敌，用最快的招直接打断
            can_counter = (t_act >= 5 and dx <= rk0 + 4 and not is_proj
                           and not (md and (md.get("armor") or md.get("invuln"))))
            if can_counter:
                if self._start(put, f0 + 1, mychar, key0, meter):
                    return self._emit(out, sched, "counterpoke")

            # 否则按上下段正确防御，硬直一结束就反击 / 前压
            guard = "B"
            if md and md.get("guard") == "low":
                guard = "DB"
            bs = num((md or {}).get("blockstun"), 10)
            has_box = bool((md or {}).get("hitbox"))
            t_free = int(t_act + (bs if has_box else 0)) + 1
            if not has_box:
                # 对手在放波：这一窗先站住防御，波飞过来会被挡下
                fill(1, 15, guard)
                return self._emit(out, sched, "block")
            fill(1, 15, guard)
            if (dx <= rk0 + 6 and t_free <= 14
                    and rem >= t_free + my_startup + 2):
                self._start(put, f0 + t_free + 1, mychar, key0, meter)
                return self._emit(out, sched, "block+punish")
            if t_free < 15:
                for k in range(t_free + 1, 16):
                    sched[k] = ("F", None)
                return self._emit(out, sched, "block+push")
            return self._emit(out, sched, "block")

        # ---------------- 6) 对手在空中 ----------------
        if ost in ("jump", "air"):
            if dx <= 170:
                fill(1, 15, "B")
            else:
                fill(1, 15, "F")
            return self._emit(out, sched, "air")

        # ---------------- 7) 对手倒地 / 起身 ----------------
        if ost in ("down", "wakeup"):
            fill(1, 15, "F" if dx > 90 else "N")
            return self._emit(out, sched, "okizeme")

        # ---------------- 8) 中立 ----------------
        if dx > rk0 + 55:
            # 靠近，但一次只走到 ~145：对手一旦放波，这个距离还来得及挡
            my_spd = num(C.get("speed"), 5.0)
            n = int((dx - 145.0) / max(1.0, my_spd))
            n = max(1, min(15, n))
            fill(1, n, "F")
            if n < 15:
                fill(n + 1, 15, "B")
            return self._emit(out, sched, "approach")
        if dx > rk0 + 4:
            # 走到刚好进入射程的那一帧再出招，不留出招空窗
            my_spd = num(C.get("speed"), 5.0)
            n = int((dx - rk0 + 8) / max(1.0, my_spd))
            n = max(1, min(13, n))
            fill(1, n, "F")
            key = self._pick_key(mychar, meter)
            if self._start(put, f0 + n + 1, mychar, key, meter):
                return self._emit(out, sched, "walk+poke")
            return self._emit(out, sched, "walk")

        key = self._pick_key(mychar, meter)
        if self._start(put, f0 + 1, mychar, key, meter):
            return self._emit(out, sched, "poke:" + key)
        return self._emit(out, sched, "idle")

    # ------------------------------------------------------------- 辅助
    def _pick_key(self, mychar, meter):
        """对手习惯站防时用下段起手（lk），否则用最快的 lp。"""
        st = STARTERS.get(mychar, ["lp"])
        if len(st) > 1 and (self.blocked_streak % len(st)):
            return st[self.blocked_streak % len(st)]
        return st[0]

    def _start(self, put, start, mychar, key, meter):
        """在 start 帧起手 key 招，并把整条连段排进日程。返回是否成功。"""
        if start < 0:
            start = 0
        routes = ROUTES.get(mychar) or {}
        route = routes.get(key)
        if not route:
            for k in STARTERS.get(mychar, []):
                if k in routes:
                    route = routes[k]
                    key = k
                    break
        if not route:
            return False
        plan = route["full"] if meter >= 100 else route["nom"]
        self.combo = (start, key, {"plan": plan, "first": route["first"], "hits": route["hits"]})
        for off, d, b in plan:
            put(start + off, d, b)
        return True

    def _sched_super(self, put, f0, sup, at):
        """把超必杀指令排进去（方向序列 + 末帧同帧按钮）。"""
        motion = sup.get("motion", "qcf")
        btn = sup.get("button", "HP")
        seq = {"qcf": ["D", "DF", "F"], "qcb": ["D", "DB", "B"],
               "dp": ["F", "D", "DF"], "hcb": ["F", "DF", "D", "DB", "B"]}.get(motion, ["D", "DF", "F"])
        for i, d in enumerate(seq):
            b = btn if i == len(seq) - 1 else None
            put(f0 + at + i, d, b)

    def _proj_speed(self, opchar, OC):
        if not hasattr(self, "_spd"):
            self._spd = {}
        if opchar in self._spd:
            return self._spd[opchar]
        spd = 0.0
        for mv in (OC.get("specials") or {}).values():
            if not isinstance(mv, dict):
                continue
            pj = mv.get("projectile")
            if pj and num(pj.get("speed")) > spd:
                spd = num(pj.get("speed"))
        if spd <= 0:
            spd = 10.0
        self._spd[opchar] = spd
        return spd

    def _move_data(self, opchar, OC, name):
        if not name:
            return None
        if self.move_index is None:
            self.move_index = {}
            # 索引由当前观察里的目录构建
        key = (opchar, name)
        if key in self.move_index:
            return self.move_index[key]
        found = None
        pools = [OC.get("normals") or {}, OC.get("specials") or {}]
        sup = OC.get("super")
        if sup:
            pools.append({"_super": sup})
        for pool in pools:
            for mv in pool.values():
                if isinstance(mv, dict) and mv.get("name") == name:
                    found = mv
                    break
            if found:
                break
        if found is None:
            # 按 id 兜底（目录里 normal 的键名）
            for k2, mv in (OC.get("normals") or {}).items():
                if k2 == name:
                    found = mv
        self.move_index[key] = found
        return found

    def _emit(self, out, sched, note):
        for k, (d, b) in sched.items():
            if 1 <= k <= 15:
                out[k - 1] = {"dir": d, "btn": b}
        return {"inputs": out, "note": note}


def main():
    Agent().run()


if __name__ == "__main__":
    main()
