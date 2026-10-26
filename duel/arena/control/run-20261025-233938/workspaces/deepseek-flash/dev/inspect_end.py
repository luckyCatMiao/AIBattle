import gzip,json,sys,math
sys.path.insert(0,'dev')
from replay import Match,HIT_R
d=json.load(gzip.open(sys.argv[1],'rt',encoding='utf-8'))
wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
m=Match(d['seed'],wins).run()
our=d['seats'].index('deepseek-flash')
lo,hi=int(sys.argv[2]),int(sys.argv[3])
for fr in range(lo,hi+1):
    st=m.frames[fr]
    p0=(st['px'][0],st['py'][0]); p1=(st['px'][1],st['py'][1])
    sep=math.hypot(p0[0]-p1[0],p0[1]-p1[1])
    print(fr, f"{fr*0.05:6.2f}s", f"p0=({p0[0]:6.2f},{p0[1]:6.2f})", f"p1=({p1[0]:6.2f},{p1[1]:6.2f})",
          f"sep={sep:5.2f}", f"cd0={st['cd'][0]:2d} cd1={st['cd'][1]:2d}")
    if fr%3==0:
        # input window at this frame
        for w in d['windows']:
            if w['frame']==fr:
                print('    win',fr,'P0',json.dumps(w['inputs'][0]),'P1',json.dumps(w['inputs'][1]))
                break
