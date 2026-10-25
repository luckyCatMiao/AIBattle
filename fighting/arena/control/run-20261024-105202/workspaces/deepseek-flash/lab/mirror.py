#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""铁拳谱 / IRON CODEX —— deepseek-flash 选手程序（v6）。

== 从 catalog.js / simulation.js 读出、并全部用真引擎离线验证过的事实 ==
1. 多段招式每段按 data.damage 全额结算（hits 只决定段数与间隔）。Vex 超必杀
   hits=8/dmg=280 且**没有 knockup**，受击方不会被打飞，于是段段落地：
   实测在 80~360 px 内稳定命中 5 段 = 1120 伤害 > 1000 生命 → **一次超必杀即秒杀**。
   更关键的是它带 travel（12 帧推进 290 px），受击后退也逃不掉，射程几乎覆盖半屏。
   Kestrel 超必杀（hits=7/dmg=300）同样能秒杀，但没有 travel，受击后退会脱出判定。
   Aegis/Nyx/Sable/Torv 的超必杀带 knockup，后续段落空，秒不掉人。
2. 取消窗口 canCancelUntil = 命中帧 + 10；命中后 hitstop 冻结，第一个「活帧」是
   命中帧 + hitstop + 1。把指令排在 命中帧+hitstop-1 .. +hitstop+1 三帧，就能在
   解冻的第一帧立刻取消成超必杀。hitstop >= 10 的招（Torv hk）来不及取消。
3. 防御只看判定帧那一帧是否按住 B/DB，且必须处于 stand/crouch/blockstun。
   low 要蹲防、overhead 要站防、mid 通吃。
4. 同帧互殴由席位 0 获胜（resolveHits 按 fighters 顺序结算）。
5. 被防御的超必杀：只掉 chip（Vex 8 段 ×36 = 288）与防御槽（-30），但收招 20+18 帧，
   对手防御硬直只有 13 帧 → **被防住的超必杀会被反打**。所以只在对手「不可能防御」时发。
6. 对手处于 attack / hitstun / jump 状态时不可能防御；超必杀起手 1~10 帧无敌，
   所以「对手出招时发超必杀」是稳吃。

== 打法 ==
- 中立：用最快的 lp/lk 抢招攒气（命中 +8，被防 +3）。
- 气满：对手出招 / 收招 / 受击 / 空中，且距离 <= 超必杀有效射程 → 直接超必杀秒杀。
  对手在防御 → 先用下段 lk 试探：打中就取消超必杀秒杀；被蹲防挡下就换 overhead。
- 防御：按对手招式 guard 属性选 B/DB；挡下重招后按精确帧反打。
- 对手气满：优先防御，挡下超必杀后他收招极长，可以完整反打一套。
"""

import sys
import json

MOT = {'qcf': ['D', 'DF', 'F'], 'qcb': ['D', 'DB', 'B'],
       'dp': ['F', 'D', 'DF'], 'hcb': ['F', 'DF', 'D', 'DB', 'B']}
K2B = {'lp': 'LP', 'hp': 'HP', 'lk': 'LK', 'hk': 'HK'}
HALF = 28.0
import os
POKE_DELAY = int(os.environ.get('POKE_DELAY', '0'))
RESPECT_FRAMES = int(os.environ.get('RESPECT_FRAMES', '99999'))
RESPECT_HP = float(os.environ.get('RESPECT_HP', '450'))

AIR_MOVE = {
    '空中轻拳': {'startup': 4, 'active': 6, 'recovery': 6, 'damage': 60, 'hitstun': 12, 'blockstun': 8,
                 'guard': 'overhead', 'hitbox': {'x': 54, 'y': -30, 'w': 70, 'h': 46}, 'hitstop': 4},
    '空中重拳': {'startup': 8, 'active': 6, 'recovery': 10, 'damage': 108, 'hitstun': 16, 'blockstun': 10,
                 'guard': 'overhead', 'hitbox': {'x': 60, 'y': -34, 'w': 84, 'h': 52}, 'hitstop': 6},
    '空中轻腿': {'startup': 4, 'active': 6, 'recovery': 6, 'damage': 58, 'hitstun': 12, 'blockstun': 8,
                 'guard': 'overhead', 'hitbox': {'x': 56, 'y': -28, 'w': 72, 'h': 48}, 'hitstop': 4},
    '空中重腿': {'startup': 9, 'active': 6, 'recovery': 12, 'damage': 114, 'hitstun': 17, 'blockstun': 11,
                 'guard': 'overhead', 'hitbox': {'x': 62, 'y': -36, 'w': 90, 'h': 56}, 'hitstop': 6},
}


def n(v, d=0.0):
    try:
        return float(v)
    except Exception:
        return d


def i_(v, d=0):
    try:
        return int(v)
    except Exception:
        return d


def reach(md, with_travel=False):
    if not md:
        return 0.0
    hb = md.get('hitbox')
    if not hb:
        return 0.0
    r = n(hb.get('x')) + n(hb.get('w')) / 2.0 + HALF
    if with_travel and md.get('travel'):
        r += n(md['travel'].get('distance'))
    return r


def total_frames(md):
    return n(md.get('startup')) + n(md.get('active')) + n(md.get('recovery')) + n(md.get('cinematic'))


class Agent:
    def __init__(self):
        self.ev_last = 0
        self.round = 0
        self.plan = {}
        self.dflt = ('DB', None)
        self.note = ''
        self.f0 = 0
        self.seat = 0
        self.dx = 400.0
        # 记忆
        self.last_hit = -999
        self.last_block = -999
        self.opp_start = -999
        self.opp_name = ''
        self.opp_block_streak = 0
        self.my_atk_guard = 'mid'
        self.opp_crouch_blocks = None    # 推断对手是否蹲防
        self.combo = None
        self.opp_atk_recent = -999
        self.opp_super_seen = False
        self.opp_walking_back = False
        self.opp_x_prev = None
        self.opp_last_block = -999
        self.hitstop_until = -999
        self.opp_full_since = -1

    # ------------------------------------------------------------------ 主循环
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
                sys.stderr.write('ERR %r\n' % (e,))
                out = {'inputs': [{'dir': 'N', 'btn': None} for _ in range(15)], 'note': 'err'}
            sys.stdout.write(json.dumps(out, ensure_ascii=False) + '\n')
            sys.stdout.flush()

    # ------------------------------------------------------------------ 排程
    def at(self, af, d, b=None):
        # 观察帧 f0 已经是「过去」，本窗口实际推进的是 f0+1 .. f0+15
        if self.f0 + 1 <= af <= self.f0 + 15:
            self.plan[af] = (d, b)

    def fill(self, a1, a2, d, b=None):
        for af in range(a1, a2 + 1):
            self.at(af, d, b)

    def emit(self):
        out = []
        for k in range(15):
            d, b = self.plan.get(self.f0 + 1 + k, self.dflt)
            out.append({'dir': d, 'btn': b})
        return {'inputs': out, 'note': self.note}

    def clear(self):
        self.plan = {}

    # ------------------------------------------------------------------ 目录
    def find_move(self, cat, name):
        if not name or not cat:
            return None
        if name in AIR_MOVE:
            return AIR_MOVE[name]
        for pool in ('normals', 'specials'):
            for mv in (cat.get(pool) or {}).values():
                if isinstance(mv, dict) and mv.get('name') == name:
                    return mv
        sup = cat.get('super')
        if isinstance(sup, dict) and sup.get('name') == name:
            return sup
        return None

    # ------------------------------------------------------------------ 事件
    def process_events(self, obs, pi):
        for e in (obs.get('events') or []):
            eid = i_(e.get('id'), 0)
            if eid <= self.ev_last:
                continue
            self.ev_last = eid
            t = e.get('type')
            fr = i_(e.get('frame'), 0)
            if t == 'move':
                if e.get('owner') != pi:
                    self.opp_start = fr
                    self.opp_name = e.get('name') or ''
                    self.opp_atk_recent = fr
            elif t == 'super':
                if e.get('owner') != pi:
                    self.opp_super_seen = True
            elif t == 'block':
                if e.get('owner') == pi:
                    self.last_block = fr
                    self.hitstop_until = max(self.hitstop_until, fr + 4)
                else:
                    self.opp_block_streak += 1
                    self.opp_last_block = fr
                    if self.my_atk_guard == 'low':
                        self.opp_crouch_blocks = True
                    elif self.my_atk_guard == 'overhead':
                        self.opp_crouch_blocks = False
            elif t == 'hit':
                if e.get('owner') == pi:
                    self.last_hit = fr
                    self.hitstop_until = max(self.hitstop_until, fr + 9)
                    self.opp_block_streak = 0
                    if self.my_atk_guard == 'low':
                        self.opp_crouch_blocks = False
                    elif self.my_atk_guard == 'overhead':
                        self.opp_crouch_blocks = True
            elif t in ('round', 'roundEnd'):
                self.last_hit = -999
                self.last_block = -999
                self.opp_start = -999
                self.opp_block_streak = 0
                self.combo = None

    # ------------------------------------------------------------------ 工具
    def guard_dir(self, op, ocat):
        if op.get('airborne') or op.get('state') in ('jump', 'air'):
            return 'B'
        omv = op.get('move')
        if omv and op.get('state') == 'attack':
            md = self.find_move(ocat, omv.get('name'))
            if md and md.get('guard') == 'overhead':
                return 'B'
        return 'DB'

    def sup_range(self, cat):
        sup = cat.get('super')
        if not isinstance(sup, dict):
            return 0.0
        if sup.get('travel'):
            return min(340.0, reach(sup, True) * 0.78)
        return reach(sup) * 0.72

    # ------------------------------------------------------------------ 排招
    def motion_at(self, t_end, motion, btn):
        seq = MOT.get(motion, ['D', 'DF', 'F'])
        t0 = t_end - (len(seq) - 1)
        for i, d in enumerate(seq):
            self.at(t0 + i, d, btn if i == len(seq) - 1 else None)
        for j in (1, 2):
            self.at(t_end + j, seq[-1], btn)

    def plan_super(self, t):
        sup = self.C.get('super')
        if not isinstance(sup, dict):
            return False
        if n(self.me.get('meter')) < n(sup.get('cost'), 100):
            return False
        seq = MOT.get(sup.get('motion'), ['D', 'DF', 'F'])
        # 整个方向序列必须落在本窗口内，否则前面的方向帧会被裁掉、指令不成立
        t = max(t, self.f0 + len(seq))
        self.motion_at(t, sup.get('motion'), sup.get('button'))
        return True

    def plan_chain(self, t, keys, fin_super):
        """按帧数据排一条普攻连段；每段的判定帧必须落在上一段的 hitstun 内。"""
        normals = self.C.get('normals') or {}
        cur = t
        for idx, key in enumerate(keys):
            d = normals.get(key) or {}
            s = int(n(d.get('startup'), 5))
            hs = int(n(d.get('hitstop'), 4))
            hst = int(n(d.get('hitstun'), 11))
            if idx == 0:
                self.my_atk_guard = d.get('guard') or 'mid'
            self.at(cur, 'F', K2B[key])
            h = cur + s
            if idx == len(keys) - 1:
                if fin_super and self.plan_super(max(cur + 1, h + max(1, hs - 1))):
                    for f in range(h + hs + 3, h + hs + 8):
                        self.at(f, 'DB', None)
                return True
            nk = keys[idx + 1]
            nd = normals.get(nk) or {}
            ns = int(n(nd.get('startup'), 5))
            p = h + hs + 1
            if p + ns > h + hs + hst - 1:
                return False
            cur = p
        return True

    def build_chain(self, t, start_key, max_len=3):
        """从 start_key 起贪心接最重的可连招。"""
        normals = self.C.get('normals') or {}
        keys = [start_key]
        while len(keys) < max_len:
            d = normals.get(keys[-1]) or {}
            hs = int(n(d.get('hitstop'), 4))
            hst = int(n(d.get('hitstun'), 11))
            best = None
            for k in ('hp', 'hk', 'lk', 'lp'):
                if k == keys[-1]:
                    continue
                nd = normals.get(k) or {}
                ns = int(n(nd.get('startup'), 5))
                if ns + hs + 1 <= hs + hst - 1:
                    if best is None or n(nd.get('damage')) > n((normals.get(best) or {}).get('damage')):
                        best = k
            if best is None:
                break
            keys.append(best)
        return keys

    def plan_attack(self, t, key, fin_super, link_key=None):
        keys = [key]
        if link_key and link_key != key:
            keys.append(link_key)
        self.plan_chain(t, keys, fin_super)

    def plan_punish(self, t):
        """对手在收招/硬直里：用够得着的最重普攻起手，接满连段，气满则以超必杀收尾。"""
        cat = self.C
        normals = cat.get('normals') or {}
        dx = self.dx
        full = n(self.me.get('meter')) >= n((cat.get('super') or {}).get('cost'), 100)
        best = None
        for k in ('hk', 'hp', 'lk', 'lp'):
            d = normals.get(k) or {}
            if not d:
                continue
            if reach(d, True) >= dx - 2:
                best = k
                break
        if best is None:
            best = 'lp'
        self.plan_chain(t, self.build_chain(t, best), full)

    # ------------------------------------------------------------------ 决策
    def decide(self, obs):
        self.clear()
        self.note = ''
        self.f0 = i_(obs.get('frame'), 0)
        pi = i_(obs.get('yourPlayer'), 0)
        self.seat = pi
        rnd = i_(obs.get('round'), 1)
        if rnd != self.round:
            self.round = rnd
            self.combo = None
            self.last_hit = -999
            self.last_block = -999
            self.opp_start = -999
            self.opp_block_streak = 0
            self.opp_crouch_blocks = None
        F = obs.get('fighters') or []
        if len(F) < 2:
            self.dflt = ('DB', None)
            return self.emit()
        me = F[pi]
        op = F[1 - pi]
        self.me = me
        self.op = op
        cat_all = (obs.get('catalog') or {})
        chars = cat_all.get('characters') if 'characters' in cat_all else cat_all
        chars = chars or {}
        self.C = chars.get(me.get('char')) or {}
        self.OC = chars.get(op.get('char')) or {}
        self.dx = abs(n(op.get('x')) - n(me.get('x')))
        # 对手在 stand/crouch 却持续后退 -> 多半在按后防御
        ox = n(op.get('x'))
        if self.opp_x_prev is not None and op.get('state') in ('stand', 'crouch', 'blockstun'):
            # 远离我 = 在按后（防御）；靠近我 = 在前进
            away = 1 if ox > n(me.get('x')) else -1
            dv = (ox - self.opp_x_prev) * away
            if dv > 0.5:
                self.opp_walking_back = True
            elif dv < -0.5:
                self.opp_walking_back = False
        self.opp_x_prev = ox
        self._projs = obs.get('projectiles') or []
        self.process_events(obs, pi)

        st = me.get('state')
        if st == 'ko':
            self.dflt = ('DB', None)
            return self.emit()
        if st in ('jump', 'air') or me.get('airborne'):
            self.combo = None
            self.dflt = ('N', None)
            self.note = 'air'
            return self.emit()
        if st in ('hitstun', 'down', 'wakeup'):
            self.combo = None
            self.dflt = (self.guard_dir(op, self.OC), None)
            return self.emit()
        if st == 'stance':
            self.combo = None
            self.dflt = ('DB', None)
            return self.emit()
        if st == 'blockstun':
            self.bf = self.f0 + 1
            return self.on_blockstun(op)
        if st == 'attack':
            return self.on_attack(op)
        self.combo = None
        self.bf = self.f0 + 1
        return self.free(op)

    # ------------------------------------------------------------------ 出招中
    def on_attack(self, op):
        mv = self.me.get('move') or {}
        md = self.find_move(self.C, mv.get('name'))
        kind = mv.get('kind')
        self.dflt = ('DB', None)
        if kind in ('normal', 'air') and md:
            h = self.last_hit
            if h > 0 and self.f0 <= h + 10:
                if n(self.me.get('meter')) >= n((self.C.get('super') or {}).get('cost'), 100):
                    self.plan_super(self.bf)
                    self.note = 'cancel-super'
                    return self.emit()
        # 招式在本窗口内收完 -> 剩下的帧按自由状态重新决策（否则会呆走到对手判定里）
        if md:
            remain = total_frames(md) - n(mv.get('frame'))
            extra = max(0, self.hitstop_until - self.f0)
            end = self.f0 + int(max(0.0, remain)) + extra
            if end <= self.f0 + 14:
                self.bf = end + 1
                self.note = 'atk-free@%d' % self.bf
                return self.free(op)
        self.note = 'atk'
        return self.emit()

    # ------------------------------------------------------------------ 防御硬直
    def on_blockstun(self, op):
        self.dflt = (self.guard_dir(op, self.OC), None)
        self.combo = None
        md = self.find_move(self.OC, self.opp_name)
        hs = int(n((md or {}).get('hitstop'), 4))
        bs = int(n((md or {}).get('blockstun'), 7))
        if self.last_block > 0:
            freef = self.last_block + hs + bs + 1
            if self.f0 < freef <= self.f0 + 15:
                tot = total_frames(md) if md else 20
                opp_free = self.opp_start + tot + hs
                if opp_free > freef + 2:
                    self.plan_punish(freef)
                    self.note = 'blockpunish@%d' % freef
                    return self.emit()
                # 没有大破绽：恢复自由那一帧就用最快的招抢一次（对手多半还在起手）
                normals = self.C.get('normals') or {}
                key = 'lp'
                for k in ('lp', 'lk'):
                    d = normals.get(k) or {}
                    if reach(d) >= self.dx - 2:
                        key = k
                        break
                self.plan_attack(freef, key, False, None)
                self.note = 'blocktake@%d' % freef
                return self.emit()
        self.note = 'blk'
        return self.emit()

    # ------------------------------------------------------------------ 自由
    def free(self, op):
        me, C, OC = self.me, self.C, self.OC
        dx = self.dx
        normals = C.get('normals') or {}
        lp = normals.get('lp') or {}
        lp_r = reach(lp)
        lp_s = int(n(lp.get('startup'), 4))
        meter = n(me.get('meter'))
        sup = C.get('super') or {}
        full = meter >= n(sup.get('cost'), 100)
        SR = self.sup_range(C)
        op_meter = n(op.get('meter'))
        op_super_ready = op_meter >= n((OC.get('super') or {}).get('cost'), 100)
        ostate = op.get('state')
        omv = op.get('move')
        o_air = bool(op.get('airborne')) or ostate in ('jump', 'air')
        self.dflt = ('DB', None)

        # 1) 迎面投射物
        pf = self.proj_block_frames()
        if pf:
            for k in range(1, 16):
                self.at(self.bf + k - 1, 'DB' if k in pf else 'F')
            self.note = 'blockproj'
            return self.emit()

        # 2) 对手出招
        if ostate == 'attack' and omv:
            md = self.find_move(OC, omv.get('name'))
            fr = n(omv.get('frame'))
            s = n((md or {}).get('startup'), n(omv.get('startup'), 5))
            a = n((md or {}).get('active'), n(omv.get('active'), 0))
            r = n((md or {}).get('recovery'), n(omv.get('recovery'), 8))
            tot = s + a + r + n((md or {}).get('cinematic'), 0)
            inv = bool((md or {}).get('invuln'))
            rch = reach(md, True) if md else 200.0
            remain = tot - fr
            if fr >= s + a:
                # ---- 收招中：我的回合
                if full and dx <= SR:
                    self.plan_super(self.bf)
                    self.note = 'super-punish'
                    return self.emit()
                if remain > lp_s + 2 and dx <= max(reach(normals.get('hk')), reach(normals.get('hp')), lp_r):
                    self.plan_punish(self.bf)
                    self.note = 'punish'
                    return self.emit()
                if dx > lp_r - 2:
                    # 安全前进：只在他收招的那几帧走
                    self.walk_safe(int(min(14, max(1, remain))))
                    self.note = 'chase'
                    return self.emit()
                self.dflt = (self.guard_dir(op, OC), None)
                self.note = 'blk'
                return self.emit()
            # ---- 起手/判定中
            if full and dx <= SR and not inv:
                self.plan_super(self.bf)
                self.note = 'super-counter'
                return self.emit()
            # 抢招：我的判定帧要落在他判定帧之前
            if (not inv) and (s - fr) > lp_s + 1 and dx <= lp_r - 2:
                self.plan_attack(self.bf, 'lp', full, None if full else 'lk')
                self.note = 'counterpoke'
                return self.emit()
            if dx <= rch + 8:
                self.dflt = (self.guard_dir(op, OC), None)
                if not (md or {}).get('hits'):
                    hs = int(n((md or {}).get('hitstop'), 4))
                    bs = int(n((md or {}).get('blockstun'), 7))
                    thit = self.f0 + int(max(0.0, s - fr))
                    tf = thit + hs + bs + 1
                    if tf <= self.f0 + 15 and remain > bs + 3:
                        self.plan_punish(max(self.bf, tf))
                        self.note = 'blockcounter@%d' % tf
                        return self.emit()
                # 挡完他这一招之后立刻反打
                hs = int(n((md or {}).get('hitstop'), 4))
                bs = int(n((md or {}).get('blockstun'), 7))
                end = self.f0 + int(max(0.0, tot - fr)) + hs
                self.note = 'blk'
                return self.emit()
            # 打不到我 -> 前进（他这招已经出完了就只走收招帧）
            if fr < s + a:
                self.walk_safe(int(min(14, max(1, s + a - fr))))
            else:
                self.walk_safe(int(min(14, max(1, remain))))
            self.note = 'chase'
            return self.emit()

        # 3) 对手空中
        if o_air:
            if full and dx <= SR:
                self.plan_super(self.bf)
                self.note = 'super-antiair'
                return self.emit()
            if dx <= 220:
                self.dflt = ('B', None)
                self.note = 'blockair'
                return self.emit()

        # 4) 对手受击硬直：立刻接（他挡不住）
        if ostate == 'hitstun':
            r = max(reach(normals.get('lp')), reach(normals.get('lk')))
            if full and dx <= SR:
                self.plan_super(self.bf)
                self.note = 'super-combo'
                return self.emit()
            if dx <= r + 30:
                self.plan_chain(self.bf, self.build_chain(self.bf, 'lp'), False)
                self.note = 'combo'
                return self.emit()

        # 5) 中立
        # 对手气满且在超必杀射程内：中立不要乱出招（超必杀起手带无敌帧，抢不过），
        # 只在他收招/受击硬直里动手；否则蹲防等他先动。
        op_cost = n((OC.get('super') or {}).get('cost'), 100)
        op_SR = self.sup_range(OC) if OC else 0.0
        if op_meter >= op_cost:
            if self.opp_full_since < 0:
                self.opp_full_since = self.f0
        else:
            self.opp_full_since = -1
        # 对手气满超过 15 秒还没放 -> 判定他不会放，恢复主动（否则会被白削防磨死）
        holding = ((self.opp_full_since >= 0 and (self.f0 - self.opp_full_since) <= RESPECT_FRAMES)
                   or n(me.get('hp')) <= RESPECT_HP)
        # 我气满时不龟：此时该主动找机会用超必杀秒杀（他出招的瞬间就是机会）
        danger = op_meter >= op_cost and dx <= max(200.0, op_SR) and holding and not full
        if danger and (self.f0 - self.opp_atk_recent) <= 60:
            self.dflt = (self.guard_dir(op, OC), None)
            self.note = 'respect-super'
            return self.emit()

        lk = normals.get('lk') or {}
        has_low = lk.get('guard') == 'low'
        blocking_opp = self.opp_block_streak >= 1 or self.opp_walking_back
        if blocking_opp and self.opp_crouch_blocks and has_low:
            return self.jump_overhead(op)
        key = 'lk' if (blocking_opp and has_low) else 'lp'
        d = normals.get(key) or {}
        if reach(d) < dx - 2 and key != 'lp':
            key = 'lp'
            d = normals.get('lp') or {}
        atk_r = reach(d) or lp_r

        if dx <= atk_r - 2:
            t = min(self.bf + POKE_DELAY, self.f0 + 15)
            if full:
                self.plan_attack(t, key, True)
                self.note = 'killpoke:' + key
            else:
                link = 'lk' if key != 'lk' else 'lp'
                self.plan_attack(t, key, False, link)
                self.note = 'poke:' + key
            return self.emit()

        if full and dx <= SR and (self.f0 - self.opp_last_block) > 26:
            self.plan_super(self.bf)
            self.note = 'super-neutral'
            return self.emit()

        # 对手气满且我血很少：蹲防等他出招（挡下超必杀后他收招极长，可完整反打）
        if op_super_ready and dx <= SR and not full and n(me.get('hp')) < 300:
            self.dflt = (self.guard_dir(op, OC), None)
            self.note = 'respect-super'
            return self.emit()

        self.walk_safe(8)
        self.note = 'approach'
        return self.emit()

    def walk_safe(self, frames):
        """只走 frames 帧，其余蹲防（不主动走进对手判定）。"""
        for k in range(frames):
            self.at(self.bf + k, 'F')
        self.dflt = ('DB', None)

    # ------------------------------------------------------------------ 跳入 overhead
    def jump_overhead(self, op):
        """对手爱蹲防：跳入用空中重拳（overhead）破防。"""
        dx = self.dx
        # 已经在跳 -> 出空中攻击
        if self.me.get('airborne') or self.me.get('state') in ('jump', 'air'):
            self.my_atk_guard = 'overhead'
            self.at(self.bf, 'F', 'HP')
            self.note = 'air-overhead'
            return self.emit()
        if dx > 200:
            self.approach(150, 6)
            self.note = 'approach-jump'
            return self.emit()
        # 起跳：UF，第 2 帧起可以出空中招
        self.my_atk_guard = 'overhead'
        self.at(self.bf, 'UF')
        self.at(self.bf + 2, 'F', 'HP')
        self.note = 'jumpin'
        return self.emit()

    def approach(self, stop, lead_frames):
        dx = self.dx
        spd = max(1.0, n(self.C.get('speed'), 5.0))
        need = int((dx - stop) / spd) + 1
        need = max(1, min(14, need))
        for k in range(need):
            self.at(self.bf + k, 'F')
        self.dflt = ('DB', None)

    # ------------------------------------------------------------------ 投射物
    def proj_block_frames(self):
        ps = [p for p in (getattr(self, '_projs', None) or []) if p.get('owner') != self.seat]
        if not ps:
            return None
        myx = n(self.me.get('x'))
        opx = n(self.op.get('x'))
        spd = max(1.0, n(self.C.get('speed'), 5.0))
        out = set()
        for p in ps:
            px = n(p.get('x'))
            toward = (px < myx) if myx > opx else (px > myx)
            if not toward:
                continue
            pv = self.proj_speed(p)
            dist = abs(px - myx) - n(p.get('w'), 40) / 2.0 - HALF
            k = int(max(0.0, dist) / max(1.0, pv + spd))
            if k > 15:
                continue
            for t in range(max(1, k - 1), min(15, k + 3) + 1):
                out.add(t)
        return out or None

    def proj_speed(self, p):
        for mv in (self.OC.get('specials') or {}).values():
            if not isinstance(mv, dict):
                continue
            pj = mv.get('projectile')
            if not pj:
                continue
            if abs(n(pj.get('w')) - n(p.get('w'))) < 1 and abs(n(pj.get('h')) - n(p.get('h'))) < 1:
                return max(1.0, n(pj.get('speed'), 10.0))
        return 10.0


def main():
    Agent().run()


if __name__ == '__main__':
    main()
