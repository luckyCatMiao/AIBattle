import json,gzip,sys,math

def load(p):
    with gzip.open(p,'rt',encoding='utf-8') as f: return json.load(f)

def prep(tr):
    pts=tr["points"]; n=len(pts); seg=[]; cum=[0.0]
    for i in range(n):
        a=pts[i]; b=pts[(i+1)%n]; dx=b["x"]-a["x"]; dy=b["y"]-a["y"]; L=math.hypot(dx,dy)
        seg.append((a["x"],a["y"],dx,dy,L)); cum.append(cum[-1]+L)
    return seg,cum

def project(seg,cum,x,y):
    best=None
    for i,(ax,ay,dx,dy,L) in enumerate(seg):
        if L==0: continue
        t=((x-ax)*dx+(y-ay)*dy)/(L*L); t=max(0,min(1,t))
        px=ax+t*dx; py=ay+t*dy; d2=(x-px)**2+(y-py)**2
        if best is None or d2<best[0]:
            best=(d2,i,cum[i]+t*L,(dx*(y-ay)-dy*(x-ax))/L)
    return best[2],best[3],math.sqrt(best[0])

def analyze(p):
    d=load(p); tr=d["track"]; fr=d["frames"]
    seg,cum=prep(tr); L=tr["length"]
    print("="*100)
    print(d["id"],"seed",d["seed"],"len %.3f halfWidth %.3f"%(L,tr["halfWidth"]))
    # cp crossings by nextCp transition
    tables=[]
    for idx in (0,1):
        ev=[]
        # start at first live frame
        prev=None
        for f in fr:
            c=f["cars"][idx]
            key=(c["lap"],c["nextCp"])
            if prev is not None and key!=prev:
                ev.append((f["frame"], f["frame"]/20-1.5, c["lap"], c["nextCp"], c["speed"], project(seg,cum,c["x"],c["y"])[1]))
            prev=key
        tables.append(ev)
        print("-- car",idx,fr[0]["cars"][idx]["name"])
        print("   crossings (frame, race_t, lap, nextCp, speed, lat):")
        for e in ev: print("     ", e)
    # align: for each lap 1..3, times at cp1..cp0
    print("-- aligned checkpoint cumulative race times (s) and delta (car0-car1)")
    for lap in (1,2,3):
        print("  lap",lap)
        t0={}; t1={}
        for e in tables[0]:
            if e[2]==lap: t0[e[3]]=e[1]
        for e in tables[1]:
            if e[2]==lap: t1[e[3]]=e[1]
        for cp in list(range(1,12))+[0]:
            a=t0.get(cp); b=t1.get(cp)
            if a is None or b is None: continue
            # cp0 of lap N appears with lap N? check
            print("    cp%2d  DS %7.3f  SOL %7.3f  delta %+7.3f"%(cp,a,b,a-b))
    # sector speeds
    print("-- sector avg speeds (arc 8.111 per cp)")
    for lap in (1,2,3):
        print("  lap",lap)
        for idx in (0,1):
            ev=tables[idx]
            arr=[e for e in ev if e[2]==lap]
            if len(arr)<12: continue
            # order cp 1..11 then 0
            arr=sorted(arr,key=lambda e:e[0])
            sp=[]; tt=[]
            for i in range(1,len(arr)):
                dt=arr[i][1]-arr[i-1][1]
                sp.append(8.111/dt if dt>0 else 0); tt.append(dt)
            print("    car%d dt=%s"%(idx," ".join("%.2f"%v for v in tt)))
            print("         v =%s"%(idx," ".join("%5.1f"%v for v in sp)))
    # gap at each cp
    print("-- gap at checkpoints (lap,cp): time delta car0-car1 (positive = DS ahead earlier)")
    for lap in (1,2,3):
        t0={e[3]:e[1] for e in tables[0] if e[2]==lap}
        t1={e[3]:e[1] for e in tables[1] if e[2]==lap}
        row=[]
        for cp in list(range(1,12))+[0]:
            if cp in t0 and cp in t1: row.append("cp%d %+.2f"%(cp,t0[cp]-t1[cp]))
        print("  lap%d: %s"%(lap," | ".join(row)))

if __name__=="__main__":
    for p in sys.argv[1:]: analyze(p)
