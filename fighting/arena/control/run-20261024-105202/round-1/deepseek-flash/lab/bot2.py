#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""额外假想对手: block(纯站防) / blockdb(纯蹲防) / walk(一直前走) / super(攒气斩杀)"""
import sys, json
N={"dir":"N","btn":None}
def I(d,b=None): return {"dir":d,"btn":b}
class B:
    def __init__(s,st): s.st=st
    def run(s):
        for line in sys.stdin:
            line=line.strip()
            if not line: continue
            try: obs=json.loads(line)
            except Exception: continue
            try: out=s.decide(obs)
            except Exception as e:
                sys.stderr.write("err %r\n"%(e,)); out={"inputs":[dict(N) for _ in range(15)]}
            sys.stdout.write(json.dumps(out)+"\n"); sys.stdout.flush()
    def decide(s,obs):
        pi=obs["yourPlayer"]; me=obs["fighters"][pi]; op=obs["fighters"][1-pi]
        C=obs["catalog"]["characters"][me["char"]]
        out=[dict(N) for _ in range(15)]
        dx=abs(op["x"]-me["x"])
        st=s.st
        if st=="block":
            for k in range(15): out[k]=I("B")
            return {"inputs":out}
        if st=="blockdb":
            for k in range(15): out[k]=I("DB")
            return {"inputs":out}
        if st=="walk":
            if me["state"] in ("hitstun","down","wakeup","blockstun"):
                for k in range(15): out[k]=I("B")
                return {"inputs":out}
            for k in range(15): out[k]=I("F")
            out[0]=I("F","LP"); out[3]=I("F","LK"); out[7]=I("F","HP")
            return {"inputs":out}
        if st=="super":
            if me["state"] in ("hitstun","down","wakeup","blockstun"):
                for k in range(15): out[k]=I("B")
                return {"inputs":out}
            if me["meter"]>=100 and dx<200:
                sup=C["super"]; seq={"qcf":["D","DF","F"],"qcb":["D","DB","B"],"dp":["F","D","DF"],"hcb":["F","DF","D","DB","B"]}[sup["motion"]]
                for i,d in enumerate(seq): out[i]=I(d, sup["button"] if i==len(seq)-1 else None)
                return {"inputs":out}
            lp=C["normals"]["lp"]; hi=lp["hitbox"]["x"]+lp["hitbox"]["w"]/2+28
            if dx>hi:
                for k in range(15): out[k]=I("F")
                return {"inputs":out}
            if dx<90:
                for k in range(15): out[k]=I("B")
            out[0]=I("F","LP"); out[3]=I("F","LK"); out[8]=I("F","HP")
            return {"inputs":out}
        return {"inputs":out}
if __name__=="__main__": B(sys.argv[1] if len(sys.argv)>1 else "block").run()
