# -*- coding: utf-8 -*-
"""离线探针：把回放里的某一帧还原成状态，调用 core2.frame_commands 看角色/指令。"""
import sys, os, json, gzip
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import agent as core2
import pysim

def load(path):
    if path.endswith('.gz'):
        return json.load(gzip.open(path, 'rt', encoding='utf-8'))
    return json.load(open(path, encoding='utf-8'))

def show(d, frames, me=None):
    if me is None:
        me = d['seats'].index('deepseek-g1')
    for fno in frames:
        obs = d['frames'][fno]
        st = pysim.state_from_obs(obs)
        print('=== f%d  score=%s  ball=(%.1f,%.1f) v=(%.1f,%.1f) owner=%s' % (
            fno, obs.get('score'), st.bx, st.by, st.bvx, st.bvy, obs['ball'].get('owner')))
        roles, my, opp, owner = core2.plan_roles(st, me)
        cmds, my, opp, owner = core2.frame_commands(st, me)
        for u in my:
            c = cmds.get(u.index)
            role = roles.get(u.index, ('?',))
            print('   my%d (%.1f,%.1f) role=%s dir=%s aim=%s kick=%s' % (
                u.index, u.x, u.y, role[0], c.dir if c else None,
                None if c is None or c.aim is None else round(c.aim, 1), c.kick if c else None))
        for u in opp:
            print('   op%d (%.1f,%.1f)' % (u.index, u.x, u.y))
        # keeper extra
        kt = core2.keeper_target(st, me, st.bx, st.by)
        print('   keeper_target = (%.1f, %.1f)' % kt)
        path = core2.ball_future(st, 60)
        if path:
            print('   ball_future last = (%.1f,%.1f) len=%d' % (path[-1][0], path[-1][1], len(path)))

if __name__ == '__main__':
    d = load(sys.argv[1])
    frames = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else [0]
    me = int(sys.argv[3]) if len(sys.argv) > 3 else None
    show(d, frames, me)
