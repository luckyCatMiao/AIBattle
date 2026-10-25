import json, gzip, sys, math

def load(p):
    with gzip.open(p,'rt',encoding='utf-8') as f: return json.load(f)

def prep(tr):
    pts=tr["points"]; n=len(pts)
    seg=[]; cum=[0.0]
    for i in range(n):
        a=pts[i]; b=pts[(i+1)%n]
        dx=b["x"]-a["x"]; dy=b["y"]-a["y"]; L=math.hypot(dx,dy)
        seg.append((a["x"],a["y"],dx,dy,L))
        cum.append(cum[-1]+L)
    total=cum[-1]
    # use official length if close
    return seg,cum,total

def project(seg,cum,total,x,y):
    best=None
    for i,(ax,ay,dx,dy,L) in enumerate(seg):
        if L==0: continue
        t=((x-ax)*dx+(y-ay)*dy)/(L*L)
        t=max(0.0,min(1.0,t))
        px=ax+t*dx; py=ay+t*dy
        d2=(x-px)**2+(y-py)**2
        if best is None or d2<best[0]:
            # lateral sign: cross(tangent, point-a)
            cross=(dx*(y-ay)-dy*(x-ax))/L
            best=(d2,i,t,cum[i]+t*L,cross)
    return best[3], best[4], math.sqrt(best[0])

def unwrap(series,L):
    out=[]; off=0.0; prev=None
    for s in series:
        if prev is not None:
            ds=s-prev
            if ds < -L/2: off+=L
            elif ds > L/2: off-=L
        out.append(s+off); prev=s
    return out

def analyze(p):
    d=load(p); tr=d["track"]; fr=d["frames"]
    seg,cum,total=prep(tr)
    print("="*100)
    print(d["id"],"seed",d["seed"],"official len",tr["length"],"computed",round(total,3),"halfWidth",round(tr["halfWidth"],3))
    # checkpoint arc positions
    cps=tr["checkpoints"]
    cps_s=[project(seg,cum,total,c["x"],c["y"])[0] for c in cps]
    print("cp arc s:", [round(s,2) for s in cps_s])
    for idx in (0,1):
        xs=[f["cars"][idx]["x"] for f in fr]; ys=[f["cars"][idx]["y"] for f in fr]
        ss=[project(seg,cum,total,x,y)[0] for x,y in zip(xs,ys)]
        lat=[project(seg,cum,total,x,y)[1] for x,y in zip(xs,ys)]
        us=unwrap(ss,total)
        t=[f["frame"]/20-1.5 for f in fr]
        print("-- car",idx,fr[0]["cars"][idx]["name"],"total dist %.2f (%.2f laps)"%(us[-1],us[-1]/total))
        # lap splits by crossing multiples of total after frame>=30
        for lap in range(1,4):
            target=lap*total
            # find first frame with us>=target
            hit=None
            for i in range(30,len(us)):
                if us[i]>=target: hit=i;break
            if hit is not None:
                print("   lap %d crossing frame %d t %.3f"%(lap,fr[hit]["frame"],t[hit]))
        # offroad & lat stats
        print("   lateral offset: mean %.2f min %.2f max %.2f  |lat| mean %.2f p95 %.2f max %.2f"%(
            sum(lat)/len(lat),min(lat),max(lat),sum(abs(v) for v in lat)/len(lat),
            sorted(abs(v) for v in lat)[int(len(lat)*0.95)],max(abs(v) for v in lat)))
        # sector times per lap
        marks=[0]+cps_s[1:]+[total]
        # Actually checkpoints every sector; use cp s list sorted along track starting at start
        print("   sector split (s per lap):")
        base=0.0
        for lap in range(3):
            row=[]
            for k in range(1,len(cps_s)):
                a=lap*total+cps_s[0]+ (cps_s[k]-cps_s[0])%total
                # simpler use checkpoint order along s: cps_s may be in order already
            # build ordered checkpoint s in traversal order from start
            order=[]
            s0=cps_s[0]
            for k in range(len(cps_s)):
                order.append(s0+((cps_s[k]-s0)%total))
            bounds=[lap*total+0]+[lap*total+(o-s0) if False else None for o in order]
            # compute times at bounds in unwrapped distance
            prev_t=None; prev_s=None
            splits=[]
            for b in [lap*total]+order+[ (lap+1)*total ]:
                tt=interp_time(us,t,b)
                if prev_t is None: prev_t=tt
                else:
                    splits.append(tt-prev_t); prev_t=tt
            print("    lap%d: %s"%(lap+1," ".join("%.3f"%v for v in splits)))
    # pairwise gap by distance
    all_s=[]
    for idx in (0,1):
        ss=[project(seg,cum,total,f["cars"][idx]["x"],f["cars"][idx]["y"])[0] for f in fr]
        all_s.append(unwrap(ss,total))
    print("-- gap (car0 - car1) distance samples")
    for i in range(30,len(fr),20):
        print("   t %6.2f  s0 %8.2f s1 %8.2f gap %7.2f  v0 %5.2f v1 %5.2f"%(fr[i]["frame"]/20-1.5,all_s[0][i],all_s[1][i],all_s[0][i]-all_s[1][i],fr[i]["cars"][0]["speed"],fr[i]["cars"][1]["speed"]))

def interp_time(us,t,target):
    # us increasing; return time when crossing target
    if target<=us[0]: return t[0]
    for i in range(1,len(us)):
        if us[i]>=target:
            if us[i]==us[i-1]: return t[i]
            f=(target-us[i-1])/(us[i]-us[i-1])
            return t[i-1]+f*(t[i]-t[i-1])
    return t[-1]

if __name__=="__main__":
    for p in sys.argv[1:]: analyze(p)
