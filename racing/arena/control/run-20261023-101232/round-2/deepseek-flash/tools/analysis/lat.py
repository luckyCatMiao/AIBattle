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
        if best is None or d2<best[0]: best=(d2,(dx*(y-ay)-dy*(x-ax))/L)
    return best[1]
for p in sys.argv[1:]:
    d=load(p); tr=d["track"]; fr=d["frames"]; seg,cum=prep(tr)
    print("="*70); print(d["id"],"halfWidth %.3f"%tr["halfWidth"])
    for i in (0,1):
        lat=[project(seg,cum,f["cars"][i]["x"],f["cars"][i]["y"]) for f in fr if f["phase"]!="countdown"]
        a=sorted(abs(v) for v in lat)
        print(" car%d %s: mean %+.2f |lat|mean %.2f p50 %.2f p95 %.2f max %.2f"%(i,fr[-1]["cars"][i]["name"],sum(lat)/len(lat),sum(a)/len(a),a[len(a)//2],a[int(len(a)*0.95)],a[-1]))
        # per lap 2 lateral stats
