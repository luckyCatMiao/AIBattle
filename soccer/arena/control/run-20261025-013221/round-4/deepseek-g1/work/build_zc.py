# -*- coding: utf-8 -*-
"""Build agent_zc.py: agent_z with a path-reachability keeper model in lane_q."""
s = open('agent_z.py', encoding='utf-8').read()

old = """        if o.index == 0 and abs(ux) > 1e-6:
            s = (o.x - ox) / ux
            if -0.3 <= s <= D + 0.6:
                y_at = oy + uy * s
                t_arr = frames_for(max(0.1, s)) / float(HZ)
                vx, vy = _VEL.get((o.team, o.index), (0.0, 0.0))
                pred_y = o.y + vy * min(t_arr, 1.0)
                reach = SPD * max(0.0, t_arr - 1.0) * 0.55
                gap = abs(pred_y - y_at)
                worst = min(worst, gap - (CR + 0.28 + min(2.6, reach)))
                continue"""
new = """        if o.index == 0:
            # 门将可以沿整条球路拦截：用垂距 + 1 秒盲区后的横移速度评估
            t_star = max(0.0, proj) / KICKP
            reach = SPD * max(0.0, t_star - 1.0)
            worst = min(worst, perp - (CR + 0.25 + min(3.6, reach)))
            continue"""
assert old in s
s = s.replace(old, new)
open('agent_zc.py', 'w', encoding='utf-8').write(s)
print('built agent_zc.py')
