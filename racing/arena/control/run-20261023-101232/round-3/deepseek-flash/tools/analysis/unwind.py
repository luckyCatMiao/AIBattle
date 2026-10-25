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
        if best is None or d2<best[0]: best=(d2,cum[i]+t*L)
    return best[1]
def unwrap(vals,L):
    out=[]; off=0; prev=None
    for v in vals:
        if prev is not None:
            dv=v-prev
            if dv < -L/2: off+=L
            elif dv > L/2: off-=L
        out.append(v+off); prev=v
    return out
for p in sys.argv[1:]:
    d=load(p); tr=d["track"]; fr=d["frames"]; L=tr["length"]; seg,cum=prep(tr)
    print("="*80); print(d["id"],"seed",d["seed"],"L",L)
    S=[]; D=[]
    for idx in (0,1):
        vals=[project(seg,cum,f["cars"][idx]["x"],f["cars"][idx]["y"]) for f in fr]
        u=unwrap(vals,L)
        base=u[30]
        dd=[x-base for x in u]
        S.append(u); D.append(dd)
        print(" car%d %s: start_s %.2f end_d %.2f laps %.3f"%(idx,fr[0]["cars"][idx]["name"],vals[30],dd[-1],dd[-1]/L))
    # find finish frame
    fin=None
    for f in fr:
        if f["status"]=="finished": fin=f; break
    if fin:
        i=fin["frame"]; print(" finish frame",i,"race_t %.2f"%(i/20-1.5))
        for idx in (0,1):
            print("   car%d d=%.2f (%.3f laps) speed %.2f"%(idx,D[idx][i],D[idx][i]/L,fin["cars"][idx]["speed"]))
        for loser in (0,1):
            if not fin["cars"][loser]["finished"]:
                rem=3*L-D[loser][i]
                # avg speed last 2s
                sp=[fr[j]["cars"][loser]["speed"] for j in range(max(30,i-40),i+1)]
                av=sum(sp)/len(sp)
                print("   car%d remaining %.2f units, avg speed last 2s %.2f -> +%.2fs, est finish abs %.2f, gap %.2fs"%(
                    loser,rem,av,rem/av,(i/20)+rem/av,(i/20)+rem/av-i/20))
    # print distance at each 2s
    print(" t  d0 d1 gap")
    for i in range(30,len(fr),40):
        print(" %5.2f %7.2f %7.2f %7.2f"%(i/20-1.5,D[0][i],D[1][i],D[0][i]-D[1][i]))
