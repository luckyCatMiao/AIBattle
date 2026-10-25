#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""混合版补丁 2：1v1 solo（best_shot2 + self-pass）、decide_window 的 pred_y 锁定。"""
import pathlib

exp = pathlib.Path('agent_v27_experiment.py').read_text(encoding='utf-8')
p = pathlib.Path('agent.py')
s = p.read_text(encoding='utf-8')


def extract(src, start, end):
    a = src.index(start)
    b = src.index(end, a)
    return src[a:b]


best_shot2 = extract(exp, 'SHOT2_TARGETS = [', 'def launch_spot(')
self_pass = extract(exp, 'def self_pass_cmd(', 'def carrier_cmd(')
solo_new = extract(exp, 'def solo_cmd(', 'def chase_cmd(')

# 1) 在 carrier_cmd 前插入 best_shot2 + self_pass
anchor = s.index('def carrier_cmd(')
s = s[:anchor] + best_shot2 + self_pass + s[anchor:]

# 2) 替换 solo_cmd
a = s.index('def solo_cmd(')
b = s.index('def chase_cmd(', a)
s = s[:a] + solo_new + s[b:]

# 3) 常量
s = s.replace("OPP_SHOT_R = float(os.environ.get('SOC2_OPPSHOTR', '17.0'))",
              "OPP_SHOT_R = float(os.environ.get('SOC2_OPPSHOTR', '17.0'))\n"
              "KICK2_TH_SOLO = float(os.environ.get('SOC2_K2THS', '0.42'))", 1)

# 4) decide_window 锁 pred_y
old = '''def decide_window(s0, me, n):
    T0['t'] = time.time()
    frames = []
    st = s0.clone()
'''
new = '''def decide_window(s0, me, n):
    T0['t'] = time.time()
    frames = []
    st = s0.clone()
    GAME_CTX['k0'] = (s0.owner >= 0 and s0.units[s0.owner].team == me
                      and s0.units[s0.owner].index == 0)
    GAME_CTX['kY0'] = 13.0
    for _u in s0.units:
        if _u.team == me and _u.index == 0:
            GAME_CTX['kY0'] = _u.y
    _gx = MY_GOAL_X[me]
    _plane = _gx + (0.85 if _gx < 20 else -0.85)
    _py = None
    _owner = s0.units[s0.owner] if s0.owner >= 0 else None
    _toward = (s0.bvx > 0.5) if _gx > 20 else (s0.bvx < -0.5)
    if _owner is None and _toward:
        _py = ball_cross_at(s0, _plane)
    if _py is None and _owner is not None and _owner.team != me:
        _D = hyp(_owner.x - _gx, _owner.y - 13.0)
        if _D < OPP_SHOT_R:
            _py = predict_opp_shot_y(GAME_CTX['kY0'], _gx, _plane, s0.bx, s0.by)
    if _py is None and _owner is None:
        _no = min([hyp(o.x - s0.bx, o.y - s0.by)
                   for o in s0.units if o.team != me] or [9.0])
        if _no < 2.5 and hyp(s0.bx - _gx, s0.by - 13.0) < 20.0:
            _py = predict_opp_shot_y(GAME_CTX['kY0'], _gx, _plane, s0.bx, s0.by)
    GAME_CTX['pred_y'] = _py
'''
assert old in s
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
print('patched hybrid2')
