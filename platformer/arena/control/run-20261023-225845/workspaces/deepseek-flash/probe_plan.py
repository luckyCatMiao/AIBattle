# -*- coding: utf-8 -*-
import json, agent_r1 as A
level = json.load(open('level_8012_r1.json', encoding='utf-8'))
w = A.World(level)
st = (161.68, 3.0, 6.8, 0.0, True)
mons = [(159.67, 3.0, 1), (178.49, 3.0, -1)]
acts, pred, mtraj = A.plan(w, st, mons)
print('acts[:16] =', acts[:16])
for i in range(0, min(20, len(pred))):
    print(i, tuple(round(v, 3) for v in pred[i]), acts[i] if i < len(acts) else None)
# 手工对比：从同一状态，跑 6 帧后起跳 vs 7 帧后起跳，再用同样尾部启发式
for jf in (5, 6, 7, 8):
    print('--- jump at action', jf)
    st2 = st
    acts2 = []
    for k in range(A.PLAN_HORIZON):
        jp = (k == jf)
        acts2.append((1.0, jp))
        st2 = A.step(w.cols, w.w, w.h, *st2[:4], st2[4], 1.0, jp)
    print('  x at horizon =', round(st2[0], 2), 'y', round(st2[1], 2))
