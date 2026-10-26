#!/usr/bin/env python3
"""Analyze deepseek-g1's submitted inputs while it owns the ball in round 1."""
import gzip, json, os, math
from collections import Counter, defaultdict

WS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MATCHES = os.path.join(WS, 'matches')
RES = os.path.join(WS, '..', '..', 'results.json')
ME = 'deepseek-g1'
DIRV = {'N':(0,0),'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0),
        'UL':(-1,-1),'UR':(1,-1),'DL':(-1,1),'DR':(1,1)}

def owner_team(b):
    o=b.get('owner')
    return None if not o else int(o[1])

results=[g for g in json.load(open(RES,encoding='utf-8')) if g['round']==1]
results.sort(key=lambda g:g['game'])
allrows=[]
for meta in results:
    with gzip.open(os.path.join(MATCHES,meta['id']+'.json.gz'),'rt',encoding='utf-8') as f: rep=json.load(f)
    me=rep['seats'].index(ME)
    atk=1 if me==0 else -1
    win={w['frame']:w['inputs'] for w in rep['windows']}
    win_frames=sorted(win)
    owner_idx=Counter(); owner_pos=Counter()
    move=Counter(); kick_frames=[]; owner_frames=0
    spell_progress=[]
    cur=None; startx=None; lastx=None; curidx=None; curkick=0; spell_start_frame=None
    # also count carrier input kick=true vs actual event frames
    input_kicks=0; actual_kicks=0
    for fr in rep['frames']:
        b=fr['ball']; t=owner_team(b)
        if t==me:
            owner_frames+=1
            u=None
            for uu in fr['units']:
                if uu[0]==b['owner']: u=uu; break
            if u:
                owner_idx[u[2]]+=1
                owner_pos[(round(b['x']),round(b['y']))]+=1
            # find input: window base = frame - frame%20? windows frame is end frame (20,40,...)
            f=fr['frame']
            wbase=((f+19)//20)*20 if f>=1 else 0
            inp=None
            if wbase in win:
                arr=win[wbase][me]
                k=f-wbase+19
                if 0<=k<len(arr) and u is not None and u[2]<len(arr[k]):
                    inp=arr[k][u[2]]
            if inp:
                dx,dy=DIRV.get(inp.get('dir','N'),(0,0))
                fwd=dx*atk
                if fwd>0: move['forward']+=1
                elif fwd<0: move['backward']+=1
                elif dy!=0: move['lateral']+=1
                else: move['still']+=1
                if inp.get('kick'): 
                    input_kicks+=1
                    kick_frames.append(fr['frame'])
            if cur is None:
                cur=me; startx=b['x']; spell_start_frame=fr['frame']; curkick=0
            lastx=b['x']
        else:
            if cur==me and startx is not None:
                spell_progress.append((lastx-startx)*atk)
            cur=None; startx=None; lastx=None
    if cur==me and startx is not None:
        spell_progress.append((lastx-startx)*atk)
    actual_kicks=sum(1 for e in rep['final']['events'] if e['type']=='kick' and e['team']==me)
    row=dict(id=meta['id'],ts=meta['teamSize'],seat=me,score=[meta['scores'][ME],meta['scores'][[k for k in meta['scores'] if k!=ME][0]]],
             owner_frames=owner_frames,owner_idx=dict(owner_idx),move=dict(move),input_kicks=input_kicks,
             actual_kicks=actual_kicks,spell_n=len(spell_progress),
             prog_med=sorted(spell_progress)[len(spell_progress)//2] if spell_progress else None,
             prog_max=max(spell_progress) if spell_progress else None,
             prog_sum=sum(spell_progress))
    allrows.append(row)

print('id ts seat score ownerFrames ownerIdx move(fwd/back/lat/still) inputK actualK spells prog_med prog_max')
for r in allrows:
    m=r['move']
    print(f"{r['id']} {r['ts']} {r['seat']} {r['score'][0]}-{r['score'][1]} {r['owner_frames']:5d} "
          f"{r['owner_idx']} {m.get('forward',0):4d}/{m.get('backward',0):3d}/{m.get('lateral',0):4d}/{m.get('still',0):4d} "
          f"{r['input_kicks']:3d} {r['actual_kicks']:3d} {r['spell_n']:3d} {r['prog_med']:6.2f} {r['prog_max']:6.2f}")

print('\nAggregate by team size (deepseek owner frames):')
for ts in range(1,7):
    rs=[r for r in allrows if r['ts']==ts]
    if not rs: continue
    m=Counter()
    for r in rs:
        for k,v in r['move'].items(): m[k]+=v
    of=sum(r['owner_frames'] for r in rs); ik=sum(r['input_kicks'] for r in rs); ak=sum(r['actual_kicks'] for r in rs)
    idx=Counter()
    for r in rs:
        for k,v in r['owner_idx'].items(): idx[int(k)]+=v
    print(f'{ts}v{ts}: ownerFrames={of} move={dict(m)} inputKicks={ik} actualKicks={ak} ownerIdx={dict(idx)}')
print('\nAggregate by seat:')
for seat in (0,1):
    rs=[r for r in allrows if r['seat']==seat]
    m=Counter()
    for r in rs:
        for k,v in r['move'].items(): m[k]+=v
    of=sum(r['owner_frames'] for r in rs); ik=sum(r['input_kicks'] for r in rs); ak=sum(r['actual_kicks'] for r in rs)
    print(f'seat{seat}: ownerFrames={of} move={dict(m)} inputKicks={ik} actualKicks={ak}')
