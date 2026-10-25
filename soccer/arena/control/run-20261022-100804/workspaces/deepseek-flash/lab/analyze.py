import json, sys, math

def load(path):
    rows=[]
    for line in open(path):
        rows.append(json.loads(line))
    return rows

def main(path, n=3):
    rows=load(path)
    print("windows", len(rows))
    # shots: our team 0 kick frames
    kicks=[]
    for r in rows:
        f=r['frame']
        for fi,fr in enumerate(r['w0']):
            for ui,inp in enumerate(fr):
                if inp.get('kick'):
                    kicks.append((f+fi, ui, inp.get('aim'), r['ball']['x'], r['ball']['y'], r['ball']['owner'], [round(u['x'],1) for u in r['units'] if u['id'].startswith('t0')], [round(u['y'],1) for u in r['units'] if u['id'].startswith('t0')]))
    print("our kicks", len(kicks))
    for k in kicks:
        print("  f=%d u%d aim=%s at ball(%.1f,%.1f) owner=%s ourx=%s oury=%s"%k)
    # ball trajectory summary: sample owner changes
    print("possession intervals:")
    prev=None
    for r in rows:
        own=r['ball']['owner']
        if own!=prev:
            print("  f=%d owner=%s ball=(%.1f,%.1f) v=(%.1f,%.1f)"%(r['frame'],own,r['ball']['x'],r['ball']['y'],r['ball']['vx'],r['ball']['vy']))
            prev=own
    # max ball x reached
    mx=max(r['ball']['x'] for r in rows); mn=min(r['ball']['x'] for r in rows)
    print("ball x range %.1f..%.1f"%(mn,mx))
    # how deep did our players get (team0 max x)
    px=[u['x'] for r in rows for u in r['units'] if u['id'].startswith('t0')]
    print("our player max x %.2f"%max(px))
    fx=[u['x'] for r in rows for u in r['units'] if u['id'].startswith('t1')]
    print("their player min x %.2f"%min(fx))

if __name__=='__main__':
    main(sys.argv[1])
