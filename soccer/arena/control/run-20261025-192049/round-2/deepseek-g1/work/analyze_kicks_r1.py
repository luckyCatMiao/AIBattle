#!/usr/bin/env python3
"""Kick outcome analysis for deepseek-g1 round 1 (normalized attack direction)."""
import gzip,json,os,math,statistics
WS=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
RES=os.path.join(WS,'..','..','results.json')
ME='deepseek-g1'

def norm_x(x,me): return x if me==0 else 44.0-x

rows=[]
for meta in sorted([g for g in json.load(open(RES,encoding='utf-8')) if g['round']==1],key=lambda g:g['game']):
    with gzip.open(os.path.join(WS,'matches',meta['id']+'.json.gz'),'rt',encoding='utf-8') as f: rep=json.load(f)
    me=rep['seats'].index(ME); frames=rep['frames']; n=len(frames)
    kicks=[e for e in rep['final']['events'] if e['type']=='kick']
    for k in kicks:
        if k['team']!=me: continue
        f=k['frame']
        rec=dict(id=meta['id'],ts=meta['teamSize'],me=me,f=f,x=k['x'],y=k['y'],ang=k['angle'],
                 nx=norm_x(k['x'],me),ny=k['y'])
        for dt in (20,40,80,160):
            g=f+dt
            if g>=n:
                rec[f'b{dt}']=None; continue
            b=frames[g]['ball']; o=b.get('owner')
            rec[f'b{dt}']=(round(norm_x(b['x'],me),1),round(b['y'],1),o)
        rows.append(rec)

def outcome(r,dt):
    v=r[f'b{dt}']
    if v is None: return 'end'
    x,y,o=v
    if o is None: return 'loose'
    return 'ret' if int(o[1])==r['me'] else 'lost'

print('Kick origins (normalized x, attack direction +):')
for ts in range(1,7):
    rs=[r for r in rows if r['ts']==ts]
    if not rs: continue
    xs=sorted(r['nx'] for r in rs)
    print(f'{ts}v{ts}: n={len(rs)} nx med={statistics.median(xs):.1f} min={min(xs):.1f} max={max(xs):.1f} '
          f'ownHalf={sum(1 for x in xs if x<22):d} oppHalf={sum(1 for x in xs if x>=22):d} '
          f'finalThird={sum(1 for x in xs if x>=29.3):d}')

print('\nOutcome rates:')
for ts in range(1,7):
    rs=[r for r in rows if r['ts']==ts]
    if not rs: continue
    parts=[]
    for dt in (20,40,80,160):
        c={k:0 for k in ('ret','lost','loose','end')}
        for r in rs: c[outcome(r,dt)]+=1
        parts.append(f'+{dt}: ret {c["ret"]/len(rs)*100:4.0f}% lost {c["lost"]/len(rs)*100:4.0f}% loose {c["loose"]/len(rs)*100:4.0f}%')
    print(f'{ts}v{ts} n={len(rs)}  ' + '  '.join(parts))

print('\nForward progress of the ball after each kick (normalized max x within 160f - kick nx):')
for ts in range(1,7):
    rs=[r for r in rows if r['ts']==ts]
    if not rs: continue
    prog=[]
    for r in rs:
        vals=[r[f'b{dt}'][0] for dt in (20,40,80,160) if r.get(f'b{dt}')]
        if vals: prog.append(max(vals)-r['nx'])
    if prog:
        print(f'{ts}v{ts}: n={len(prog)} med={statistics.median(prog):+.1f} mean={statistics.mean(prog):+.1f} '
              f'>0: {sum(1 for p in prog if p>0)}/{len(prog)}')

print('\nKicks that reach attacking half / final third at +80f:')
for ts in range(1,7):
    rs=[r for r in rows if r['ts']==ts]
    if not rs: continue
    ah=sum(1 for r in rs if r['b80'] and r['b80'][0]>=22)
    ft=sum(1 for r in rs if r['b80'] and r['b80'][0]>=29.3)
    print(f'{ts}v{ts}: half {ah}/{len(rs)} final {ft}/{len(rs)}')
