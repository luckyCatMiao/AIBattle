import gzip,json,glob,os,re,math,sys,collections
W,H=44,26
def U(f,d):
    fmt=d.get('unitsFormat')
    if fmt: return [dict(zip(fmt,r)) for r in f['units']]
    return f['units']
def events_of(d):
    if 'events' in d and d['events']: return d['events']
    return d['final'].get('events',[])
def goal_cross(bx,by,ang,team):
    gx=43.0 if team==0 else 1.0
    ux,uy=math.cos(ang),math.sin(ang)
    if abs(ux)<1e-6: return None
    t=(gx-bx)/ux
    if t<0: return None
    yy=by+uy*t
    return yy if 0<=yy<=26 else None
rows=[]
files=[]
for pat in sys.argv[1:]:
    files += sorted(glob.glob(pat))
for p in files:
    d=json.load(gzip.open(p,'rt',encoding='utf-8'))
    ev=events_of(d); fr=d['frames']; n=d['teamSize']; seats=d['seats']
    us_team = seats.index('deepseek-g1') if 'deepseek-g1' in seats else 0
    for e in ev:
        if e['type']!='kick': continue
        team=e['team']; f=e['frame']
        if f>=len(fr): continue
        ycross=goal_cross(e['x'],e['y'],e['angle'],team)
        if ycross is None or not (10.2<=ycross<=15.8): continue
        gx=43.0 if team==0 else 1.0
        dist=abs(gx-e['x'])
        st=U(fr[f],d)
        kp=[u for u in st if u['team']!=team and u['index']==0]
        if not kp: continue
        kp=kp[0]
        kd=math.hypot(kp['x']-gx, kp['y']-ycross)
        later=[x for x in ev if f<x['frame']<=f+170]
        first=None
        for x in later:
            if x['type'] in ('goal','save'): first=x; break
        if first is not None and first['type']=='goal' and first['team']==team and first['frame']-f>4:
            out='goal'
        elif first is not None and first['type']=='save' and first['team']!=team:
            out='save'
        else:
            out='other'
        rows.append(dict(file=os.path.basename(p), n=n, us=(team==us_team), team=team,
                         f=f, bx=e['x'], by=e['y'], ang=e['angle'], ycross=ycross, dist=dist,
                         kx=kp['x'], ky=kp['y'], kd=kd, out=out))
print("total on-target kicks:", len(rows))
print(collections.Counter((r['us'],r['out']) for r in rows))
print("\n--- OUR shots ---")
for r in rows:
    if r['us']:
        print(f"{r['file'][:14]:14s} n{r['n']} f{r['f']:4d} from({r['bx']:5.1f},{r['by']:5.1f}) d={r['dist']:4.1f} yc={r['ycross']:5.1f} kp({r['kx']:5.1f},{r['ky']:5.1f}) kd={r['kd']:4.1f} -> {r['out']}")
print("\n--- THEIR shots ---")
for r in rows:
    if not r['us']:
        print(f"{r['file'][:14]:14s} n{r['n']} f{r['f']:4d} from({r['bx']:5.1f},{r['by']:5.1f}) d={r['dist']:4.1f} yc={r['ycross']:5.1f} kp({r['kx']:5.1f},{r['ky']:5.1f}) kd={r['kd']:4.1f} -> {r['out']}")
