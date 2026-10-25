import pathlib
src = pathlib.Path('/workspace/agent.py').read_text()
out = pathlib.Path('/workspace/exp')

def rep(s, old, new):
    assert old in s, old
    return s.replace(old, new, 1)

v12 = rep(src, "shot_clear = -0.05", "shot_clear = -0.60"); (out/'agent_v12_loose60.py').write_text(v12)
v13 = rep(rep(src, "shot_clear = -0.05", "shot_clear = -0.35"), "shoot_range = 18.0", "shoot_range = 20.0"); (out/'agent_v13_range20.py').write_text(v13)
v14 = rep(src, "shot_clear = -0.05", "shot_clear = -0.35")
v14 = rep(v14, "    others = [u for u in units if u['id'] != shooter_id]\n", "    others = [u for u in units if u['id'] != shooter_id and u['team'] != team]\n")
(out/'agent_v14_foesonly.py').write_text(v14)
v15 = rep(src, "shot_clear = -0.05", "shot_clear = -0.35")
v15 = rep(v15, "if pg is not None and (nearest_foe < 2.6 or dgoal > 21.0):", "if pg is not None and (nearest_foe < 4.0 or dgoal > 21.0):")
(out/'agent_v15_direct.py').write_text(v15)
print('ok')
