#!/usr/bin/env python3
"""Cross-check engine.py against the official simulation.js on random input windows."""
import json, random, subprocess, sys, tempfile, os
sys.path.insert(0, '/workspace')
import engine

def rnd_windows(n, seed=0):
    r = random.Random(seed)
    dirs = ['N','N','N','U','D','L','R']
    out = []
    for _ in range(n):
        w = []
        for owner in range(2):
            frames = []
            for i in range(20):
                d = r.choices(dirs, weights=[6,1,1,1,1,1,1])[0]
                b = 'BOMB' if r.random() < 0.06 else None
                frames.append({'dir': d, 'btn': b})
            w.append(frames)
        out.append(w)
    return out

def run_py(windows, seed):
    g = engine.Game(['A','B'], seed=seed)
    snaps = [py_snap(g)]
    for w in windows:
        if g.status != 'playing': break
        g.advance_window([[dict(x) for x in ww] for ww in w])
        snaps.append(py_snap(g))
    return snaps

def py_snap(g):
    return {
        'round': g.round, 'roundFrames': g.roundFrames, 'status': g.status,
        'winner': g.winner, 'reason': g.reason,
        'tiles': list(g.tiles),
        'spawns': [[x,y] for x,y in g.spawns],
        'fighters': [{'owner':f.owner,'x':f.x,'y':f.y,'fromX':f.fromX,'fromY':f.fromY,
                      'progress':f.progress,'alive':f.alive,'bombs':f.bombs,'blast':f.blast,
                      'speed':f.speed,'activeBombs':f.activeBombs,'invulnUntil':f.invulnUntil}
                     for f in g.fighters],
        'bombs': [{'id':b['id'],'owner':b['owner'],'x':b['x'],'y':b['y'],'fuse':b['fuse'],'blast':b['blast']} for b in g.bombs],
        'blasts': [{'x':c['x'],'y':c['y'],'frames':c['frames'],'owner':c['owner']} for c in g.blasts],
        'drops': [{'id':d['id'],'x':d['x'],'y':d['y'],'type':d['type']} for d in g.drops],
        'wins': [p['wins'] for p in g.players],
        'roundLog': g.roundLog,
    }

def cmp_snaps(a, b, ctx):
    diffs = []
    def note(path, va, vb):
        if len(diffs) < 12:
            diffs.append('%s: py=%r js=%r' % (path, va, vb))
    # ``reason`` is a presentation-only string (the Python port leaves it
    # empty; the JS engine writes 先胜三局/时间到/...).  Winner, status and the
    # full roundLog are compared instead.
    for k in ('round','roundFrames','status','winner'):
        if a[k] != b[k]: note(k, a[k], b[k])
    if a['tiles'] != b['tiles']:
        idx = [i for i in range(len(a['tiles'])) if a['tiles'][i]!=b['tiles'][i]]
        note('tiles@%d' % idx[:6], [a['tiles'][i] for i in idx[:6]], [b['tiles'][i] for i in idx[:6]])
    for k in ('bombs','blasts','drops'):
        # Different id namespaces (number vs 'b3'/'d22'); ids do not affect
        # physics or decisions.
        an = [{kk: vv for kk, vv in x.items() if kk != 'id'} for x in a[k]]
        bn = [{kk: vv for kk, vv in x.items() if kk != 'id'} for x in b[k]]
        if an != bn:
            note(k, an[:8], bn[:8])
    if a['wins'] != b['wins']: note('wins', a['wins'], b['wins'])
    arl = [(r['round'], r['frames'], r['winner']) for r in a['roundLog']]
    brl = []
    for r in b['roundLog']:
        w = r['winner']
        if isinstance(w, str):
            w = 0 if w == 'A' else (1 if w == 'B' else None)
        brl.append((r['round'], r['frames'], w))
    if arl != brl: note('roundLog', arl, brl)
    for i,(fa,fb) in enumerate(zip(a['fighters'], b['fighters'])):
        for k in fa:
            if fa[k] != fb[k]:
                note('f%d.%s' % (i,k), fa[k], fb[k])
    if diffs:
        print('DIFF at', ctx)
        for d in diffs: print('   ', d)
        return False
    return True

def main():
    games = int(sys.argv[1]) if len(sys.argv)>1 else 20
    wins_per = int(sys.argv[2]) if len(sys.argv)>2 else 40
    bad = 0
    for gi in range(games):
        seed = 1 + gi
        wins = rnd_windows(wins_per, seed=seed*13+7)
        spec = {'seed': seed, 'windows': wins}
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump(spec, f); path = f.name
        try:
            p = subprocess.run(['node','/workspace/tools/js_runner.js',path],capture_output=True,text=True,timeout=120)
            if p.returncode != 0:
                print('node fail', p.stderr[:2000]); return 1
            js = json.loads(p.stdout)
        finally:
            os.unlink(path)
        py = run_py(wins, seed)
        n = min(len(js), len(py))
        okall = True
        for i in range(n):
            if not cmp_snaps(py[i], js[i], 'seed=%d window=%d' % (seed,i)):
                okall = False; bad += 1; break
        if len(js) != len(py):
            print('window count differs', len(js), len(py)); okall=False; bad+=1
        print('game seed=%d windows=%d ok=%s' % (seed, n-1, okall))
    print('BAD', bad, '/', games)
    return 0 if bad==0 else 2

if __name__ == '__main__':
    sys.exit(main())
