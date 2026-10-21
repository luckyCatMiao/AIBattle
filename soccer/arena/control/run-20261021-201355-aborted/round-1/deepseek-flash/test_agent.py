"""Edge-case and format tests for the single-file agent."""
import sys, json, math, copy, subprocess, time
sys.path.insert(0,'/workspace')
import agent as A

EX = json.load(open('/workspace/example.json'))
DIRS = {'N','U','D','L','R','UL','UR','DL','DR'}

def check_window(win, team):
    assert isinstance(win, dict) and 'inputs' in win
    frames = win['inputs']
    assert isinstance(frames, list) and len(frames) == 20, len(frames)
    for f in frames:
        assert isinstance(f, list) and len(f) == 3
        for inp in f:
            assert isinstance(inp, dict)
            assert inp['dir'] in DIRS, inp
            a = inp['aim']
            assert (isinstance(a, str) and a in DIRS) or \
                   (isinstance(a, (int, float)) and not isinstance(a, bool) and math.isfinite(a)), inp
            assert isinstance(inp['kick'], bool)
    return True

def test_renamed_ids():
    obs = copy.deepcopy(EX)
    obs['ball']['owner'] = 't0u0'   # pretend team 0 unit 0 has the ball
    names = {}
    for u in obs['units']:
        new = ('A' if u['team']==0 else 'B') + str(u['index'])
        names[u['id']] = new
        u['id'] = new
    obs['ball']['owner'] = names.get('t0u0')
    a = A.Agent()
    w = a.world_from_obs(obs)
    assert w.ball.owner == 't0u0', w.ball.owner
    win = a.plan_window(obs)
    check_window(win, obs['yourTeam'])
    print('renamed ids: OK (owner remapped)')

def test_owner_both_teams():
    a = A.Agent(); w = a.world_from_obs(EX)
    w.ball.owner = 't1u1'
    obs = copy.deepcopy(EX); obs['ball']['owner'] = 't1u1'
    win = a.plan_window(obs)
    check_window(win, 0)
    print('opponent-owned state: OK')

def test_missing_units():
    obs = copy.deepcopy(EX); obs.pop('units')
    a = A.Agent(); win = a.plan_window(obs)
    check_window(win, obs['yourTeam'])
    print('missing units: OK (neutral-ish plan)')

def test_finished_and_freeze():
    for status, freeze in [('finished', 0.0), ('playing', 0.6), ('playing', 0.0)]:
        obs = copy.deepcopy(EX)
        obs['status'] = status; obs['freeze'] = freeze
        a = A.Agent(); win = a.plan_window(obs)
        check_window(win, obs['yourTeam'])
    print('finished/freeze states: OK')

def test_stdin_loop():
    good = json.dumps(EX)
    bad = '{"yourTeam": 0, "units": ['
    p = subprocess.Popen(['python3','/workspace/agent.py'], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    inp = good + '\n\n' + bad + '\n' + good + '\n'
    out, err = p.communicate(inp, timeout=30)
    lines = [l for l in out.splitlines() if l.strip()]
    assert len(lines) == 3, len(lines)
    for l in lines:
        w = json.loads(l); check_window(w, 0)
    assert 'agent error' in err
    print('stdin loop: OK (3 valid windows, error to stderr)')

def test_timing():
    states = []
    for team in (0,1):
        obs = copy.deepcopy(EX); obs['yourTeam'] = team
        states.append(obs)
    a = A.Agent()
    worst = 0.0
    for _ in range(5):
        for obs in states:
            t0=time.time(); a.plan_window(obs); worst=max(worst,time.time()-t0)
    print('timing: worst %.1f ms' % (worst*1000))
    assert worst < 2.0

if __name__ == '__main__':
    test_renamed_ids()
    test_owner_both_teams()
    test_missing_units()
    test_finished_and_freeze()
    test_stdin_loop()
    test_timing()
    print('ALL EDGE TESTS PASSED')
