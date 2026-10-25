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
    d=load(p); tr=d["track"]; fr=d["frames"]; seg,cum=prep(tr); L=tr["length"]
    print("="*100); print(d["id"],"seed",d["seed"],"len %.3f halfWidth %.3f"%(L,tr["halfWidth"]))
    for idx in (0,1):
        print("-- car",idx,fr[0]["cars"][idx]["name"])
        prev=None; rows=[]
        for f in fr:
            c=f["cars"][idx]; key=(c["lap"],c["nextCp"])
            if prev is not None and key!=prev:
                lap=c["lap"]+1  # running lap number
                if c["nextCp"]==0: lap=c["lap"]  # cp0 crossing ends lap
                rows.append((lap,c["nextCp"],f["frame"]/20-1.5,f["frame"],c["speed"],project(seg,cum,c["x"],c["y"])[1]))
            prev=key
        # dedupe / print
        for r in rows: print("   lap%d cp%2d  t=%7.3f frame %3d v=%5.2f lat=%+.2f"%r)
        # sector times per lap
        print("   sectors (from GO; cp1..cp11 then cp0/lap line):")
        for lap in (1,2,3):
            arr=[r for r in rows if r[0]==lap]
            arr=sorted(arr,key=lambda z:z[3])
            if len(arr)<2: continue
            print("    lap%d:"%lap, " ".join("cp%d@%.2f"%(r[1],r[2]) for r in arr))
            dts=[arr[i][2]-arr[i-1][2] for i in range(1,len(arr))]
            print("          dt:", " ".join("%.2f"%v for v in dts), " sum %.2f"%sum(dts))
            vs=[(8.111/dt if dt>0 else 0) for dt in dts]
            print("          v :", " ".join("%5.1f"%v for v in vs))
    # gap table
    print("-- gap at each running lap checkpoint (DS_time - SOL_time; + = DS later/slower)")
    t0={}; t1={}
    for idx,tbl in ((0,t0),(1,t1)):
        prev=None
        for f in fr:
            c=f["cars"][idx]; key=(c["lap"],c["nextCp"])
            if prev is not None and key!=prev:
                lap=c["lap"]+1
                if c["nextCp"]==0: lap=c["lap"]
                tbl[(lap,c["nextCp"])]=f["frame"]/20-1.5
            prev=key
    for lap in (1,2,3):
        parts=[]
        for cp in list(range(1,12))+[0]:
            if (lap,cp) in t0 and (lap,cp) in t1:
                parts.append("cp%d %+.2f"%(cp,t0[(lap,cp)]-t1[(lap,cp)]))
        if parts: print("   lap%d: %s"%(lap," | ".join(parts)))
    # progress / speed summary per lap
    print("-- per-lap speed stats")
    for idx in (0,1):
        print("   car%d"%idx)
        for lap in (1,2,3):
            # frames during running lap lap-1 (c.lap==lap-1) until finish
            sp=[]
            for f in fr:
                c=f["cars"][idx]
                if c["lap"]==lap-1 and f["phase"]!="countdown" and not c["finished"]:
                    sp.append(c["speed"])
            if sp:
                print("    lap%d: frames %d mean %.2f max %.2f min %.2f"%(lap,len(sp),sum(sp)/len(sp),max(sp),min(sp)))
    # offroad/boost/drift by lap
    for idx in (0,1):
        print("   car%d events by lap:"%idx)
        for f in fr:
            c=f["cars"][idx]
            if c["offRoad"]:
                pass
        # count per lap
        cnt={}
        for f in fr:
            c=f["cars"][idx]; lap=c["lap"]+1
            if c["lap"]>=3: lap=3
            d=cnt.setdefault(lap,[0,0,0,0]) # offroad, drifting, boosting, collisions
            d[0]+=1 if c["offRoad"] else 0
            d[1]+=1 if c["drifting"] else 0
            d[2]+=1 if c["boosting"] else 0
        for lap in sorted(cnt): print("    lap%d: offroad %d drifting %d boosting %d (frames)"%(lap,cnt[lap][0],cnt[lap][1],cnt[lap][2]))

if __name__=="__main__":
    for p in sys.argv[1:]: analyze(p)
