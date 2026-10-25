#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""简单基线对手：最近球员追球，拿球后直接朝球门踢。"""
import sys, json, math

DIRS = {'N':(0,0),'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0),
        'UL':(-0.7071,-0.7071),'UR':(0.7071,-0.7071),'DL':(-0.7071,0.7071),'DR':(0.7071,0.7071)}

def dname(vx, vy):
    l = math.hypot(vx, vy)
    if l < 1e-6: return 'N'
    a = math.degrees(math.atan2(vy, vx)) % 360
    return ['R','DR','D','DL','L','UL','U','UR'][int((a+22.5)//45)%8]

def toward(a,b):
    return dname(b[0]-a[0], b[1]-a[1])

def ang(a,b):
    return math.degrees(math.atan2(b[1]-a[1], b[0]-a[0])) % 360

def decide(obs):
    n = int(obs['teamSize']); mt = int(obs['yourTeam'])
    my = [u for u in obs['units'] if u['team'] == mt]
    op = [u for u in obs['units'] if u['team'] != mt]
    b = obs['ball']; bp = (b['x'], b['y'])
    gx = 43.0 if mt == 0 else 0.0
    own = 0.0 if mt == 0 else 43.0
    owner = b.get('owner')
    my_ids = set(u['id'] for u in my)
    # 最近者追球
    ch = min(my, key=lambda u: math.hypot(u['x']-bp[0], u['y']-bp[1]))
    frames = []
    for k in range(20):
        fr = [None]*n
        for u in my:
            if u['id'] == owner and u['id'] in my_ids:
                # 朝球门踢
                aim = ang((u['x'],u['y']), (gx, 13.0))
                fr[u['index']] = {'dir':'N','aim':aim,'kick':True}
            elif u is ch:
                fr[u['index']] = {'dir': toward((u['x'],u['y']), bp),'aim':None,'kick':False}
            else:
                # 回防到球门附近
                t = (own + (bp[0]-own)*0.35, 13.0 + (bp[1]-13.0)*0.35)
                fr[u['index']] = {'dir': toward((u['x'],u['y']), t),'aim':None,'kick':False}
        frames.append(fr)
    return {'inputs': frames}

def main():
    for line in sys.stdin:
        line=line.strip()
        if not line: continue
        try:
            o=json.loads(line); out=decide(o)
        except Exception as e:
            print('ERR',repr(e),file=sys.stderr,flush=True)
            n=3
            try: n=int(json.loads(line)['teamSize'])
            except Exception: pass
            out={'inputs':[[{'dir':'N','aim':None,'kick':False} for _ in range(n)] for _ in range(20)]}
        print(json.dumps(out,separators=(',',':')),flush=True)

main()
