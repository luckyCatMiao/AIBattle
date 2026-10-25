import json,gzip,sys
d=json.load(gzip.open(sys.argv[1],'rt',encoding='utf-8'))
w=d["windows"]
print("type",type(w),"len",len(w))
print("first window keys",w[0].keys(),"frame",w[0]["frame"])
inp=w[0]["inputs"]
print("inputs len",len(inp),"type",type(inp),"elem0 len",len(inp[0]),"elem0[0]",type(inp[0][0]))
print(json.dumps(inp[0][:3],ensure_ascii=False))
print(json.dumps(inp[1][:3],ensure_ascii=False))
# stats per car
for car in (0,1):
    print("="*60); print("CAR",car)
    for wi,win in enumerate(w):
        frames=win["inputs"][car]
        # flatten: each frame is list of one dict
        flat=[f[0] if isinstance(f,list) else f for f in frames]
        th=[x.get("throttle",1) for x in flat]
        st=[x.get("steer",0) for x in flat]
        dr=sum(1 for x in flat if x.get("drift")); bo=sum(1 for x in flat if x.get("boost"))
        thr=sum(1 for x in th if x>0.99); br=sum(1 for x in th if x<-0.01); co=sum(1 for x in th if -0.01<=x<=0.99)
        print("win%2d frame%3d t%6.2f throttle(full/coast/brake)=%2d/%2d/%2d steer[min %.2f max %.2f] drift%2d boost%2d" % (
            wi,win["frame"],win["frame"]/20-1.5,thr,co,br,min(st),max(st),dr,bo))
