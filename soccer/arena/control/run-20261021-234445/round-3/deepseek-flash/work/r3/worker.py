"""Generic worker: --impl agent|brain|wing|sniper|chase|idle, --team? (team from obs)."""
import sys, os, json
sys.path.insert(0, '/workspace')
sys.path.insert(0, '/workspace/work')
sys.path.insert(0, '/workspace/tools')
os.chdir('/workspace')
from soccer import world_from_obs

impl = 'agent'
for i, a in enumerate(sys.argv):
    if a == '--impl':
        impl = sys.argv[i + 1]
    if a == '--variant':
        spec = sys.argv[i + 1]
        for kv in spec.split(';'):
            if '=' in kv:
                k, v = kv.split('=', 1)
                os.environ[k] = v
            elif kv and kv != '-':
                os.environ['PLAN_VARIANT'] = kv

def make_brain(team):
    if impl == 'agent':
        from planner import Brain2
        return Brain2(team)
    if impl == 'brain':
        from brain import Brain
        return Brain(team)
    if impl == 'wing':
        from wingbot import WingBot
        return WingBot(team)
    if impl in ('sniper', 'chase', 'idle'):
        import match2
        return {'sniper': match2.Sniper, 'chase': match2.Chase, 'idle': match2.Idle}[impl](team)
    raise SystemExit('bad impl ' + impl)

brain = None
bt = None
last_n = 3
def neutral(n):
    return [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obs = json.loads(line)
        n = int(obs.get('teamSize') or last_n)
        last_n = n
        team = int(obs.get('yourTeam') or 0)
        w = world_from_obs(obs)
        if brain is None or bt != team:
            brain = make_brain(team)
            bt = team
        frames = brain.plan(w)
        clean = []
        for fr in frames:
            row = []
            for inp in fr:
                aim = inp.get('aim')
                if aim is not None:
                    aim = float(aim) % 360.0
                row.append({'dir': inp.get('dir') or 'N', 'aim': aim, 'kick': bool(inp.get('kick'))})
            clean.append(row)
        out = {'inputs': clean}
    except Exception as e:
        sys.stderr.write('worker error %r\n' % (e,))
        out = {'inputs': [neutral(last_n) for _ in range(20)]}
    sys.stdout.write(json.dumps(out, separators=(',', ':')) + '\n')
    sys.stdout.flush()
