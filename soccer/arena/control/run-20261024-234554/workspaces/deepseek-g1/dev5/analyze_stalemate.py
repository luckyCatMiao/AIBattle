import gzip, json, glob, sys, collections
D = sys.argv[1]
for fn in sorted(glob.glob(D + '/r1-g*.json.gz')):
    d = json.load(gzip.open(fn, 'rt', encoding='utf-8'))
    me = d['seats'].index('deepseek-g1')
    n = d['teamSize']
    sc = d['scores']
    fr = d['frames']
    # possession / ball location
    own = opp = loose = 0
    xs_own = []
    keeper_own = field_own = 0
    in_own_box = 0
    in_opp_half = 0
    in_opp_box = 0
    last_owner_count = collections.Counter()
    for f in fr:
        b = f['ball']; owner = b.get('owner')
        if owner:
            ou = next((u for u in f['units'] if u['id'] == owner), None)
            if ou is not None and ou['team'] == me:
                own += 1
                xs_own.append(b['x'])
                if ou['index'] == 0: keeper_own += 1
                else: field_own += 1
                # attack direction depends on seat: team 0 attacks +x, team 1 attacks -x
                in_opp_half += (b['x'] > 22) if me == 0 else (b['x'] < 22)
                in_own_box += (b['x'] <= 6) if me == 0 else (b['x'] >= 38)
                in_opp_box += (b['x'] >= 34) if me == 0 else (b['x'] <= 10)
                last_owner_count[ou['index']] += 1
            elif ou is not None:
                opp += 1
            else:
                loose += 1
        else:
            loose += 1
    # kick events by team
    ec = collections.Counter()
    mx = []
    for e in d['final'].get('events') or []:
        ec[e['type']] += 1
        if e['type'] == 'kick' and e.get('team') == me:
            mx.append((e['x'], e['y']))
    mx_opp_half = sum(1 for x, y in mx if (x > 22 if me == 0 else x < 22))
    print(f"{fn.split(chr(92))[-1]} n={n} seat={me} score={sc} frames={len(fr)}")
    print(f"  possession own={own} opp={opp} loose={loose}  keeper_own={keeper_own} field_own={field_own} last_owner={dict(last_owner_count)}")
    if own:
        xs = sorted(xs_own)
        print(f"  ballX own: min={xs[0]:.1f} p25={xs[len(xs)//4]:.1f} med={xs[len(xs)//2]:.1f} p75={xs[3*len(xs)//4]:.1f} max={xs[-1]:.1f}  oppHalf={in_opp_half}({100*in_opp_half/own:.0f}%) oppBox={in_opp_box} ownBox={in_own_box}")
    print(f"  our kicks={len(mx)} inOppHalf={mx_opp_half}  events={dict(ec)}")
    print("  kick xy:", [(round(x,1), round(y,1)) for x,y in mx])
