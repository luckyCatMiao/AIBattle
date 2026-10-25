#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""铁拳谱 · deepseek-flash 选手程序（v4）。

== 从 catalog.js / simulation.js 读出的关键事实（全部用真实引擎离线验证）==

1. 多段招式的每一段都按 data.damage 全额结算（resolveHits 把 m.data 交给 applyHit，
   hits 只决定「几段、每几帧一段」）。于是 Vex 超必杀（hits=8, dmg=280）与
   Kestrel 超必杀（hits=7, dmg=300）打满分别约 1456 / 1470，而生命只有 1000 ——
   **这两个超必杀命中即秒杀**（实测 lp/lk 命中后取消，共 1030~1118 伤害，第 5~6 段 KO）。
   Aegis/Nyx/Sable/Torv 的超必杀带 knockup，后续段会因对手被打飞而落空，只有几百伤害。

2. 防御必须在**判定帧那一帧按住 B/DB**（resolveHits 读 def.held.dir）。出招中、空中、
   受击硬直中、走前方向时都不能防御。因此**对手一旦不在防御状态，超必杀必中**。

3. 取消窗口 = 命中帧 + 10。命中后 hitstop 冻结数帧，收招续行在「命中帧 + hitstop + 1」，
   hitstop ≤ 9 就能在这个续行帧取消成必杀/超必杀。被防御时 canCancelUntil 不设，
   取消不成立。=> 「普攻之后接 qcf+HP」是**安全确认选项**：命中必杀、被防什么都不发生。

4. **同帧互殴由席位 0 获胜**：resolveHits 按 g.fighters 顺序结算，席位 0 先手命中就把
   对手 move 置空。所以席位 0 中立抢招永远赚、席位 1 中立抢招永远亏。

5. 被防御的普攻也削血（complete() 补 chip = max(4, dmg*0.08)）并扣 4 点防御槽；
   被防御时攻击方 +3 气、防御方 +2 气。

== 打法 ==
   席位 0：中立射程内直接抢招（同帧互殴必胜），命中即取消超必杀秒杀。
   席位 1：中立蹲防等对手先动；挡住对手的招后按「我方恢复帧」精确反打
           （对手还在收招/起手中，不能防御）→ 命中 → 取消超必杀。
   共同：对手收招中反打、判定帧未到且比我慢时抢招、对手连续站防就改用下段 lk。
"""

import sys
import json

MOT = {'qcf': ['D', 'DF', 'F'], 'qcb': ['D', 'DB', 'B'],
       'dp': ['F', 'D', 'DF'], 'hcb': ['F', 'DF', 'D', 'DB', 'B']}
K2B = {'lp': 'LP', 'hp': 'HP', 'lk': 'LK', 'hk': 'HK'}
HALF = 28.0          # pushbox.w / 2

AIR_MOVE = {
    '空中轻拳': {'startup': 4, 'active': 6, 'recovery': 6, 'hitbox': {'x': 54, 'y': -30, 'w': 70, 'h': 46}, 'guard': 'overhead'},
    '空中重拳': {'startup': 8, 'active': 6, 'recovery': 10, 'hitbox': {'x': 60, 'y': -34, 'w': 84, 'h': 52}, 'guard': 'overhead'},
    '空中轻腿': {'startup': 4, 'active': 6, 'recovery': 6, 'hitbox': {'x': 56, 'y': -28, 'w': 72, 'h': 48}, 'guard': 'overhead'},
    '空中重腿': {'startup': 9, 'active': 6, 'recovery': 12, 'hitbox': {'x': 62, 'y': -36, 'w': 90, 'h': 56}, 'guard': 'overhead'},
}


def n(v, d=0.0):
    try:
        return float(v)
    except Exception:
        return d


def reach_hi(md, with_travel=False):
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
        self.f0 = 0
        self.sched = {}
        self.note = ''
        self.chain = None
        self.C = {}
        self.OC = {}
        self.me = {}
        self.op = {}
        self._idx = {}
        self.ev_last = 0
        self.seat = 0
        self.round = 0
        self.last_block = -999
        self.op_move = ''
        self.op_last_attack = -999
        self.my_last_hit = -999
        self.opp_blocks = 0          # 对手挡下我攻击的连续次数
        self.lead = 'lp'
        self.wait_start = None

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

    # ------------------------------------------------------------------ 工具
    def at(self, af, d, b=None):
        if self.f0 <= af <= self.f0 + 14:
            self.sched[af] = (d, b)

    def fill(self, a1, a2, d, b=None):
        for af in range(a1, a2 + 1):
            self.at(af, d, b)

    def emit(self):
        out = []
        for k in range(15):
            d, b = self.sched.get(self.f0 + k, ('DB', None))
            out.append({'dir': d, 'btn': b})
        return {'inputs': out, 'note': self.note}

    def data_of(self, cat, name):
        if not name:
            return None
        key = (id(cat), name)
        if key in self._idx:
            return self._idx[key]
        found = None
        if name in AIR_MOVE:
            found = AIR_MOVE[name]
        else:
            for pool in ('normals', 'specials'):
                for mv in (cat.get(pool) or {}).values():
                    if isinstance(mv, dict) and mv.get('name') == name:
                        found = mv
                        break
                if found:
                    break
            if not found:
                sup = cat.get('super')
                if isinstance(sup, dict) and sup.get('name') == name:
                    found = sup
        self._idx[key] = found
        return found

    # ------------------------------------------------------------------ 连段排程
    def chain_schedule(self, t0, keys, fin):
        t = t0
        for i, k in enumerate(keys):
            d = (self.C.get('normals') or {}).get(k) or {}
            s = int(n(d.get('startup'), 5))
            h = int(n(d.get('hitstop'), 4))
            self.at(t, 'F', K2B[k])
            resume = t + s + h + 1
            if i == len(keys) - 1:
                if fin:
                    self.motion_schedule(resume, self.C.get('super') or {})
            else:
                t = resume

    def motion_schedule(self, t_end, sup):
        seq = MOT.get(sup.get('motion'), ['D', 'DF', 'F'])
        btn = sup.get('button', 'HP')
        t_start = t_end - (len(seq) - 1)
        for i, d in enumerate(seq):
            self.at(t_start + i, d, btn if i == len(seq) - 1 else None)
        for j in (1, 2):
            self.at(t_end + j, seq[-1], btn)

    def start_chain(self, t0, keys, fin, tag):
        self.chain = {'t0': t0, 'keys': keys, 'fin': fin}
        self.note = tag
        self.chain_schedule(t0, keys, fin)

    def chain_span(self):
        if not self.chain:
            return 0
        sp = 0
        for k in self.chain['keys']:
            d = (self.C.get('normals') or {}).get(k) or {}
            sp += total_frames(d) + int(n(d.get('hitstop'), 4)) + 2
        if self.chain.get('fin'):
            sp += 30
        return sp

    def meter_after(self, meter, keys):
        g = meter
        normals = self.C.get('normals') or {}
        for k in keys:
            g += n((normals.get(k) or {}).get('meterGain'), 8)
        return g

    def plan_offense(self, t0, tag, lead=None):
        meter = n(self.me.get('meter'))
        lead = lead or self.lead
        if meter >= 100:
            self.start_chain(t0, [lead], True, tag + ':kill')
            return
        # 连段会被命中推离打断：按预计距离逐段截断，只排「一定够得着」的部分
        keys = [lead]
        normals = self.C.get('normals') or {}
        dx = abs(n(self.op.get('x')) - n(self.me.get('x')))
        cum = dx
        for k in ('lk', 'hp') if lead != 'lk' else ('lp', 'hp'):
            cum += 24.0                      # 每次命中把双方推远约 24px
            if cum <= reach_hi(normals.get(k) or {}) - 6:
                keys.append(k)
            else:
                break
        fin = self.meter_after(meter, keys) >= 100
        self.start_chain(t0, keys, fin, tag + ':chain')

    # ------------------------------------------------------------------ 事件
    def process_events(self, obs):
        pi = obs.get('yourPlayer')
        for e in (obs.get('events') or []):
            eid = e.get('id') or 0
            if eid <= self.ev_last:
                continue
            self.ev_last = eid
            t = e.get('type')
            fr = int(e.get('frame') or 0)
            if t == 'move':
                if e.get('owner') != pi:
                    self.op_move = e.get('name') or ''
                    self.op_last_attack = fr
            elif t == 'block':
                if e.get('owner') == pi:
                    self.last_block = fr
                else:
                    self.opp_blocks += 1
            elif t == 'hit':
                if e.get('owner') == pi:
                    self.my_last_hit = fr
                    self.opp_blocks = 0

    # ------------------------------------------------------------------ 防御方向
    def guard_dir(self, op):
        if op.get('airborne') or op.get('state') in ('jump', 'air'):
            return 'B'
        omv = op.get('move')
        if omv and op.get('state') == 'attack':
            md = self.data_of(self.OC, omv.get('name'))
            if md and md.get('guard') == 'overhead':
                return 'B'
        return 'DB'

    def block_free_frame(self):
        if self.last_block < 0:
            return None
        md = self.data_of(self.OC, self.op_move) or {}
        hs = int(n(md.get('hitstop'), 4))
        bs = int(n(md.get('blockstun'), 7))
        return int(self.last_block) + hs + bs + 1

    # ------------------------------------------------------------------ 决策
    def decide(self, obs):
        self.sched = {}
        self.note = ''
        self.f0 = int(obs.get('frame') or 0)
        pi = int(obs.get('yourPlayer') or 0)
        rnd = int(obs.get('round') or 1)
        if rnd != self.round:
            self.round = rnd
            self.chain = None
            self.last_block = -999
            self.op_move = ''
            self.opp_blocks = 0
        F = obs.get('fighters') or []
        if len(F) < 2:
            return self.emit()
        me = F[pi]
        op = F[1 - pi]
        self.me = me
        self.op = op
        self.seat = pi
        cat = (obs.get('catalog') or {}).get('characters') or {}
        self.C = cat.get(me.get('char')) or {}
        self.OC = cat.get(op.get('char')) or {}
        self.process_events(obs)
        # 对手连续挡下我的起手 -> 改用下段
        self.lead = 'lk' if self.opp_blocks >= 3 else 'lp'

        st = me.get('state')
        if st == 'ko':
            return self.emit()

        if st in ('hitstun', 'down', 'wakeup', 'stance'):
            self.chain = None
            self.fill(self.f0 + 1, self.f0 + 15, self.guard_dir(op))
            self.note = 'busy:' + str(st)
            return self.emit()

        if st == 'blockstun':
            return self.on_blockstun(obs, me, op, pi)

        if st == 'attack':
            if self.chain:
                t0 = self.chain['t0']
                dead = (self.my_last_hit < t0 and self.f0 > t0 + 16
                        and op.get('state') not in ('hitstun', 'blockstun', 'down'))
                if (not dead) and self.f0 <= t0 + self.chain_span() + 8:
                    self.chain_schedule(t0, self.chain['keys'], self.chain['fin'])
                    self.note = 'chain'
                    return self.emit()
                self.chain = None
            self.note = 'attack'
            return self.emit()

        self.chain = None
        return self.free(obs, me, op, pi)

    # ------------------------------------------------------------------ 防御硬直中
    def on_blockstun(self, obs, me, op, pi):
        g = self.guard_dir(op)
        self.fill(self.f0 + 1, self.f0 + 15, g)
        # 上一窗口已经预排好反打帧，继续等它
        if self.chain and self.chain['t0'] > self.f0:
            self.chain_schedule(self.chain['t0'], self.chain['keys'], self.chain['fin'])
            self.note = 'bc-hold'
            return self.emit()
        if self.chain and self.chain['t0'] < self.f0:
            self.chain = None
        if op.get('state') == 'attack' and op.get('move'):
            md = self.data_of(self.OC, op['move'].get('name'))
            fr = n(op['move'].get('frame'))
            s = n((md or {}).get('startup'), 5)
            a = n((md or {}).get('active'), 0)
            if fr < s + a:
                self.note = 'blockstun:wait'
                return self.emit()
        tf = self.block_free_frame()
        if tf is not None and self.f0 <= tf <= self.f0 + 14:
            self.plan_offense(tf, 'counter')
            self.note = 'counter@%d' % tf
        else:
            self.note = 'blockstun'
        return self.emit()

    # ------------------------------------------------------------------ 自由行动
    def free(self, obs, me, op, pi):
        C = self.C
        OC = self.OC
        normals = C.get('normals') or {}
        lp = normals.get('lp') or {}
        lp_r = reach_hi(lp)
        lp_s = int(n(lp.get('startup'), 4))
        dx = abs(n(op.get('x')) - n(me.get('x')))

        ostate = op.get('state')
        omv = op.get('move')
        o_air = bool(op.get('airborne')) or ostate in ('jump', 'air')

        # ---------- 1) 迎面投射物 ----------
        pf = self.proj_block_frames(obs, pi, me, op)
        if pf:
            for k in range(1, 16):
                self.at(self.f0 + k, 'DB' if k in pf else 'F')
            self.note = 'blockproj'
            return self.emit()

        # ---------- 2) 对手出招 ----------
        if ostate == 'attack' and omv:
            md = self.data_of(OC, omv.get('name'))
            fr = n(omv.get('frame'))
            s = n((md or {}).get('startup', omv.get('startup')), 5)
            a = n((md or {}).get('active', omv.get('active')), 0)
            r = n((md or {}).get('recovery', omv.get('recovery')), 8)
            tot = s + a + r + n((md or {}).get('cinematic'), 0)
            rch = reach_hi(md, True) if md else 200.0
            if fr >= s + a:
                # 收招中：能打就打，够不着就压上去
                if dx <= lp_r and (tot - fr) > lp_s + 1:
                    self.plan_offense(self.f0 + 1, 'punish')
                    return self.emit()
                if dx > lp_r + 4:
                    self.approach(lp_r, 8)
                    self.note = 'chase-whiff'
                    return self.emit()
                self.fill(self.f0 + 1, self.f0 + 15, self.guard_dir(op))
                self.note = 'block'
                return self.emit()
            if (s - fr) > lp_s + 1 and dx <= lp_r:
                self.plan_offense(self.f0 + 1, 'counterpoke')
                return self.emit()
            if dx <= rch:
                self.fill(self.f0 + 1, self.f0 + 15, self.guard_dir(op))
                # 预判：这一招会打在我的防御上 -> 精确排在「我恢复自由那一帧」反打
                multi = n((md or {}).get('hits'), 1) > 1
                if not multi:
                    hs = int(n((md or {}).get('hitstop'), 4))
                    bs = int(n((md or {}).get('blockstun'), 7))
                    thit = self.f0 + int(max(0.0, s - fr))
                    tf = thit + hs + bs + 1
                    if tf <= self.f0 + 14:
                        self.plan_offense(max(self.f0 + 1, tf), 'blockcounter')
                self.note = 'block'
                return self.emit()
            # 打不到我：压上去
            self.approach(lp_r, 6)
            self.note = 'chase'
            return self.emit()
        if o_air:
            if dx <= 210:
                self.fill(self.f0 + 1, self.f0 + 15, 'B')
                self.note = 'blockair'
                return self.emit()

        # 对手在受击硬直里 -> 立刻接（他挡不住），气槽够就直接斩杀
        if ostate == 'hitstun' and dx <= lp_r + 24:
            self.plan_offense(self.f0 + 1, 'combo')
            return self.emit()

        # ---------- 3) 中立 ----------
        olp = (OC.get('normals') or {}).get('lp') or {}
        op_r = reach_hi(olp) or 130.0
        op_poke_recent = (self.f0 - self.op_last_attack) <= 24

        if dx <= lp_r - 2:
            tf = self.block_free_frame()
            # 刚挡下对手的招 -> 用精确帧反打（对手此时在收招/起手中，挡不住）
            if tf is not None and self.f0 <= tf <= self.f0 + 12 and (self.f0 - self.last_block) <= 14:
                self.wait_start = None
                self.plan_offense(max(self.f0 + 1, tf), 'counter')
                return self.emit()
            if self.seat == 0:
                self.wait_start = None
                self.plan_offense(self.f0 + 1, 'poke')
                return self.emit()
            # 后手：中立抢招永远亏（同帧互殴由席位 0 获胜）。
            # 固定节奏：先蹲防吃下对手本窗口开头的抢招，再在「自己恢复自由那一帧」
            # （对手 lp 起手 3 + hitstop 4 + blockstun 6 + 1 = 本窗口第 15 帧）反打。
            # 对手若继续抢招，正好撞在我的判定帧上；对手若防御则我只是被防，不吃亏。
            self.fill(self.f0 + 1, self.f0 + 13, self.guard_dir(op))
            self.plan_offense(self.f0 + 14, 'waitpoke')
            return self.emit()

        self.wait_start = None
        stop = lp_r - 6
        if self.seat == 1:
            stop = max(stop, min(op_r - 10, lp_r - 6))
        self.approach(stop, 6)
        self.note = 'approach'
        return self.emit()

    def approach(self, stop, lead_frames):
        C = self.C
        dx = abs(n(self.op.get('x')) - n(self.me.get('x')))
        spd = max(1.0, n(C.get('speed'), 5.0))
        need = int((dx - stop) / spd) + 1
        need = max(1, min(14, need))
        for k in range(1, need + 1):
            self.at(self.f0 + k, 'F')
        for k in range(need + 1, 16):
            self.at(self.f0 + k, 'DB')

    # ------------------------------------------------------------------ 投射物
    def proj_block_frames(self, obs, pi, me, op):
        ps = [p for p in (obs.get('projectiles') or []) if p.get('owner') != pi]
        if not ps:
            return None
        myx = n(me.get('x'))
        opx = n(op.get('x'))
        spd = max(1.0, n(self.C.get('speed'), 5.0))
        out = set()
        for p in ps:
            px = n(p.get('x'))
            toward = (px < myx) if myx > opx else (px > myx)
            if not toward:
                continue
            pv = self.proj_speed(self.OC, p)
            dist = abs(px - myx) - n(p.get('w'), 40) / 2.0 - HALF
            k = int(max(0.0, dist) / max(1.0, pv + spd))
            if k > 14:
                continue
            for t in range(max(1, k - 1), min(15, k + 3) + 1):
                out.add(t)
        return out or None

    def proj_speed(self, cat, p):
        for mv in (cat.get('specials') or {}).values():
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
