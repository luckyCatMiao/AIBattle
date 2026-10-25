import pathlib
src = pathlib.Path('/workspace/agent.py').read_text()
out = pathlib.Path('/workspace/exp')
def rep(s, old, new):
    assert old in s, old
    return s.replace(old, new, 1)
v19 = rep(src, "shot_clear = -0.05", "shot_clear = -0.50")
v19 = rep(v19, "    others = [u for u in units if u['id'] != shooter_id]\n",
                "    others = [u for u in units if u['id'] != shooter_id and u['team'] != team]\n")
(out/'agent_v19_foes50.py').write_text(v19)
print('ok')
