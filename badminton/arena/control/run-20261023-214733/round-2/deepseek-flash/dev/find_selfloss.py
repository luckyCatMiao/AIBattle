import os,sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from variant_eval import run, diag
for seed in (7121,7122,7111,7112,7131,7132):
    for seat in (0,1):
        r=run(seat,seed,{})
        if r["self_loss"]:
            print("selfloss in seed",seed,"seat",seat,"score",r["score"])
            # rerun with logging of last hit / point
            import importlib, brain_py
            b=brain_py.Brain(); old=__import__("variant_eval").OldBrain()
            a0,a1=(b,old) if seat==0 else (old,b)
            g=E.Match(seed=seed); w=0
            while g.status=="playing" and w<600:
                o0,o1=g.view(0),g.view(1)
                w0=[E.normalize_frame(f)[0] for f in a0.act(o0)]
                w1=[E.normalize_frame(f)[0] for f in a1.act(o1)]
                for fi in range(10):
                    if g.status!="playing": break
                    g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
                    g.step()
                w+=1
            hits=[e for e in g.events if e["type"]=="hit"]
            for e in g.events:
                if e["type"]=="point" and e["team"]!=seat:
                    last=None; lh=None
                    for h in hits:
                        if h["frame"]<=e["frame"]: last=h["team"]; lh=h
                    if last==seat:
                        print("  SELF-LOSS point:",e, "lastHit:",lh)
                        for ev in g.events:
                            if ev["type"]=="net" and abs(ev["frame"]-e["frame"])<20: print("   net:",ev)
            break
    else:
        continue
    break
