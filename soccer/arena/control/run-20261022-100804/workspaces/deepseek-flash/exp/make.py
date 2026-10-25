import re, pathlib
src = pathlib.Path('/workspace/agent.py').read_text()
out = pathlib.Path('/workspace/exp')

# v9: no window-boundary shot gate (B only)
v9 = src.replace("allow_shot=(fi == 0)", "allow_shot=True")
assert v9 != src
(out/'agent_v9_nogate.py').write_text(v9)

# v10: boundary shots normally; all frames when already deep at window start
old = """    frames = []
    goal_hit = False
    for fi in range(20):"""
new = """    # v10: if we already carry the ball deep at window start, allow shots on
    # every simulated frame of this window; otherwise only on frame 0.
    deep_shot = False
    try:
        _b = w.ball
        _own = _b.get('owner')
        _u = next((x for x in w.units if x['id'] == _own), None)
        if _u is not None and _u['team'] == my_team:
            _gx = attack_goal_x(my_team)
            deep_shot = math.hypot(_gx - _b['x'], 13.0 - _b['y']) < 13.0
    except Exception:
        deep_shot = False
    frames = []
    goal_hit = False
    for fi in range(20):"""
v10 = src.replace(old, new, 1)
assert v10 != src
v10 = v10.replace("allow_shot=(fi == 0)", "allow_shot=(fi == 0 or deep_shot)")
(out/'agent_v10_deep.py').write_text(v10)

# v11: keep frame-0 gate, but more willing to shoot through traffic
v11 = src.replace("shot_clear = -0.05", "shot_clear = -0.35")
assert v11 != src
(out/'agent_v11_loose.py').write_text(v11)
print('written')
